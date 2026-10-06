"""Make the two photo-style OCR fixtures in static/: a few words on a textured
backdrop, and the same backdrop with no text. Needs pillow, numpy and scipy.
Run once; the output is committed. Arial Bold is read from the system fonts."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import gaussian_filter

out = os.path.join(os.path.dirname(__file__), 'static')
W, H = 2000, 1500
rng = np.random.default_rng(7)

def backdrop():
    """Brick-and-foliage-like clutter: layered noise, stripes, scattered strokes."""
    base = np.zeros((H, W, 3))
    for sigma, amp in [(60, 50), (18, 40), (5, 30), (1.2, 22)]:
        for c in range(3):
            base[..., c] += gaussian_filter(rng.standard_normal((H, W)), sigma) * amp * (1 + 0.3 * c) * (sigma ** 0.5)
    base += np.array([95, 110, 80])
    img = Image.fromarray(np.clip(base, 0, 255).astype('uint8'))
    d = ImageDraw.Draw(img)
    for _ in range(900):  # blades, twigs and mortar lines
        x, y = rng.integers(0, W), rng.integers(0, H)
        a = rng.uniform(0, np.pi)
        l = rng.integers(20, 160)
        shade = int(rng.integers(20, 230))
        d.line([x, y, x + l * np.cos(a), y + l * np.sin(a)], fill=(shade, min(255, shade + 20), shade // 2), width=int(rng.integers(2, 7)))
    return img.filter(ImageFilter.GaussianBlur(1.1))

def save(img, name):
    img.save(os.path.join(out, name), quality=88)

plain = backdrop()
save(plain, 'ocr-texture.jpg')

scene = plain.copy()
d = ImageDraw.Draw(scene)
d.rounded_rectangle([420, 560, 1580, 940], radius=40, fill=(245, 245, 235))
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 130)
d.text((500, 580), 'OPEN DAILY', font=font, fill=(25, 40, 90))
d.text((500, 740), 'COFFEE & TEA', font=font, fill=(25, 40, 90))
save(scene, 'ocr-scene.jpg')
