"""Assemble launch/assets/frames/*.png into launch/assets/network-tab.gif (under 8 MB).
Run after scripts/make-launch-assets.mjs. Needs Pillow."""
import glob, os, sys
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
frames_dir = os.path.join(here, '..', 'launch', 'assets', 'frames')
out = os.path.join(here, '..', 'launch', 'assets', 'network-tab.gif')
files = sorted(glob.glob(os.path.join(frames_dir, 'f*.png')))
if not files:
    sys.exit('no frames; run make-launch-assets.mjs first')

# Drop near-identical consecutive frames so the loop is short and the file small.
def load(p):
    return Image.open(p).convert('RGB')

kept, prev = [], None
for p in files:
    im = load(p)
    if prev is not None:
        diff = Image.eval(Image.merge('L', [__import__('PIL.ImageChops', fromlist=['difference']).difference(im, prev).convert('L')]), lambda v: 255 if v > 24 else 0)
        if not diff.getbbox():
            continue
    kept.append(im)
    prev = im

width = int(os.environ.get('GIF_WIDTH', '1270'))
scale = width / kept[0].width
size = (width, round(kept[0].height * scale))
seq = [im.resize(size, Image.LANCZOS) for im in kept]
end = load(os.path.join(frames_dir, 'end.png')).resize(size, Image.LANCZOS)

# Timing: opening frames slow, run frames fast, result and end card held.
durations = []
for i in range(len(seq)):
    durations.append(900 if i < 2 else 700 if i < 6 else 130)
durations[-1] = 1800
seq.append(end)
durations.append(2200)

pal = seq[0].quantize(colors=128, method=Image.MEDIANCUT)
q = [im.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for im in seq]
q[0].save(out, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(f'{out}: {len(q)} frames, {os.path.getsize(out)/1e6:.1f} MB, {sum(durations)/1000:.1f}s')
