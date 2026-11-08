#!/usr/bin/env python3
"""PawLegends App Store screenshots: Gemini hype art around REAL gameplay captures.

Plan: store/SCREENSHOT-PLAN.md. Apple 2.3.3: the gameplay panel is the unaltered capture (only scaled, rounded and
tilted); Gemini paints only the background and the hero cut-outs around it; captions are set here in Fredoka Bold so
the spelling is exact.

  python scripts/store-art.py gen [--only bg_iphone_1,hero_clem] [--force]   Gemini art into store/art/ (cached)
  python scripts/store-art.py compose                                         write the 18 store PNGs + contact sheets

Needs Pillow + numpy (+ google-genai and GEMINI_API_KEY for `gen`). Outputs:
  fastlane/screenshots/en-US/{1..6}_*.png        iPhone 6.9"  2868 x 1320
  fastlane/screenshots/en-US/ipad_{1..6}_*.png   iPad 13"     2752 x 2064
  fastlane/screenshots_mac/en-US/{1..6}_*.png    Mac          2880 x 1800
  store/art/contact-sheet.jpg, store/art/thumbs-300.jpg (legibility check at 300 px wide)
"""
import concurrent.futures as cf
import math
import os
import pathlib
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

APP = pathlib.Path(__file__).resolve().parent.parent
REPO = APP.parent
ART = APP / "store" / "art"
CAP = APP / "store" / "raw-captures"
BRAND = REPO / "brand" / "pawlegends"
FONT = REPO / "pawlegends" / "public" / "assets" / "fonts" / "Fredoka-Latin.woff2"

YELLOW, PURPLE, DEEP, ORANGE, PINK = (255, 210, 63), (75, 31, 122), (42, 15, 74), (255, 138, 31), (240, 107, 138)

DEVICES = {
    "iphone": {"size": (2868, 1320), "aspect": "21:9", "dir": APP / "fastlane/screenshots/en-US", "prefix": ""},
    "ipad": {"size": (2752, 2064), "aspect": "4:3", "dir": APP / "fastlane/screenshots/en-US", "prefix": "ipad_"},
    "mac": {"size": (2880, 1800), "aspect": "16:9", "dir": APP / "fastlane/screenshots_mac/en-US", "prefix": ""},
}

# ---------------------------------------------------------------- Gemini art
STYLE = ("Polished mobile game key art in the style of top MOBA App Store art (Brawl Stars, Mobile Legends, Wild Rift) "
         "but fully original. Vivid, glossy, high energy. Palette: deep purple #4B1F7A to #2A0F4A, logo yellow #FFD23F, "
         "hot orange #FF8A1F, pink #F06B8A, electric teal accents, like the attached PawLegends logo and app icon.")
NO_TEXT = " Absolutely no text, no letters, no numbers, no logos, no watermarks, no UI, no characters, no animals."
CENTER = (" Keep the middle of the image (about 65% of the width and the lower 75% of the height) calm and a little "
          "darker, because a gameplay screenshot panel will be placed on top of it; put the strongest energy and detail "
          "around the edges and corners.")
BG_THEMES = {
    1: "Split backdrop: royal purple on the left half, blazing orange on the right half, a huge jagged yellow-white "
       "lightning bolt running diagonally down the middle between them, crackling sparks, glowing paw-print shaped "
       "embers, radial speed burst.",
    2: "Speed: orange-heavy backdrop with intense motion streaks radiating outward, a circular ring of lightning shaped "
       "like a stopwatch dial behind the centre, yellow lightning swooshes sweeping in from the left edge, sparks.",
    3: "A purple arena stage with dramatic crossing spotlight beams from above, gold and pink confetti, glittering "
       "particles, a glowing yellow rim of light, festive championship mood.",
    4: "Warm pink-to-purple backdrop with soft bokeh, glowing hearts and paw-print sparkles, friendly light rays, "
       "rings of light like a party lobby, cosy but energetic.",
    5: "A giant yellow-orange comic impact starburst exploding from behind the centre, purple edges, flying rock "
       "debris, shockwave rings, glowing paw-print sparks, dramatic diagonal speed lines.",
    6: "Victory: golden light rays bursting from behind the centre, a glowing golden trophy halo, a shower of confetti "
       "and little fish-shaped treats raining down, deep purple edges, celebratory.",
}
HEROES = {  # name: (reference capture, crop box as fractions, description, pose)
    "clem": ("iphone/09_victory.jpg", (0.45, 0.05, 0.80, 0.98),
             "Clem, the white-and-pink cat hero holding a sword (the cat holding the sword next to the trophy)",
             "leaping forward through the air mid sword swing, determined grin, cape flowing"),
    "clem_cheer": ("iphone/09_victory.jpg", (0.45, 0.05, 0.80, 0.98),
                   "Clem, the white-and-pink cat hero holding a sword (the cat holding the sword next to the trophy)",
                   "jumping for joy and raising the sword high in victory, eyes closed happily"),
    "brutus": ("iphone/12_hero_sir-brutus.jpg", (0.40, 0.05, 0.82, 0.98),
               "Sir Brutus, the pug-like dog knight with the pink-plumed helmet, sword and round shield",
               "charging forward shield-first in a powerful dash, fierce but cute"),
    "duchess": ("iphone/13_hero_duchess.jpg", (0.40, 0.05, 0.82, 0.98),
                "Duchess, the fluffy white cat mage with the tiara and pink cape",
                "floating and casting a sparkly magic spell from one paw, confident smirk"),
    "sage": ("iphone/11_hero_sage-arena.jpg", (0.40, 0.05, 0.82, 0.98),
             "Sage, the grey cat archer in the pink hood and green tunic with a bow",
             "drawing the bow and aiming, dynamic three-quarter view"),
    "bengas": ("iphone/07_pick_cats.jpg", (0.55, 0.12, 0.82, 0.72),
               "Bengas, the brown tabby cat hero standing on the stage pedestal",
               "jumping in with paws raised throwing a flaming piece of toast, playful"),
}


def gen_jobs():
    jobs = {}
    refs_brand = [BRAND / "logo-1200.png", BRAND / "app-icon-ios-1024.png"]
    for dev, d in DEVICES.items():
        for n, theme in BG_THEMES.items():
            prompt = (f"Background art for a mobile game App Store screenshot. {theme} {STYLE}{CENTER}{NO_TEXT}")
            jobs[f"bg_{dev}_{n}"] = (prompt, refs_brand, d["aspect"], "jpg")
    for name, (cap, box, desc, pose) in HEROES.items():
        prompt = (f"Render {desc} from the attached gameplay screenshot as a single full-body character, {pose}. "
                  "Keep the exact same character design, colours, outfit and cute chunky 3D cel-shaded toy-like game "
                  "style as the reference, but bigger, crisper and more heroic, like official MOBA hero splash art. "
                  "Only this one character, whole body visible with a small margin, nothing cropped. Bold dark outline. "
                  "Place it on a perfectly flat, uniform pure green #00FF00 background (chroma key), no shadow on the "
                  "ground, no green on the character, no text, no effects that touch the edges.")
        jobs[f"hero_{name}"] = (prompt, [("crop", CAP / cap, box)], "1:1", "jpg")
    return jobs


def load_ref(r):
    if isinstance(r, tuple):
        _, p, (l, t, rr, b) = r
        im = Image.open(p).convert("RGB")
        W, H = im.size
        return im.crop((int(l * W), int(t * H), int(rr * W), int(b * H)))
    return Image.open(r).convert("RGB")


def gen(only=None, force=False):
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    (ART / "raw").mkdir(parents=True, exist_ok=True)
    jobs = {k: v for k, v in gen_jobs().items() if (not only or k in only)}
    jobs = {k: v for k, v in jobs.items() if force or not (ART / "raw" / f"{k}.jpg").exists()}

    def run(item):
        key, (prompt, refs, aspect, _) = item
        contents = [prompt] + [load_ref(r) for r in refs]
        err = "no image"
        for _ in range(3):
            try:
                r = client.models.generate_content(
                    model="gemini-3-pro-image", contents=contents,
                    config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"],
                                                       image_config=types.ImageConfig(aspect_ratio=aspect, image_size="2K")))
                for p in r.parts or []:
                    if p.inline_data:
                        p.as_image().save(str(ART / "raw" / f"{key}.jpg"))
                        return key, "ok"
            except Exception as e:  # retry
                err = str(e)[:160]
        return key, "FAIL " + err

    with cf.ThreadPoolExecutor(6) as ex:
        for k, s in ex.map(run, jobs.items()):
            print(k, s, flush=True)


# ---------------------------------------------------------------- compositing helpers
def font(px, weight="Bold"):
    f = ImageFont.truetype(str(FONT), px)
    f.set_variation_by_name(weight)
    return f


def cover(im, size):
    W, H = size
    s = max(W / im.width, H / im.height)
    im = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((l, t, l + W, t + H))


def key_green(src):
    """Chroma-key a Gemini green-screen hero to RGBA (same approach as brand/pawlegends/source/key.py)."""
    a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    m = np.maximum(R, B)
    gr = (G - m) / (G + 1)
    alpha = np.clip((0.40 - gr) / (0.40 - 0.10), 0, 1)
    G2 = np.where(G > m, m, G)
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    # keep only the largest blob area: drop specks away from the character
    al = al.point(lambda v: 0 if v < 24 else v).filter(ImageFilter.GaussianBlur(0.7))
    out = Image.fromarray(np.dstack([R, G2, B]).clip(0, 255).astype(np.uint8), "RGB").convert("RGBA")
    out.putalpha(al)
    bb = al.point(lambda v: 255 if v > 80 else 0).getbbox()
    return out.crop(bb)


_hero_cache = {}


def hero(name):
    if name not in _hero_cache:
        p = ART / "heroes" / f"{name}.png"
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            key_green(ART / "raw" / f"hero_{name}.jpg").save(p)
        _hero_cache[name] = Image.open(p).convert("RGBA")
    return _hero_cache[name]


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def panel(cap_path, w, angle, border=None):
    """The real capture, scaled to width w (never repainted), rounded, yellow-framed, tilted. Returns RGBA."""
    cap = Image.open(cap_path).convert("RGB")
    h = round(cap.height * w / cap.width)
    cap = cap.resize((w, h), Image.LANCZOS)
    b = border or max(10, w // 120)
    r = w // 40
    W, H = w + 2 * b, h + 2 * b
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    frame = Image.new("RGBA", (W, H), YELLOW + (255,))
    out.paste(frame, (0, 0), rounded_mask((W, H), r + b))
    inner = Image.new("RGBA", (w + 2, h + 2), DEEP + (255,))
    out.paste(inner, (b - 1, b - 1), rounded_mask((w + 2, h + 2), r))
    out.paste(cap, (b, b), rounded_mask((w, h), r))
    return out.rotate(angle, Image.BICUBIC, expand=True)


def shadow_glow(canvas, layer, xy, glow=YELLOW, blur=40, offset=(0, 26)):
    a = layer.getchannel("A")
    pad = blur * 3
    big = Image.new("L", (layer.width + 2 * pad, layer.height + 2 * pad), 0)
    big.paste(a, (pad, pad))
    sh = big.filter(ImageFilter.GaussianBlur(blur))
    dark = Image.new("RGBA", big.size, (10, 2, 25, 0))
    dark.putalpha(sh.point(lambda v: int(v * 0.75)))
    canvas.alpha_composite(dark, (xy[0] - pad + offset[0], xy[1] - pad + offset[1]))
    if glow:
        g = big.filter(ImageFilter.GaussianBlur(blur * 1.6))
        gl = Image.new("RGBA", big.size, glow + (0,))
        gl.putalpha(g.point(lambda v: int(v * 0.55)))
        canvas.alpha_composite(gl, (xy[0] - pad, xy[1] - pad))


def place(canvas, im, xy, shadow=True, glow=None):
    xy = (int(xy[0]), int(xy[1]))
    if shadow:
        shadow_glow(canvas, im, xy, glow=glow, blur=max(12, im.width // 60), offset=(0, max(8, im.height // 70)))
    canvas.alpha_composite(im, xy)


def put_hero(canvas, name, height, anchor, flip=False, rot=0, glow=None):
    """anchor = (x, y) of the hero's bottom-centre."""
    h = hero(name)
    if flip:
        h = h.transpose(Image.FLIP_LEFT_RIGHT)
    s = height / h.height
    h = h.resize((round(h.width * s), round(height)), Image.LANCZOS)
    if rot:
        h = h.rotate(rot, Image.BICUBIC, expand=True)
    x, y = anchor[0] - h.width // 2, anchor[1] - h.height
    rim = h.getchannel("A").filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(3))
    if glow:  # coloured rim light so the cut-out pops off the background
        g = Image.new("RGBA", h.size, glow + (0,))
        g.putalpha(rim)
        canvas.alpha_composite(g, (x, y))
    place(canvas, h, (x, y), shadow=True, glow=None)
    return (x, y, x + h.width, y + h.height)


def caption(canvas, text, cx, top, px, fill=(255, 255, 255), stroke=DEEP, max_w=None, align="center"):
    """Fredoka Bold caption with a heavy purple outline and a drop shadow. Shrinks to max_w."""
    while True:
        f = font(px)
        sw = max(6, px // 11)
        d = ImageDraw.Draw(canvas)
        bb = d.multiline_textbbox((0, 0), text, font=f, stroke_width=sw, align=align, spacing=px // 10)
        if not max_w or bb[2] - bb[0] <= max_w:
            break
        px = int(px * 0.95)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    x = cx - w // 2 - bb[0] if align == "center" else cx - bb[0]
    y = top - bb[1]
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).multiline_text((x, y + px // 12), text, font=f, fill=(10, 2, 25, 200), stroke_width=sw,
                                         stroke_fill=(10, 2, 25, 200), align=align, spacing=px // 10)
    layer = layer.filter(ImageFilter.GaussianBlur(px // 40 + 1))
    canvas.alpha_composite(layer)
    ImageDraw.Draw(canvas).multiline_text((x, y), text, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke,
                                          align=align, spacing=px // 10)
    return (x + bb[0], y + bb[1], x + bb[0] + w, y + bb[1] + h)


def logo(canvas, width, xy):
    lg = Image.open(BRAND / "logo-1200.png").convert("RGBA")
    if width > lg.width:
        lg = Image.open(BRAND / "logo.png").convert("RGBA")
    lg = lg.resize((width, round(lg.height * width / lg.width)), Image.LANCZOS)
    place(canvas, lg, xy, shadow=True)
    return lg.size


def icon_badge(canvas, size, xy):
    ic = Image.open(BRAND / "app-icon-ios-1024.png").convert("RGB").resize((size, size), Image.LANCZOS)
    t = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    t.paste(ic, (0, 0), rounded_mask((size, size), int(size * 0.225)))
    place(canvas, t, xy, shadow=True)


def keycaps(canvas, keys, x, y, size):
    f = font(int(size * 0.55))
    for i, k in enumerate(keys):
        cap = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(cap)
        d.rounded_rectangle((0, 0, size - 1, size - 1), size // 5, fill=DEEP + (255,))
        d.rounded_rectangle((0, 0, size - 1, size - size // 10), size // 5, fill=PURPLE + (255,),
                            outline=YELLOW + (255,), width=max(4, size // 22))
        bb = d.textbbox((0, 0), k, font=f)
        d.text(((size - bb[2] - bb[0]) // 2, (size - size // 10 - bb[3] - bb[1]) // 2), k, font=f, fill=YELLOW)
        place(canvas, cap.rotate(-6 + 4 * i, Image.BICUBIC, expand=True), (x + i * int(size * 1.12), y), glow=YELLOW)


def background(dev, theme):
    W, H = DEVICES[dev]["size"]
    bg = cover(Image.open(ART / "raw" / f"bg_{dev}_{theme}.jpg").convert("RGB"), (W, H)).convert("RGBA")
    # darken the top so the caption pops
    grad = Image.linear_gradient("L").resize((W, H)).point(lambda v: int((255 - v) * 0.55) if v < 255 else 0)
    shade = Image.new("RGBA", (W, H), (20, 6, 40, 0))
    shade.putalpha(grad)
    bg.alpha_composite(shade)
    return bg


# ---------------------------------------------------------------- shot list
SHOTS = {
    "iphone": [
        (1, "team-cat-or-dog", "Team Cat or Team Dog?", "iphone/01_teamfight_ult-tangled-lights.jpg", 1, "hook"),
        (2, "fast-battles", "Fast 7-minute battles", "iphone/03_lane-fight_three-dogs.jpg", 2, ("clem", "right")),
        (3, "20-heroes", "20 heroes, big plays", "iphone/07_pick_cats.jpg", 3, "fan"),
        (4, "squad-up", "Squad up with friends", "iphone/10_party-lobby.jpg", 4, "trio"),
        (5, "comeback", "Pull off the comeback", "iphone/04_lane-fight_shutdown-combo.jpg", 5, ("brutus", "left")),
        (6, "victory", "Victory tastes like treats", "iphone/09_victory.jpg", 6, "victory"),
    ],
    "ipad": [
        (1, "team-cat-or-dog", "Team Cat or Team Dog?", "ipad/01_teamfight_fountain.jpg", 1, "hook"),
        (2, "fast-battles", "Fast 7-minute battles", "ipad/02_ult_curtains-up.jpg", 2, ("bengas", "right")),
        (3, "20-heroes", "20 heroes, big plays", ("ipad/03_pick_cats.jpg", "ipad/04_pick_dogs.jpg"), 3, "vs"),
        (4, "squad-up", "Squad up with friends", "ipad/06_party-lobby.jpg", 4, "trio"),
        (5, "cute-and-fierce", "Cute heroes, fierce fights", "ipad/09_lobby-v101_duchess.jpg", 5, ("duchess", "left")),
        (6, "victory", "Victory tastes like treats", "ipad/05_victory.jpg", 6, "victory"),
    ],
    "mac": [
        (1, "team-cat-or-dog", "Team Cat or Team Dog?", "mac/02_lane-fight_combo.jpg", 1, "hook"),
        (2, "mouse-and-keys", "Built for mouse & keys", "mac/01_lane-fight_pudding.jpg", 2, "keys"),
        (3, "20-heroes", "20 heroes, big plays", ("mac/03_pick_cats.jpg", "mac/04_pick_dogs.jpg"), 3, "vs"),
        (4, "squad-up", "Squad up with friends", "mac/06_party-lobby.jpg", 4, "trio"),
        (5, "cute-and-fierce", "Cute heroes, fierce fights", "mac/09_lobby-v101_sir-brutus.jpg", 5, ("clem", "right")),
        (6, "victory", "Victory tastes like treats", "mac/05_victory.jpg", 6, "victory"),
    ],
}

# per-device geometry: panel width (fraction of W), caption size (fraction of H), caption top, panel centre y
GEO = {
    "iphone": {"pw": 0.64, "cap": 0.125, "ctop": 0.04, "pcy": 0.60, "hero": 0.64, "hx": -0.04},
    "ipad": {"pw": 0.70, "cap": 0.085, "ctop": 0.045, "pcy": 0.585, "hero": 0.50, "hx": 0.0},
    "mac": {"pw": 0.66, "cap": 0.095, "ctop": 0.045, "pcy": 0.59, "hero": 0.58, "hx": -0.015},
}


def compose_one(dev, n, slug, text, cap, theme, extra):
    W, H = DEVICES[dev]["size"]
    g = GEO[dev]
    c = background(dev, theme)
    pw = int(W * g["pw"])
    cap_px = int(H * g["cap"])
    hh = H * g["hero"]
    ang = -2.5 if n % 2 else 2.0
    late_logo = None  # shot 1: the logo is drawn last, over the panel's top-left corner (the minimap)

    # caption (shot 1: logo top-left, caption to its right)
    if extra == "hook":
        lw = int(W * (0.25 if dev == "iphone" else 0.30 if dev == "mac" else 0.40))
        cap_top = int(H * g["ctop"])
        if dev == "ipad":
            lsz = (lw, round(lw * 2983 / 4582))
            late_logo = (lw, (int(W * 0.03), int(H * 0.015)))
            caption(c, "Team Cat or\nTeam Dog?", int(W * 0.03 + lw + (W - lw - W * 0.06) / 2), cap_top, cap_px,
                    max_w=int(W - lw - W * 0.08))
            ctop_end = int(H * 0.015) + lsz[1]
        else:
            late_logo = (lw, (int(W * 0.02), int(H * 0.01)))
            caption(c, text, int(W * 0.025 + lw + (W - lw - W * 0.05) / 2), cap_top + int(H * 0.02), cap_px,
                    max_w=int(W - lw - W * 0.07))
            ctop_end = cap_top + cap_px + int(H * 0.03)
    else:
        bb = caption(c, text, W // 2, int(H * g["ctop"]), cap_px, max_w=int(W * 0.92))
        ctop_end = bb[3]

    # panel(s)
    if extra == "vs":
        p1 = panel(CAP / cap[0], int(W * (0.47 if dev == "mac" else 0.50)), 3.5)
        p2 = panel(CAP / cap[1], int(W * (0.47 if dev == "mac" else 0.50)), -3.5)
        cy = int(H * g["pcy"]) + (int(H * 0.04) if dev == "ipad" else 0)
        place(c, p1, (int(W * 0.015), cy - p1.height // 2 - int(H * 0.04)), glow=PURPLE)
        place(c, p2, (W - p2.width - int(W * 0.015), cy - p2.height // 2 + int(H * 0.05)), glow=ORANGE)
        caption(c, "VS", W // 2, cy - int(H * 0.10), int(H * (0.16 if dev != "ipad" else 0.12)), fill=YELLOW)
        return c
    p = panel(CAP / cap, pw, ang)
    py = max(ctop_end + int(H * 0.02), int(H * g["pcy"]) - p.height // 2)
    py = min(py, H - p.height - int(H * 0.015))
    px = (W - p.width) // 2
    glow = {1: YELLOW, 2: ORANGE, 3: PURPLE, 4: PINK, 5: YELLOW, 6: YELLOW}[theme]
    place(c, p, (px, py), glow=glow)
    hx = int(W * g["hx"])
    L, R, B = px + hx, px + p.width - hx, py + p.height

    if extra == "hook":
        put_hero(c, "clem", hh * 1.0, (L + int(W * 0.01), H + int(H * 0.02)), glow=PINK, rot=4)
        put_hero(c, "brutus", hh * 0.95, (R - int(W * 0.01), H + int(H * 0.02)), flip=True, glow=ORANGE, rot=-4)
    elif isinstance(extra, tuple):
        name, side = extra
        if side == "right":
            put_hero(c, name, hh, (R - int(W * 0.02), H + int(H * 0.01)), flip=(name == "clem"), glow=ORANGE, rot=-6)
        else:
            put_hero(c, name, hh, (L + int(W * 0.02), H + int(H * 0.01)), glow=YELLOW, rot=6)
    elif extra == "fan":  # heroes peek in from the outer edges, clear of the card grid
        put_hero(c, "sage", hh * 0.72, (L - int(W * 0.035), H + int(H * 0.01)), glow=PURPLE, rot=7)
        put_hero(c, "duchess", hh * 0.60, (L + int(W * 0.03), H + int(H * 0.03)), glow=PINK, rot=2)
        put_hero(c, "bengas", hh * 0.60, (R - int(W * 0.03), H + int(H * 0.03)), flip=True, glow=ORANGE, rot=-2)
        put_hero(c, "brutus", hh * 0.72, (R + int(W * 0.035), H + int(H * 0.01)), flip=True, glow=ORANGE, rot=-7)
    elif extra == "trio":
        put_hero(c, "sage", hh * 0.78, (L + int(W * 0.02), H + int(H * 0.01)), glow=PINK, rot=5)
        put_hero(c, "clem_cheer", hh * 0.82, (R - int(W * 0.02), H + int(H * 0.01)), glow=PINK, rot=-5)
    elif extra == "victory":
        put_hero(c, "clem_cheer", hh * 0.9, (L + int(W * 0.02), H + int(H * 0.01)), glow=YELLOW, rot=5)
        isz = int(H * (0.14 if dev != "ipad" else 0.09))
        f = int(H * (0.052 if dev != "ipad" else 0.036))
        # end card: purple pill with "No ads. No account." and the app icon, bottom right
        lines = "No ads.\nNo account."
        fnt = font(f)
        sw = max(3, f // 12)
        d = ImageDraw.Draw(c)
        bb = d.multiline_textbbox((0, 0), lines, font=fnt, stroke_width=sw, spacing=f // 8)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        pad = int(isz * 0.14)
        pw_, ph_ = tw + isz + 3 * pad, isz + 2 * pad
        x0, y1 = W - pw_ - int(W * 0.015), H - ph_ - int(H * 0.02)
        pill = Image.new("RGBA", (pw_, ph_), (0, 0, 0, 0))
        ImageDraw.Draw(pill).rounded_rectangle((0, 0, pw_ - 1, ph_ - 1), ph_ // 3, fill=DEEP + (235,),
                                               outline=YELLOW + (255,), width=max(4, f // 10))
        place(c, pill, (x0, y1), glow=YELLOW)
        d = ImageDraw.Draw(c)
        d.multiline_text((x0 + pad - bb[0], y1 + (ph_ - th) // 2 - bb[1]), lines, font=fnt, fill=YELLOW,
                         stroke_width=sw, stroke_fill=DEEP, spacing=f // 8)
        icon_badge(c, isz, (x0 + 2 * pad + tw, y1 + pad))
    elif extra == "keys":
        put_hero(c, "brutus", hh * 0.9, (L + int(W * 0.02), H + int(H * 0.01)), glow=ORANGE, rot=6)
        ks = int(H * 0.11)
        keycaps(c, "QWER", R - int(ks * 4.4) + int(W * 0.05), H - ks - int(H * 0.05), ks)
    if late_logo:
        logo(c, *late_logo)
    return c


def compose():
    sheets = []
    for dev, shots in SHOTS.items():
        d = DEVICES[dev]
        d["dir"].mkdir(parents=True, exist_ok=True)
        prefix = d["prefix"]
        for old in d["dir"].glob(f"{prefix}[0-9]_*.png"):
            old.unlink()
        row = []
        for n, slug, text, cap, theme, extra in shots:
            img = compose_one(dev, n, slug, text, cap, theme, extra).convert("RGB")
            assert img.size == d["size"], (dev, n, img.size)
            out = d["dir"] / f"{prefix}{n}_{slug}.png"
            img.save(out, optimize=True)
            print(out.relative_to(APP), img.size, flush=True)
            row.append(img)
        sheets.append(row)
    # contact sheet (600 px wide tiles) and a thumbnail check at 300 px wide
    for tw, name in ((600, "contact-sheet.jpg"), (300, "thumbs-300.jpg")):
        rows = [[im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS) for im in r] for r in sheets]
        gap = 12
        Wt = 6 * tw + 7 * gap
        Ht = sum(max(t.height for t in r) for r in rows) + (len(rows) + 1) * gap
        s = Image.new("RGB", (Wt, Ht), (24, 16, 32))
        y = gap
        for r in rows:
            for i, t in enumerate(r):
                s.paste(t, (gap + i * (tw + gap), y))
            y += max(t.height for t in r) + gap
        s.save(ART / name, quality=88)
        print(ART / name)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "compose"
    args = sys.argv[2:]
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    if cmd == "gen":
        gen(only, "--force" in args)
    elif cmd == "compose":
        compose()
    else:
        sys.exit(__doc__)
