"""Builds public/reference/bank-reference.png (the art map/bankLayout.mjs traces) from the
original picture, public/reference/bank-source.png (877 x 672).

The picture has numbered room badges (01-15) painted on it. Each is removed at the original
size, from just its own pixels (the maroon badge, its white border and number), by the way
that suits what's under it:
  '*'            open floor: copied from the nearby spot whose surroundings match best, so
                 the floor pattern lines up;
  ('shift', dx, dy)  copied from that offset (tiles), chosen by eye (after earlier badges are
                 cleaned, so one office's clean desk can fill another's);
  ('mirror', cx)     a desk: its far end mirrored about x = cx (tiles);
  ('vmirror', cy)    a long table: its far end mirrored about y = cy (tiles);
  'inpaint'      a plain runner or mat: filled smoothly from around it.
Then the picture is scaled up to 96 x 74 tiles at 16 px and lightly sharpened.

Run: python scripts/make-bank-reference.py   (then npm run bank)"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'public' / 'reference' / 'bank-source.png'
OUT = ROOT / 'public' / 'reference' / 'bank-reference.png'
W, H = 96 * 16, 74 * 16
NEAR = 70  # how far '*' looks for a matching patch (source px)
# Each badge (tiles of the finished map: x0, y0, x1, y1) and how it's removed.
BADGES = [
    ((9.9, 11.0, 12.4, 13.3), '*'),  # 15 utility room
    ((21.8, 11.5, 24.4, 13.8), '*'),  # 14 server room
    ((35.0, 11.6, 37.6, 13.9), ('shift', 0, 3)),  # 13 staff lounge, on the rug
    ((54.7, 11.6, 57.2, 13.8), '*'),  # 10 back office
    ((70.8, 11.4, 73.3, 13.6), '*'),  # 11 security room
    ((83.5, 25.1, 86.2, 27.4), '*'),  # 12 vault
    ((48.6, 25.2, 51.4, 27.6), '*'),  # 04 teller counter
    ((16.0, 26.1, 18.8, 28.4), '*'),  # 03 waiting lounge
    ((36.2, 37.1, 39.1, 39.5), '*'),  # 02 lobby
    ((10.4, 39.5, 13.2, 41.9), ('shift', -3, -2.5)),  # 06 manager's office
    ((83.8, 46.8, 86.4, 49.1), '*'),  # 09 restrooms
    ((36.6, 54.1, 39.4, 56.4), ('mirror', 40.0)),  # 07 office desks
    ((49.5, 54.3, 52.7, 56.9), ('mirror', 52.8)),
    ((63.4, 54.1, 66.2, 56.6), ('shift', -25.8, 0)),  # the same desk in office A (already clean)
    ((8.9, 56.9, 12.0, 60.1), ('vmirror', 60.6)),  # 05 conference table: its runner's end, flipped
    ((83.3, 59.4, 86.1, 61.8), '*'),  # 08 ATM lounge
    ((45.3, 66.2, 48.0, 68.5), 'inpaint'),  # 01 entrance mat
]

src = np.asarray(Image.open(SRC).convert('RGB'))
sh, sw = src.shape[:2]
fx, fy = sw / W * 16, sh / H * 16  # source px per tile
img = src.astype(np.float32)


def maroon_of(a):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return ((r >= 80) & (g <= 70) & (b <= 70) & (r - g >= 40)).astype(np.uint8)


def badge_mask(box, maroon):
    """The badge's own pixels: maroon, its number's holes filled, grown over its white border."""
    x0, y0, x1, y1 = box
    X0, Y0 = int((x0 - 0.6) * fx), int((y0 - 0.6) * fy)
    X1, Y1 = int((x1 + 0.6) * fx) + 1, int((y1 + 0.6) * fy) + 1
    m = np.zeros((sh, sw), np.uint8)
    part = cv2.morphologyEx(maroon[Y0:Y1, X0:X1], cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    m[Y0:Y1, X0:X1] = cv2.dilate(part, np.ones((5, 5), np.uint8))
    return m


maroon = maroon_of(src)
masks = [badge_mask(box, maroon) for box, _ in BADGES]
avoid = cv2.dilate(np.maximum.reduce(masks), np.ones((9, 9), np.uint8))
clean = img.copy()
inpaint = np.zeros((sh, sw), np.uint8)
for ((bx0, by0, bx1, by1), way), m in zip(BADGES, masks):
    ys, xs = np.nonzero(m)
    if not len(ys):
        continue
    y0, y1, x0, x1 = max(0, ys.min() - 8), min(sh, ys.max() + 9), max(0, xs.min() - 8), min(sw, xs.max() + 9)
    hole = m[y0:y1, x0:x1]
    th, tw = hole.shape
    if way == 'inpaint':
        inpaint |= m
        continue
    if way == '*':
        ring = (cv2.dilate(hole, np.ones((15, 15), np.uint8)) - hole).astype(np.float32)
        sy0, sx0 = max(0, y0 - NEAR), max(0, x0 - NEAR)
        area = img[sy0: min(sh, y1 + NEAR), sx0: min(sw, x1 + NEAR)]
        res = np.nan_to_num(cv2.matchTemplate(area, img[y0:y1, x0:x1], cv2.TM_SQDIFF, mask=np.dstack([ring] * 3)), nan=np.inf, posinf=np.inf)
        # Never copy from a badge (this one or another).
        res[cv2.dilate(avoid, np.ones((th, tw), np.uint8), anchor=(0, 0))[sy0: sy0 + res.shape[0], sx0: sx0 + res.shape[1]] > 0] = np.inf
        by, bx = np.unravel_index(np.argmin(res), res.shape)
        patch = img[by + sy0: by + sy0 + th, bx + sx0: bx + sx0 + tw]
    elif way[0] == 'shift':
        dx, dy = int(round(way[1] * fx)), int(round(way[2] * fy))
        patch = clean[y0 + dy: y1 + dy, x0 + dx: x1 + dx].copy()  # (badges done earlier are clean)
    elif way[0] == 'mirror':  # about x = cx
        c = way[1] * fx
        cols = np.clip((2 * c - np.arange(x0, x1)).round().astype(int), 0, sw - 1)
        patch = img[y0:y1][:, cols]
    else:  # about y = cy
        c = way[1] * fy
        rows = np.clip((2 * c - np.arange(y0, y1)).round().astype(int), 0, sh - 1)
        patch = img[rows][:, x0:x1]
    alpha = cv2.GaussianBlur(cv2.dilate(hole, np.ones((3, 3), np.uint8)).astype(np.float32), (5, 5), 0)[..., None]
    clean[y0:y1, x0:x1] = clean[y0:y1, x0:x1] * (1 - alpha) + patch * alpha
clean = clean.clip(0, 255).astype(np.uint8)
# The plain ones are inpainted.
clean = cv2.inpaint(np.ascontiguousarray(clean[..., ::-1]), cv2.dilate(inpaint, np.ones((3, 3), np.uint8)) * 255, 4, cv2.INPAINT_TELEA)[..., ::-1]
up = Image.fromarray(clean).resize((W, H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
up.save(OUT)
print(f'{OUT.relative_to(ROOT)}: {W}x{H}; {len(BADGES)} badges removed')
