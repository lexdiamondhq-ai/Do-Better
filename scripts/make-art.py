"""
Draws every image in assets/ from scratch: the app icon (with its dark and tinted iOS variants and the
Android foreground), the splash mark, the web favicon and the felt texture the tables tile.

The icon is the Deck in one picture: a tomato habit card tilted back, with a cream Ace tucked in front
of it, and the Floor's ink arrow where the Ace's pip would be. Keep the floor, and the day counts.

Needs Pillow and numpy, plus the Fredoka font from node_modules.

    python3 scripts/make-art.py
"""

import math
import os

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets')
FREDOKA = os.path.join(ROOT, 'node_modules', '@expo-google-fonts', 'fredoka', '700Bold', 'Fredoka_700Bold.ttf')

# The palette, matching src/theme/tokens.ts.
TABLE = (0xEC, 0xE8, 0xF4)
NIGHT = (0x12, 0x0F, 0x18)
INK = (0x17, 0x12, 0x1F)
CREAM = (0xFF, 0xFD, 0xF8)
TOMATO = (0xD6, 0x3E, 0x22)
TOMATO_DEEP = (0xB8, 0x30, 0x18)
GOLD = (0xFF, 0xC9, 0x3D)

# Everything is drawn four times larger and scaled down, so every edge is smooth.
SS = 4


def rounded(size, radius, fill):
    """A rounded rectangle on its own transparent layer."""
    w, h = size
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=fill)
    return layer


def soft_polygon(draw, points, fill, round_by):
    """A filled polygon whose corners are rounded by drawing its outline with round joins."""
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=fill, width=int(round_by * 2), joint='curve')
    for x, y in points:
        draw.ellipse((x - round_by, y - round_by, x + round_by, y + round_by), fill=fill)


def arrow_points(cx, cy, height, width, shaft, head):
    """A downward arrow: a shaft and a broad head, centred on (cx, cy)."""
    top = cy - height / 2
    bottom = cy + height / 2
    neck = bottom - head
    return [
        (cx - shaft / 2, top),
        (cx + shaft / 2, top),
        (cx + shaft / 2, neck),
        (cx + width / 2, neck),
        (cx, bottom),
        (cx - width / 2, neck),
        (cx - shaft / 2, neck),
    ]


def shadow_of(layer, blur, opacity, color=(20, 12, 30)):
    """A soft shadow in the shape of a layer's alpha."""
    alpha = layer.getchannel('A').filter(ImageFilter.GaussianBlur(blur))
    alpha = alpha.point(lambda a: int(a * opacity))
    shade = Image.new('RGBA', layer.size, color + (0,))
    shade.putalpha(alpha)
    return shade


def place(canvas, layer, center, angle):
    """Rotates a layer about its centre and pastes it so its centre lands on `center`."""
    turned = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
    x = int(center[0] - turned.width / 2)
    y = int(center[1] - turned.height / 2)
    canvas.alpha_composite(turned, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
    return turned, (x, y)


def padded(layer, pad):
    """The layer on a bigger transparent canvas, so blurs and rotations have room."""
    out = Image.new('RGBA', (layer.width + pad * 2, layer.height + pad * 2), (0, 0, 0, 0))
    out.alpha_composite(layer, (pad, pad))
    return out


def habit_card(w, h, color):
    """The tomato habit card: flat colour, a deeper rim, and a faint highlight along the top."""
    r = int(w * 0.13)
    card = rounded((w, h), r, color + (255,))
    rim = int(w * 0.018)
    inner = rounded((w - rim * 2, h - rim * 2), r - rim, (255, 255, 255, 0))
    # A lighter band at the top edge reads as light catching the card.
    shine = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(shine)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=r, outline=(255, 255, 255, 46), width=rim)
    mask = Image.linear_gradient('L').resize((w, h)).point(lambda v: 255 - v)
    shine.putalpha(ImageChops.multiply(shine.getchannel('A'), mask))
    card.alpha_composite(shine)
    del inner
    # The Ceiling disc in its top corner: an ink circle with the card's colour arrow pointing up.
    d = ImageDraw.Draw(card)
    disc = w * 0.25
    dx, dy = w * 0.09, w * 0.09
    d.ellipse((dx, dy, dx + disc, dy + disc), fill=INK + (255,))
    up = [(x, dy * 2 + disc - y) for x, y in arrow_points(dx + disc / 2, dy + disc / 2, disc * 0.6, disc * 0.62, disc * 0.22, disc * 0.32)]
    soft_polygon(d, up, color + (255,), disc * 0.03)
    return card


def ace_card(w, h, arrow_color, index_color, font_path):
    """The cream Ace: corner indices, and the Floor arrow where its pip would be."""
    r = int(w * 0.11)
    card = rounded((w, h), r, CREAM + (255,))
    d = ImageDraw.Draw(card)
    edge = max(2, int(w * 0.006))
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=r, outline=INK + (40,), width=edge)

    # The big arrow, heavy and soft-cornered like the app's type.
    arrow_h = h * 0.49
    pts = arrow_points(w * 0.52, h * 0.56, arrow_h, w * 0.64, w * 0.2, arrow_h * 0.52)
    soft_polygon(d, pts, arrow_color + (255,), w * 0.035)

    # Corner index: an A over a small arrow, and the same upside down in the opposite corner.
    font = ImageFont.truetype(font_path, int(w * 0.25))
    index = Image.new('RGBA', (int(w * 0.30), int(w * 0.46)), (0, 0, 0, 0))
    di = ImageDraw.Draw(index)
    di.text((index.width / 2, w * 0.15), 'A', font=font, fill=index_color + (255,), anchor='mm')
    small = arrow_points(index.width / 2, w * 0.375, w * 0.13, w * 0.15, w * 0.055, w * 0.065)
    soft_polygon(di, small, index_color + (255,), w * 0.01)
    card.alpha_composite(index, (int(w * 0.035), int(w * 0.03)))
    return card


def deck_mark(size, background, shadow_strength=1.0, mono=False):
    """
    The two cards, drawn on a square `size` wide. `background` is an RGB tuple or None for transparent.
    `mono` draws it in greys for the tinted icon.
    """
    S = size * SS
    canvas = Image.new('RGBA', (S, S), (background + (255,)) if background else (0, 0, 0, 0))

    tomato = (150, 150, 150) if mono else TOMATO
    cream_arrow = (20, 20, 20) if mono else INK

    # The habit card, behind, tilted back to the left.
    cw, ch = int(S * 0.52), int(S * 0.728)
    habit = padded(habit_card(cw, ch, tomato), int(S * 0.06))
    turned = habit.rotate(8, resample=Image.BICUBIC, expand=True)
    hx, hy = S * 0.40, S * 0.462
    if shadow_strength:
        sh = shadow_of(turned, S * 0.02, 0.30 * shadow_strength)
        canvas.alpha_composite(sh, (int(hx - sh.width / 2), int(hy - sh.height / 2 + S * 0.018)))
    canvas.alpha_composite(turned, (int(hx - turned.width / 2), int(hy - turned.height / 2)))

    # The Ace, in front, tucked down and to the right.
    aw, ah = int(S * 0.49), int(S * 0.686)
    ace = ace_card(aw, ah, cream_arrow, cream_arrow if mono else INK, FREDOKA)
    if mono:
        ace = ace.convert('LA').convert('RGBA')
    ace = padded(ace, int(S * 0.06))
    turned = ace.rotate(-9, resample=Image.BICUBIC, expand=True)
    ax, ay = S * 0.59, S * 0.54
    if shadow_strength:
        sh = shadow_of(turned, S * 0.026, 0.38 * shadow_strength)
        canvas.alpha_composite(sh, (int(ax - sh.width / 2 + S * 0.006), int(ay - sh.height / 2 + S * 0.024)))
    canvas.alpha_composite(turned, (int(ax - turned.width / 2), int(ay - turned.height / 2)))

    return canvas.resize((size, size), Image.LANCZOS)


def table_background(size, base, glow):
    """A flat table colour with a soft light in the upper middle, like a lamp over it."""
    S = size
    img = Image.new('RGB', (S, S), base)
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.sqrt(((x - S * 0.5) / S) ** 2 + ((y - S * 0.38) / S) ** 2)
    t = np.clip(1 - d / 0.75, 0, 1) ** 1.6
    arr = np.array(img, dtype=np.float32)
    g = np.array(glow, dtype=np.float32)
    arr = arr * (1 - t[..., None] * 0.6) + g * (t[..., None] * 0.6)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')


def icon():
    size = 1024
    bg = table_background(size, (0xE2, 0xDC, 0xEE), (0xF6, 0xF3, 0xFB)).convert('RGBA')
    bg.alpha_composite(deck_mark(size, None))
    out = bg.convert('RGB')
    out.save(os.path.join(OUT, 'icon.png'), optimize=True)
    return out


def icon_dark():
    """iOS dark icon: the cards on a transparent background, which iOS fills with its dark backdrop."""
    deck_mark(1024, None, shadow_strength=1.4).save(os.path.join(OUT, 'icon-dark.png'), optimize=True)


def icon_tinted():
    """iOS tinted icon: greys on black. iOS keeps only the brightness and tints it."""
    mark = deck_mark(1024, (0, 0, 0), shadow_strength=0, mono=True)
    mark.convert('L').save(os.path.join(OUT, 'icon-tinted.png'), optimize=True)


def adaptive():
    """Android foreground: the cards inside the middle two thirds, which every launcher mask keeps."""
    size = 1024
    inner = deck_mark(int(size * 0.62), None)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(inner, ((size - inner.width) // 2, (size - inner.height) // 2))
    out.save(os.path.join(OUT, 'adaptive-icon.png'), optimize=True)


def splash():
    """The splash mark: the cards alone. The splash screen paints the table colour behind them."""
    deck_mark(1024, None, shadow_strength=0.8).save(os.path.join(OUT, 'splash-icon.png'), optimize=True)
    deck_mark(1024, None, shadow_strength=1.6).save(os.path.join(OUT, 'splash-icon-dark.png'), optimize=True)


def favicon():
    bg = table_background(192, (0xE2, 0xDC, 0xEE), (0xF6, 0xF3, 0xFB)).convert('RGBA')
    bg.alpha_composite(deck_mark(192, None))
    bg.convert('RGB').resize((48, 48), Image.LANCZOS).save(os.path.join(OUT, 'favicon.png'), optimize=True)


def felt():
    """
    A small tile of fine grain for the tables. White and black specks on transparent, so it lifts and
    shades any table colour; the app draws it at about 5% so it reads as felt, not as a pattern.
    """
    size = 128
    rng = np.random.default_rng(11)
    # Smoothed noise, tiled seamlessly by wrapping before the blur.
    n = rng.normal(0, 1, (size, size)).astype(np.float32)
    big = np.tile(n, (3, 3))
    img = Image.fromarray(np.uint8(np.clip((big - big.min()) / (big.max() - big.min()) * 255, 0, 255)), 'L')
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    arr = np.array(img, dtype=np.float32)[size:size * 2, size:size * 2]
    arr = (arr - arr.mean()) / (arr.std() + 1e-6)
    # Light specks where the noise is high, dark where low, clear in between.
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    light = arr > 0
    rgba[..., :3] = np.where(light[..., None], 255, 0)
    rgba[..., 3] = np.uint8(np.clip(np.abs(arr) * 90, 0, 255))
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'felt.png'), optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    icon()
    icon_dark()
    icon_tinted()
    adaptive()
    splash()
    favicon()
    felt()
    print('Wrote', ', '.join(sorted(f for f in os.listdir(OUT) if f.endswith('.png'))))
