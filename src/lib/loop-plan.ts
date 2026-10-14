/**
 * How many times a clip is repeated, and what that costs, worked out before
 * anything is read or encoded. Dependency-free so specs can import it.
 */
import { PHONE_SAFE_BYTES } from './phone-limit';
import { formatBytes } from './files';

/** The most the repeated file may weigh, estimated as the input's size times the repeats. */
export const MAX_OUTPUT_BYTES = 2_000_000_000;
export const MIN_REPEATS = 2;
export const MAX_REPEATS = 50;

export type LoopMode = 'count' | 'length';

export interface LoopPlan {
  repeats: number;
  /** Seconds in the output. */
  duration: number;
  bytes: number;
  /** Why this cannot run, or '' when it can. */
  refusal: string;
}

export function planLoop(input: { bytes: number; duration: number; mode: LoopMode; count: number; target: number; phone: boolean }): LoopPlan {
  const { bytes, duration, mode } = input;
  const repeats =
    mode === 'count'
      ? Math.round(input.count)
      : duration > 0
        ? Math.ceil(input.target / duration - 1e-9)
        : 0;
  const plan = { repeats, duration: repeats * duration, bytes: repeats * bytes };
  if (mode === 'count' && !(repeats >= MIN_REPEATS && repeats <= MAX_REPEATS)) {
    return { ...plan, refusal: `Choose a repeat count from ${MIN_REPEATS} to ${MAX_REPEATS}.` };
  }
  if (mode === 'length') {
    if (!(input.target > 0)) return { ...plan, refusal: 'Enter a target length.' };
    if (!(duration > 0)) return { ...plan, refusal: 'This video has no length this page can read.' };
    if (repeats < MIN_REPEATS) return { ...plan, repeats: MIN_REPEATS, duration: MIN_REPEATS * duration, bytes: MIN_REPEATS * bytes, refusal: 'The target is not longer than the clip itself: choose a longer target.' };
  }
  if (plan.bytes > MAX_OUTPUT_BYTES) {
    return { ...plan, refusal: `${repeats} repeats would be about ${formatBytes(plan.bytes)}, over the ${formatBytes(MAX_OUTPUT_BYTES)} this page writes in one file. Choose fewer repeats or a shorter target.` };
  }
  if (input.phone && plan.bytes > PHONE_SAFE_BYTES) {
    return { ...plan, refusal: `${repeats} repeats would be about ${formatBytes(plan.bytes)}. A phone can run out of memory above about ${formatBytes(PHONE_SAFE_BYTES)}: choose fewer repeats, or use a computer.` };
  }
  return { ...plan, refusal: '' };
}
