/**
 * The sentences a tool shows when it starts lighter than its full setting (see light-run.ts). The first group is the caption note's
 * existing wording, reused as it is. The second group is a draft for the families that have no note yet, kept in this one file so the
 * final text can replace it in one place. "Try full size" is a button next to the sentence.
 */
export const LOST_VIDEO_NOTE = (name: string) => `The last run stopped because the browser closed this page, most likely out of memory. In this tab, videos are now made at ${name} so the next run is lighter. `;
export const LOST_CAPTION_TAIL = 'If you only need the subtitle file, use ';

/** Final wording from Marketing: the other families. */
export const LOST_LIGHT_NOTE = 'The browser closed this page during the last run, most likely because it ran low on memory. In this tab, this tool now uses a lighter setting. ';
export const ATRISK_LIGHT_NOTE = 'This file is large for this device, so this tool uses a lighter setting to help keep the page open. ';

/**
 * Final wording from Marketing: remove-object's size line when its picture is drawn at a smaller size after a lost run. The up-front
 * (at-risk) case has no approved sentence of its own, so it uses the same line without the reason; the at-risk note above already gives it.
 */
export const lightEditNote = (w: number, h: number, why: 'lost' | 'atrisk') =>
  `Edited at ${w} × ${h}, a smaller size${why === 'lost' ? ', because the browser closed this page last time' : ''}. To edit at full size, choose Try full size and add the picture again.`;
