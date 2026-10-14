# WMA decoder build (FFmpeg libraries via libav.js, LGPL-2.1-or-later)

Stayput converts WMA files to MP3 in the browser. Browsers cannot read WMA, so the page loads a
decoder built from FFmpeg's libraries (libavformat, libavcodec, libswresample), compiled to
WebAssembly with [libav.js](https://github.com/Yahweasel/libav.js). It is fetched from
`/vendor/libav.js@6.10.9.0/` only when someone converts a WMA.

- `config.json`: the libav.js component list for the variant `wma`. `mkconfig.js` turns each entry
  into FFmpeg `--enable-*` flags (`dist/ffmpeg-config.txt`; everything else is `--disable-everything`).
- `build.sh`: rebuilds the three files from the libav.js 6.10.9 npm package (which carries the
  libav.js and FFmpeg 9.0 source tarballs) inside the `emscripten/emsdk:6.0.5` Docker image.
- `dist/`: the built files, committed so a normal `npm run build` needs no Docker. `scripts/vendor.mjs`
  copies them into `public/vendor/` (see the `libav-wma` entry in `src/data/vendor.json`).
- `dist/configure-summary.txt`: what FFmpeg's `configure` printed as enabled, with `License: LGPL version 2.1 or later`.
- `check-codecs.mjs`: lists the decoders and demuxers that are really in the build, and fails if a
  codec outside the allow-list is present (`codec-lists.mjs`). Its output is `dist/check-codecs-output.txt`.
  `tests/wma-decoder-build.spec.ts` runs the same check on every CI run.

## What is in

| | |
|---|---|
| Container | ASF (demuxer `asf`) |
| Sound | Windows Media Audio 1 and 2 (`wmav1`, `wmav2`) |
| Conversion | swresample, for sample formats |

Why: `docs/research/wma-decoder-codec-patents-2026-10.md`.

## What is out, on purpose

WMA Pro (`wmapro`), WMA Lossless (`wmalossless`) and WMA Voice (`wmavoice`), whose patents run to
about 2027-28; Windows Media Video and VC-1 (`wmv1`, `wmv2`, `wmv3`, `vc1`), VP6, FLV, H.264, AAC
and every other codec. The ASF demuxer still lists the video streams of a WMV file, but there is
no video decoder, so they are never decoded. A file that uses an excluded codec shows the named
error `UnsupportedWmaCodec` ("This file uses WMA Pro, which Stayput can't open").

## ASF notes

- The container's duration and the packets' timestamps include the ASF *preroll* (the first few
  seconds of buffering, usually 3 s in files written by FFmpeg and Windows Media Encoder), so the
  page does not use them for the output: the MP3's length is the number of samples the decoder
  produced.
- Broadcast-style ASF can have gaps and lost packets; the decoder is run with `ignoreErrors`, and
  gaps are not padded with silence.
- Windows Media DRM adds a Content Encryption object to the header; the page checks for it and
  refuses the file by name (`ProtectedWma`) instead of decoding scrambled packets into noise.

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
ee4e97f1426ec06e453b62197c5a89bb90b87d59fa33705090a2e8541e406fbd  libav-6.10.9.0-wma.mjs
64acf25998678a8eb3d199bd04a8686ceb69215e3c2ea84b6b41ccbff0a75a32  libav-6.10.9.0-wma.wasm.mjs
d4215a31558de30a5cf7984ff35a2ad35875b9f2475292659344eda5d7be9078  libav-6.10.9.0-wma.wasm.wasm
```
