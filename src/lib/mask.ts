/**
 * Clean up a raw segmentation mask (square, 0..255). The model is often unsure
 * about parts of a pet's body or a patterned sweater (grey, half transparent)
 * and leaves faint specks on textured backgrounds. This firms up the subject,
 * keeps only the subject's own regions, and fills holes inside it.
 *
 * `keep` from -1 (keep less) to 1 (keep more) moves where unsure pixels land.
 */
export function refineMask(raw: Uint8ClampedArray, size: number, keep = 0): Uint8ClampedArray {
  const n = size * size;
  const lo = (0.12 - 0.08 * keep) * 255;
  const hi = (0.55 - 0.2 * keep) * 255;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (raw[i]! - lo) / (hi - lo)));
    a[i] = t * t * (3 - 2 * t);
  }

  // Label the confident regions and drop the small ones (specks of background).
  const label = new Int32Array(n);
  const areas: number[] = [0];
  const stack = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (a[i]! <= 0.5 || label[i]) continue;
    const id = areas.length;
    let top = 0;
    let area = 0;
    stack[top++] = i;
    label[i] = id;
    while (top) {
      const p = stack[--top]!;
      area++;
      const x = p % size;
      const nb = [x > 0 ? p - 1 : -1, x < size - 1 ? p + 1 : -1, p - size, p + size];
      for (const q of nb) {
        if (q < 0 || q >= n || label[q] || a[q]! <= 0.5) continue;
        label[q] = id;
        stack[top++] = q;
      }
    }
    areas.push(area);
  }
  const biggest = Math.max(0, ...areas);
  if (biggest > 0) {
    const kept = new Uint8Array(n);
    for (let i = 0; i < n; i++) kept[i] = label[i] && areas[label[i]!]! >= biggest * 0.02 ? 1 : 0;
    // Soft edge pixels are kept only within a short reach of a kept region.
    const near = dilate(kept, size, 12);
    for (let i = 0; i < n; i++) if (!near[i]) a[i] = 0;
  }

  // Fill holes: anything unsure that the background cannot reach from the edge.
  const outside = new Uint8Array(n);
  let top = 0;
  const push = (p: number) => {
    if (!outside[p] && a[p]! <= 0.5) {
      outside[p] = 1;
      stack[top++] = p;
    }
  };
  for (let i = 0; i < size; i++) {
    push(i);
    push(n - size + i);
    push(i * size);
    push(i * size + size - 1);
  }
  while (top) {
    const p = stack[--top]!;
    const x = p % size;
    if (x > 0) push(p - 1);
    if (x < size - 1) push(p + 1);
    if (p >= size) push(p - size);
    if (p < n - size) push(p + size);
  }
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) out[i] = outside[i] || a[i]! > 0.5 ? a[i]! * 255 : 255;
  return out;
}

/** Binary dilation by a square of radius r, as two sliding-window passes. */
function dilate(src: Uint8Array, size: number, r: number): Uint8Array {
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let count = 0;
    for (let x = 0; x < Math.min(size, r); x++) count += src[row + x]!;
    for (let x = 0; x < size; x++) {
      if (x + r < size) count += src[row + x + r]!;
      if (x - r - 1 >= 0) count -= src[row + x - r - 1]!;
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < size; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(size, r); y++) count += tmp[y * size + x]!;
    for (let y = 0; y < size; y++) {
      if (y + r < size) count += tmp[(y + r) * size + x]!;
      if (y - r - 1 >= 0) count -= tmp[(y - r - 1) * size + x]!;
      out[y * size + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}
