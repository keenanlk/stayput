/** Picking an audio bitrate that keeps a file under a size limit. */

/** Bitrates LAME and Opus both handle well, highest first. */
export const STEPS = [160, 128, 112, 96, 80, 64, 48, 32];

/** The highest step at or below `quality` whose file fits `limitMB`, with 3% for headers. */
export function bitrateToFit(quality: number, seconds: number, limitMB: number | null): number {
  const allowed = STEPS.filter((b) => b <= quality);
  if (!limitMB) return allowed[0]!;
  const max = (limitMB * 1_000_000 * 8 * 0.97) / Math.max(0.1, seconds) / 1000;
  return allowed.find((b) => b <= max) ?? STEPS[STEPS.length - 1]!;
}
