import { test, expect } from '@playwright/test';
import { allowServiceWorker } from './allow-sw';

/** The LAME encoder is warmed on every page that can write MP3, so "after one visit" holds for the default MP3 output. */
test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ context }) => allowServiceWorker(context));

/** Two seconds of a 440 Hz tone as a 16-bit mono WAV. */
function tone(): Buffer {
  const rate = 44100;
  const n = rate * 2;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return b;
}

test('after one visit Trim audio writes MP3 offline', async ({ page, context }) => {
  await page.goto('/tools/trim-audio');
  await expect(page.locator('html')).toHaveAttribute('data-decoders', 'cached', { timeout: 60_000 });
  const cached = await page.evaluate(async () => (await (await caches.open('stayput-assets')).keys()).map((r) => new URL(r.url).pathname));
  expect(cached.some((p) => /\/vendor\/wasm-media-encoders@[^/]+\/mp3\.wasm$/.test(p))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#format')).toHaveValue('mp3');
  await page.locator('#file-input').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: tone() });
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await page.locator('#run').click();
  const got = await download;
  expect(got.suggestedFilename()).toMatch(/\.mp3$/);
  const stream = await got.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(1000);
  // An MP3 starts with an ID3 tag or an MPEG frame sync.
  expect(bytes[0] === 0x49 || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)).toBe(true);
});
