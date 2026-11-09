/**
 * The sentences a tool shows when it starts lighter than its full setting (see light-run.ts). The first group is the caption note's
 * existing wording, reused as it is. The second group is a draft for the families that have no note yet, kept in this one file so the
 * final text can replace it in one place. "Try full size" is a button next to the sentence.
 */
export const LOST_VIDEO_NOTE = (name: string) => `The last run stopped because the browser closed this page, most likely out of memory. In this tab, videos are now made at ${name} so the next run is lighter. `;
export const LOST_CAPTION_TAIL = 'If you only need the subtitle file, use ';

/** DRAFT (pending final copy): the other families. */
export const LOST_LIGHT_NOTE = 'The last run stopped because the browser closed this page, most likely out of memory. In this tab, this tool now works at a lighter setting so the next run is lighter. ';
export const ATRISK_LIGHT_NOTE = 'This file is large for this device, so this tool works at a lighter setting to keep the page open. ';

/** DRAFT (pending final copy): remove-object's size line when its picture is drawn at a lighter size. */
export const lightEditNote = (w: number, h: number, why: 'lost' | 'atrisk') =>
  `Edited at ${w} × ${h}, a lighter size${why === 'lost' ? ', because the browser closed this page last time' : ', because this device runs out of memory easily'}. Choose Try full size and add the picture again to keep the whole picture.`;
