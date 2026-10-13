# AVI decoder build (FFmpeg libraries via libav.js, LGPL-2.1-or-later)

Stayput converts AVI files to MP4 in the browser. Browsers cannot read AVI and have no decoder for
Xvid, DivX or Motion JPEG, so the page loads a decoder built from FFmpeg's libraries
(libavformat, libavcodec, libswscale, libswresample), compiled to WebAssembly with
[libav.js](https://github.com/Yahweasel/libav.js). It is fetched from `/vendor/libav.js@6.10.9.0/`
only when someone converts an AVI.

- `config.json`: the libav.js component list for the variant `avi`. `mkconfig.js` turns each entry
  into FFmpeg `--enable-*` flags (`dist/ffmpeg-config.txt`; everything else is `--disable-everything`).
- `build.sh`: rebuilds the three files from the libav.js 6.10.9 npm package (which carries the
  libav.js and FFmpeg 9.0 source tarballs) inside the `emscripten/emsdk:6.0.5` Docker image.
- `dist/`: the built files, committed so a normal `npm run build` needs no Docker. `scripts/vendor.mjs`
  copies them into `public/vendor/` (see the `libav` entry in `src/data/vendor.json`).
- `dist/configure-summary.txt`: what FFmpeg's `configure` printed as enabled, with `License: LGPL version 2.1 or later`.
- `check-codecs.mjs`: lists the decoders and demuxers that are really in the build, and fails if a
  codec outside the allow-list is present. Its output is `dist/check-codecs-output.txt`.

## What is in

| | |
|---|---|
| Container | AVI (demuxer `avi`) |
| Video | MPEG-4 Part 2 (`mpeg4`, with `h263`), Motion JPEG (`mjpeg`) |
| Sound | MP3, MP2, AC-3, PCM (signed 16-bit, unsigned 8-bit, A-law, mu-law) |
| Conversion | swscale and swresample, for pixel and sample formats |

Why each is allowed, with sources: `docs/research/avi-decoder-codec-patents-2026-10.md`.

## What is out, on purpose

H.264, AAC, WMV1-3, VC-1, WMA, VP6, Sorenson Spark, and the ASF and FLV demuxers (no code is
compiled in), plus MS-MPEG4 v1-3 and ADPCM, which lack an expiry source. An AVI that uses one of
them shows the named error `UnsupportedAviCodec`.

## Licence and replacing it

FFmpeg and libav.js are LGPL-2.1-or-later ([text](/licenses/LGPL-2.1.txt)). The wasm is a separate
file loaded by URL, not linked into Stayput's JavaScript: build your own with `build.sh` (change
`config.json` if you want other components), put the three files in `dist/`, and run
`npm run build`; or answer the URL in your browser with a file of your own.

Sources: FFmpeg 9.0 (tag `n9.0`, https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz) and libav.js
v6.10.9.0 (https://github.com/Yahweasel/libav.js/tree/v6.10.9.0); both tarballs are inside
https://registry.npmjs.org/libav.js/-/libav.js-6.10.9.tgz under `sources/`.

## Reproducing the committed files

A rebuild with `build.sh` produced byte-identical files (checked 2026-10-13, Docker `emscripten/emsdk:6.0.5`):

```
bfeb34019b5969dd5aa0960afd4c75d2b1cf7013af7729d2d500df5eebdb161d  libav-6.10.9.0-avi.mjs
d68a223d15f3073c26ff50219e290452800586d2d68ffe5ac57f6fd2c73fb07c  libav-6.10.9.0-avi.wasm.mjs
e56c39c02b9f0bb202b6971d40696f1b4839854d7f34666a24d746ced89ad683  libav-6.10.9.0-avi.wasm.wasm
```
