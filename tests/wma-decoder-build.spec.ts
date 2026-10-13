import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { inspect, configProblems, summaryDecoders, BANNED, SHIPPED_DECODERS } from '../vendor-builds/libav-wma/codec-lists.mjs';

// The committed WMA decoder holds only the ASF demuxer and the Windows Media Audio 1 and 2 decoders
// (docs/research/wma-decoder-codec-patents-2026-10.md), and none of WMA Pro, WMA Lossless, WMA Voice, WMV, VC-1 or VP6.
const dir = fileURLToPath(new URL('../vendor-builds/libav-wma/', import.meta.url));

test('the WMA decoder build contains only the allowed components', async () => {
  const dist = dir + 'dist/';
  const { default: LibAV } = await import(/* @vite-ignore */ dist + 'libav-6.10.9.0-wma.mjs');
  const libav = await LibAV.LibAV({ noworker: true, base: dist });
  const { lines, wrong } = await inspect(libav);
  expect(lines.filter((l: string) => l.startsWith('FAIL')), 'components that are present or missing against the allow-list').toEqual([]);
  expect(wrong).toBe(0);
  for (const name of ['wmapro', 'wmalossless', 'wmavoice', 'wmv3', 'vc1', 'vp6', 'vp6f', 'vp6a']) {
    expect(await libav.avcodec_find_decoder_by_name(name), name).toBe(0);
  }
});

test('the committed configure summary lists only the asf demuxer and the wmav1 and wmav2 decoders', () => {
  const summary = readFileSync(dir + 'dist/configure-summary.txt', 'utf8');
  expect(summaryDecoders(summary).sort()).toEqual(['wmav1', 'wmav2']);
  expect(/Enabled demuxers:\n([\s\S]*?)\n\n/.exec(summary)?.[1]?.trim()).toBe('asf');
  expect(/Enabled (encoders|parsers|muxers|hwaccels|bsfs):\n\n/.test(summary)).toBe(true);
  expect(summary).toContain('License: LGPL version 2.1 or later');
  for (const banned of BANNED) expect(summary, banned).not.toMatch(new RegExp(`\\b${banned}\\b`));
  expect(SHIPPED_DECODERS).toEqual(['wmav1', 'wmav2']);
});

test('the WMA decoder config names only explicit components and none of the banned ones', () => {
  const problems = configProblems(readFileSync(dir + 'config.json', 'utf8'), readFileSync(dir + 'dist/ffmpeg-config.txt', 'utf8'));
  expect(problems).toEqual([]);
});

test('the banned-component check catches a banned entry', () => {
  expect(configProblems('["avformat","demuxer-asf","decoder-wmapro"]', '--enable-demuxer=asf\n')).toHaveLength(1);
  expect(configProblems('["avformat","demuxer-asf","decoder-wmalossless"]', '')).toHaveLength(1);
  expect(configProblems('["demuxer-asf"]', '--enable-decoder=wmavoice\n')).toHaveLength(1);
  expect(configProblems('["demuxer-asf","decoder-vc1"]', '')).toHaveLength(1);
  expect(configProblems('["avformat","all"]', '')).toHaveLength(1);
  expect(configProblems('["avformat","demuxer-asf","decoder-wmav1","decoder-wmav2"]', '--enable-decoder=wmav1\n--enable-decoder=wmav2\n')).toEqual([]);
});
