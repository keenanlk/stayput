// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Unreadable files, on one tool per family: what each odd file ends as. Every file is made here (cut, renamed or built byte by byte) from a
// small committed fixture or from nothing. Each row says where it was stopped ('add' = refused when added, 'run' = failed when Run was pressed),
// the class a failed run records, and (BASELINE=file) appends what it actually got to a file, so the same spec can be run on main for the before column.
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url)));
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> => page.evaluate(() => JSON.parse(sessionStorage.getItem('__ev') || '[]'));

async function open(page: Page, path: string) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.umami={track:(n,d)=>{const a=JSON.parse(sessionStorage.getItem('__ev')||'[]');a.push({n,d});sessionStorage.setItem('__ev',JSON.stringify(a));}};`,
    }),
  );
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

interface Outcome {
  at: 'add' | 'run' | 'ran';
  cls: string;
}

/** Adds the file and, when it is not refused, presses Run. Reports where it stopped and under what class. */
async function attempt(page: Page, path: string, file: { name: string; mimeType: string; buffer: Buffer }, before?: () => Promise<void>): Promise<Outcome> {
  await open(page, path);
  await before?.();
  await page.locator('#file-input').setInputFiles([file]);
  const hint = page.locator('#run-hint');
  const shellRefusal = page.locator('#error.is-active');
  await expect
    .poll(async () => ((await hint.getAttribute('data-problem')) ? 'problem' : (await shellRefusal.count()) ? 'refused' : (await page.locator('#run').isEnabled()) ? 'enabled' : ''), { timeout: 30_000 })
    .not.toBe('');
  // An empty file is turned away by the shell itself when it is picked, with words of its own and no run.
  if (await shellRefusal.count()) {
    await expect(shellRefusal).toContainText('empty (0 bytes)');
    expect((await events(page)).filter((e) => e.n === 'tool_run')).toHaveLength(0);
    return { at: 'add', cls: 'EmptyAtPick' };
  }
  const problem = await hint.getAttribute('data-problem');
  if (problem) return { at: 'add', cls: problem };
  return runIt(page);
}

async function runIt(page: Page): Promise<Outcome> {
  await page.locator('#run').click();
  await expect.poll(async () => (await events(page)).filter((e) => e.n === 'tool_run').length, { timeout: 90_000 }).toBeGreaterThan(0);
  const d = (await events(page)).filter((e) => e.n === 'tool_run')[0]!.d;
  return d.outcome === 'ok' ? { at: 'ran', cls: 'ok' } : { at: 'run', cls: d.error_class ?? '?' };
}

// --- files made here ---------------------------------------------------------------------------------------------
const u32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const box = (type: string, body: Buffer) => Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]);
const FTYP = box('ftyp', Buffer.concat([Buffer.from('isom'), u32(512), Buffer.from('isomiso2mp41')]));
const noise = (n: number) => Buffer.alloc(n, 0xab);
/** An MP4 whose index (moov) was never written: the start of a recording cut off by a crash. */
const mp4NoMoov = Buffer.concat([FTYP, box('mdat', noise(90_000))]);
const mp4Junk = Buffer.concat([FTYP, noise(90_000)]);
/** A Matroska file with its header and an empty segment: no tracks. */
const mkvNoTracks = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x8b, 0x42, 0x82, 0x88]), Buffer.from('matroska'), Buffer.from([0x18, 0x53, 0x80, 0x67, 0x80])]);
const text = Buffer.from('Notes for Monday.\nBuy milk, call the plumber, send the invoice.\n'.repeat(40));
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const le = (n: number, bytes: number) => Buffer.from(Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 255));
/** A small ZIP with one stored file. */
function zip(): Buffer {
  const data = Buffer.from('hello from a zip file\n'.repeat(200));
  const name = Buffer.from('hello.txt');
  const local = Buffer.concat([Buffer.from('PK\x03\x04'), le(20, 2), le(0, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc(data), 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), name, data]);
  const central = Buffer.concat([Buffer.from('PK\x01\x02'), le(20, 2), le(20, 2), le(0, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc(data), 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), name]);
  const end = Buffer.concat([Buffer.from('PK\x05\x06'), le(0, 2), le(0, 2), le(1, 2), le(1, 2), le(central.length, 4), le(local.length, 4), le(0, 2)]);
  return Buffer.concat([local, central, end]);
}
const PDF_NO_PAGES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const cut = (b: Buffer, at: number) => b.subarray(0, at);
const corruptMiddle = (b: Buffer) => {
  const out = Buffer.from(b);
  for (let i = Math.floor(out.length * 0.4); i < Math.floor(out.length * 0.4) + 200 && i < out.length; i++) out[i] = (i * 31) & 255;
  return out;
};

const png = fixture('logo-red.png');
const jpg = fixture('face.jpg');
const gif = fixture('wide-flat.gif');
const heic = fixture('tiny.heic');
const f = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });

const VIDEO = '/tools/resize-video';
const IMAGE = '/tools/compress-image';
const PDFT = '/tools/compress-pdf';
const AUDIO = '/tools/compress-audio';
const GIFT = '/tools/compress-gif';
const ARCHIVE = '/tools/archive-extractor';

interface Row {
  id: string;
  path: string;
  file: ReturnType<typeof f>;
  /** Expected on this branch. */
  expect: Outcome;
}
const ROWS: Row[] = [
  { id: 'video-0-byte', path: VIDEO, file: f('empty.mp4', 'video/mp4', Buffer.alloc(0)), expect: { at: 'add', cls: 'EmptyAtPick' } },
  { id: 'image-0-byte', path: IMAGE, file: f('empty.jpg', 'image/jpeg', Buffer.alloc(0)), expect: { at: 'add', cls: 'EmptyAtPick' } },
  { id: 'pdf-0-byte', path: PDFT, file: f('empty.pdf', 'application/pdf', Buffer.alloc(0)), expect: { at: 'add', cls: 'EmptyAtPick' } },
  { id: 'audio-0-byte', path: AUDIO, file: f('empty.mp3', 'audio/mpeg', Buffer.alloc(0)), expect: { at: 'add', cls: 'EmptyAtPick' } },
  { id: 'mp4-no-moov', path: VIDEO, file: f('cut.mp4', 'video/mp4', mp4NoMoov), expect: { at: 'run', cls: 'ContainerParseFailed' } },
  { id: 'mp4-ftyp-junk', path: VIDEO, file: f('junk.mp4', 'video/mp4', mp4Junk), expect: { at: 'run', cls: 'ContainerParseFailed' } },
  { id: 'mkv-no-tracks', path: VIDEO, file: f('empty.mkv', 'video/x-matroska', mkvNoTracks), expect: { at: 'run', cls: 'ContainerParseFailed' } },
  { id: 'avi-as-mp4', path: VIDEO, file: f('old.mp4', 'video/mp4', cut(fixture('blur-edge.avi'), 4096)), expect: { at: 'add', cls: 'UnsupportedContainer' } },
  { id: 'wmv-as-mp4', path: VIDEO, file: f('old.mp4', 'video/mp4', cut(fixture('blur-edge.wmv'), 4096)), expect: { at: 'add', cls: 'UnsupportedContainer' } },
  { id: 'flv-as-mp4', path: VIDEO, file: f('old.mp4', 'video/mp4', cut(fixture('blur-edge.flv'), 4096)), expect: { at: 'add', cls: 'UnsupportedContainer' } },
  { id: 'text-as-mp4', path: VIDEO, file: f('notes.mp4', 'video/mp4', text), expect: { at: 'add', cls: 'NotAVideoContainer' } },
  { id: 'text-as-mp3', path: AUDIO, file: f('notes.mp3', 'audio/mpeg', text), expect: { at: 'add', cls: 'NotAnAudioFile' } },
  { id: 'png-as-jpg', path: IMAGE, file: f('photo.jpg', 'image/jpeg', png), expect: { at: 'ran', cls: 'ok' } },
  { id: 'heic-as-jpg', path: IMAGE, file: f('photo.jpg', 'image/jpeg', heic), expect: { at: 'ran', cls: 'ok' } },
  { id: 'jpeg-truncated', path: IMAGE, file: f('cut.jpg', 'image/jpeg', cut(jpg, Math.floor(jpg.length * 0.5))), expect: { at: 'ran', cls: 'ok' } },
  { id: 'png-truncated', path: IMAGE, file: f('cut.png', 'image/png', cut(png, Math.floor(png.length * 0.5))), expect: { at: 'ran', cls: 'ok' } },
  { id: 'text-as-jpg', path: IMAGE, file: f('notes.jpg', 'image/jpeg', text), expect: { at: 'run', cls: 'NotAnImageFile' } },
  { id: 'pdf-as-jpg', path: IMAGE, file: f('doc.jpg', 'image/jpeg', PDF_NO_PAGES), expect: { at: 'run', cls: 'NotAnImageFile' } },
  { id: 'gif-broken-frame', path: GIFT, file: f('broken.gif', 'image/gif', corruptMiddle(gif)), expect: { at: 'ran', cls: 'ok' } },
  { id: 'gif-truncated', path: GIFT, file: f('cut.gif', 'image/gif', cut(gif, Math.floor(gif.length * 0.5))), expect: { at: 'ran', cls: 'ok' } },
  { id: 'png-as-gif', path: GIFT, file: f('photo.gif', 'image/gif', png), expect: { at: 'run', cls: 'NotAGif' } },
  { id: 'pdf-no-page-tree', path: PDFT, file: f('nopages.pdf', 'application/pdf', PDF_NO_PAGES), expect: { at: 'run', cls: 'PdfNoPages' } },
  { id: 'pdf-text-named-pdf', path: PDFT, file: f('notes.pdf', 'application/pdf', text), expect: { at: 'run', cls: 'NotAPdfFile' } },
  { id: 'pdf-truncated', path: PDFT, file: f('cut.pdf', 'application/pdf', cut(fixture('owner-locked.pdf'), 400)), expect: { at: 'run', cls: 'FileTruncated' } },
  { id: 'zip-truncated', path: ARCHIVE, file: f('cut.zip', 'application/zip', cut(zip(), 120)), expect: { at: 'run', cls: 'FileTruncated' } },
  { id: 'zip-0-byte', path: ARCHIVE, file: f('empty.zip', 'application/zip', Buffer.alloc(0)), expect: { at: 'add', cls: 'EmptyAtPick' } },
];

test.describe('what each odd file ends as', () => {
  test.setTimeout(240_000);
  for (const row of ROWS) {
    test(row.id, async ({ page, browserName }) => {
      const got = await attempt(page, row.path, row.file);
      if (process.env.BASELINE) {
        appendFileSync(process.env.BASELINE, `${browserName}\t${row.id}\t${got.at}\t${got.cls}\n`);
        return;
      }
      expect(got).toEqual(row.expect);
    });
  }
});

// A first read the phone refuses, in an image tool: the second read goes through. A read that fails every time ends as UnreadableFileGone.
test.describe('a first read the phone refuses', () => {
  test.setTimeout(120_000);
  const stub = (mode: 'once' | 'always') => async (page: Page) => {
    await page.evaluate((m) => {
      const w = window as unknown as { __thrown: number };
      w.__thrown = 0;
      const slice = Blob.prototype.slice;
      Blob.prototype.slice = function (...a: Parameters<Blob['slice']>) {
        const b = slice.apply(this, a);
        if (this instanceof File && this.name === 'photo.png' && (m === 'always' || w.__thrown === 0)) {
          w.__thrown++;
          b.arrayBuffer = () => Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError'));
        }
        return b;
      };
    }, mode);
  };
  for (const [mode, expected] of [
    ['once', { at: 'ran', cls: 'ok' }],
    ['always', { at: 'run', cls: 'UnreadableFileGone' }],
  ] as const) {
    test(`image tool, ${mode}`, async ({ page, browserName }) => {
      await open(page, IMAGE);
      await page.locator('#file-input').setInputFiles([f('photo.png', 'image/png', png)]);
      await expect(page.locator('#run')).toBeEnabled();
      await stub(mode)(page);
      const got = await runIt(page);
      if (process.env.BASELINE) return void appendFileSync(process.env.BASELINE, `${browserName}\tslice-${mode}\t${got.at}\t${got.cls}\n`);
      expect(got).toEqual(expected);
      expect(await page.evaluate(() => (window as unknown as { __thrown: number }).__thrown)).toBeGreaterThan(0);
    });
  }
});
