/**
 * Errors that are not failures of the tool: the visitor pressed Run before giving it what it
 * needs (a missing second file, nothing painted, no password), or gave it a file it cannot read.
 * Each has its own name, which is all a failed run records as its kind (see classifyError), so
 * these stay apart from real failures in the counts. The message is shown to the visitor and
 * never sent anywhere.
 */

/** Something the visitor has to add or choose before the tool can run. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    // Set by hand: a minified class name would not survive into the name.
    this.name = 'InputError';
  }
}

/** A file the tool was given but cannot read as the kind of file it needs. */
export class UnreadableFile extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableFile';
  }
}

/**
 * A step of a tool failed after the file was read: `stage` is the name a failed run records
 * (letters and digits only, see classifyError), so these split by cause and not as a plain "Error".
 * The original error's message is kept for the visitor.
 */
export class StageError extends Error {
  constructor(stage: string, e: unknown) {
    super(e instanceof Error && e.message ? e.message : 'Something went wrong.');
    this.name = stage;
  }
}

/**
 * A failure with a message of its own and a fixed name for the counts (letters and digits only):
 * for throw sites that have no caught error to hand to StageError.
 */
export class NamedError extends Error {
  constructor(name: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = name;
  }
}

/**
 * True for an error that does not yet say what went wrong: a plain Error, or a NamedError that only carries
 * its file's default name (those end in "Failed"). Code that wraps a step's failure in the step's own name
 * uses this to decide whether the error already has a better one.
 */
export function isUnspecific(e: unknown): boolean {
  return e instanceof Error && (e.name === 'Error' || (e instanceof NamedError && /Failed$/.test(e.name)));
}

/**
 * A video whose codec this browser cannot decode (HEVC or HDR from a phone camera, say). Its own name keeps these
 * apart from damaged files in the counts; the message says how to get a copy that opens.
 */
export class UnsupportedCodec extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedCodec';
  }
}

/**
 * A video this browser reports it can decode (canDecode said yes) but whose pictures then fail to decode, or decode as a blank frame
 * (iOS Safari with HEVC or HDR from a newer phone, Chrome with some HDR clips). Its own name keeps a decoder failure apart from an
 * encoder one (both reach us as an EncodingError); it is final, since a smaller picture does not help a decoder.
 */
export class DecodeFailed extends Error {
  constructor(message = DECODE_FAILED_MESSAGE, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DecodeFailed';
  }
}

export const DECODE_FAILED_MESSAGE =
  "This phone can't decode this video's picture (often HDR or HEVC from a newer phone). On iPhone, share the clip to Files with 'Most Compatible', or turn off HDR Video in Settings > Camera > Record Video and record again.";
