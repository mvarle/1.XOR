# usage: python3 sheet.py outdir out.png [cols] [scale]
import sys, glob, os
from PIL import Image, ImageDraw
d, outp = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 2
sc = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
fs = sorted(glob.glob(os.path.join(d, 't*.png')), key=lambda f: float(os.path.basename(f)[1:-4]))
w, h = int(1920*sc), int(1080*sc)
rows = (len(fs)+cols-1)//cols
S = Image.new('RGB', (cols*w + (cols-1)*6, rows*h + (rows-1)*6), (255,255,255))
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    dr = ImageDraw.Draw(im); dr.rectangle([0,0,70,22], fill=(255,0,90)); dr.text((5,5), os.path.basename(f)[1:-4]+'s', fill=(255,255,255))
    S.paste(im, ((i%cols)*(w+6), (i//cols)*(h+6)))
S.save(outp)
