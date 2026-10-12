"""Writes tests/fixtures/static/iphone-portrait-person.mov: face.jpg drifting sideways in front of a high-contrast room,
stored as 1280x720 and turned 90 degrees by the file so it shows upright as 720x1280 (an iPhone held upright).
Needs Pillow and ffmpeg (fixture tooling only; the site never uses ffmpeg)."""
import subprocess, sys, os
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
face = Image.open(os.path.join(here, 'static', 'face.jpg')).convert('RGB')
H = 560
face = face.resize((round(face.width * H / face.height), H))
W, HH, N = 720, 1280, 45
out = os.path.join(here, 'static', 'iphone-portrait-person.mov')
p = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1280x720', '-r', '30', '-i', '-',
                      '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out + '.tmp.mov'], stdin=subprocess.PIPE)
for i in range(N):
    img = Image.new('RGB', (W, HH), (150, 150, 150))
    d = ImageDraw.Draw(img)
    # A door: dark panels with light gaps, above the person.
    for x in range(0, W, 90):
        d.rectangle([x + 10, 0, x + 55, 330], fill=(40, 30, 25))
    # Towels: black and white bars below the person.
    for y in range(950, HH, 40):
        d.rectangle([0, y, W, y + 19], fill=(245, 245, 245))
        d.rectangle([0, y + 20, W, y + 39], fill=(20, 20, 20))
    # A hard vertical edge down the left side, level with the person.
    d.rectangle([0, 330, 30, 950], fill=(10, 10, 10))
    cx = 270 + round(i * 3.0)
    img.paste(face, (cx - face.width // 2, 360))
    # Stored sideways: turning the stored picture 90 degrees (as the file says) gives the upright one.
    p.stdin.write(img.rotate(-90, expand=True).tobytes())
p.stdin.close()
if p.wait():
    sys.exit(1)
# Tag the stored sideways picture as turned 90 degrees (the way an iPhone does), without touching its pixels.
subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-display_rotation', '90', '-i', out + '.tmp.mov', '-c', 'copy', '-movflags', '+faststart', out])
os.remove(out + '.tmp.mov')
