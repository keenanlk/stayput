/**
 * Errors from the 3GP reader. Each has its own name, which is all a failed run records as its
 * kind (see classifyError in analytics.ts); the message is shown on the page and never sent.
 */
import { friendlyCodec } from './avi-errors';

const AMR: Record<string, string> = { amr_nb: 'AMR-NB', amr_wb: 'AMR-WB', evrc: 'EVRC', qcelp: 'QCELP' };

/** The 3GP holds a picture or sound format this page does not carry. */
export class UnsupportedThreeGpCodec extends Error {
  readonly codec: string;
  readonly kind: 'video' | 'sound';
  constructor(codec: string, kind: 'video' | 'sound') {
    const what = AMR[codec] ?? friendlyCodec(codec);
    super(
      kind === 'video'
        ? `This 3GP's picture is ${what}, which this page cannot decode. It reads H.263, MPEG-4 and H.264 video. If another program can open the file, export it as MP4 there.`
        : `This 3GP's sound is ${what}, which this page cannot decode. It reads AMR and AAC sound. Tick Remove the sound to convert the picture alone.`,
    );
    this.name = 'UnsupportedThreeGpCodec';
    this.codec = codec;
    this.kind = kind;
  }
}

/** The decoder module could not be fetched or started. */
export class ThreeGpDecoderLoadError extends Error {
  constructor(cause?: unknown) {
    super('The 3GP decoder could not be loaded. Check your connection and try again.');
    this.name = 'ThreeGpDecoderLoadError';
    if (cause !== undefined) this.cause = cause;
  }
}
