/**
 * Every sentence the video re-encode hardening added (compress, resize, merge), in one place so the final wording can be swapped in
 * without touching the logic. Sentences marked "existing" were already shown by these tools and are reused word for word.
 */

export const COMPRESS_COPY = {
  /** existing: shown when the size asked for is too small for the length. */
  tooLong: (targetMB: number, mostMinutes: number) =>
    `This video is too long to fit in ${targetMB} MB and still be watchable. Trim it to under ${mostMinutes} minute${mostMinutes === 1 ? '' : 's'}, or choose a larger size.`,
  /** Note on the result when it is as big as or bigger than the original. */
  larger: 'as big as, or bigger than, the original: this video was already well compressed, so keep the original or try a lower quality or resolution',
  /** Note on a result made through the browser's own video player. */
  viaPlayer: "read through the browser's own video player, as this video could not be read the usual way",
};

export const MERGE_COPY = {
  /** A clip in the batch has no picture, or cannot be read: the clip is named. */
  clip: (name: string) => `${name}: `,
  /** Over the phone budget, refused before any work. `which` is the clip to shorten or leave out. */
  tooBig: (which: string, minutes: number, mb: number) =>
    `These videos are too big to join on this phone: about ${minutes} minutes and ${mb} MB in all. Shorten ${which} with Trim video, join fewer clips, or use a computer.`,
  /** Note on a result in which a clip was decoded by the browser's own player. */
  viaPlayer: "some clips were read through the browser's own video player, as they could not be read the usual way",
};

export const RESIZE_COPY = {
  viaPlayer: "read through the browser's own video player, as this video could not be read the usual way",
};

/** Sentences shared by the tools added to the player fallback after the first three (convert, speed, reverse, frames, side by side). */
export const PLAYER_COPY = {
  /** The same sentence as COMPRESS_COPY.viaPlayer and RESIZE_COPY.viaPlayer. */
  viaPlayer: RESIZE_COPY.viaPlayer,
  /** The same sentence as MERGE_COPY.viaPlayer: a note for a result made from two clips. */
  viaPlayerSome: MERGE_COPY.viaPlayer,
  /** existing (side by side): the sound of the chosen clip could not be read. */
  soundUnreadable: 'sound left out: this browser cannot read it',
};
