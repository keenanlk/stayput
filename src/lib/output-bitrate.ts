/**
 * How many bits a second a re-encoded video is given, so the result is not much bigger than the file it came from.
 * The browser's own default for "high" quality is about 6 Mbit/s for 1080p and four times that for 4K, which is
 * well above what a phone writes (a 4K iPhone clip is about 14 Mbit/s) and made a 200 MB clip come out at 300 MB.
 */

/** Mediabunny's "high" quality for H.264: 3 Mbit/s at 1080p times 2.04, scaled by pixels to the 0.95 power. */
export function defaultHighBitrate(pixels: number): number {
  return 6_110_000 * Math.pow(pixels / (1920 * 1080), 0.95);
}

/** HEVC, AV1 and VP9 carry the same picture in about two thirds of the bits H.264 needs. */
const MORE_EFFICIENT = new Set(['hevc', 'av1', 'vp9']);

/**
 * The bitrate to ask for, or undefined to leave the quality at "high" as it was.
 *
 * `sourceBps` is the source's average (file bytes x 8 over its duration works when its header has none), `codec`
 * its codec. A smaller picture needs fewer bits, but not in proportion (0.75 power). The answer is never above the
 * default for the output size and never below 1 Mbit/s.
 */
export function matchedBitrate(sourceBps: number, codec: string | null | undefined, sourcePixels: number, outPixels: number): number | undefined {
  if (!(sourceBps > 0) || !(sourcePixels > 0) || !(outPixels > 0)) return undefined;
  const efficiency = MORE_EFFICIENT.has(codec ?? '') ? 1.5 : 1;
  const scaled = sourceBps * efficiency * Math.pow(Math.min(1, outPixels / sourcePixels), 0.75);
  const wanted = Math.max(1_000_000, Math.round(scaled / 1000) * 1000);
  return wanted < defaultHighBitrate(outPixels) ? wanted : undefined;
}
