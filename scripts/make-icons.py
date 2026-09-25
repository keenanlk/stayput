"""Generate PNG icons and the social preview image from the brand mark.
Run: python3 scripts/make-icons.py  (needs Pillow)."""
from PIL import Image, ImageDraw, ImageFont
import math, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
GREEN = (31, 111, 95)
CREAM = (247, 245, 239)
INK = (27, 31, 35)

def pin(draw, cx, cy, s, color):
    # Teardrop pin: circle top + triangle tip, then inner dot.
    r = s * 0.19
    top = cy - s * 0.10
    draw.ellipse([cx - r, top - r, cx + r, top + r], fill=color)
    tip = (cx, cy + s * 0.30)
    ang = math.asin(r / math.hypot(tip[0] - cx, tip[1] - top)) if False else 0
    # tangent points approx
    left = (cx - r * 0.95, top + r * 0.35)
    right = (cx + r * 0.95, top + r * 0.35)
    draw.polygon([left, right, tip], fill=color)

def icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 0 if maskable else int(size * 0.06)
    radius = int(size * 0.25) if not maskable else 0
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=GREEN)
    pin(d, size / 2, size / 2, size * (0.85 if not maskable else 0.7), (255, 255, 255))
    dot_r = size * 0.072 * (1 if not maskable else 0.82)
    cy = size / 2 - size * (0.10 if not maskable else 0.082)
    d.ellipse([size / 2 - dot_r, cy - dot_r, size / 2 + dot_r, cy + dot_r], fill=GREEN)
    return img

for s in (192, 512):
    icon(s).save(os.path.join(ROOT, 'icons', f'icon-{s}.png'))
icon(512, maskable=True).save(os.path.join(ROOT, 'icons', 'icon-512-maskable.png'))

# Social preview 1200x630
og = Image.new('RGB', (1200, 630), CREAM)
d = ImageDraw.Draw(og)
d.rounded_rectangle([80, 80, 200, 200], radius=30, fill=GREEN)
pin(d, 140, 140, 100, (255, 255, 255))
d.ellipse([140 - 9, 130 - 9, 140 + 9, 130 + 9], fill=GREEN)
def font(size):
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()
d.text((80, 250), 'Your files stay put.', fill=INK, font=font(78))
d.text((80, 360), 'Convert HEIC, merge and compress PDFs, shrink images,', fill=(74, 80, 87), font=font(34))
d.text((80, 410), 'strip EXIF. All in your browser. Nothing is uploaded.', fill=(74, 80, 87), font=font(34))
d.rounded_rectangle([80, 500, 420, 560], radius=30, fill=GREEN)
d.text((110, 512), 'stayput.dev', fill=(255, 255, 255), font=font(32))
og.save(os.path.join(ROOT, 'og.png'), optimize=True)
print('icons written')
