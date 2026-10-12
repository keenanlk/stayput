import { expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import UPNG from 'upng-js';

// Shared by the scanner's camera specs. Chromium's fake camera plays a video file of a QR
// code (or of nothing) as the webcam, so getUserMedia, the frame loop, the reader and the
// cleanup are all real. WebKit has no fake camera, so these specs run in Chromium only.

export const url = (JSON.parse(readFileSync(new URL('./fixtures/qr/texts.json', import.meta.url), 'utf8')) as Record<string, string>).url!;

/** A y4m (raw I420 video) the fake camera loops: a QR code on white, or only white. */
function makeY4m(path: string, qrPng?: string) {
  const W = 640;
  const H = 480;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  if (qrPng) {
    const file = readFileSync(qrPng);
    const png = UPNG.decode(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    const src = new Uint8Array(UPNG.toRGBA8(png)[0]!);
    const size = 360;
    const x0 = (W - size) / 2;
    const y0 = (H - size) / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = (Math.floor((y * png.height) / size) * png.width + Math.floor((x * png.width) / size)) * 4;
        const d = ((y0 + y) * W + x0 + x) * 3;
        rgb[d] = src[s]!;
        rgb[d + 1] = src[s + 1]!;
        rgb[d + 2] = src[s + 2]!;
      }
    }
  }
  const Y = new Uint8Array(W * H);
  const U = new Uint8Array((W / 2) * (H / 2));
  const V = new Uint8Array((W / 2) * (H / 2));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = rgb[i]!;
      const g = rgb[i + 1]!;
      const b = rgb[i + 2]!;
      Y[y * W + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      if (y % 2 === 0 && x % 2 === 0) {
        const c = (y / 2) * (W / 2) + x / 2;
        U[c] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
        V[c] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
      }
    }
  }
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, U, V]);
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: 5 }, () => frame)]));
}

const dir = join(tmpdir(), 'stayput-qr-scan-camera');
mkdirSync(dir, { recursive: true });
export const qrVideo = join(dir, 'fake-qr.y4m');
export const blankVideo = join(dir, 'fake-blank.y4m');
if (!existsSync(qrVideo)) makeY4m(qrVideo, fileURLToPath(new URL('./fixtures/qr/qr_url.png', import.meta.url)));
if (!existsSync(blankVideo)) makeY4m(blankVideo);

export const launch = (video: string) => ({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
});

export type Ev = { n: string; d: Record<string, string> };
export const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Ev[] }).__events);

/** The self-hosted analytics script replaced by one that records events; every request noted. */
export async function prepare(page: Page, init?: (arg: string) => void, arg?: string) {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.route('https://stats.keenankaufman.com/**', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.__events=[];window.umami={track:(n,d)=>window.__events.push({n,d})};' }),
  );
  // Count getUserMedia calls and keep every stream it hands out.
  await page.addInitScript(() => {
    const w = window as unknown as { __gum: number; __streams: MediaStream[] };
    w.__gum = 0;
    w.__streams = [];
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) return;
    const real = md.getUserMedia.bind(md);
    md.getUserMedia = async (c?: MediaStreamConstraints) => {
      w.__gum++;
      const s = await real(c);
      w.__streams.push(s);
      return s;
    };
  });
  if (init) await page.addInitScript(init, arg);
  const seen: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tools/qr-code-scanner');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return { seen, errors };
}

export const liveTracks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length);
export const gumCalls = (page: Page) => page.evaluate(() => (window as unknown as { __gum: number }).__gum);

