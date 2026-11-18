"""
Home poster rival silhouettes (docs/plans/moba/HOME-POSTER.md). For each hero: Gemini (gemini-3-pro-image-preview)
redraws its bundled splash full body on a flat #00FF00 screen, facing the bolt (a cat right, a dog left); the green is
keyed out and only the alpha is kept (white RGB), 640 px tall, as `<out>/<hero>-640.webp` (about 6-13 KB each).
The poster tints the alpha in the shader, so the art never shows: only the outline does.

Usage (outside the repo's python path; GEMINI_API_KEY in the environment, never printed):
  python -I tools/poster-silhouettes.py <work dir> <out dir> [hero ...]
Needs google-genai and Pillow (a scratch venv), and dwebp / cwebp on PATH. A hero already drawn in <work dir> is reused.
"""
import os
import re
import subprocess
import sys

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEROES = os.path.join(ROOT, 'src', 'data', 'heroes')
SPLASH = os.path.join(ROOT, 'public', 'assets', 'splash')


def sides():
    out = {}
    for f in sorted(os.listdir(HEROES)):
        m = re.search(r"side: '(cat|dog)'", open(os.path.join(HEROES, f)).read())
        if m:
            out[f[:-3]] = m.group(1)
    return out


def draw(hero, side, src_png, out_jpg):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ['GEMINI_API_KEY'], http_options=types.HttpOptions(api_version='v1beta'))
    face = 'facing right (three-quarter view toward the right edge)' if side == 'cat' else 'facing left (three-quarter view toward the left edge)'
    prompt = (
        f'Redraw exactly this character (same species, colours, outfit, weapon, face, art style) as a FULL-BODY standing heroic '
        f'action pose, {face}, whole body visible from ear tips to feet with a small margin, centred. '
        'Remove the entire background, sparkles, particles, glow and ground: place the character alone on a perfectly flat, uniform, '
        'pure chroma-key green background (#00FF00) with no shadow, no gradient, no floor, no rim of green on the character. '
        'Do not use any green colour on the character itself. No text, no frame.'
    )
    for _ in range(3):
        try:
            r = client.models.generate_content(
                model='gemini-3-pro-image-preview',
                contents=[prompt, Image.open(src_png)],
                config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'], image_config=types.ImageConfig(aspect_ratio='3:4', image_size='1K')),
            )
            for p in r.parts:
                if p.inline_data:
                    p.as_image().save(out_jpg)
                    return True
        except Exception as e:  # retry: the preview model is busy at times
            print('retry', hero, type(e).__name__)
    return False


def key(src_jpg, out_png, height=640):
    im = Image.open(src_jpg).convert('RGB')
    alpha = []
    for r, g, b in im.getdata():
        gr = g - max(r, b)
        alpha.append(255 if gr <= 25 else 0 if gr >= 90 else int(255 * (90 - gr) / 65))
    a = Image.new('L', im.size)
    a.putdata(alpha)
    # erode 1 px (the green fringe), soften the edge
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    a = a.crop(a.point(lambda v: 255 if v > 24 else 0).getbbox())
    a = a.resize((round(a.width * height / a.height), height), Image.LANCZOS)
    o = Image.new('RGBA', a.size, (255, 255, 255, 0))
    o.putalpha(a)
    o.save(out_png)


def main():
    work, out = sys.argv[1], sys.argv[2]
    want = sys.argv[3:]
    os.makedirs(work, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    for hero, side in sides().items():
        if want and hero not in want:
            continue
        src = os.path.join(work, f'{hero}-src.png')
        jpg = os.path.join(work, f'{hero}.jpg')
        png = os.path.join(work, f'{hero}-sil.png')
        if not os.path.exists(jpg):
            subprocess.run(['dwebp', '-quiet', os.path.join(SPLASH, f'{hero}-720.webp'), '-o', src], check=True)
            if not draw(hero, side, src, jpg):
                print('failed', hero)
                continue
        key(jpg, png)
        subprocess.run(['cwebp', '-quiet', '-q', '80', '-alpha_q', '70', '-exact', png, '-o', os.path.join(out, f'{hero}-640.webp')], check=True)
        print('ok', hero)


if __name__ == '__main__':
    main()
