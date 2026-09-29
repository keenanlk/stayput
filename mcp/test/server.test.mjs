// End-to-end tests: start the built server over stdio, call its tools the way
// an MCP client does, and check the files it writes.
// Needs the site's fixtures: python3 tests/fixtures/make-fixtures.py && node tests/fixtures/make-pdf.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, copyFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PDFDocument } from 'pdf-lib';

const fixtures = fileURLToPath(new URL('../../tests/fixtures/', import.meta.url));
const server = fileURLToPath(new URL('../dist/index.js', import.meta.url));

let client;
let dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stayput-mcp-'));
  for (const f of ['text.pdf', 'article.pdf', 'photo.jpg', 'graphic.png', 'plain.jpg', 'picture.webp']) await copyFile(join(fixtures, 'generated', f), join(dir, f));
  for (const f of ['owner-locked.pdf', 'user-locked.pdf']) await copyFile(join(fixtures, 'static', f), join(dir, f));
  client = new Client({ name: 'stayput-mcp-test', version: '0.0.0' });
  // cwd is the temp dir so relative paths resolve there, as they would for a user.
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], cwd: dir, stderr: 'ignore' }));
});

after(async () => {
  await client?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

const call = (name, args) => client.callTool({ name, arguments: args });
const text = (res) => res.content.map((c) => c.text).join('\n');
const pages = async (path) => (await PDFDocument.load(await readFile(path))).getPageCount();

test('lists every tool with a description and an input schema', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['extract_pdf_pages', 'images_to_pdf', 'inspect_image_metadata', 'merge_pdfs', 'number_pdf_pages', 'pdf_info', 'rotate_pdf', 'split_pdf', 'strip_image_metadata']);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 30, `${t.name} has a description`);
    assert.equal(t.inputSchema.type, 'object');
  }
});

test('pdf_info reports the page count and page size', async () => {
  const res = await call('pdf_info', { path: 'text.pdf' });
  assert.equal(res.isError, undefined);
  assert.equal(res.structuredContent.pages, 3);
  assert.match(text(res), /3 pages/);
});

test('merge_pdfs joins files in order and writes next to the first input by default', async () => {
  const res = await call('merge_pdfs', { inputs: ['text.pdf', 'article.pdf', 'text.pdf'] });
  assert.equal(res.isError, undefined, text(res));
  const out = res.structuredContent.output;
  assert.equal(out, join(dir, 'text-merged.pdf'));
  assert.equal(await pages(out), 3 + (await pages(join(dir, 'article.pdf'))) + 3);
});

test('never overwrites an existing file: a second run gets a new name', async () => {
  await writeFile(join(dir, 'keep.pdf'), 'not a pdf');
  const res = await call('merge_pdfs', { inputs: ['text.pdf', 'text.pdf'], output: 'keep.pdf' });
  assert.equal(res.isError, undefined, text(res));
  assert.equal(res.structuredContent.output, join(dir, 'keep-1.pdf'));
  assert.equal(await readFile(join(dir, 'keep.pdf'), 'utf8'), 'not a pdf');
});

test('owner-locked PDFs are decrypted locally instead of producing blank pages', async () => {
  const res = await call('merge_pdfs', { inputs: ['owner-locked.pdf', 'text.pdf'], output: 'unlocked-merge.pdf' });
  assert.equal(res.isError, undefined, text(res));
  const doc = await PDFDocument.load(await readFile(join(dir, 'unlocked-merge.pdf')));
  assert.equal(doc.getPageCount(), 6);
  assert.equal(doc.isEncrypted, false);
});

test('a PDF with an open password needs the password, and works with it', async () => {
  const without = await call('pdf_info', { path: 'user-locked.pdf' });
  assert.equal(without.isError, true);
  assert.match(text(without), /password/i);
  const wrong = await call('pdf_info', { path: 'user-locked.pdf', password: 'nope' });
  assert.equal(wrong.isError, true);
  assert.match(text(wrong), /did not open/i);
  const right = await call('pdf_info', { path: 'user-locked.pdf', password: 'stayput' });
  assert.equal(right.isError, undefined, text(right));
  assert.equal(right.structuredContent.pages, 3);
});

test('extract_pdf_pages keeps the listed pages in the listed order', async () => {
  const res = await call('extract_pdf_pages', { input: 'text.pdf', pages: '3, 1', output: 'picked.pdf' });
  assert.equal(res.isError, undefined, text(res));
  assert.equal(await pages(join(dir, 'picked.pdf')), 2);
  const bad = await call('extract_pdf_pages', { input: 'text.pdf', pages: '9' });
  assert.equal(bad.isError, true);
  assert.match(text(bad), /out of range/);
});

test('split_pdf writes one file per chunk into a folder', async () => {
  const res = await call('split_pdf', { input: 'text.pdf', pages_per_file: 2, output_dir: 'parts' });
  assert.equal(res.isError, undefined, text(res));
  const files = (await readdir(join(dir, 'parts'))).sort();
  assert.deepEqual(files, ['text-pages-1-2.pdf', 'text-pages-3.pdf']);
  assert.equal(await pages(join(dir, 'parts', 'text-pages-1-2.pdf')), 2);
});

test('rotate_pdf turns only the listed pages', async () => {
  const res = await call('rotate_pdf', { input: 'text.pdf', degrees: 90, pages: '2', output: 'turned.pdf' });
  assert.equal(res.isError, undefined, text(res));
  const doc = await PDFDocument.load(await readFile(join(dir, 'turned.pdf')));
  assert.deepEqual(doc.getPages().map((p) => p.getRotation().angle), [0, 90, 0]);
});

test('number_pdf_pages stamps a number on every page', async () => {
  const res = await call('number_pdf_pages', { input: 'text.pdf', template: 'Page {n} of {total}', output: 'numbered.pdf' });
  assert.equal(res.isError, undefined, text(res));
  const bytes = await readFile(join(dir, 'numbered.pdf'));
  assert.equal(await pages(join(dir, 'numbered.pdf')), 3);
  assert.ok(bytes.length > (await readFile(join(dir, 'text.pdf'))).length);
});

test('images_to_pdf makes one page per JPG or PNG and refuses other formats', async () => {
  const res = await call('images_to_pdf', { inputs: ['photo.jpg', 'graphic.png'], page_size: 'a4', output: 'album.pdf' });
  assert.equal(res.isError, undefined, text(res));
  const doc = await PDFDocument.load(await readFile(join(dir, 'album.pdf')));
  assert.equal(doc.getPageCount(), 2);
  const { width, height } = doc.getPage(1).getSize();
  assert.deepEqual([Math.round(Math.min(width, height)), Math.round(Math.max(width, height))], [595, 842]);
  const webp = await call('images_to_pdf', { inputs: ['picture.webp'] });
  assert.equal(webp.isError, true);
  assert.match(text(webp), /stayput\.dev/);
});

test('inspect_image_metadata reports GPS and camera fields', async () => {
  const res = await call('inspect_image_metadata', { path: 'photo.jpg' });
  assert.equal(res.isError, undefined, text(res));
  assert.equal(res.structuredContent.hasGps, true);
  assert.match(text(res), /GPS location: yes/);
});

test('strip_image_metadata removes GPS without touching the input', async () => {
  const before = await readFile(join(dir, 'photo.jpg'));
  const res = await call('strip_image_metadata', { input: 'photo.jpg' });
  assert.equal(res.isError, undefined, text(res));
  const out = res.structuredContent.output;
  assert.equal(out, join(dir, 'photo-clean.jpg'));
  assert.ok(existsSync(out));
  assert.deepEqual(await readFile(join(dir, 'photo.jpg')), before);
  const check = await call('inspect_image_metadata', { path: out });
  assert.equal(check.structuredContent.hasGps, false);
});

test('a missing file is a tool error that names the path, not a crash', async () => {
  const res = await call('pdf_info', { path: 'nope.pdf' });
  assert.equal(res.isError, true);
  assert.match(text(res), /nope\.pdf/);
});
