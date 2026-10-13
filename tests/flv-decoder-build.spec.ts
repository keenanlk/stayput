import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { inspect, configProblems, summaryProblems, BANNED_CODECS } from '../vendor-builds/libav-flv/codec-lists.mjs';

// The committed FLV reader holds only the FLV demuxer and the MP3 decoder, and none of VP6, Sorenson Spark,
// WMV/VC-1, WMA, ASF, Nellymoser, H.264 or AAC (docs/research/flv-reader-codec-patents-2026-10.md).
const dir = fileURLToPath(new URL('../vendor-builds/libav-flv/', import.meta.url));

test('the FLV reader build contains only the allowed components', async () => {
  const dist = dir + 'dist/';
  const { default: LibAV } = await import(/* @vite-ignore */ dist + 'libav-6.10.9.0-flv.mjs');
  const libav = await LibAV.LibAV({ noworker: true, base: dist });
  const { lines, wrong } = await inspect(libav);
  expect(lines.filter((l: string) => l.startsWith('FAIL')), 'components that are present or missing against the allow-list').toEqual([]);
  expect(wrong).toBe(0);
  // The vp6 family, by name, whatever else the list says.
  for (const n of ['vp6', 'vp6f', 'vp6a', 'wmv3', 'vc1', 'wmapro']) {
    expect(await libav.avcodec_find_decoder_by_name(n), `decoder ${n}`).toBe(0);
  }
});

test('the FLV reader config and committed configure summary list no banned component (VP6, Spark, WMV, VC-1, WMA, ASF, Nellymoser, H.264, AAC)', async () => {
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
  expect(configProblems('["avformat","demuxer-flv","decoder-vp6f"]', '--enable-demuxer=flv\n')).toHaveLength(1);
  expect(configProblems('["avformat","demuxer-flv","decoder-flv"]', '')).toHaveLength(1);
  expect(configProblems('["avformat","demuxer-asf"]', '')).toHaveLength(1);
  expect(configProblems('["avformat","all"]', '')).toHaveLength(1);
  expect(configProblems('["demuxer-flv"]', '--enable-decoder=wmv3\n')).toHaveLength(1);
  expect(configProblems('["avformat","avcodec","demuxer-flv","parser-mpegaudio","decoder-mp3"]', '--enable-demuxer=flv\n--enable-decoder=mp3\n')).toEqual([]);
  expect(summaryProblems('Enabled decoders:\nmp3 vp6f\n\nEnabled demuxers:\nflv\n\nLicense: LGPL version 2.1 or later\n')).toHaveLength(1);
  expect(summaryProblems('Enabled decoders:\nmp3\n\nEnabled demuxers:\nflv\n\nLicense: LGPL version 2.1 or later\n')).toEqual([]);
});
