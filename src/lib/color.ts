/**
 * Colour helpers for the colour picker: conversions between the formats
 * people paste into CSS and design tools, and the main colours of an image.
 */

export type RGB = [number, number, number];

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

export function toHex([r, g, b]: RGB): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
}

export function toRgbString([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Hue in degrees, saturation and lightness in percent, rounded as CSS writes them. */
export function toHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function toHslString(rgb: RGB): string {
  const [h, s, l] = toHsl(rgb);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Black or white, whichever reads better on the colour (WCAG relative luminance). */
export function textOn([r, g, b]: RGB): '#000000' | '#FFFFFF' {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.179 ? '#000000' : '#FFFFFF';
}

export interface Swatch {
  rgb: RGB;
  /** Share of the image's opaque pixels closest to this colour, 0 to 1. */
  share: number;
}

const dist2 = (a: RGB, r: number, g: number, b: number) => (a[0] - r) ** 2 + (a[1] - g) ** 2 + (a[2] - b) ** 2;

/**
 * The `k` main colours of an image, most common first: k-means over up to
 * about 20,000 sampled pixels, started from k-means++ with a fixed seed so
 * the same image always gives the same palette. Near-duplicate colours are
 * merged, so a mostly flat image can return fewer than `k`.
 */
export function palette(data: Uint8ClampedArray, k: number): Swatch[] {
  const total = data.length / 4;
  const stride = Math.max(1, Math.floor(total / 20000));
  const px: number[] = [];
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if (data[o + 3]! < 128) continue;
    px.push(data[o]!, data[o + 1]!, data[o + 2]!);
  }
  const n = px.length / 3;
  if (!n) return [];
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // k-means++: each new centre is picked in proportion to its distance from the nearest one so far.
  const centres: RGB[] = [[px[0]!, px[1]!, px[2]!]];
  const near = new Float64Array(n).fill(Infinity);
  while (centres.length < k) {
    const c = centres[centres.length - 1]!;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      near[i] = Math.min(near[i]!, dist2(c, px[i * 3]!, px[i * 3 + 1]!, px[i * 3 + 2]!));
      sum += near[i]!;
    }
    if (!sum) break; // Fewer distinct colours than k.
    let t = rand() * sum;
    let pick = 0;
    for (; pick < n - 1 && t > near[pick]!; pick++) t -= near[pick]!;
    centres.push([px[pick * 3]!, px[pick * 3 + 1]!, px[pick * 3 + 2]!]);
  }
  const label = new Uint16Array(n);
  const counts = new Array<number>(centres.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centres.map((): RGB => [0, 0, 0]);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const r = px[i * 3]!;
      const g = px[i * 3 + 1]!;
      const b = px[i * 3 + 2]!;
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = dist2(centres[c]!, r, g, b);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      label[i] = best;
      counts[best]!++;
      const sum = sums[best]!;
      sum[0] += r;
      sum[1] += g;
      sum[2] += b;
    }
    let moved = false;
    centres.forEach((c, j) => {
      if (!counts[j]) return;
      const next: RGB = [Math.round(sums[j]![0] / counts[j]!), Math.round(sums[j]![1] / counts[j]!), Math.round(sums[j]![2] / counts[j]!)];
      if (next.some((v, x) => v !== c[x])) moved = true;
      centres[j] = next;
    });
    if (!moved) break;
  }
  const swatches = centres.map((rgb, j) => ({ rgb, share: counts[j]! / n })).filter((s) => s.share > 0);
  swatches.sort((a, b) => b.share - a.share);
  // Merge colours a person could not tell apart (distance under ~12 per channel).
  const merged: Swatch[] = [];
  for (const s of swatches) {
    const twin = merged.find((m) => dist2(m.rgb, ...s.rgb) < 400);
    if (twin) twin.share += s.share;
    else merged.push({ rgb: s.rgb, share: s.share });
  }
  return merged;
}
