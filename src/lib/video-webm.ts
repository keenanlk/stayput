/**
 * Convert a video to WebM in the browser. Mediabunny (MPL-2.0) reads MP4, MOV,
 * MKV or WebM and writes a WebM. VP8, VP9 and AV1 picture and Opus or Vorbis
 * sound are copied as they are; anything else is re-encoded by the browser's
 * own WebCodecs encoders, VP9 where it can write it and VP8 otherwise, sound
 * as Opus. A browser with no VP8 or VP9 encoder (Safari on some versions) says
 * so and writes nothing. Nothing leaves the tab.
 */
import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Output,
  QTFF,
  QUALITY_HIGH,
  WEBM,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import { executeWatched } from './encoder-watchdog';
import { CODEC_NAMES, unplayable } from './video-compress';
import type { ConvertOptions, ConvertResult } from './video-convert';
import { UnreadableFile, NamedError } from './input-error';

const WEBM_VIDEO: string[] = ['vp8', 'vp9', 'av1'];
const WEBM_AUDIO: string[] = ['opus', 'vorbis'];

export async function convertToWebm(file: File, opts: ConvertOptions): Promise<ConvertResult> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new UnreadableFile('This file has no video this page can read. It may be an audio file (try Video to MP3) or a format browsers do not open.');
    const sourceVideo = video.codec;
    const width = video.displayWidth;
    const height = video.displayHeight;
    const evenW = width + (width % 2);
    const evenH = height + (height % 2);
    const duration = await input.computeDuration();

    let copyVideo = !!sourceVideo && WEBM_VIDEO.includes(sourceVideo);
    let best: VideoCodec | null = null;
    if (!copyVideo) {
      if (!(await video.canDecode())) throw new NamedError('VideoWebmFailed', unplayable());
      best = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width: evenW, height: evenH, bitrate: QUALITY_HIGH });
      if (!best) {
        throw new NamedError('VideoWebmFailed', 'This browser cannot write WebM video (it has no VP8 or VP9 encoder). Use a recent Chrome, Edge or Firefox on a computer.');
      }
    }
    const videoCodec = copyVideo ? sourceVideo! : best!;

    const sound = opts.mute ? null : await input.getPrimaryAudioTrack();
    let audioCodec: AudioCodec | null = null;
    if (sound) {
      if (sound.codec && WEBM_AUDIO.includes(sound.codec)) audioCodec = sound.codec;
      else if (await sound.canDecode()) {
        const config = { numberOfChannels: Math.min(2, sound.numberOfChannels), sampleRate: 48_000, bitrate: QUALITY_HIGH };
        audioCodec = await getFirstEncodableAudioCodec(['opus'], config);
      }
      if (!audioCodec) {
        throw new NamedError('VideoWebmFailed', 'This browser cannot convert this file’s sound to Opus, which a WebM needs. Tick Remove the sound to convert the picture alone, or use a recent Chrome, Edge or Firefox.');
      }
    }

    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: copyVideo
        ? {}
        : { codec: videoCodec, bitrate: QUALITY_HIGH, width: evenW, height: evenH, fit: 'contain', allowTransformationMetadata: false },
      audio: audioCodec ? (sound!.codec === audioCodec ? {} : { codec: audioCodec, bitrate: QUALITY_HIGH }) : { discard: true },
    });
    if (!conversion.isValid) {
      const reason = conversion.discardedTracks.find((d) => d.track.isVideoTrack())?.reason;
      throw new NamedError('VideoWebmFailed', reason === 'undecodable_source_codec' ? unplayable() : 'This browser cannot convert this video.');
    }
    if (audioCodec && conversion.discardedTracks.some((d) => d.track.isAudioTrack())) {
      throw new NamedError('VideoWebmFailed', 'This browser cannot read this file’s sound. Tick Remove the sound to convert the picture alone, or use a recent Chrome, Edge or Firefox.');
    }
    await executeWatched(conversion, opts.onProgress);
    const buffer = output.target.buffer;
    if (!buffer) throw new NamedError('VideoWebmFailed', 'The video could not be written.');
    return {
      blob: new Blob([buffer], { type: 'video/webm' }),
      width,
      height,
      duration,
      videoCodec: CODEC_NAMES[videoCodec] ?? videoCodec,
      videoCopied: copyVideo,
      audio: !!audioCodec,
      audioDropped: false,
    };
  } finally {
    input.dispose?.();
  }
}
