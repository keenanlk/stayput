/**
 * Put new sound on a video in the browser. The picture is copied packet by
 * packet with Mediabunny (MPL-2.0), so it is not re-encoded and loses
 * nothing. The new sound (an MP3, WAV, M4A or the sound of another video) is
 * decoded by the browser, looped or cut to the length of the video, mixed
 * with the video's own sound if asked, and encoded as AAC or Opus. Nothing
 * leaves the tab.
 */
import { NamedError, UnreadableFile } from './input-error';
import {
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  QUALITY_HIGH,
  WEBM,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
} from 'mediabunny';
import { CODEC_NAMES } from './video-compress';
import { SAMPLE_RATE, decodePcm, pcmFeeder, stereo } from './pcm';
import { NoAudioEncoder, registerMp3Fallback } from './mp3-fallback';
import { isNotReadable } from './read-failure';

export interface AddAudioOptions {
  /** Replace the video's sound, or play both together. */
  mode: 'replace' | 'mix';
  /** Repeat the new sound when it is shorter than the video. */
  loop: boolean;
  /** Fade the new sound out over the last seconds when it is cut short. */
  fade: boolean;
  onProgress?: (fraction: number) => void;
}

export interface AddAudioResult {
  blob: Blob;
  ext: string;
  duration: number;
  videoCodec: string;
  /** Seconds of the new sound, before looping or cutting. */
  soundLength: number;
  looped: boolean;
  cut: boolean;
}

const FADE = 1.5;
/** The added sound plays at this level under the video's own sound. */
const MIX_LEVEL = 0.5;

/** True when the file holds a picture Mediabunny can read. */
/** A failure to read the file stays that; any other failure to find a track means there is none. */
function unlessUnreadable(e: unknown): null {
  if (isNotReadable(e)) throw e;
  return null;
}

export async function hasVideo(file: File): Promise<boolean> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    return !!(await input.getPrimaryVideoTrack().catch(unlessUnreadable));
  } finally {
    input.dispose?.();
  }
}

/** `soundFile` may be the sound itself (one or two channels at 48 kHz), which skips writing it out as a file and decoding that again. */
export async function addAudio(videoFile: File, soundFile: File | Float32Array[], opts: AddAudioOptions): Promise<AddAudioResult> {
  const input = new Input({ source: new BlobSource(videoFile), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(unlessUnreadable);
    if (!video || !video.codec) throw new UnreadableFile(`${videoFile.name} has no video this page can read (MP4, MOV, WebM or MKV).`);
    const decoderConfig = await video.getDecoderConfig();
    if (!decoderConfig) throw new UnreadableFile(`${videoFile.name} uses a video format this browser cannot copy.`);

    // Picture length from the packets themselves.
    const first = await video.getFirstTimestamp();
    let end = first;
    for await (const p of new EncodedPacketSink(video).packets(undefined, undefined, { metadataOnly: true })) end = Math.max(end, p.timestamp + p.duration);
    const duration = Math.max(0, end - first) || (await input.computeDuration());
    const len = Math.max(1, Math.round(duration * SAMPLE_RATE));

    const added = Array.isArray(soundFile) ? soundFile : await decodePcm(soundFile);
    if (!added || !added[0]?.length) throw new UnreadableFile(`${Array.isArray(soundFile) ? videoFile.name : soundFile.name} has no sound this browser can read. Try an MP3, WAV, M4A or another video.`);
    const [inL, inR] = stereo(added);
    const soundLength = inL!.length / SAMPLE_RATE;
    const looped = opts.loop && inL!.length < len;
    const cut = inL!.length > len;
    const sound = [new Float32Array(len), new Float32Array(len)];
    for (let at = 0; at < len; at += inL!.length) {
      const n = Math.min(inL!.length, len - at);
      sound[0]!.set(inL!.subarray(0, n), at);
      sound[1]!.set(inR!.subarray(0, n), at);
      if (!opts.loop) break;
    }
    if (opts.fade && (cut || looped)) {
      const f = Math.min(len, Math.round(FADE * SAMPLE_RATE));
      for (let i = 0; i < f; i++) {
        const g = i / f;
        sound[0]![len - 1 - i]! *= g;
        sound[1]![len - 1 - i]! *= g;
      }
    }
    if (opts.mode === 'mix' && (await input.getPrimaryAudioTrack())) {
      const own = await decodePcm(videoFile);
      if (own) {
        const [l, r] = stereo(own);
        for (const [c, ch] of [l!, r!].entries()) {
          const out = sound[c]!;
          for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, out[i]! * MIX_LEVEL + (ch[i] ?? 0)));
        }
      }
    }

    // MP4 plays everywhere, but VP8 in MP4 does not play in Safari; keep VP8 in WebM.
    const format = video.codec === 'vp8' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' });
    // iOS 18 and earlier have no AudioEncoder: MP3 (encoded in WebAssembly) is the sound an MP4 can then hold.
    registerMp3Fallback();
    const audioCodec = await getFirstEncodableAudioCodec(
      format.getSupportedAudioCodecs().filter((c) => c === 'aac' || c === 'opus' || c === 'mp3'),
      { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: QUALITY_HIGH },
    );
    if (!audioCodec) throw new NoAudioEncoder("This browser cannot write the new sound into a video. On an iPhone, update iOS or use a computer; elsewhere, use a recent Chrome, Edge, Safari or Firefox.");

    const output = new Output({ format, target: new BufferTarget() });
    const videoSource = new EncodedVideoPacketSource(video.codec);
    output.addVideoTrack(videoSource, { rotation: video.rotation });
    const audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: QUALITY_HIGH });
    output.addAudioTrack(audioSource);
    await output.start();
    const feed = pcmFeeder(audioSource, sound);

    let firstPacket = true;
    for await (const packet of new EncodedPacketSink(video).packets()) {
      const t = packet.timestamp - first;
      await feed.until(t);
      await videoSource.add(packet.clone({ timestamp: t }), firstPacket ? { decoderConfig } : undefined);
      firstPacket = false;
      opts.onProgress?.(Math.min(0.99, t / Math.max(0.001, duration)));
    }
    await feed.until(Infinity);
    videoSource.close();
    audioSource.close();
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer) throw new NamedError('VideoWriteError', 'The video could not be written.');
    opts.onProgress?.(1);
    return {
      blob: new Blob([buffer], { type: format.mimeType }),
      ext: format.fileExtension.replace(/^\./, ''),
      duration,
      videoCodec: CODEC_NAMES[video.codec] ?? video.codec,
      soundLength,
      looped,
      cut,
    };
  } finally {
    input.dispose?.();
  }
}
