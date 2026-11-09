import sys, os, numpy as np
DIL=int(os.environ.get('DIL','3'))
from PIL import Image, ImageFilter
def key(src, dst, lo=0.12, hi=0.45, pad=0.03):
    a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    R,G,B = a[...,0],a[...,1],a[...,2]
    m = np.maximum(R,B)
    gr = (G - m)/(G + 1)
    alpha = np.clip((hi - gr)/(hi - lo), 0, 1)
    G2 = np.where(G > m, m, G)                       # despill
    al = Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    al = al.point(lambda v: 0 if v < 24 else v)
    # drop faint smudges that are not next to solid artwork
    W,H = al.size; k = 4
    hard = al.point(lambda v: 255 if v > 235 else 0).resize((W//k,H//k), Image.BILINEAR).point(lambda v: 255 if v > 0 else 0)
    hard = hard.filter(ImageFilter.MaxFilter(DIL)).resize((W,H), Image.NEAREST)
    an = np.asarray(al).astype(np.float32); hn = np.asarray(hard) > 0
    an = np.where(hn, an, 0)
    al = Image.fromarray(an.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    out = Image.fromarray(np.dstack([R,G2,B]).clip(0,255).astype(np.uint8),"RGB").convert("RGBA")
    out.putalpha(al)
    bb = al.point(lambda v: 255 if v > 60 else 0).getbbox()
    w,h = bb[2]-bb[0], bb[3]-bb[1]; p = int(max(w,h)*pad)
    out = out.crop((max(0,bb[0]-p), max(0,bb[1]-p), min(out.width,bb[2]+p), min(out.height,bb[3]+p)))
    out.save(dst); print(dst, out.size)
key(sys.argv[1], sys.argv[2])
