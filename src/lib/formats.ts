/**
 * Every format the image converter can write. The option value is the MIME
 * type, which is also what format-pair pages preset (src/data/pairs.ts).
 */
import type { ImageKind } from './detect';

export type OutputType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff'
  | 'image/x-icon'
  | 'application/pdf';

export type OutputGroup = 'Everyday' | 'Special purpose';

export interface OutputFormat {
  type: OutputType;
  label: string;
  ext: string;
  group: OutputGroup;
  /** One plain sentence about when to pick it. */
  blurb: string;
  /** Extra words people type for it. */
  aliases: string[];
  /** Keeps transparent pixels. */
  alpha: boolean;
  /** Has a quality setting. */
  quality: boolean;
  /** Which input kind it matches, so "same as input" can be flagged. */
  kind?: ImageKind;
}

export const OUTPUT_FORMATS: OutputFormat[] = [
  { type: 'image/jpeg', label: 'JPG', ext: 'jpg', group: 'Everyday', blurb: 'Opens everywhere. Best for photos you send or upload.', aliases: ['jpeg', 'jfif', 'jpe', 'photo'], alpha: false, quality: true, kind: 'jpeg' },
  { type: 'image/png', label: 'PNG', ext: 'png', group: 'Everyday', blurb: 'Lossless, keeps transparency. Best for screenshots and graphics.', aliases: ['lossless', 'transparent', 'screenshot'], alpha: true, quality: false, kind: 'png' },
  { type: 'image/webp', label: 'WebP', ext: 'webp', group: 'Everyday', blurb: 'About a third smaller than JPG, with transparency. Good for websites.', aliases: ['web', 'google'], alpha: true, quality: true, kind: 'webp' },
  { type: 'application/pdf', label: 'PDF', ext: 'pdf', group: 'Everyday', blurb: 'One page per image, sized to the picture. Good for forms and printing.', aliases: ['document', 'print', 'acrobat'], alpha: false, quality: true, kind: 'pdf' },
  { type: 'image/gif', label: 'GIF', ext: 'gif', group: 'Special purpose', blurb: 'Limited to 256 colours. Animated WebPs stay animated. For chat apps, forums and email signatures.', aliases: ['graphics interchange'], alpha: true, quality: false, kind: 'gif' },
  { type: 'image/x-icon', label: 'ICO', ext: 'ico', group: 'Special purpose', blurb: 'A Windows icon or favicon with sizes from 16 to 256 pixels, padded square.', aliases: ['icon', 'favicon', 'windows icon', 'cur'], alpha: true, quality: false, kind: 'ico' },
  { type: 'image/bmp', label: 'BMP', ext: 'bmp', group: 'Special purpose', blurb: 'Uncompressed bitmap for old Windows software. Files are large.', aliases: ['bitmap', 'dib', 'windows'], alpha: false, quality: false, kind: 'bmp' },
  { type: 'image/tiff', label: 'TIFF', ext: 'tiff', group: 'Special purpose', blurb: 'Uncompressed, keeps transparency. For print shops, scanning and archives.', aliases: ['tif', 'print', 'archive', 'scan'], alpha: true, quality: false, kind: 'tiff' },
];

export const GROUPS: OutputGroup[] = ['Everyday', 'Special purpose'];

export function outputFormat(type: string): OutputFormat {
  return OUTPUT_FORMATS.find((f) => f.type === type) ?? OUTPUT_FORMATS[0]!;
}

/** Case-insensitive match on label, extension, MIME type and aliases; prefix matches rank first. */
export function searchFormats(query: string, formats: OutputFormat[] = OUTPUT_FORMATS): OutputFormat[] {
  const q = query.trim().toLowerCase().replace(/^\./, '');
  if (!q) return formats;
  const scored = formats
    .map((f) => {
      const words = [f.label, f.ext, f.type.split('/')[1]!, ...f.aliases].map((w) => w.toLowerCase());
      const score = words.some((w) => w === q) ? 0 : words.some((w) => w.startsWith(q)) ? 1 : words.some((w) => w.includes(q)) ? 2 : f.blurb.toLowerCase().includes(q) ? 3 : -1;
      return { f, score };
    })
    .filter((x) => x.score >= 0);
  return scored.sort((a, b) => a.score - b.score).map((x) => x.f);
}
