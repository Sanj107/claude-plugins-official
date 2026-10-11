#!/usr/bin/env python3
"""Generates the launcher icons (legacy PNG + adaptive foreground) with Pillow.

Design: four territory tiles in the four corner colours with the gold x2 slot
marble in the middle, on the game's night-blue background.
Run from anywhere: python3 tools/make_icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
FONT = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'fonts', 'RussoOne-Regular.ttf')

BG = (11, 14, 26, 255)
TILES = [(229, 57, 53), (47, 95, 224), (46, 158, 79), (253, 216, 53)]
GOLD = (255, 207, 58)
INK = (17, 20, 29)
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SS = 4  # supersampling factor


def compose(size, grid_frac, background):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background == 'square':
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    elif background == 'circle':
        d.ellipse([0, 0, S - 1, S - 1], fill=BG)
    w = S * grid_frac
    gap = w * 0.07
    cell = (w - gap) / 2
    x0 = (S - w) / 2
    y0 = (S - w) / 2
    for k, col in enumerate(TILES):
        cx = x0 + (k % 2) * (cell + gap)
        cy = y0 + (k // 2) * (cell + gap)
        d.rounded_rectangle([cx, cy, cx + cell, cy + cell], radius=int(cell * 0.18), fill=col + (255,))
    r = w * 0.27
    c = S / 2
    d.ellipse([c - r - w * 0.04, c - r - w * 0.04, c + r + w * 0.04, c + r + w * 0.04], fill=INK + (255,))
    d.ellipse([c - r, c - r, c + r, c + r], fill=GOLD + (255,))
    font = ImageFont.truetype(FONT, int(r * 0.95))
    d.text((c, c + r * 0.04), 'x2', font=font, fill=INK + (255,), anchor='mm')
    return img.resize((size, size), Image.LANCZOS)


def main():
    for name, k in DENSITIES.items():
        folder = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(folder, exist_ok=True)
        compose(int(48 * k), 0.66, 'square').save(os.path.join(folder, 'ic_launcher.png'))
        compose(int(48 * k), 0.62, 'circle').save(os.path.join(folder, 'ic_launcher_round.png'))
        # Adaptive foreground: 108dp canvas, artwork kept inside the 66dp safe circle.
        compose(int(108 * k), 0.43, None).save(os.path.join(folder, 'ic_launcher_foreground.png'))
    anydpi = os.path.join(RES, 'mipmap-anydpi-v26')
    os.makedirs(anydpi, exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@color/bg" />\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
           '</adaptive-icon>\n')
    for n in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(os.path.join(anydpi, n), 'w') as f:
            f.write(xml)
    # Large preview used in the README.
    compose(512, 0.66, 'square').save(os.path.join(ROOT, 'docs', 'icon.png'))


if __name__ == '__main__':
    main()
