/**
 * Errors from the FLV reader. Each has its own name, which is all a failed run records as its
 * kind (see classifyError in analytics.ts); the message is shown on the page and never sent.
 */
import { friendlyCodec } from './avi-errors';

/** The FLV holds a picture or sound format this page does not carry (VP6, Sorenson Spark, Nellymoser and the like). */
export class UnsupportedFlvCodec extends Error {
  readonly codec: string;
  readonly kind: 'video' | 'sound';
  constructor(codec: string, kind: 'video' | 'sound') {
    const what = friendlyCodec(codec);
    super(
      kind === 'video'
        ? `This FLV uses ${what} video, which Stayput can't open. It converts FLV files that hold H.264 video. If another program can open the file, export it as MP4 there.`
        : `This FLV uses ${what} sound, which Stayput can't open. It reads AAC and MP3 sound. Tick Remove the sound to convert the picture alone.`,
    );
    this.name = 'UnsupportedFlvCodec';
    this.codec = codec;
    this.kind = kind;
  }
}

/** The FLV reader module could not be fetched or started. */
export class FlvDecoderLoadError extends Error {
  constructor(cause?: unknown) {
    super('The FLV reader could not be loaded. Check your connection and try again.');
    this.name = 'FlvDecoderLoadError';
    if (cause !== undefined) this.cause = cause;
  }
}
