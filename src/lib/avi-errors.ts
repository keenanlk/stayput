/**
 * Errors from the AVI decoder. Each has its own name, which is all a failed run records as its
 * kind (see classifyError in analytics.ts); the message is shown on the page and never sent.
 */

/** What an AVI's codec is called in the decoder, as a name a person knows. */
const FRIENDLY: Record<string, string> = {
  h264: 'H.264',
  hevc: 'HEVC (H.265)',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  wmv1: 'Windows Media Video',
  wmv2: 'Windows Media Video',
  wmv3: 'Windows Media Video',
  vc1: 'VC-1',
  vp6: 'VP6',
  vp6f: 'VP6',
  vp6a: 'VP6',
  flashsv: 'Flash Screen Video',
  flashsv2: 'Flash Screen Video',
  flv: 'Sorenson Spark',
  flv1: 'Sorenson Spark',
  msmpeg4v1: 'MS-MPEG4 (DivX 3)',
  msmpeg4v2: 'MS-MPEG4 (DivX 3)',
  msmpeg4v3: 'MS-MPEG4 (DivX 3)',
  mpeg1video: 'MPEG-1',
  mpeg2video: 'MPEG-2',
  indeo3: 'Indeo 3',
  indeo4: 'Indeo 4',
  indeo5: 'Indeo 5',
  cinepak: 'Cinepak',
  dvvideo: 'DV',
  huffyuv: 'HuffYUV',
  theora: 'Theora',
  aac: 'AAC',
  aac_latm: 'AAC',
  wmav1: 'Windows Media Audio',
  wmav2: 'Windows Media Audio',
  wmapro: 'Windows Media Audio',
  adpcm_ms: 'ADPCM',
  adpcm_ima_wav: 'ADPCM',
  vorbis: 'Vorbis',
  opus: 'Opus',
  nellymoser: 'Nellymoser',
  speex: 'Speex',
  adpcm_swf: 'ADPCM',
  flac: 'FLAC',
  dts: 'DTS',
  eac3: 'Dolby Digital Plus',
  truehd: 'Dolby TrueHD',
};

/** `h264` becomes "H.264"; a codec with no entry keeps FFmpeg's short name in capitals. */
export function friendlyCodec(name: string): string {
  return FRIENDLY[name] ?? (name && name !== 'none' ? name.toUpperCase() : 'an unknown codec');
}

/** The AVI holds a picture or sound format the decoder module does not include. */
export class UnsupportedAviCodec extends Error {
  readonly codec: string;
  readonly kind: 'video' | 'sound';
  constructor(codec: string, kind: 'video' | 'sound') {
    const what = friendlyCodec(codec);
    super(
      kind === 'video'
        ? `This AVI's picture is ${what}, which this page cannot decode. It reads Xvid, DivX 4 and later, and Motion JPEG video. If another program can open the file, export it as MP4 there.`
        : `This AVI's sound is ${what}, which this page cannot decode. Tick Remove the sound to convert the picture alone.`,
    );
    this.name = 'UnsupportedAviCodec';
    this.codec = codec;
    this.kind = kind;
  }
}

/** The decoder module could not be fetched or started. */
export class AviDecoderLoadError extends Error {
  constructor(cause?: unknown) {
    super('The AVI decoder could not be loaded. Check your connection and try again.');
    this.name = 'AviDecoderLoadError';
    if (cause !== undefined) this.cause = cause;
  }
}
