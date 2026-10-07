import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { tools, toolPath } from '../src/data/tools';
import { pairs } from '../src/data/pairs';
import { presets } from '../src/data/presets';
import { guides } from '../src/data/guides';
import { offlineBadge, needsFirstUse, defaultSizeBadge } from '../src/data/leads';

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
// is qualified by the device's memory right next to it, or its sentence is about a competitor.
const sizeClaims: [string, RegExp][] = [
  ['no size cap', /\bno (file[- ])?size (limit|cap)s?\b/gi],
  ['no limit', /\bno limit\b/gi],
  ['unlimited', /\bunlimited\b/gi],
  ['no cap', /\bno caps?\b/gi],
  ['nothing is capped', /\bnothing is capped\b|\buncapped\b/gi],
  ['any size of file', /\b(files?|videos?|photos?|images?|pdfs?) (of|in) any size\b|\bany file size\b/gi],
];
const qualifier = /device|memory|can hold|\bhold\b/i;
const competitorName = 'smallpdf|ilovepdf|convertio|zamzar|freeconvert|pdf24|ezgif|cloudconvert|adobe scan|camscanner|loom|camtasia|otter|obs studio';
// A sentence is about a competitor only when one is its subject, i.e. it opens with the name. Naming a
// competitor somewhere in the sentence is not enough; the few other competitor statements are listed by phrase.
const competitorSubject = new RegExp(`^\\W*(${competitorName})\\b`, 'i');
const clauseBreak = /;\s|,\s(and|so|here)\b|,?\s(but|while|whereas)\b/i;
const competitorPhrases = [
  'PDF24 itself recommends its offline app', 'its private offline option, PDF24 Creator', 'PDF24 Creator for Windows', 'iLovePDF Desktop for Windows',
  "PDF24's free online tools have no size limits", 'unlimited use needs a paid plan', 'with unlimited use requiring a paid Pro plan',
  'a slider move a phone could do offline', 'a filter a phone could do offline', 'an offline or in-browser tool is the way to stay within policy',
  'iLovePDF Desktop for Windows and Mac', 'push a subscription for features like unlimited pages', 'gate features like unlimited length',
  'Does iLovePDF have an offline version', 'its offline app is the more private option',
];
// Two guide titles carry the slogan in their H1 and URL; they are listed in the build notes, not guarded.
const slogan = /alternative with no file size cap/gi;
// The compress-audio "Fit under" option is a UI label, not a claim.
const uiLabel = /Fit under/;

// Offline claims in any wording: the word itself, or the network being off, switched off or cut.
const offlineClaims: [string, RegExp][] = [
  ['offline', /\boffline\b/i],
  ['network off', /\b(network|internet|connection|wi-?fi)\b[^.!?]{0,40}\b(off|disconnected|dropped|cut|down|unplugged)\b|\b(off|disconnect(ed)?|cut|drop|unplug)\b[^.!?]{0,20}\b(the |your )?(network|internet|connection|wi-?fi)\b/i],
  ['airplane mode', /\bair-?plane mode\b/i],
  ['no connection', /\b(without|no|zero) (an? |any )?(internet|connection|network|wi-?fi)\b(?! requests?)|\bdisconnect(ed)? from the (internet|network)\b/i],
];
// What makes an offline claim honest: it says when, i.e. after a visit, a first use or a run.
const offlineWhen = /\b(after|once|following)\b[^.!?]{0,60}\b(visit|use|run|loaded|loads|downloaded|cached|download)\b|\bfirst (visit|use|run)\b|\bone (visit|run)\b/i;
// Sentences that mention offline without claiming anything about Stayput: browser API names and storage notes.
const offlineIgnore = /OfflineAudioContext|Offline storage|^To work offline|offline cache|offline caching|failed load|offline on first use/i;

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\s+[·|]\s+|<\/?(?:li|ul|ol|p|dd|dt|dl|div|section|h\d|details|summary|figcaption|td|th|tr)[^>]*>|"\s*[,}\]]+\s*[{"]?/).filter(Boolean);

/** `firstUse`: the tool fetches a model or engine when run, so a visit alone is not enough and the claim must say so. */
function claimsIn(page: string, firstUse = false): string[] {
  const text = scannable(page).replace(slogan, '');
  const found: string[] = [];
  const parts = sentences(text);
  for (const [i, whole] of parts.entries()) {
    // Only the competitor's own clause is exempt; what follows "but", "and", "while" or ";" is scanned.
    const split = competitorSubject.test(whole) ? clauseBreak.exec(whole) : null;
    const s = competitorSubject.test(whole) ? (split ? whole.slice(split.index + 1) : '') : whole;
    if (uiLabel.test(s) || /\?$/.test(s.trim()) || s.trim() === 'Offline' || competitorPhrases.some((c) => s.includes(c))) continue;
    for (const [name, re] of sizeClaims) {
      for (const m of s.matchAll(re)) {
        if (qualifier.test((s.slice(m.index! + m[0].length) + ' ' + (parts[i + 1] ?? '')).slice(0, 140))) continue;
        found.push(`${name}: …${s.slice(Math.max(0, m.index! - 60), m.index! + m[0].length + 60)}…`);
      }
    }
    if (offlineIgnore.test(s)) continue;
    if (offlineWhen.test(s)) {
      if (firstUse && offlineClaims.some(([, re]) => re.test(s)) && !/\b(first|one) (use|run)\b|\bone run\b|your first run|download|model|engine|\bMP3\b/i.test(s)) {
        found.push(`first-use tool claims offline after a visit alone: …${s.slice(0, 160)}…`);
      }
      continue;
    }
    for (const [name, re] of offlineClaims) {
      const m = re.exec(s);
      if (m) found.push(`offline claim (${name}) without a first-visit or first-use caveat: …${s.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)}…`);
    }
  }
  return found;
}

test('no page makes an unqualified size-limit or bare offline claim about Stayput', () => {
  expect(pages.length).toBe(tools.length + pairs.length + presets.length + guides.length);
  const bad = pages.flatMap(({ path, base }) => claimsIn(html(path), !!base && needsFirstUse(base)).map((c) => `${path} ${c}`));
  expect(bad).toEqual([]);
});

test('every other built page (home, about, press, privacy, hubs, conversions) and llms.txt make none either', () => {
  const covered = new Set(pages.map(({ path }) => `${path.slice(1)}.html`));
  const others = readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.html') && !covered.has(f) && f !== '404.html');
  expect(others.length).toBeGreaterThan(5);
  const bad = [...others, 'llms.txt'].flatMap((f) => claimsIn(readFileSync(new URL(f, dist), 'utf8')).map((c) => `${f} ${c}`));
  expect(bad).toEqual([]);
});

// Promises about the future and "nothing is sent" are never true of the site: it sends anonymous usage counts.
const bannedPhrases = /nothing is sent|free forever|no paid tier|will stay free|covers the domain and nothing else/i;

test('no built page or llms.txt uses a banned price or "nothing is sent" phrase', () => {
  const files = readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.html') || f === 'llms.txt');
  expect(files.length).toBeGreaterThan(400);
  const bad = files.flatMap((f) => {
    const m = bannedPhrases.exec(scannable(readFileSync(new URL(f, dist), 'utf8')));
    return m ? [`${f}: ${m[0]}`] : [];
  });
  expect(bad).toEqual([]);
  for (const s of ['Nothing is sent anywhere.', 'Free forever.', 'There is no paid tier.', 'It will stay free.']) expect(bannedPhrases.test(s), s).toBe(true);
});

test('the guard catches the claims it is meant to catch', () => {
  for (const s of [
    '<p>No size caps, no watermark.</p>',
    '<p>There is no file size limit.</p>',
    '<p>Unlimited files for free.</p>',
    '<p>Fast, and it works offline.</p>',
    '<li>Works offline</li>',
    '<p>Convert files of any size.</p>',
    '<p>This page works with your network switched off.</p>',
    '<p>The pages keep working with Wi-Fi turned off.</p>',
    '<p>You can convert with airplane mode on.</p>',
    '<p>Fast. Works without internet.</p>',
    '<p>FreeConvert caps files at 1 GB, but here there are no file size caps from a pricing plan.</p>',
  ]) expect(claimsIn(s), s).not.toEqual([]);
  for (const s of [
    '<p>No file size caps beyond what your device can hold.</p>',
    '<li>Works offline after first visit</li>',
    '<p>After one visit the page works offline.</p>',
    '<p>Smallpdf offers unlimited use on a paid plan.</p>',
    '<p>After one visit you can turn off Wi-Fi and it still works.</p>',
    '<p>After your first run the page works with the network switched off.</p>',
    '<p>Does it work offline?</p>',
  ]) expect(claimsIn(s), s).toEqual([]);
  // A tool that fetches a model or engine on first run is not offline after a visit alone.
  expect(claimsIn('<p>After one visit the page works with Wi-Fi off.</p>', true)).not.toEqual([]);
  expect(claimsIn('<p>After your first run the page works with Wi-Fi off.</p>', true)).toEqual([]);
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
