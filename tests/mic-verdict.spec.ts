import { test, expect } from '@playwright/test';

// The mic test is driven with a controlled stream: an oscillator at a set gain
// (gain 0 is true digital silence), so each verdict is checked at a known level.
// getUserMedia is defined on MediaDevices.prototype, which also sticks in WebKit.

const LEVELS = [
  { verdict: 'silent', gain: 0, text: /Silence/ },
  { verdict: 'quiet', gain: 0.001, text: /quiet/ }, // peak -60 dB, average about -63 dB
  { verdict: 'ok', gain: 0.1, text: /We can hear you/ }, // average about -23 dB
  { verdict: 'loud', gain: 1, text: /clipping/ }, // peak at 0 dB
] as const;

for (const { verdict, gain, text } of LEVELS) {
  test(`mic-test says ${verdict} for a tone at gain ${gain}`, async ({ page }) => {
    await page.route('**/stats.keenankaufman.com/**', (r) => r.fulfill({ status: 200, body: '' }));
    await page.addInitScript((g) => {
      MediaDevices.prototype.getUserMedia = async function () {
        const ctx = new AudioContext();
        await ctx.resume();
        const osc = ctx.createOscillator();
        osc.frequency.value = 440;
        const gainNode = ctx.createGain();
        gainNode.gain.value = g;
        const dest = ctx.createMediaStreamDestination();
        osc.connect(gainNode).connect(dest);
        osc.start();
        return dest.stream;
      };
    }, gain);
    await page.goto('/tools/mic-test');
    await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
    await page.locator('#mic-start').click();
    await expect(page.locator('#mic-panel')).toHaveAttribute('data-verdict', verdict, { timeout: 15_000 });
    await expect(page.locator('#mic-verdict')).toHaveText(text);
    // Let the readout settle, then check it never shows -∞ or a nonsense pair.
    await page.waitForTimeout(500);
    const readout = (await page.locator('#mic-db').textContent()) ?? '';
    expect(readout).not.toContain('∞');
    expect(readout).toMatch(/^(-?\d+|under -60) dB average, (-?\d+|under -60) dB peak$/);
    if (verdict === 'ok' || verdict === 'loud') expect(readout).not.toContain('under');
  });
}
