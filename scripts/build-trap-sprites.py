# Makes the game's trap sprites from the trap art pack (art/traps/*.png: big transparent PNGs,
# kept as the originals): each is trimmed to what's drawn and shrunk so its longer side is
# MAX px, into public/assets/traps/<same name>.png. The game draws them fitted ("contain") into a
# box per trap (src/systems/TrapArt.ts, TRAP_ART), smoothly, since they're painted art.
#   python3 scripts/build-trap-sprites.py
import glob, os
from PIL import Image

MAX = 192  # px: crisp at the biggest size they're drawn (the trap bar on a 2x screen, the map up close)

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for src in sorted(glob.glob(os.path.join(root, 'art', 'traps', '*.png'))):
    im = Image.open(src).convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())
    k = MAX / max(im.size)
    size = (max(1, round(im.width * k)), max(1, round(im.height * k)))
    # Resample with premultiplied alpha, so the edges don't pick up the clear background's colour.
    out = im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
    dst = os.path.join(root, 'public', 'assets', 'traps', os.path.basename(src))
    out.save(dst, optimize=True)
    print(os.path.basename(src), size, os.path.getsize(dst) // 1024, 'KB')
