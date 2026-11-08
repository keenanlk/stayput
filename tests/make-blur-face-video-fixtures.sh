#!/usr/bin/env bash
# Edge-case clips for the blur-face-video specs, generated with ffmpeg into the folder given (nothing is committed).
# Usage: tests/make-blur-face-video-fixtures.sh <out-dir>
set -euo pipefail
out="${1:?output folder}"
here="$(cd "$(dirname "$0")" && pwd)"
face="$here/fixtures/static/face.jpg"
mkdir -p "$out"
q=(-hide_banner -loglevel error -y)

# A still face scaled to fit the picture: the face the detector must find at every size.
mk() { # name size fps seconds codec-args...
  local name="$1" size="$2" fps="$3" secs="$4"; shift 4
  local w="${size%x*}" h="${size#*x}"
  ffmpeg "${q[@]}" -loop 1 -framerate "$fps" -t "$secs" -i "$face" \
    -f lavfi -i "sine=frequency=440:duration=$secs" \
    -vf "scale=$w:$h:force_original_aspect_ratio=decrease,pad=$w:$h:(ow-iw)/2:(oh-ih)/2:color=gray,setsar=1,format=yuv420p" -r "$fps" "$@" -shortest "$out/$name"
}
mk uhd60.mp4 3840x2160 60 3 -c:v libx264 -preset ultrafast -crf 28 -c:a aac
# hevc, vp9 and av1 are left out when this ffmpeg has no encoder for them (the spec skips those clips).
# An 11-minute 1080p clip (12 MB) only when asked: LONG=1.
if [ "${LONG:-0}" = 1 ]; then mk long1080.mp4 1920x1080 30 660 -c:v libx264 -preset ultrafast -crf 35 -g 300 -c:a aac -b:a 32k; fi
mk hevc.mp4 1280x720 30 3 -c:v libx265 -preset ultrafast -tag:v hvc1 -x265-params log-level=none -c:a aac || rm -f "$out/hevc.mp4"
mk vp9.webm 1280x720 30 3 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -c:a libopus || rm -f "$out/vp9.webm"
mk av1.mp4 1280x720 30 3 -c:v libsvtav1 -preset 12 -c:a aac || rm -f "$out/av1.mp4"
mk plain.mp4 1280x720 30 3 -c:v libx264 -preset ultrafast -c:a aac

# A truncated file: the first third of a valid MP4.
size=$(wc -c < "$out/plain.mp4")
head -c $((size / 3)) "$out/plain.mp4" > "$out/truncated.mp4"

# Not a video at all, renamed .mp4.
head -c 200000 /dev/urandom > "$out/not-a-video.mp4"

# No faces: a moving test pattern.
ffmpeg "${q[@]}" -f lavfi -i "testsrc2=s=1280x720:r=30:d=3" -f lavfi -i "sine=frequency=440:duration=3" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "$out/no-faces.mp4"

# A portrait phone clip: 1920x1080 stored, a display matrix turns it 90 degrees (shown 1080x1920).
mk landscape.mp4 1920x1080 30 3 -c:v libx264 -preset ultrafast -c:a aac
ffmpeg "${q[@]}" -display_rotation 90 -i "$out/landscape.mp4" -c copy "$out/portrait-rotated.mp4"
rm "$out/landscape.mp4"
ls -la "$out"
