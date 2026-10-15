import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { inspect, configProblems, summaryProblems, BANNED_CODECS } from '../vendor-builds/libav-3gp/codec-lists.mjs';

// The committed 3GP decoder holds only the MOV demuxer and the decoders for MPEG-4/H.263 and AMR, and none of VP6,
// WMV/VC-1, WMA, ASF, Nellymoser, H.264 or AAC (docs/research/3gp-decoder-codec-patents-2026-10.md).
const dir = fileURLToPath(new URL('../vendor-builds/libav-3gp/', import.meta.url));

test('the 3GP decoder build contains only the allowed components', async () => {
  const dist = dir + 'dist/';
  const { default: LibAV } = await import(/* @vite-ignore */ dist + 'libav-6.10.9.0-3gp.mjs');
  const libav = await LibAV.LibAV({ noworker: true, base: dist });
  const { lines, wrong } = await inspect(libav);
  expect(lines.filter((l: string) => l.startsWith('FAIL')), 'components that are present or missing against the allow-list').toEqual([]);
  expect(wrong).toBe(0);
  // The vp6 family, by name, whatever else the list says.
  for (const n of ['vp6', 'vp6f', 'vp6a', 'wmv3', 'vc1', 'wmapro']) {
    expect(await libav.avcodec_find_decoder_by_name(n), `decoder ${n}`).toBe(0);
  }
});

test('the 3GP decoder config and committed configure summary list no banned component (VP6, WMV, VC-1, WMA, ASF, Nellymoser, H.264, AAC)', async () => {
  const problems = [
    ...configProblems(readFileSync(dir + 'config.json', 'utf8'), readFileSync(dir + 'dist/ffmpeg-config.txt', 'utf8')),
    ...summaryProblems(readFileSync(dir + 'dist/configure-summary.txt', 'utf8')),
  ];
  expect(problems).toEqual([]);
  const summary = readFileSync(dir + 'dist/configure-summary.txt', 'utf8');
  expect(summary).toContain('License: LGPL version 2.1 or later');
  // Plain text check on the whole summary, besides the structured one: no banned name appears as a word.
  for (const name of ['vp6', 'vp6f', 'vp6a', 'wmv3', 'vc1', 'wmapro', 'h264', 'aac']) {
    expect(summary, name).not.toMatch(new RegExp(`(^|\\s)${name}(\\s|$)`));
  }
  expect(BANNED_CODECS).toEqual(expect.arrayContaining(['vp6', 'vp6f', 'vp6a', 'wmv3', 'vc1', 'wmapro']));
});

test('the banned-component check catches a banned entry', () => {
  expect(configProblems('["avformat","demuxer-mov","decoder-vp6f"]', '--enable-demuxer=mov\n')).toHaveLength(1);
  expect(configProblems('["avformat","demuxer-mov","decoder-flv"]', '')).toHaveLength(1);
  expect(configProblems('["avformat","demuxer-asf"]', '')).toHaveLength(1);
  expect(configProblems('["avformat","all"]', '')).toHaveLength(1);
  expect(configProblems('["demuxer-mov"]', '--enable-decoder=wmv3\n')).toHaveLength(1);
  expect(configProblems('["avformat","avcodec","demuxer-mov","decoder-mpeg4","decoder-amrnb"]', '--enable-demuxer=mov\n--enable-decoder=amrnb\n')).toEqual([]);
  expect(summaryProblems('Enabled decoders:\namrnb vp6f\n\nEnabled demuxers:\nmov\n\nLicense: LGPL version 2.1 or later\n')).toHaveLength(1);
  expect(summaryProblems('Enabled decoders:\namrnb mpeg4\n\nEnabled demuxers:\nmov\n\nLicense: LGPL version 2.1 or later\n')).toEqual([]);
});
