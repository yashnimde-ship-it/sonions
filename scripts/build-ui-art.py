# Makes the interface art (the "Art Deco heist" look) from ChatGPT's sheets in art/ui/ (kept as
# the originals) into public/assets/ui/kit/, ready for the CSS:
#   - the panel frames (9-slice: 64 px corners) and the small tag frame, as they are
#   - the timer plaque, the divider and the ability socket, trimmed to what's drawn
#   - each button state cut out on its own (found between the clear gaps, not an even grid)
#   - every icon on its own at 128 px (named by what it is: an ability's id, 'heart', ...)
#   - the role and result banners, one file each
#   python3 scripts/build-ui-art.py
import os
import numpy as np
from PIL import Image

SRC = 'art/ui'
OUT = 'public/assets/ui/kit'
ICON = 128

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(root, OUT), exist_ok=True)

ICON_SHEETS = {
    'ui-icons-hud.png': ['heart', 'energy', 'timer', 'ping', 'contract', 'settings', 'help', 'crew'],
    'ui-icons-mission.png': ['terminal', 'keycard', 'vault', 'crown', 'van', 'diamond', 'red-diamond', 'lock'],
    'ui-icons-abilities-1.png': ['quickstep', 'wingman', 'heavyCarry', 'shield', 'clone', 'mend', 'empKnife', 'diamondScan'],
    'ui-icons-abilities-2.png': ['anchor', 'energySprint', 'overclock', 'tripwire', 'deepPockets', 'trapRefresh', 'doorJam', 'signalDivide'],
    'ui-icons-abilities-3.png': ['trackerPing', 'lootShift', 'shockwave', 'burnZone', None, None, None, None],
}


def src(name):
    return Image.open(os.path.join(root, SRC, name)).convert('RGBA')


def save(img, name):
    img.save(os.path.join(root, OUT, name), optimize=True)


def trim(img, pad=2):
    """Cut to what's drawn (a little margin kept)."""
    a = np.array(img)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(img.width, xs.max() + 1 + pad), min(img.height, ys.max() + 1 + pad)))


def bands(img, axis):
    """The drawn stretches along an axis (rows: axis 1), split at fully clear gaps."""
    a = np.array(img)[:, :, 3] > 8
    filled = a.any(axis=axis)
    out, start = [], None
    for i, v in enumerate(filled):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(filled)))
    return out


# Frames: as drawn (the CSS slices them at 64 px; the tag at its 40 px caps).
for name in ['ui-panel-frame.png', 'ui-panel-frame-runner.png', 'ui-panel-frame-saboteur.png']:
    save(src(name), name.replace('ui-panel-', ''))
save(src('ui-tag-frame.png').crop((0, 25 - 2, 256, 71 + 2)), 'tag.png')
save(trim(src('ui-timer-plaque.png')), 'timer-plaque.png')
save(trim(src('ui-divider.png')), 'divider.png')
# The socket keeps its square (the icon sits in its round hole, which is centred in it).
socket = src('ui-ability-socket.png')
save(socket.resize((256, 256), Image.LANCZOS), 'socket.png')

# Buttons: the four states, top to bottom.
for sheet, tone in [('ui-button-gold.png', 'gold'), ('ui-button-dark.png', 'dark')]:
    img = src(sheet)
    rows = [b for b in bands(img, 1) if b[1] - b[0] > 30]
    assert len(rows) == 4, (sheet, rows)
    for (y0, y1), state in zip(rows, ['', '-hover', '-down', '-off']):
        save(trim(img.crop((0, y0, img.width, y1))), f'btn-{tone}{state}.png')

# Icons: each cell trimmed, centred on a square, shrunk.
for sheet, names in ICON_SHEETS.items():
    img = src(sheet)
    for i, name in enumerate(names):
        if not name:
            continue
        cell = trim(img.crop(((i % 4) * 512, (i // 4) * 512, (i % 4) * 512 + 512, (i // 4) * 512 + 512)))
        side = max(cell.size)
        sq = Image.new('RGBA', (side, side))
        sq.alpha_composite(cell, ((side - cell.width) // 2, (side - cell.height) // 2))
        save(sq.resize((ICON, ICON), Image.LANCZOS), f'icon-{name}.png')

# Banners: each one on its own, at a size that's sharp on a big screen.
for sheet, names in [('ui-banner-roles.png', ['banner-runner', 'banner-saboteur']), ('ui-banner-results.png', ['banner-win', 'banner-lose'])]:
    img = src(sheet)
    for i, name in enumerate(names):
        trim(img.crop((0, i * 400, 1600, i * 400 + 400))).save(os.path.join(root, OUT, f'{name}.webp'), quality=90, method=6)

total = sum(os.path.getsize(os.path.join(root, OUT, f)) for f in os.listdir(os.path.join(root, OUT)))
print(f'{len(os.listdir(os.path.join(root, OUT)))} files, {total // 1024} KB in {OUT}')
