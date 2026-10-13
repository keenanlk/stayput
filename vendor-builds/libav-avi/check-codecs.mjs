// Lists which FFmpeg decoders, encoders and demuxers the built decoder really contains, by asking it.
//   node vendor-builds/libav-avi/check-codecs.mjs
// Exits non-zero if something outside the allow-list is present or something on it is missing.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inspect } from './codec-lists.mjs';

const dist = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const { default: LibAV } = await import(join(dist, 'libav-6.10.9.0-avi.mjs'));
const libav = await LibAV.LibAV({ noworker: true, base: dist });
const { lines, wrong } = await inspect(libav);
console.log(lines.join('\n'));
process.exit(wrong ? 1 : 0);
