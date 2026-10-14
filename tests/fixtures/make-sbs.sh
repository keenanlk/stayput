#!/bin/sh
# Fixtures for the Side by side video tests: 1280x720 clips whose brightness rises
# steadily from black to white over 10 s (a counter: the grey level at a moment
# says what time it is), at different frame rates and with different tones.
# Usage: sh make-sbs.sh <output dir>
set -e
out="${1:-.}"
mk() { # name fps seconds tone-hz cb cr
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=black:s=1280x720:r=$2:d=$3,format=yuv420p,geq=lum='255*T/10':cb=${5}:cr=${6}" \
    -f lavfi -i "sine=frequency=$4:sample_rate=48000:duration=$3" \
    -c:v libx264 -preset slow -crf 30 -g 60 -pix_fmt yuv420p -c:a aac -b:a 48k -shortest -movflags +faststart "$out/$1"
}
mk sbs-a-24fps.mp4 24 10 440 128 128
mk sbs-b-30fps.mp4 30 10 880 90 170
mk sbs-b-30fps-6s.mp4 30 6 880 90 170
# A 20 minute clip with no sound at 1 frame a second, 320x180: small on disk but long
# enough that the memory guard refuses it on a phone (its sound would fill the tab).
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "color=c=0x305fa8:s=320x180:r=1:d=1200,format=yuv420p" \
  -c:v libx264 -preset slow -crf 35 -g 300 -pix_fmt yuv420p -an -movflags +faststart "$out/sbs-long-20min.mp4"
