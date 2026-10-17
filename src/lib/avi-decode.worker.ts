/**
 * Converts one AVI to an MP4 in a background worker. The AVI demuxer and the decoders for MPEG-4
 * Part 2 (Xvid, DivX 4 and later), Motion JPEG, MP3, MP2, AC-3 and PCM come from a build of FFmpeg's
 * libraries (libav.js, LGPL), fetched from this site's /vendor/ only when this runs. Decoded pictures
 * and sound go to Mediabunny, which encodes H.264 and AAC through WebCodecs and writes the MP4.
 * H.264 or AAC sound inside an AVI is not decoded here: those need a licensed decoder, which the
 * build leaves out on purpose. The file is read in slices from disk and never leaves the tab.
 */
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSource,
  getFirstEncodableAudioCodec,
  type AudioCodec,
} from 'mediabunny';
import { pickVideoCodec } from './video-codec';
import { EncoderRefused, EncoderUnavailable } from './encoder-probe';
import { registerMp3Fallback } from './mp3-fallback';
import { Resampler } from './audio-resample';
import { toLimitedBt709 } from './yuv-convert';
import { AviDecoderLoadError, UnsupportedAviCodec } from './avi-errors';
import { workerFailure } from './worker-error';
import { toFloatPlanes } from './libav-audio';
import { NamedError } from './input-error';

export interface AviJob {
  file: File;
  mute: boolean;
  /** URL of the libav.js loader module (under /vendor/). */
  entry: string;
  /** Whether the page has an AudioEncoder (iOS 18 and earlier have none). The page says so, so it can be tested. */
  audioEncoder: boolean;
}

export type AviMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; buffer: ArrayBuffer; width: number; height: number; duration: number; videoCodec: string; audio: boolean; audioCopied: boolean }
  | { type: 'error'; name: string; message: string };

/** libav's AVPixelFormat numbers for the planar YUV layouts WebCodecs takes as they are. */
const PIXEL_FORMATS: Record<number, { format: 'I420' | 'I422' | 'I444'; full: boolean; cw: 0 | 1; ch: 0 | 1 }> = {
  0: { format: 'I420', full: false, cw: 1, ch: 1 },
  4: { format: 'I422', full: false, cw: 1, ch: 0 },
  5: { format: 'I444', full: false, cw: 0, ch: 0 },
  12: { format: 'I420', full: true, cw: 1, ch: 1 },
  13: { format: 'I422', full: true, cw: 1, ch: 0 },
  14: { format: 'I444', full: true, cw: 0, ch: 0 },
};

const CODEC_NAMES: Record<string, string> = { avc: 'H.264', vp9: 'VP9', av1: 'AV1' };
const NOPTS_HI = -2147483648;
/** How much packet data to ask for per read; bigger batches decode hundreds of frames at once and hold them all. */
const READ_LIMIT = 128 * 1024;

interface LibavFrame {
  data: Uint8Array | Int16Array | Int32Array | Float32Array | Float64Array | (Int16Array | Int32Array | Float32Array | Float64Array | Uint8Array)[];
  format: number;
  width?: number;
  height?: number;
  sample_rate?: number;
  channels?: number;
  nb_samples?: number;
  pts: number;
  ptshi: number;
  best_effort_timestamp?: number;
  best_effort_timestamphi?: number;
}

// The libav.js API is large and untyped here; the calls used are listed in avi-convert's notes.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Libav = any;

const post = (m: AviMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function loadLibav(entry: string): Promise<Libav> {
  try {
    const mod = await import(/* @vite-ignore */ entry);
    const base = entry.slice(0, entry.lastIndexOf('/'));
    return await mod.default.LibAV({ noworker: true, base });
  } catch (cause) {
    throw new AviDecoderLoadError(cause);
  }
}

/** Progress reaches the page at most about ten times a second, and always when it is the first or the last. */
let lastPost = -Infinity;
function progress(fraction: number, force = false) {
  const now = performance.now();
  if (!force && now - lastPost < 100) return;
  lastPost = now;
  post({ type: 'progress', fraction });
}

async function convert(job: AviJob): Promise<void> {
  const libav = await loadLibav(job.entry);
  // The decoder is in: this is what the page's stall watchdog waits for before it starts timing the work itself.
  progress(0, true);
  const name = 'input.avi';
  await libav.mkreadaheadfile(name, job.file);
  let fmt: number;
  let streams: any[];
  try {
    [fmt, streams] = await libav.ff_init_demuxer_file(name);
  } catch {
    const { UnreadableFile } = await import('./input-error');
    throw new UnreadableFile('This file does not open as an AVI. It may be damaged, or not an AVI at all.');
  }
  const vs = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_VIDEO);
  const as = job.mute ? undefined : streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_AUDIO);
  if (!vs) {
    const { UnreadableFile } = await import('./input-error');
    throw new UnreadableFile('This AVI has no picture. For the sound of an AVI, use Video to MP3.');
  }
  const decoder = async (s: any, kind: 'video' | 'sound') => {
    try {
      const [, c, pkt, frame] = await libav.ff_init_decoder(s.codec_id, { codecpar: s.codecpar, time_base: [s.time_base_num, s.time_base_den] });
      return { c, pkt, frame };
    } catch {
      throw new UnsupportedAviCodec(String(await libav.avcodec_get_name(s.codec_id)), kind);
    }
  };
  const vdec = await decoder(vs, 'video');
  const adec = as ? await decoder(as, 'sound') : undefined;

  const width = await libav.AVCodecParameters_width(vs.codecpar);
  const height = await libav.AVCodecParameters_height(vs.codecpar);
  if (!width || !height) throw new UnsupportedAviCodec('none', 'video');
  const evenW = width & ~1 || 2;
  const evenH = height & ~1 || 2;
  const duration = Math.max(0, Number(vs.duration) || 0, as ? Number(as.duration) || 0 : 0);
  const fps = vs.time_base_num > 0 && vs.time_base_den / vs.time_base_num <= 120 ? vs.time_base_den / vs.time_base_num : 30;

  if (typeof VideoEncoder === 'undefined') throw new EncoderUnavailable();
  const videoCodec = await pickVideoCodec({ width: evenW, height: evenH, bitrate: QUALITY_HIGH });
  if (!videoCodec) throw new EncoderRefused();

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const videoSource = new VideoSampleSource({ codec: videoCodec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(videoSource, { frameRate: Math.round(fps * 100) / 100 });

  // Sound: MP3 is copied packet by packet when this browser has no AAC encoder (iOS 18 and earlier);
  // otherwise it is decoded and written as AAC, or as MP3 by the LAME fallback when AAC is not offered.
  let audioSource: AudioSampleSource | EncodedAudioPacketSource | undefined;
  let audioCopied = false;
  let resampler: Resampler | undefined;
  let audioRate = 0;
  let audioChannels = 1;
  if (as && adec) {
    const srcRate: number = await libav.AVCodecParameters_sample_rate(as.codecpar);
    const srcChannels: number = (await libav.AVCodecParameters_ch_layout_nb_channels(as.codecpar)) || (await libav.AVCodecParameters_channels(as.codecpar)) || 2;
    audioChannels = Math.min(2, srcChannels);
    const sourceName = String(await libav.avcodec_get_name(as.codec_id));
    const hasAac = job.audioEncoder && typeof AudioEncoder !== 'undefined' && (await getFirstEncodableAudioCodec(['aac'], { numberOfChannels: audioChannels, sampleRate: srcRate === 44100 ? 44100 : 48000, bitrate: QUALITY_HIGH })) === 'aac';
    if (!hasAac && sourceName === 'mp3' && srcRate >= 32000 && srcChannels <= 2) {
      audioSource = new EncodedAudioPacketSource('mp3');
      audioCopied = true;
      audioRate = srcRate;
    } else {
      registerMp3Fallback();
      const keep = srcRate === 44100 || srcRate === 48000;
      audioRate = hasAac && keep ? srcRate : 48000;
      const codec: AudioCodec | null = await getFirstEncodableAudioCodec(hasAac ? ['aac', 'mp3'] : ['mp3'], { numberOfChannels: audioChannels, sampleRate: audioRate, bitrate: QUALITY_HIGH });
      if (codec) {
        audioSource = new AudioSampleSource({ codec, bitrate: QUALITY_HIGH });
        if (srcRate !== audioRate) resampler = new Resampler(srcRate, audioRate, audioChannels);
      }
    }
    if (audioSource) output.addAudioTrack(audioSource);
  }
  await output.start();

  // Timestamps: the picture's own best-effort stamp, the first one subtracted, and strictly increasing.
  const vTime = (ts: number) => (ts * vs.time_base_num) / vs.time_base_den;
  let vBase: number | null = null;
  let lastV = -1;
  let frames = 0;
  let audioSamples = 0;
  let mp3Config = false;
  let firstAudioPts: number | null = null;
  const aTime = as ? (ts: number) => (ts * as.time_base_num) / as.time_base_den : () => 0;

  const addVideo = async (list: LibavFrame[]) => {
    for (const f of list) {
      const px = PIXEL_FORMATS[f.format];
      if (!px) throw new UnsupportedAviCodec('none', 'video');
      const stamp = f.best_effort_timestamphi !== undefined && f.best_effort_timestamphi !== NOPTS_HI && f.best_effort_timestamp !== undefined ? f.best_effort_timestamp : f.ptshi !== NOPTS_HI ? f.pts : null;
      let t = stamp === null ? null : vTime(stamp);
      if (t !== null && vBase === null) vBase = t;
      if (t !== null) t -= vBase!;
      if (t === null || t <= lastV) t = lastV < 0 ? 0 : lastV + 1 / fps;
      lastV = t;
      const w = f.width ?? width;
      const h = f.height ?? height;
      // Old video is BT.601 below HD and BT.709 above it (the usual rule); Motion JPEG is full-range BT.601.
      const picture = toLimitedBt709(f.data as Uint8Array, w, h, { cw: px.cw, ch: px.ch, fullRange: px.full, matrix: px.full || h < 720 ? 'bt601' : 'bt709' }, w & ~1 || 2, h & ~1 || 2);
      const sample = new VideoSample(picture, {
        format: px.format,
        codedWidth: w & ~1 || 2,
        codedHeight: h & ~1 || 2,
        timestamp: t,
        duration: 1 / fps,
        colorSpace: { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false },
      });
      await videoSource.add(sample);
      sample.close();
      frames++;
      progress(duration > 0 ? Math.min(0.99, t / duration) : 0.5);
    }
  };

  const addSound = async (list: LibavFrame[]) => {
    for (const f of list) {
      let planes = toFloatPlanes(f);
      if (resampler) planes = resampler.push(planes);
      const n = planes[0]!.length;
      if (!n || !audioSource) continue;
      const data = new Float32Array(n * planes.length);
      planes.forEach((p, c) => data.set(p, c * n));
      const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: planes.length, sampleRate: audioRate, timestamp: audioSamples / audioRate });
      audioSamples += n;
      await (audioSource as AudioSampleSource).add(sample);
      sample.close();
    }
  };

  const copyPackets = async (list: any[]) => {
    for (const p of list) {
      if (p.ptshi === NOPTS_HI && p.dtshi === NOPTS_HI) continue;
      const pts = aTime(p.ptshi !== NOPTS_HI ? p.pts : p.dts);
      firstAudioPts ??= pts;
      const dur = p.duration > 0 ? aTime(p.duration) : 1152 / audioRate;
      const packet = new EncodedPacket(p.data, 'key', Math.max(0, pts - firstAudioPts), dur);
      const meta = mp3Config ? undefined : { decoderConfig: { codec: 'mp3', sampleRate: audioRate, numberOfChannels: audioChannels } };
      mp3Config = true;
      await (audioSource as EncodedAudioPacketSource).add(packet, meta);
    }
  };

  const packetPtr = await libav.av_packet_alloc();
  let failures = 0;
  for (;;) {
    const [res, packets] = await libav.ff_read_frame_multi(fmt, packetPtr, { limit: READ_LIMIT });
    const vp = packets[vs.index];
    if (vp?.length) await addVideo(await libav.ff_decode_multi(vdec.c, vdec.pkt, vdec.frame, vp, { ignoreErrors: true, copyoutFrame: 'video_packed' }));
    const ap = as ? packets[as.index] : undefined;
    if (ap?.length && adec && audioSource) {
      if (audioCopied) await copyPackets(ap);
      else await addSound(await libav.ff_decode_multi(adec.c, adec.pkt, adec.frame, ap, { ignoreErrors: true }));
    }
    if (res === libav.AVERROR_EOF) break;
    if (res < 0 && res !== -libav.EAGAIN && ++failures > 5) break;
  }
  await addVideo(await libav.ff_decode_multi(vdec.c, vdec.pkt, vdec.frame, [], { fin: true, ignoreErrors: true, copyoutFrame: 'video_packed' }));
  if (adec && audioSource && !audioCopied) {
    await addSound(await libav.ff_decode_multi(adec.c, adec.pkt, adec.frame, [], { fin: true, ignoreErrors: true }));
    if (resampler) {
      const tail = resampler.finish();
      if (tail[0]!.length) {
        const n = tail[0]!.length;
        const data = new Float32Array(n * tail.length);
        tail.forEach((p, c) => data.set(p, c * n));
        const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: tail.length, sampleRate: audioRate, timestamp: audioSamples / audioRate });
        await (audioSource as AudioSampleSource).add(sample);
        sample.close();
      }
    }
  }
  if (frames === 0) throw new UnsupportedAviCodec(String(await libav.avcodec_get_name(vs.codec_id)), 'video');
  await output.finalize();
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new NamedError('AviDecodeWorkerFailed', 'The video could not be written.');
  post(
    { type: 'done', buffer, width, height, duration: Math.max(lastV + 1 / fps, 0), videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec, audio: !!audioSource, audioCopied },
    [buffer],
  );
}

self.onmessage = (e: MessageEvent<AviJob>) => {
  convert(e.data).catch((err) => {
    const f = workerFailure(err);
    post({ type: 'error', name: f.name, message: f.message });
  });
};
