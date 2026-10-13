/**
 * Converts one FLV to an MP4 in a background worker. FLV is a container no browser opens, so the
 * file is read by a build of FFmpeg's libavformat (libav.js, LGPL) that holds the FLV demuxer and an
 * MP3 decoder and nothing else, fetched from this site's /vendor/ only when this runs.
 * H.264 pictures and AAC sound are copied packet by packet into the MP4, untouched. MP3 sound is
 * decoded here and written as AAC through WebCodecs (or copied when this browser has no AAC encoder).
 * VP6, Sorenson Spark and other codecs have no decoder in the build and are refused by name. The file
 * is read in slices from disk and never leaves the tab.
 */
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  type AudioCodec,
} from 'mediabunny';
import { registerMp3Fallback } from './mp3-fallback';
import { Resampler } from './audio-resample';
import { toFloatPlanes, type LibavAudioFrame } from './libav-audio';
import { readAvcConfig } from './h264-sps';
import { FlvDecoderLoadError, UnsupportedFlvCodec } from './flv-errors';
import { workerFailure } from './worker-error';

export interface FlvJob {
  file: File;
  mute: boolean;
  /** URL of the libav.js loader module (under /vendor/). */
  entry: string;
  /** Whether the page has an AudioEncoder (iOS 18 and earlier have none). The page says so, so it can be tested. */
  audioEncoder: boolean;
}

export type FlvMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; buffer: ArrayBuffer; width: number; height: number; duration: number; audio: boolean; audioCopied: boolean }
  | { type: 'error'; name: string; message: string };

const NOPTS_HI = -2147483648;
const AV_PKT_FLAG_KEY = 1;
/** How much packet data to ask for per read. */
const READ_LIMIT = 256 * 1024;
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

// The libav.js API is large and untyped here; the calls used are the ones in avi-decode.worker.ts plus a few that read stream parameters.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Libav = any;

const post = (m: FlvMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function loadLibav(entry: string): Promise<Libav> {
  try {
    const mod = await import(/* @vite-ignore */ entry);
    const base = entry.slice(0, entry.lastIndexOf('/'));
    return await mod.default.LibAV({ noworker: true, base });
  } catch (cause) {
    throw new FlvDecoderLoadError(cause);
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

async function convert(job: FlvJob): Promise<void> {
  const libav = await loadLibav(job.entry);
  // The reader is in: this is what the page's stall watchdog waits for before it starts timing the work itself.
  progress(0, true);
  const name = 'input.flv';
  await libav.mkreadaheadfile(name, job.file);
  let fmt: number;
  let streams: any[];
  try {
    [fmt, streams] = await libav.ff_init_demuxer_file(name);
  } catch {
    const { UnreadableFile } = await import('./input-error');
    throw new UnreadableFile('This file does not open as an FLV. It may be damaged, or not an FLV at all.');
  }
  const vs = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_VIDEO);
  const as = job.mute ? undefined : streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_AUDIO);
  if (!vs) {
    const { UnreadableFile } = await import('./input-error');
    throw new UnreadableFile('This FLV has no picture. For the sound of an FLV, use Video to MP3.');
  }
  // Only H.264 pictures and AAC or MP3 sound are carried. The codec's name is known without a decoder.
  const codecName = async (s: any): Promise<string> => String(await libav.avcodec_get_name(s.codec_id));
  const videoName = await codecName(vs);
  if (videoName !== 'h264') throw new UnsupportedFlvCodec(videoName, 'video');
  const soundName = as ? await codecName(as) : '';
  if (as && soundName !== 'aac' && soundName !== 'mp3') throw new UnsupportedFlvCodec(soundName, 'sound');

  const extradata = async (s: any): Promise<Uint8Array> => {
    const size: number = await libav.AVCodecParameters_extradata_size(s.codecpar);
    const ptr: number = size > 0 ? await libav.AVCodecParameters_extradata(s.codecpar) : 0;
    return ptr ? new Uint8Array(await libav.copyout_u8(ptr, size)) : new Uint8Array(0);
  };
  const avcC = await extradata(vs);
  const avc = readAvcConfig(avcC);
  const { UnreadableFile } = await import('./input-error');
  if (!avc) throw new UnreadableFile('This FLV’s H.264 picture could not be read. The file may be damaged or cut short.');

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource);

  // Sound. AAC is copied. MP3 is decoded and written as AAC (or as MP3 by the LAME fallback when AAC is not offered),
  // and copied when this browser has no AAC encoder at all (iOS 18 and earlier).
  let audioSource: AudioSampleSource | EncodedAudioPacketSource | undefined;
  let audioCopied = false;
  let adec: { c: number; pkt: number; frame: number } | undefined;
  let resampler: Resampler | undefined;
  let audioRate = 0;
  let audioChannels = 1;
  let audioConfig: { codec: string; sampleRate: number; numberOfChannels: number; description?: Uint8Array } | undefined;
  if (as) {
    const asc = soundName === 'aac' ? await extradata(as) : new Uint8Array(0);
    const parsed = readAsc(asc);
    const srcRate: number = (await libav.AVCodecParameters_sample_rate(as.codecpar)) || parsed?.rate || 44100;
    const srcChannels: number = (await libav.AVCodecParameters_ch_layout_nb_channels(as.codecpar)) || (await libav.AVCodecParameters_channels(as.codecpar)) || parsed?.channels || 2;
    if (soundName === 'aac') {
      if (!parsed) throw new UnreadableFile('This FLV’s AAC sound could not be read. The file may be damaged or cut short.');
      audioSource = new EncodedAudioPacketSource('aac');
      audioCopied = true;
      audioRate = srcRate;
      audioChannels = srcChannels;
      audioConfig = { codec: `mp4a.40.${parsed.objectType}`, sampleRate: srcRate, numberOfChannels: srcChannels, description: asc };
    } else {
      const [, c, pkt, frame] = await libav.ff_init_decoder(as.codec_id, { codecpar: as.codecpar, time_base: [as.time_base_num, as.time_base_den] }).catch(() => {
        throw new UnsupportedFlvCodec('mp3', 'sound');
      });
      adec = { c, pkt, frame };
      audioChannels = Math.min(2, srcChannels);
      const hasAac = job.audioEncoder && typeof AudioEncoder !== 'undefined' && (await getFirstEncodableAudioCodec(['aac'], { numberOfChannels: audioChannels, sampleRate: srcRate === 44100 ? 44100 : 48000, bitrate: QUALITY_HIGH })) === 'aac';
      if (!hasAac && srcRate >= 32000 && srcChannels <= 2) {
        audioSource = new EncodedAudioPacketSource('mp3');
        audioCopied = true;
        audioRate = srcRate;
        audioConfig = { codec: 'mp3', sampleRate: srcRate, numberOfChannels: srcChannels };
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
    }
    if (audioSource) output.addAudioTrack(audioSource);
  }
  await output.start();

  const tb = (s: any) => s.time_base_num / s.time_base_den;
  const stamp = (lo: number | undefined, hi: number | undefined): number | null => (lo === undefined || hi === undefined || (hi === NOPTS_HI && lo === 0) ? null : libav.i64tof64(lo, hi));
  const duration = Math.max(0, Number(vs.duration) || 0, as ? Number(as.duration) || 0 : 0);

  // Picture: packets go in decode order with their presentation time; the next packet's decode time gives each one's length.
  // Times are shifted so the earliest decode time is zero.
  let base: number | null = null;
  let frames = 0;
  let videoConfigSent = false;
  let pendingV: { data: Uint8Array; key: boolean; pts: number; dts: number } | null = null;
  let lastVDur = 0;
  let endTime = 0;
  const sendV = async (p: NonNullable<typeof pendingV>, dur: number) => {
    const meta = videoConfigSent ? undefined : { decoderConfig: { codec: avc.codec, codedWidth: avc.width, codedHeight: avc.height, description: avcC } };
    videoConfigSent = true;
    await videoSource.add(new EncodedPacket(p.data, p.key ? 'key' : 'delta', Math.max(0, p.pts - base!), dur), meta);
    frames++;
    endTime = Math.max(endTime, p.pts - base! + dur);
    progress(duration > 0 ? Math.min(0.99, (p.pts - base!) / duration) : 0.5);
  };
  const addVideo = async (list: any[]) => {
    for (const p of list) {
      if (!p.data?.length) continue;
      const dts = stamp(p.dts, p.dtshi);
      const pts = stamp(p.pts, p.ptshi) ?? dts;
      if (pts === null) continue;
      const t = tb(vs);
      const cur = { data: p.data as Uint8Array, key: ((p.flags ?? 0) & AV_PKT_FLAG_KEY) !== 0, pts: pts * t, dts: (dts ?? pts) * t };
      base ??= Math.min(cur.dts, cur.pts);
      if (pendingV) {
        const dur = cur.dts - pendingV.dts;
        lastVDur = dur > 0 && dur < 5 ? dur : lastVDur || 1 / 30;
        await sendV(pendingV, lastVDur);
      }
      pendingV = cur;
    }
  };

  // Sound: timestamps come from counting samples after the first packet, so a millisecond-rounded FLV clock adds no jitter.
  let audioFirst: number | null = null;
  let audioSamples = 0;
  let audioConfigSent = false;
  const perPacket = audioRate >= 32000 ? 1152 : 576;
  const aacFrame = 1024;
  const decodedStart = () => Math.max(0, (audioFirst ?? 0) - (base ?? 0));
  const addAudioPacket = async (p: any) => {
    if (!p.data?.length) return;
    const samples = soundName === 'aac' ? aacFrame : perPacket;
    const start = decodedStart() + audioSamples / audioRate;
    audioSamples += samples;
    const meta = audioConfigSent ? undefined : { decoderConfig: audioConfig! };
    audioConfigSent = true;
    await (audioSource as EncodedAudioPacketSource).add(new EncodedPacket(p.data, 'key', start, samples / audioRate), meta);
  };
  const addSound = async (list: LibavAudioFrame[]) => {
    for (const f of list) {
      let planes = toFloatPlanes(f);
      if (resampler) planes = resampler.push(planes);
      const n = planes[0]!.length;
      if (!n || !audioSource) continue;
      const data = new Float32Array(n * planes.length);
      planes.forEach((p, c) => data.set(p, c * n));
      const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: planes.length, sampleRate: audioRate, timestamp: decodedStart() + audioSamples / audioRate });
      audioSamples += n;
      await (audioSource as AudioSampleSource).add(sample);
      sample.close();
    }
  };

  const packetPtr = await libav.av_packet_alloc();
  let failures = 0;
  for (;;) {
    const [res, packets] = await libav.ff_read_frame_multi(fmt, packetPtr, { limit: READ_LIMIT });
    const vp: any[] | undefined = packets[vs.index];
    if (vp?.length) await addVideo(vp);
    const ap: any[] | undefined = as ? packets[as.index] : undefined;
    if (ap?.length && audioSource) {
      if (audioFirst === null) {
        const first = stamp(ap[0].pts, ap[0].ptshi) ?? stamp(ap[0].dts, ap[0].dtshi);
        audioFirst = first !== null ? first * tb(as) : 0;
        base ??= audioFirst;
      }
      if (audioCopied) {
        for (const p of ap) await addAudioPacket(p);
      } else if (adec) {
        await addSound(await libav.ff_decode_multi(adec.c, adec.pkt, adec.frame, ap, { ignoreErrors: true }));
      }
    }
    if (res === libav.AVERROR_EOF) break;
    if (res < 0 && res !== -libav.EAGAIN && ++failures > 5) break;
  }
  if (pendingV) await sendV(pendingV, lastVDur || 1 / 30);
  if (adec && audioSource && !audioCopied) {
    await addSound(await libav.ff_decode_multi(adec.c, adec.pkt, adec.frame, [], { fin: true, ignoreErrors: true }));
    if (resampler) {
      const tail = resampler.finish();
      if (tail[0]!.length) {
        const n = tail[0]!.length;
        const data = new Float32Array(n * tail.length);
        tail.forEach((p, c) => data.set(p, c * n));
        const sample = new AudioSample({ data, format: 'f32-planar', numberOfChannels: tail.length, sampleRate: audioRate, timestamp: decodedStart() + audioSamples / audioRate });
        await (audioSource as AudioSampleSource).add(sample);
        sample.close();
      }
    }
  }
  if (frames === 0) throw new UnreadableFile('No pictures could be read from this FLV. The file may be damaged or cut short.');
  await output.finalize();
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('The video could not be written.');
  post({ type: 'done', buffer, width: avc.width, height: avc.height, duration: Math.max(endTime, 0), audio: !!audioSource, audioCopied }, [buffer]);
}

self.onmessage = (e: MessageEvent<FlvJob>) => {
  convert(e.data).catch((err) => {
    const f = workerFailure(err);
    post({ type: 'error', name: f.name, message: f.message });
  });
};
