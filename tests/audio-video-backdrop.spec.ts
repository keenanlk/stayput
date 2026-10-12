import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Audio to video puts the picture over a blurred copy of itself. Safari has no canvas `filter`, so a backdrop blurred
// with it came out sharp there. A 410x512 portrait picture in the 1920x1080 frame leaves bands of backdrop at both
// sides (x 0..527 and 1392..1920): their edge energy must be far below that of the picture in the middle.
const fx = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));

test('Audio to video blurs the backdrop behind the picture, in Chromium and WebKit', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/tools/audio-to-video');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([fx('song.mp3'), fx('face.jpg')]);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 180_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const out = readFileSync(await (await download).path());

  const m = await page.evaluate(async (data) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: 'video/mp4' }));
    await new Promise((ok, no) => {
      v.onloadeddata = ok;
      v.onerror = () => no(new Error('video error ' + v.error?.code + ' ' + v.error?.message));
    });
    await new Promise<void>((ok) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          setTimeout(ok, 50);
        }
      };
      v.onseeked = finish;
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(finish);
      setTimeout(finish, 3000);
      v.currentTime = 0.3;
    });
    const c = document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, 1920, 1080);
    /** Mean squared step between horizontal neighbours in a box, and the mean brightness. */
    const edge = (x0: number, x1: number) => {
      const d = ctx.getImageData(x0, 100, x1 - x0, 880).data;
      const w = x1 - x0;
      let sum = 0;
      let n = 0;
      let bright = 0;
      for (let y = 0; y < 880; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          bright += d[i]! + d[i + 1]! + d[i + 2]!;
          if (x + 1 < w) {
            for (let k = 0; k < 3; k++) sum += (d[i + k]! - d[i + 4 + k]!) ** 2;
            n += 3;
          }
        }
      }
      return { step: sum / n, bright: bright / (w * 880 * 3) };
    };
    return { width: v.videoWidth, height: v.videoHeight, left: edge(20, 500), right: edge(1420, 1900), mid: edge(600, 1320) };
  }, out.toString('base64'));
  console.log(JSON.stringify(m));
  expect({ w: m.width, h: m.height }).toEqual({ w: 1920, h: 1080 });
  // Linux WebKit in CI hands back a blank canvas for a video frame; then only the file's size can be checked.
  const blank = m.mid.step === 0 && m.mid.bright === 0;
  test.info().annotations.push({ type: 'pixels', description: blank ? 'this browser cannot read video frames to a canvas: only the shape was checked' : 'frames measured' });
  if (blank) return;
  expect(m.mid.step).toBeGreaterThan(5);
  expect(m.left.step, 'left backdrop').toBeLessThan(m.mid.step * 0.1);
  expect(m.right.step, 'right backdrop').toBeLessThan(m.mid.step * 0.1);
  // Darkened, as before: not a pure black or white fill either.
  expect(m.left.bright).toBeGreaterThan(5);
});
