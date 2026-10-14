/**
 * Errors from the WMA decoder. Each has its own name, which is all a failed run records as its
 * kind (see classifyError in analytics.ts); the message is shown on the page and never sent.
 */

/** What a Windows Media sound format is called in the decoder, as a name a person knows. */
const FRIENDLY: Record<string, string> = {
  wmapro: 'WMA Pro',
  wmalossless: 'WMA Lossless',
  wmavoice: 'WMA Voice',
  wmav1: 'WMA',
  wmav2: 'WMA',
  mp3: 'MP3',
  aac: 'AAC',
  vorbis: 'Vorbis',
  adpcm_ms: 'ADPCM',
  pcm_s16le: 'PCM',
};

/** `wmapro` becomes "WMA Pro"; a codec with no entry keeps FFmpeg's short name in capitals. */
export function friendlyWmaCodec(name: string): string {
  return FRIENDLY[name] ?? (name && name !== 'none' ? name.toUpperCase() : 'an unknown sound format');
}

/** The file's sound is a format the decoder module does not include (WMA Pro, WMA Lossless, WMA Voice, others). */
export class UnsupportedWmaCodec extends Error {
  readonly codec: string;
  constructor(codec: string) {
    const what = friendlyWmaCodec(codec);
    super(
      codec.startsWith('wma')
        ? `This file uses ${what}, which Stayput can't open. This page reads standard WMA (versions 1 and 2) only. If another program can play the file, export it as MP3 or WAV there.`
        : `This file's sound is ${what}, which Stayput can't open. This page reads standard WMA (versions 1 and 2) only.`,
    );
    this.name = 'UnsupportedWmaCodec';
    this.codec = codec;
  }
}

/** The WMA is copy-protected (Windows Media DRM); its sound is scrambled and cannot be read. */
export class ProtectedWma extends Error {
  constructor() {
    super("This WMA is copy-protected (Windows Media DRM), so Stayput can't open it. Only files without copy protection convert.");
    this.name = 'ProtectedWma';
  }
}

/** The decoder module could not be fetched or started. */
export class WmaDecoderLoadError extends Error {
  constructor(cause?: unknown) {
    super('The WMA decoder could not be loaded. Check your connection and try again.');
    this.name = 'WmaDecoderLoadError';
    if (cause !== undefined) this.cause = cause;
  }
}
