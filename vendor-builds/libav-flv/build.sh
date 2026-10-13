#!/usr/bin/env bash
# Rebuilds the FLV demuxer that Stayput serves from /vendor/libav.js@6.10.9.0/.
#
#   vendor-builds/libav-flv/build.sh [output-dir]
#
# Needs: node, npm, tar, xz and Docker. It takes the libav.js 6.10.9 npm package (which carries
# the libav.js and FFmpeg 9.0 sources, so nothing else is downloaded), writes the variant "flv"
# from config.json (libav.js's mkconfig.js turns each entry into FFmpeg configure flags, see
# ffmpeg-config.txt for the result), and builds it in the emscripten/emsdk:6.0.5 image.
# The three files land in output-dir (default ./dist next to this script).
# The work folder is made under $TMPDIR (default /tmp); Docker must be able to mount it (Colima shares $HOME and /tmp/colima).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mkdir -p "${1:-$here/dist}" && cd "${1:-$here/dist}" && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/libav-flv.XXXXXX")"
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
(cd src/configs && node mkconfig.js flv "$(cat "$here/config.json")")
docker run --rm -v "$work/src:/src" emscripten/emsdk:6.0.5 bash -c "
  set -e
  cd /src
  npm install --no-audit --no-fund >/dev/null 2>&1
  make -j8 dist/libav-$FULL-flv.mjs dist/libav-$FULL-flv.wasm.mjs
  chown -R $(id -u):$(id -g) /src
" 2>&1 | tee "$work/build.log" | tail -5
# What FFmpeg's configure reported it enabled, and under which licence.
sed -n '/^Enabled decoders:/,/^License:/p' "$work/build.log" | sed '/^WARNING/d' > "$out/configure-summary.txt"
grep -q '^License: LGPL version 2.1 or later' "$out/configure-summary.txt" || { echo "FFmpeg configure did not report LGPL 2.1 or later" >&2; exit 1; }
test -f src/dist/libav-$FULL-flv.wasm.wasm
cp src/dist/libav-$FULL-flv.mjs src/dist/libav-$FULL-flv.wasm.mjs src/dist/libav-$FULL-flv.wasm.wasm "$out/"
cp src/configs/configs/flv/ffmpeg-config.txt "$out/ffmpeg-config.txt"
# Fail the build if a banned component is in the config or the built module.
node "$here/check-codecs.mjs" "$out" > "$out/check-codecs-output.txt"
echo "built into $out"
