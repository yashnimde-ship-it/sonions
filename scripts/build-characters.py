"""Turn the art team's character concept sheets into in-game sprite sheets.

Input:  art/characters/<id>.png  (portrait on top; front, side, back views below)
Output: public/assets/characters/<id>.png    one row of 15 frames, FRAME_W x FRAME_H, transparent
        public/assets/characters/<id>-portrait.png

Frame order matches src/entities/Bandit.ts: stand down, stand up, stand left, then a
4-frame walk (step, pass, step, pass) for down, up and left. The concepts have one pose
per view, so the walks are made from it by walk_cycle.py (legs step, arms swing, body
bobs). Run: python3 scripts/build-characters.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from walk_cycle import narrow_stance, walk_frames

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'characters'
OUT = ROOT / 'public' / 'assets' / 'characters'
IDS = ['maya', 'dev', 'zoya', 'rex', 'iris', 'theo', 'elise', 'felix', 'clara', 'miles']

# Keep in sync with CHAR_FRAME_W / CHAR_FRAME_H in src/config.ts.
FRAME_W, FRAME_H = 48, 72
# Column bounds of the three lower panels (front, side, back) on every sheet.
PANELS_X = [(20, 452), (456, 866), (870, 1291)]
INSET = 10
PORTRAIT = 160
# The near forearm in each character's side frame (frame pixels: x0, y0, x1, y1, end
# exclusive; y0 at the elbow). The arm overlaps the torso in profile, so it's marked by hand
# for the walk cycle's arm swing (see walk_cycle.py). Re-check these if a concept changes.
SIDE_FOREARM = {
    'maya': (27, 37, 31, 49),
    'dev': (30, 31, 35, 41),
    'zoya': (20, 35, 27, 45),
    'rex': (29, 32, 35, 45),
    'iris': (30, 31, 36, 45),
}
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
    # Find the full-width panel rule rather than one pixel in the front-view character: newer
    # concept sheets put a boot or coat at x=200 near the bottom.
    start = max(0, round(im.height * 0.86))
    return max(range(start, im.height), key=lambda y: sum(is_dark(im.getpixel((x, y))) for x in range(12, im.width - 12, 4)))


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


def remove_floating_art(img):
    """Drop tiny disconnected marks and ground shadows left around generated figures."""
    alpha = img.getchannel('A')
    w, h = alpha.size
    px = alpha.load()
    seen = bytearray(w * h)
    components = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not px[x, y] or seen[i]:
                continue
            stack = [i]
            seen[i] = 1
            component = []
            while stack:
                n = stack.pop()
                component.append(n)
                xx, yy = n % w, n // w
                for nx, ny in ((xx - 1, yy), (xx + 1, yy), (xx, yy - 1), (xx, yy + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        ni = ny * w + nx
                        if not seen[ni] and px[nx, ny]:
                            seen[ni] = 1
                            stack.append(ni)
            components.append(component)
    largest = max(map(len, components), default=0)
    keep = bytearray(w * h)
    for component in components:
        if len(component) >= max(24, largest * 0.02):
            for i in component:
                keep[i] = 1
    mask = Image.frombytes('L', (w, h), bytes(255 if value else 0 for value in keep))
    img.putalpha(Image.composite(alpha, Image.new('L', (w, h), 0), mask))
    return img.crop(img.getbbox())


def shrink(img, scale):
    w, h = img.size
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    # Premultiplied resize so no cream fringe bleeds in, then hard alpha for crisp pixel edges.
    small = img.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
    # Generated concept sheets contain soft, anti-aliased edges. After shrinking to a
    # 48px game sprite those edges read as blur, so restore a little local contrast.
    small = small.filter(ImageFilter.UnsharpMask(radius=0.7, percent=150, threshold=2))
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
    sx = sheet.width / 1312
    views = [cut_out(sheet.crop((round(x0 * sx) + INSET, top + INSET, round(x1 * sx) - INSET, bottom_y(sheet) - INSET))) for x0, x1 in PANELS_X]
    if char_id in {'theo', 'elise', 'felix', 'clara', 'miles'}:
        views = [remove_floating_art(view) for view in views]
    front, side, back = views
    side = side.transpose(Image.FLIP_LEFT_RIGHT)  # concepts face right; the sheet's side frames face left

    scale = min((FRAME_H - 3) / max(v.height for v in views), (FRAME_W - 2) / max(v.width for v in views))
    front, side, back = (shrink(v, scale) for v in (front, side, back))

    # Front and back stand with the feet together (the concepts are a wide A-pose).
    stand = [narrow_stance(frame(front)), narrow_stance(frame(back)), frame(side)]
    frames = list(stand)
    for view, kind in zip(stand, ('front', 'back', 'side')):
        frames += walk_frames(view, kind, SIDE_FOREARM.get(char_id) if kind == 'side' else None)
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
