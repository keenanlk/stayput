/**
 * Every sentence the video re-encode hardening added (compress, resize, merge), in one place so the final wording can be swapped in
 * without touching the logic. Sentences marked "existing" were already shown by these tools and are reused word for word.
 */

export const COMPRESS_COPY = {
  /** existing: shown when the size asked for is too small for the length. */
  tooLong: (targetMB: number, mostMinutes: number) =>
    `This video is too long to fit in ${targetMB} MB and still be watchable. Trim it to under ${mostMinutes} minute${mostMinutes === 1 ? '' : 's'}, or choose a larger size.`,
  /** Note on the result when it is as big as or bigger than the original. */
  larger: 'the result is not smaller than the original: this video is already compressed about as far as it goes, so keep the original, or choose a smaller size or resolution',
  /** Note on a result made through the browser's own video player. */
  viaPlayer: "decoded with the browser's own video player, because it could not decode this video the usual way",
};

export const MERGE_COPY = {
  /** A clip in the batch has no picture, or cannot be read: the clip is named. */
  clip: (name: string) => `${name}: `,
  /** Over the phone budget, refused before any work. `which` is the clip to shorten or leave out. */
  tooBig: (which: string, minutes: number, mb: number) =>
    `These videos are too long to join on this phone: about ${minutes} minutes, ${mb} MB in all. Shorten ${which} (Trim video does it), join fewer clips, or use a computer.`,
  /** Note on a result in which a clip was decoded by the browser's own player. */
  viaPlayer: "some clips were decoded with the browser's own video player, because it could not decode them the usual way",
};

export const RESIZE_COPY = {
  viaPlayer: "decoded with the browser's own video player, because it could not decode this video the usual way",
};
