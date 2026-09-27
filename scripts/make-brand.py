"""Generate the brand SVGs in public/press/ from the mark and an outlined wordmark.

Run: BRAND_FONT=/path/to/Inter-Bold.ttf python3 scripts/make-brand.py  (needs fonttools)
Then: node scripts/make-brand-png.mjs  (PNG copies for forms that refuse SVG)

The mark is the same pin-in-a-rounded-square as src/components/Logo.astro and
public/favicon.svg. The wordmark text is converted to paths so the files look
the same everywhere without the font installed. Inter is under the SIL Open
Font License, which allows embedding outlines in a logo.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'press')
FONT = os.environ.get('BRAND_FONT')
if not FONT:
    raise SystemExit('Set BRAND_FONT to an Inter Bold .ttf')

# Site tokens (src/styles/global.css).
LIGHT = {'square': '#1f6f5f', 'pin': '#ffffff', 'text': '#1b1f23'}
DARK = {'square': '#4fb89f', 'pin': '#0e1a17', 'text': '#eceff1'}

PIN = 'M14 6.5c-3.6 0-6 2.6-6 5.9 0 4.2 6 9.6 6 9.6s6-5.4 6-9.6c0-3.3-2.4-5.9-6-5.9z'


def mark(c, dx=0.0, dy=0.0):
    # The 28x28 mark, drawn at (dx, dy).
    return (
        f'<g transform="translate({dx:g} {dy:g})">'
        f'<rect width="28" height="28" rx="8" fill="{c["square"]}"/>'
        f'<path d="{PIN}" fill="{c["pin"]}"/>'
        f'<circle cx="14" cy="12.3" r="2.3" fill="{c["square"]}"/>'
        '</g>'
    )


def outline(text, size, tracking):
    """Return (svg path d, advance width, cap height) for text at size, y down, baseline at 0."""
    font = TTFont(FONT)
    upm = font['head'].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font['hmtx']
    kern = kerning(font)
    scale = size / upm
    pen = SVGPathPen(glyphs, ntos=lambda v: f'{round(v, 2):g}')
    x = 0.0
    prev = None
    for ch in text:
        name = cmap[ord(ch)]
        if prev is not None:
            x += kern.get((prev, name), 0) * scale
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        x += hmtx[name][0] * scale + tracking * size
        prev = name
    x -= tracking * size
    return pen.getCommands(), x, font['OS/2'].sCapHeight * scale


def kerning(font):
    """Pair kerning from GPOS PairPos format 1 and 2 (enough for one word)."""
    pairs = {}
    if 'GPOS' not in font:
        return pairs
    gpos = font['GPOS'].table
    for lookup in gpos.LookupList.Lookup:
        subs = lookup.SubTable
        if lookup.LookupType == 9:
            subs = [s.ExtSubTable for s in subs]
        for st in subs:
            if getattr(st, 'LookupType', 2) != 2 and lookup.LookupType != 2:
                continue
            if not hasattr(st, 'Format'):
                continue
            first = st.Coverage.glyphs
            if st.Format == 1:
                for g1, ps in zip(first, st.PairSet):
                    for pvr in ps.PairValueRecord:
                        v = getattr(pvr.Value1, 'XAdvance', 0) or 0
                        pairs.setdefault((g1, pvr.SecondGlyph), v)
            elif st.Format == 2:
                c1 = st.ClassDef1.classDefs
                c2 = st.ClassDef2.classDefs
                for g1 in first:
                    rec = st.Class1Record[c1.get(g1, 0)]
                    for g2, k2 in c2.items():
                        v = getattr(rec.Class2Record[k2].Value1, 'XAdvance', 0) or 0
                        if v:
                            pairs.setdefault((g1, g2), v)
    return pairs


def svg(width, height, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {height:g}" '
        f'width="{width * 8:g}" height="{height * 8:g}" role="img" aria-label="{title}">'
        f'<title>{title}</title>{body}</svg>\n'
    )


def write(name, content):
    with open(os.path.join(ROOT, name), 'w') as f:
        f.write(content)
    print('wrote', name)


os.makedirs(ROOT, exist_ok=True)

for variant, c in (('light', LIGHT), ('dark', DARK)):
    write(f'stayput-mark-{variant}.svg', svg(28, 28, mark(c), 'Stayput'))

# Header proportions (28px mark, 19px bold text, 10px gap), set a touch larger
# so the word holds up on its own.
d, advance, cap = outline('Stayput', 21, -0.02)
gap = 10
width = round(28 + gap + advance + 0.5, 2)
baseline = 14 + cap / 2  # centre the capital height on the mark
for variant, c in (('light', LIGHT), ('dark', DARK)):
    body = mark(c) + f'<path transform="translate({28 + gap} {baseline:.2f})" d="{d}" fill="{c["text"]}"/>'
    write(f'stayput-wordmark-{variant}.svg', svg(width, 28, body, 'Stayput'))

# One-colour pin for embossing, stamps and single-ink print.
write('stayput-pin-mono.svg', svg(28, 28,
      '<path fill-rule="evenodd" d="' + PIN + 'M14 10a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 1 0 0-4.6z" fill="#1b1f23"/>',
      'Stayput'))
