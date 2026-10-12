#!/usr/bin/env python3
"""Generates the launcher icons (legacy PNG + adaptive foreground) with Pillow.

Design: a voxel Jolly Roger - a skull in a red bandana over crossed bones, each
pixel drawn as a bevelled cube - on the game's night-sea background with a gold rim.
Run from anywhere: python3 tools/make_icons.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

BG_TOP = (18, 52, 86)
BG_BOTTOM = (8, 20, 38)
GOLD = (245, 190, 60)
COLORS = {
    'R': (214, 48, 49),    # bandana
    'r': (150, 28, 32),    # bandana knot / shadow
    'o': (250, 236, 210),  # bandana dots
    'W': (242, 234, 214),  # bone
    'w': (196, 186, 160),  # bone shade
    'E': (24, 26, 34),     # sockets
}
# Left half of a 16x16 sprite; every row is mirrored to the right.
HALF = [
    '........',
    '....RRRR',
    '..RRRRoR',
    '.RRoRRRR',
    '.rRRRRRR',
    '.WWWWWWW',
    '.WWWWWWW',
    '.WWEEEWW',
    '.WWEEEWW',
    '.wWWWWWE',
    '..wWWWWW',
    'W..WWWWW',
    '.W.W.W.W',
    '..WWWWWW',
    '.W.wwww.',
    'W.......',
]
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SS = 4  # supersampling factor


def sprite():
    rows = []
    for h in HALF:
        rows.append(h + h[::-1])
    return rows


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def draw_voxels(d, x0, y0, cell):
    rows = sprite()
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == '.':
                continue
            c = COLORS[ch]
            x = x0 + i * cell
            y = y0 + j * cell
            b = max(1, int(cell * 0.18))
            d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=shade(c, 0.72))
            d.rectangle([x, y, x + cell - 1 - b, y + cell - 1 - b], fill=shade(c, 1.12))
            d.rectangle([x + b, y + b, x + cell - 1 - b, y + cell - 1 - b], fill=c)


def compose(size, art_frac, background):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if background:
        grad = Image.new('RGBA', (S, S))
        gd = ImageDraw.Draw(grad)
        for y in range(S):
            t = y / (S - 1)
            col = tuple(int(BG_TOP[k] * (1 - t) + BG_BOTTOM[k] * t) for k in range(3)) + (255,)
            gd.line([(0, y), (S, y)], fill=col)
        mask = Image.new('L', (S, S), 0)
        md = ImageDraw.Draw(mask)
        if background == 'square':
            md.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
        else:
            md.ellipse([0, 0, S - 1, S - 1], fill=255)
        img.paste(grad, (0, 0), mask)
        d = ImageDraw.Draw(img)
        rim = int(S * 0.035)
        if background == 'square':
            d.rounded_rectangle([rim // 2, rim // 2, S - 1 - rim // 2, S - 1 - rim // 2],
                                radius=int(S * 0.2), outline=GOLD + (255,), width=rim)
        else:
            d.ellipse([rim // 2, rim // 2, S - 1 - rim // 2, S - 1 - rim // 2], outline=GOLD + (255,), width=rim)
    d = ImageDraw.Draw(img)
    cell = int(S * art_frac / 16)
    off = (S - cell * 16) // 2
    draw_voxels(d, off, off, cell)
    return img.resize((size, size), Image.LANCZOS)


def main():
    for name, k in DENSITIES.items():
        folder = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(folder, exist_ok=True)
        compose(int(48 * k), 0.70, 'square').save(os.path.join(folder, 'ic_launcher.png'))
        compose(int(48 * k), 0.62, 'circle').save(os.path.join(folder, 'ic_launcher_round.png'))
        # Adaptive foreground: 108dp canvas, artwork kept inside the 66dp safe circle.
        compose(int(108 * k), 0.44, None).save(os.path.join(folder, 'ic_launcher_foreground.png'))
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
    os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
    compose(512, 0.70, 'square').save(os.path.join(ROOT, 'docs', 'icon.png'))


if __name__ == '__main__':
    main()
