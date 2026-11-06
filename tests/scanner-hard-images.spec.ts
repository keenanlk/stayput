// @webkit-project
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../src/lib/qr-scan';

// Hard images made by tests/make-scanner-fixtures.mjs (test-only encoder, nothing shipped): small, tilted, blurred,
// low-contrast, inverted, heavily compressed, inside a 12 MP photo, several in one picture, and one with no code.
// Each is dropped on the real page. It must decode to the text below, or (no-code) end with the named class.
// Set SCANNER_OUTCOMES=<file> to append "name<TAB>outcome" lines (used for the before/after table in the PR).

const dir = fileURLToPath(new URL('./fixtures/scanners/', import.meta.url));
const QR = 'https://stayput.dev/qr-test?id=staa677';
const CASES: { name: string; expect: string[] | 'NoCodeFound' }[] = [
  { name: 'qr-small.png', expect: [QR] },
  { name: 'qr-tiny-crop.png', expect: [QR] },
  { name: 'qr-tilt15.png', expect: [QR] },
  { name: 'qr-tilt30-jpeg.jpg', expect: [QR] },
  { name: 'qr-blur.png', expect: [QR] },
  { name: 'qr-lowcontrast.png', expect: [QR] },
  { name: 'qr-inverted.png', expect: [QR] },
  { name: 'qr-jpeg-q15.jpg', expect: [QR] },
  { name: 'qr-in-12mp.jpg', expect: [QR] },
  { name: 'qr-in-12mp-small.jpg', expect: [QR] },
  { name: 'qr-multi.png', expect: ['one-111', 'two-222', 'three-333'] },
  { name: 'ean13-small.png', expect: ['5901234123457'] },
  { name: 'ean13-tilt20.png', expect: ['5901234123457'] },
  { name: 'ean13-blur.png', expect: ['5901234123457'] },
  { name: 'ean13-jpeg.jpg', expect: ['5901234123457'] },
  { name: 'ean13-in-12mp.jpg', expect: ['5901234123457'] },
  { name: 'upca-inverted.png', expect: ['0012345678905'] },
  { name: 'upca-lowcontrast.png', expect: ['0012345678905'] },
  { name: 'code128-tilt-small.png', expect: ['Stayput 12345'] },
  { name: 'code128-in-12mp.jpg', expect: ['Stayput 12345'] },
  { name: 'no-code.png', expect: 'NoCodeFound' },
];

test.beforeAll(() => {
  // The images are not committed: rebuild them when missing or when they came from another version of the script.
  const script = fileURLToPath(new URL('./make-scanner-fixtures.mjs', import.meta.url));
  const stamp = createHash('sha1').update(readFileSync(script)).digest('hex');
  const current = existsSync(dir + '.stamp') && readFileSync(dir + '.stamp', 'utf8') === stamp && existsSync(dir + 'no-code.png');
  if (!current) execFileSync(process.execPath, [script], { stdio: 'inherit' });
});

const classOf = (message: string): string => {
  if (message === MESSAGES.noCode) return 'NoCodeFound';
  if (message === MESSAGES.damaged) return 'DamagedCode';
  if (message === MESSAGES.notImage) return 'UnreadableFile';
  if (message === MESSAGES.tooLarge) return 'RangeError';
  if (message === MESSAGES.decoderFailed) return 'DecoderLoadError';
  return `unknown: ${message}`;
};

test.describe.configure({ timeout: 120_000 });
for (const c of CASES) {
  test(`scanner: ${c.name}`, async ({ page }) => {
    await page.route('https://stats.keenankaufman.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.goto('/tools/qr-code-scanner');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#file-input').setInputFiles(dir + c.name);
    const outcome = page.locator('#qs-results .qs-card, #error.is-active').first();
    await outcome.waitFor({ timeout: 90_000 });
    const failed = await page.locator('#error.is-active').count();
    let result: string;
    let texts: string[] = [];
    if (failed) {
      result = classOf((await page.locator('#error.is-active').innerText()).trim());
    } else {
      texts = await page.locator('#qs-results .qs-card').evaluateAll((cards) => cards.map((card) => card.textContent ?? ''));
      result = 'decoded';
    }
    if (process.env.SCANNER_OUTCOMES) appendFileSync(process.env.SCANNER_OUTCOMES, `${c.name}\t${result}\n`);
    if (c.expect === 'NoCodeFound') {
      expect(result).toBe('NoCodeFound');
    } else {
      expect(result, `ended with ${result}`).toBe('decoded');
      for (const want of c.expect) expect(texts.join('\n')).toContain(want);
    }
  });
}
