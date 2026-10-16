/**
 * Repeat a video end to end in the browser with Mediabunny (MPL-2.0). When the
 * container can hold the clip's own codecs (the usual case: H.264 and AAC in an
 * MP4), its packets are copied again and again with shifted times: no decoding,
 * no encoding, no quality loss, so the cost is the size of the output. Anything
 * else is joined by the merge code, which decodes and encodes once (see
 * video-merge.ts). The copy keeps the input's container (MP4, MOV, WebM or MKV).
 * Nothing leaves the tab.
 */
import {
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MATROSKA,
  MP4,
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QTFF,
  WEBM,
  WebMOutputFormat,
  type InputVideoTrack,
} from 'mediabunny';
import { CODEC_NAMES, unplayable } from './video-compress';
import { watchEncode } from './encoder-watchdog';
import { InputError, UnsupportedCodec } from './input-error';

export interface LoopOptions {
  repeats: number;
  mute: boolean;
  onProgress?: (fraction: number) => void;
}

export interface LoopResult {
  blob: Blob;
  ext: string;
  width: number;
  height: number;
  duration: number;
  videoCodec: string;
  /** True when the packets were copied, with no re-encoding. */
  copied: boolean;
  audio: boolean;
  audioDropped: boolean;
}

/** What the page needs to plan a run: the clip's length, from its packets. */
export async function probeLoop(file: File): Promise<{ duration: number }> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    return { duration: (await pictureLength(video)).length };
  } finally {
    input.dispose?.();
  }
}

/** How long the picture lasts, from its packets. */
async function pictureLength(track: InputVideoTrack): Promise<{ first: number; length: number }> {
  const first = await track.getFirstTimestamp();
  let end = first;
  for await (const p of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) end = Math.max(end, p.timestamp + p.duration);
  return { first, length: Math.max(0, end - first) };
}

export async function loopVideo(file: File, opts: LoopOptions): Promise<LoopResult> {
  if (!(opts.repeats >= 2)) throw new InputError('Choose at least two repeats.');
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const format = await input.getFormat().catch(() => null);
    const video = format ? await input.getPrimaryVideoTrack().catch(() => null) : null;
    if (!format || !video) throw new Error('This file has no video this page can read (MP4, MOV, WebM or MKV).');
    const outFormat =
      format === WEBM ? new WebMOutputFormat() : format === MATROSKA ? new MkvOutputFormat() : format === QTFF ? new MovOutputFormat({ fastStart: 'in-memory' }) : new Mp4OutputFormat({ fastStart: 'in-memory' });
    const sound = opts.mute ? null : await input.getPrimaryAudioTrack().catch(() => null);
    const videoOk = !!video.codec && outFormat.getSupportedVideoCodecs().includes(video.codec);
    const soundOk = !sound || (!!sound.codec && outFormat.getSupportedAudioCodecs().includes(sound.codec));

    if (!videoOk || !soundOk) {
      // Not copyable: join the clip to itself through the merge path, which re-encodes once.
      if (!(await video.canDecode())) throw new UnsupportedCodec(unplayable());
      const { mergeVideos } = await import('./video-merge');
      const r = await mergeVideos(Array.from({ length: opts.repeats }, () => file), { mute: opts.mute, onProgress: opts.onProgress });
      return { blob: r.blob, ext: 'mp4', width: r.width, height: r.height, duration: r.duration, videoCodec: r.videoCodec, copied: false, audio: r.audio, audioDropped: r.audioDropped };
    }

    const clip = await pictureLength(video);
    const output = new Output({ format: outFormat, target: new BufferTarget() });
    const videoSource = new EncodedVideoPacketSource(video.codec!);
    output.addVideoTrack(videoSource, { rotation: video.rotation });
    const audioSource = sound ? new EncodedAudioPacketSource(sound.codec!) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    const videoMeta = { decoderConfig: (await video.getDecoderConfig()) ?? undefined };
    const audioMeta = sound ? { decoderConfig: (await sound.getDecoderConfig()) ?? undefined } : undefined;
    await output.start();

    await watchEncode(
      async (progress) => {
        for (let i = 0; i < opts.repeats; i++) {
          const offset = i * clip.length;
          for await (const p of new EncodedPacketSink(video).packets()) {
            await videoSource.add(p.clone({ timestamp: offset + p.timestamp - clip.first }), videoMeta);
          }
          if (audioSource && sound) {
            for await (const p of new EncodedPacketSink(sound).packets()) {
              const t = p.timestamp - clip.first;
              if (t < 0) continue;
              if (t >= clip.length) break;
              await audioSource.add(p.clone({ timestamp: offset + t }), audioMeta);
            }
          }
          const f = Math.min(0.99, (i + 1) / opts.repeats);
          progress(f);
          opts.onProgress?.(f);
        }
        videoSource.close();
        audioSource?.close();
        await output.finalize();
      },
      () => output.cancel(),
    );
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('The video could not be written.');
    opts.onProgress?.(1);
    const quarter = video.rotation === 90 || video.rotation === 270;
    return {
      blob: new Blob([buffer], { type: outFormat.mimeType }),
      ext: outFormat.fileExtension.replace(/^\./, ''),
      width: quarter ? video.codedHeight : video.codedWidth,
      height: quarter ? video.codedWidth : video.codedHeight,
      duration: clip.length * opts.repeats,
      videoCodec: CODEC_NAMES[video.codec!] ?? video.codec!,
      copied: true,
      audio: !!audioSource,
      audioDropped: false,
    };
  } finally {
    input.dispose?.();
  }
}
