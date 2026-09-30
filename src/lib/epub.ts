/**
 * Reading EPUB books in the browser. An EPUB is a zip of XHTML chapters, the
 * pictures they use, and a package file (OPF) that lists the chapters in
 * reading order. This unzips it with fflate and parses the parts with the
 * browser's own DOMParser.
 */
import { unzipSync } from 'fflate';

export interface EpubBook {
  title: string;
  author: string;
  language: string;
  /** Chapters in reading order, with the path each was read from (for resolving image links). */
  chapters: { path: string; doc: Document; nav: boolean }[];
  /** Every file in the zip by its full path. */
  files: Record<string, Uint8Array>;
  /** Full path of the cover picture, when the book names one. */
  cover?: string;
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** Resolve `href` (URL-encoded, relative) against the directory of `from`. */
export function resolvePath(from: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]!.split('?')[0]!);
  const parts = from.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function parseXml(source: string, type: DOMParserSupportedType): Document {
  const doc = new DOMParser().parseFromString(source, type);
  if (type !== 'text/html' && doc.getElementsByTagName('parsererror').length) {
    // Many books are sloppy XHTML (a stray &nbsp; or unclosed tag); the HTML parser forgives that.
    return new DOMParser().parseFromString(source, 'text/html');
  }
  return doc;
}

/** Elements by local name, ignoring namespaces (OPF files mix dc:, opf: and none). */
const byName = (root: Document | Element, name: string) =>
  [...root.getElementsByTagName('*')].filter((e) => e.localName === name);

export function openEpub(bytes: Uint8Array): EpubBook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This file is not an EPUB book (it could not be unzipped).');
  }
  const container = files['META-INF/container.xml'];
  if (!container) throw new Error('This file is not an EPUB book (META-INF/container.xml is missing).');
  const encryption = files['META-INF/encryption.xml'];
  if (encryption) {
    // Font obfuscation is allowed in DRM-free books; anything else encrypted means DRM.
    const methods = byName(parseXml(text(encryption), 'application/xml'), 'EncryptionMethod').map((e) => e.getAttribute('Algorithm') ?? '');
    if (methods.some((m) => !/obfuscation|fontobf|idpf\.org\/2008\/embedding/i.test(m))) {
      throw new Error('This book is protected by DRM (bought from a store that locks its books), so its pages cannot be read. Only DRM-free EPUBs can be converted.');
    }
  }
  const rootPath = byName(parseXml(text(container), 'application/xml'), 'rootfile')[0]?.getAttribute('full-path');
  const opfBytes = rootPath ? files[rootPath] : undefined;
  if (!rootPath || !opfBytes) throw new Error('This EPUB has no package file, so its chapters cannot be found.');
  const opf = parseXml(text(opfBytes), 'application/xml');
  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const item of byName(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, { href: resolvePath(rootPath, href), type: item.getAttribute('media-type') ?? '', props: item.getAttribute('properties') ?? '' });
  }
  const chapters: EpubBook['chapters'] = [];
  for (const ref of byName(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    const data = item && files[item.href];
    if (!item || !data) continue;
    if (!/html|xml/.test(item.type) && !/\.x?html?$/i.test(item.href)) continue;
    chapters.push({ path: item.href, nav: item.props.split(/\s+/).includes('nav'), doc: parseXml(text(data), /\.html?$/i.test(item.href) && !/xhtml/.test(item.type) ? 'text/html' : 'application/xhtml+xml') });
  }
  if (chapters.length === 0) throw new Error('This EPUB lists no chapters to read.');
  const meta = (name: string) => byName(opf, name)[0]?.textContent?.trim() ?? '';
  const coverId = [...manifest.entries()].find(([, v]) => v.props.split(/\s+/).includes('cover-image'))?.[0]
    ?? byName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content') ?? undefined;
  const cover = coverId ? manifest.get(coverId)?.href : undefined;
  return { title: meta('title'), author: meta('creator'), language: meta('language'), chapters, files, cover: cover && files[cover] ? cover : undefined };
}
