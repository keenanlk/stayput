import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Reads the built HTML: the exact <title> of 57 pages, and the headings and FAQ
// text added by the same copy batch.
const dist = new URL('../dist/', import.meta.url);

const decode = (s: string) =>
  s.replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const html = (path: string) => readFileSync(new URL(`${path.slice(1)}.html`, dist), 'utf8');
const textOf = (page: string) =>
  decode(page.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<\/?(?:a|strong|em|code|b|i|span)(?:\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ');

const titles = readFileSync(new URL('./seo-copy-batch-titles.txt', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((l) => l.split('\t') as [string, string]);

test('57 pages carry the exact title, 30 to 60 characters', () => {
  expect(titles).toHaveLength(57);
  for (const [path, title] of titles) {
    expect(title.length, `${path}: ${title.length} characters`).toBeGreaterThanOrEqual(30);
    expect(title.length, `${path}: ${title.length} characters`).toBeLessThanOrEqual(60);
    const m = html(path).match(/<title>([^<]*)<\/title>/);
    expect(m, path).not.toBeNull();
    expect(decode(m![1]!), path).toBe(title);
  }
});

const wanted: { path: string; headings: string[]; texts: string[]; h1?: string; description?: string }[] = [
  { path: '/combine-videos', headings: ['Join clips into one video'], texts: ['How do I add video clips together?', 'Drop two or more clips, drag them into the order you want and save one MP4. The clips are joined end to end on this device; nothing is uploaded. This page joins clips; it does not trim them, so cut each clip first if you need to.'] },
  { path: '/guides/how-to-merge-multiple-videos-into-one', headings: ['Put two or three video clips together'], texts: ['How do I put two video clips together?', 'How do I turn several videos into one?', 'How do I put three or more videos together?'] },
  { path: '/guides/how-to-view-photo-metadata', headings: ['See EXIF data on a Mac'], texts: ['How do I see the date a photo was taken?', 'Open the photo\'s EXIF data and look for Date Taken. On an iPhone, swipe up on the photo in Photos; on a Mac, open it in Preview and choose Tools, then Show Inspector. To read it without uploading the photo, use the [EXIF viewer](/tools/exif-viewer).'] },
  { path: '/guides/how-to-resize-an-image-to-exact-pixels', headings: ['Resize an image to specific pixels'], texts: ['How do I reduce an image\'s pixels?', 'Enter a smaller width and height in pixels than the picture has now and keep the aspect ratio locked so it is not stretched. The resize runs on your device and nothing is uploaded.'] },
  { path: '/guides/how-to-remove-audio-from-a-video', headings: ['How to remove the audio from a video on iPhone'], texts: ['How do I share a video without sound?', 'Remove the audio track first so the file itself is silent, then send the new file; muting at playback does not change what you send.', 'Can I remove the audio from a MOV?', 'Yes. A MOV from an iPhone or Mac works in the [remove audio tool](/remove-audio-from-video); the new file has no audio track.'] },
  { path: '/guides/open-heic-files-on-windows', headings: ['How to open a HEIC file on a PC'], texts: ['What can open HEIC files?', 'or convert them to JPG with the [HEIC to JPG tool](/tools/heic-to-jpg)'] },
  { path: '/extract-frames-from-video', headings: [], texts: ['Can I extract frames from a YouTube video?', 'This tool works on a video file on your device; it does not fetch YouTube links. If you have the video file, drop it here and save every frame, or a few per second, as JPG or PNG images in one zip. Nothing is uploaded.'] },
  { path: '/mov-to-gif', headings: ['Convert MOV to GIF on a Mac'], texts: ['A Mac screen recording or a QuickTime recording is a .mov file. Drop it here, trim it, set the size and save a GIF. It all happens in this tab.'] },
  { path: '/tools/compress-gif', headings: [], h1: 'Compress a GIF for Discord, Slack or email', texts: [] },
  { path: '/tools/video-to-mp4', headings: [], texts: ['Is there a file size limit when I convert WebM to MP4?', 'We set no limit and nothing is uploaded; the limit is your device\'s memory, so a phone handles smaller files than a computer.'] },
  { path: '/tools/color-picker', headings: [], h1: 'Free color picker from an image', texts: [] },
  { path: '/compress-image-to-1mb', headings: [], texts: [], description: '1 MB image compressor: bring phone photos under 1 MB for web forms, job boards and CMS uploads, keeping full-screen quality. Batch, in your browser, no upload.' },
  { path: '/compress-image-to-2mb', headings: [], texts: ['How do I convert a photo to 2 MB?', 'Drop the photo and the page lowers its file size to fit under 2 MB. It works on file size, not on the pixel dimensions.'] },
  { path: '/resize-image-to-1920x1080', headings: [], texts: ['How do I convert an image to 1920x1080?', 'Drop the image; it is resized to exactly 1920×1080 pixels (1920x1080 in plain text). Choose whether to crop to fill or add bars. It runs on your device; nothing is uploaded.'] },
  { path: '/guides/how-to-add-music-to-a-video', headings: ['Add an audio file or audio track to a video'], texts: [] },
  { path: '/guides/how-to-add-a-watermark-to-a-photo', headings: ['Add a copyright notice to a photo'], texts: ['How do I add copyright to a photo?', 'Use a text watermark such as © and your name. It is visible on the picture; it does not register or prove copyright.'] },
  { path: '/guides/how-to-record-your-screen', headings: [], texts: ['How do I save a screen recording?', 'Press Stop, then save: the recording downloads to your device as MP4 or WebM. Nothing is uploaded.'] },
  { path: '/watermark-id-copy', headings: [], h1: 'Watermark a copy of your ID or passport', texts: [] },
];

test('W1-W17 headings, FAQ and meta text are on the built pages', () => {
  expect(wanted.length).toBeGreaterThanOrEqual(17);
  for (const w of wanted) {
    const page = html(w.path);
    const text = textOf(page);
    expect([...page.matchAll(/<h1[\s>]/g)], `${w.path}: one H1`).toHaveLength(1);
    for (const h of w.headings) {
      expect(page, `${w.path}: H2 ${h}`).toMatch(new RegExp(`<h2[^>]*>\\s*${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</h2>`));
    }
    if (w.h1) expect(textOf(page.match(/<h1[\s\S]*?<\/h1>/)![0]).trim(), w.path).toBe(w.h1);
    for (const t of w.texts) expect(text, `${w.path}: ${t}`).toContain(plain(t));
    if (w.description) expect(decode(page.match(/<meta name="description" content="([^"]*)"/)![1]!), w.path).toBe(w.description);
  }
});
