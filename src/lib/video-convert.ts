/**
 * Convert a video to MP4 (or, for Video to MOV, a QuickTime MOV) in the browser. Mediabunny (MPL-2.0) reads MOV, MKV,
 * WebM or MP4 and writes an MP4. Tracks that MP4 players everywhere already
 * play (H.264 video, AAC or MP3 sound) are copied as they are: instant and
 * with no quality loss. Anything else is re-encoded by the browser's own
 * WebCodecs encoder, H.264 and AAC where available, VP9 and Opus otherwise.
 * A MOV is for QuickTime, so it only ever holds H.264 (or HEVC copied as it
 * is) and AAC: where the browser cannot write those, the conversion is refused
 * rather than falling back to VP9, AV1 or Opus. Nothing leaves the tab.
 */
import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QTFF,
  QUALITY_HIGH,
  WEBM,
  AudioSampleSource,
  getFirstEncodableAudioCodec,
  type AudioCodec,
} from 'mediabunny';
import { executeWatched } from './encoder-watchdog';
import { aacSafeSampleRate, pickVideoCodec } from './video-codec';
import { H264Unavailable } from './encoder-probe';
import { CODEC_NAMES, unplayable } from './video-compress';
import { UnsupportedCodec } from './input-error';
import { firstEncodableSound } from './mp3-fallback';
import { SAMPLE_RATE, decodePcm, pcmFeeder } from './pcm';

export interface ConvertOptions {
  mute: boolean;
  onProgress?: (fraction: number) => void;
}

export interface ConvertResult {
  blob: Blob;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  videoCodec: string;
  /** True when the picture was copied without re-encoding. */
  videoCopied: boolean;
  audio: boolean;
  audioDropped: boolean;
}

/** Codecs that play in every MP4 player worth mentioning, so they are copied rather than re-encoded. */
const PLAYS_EVERYWHERE_VIDEO: string[] = ['avc'];
const PLAYS_EVERYWHERE_AUDIO: AudioCodec[] = ['aac', 'mp3'];

export type ConvertFormat = 'mp4' | 'mov';

export async function convertToMp4(file: File, opts: ConvertOptions): Promise<ConvertResult> {
  // AVI has no browser reader or decoder: it goes to the worker with the separately loaded decoder module.
  const { isAvi, convertAvi } = await import('./avi-convert');
  if (await isAvi(file)) return convertAvi(file, opts);
  // So has FLV: a separate reader module, loaded only for an FLV.
  const { isFlv, convertFlv } = await import('./flv-convert');
  if (await isFlv(file)) return convertFlv(file, opts);
  // 3GP is MP4's phone cousin: its H.263, MPEG-4 and AMR have no WebCodecs decoder, so it has its own reader module.
  const { isThreeGp, convertThreeGp } = await import('./threegp-convert');
  return (await isThreeGp(file)) ? convertThreeGp(file, opts) : convertVideo(file, opts, 'mp4');
}
export const convertToMov = (file: File, opts: ConvertOptions) => convertVideo(file, opts, 'mov');

async function convertVideo(file: File, opts: ConvertOptions, container: ConvertFormat): Promise<ConvertResult> {
  const mov = container === 'mov';
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error('This file has no video this page can read. It may be an audio file (try Video to MP3) or a format browsers do not open.');
    const sourceVideo = video.codec;
    const width = video.displayWidth;
    const height = video.displayHeight;
    const evenW = width + (width % 2);
    const evenH = height + (height % 2);
    // The best codec this browser can write; re-encoding into the codec the file already has gains nothing.
    // A silent H.264 encoder only matters if the picture really is re-encoded; copying needs no encoder.
    let silent: H264Unavailable | undefined;
    const best = await pickVideoCodec({ width: evenW, height: evenH, bitrate: QUALITY_HIGH }, mov ? ['avc'] : undefined).catch((e) => {
      if (e instanceof H264Unavailable) silent = e;
      else throw e;
      return null;
    });
    let copyVideo = !!sourceVideo && (PLAYS_EVERYWHERE_VIDEO.includes(sourceVideo) || sourceVideo === best);
    if (!copyVideo && !(await video.canDecode())) {
      // iPhone HEVC in a browser that cannot decode it: MP4 can hold HEVC as it is,
      // which plays on Apple devices, Android and recent Windows.
      if (sourceVideo === 'hevc') copyVideo = true;
      else throw new UnsupportedCodec(unplayable());
    }
    if (!copyVideo && silent) throw silent;
    if (!copyVideo && !best && mov) throw new Error('This browser cannot write H.264 video, which a MOV needs to play in QuickTime. Use a recent Safari, Chrome or Edge.');
    if (!copyVideo && !best) throw new Error('This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');
    const videoCodec = copyVideo ? sourceVideo! : best!;
    const duration = await input.computeDuration();

    // MP3 is re-encoded for a MOV: QuickTime's own sound codec is AAC.
    const audioCopy = mov ? ['aac'] : PLAYS_EVERYWHERE_AUDIO;
    const sound = opts.mute ? null : await input.getPrimaryAudioTrack();
    let audioCodec: AudioCodec | null = null;
    if (sound) {
      const src = sound.codec;
      if (src && audioCopy.includes(src)) audioCodec = src;
      else if (await sound.canDecode()) {
        // A MOV is AAC only; an MP4 may hold MP3 from the WebAssembly encoder when the browser has no AAC or Opus.
        const config = { numberOfChannels: Math.min(2, sound.numberOfChannels), sampleRate: 48_000, bitrate: QUALITY_HIGH };
        audioCodec = mov ? await getFirstEncodableAudioCodec(['aac'], config) : await firstEncodableSound(['aac', 'opus'], config);
      }
    }

    // iOS 18 and earlier can neither decode nor encode sound with WebCodecs, so Mediabunny cannot re-encode it.
    // The page's own audio decoder reads it instead, and the MP3 encoder writes it as a second track.
    let pcm: Float32Array[] | null = null;
    if (!mov && sound && !audioCodec && !(await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: 48_000, bitrate: QUALITY_HIGH }))) {
      pcm = await decodePcm(file);
      if (pcm && !(await firstEncodableSound([], { numberOfChannels: pcm.length, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH }))) pcm = null;
    }

    if (mov && sound && !audioCodec) {
      throw new Error('This browser cannot convert this file’s sound to AAC, which a MOV needs to play in QuickTime. Tick Remove the sound to convert the picture alone, or use a recent Safari, Chrome or Edge.');
    }

    const output = new Output({ format: mov ? new MovOutputFormat({ fastStart: 'in-memory' }) : new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      // With a sound track of our own on the output, the output is started and finished here.
      composable: !!pcm,
      video: copyVideo
        ? {}
        : { codec: videoCodec, bitrate: QUALITY_HIGH, width: evenW, height: evenH, fit: 'contain', allowTransformationMetadata: false },
      // Sound copied as it is must not be given a bitrate: any encoder option makes Mediabunny decode and
      // re-encode it, and a browser that cannot decode AAC (Chromium on Linux) then drops the track.
      audio: audioCodec
        ? sound!.codec === audioCodec
          ? {}
          : { codec: audioCodec, bitrate: QUALITY_HIGH, sampleRate: audioCodec === 'mp3' ? SAMPLE_RATE : await aacSafeSampleRate(sound) }
        : { discard: true },
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw reason === 'undecodable_source_codec' ? new UnsupportedCodec(unplayable()) : new Error('This browser cannot convert this video.');
    }
    // The sound track can still be discarded when this browser cannot decode it.
    const soundLost = !!audioCodec && conversion.discardedTracks.some((d) => d.track.isAudioTrack());
    if (soundLost && mov) {
      throw new Error('This browser cannot read this file’s sound, which a MOV needs to play in QuickTime. Tick Remove the sound to convert the picture alone, or use a recent Safari, Chrome or Edge.');
    }
    let feeding: Promise<void> | null = null;
    if (pcm) {
      const source = new AudioSampleSource({ codec: 'mp3', bitrate: QUALITY_HIGH });
      output.addAudioTrack(source);
      await output.start();
      feeding = pcmFeeder(source, pcm)
        .until(Infinity)
        .then(() => source.close());
    }
    await Promise.all([executeWatched(conversion, opts.onProgress), feeding]);
    if (pcm) await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    return {
      blob: new Blob([buffer], { type: mov ? 'video/quicktime' : 'video/mp4' }),
      width,
      height,
      duration,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      videoCopied: copyVideo,
      audio: (!!audioCodec && !soundLost) || !!pcm,
      audioDropped: !!sound && !pcm && (!audioCodec || soundLost),
    };
  } finally {
    input.dispose?.();
  }
}
