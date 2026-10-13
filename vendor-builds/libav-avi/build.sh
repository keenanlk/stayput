#!/usr/bin/env bash
# Rebuilds the AVI decoder that Stayput serves from /vendor/libav.js@6.10.9.0/.
#
#   vendor-builds/libav-avi/build.sh [output-dir]
#
# Needs: node, npm, tar, xz and Docker. It takes the libav.js 6.10.9 npm package (which carries
# the libav.js and FFmpeg 9.0 sources, so nothing else is downloaded), writes the variant "avi"
# from config.json (libav.js's mkconfig.js turns each entry into FFmpeg configure flags, see
# ffmpeg-config.txt for the result), and builds it in the emscripten/emsdk:6.0.5 image.
# The three files land in output-dir (default ./dist next to this script).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mkdir -p "${1:-$here/dist}" && cd "${1:-$here/dist}" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
LIBAVJS=6.10.9
FULL=6.10.9.0
cd "$work"
npm pack "libav.js@$LIBAVJS" --silent >/dev/null
tar xzf libav.js-*.tgz
mkdir src
tar xJf package/sources/libav.js.tar.xz -C src
mkdir -p src/build
cp package/sources/ffmpeg-9.0.tar.xz package/sources/emfiberthreads-1.3.tar.gz package/sources/zlib-1.3.2.tar.gz src/build/
(cd src/configs && node mkconfig.js avi "$(cat "$here/config.json")")
docker run --rm -v "$work/src:/src" emscripten/emsdk:6.0.5 bash -c "
  set -e
  cd /src
  npm install --no-audit --no-fund >/dev/null 2>&1
  make -j8 dist/libav-$FULL-avi.mjs dist/libav-$FULL-avi.wasm.mjs
  chown -R $(id -u):$(id -g) /src
" 2>&1 | tee "$work/build.log" | tail -5
# What FFmpeg's configure reported it enabled, and under which licence.
sed -n '/^Enabled decoders:/,/^License:/p' "$work/build.log" | sed '/^WARNING/d' > "$out/configure-summary.txt"
grep -q '^License: LGPL version 2.1 or later' "$out/configure-summary.txt" || { echo "FFmpeg configure did not report LGPL 2.1 or later" >&2; exit 1; }
test -f src/dist/libav-$FULL-avi.wasm.wasm
cp src/dist/libav-$FULL-avi.mjs src/dist/libav-$FULL-avi.wasm.mjs src/dist/libav-$FULL-avi.wasm.wasm "$out/"
cp src/configs/configs/avi/ffmpeg-config.txt "$out/ffmpeg-config.txt"
echo "built into $out"
