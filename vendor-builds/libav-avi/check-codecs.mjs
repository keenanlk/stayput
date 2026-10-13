// Lists which FFmpeg decoders and demuxers the built decoder really contains, by asking it.
//   node vendor-builds/libav-avi/check-codecs.mjs
// Exits non-zero if something outside the allow-list is present or something on it is missing.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const { default: LibAV } = await import(join(dist, 'libav-6.10.9.0-avi.mjs'));
const libav = await LibAV.LibAV({ noworker: true, base: dist });

// h263 comes with mpeg4: FFmpeg builds both from the same source file (MPEG-4 Part 2 is a superset of H.263 baseline).
const shipped = ['mpeg4', 'h263', 'mjpeg', 'mp3', 'mp2', 'ac3', 'pcm_s16le', 'pcm_u8', 'pcm_alaw', 'pcm_mulaw'];
const absent = [
  'wmv1', 'wmv2', 'wmv3', 'vc1', 'wmv3image', 'vc1image', 'vp6', 'vp6f', 'vp6a', 'flv', 'h264', 'hevc', 'vp8', 'vp9', 'av1',
  'msmpeg4v1', 'msmpeg4v2', 'msmpeg4v3', 'mpeg1video', 'mpeg2video', 'wmav1', 'wmav2', 'wmapro', 'wmalossless', 'wmavoice',
  'aac', 'aac_latm', 'adpcm_ms', 'adpcm_ima_wav', 'nellymoser', 'opus', 'vorbis', 'flac',
];
let bad = 0;
for (const [label, names, want] of [['shipped', shipped, true], ['absent', absent, false]]) {
  for (const n of names) {
    const found = (await libav.avcodec_find_decoder_by_name(n)) !== 0;
    const ok = found === want;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} decoder ${n.padEnd(14)} ${found ? 'present' : 'absent '} (${label})`);
  }
}
const shippedFormats = ['avi'];
const absentFormats = ['asf', 'flv', 'mov', 'matroska', 'mpeg', 'mpegts', 'ogg', 'wav', 'rm'];
for (const [names, want] of [[shippedFormats, true], [absentFormats, false]]) {
  for (const n of names) {
    const found = (await libav.av_find_input_format(n)) !== 0;
    if (found !== want) bad++;
    console.log(`${found === want ? 'ok  ' : 'FAIL'} demuxer ${n.padEnd(14)} ${found ? 'present' : 'absent '}`);
  }
}
console.log('encoders: aac', (await libav.avcodec_find_encoder_by_name('aac')) !== 0 ? 'present' : 'absent');
process.exit(bad ? 1 : 0);
