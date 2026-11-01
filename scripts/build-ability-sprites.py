# Makes the game's ability effect strips from the ability art (art/abilities/animation-concepts-*/:
# 1774 x 887 transparent sheets, 4 frames across and 2 down, kept as the originals). The frames
# don't sit on an even grid, so each is cut out between the fully clear gutters actually found
# around it, trimmed, shrunk, and lined up on a steady anchor (a body's feet, or a ring's middle)
# in one row of equal cells: public/assets/abilities/<name>.png. The cell sizes and anchors go
# to src/data/abilityArt.ts for the game to draw them (src/systems/AbilityArt.ts).
#   python3 scripts/build-ability-sprites.py
import os
import numpy as np
from PIL import Image

SRC = 'art/abilities/animation-concepts-2026-11-01'
# Source px -> stored px: sharp at the biggest size they're drawn (a 2-3x screen, zoomed in).
BASE_SCALE = 0.25
# How each sheet is lined up frame to frame (one mode for all 8 frames, or one per frame):
#   core   - the bottom middle of the solid body (not its glow): the beetle, the anchor disc,
#            a knife stuck in the floor, the beacon once it's landed
#   body   - the middle of the solid body: a knife or beacon in the air (trail and sparks aside)
#   feet   - the bottom middle of everything drawn: the running decoy
#   centre - the middle of everything drawn: the shield ring, the scan pulse
#   lead   - the front (right) edge, half way up: a speed trail, which sits behind its runner
# 'fixed:<mode>@<frame>' measures that frame's anchor and uses the same spot in its cell for
# every frame: for sheets drawn on an exact grid with the object kept in place (only its glow or
# shards change), so the glow doesn't make it jump.
SHEETS = {
    'patch-wingman-scout': 'core',
    'beacon-anchor-return': 'core',
    'fuse-recon-scan': 'centre',
    'rattle-shield-break': 'centre',
    'latch-decoy-echo': 'feet',
    # Release, flight x3, impact, pulse; frames 6-7 have traps painted in, so the game skips them.
    'scout-emp-knife-throw-pulse': ['body', 'body', 'body', 'body', 'core', 'core', 'core', 'core'],
    # Throw, flight, first bounce, flight, second bounce, flight, landed, pulse.
    'fuse-recon-beacon-two-bounce': ['body', 'body', 'body', 'body', 'body', 'body', 'core', 'core'],
    # Round two: exact 4 x 2 grids of 512 px cells.
    'latch-clone-shatter': 'fixed:feet@0',
    'fuse-beacon-scan-loop': 'fixed:core@0',
    'fuse-scan-sweep-ring': 'fixed:centre@0',
    'fuse-diamond-ping': 'fixed:centre@3',
    'scout-knife-spin': 'body',
    'scout-knife-charge': 'fixed:core@0',
    'scout-emp-wave-ring': 'fixed:centre@0',
    'trap-disabled-overlay': 'fixed:centre@0',
    'velvet-sprint-trail': 'fixed:lead@0',
    'velvet-sprint-burst': 'fixed:feet@3',
    # Saboteur abilities (exact grids too).
    'switch-signal-divide': 'fixed:centre@3',
    'scout-tracker-ping': 'fixed:centre@7',
    'fuse-loot-shift': 'fixed:centre@0',
    'beacon-shockwave': 'fixed:centre@4',
    'velvet-burn-zone': 'fixed:centre@4',
}
# Stored bigger than the rest: rings the game grows to many tiles across.
SCALES = {'fuse-scan-sweep-ring': 0.5, 'scout-emp-wave-ring': 0.35, 'switch-signal-divide': 0.4, 'scout-tracker-ping': 0.4, 'beacon-shockwave': 0.35, 'velvet-burn-zone': 0.35}
# Generated with bright pure-red fringe pixels round the edges (left over from background
# removal): toned down to Velvet's rose in the strip (the source sheet is untouched).
DEFRINGE = {'velvet-sprint-burst', 'velvet-sprint-trail', 'velvet-burn-zone'}
GRID = 512

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def runs(mask_1d):
    """Stretches of True, as (start, end) pairs."""
    out, start = [], None
    for i, v in enumerate(mask_1d):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(mask_1d)))
    return out


def gutters(drawn, n):
    """The n-1 clear gaps between n frames along an axis, as cut points (each gap's middle)."""
    clear = drawn == 0
    gaps = [(a, b) for a, b in runs(clear) if a > 0 and b < len(clear)]
    gaps = sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)[: n - 1]
    if len(gaps) < n - 1:
        raise SystemExit(f'expected {n - 1} clear gaps, found {len(gaps)}')
    return [0] + sorted((a + b) // 2 for a, b in gaps) + [len(clear)]


def bbox(mask):
    ys, xs = np.nonzero(mask)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


def anchor_of(cell, mode):
    """A frame's anchor in its cell (x, y), and the box of what's drawn."""
    a = cell[:, :, 3]
    box = bbox(a > 24)
    if mode in ('core', 'body'):
        # Solid, not the cyan glow: opaque pixels that aren't mostly green-blue light.
        rgb = cell[:, :, :3].astype(int)
        glow = (rgb[:, :, 1] > 150) & (rgb[:, :, 2] > 150) & (rgb[:, :, 0] < 170)
        core = bbox((a > 230) & ~glow) or box
        return ((core[0] + core[2]) / 2, core[3] if mode == 'core' else (core[1] + core[3]) / 2), box
    if mode == 'feet':
        return ((box[0] + box[2]) / 2, box[3]), box
    if mode == 'lead':
        return (box[2], (box[1] + box[3]) / 2), box
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), box


def defringe(cell):
    """Pure-red edge pixels -> a soft rose, half as opaque."""
    rgb = cell[:, :, :3].astype(int)
    red = (rgb[:, :, 0] > 170) & (rgb[:, :, 1] < 80) & (rgb[:, :, 2] < 80)
    out = cell.copy()
    out[red, 0], out[red, 1], out[red, 2] = 196, 84, 118
    out[red, 3] = (out[red, 3] * 0.5).astype(np.uint8)
    return out, int(red.sum())


lines = [
    '// Made by scripts/build-ability-sprites.py: do not edit by hand.',
    '// Each strip in public/assets/abilities/ is `frames` cells of w x h px in one row; a frame',
    "// is drawn with its anchor (ax, ay: the body's feet, or the ring's middle) on the spot.",
    '',
    'export const ABILITY_STRIPS = {',
]
os.makedirs(os.path.join(root, 'public', 'assets', 'abilities'), exist_ok=True)
for name, modes in SHEETS.items():
    SCALE = SCALES.get(name, BASE_SCALE)
    im = Image.open(os.path.join(root, SRC, f'{name}-sheet.png')).convert('RGBA')
    px = np.array(im)
    alpha = px[:, :, 3]
    drawn = alpha > 60
    grid = im.size == (GRID * 4, GRID * 2)
    if grid:
        # An exact grid: cut on it (and say if anything touches a cell's edge).
        rows = [0, GRID, GRID * 2]
        edge = sum(int((alpha[:, x] > 24).sum()) for x in (GRID - 1, GRID, GRID * 2 - 1, GRID * 2, GRID * 3 - 1, GRID * 3)) + sum(int((alpha[y, :] > 24).sum()) for y in (GRID - 1, GRID))
        if edge:
            print(f'  {name}: {edge} drawn px touch a cell edge')
    else:
        rows = gutters(drawn.sum(1), 2)
    cells = []
    for r in range(2):
        cols = [0, GRID, GRID * 2, GRID * 3, GRID * 4] if grid else gutters(drawn[rows[r]:rows[r + 1]].sum(0), 4)
        for c in range(4):
            cell = px[rows[r]:rows[r + 1], cols[c]:cols[c + 1]]
            if name in DEFRINGE:
                cell, n = defringe(cell)
            cells.append(cell)
    fixed = None
    if isinstance(modes, str) and modes.startswith('fixed:'):
        mode, at = modes[6:].split('@')
        fixed = anchor_of(cells[int(at)], mode)[0]
    frames = []
    for i, cell in enumerate(cells):
        mode = modes if isinstance(modes, str) else modes[i]
        anchor, box = anchor_of(cell, 'centre' if fixed else mode)
        if fixed:
            anchor = fixed
        crop = Image.fromarray(cell).crop(box)
        frames.append((crop, anchor[0] - box[0], anchor[1] - box[1]))
    # One cell that fits every frame with its anchor on the same spot.
    left = max(ax for _, ax, _ in frames)
    right = max(f.width - ax for f, ax, _ in frames)
    up = max(ay for _, _, ay in frames)
    down = max(f.height - ay for f, _, ay in frames)
    cw, ch = round((left + right) * SCALE) + 2, round((up + down) * SCALE) + 2
    ax, ay = round(left * SCALE) + 1, round(up * SCALE) + 1
    strip = Image.new('RGBa', (cw * len(frames), ch))
    for i, (f, fx, fy) in enumerate(frames):
        size = (max(1, round(f.width * SCALE)), max(1, round(f.height * SCALE)))
        # Resample with premultiplied alpha, so the edges don't pick up the clear background's colour.
        small = f.convert('RGBa').resize(size, Image.LANCZOS)
        strip.paste(small, (i * cw + round(ax - fx * SCALE), round(ay - fy * SCALE)))
    dst = os.path.join(root, 'public', 'assets', 'abilities', f'{name}.png')
    strip.convert('RGBA').save(dst, optimize=True)
    lines.append(f"  '{name}': {{ file: '{name}.png', frames: {len(frames)}, w: {cw}, h: {ch}, ax: {ax}, ay: {ay} }},")
    print(name, 'cells', cw, 'x', ch, 'anchor', ax, ay, os.path.getsize(dst) // 1024, 'KB', 'cuts', rows, cols)
lines.append('} as const;')
lines.append('')
lines.append('export type AbilityStrip = keyof typeof ABILITY_STRIPS;')
with open(os.path.join(root, 'src', 'data', 'abilityArt.ts'), 'w') as fh:
    fh.write('\n'.join(lines) + '\n')
