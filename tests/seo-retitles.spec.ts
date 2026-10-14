import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Reads the built HTML: the retitled tool pages carry exactly this title, heading and description.
const dist = new URL('../dist/', import.meta.url);
const decode = (s: string) => s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const page = (path: string) => readFileSync(new URL(`${path.slice(1)}.html`, dist), 'utf8');
const title = (h: string) => decode(/<title>([^<]*)<\/title>/.exec(h)![1]!);
const meta = (h: string) => decode(/<meta name="description" content="([^"]*)"/.exec(h)![1]!);
const h1s = (h: string) => [...h.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => decode(m[1]!));

const pages = [
  {
    path: '/tools/video-to-mp3',
    title: 'MP3 Converter: Any Video or Audio to MP3, No Upload | Stayput',
    h1: 'MP3 converter: turn any video or audio file into MP3',
    meta: 'Free MP3 converter in your browser: turn MP4, MOV, WebM, M4A, WAV, FLAC or other audio and video into MP3. Pick 96 to 320 kbps. Nothing is uploaded; no sign-up.',
  },
  {
    path: '/tools/heic-to-jpg',
    title: 'Online HEIC to JPG Converter: Free, Batch, No Upload | Stayput',
    h1: 'Convert HEIC to JPG online',
    meta: 'Online HEIC to JPG converter: turn iPhone HEIC photos into JPG or PNG in your browser. Drop many at once, keep or drop location data. Nothing is uploaded; no watermark.',
  },
  {
    path: '/tools/remove-background',
    title: 'Background Remover: Free, No Upload, Full Resolution | Stayput',
    h1: 'Free background remover for photos',
    meta: 'Free background remover in your browser: transparent PNG, white or coloured background, or blur. Full resolution, no watermark. Your photo is never uploaded.',
  },
];

for (const p of pages) {
  test(`${p.path} has its retitled title, heading and description`, () => {
    const h = page(p.path);
    expect(title(h)).toBe(p.title);
    expect(h1s(h)).toEqual([p.h1]);
    expect(meta(h)).toBe(p.meta);
  });
}

test('video to MP3 stays findable and the neighbouring pages keep their titles', () => {
  expect(`${title(page('/tools/video-to-mp3'))} ${meta(page('/tools/video-to-mp3'))}`).toMatch(/video (or audio )?(file )?(and audio )?to MP3|video to mp3/i);
  expect(title(page('/mp4-to-mp3'))).toBe('MP4 to MP3 Converter: Free, Private, No Upload | Stayput');
  for (const slug of ['mov-to-mp3', 'wav-to-mp3', 'm4a-to-mp3']) expect(title(page(`/${slug}`)).toLowerCase()).not.toContain('mp3 converter: any');
});

test('the new inbound links resolve to pages that exist and use the target anchors', () => {
  const link = (path: string, href: string, anchor: string) => expect(page(path), `${path} -> ${href}`).toMatch(new RegExp(`<a href="${href}"[^>]*>${anchor}</a>`));
  for (const path of ['/heif-to-jpg', '/heic-to-png', '/tools/convert-image', '/guides/which-image-format-to-use']) link(path, '/tools/heic-to-jpg', 'HEIC to JPG converter');
  for (const path of ['/mp4-to-mp3', '/wav-to-mp3', '/flac-to-mp3', '/tools/audio-converter']) link(path, '/tools/video-to-mp3', 'MP3 converter');
  for (const path of ['/tools/convert-image', '/guides/which-image-format-to-use', '/2x2-photo']) link(path, '/tools/remove-background', 'background remover');
});
