// Grouping for the hub pages (home, /conversions, /guides) so they stay
// scannable as tools, conversions and guides are added.
import { tools, categories, type Category } from './tools';
import { pairs } from './pairs';
import { presets } from './presets';
import { guides, type Guide } from './guides';

/** The tool category a tool, format pair or preset slug belongs to. */
export function categoryOf(slug: string): Category | undefined {
  const tool = tools.find((t) => t.slug === slug);
  if (tool) return tool.category;
  if (pairs.some((p) => p.slug === slug)) return 'images';
  const preset = presets.find((p) => p.slug === slug);
  return preset && preset.base !== slug ? categoryOf(preset.base) : undefined;
}

/** The six rich cards shown first on the home page. */
export const popularTools = ['heic-to-jpg', 'merge-pdf', 'compress-image', 'compress-pdf', 'remove-background', 'video-to-mp3']
  .map((slug) => tools.find((t) => t.slug === slug))
  .filter((t) => t !== undefined);

export interface ConversionItem { slug: string; label: string; tagline: string; category: Category }

export const conversions: ConversionItem[] = [
  ...pairs.map((p) => ({ slug: p.slug, label: `${p.from} to ${p.to}`, tagline: p.tagline, category: 'images' as Category })),
  ...presets.map((p) => ({ slug: p.slug, label: p.name, tagline: p.tagline, category: categoryOf(p.slug) ?? 'images' })),
];

// Each category is split into smaller groups so no list on /conversions runs
// past a few dozen links as presets are added.
const target = (slug: string) => slug.split('-to-')[1] ?? '';
const isAudio = (slug: string) =>
  !/screen-recorder|video/.test(slug) &&
  (/^(mp3|wav|m4a|ogg|flac)$/.test(target(slug)) || slug === 'mp3-to-text' || (!target(slug) && /audio|mp3|wav|tuner|tempo|karaoke|acapella/.test(slug)));
const isImageFormat = (slug: string) => pairs.some((p) => p.slug === slug) || /^[a-z0-9]+-to-(svg|gif)$/.test(slug);
const isImageSize = (slug: string) => /compress|resize|reduce|enlarge|resolution|crop|2x2|35x45/.test(slug);

const conversionSplits: { id: string; label: string; test: (i: ConversionItem) => boolean }[] = [
  { id: 'image-formats', label: 'Image formats', test: (i) => i.category === 'images' && isImageFormat(i.slug) },
  { id: 'image-size', label: 'Resize and compress', test: (i) => i.category === 'images' && !isImageFormat(i.slug) && isImageSize(i.slug) },
  { id: 'image-edits', label: 'Edit and create', test: (i) => i.category === 'images' && !isImageFormat(i.slug) && !isImageSize(i.slug) },
  { id: 'pdf', label: 'PDFs and files', test: (i) => i.category === 'pdf' },
  { id: 'video', label: 'Video', test: (i) => i.category === 'media' && !isAudio(i.slug) },
  { id: 'audio', label: 'Audio', test: (i) => i.category === 'media' && isAudio(i.slug) },
];
export const conversionGroups = conversionSplits.map(({ id, label, test }) => ({ id, label, items: conversions.filter(test) }));

/** A capped, mixed set for the home page chips; the rest live on /conversions. */
export const popularConversions = [
  'heic-to-png', 'png-to-jpg', 'jpg-to-png', 'webp-to-jpg', 'webp-to-png', 'png-to-webp', 'svg-to-png', 'avif-to-jpg',
  'jpg-to-pdf', 'pdf-to-jpg', 'combine-pdf', 'heic-to-pdf', 'pdf-to-text', 'add-signature-to-pdf',
  'mp4-to-mp3', 'mov-to-mp4', 'mp4-to-gif', 'video-compressor', 'compress-video-for-discord', 'm4a-to-mp3', 'wav-to-mp3',
  'resize-image', 'compress-jpg', 'make-background-transparent',
]
  .map((slug) => conversions.find((c) => c.slug === slug))
  .filter((c) => c !== undefined);

const safetyGuides = new Set(['is-it-safe-to-merge-pdfs-online', 'does-this-website-upload-my-files', 'convert-files-without-uploading']);
const isSafety = (g: Guide) => safetyGuides.has(g.slug) || /^is-.+-safe$/.test(g.slug) || /-alternative$/.test(g.slug);

const guideLabels: Record<Category, string> = { images: 'Photos and images', pdf: 'PDFs', media: 'Video and audio' };
export const guideGroups = [
  ...categories.map((c) => ({
    id: c.id === 'images' ? 'image' : c.id,
    label: guideLabels[c.id],
    items: guides.filter((g) => !isSafety(g) && (categoryOf(g.tools[0] ?? '') ?? 'images') === c.id),
  })),
  { id: 'safety', label: 'Online services and safety', items: guides.filter(isSafety) },
];
