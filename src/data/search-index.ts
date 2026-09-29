import { tools, toolPath, type Category } from './tools';
import { pairs, pairAsTool } from './pairs';
import { presets, presetAsTool } from './presets';
import { guides } from './guides';

/**
 * The header search index, built from the same registries as the pages and
 * served as /search-index.json. The page filters it in the browser; nothing
 * the visitor types is sent anywhere.
 */
export interface SearchEntry {
  /** Name shown in results. */
  n: string;
  /** Path to open. */
  p: string;
  /** Kind: a tool, a conversion or preset page, or a guide. */
  k: 'tool' | 'page' | 'guide';
  /** Short label shown beside the name. */
  c: string;
  /** One-line description. */
  d: string;
  /** Extra words to match: keywords and the slug. */
  t: string;
}

const categoryLabel: Record<Category, string> = { images: 'Image', pdf: 'PDF', media: 'Video & audio' };

export function buildIndex(): SearchEntry[] {
  const entry = (k: SearchEntry['k'], t: ReturnType<typeof pairAsTool>): SearchEntry => ({
    n: t.name,
    p: toolPath(t),
    k,
    c: categoryLabel[t.category],
    d: t.tagline,
    t: [t.slug.replace(/-/g, ' '), ...t.keywords].join(' '),
  });
  return [
    ...tools.map((t) => entry('tool', t)),
    ...pairs.map((p) => entry('page', pairAsTool(p))),
    ...presets.map((p) => entry('page', presetAsTool(p))),
    ...guides.map((g) => ({ n: g.heading, p: `/guides/${g.slug}`, k: 'guide' as const, c: 'Guide', d: g.dek, t: g.keywords.join(' ') })),
  ];
}
