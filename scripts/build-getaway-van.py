# Shrinks the crew's getaway van (art/lobby/getaway-van-source.png: top-down, facing south, its
# rear and side doors open) to the lobby's 16 px a tile, into public/assets/lobby/van.png:
#   python3 scripts/build-getaway-van.py art/lobby/getaway-van-source.png public/assets/lobby/van.png
# The lobby bakes it into the garage (map/lobbyLayout.mjs DECOR); the getaway scene drives it.
import sys
from PIL import Image

HEIGHT = 180  # px: the garage's depth, door to back wall

src = Image.open(sys.argv[1]).convert('RGBA')
src = src.crop(src.getchannel('A').point(lambda a: 255 if a > 128 else 0).getbbox())
w = round(src.width * HEIGHT / src.height)
# Resample with premultiplied alpha, so the edges don't pick up the empty background's colour.
van = src.convert('RGBa').resize((w, HEIGHT), Image.LANCZOS).convert('RGBA')
# Crisp edges, like the rest of the lobby's art: nearly-clear goes clear, nearly-solid goes solid.
r, g, b, a = van.split()
a = a.point(lambda v: 0 if v < 48 else 255 if v > 200 else v)
Image.merge('RGBA', (r, g, b, a)).save(sys.argv[2])
print(sys.argv[2], (w, HEIGHT))
