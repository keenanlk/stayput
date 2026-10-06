import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { tools, toolPath } from '../src/data/tools';
import { guides } from '../src/data/guides';

const dist = new URL('../dist/', import.meta.url);

test('every sitemap URL is a canonical stayput.dev page', async ({ request }) => {
  const xml = readFileSync(new URL('sitemap-0.xml', dist), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(urls.length).toBeGreaterThan(40);
  for (const url of urls) {
    expect(url.startsWith('https://stayput.dev/')).toBe(true);
    const path = new URL(url).pathname;
    const html = await (await request.get(path)).text();
    expect(html, path).toContain(`<link rel="canonical" href="${url}">`);
    expect(html, path).not.toContain('noindex');
  }
});

test('404 page is kept out of the index', async ({ request }) => {
  const html = await (await request.get('/does-not-exist')).text();
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).not.toContain('rel="canonical"');
});

test('IndexNow key file serves its own key', async ({ request }) => {
  const keyFile = readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  expect(keyFile).toBeTruthy();
  const body = await (await request.get(`/${keyFile}`)).text();
  expect(body.trim()).toBe(keyFile!.slice(0, -4));
});

test('press page offers every logo as SVG and PNG, and the files are served', async ({ page, request }) => {
  await page.goto('/press');
  const hrefs = await page.locator('.logo-tile .dl a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  for (const name of ['wordmark-light', 'wordmark-dark', 'mark-light', 'mark-dark']) {
    expect(hrefs).toContain(`/press/stayput-${name}.svg`);
    expect(hrefs).toContain(`/press/stayput-${name}.png`);
  }
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toMatch(href.endsWith('.svg') ? /image\/svg\+xml/ : /image\/png/);
    // Outlined text only, so the wordmark looks the same without the font installed.
    if (href.endsWith('.svg')) expect(await res.text(), href).not.toContain('<text');
  }
  await expect(page.locator('footer a[href="/press"]')).toBeVisible();
});

test('llms.txt lists every tool and guide with working links', async ({ request }) => {
  const res = await request.get('/llms.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/plain');
  const body = await res.text();
  expect(body.startsWith('# Stayput\n\n> ')).toBe(true);
  for (const t of tools) expect(body).toContain(`](https://stayput.dev${toolPath(t)})`);
  for (const g of guides) expect(body).toContain(`](https://stayput.dev/guides/${g.slug})`);
  const paths = [...body.matchAll(/\]\(https:\/\/stayput\.dev(\/[^)]*)\)/g)].map((m) => m[1]!);
  for (const path of new Set(paths)) expect((await request.get(path)).status(), path).toBe(200);
});

test('/tools has no page of its own: vercel.json sends it, and only it, to the tool list on the home page', async ({ request }) => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rule = vercel.redirects.find((r: { source: string }) => r.source === '/tools');
  expect(rule).toMatchObject({ destination: '/#tools', permanent: true });
  // The source is an exact path (no :param or wildcard), so /tools/<slug> is not caught, and the target section exists.
  expect(rule.source).not.toMatch(/[:*(]/);
  expect(vercel.redirects.some((r: { source: string }) => /^\/tools\/[:*(]/.test(r.source))).toBe(false);
  const home = await (await request.get('/')).text();
  expect(home).toMatch(/id="tools"/);
  // The sitemap never lists the redirecting path.
  const xml = readFileSync(new URL('sitemap-0.xml', dist), 'utf8');
  expect(xml).not.toMatch(/<loc>https:\/\/stayput\.dev\/tools\/?<\/loc>/);
  // A real tool page still loads.
  expect((await request.get('/tools/heic-to-jpg')).status()).toBe(200);
});

test('archive tool pages only claim password support for ZIP, in the visible FAQ and in the FAQPage data', async ({ request }) => {
  for (const path of ['/tools/archive-extractor', '/rar-extractor', '/open-7z-file']) {
    const html = await (await request.get(path)).text();
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!)).find((j) => j['@type'] === 'FAQPage');
    expect(ld, path).toBeTruthy();
    const answers: string[] = ld.mainEntity.map((q: { acceptedAnswer: { text: string } }) => q.acceptedAnswer.text);
    for (const a of answers) expect(html, path).toContain(a.replace(/&/g, '&amp;').replace(/’/g, '’'));
    expect(html, path).not.toMatch(/including (encrypted 7z|password-protected ones)|password-protected ones too/);
    if (path === '/tools/archive-extractor') expect(answers.join(' ')).toMatch(/ZIP files open after you enter the password.*7z and RAR archives are not supported yet/);
  }
});

test('MP4 to MP3 and Video to MP3 target different queries, with no size-limit claims and a footer link', async ({ request }) => {
  const mp4 = await (await request.get('/mp4-to-mp3')).text();
  const video = await (await request.get('/tools/video-to-mp3')).text();
  expect(mp4).toContain('<title>MP4 to MP3 Converter: Free, Private, No Upload | Stayput</title>');
  expect(mp4).toContain('<link rel="canonical" href="https://stayput.dev/mp4-to-mp3"');
  expect(video).toContain('<link rel="canonical" href="https://stayput.dev/tools/video-to-mp3"');
  expect(video).toContain('Have an MP4? Use <a href="/mp4-to-mp3">');
  expect(tools.find((t) => t.slug === 'video-to-mp3')!.keywords).not.toContain('mp4 to mp3');
  for (const html of [mp4, video]) expect(html).not.toMatch(/no limit|no size limit|no file size limit|unlimited|no size caps/i);
  for (const q of ['What is the difference between MP4 and MP3?', 'Is there a maximum file size?', 'Can I convert only part of the video?']) {
    expect(mp4).toContain(q);
    expect(mp4).toContain(`"name":"${q}"`);
  }
  expect(await (await request.get('/tools/merge-pdf')).text()).toContain('<a href="/mp4-to-mp3">MP4 to MP3</a>');
});

test('Webcam test, mic test and compress PDF carry the reworked copy, sections, links and footer entries', async ({ request }) => {
  const get = async (path: string) => (await request.get(path)).text();
  const [webcam, mic, pdf] = await Promise.all([get('/tools/webcam-test'), get('/tools/mic-test'), get('/tools/compress-pdf')]);
  expect(webcam).toContain('<title>Webcam Test: Check Camera Resolution and FPS | Stayput</title>');
  expect(mic).toContain('<title>Mic Test: Check Your Microphone Online, No Upload | Stayput</title>');
  expect(pdf).toContain('<title>Compress PDF Online: Free, No Upload, Set a Size | Stayput</title>');
  for (const h of ['What this test shows', 'Webcam not working?']) expect(webcam).toContain(`<h2>${h}</h2>`);
  for (const h of ['Test a headset or external microphone', 'Tips for a clean recording', 'Microphone not working? Check these first']) expect(mic).toContain(`<h2>${h}</h2>`);
  expect(pdf).toContain('<h2>Compress to a set size: 100 KB, 200 KB, 500 KB, 1 MB, 2 MB</h2>');
  // FAQ JSON-LD carries the new questions as plain text, with no link markup.
  for (const [html, qs] of [
    [webcam, ['How do I test my webcam on Windows or Mac?', 'Can I test my webcam before a Zoom or Teams call?']],
    [mic, ['How do I test my microphone on Windows or Mac?', 'How do I test an external or USB microphone?', 'Does the mic test work on a phone?']],
    [pdf, ['How do I compress a scanned PDF?', 'Can I compress a PDF on my phone?', 'Will compressing change my text, links or forms?']],
  ] as [string, string[]][]) {
    for (const q of qs) expect(html).toContain(`"name":"${q}"`);
  }
  // Every listed link is in the page and goes to a page that exists without a redirect.
  const links: [string, string[]][] = [
    ['/tools/mic-test', ['/tools/voice-recorder', '/tools/remove-noise']],
    ['/tools/compress-pdf', ['/compress-pdf-to-100kb', '/compress-pdf-to-200kb', '/compress-pdf-to-500kb', '/compress-pdf-to-1mb', '/compress-pdf-to-2mb', '/tools/split-pdf', '/guides/compress-pdf-without-losing-quality']],
    ...['/tools/tuner', '/tools/metronome', '/tools/screen-recorder', '/screen-recorder-with-audio', '/tools/vocal-remover', '/tools/audio-converter'].map((p): [string, string[]] => [p, ['/tools/mic-test']]),
    ...['/tools/passport-photo', '/tools/profile-picture-maker'].map((p): [string, string[]] => [p, ['/tools/webcam-test']]),
    ['/tools/heic-to-jpg', ['/tools/mic-test', '/tools/webcam-test']],
  ];
  for (const [from, targets] of links) {
    const html = await get(from);
    for (const t of targets) {
      expect(html, `${from} -> ${t}`).toContain(`href="${t}"`);
      expect((await request.get(t, { maxRedirects: 0 })).status(), t).toBe(200);
    }
  }
  // Mic and camera copy follows the privacy page; none of the claims the site avoids.
  for (const slug of ['webcam-test', 'mic-test', 'compress-pdf']) expect(JSON.stringify(tools.find((t) => t.slug === slug)), slug).not.toMatch(/no limit|unlimited|any device|any phone|every device|no data|zero requests/i);
  expect(mic).toContain('handled inside the page in your tab and is never sent to a server');
});

test('HEIC to JPG explains how to open HEIC, links related pages and says the decoder comes from this site', async ({ request }) => {
  const html = await (await request.get('/tools/heic-to-jpg')).text();
  expect(html).toContain('How to open or convert HEIC on Windows, Mac and iPhone');
  expect(html).toContain('What is a HEIC file?');
  for (const href of ['/guides/open-heic-files-on-windows', '/heic-to-png', '/tools/strip-exif']) expect(html).toContain(`href="${href}"`);
  expect(html).toContain('downloaded once from this site and cached');
  expect(html).not.toMatch(/CDN|no size caps/i);
  for (const q of ['What is the difference between HEIC and HEIF?', 'Can I convert HEIC to JPG without losing the location?', 'How do I open a HEIC file on Windows?']) {
    expect(html).toContain(q);
    expect(html).toContain(`"name":"${q}"`);
  }
});
