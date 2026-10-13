import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { inspect, configProblems } from '../vendor-builds/libav-avi/codec-lists.mjs';

// The committed AVI decoder holds only the demuxer and decoders whose patents have expired
// (docs/research/avi-decoder-codec-patents-2026-10.md), and none of WMV/VC-1, VP6, WMA, ASF, FLV, H.264 or AAC.
test('the AVI decoder build contains only the allowed components', async () => {
  const dist = fileURLToPath(new URL('../vendor-builds/libav-avi/dist/', import.meta.url));
  const { default: LibAV } = await import(/* @vite-ignore */ dist + 'libav-6.10.9.0-avi.mjs');
  const libav = await LibAV.LibAV({ noworker: true, base: dist });
  const { lines, wrong } = await inspect(libav);
  expect(lines.filter((l: string) => l.startsWith('FAIL')), 'components that are present or missing against the allow-list').toEqual([]);
  expect(wrong).toBe(0);
});

test('the AVI decoder config names only explicit components and none of the banned ones (WMV, VC-1, VP6, WMA, ASF, FLV, Nellymoser, H.264, AAC)', async () => {
  const dir = fileURLToPath(new URL('../vendor-builds/libav-avi/', import.meta.url));
  const problems = configProblems(readFileSync(dir + 'config.json', 'utf8'), readFileSync(dir + 'dist/ffmpeg-config.txt', 'utf8'));
  expect(problems).toEqual([]);
});

test('the banned-component check catches a banned entry', () => {
  expect(configProblems('["avformat","demuxer-avi","decoder-wmv3"]', '--enable-demuxer=avi\n')).toHaveLength(1);
  expect(configProblems('["avformat","all"]', '')).toHaveLength(1);
  expect(configProblems('["demuxer-avi"]', '--enable-decoder=vp6f\n')).toHaveLength(1);
});
