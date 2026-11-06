"""Makes tests/fixtures/bg-edge/: the pictures the remove-background hardening spec (tests/bg-hardening.spec.ts) feeds the tool.
Fixture tooling only: needs Pillow (pip install pillow); none of it ships with the site. Run: python3 tests/fixtures/make-bg-edge-cases.py
Everything is derived from tests/fixtures/static/frenchie.jpg (CC0, see static/CREDITS.md) or drawn here."""
import os, math, random, subprocess
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, 'bg-edge')
os.makedirs(out, exist_ok=True)
src = Image.open(os.path.join(here, 'static', 'frenchie.jpg')).convert('RGB')
f = lambda n: os.path.join(out, n)

def photo(megapixels, name, quality):
    ratio = src.width / src.height
    h = int(math.sqrt(megapixels * 1e6 / ratio)); w = int(h * ratio)
    src.resize((w, h), Image.BICUBIC).save(f(name), quality=quality, optimize=True)

photo(12, 'photo-12mp.jpg', 40)   # 12 MP: a phone's main camera
photo(48, 'photo-48mp.jpg', 30)   # 48 MP: a phone's high-resolution mode

# A real photo cut off a third of the way through its data.
data = open(os.path.join(here, 'static', 'frenchie.jpg'), 'rb').read()
open(f('truncated-photo.jpg'), 'wb').write(data[: len(data) // 3])

# A palette (8-bit indexed) PNG with a subject, and a PNG with 16 bits a channel.
src.convert('P', palette=Image.ADAPTIVE, colors=64).save(f('palette.png'))
# 16 bits a channel (colour): Pillow cannot write it, ffmpeg can.
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(here, 'static', 'frenchie.jpg'), '-pix_fmt', 'rgb48be', f('rgb16.png')], check=True)

# An animated GIF (3 frames of the photo, shifted) and an animated WebP.
frames = [src.transform(src.size, Image.AFFINE, (1, 0, d, 0, 1, 0)) for d in (0, 8, 16)]
frames[0].convert('P', palette=Image.ADAPTIVE).save(f('animated.gif'), save_all=True, append_images=[x.convert('P', palette=Image.ADAPTIVE) for x in frames[1:]], duration=120, loop=0)
frames[0].save(f('animated.webp'), save_all=True, append_images=frames[1:], duration=120, loop=0)

# An SVG with a clear subject.
open(f('subject.svg'), 'w').write('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="428" viewBox="0 0 640 428"><rect width="640" height="428" fill="#c9d6e2"/><ellipse cx="320" cy="230" rx="130" ry="150" fill="#b5651d"/><circle cx="320" cy="120" r="70" fill="#d99a5b"/></svg>')

# A photo with no clear subject: soft noise and a gradient, nothing in front of anything.
random.seed(7)
flat = Image.new('RGB', (640, 428))
px = flat.load()
for y in range(428):
    for x in range(640):
        v = 120 + int(40 * math.sin(x / 90) * math.cos(y / 70)) + random.randint(-6, 6)
        px[x, y] = (v, v + 8, v + 14)
flat.save(f('no-subject.jpg'), quality=85)

# A progressive JPEG of the subject photo, and the same bytes under a .png name.
src.save(f('progressive-photo.jpg'), quality=85, progressive=True)
open(f('jpeg-named.png'), 'wb').write(open(os.path.join(here, 'static', 'frenchie.jpg'), 'rb').read())

# A plain-text file with a .jpg name (a non-image), and bytes that start like a JPEG and go on as noise (a damaged one: edge-cases/garbage.jpg).
open(f('notes.jpg'), 'w').write('Shopping list\n- milk\n- eggs\n' * 20)

# A whole photo with no subject and an MP4-like blob (over 64 KB) after its end marker, as a motion photo has: it must
# still end "No subject was found", never "damaged or cut off".
random.seed(11)
whole = open(f('no-subject.jpg'), 'rb').read()
blob = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom' + bytes(random.randrange(256) for _ in range(100_000)) + b'\xff\xd9\x00\x00'
open(f('motion-photo-no-subject.jpg'), 'wb').write(whole + blob)
