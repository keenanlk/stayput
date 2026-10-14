/**
 * Converts one 3GP (or 3G2) to an MP4 in a background worker. The file is read by a build of FFmpeg's
 * libraries (libav.js, LGPL) that holds the MOV demuxer and the decoders for MPEG-4 Part 2, H.263 and the
 * AMR speech codecs, fetched from this site's /vendor/ only when this runs. H.263 and MPEG-4 pictures
 * are decoded and written as H.264 through WebCodecs; an H.264 picture is copied across untouched.
 * AMR sound is decoded and written as AAC; AAC sound is copied. Anything else is refused by name rather
 * than dropped. The file is read in slices from disk and never leaves the tab.
 */
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSource,
  getFirstEncodableAudioCodec,
  type AudioCodec,
  type Rotation,
} from 'mediabunny';
import { pickVideoCodec } from './video-codec';
import { EncoderRefused, EncoderUnavailable } from './encoder-probe';
import { registerMp3Fallback } from './mp3-fallback';
import { Resampler } from './audio-resample';
import { toLimitedBt709 } from './yuv-convert';
import { toFloatPlanes, type LibavAudioFrame } from './libav-audio';
import { readAvcConfig } from './h264-sps';
import { ThreeGpDecoderLoadError, UnsupportedThreeGpCodec } from './threegp-errors';
import { workerFailure } from './worker-error';

export interface ThreeGpJob {
  file: File;
  mute: boolean;
  /** URL of the libav.js loader module (under /vendor/). */
  entry: string;
  /** Whether the page has an AudioEncoder (iOS 18 and earlier have none). The page says so, so it can be tested. */
  audioEncoder: boolean;
}

export type ThreeGpMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; buffer: ArrayBuffer; width: number; height: number; duration: number; videoCodec: string; videoCopied: boolean; audio: boolean; audioCopied: boolean }
  | { type: 'error'; name: string; message: string };

/** libav's AVPixelFormat numbers for the planar YUV layouts WebCodecs takes as they are (MPEG-4 and H.263 are 4:2:0). */
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
const AV_PKT_FLAG_KEY = 1;
const READ_LIMIT = 128 * 1024;
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

// The libav.js API is large and untyped here; the calls used are the ones in avi-decode.worker.ts and flv-decode.worker.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Libav = any;

const post = (m: ThreeGpMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function loadLibav(entry: string): Promise<Libav> {
  try {
    const mod = await import(/* @vite-ignore */ entry);
    const base = entry.slice(0, entry.lastIndexOf('/'));
    return await mod.default.LibAV({ noworker: true, base });
  } catch (cause) {
    throw new ThreeGpDecoderLoadError(cause);
  }
}

let lastPost = -Infinity;
function progress(fraction: number, force = false) {
  const now = performance.now();
  if (!force && now - lastPost < 100) return;
  lastPost = now;
  post({ type: 'progress', fraction });
}

/** Audio object type, sample rate and channel count from an AudioSpecificConfig (the first bytes of AAC extradata). */
function readAsc(asc: Uint8Array): { objectType: number; rate: number; channels: number } | null {
  if (asc.length < 2) return null;
  let pos = 0;
  const bits = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = v * 2 + (((asc[pos >> 3] ?? 0) >> (7 - (pos & 7))) & 1);
    return v;
  };
  let objectType = bits(5);
  if (objectType === 31) objectType = 32 + bits(6);
  const index = bits(4);
  const rate = index === 15 ? bits(24) : (AAC_RATES[index] ?? 0);
  const channels = bits(4);
  return { objectType, rate, channels: channels === 7 ? 8 : channels };
}

/** The picture's rotation flag (phones record portrait video sideways and set this), read with Mediabunny. */
async function readRotation(file: File): Promise<Rotation> {
  try {
    const input = new Input({ source: new BlobSource(file), formats: [MP4] });
    const track = await input.getPrimaryVideoTrack();
    return track?.rotation ?? 0;
  } catch {
    return 0;
  }
}

async function convert(job: ThreeGpJob): Promise<void> {
  const libav = await loadLibav(job.entry);
  // The decoder is in: this is what the page's stall watchdog waits for before it starts timing the work itself.
  progress(0, true);
  const { UnreadableFile } = await import('./input-error');
  const name = 'input.3gp';
  await libav.mkreadaheadfile(name, job.file);
  let fmt: number;
  let streams: any[];
  try {
    [fmt, streams] = await libav.ff_init_demuxer_file(name);
  } catch {
    throw new UnreadableFile('This file does not open as a 3GP. It may be damaged, or not a 3GP at all.');
  }
  const vs = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_VIDEO);
  const as = job.mute ? undefined : streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_AUDIO);
  if (!vs) throw new UnreadableFile('This 3GP has no picture. For the sound of a 3GP, use Video to MP3.');

  const codecName = async (s: any): Promise<string> => String(await libav.avcodec_get_name(s.codec_id));
  const videoName = await codecName(vs);
  const soundName = as ? await codecName(as) : '';
  const copyVideo = videoName === 'h264';
  if (!copyVideo && videoName !== 'mpeg4' && videoName !== 'h263') throw new UnsupportedThreeGpCodec(videoName, 'video');
  if (as && !['aac', 'amr_nb', 'amr_wb'].includes(soundName)) throw new UnsupportedThreeGpCodec(soundName, 'sound');

  const extradata = async (s: any): Promise<Uint8Array> => {
    const size: number = await libav.AVCodecParameters_extradata_size(s.codecpar);
    const ptr: number = size > 0 ? await libav.AVCodecParameters_extradata(s.codecpar) : 0;
    return ptr ? new Uint8Array(await libav.copyout_u8(ptr, size)) : new Uint8Array(0);
  };
  const initDecoder = async (s: any, kind: 'video' | 'sound', codec: string) => {
    try {
      const [, c, pkt, frame] = await libav.ff_init_decoder(s.codec_id, { codecpar: s.codecpar, time_base: [s.time_base_num, s.time_base_den] });
      return { c, pkt, frame };
    } catch {
      throw new UnsupportedThreeGpCodec(codec, kind);
    }
  };

  const width: number = await libav.AVCodecParameters_width(vs.codecpar);
  const height: number = await libav.AVCodecParameters_height(vs.codecpar);
  if (!width || !height) throw new UnsupportedThreeGpCodec('none', 'video');
  const rotation = await readRotation(job.file);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  let videoSource: VideoSampleSource | EncodedVideoPacketSource;
  let videoCodec = 'avc';
  let vdec: { c: number; pkt: number; frame: number } | undefined;
  let avcC = new Uint8Array(0);
  let avc: ReturnType<typeof readAvcConfig> = null;
  if (copyVideo) {
    avcC = await extradata(vs);
    avc = readAvcConfig(avcC);
    if (!avc) throw new UnreadableFile('This 3GP’s H.264 picture could not be read. The file may be damaged or cut short.');
    videoSource = new EncodedVideoPacketSource('avc');
  } else {
    vdec = await initDecoder(vs, 'video', videoName);
    if (typeof VideoEncoder === 'undefined') throw new EncoderUnavailable();
    const picked = await pickVideoCodec({ width: width & ~1 || 2, height: height & ~1 || 2, bitrate: QUALITY_HIGH });
    if (!picked) throw new EncoderRefused();
    videoCodec = picked;
    videoSource = new VideoSampleSource({ codec: picked, bitrate: QUALITY_HIGH });
  }
  output.addVideoTrack(videoSource, { rotation });

  // Sound: AAC is copied. AMR is decoded and written as AAC (or as MP3 by the LAME fallback when AAC is not offered).
  let audioSource: AudioSampleSource | EncodedAudioPacketSource | undefined;
  let audioCopied = false;
  let adec: { c: number; pkt: number; frame: number } | undefined;
  let resampler: Resampler | undefined;
  let audioRate = 0;
  let audioConfig: { codec: string; sampleRate: number; numberOfChannels: number; description?: Uint8Array } | undefined;
  if (as) {
    if (soundName === 'aac') {
      const asc = await extradata(as);
      const parsed = readAsc(asc);
      if (!parsed) throw new UnreadableFile('This 3GP’s AAC sound could not be read. The file may be damaged or cut short.');
      audioRate = (await libav.AVCodecParameters_sample_rate(as.codecpar)) || parsed.rate;
      const channels: number = (await libav.AVCodecParameters_ch_layout_nb_channels(as.codecpar)) || parsed.channels || 2;
      audioSource = new EncodedAudioPacketSource('aac');
      audioCopied = true;
      audioConfig = { codec: `mp4a.40.${parsed.objectType}`, sampleRate: audioRate, numberOfChannels: channels, description: asc };
    } else {
      adec = await initDecoder(as, 'sound', soundName);
      const srcRate: number = (await libav.AVCodecParameters_sample_rate(as.codecpar)) || (soundName === 'amr_wb' ? 16000 : 8000);
      const channels = 1; // AMR is mono; a stereo AMR file is rare enough to take its first channel's rate and decode as it comes.
      const hasAac = job.audioEncoder && typeof AudioEncoder !== 'undefined' && (await getFirstEncodableAudioCodec(['aac'], { numberOfChannels: channels, sampleRate: 48000, bitrate: QUALITY_HIGH })) === 'aac';
      registerMp3Fallback();
      audioRate = 48000;
      const codec: AudioCodec | null = await getFirstEncodableAudioCodec(hasAac ? ['aac', 'mp3'] : ['mp3'], { numberOfChannels: channels, sampleRate: audioRate, bitrate: QUALITY_HIGH });
      if (codec) {
        audioSource = new AudioSampleSource({ codec, bitrate: QUALITY_HIGH });
        resampler = new Resampler(srcRate, audioRate, channels);
      }
    }
    if (audioSource) output.addAudioTrack(audioSource);
  }
  await output.start();

  const tb = (s: any) => s.time_base_num / s.time_base_den;
  const stamp = (lo: number | undefined, hi: number | undefined): number | null => (lo === undefined || hi === undefined || (hi === NOPTS_HI && lo === 0) ? null : libav.i64tof64(lo, hi));
  const duration = Math.max(0, Number(vs.duration) || 0, as ? Number(as.duration) || 0 : 0);

  // One zero for both tracks: the earliest decode or presentation time of the first picture packet.
  let base: number | null = null;
  let frames = 0;
  let endTime = 0;
  const noteBase = (list: any[]) => {
    for (const p of list) {
      const t = stamp(p.dts, p.dtshi) ?? stamp(p.pts, p.ptshi);
      if (t === null) continue;
      const pt = stamp(p.pts, p.ptshi) ?? t;
      base ??= Math.min(t, pt) * tb(vs);
      break;
    }
  };

  // Picture, copied (H.264): packets in decode order, each one's length from the next one's decode time.
  let videoConfigSent = false;
  let pendingV: { data: Uint8Array; key: boolean; pts: number; dts: number } | null = null;
  let lastVDur = 0;
  const sendV = async (p: NonNullable<typeof pendingV>, dur: number) => {
    const meta = videoConfigSent ? undefined : { decoderConfig: { codec: avc!.codec, codedWidth: avc!.width, codedHeight: avc!.height, description: avcC } };
    videoConfigSent = true;
    await (videoSource as EncodedVideoPacketSource).add(new EncodedPacket(p.data, p.key ? 'key' : 'delta', Math.max(0, p.pts - base!), dur), meta);
    frames++;
    endTime = Math.max(endTime, p.pts - base! + dur);
    progress(duration > 0 ? Math.min(0.99, (p.pts - base!) / duration) : 0.5);
  };
  const copyVideoPackets = async (list: any[]) => {
    for (const p of list) {
      if (!p.data?.length) continue;
      const dts = stamp(p.dts, p.dtshi);
      const pts = stamp(p.pts, p.ptshi) ?? dts;
      if (pts === null) continue;
      const t = tb(vs);
      const cur = { data: p.data as Uint8Array, key: ((p.flags ?? 0) & AV_PKT_FLAG_KEY) !== 0, pts: pts * t, dts: (dts ?? pts) * t };
      if (pendingV) {
        const dur = cur.dts - pendingV.dts;
        lastVDur = dur > 0 && dur < 5 ? dur : lastVDur || 1 / 15;
        await sendV(pendingV, lastVDur);
      }
      pendingV = cur;
    }
  };

  // Picture, decoded (H.263, MPEG-4): the frame's own best-effort stamp, strictly increasing, and its length from the gap before it.
  let lastV = -1;
  let gap = 1 / 15;
  const addDecoded = async (list: any[]) => {
    for (const f of list) {
      const px = PIXEL_FORMATS[f.format];
      if (!px) throw new UnsupportedThreeGpCodec('none', 'video');
      const s = f.best_effort_timestamphi !== undefined && f.best_effort_timestamphi !== NOPTS_HI && f.best_effort_timestamp !== undefined ? f.best_effort_timestamp : f.ptshi !== NOPTS_HI ? f.pts : null;
      let t = s === null ? null : s * tb(vs) - (base ?? 0);
      if (t !== null && t < 0) t = 0;
      if (t === null || t <= lastV) t = lastV < 0 ? 0 : lastV + gap;
      if (lastV >= 0 && t - lastV < 1) gap = t - lastV;
      lastV = t;
      const w: number = f.width ?? width;
      const h: number = f.height ?? height;
      // Old video is BT.601 below HD and BT.709 above it (the usual rule).
      const picture = toLimitedBt709(f.data as Uint8Array, w, h, { cw: px.cw, ch: px.ch, fullRange: px.full, matrix: px.full || h < 720 ? 'bt601' : 'bt709' }, w & ~1 || 2, h & ~1 || 2);
      const sample = new VideoSample(picture, {
        format: px.format,
        codedWidth: w & ~1 || 2,
        codedHeight: h & ~1 || 2,
        timestamp: t,
        duration: gap,
        colorSpace: { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false },
      });
      await (videoSource as VideoSampleSource).add(sample);
      sample.close();
      frames++;
      endTime = Math.max(endTime, t + gap);
      progress(duration > 0 ? Math.min(0.99, t / duration) : 0.5);
    }
  };

  // Sound: times come from counting samples after the first packet's offset from the picture's zero.
  let audioFirst: number | null = null;
  let audioSamples = 0;
  let audioConfigSent = false;
  const startOffset = () => Math.max(0, (audioFirst ?? 0) - (base ?? 0));
  const addAacPacket = async (p: any) => {
    if (!p.data?.length) return;
    const start = startOffset() + audioSamples / audioRate;
    audioSamples += 1024;
    const meta = audioConfigSent ? undefined : { decoderConfig: audioConfig! };
    audioConfigSent = true;
    await (audioSource as EncodedAudioPacketSource).add(new EncodedPacket(p.data, 'key', start, 1024 / audioRate), meta);
  };
  const pushPlanes = async (planes: Float32Array[]) => {
    const n = planes[0]!.length;
    if (!n || !audioSource) return;
    const data = new Float32Array(n * planes.length);
    planes.forEach((p, c) => data.set(p, c * n));
    const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: planes.length, sampleRate: audioRate, timestamp: startOffset() + audioSamples / audioRate });
    audioSamples += n;
    await (audioSource as AudioSampleSource).add(sample);
    sample.close();
  };
  const addSound = async (list: LibavAudioFrame[]) => {
    for (const f of list) {
      let planes = toFloatPlanes(f);
      if (planes.length > 1) planes = [planes[0]!];
      if (resampler) planes = resampler.push(planes);
      await pushPlanes(planes);
    }
  };

  const packetPtr = await libav.av_packet_alloc();
  let failures = 0;
  for (;;) {
    const [res, packets] = await libav.ff_read_frame_multi(fmt, packetPtr, { limit: READ_LIMIT });
    const vp: any[] | undefined = packets[vs.index];
    if (vp?.length) {
      noteBase(vp);
      if (copyVideo) await copyVideoPackets(vp);
      else await addDecoded(await libav.ff_decode_multi(vdec!.c, vdec!.pkt, vdec!.frame, vp, { ignoreErrors: true, copyoutFrame: 'video_packed' }));
    }
    const ap: any[] | undefined = as ? packets[as.index] : undefined;
    if (ap?.length && audioSource) {
      if (audioFirst === null) {
        const first = stamp(ap[0].pts, ap[0].ptshi) ?? stamp(ap[0].dts, ap[0].dtshi);
        audioFirst = first !== null ? first * tb(as) : 0;
        base ??= audioFirst;
      }
      if (audioCopied) for (const p of ap) await addAacPacket(p);
      else if (adec) await addSound(await libav.ff_decode_multi(adec.c, adec.pkt, adec.frame, ap, { ignoreErrors: true }));
    }
    if (res === libav.AVERROR_EOF) break;
    if (res < 0 && res !== -libav.EAGAIN && ++failures > 5) break;
  }
  if (copyVideo) {
    if (pendingV) await sendV(pendingV, lastVDur || 1 / 15);
  } else {
    await addDecoded(await libav.ff_decode_multi(vdec!.c, vdec!.pkt, vdec!.frame, [], { fin: true, ignoreErrors: true, copyoutFrame: 'video_packed' }));
  }
  if (adec && audioSource && !audioCopied) {
    await addSound(await libav.ff_decode_multi(adec.c, adec.pkt, adec.frame, [], { fin: true, ignoreErrors: true }));
    if (resampler) await pushPlanes(resampler.finish());
  }
  if (frames === 0) throw new UnreadableFile('No pictures could be read from this 3GP. The file may be damaged or cut short.');
  await output.finalize();
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('The video could not be written.');
  post(
    { type: 'done', buffer, width: copyVideo ? avc!.width : width, height: copyVideo ? avc!.height : height, duration: Math.max(endTime, 0), videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec, videoCopied: copyVideo, audio: !!audioSource, audioCopied },
    [buffer],
  );
}

self.onmessage = (e: MessageEvent<ThreeGpJob>) => {
  convert(e.data).catch((err) => {
    const f = workerFailure(err);
    post({ type: 'error', name: f.name, message: f.message });
  });
};
