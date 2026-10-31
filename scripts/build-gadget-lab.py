# Builds art/lobby/gadget-lab.png (then `npm run lobby`):
#   python3 scripts/build-gadget-lab.py . art/lobby/gadget-lab.png
# The shell is the cruise ship's maintenance workshop (cruise-b1
# preview, 16 px a tile like the lobby): its top wall, tool wall, workbench, shelf and the lockers
# down its left wall. The work floor is painted fresh in that floor's colours on the lobby's tile
# grid (the source floor isn't on a clean grid, so it can't be repeated), with a hazard stripe
# along the bench line. The gadget pads, the sign and the gadgets themselves are drawn live.
import random, sys
from PIL import Image

root = sys.argv[1]
src = Image.open(f'{root}/public/assets/maps/cruise-b1/preview.png').convert('RGBA')
W, H = 282, 256  # lobby x 1.625..19.25, y 8..24 (16 px a tile)
OX = 26          # the decor's left edge in lobby px (1.625 tiles): the floor grid lines up with the lobby's
BENCH = 94       # the bench line: work floor below it

rnd = random.Random(7)
FACE = (112, 80, 63)
GROUT = (70, 52, 46)

def clamp(v):
    return max(0, min(255, int(v)))

lab = Image.new('RGBA', (W, H))
shade = {}
for y in range(H):
    for x in range(W):
        gx, gy = x + OX, y + 128
        tx, ty = gx // 16, gy // 16
        if (tx, ty) not in shade:
            shade[(tx, ty)] = 1 + rnd.uniform(-0.05, 0.05)
        lx, ly = gx % 16, gy % 16
        if lx == 15 or ly == 15:
            c = GROUT
        else:
            k = shade[(tx, ty)] * (1.06 if (lx == 0 or ly == 0) else 1) * (1 + rnd.uniform(-0.025, 0.025))
            # the room is lit from the bench: a touch darker toward the far wall, and in the
            # corners by the lockers and the south wall
            k *= 1.04 - 0.1 * (y / H)
            k *= 1 - 0.12 * max(0, 1 - (x - 40) / 40) - 0.1 * max(0, 1 - (H - y) / 24)
            c = tuple(clamp(v * k) for v in FACE)
        lab.putpixel((x, y), c + (255,))

# The top of the room: wall, tool wall and workbench, the top-left shelf (crop rows 28.1..34).
lab.paste(src.crop((922, 450, 1174, 450 + BENCH)), (0, 0))
# The left wall and its lockers, down to the bottom.
lab.paste(src.crop((922, 450 + BENCH, 962, 450 + H)), (0, BENCH))
# The top wall carried on to the hall's wall; and the room above's red trim off the top edge.
wall = src.crop((1120, 450, 1150, 471))
for x in range(252, W, 30):
    lab.paste(wall.crop((0, 0, min(30, W - x), 21)), (x, 0))
DARK = (10, 11, 19, 255)
for y in range(0, 4):
    for x in range(W):
        lab.putpixel((x, y), DARK)
for y in range(4, 12):
    for x in range(W):
        r, g, b, _ = lab.getpixel((x, y))
        if r > g + 40:
            lab.putpixel((x, y), DARK)
for y in range(H):
    for x in range(0, 3):
        lab.putpixel((x, y), DARK)
# The south wall where the lobby has none (left of the corridor's wall): the lobby's own wall,
# near-black with a blue-grey highlight line.
for y, c in zip(range(H - 5, H), [(10, 8, 18), (36, 44, 65), (17, 18, 33), (10, 8, 18), (10, 8, 18)]):
    for x in range(0, 99):
        lab.putpixel((x, y), c + (255,))

# The hazard stripe along the bench line (yellow and black, 45 degrees), from the lockers across.
for y in range(BENCH, BENCH + 5):
    for x in range(40, W):
        if y in (BENCH, BENCH + 4):
            c = (24, 20, 22)
        else:
            c = (226, 176, 48) if ((x + y) // 4) % 2 == 0 else (30, 26, 28)
        lab.putpixel((x, y), c + (255,))

lab.save(sys.argv[2])
