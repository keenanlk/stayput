#!/usr/bin/env bash
# Makes the small 3GP files the 3GP to MP4 specs use, into static/. Test-fixture tooling only:
# native ffmpeg is never shipped with the site. 176x144, 15 fps, 4 s, with a 440 Hz tone.
# AMR needs an ffmpeg built with libopencore_amrnb. Without one, run this script in a container that has it, e.g.
#   docker run --rm -v "$PWD/..:/t" -w /t/fixtures --entrypoint bash jrottenberg/ffmpeg:6-ubuntu make-3gp.sh
set -euo pipefail
cd "$(dirname "$0")/static"
SRC=(-f lavfi -i "testsrc=size=176x144:rate=15:duration=4,setsar=1" -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=4")
ff() { ffmpeg -v error -y "$@"; }
# H.263 picture and AMR-NB sound (8 kHz, mono, 12.2 kbit/s): the classic phone video.
ff "${SRC[@]}" -c:v h263 -c:a libopencore_amrnb -ar 8000 -ac 1 -b:a 12.2k -shortest -f 3gp h263-amrnb.3gp
# MPEG-4 Part 2 picture and AMR-NB sound.
ff "${SRC[@]}" -c:v mpeg4 -c:a libopencore_amrnb -ar 8000 -ac 1 -b:a 12.2k -shortest -f 3gp mpeg4-amrnb.3gp
# H.264 and AAC: copied across.
ff "${SRC[@]}" -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -bf 0 -g 15 -c:a aac -ar 44100 -ac 1 -b:a 48k -shortest -f 3gp h264-aac.3gp
# H.263 picture with AAC sound: picture decoded, sound copied.
ff "${SRC[@]}" -c:v h263 -c:a aac -ar 44100 -ac 1 -b:a 48k -shortest -f 3gp h263-aac.3gp
for f in h263-amrnb mpeg4-amrnb h264-aac h263-aac; do
  printf '%s: ' "$f"; ffprobe -v error -show_entries stream=codec_name -show_entries format=duration -of csv=p=0 "$f.3gp" | tr '\n' ' '; echo
done
