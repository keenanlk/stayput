/**
 * A Standard MIDI File writer and a small reader, with no dependencies (so a
 * spec can import it). The file is format 0: one track holding a tempo, a 4/4
 * time signature and the notes on channel 1 with the acoustic piano sound.
 * Note times are in seconds on the way in and in ticks of 480 per quarter note
 * in the file.
 */

export interface MidiNote {
  /** Seconds from the start. */
  start: number;
  end: number;
  /** MIDI note number, 0 to 127 (60 is middle C). */
  pitch: number;
  /** 1 to 127. */
  velocity: number;
}

export const TICKS_PER_QUARTER = 480;

function vlq(n: number, out: number[]) {
  let v = Math.max(0, Math.round(n));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.push((v & 0x7f) | 0x80);
  for (let i = bytes.length - 1; i >= 0; i--) out.push(bytes[i]!);
}

/** The notes as a .mid file at `bpm` (quarter notes per minute). */
export function writeMidi(notes: MidiNote[], bpm: number, name = 'Stayput'): Uint8Array {
  const tempo = Math.max(1, Math.min(0xffffff, Math.round(60_000_000 / Math.max(1, bpm))));
  const ticksPerSecond = (TICKS_PER_QUARTER * bpm) / 60;
  const events: { tick: number; order: number; bytes: number[] }[] = [];
  for (const n of notes) {
    const on = Math.round(n.start * ticksPerSecond);
    // A note is at least one tick long, so its off never lands before its on.
    const off = Math.max(on + 1, Math.round(n.end * ticksPerSecond));
    const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));
    events.push({ tick: on, order: 1, bytes: [0x90, pitch, vel] }, { tick: off, order: 0, bytes: [0x80, pitch, 0] });
  }
  // Offs before ons at the same tick, so a repeated note is cut before it is struck again.
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  const label = [...new TextEncoder().encode(name)];
  track.push(0, 0xff, 0x03, label.length, ...label);
  track.push(0, 0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);
  track.push(0, 0xff, 0x58, 4, 4, 2, 24, 8);
  track.push(0, 0xc0, 0);
  let last = 0;
  for (const e of events) {
    vlq(e.tick - last, track);
    last = e.tick;
    track.push(...e.bytes);
  }
  track.push(0, 0xff, 0x2f, 0);
  const out = new Uint8Array(14 + 8 + track.length);
  const view = new DataView(out.buffer);
  out.set([0x4d, 0x54, 0x68, 0x64], 0);
  view.setUint32(4, 6);
  view.setUint16(8, 0);
  view.setUint16(10, 1);
  view.setUint16(12, TICKS_PER_QUARTER);
  out.set([0x4d, 0x54, 0x72, 0x6b], 14);
  view.setUint32(18, track.length);
  out.set(track, 22);
  return out;
}

export interface ParsedMidi {
  format: number;
  tracks: number;
  division: number;
  /** Beats per minute from the first tempo event, or null when there is none. */
  bpm: number | null;
  notes: { tick: number; duration: number; pitch: number; velocity: number; channel: number }[];
}

/** Reads a Standard MIDI File; throws on anything that is not one. */
export function parseMidi(bytes: Uint8Array): ParsedMidi {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 14 || tag(0) !== 'MThd') throw new Error('Not a MIDI file');
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const tracks = view.getUint16(10);
  const division = view.getUint16(12);
  let pos = 8 + headerLength;
  let bpm: number | null = null;
  const notes: ParsedMidi['notes'] = [];
  for (let t = 0; t < tracks; t++) {
    if (tag(pos) !== 'MTrk') throw new Error('Missing track');
    const length = view.getUint32(pos + 4);
    let p = pos + 8;
    const end = p + length;
    if (end > bytes.length) throw new Error('Track runs past the end of the file');
    let tick = 0;
    let running = 0;
    const open = new Map<number, { tick: number; velocity: number }>();
    const readVlq = () => {
      let v = 0;
      for (let i = 0; i < 4; i++) {
        const b = bytes[p++]!;
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) return v;
      }
      throw new Error('Bad variable-length number');
    };
    while (p < end) {
      tick += readVlq();
      let status = bytes[p]!;
      if (status < 0x80) status = running;
      else p++;
      if (status === 0xff) {
        const type = bytes[p++]!;
        const len = readVlq();
        if (type === 0x51 && len === 3 && bpm === null) bpm = 60_000_000 / ((bytes[p]! << 16) | (bytes[p + 1]! << 8) | bytes[p + 2]!);
        p += len;
        if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        p += readVlq();
        continue;
      }
      running = status;
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const size = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      const a = bytes[p]!;
      const b = size === 2 ? bytes[p + 1]! : 0;
      p += size;
      const key = channel * 128 + a;
      if (kind === 0x90 && b > 0) open.set(key, { tick, velocity: b });
      else if (kind === 0x80 || kind === 0x90) {
        const on = open.get(key);
        if (on) {
          notes.push({ tick: on.tick, duration: tick - on.tick, pitch: a, velocity: on.velocity, channel });
          open.delete(key);
        }
      }
    }
    pos = end;
  }
  notes.sort((x, y) => x.tick - y.tick || x.pitch - y.pitch);
  return { format, tracks, division, bpm, notes };
}
