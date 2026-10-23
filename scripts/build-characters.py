"""Turn the art team's character concept sheets into in-game sprite sheets.

Input:  art/characters/<id>.png  (portrait on top; front, side, back views below)
Output: public/assets/characters/<id>.png    one row of 9 frames, FRAME_W x FRAME_H, transparent
        public/assets/characters/<id>-portrait.png

Frame order matches src/entities/Bandit.ts: stand down, stand up, stand left,
walk down x2, walk up x2, walk left x2. Run: python3 scripts/build-characters.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'characters'
OUT = ROOT / 'public' / 'assets' / 'characters'
IDS = ['maya', 'dev', 'zoya', 'rex', 'iris']

# Keep in sync with CHAR_FRAME_W / CHAR_FRAME_H in src/config.ts.
FRAME_W, FRAME_H = 48, 72
# Column bounds of the three lower panels (front, side, back) on every sheet.
PANELS_X = [(20, 452), (456, 866), (870, 1291)]
INSET = 10
PORTRAIT = 160
# The sheets' cream background; enclosed pockets of it (between legs, under arms) are cleared too.
PAPER = (254, 244, 228)


def is_dark(px):
    return sum(px[:3]) < 200


def divider_y(im):
    """The horizontal line between the portrait and the three views."""
    for y in range(400, 700):
        if is_dark(im.getpixel((200, y))):
            return y
    raise ValueError('no divider found')


def bottom_y(im):
    """The panels' bottom border (it differs slightly between sheets)."""
    for y in range(1100, im.height):
        if is_dark(im.getpixel((200, y))):
            return y
    return im.height


def near_paper(p, tol):
    return abs(p[0] - PAPER[0]) + abs(p[1] - PAPER[1]) + abs(p[2] - PAPER[2]) <= tol


def cut_out(panel):
    """Flood-fill the cream background from the panel's edges and make it transparent."""
    rgba = panel.convert('RGBA')
    w, h = rgba.size
    marker = (255, 0, 255, 0)
    seeds = [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)]
    seeds += [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]
    for seed in seeds:
        if rgba.getpixel(seed) != marker and sum(rgba.getpixel(seed)[:3]) > 600:
            ImageDraw.floodfill(rgba, seed, marker, thresh=40)
    data = [(0, 0, 0, 0) if p == marker or near_paper(p, 12) else p for p in rgba.get_flattened_data()]
    rgba.putdata(data)
    return rgba.crop(rgba.getbbox())


def shrink(img, scale):
    w, h = img.size
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    # Premultiplied resize so no cream fringe bleeds in, then hard alpha for crisp pixel edges.
    small = img.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
    small.putdata([(r, g, b, 255 if a >= 110 else 0) for r, g, b, a in small.get_flattened_data()])
    return small


def frame(view, squash=1.0, lift=0):
    """Place a view in a frame, feet on the bottom row, optionally squashed or lifted."""
    if squash != 1.0:
        w, h = view.size
        view = view.resize((round(w * (2 - squash)), round(h * squash)), Image.NEAREST)
    f = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
    f.alpha_composite(view, ((FRAME_W - view.width) // 2, FRAME_H - view.height - lift))
    return f


def build(char_id):
    sheet = Image.open(SRC / f'{char_id}.png').convert('RGB')
    top = divider_y(sheet)
    views = [cut_out(sheet.crop((x0 + INSET, top + INSET, x1 - INSET, bottom_y(sheet) - INSET))) for x0, x1 in PANELS_X]
    front, side, back = views
    side = side.transpose(Image.FLIP_LEFT_RIGHT)  # concepts face right; the sheet's side frames face left

    scale = min((FRAME_H - 3) / max(v.height for v in views), (FRAME_W - 2) / max(v.width for v in views))
    front, side, back = (shrink(v, scale) for v in (front, side, back))

    frames = [frame(front), frame(back), frame(side)]
    for view in (front, back, side):
        frames += [frame(view, squash=0.95), frame(view, lift=2)]
    out = Image.new('RGBA', (FRAME_W * len(frames), FRAME_H), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.alpha_composite(f, (i * FRAME_W, 0))
    out.save(OUT / f'{char_id}.png')

    # Portrait: a square around the head and shoulders, for lobby cards.
    panel = sheet.crop((20 + INSET, 20 + INSET, 1291 - INSET, top - INSET))
    mask = panel.point(lambda v: 255 if v < 200 else 0).convert('L')
    x0, y0, x1, y1 = mask.getbbox()
    side_len = min(panel.height - y0, x1 - x0)
    cx = (x0 + x1) // 2
    portrait = panel.crop((cx - side_len // 2, y0, cx + side_len // 2, y0 + side_len))
    portrait.resize((PORTRAIT, PORTRAIT), Image.LANCZOS).save(OUT / f'{char_id}-portrait.png')
    print(f'{char_id}: views {[v.size for v in (front, side, back)]}')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for char_id in IDS:
        build(char_id)
