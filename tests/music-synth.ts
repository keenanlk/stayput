/** A small seeded synth for the BPM and key tests: click tracks, triads, and a 16-bit WAV writer. */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

/** `seconds` of 10 ms noise bursts on every beat, heavier on every fourth. */
export function clickTrack(bpm: number, seconds: number, sr = 44100): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr));
  const rand = rng(7);
  const step = (60 / bpm) * sr;
  const burst = Math.floor(0.01 * sr);
  for (let n = 0; n * step < out.length; n++) {
    const start = Math.round(n * step);
    const gain = n % 4 === 0 ? 0.9 : 0.5;
    for (let i = 0; i < burst && start + i < out.length; i++) out[start + i] = (out[start + i]! + rand() * 2 * gain * (1 - i / burst));
  }
  return out;
}

/** Triads on scale degrees I, IV, V, I, vi, IV, V, I (one second each, repeating): six harmonics at 1/h, `cents` sharp. */
export function chords(tonic: number, mode: 'major' | 'minor', seconds: number, sr = 22050, cents = 0): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr));
  const scale = mode === 'major' ? MAJOR : MINOR;
  const degrees = [0, 3, 4, 0, 5, 3, 4, 0];
  const detune = 2 ** (cents / 1200);
  const note = (degree: number) => 60 + tonic + scale[degree % 7]! + 12 * Math.floor(degree / 7);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const d = degrees[Math.floor(t) % degrees.length]!;
    let v = 0;
    for (const m of [note(d), note(d + 2), note(d + 4)]) {
      const f = 440 * 2 ** ((m - 69) / 12) * detune;
      for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
    }
    out[i] = v * 0.1;
  }
  return out;
}

/** Sum of tracks of one length, as a mono array. */
export function mix(...tracks: Float32Array[]): Float32Array {
  const out = new Float32Array(Math.min(...tracks.map((t) => t.length)));
  for (const t of tracks) for (let i = 0; i < out.length; i++) out[i] = out[i]! + t[i]!;
  return out;
}

/** Mono 16-bit PCM WAV. */
export function wav(samples: Float32Array, sr: number): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), 44 + i * 2);
  return buf;
}

/** Mono 8-bit unsigned PCM WAV of silence. */
export function silentWav8(seconds: number, sr: number): Buffer {
  const n = seconds * sr;
  const buf = Buffer.alloc(44 + n, 128);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n, 40);
  return buf;
}
