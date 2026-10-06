import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { tools, toolPath } from '../src/data/tools';
import { pairs } from '../src/data/pairs';
import { presets } from '../src/data/presets';
import { guides } from '../src/data/guides';
import { offlineBadge, defaultSizeBadge } from '../src/data/leads';

// Reads the built HTML of every tool, pair, preset and guide page: visible text, meta
// descriptions, badges and structured data. Run after `npm run build`.
const dist = new URL('../dist/', import.meta.url);

const pages = [
  ...tools.map((t) => ({ path: toolPath(t), base: t.slug, sizeFact: t.sizeFact, kind: 'tool' })),
  ...pairs.map((p) => ({ path: `/${p.slug}`, base: 'convert-image', sizeFact: undefined, kind: 'pair' })),
  ...presets.map((p) => ({ path: `/${p.slug}`, base: p.base, sizeFact: p.sizeFact, kind: 'preset' })),
  ...guides.map((g) => ({ path: `/guides/${g.slug}`, base: '', sizeFact: undefined, kind: 'guide' })),
];

const html = (path: string) => readFileSync(new URL(`${path.slice(1)}.html`, dist), 'utf8');

/** The page without scripts and styles, except JSON-LD, so meta tags and structured data are scanned too. */
const scannable = (page: string) =>
  page.replace(/<script(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/\s+/g, ' ');

// Claims about Stayput's own limits that the claims record forbids. A hit is allowed only when it
// is qualified by the device's memory right next to it, or is about a competitor.
const sizeClaims: [string, RegExp][] = [
  ['no size cap', /\bno (file[- ])?size (limit|cap)s?\b/gi],
  ['no limit', /\bno limit\b/gi],
  ['unlimited', /\bunlimited\b/gi],
  ['no cap', /\bno cap\b/gi],
  ['any size of file', /\b(files?|videos?|photos?|images?|pdfs?) (of|in) any size\b|\bany file size\b/gi],
];
const qualifier = /device|memory|can hold|\bhold\b/i;
const competitor = /smallpdf|ilovepdf|convertio|zamzar|freeconvert|pdf24|ezgif|cloudconvert|adobe scan|camscanner|loom|camtasia|otter|obs studio/i;
// Two guide titles carry the slogan in their H1 and URL; they are listed in the build notes, not guarded.
const slogan = /alternative with no file size cap/gi;
// The compress-audio "Fit under" option is a UI label, not a claim.
const uiLabel = /Fit under/;

function claimsIn(page: string): string[] {
  const text = scannable(page).replace(slogan, '');
  const found: string[] = [];
  for (const [name, re] of sizeClaims) {
    for (const m of text.matchAll(re)) {
      const near = text.slice(Math.max(0, m.index! - 200), m.index! + m[0].length + 140);
      const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 140);
      if (qualifier.test(after) || competitor.test(near) || uiLabel.test(near)) continue;
      found.push(`${name}: …${text.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 60)}…`);
    }
  }
  // "Works offline" always says when: after a visit or a first use, or once loaded.
  for (const m of text.matchAll(/\b(works|(keeps?|keeping) working) offline\b/gi)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 12);
    const before = text.slice(Math.max(0, m.index! - 90), m.index!).split(/[.!?]\s/).pop()!;
    if (/^ (after|once)\b/i.test(after) || competitor.test(text.slice(Math.max(0, m.index! - 120), m.index!)) || /\b(after|once|first)\b/i.test(before)) continue;
    found.push(`bare works offline: …${text.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 40)}…`);
  }
  return found;
}

test('no page makes an unqualified size-limit or bare offline claim about Stayput', () => {
  expect(pages.length).toBe(tools.length + pairs.length + presets.length + guides.length);
  const bad = pages.flatMap(({ path }) => claimsIn(html(path)).map((c) => `${path} ${c}`));
  expect(bad).toEqual([]);
});

test('the home, about, press, guides index and llms.txt make none either', () => {
  const read = (file: string) => readFileSync(new URL(file, dist), 'utf8');
  const bad = ['index.html', 'about.html', 'press.html', 'guides.html', 'conversions.html', 'privacy.html', 'terms.html', 'llms.txt'].flatMap((f) => claimsIn(read(f)).map((c) => `${f} ${c}`));
  expect(bad).toEqual([]);
});

test('the guard catches the claims it is meant to catch', () => {
  for (const s of [
    '<p>No size caps, no watermark.</p>',
    '<p>There is no file size limit.</p>',
    '<p>Unlimited files for free.</p>',
    '<p>Fast, and it works offline.</p>',
    '<li>Works offline</li>',
    '<p>Convert files of any size.</p>',
  ]) expect(claimsIn(s), s).not.toEqual([]);
  for (const s of [
    '<p>No file size caps beyond what your device can hold.</p>',
    '<li>Works offline after first visit</li>',
    '<p>After one visit the page works offline.</p>',
    '<p>Smallpdf offers unlimited use on a paid plan.</p>',
  ]) expect(claimsIn(s), s).toEqual([]);
});

test('every tool page badge row names its offline condition and has a real size badge', () => {
  for (const { path, base, sizeFact, kind } of pages.filter((p) => p.kind !== 'guide')) {
    const page = html(path);
    const row = /<ul class="facts">([\s\S]*?)<\/ul>/.exec(page)?.[1];
    expect(row, path).toBeTruthy();
    const items = [...row!.matchAll(/<li>[\s\S]*?<\/svg>\s*([^<]*)<\/li>/g)].map((m) => m[1]!.trim());
    expect(items, path).toHaveLength(4);
    expect(items[1], path).toBe(offlineBadge(base));
    expect(items[1], path).toMatch(/^Works offline after first (visit|use)$/);
    expect(items[3], path).toBe(sizeFact ?? defaultSizeBadge);
    expect(items[3], `${path} (${kind})`).not.toMatch(/no size|unlimited|caps?\b(?!.*memory)/i);
  }
});

test('a tool that loads an engine on first run has the "first use" badge', () => {
  // Source files that fetch a model or engine only when it is used; the page is not offline-ready from the visit alone.
  const engines = /vendorEntry\(|vendorDir\((?!'(heic|jxl|avif)')|encodeMp3|convertAudio|findFaces|from '\.\.\/lib\/(ocr|unlock|checksum|background|upscale|inpaint|face-track|vocals)/;
  const files = readdirSync(new URL('../src/tools/', import.meta.url)).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const slug = f.replace(/\.ts$/, '');
    if (!tools.some((t) => t.slug === slug)) continue;
    if (engines.test(readFileSync(new URL(`../src/tools/${f}`, import.meta.url), 'utf8'))) {
      expect(offlineBadge(slug), slug).toBe('Works offline after first use');
    }
  }
});
