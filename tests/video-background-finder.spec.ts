import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Both person finders must keep the person and replace the rest. The fast one's mask is the person (the multiclass model's
// is the background), so a flipped polarity would paint the colour over the person and keep the room: this reads the
// output's pixels. Runs in Chromium and, locally with PW_WEBKIT=1, in WebKit (Linux CI WebKit reads video frames back blank).
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));

async function open(page: Page, finder: 'fast' | 'edges') {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip]);
  await page.locator('input[name="bg"][value="color"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#bg-color').fill('#ff00ff');
  await page.locator(`input[name="finder"][value="${finder}"]`).evaluate((el) => (el as HTMLInputElement).click());
}

for (const finder of ['fast', 'edges'] as const) {
  test(`the ${finder} person finder keeps the person and paints the colour behind`, async ({ page, browserName }) => {
    // Linux CI WebKit reads decoded video frames back blank, so its pixels say nothing; this runs in Mac WebKit with PW_WEBKIT=1.
    test.skip(browserName === 'webkit' && !!process.env.CI, 'Linux WebKit reads video frames back blank');
    test.setTimeout(420_000);
    const fetched: string[] = [];
    page.on('request', (r) => r.url().includes('/models/') && fetched.push(new URL(r.url()).pathname));
    await open(page, finder);
    const download = page.waitForEvent('download');
    await page.locator('#run').click();
    await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 360_000 });
    await expect(page.locator('#error')).not.toHaveClass(/is-active/);
    const bytes = readFileSync(await (await download).path()).toString('base64');
    const shot = await page.evaluate(async (b64) => {
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'video/mp4' }));
      await new Promise((ok) => (v.onloadeddata = ok));
      await new Promise<void>((ok) => {
        v.requestVideoFrameCallback(() => ok());
        v.currentTime = 0.7;
      });
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(v, 0, 0);
      const at = (x: number, y: number) => [...ctx.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data].slice(0, 3);
      return { corners: [at(0.05, 0.05), at(0.95, 0.05), at(0.05, 0.95), at(0.95, 0.95)], person: [at(0.5, 0.5), at(0.5, 0.6)] };
    }, bytes);
    const magenta = ([r, g, b]: number[]) => r! > 190 && g! < 90 && b! > 190;
    console.log(`${browserName} ${finder}: corners ${JSON.stringify(shot.corners)} person ${JSON.stringify(shot.person)}`);
    expect(shot.corners.every(magenta), 'the room around the person is replaced').toBe(true);
    expect(shot.person.every((p) => !magenta(p!)), 'the person stays, all over').toBe(true);
    // Only the model that was asked for is fetched.
    const wanted = finder === 'fast' ? /selfie_segmenter(_landscape)?\.tflite$/ : /selfie_multiclass_256x256\.tflite$/;
    expect(fetched.filter((u) => /selfie/.test(u)).every((u) => wanted.test(u))).toBe(true);
    expect(fetched.some((u) => wanted.test(u))).toBe(true);
  });
}
