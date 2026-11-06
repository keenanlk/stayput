#!/usr/bin/env bash
# Generates the edge-case files tests/audio-splitter-hardening.spec.ts splits. Test tooling only (needs ffmpeg with libmp3lame, libopus, aac, flac).
# Usage: make-audio-splitter-fixtures.sh <output dir> [small|all]   ("small" skips the 2-hour and 3-hour recordings, which are big)
# Everything is a synthetic tone; nothing is third-party. Re-running skips files that already exist.
set -euo pipefail
out="${1:?output dir}"
which="${2:-all}"
mkdir -p "$out"
here="$(cd "$(dirname "$0")" && pwd)"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
# A tone that changes every 10 s, so a part cut at the wrong place measures different.
tone() { echo "aevalsrc=0.3*sin(2*PI*(300+20*floor(t/10))*t)|0.3*sin(2*PI*(400+20*floor(t/10))*t):s=${2:-44100}:d=${1}"; }
mk() { local f="$out/$1"; shift; [ -s "$f" ] || ff "$@" "$f"; }

mk song-60s.mp3 -f lavfi -i "$(tone 60)" -c:a libmp3lame -b:a 128k
mk aac-60s.m4a -f lavfi -i "$(tone 60)" -c:a aac -b:a 128k
mk opus-60s.webm -f lavfi -i "$(tone 60 48000)" -c:a libopus -b:a 96k
mk opus-60s.ogg -f lavfi -i "$(tone 60 48000)" -c:a libopus -b:a 96k
mk flac-60s.flac -f lavfi -i "$(tone 60)" -c:a flac
mk six-channel-60s.wav -f lavfi -i "aevalsrc=0.2*sin(2*PI*220*t)|0.2*sin(2*PI*330*t)|0.2*sin(2*PI*440*t)|0.1*sin(2*PI*55*t)|0.2*sin(2*PI*550*t)|0.2*sin(2*PI*660*t):s=48000:d=60:c=5.1" -c:a pcm_s16le
mk mono-8k-60s.wav -f lavfi -i "aevalsrc=0.3*sin(2*PI*440*t):s=8000:d=60" -c:a pcm_s16le
mk hires-96k-60s.wav -f lavfi -i "$(tone 60 96000)" -c:a pcm_s16le
mk video-with-audio.mp4 -f lavfi -i "testsrc2=size=320x240:rate=15:duration=60" -f lavfi -i "$(tone 60)" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest
mk video-no-audio.mp4 -f lavfi -i "testsrc2=size=320x240:rate=15:duration=60" -c:v libx264 -pix_fmt yuv420p -an
mk silent-60s.wav -f lavfi -i "anullsrc=r=44100:cl=stereo" -t 60 -c:a pcm_s16le
: > "$out/zero-length.mp3"
printf 'This is a text note, not a recording.\nIt was renamed to .mp3.\n' > "$out/text-renamed.mp3"
# A recording cut off part-way (a download that stopped): the first 40% of the bytes.
if [ ! -s "$out/truncated.mp3" ]; then
  size=$(wc -c < "$out/song-60s.mp3")
  head -c $((size * 4 / 10)) "$out/song-60s.mp3" > "$out/truncated.mp3"
fi
# Voice memos and 3GP: committed fixtures, copied so the spec reads one folder.
[ -e "$out/voice-memo.amr" ] || cp "$here/edge-cases/amr-nb.amr" "$out/voice-memo.amr"
[ -e "$out/voice-memo.3gp" ] || cp "$here/static/h263-amrnb.3gp" "$out/voice-memo.3gp"

if [ "$which" = all ]; then
  mk long-2h.mp3 -f lavfi -i "$(tone 7200)" -c:a libmp3lame -b:a 128k
  mk long-3h.mp3 -f lavfi -i "$(tone 10800)" -c:a libmp3lame -b:a 128k
fi
ls -l "$out"
