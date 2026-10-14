/**
 * A hand-written AVI (RIFF) writer for the Video to AVI tool. No library: Mediabunny has no AVI
 * muxer, and the format is small. The file is the classic layout that every AVI player reads:
 *
 *   RIFF 'AVI '
 *     LIST 'hdrl'  avih, LIST 'strl' (strh, strf) for the picture, and again for the sound
 *     LIST 'movi'  '00dc' picture chunks and '01wb' sound chunks, interleaved by time
 *     'idx1'       one 16-byte entry per chunk
 *
 * It is plain RIFF, not OpenDML, so a file cannot pass 4 GB; `AVI_LIMIT_BYTES` keeps a margin.
 * Chunk data is padded to an even length, and the size field holds the length without the pad.
 * This module has no imports so tests can load it on its own.
 */

/** What a legacy RIFF file can safely hold, with room for the header and the index. */
export const AVI_LIMIT_BYTES = 1_900_000_000;

export class AviTooLarge extends Error {
  constructor(bytes: number) {
    super(
      `This video would make an AVI of about ${(bytes / 1e9).toFixed(1)} GB, and an AVI cannot hold more than ${(AVI_LIMIT_BYTES / 1e9).toFixed(1)} GB. Trim it first, or convert it to MP4 or MOV instead.`,
    );
    this.name = 'AviTooLarge';
  }
}

export interface AviFrame {
  data: Uint8Array;
  key: boolean;
}

export interface AviVideo {
  /** 'H264' (Annex B frames) or 'MJPG' (one JPEG per frame). */
  fourcc: 'H264' | 'MJPG';
  width: number;
  height: number;
  /** Constant frame rate as a fraction: fpsNum / fpsDen. */
  fpsNum: number;
  fpsDen: number;
  frames: AviFrame[];
}

export type AviAudio =
  /** 16-bit little-endian interleaved PCM, cut into chunks at any multiple of the sample size. */
  | { kind: 'pcm'; channels: number; sampleRate: number; chunks: Uint8Array[] }
  /** MP3, one entry per 1152-sample frame. */
  | { kind: 'mp3'; channels: number; sampleRate: number; bitrate: number; frames: Uint8Array[] };

const MP3_FRAME_SAMPLES = 1152;

const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n >>> 0, true);
const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n & 0xffff, true);
const tag = (v: DataView, o: number, s: string) => {
  for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i));
};

/** A chunk header ('id', size) as 8 bytes. */
function chunkHead(id: string, size: number): Uint8Array {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  tag(v, 0, id);
  u32(v, 4, size);
  return b;
}

function listHead(size: number, type: string): Uint8Array {
  const b = new Uint8Array(12);
  const v = new DataView(b.buffer);
  tag(v, 0, 'LIST');
  u32(v, 4, size);
  tag(v, 8, type);
  return b;
}

function strh(type: string, handler: string, scale: number, rate: number, length: number, sampleSize: number, bufferSize: number, w: number, h: number): Uint8Array {
  const b = new Uint8Array(8 + 56);
  const v = new DataView(b.buffer);
  tag(v, 0, 'strh');
  u32(v, 4, 56);
  tag(v, 8, type);
  if (handler) tag(v, 12, handler);
  // flags 0, priority 0, language 0, initial frames 0
  u32(v, 28, scale);
  u32(v, 32, rate);
  u32(v, 36, 0);
  u32(v, 40, length);
  u32(v, 44, bufferSize);
  u32(v, 48, 0xffffffff);
  u32(v, 52, sampleSize);
  u16(v, 60, w);
  u16(v, 62, h);
  return b;
}

function videoFormat(video: AviVideo, maxFrame: number): Uint8Array {
  const b = new Uint8Array(8 + 40);
  const v = new DataView(b.buffer);
  tag(v, 0, 'strf');
  u32(v, 4, 40);
  u32(v, 8, 40);
  u32(v, 12, video.width);
  u32(v, 16, video.height);
  u16(v, 20, 1);
  u16(v, 22, 24);
  tag(v, 24, video.fourcc);
  u32(v, 28, Math.max(maxFrame, video.width * video.height * 3));
  return b;
}

/** WAVEFORMATEX, plus the 12-byte MPEGLAYER3WAVEFORMAT tail for MP3. */
function audioFormat(a: AviAudio): Uint8Array {
  const mp3 = a.kind === 'mp3';
  const size = mp3 ? 30 : 16;
  const b = new Uint8Array(8 + size);
  const v = new DataView(b.buffer);
  tag(v, 0, 'strf');
  u32(v, 4, size);
  u16(v, 8, mp3 ? 0x0055 : 0x0001);
  u16(v, 10, a.channels);
  u32(v, 12, a.sampleRate);
  if (a.kind === 'pcm') {
    u32(v, 16, a.sampleRate * a.channels * 2);
    u16(v, 20, a.channels * 2);
    u16(v, 22, 16);
  } else {
    u32(v, 16, Math.round(a.bitrate / 8));
    u16(v, 20, 1);
    u16(v, 22, 0);
    u16(v, 24, 12);
    u16(v, 26, 1); // MPEGLAYER3_ID_MPEG
    u32(v, 28, 2); // MPEGLAYER3_FLAG_PADDING_OFF
    u16(v, 32, Math.round((MP3_FRAME_SAMPLES * a.bitrate) / 8 / a.sampleRate));
    u16(v, 34, 1);
    u16(v, 36, 1393);
  }
  return b;
}

interface Entry {
  id: string;
  data: Uint8Array;
  key: boolean;
  time: number;
}

/** The audio as timed chunks: PCM is as the caller cut it, MP3 is one frame each. */
function audioEntries(a: AviAudio): Entry[] {
  const out: Entry[] = [];
  if (a.kind === 'mp3') {
    a.frames.forEach((data, i) => out.push({ id: '01wb', data, key: true, time: (i * MP3_FRAME_SAMPLES) / a.sampleRate }));
  } else {
    let samples = 0;
    for (const data of a.chunks) {
      out.push({ id: '01wb', data, key: true, time: samples / a.sampleRate });
      samples += data.length / (a.channels * 2);
    }
  }
  return out;
}

/** Write the AVI. Throws AviTooLarge past the legacy limit. The pieces go straight into a Blob: nothing is joined in memory. */
export function writeAvi(video: AviVideo, audio?: AviAudio | null): Blob {
  const frames = video.frames;
  const clip = audio && (audio.kind === 'pcm' ? audio.chunks.length : audio.frames.length) > 0 ? audio : null;

  const vEntries: Entry[] = frames.map((f, i) => ({ id: '00dc', data: f.data, key: f.key, time: (i * video.fpsDen) / video.fpsNum }));
  const aEntries = clip ? audioEntries(clip) : [];
  const entries: Entry[] = [];
  let a = 0;
  for (const v of vEntries) {
    while (a < aEntries.length && aEntries[a]!.time <= v.time) entries.push(aEntries[a++]!);
    entries.push(v);
  }
  while (a < aEntries.length) entries.push(aEntries[a++]!);

  const maxVideo = frames.reduce((m, f) => Math.max(m, f.data.length), 0);
  const maxAudio = aEntries.reduce((m, e) => Math.max(m, e.data.length), 0);
  const moviSize = 4 + entries.reduce((n, e) => n + 8 + e.data.length + (e.data.length & 1), 0);
  const idxSize = entries.length * 16;

  const videoStrl = [strh('vids', video.fourcc, video.fpsDen, video.fpsNum, frames.length, 0, maxVideo, video.width, video.height), videoFormat(video, maxVideo)];
  let audioStrl: Uint8Array[] = [];
  if (clip) {
    const length = clip.kind === 'mp3' ? clip.frames.length : clip.chunks.reduce((n, c) => n + c.length, 0) / (clip.channels * 2);
    audioStrl =
      clip.kind === 'mp3'
        ? [strh('auds', '', MP3_FRAME_SAMPLES, clip.sampleRate, length, 0, maxAudio, 0, 0), audioFormat(clip)]
        : [strh('auds', '', clip.channels * 2, clip.sampleRate * clip.channels * 2, length, clip.channels * 2, maxAudio, 0, 0), audioFormat(clip)];
  }
  const strlSize = (parts: Uint8Array[]) => 4 + parts.reduce((n, p) => n + p.length, 0);
  const videoList = [listHead(strlSize(videoStrl), 'strl'), ...videoStrl];
  const audioList = clip ? [listHead(strlSize(audioStrl), 'strl'), ...audioStrl] : [];
  const hdrlSize = 4 + 8 + 56 + [...videoList, ...audioList].reduce((n, p) => n + p.length, 0);

  const avih = new Uint8Array(8 + 56);
  {
    const v = new DataView(avih.buffer);
    tag(v, 0, 'avih');
    u32(v, 4, 56);
    u32(v, 8, Math.round((1e6 * video.fpsDen) / video.fpsNum));
    u32(v, 12, Math.round((maxVideo + maxAudio) * (video.fpsNum / video.fpsDen) * 1.2));
    u32(v, 20, 0x10 | 0x100); // has index, interleaved
    u32(v, 24, frames.length);
    u32(v, 32, clip ? 2 : 1);
    u32(v, 36, Math.max(maxVideo, maxAudio));
    u32(v, 40, video.width);
    u32(v, 44, video.height);
  }

  // 'RIFF' + size + 'AVI ', then the three lists and the index, each with its own 8-byte head.
  const fileBytes = 12 + (8 + hdrlSize) + (8 + moviSize) + (8 + idxSize);
  if (fileBytes > AVI_LIMIT_BYTES) throw new AviTooLarge(fileBytes);

  const riff = new Uint8Array(12);
  {
    const v = new DataView(riff.buffer);
    tag(v, 0, 'RIFF');
    u32(v, 4, fileBytes - 8);
    tag(v, 8, 'AVI ');
  }
  const idx = new Uint8Array(idxSize);
  {
    const v = new DataView(idx.buffer);
    let offset = 4; // from the 'movi' tag
    entries.forEach((e, i) => {
      tag(v, i * 16, e.id);
      u32(v, i * 16 + 4, e.key ? 0x10 : 0);
      u32(v, i * 16 + 8, offset);
      u32(v, i * 16 + 12, e.data.length);
      offset += 8 + e.data.length + (e.data.length & 1);
    });
  }
  const pad = new Uint8Array(1);
  const parts: Uint8Array[] = [riff, listHead(hdrlSize, 'hdrl'), avih, ...videoList, ...audioList, listHead(moviSize, 'movi')];
  for (const e of entries) {
    parts.push(chunkHead(e.id, e.data.length), e.data);
    if (e.data.length & 1) parts.push(pad);
  }
  parts.push(chunkHead('idx1', idxSize), idx);
  return new Blob(parts as BlobPart[], { type: 'video/x-msvideo' });
}

/** The parts of an AVI that a test (or a self-check) needs, read back from its bytes. */
export interface AviSummary {
  fileSize: number;
  riffSize: number;
  microSecPerFrame: number;
  totalFrames: number;
  width: number;
  height: number;
  streams: { type: string; handler: string; scale: number; rate: number; length: number }[];
  videoChunks: number;
  audioChunks: number;
  keyFrames: number;
  /** Seconds, from the frame count and rate in the headers. */
  duration: number;
  /** Seconds, the sound's length from its header. */
  audioDuration: number;
  audioFormatTag: number;
  videoFourcc: string;
  idx1Entries: number;
  moviOffset: number;
  chunksInMovi: number;
}

export function readAvi(bytes: Uint8Array): AviSummary {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  if (str(0) !== 'RIFF' || str(8) !== 'AVI ') throw new Error('Not an AVI file.');
  const s: AviSummary = {
    fileSize: bytes.length,
    riffSize: v.getUint32(4, true),
    microSecPerFrame: 0,
    totalFrames: 0,
    width: 0,
    height: 0,
    streams: [],
    videoChunks: 0,
    audioChunks: 0,
    keyFrames: 0,
    duration: 0,
    audioDuration: 0,
    audioFormatTag: 0,
    videoFourcc: '',
    idx1Entries: 0,
    moviOffset: 0,
    chunksInMovi: 0,
  };
  let lastStrh = '';
  const walk = (start: number, end: number) => {
    let o = start;
    while (o + 8 <= end) {
      const id = str(o);
      const size = v.getUint32(o + 4, true);
      const body = o + 8;
      if (id === 'LIST') {
        const type = str(body);
        if (type === 'movi') {
          s.moviOffset = o + 8;
          let c = body + 4;
          const stop = body + size;
          while (c + 8 <= stop) {
            s.chunksInMovi++;
            c += 8 + v.getUint32(c + 4, true) + (v.getUint32(c + 4, true) & 1);
          }
        } else walk(body + 4, body + size);
      } else if (id === 'avih') {
        s.microSecPerFrame = v.getUint32(body, true);
        s.totalFrames = v.getUint32(body + 16, true);
        s.width = v.getUint32(body + 32, true);
        s.height = v.getUint32(body + 36, true);
      } else if (id === 'strh') {
        lastStrh = str(body);
        s.streams.push({ type: lastStrh, handler: str(body + 4), scale: v.getUint32(body + 20, true), rate: v.getUint32(body + 24, true), length: v.getUint32(body + 32, true) });
      } else if (id === 'strf') {
        if (lastStrh === 'vids') s.videoFourcc = str(body + 16);
        else if (lastStrh === 'auds') s.audioFormatTag = v.getUint16(body, true);
      } else if (id === 'idx1') {
        s.idx1Entries = size / 16;
        for (let i = 0; i < s.idx1Entries; i++) {
          const e = body + i * 16;
          const cid = str(e);
          if (cid.endsWith('dc')) {
            s.videoChunks++;
            if (v.getUint32(e + 4, true) & 0x10) s.keyFrames++;
          } else if (cid.endsWith('wb')) s.audioChunks++;
        }
      }
      o = body + size + (size & 1);
    }
  };
  walk(12, bytes.length);
  s.duration = (s.videoChunks * s.microSecPerFrame) / 1e6;
  const aud = s.streams.find((x) => x.type === 'auds');
  s.audioDuration = aud && aud.rate ? (aud.length * aud.scale) / aud.rate : 0;
  return s;
}

/** The two H.264 parameter sets (SPS, PPS) and the NAL length size from an avcC record, as Annex B bytes. */
export function avcConfig(description: Uint8Array): { lengthSize: number; parameterSets: Uint8Array } {
  const lengthSize = (description[4]! & 3) + 1;
  const out: number[] = [];
  let o = 5;
  const count = (n: number) => {
    for (let i = 0; i < n; i++) {
      const len = (description[o]! << 8) | description[o + 1]!;
      out.push(0, 0, 0, 1);
      for (let j = 0; j < len; j++) out.push(description[o + 2 + j]!);
      o += 2 + len;
    }
  };
  count(description[o++]! & 31);
  count(description[o++]!);
  return { lengthSize, parameterSets: Uint8Array.from(out) };
}

/** A length-prefixed (avcC) H.264 sample as Annex B: start codes in place of lengths, parameter sets first on a key frame. */
export function avcToAnnexB(sample: Uint8Array, lengthSize: number, parameterSets: Uint8Array | null): Uint8Array {
  const pieces: Uint8Array[] = [];
  let total = parameterSets ? parameterSets.length : 0;
  let o = 0;
  while (o + lengthSize <= sample.length) {
    let len = 0;
    for (let i = 0; i < lengthSize; i++) len = len * 256 + sample[o + i]!;
    o += lengthSize;
    pieces.push(sample.subarray(o, Math.min(sample.length, o + len)));
    total += 4 + pieces[pieces.length - 1]!.length;
    o += len;
  }
  const out = new Uint8Array(total);
  let p = 0;
  if (parameterSets) {
    out.set(parameterSets, 0);
    p = parameterSets.length;
  }
  for (const nal of pieces) {
    out[p + 3] = 1;
    out.set(nal, p + 4);
    p += 4 + nal.length;
  }
  return out;
}
