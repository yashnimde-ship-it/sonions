"""Small JPEG copies of the map previews for the Map Info panel (the PNGs are ~4 MB each,
too heavy for phones on mobile data). Run after regenerating a map: python scripts/make-previews.py"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'assets'
WIDTH = 960

for png in [ROOT / 'map' / 'preview.png', *sorted((ROOT / 'maps').glob('*/preview.png'))]:
    img = Image.open(png).convert('RGB')
    if img.width > WIDTH:
        img = img.resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    out = png.with_suffix('.jpg')
    img.save(out, 'JPEG', quality=82, optimize=True, progressive=True)
    print(f'{out.relative_to(ROOT.parent.parent)}: {png.stat().st_size // 1024} KB -> {out.stat().st_size // 1024} KB')
