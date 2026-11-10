/**
 * How much a merge may take on a device at risk of running out of memory, so an over-long batch is refused before any work starts
 * instead of ending as a closed tab. The merge holds the joined sound as 48 kHz stereo floats (about 0.4 MB per second, plus the
 * decoded copy of each clip) and the encoded output in memory.
 *
 * NOT measured on a device. The byte budget is PHONE_SAFE_BYTES (200 MB), measured in Safari on an iPhone 16 Pro (iOS 18.4 Simulator)
 * against a 1.5 GB tab budget for the caption tools; the length is that sound arithmetic at a third of the budget, rounded down.
 * A device that reports 2 GB of memory or less (Chrome's deviceMemory) gets half of each. Kept on the conservative side on purpose.
 */
import { PHONE_SAFE_BYTES, isPhoneBrowser } from './phone-limit';
import { NamedError } from './input-error';
import { MERGE_COPY } from './video-reencode-copy';

export interface Budget {
  bytes: number;
  seconds: number;
}

export const PHONE_BUDGET: Budget = { bytes: PHONE_SAFE_BYTES, seconds: 480 };
export const LOW_MEMORY_BUDGET: Budget = { bytes: PHONE_SAFE_BYTES / 2, seconds: 240 };

/** The budget for this device, or null when it is not a phone and reports enough memory (a computer has none). */
export function mergeBudget(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { deviceMemory?: number } = navigator as Navigator & { deviceMemory?: number }): Budget | null {
  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined;
  if (memory !== undefined && memory <= 2) return LOW_MEMORY_BUDGET;
  return isPhoneBrowser(nav) ? PHONE_BUDGET : null;
}

/** The refusal for a batch over the budget, naming the clip to shorten (the longest, or the biggest when all are short), or null when it fits. */
export function overBudget(clips: { name: string; size: number; length: number }[], budget: Budget | null): NamedError | null {
  if (!budget) return null;
  const bytes = clips.reduce((n, c) => n + c.size, 0);
  const seconds = clips.reduce((n, c) => n + c.length, 0);
  if (bytes <= budget.bytes && seconds <= budget.seconds) return null;
  const pick = seconds > budget.seconds ? [...clips].sort((a, b) => b.length - a.length)[0]! : [...clips].sort((a, b) => b.size - a.size)[0]!;
  return new NamedError('MergeTooBig', MERGE_COPY.tooBig(pick.name, Math.max(1, Math.round(seconds / 60)), Math.round(bytes / 1e6)));
}
