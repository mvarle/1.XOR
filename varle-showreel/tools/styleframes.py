# usage: python3 styleframes.py framesdir outdir   -> styleframes grid + poster
import sys, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
picks = [(1.42, 'blueprint'), (2.95, 'measure'), (4.12, 'tilbud'), (6.1, 'tegl'), (10.6, 'headline'), (14.6, 'endcard')]
w, h, g = 960, 540, 12
grid = Image.new('RGB', (2 * w + g, 3 * h + 2 * g), (6, 18, 35))
for i, (t, name) in enumerate(picks):
    im = Image.open(os.path.join(src, f'f{round(t * 60):04d}.png')).convert('RGB')
    im.save(os.path.join(out, f'styleframe_{i + 1:02d}_{name}.jpg'), quality=94)
    grid.paste(im.resize((w, h), Image.LANCZOS), ((i % 2) * (w + g), (i // 2) * (h + g)))
grid.save(os.path.join(out, 'styleframes.jpg'), quality=92)
print('ok')
