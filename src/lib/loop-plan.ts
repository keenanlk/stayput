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
  /** The class name a refused run records: one per refusal, so the counts tell them apart. '' when it can run. */
  refusalClass: LoopRefusalClass | '';
}

export type LoopRefusalClass = 'LoopCountOutOfRange' | 'LoopNoTarget' | 'LoopLengthUnreadable' | 'LoopTargetTooShort' | 'LoopTooLarge' | 'LoopTooLargeForPhone';

/** The most repeats that fit under a byte limit, or '' when not even the smallest count does. */
function fits(perRepeat: number, limit: number): string {
  const n = Math.min(MAX_REPEATS, Math.floor(limit / perRepeat));
  return n >= MIN_REPEATS ? ` ${n} repeats fit.` : '';
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
  const refuse = (refusalClass: LoopRefusalClass, refusal: string, over: Partial<LoopPlan> = {}): LoopPlan => ({ ...plan, ...over, refusal, refusalClass });
  if (mode === 'count' && !(repeats >= MIN_REPEATS && repeats <= MAX_REPEATS)) {
    return refuse('LoopCountOutOfRange', `Choose a repeat count from ${MIN_REPEATS} to ${MAX_REPEATS}.`);
  }
  if (mode === 'length') {
    if (!(input.target > 0)) return refuse('LoopNoTarget', 'Enter a target length.');
    if (!(duration > 0)) return refuse('LoopLengthUnreadable', 'This video has no length this page can read.');
    if (repeats < MIN_REPEATS) return refuse('LoopTargetTooShort', 'The target is not longer than the clip itself: choose a longer target.', { repeats: MIN_REPEATS, duration: MIN_REPEATS * duration, bytes: MIN_REPEATS * bytes });
  }
  if (plan.bytes > MAX_OUTPUT_BYTES) {
    return refuse('LoopTooLarge', `${repeats} repeats would be about ${formatBytes(plan.bytes)}, over the ${formatBytes(MAX_OUTPUT_BYTES)} this page writes in one file. Choose fewer repeats or a shorter target.${fits(bytes, MAX_OUTPUT_BYTES)}`);
  }
  if (input.phone && plan.bytes > PHONE_SAFE_BYTES) {
    return refuse('LoopTooLargeForPhone', `${repeats} repeats would be about ${formatBytes(plan.bytes)}. A phone can run out of memory above about ${formatBytes(PHONE_SAFE_BYTES)}: choose fewer repeats, or use a computer.${fits(bytes, PHONE_SAFE_BYTES)}`);
  }
  return { ...plan, refusal: '', refusalClass: '' };
}
