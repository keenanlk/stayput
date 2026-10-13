import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { isHardwareRenderer } from '../src/lib/gl-renderer';

// Better edges runs on the graphics chip where there is a real one, and must still finish on the CPU where there is not.
// Headless Chromium has no real chip (it renders WebGL in software), so the run below is the CPU fallback; the other
// video background specs run the same way.
const clip = fileURLToPath(new URL('./fixtures/static/iphone-portrait-person.mov', import.meta.url));

test('software renderers do not count as a graphics chip', () => {
  expect(isHardwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)')).toBe(true);
  expect(isHardwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
  expect(isHardwareRenderer('Apple GPU')).toBe(true);
  expect(isHardwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(false);
  expect(isHardwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(false);
  expect(isHardwareRenderer('Microsoft Basic Render Driver')).toBe(false);
});

async function finishes(page: Page) {
  await page.goto('/tools/video-background-remover');
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  await page.locator('#file-input').setInputFiles([clip]);
  await page.locator('input[name="finder"][value="edges"]').evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 360_000 });
  await expect(page.locator('#error')).not.toHaveClass(/is-active/);
}

test('Better edges finishes on the CPU where WebGL is only a software renderer', async ({ page }) => {
  test.setTimeout(420_000);
  // Headless Chromium renders WebGL in software (SwiftShader): the page must not hand the model to it.
  const logged: string[] = [];
  page.on('console', (m) => logged.push(m.text()));
  await finishes(page);
  expect(logged.some((l) => /SOFTMAX activation function chosen on GPU/.test(l))).toBe(false);
});
