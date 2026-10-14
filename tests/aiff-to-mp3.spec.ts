// @webkit-project
import { test, expect, type Page } from '@playwright/test';

import { aiff } from './aiff-helpers';

const CASES = [
  { name: 'stereo16.aiff', file: aiff({ channels: 2, bits: 16, rate: 44100, seconds: 1.5 }), seconds: 1.5, channels: 2 },
  { name: 'mono16-48k.aif', file: aiff({ channels: 1, bits: 16, rate: 48000, seconds: 1.5 }), seconds: 1.5, channels: 1 },
  { name: 'stereo24.aiff', file: aiff({ channels: 2, bits: 24, rate: 44100, seconds: 1.5 }), seconds: 1.5, channels: 2 },
  { name: 'sowt.aifc', file: aiff({ channels: 2, bits: 16, rate: 44100, seconds: 1.5, aifc: 'sowt' }), seconds: 1.5, channels: 2 },
  { name: 'none.aifc', file: aiff({ channels: 2, bits: 16, rate: 44100, seconds: 1.5, aifc: 'NONE' }), seconds: 1.5, channels: 2 },
];

async function convert(page: Page, name: string, buffer: Buffer) {
  await page.goto('/aiff-to-mp3');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#format')).toHaveValue('mp3');
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'audio/aiff', buffer });
  const download = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
  await page.locator('#run').click();
  const got = await Promise.race([download, page.locator('#error.is-active').waitFor({ timeout: 30_000 }).then(() => null)]);
  if (!got) return { error: await page.locator('#error').innerText() };
  const stream = await got.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { filename: got.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

async function mp3Info(page: Page, bytes: Buffer) {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const buf = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(arr.buffer);
    const d = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i]! * d[i]!;
    return { duration: buf.duration, rms: Math.sqrt(sum / d.length) };
  }, bytes.toString('base64'));
}

test.describe('AIFF to MP3', () => {
  for (const c of CASES) {
    test(`${c.name} becomes an MP3 that plays at the right length`, async ({ page }) => {
      const out = await convert(page, c.name, c.file);
      expect('error' in out ? out.error : '', 'page reported a read error').toBe('');
      if ('error' in out) return;
      expect(out.filename).toBe(c.name.replace(/\.(aiff?|aifc)$/, '.mp3'));
      expect(out.bytes[0]).toBe(0xff);
      expect(out.bytes[1]! & 0xe0).toBe(0xe0);
      const info = await mp3Info(page, out.bytes);
      expect(info.duration).toBeGreaterThan(c.seconds - 0.15);
      expect(info.duration).toBeLessThan(c.seconds + 0.15);
      expect(info.rms).toBeGreaterThan(0.05);
    });
  }
});
