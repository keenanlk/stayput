"""Photo-like sample images for the launch screenshots and GIF (not test fixtures).
Writes launch/assets/samples/: ten HEIC "phone photos" with EXIF and GPS, plus a
JPG, PNG and WebP carrying metadata for the EXIF screenshot. Needs Pillow and pillow-heif."""
import os, random
from fractions import Fraction
from PIL import Image, ImageDraw, ImageFilter
import pillow_heif

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'launch', 'assets', 'samples')
os.makedirs(out, exist_ok=True)
random.seed(7)

def landscape(w, h, seed):
    rnd = random.Random(seed)
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    top = (rnd.randint(40, 90), rnd.randint(90, 140), rnd.randint(170, 220))
    bot = (rnd.randint(220, 250), rnd.randint(170, 210), rnd.randint(120, 170))
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)))
    sx, sy, r = rnd.randint(int(w * .2), int(w * .8)), rnd.randint(int(h * .25), int(h * .5)), int(w * rnd.uniform(.05, .09))
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 240, 200))
    for layer in range(3):
        base = h * (0.55 + layer * 0.12)
        shade = 60 - layer * 15
        col = (shade, shade + 20 + layer * 8, shade + 10)
        pts = [(0, h)]
        x = 0
        while x <= w:
            pts.append((x, base - rnd.randint(0, int(h * 0.12))))
            x += rnd.randint(int(w * .04), int(w * .1))
        pts += [(w, h)]
        d.polygon(pts, fill=col)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    noise = Image.effect_noise((w, h), 18).convert('RGB')
    return Image.blend(img, noise, 0.06)

def exif(seed, orientation=1):
    rnd = random.Random(seed)
    e = Image.Exif()
    e[0x010F] = 'Apple'
    e[0x0110] = 'iPhone'
    e[0x0112] = orientation
    e[0x0132] = f'2026:08:{rnd.randint(10, 28):02d} {rnd.randint(8, 19):02d}:{rnd.randint(0, 59):02d}:00'
    g = e.get_ifd(0x8825)
    g[1], g[3] = 'N', 'W'
    g[2] = (Fraction(45), Fraction(rnd.randint(0, 59)), Fraction(rnd.randint(0, 59)))
    g[4] = (Fraction(122), Fraction(rnd.randint(0, 59)), Fraction(rnd.randint(0, 59)))
    return e.tobytes()

pillow_heif.register_heif_opener()
for i in range(10):
    landscape(1512, 2016, i).save(os.path.join(out, f'IMG_{4021 + i}.HEIC'), quality=70, exif=exif(i))

landscape(2016, 1512, 21).save(os.path.join(out, 'IMG_2841.jpg'), quality=88, exif=exif(21))
landscape(1600, 1000, 22).save(os.path.join(out, 'lakeside.png'), exif=exif(22))
landscape(1600, 1000, 23).save(os.path.join(out, 'coast.webp'), quality=82, exif=exif(23))
print('sample images written to', out)
