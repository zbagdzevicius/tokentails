"""Turn raw/*.jpg into the shipped WebP set + manifest. Usage: build.py <out_dir (public/assets)>."""
import os, sys, json, math
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = sys.argv[1]
man = []


def save(im, rel, use, q=78, asset=None):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, 'WEBP', quality=q, method=6)
    kb = os.path.getsize(p) / 1024
    # keep each file under ~150 KB: step quality down if needed
    while kb > 150 and q > 50:
        q -= 8
        im.save(p, 'WEBP', quality=q, method=6)
        kb = os.path.getsize(p) / 1024
    man.append({'asset': asset, 'file': rel, 'w': im.width, 'h': im.height, 'kb': round(kb, 1), 'alpha': im.mode == 'RGBA', 'quality': q, 'use': use})


def cover(im, w, h):
    s = max(w / im.width, h / im.height)
    r = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def key(im, lo=40, hi=110):
    """Pure-green chroma key with despill; returns RGBA."""
    im = im.convert('RGB')
    px = list(im.getdata())
    out = []
    for r, g, b in px:
        m = max(r, b)
        k = g - m
        if k <= lo:
            a = 255
        elif k >= hi:
            a = 0
        else:
            a = int(255 * (hi - k) / (hi - lo))
        if g > m:
            g = m + (g - m) // 4 if a == 255 and k < 25 else m  # despill the fringe, keep slight greens
        out.append((r, g, b, a))
    o = Image.new('RGBA', im.size)
    o.putdata(out)
    return o


def trim_square(im, pad=0.04):
    bb = im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    im = im.crop(bb)
    s = int(max(im.size) * (1 + 2 * pad))
    c = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    c.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    return c


def nine(src, w, h, sc, dc):
    """9-slice: source corner sc px -> dest corner dc px; edges and centre stretched."""
    W, H = src.size
    o = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    xs = [(0, sc, 0, dc), (sc, W - sc, dc, w - dc), (W - sc, W, w - dc, w)]
    ys = [(0, sc, 0, dc), (sc, H - sc, dc, h - dc), (H - sc, H, h - dc, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if dx1 > dx0 and dy1 > dy0:
                o.paste(src.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS), (dx0, dy0))
    return o


def raw(n):
    return Image.open(os.path.join(RAW, n + '.jpg'))


# A1-A4: 16:9 backgrounds in 1920 and 1280
BGS = [
    ('A1', 'lobby-castles', 'lobby/castles', 'lobby backdrop on the title screen (src/render/lobby/lobbyBg.ts scene "castles", first visit)'),
    ('A2', 'pick-stage', 'screens/pick-stage', 'lobby backdrop while the hero pick screen is open (scene "stage")'),
    ('A3', 'matchup-split', 'screens/matchup', 'loading / matchup veil .pl-loading (ui.css)'),
    ('A4', 'win-cat', 'screens/win-cat', 'lobby backdrop on the results screen: cat-side victory'),
    ('A4', 'win-dog', 'screens/win-dog', 'lobby backdrop on the results screen: dog-side victory'),
    ('A4', 'lose-cat', 'screens/lose-cat', 'lobby backdrop on the results screen: cat-side defeat'),
    ('A4', 'lose-dog', 'screens/lose-dog', 'lobby backdrop on the results screen: dog-side defeat'),
]
for a, n, rel, use in BGS:
    im = raw(n).convert('RGB')
    for w, h in ((1920, 1080), (1280, 720)):
        save(cover(im, w, h), f'{rel}-{w}.webp', use, asset=a)

# A8 pause backdrop
save(cover(raw('pause-cushions').convert('RGB'), 1280, 720), 'screens/pause-1280.webp', 'pause / menu overlay .pl-menu backdrop (ui.css)', asset='A8')

# A9 seamless ground tile: render S+b px, then crossfade the b-px overhang into the opposite edge (x, then y), so
# the wrap is continuous and only a thin band blends
S, b = 1024, 160
g = raw('ground-tile').convert('RGB').resize((S + b, S + b), Image.LANCZOS)


def wrap_x(im):
    h = im.height
    base = im.crop((0, 0, S, h))
    over = im.crop((S, 0, S + b, h))  # continues past the right edge = what must lead into x=0
    m = Image.new('L', (b, 1)); m.putdata([int(255 * x / b) for x in range(b)]); m = m.resize((b, h))
    base.paste(Image.composite(base.crop((0, 0, b, h)), over, m), (0, 0))
    return base


tile = wrap_x(g).transpose(Image.Transpose.TRANSPOSE)
tile = wrap_x(tile).transpose(Image.Transpose.TRANSPOSE)
save(tile, 'world/offmap-ground-1024.webp', 'outer ground plane beyond the map edge (BUILD B1.9; repeat-wrapped texture)', q=74, asset='A9')

# A5 frames (alpha, @2x)
plate = trim_square(key(raw('frame-plate')), pad=0)
panel = trim_square(key(raw('frame-panel')), pad=0)
rim = trim_square(key(raw('frame-rim')), pad=0)
pc = int(plate.width * 0.2)
nc = int(panel.width * 0.2)
save(nine(plate, 440, 48, pc, 24), 'ui-frames/top-strip-440x48.webp', 'in-match top strip plate, border-image slice 24 fill (220x24 CSS) - for the BUILD agent', asset='A5')
save(nine(panel, 192, 192, nc, 64), 'ui-frames/pause-panel-192.webp', 'pause / menu card .pl-menu > .card border-image slice 64 fill (96 CSS, corners 32)', asset='A5')
save(nine(panel, 720, 128, nc, 52), 'ui-frames/talent-card-720x128.webp', 'talent card frame, border-image slice 52 fill (360x64 CSS) - for the BUILD agent', asset='A5')
save(rim.resize((256, 256), Image.LANCZOS), 'ui-frames/minimap-rim-256.webp', 'minimap rim overlay (128 CSS, transparent centre) - for the BUILD agent', asset='A5')

# A6 stickers 256, A7 pings 128, A10 icons 144 / 88
for a, n, size, rel, use in [
    ('A6', 'st-base-cat', 256, 'stickers/base-cat', 'spawn toast "Your base: bottom left" (cats)'),
    ('A6', 'st-base-dog', 256, 'stickers/base-dog', 'spawn toast "Your base: bottom left" (dogs; arrow art points top-right = enemy base)'),
    ('A6', 'st-help-cat', 256, 'stickers/help-cat', 'help / tips sticker'),
    ('A6', 'st-nap-cat', 256, 'stickers/nap-cat', 'Nap (recall) channel'),
    ('A6', 'st-respawn-dog', 256, 'stickers/respawn-dog', 'respawn "Back in N" counter'),
    ('A6', 'st-cheer-cat', 256, 'stickers/cheer-cat', 'first blood / multi-kill banner (cats)'),
    ('A6', 'st-cheer-dog', 256, 'stickers/cheer-dog', 'first blood / multi-kill banner (dogs)'),
    ('A7', 'ping-onmyway', 128, 'pings/on-my-way', 'ping wheel "On my way"'),
    ('A7', 'ping-danger', 128, 'pings/danger', 'ping wheel "Danger"'),
    ('A7', 'ping-group', 128, 'pings/group-up', 'ping wheel "Group up"'),
    ('A7', 'ping-nice', 128, 'pings/nice', 'ping wheel "Nice!"'),
    ('A7', 'ping-oops', 128, 'pings/oops', 'ping wheel "Oops"'),
    ('A10', 'icon-cancel', 144, 'icons/cancel-bubble', 'hold-to-aim cancel bubble (72 CSS) - for the BUILD agent'),
    ('A10', 'icon-lock', 88, 'icons/lock-r', 'locked R ghost chip (44 CSS) - for the BUILD agent'),
]:
    im = trim_square(key(raw(n)))
    save(im.resize((size, size), Image.LANCZOS), f'{rel}-{size}.webp', use, q=82, asset=a)

json.dump(man, open(os.path.join(OUT, 'feel-art.json'), 'w'), indent=1)
for m in man:
    print(f"{m['asset']:4} {m['file']:42} {m['w']}x{m['h']} {m['kb']} KB q{m['quality']}")
print('total KB', round(sum(m['kb'] for m in man)))
