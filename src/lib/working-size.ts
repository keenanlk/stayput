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
  return store()?.getItem(RISK_KEY) === '1920' && !fullSizeChosen() ? 1920 : undefined;
}

export function noteRiskSize(): void {
  try {
    store()?.setItem(RISK_KEY, '1920');
  } catch {
    // Not remembered: the note is just not shown.
  }
}

/** The person pressed "Try full size" in this tab. */
export const fullSizeChosen = (): boolean => store()?.getItem(FULL_KEY) === '1';

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
    store()?.setItem(FULL_KEY, '1');
  } catch {
    // Nothing to forget.
  }
}
