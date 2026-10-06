import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import pkg from '../package.json' with { type: 'json' };
import vendor from '../src/data/vendor.json' with { type: 'json' };
import data from '../src/data/licenses.json' with { type: 'json' };

interface Component {
  id: string;
  name: string;
  version: string;
  npm: string | null;
  licences: { name: string; url: string }[];
  project: string;
  source: string;
  shipped: string;
  via?: string;
  copyleft?: 'lgpl' | 'mpl';
  copyright?: string;
  replace?: string;
}
const components = data.components as Component[];

/** Packages in `dependencies` that only run at build time and never reach the browser. */
const BUILD_ONLY = new Set(['astro', '@astrojs/sitemap']);

const hosted = (url: string) => url.startsWith('/licenses/');

/** Licence files served under /vendor/ come from vendor.json's "licences"; returns the repo path that feeds a URL. */
function servedFromVendor(url: string): string | null {
  if (!url.startsWith('/vendor/')) return null;
  for (const lib of Object.values(vendor) as { package: string; version: string; licences?: Record<string, string> }[]) {
    const dir = `/vendor/${lib.package.replace(/^@/, '').replace('/', '-')}@${lib.version}/`;
    const src = url.startsWith(dir) ? lib.licences?.[url.slice(dir.length)] : undefined;
    if (src) return src;
  }
  throw new Error(`${url} is not produced by src/data/vendor.json`);
}

test('every browser-shipped dependency in package.json has an entry in licenses.json', () => {
  const missing: string[] = [];
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (BUILD_ONLY.has(name)) continue;
    const entry = components.find((c) => c.npm === name);
    if (!entry) missing.push(`${name}@${version}`);
    else expect(entry.version, `${name} version in licenses.json`).toBe(version);
  }
  expect(missing, 'add these to src/data/licenses.json (or to BUILD_ONLY if they never reach the browser)').toEqual([]);
});

test('every package in vendor.json has an entry in licenses.json', () => {
  const missing: string[] = [];
  for (const lib of Object.values(vendor)) {
    const entry = components.find((c) => c.npm === lib.package);
    if (!entry) missing.push(`${lib.package}@${lib.version}`);
    else expect(entry.version, `${lib.package} version in licenses.json`).toBe(lib.version);
  }
  expect(missing, 'add these to src/data/licenses.json').toEqual([]);
});

test('the ISNet weights are not called Apache-2.0 without an upstream statement', () => {
  const isnet = components.find((c) => c.id === 'm-isnet')!;
  expect(isnet.licences.map((l) => l.name).join(' ')).toContain('not stated');
});

test('every model file in public/models is credited', () => {
  const credited = components.filter((c) => c.shipped.startsWith('/models/')).map((c) => c.shipped);
  for (const file of ['blaze_face_short_range.tflite', 'isnet-general-use-int8w.onnx', 'migan-pipeline-v2.onnx', 'realesr-general-x4v3.onnx', 'selfie_multiclass_256x256.tflite', 'uvr-mdx-net-inst-hq-3.onnx', 'whisper-base/']) {
    expect(credited, file).toContain(`/models/${file}`);
  }
});

test('every entry is complete and points somewhere real', () => {
  const ids = new Set(components.map((c) => c.id));
  expect(ids.size, 'ids are unique').toBe(components.length);
  for (const c of components) {
    expect(c.name, c.id).toBeTruthy();
    expect(c.version, c.id).toBeTruthy();
    expect(c.shipped, c.id).toBeTruthy();
    expect(c.licences.length, `${c.id} has a licence`).toBeGreaterThan(0);
    for (const l of c.licences) {
      expect(l.name, c.id).toBeTruthy();
      expect(l.url.startsWith('https://') || hosted(l.url) || l.url.startsWith('/vendor/'), `${c.id} licence link ${l.url}`).toBe(true);
      if (hosted(l.url)) expect(existsSync(new URL(`../public${l.url}`, import.meta.url)), l.url).toBe(true);
      if (servedFromVendor(l.url)) expect(existsSync(new URL(`../${servedFromVendor(l.url)}`, import.meta.url)), `${l.url} has a source file in the repo`).toBe(true);
    }
    expect(c.project, `${c.id} project link`).toMatch(/^https:\/\//);
    expect(c.source, `${c.id} source link`).toMatch(/^https:\/\//);
    if (c.via) expect(ids.has(c.via), `${c.id} via ${c.via}`).toBe(true);
  }
});

test('LGPL and MPL components show a copyright, an exact source and the licence text', () => {
  const copyleft = components.filter((c) => c.copyleft);
  // The components the site is known to ship under these licences.
  for (const id of ['heic-to', 'libheif', 'libde265', 'lame', 'mediabunny', 'eigen-ort', 'eigen-mediapipe']) {
    expect(copyleft.map((c) => c.id), id).toContain(id);
  }
  for (const c of copyleft) {
    expect(c.copyright, `${c.id} copyright notice`).toBeTruthy();
    // A release tag, a commit, or a hosted tarball: never a bare repository or branch.
    expect(c.source, `${c.id} source pins a version`).toMatch(/\/(tree|-\/tree|\+)\/(v?\d[\w.]*|[0-9a-f]{40}|refs\/tags\/[\w.]+)$/);
    expect(c.licences.some((l) => hosted(l.url)), `${c.id} links a hosted licence text`).toBe(true);
    if (c.copyleft === 'lgpl') expect(c.replace, `${c.id} says which file to replace`).toMatch(/^\/vendor\//);
  }
});

test('the licenses page lists every component and is linked from About and the footer', async ({ request }) => {
  const html = await (await request.get('/licenses')).text();
  for (const c of components) {
    expect(html, c.id).toContain(c.source.replace(/&/g, '&amp;'));
  }
  expect(html).toContain('replace or relink the LGPL parts');
  expect(html).toContain('/licenses/LGPL-3.0.txt');
  expect(await (await request.get('/about')).text()).toContain('href="/licenses"');
  expect(html).toContain('href="/licenses"');
  for (const file of ['LGPL-3.0', 'LGPL-2.0', 'MPL-2.0', 'OpenSSL-1.0.2']) {
    const res = await request.get(`/licenses/${file}.txt`);
    expect(res.ok(), file).toBe(true);
  }
});

test('qpdf is credited as Apache-2.0 with its licence and NOTICE served next to the wasm', async ({ request }) => {
  const qpdf = components.find((c) => c.id === 'qpdf')!;
  const wrapper = components.find((c) => c.id === 'qpdf-wasm')!;
  expect(wrapper.licences.map((l) => l.name)).toEqual(['ISC']);
  expect(qpdf.version).toBe('12.2.0');
  expect(qpdf.source).toContain('/tree/v12.2.0');
  const dir = `/vendor/neslinesli93-qpdf-wasm@${vendor.qpdf.version}/`;
  expect(qpdf.licences[0]).toEqual({ name: 'Apache-2.0', url: `${dir}LICENSE-qpdf.txt` });
  expect(qpdf.licences.map((l) => l.url)).toContain(`${dir}NOTICE-qpdf.md`);
  expect(readFileSync(new URL('../vendor-licenses/qpdf-wasm/LICENSE-qpdf.txt', import.meta.url), 'utf8')).toContain('Apache License\n                           Version 2.0, January 2004');
  for (const file of ['LICENSE-qpdf.txt', 'NOTICE-qpdf.md', 'LICENSE-libjpeg-turbo.md', 'qpdf.wasm']) {
    const res = await request.get(`${dir}${file}`);
    expect(res.status(), file).toBe(200);
  }
  const html = await (await request.get('/licenses')).text();
  expect(html).toContain(`${dir}LICENSE-qpdf.txt`);
});
