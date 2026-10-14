// @webkit-project
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AVI_LIMIT_BYTES, AviTooLarge, avcConfig, avcToAnnexB, readAvi, writeAvi } from '../src/lib/avi-write';

// Video to AVI re-encodes in the page and writes the RIFF/AVI container itself (src/lib/avi-write.ts).
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/static/${name}`, import.meta.url));
// 10 s 1280x720 30 fps H.264 + AAC.
const clip720 = fixture('clip-720p-10s.mp4');
// 130 s, 160x120: long enough that the sound is MP3 rather than PCM.
const clip130 = fixture('clip-130s.mp4');
// 4 h of black at 1 fps: its AVI would pass 1.9 GB. 30 min at 720p would weigh about 275 MB.
const long4h = fixture('long-4h-1fps.mp4');
const long30m = fixture('long-30m-1fps.mp4');
// Set AVI_OUT=<dir> to keep the converted files for a look in a player.
const keep = process.env.AVI_OUT;

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
}

async function convert(page: Page, file: string, tag: string): Promise<{ bytes: Uint8Array; name: string; note: string }> {
  await page.locator('#file-input').setInputFiles([file]);
  const download = page.waitForEvent('download');
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 200_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
  const d = await download;
  const note = await page.locator('#results').innerText();
  const bytes = new Uint8Array(readFileSync(await d.path()));
  if (keep) {
    mkdirSync(keep, { recursive: true });
    writeFileSync(join(keep, `${tag}-${d.suggestedFilename()}`), bytes);
  }
  return { bytes, name: d.suggestedFilename(), note };
}

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

/** Offset of the first '00dc' picture chunk's header, found by walking the chunks of movi. */
function firstPicture(b: Uint8Array, moviTag: number): number {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = moviTag + 4;
  while (ascii(b, at, 4) !== '00dc') at += 8 + v.getUint32(at + 4, true) + (v.getUint32(at + 4, true) & 1);
  return at;
}

test('the writer lays out RIFF, hdrl, avih, strl, movi and idx1 with padded chunks and exact sizes', () => {
  // Three picture frames; the middle one has an odd length, so it is padded to an even one.
  const frames = [
    { data: new Uint8Array([1, 2, 3, 4]), key: true },
    { data: new Uint8Array([5, 6, 7]), key: false },
    { data: new Uint8Array([8, 9]), key: false },
  ];
  const sound = new Uint8Array(1600 * 4); // 1600 stereo 16-bit samples
  const blob = writeAvi(
    { fourcc: 'MJPG', width: 64, height: 48, fpsNum: 30, fpsDen: 1, frames },
    { kind: 'pcm', channels: 2, sampleRate: 48_000, chunks: [sound.subarray(0, 800), sound.subarray(800, 6400)] },
  );
  return blob.arrayBuffer().then((buf) => {
    const b = new Uint8Array(buf);
    const v = new DataView(buf);
    const u32 = (o: number) => v.getUint32(o, true);
    // RIFF header: its size is the file size less the first 8 bytes.
    expect(ascii(b, 0, 4)).toBe('RIFF');
    expect(u32(4)).toBe(b.length - 8);
    expect(ascii(b, 8, 4)).toBe('AVI ');
    // hdrl list, then avih with its 56-byte body.
    expect(ascii(b, 12, 4)).toBe('LIST');
    expect(ascii(b, 20, 4)).toBe('hdrl');
    const hdrlSize = u32(16);
    expect(ascii(b, 24, 4)).toBe('avih');
    expect(u32(28)).toBe(56);
    expect(u32(32)).toBe(33_333); // microseconds per frame
    expect(u32(24 + 8 + 16)).toBe(3); // total frames
    expect(u32(24 + 8 + 24)).toBe(2); // streams
    expect(u32(24 + 8 + 32)).toBe(64);
    expect(u32(24 + 8 + 36)).toBe(48);
    // Two stream lists inside hdrl, each with a strh and a strf.
    let o = 24 + 8 + 56;
    expect(ascii(b, o, 4)).toBe('LIST');
    expect(ascii(b, o + 8, 4)).toBe('strl');
    expect(ascii(b, o + 12, 4)).toBe('strh');
    expect(ascii(b, o + 20, 4)).toBe('vids');
    expect(ascii(b, o + 24, 4)).toBe('MJPG');
    const strl1 = u32(o + 4);
    expect(strl1).toBe(4 + (8 + 56) + (8 + 40));
    o += 8 + strl1;
    expect(ascii(b, o, 4)).toBe('LIST');
    expect(ascii(b, o + 12, 4)).toBe('strh');
    expect(ascii(b, o + 20, 4)).toBe('auds');
    const strl2 = u32(o + 4);
    expect(strl2).toBe(4 + (8 + 56) + (8 + 16));
    o += 8 + strl2;
    // hdrl ends exactly where movi starts; its size counts its own 4-byte type tag.
    expect(o).toBe(12 + 8 + hdrlSize);
    expect(ascii(b, o, 4)).toBe('LIST');
    expect(ascii(b, o + 8, 4)).toBe('movi');
    const moviSize = u32(o + 4);
    const moviStart = o + 8; // the 'movi' tag; idx1 offsets count from here
    // Walk the chunks: odd ones are followed by one pad byte that the size field does not count.
    let c = moviStart + 4;
    const seen: { id: string; size: number; at: number }[] = [];
    while (c < moviStart + moviSize) {
      const size = u32(c + 4);
      seen.push({ id: ascii(b, c, 4), size, at: c - moviStart });
      c += 8 + size + (size & 1);
    }
    expect(c).toBe(moviStart + moviSize);
    expect(seen.map((s) => s.id)).toEqual(['01wb', '00dc', '01wb', '00dc', '00dc']);
    expect(seen.find((s) => s.size === 3)).toBeTruthy();
    // idx1 follows movi immediately, one 16-byte entry per chunk, flags on key frames, sizes unpadded.
    expect(ascii(b, c, 4)).toBe('idx1');
    expect(u32(c + 4)).toBe(seen.length * 16);
    expect(c + 8 + seen.length * 16).toBe(b.length);
    seen.forEach((s, i) => {
      const e = c + 8 + i * 16;
      expect(ascii(b, e, 4)).toBe(s.id);
      expect(u32(e + 8)).toBe(s.at);
      expect(u32(e + 12)).toBe(s.size);
    });
    expect(u32(c + 8 + 4)).toBe(0x10); // first picture is a key frame
    // The reader used by the other tests agrees.
    const read = readAvi(b);
    expect(read.videoChunks).toBe(3);
    expect(read.audioChunks).toBe(2);
    expect(read.keyFrames).toBe(1);
    expect(read.duration).toBeCloseTo(0.1, 2);
  });
});

test('the writer refuses to pass the legacy 1.9 GB limit', () => {
  const huge = { data: { length: AVI_LIMIT_BYTES + 1 } as unknown as Uint8Array, key: true };
  expect(() => writeAvi({ fourcc: 'H264', width: 2, height: 2, fpsNum: 1, fpsDen: 1, frames: [huge] })).toThrow(AviTooLarge);
});

test('avcC samples become Annex B with the parameter sets in front of key frames', () => {
  // avcC: version 1, profile, compat, level, 4-byte lengths; one SPS (2 bytes) and one PPS (1 byte).
  const avcC = new Uint8Array([1, 66, 0, 30, 0xff, 0xe1, 0, 2, 0x67, 0x42, 1, 0, 1, 0x68]);
  const { lengthSize, parameterSets } = avcConfig(avcC);
  expect(lengthSize).toBe(4);
  expect([...parameterSets]).toEqual([0, 0, 0, 1, 0x67, 0x42, 0, 0, 0, 1, 0x68]);
  const sample = new Uint8Array([0, 0, 0, 3, 0x65, 0xaa, 0xbb, 0, 0, 0, 1, 0x06]);
  expect([...avcToAnnexB(sample, 4, null)]).toEqual([0, 0, 0, 1, 0x65, 0xaa, 0xbb, 0, 0, 0, 1, 0x06]);
  expect([...avcToAnnexB(sample, 4, parameterSets)].slice(0, 11)).toEqual([...parameterSets]);
});

test('a 10 s 720p clip becomes an H.264 AVI of the same length with picture and sound', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, '/tools/video-to-avi');
  // Maximum compatibility (Motion JPEG) is the default; H.264 is the smaller option.
  await expect(page.locator('#compat')).toBeChecked();
  await page.locator('#compat').uncheck();
  const r = await convert(page, clip720, 'h264');
  expect(r.name).toBe('clip-720p-10s.avi');
  const avi = readAvi(r.bytes);
  expect(avi.riffSize).toBe(r.bytes.length - 8);
  expect(avi.width).toBe(1280);
  expect(avi.height).toBe(720);
  expect(avi.videoFourcc).toBe('H264');
  expect(Math.abs(avi.duration - 10)).toBeLessThan(0.2);
  expect(avi.idx1Entries).toBe(avi.chunksInMovi);
  expect(avi.streams.map((s) => s.type)).toEqual(['vids', 'auds']);
  // A clip under two minutes keeps uncompressed 16-bit sound, about as long as the picture.
  expect(avi.audioFormatTag).toBe(1);
  expect(Math.abs(avi.audioDuration - 10)).toBeLessThan(0.2);
  expect(avi.keyFrames).toBeGreaterThan(0);
  // The first picture chunk is Annex B: a start code, then the SPS (NAL type 7).
  const first = firstPicture(r.bytes, avi.moviOffset);
  const body = first + 8;
  expect([...r.bytes.subarray(body, body + 5)].slice(0, 4)).toEqual([0, 0, 0, 1]);
  expect(r.bytes[body + 4]! & 0x1f).toBe(7);
  expect(r.note).toContain('H.264');
});

test('clips of two minutes or more get MP3 sound', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, '/tools/video-to-avi');
  await page.locator('#compat').uncheck();
  const r = await convert(page, clip130, 'mp3');
  const avi = readAvi(r.bytes);
  expect(avi.audioFormatTag).toBe(0x55);
  expect(Math.abs(avi.duration - 130)).toBeLessThan(0.5);
  expect(Math.abs(avi.audioDuration - 130)).toBeLessThan(1);
  expect(avi.audioChunks).toBeGreaterThan(100);
});

test('Maximum compatibility writes MJPG pictures with PCM sound', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, '/mp4-to-avi');
  await expect(page.locator('#compat')).toBeChecked();
  const r = await convert(page, clip720, 'mjpeg');
  const avi = readAvi(r.bytes);
  expect(avi.videoFourcc).toBe('MJPG');
  expect(avi.audioFormatTag).toBe(1);
  expect(Math.abs(avi.duration - 10)).toBeLessThan(0.2);
  expect(avi.keyFrames).toBe(avi.videoChunks);
  // A picture chunk holds a whole JPEG: it starts FFD8 and ends FFD9.
  const at = firstPicture(r.bytes, avi.moviOffset);
  const size = new DataView(r.bytes.buffer, r.bytes.byteOffset).getUint32(at + 4, true);
  expect([r.bytes[at + 8], r.bytes[at + 9]]).toEqual([0xff, 0xd8]);
  expect([r.bytes[at + 8 + size - 2], r.bytes[at + 8 + size - 1]]).toEqual([0xff, 0xd9]);
  expect(r.note).toContain('Motion JPEG');
});

test('Remove the sound writes an AVI with a picture stream only', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, '/tools/video-to-avi');
  await page.locator('#mute').check();
  const r = await convert(page, clip720, 'mute');
  const avi = readAvi(r.bytes);
  expect(avi.streams.map((s) => s.type)).toEqual(['vids']);
  expect(avi.audioChunks).toBe(0);
});

test('a job whose AVI would pass 1.9 GB is refused before any encoding', async ({ page }) => {
  await open(page, '/tools/video-to-avi');
  await page.locator('#compat').uncheck();
  await page.locator('#file-input').setInputFiles([long4h]);
  const requests: string[] = [];
  page.on('request', (q) => requests.push(q.url()));
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
  await expect(page.locator('#error')).toContainText('1.9 GB');
  await expect(page.locator('#results')).not.toHaveClass(/is-active/);
  // No encoder was loaded.
  expect(requests.filter((u) => /lame|mp3\.wasm/.test(u))).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', hasTouch: true });
  test('the phone memory limit refuses a job of about 275 MB', async ({ page }) => {
    await open(page, '/tools/video-to-avi');
    await page.locator('#compat').uncheck();
    await page.locator('#file-input').setInputFiles([long30m]);
    await page.locator('#run').click();
    await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 60_000 });
    await expect(page.locator('#error')).toContainText(/phone/i);
  });
});

test('Unsupported input gets a plain message, not a broken file', async ({ page }) => {
  await open(page, '/tools/video-to-avi');
  await page.locator('#file-input').setInputFiles([{ name: 'not-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('this is not a video') }]);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/, { timeout: 30_000 });
});

test('no file bytes or names leave the tab during a conversion', async ({ page }) => {
  test.setTimeout(300_000);
  await page.route('https://stats.keenankaufman.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await open(page, '/tools/video-to-avi');
  const sent: { url: string; body: string | null }[] = [];
  page.on('request', (q) => sent.push({ url: q.url(), body: q.postData() }));
  await convert(page, clip720, 'net');
  const base = new URL(page.url()).host;
  const outside = sent.filter((s) => !s.url.startsWith('blob:') && !s.url.startsWith('data:') && new URL(s.url).host !== base);
  expect(outside.filter((s) => !s.url.startsWith('https://stats.keenankaufman.com/'))).toEqual([]);
  for (const s of sent) {
    expect(s.url).not.toContain('clip-720p-10s');
    expect(s.body ?? '').not.toContain('clip-720p-10s');
  }
});
