/**
 * Convert a video to MP4 in the browser. Mediabunny (MPL-2.0) reads MOV, MKV,
 * WebM or MP4 and writes an MP4. Tracks that MP4 players everywhere already
 * play (H.264 video, AAC or MP3 sound) are copied as they are: instant and
 * with no quality loss. Anything else is re-encoded by the browser's own
 * WebCodecs encoder, H.264 and AAC where available, VP9 and Opus otherwise.
 * Nothing leaves the tab.
 */
import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  QUALITY_HIGH,
  WEBM,
  getFirstEncodableAudioCodec,
  type AudioCodec,
} from 'mediabunny';
import { pickVideoCodec } from './video-codec';
import { CODEC_NAMES, unplayable } from './video-compress';

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

export async function convertToMp4(file: File, opts: ConvertOptions): Promise<ConvertResult> {
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
    const best = await pickVideoCodec({ width: evenW, height: evenH, bitrate: QUALITY_HIGH });
    let copyVideo = !!sourceVideo && (PLAYS_EVERYWHERE_VIDEO.includes(sourceVideo) || sourceVideo === best);
    if (!copyVideo && !(await video.canDecode())) {
      // iPhone HEVC in a browser that cannot decode it: MP4 can hold HEVC as it is,
      // which plays on Apple devices, Android and recent Windows.
      if (sourceVideo === 'hevc') copyVideo = true;
      else throw new Error(unplayable());
    }
    if (!copyVideo && !best) throw new Error('This browser cannot encode video. Use a recent version of Chrome, Edge, Safari or Firefox.');
    const videoCodec = copyVideo ? sourceVideo! : best!;
    const duration = await input.computeDuration();

    const sound = opts.mute ? null : await input.getPrimaryAudioTrack();
    let audioCodec: AudioCodec | null = null;
    if (sound) {
      const src = sound.codec;
      if (src && PLAYS_EVERYWHERE_AUDIO.includes(src)) audioCodec = src;
      else if (await sound.canDecode()) {
        audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: Math.min(2, sound.numberOfChannels), sampleRate: 48_000, bitrate: QUALITY_HIGH });
      }
    }

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: copyVideo
        ? {}
        : { codec: videoCodec, bitrate: QUALITY_HIGH, width: evenW, height: evenH, fit: 'contain', allowTransformationMetadata: false },
      audio: audioCodec ? { codec: audioCodec, bitrate: QUALITY_HIGH } : { discard: true },
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw new Error(reason === 'undecodable_source_codec' ? unplayable() : 'This browser cannot convert this video.');
    }
    conversion.onProgress = (p) => opts.onProgress?.(p);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      width,
      height,
      duration,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      videoCopied: copyVideo,
      audio: !!audioCodec,
      audioDropped: !!sound && !audioCodec,
    };
  } finally {
    input.dispose?.();
  }
}
