# 3GP decoder build (FFmpeg libraries via libav.js, LGPL-2.1-or-later)

Stayput converts 3GP and 3G2 phone videos to MP4 in the browser. Their usual picture (H.263, MPEG-4 Part 2)
and sound (AMR-NB, AMR-WB) have no WebCodecs decoder, so the page loads a decoder built from FFmpeg's
libraries (libavformat, libavcodec), compiled to WebAssembly with [libav.js](https://github.com/Yahweasel/libav.js).
It is fetched from `/vendor/libav.js@6.10.9.0/` only when someone converts a 3GP.

- `config.json`: the libav.js component list for the variant `3gp` (`dist/ffmpeg-config.txt` has the resulting
  `--enable-*` flags; everything else is `--disable-everything`).
- `build.sh`: rebuilds the three files from the libav.js 6.10.9 npm package inside the `emscripten/emsdk:6.0.5` Docker image.
- `dist/`: the built files, committed so a normal `npm run build` needs no Docker (`scripts/vendor.mjs` copies them
  into `public/vendor/`, see the `libav3gp` entry in `src/data/vendor.json`).
- `check-codecs.mjs`: lists the decoders and demuxers that are really in the build and fails on anything outside the allow-list.

## What is in

| | |
|---|---|
| Container | MOV/MP4/3GP demuxer (`mov`) |
| Video | MPEG-4 Part 2 (`mpeg4`, with `h263`) |
| Sound | AMR-NB (`amrnb`), AMR-WB (`amrwb`) |

H.264 and AAC inside a 3GP are not decoded: their packets are copied into the MP4 as they are.

## What is out, on purpose

H.264, AAC, WMV, VC-1, VP6, WMA and every other codec; the ASF and FLV demuxers. A 3GP that uses one of
them for decoding shows the named error `UnsupportedThreeGpCodec`. See `docs/research/3gp-decoder-codec-patents-2026-10.md`.

## Licence and replacing it

FFmpeg and libav.js are LGPL-2.1-or-later ([text](/licenses/LGPL-2.1.txt)). The AMR decoders are FFmpeg's own
(`libavcodec/amrnbdec.c`, `amrwbdec.c`), not the separate opencore or VisualOn libraries. The wasm is a separate
file loaded by URL, not linked into Stayput's JavaScript: build your own with `build.sh`, or answer the URL in your
browser with a file of your own.

Sources: FFmpeg 9.0 (tag `n9.0`, https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz) and libav.js v6.10.9.0
(https://github.com/Yahweasel/libav.js/tree/v6.10.9.0); both tarballs are inside
https://registry.npmjs.org/libav.js/-/libav.js-6.10.9.tgz under `sources/`.
