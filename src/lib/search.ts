import type { SearchEntry } from '../data/search-index';

/**
 * Header search matching. Runs in the browser on the index from
 * /search-index.json; the query never leaves the page.
 *
 * Every query word must match a word in the entry's name or keywords, either
 * itself, as the start of a word (so results appear while typing), or through
 * an everyday synonym ("shrink" finds Compress). Names count more than
 * keywords, tools rank above landing pages and guides, and a query that spells
 * a page's name in order ("png to webp") puts that page first.
 */

const STOP = new Set(['a', 'an', 'the', 'to', 'into', 'in', 'of', 'for', 'from', 'with', 'without', 'and', 'or', 'my', 'how', 'i', 'do', 'can', 'make', 'online', 'free', 'file', 'files', 'tool', 'tools', 'uploading']);

/** Spellings folded into one before matching. */
const CANON: Record<string, string> = { jpeg: 'jpg', heif: 'heic', tif: 'tiff', pic: 'photo', img: 'image', pics: 'photo' };

/** Everyday words and the words the site uses for them. */
const SYN: Record<string, string[]> = {
  convert: ['converter'], converter: ['convert'],
  shrink: ['compress', 'resize'], smaller: ['compress', 'resize'], small: ['compress'], reduce: ['compress'], optimize: ['compress'], optimise: ['compress'], minify: ['compress'], compressor: ['compress'], size: ['compress', 'resize'],
  combine: ['merge'], join: ['merge', 'combine'], merge: ['combine'], append: ['merge'],
  iphone: ['heic'], ios: ['heic'], apple: ['heic'],
  photo: ['image', 'picture', 'jpg'], picture: ['image', 'photo'], image: ['photo', 'picture'],
  location: ['exif', 'gps', 'metadata'], gps: ['exif', 'location'], metadata: ['exif'], geotag: ['exif', 'location'], exif: ['metadata'],
  signature: ['sign'], esign: ['sign'], sign: ['signature'],
  password: ['unlock', 'protect'], lock: ['protect'], encrypt: ['protect'], secure: ['protect'], decrypt: ['unlock'],
  ocr: ['text'], scan: ['text', 'ocr'], transcribe: ['text'],
  audio: ['mp3', 'wav', 'sound'], sound: ['mp3', 'audio'], music: ['mp3'],
  animation: ['gif'], animated: ['gif'], meme: ['gif'],
  word: ['docx'], docx: ['word'], doc: ['word'],
  separate: ['split', 'extract'], extract: ['split'], split: ['extract'],
  turn: ['rotate'], sideways: ['rotate'], upside: ['rotate', 'flip'], mirror: ['flip'],
  scale: ['resize'], dimension: ['resize'], enlarge: ['resize'],
  censor: ['blur', 'pixelate'], hide: ['blur', 'pixelate'], redact: ['blur', 'pixelate'], anonymize: ['blur'], face: ['blur'], pixel: ['pixelate'],
  icon: ['favicon', 'ico'], ico: ['favicon'],
  number: ['numbers'], numbering: ['numbers'],
  rearrange: ['reorder'], order: ['reorder'], sort: ['reorder'], remove: ['strip', 'delete'],
  movie: ['video', 'mp4', 'mov'], clip: ['video'], recording: ['video'], mp4: ['video'], mov: ['video'],
};

const KIND_BONUS: Record<SearchEntry['k'], number> = { tool: 4, page: 1, guide: -3 };
const LIMIT = 20;

function words(s: string): string[] {
  return s.toLowerCase().replace(/&/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
}

function queryWord(w: string): string {
  if (CANON[w]) return CANON[w]!;
  // Plurals: "images" matches "image", "pdfs" matches "pdf".
  if (w.length > 3 && w.endsWith('s') && !/(ss|us)$/.test(w)) w = w.slice(0, -1);
  return CANON[w] ?? w;
}

interface Prepared {
  e: SearchEntry;
  name: string[];
  extra: string[];
  order: number;
}

const prepared = new WeakMap<SearchEntry[], Prepared[]>();
function prepare(index: SearchEntry[]): Prepared[] {
  let p = prepared.get(index);
  if (!p) {
    p = index.map((e, order) => ({ e, name: words(e.n).map((w) => CANON[w] ?? w), extra: words(e.t).map((w) => CANON[w] ?? w), order }));
    prepared.set(index, p);
  }
  return p;
}

function wordScore(alt: string, entry: Prepared): number {
  let best = 0;
  for (const w of entry.name) {
    if (w === alt) return 10;
    if (w.startsWith(alt)) best = Math.max(best, 6);
  }
  for (const w of entry.extra) {
    if (w === alt) best = Math.max(best, 4);
    else if (alt.length > 1 && w.startsWith(alt)) best = Math.max(best, 2);
  }
  return best;
}

function termScore(q: string, entry: Prepared): number {
  let best = wordScore(q, entry);
  for (const s of SYN[q] ?? []) best = Math.max(best, wordScore(s, entry) * 0.7);
  return best;
}

export function search(index: SearchEntry[], query: string): SearchEntry[] {
  const all = prepare(index);
  const q = words(query).filter((w) => !STOP.has(w)).map(queryWord);
  if (q.length === 0) return words(query).length ? [] : all.filter((p) => p.e.k === 'tool').map((p) => p.e);

  const scored = all.map((p) => {
    const terms = q.map((w) => termScore(w, p));
    const hits = terms.filter((s) => s > 0).length;
    let score = terms.reduce((a, b) => a + b, 0) + KIND_BONUS[p.e.k];
    const name = p.name.filter((w) => !STOP.has(w));
    if (name.join(' ') === q.join(' ')) score += 15;
    else if (q.every((w, i) => name[i] !== undefined && name[i]!.startsWith(w))) score += 3;
    return { p, hits, score };
  });

  const matches = scored.filter((s) => s.hits === q.length);
  return matches
    .sort((a, b) => b.score - a.score || a.p.order - b.p.order)
    .slice(0, LIMIT)
    .map((s) => s.p.e);
}
