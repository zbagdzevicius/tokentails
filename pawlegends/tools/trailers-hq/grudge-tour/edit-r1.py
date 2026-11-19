"""Grudge Tour edit: composes one cut in one aspect from the HQ takes, the Gemini frames and programmatic motion
graphics, frame by frame, and pipes RGB frames straight to the encoders (one generation from the takes).
usage: uv run --with numpy --with pillow python -I edit.py <plan.json> <cut 30|60> <aspect h|v|s> <outdir> [--preview N]
plan.json is plan.mjs dumped by dump-plan.mjs."""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, '..')
TAKES = os.path.join(G, 'takes', 'hq')
GEM = os.path.join(G, 'gem')
REFS = os.path.join(G, 'refs')
FPS = 60
FF = '/opt/homebrew/bin/ffmpeg' if os.path.exists('/opt/homebrew/bin/ffmpeg') else 'ffmpeg'

MAG = (255, 61, 127)
BLUE = (57, 166, 255)
BOLT = (255, 225, 74)
NIGHT = (18, 9, 31)
PLUM = (71, 31, 93)
CREAM = (255, 243, 227)

plan_file, cut_name, asp, outdir = sys.argv[1:5]
preview = int(sys.argv[sys.argv.index('--preview') + 1]) if '--preview' in sys.argv else 0
plan = json.load(open(plan_file))[cut_name]
W, H = {'h': (1920, 1080), 'v': (1080, 1920), 's': (1080, 1080)}[asp]
S = min(W, H) / 1080  # type scale
N = plan['frames']


def font(size, w=900, f='Rubik-Italic-Display'):
    ft = ImageFont.truetype(os.path.join(REFS, f + '.ttf'), int(size))
    try:
        ft.set_variation_by_axes([w] if f.startswith('Rubik') else [w, 100])
    except Exception:
        pass
    return ft


# ------------------------------------------------------------------ assets
def cover(img, w, h, scale=1.0, cx=0.5, cy=0.5):
    """Crop-and-scale `img` to w x h (cover), zoomed by `scale` about (cx, cy) of the source."""
    iw, ih = img.size
    k = max(w / iw, h / ih) * scale
    sw, sh = w / k, h / k
    x0 = min(max(cx * iw - sw / 2, 0), iw - sw)
    y0 = min(max(cy * ih - sh / 2, 0), ih - sh)
    return img.resize((w, h), Image.LANCZOS, box=(x0, y0, x0 + sw, y0 + sh))


_still = {}


def still(name):
    """The Gemini frame for this aspect: 9:16 for vertical, 16:9 otherwise (square crops it)."""
    key = (name, asp)
    if key not in _still:
        a = '9x16' if asp == 'v' or (asp == 's' and name == 'atlas') else '16x9'
        _still[key] = Image.open(os.path.join(GEM, f'{name}-{a}.jpg')).convert('RGB')
    return _still[key]


ATLAS = {  # island centres (fraction of the image) per atlas orientation
    '16x9': {'hearthwood': (0.283, 0.27), 'quarry': (0.638, 0.27), 'thicket': (0.858, 0.36), 'pitch': (0.18, 0.69), 'crossing': (0.47, 0.71), 'ridge': (0.733, 0.69)},
    '9x16': {'pitch': (0.305, 0.115), 'ridge': (0.735, 0.25), 'thicket': (0.287, 0.385), 'quarry': (0.735, 0.515), 'crossing': (0.287, 0.63), 'hearthwood': (0.645, 0.80)},
}


def yarn(d):
    """A bolt-yellow yarn ball sprite, d px, drawn at 4x and downscaled."""
    k = 4
    D = int(d * k)
    im = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.ellipse((k, k, D - k, D - k), fill=BOLT + (255,), outline=(120, 70, 0, 255), width=max(2, D // 22))
    for i in range(6):
        a = i * math.pi / 6
        off = (i - 2.5) * D * 0.11
        pts = []
        for t in np.linspace(-1, 1, 24):
            x = D / 2 + math.cos(a) * t * D * 0.42 - math.sin(a) * off
            y = D / 2 + math.sin(a) * t * D * 0.42 + math.cos(a) * off
            if (x - D / 2) ** 2 + (y - D / 2) ** 2 < (D * 0.44) ** 2:
                pts.append((x, y))
        if len(pts) > 1:
            dr.line(pts, fill=(214, 150, 20, 255), width=max(2, D // 30))
    dr.ellipse((D * 0.22, D * 0.18, D * 0.42, D * 0.34), fill=(255, 250, 210, 200))
    return im.resize((int(d), int(d)), Image.LANCZOS)


BALL = {}


def ball(d):
    d = int(max(8, d))
    if d not in BALL:
        BALL[d] = yarn(d)
    return BALL[d]


LOGO = Image.open(os.path.join(REFS, 'logo.png')).convert('RGBA')
LOGO_C = Image.open(os.path.join(REFS, 'logo-compact.png')).convert('RGBA')


def text_img(word, size, fill, stroke=PLUM, sw=None):
    ft = font(size)
    sw = sw if sw is not None else max(4, int(size * 0.07))
    box = ft.getbbox(word, stroke_width=sw)
    w, h = box[2] - box[0] + 40, box[3] - box[1] + 40
    im = Image.new('RGBA', (w, h + int(size * 0.08)), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    # hard drop shadow in night, then the word
    dr.text((20 - box[0] + int(size * 0.05), 20 - box[1] + int(size * 0.07)), word, font=ft, fill=NIGHT + (230,), stroke_width=sw, stroke_fill=NIGHT + (230,))
    dr.text((20 - box[0], 20 - box[1]), word, font=ft, fill=fill + (255,), stroke_width=sw, stroke_fill=stroke + (255,))
    return im


_text = {}


def paste_center(canvas, im, cx, cy, scale=1.0, alpha=1.0):
    if scale != 1.0:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    if alpha < 1.0:
        a = im.getchannel('A').point(lambda v: int(v * alpha))
        im = im.copy()
        im.putalpha(a)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


# ------------------------------------------------------------------ take frames
class TakeReader:
    def __init__(self, take, src, n):
        path = os.path.join(TAKES, f'{take}-{asp}.mp4')
        if not os.path.exists(path):
            raise SystemExit(f'missing take {path}')
        self.p = subprocess.Popen([FF, '-loglevel', 'error', '-threads', '4', '-ss', f'{src:.4f}', '-i', path, '-frames:v', str(n), '-vf',
                                   'scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24',
                                   '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
        self.last = None

    def next(self):
        buf = self.p.stdout.read(W * H * 3)
        if len(buf) == W * H * 3:
            self.last = Image.frombuffer('RGB', (W, H), buf, 'raw', 'RGB', 0, 1).copy()
        return self.last

    def close(self):
        self.p.stdout.close()
        self.p.wait()


# ------------------------------------------------------------------ motion graphics
def ease_out(u):
    u = min(1, max(0, u))
    return 1 - (1 - u) ** 3


def ease_io(u):
    u = min(1, max(0, u))
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2


def flash(img, k):
    """White flash, k = 0..1."""
    return Image.blend(img, Image.new('RGB', img.size, (255, 255, 255)), k)


def bolt_poly(x, w, h, jag=0.18):
    """A jagged lightning bolt band at x (top centre), for wipes."""
    pts = [(x, -10), (x + w * 0.55, h * 0.42), (x + w * 0.2, h * 0.42), (x + w * 0.9, h + 10), (x + w * 0.25, h * 0.56), (x + w * 0.6, h * 0.56), (x - w * 0.1, -10)]
    return pts


def draw_route(canvas, p0, p1, u, dots=34, color=MAG, tangle=False):
    """Dotted arc from p0 to p1, drawn up to u (0..1); returns the ball position at u."""
    dr = ImageDraw.Draw(canvas)
    mx, my = (p0[0] + p1[0]) / 2, min(p0[1], p1[1]) - 0.22 * math.hypot(p1[0] - p0[0], p1[1] - p0[1]) - 40 * S

    def at(t):
        return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * mx + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * my + t * t * p1[1])

    pts = []
    if tangle:
        # the line tangles into a question mark (drawn with the same dots, no type): an arc, a hook, a stem, a dot
        c = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 60 * S)
        R = 130 * S
        path = [at(t * 0.35) for t in np.linspace(0, 1, 10)]
        for t in np.linspace(math.pi * 1.05, math.pi * 2.35, 22):
            path.append((c[0] + R * math.cos(t), c[1] + R * math.sin(t)))
        end = path[-1]
        for t in np.linspace(0, 1, 6):
            path.append((end[0] - t * 10 * S, end[1] + t * 80 * S))
        stem = path[-1]
        path.append((stem[0], stem[1] + 55 * S))
        n = len(path)
        shown = int(n * u)
        for i, q in enumerate(path[:shown]):
            r = (15 if i == n - 1 else 8) * S
            dr.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=color + (255,), outline=NIGHT + (255,), width=max(2, int(3 * S)))
        return path[max(0, min(n - 2, shown - 1))]
    for i in range(dots):
        t = i / (dots - 1)
        if t > u:
            break
        q = at(t)
        r = 7 * S
        dr.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=color + (255,), outline=NIGHT + (255,), width=max(2, int(3 * S)))
    return at(u)


def stamp(canvas, p, k=1.0):
    """A paw-stamp glyph (a pad and four toes) in a bolt ring."""
    r = 34 * S * k
    dr = ImageDraw.Draw(canvas)
    dr.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=NIGHT + (210,), outline=BOLT + (255,), width=max(3, int(5 * S)))
    pr = r * 0.36
    dr.ellipse((p[0] - pr, p[1] - pr * 0.4, p[0] + pr, p[1] + pr * 1.3), fill=MAG + (255,))
    for dx, dy in [(-0.5, -0.45), (-0.17, -0.72), (0.17, -0.72), (0.5, -0.45)]:
        tr = r * 0.14
        cx, cy = p[0] + dx * r * 0.95, p[1] + dy * r * 0.8
        dr.ellipse((cx - tr, cy - tr, cx + tr, cy + tr), fill=MAG + (255,))


def trail(canvas, pts, d):
    """A bolt-yellow speed trail behind a ball along pts (oldest first)."""
    dr = ImageDraw.Draw(canvas)
    n = len(pts)
    for i in range(1, n):
        w = max(1, int(d * 0.55 * i / n))
        a = int(220 * i / n)
        dr.line([pts[i - 1], pts[i]], fill=BOLT + (a,), width=w)


def pips(canvas, cat, dog, total):
    """Scorebug: magenta paw pips (cats) over blue (dogs), no digits."""
    x0 = 28 * S if asp == 'h' else 26 * S
    y0 = 118 * S if asp == 'h' else (190 * S if asp == 'v' else 120 * S)
    r = 11 * S
    gap = 28 * S
    dr = ImageDraw.Draw(canvas)
    pad = 12 * S
    dr.rounded_rectangle((x0 - pad, y0 - pad - r, x0 + gap * (total - 1) + r + pad, y0 + gap + r + pad), radius=14 * S, fill=NIGHT + (200,), outline=BOLT + (255,), width=max(2, int(3 * S)))
    for row, (n, col) in enumerate([(cat, MAG), (dog, BLUE)]):
        for i in range(total):
            cx, cy = x0 + i * gap, y0 + row * gap
            on = i < n
            dr.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(col + (255,)) if on else (60, 40, 80, 255), outline=CREAM + (255,) if on else None, width=max(1, int(2 * S)))


# ------------------------------------------------------------------ shot renderers
HERO = (W * 0.5, H * (0.47 if asp == 'h' else 0.5))  # where the game camera holds slot 0


def render_still(shot, f, img_cache={}):
    name = shot['still']
    u = (f - shot['a']) / max(1, shot['b'] - shot['a'])
    img = still(name)
    if name == 'atlas':
        a = '9x16' if asp in ('v', 's') else '16x9'
        A = ATLAS[a]
        r0, r1 = shot['route']
        if asp == 's':
            # pan the tall atlas so the route's midpoint is centred
            cy = (A[r0][1] + A[r1][1]) / 2
            k = 1.0 + 0.04 * u
            bg = cover(img, W, H, k, 0.5, cy)
            iw, ih = img.size
            kk = max(W / iw, H / ih) * k
            sw, sh = W / kk, H / kk
            x0 = min(max(0.5 * iw - sw / 2, 0), iw - sw)
            y0 = min(max(cy * ih - sh / 2, 0), ih - sh)
            P = lambda n: ((A[n][0] * iw - x0) * kk, (A[n][1] * ih - y0) * kk)
        else:
            k = 1.02 + 0.05 * u
            drift = 0.5 + 0.02 * (u - 0.5)
            bg = cover(img, W, H, k, drift, 0.5)
            iw, ih = img.size
            kk = max(W / iw, H / ih) * k
            sw, sh = W / kk, H / kk
            x0 = min(max(drift * iw - sw / 2, 0), iw - sw)
            y0 = min(max(0.5 * ih - sh / 2, 0), ih - sh)
            P = lambda n: ((A[n][0] * iw - x0) * kk, (A[n][1] * ih - y0) * kk)
        cv = bg.convert('RGBA')
        for s_ in shot.get('stamps', []):
            stamp(cv, P(s_))
        uu = ease_io(min(1, u * 1.25))
        q = draw_route(cv, P(r0), P(r1), uu, tangle=shot.get('tangle', False))
        if not shot.get('tangle'):
            if u > 0.8:
                stamp(cv, P(r1), ease_out((u - 0.8) / 0.2) * 1.2)
            hist = [draw_route(Image.new('RGBA', (8, 8)), P(r0), P(r1), max(0, uu - 0.01 * i)) for i in range(8, 0, -1)] if False else None
            d = 64 * S
            paste_center(cv, ball(d), q[0], q[1] - d * 0.3)
        return cv.convert('RGB')
    if name in ('chase', 'truce'):
        # a slow push with a sideways drift, and a bolt wipe out over the last 8 frames
        bg = cover(img, W, H, 1.0 + 0.06 * u, 0.5 + 0.03 * (u - 0.5), 0.5)
        cv = bg.convert('RGBA')
        left = shot['b'] - f
        if left <= 8:
            v = (8 - left) / 8
            dr = ImageDraw.Draw(cv)
            bw = W * 0.5
            x = -bw + v * (W + bw * 1.6)
            dr.polygon(bolt_poly(x, bw, H), fill=BOLT + (255,), outline=NIGHT + (255,))
        return cv.convert('RGB')
    if name == 'pudding':
        k = 1.0 + (shot.get('push', 1.05) - 1) * u
        bg = cover(img, W, H, k, 0.5, 0.45)
        flick = 1.0 + 0.035 * math.sin(f * 0.9) * math.sin(f * 0.37)
        return Image.eval(bg, lambda v: min(255, int(v * flick)))
    return cover(img, W, H)


def render_card(shot, f):
    u = (f - shot['a']) / max(1, shot['b'] - shot['a'])
    img = still(shot['still'])
    bg = cover(img, W, H, 1.0 + 0.05 * u, 0.5, 0.5)
    # darken the lower band a touch so the lockup reads
    arr = np.asarray(bg).astype(np.float32)
    ys = np.linspace(0, 1, H)[:, None, None]
    shade = 1 - 0.35 * np.clip((ys - 0.7) / 0.3, 0, 1)
    bg = Image.fromarray((arr * shade).astype(np.uint8))
    cv = bg.convert('RGBA')
    t = f - shot['a']
    # logo pops in on the stab (frame 0..10), PLAY FREE on +18, the URL on +26
    lw = {'h': 640, 'v': 780, 's': 420}[asp]
    ly = {'h': 0.215, 'v': 0.80, 's': 0.245}[asp] * H
    if t >= 2:
        k = ease_out((t - 2) / 12)
        sc = 0.6 + 0.4 * k + 0.06 * math.sin(min(1, (t - 2) / 20) * math.pi)
        logo = LOGO.resize((int(lw), int(lw * LOGO.height / LOGO.width)), Image.LANCZOS)
        paste_center(cv, logo, W / 2, ly, sc, min(1, (t - 2) / 6))
    if t >= 18:
        k = ease_out((t - 18) / 10)
        ft = font(64 * S)
        ft2 = font(56 * S, 700, 'Fredoka-Ext')
        a_txt, b_txt = 'PLAY FREE', 'pawlegends.app'
        aw = ft.getbbox(a_txt)[2] + 70 * S
        bw = ft2.getbbox(b_txt)[2] + 70 * S
        hh = 104 * S
        total = aw + bw
        y = ly + lw * LOGO.height / LOGO.width * 0.5 + 30 * S if asp == 'v' else H - hh - 60 * S
        x = W / 2 - total / 2 + (1 - k) * 60 * S
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(layer)
        sk = 18 * S
        dr.polygon([(x + sk, y), (x + aw + sk, y), (x + aw - sk, y + hh), (x - sk, y + hh)], fill=BOLT + (255,), outline=NIGHT + (255,))
        dr.polygon([(x + aw + sk, y), (x + total + sk, y), (x + total - sk, y + hh), (x + aw - sk, y + hh)], fill=NIGHT + (255,), outline=BOLT + (255,))
        ba = ft.getbbox(a_txt)
        dr.text((x + (aw - (ba[2] - ba[0])) / 2 - ba[0], y + (hh - (ba[3] - ba[1])) / 2 - ba[1]), a_txt, font=ft, fill=NIGHT + (255,))
        bb = ft2.getbbox(b_txt)
        dr.text((x + aw + (bw - (bb[2] - bb[0])) / 2 - bb[0], y + (hh - (bb[3] - bb[1])) / 2 - bb[1]), b_txt, font=ft2, fill=CREAM + (255,))
        if k < 1:
            a = layer.getchannel('A').point(lambda v: int(v * k))
            layer.putalpha(a)
        cv.alpha_composite(layer)
    return cv.convert('RGB')


def overlays(shot, f, frame):
    t = f - shot['a']
    out = frame
    # flashes: 2 white frames on the shot's first frames (hook contact, pop) or on the goal frame
    fl = None
    ft = t - shot.get('flashAt', 0)
    if shot.get('flash') and 0 <= ft < 2 and not shot.get('goalF'):
        fl = (0.85, 0.4)[ft]
    if shot.get('goalF') is not None and 0 <= f - shot['goalF'] < 2:
        fl = (0.85, 0.4)[f - shot['goalF']]
    need_rgba = any(k in shot for k in ('text', 'ballOut', 'ballIn', 'pips', 'logoSmall', 'vac')) or (shot.get('wipe') and t < 9)
    if need_rgba:
        cv = out.convert('RGBA')
        if shot.get('wipe') and t < 9:
            # white diagonal card-skin wipe across the cut
            v = t / 8
            layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            dr = ImageDraw.Draw(layer)
            bw = W * 0.35
            x = W * 1.2 - v * (W * 1.6 + bw)
            dr.polygon([(x, 0), (x + bw, 0), (x + bw - H * 0.5, H), (x - H * 0.5, H)], fill=(255, 255, 255, int(235 * (1 - v * 0.6))))
            cv.alpha_composite(layer)
        if 'pips' in shot:
            c, d, n = shot['pips']
            if shot.get('goalF') is not None:
                c, d, n = n, n, n
                if f >= shot['goalF']:
                    pass
            pips(cv, c, d, n)
        if 'ballOut' in shot:
            f0, f1 = shot['ballOut']
            if f0 <= f < f1:
                pts = []
                for i in range(10, -1, -1):
                    v = ease_io(max(0, (f - i - f0)) / (f1 - f0))
                    pts.append((HERO[0] + v * W * 0.08, HERO[1] - v * (HERO[1] + 160 * S)))
                d = 70 * S * (1 + 0.6 * ease_io((f - f0) / (f1 - f0)))
                trail(cv, pts, d)
                paste_center(cv, ball(d), pts[-1][0], pts[-1][1])
        if 'ballIn' in shot:
            f0, f1 = shot['ballIn']
            if f0 <= f < f1:
                pts = []
                for i in range(10, -1, -1):
                    v = ease_out(max(0, (f - i - f0)) / (f1 - f0))
                    pts.append((HERO[0] - (1 - v) * W * 0.1, -120 * S + v * (HERO[1] + 120 * S - 60 * S)))
                d = 90 * S * (1.4 - 0.6 * ease_out((f - f0) / (f1 - f0)))
                trail(cv, pts, d)
                paste_center(cv, ball(d), pts[-1][0], pts[-1][1])
        if 'vac' in shot:
            f0, f1 = shot['vac']
            if f0 - 30 <= f < f1:
                v = ease_io(max(0, f - f0) / (f1 - f0))
                d = 60 * S * (1 - v * 0.85)
                ang = v * 6.0
                x = HERO[0] + (1 - v) * (220 * S) * math.cos(ang)
                y = HERO[1] - 40 * S + (1 - v) * (120 * S) * math.sin(ang)
                paste_center(cv, ball(d), x, y)
        if shot.get('logoSmall'):
            lw = 300 * S
            lg = LOGO_C.resize((int(lw), int(lw * LOGO_C.height / LOGO_C.width)), Image.LANCZOS)
            # bottom-left: the minimap sits bottom-right in 16:9 and the ability bar bottom-centre
            yb = {'h': 0.86, 'v': 0.83, 's': 0.80}[asp]
            paste_center(cv, lg, lw / 2 + 40 * S, H * yb)
        if 'text' in shot:
            tx = shot['text']
            tt = f - tx['f']
            hold = min(shot['b'], tx['f'] + 78)
            if 0 <= tt < (hold - tx['f']):
                col = {'cat': MAG, 'dog': BLUE, 'bolt': BOLT}[tx['side']]
                size = {'h': 230, 'v': 200, 's': 190}[asp] * (W / {'h': 1920, 'v': 1080, 's': 1080}[asp])
                if tx['w'] == 'EVERY MAP':
                    size *= 0.72
                key = (tx['w'], int(size))
                if key not in _text:
                    _text[key] = text_img(tx['w'], size, col)
                k = ease_out(tt / 6)
                sc = 1.7 - 0.7 * k
                left = hold - f
                alpha = min(1, tt / 3 + 0.2) * (1 if left > 6 else left / 6)
                cy = H * (0.30 if asp != 'v' else 0.30)
                paste_center(cv, _text[key], W / 2, cy, sc, alpha)
        out = cv.convert('RGB')
    if fl:
        out = flash(out, fl)
    return out


# ------------------------------------------------------------------ main
def encoders():
    os.makedirs(outdir, exist_ok=True)
    tag = {'h': '16x9', 'v': '9x16', 's': '1x1'}[asp]
    base = os.path.join(outdir, f'grudge-tour-{cut_name}s-{tag}')
    common = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
              '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
              '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-threads', '4']
    outs = []
    if preview:
        outs.append(subprocess.Popen([FF, *common, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', base + '.preview.video.mp4'], stdin=subprocess.PIPE))
        return outs, base
    outs.append(subprocess.Popen([FF, *common, '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-maxrate', '60M', '-bufsize', '120M', '-profile:v', 'high', '-g', '60', base + '.video.mp4'], stdin=subprocess.PIPE))
    if asp == 'h':
        outs.append(subprocess.Popen([FF, *common, '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-maxrate', '10M', '-bufsize', '20M', '-profile:v', 'high', '-g', '120', base.replace('-16x9', '-web') + '.video.mp4'], stdin=subprocess.PIPE))
    return outs, base


def main():
    outs, base = encoders()
    shots = plan['shots']
    end = preview or N
    posters = {}
    start = int(sys.argv[sys.argv.index('--from') + 1]) if '--from' in sys.argv else 0
    for shot in shots:
        if shot['a'] >= end:
            break
        if shot['b'] <= start:
            continue
        if shot['a'] < start:
            raise SystemExit('--from must fall on a shot boundary')
        n = shot['b'] - shot['a']
        rd = TakeReader(shot['take'], shot['src'], n) if shot['kind'] == 'take' else None
        for f in range(shot['a'], min(shot['b'], end)):
            if rd:
                fr = rd.next()
            elif shot['kind'] == 'card':
                fr = render_card(shot, f)
            else:
                fr = render_still(shot, f)
            fr = overlays(shot, f, fr)
            if f in POSTER_FRAMES:
                posters[f] = fr.copy()
            b = fr.tobytes()
            for o in outs:
                o.stdin.write(b)
        if rd:
            rd.close()
        print(f'  [{cut_name}{asp}] shot {shot["a"]}-{shot["b"]} {shot.get("take") or shot.get("still")}', flush=True)
    for o in outs:
        o.stdin.close()
        o.wait()
    for f, im in posters.items():
        im.save(f'{base}.poster-f{f}.jpg', quality=95)


POSTER_FRAMES = set(json.loads(os.environ.get('POSTERS', '[]')))
if '--frames' in sys.argv:
    # stills / cards only: write single frames for a look
    os.makedirs(outdir, exist_ok=True)
    for f in [int(x) for x in sys.argv[sys.argv.index('--frames') + 1].split(',')]:
        shot = next(s for s in plan['shots'] if s['a'] <= f < s['b'])
        if shot['kind'] == 'take':
            rd = TakeReader(shot['take'], shot['src'] + (f - shot['a']) / FPS, 1)
            fr = rd.next(); rd.close()
        else:
            fr = render_card(shot, f) if shot['kind'] == 'card' else render_still(shot, f)
        overlays(shot, f, fr).save(os.path.join(outdir, f'{cut_name}{asp}-f{f}.jpg'), quality=92)
else:
    main()
