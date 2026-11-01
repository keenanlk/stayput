/**
 * The longest side a video job last got through at, kept for the rest of this tab. Written only after a run that failed at
 * full size and then worked at a smaller one; read by the next run of any tool that recovers (see edit-recovery.ts).
 * It is one number in sessionStorage (gone when the tab closes): no file name, size or content, and nothing is sent anywhere.
 */

const KEY = 'stayput:work-size';
/** Set when a phone's 4K source was started at 1080p without a failure (see capAtRisk in recovery-hooks.ts); cleared by "Try full size". */
const RISK_KEY = 'stayput:risk-size';
/** Set by "Try full size": the person chose full size, so the at-risk start is not applied again in this tab. */
const FULL_KEY = 'stayput:full-size';
/** Set when the page loaded again after the browser closed it mid-run of a caption tool (see reportLostTab in inflight.ts). A flag only: no file data. */
const LOST_KEY = 'stayput:lost-run';

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
    store()?.setItem(FULL_KEY, '1');
  } catch {
    // Nothing to forget.
  }
}
