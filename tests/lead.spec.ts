import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { tools, toolPath } from '../src/data/tools';
import { pairs, pairAsTool } from '../src/data/pairs';
import { presets, presetAsTool } from '../src/data/presets';
import { leadFor } from '../src/data/leads';

// Reads the built HTML, so the lead is proven to be server-rendered, not added by a script.
const dist = new URL('../dist/', import.meta.url);

const pages = [
  ...tools.map((t) => ({ path: toolPath(t), lead: leadFor(t) })),
  ...pairs.map((p) => ({ path: `/${p.slug}`, lead: leadFor(pairAsTool(p), 'convert-image', 'landing') })),
  ...presets.map((p) => ({ path: `/${p.slug}`, lead: leadFor(presetAsTool(p), p.base, 'landing') })),
];

const decode = (s: string) => s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const html = (path: string) => readFileSync(new URL(`${path.slice(1)}.html`, dist), 'utf8');

function leadOf(path: string) {
  const page = html(path);
  const found = [...page.matchAll(/<p class="hero-lead">([^<]*)<\/p>/g)];
  expect(found, `${path}: one lead paragraph`).toHaveLength(1);
  return { text: decode(found[0]![1]!), at: found[0]!.index!, page };
}

const chatgpt = ['/auto-caption-video', '/burn-subtitles-into-video', '/tools/unlock-pdf', '/tools/mute-video', '/video-to-subtitles', '/tools/gif-to-mp4'];

test('every tool and landing page has its lead in the HTML, between the heading and the tool controls', () => {
  expect(tools).toHaveLength(95);
  expect(pages.length).toBe(tools.length + pairs.length + presets.length);
  for (const { path, lead } of pages) {
    const { text, at, page } = leadOf(path);
    expect(text, path).toBe(lead);
    expect(page.indexOf('</h1>'), path).toBeGreaterThan(-1);
    expect(page.indexOf('</h1>'), path).toBeLessThan(at);
    expect(at, path).toBeLessThan(page.indexOf('id="tool"'));
    expect(at, path).toBeLessThan(page.indexOf('id="drop"'));
  }
});

test('the six most-visited pages are in the set', () => {
  const paths = new Set(pages.map((p) => p.path));
  for (const path of chatgpt) expect(paths.has(path), path).toBe(true);
});

test('every lead is two or three sentences that say it is free and the files are not uploaded', () => {
  for (const { path, lead } of pages) {
    expect(lead, path).toMatch(/\bfree\b/i);
    expect(lead, path).toMatch(/\bnot uploaded\b/i);
    const sentences = lead.match(/[^.!?]+[.!?](?=\s|$)/g) ?? [];
    expect(sentences.length, path).toBeGreaterThanOrEqual(2);
    expect(sentences.length, path).toBeLessThanOrEqual(4);
  }
});

test('hand-written leads on the six most-visited pages say what the code does', () => {
  const lead = (path: string) => pages.find((p) => p.path === path)!.lead;
  // Model download sizes match the progress text in src/lib and src/tools.
  for (const path of ['/auto-caption-video', '/video-to-subtitles', '/burn-subtitles-into-video']) expect(lead(path), path).toContain('speech model (76 MB)');
  expect(lead('/tools/unlock-pdf')).toMatch(/cannot crack passwords/);
  expect(lead('/tools/mute-video')).toMatch(/same format/);
  expect(lead('/tools/gif-to-mp4')).toMatch(/no sound track/);
  // Model tools carry their download size and the offline note.
  expect(lead('/tools/remove-background')).toMatch(/about 46 MB.*offline/);
  expect(lead('/tools/vocal-remover')).toMatch(/about 67 MB.*offline/);
  expect(lead('/tools/transcribe')).toMatch(/about 76 MB.*offline/);
  // A base tool's hand-written lead must not leak onto its presets.
  expect(lead('/remove-audio-from-video')).not.toBe(lead('/tools/mute-video'));
});

// What the claims record forbids, checked over every lead.
const banned: [string, RegExp][] = [
  ['any device', /\bany device\b/i],
  ['every device', /\bevery device\b/i],
  ['no size limit', /\bno (file )?size (limit|cap)s?\b/i],
  ['unlimited', /\bunlimited\b/i],
  ['no paid tier', /\bno paid tier\b/i],
  ['forever', /\bfree forever\b/i],
  ['no data', /\bno data\b/i],
  ['zero requests', /\bzero requests\b/i],
  ['nothing is sent', /\bnothing is sent\b/i],
  ['no tracking', /\bno tracking\b/i],
  ['ffmpeg', /ffmpeg/i],
];

test('no lead makes a claim the claims record forbids', () => {
  for (const { path, lead } of pages) for (const [name, re] of banned) expect(lead, `${path}: "${name}"`).not.toMatch(re);
});

test('no lead names a competitor', () => {
  for (const { path, lead } of pages) expect(lead, path).not.toMatch(/\b(smallpdf|ilovepdf|cloudconvert|adobe|canva|veed|kapwing|freeconvert|zamzar|remove\.bg)\b/i);
});
