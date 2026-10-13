# FLV reader build (FFmpeg libraries via libav.js, LGPL-2.1-or-later)

Stayput converts FLV files to MP4 in the browser. Browsers cannot read the FLV container, so the page
loads a reader built from FFmpeg's libraries (libavformat, libavcodec), compiled to WebAssembly with
[libav.js](https://github.com/Yahweasel/libav.js). It is fetched from `/vendor/libav.js@6.10.9.0/`
only when someone converts an FLV. The same folder also serves the AVI build (`libav-6.10.9.0-avi.*`).

- `config.json`: the libav.js component list for the variant `flv`. `mkconfig.js` turns each entry
  into FFmpeg `--enable-*` flags (`dist/ffmpeg-config.txt`; everything else is `--disable-everything`).
- `build.sh`: rebuilds the three files from the libav.js 6.10.9 npm package (which carries the
  libav.js and FFmpeg 9.0 source tarballs) inside the `emscripten/emsdk:6.0.5` Docker image.
- `dist/`: the built files, committed so a normal `npm run build` needs no Docker. `scripts/vendor.mjs`
  copies them into `public/vendor/` (see the `libavFlv` entry in `src/data/vendor.json`).
- `dist/configure-summary.txt`: what FFmpeg's `configure` printed as enabled, with `License: LGPL version 2.1 or later`.
- `check-codecs.mjs`: lists the decoders and demuxers that are really in the build, and fails if a
  banned codec is present or something on the list is missing. Output: `dist/check-codecs-output.txt`.

## What is in

| | |
|---|---|
| Container | FLV (demuxer `flv`) |
| Sound decoder | MP3 (`mp3`, with the `mpegaudio` parser) |

Nothing else: no video decoder at all. An FLV's H.264 picture and AAC sound are copied into the MP4
as they are (the page reads their headers itself), and MP3 is decoded here and written as AAC.
Reasoning: `docs/research/flv-reader-codec-patents-2026-10.md`.

## What is out, on purpose

VP6 (`vp6`, `vp6f`, `vp6a`), Sorenson Spark (`flv`), WMV1-3, VC-1, WMA, Nellymoser, ASF, and any
H.264, AAC or HEVC decoder. An FLV that uses one of them shows the named error `UnsupportedFlvCodec`.

## Licence and replacing it

FFmpeg and libav.js are LGPL-2.1-or-later ([text](/licenses/LGPL-2.1.txt)). The wasm is a separate
file loaded by URL, not linked into Stayput's JavaScript: build your own with `build.sh` (change
`config.json` if you want other components), put the three files in `dist/`, and run
`npm run build`; or answer the URL in your browser with a file of your own.

Sources: FFmpeg 9.0 (tag `n9.0`, https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz) and libav.js
v6.10.9.0 (https://github.com/Yahweasel/libav.js/tree/v6.10.9.0); both tarballs are inside
https://registry.npmjs.org/libav.js/-/libav.js-6.10.9.tgz under `sources/`.

## Reproducing the committed files

A rebuild with `build.sh` produced byte-identical files (checked 2026-10-13, Docker `emscripten/emsdk:6.0.5` on arm64;
an emsdk 6.0.5 install on macOS gave the same bytes):

```
6e4da915d8b27b639f87d6d25dbf3654f1acc9c84818d61860509276d8cbb03a  libav-6.10.9.0-flv.mjs
957064312ebd83e67ccb1f9a878a28e4e3e55a554238089e56e5519a711d9593  libav-6.10.9.0-flv.wasm.mjs
c17181b8e2b3a8b463a351502beaa6a5bba1a8c7f73df8056328f90cf8e8b84c  libav-6.10.9.0-flv.wasm.wasm
```
