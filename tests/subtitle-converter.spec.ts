import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'subtitle-converter-'));
const srtFile = join(dir, 'lecture.srt');
const vttFile = join(dir, 'cours.vtt');
const badFile = join(dir, 'letter.srt');

test.beforeAll(() => {
  writeFileSync(srtFile, '1\n00:00:01,000 --> 00:00:03,500\nBienvenue au café.\n');
  writeFileSync(vttFile, '﻿WEBVTT\n\n00:01.000 --> 00:03.500 align:start\nBienvenue au café.\n');
  writeFileSync(badFile, 'Dear Ada, this is a letter.\n');
});

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  return errors;
}

async function convert(page: Page, file: string) {
  await page.setInputFiles('#file-input', file);
  await page.locator('#run').click();
  await expect(page.locator('#results')).toHaveClass(/is-active/, { timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#results-list button', { hasText: 'Download' }).click()]);
  return { name: download.suggestedFilename(), text: readFileSync((await download.path())!, 'utf8') };
}

test('the tool switches SRT to VTT and VTT to SRT by the file dropped', async ({ page }) => {
  const errors = await open(page, '/tools/subtitle-converter');
  const a = await convert(page, srtFile);
  expect(a.name).toBe('lecture.vtt');
  expect(a.text).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nBienvenue au café.\n');
  await page.reload();
  await expect(page.locator('#tool')).toHaveAttribute('data-ready', 'true');
  const b = await convert(page, vttFile);
  expect(b.name).toBe('cours.srt');
  expect(b.text).toBe('1\n00:00:01,000 --> 00:00:03,500\nBienvenue au café.\n');
  expect(errors).toEqual([]);
});

test('each preset defaults to its direction', async ({ page }) => {
  await open(page, '/srt-to-vtt');
  await expect(page.locator('#sub-format')).toHaveValue('vtt');
  expect((await convert(page, srtFile)).name).toBe('lecture.vtt');
  await open(page, '/vtt-to-srt');
  await expect(page.locator('#sub-format')).toHaveValue('srt');
  expect((await convert(page, vttFile)).name).toBe('cours.srt');
});

test('a file that is not a subtitle file shows an input error', async ({ page }) => {
  await open(page, '/tools/subtitle-converter');
  await page.setInputFiles('#file-input', badFile);
  await page.locator('#run').click();
  await expect(page.locator('#error')).toHaveClass(/is-active/);
  await expect(page.locator('#error')).toContainText('does not look like an SRT or WebVTT');
});
