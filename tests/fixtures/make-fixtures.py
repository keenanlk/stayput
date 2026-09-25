"""Create image fixtures with metadata for the browser tests."""
import os, struct
from PIL import Image, ImageDraw
import pillow_heif

out = os.path.join(os.path.dirname(__file__), 'generated')
os.makedirs(out, exist_ok=True)

def photo(w, h, color):
    img = Image.new('RGB', (w, h), color)
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.2, h * 0.2, w * 0.8, h * 0.8], fill=(240, 200, 60))
    d.rectangle([0, 0, w * 0.3, h * 0.3], fill=(30, 30, 30))
    return img

def exif_with_gps(orientation=1):
    exif = Image.Exif()
    exif[0x010F] = 'TestCam'
    exif[0x0110] = 'Model X'
    exif[0x0112] = orientation
    exif[0x0132] = '2026:09:25 12:00:00'
    from fractions import Fraction
    gps = exif.get_ifd(0x8825)
    gps[1] = 'N'
    gps[2] = (Fraction(40), Fraction(26), Fraction(46))
    gps[3] = 'W'
    gps[4] = (Fraction(79), Fraction(58), Fraction(56))
    return exif

# JPEG with EXIF + GPS and orientation 6 (rotated 90°), plus a comment
img = photo(1600, 1200, (60, 120, 200))
img.save(os.path.join(out, 'photo.jpg'), quality=90, exif=exif_with_gps(6).tobytes(), comment=b'hello comment')

# Plain JPEG without metadata
photo(800, 600, (200, 80, 80)).save(os.path.join(out, 'plain.jpg'), quality=85)

# PNG with text chunk and eXIf
from PIL.PngImagePlugin import PngInfo
meta = PngInfo()
meta.add_text('Comment', 'secret note')
png = photo(640, 480, (80, 200, 120)).convert('RGBA')
png.save(os.path.join(out, 'graphic.png'), pnginfo=meta, exif=exif_with_gps(1).tobytes())

# WebP with EXIF
photo(640, 480, (120, 80, 200)).save(os.path.join(out, 'picture.webp'), quality=80, exif=exif_with_gps(1).tobytes())

# HEIC with EXIF + GPS
pillow_heif.register_heif_opener()
heic = photo(1200, 900, (20, 140, 160))
heic.save(os.path.join(out, 'iphone.heic'), quality=80, exif=exif_with_gps(1).tobytes())

# Big JPEG for compress tests (12 MP-ish)
photo(4000, 3000, (90, 90, 140)).save(os.path.join(out, 'big.jpg'), quality=95)
print('fixtures written to', out)
