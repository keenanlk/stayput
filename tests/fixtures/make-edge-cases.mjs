// Makes the edge-case corpus in edge-cases/ (see edge-cases/README.md). Fixture tooling only: needs ffmpeg
// (libx264, libx265, libvpx-vp9, libopus, aac, libmp3lame, flac), ImageMagick 7 and heif-enc (libheif) on the PATH; none of it ships
// with the site. Run it from anywhere: node tests/fixtures/make-edge-cases.mjs
// Everything is generated from synthetic patterns and tones, so there is no third-party material and no personal data.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, truncateSync, writeFileSync, copyFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const out = new URL('./edge-cases/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'edge-'));
const f = (n) => join(out, n);
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
const magick = (...a) => execFileSync('magick', a, { stdio: 'inherit' });

// ---- helpers: damage a good file --------------------------------------------------------------------------------
const cutHalf = (src, dst) => writeFileSync(f(dst), readFileSync(f(src)).subarray(0, Math.floor(statSync(f(src)).size / 2)));
const patch = (src, dst, edit) => { const b = Buffer.from(readFileSync(f(src))); edit(b); writeFileSync(f(dst), b); };

// ---- video ------------------------------------------------------------------------------------------------------
const PATTERN = ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=2'];
const TONE = ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2'];
const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p'];
ff(...PATTERN, ...TONE, ...H264, '-c:a', 'aac', '-b:a', '48k', '-shortest', f('good.mp4'));
ff(...PATTERN, ...H264, '-an', f('no-audio.mp4'));
// An audio track that exists and is digital silence.
ff(...PATTERN, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', ...H264, '-c:a', 'aac', '-b:a', '32k', '-shortest', f('silent-track.mp4'));
// Turned 90 degrees by the display matrix only (the coded picture stays 320x240, it shows as 240x320), like a phone held upright.
ff('-display_rotation', '90', ...PATTERN, ...TONE, ...H264, '-c:a', 'aac', '-b:a', '48k', '-shortest', f('rotated-90.mp4'));
// Variable frame rate: frames dropped in an irregular pattern, timestamps kept (no constant-rate resampling).
ff(...PATTERN, ...TONE, '-vf', "select='lt(mod(n,7),3)+eq(mod(n,11),0)'", '-fps_mode', 'vfr', ...H264, '-c:a', 'aac', '-b:a', '48k', '-shortest', f('vfr.mp4'));
// HEVC, 8-bit (an iPhone's "High Efficiency" clip) and 10-bit HDR10 (BT.2020, PQ).
ff(...PATTERN, ...TONE, '-c:v', 'libx265', '-preset', 'veryfast', '-crf', '32', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '48k', '-shortest', f('hevc.mp4'));
ff(...PATTERN, ...TONE, '-c:v', 'libx265', '-preset', 'veryfast', '-crf', '32', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1',
  '-x265-params', 'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:log-level=error', '-c:a', 'aac', '-b:a', '48k', '-shortest', f('hdr10-hevc.mp4'));
// A very small picture, and a WebM (VP9 and Opus: royalty-free codecs).
ff('-f', 'lavfi', '-i', 'testsrc2=size=16x16:rate=15:duration=2', ...H264, '-an', f('tiny-16x16.mp4'));
ff(...PATTERN, ...TONE, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-c:a', 'libopus', '-b:a', '32k', '-shortest', f('good.webm'));
// Damage.
writeFileSync(f('zero.mp4'), '');
cutHalf('good.mp4', 'truncated-half.mp4');
// "moov" and "ftyp" renamed: the header bytes are wrong, the rest is intact.
patch('good.mp4', 'corrupt-header.mp4', (b) => { b.write('xxxx', 4, 'latin1'); const m = b.indexOf('moov'); if (m > 0) b.write('xxxx', m, 'latin1'); });
// Wrong extension: a QuickTime-compatible MP4 called .mov, text called .mp4, an audio-only M4A called .mp4.
copyFileSync(f('good.mp4'), f('mp4-named.mov'));
writeFileSync(f('text-named.mp4'), 'This is a plain text note, not a video.\nIt was renamed by mistake.\n');
ff(...TONE, '-c:a', 'aac', '-b:a', '48k', '-f', 'ipod', f('audio-only-named.mp4'));

// ---- audio ------------------------------------------------------------------------------------------------------
const SINE = ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2'];
ff(...SINE, '-c:a', 'libmp3lame', '-b:a', '64k', f('good.mp3'));
ff('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '2', f('silent.wav'));
ff('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '2', '-c:a', 'libmp3lame', '-b:a', '32k', f('silent.mp3'));
// Odd but patent-safe encodings: G.711 mu-law at 8 kHz, 24-bit PCM at 48 kHz stereo, 32-bit float, 8-bit unsigned, 24-bit FLAC, Vorbis in Ogg.
ff('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=2', '-c:a', 'pcm_mulaw', f('mulaw-8k.wav'));
ff('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', '-ac', '2', '-c:a', 'pcm_s24le', f('pcm24-48k-stereo.wav'));
ff('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050:duration=2', '-c:a', 'pcm_f32le', f('float32.wav'));
ff('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=11025:duration=2', '-c:a', 'pcm_u8', f('pcm8-11k.wav'));
ff(...SINE, '-sample_fmt', 's32', '-bits_per_raw_sample', '24', '-c:a', 'flac', f('flac24.flac'));
ff(...SINE, '-c:a', 'vorbis', '-strict', '-2', '-ac', '2', f('good.ogg'));
writeFileSync(f('zero.mp3'), '');
cutHalf('good.mp3', 'truncated-half.mp3');
patch('good.mp3', 'corrupt-header.mp3', (b) => b.fill(0xff, 0, 4096));
patch('silent.wav', 'corrupt-header.wav', (b) => b.write('RIFX', 0, 'latin1'));
writeFileSync(f('text-named.mp3'), 'These are lyrics, not music.\nLa la la.\n');
// A WAV whose data chunk claims more bytes than the file holds (a recording cut off by a crash).
patch('pcm24-48k-stereo.wav', 'wav-length-lies.wav', (b) => { const d = b.indexOf('data'); b.writeUInt32LE(0x7fffff00, d + 4); });

// ---- images -----------------------------------------------------------------------------------------------------
const SRC = join(scratch, 'src.png');
magick('-size', '160x120', 'gradient:#2a6fdb-#f0b429', '(', '-size', '60x60', 'xc:#d6336c', ')', '-gravity', 'center', '-composite', SRC);
copyFileSync(SRC, f('good.png'));
magick(SRC, '-quality', '80', f('good.jpg'));
magick(SRC, '-colorspace', 'CMYK', '-quality', '80', f('cmyk.jpg'));
magick(SRC, '-depth', '16', f('png16.png'));
magick(SRC, '-colorspace', 'Gray', '-depth', '16', f('gray16.png'));
magick('-size', '160x120', 'xc:none', '-fill', '#d6336c80', '-draw', 'circle 80,60 80,10', f('alpha.png'));
magick('-size', '1x1', 'xc:#2a6fdb', f('1x1.png'));
// EXIF orientation 6 (turned 90 degrees clockwise on display).
magick(SRC, '-quality', '80', '-orient', 'top-left', '-set', 'exif:Orientation', '6', f('exif-rotated.jpg'));
execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
ex = Image.Exif(); ex[274] = 6
im.save(sys.argv[2], quality=80, exif=ex)
`, SRC, f('exif-rotated.jpg')], { stdio: 'inherit' });
// HEIC: a still, a tiled image (libheif's HEIF tiling; heif-enc cannot write the 'grid' an iPhone uses), one with an alpha channel, and a 10-bit one.
const heif = (...a) => execFileSync('heif-enc', a, { stdio: 'inherit' });
magick(SRC, '-resize', '256x192!', join(scratch, 'big.png'));
heif('-q', '50', SRC, '-o', f('heic-still.heic'));
heif('-q', '50', '--cut-tiles', '64', join(scratch, 'big.png'), '-o', f('heic-tiled.heic'));
heif('-q', '50', f('alpha.png'), '-o', f('heic-alpha.heic'));
heif('-q', '50', '-b', '10', f('png16.png'), '-o', f('heic-10bit.heic'));
writeFileSync(f('zero.png'), '');
cutHalf('good.png', 'truncated-half.png');
cutHalf('good.jpg', 'truncated-half.jpg');
patch('good.png', 'corrupt-header.png', (b) => b.write('PNX', 1, 'latin1'));
patch('good.jpg', 'corrupt-header.jpg', (b) => b.fill(0, 0, 4));
copyFileSync(f('good.png'), f('png-named.jpg'));
copyFileSync(f('good.jpg'), f('jpg-named.png'));
writeFileSync(f('text-named.png'), 'Not a picture: a shopping list.\nmilk\neggs\n');

// ---- PDF --------------------------------------------------------------------------------------------------------
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 2; i++) {
  const page = doc.addPage([300, 400]);
  page.drawText(`Edge-case page ${i}`, { x: 40, y: 340, size: 18, font });
  page.drawRectangle({ x: 40, y: 80, width: 150 + i * 20, height: 120, color: rgb(0.2, 0.5, 0.4) });
}
writeFileSync(f('good.pdf'), await doc.save({ useObjectStreams: false }));
writeFileSync(f('zero.pdf'), '');
cutHalf('good.pdf', 'truncated-half.pdf');
// Broken cross-reference table: startxref points into the middle of the file and the xref offsets are shifted.
patch('good.pdf', 'broken-xref.pdf', (b) => {
  const s = b.toString('latin1');
  const x = s.lastIndexOf('startxref');
  b.write(String(7).padStart(String(s.slice(x + 10).split('\n')[0]).length, '0'), x + 10, 'latin1');
  const t = s.indexOf('xref\n0 ');
  for (let i = t + 20; i < t + 80 && i < x; i++) if (b[i] >= 0x30 && b[i] <= 0x39) b[i] = 0x39;
});
patch('good.pdf', 'corrupt-header.pdf', (b) => b.write('%PDX-9.9', 0, 'latin1'));
writeFileSync(f('text-named.pdf'), 'Meeting notes\n- agenda\n- budget\n');
copyFileSync(f('good.png'), f('png-named.pdf'));


// ---- more, from the failure catalogues (commands adapted to the small sizes kept here) ------------------------------
// A cloud-only placeholder: the right size, every byte zero (what a "free up space" phone leaves behind).
writeFileSync(f('zeros.mp4'), Buffer.alloc(65536));
// A JPEG that starts right and is noise after that.
writeFileSync(f('garbage.jpg'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(Array.from({ length: 20000 }, (_, i) => (i * 2654435761) >>> 24))]));
// MPEG-TS (a container the tools do not read), odd 853x481 size (VP9, since 4:2:0 H.264 refuses odd sizes), Motion JPEG in a MOV.
ff(...PATTERN, ...TONE, ...H264, '-c:a', 'aac', '-shortest', '-f', 'mpegts', f('sample.ts'));
ff('-f', 'lavfi', '-i', 'testsrc2=size=853x481:rate=15:duration=1', '-c:v', 'libvpx-vp9', '-b:v', '300k', f('odd-853x481.webm'));
ff('-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'mjpeg', '-c:a', 'pcm_s16le', '-shortest', f('mjpeg.mov'));
// 5.1 AC-3 in MKV, the moov-at-the-end MP4 with its last 4 KB cut off (a download that stopped near the end), ALAC, RF64.
ff(...PATTERN, '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=2', '-af', 'pan=5.1|FL=c0|FR=c0|FC=c0|LFE=c0|BL=c0|BR=c0', ...H264, '-c:a', 'ac3', '-shortest', f('ac3-51.mkv'));
writeFileSync(f('truncated-moov-end.mp4'), readFileSync(f('good.mp4')).subarray(0, statSync(f('good.mp4')).size - 4000));
ff(...SINE, '-c:a', 'alac', f('alac.m4a'));
ff('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=22050:duration=1', '-rf64', 'always', f('rf64.wav'));

rmSync(scratch, { recursive: true, force: true });
console.log('edge-case corpus written to', out);
