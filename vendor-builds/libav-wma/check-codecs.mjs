// Lists which FFmpeg decoders, encoders and demuxers the built decoder really contains, by asking it.
//   node vendor-builds/libav-wma/check-codecs.mjs [dist-dir]
// Exits non-zero if something outside the allow-list is present or something on it is missing.
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { inspect, configProblems } from './codec-lists.mjs';

const dist = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), 'dist');
const { default: LibAV } = await import(join(dist, 'libav-6.10.9.0-wma.mjs'));
const libav = await LibAV.LibAV({ noworker: true, base: dist });
const { lines, wrong } = await inspect(libav);
const here = dirname(fileURLToPath(import.meta.url));
const problems = configProblems(readFileSync(join(here, 'config.json'), 'utf8'), readFileSync(join(dist, 'ffmpeg-config.txt'), 'utf8'));
console.log(lines.join('\n'));
for (const p of problems) console.log('FAIL config ' + p);
process.exit(wrong || problems.length ? 1 : 0);
