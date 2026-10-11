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
