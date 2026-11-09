/**
 * One question for every heavy tool: "should this run start lighter?". Yes when the browser closed this page during a run of
 * the same family earlier in this tab ('lost'), or when this device is detected here as at risk (iOS, or a reported 3 GB of
 * memory or less) and the input is over the family's budget ('atrisk'). "Try full size" (fullSizeChosen) turns both off.
 * Everything is decided on this device from a flag in this tab and the input's size; nothing is stored about a file or sent.
 */
import { isIosBrowser } from './phone-limit';
import type { Family } from './tool-family';
import { fullSizeChosen, lostFamily } from './working-size';

export type LightWhy = 'lost' | 'atrisk';

/** A device where a heavy run is likely to be closed by the browser: an iPhone or iPad, or a phone that reports 3 GB or less. */
export function atRiskDevice(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { deviceMemory?: number } = navigator): boolean {
  const gb = nav.deviceMemory;
  return isIosBrowser(nav) || (typeof gb === 'number' && gb <= 3);
}

/**
 * The input size, per family, above which an at-risk device starts light from the first run. The video, caption and audio figures
 * come from the measured phone limit (PHONE_SAFE_BYTES, 150 MB for a whole-file audio decode, 40 MB here for starting in stretches);
 * the picture, PDF and archive figures are in bytes too (a phone photo is 2 to 6 MB, so 8 MB is a large one).
 */
export const LIGHT_BUDGET: Record<Family, number> = {
  video: 200_000_000,
  model: 6_000_000,
  audio: 40_000_000,
  image: 8_000_000,
  archive: 60_000_000,
  pdf: 60_000_000,
};

/**
 * Whether a run of `family` starts light, and why. `size` is the total input in bytes. A lost run wins over the at-risk start because it is the stronger evidence.
 */
export function lightRun(family: Family, size = 0, nav?: Parameters<typeof atRiskDevice>[0]): LightWhy | undefined {
  if (fullSizeChosen()) return undefined;
  if (lostFamily(family)) return 'lost';
  return size > LIGHT_BUDGET[family] && atRiskDevice(nav) ? 'atrisk' : undefined;
}

let active: LightWhy | undefined;
let activeFamily: Family | undefined;
/** The shell calls this as a run starts: the library code below it (canvas, decode, upscale) asks `lightNow()` while the run goes. */
export function beginLight(family: Family | undefined, size: number): LightWhy | undefined {
  activeFamily = family;
  active = family ? lightRun(family, size) : undefined;
  return active;
}
export function endLight(): void {
  active = undefined;
  activeFamily = undefined;
}
/** Whether the run in progress started light (see beginLight). */
/** With families named, only a run of one of those families counts: a light sound decode does not shrink a picture. */
export const lightNow = (...families: Family[]): LightWhy | undefined => (!families.length || (activeFamily && families.includes(activeFamily)) ? active : undefined);

/** The canvas pixel limit while light: a quarter of iOS Safari's 4096 × 4096, which is 2048 × 2048. */
export const LIGHT_CANVAS_PIXELS = 2048 * 2048;
/** An upscaled picture's pixel limit while light (the full limit is 16.7 million). */
export const LIGHT_OUTPUT_PIXELS = 4_194_304;
/** A file over this many bytes is decoded in stretches while light (the full limit is 150 MB on a phone, 1 GB elsewhere). */
export const LIGHT_STRETCH_BYTES = 40 * 1024 ** 2;
/** The most pixels a photo is drawn at for a cut-out or other model tool while light: 8 megapixels. */
export const LIGHT_MODEL_PIXELS = 8_000_000;

/** The size above which a sound is decoded in stretches: `normal`, or at most 40 MB while light. */
export const stretchLimit = (normal: number): number => (lightNow('audio') ? Math.min(LIGHT_STRETCH_BYTES, normal) : normal);
/** The most pixels an upscaled picture may have: `normal`, or 4 million while light. */
export const outputPixelLimit = (normal: number): number => (lightNow('model') ? Math.min(LIGHT_OUTPUT_PIXELS, normal) : normal);
