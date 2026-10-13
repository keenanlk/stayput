#!/usr/bin/env bash
# Makes the small WMA files the WMA to MP3 specs use, into static/. Test-fixture tooling only:
# native ffmpeg is never shipped with the site.
set -euo pipefail
cd "$(dirname "$0")/static"
ff() { ffmpeg -v error -y "$@"; }
# A 6 second two-tone sine at 44.1 kHz: stereo, with a title and an artist.
SRC=(-f lavfi -i "sine=frequency=440:sample_rate=44100:duration=6")
ff "${SRC[@]}" -ac 2 -c:a wmav2 -b:a 64k -metadata title="Fixture Tone" -metadata artist="Stayput Tests" -f asf tone-v2.wma
# WMA version 1, mono at 22.05 kHz (what early Windows Media Player wrote).
ff "${SRC[@]}" -ac 1 -ar 22050 -c:a wmav1 -b:a 32k -f asf tone-v1.wma
# A WMA Pro stand-in for the refusal path: no free encoder writes WMA Pro, so the format tag
# in the stream's WAVEFORMATEX (0x0161, WMA 2) is changed to 0x0162 (WMA 10 Professional).
python3 - <<'PY'
d = bytearray(open('tone-v2.wma', 'rb').read())
# The audio stream's WAVEFORMATEX starts with wFormatTag 0x0161, then 2 channels (02 00), 44100 Hz (44 AC 00 00).
needle = bytes([0x61, 0x01, 0x02, 0x00, 0x44, 0xAC, 0x00, 0x00])
at = d.find(needle)
assert at > 0, 'WAVEFORMATEX not found'
d[at:at + 2] = bytes([0x62, 0x01])
open('wmapro-stand-in.wma', 'wb').write(d)
PY
