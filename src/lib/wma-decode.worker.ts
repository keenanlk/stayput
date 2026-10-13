/**
 * Decodes one WMA file to plain samples in a background worker. The ASF demuxer and the decoders
 * for Windows Media Audio versions 1 and 2 come from a build of FFmpeg's libraries (libav.js,
 * LGPL), fetched from this site's /vendor/ only when this runs. WMA Pro, WMA Lossless and WMA
 * Voice are not in the build on purpose; a file that uses one is refused by name. The file is read
 * in slices from disk and never leaves the tab.
 */
import { Resampler } from './audio-resample';
import { toFloatPlanes, type LibavSoundFrame } from './libav-audio';
import { UnsupportedWmaCodec, WmaDecoderLoadError } from './wma-errors';
import { workerFailure } from './worker-error';

export interface WmaJob {
  file: File;
  /** URL of the libav.js loader module (under /vendor/). */
  entry: string;
  /** The sample rate the samples are returned at. */
  rate: number;
}

export interface WmaTags {
  title?: string;
  artist?: string;
  album?: string;
}

export type WmaMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; channels: Float32Array[]; sampleRate: number; tags: WmaTags }
  | { type: 'error'; name: string; message: string };

/** How much packet data to ask for per read. */
const READ_LIMIT = 128 * 1024;

// The libav.js API is large and untyped here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Libav = any;

const post = (m: WmaMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function loadLibav(entry: string): Promise<Libav> {
  try {
    const mod = await import(/* @vite-ignore */ entry);
    const base = entry.slice(0, entry.lastIndexOf('/'));
    return await mod.default.LibAV({ noworker: true, base });
  } catch (cause) {
    throw new WmaDecoderLoadError(cause);
  }
}

let lastPost = -Infinity;
function progress(fraction: number, force = false) {
  const now = performance.now();
  if (!force && now - lastPost < 100) return;
  lastPost = now;
  post({ type: 'progress', fraction });
}

/** The file's title, artist and album from its ASF content description, when it has them. */
async function readTags(libav: Libav, fmt: number): Promise<WmaTags> {
  const tags: WmaTags = {};
  try {
    const dict = await libav.AVFormatContext_metadata(fmt);
    let entry = 0;
    while (dict && (entry = await libav.av_dict_iterate(dict, entry))) {
      const key = String(await libav.AVDictionaryEntry_key(entry)).toLowerCase();
      const value = String(await libav.AVDictionaryEntry_value(entry)).trim();
      if (!value) continue;
      if (key === 'title') tags.title ??= value;
      else if (key === 'artist' || key === 'author') tags.artist ??= value;
      else if (key === 'album') tags.album ??= value;
    }
  } catch {
    // Tags are a courtesy; the sound is what matters.
  }
  return tags;
}

async function decode(job: WmaJob): Promise<void> {
  const libav = await loadLibav(job.entry);
  // The decoder is in: this is what the page's stall watchdog waits for before it starts timing the work itself.
  progress(0, true);
  const name = 'input.wma';
  await libav.mkreadaheadfile(name, job.file);
  let fmt: number;
  let streams: any[];
  try {
    [fmt, streams] = await libav.ff_init_demuxer_file(name);
  } catch {
    const { UnreadableFile } = await import('./input-error');
    throw new UnreadableFile('This file does not open as a WMA. It may be damaged, or not a Windows Media Audio file at all.');
  }
  const as = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_AUDIO);
  if (!as) {
    const { UnreadableFile } = await import('./input-error');
    throw new UnreadableFile('This file has no sound track.');
  }
  // Refuse by name before trying a decoder: WMA Pro and the rest are not in the build.
  const codec = String(await libav.avcodec_get_name(as.codec_id));
  if (codec !== 'wmav1' && codec !== 'wmav2') throw new UnsupportedWmaCodec(codec);
  let dec: { c: number; pkt: number; frame: number };
  try {
    const [, c, pkt, frame] = await libav.ff_init_decoder(as.codec_id, { codecpar: as.codecpar, time_base: [as.time_base_num, as.time_base_den] });
    dec = { c, pkt, frame };
  } catch {
    throw new UnsupportedWmaCodec(codec);
  }
  const tags = await readTags(libav, fmt);
  const srcRate: number = (await libav.AVCodecParameters_sample_rate(as.codecpar)) || 44100;
  // The container's duration includes the ASF preroll, so it is only used to show progress: the
  // sound's own length is the number of samples that came out of the decoder.
  const seconds = Math.max(0, Number(as.duration) || 0);

  const chunks: Float32Array[][] = [];
  let resampler: Resampler | undefined;
  let total = 0;
  const push = (frames: LibavSoundFrame[]) => {
    for (const f of frames) {
      let planes = toFloatPlanes(f);
      if (srcRate !== job.rate) {
        resampler ??= new Resampler(srcRate, job.rate, planes.length);
        planes = resampler.push(planes);
      }
      if (!planes[0]!.length) continue;
      chunks.push(planes);
      total += planes[0]!.length;
    }
    progress(seconds > 0 ? Math.min(0.99, total / job.rate / seconds) : 0.5);
  };

  const packetPtr = await libav.av_packet_alloc();
  let failures = 0;
  for (;;) {
    const [res, packets] = await libav.ff_read_frame_multi(fmt, packetPtr, { limit: READ_LIMIT });
    const ap = packets[as.index];
    if (ap?.length) push(await libav.ff_decode_multi(dec.c, dec.pkt, dec.frame, ap, { ignoreErrors: true }));
    if (res === libav.AVERROR_EOF) break;
    if (res < 0 && res !== -libav.EAGAIN && ++failures > 5) break;
  }
  push(await libav.ff_decode_multi(dec.c, dec.pkt, dec.frame, [], { fin: true, ignoreErrors: true }));
  if (resampler) {
    const tail = (resampler as Resampler).finish();
    if (tail[0]!.length) {
      chunks.push(tail);
      total += tail[0]!.length;
    }
  }
  if (total === 0) {
    const { UnreadableFile } = await import('./input-error');
    throw new UnreadableFile('No sound could be read from this WMA. It may be damaged.');
  }
  const channelCount = chunks[0]!.length;
  const channels = Array.from({ length: channelCount }, () => new Float32Array(total));
  let at = 0;
  for (const c of chunks) {
    c.forEach((p, i) => channels[Math.min(i, channelCount - 1)]!.set(p, at));
    at += c[0]!.length;
  }
  post({ type: 'done', channels, sampleRate: job.rate, tags }, channels.map((c) => c.buffer));
}

self.onmessage = (e: MessageEvent<WmaJob>) => {
  decode(e.data).catch((err) => {
    const f = workerFailure(err);
    post({ type: 'error', name: f.name, message: f.message });
  });
};
