/**
 * The longest side a video job last got through at, kept for the rest of this tab. Written only after a run that failed at
 * full size and then worked at a smaller one; read by the next run of any tool that recovers (see edit-recovery.ts).
 * It is one number in sessionStorage (gone when the tab closes): no file name, size or content, and nothing is sent anywhere.
 */

const KEY = 'stayput:work-size';

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
  } catch {
    // Nothing to forget.
  }
}
