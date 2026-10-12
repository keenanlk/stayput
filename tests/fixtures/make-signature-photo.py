"""Makes tests/fixtures/static/signature-photo.png and .jpg: a signature-like scribble in dark ink on
off-white paper lit unevenly (a left-to-right fade and a soft shadow), with sensor noise. The PNG is
the clean case; the JPG adds blur and strong JPEG compression. Run with the fixtures venv (numpy, Pillow)."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1000, 400
S = 3  # supersample the strokes so their edges are anti-aliased
rng = np.random.default_rng(7)

ink = Image.new('L', (W * S, H * S), 0)
d = ImageDraw.Draw(ink)


def stroke(points, width):
    r = width * S / 2
    for a, b in zip(points, points[1:]):
        d.line([a, b], fill=255, width=int(width * S))
        d.ellipse([a[0] - r, a[1] - r, a[0] + r, a[1] + r], fill=255)
    d.ellipse([points[-1][0] - r, points[-1][1] - r, points[-1][0] + r, points[-1][1] + r], fill=255)


def wave(x0, x1, y, amp, freq, phase=0.0, n=160):
    return [((x0 + (x1 - x0) * i / n) * S, (y + amp * math.sin(freq * i / n * math.pi * 2 + phase)) * S) for i in range(n + 1)]


stroke(wave(80, 520, 170, 70, 2.5), 6)
stroke(wave(260, 900, 230, 45, 3.0, 1.0), 5)
stroke(wave(120, 700, 300, 18, 5.0, 0.4), 4)
stroke([(x * S, y * S) for x, y in [(520, 90), (610, 190), (700, 120), (800, 250), (880, 150)]], 6)

mask = np.asarray(ink.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
light = 1.0 - 0.45 * (xx / W)                                        # fades towards the right
light *= 1.0 - 0.35 * np.exp(-(((xx - 320) / 160) ** 2 + ((yy - 90) / 60) ** 2))  # a soft shadow
paper = np.array([238, 235, 224], dtype=np.float32)
img = paper[None, None, :] * light[:, :, None]
inkrgb = np.array([20, 28, 70], dtype=np.float32)
img = img * (1 - mask[:, :, None]) + inkrgb[None, None, :] * mask[:, :, None] * light[:, :, None]
img += rng.normal(0, 4, img.shape)
out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((800, 320), Image.LANCZOS)
out.save('tests/fixtures/static/signature-photo.png', optimize=True)
out.filter(ImageFilter.GaussianBlur(0.8)).save('tests/fixtures/static/signature-photo.jpg', quality=55)
