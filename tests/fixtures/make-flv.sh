#!/usr/bin/env bash
# Makes the small FLV files the FLV to MP4 specs use, into static/. Test-fixture tooling only:
# native ffmpeg is never shipped with the site. 320x240 square pixels, 10 fps, 5 s, with a tone.
set -euo pipefail
cd "$(dirname "$0")/static"
SRC=(-f lavfi -i "testsrc=size=320x240:rate=10:duration=5,setsar=1" -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=5")
ff() { ffmpeg -v error -y "$@"; }
# H.264 (High profile, with B-frames) and AAC sound: the usual FLV.
ff "${SRC[@]}" -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -bf 2 -g 20 -c:a aac -b:a 64k -shortest -f flv h264-aac.flv
# H.264 and MP3 sound (older Flash encoders).
ff "${SRC[@]}" -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -c:a libmp3lame -b:a 64k -shortest -f flv h264-mp3.flv
# H.264 with 22.05 kHz mono MP3 (a low-rate Flash sound; the page brings it up to 48 kHz).
ff "${SRC[@]}" -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -c:a libmp3lame -ar 22050 -ac 1 -b:a 32k -shortest -f flv h264-mp3-22k.flv
# Sorenson Spark (the original Flash codec): refused by name.
ff "${SRC[@]}" -c:v flv -qscale:v 6 -c:a libmp3lame -b:a 64k -shortest -f flv spark-mp3.flv
# VP6: ffmpeg has no VP6 encoder, so the Spark file's video tags are relabelled VP6 (codec id 4). The page only
# has to read the tag header and name the codec, which is all the refusal path does.
python3 - <<'PY'
d = bytearray(open('spark-mp3.flv', 'rb').read())
pos = 9 + 4
while pos + 11 <= len(d):
    kind = d[pos]
    size = int.from_bytes(d[pos + 1:pos + 4], 'big')
    if kind == 9:
        d[pos + 11] = (d[pos + 11] & 0xF0) | 4
    pos += 11 + size + 4
open('vp6-mp3.flv', 'wb').write(d)
PY
for f in h264-aac h264-mp3 h264-mp3-22k spark-mp3 vp6-mp3; do
  printf '%s: ' "$f"; ffprobe -v error -show_entries stream=codec_name -of csv=p=0 "$f.flv" | tr '\n' ' '; echo
done
