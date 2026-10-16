/**
 * Convert a video to AVI in the browser. Mediabunny (MPL-2.0) reads MP4, MOV, WebM or MKV and, for
 * H.264, re-encodes into a temporary in-memory MP4 with no B-frames at a constant frame rate. The
 * picture is then taken out of it packet by packet, turned from MP4's length-prefixed form into
 * Annex B, and written into an AVI by the hand-written writer in avi-write.ts. "Maximum
 * compatibility" writes one JPEG per frame (Motion JPEG) from a canvas instead. Sound is MP3 (from
 * the page's own LAME encoder) or 16-bit PCM for short clips and for Motion JPEG. AAC never goes
 * into an AVI. Nothing leaves the tab.
 */
import {
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  EncodedPacketSink,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  WEBM,
  type AudioCodec,
} from 'mediabunny';
import { executeWatched, watchEncode } from './encoder-watchdog';
import { pickVideoCodec } from './video-codec';
import { H264Unavailable } from './encoder-probe';
import { unplayable } from './video-compress';
import { firstEncodableSound } from './mp3-fallback';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';
import { overPhoneLimit, PHONE_SAFE_BYTES, TRIM_LINK } from './phone-limit';
import { AVI_LIMIT_BYTES, AviTooLarge, avcConfig, avcToAnnexB, writeAvi, type AviAudio, type AviFrame } from './avi-write';
import { NamedError, UnreadableFile } from './input-error';

export interface AviOptions {
  mute: boolean;
  /** Write Motion JPEG pictures and PCM sound, which the oldest players open, at the cost of a much larger file. */
  compat: boolean;
  onProgress?: (fraction: number) => void;
}

export interface AviResult {
  blob: Blob;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  fps: number;
  videoCodec: string;
  audio: 'MP3' | 'PCM' | null;
  audioDropped: boolean;
}

/** Clips shorter than this keep uncompressed sound (about 11 MB a minute); longer ones get MP3. */
export const PCM_UNDER_SECONDS = 120;
const MP3_BITRATE = 192_000;
const JPEG_QUALITY = 0.85;
/** Bytes per pixel of a JPEG at that quality, for a picture that cannot be sampled (a worst case for busy footage). */
const JPEG_BYTES_PER_PIXEL = 0.35;
const MAX_FPS = 60;

/** The frame rate as a fraction, snapping the TV rates (29.97, 23.976, 59.94) to their exact ratios, capped at 60. */
export function frameRateFraction(rate: number): { num: number; den: number; fps: number } {
  const r = Math.min(MAX_FPS, Math.max(1, rate || 30));
  for (const [num, den] of [
    [24_000, 1001],
    [30_000, 1001],
    [60_000, 1001],
  ] as const) {
    if (Math.abs(r - num / den) < 0.02) return { num, den, fps: num / den };
  }
  const n = Math.max(1, Math.round(r));
  return { num: n, den: 1, fps: n };
}

/** What the file will weigh, by the settings it will be written with. Used to refuse a job before any encoding. */
export function estimateAviBytes(o: { duration: number; width: number; height: number; fps: number; compat: boolean; sound: 'MP3' | 'PCM' | null; soundRate?: number; channels?: number; jpegBytes?: number }): number {
  const video = o.compat ? (o.jpegBytes ?? o.width * o.height * JPEG_BYTES_PER_PIXEL) * o.fps * o.duration : (h264Bitrate(o.width, o.height, o.fps) / 8) * o.duration * 1.1;
  const audio = o.sound === 'PCM' ? (o.soundRate ?? SAMPLE_RATE) * (o.channels ?? 2) * 2 * o.duration : o.sound === 'MP3' ? (MP3_BITRATE / 8) * o.duration : 0;
  return Math.round(video + audio + 4096 + o.duration * o.fps * 25);
}

/** A high-quality H.264 rate for the size and speed: about 0.12 bits per pixel, within 1 and 40 Mbit/s. */
export const h264Bitrate = (w: number, h: number, fps: number) => Math.round(Math.min(40e6, Math.max(1e6, w * h * fps * 0.12)));

const even = (n: number) => n + (n % 2);

type VideoTrack = NonNullable<Awaited<ReturnType<Input['getPrimaryVideoTrack']>>>;

function oversize(bytes: number): AviTooLarge {
  return new AviTooLarge(bytes);
}

function phoneRefusal(bytes: number): Error {
  const e = new NamedError('VideoToAviFailed', 
    `This job is about ${(bytes / 1e6).toFixed(0)} MB. A phone can run out of memory converting more than about ${PHONE_SAFE_BYTES / 1e6} MB to AVI. Trim the video first, or use a computer.`,
  ) as Error & { link?: typeof TRIM_LINK };
  e.link = TRIM_LINK;
  return e;
}

export async function convertToAvi(file: File, opts: AviOptions): Promise<AviResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new UnreadableFile('This file has no video this page can read. It may be an audio file (try Video to MP3) or a format browsers do not open.');
    if (!(await video.canDecode())) throw new NamedError('VideoToAviFailed', unplayable());
    const width = even(video.displayWidth);
    const height = even(video.displayHeight);
    const duration = await input.computeDuration();
    const stats = await video.computePacketStats(300).catch(() => null);
    const rate = frameRateFraction(stats?.averagePacketRate ?? 30);

    const sound = opts.mute ? null : await input.getPrimaryAudioTrack().catch(() => null);
    const channels = sound ? Math.min(2, sound.numberOfChannels) : 0;
    const soundRate = sound ? await sound.getSampleRate() : 0;
    const pcmSound = !!sound && (opts.compat || duration < PCM_UNDER_SECONDS);

    // Refuse before any slow work: what an AVI cannot hold, and what a phone cannot hold in memory.
    // A few real pictures are saved as JPEGs first, so the estimate follows the footage and not a worst case.
    const jpegBytes = opts.compat ? await sampleJpegBytes(video, width, height, duration) : undefined;
    const estimate = estimateAviBytes({ duration, width, height, fps: rate.fps, compat: opts.compat, sound: sound ? (pcmSound ? 'PCM' : 'MP3') : null, soundRate, channels, jpegBytes });
    if (estimate > AVI_LIMIT_BYTES) throw oversize(estimate);
    if (overPhoneLimit(Math.max(file.size, estimate))) throw phoneRefusal(Math.max(file.size, estimate));

    let audio: AviAudio | null = null;
    let audioDropped = false;
    let audioLabel: AviResult['audio'] = null;
    let frames: AviFrame[];

    if (sound && pcmSound) {
      const got = await pcmChunks(input, file, rate.fps, opts.onProgress ? (f) => opts.onProgress!(0.02 * f) : undefined);
      if (got) {
        audio = got;
        audioLabel = 'PCM';
      } else audioDropped = true;
    }

    if (opts.compat) {
      frames = await jpegFrames(video, { width, height, duration, rate, onProgress: (f) => opts.onProgress?.(0.03 + f * 0.95) });
    } else {
      const encoded = await h264Frames({ input, file, video, width, height, duration, rate, sound: sound && !pcmSound ? sound : null, onProgress: (f) => opts.onProgress?.(0.03 + f * 0.9) });
      frames = encoded.frames;
      if (encoded.mp3) {
        audio = { kind: 'mp3', channels: encoded.channels, sampleRate: encoded.sampleRate, bitrate: MP3_BITRATE, frames: encoded.mp3 };
        audioLabel = 'MP3';
      } else if (sound && !pcmSound) {
        audioDropped = true;
      }
    }

    const aviBlob = writeAvi({ fourcc: opts.compat ? 'MJPG' : 'H264', width, height, fpsNum: rate.num, fpsDen: rate.den, frames }, audio);
    opts.onProgress?.(1);
    return { blob: aviBlob, width, height, duration, fps: rate.fps, videoCodec: opts.compat ? 'Motion JPEG' : 'H.264', audio: audioLabel, audioDropped };
  } finally {
    input.dispose?.();
  }
}

/** The sound as 16-bit PCM chunks about one picture long, from the browser's decoder (or, on iOS 18 and earlier, the page's own). */
async function pcmChunks(input: Input, file: File, fps: number, onProgress?: (f: number) => void): Promise<AviAudio | null> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return null;
  const chunks: Uint8Array[] = [];
  let rate = await track.getSampleRate();
  let channels = Math.min(2, track.numberOfChannels);
  const perChunk = Math.max(256, Math.round(rate / fps));
  let pending: Int16Array[] = [];
  let pendingSamples = 0;
  const flush = (all: boolean) => {
    if (!pendingSamples || (!all && pendingSamples < perChunk)) return;
    const out = new Int16Array(pendingSamples * channels);
    let o = 0;
    for (const p of pending) {
      out.set(p, o);
      o += p.length;
    }
    chunks.push(new Uint8Array(out.buffer));
    pending = [];
    pendingSamples = 0;
  };
  const push = (planes: Float32Array[]) => {
    const n = planes[0]!.length;
    const s16 = new Int16Array(n * channels);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < channels; c++) {
        const v = Math.max(-1, Math.min(1, planes[Math.min(c, planes.length - 1)]![i]!));
        s16[i * channels + c] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
      }
    }
    pending.push(s16);
    pendingSamples += n;
    flush(false);
  };

  let decoded = false;
  if (await track.canDecode()) {
    try {
      const sink = new AudioSampleSink(track);
      const total = await input.computeDuration();
      for await (const sample of sink.samples()) {
        const planes: Float32Array[] = [];
        for (let c = 0; c < channels; c++) {
          const plane = new Float32Array(sample.numberOfFrames);
          sample.copyTo(plane, { planeIndex: Math.min(c, sample.numberOfChannels - 1), format: 'f32-planar' });
          planes.push(plane);
        }
        sample.close();
        push(planes);
        onProgress?.(total ? Math.min(1, sample.timestamp / total) : 0);
      }
      decoded = true;
    } catch {
      decoded = false;
    }
  }
  if (!decoded) {
    // No WebCodecs sound decoder here (iOS 18 and earlier): the page's own decoder reads the whole file's sound.
    chunks.length = 0;
    pending = [];
    pendingSamples = 0;
    const pcm = await decodePcm(file);
    if (!pcm) return null;
    rate = SAMPLE_RATE;
    channels = pcm.length;
    for (let at = 0; at < pcm[0]!.length; at += perChunk) push(pcm.map((ch) => ch.subarray(at, Math.min(ch.length, at + perChunk))));
  }
  flush(true);
  return chunks.length ? { kind: 'pcm', channels, sampleRate: rate, chunks } : null;
}

/** The average size of a JPEG picture from this video, from three frames; undefined when none could be read. */
async function sampleJpegBytes(video: VideoTrack, width: number, height: number, duration: number): Promise<number | undefined> {
  try {
    const sink = new CanvasSink(video, { width, height, fit: 'contain', poolSize: 1 });
    const sizes: number[] = [];
    for (const at of [0.25, 0.5, 0.75]) {
      const wrapped = await sink.getCanvas(duration * at);
      if (wrapped) sizes.push((await canvasJpeg(wrapped.canvas)).length);
    }
    return sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : undefined;
  } catch {
    return undefined;
  }
}

/** One JPEG per output frame at a constant rate, drawn from the decoded picture by a canvas. */
async function jpegFrames(
  video: VideoTrack,
  o: { width: number; height: number; duration: number; rate: { num: number; den: number; fps: number }; onProgress: (f: number) => void },
): Promise<AviFrame[]> {
  const count = Math.max(1, Math.round((o.duration * o.rate.num) / o.rate.den));
  const sink = new CanvasSink(video, { width: o.width, height: o.height, fit: 'contain', poolSize: 2 });
  const frames: AviFrame[] = [];
  const times = (function* () {
    for (let i = 0; i < count; i++) yield (i * o.rate.den) / o.rate.num;
  })();
  let lastTs = NaN;
  let last: Uint8Array | null = null;
  let stop = false;
  let bytes = 0;
  await watchEncode(
    async (progress) => {
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        if (stop) break;
        if (wrapped) {
          if (wrapped.timestamp !== lastTs) {
            last = await canvasJpeg(wrapped.canvas);
            lastTs = wrapped.timestamp;
          }
        }
        // Before the first picture, the first one stands in; with no picture yet at all, the frame is skipped.
        if (last) {
          frames.push({ data: last, key: true });
          // The estimate came from three frames; stop as soon as the real total says the file would be too big.
          bytes += last.length + 25;
          if (bytes > AVI_LIMIT_BYTES - 200_000_000) throw oversize((bytes / frames.length) * count);
        }
        progress(frames.length / count);
        o.onProgress(frames.length / count);
      }
    },
    () => {
      stop = true;
    },
  );
  if (!frames.length) throw new NamedError('VideoToAviFailed', 'No picture could be read from this video.');
  return frames;
}

async function canvasJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  const blob =
    'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
      : await new Promise<Blob | null>((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob || blob.type !== 'image/jpeg') throw new NamedError('VideoToAviFailed', 'This browser cannot write JPEG pictures.');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * The H.264 picture (and MP3 sound) from a temporary MP4 that Mediabunny writes, as AVI chunks. The encoder
 * runs at a constant frame rate with every frame in order, so the AVI's frame count is the clip's length.
 */
async function h264Frames(o: {
  input: Input;
  file: File;
  video: VideoTrack;
  width: number;
  height: number;
  duration: number;
  rate: { num: number; den: number; fps: number };
  sound: NonNullable<Awaited<ReturnType<Input['getPrimaryAudioTrack']>>> | null;
  onProgress: (f: number) => void;
}): Promise<{ frames: AviFrame[]; mp3: Uint8Array[] | null; channels: number; sampleRate: number }> {
  const bitrate = h264Bitrate(o.width, o.height, o.rate.fps);
  let silent: H264Unavailable | undefined;
  const codec = await pickVideoCodec({ width: o.width, height: o.height, bitrate }, ['avc']).catch((e) => {
    if (e instanceof H264Unavailable) silent = e;
    else throw e;
    return null;
  });
  if (silent) throw silent;
  if (!codec) throw new NamedError('VideoToAviFailed', 'This browser cannot write H.264 video. Tick Maximum compatibility to write Motion JPEG instead, or use a recent Safari, Chrome or Edge.');

  // Sound: MP3 from the page's own encoder. A decoder-less browser (iOS 18 and earlier) has the page's decoder feed it instead.
  let wantSound = false;
  let pcm: Float32Array[] | null = null;
  const channels = o.sound ? Math.min(2, o.sound.numberOfChannels) : 0;
  if (o.sound) {
    const config = { numberOfChannels: channels, sampleRate: SAMPLE_RATE, bitrate: MP3_BITRATE };
    const mp3: AudioCodec | null = await firstEncodableSound([], config);
    if (mp3) {
      if (await o.sound.canDecode()) wantSound = true;
      else {
        pcm = await decodePcm(o.file);
        wantSound = !!pcm;
      }
    }
  }

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input: o.input,
    output,
    tracks: 'primary',
    composable: !!pcm,
    video: { codec: 'avc', bitrate, width: o.width, height: o.height, fit: 'contain', frameRate: o.rate.fps, forceTranscode: true, allowTransformationMetadata: false },
    audio: wantSound && !pcm ? { codec: 'mp3', bitrate: MP3_BITRATE, sampleRate: SAMPLE_RATE, numberOfChannels: channels } : { discard: true },
  });
  if (!conversion.isValid) {
    const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
    throw new NamedError('VideoToAviFailed', reason === 'undecodable_source_codec' ? unplayable() : 'This browser cannot convert this video.');
  }
  let feeding: Promise<void> | null = null;
  if (pcm) {
    const source = new AudioSampleSource({ codec: 'mp3', bitrate: MP3_BITRATE });
    output.addAudioTrack(source);
    await output.start();
    feeding = pcmFeeder(source, pcm)
      .until(Infinity)
      .then(() => source.close());
  }
  await Promise.all([executeWatched(conversion, (f) => o.onProgress(f * 0.9)), feeding]);
  if (pcm) await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) throw new NamedError('VideoToAviFailed', 'The video could not be written.');

  // Read the new MP4 back, packet by packet.
  const temp = new Input({ source: new BufferSource(buffer), formats: [MP4] });
  try {
    const vTrack = await temp.getPrimaryVideoTrack();
    if (!vTrack) throw new NamedError('VideoToAviFailed', 'The video could not be written.');
    const config = await vTrack.getDecoderConfig();
    const description = config?.description;
    if (!description) throw new NamedError('VideoToAviFailed', 'This browser wrote H.264 video this page cannot read back.');
    const desc = ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description);
    const { lengthSize, parameterSets } = avcConfig(desc);
    const frames: AviFrame[] = [];
    let lastTs = -Infinity;
    for await (const packet of new EncodedPacketSink(vTrack).packets()) {
      if (packet.timestamp < lastTs) throw new NamedError('VideoToAviFailed', 'This browser wrote H.264 video with reordered frames, which AVI cannot hold. Tick Maximum compatibility to write Motion JPEG instead.');
      lastTs = packet.timestamp;
      const key = packet.type === 'key';
      frames.push({ data: avcToAnnexB(packet.data, lengthSize, key ? parameterSets : null), key });
    }
    let mp3: Uint8Array[] | null = null;
    if (wantSound) {
      const aTrack = await temp.getPrimaryAudioTrack();
      if (aTrack) {
        mp3 = [];
        for await (const packet of new EncodedPacketSink(aTrack).packets()) mp3.push(packet.data);
        if (!mp3.length) mp3 = null;
      }
    }
    o.onProgress(1);
    return { frames, mp3, channels, sampleRate: SAMPLE_RATE };
  } finally {
    temp.dispose?.();
  }
}
