import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// iPhone clips are stored sideways and turned by a rotation tag. The background remover must find the person in the
// upright picture and blur the rest of that same picture, so the sharp part sits on the person and the background goes soft.
// 45 frames of 1280x720 turned 90 degrees (shows as 720x1280): a photo of a person drifting right in front of a door
// (top), a hard vertical edge (left) and towel stripes (bottom). See tests/fixtures/make-rotated-person.py.
const rotated = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));
const SHOWN = { w: 720, h: 1280 };
// Where the person's photo sits in the upright picture (the fixture draws it 449x560 at y 360, centred on x 270 + 3 px per frame).

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

async function runOnce(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 240_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  return readFileSync(await (await download).path());
}

/** The video track's stored size and whether the file carries a turn (anything but the identity matrix), from its tkhd box. */
function trackHeader(mp4: Buffer): { width: number; height: number; turned: boolean } {
  const at = mp4.indexOf('tkhd', 0, 'latin1');
  expect(at, 'a tkhd box').toBeGreaterThan(0);
  const body = at + 4;
  expect(mp4[body], 'tkhd version 0').toBe(0);
  const m = body + 40;
  const fixed = (o: number) => mp4.readInt32BE(m + o);
  const identity = fixed(0) === 0x10000 && fixed(4) === 0 && fixed(12) === 0 && fixed(16) === 0x10000;
  return { width: mp4.readUInt32BE(m + 36) / 65536, height: mp4.readUInt32BE(m + 40) / 65536, turned: !identity };
}

interface Frame {
  t: number;
  /** x of the photo's centre as the fixture drew it at this time. */
  centre: number;
  /** Mean squared step between neighbouring pixels, so a blurred edge scores far lower: door (steps across), left bar and towels (steps down). */
  door: number;
  bar: number;
  towel: number;
  /** Where the output still equals the input inside the photo's box, x of the centroid and how many of its pixels. */
  sharpX: number;
  sharpShare: number;
  /** Mean absolute difference from the input over the person's torso. */
  torso: number;
}

/**
 * Decode `bytes` in the page and measure frames at `times`. With `reference` (the input's bytes) the output is compared
 * with the input frame at the same time.
 */
async function measure(page: Page, bytes: Buffer, mime: string, times: number[], reference?: { bytes: Buffer; mime: string }): Promise<{ width: number; height: number; frames: Frame[] }> {
  return page.evaluate(
    async ({ data, mime, times, ref }) => {
      const load = async (bytes: number[], type: string) => {
        const v = document.createElement('video');
        v.muted = true;
        v.src = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
        await new Promise((ok) => (v.onloadeddata = ok));
        return v;
      };
      const grab = async (v: HTMLVideoElement, t: number) => {
        await new Promise<void>((ok) => {
          v.onseeked = () => ok();
          v.currentTime = t;
        });
        const c = document.createElement('canvas');
        c.width = 720;
        c.height = 1280;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, 720, 1280);
        return ctx.getImageData(0, 0, 720, 1280).data;
      };
      const v = await load(data, mime);
      const r = ref ? await load(ref.bytes, ref.mime) : undefined;
      const px = (d: Uint8ClampedArray, x: number, y: number, c: number) => d[(y * 720 + x) * 4 + c]!;
      const step = (d: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number, vertical: boolean) => {
        let sum = 0, n = 0;
        for (let y = y0; y < y1 - 1; y++) for (let x = x0; x < x1 - 1; x++) for (let c = 0; c < 3; c++) {
          const e = px(d, x, y, c) - (vertical ? px(d, x, y + 1, c) : px(d, x + 1, y, c));
          sum += e * e;
          n++;
        }
        return sum / n;
      };
      const frames: any[] = [];
      for (const t of times) {
        const d = await grab(v, t);
        const centre = 270 + Math.round(t * 30) * 3;
        let sharpX = 0, sharpN = 0, boxN = 0, torso = 0, torsoN = 0;
        if (r) {
          const ref = await grab(r, t);
          for (let y = 560; y < 900; y += 2) for (let x = centre - 224; x < centre + 224; x += 2) {
            let diff = 0;
            for (let c = 0; c < 3; c++) diff += Math.abs(px(d, x, y, c) - px(ref, x, y, c));
            boxN++;
            if (diff / 3 < 6) {
              sharpX += x;
              sharpN++;
            }
          }
          for (let y = 700; y < 880; y += 2) for (let x = centre - 60; x < centre + 60; x += 2) {
            for (let c = 0; c < 3; c++) torso += Math.abs(px(d, x, y, c) - px(ref, x, y, c));
            torsoN += 3;
          }
        }
        frames.push({
          t,
          centre,
          door: step(d, 0, 0, 720, 320, false),
          bar: step(d, 0, 400, 80, 900, false),
          towel: step(d, 0, 960, 720, 1270, true),
          sharpX: sharpN ? sharpX / sharpN : 0,
          sharpShare: boxN ? sharpN / boxN : 0,
          torso: torsoN ? torso / torsoN : 0,
        });
      }
      return { width: v.videoWidth, height: v.videoHeight, frames };
    },
    { data: [...bytes], mime, times, ref: reference ? { bytes: [...reference.bytes], mime: reference.mime } : undefined },
  );
}

test('Blur video background on an iPhone-style clip stored sideways keeps the person sharp, in place, and blurs the room', async ({ page }) => {
  test.setTimeout(420_000);
  await open(page, '/blur-video-background');
  await page.locator('#file-input').setInputFiles([rotated]);
  const out = await runOnce(page);
  const input = readFileSync(rotated);
  // Frames 6, 21 and 39: the person has drifted 18, 63 and 117 px to the right by the last.
  const times = [0.2, 0.7, 1.3];
  const after = await measure(page, out, 'video/mp4', times, { bytes: input, mime: 'video/quicktime' });
  const before = await measure(page, input, 'video/quicktime', times);
  console.log(JSON.stringify({ before, after }));
  // Shown upright at the same size, with the rotation baked in rather than left as a tag.
  expect({ w: after.width, h: after.height }).toEqual({ w: SHOWN.w, h: SHOWN.h });
  expect(trackHeader(out)).toEqual({ width: SHOWN.w, height: SHOWN.h, turned: false });
  for (const [i, f] of after.frames.entries()) {
    const was = before.frames[i]!;
    // The room is clearly blurred: the door, the hard bar down the left and the towel stripes lose most of their edge energy.
    expect(f.door, `door at ${f.t}s`).toBeLessThan(was.door * 0.35);
    expect(f.bar, `bar at ${f.t}s`).toBeLessThan(was.bar * 0.35);
    expect(f.towel, `towels at ${f.t}s`).toBeLessThan(was.towel * 0.35);
    // The person is untouched where they are: the torso equals the input, and the sharp part of the photo's box is
    // centred on the person (about 16 px left of the photo's centre, where the suit sits), not shifted sideways.
    expect(f.torso, `torso at ${f.t}s`).toBeLessThan(10);
    expect(Math.abs(f.sharpX - (f.centre - 20)), `sharp centroid ${f.sharpX} vs photo centre ${f.centre} at ${f.t}s`).toBeLessThan(20);
    expect(f.sharpShare).toBeGreaterThan(0.2);
    expect(f.sharpShare).toBeLessThan(0.8);
  }
  // It really did move sideways, and the sharp part moved with it.
  expect(after.frames[2]!.sharpX - after.frames[0]!.sharpX).toBeGreaterThan(70);
});

// A landscape clip with no turn must come out the same shape, with the room blurred as well.
test('Blur video background on a plain landscape clip keeps its shape', async ({ page }) => {
  test.setTimeout(300_000);
  const plain = fileURLToPath(new URL('./fixtures/static/clip.webm', import.meta.url));
  await open(page, '/blur-video-background');
  await page.locator('#file-input').setInputFiles([plain]);
  const out = await runOnce(page);
  const head = trackHeader(out);
  expect(head.turned).toBe(false);
  expect(head.width).toBeGreaterThan(head.height);
  expect({ w: head.width, h: head.height }).toEqual({ w: 320, h: 240 });
});
