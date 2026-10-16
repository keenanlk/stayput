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
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
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
