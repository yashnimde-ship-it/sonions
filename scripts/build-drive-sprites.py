# Makes the Getaway Drive's sprites from ChatGPT's art (art/drive/: 2048 x 1024 transparent sheets,
# an exact grid of 4 x 2 cells of 512 px, and two 1024 x 2048 road backgrounds, kept as the
# originals). Each sheet becomes one row of equal cells in public/assets/drive/<name>.png: every
# cell is cut to the same box (the union of what's drawn in all 8), so an animation stays put
# frame to frame, and shrunk. Each frame's own tight box goes to src/data/driveArt.ts too: the
# game draws a frame centred on its cell, and uses the tight box for what a van can hit.
#   python3 scripts/build-drive-sprites.py
import os
import numpy as np
from PIL import Image

SRC = 'art/drive'
OUT = 'public/assets/drive'
DATA = 'src/data/driveArt.ts'
GRID = 512
# Source px -> stored px. The drive draws a van about 100 px wide on a 1080p screen; stored at
# half size it's still sharp on a 2x screen.
SCALE = 0.5
# What counts as drawn (soft glows fade out far below this).
SOLID = 24

SHEETS = {
    'vans': 'drive-vans-sheet.png',
    'van-moves': 'drive-van-moves-sheet.png',
    'nitro': 'drive-nitro-flame-sheet.png',
    'crash': 'drive-crash-sheet.png',
    'traffic': 'drive-traffic-sheet.png',
    'hazards': 'drive-hazards-sheet.png',
    'roadside': 'drive-roadside-sheet.png',
    'hud': 'drive-hud-icons-sheet.png',
}
# The art came back with the two leaning frames the wrong way round (2 leans right, 3 left).
ORDER = {'van-moves': [0, 2, 1, 3, 4, 5, 6, 7]}

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cells(name, sheet):
    """The 8 cells, read left to right then top to bottom, as RGBA images."""
    out = [sheet.crop((c * GRID, r * GRID, c * GRID + GRID, r * GRID + GRID)) for r in range(2) for c in range(4)]
    if name == 'roadside':
        # The bus shelter (item 4) was drawn straddling cells 3 and 4: take it whole from the
        # sheet, and clear its left end out of the hydrant's cell.
        shelter = Image.new('RGBA', (GRID, GRID))
        part = sheet.crop((1440, 150, 2048, 470))
        part = part.resize((int(part.width * 0.84), int(part.height * 0.84)), Image.LANCZOS)
        shelter.alpha_composite(part, ((GRID - part.width) // 2, (GRID - part.height) // 2))
        out[3] = shelter
        hydrant = np.array(out[2])
        hydrant[:, 1440 - 2 * GRID:, 3] = 0
        out[2] = Image.fromarray(hydrant)
        # The street lamp's glow (item 1) runs down into the top of the kiosk's cell below it.
        kiosk = np.array(out[4])
        kiosk[:40, :, 3] = 0
        out[4] = Image.fromarray(kiosk)
    return [out[i] for i in ORDER.get(name, range(8))]


def tight(img):
    """The box (x0, y0, x1, y1) round what's solidly drawn in a cell, or None."""
    a = np.array(img)[:, :, 3]
    ys, xs = np.nonzero(a > SOLID)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def everything(img):
    """The box round anything drawn at all (glows included)."""
    a = np.array(img)[:, :, 3]
    ys, xs = np.nonzero(a > 2)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def build(name, file):
    sheet = Image.open(os.path.join(root, SRC, file)).convert('RGBA')
    frames = cells(name, sheet)
    boxes = [everything(f) for f in frames]
    # One box for all 8, centred on the cell's middle so a frame's middle is the cell's middle.
    half_w = max(max(GRID // 2 - b[0], b[2] - GRID // 2) for b in boxes if b)
    half_h = max(max(GRID // 2 - b[1], b[3] - GRID // 2) for b in boxes if b)
    box = (GRID // 2 - half_w, GRID // 2 - half_h, GRID // 2 + half_w, GRID // 2 + half_h)
    w, h = round(2 * half_w * SCALE), round(2 * half_h * SCALE)
    strip = Image.new('RGBA', (w * 8, h))
    hits = []
    for i, f in enumerate(frames):
        cut = f.crop(box).resize((w, h), Image.LANCZOS)
        strip.alpha_composite(cut, (i * w, 0))
        t = tight(f)
        # The tight box, in stored px from the cell's middle.
        hits.append([round((t[0] - GRID // 2) * SCALE), round((t[1] - GRID // 2) * SCALE), round((t[2] - t[0]) * SCALE), round((t[3] - t[1]) * SCALE)] if t else [0, 0, 0, 0])
    strip.save(os.path.join(root, OUT, f'{name}.png'), optimize=True)
    return w, h, hits


def background(name, file):
    img = Image.open(os.path.join(root, SRC, file)).convert('RGB')
    img.save(os.path.join(root, OUT, f'{name}.webp'), quality=88, method=6)
    return img.size


os.makedirs(os.path.join(root, OUT), exist_ok=True)
lines = [
    '// Made by scripts/build-drive-sprites.py: do not edit by hand.',
    '// Each strip in public/assets/drive/ is 8 cells of w x h px in one row; a frame is drawn',
    "// centred on its spot. `hit` is each frame's solid part: [x, y, w, h] from the cell's middle.",
    '',
    'export const DRIVE_STRIPS = {',
]
for name, file in SHEETS.items():
    w, h, hits = build(name, file)
    lines.append(f"  '{name}': {{ file: '{name}.png', w: {w}, h: {h}, hit: {hits} }},")
    print(name, w, h)
lines += ['} as const;', '', 'export type DriveStrip = keyof typeof DRIVE_STRIPS;', '']
road = background('road', 'drive-road-loop.png')
ends = background('start-finish', 'drive-start-finish-sheet.png')
lines += [
    '/** The road that loops (1024 x 2048, opaque) and the start/finish piece (the same size). */',
    f"export const DRIVE_BACKGROUNDS = {{ road: {{ file: 'road.webp', w: {road[0]}, h: {road[1]} }}, ends: {{ file: 'start-finish.webp', w: {ends[0]}, h: {ends[1]} }} }} as const;",
    '',
]
with open(os.path.join(root, DATA), 'w') as fh:
    fh.write('\n'.join(lines))
print('wrote', DATA)
