// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// File intake: when a file is added, the page looks at its first bytes. A cloud placeholder (all zero bytes) or a container the tool
// has no reader for is said before Run, with a named class, and Run stays off. MPEG-TS clips are read by the video tools.
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
const generated = (name: string) => fileURLToPath(new URL(`./fixtures/generated/${name}`, import.meta.url));
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

const VIDEO_TOOLS = ['/tools/trim-video', '/tools/mute-video'];

test.describe('a container the tool cannot open is said before Run', () => {
  const cases: [string, string, string, string | null][] = [
    ['AVI', 'blur-edge.avi', 'video/x-msvideo', '/avi-to-mp4'],
    ['FLV', 'blur-edge.flv', 'video/x-flv', '/flv-to-mp4'],
    ['WMV', 'blur-edge.wmv', 'video/x-ms-wmv', null],
  ];
  for (const [label, name, type, href] of cases) {
    test(`${label} on a video tool: UnsupportedContainer, Run off${href ? ', converter link works' : ', no link (that converter is on hold)'}`, async ({ page }) => {
      await open(page, VIDEO_TOOLS[0]!);
      await page.locator('#file-input').setInputFiles([{ name, mimeType: type, buffer: readFileSync(fixture(name)) }]);
      const hint = page.locator('#run-hint');
      await expect(hint).toBeVisible();
      await expect(hint).toHaveAttribute('data-problem', 'UnsupportedContainer');
      await expect(hint).toContainText(label);
      await expect(page.locator('#run')).toBeDisabled();
      if (href) {
        const link = hint.locator('a');
        await expect(link).toHaveAttribute('href', href);
        const res = await page.request.get(href);
        expect(res.status()).toBe(200);
      } else {
        await expect(hint.locator('a')).toHaveCount(0);
      }
      // Removing the file lifts it.
      await page.locator('#clear').click();
      await expect(hint).toBeHidden();
    });
  }

  test('the same AVI is not refused on the AVI to MP4 page, which reads it', async ({ page }) => {
    await open(page, '/avi-to-mp4');
    await page.locator('#file-input').setInputFiles([{ name: 'blur-edge.avi', mimeType: 'video/x-msvideo', buffer: readFileSync(fixture('blur-edge.avi')) }]);
    await expect(page.locator('#run')).toBeEnabled();
    await expect(page.locator('#run-hint')).not.toHaveAttribute('data-problem', /.+/);
  });

  test('a WMA given to an audio tool is not mistaken for a WMV', async ({ page }) => {
    await open(page, '/tools/video-to-mp3');
    const wmv = readFileSync(fixture('blur-edge.wmv'));
    await page.locator('#file-input').setInputFiles([{ name: 'song.wma', mimeType: 'audio/x-ms-wma', buffer: wmv }]);
    await expect(page.locator('#run')).toBeEnabled();
  });
});

test.describe('a file that is not on the device is said before Run', () => {
  test('an all-zero 2 MB .mp4 is FileNotDownloaded, with the save-it-first steps', async ({ page }) => {
    await open(page, VIDEO_TOOLS[0]!);
    await page.locator('#file-input').setInputFiles([{ name: 'IMG_0001.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(2 * 1024 * 1024) }]);
    const hint = page.locator('#run-hint');
    await expect(hint).toHaveAttribute('data-problem', 'FileNotDownloaded');
    await expect(hint).toContainText('Google Photos');
    await expect(hint).toContainText('Drive');
    await expect(hint).toContainText('Chromebook');
    await expect(page.locator('#run')).toBeDisabled();
  });

  test('a file that fails to read at byte 0 on a small file is FileNotDownloaded too', async ({ page }) => {
    await page.addInitScript(() => {
      const { slice } = Blob.prototype;
      Blob.prototype.slice = function (this: Blob, ...a: [number?, number?, string?]) {
        const out = slice.apply(this, a);
        if ((a[0] ?? 0) === 0 && this instanceof File) out.arrayBuffer = () => Promise.reject(new DOMException('The requested file could not be read.', 'NotReadableError'));
        return out;
      };
    });
    await open(page, VIDEO_TOOLS[0]!);
    await page.locator('#file-input').setInputFiles(generated('tone.wav'));
    await expect(page.locator('#run-hint')).toHaveAttribute('data-problem', 'FileNotDownloaded');
    await expect(page.locator('#run')).toBeDisabled();
  });

  test('a file that is fine at the start and zeros after is not refused up front', async ({ page }) => {
    await open(page, VIDEO_TOOLS[0]!);
    const real = readFileSync(fixture('iphone-portrait-person-3s.mov')).subarray(0, 8192);
    await page.locator('#file-input').setInputFiles([{ name: 'cut.mov', mimeType: 'video/quicktime', buffer: Buffer.concat([real, Buffer.alloc(1024 * 1024)]) }]);
    await expect(page.locator('#run')).toBeEnabled();
  });

  test('a disk image with zeros at the start is left alone', async ({ page }) => {
    await open(page, '/tools/file-checksum');
    await page.locator('#file-input').setInputFiles([{ name: 'disk.img', mimeType: 'application/octet-stream', buffer: Buffer.alloc(64 * 1024) }]);
    await expect(page.locator('#run-hint')).not.toHaveAttribute('data-problem', /.+/);
  });
});

test.describe('regression: ordinary files are not stopped', () => {
  const cases: [string, string, string][] = [
    ['/tools/video-to-mp3', 'video/mp4', 'clip-720p-10s.mp4'],
    ['/tools/trim-video', 'video/quicktime', 'iphone-portrait-person-3s.mov'],
    ['/tools/mute-video', 'video/webm', 'clip.webm'],
  ];
  for (const [path, type, name] of cases) {
    test(`${name} on ${path} gets Run enabled and no hint`, async ({ page }) => {
      await open(page, path);
      await page.locator('#file-input').setInputFiles([{ name, mimeType: type, buffer: readFileSync(fixture(name)) }]);
      await expect(page.locator('#run')).toBeEnabled();
      await expect(page.locator('#run-hint')).not.toHaveAttribute('data-problem', /.+/);
    });
  }
  test('a WAV on the volume booster and a JPG on an image tool pass', async ({ page }) => {
    await open(page, '/tools/volume-booster');
    await page.locator('#file-input').setInputFiles(generated('tone.wav'));
    await expect(page.locator('#run')).toBeEnabled();
    await open(page, '/tools/compress-image');
    await page.locator('#file-input').setInputFiles(generated('photo.jpg'));
    await expect(page.locator('#run')).toBeEnabled();
  });
});

test.describe('MPEG-TS clips work in the video tools', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ts-'));
  const clip = join(dir, 'clip.ts');
  test.beforeAll(() => {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=d=2:size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts', clip]);
  });
  for (const [path, name] of [['/tools/mute-video', 'clip.ts'], ['/tools/compress-video', 'clip.mts'], ['/tools/video-to-mp3', 'clip.m2ts']] as const) {
    test(`${name} completes on ${path}`, async ({ page }) => {
      test.skip(!!process.env.CI && test.info().project.name === 'webkit', 'Linux WebKit in CI cannot decode video in the page');
      await open(page, path);
      await page.locator('#file-input').setInputFiles([{ name, mimeType: '', buffer: readFileSync(clip) }]);
      await expect(page.locator('#run')).toBeEnabled();
      await page.locator('#run').click();
      await expect(page.locator('#results-list .result-item')).toBeVisible({ timeout: 90_000 });
      await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    });
  }
});
