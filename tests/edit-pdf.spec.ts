// @webkit-project
import { test, expect, type Locator, type Page, type Download } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib';
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Edit PDF: annotate-and-arrange. Fixtures are built inline so the spec needs no generated files.

const face = readFileSync(fileURLToPath(new URL('./fixtures/static/face.jpg', import.meta.url)));

/** Three Letter pages, each a line of text and a green block whose width grows with the page number. */
async function threePages(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i} of the fixture document`, { x: 60, y: 700, size: 24, font });
    page.drawRectangle({ x: 60, y: 100, width: 200 + i * 50, height: 300, color: rgb(0.2, 0.5, 0.4) });
  }
  return Buffer.from(await doc.save());
}

async function turnedPage(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('Already turned', { x: 60, y: 700, size: 24, font });
  page.setRotation(degrees(90));
  return Buffer.from(await doc.save());
}

async function open(page: Page, pdf: Buffer, name = 'doc.pdf') {
  await page.setViewportSize({ width: 1280, height: 2600 });
  await page.goto('/tools/edit-pdf');
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#edit-panel')).toBeVisible();
  await expect(page.locator('#page-label')).toHaveText('Page 1 of ' + (await PDFDocument.load(pdf)).getPageCount());
  await expect.poll(() => page.locator('#page-canvas').evaluate((c: HTMLCanvasElement) => c.clientWidth)).toBeGreaterThan(300);
}

const mode = (page: Page, value: string) => page.locator(`label:has(input[name="edit-mode"][value="${value}"])`).click();

/** A point on the page as fractions of its width and height, in viewport pixels. */
async function pt(layer: Locator, fx: number, fy: number) {
  const b = (await layer.boundingBox())!;
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function addText(page: Page, text: string, fx: number, fy: number) {
  await mode(page, 'text');
  await page.locator('#edit-text').fill(text);
  const p = await pt(page.locator('#edit-layer'), fx, fy);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.edit-words, .edit-item img').last()).toBeVisible();
}

async function save(page: Page): Promise<{ bytes: Buffer; name: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#run').click()]);
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 60_000 });
  return { bytes: await bytesOf(download), name: download.suggestedFilename() };
}

async function bytesOf(d: Download): Promise<Buffer> {
  const path = await d.path();
  return readFileSync(path);
}

async function textOf(bytes: Buffer, pageNumber: number) {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const p = await doc.getPage(pageNumber);
  const content = await p.getTextContent();
  const viewport = p.getViewport({ scale: 1 });
  const items = content.items.filter((i): i is TextItem => 'str' in i);
  return { items, viewport, text: items.map((i) => i.str).join(' ') };
}

/** Open an output in the editor itself and read pixels of one of its pages (no second renderer needed). */
async function pixel(page: Page, bytes: Buffer, pageNo: number, fx: number, fy: number) {
  const other = await page.context().newPage();
  await other.setViewportSize({ width: 1280, height: 2600 });
  await other.goto('/tools/edit-pdf');
  await other.locator('#file-input').setInputFiles({ name: 'out.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(other.locator('#edit-panel')).toBeVisible();
  for (let i = 1; i < pageNo; i++) {
    await other.locator('#next-page').click();
    await expect(other.locator('#page-label')).toContainText(`Page ${i + 1} of`);
  }
  await expect.poll(() => other.locator('#page-canvas').evaluate((c: HTMLCanvasElement) => c.clientWidth)).toBeGreaterThan(300);
  const read = async () =>
    other.locator('#page-canvas').evaluate(
      (c: HTMLCanvasElement, [x, y]) => {
        const d = c.getContext('2d')!.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data;
        return [d[0]!, d[1]!, d[2]!, d[3]!];
      },
      [fx, fy] as [number, number],
    );
  await expect.poll(async () => (await read())[3]).toBe(255);
  const rgbaOut = await read();
  await other.close();
  return rgbaOut;
}

test('adds text, a cover, a highlight, a pen stroke and an image, turns page 3, and nothing leaves the tab', async ({ page }) => {
  const requests: { url: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), body: r.postData() }));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, await threePages(), 'text.pdf');
  const layer = page.locator('#edit-layer');

  // Page 1: text and an image.
  await addText(page, 'Hello Stayput', 0.15, 0.1);
  await expect(page.locator('#placement-count')).toHaveText('1 item on 1 page');
  await mode(page, 'image');
  await page.locator('#edit-image-file').setInputFiles({ name: 'face.jpg', mimeType: 'image/jpeg', buffer: face });
  await expect(page.locator('.edit-image')).toHaveCount(1);

  // Page 2: a cover over the green block, a highlight and a pen stroke on blank paper.
  await page.locator('#next-page').click();
  await expect(page.locator('#page-label')).toHaveText('Page 2 of 3');
  await expect(page.locator('.edit-item')).toHaveCount(0);
  await mode(page, 'cover');
  await drag(page, await pt(layer, 0.2, 0.55), await pt(layer, 0.4, 0.7));
  await expect(page.locator('.edit-cover')).toHaveCount(1);
  await mode(page, 'highlight');
  await drag(page, await pt(layer, 0.1, 0.2), await pt(layer, 0.5, 0.25));
  await expect(page.locator('.edit-highlight')).toHaveCount(1);
  await mode(page, 'draw');
  await page.locator('#pen-width').selectOption('6');
  await drag(page, await pt(layer, 0.2, 0.35), await pt(layer, 0.6, 0.35));
  await expect(page.locator('.edit-draw')).toHaveCount(1);

  // Page 3: turn it a quarter turn.
  await page.getByRole('button', { name: 'Rotate page 3 a quarter turn' }).click();
  const { bytes, name } = await save(page);
  expect(name).toBe('text-edited.pdf');

  // A structural check with qpdf, or pdfinfo, when either is installed.
  const file = join(mkdtempSync(join(tmpdir(), 'edit-pdf-')), 'out.pdf');
  writeFileSync(file, bytes);
  for (const [cmd, args] of [['qpdf', ['--check', file]], ['pdfinfo', [file]]] as const) {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.error) continue;
    expect(r.status, `${cmd}: ${r.stderr}`).toBe(0);
    expect(r.stderr, cmd).not.toMatch(/error/i);
    break;
  }

  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(2).getRotation().angle).toBe(90);
  expect(doc.getPage(0).getRotation().angle).toBe(0);
  const xobjects = (i: number) => {
    const res = doc.getPage(i).node.Resources();
    const xo = res?.lookup(PDFName.of('XObject'));
    return xo ? ((xo as unknown as { keys(): unknown[] }).keys().length) : 0;
  };
  expect(xobjects(0)).toBe(1);
  expect((await textOf(bytes, 1)).text).toContain('Hello Stayput');
  expect((await textOf(bytes, 1)).text).toContain('Page 1 of the fixture document');

  // Page 2: the cover is white where the green block was; the highlight is yellow over paper; the pen is dark.
  const cover = await pixel(page, bytes, 2, 0.3, 0.625);
  expect(cover.slice(0, 3)).toEqual([255, 255, 255]);
  const highlight = await pixel(page, bytes, 2, 0.3, 0.225);
  expect(highlight[0]!).toBeGreaterThan(240);
  expect(highlight[2]!).toBeLessThan(200);
  const pen = await pixel(page, bytes, 2, 0.4, 0.35);
  expect(pen[0]!).toBeLessThan(80);
  // A block that was not covered stays green.
  const green = await pixel(page, bytes, 2, 0.3, 0.8);
  expect(green[1]!).toBeGreaterThan(green[0]!);

  for (const r of requests) {
    if (r.url.startsWith('blob:') || r.url.startsWith('data:')) continue;
    expect(new URL(r.url).hostname, r.url).toBe('localhost');
    expect(r.body ?? '', r.url).not.toContain('%PDF');
  }
  expect(errors).toEqual([]);
});

test('delete page 2 and move page 3 first: output has two pages and the edits stayed with their source pages', async ({ page }) => {
  await open(page, await threePages());
  await addText(page, 'OnePage', 0.15, 0.1);
  await page.locator('#next-page').click();
  await page.locator('#next-page').click();
  await expect(page.locator('#page-label')).toHaveText('Page 3 of 3');
  await addText(page, 'ThreePage', 0.15, 0.1);
  await page.getByRole('button', { name: 'Delete page 2' }).click();
  await page.getByRole('button', { name: 'Move page 3 left' }).click();
  await expect(page.locator('#page-info')).toContainText('1 deleted');
  const { bytes } = await save(page);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  const first = (await textOf(bytes, 1)).text;
  const second = (await textOf(bytes, 2)).text;
  expect(first).toContain('Page 3 of the fixture');
  expect(first).toContain('ThreePage');
  expect(first).not.toContain('OnePage');
  expect(second).toContain('Page 1 of the fixture');
  expect(second).toContain('OnePage');
});

test('undo takes back the last thing added', async ({ page }) => {
  await open(page, await threePages());
  await addText(page, 'Oops', 0.2, 0.2);
  await expect(page.locator('.edit-item')).toHaveCount(1);
  await page.locator('#undo').click();
  await expect(page.locator('.edit-item')).toHaveCount(0);
  await expect(page.locator('#undo')).toBeDisabled();
});

test('text on a page that already has /Rotate 90 lands where it was clicked', async ({ page }) => {
  await open(page, await turnedPage());
  const layer = page.locator('#edit-layer');
  await mode(page, 'text');
  await page.locator('#edit-text').fill('Moved');
  const box = (await layer.boundingBox())!;
  const click = await pt(layer, 0.3, 0.4);
  await page.mouse.click(click.x, click.y);
  await expect(page.locator('.edit-words')).toHaveCount(1);
  const fx = (click.x - box.x) / box.width;
  const fy = (click.y - box.y) / box.height;
  const { bytes } = await save(page);
  expect((await PDFDocument.load(bytes)).getPage(0).getRotation().angle).toBe(90);
  const { items, viewport } = await textOf(bytes, 1);
  const item = items.find((i) => i.str === 'Moved')!;
  expect(item).toBeTruthy();
  const m = Util.transform(viewport.transform, item.transform);
  // Displayed page is 792 x 612 points; the baseline sits 80% of the 24 pt size below the click.
  expect(m[4]!).toBeCloseTo(fx * viewport.width, 0);
  expect(Math.abs(m[5]! - (fy * viewport.height + 24 * 0.8))).toBeLessThan(3);
});

test('text a standard font cannot draw is stamped as a picture instead of failing', async ({ page }) => {
  await open(page, await threePages());
  await addText(page, 'Привет', 0.15, 0.1);
  await expect(page.locator('.edit-item img')).toHaveCount(1);
  const { bytes } = await save(page);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  // Dark ink somewhere in the first line's box: a 24 pt line is about 4% of the page tall.
  const seen = await Promise.all([0.17, 0.19, 0.21, 0.23].map((x) => pixel(page, bytes, 1, x, 0.1 + 0.015)));
  expect(seen.some((p) => p[0]! < 120)).toBe(true);
});

test('running with no change says so instead of returning the same file', async ({ page }) => {
  await open(page, await threePages());
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('Make a change first');
});
