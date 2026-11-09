/**
 * The longest side a video job last got through at, kept for the rest of this tab. Written only after a run that failed at
 * full size and then worked at a smaller one; read by the next run of any tool that recovers (see edit-recovery.ts).
 * It is one number in sessionStorage (gone when the tab closes): no file name, size or content, and nothing is sent anywhere.
 */

import type { Family } from './tool-family';
import { isIosBrowser, setLight, type LightWhy } from './phone-limit';

const KEY = 'stayput:work-size';
/** Set when a phone's 4K source was started at 1080p without a failure (see capAtRisk in recovery-hooks.ts); cleared by "Try full size". */
const RISK_KEY = 'stayput:risk-size';
/** Set by "Try full size": the person chose full size, so the at-risk start is not applied again in this tab. */
const FULL_KEY = 'stayput:full-size';
/** Set when the page loaded again after the browser closed it mid-run of a caption tool (see reportLostTab in inflight.ts). A flag only: no file data. */
const LOST_KEY = 'stayput:lost-run';

/** Set when the page loaded again after the browser closed it mid-run of a video splitter. A flag only: no file data. */
const LOST_CUT_KEY = 'stayput:lost-cut';

/**
 * The shared record of a lost run: the families (see tool-family.ts) whose last run the browser closed in this tab. A list of
 * family names in sessionStorage, nothing else: no tool, file name, size or content, and nothing is sent anywhere.
 * The caption and splitter flags above stay as they are; reportLostTab writes them and this record from one place.
 */
const LOST_FAMILY_KEY = 'stayput:lost-family';

/** The tools whose caption redraw starts smaller after a lost run: the slugs inflight.ts stores for them. */
export const CAPTION_TOOLS = ['burn-subtitles-into-video', 'add-subtitles-to-video', 'auto-caption-video'];
/** Where a caption redraw starts after a lost run in this tab, and on a phone with 3 GB of memory or less and a 4K source. */
export const LOST_SIDE = 1280;

/** The sides a retry steps down through (see smallerSide in edit-recovery.ts); anything else in storage is ignored. */
const SIDES = [1920, 1280, 854];

function store(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/** The longest side the next run should start at, or undefined when full size is still the plan. */
export function workingSize(): number | undefined {
  const n = Number(store()?.getItem(KEY));
  return SIDES.includes(n) ? n : undefined;
}

/** The size an at-risk device (a phone with a 4K source) started at in this tab, or undefined. */
export function riskSize(): number | undefined {
  const n = Number(store()?.getItem(RISK_KEY));
  return (n === 1920 || n === 1280) && !fullSizeChosen() ? n : undefined;
}

export function noteRiskSize(side: 1920 | 1280 = 1920): void {
  try {
    store()?.setItem(RISK_KEY, String(side));
  } catch {
    // Not remembered: the note is just not shown.
  }
}

/** The person pressed "Try full size" in this tab. */
export const fullSizeChosen = (): boolean => store()?.getItem(FULL_KEY) === '1';

/** The browser closed this page during a caption run earlier in this tab, and "Try full size" has not been pressed since. */
export const lostRun = (): boolean => store()?.getItem(LOST_KEY) === '1' && !fullSizeChosen();

export function noteLostRun(): void {
  try {
    store()?.setItem(LOST_KEY, '1');
  } catch {
    // Not remembered: the next run starts at full size, which is the default.
  }
}

/** The slugs inflight.ts stores for the video splitter (the base page and its split-video preset). */
export const CUT_TOOLS = ['video-splitter', 'split-video'];

/** The browser closed this page during a split earlier in this tab: the next split copies every part from its key frame and re-encodes nothing. */
export const lostCut = (): boolean => store()?.getItem(LOST_CUT_KEY) === '1';

export function noteLostCut(): void {
  try {
    store()?.setItem(LOST_CUT_KEY, '1');
  } catch {
    // Not remembered: the next split starts as usual.
  }
}

function lostFamilies(): string[] {
  try {
    const v = JSON.parse(store()?.getItem(LOST_FAMILY_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The browser closed this page during a run of this family earlier in this tab, and "Try full size" has not been pressed since. */
export const lostFamily = (family: Family): boolean => lostFamilies().includes(family) && !fullSizeChosen();

export function noteLostFamily(family: Family): void {
  try {
    const now = lostFamilies();
    if (!now.includes(family)) store()?.setItem(LOST_FAMILY_KEY, JSON.stringify([...now, family]));
  } catch {
    // Not remembered: the next run starts at full size, which is the default.
  }
}

export function rememberWorkingSize(side: number): void {
  if (!SIDES.includes(side)) return;
  try {
    store()?.setItem(KEY, String(side));
  } catch {
    // Storage full or blocked: the next run starts at full size, which is the default.
  }
}

/** "Try full size": the next run starts at full size again. */
export function forgetWorkingSize(): void {
  try {
    store()?.removeItem(KEY);
    store()?.removeItem(RISK_KEY);
    store()?.removeItem(LOST_KEY);
    store()?.removeItem(LOST_FAMILY_KEY);
    store()?.setItem(FULL_KEY, '1');
  } catch {
    // Nothing to forget.
  }
}


// ---- The lighter start (was light-run.ts; kept in this module so the page's shell loads one file less). ----
/**
 * One question for every heavy tool: "should this run start lighter?". Yes when the browser closed this page during a run of
 * the same family earlier in this tab ('lost'), or when this device is detected here as at risk (iOS, or a reported 3 GB of
 * memory or less) and the input is over the family's budget ('atrisk'). "Try full size" (fullSizeChosen) turns both off.
 * Everything is decided on this device from a flag in this tab and the input's size; nothing is stored about a file or sent.
 */

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

/** The shell calls this as a run starts: the library code below it (canvas, decode, upscale) asks `lightNow()` while the run goes. */
export function beginLight(family: Family | undefined, size: number): LightWhy | undefined {
  const why = family ? lightRun(family, size) : undefined;
  setLight(family, why);
  return why;
}
export function endLight(): void {
  setLight(undefined, undefined);
}
