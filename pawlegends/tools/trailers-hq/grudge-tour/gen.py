"""Gemini frames for Grudge Tour. usage: uv run --with google-genai --with pillow python -I gen.py <name> <aspect> [extra refs...]
Reads prompts from PROMPTS; refs from ../refs. Writes ../gem/<name>-<aspect>.jpg. Never prints the key."""
import os, sys
from google import genai
from google.genai import types
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REFS = os.path.join(HERE, '..', 'refs')
OUT = os.path.join(HERE, '..', 'gem')

STYLE = ("Style: Paw Legends brand v6 'Lightning Rivalry': bold painted comic-book illustration, thick clean ink outlines, "
         "cel shading with soft painted gradients, halftone dot texture in the backgrounds, saturated colours. Palette: hot magenta/pink "
         "for the cats' side, electric sky blue for the dogs' side, a bolt-yellow lightning bolt as the divider and accent, deep plum night "
         "(#2a1240) as the base. Cute chunky toy-like chibi champions exactly matching the reference renders (same coats, colours, accessories, "
         "proportions). Absolutely NO text, NO letters, NO numbers, NO logos, NO watermarks, NO speech bubbles anywhere in the image.")

PROMPTS = {
    'atlas': ("A painted fantasy 'world atlas' seen from high above: six small floating island-maps on a calm deep plum night sea with soft "
              "halftone waves and tiny stars reflected. Each island is a toy-like MOBA arena diorama: (1) a grassy football-style park with a "
              "centre circle and two small goals; (2) an autumn ridge with orange trees, a wooden fish mill and glowing paper lanterns; "
              "(3) a twin-tree thicket in pastel pink spring blossom with a small paw-print shrine; (4) a frosty snow-dusted crystal quarry with "
              "glowing purple geodes; (5) a summer green river crossing with a wooden bridge; (6) the largest island, a big autumn forest "
              "with three lanes and a jungle pit. Islands are spread evenly with plenty of empty sea between them, the left side "
              "faintly lit magenta, the right side faintly lit blue. Painted map-illustration look, gentle vignette, no characters, no ball, "
              "no route lines."),
    'chase': ("A wide comic splash panel: a giant bolt-yellow yarn ball bounces across the top centre of the frame, and a huge crowd of "
              "cute chibi cat champions (left half, magenta halftone background) and dog champions (right half, electric blue halftone "
              "background) all leap and sprint after it from both sides, colliding comically in the middle. A jagged bolt-yellow lightning "
              "bolt runs diagonally down the centre dividing the two sides. Lots of motion lines, dust puffs, paw prints. Use every character "
              "in the references exactly as rendered. Only cats and dogs from the references: no Santa hats, no holiday costumes, no extra characters, no jersey numbers, no digits anywhere."),
    'endposter': ("Epic but funny face-off poster: on the left the chubby orange cat champion Meatball (a hot-dog bun body, headband) wearing a "
                  "generic, unbranded retro diner crew outfit (plain red-and-cream shirt, a plain paper cap with a tiny paw-print badge, a headset), no fast-food logos, no letters, no arches, on the right the bulldog knight champion Sir Brutus in a gold chairman/boardroom style "
                  "armour, nose to nose, glaring, between them on the ground a big glowing bolt-yellow yarn ball. Magenta halftone sky behind "
                  "Meatball, electric blue halftone sky with lightning behind Sir Brutus, a big jagged bolt-yellow lightning bolt splitting the "
                  "frame vertically behind them. Keep the lower third and the area just above their heads calm and uncluttered (space for a "
                  "logo to be added later). Characters exactly match the references."),
    'truce': ("Comic panel: cats and dogs standing back to back and shoulder to shoulder in a heroic line, all facing a huge cute round "
              "jelly-like monster in the background under glowing orange paper lanterns at night on an autumn ridge. Cats glow with a magenta "
              "rim light, dogs with a blue rim light, the two rims meeting in the middle in bolt yellow. Determined, funny expressions. "
              "Characters exactly match the references."),
    'pudding': ("Comic panel at night: a huge cute caramel custard pudding monster (a giant flan: golden-yellow custard body, glossy dark caramel top dripping down, a red cherry on top, exactly like the in-game Pudding reference image, given a cute face) "
                "waking up inside a wooden fish-mill pit lit by glowing orange paper lanterns on an autumn ridge, one big sleepy eye opening "
                "with a bolt-yellow glint, and a bolt-yellow yarn ball stuck in its mouth, cheeks bulging. Plum night sky with halftone, "
                "a few tiny silhouettes of cats and dogs at the rim, shocked."),
}

REFSETS = {
    'atlas': ['arenas-wide.jpg'],
    'chase': ['comic-clash-wide.jpg', 'truce-16x9.jpg', 'captains-lambo-vs-sir-brutus-wide.jpg'],
    'endposter': ['captains-lambo-vs-sir-brutus-wide.jpg', 'meatball.png', 'brutus.png'],
    'truce': ['pudding-panel.jpg', 'pudding-ingame.jpg', 'comic-clash-wide.jpg', 'clem.png', 'ziggy.png', 'duchess.png', 'brutus.png', 'nugget.png', 'howler.png'],
    'pudding': ['pudding-ingame.jpg', 'comic-clash-wide.jpg'],
}

name, aspect = sys.argv[1], sys.argv[2]
extra = sys.argv[3:]
client = genai.Client(api_key=os.environ['GEMINI_API_KEY'], http_options={'api_version': 'v1beta'})
imgs = [Image.open(os.path.join(REFS, r)) for r in REFSETS[name]] + [Image.open(p) for p in extra]
prompt = PROMPTS[name] + ' ' + STYLE + (' Composition: tall vertical 9:16 frame, subjects stacked/centred for a phone screen.' if aspect == '9:16' else '')
resp = client.models.generate_content(
    model='gemini-3-pro-image-preview',
    contents=[prompt, *imgs],
    config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'], image_config=types.ImageConfig(aspect_ratio=aspect, image_size='4K')),
)
os.makedirs(OUT, exist_ok=True)
n = 0
for part in resp.parts:
    if part.inline_data:
        out = os.path.join(OUT, f"{name}-{aspect.replace(':', 'x')}.jpg")
        part.as_image().save(out)
        print(out)
        n += 1
if not n:
    print('no image', [p.text for p in resp.parts if p.text])
    sys.exit(1)
