#!/usr/bin/env bash
# Makes the small AVI files the AVI to MP4 specs use, into static/. Test-fixture tooling only:
# native ffmpeg is never shipped with the site. Re-running gives byte-identical-enough files; the
# specs only depend on codec, size and duration, plus avi-reference.json for the colours.
set -euo pipefail
cd "$(dirname "$0")/static"
SRC=(-f lavfi -i "testsrc=size=320x240:rate=10:duration=5" -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=5")
ff() { ffmpeg -v error -y "$@"; }
# Xvid-tagged MPEG-4 Part 2 video with MP3 sound (the usual DivX/Xvid file).
ff "${SRC[@]}" -c:v mpeg4 -vtag XVID -q:v 12 -pix_fmt yuv420p -c:a libmp3lame -b:a 64k -shortest -f avi xvid-mp3.avi
# Motion JPEG video with uncompressed 8-bit PCM sound at 11 kHz (camera and screen-capture AVIs).
ff "${SRC[@]}" -c:v mjpeg -q:v 18 -pix_fmt yuvj420p -c:a pcm_u8 -ar 11025 -shortest -f avi mjpeg-pcm.avi
# Windows Media Video 2 inside AVI: a codec the site does not ship, for the named error.
ff "${SRC[@]}" -c:v wmv2 -b:v 120k -c:a libmp3lame -b:a 64k -shortest -f avi wmv2.avi
# H.264 inside AVI: not decoded by the page's own decoder module either.
ff "${SRC[@]}" -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -c:a libmp3lame -b:a 64k -shortest -f avi h264-mp3.avi
# Reference colours: average RGB of a 4x3 grid of the frame at 1.0 s, decoded by native ffmpeg from the AVI.
python3 - <<'PY'
import json, subprocess
out = {}
for name in ['xvid-mp3.avi', 'mjpeg-pcm.avi']:
    w, h = 320, 240
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', '1.0', '-i', name, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    grid = []
    for gy in range(3):
        for gx in range(4):
            x0, x1, y0, y1 = gx * w // 4 + 8, (gx + 1) * w // 4 - 8, gy * h // 3 + 8, (gy + 1) * h // 3 - 8
            px = [raw[(y * w + x) * 3:(y * w + x) * 3 + 3] for y in range(y0, y1) for x in range(x0, x1)]
            grid.append([round(sum(p[c] for p in px) / len(px)) for c in range(3)])
    probe = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', name]).decode().strip()
    out[name] = {'time': 1.0, 'duration': float(probe), 'width': w, 'height': h, 'grid': grid}
json.dump(out, open('avi-reference.json', 'w'))
PY
