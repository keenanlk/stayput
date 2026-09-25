/**
 * Parse a page range like "1-3, 7, 10-12" into zero-based page indexes.
 * Pages are 1-based in the input. Out-of-range pages throw.
 */
export function parsePageRange(input: string, pageCount: number): number[] {
  const out: number[] = [];
  const text = input.trim();
  if (!text) throw new Error('Enter at least one page or range, for example 1-3, 5.');
  for (const rawPart of text.split(/[,;\s]+/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw new Error(`"${part}" is not a page number or range.`);
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    if (a < 1 || b < 1 || a > pageCount || b > pageCount) {
      throw new Error(`Page ${a > pageCount ? a : b} is out of range. This document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
    }
    const step = a <= b ? 1 : -1;
    for (let p = a; step > 0 ? p <= b : p >= b; p += step) out.push(p - 1);
  }
  if (out.length === 0) throw new Error('Enter at least one page.');
  return out;
}

/** Split [0..pageCount) into consecutive chunks of size n. */
export function chunkPages(pageCount: number, n: number): number[][] {
  if (n < 1) throw new Error('Pages per file must be at least 1.');
  const chunks: number[][] = [];
  for (let start = 0; start < pageCount; start += n) {
    const chunk: number[] = [];
    for (let p = start; p < Math.min(start + n, pageCount); p++) chunk.push(p);
    chunks.push(chunk);
  }
  return chunks;
}

/** Describe a zero-based index list as "1-3, 5" for file names. */
export function describePages(indexes: number[]): string {
  if (indexes.length === 0) return '';
  const parts: string[] = [];
  let start = indexes[0]!;
  let prev = start;
  for (let i = 1; i <= indexes.length; i++) {
    const cur = indexes[i];
    if (cur !== undefined && cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    if (cur !== undefined) {
      start = cur;
      prev = cur;
    }
  }
  return parts.join(',');
}
