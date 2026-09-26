// Tell IndexNow engines (Bing, Yandex, Seznam, Naver) that pages changed.
// Reads the URL list from the live sitemap so it submits exactly what is deployed.
// Usage: node scripts/indexnow.mjs [--dry-run] [https://stayput.dev/some-page ...]
import { readdirSync } from 'node:fs';

const site = 'https://stayput.dev';
const dryRun = process.argv.includes('--dry-run');
const explicit = process.argv.slice(2).filter((a) => a.startsWith('https://'));

const keyFile = readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('No IndexNow key file (32 hex chars + .txt) in public/');
const key = keyFile.slice(0, -4);

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

// The key file must be live before engines will accept the submission.
const served = (await text(`${site}/${keyFile}`)).trim();
if (served !== key) throw new Error(`${site}/${keyFile} serves "${served}", expected the key`);

let urls = explicit;
if (urls.length === 0) {
  const index = await text(`${site}/sitemap-index.xml`);
  for (const sitemap of index.match(/<loc>[^<]+<\/loc>/g) ?? []) {
    const xml = await text(sitemap.slice(5, -6));
    urls.push(...(xml.match(/<loc>[^<]+<\/loc>/g) ?? []).map((l) => l.slice(5, -6)));
  }
}
urls = urls.filter((u) => u.startsWith(`${site}/`));
if (urls.length === 0) throw new Error('No URLs to submit');

const body = { host: new URL(site).host, key, keyLocation: `${site}/${keyFile}`, urlList: urls };
console.log(`Submitting ${urls.length} URLs to IndexNow${dryRun ? ' (dry run)' : ''}`);
if (dryRun) process.exit(0);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
// 200 = accepted, 202 = accepted pending key validation.
console.log(`IndexNow responded ${res.status} ${await res.text()}`);
if (res.status !== 200 && res.status !== 202) process.exit(1);
