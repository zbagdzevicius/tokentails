import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
S, D = sys.argv[1], sys.argv[2]
def save(im, name, **kw): im.save(f"{D}/{name}", optimize=True, **kw); print(name, im.size, im.mode)
def onbg(im, c):
    bg = Image.new("RGBA", im.size, c); bg.alpha_composite(im); return bg.convert("RGB")
def fit(im, w): return im.resize((w, round(im.height*w/im.width)), Image.LANCZOS)

# ---- logo
logo = Image.open(f"{S}/out/logo.png")
save(logo, "logo.png")
save(fit(logo, 1200), "logo-1200.png")
save(fit(onbg(logo, "#14101c"), 1600), "logo-dark-bg.png")
save(fit(onbg(logo, "#ffffff"), 1600), "logo-light-bg.png")
cmp_ = Image.open(f"{S}/out/logo-compact.png")
save(cmp_, "logo-compact.png")
save(fit(cmp_, 600), "logo-compact-600.png")
save(fit(onbg(cmp_, "#14101c"), 1600), "logo-compact-dark-bg.png")
save(fit(onbg(cmp_, "#ffffff"), 1600), "logo-compact-light-bg.png")
em = Image.open(f"{S}/out/emblem.png")
save(em, "emblem.png")
side = max(em.size); sq = Image.new("RGBA", (side, side)); sq.alpha_composite(em, ((side-em.width)//2, (side-em.height)//2))
save(sq.resize((1024, 1024), Image.LANCZOS), "emblem-square-1024.png")
save(fit(onbg(em, "#14101c"), 800), "emblem-dark-bg.png")
save(fit(onbg(em, "#ffffff"), 800), "emblem-light-bg.png")

# ---- iOS icon (full bleed, no alpha)
ic = Image.open(f"{S}/raw/iconC3.jpg").convert("RGB")
save(ic, "app-icon-master-2048.png")
i1024 = ic.resize((1024, 1024), Image.LANCZOS)
save(i1024, "app-icon-ios-1024.png")
save(ic.resize((180, 180), Image.LANCZOS), "apple-touch-icon-180.png")

# ---- macOS icon: Apple template, 824 px rounded rect on a 1024 canvas, corner 185.4, soft drop shadow
def mac(size=1024):
    k = 4; C = 1024*k; inset = 100*k; r = int(185.4*k)
    mask = Image.new("L", (C, C)); ImageDraw.Draw(mask).rounded_rectangle((inset, inset, C-inset, C-inset), r, fill=255)
    tile = Image.new("RGBA", (C, C)); art = ic.resize((C-2*inset, C-2*inset), Image.LANCZOS)
    tile.paste(art, (inset, inset)); tile.putalpha(mask)
    sh = Image.new("RGBA", (C, C), (0, 0, 0, 0)); sm = mask.point(lambda v: v*0.5)
    sh.putalpha(sm); sh = sh.transform((C, C), Image.AFFINE, (1, 0, 0, 0, 1, -10*k)).filter(ImageFilter.GaussianBlur(10*k))
    out = Image.alpha_composite(sh, tile).resize((1024, 1024), Image.LANCZOS)
    return out
m = mac()
save(m, "app-icon-macos-1024.png")
for s in (512, 256, 128, 64, 32, 16): save(m.resize((s, s), Image.LANCZOS), f"app-icon-macos-{s}.png")

# ---- favicon: tighter head crop for tiny sizes
W = ic.width
head = ic.crop((int(W*.15), int(W*.13), int(W*.85), int(W*.83)))
for s in (16, 32, 48): save(head.resize((s, s), Image.LANCZOS), f"favicon-{s}.png")
head.resize((256, 256), Image.LANCZOS).save(f"{D}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]); print("favicon.ico")

# ---- PWA
for s in (192, 512): save(ic.resize((s, s), Image.LANCZOS), f"pwa-icon-{s}.png")
# maskable: art scaled to 84% so crown and ears sit inside the 80% safe circle; margin filled by mirroring the sunburst
a = np.asarray(ic.resize((860, 860), Image.LANCZOS))
p = (1024-860)//2
mk = Image.fromarray(np.pad(a, ((p, 1024-860-p), (p, 1024-860-p), (0, 0)), mode="reflect"))
for s in (192, 512): save(mk.resize((s, s), Image.LANCZOS), f"pwa-maskable-{s}.png")

# ---- og / social 1200x630
og = Image.new("RGB", (1200, 630), "#1a1024")
g = Image.new("L", (1200, 630)); gd = ImageDraw.Draw(g)
for i in range(60): gd.ellipse((760-i*9, 315-i*9, 760+i*9, 315+i*9), fill=int(4*(60-i)*0.55))
og.paste(Image.new("RGB", (1200, 630), "#ff6a3d"), (0, 0), g.filter(ImageFilter.GaussianBlur(40)).point(lambda v: v*0.6))
tile = Image.new("L", (470, 470)); ImageDraw.Draw(tile).rounded_rectangle((0, 0, 469, 469), 96, fill=255)
og.paste(ic.resize((470, 470), Image.LANCZOS), (60, 80), tile)
lg = fit(logo, 620); og.paste(lg, (545, (630-lg.height)//2), lg)
save(og, "og-1200x630.png"); og.save(f"{D}/og-1200x630.jpg", quality=90); print("og-1200x630.jpg")
