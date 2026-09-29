import { zip } from 'fflate';

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function replaceExt(name: string, ext: string): string {
  return `${baseName(name)}.${ext}`;
}

export function suffixName(name: string, suffix: string, ext?: string): string {
  return `${baseName(name)}${suffix}.${ext ?? extOf(name)}`;
}

/** Make file names unique inside a batch by appending (2), (3)... */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = seen.get(n) ?? 0;
    seen.set(n, count + 1);
    if (count === 0) return n;
    const ext = extOf(n);
    return ext ? `${baseName(n)} (${count + 1}).${ext}` : `${n} (${count + 1})`;
  });
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface OutputFile {
  name: string;
  blob: Blob;
  /** Size of the source file, when the output maps to one input. */
  originalSize?: number;
  /** Optional preview image. */
  previewUrl?: string;
  /** Short label shown when there is no preview; defaults to the extension. */
  badge?: string;
  note?: string;
  /** Text to show on the page with a Copy button (OCR output, say). */
  text?: string;
}

export async function zipFiles(files: OutputFile[]): Promise<Blob> {
  const names = uniqueNames(files.map((f) => f.name));
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  await Promise.all(
    files.map(async (f, i) => {
      // Level 0 (store): the outputs are already compressed formats.
      entries[names[i]!] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
    }),
  );
  return new Promise((resolve, reject) => {
    zip(entries, (err, data) => {
      if (err) reject(err);
      else resolve(new Blob([data as BlobPart], { type: 'application/zip' }));
    });
  });
}

export function mimeForExt(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'avif':
      return 'image/avif';
    case 'jxl':
      return 'image/jxl';
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'pdf':
      return 'application/pdf';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

export async function readHead(file: Blob, n = 16): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

/** Detects HEIC/HEIF by the ISO BMFF ftyp brand, independent of extension. */
export async function isHeicFile(file: Blob): Promise<boolean> {
  const head = await readHead(file, 24);
  if (head.length < 12) return false;
  const ftyp = String.fromCharCode(...head.subarray(4, 8));
  if (ftyp !== 'ftyp') return false;
  const brand = String.fromCharCode(...head.subarray(8, 12)).trim();
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif'].includes(brand);
}

export function sleepFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
