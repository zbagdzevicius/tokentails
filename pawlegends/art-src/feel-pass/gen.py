"""Generate the feel-pass ART list with Gemini. Usage: gen.py [id ...]  (raw JPEGs land in raw/<id>.jpg)."""
import os, sys, json, concurrent.futures as cf
from google import genai
from google.genai import types
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
os.makedirs(RAW, exist_ok=True)
client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])
MODEL = 'gemini-3-pro-image'

STYLE = (
    'Original artwork for a cute cats-versus-dogs mobile game. Painterly chunky cartoon style with soft cel shading, '
    'rounded toy-like shapes and thick warm-brown ink outlines (#3b2417), cosy and playful, the same soft painted look '
    'as the reference image. Cat team colours: rose #ff6f91, cream #fff3dc, deep rose #c94a72. Dog team colours: '
    'ochre #b5762b, brown #5b3a1e. Absolutely no text, no letters, no numbers, no logos, no watermark, no UI. '
    'Do not imitate any existing game. '
)
BG = (
    'Wide landscape background illustration. Keep the centre and the left third calm and uncluttered with soft '
    'low-contrast detail so menu text and buttons can sit on top. '
)
CHROMA = (
    'Single isolated object centred on a perfectly flat, uniform pure green (#00ff00) background, no shadow on the '
    'background, no gradient, no ground, generous empty margin around the object. Nothing else in the image. '
)
STICKER = (
    'A die-cut sticker: chibi character with big head, small body, big shiny eyes, thick warm-brown outline and a '
    'thick white sticker border around the whole silhouette. '
)

SPECS = {
    # A1-A4, A8: backgrounds (16:9)
    'lobby-castles': ('16:9', '2K', True, BG + 'A sunny late-afternoon meadow seen from a slightly high angle. On the far left a pink cat castle with '
        'cat-ear turret roofs and rose banners; on the far right a sturdy wooden dog fort with bone-shaped banners and paw '
        'carvings. A toy-strewn dirt path (yarn balls, rubber bones, toy mice) winds between them and a sparkling river '
        'runs diagonally from the bottom-left to the top-right. Fluffy clouds, warm golden light, gentle foreground '
        'grass and flowers framing the bottom edge.'),
    'pick-stage': ('16:9', '2K', True, BG + 'A cosy theatre stage for a hero line-up: heavy rose velvet curtains drawn open at the sides, a wooden '
        'plank stage floor, one warm round spotlight pool on the floor right of centre, paw-print shaped confetti '
        'scattered on the floor and drifting in the air, soft warm haze. Colours blend from rose on the left to ochre on '
        'the right. The stage is empty: no characters.'),
    'matchup-split': ('16:9', '2K', True, 'Wide landscape splash background. The picture is split by one bold diagonal slash running from the '
        'bottom-left corner to the top-right corner. The lower-left half is the cat side: rose and cream, a pink cat '
        'castle silhouette, yarn balls, paw prints. The upper-right half is the dog side: ochre and brown, a wooden dog '
        'fort silhouette, bones and kennel flags. Where the halves meet along the diagonal, puffy cartoon dust clouds '
        'and sparks burst out. High contrast, energetic, no characters.'),
    'win-cat': ('16:9', '2K', True, BG + 'Victory celebration: on the right side a happy pile-up of chibi cats in rose and cream scarves '
        'cheering on top of each other, one holding up a big golden trophy shaped like a fish bone. Gold #ffd34d '
        'ribbons, streamers and confetti, warm golden glow, joyful.'),
    'win-dog': ('16:9', '2K', True, BG + 'Victory celebration: on the right side a happy pile-up of chibi dogs in ochre and brown bandanas '
        'cheering on top of each other, one holding up a big golden trophy shaped like a bone. Gold #ffd34d ribbons, '
        'streamers and confetti, warm golden glow, joyful.'),
    'lose-cat': ('16:9', '2K', True, BG + 'A gentle rainy evening on a wooden porch, desaturated lavender (#8a7fb5) and dusty rose palette. On '
        'the right a chibi cat sits wrapped in a blanket next to a soggy toy mouse, looking a little sulky but cute, '
        'not sad. Raindrops, puddles, a warm lantern glow hinting at a comeback.'),
    'lose-dog': ('16:9', '2K', True, BG + 'A gentle rainy evening on a wooden porch, desaturated lavender (#8a7fb5) and dusty ochre palette. On '
        'the right a chibi dog sits under a small umbrella next to a soggy squeaky toy bone, a little grumpy but cute, '
        'not sad. Raindrops, puddles, a warm lantern glow hinting at a comeback.'),
    'pause-cushions': ('16:9', '1K', True, 'Wide background: the inside of a cosy blanket-and-cushion fort, soft rose and cream fabrics, plump '
        'pillows, fairy lights, very soft focus and low contrast as if slightly blurred, calm, no characters. The whole '
        'picture is quiet so a menu panel can sit in the middle.'),
    # A9: ground tile
    'ground-tile': ('1:1', '2K', True, 'Top-down orthographic view (camera straight down) of a seamless tileable ground texture: soft '
        'cartoon meadow grass in muted greens #7fae5a and #5d8a44 with soft painted grass tufts, sparse tiny flowers, and '
        'only a few very small toy blocks and tiny pebbles, all small and evenly scattered across the whole square with no clusters and no focal point, no horizon, no '
        'shadows pointing anywhere specific, even lighting. Painted texture, edges must continue seamlessly.'),
    # A5: frames (chroma key, composed into 9-slices later)
    'frame-plate': ('1:1', '1K', False, CHROMA + 'A flat front-facing rounded-rectangle UI plate, almost square, cream #fff3dc fill with a subtle '
        'painted texture, a thick warm-brown #3b2417 ink border with rounded corners, a thin inner line of little '
        'stitched paw-print dashes running inside the border. Completely flat, no perspective, empty inside.'),
    'frame-panel': ('1:1', '1K', False, CHROMA + 'A flat front-facing square menu panel with big rounded corners: cream #fff3dc paper fill, a thick '
        'warm-brown #3b2417 outline, a rose #ff6f91 inner trim band, small cute paw-print studs exactly in each of the four '
        'corners. Completely flat, symmetric, no perspective, empty inside.'),
    'frame-rim': ('1:1', '1K', False, CHROMA + 'A flat front-facing square picture frame with rounded corners, thick wooden-and-cream rim with a '
        'warm-brown #3b2417 outline and paw-print stitching around the rim, a tiny paw charm in each corner. The inside '
        'of the frame is the same flat pure green. Completely flat, symmetric, no perspective.'),
    # A6: mascot stickers
    'st-base-cat': ('1:1', '1K', False, CHROMA + STICKER + 'A cheerful rose-and-cream cat pointing down and to the left with one paw, winking.'),
    'st-base-dog': ('1:1', '1K', False, CHROMA + STICKER + 'A cheerful ochre-and-brown dog pointing up and to the right with one paw, tongue out.'),
    'st-help-cat': ('1:1', '1K', False, CHROMA + STICKER + 'A curious rose-and-cream cat holding up a big golden question-mark shaped balloon.'),
    'st-nap-cat': ('1:1', '1K', False, CHROMA + STICKER + 'A rose-and-cream cat curled up asleep on a small round cushion, little "z" bubbles drawn as simple puffs (no letters).'),
    'st-respawn-dog': ('1:1', '1K', False, CHROMA + STICKER + 'An ochre-and-brown dog holding a big round brass stopwatch, determined face.'),
    'st-cheer-cat': ('1:1', '1K', False, CHROMA + STICKER + 'A rose-and-cream cat jumping with both paws up, celebrating, with a few gold stars around it.'),
    'st-cheer-dog': ('1:1', '1K', False, CHROMA + STICKER + 'An ochre-and-brown dog jumping with both paws up, celebrating, with a few gold stars around it.'),
    # A7: pings (simple bold icons)
    'ping-onmyway': ('1:1', '1K', False, CHROMA + 'A bold simple game ping icon: a big golden paw print with two speed lines, thick white outline, readable at 32 px.'),
    'ping-danger': ('1:1', '1K', False, CHROMA + 'A bold simple game ping icon: the head of a startled cat with its fur standing up and a red #e8414b exclamation spark, thick white outline, readable at 32 px.'),
    'ping-group': ('1:1', '1K', False, CHROMA + 'A bold simple game ping icon: three small blue #3d8bff paw prints huddled together in a tight triangle with a curved arrow ring around them, thick white outline, readable at 32 px.'),
    'ping-nice': ('1:1', '1K', False, CHROMA + 'A bold simple game ping icon: a cartoon cat paw giving a thumbs-up, golden, with a sparkle, thick white outline, readable at 32 px.'),
    'ping-oops': ('1:1', '1K', False, CHROMA + 'A bold simple game ping icon: a sheepish cat face with a sweat drop and a tiny ball of tangled yarn, thick white outline, readable at 32 px.'),
    # A10
    'icon-cancel': ('1:1', '1K', False, CHROMA + 'A bold round game button icon: a red #e8414b circle with a thick white outline holding a big white X made of two crossed fish bones, a tiny scared cat face peeking over the top edge. Readable at 48 px.'),
    'icon-lock': ('1:1', '1K', False, CHROMA + 'A bold simple game icon: a chunky grey padlock with a paw-print shaped keyhole, thick white outline. Readable at 32 px.'),
}


def gen(sid: str) -> str:
    ratio, size, ref, prompt = SPECS[sid]
    out = os.path.join(RAW, sid + '.jpg')
    if os.path.exists(out):
        return f'skip {sid}'
    contents = [STYLE + prompt]
    if ref:
        contents.append(Image.open(os.path.join(HERE, 'ref-meadow.png')))
        contents[0] += ' Use the attached image only as a style reference (painting technique, softness, palette); do not copy its composition.'
    for attempt in range(3):
        try:
            r = client.models.generate_content(
                model=MODEL, contents=contents,
                config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'],
                                                   image_config=types.ImageConfig(aspect_ratio=ratio, image_size=size)))
            for p in r.parts or []:
                if p.inline_data:
                    p.as_image().save(out)
                    return f'ok {sid}'
        except Exception as e:  # noqa: BLE001
            err = str(e)[:160]
            print('retry', sid, err, flush=True)
    return f'FAIL {sid}'


if __name__ == '__main__':
    ids = sys.argv[1:] or list(SPECS)
    json.dump({k: v[3] for k, v in SPECS.items()}, open(os.path.join(HERE, 'prompts.json'), 'w'), indent=1)
    with cf.ThreadPoolExecutor(6) as ex:
        for res in ex.map(gen, ids):
            print(res, flush=True)
