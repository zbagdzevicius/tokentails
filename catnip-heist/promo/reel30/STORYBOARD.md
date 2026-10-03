# CATNIP HEIST — 30 s showreel storyboard

**Spec:** 1920x1080, 60 fps, 30.000 s (1800 frames). 128 BPM, so beat = 0.46875 s and bar = 1.875 s.
The reel runs 16 bars in 8 scenes, 2 bars each. Every time below is absolute seconds and comes from
`assets/audio/cues.json`. Global beat `bN` is at `N × 0.46875`.

**Story in one line:** a Kibble Corp security feed boots, two cats break in, eight heists fire past
on the beat, then a crate opens and the game cat becomes a real shelter cat. The real community shows
up, and every rescue treat goes into a public, on-chain ledger. It ends on a logo slam and "play now".

---

## 0. Rules (every scene)

### Truth

- Every on-screen string is listed in **§10 Copy register**, with its source. Nothing else goes on screen.
- **Never name a chain, ticker, wallet brand or exchange.** `E.BANNED_WORDS` enforces this, and
  renders run with `--strict`.
- **Say "on-chain" only the way the game says it:** payouts and treats are public and on-chain, and
  they **open soon / land soon**.
  - Never say a rescue itself is recorded on-chain.
  - Never say anything has already been sent.
  - Never show an amount: no "0.01", no "90", no goal, no "0 / 90".
- **Decorative ledger graphics carry no amounts and no "sent", "paid" or "confirmed" wording.**
  - Hashes from `hexStr` / `shortHash` are visual texture only.
  - Receipt and block stamps say `OPENS SOON` or `PUBLIC, ON-CHAIN`, never `PAID`.
- **Shelter names stay apart from cat footage.** Do not caption the Paris cats or the in-game rescued
  cats with the three shelter names. The landing line "Cats in the game come from …" goes on its own
  graphic card (s5 b36), not over a specific cat.
- **Don't name the hero cats.** The sprite ids `albertino` and `oreo` are asset names, not copy.
- **Never draw the `sei` cat sprite.** Its id is a chain name. Never draw the `icons.base` icon either.

### Footage hygiene

- **`paris-crew`:** always `crop: [0, 0, 1, 0.58]`, or mask everything below y = 0.58. The partner
  badge row sits at y 430–560 of 720.
- **`paris-cat-lounge`:** never sample past file 0032.
- **`reel-game-night`:** the projector shows a partner-logo mark top-left and a badge bottom-right,
  and both pan with the camera. Add these to that clip's `community.json` entry:
  - `"redact":[{"rect":[0.34,0,0.28,0.17],"mode":"pixelate","cell":16},{"rect":[0.83,0.21,0.17,0.23],"mode":"pixelate","cell":16}]`
  - Never draw this clip taller than 320 px, and never zoom into the screen. The title
    "TOKEN TAILS GAME NIGHT" stays clear of both rects; check frames 0, 42 and 83.
- **`reel-cat-plays-tablet`:** this is the old app UI and carries "BUY PACKS" small print. Use it only
  as a tile of 300 px or less, frames 0035–0060 (the "MY PETS" grid and the paw swipe).
- **On-chain captures** (`oc-*`, `stills/oc-*`): tickers and addresses are already blurred. Never
  scale a goal or progress row ("Goal …", "0 / 90 …", "EACH TREAT …") past 0.5x of its captured
  size. Prefer crops that leave those rows out (the crops are listed in §7).
- **Gameplay frames vs community frames:** gameplay frames are **1-based** (`0001.jpg`), so
  clipTime = (n−1)/30. Community frames are **0-based** (`0000.jpg`), so clipTime = n/30. Check
  that `E.clipFrameTime` handles community clips the same way before relying on it.

### Craft

- **Something moves on every cue in this board.**
  - Kicks get a scale pulse of +1.5 % on the active layer (`pulse`, decay 0.10).
  - Snares and claps get a 2–4 px chromatic split (`rgbSplit`) for 2 frames.
- **No dead frames.** Every hold drifts: either a 1–3 % push or parallax between at least two layers.
- **Easing vocabulary:**
  - Entrances: `anticipate` / `backOut(1.9)` (pull back 6 %, then overshoot 8 %).
  - Text hits: `elasticOut(1, 0.35)`.
  - Whips: `snap`.
  - Exits: `expoIn`, 6–8 frames.
  - Smear: 2-frame `smear` (samples 6) on any move faster than 1500 px/s.
- **Camera shake** is reserved for impact cues, with `shake` amplitude = 14 × the cue's `strength`
  and a decay of 0.18 s. The one exception is the s8 logo slam, which gets 28 px.
- **Pixel art stays crisp.**
  - Sprites, the catnip sprig, the heart and the paw are drawn with `pixel: true` at integer scales
    (4x, 6x, 8x, 12x).
  - Gameplay captures may be smoothed, since they are 3D renders. Never draw a gameplay clip below
    0.25x.
- **Finish pass** (`fx`), applied in every scene:
  - `grain` 0.035
  - `vignette` 0.35
  - light leaks: additive radial gradients in `pink` / `coin` that drift with `perlin1`, at about 8 %
    opacity, peaking on impacts
  - motion blur on in s2, s3, s4 and s8 (`fx().motionBlur`, 4 subsamples)
- **Type system:**

  | Role | Font | Treatment |
  |---|---|---|
  | Headlines | **Cat Paw** (the game font), all caps | `cream` fill, `outline` 6 px stroke, hard `plum` drop 0 / 10 px |
  | Numbers | **Passion One** | |
  | Small print and footnotes | **Nunito** 800 | |

  If Cat Paw is missing the glyphs Ž or Ė, fall back to Passion One for the line
  "ROŽINĖ PĖDUTĖ". Test this first.
- **Palette** (from `sprites.json`):
  - Base: `night` / `plum` / `grape`
  - Accents: `coin` (gold) for wins and stars; `catnip` / `catnipGlow` / `lavender` for catnip;
    `pink` and `rescueFlash` for rescue and heart; `conePatrol` → `coneAlert` → `alertRed` for danger
  - On-chain section: `mint` + `sky` on `night`, with gold `coin` for the light packets

---

## 1. s1 — COLD OPEN: "security boot" (0.000–3.750, b0–b7)

**Look:** a Kibble Corp CCTV wall. Everything is seen through the dogs' cameras, so the cats are the
intruders. `crt()` with scan 0.25, roll and flicker, a teal-green tint, a REC dot, and a running
timecode in Nunito (`CAM 01 · 00:00:00:00`, counting frames). The music is a sub drone with glitches.

| t | cue | Picture | Asset (files) | Type | Motion |
|---|---|---|---|---|---|
| 0.000 | boot-sting, clock-ticks | Black. One horizontal CRT line snaps open to full height. | — | — | Line scaleY 0.004 → 1 over 7 frames (`expoOut`), with a white bloom. |
| 0.280, 0.400 | rec-beep ×2 | REC dot blinks red twice. Timecode starts. | — | `REC` (Nunito 800, `alertRed`) | Dot scale 0 → 1, `punch`. |
| 0.469 | glitch + title | **4 CCTV monitors in a 2x2 grid**, each a different feed with a 4 px bezel. Feeds are 30 % desaturated and green-tinted. | TL `h08-establish` 0001→0040 · TR `h05-coin-run` 0001→ (turning sentries) · BL `h06-sneak-corridor` 0040→ · BR `h02-meow-lure` 0001→0030 | Centred across the grid: `KIBBLE CORP // RESTRICTED` (Cat Paw, 64 px, `alertRed` on a black bar) | Text decodes with `scramble` over 10 frames. Each monitor turns on one after another (2-frame stagger): white flash, then the image. Glitch slices on 4 frames. |
| 0.586, 0.820 | glitch | Random monitor tears. | — | — | `glitch` (slices 6, maxShift 40) for 2 frames per hit. |
| 0.703 | scan-sweep | A gold scanline sweeps the grid top to bottom. Every guard cone it crosses gets a vector outline overlay. | — | — | Sweep 0.4 s, `sineInOut`. |
| 1.406 | glitch | Wall tears. | — | — | — |
| **1.875** | **impact "SECURITY ONLINE"** (0.4), riser start | The 2x2 grid **slams** into one full-frame feed of TL (the HQ map) and keeps pushing in. Vector **vision cones** (`cone()` in `conePatrol`, 35 % alpha) sweep over the 5 dogs, synced to the footage. | `h08-establish` 0040→0090 | `SECURITY ONLINE` (Nunito 800, 28 px, `mint`, top left) with a blinking caret | Monitor bezels scale 2.2 → 1, `expoIn`, 6 frames. Shake 6 px. Cones rotate on `perlin1`. |
| 2.344 | scan-sweep | A second sweep, now **reverse-coloured**. A "MOTION DETECTED" box (`coneAlert` dashed rect) locks onto a moving cat. | same | `MOTION DETECTED` (Nunito 800, 22 px) | Box draws its corners in (`expoOut`, 8 frames), then tracks the cat. |
| 2.578, 2.930 | glitch | — | — | — | — |
| **2.813** | **alert** | **Red alert frame** from the game. | `h02-spotted` 0104–0106 | `!` (Cat Paw, 320 px, `alertRed`, white stroke) | Cut on the cue. The `alertFlash` overlay flashes at 60 % opacity. The "!" scales 3 → 1 with `backOut`. Shake 8 px. |
| **3.047** | **alert** | Second stab: a zoom-punch into the red cone. | `h02-spotted` 0108–0115 | `!` doubles, offset by +20 px | Zoom 1 → 1.25, `snap`. `rgbSplit` 6 px. |
| 3.28–3.75 | snare fill, volume dip | **Blackout.** On the 4 snare-fill hits a sprite cat's eyes blink in the dark: two `catnipGlow` pixel squares. | hero cat sprite `oreo` IDLE f0, black on black, 12x scale | — | Eye pairs pop (4 frames) on each fill hit, closer each time: scale 6x → 8x → 10x → 12x. The CRT image collapses to a dot 2 frames before 3.75. |

**→ s2 transition (3.750):** a white frame for one frame, then a hard cut. `zoomBlur`
(strength 0.35, 4 frames) out of the screen centre, where the cat's eyes were. The cat eyes
**match-cut** into the two hero cats' positions in s2.

---

## 2. s2 — THE CREW / HEIST INTRO (3.750–7.500, b8–b15)

**Look:** full colour, saturated night purple. Diagonal panel cuts (`slices`) at 12°. This is the
"verbs" section, showing what you do in the game. Each verb is one Cat Paw word that stamps onto a
gameplay beat.

| t | cue | Picture | Asset (files) | Type | Motion |
|---|---|---|---|---|---|
| **3.750** | **HEIST DROP impact** (1.4), whooshes | **Split screen, two cats:** two diagonal panels slam in from the left and right. Each panel holds one hero cat sprite (WALKING, 12x, pixel-crisp) on a `grape` → `plum` gradient with speed lines. | sprites `albertino`, `oreo` (RUNNING row, `spriteFrame` at 12 fps) | `TWO CATS.` (Cat Paw, 150 px) hits centre | Panels: `anticipate` from ±1100 px over 10 frames. Smear on the panels. Shockwave ring (`pink`) from centre. Shake 20 px. Text `elasticOut`, scale 1.6 → 1. |
| 4.219 | kick | The panels split to reveal gameplay underneath, with the camera following a cat. | `h01-plate-swap` 0001→0019 (speed 1.25) | `TWO CATS.` exits as `ONE HEIST.` | Text roll: the old word slides up −120 px (`expoIn`, 6 frames) and the new one slides in from +120 (`backOut`). |
| **4.688** | **callout SWAP**, swap-blip, panel-cut whoosh | The **SWAP moment**: the game camera glides to the other cat and a gold ring pulses. We freeze-frame it, then a gold ring echo (`shockwave` in `coin`) expands from the second cat. | `h01-plate-swap` 0019 (swap) → 0030 | `SWAP` (Cat Paw, 260 px, `coin`) with the letters in a 2-frame stagger | Whip-pan between the cat positions: horizontal `dirBlur` 60 px over 4 frames. Squash-stretch on the letters (`squash`). |
| 5.156 | kick | A diagonal wipe to the sneak shot. | `h06-sneak-corridor` 0060→0090 | `SNEAK` (outlined, hollow stroke only, `lavender`) | The word slides through the frame, tracking the cat (parallax 1.3x against the footage). |
| **5.625** | **callout MEOW**, meow, shockwave (0.15) | The **MEOW lure**: meow rings expand from the black cat, and the doorman gets a "?" and walks away. We add our own `meowRing` shockwaves (3 rings, gap 0.08) over the game's rings. | `h02-meow-lure` 0043 (meow) → 0070 | `MEOW` (Cat Paw, 220 px, `meowRing` pink) | The text pulses outward with the rings, `elasticOut`. Shake 4 px. Footage zoom 1.15 → 1.0. |
| **6.094** | **door-clunk** | Hard cut: the **vault door opens** with the key. | `h08-vault-rescue` 0016 → 0030 | `CRACK THE VAULT` (Cat Paw, 120 px). "VAULT" is `coin` gold. | On the clunk: 3-frame zoom punch 1.08 → 1 (`punch`), plus gold dust `burst` from the door. |
| **6.5625** | **riser start** | **Catnip run:** catnip pickups from the game. Each pickup spawns a pixel **catnip sprig** sprite (current asset `catnip`, 6x) that flies in an arc (`arcTo`) into a counter in the top-right corner. | `h05-coin-run` 0064 → 0090 (pickups at 0064 and 0082, speed 1.4) | `COLLECT CATNIP` (Cat Paw, 110 px, `catnip` fill, `catnipDeep` stroke) | Sprigs spin as they fly. The counter ticks with a scale pulse on each arrival. The riser builds the zoom: 1.0 → 1.35 with radial `speedLines` growing. |
| 7.031 | kick (riser apex) | One frame of **red alert**: a "don't get spotted" warning. | `h02-spotted` 0104 | `DON'T GET SPOTTED` (Nunito 800, 40 px, `alertRed`) flashes for 6 frames | `alertFlash` at 40 %. `glitch`. |
| 7.20–7.5 | riser end | Everything is pulled into a thin **diagonal slit** at 12°. | — | — | The slit closes over 8 frames (`expoIn`), with smear. Light leak flare at 7.45. |

**→ s3 transition (7.500):** the slit **reopens** as the first level panel. One continuous diagonal
gesture carries s2 into s3.

---

## 3. s3 — LEVEL ROLL-CALL 01–04 (7.500–11.250, b16–b23)

**Grammar:** each level gets exactly **2 beats** (0.9375 s), split into an **A beat** and a **B beat**.

**A beat (on the `level-hit`):** the level's wide map shot is revealed through a diagonal slice wipe,
slanting left in s3.

- **Footage:** `lvl-0N`, frames 0001→0056 at speed 2, so the full push-in fits the 2 beats.
- **Level number:** Passion One at 360 px, outlined. It stamps in with `backOut(2.2)` from scale 2.4
  and sits behind the level name, on a parallax layer at 0.6x.
- **Level name:** Cat Paw at 96 px. It decodes with `scramble` in 8 frames.
- **Mechanic tag:** Nunito 800 at 28 px in `lavender`, typed with `typewriter`.
- **Stars:** a chip with three gold stars (`star()` in `coin`) pops in, one per 3 frames. They echo
  the 24/24 stars on the level-select screen.
- **Progress rail:** a thin bar at the top shows `HEIST N / 8`. Eight pip segments fill one at a time.

**B beat (the off-half):** a punch-in insert of that level's signature mechanic, 0.47 s long,
inside a rounded "picture-in-picture" card (radius 24, `coin` 4 px rim). The card slides in from the
opposite edge and tilts 4°. The wide shot behind it keeps pushing in, blurred and darkened 30 %.

| t | cue | Level (number · name) | A beat: wide shot | B beat: insert (files) | Mechanic tag | Extra |
|---|---|---|---|---|---|---|
| **7.500** | level-hit 1 (1.14), whoosh, riser end | `01` **KIBBLE CORP WAREHOUSE** | `lvl-01` | `h01-plate-swap` 0016→0030 (plate, then swap) | `MOVE · SNEAK · SWAP · PLATE DOORS` | Heavier hit: shake 16 px, white flash at 25 %, plus a shockwave. At **7.734** (coin fx) a catnip sprig pops from the map and flies to the corner counter (from s2). |
| **8.4375** | level-hit 2 | `02` **KENNEL ROW** | `lvl-02` | `h02-meow-lure` 0043→0057 (meow, then the doorman leaves) | `MEOW TO LURE THE DOORMAN` | The insert card has a pink meow ring around it. |
| **9.375** | level-hit 3 | `03` **TWIN LOCKS** | `lvl-03` | `h03-twin-locks` 0015→0029 (plate f15, swap f18) | `CHAINED PLATE DOORS` | The insert splits into two half-cards, one per cat, that slide past each other at swap f18 (the 9.84 s mark). |
| **10.3125** | level-hit 4 | `04` **COUNTING HOUSE** | `lvl-04` | `h04-key-doors` 0096→0110 (key pickup at f103, gold burst) | `KEY + VAULT` | The key pickup frame lands on b22.5 (10.78): a gold `burst` of 24 particles plus a 3-frame zoom punch. |

- **Wipe direction:** the diagonal wipe alternates direction per level: 01 left-to-right, 02
  right-to-left, and so on. Whoosh smear runs along the wipe edge.
- **Level text exit:** level text exits upward with `expoIn` 4 frames before the next level-hit.
  Never leave a blank frame between levels.

**→ s4 (11.250):** no break. The wipe **slant flips** to the opposite angle (−12°) and the pip rail
jumps to segment 5. Footage speed rises (see s4), so the second half reads as faster.

---

## 4. s4 — LEVEL ROLL-CALL 05–08 + MOSAIC (11.250–15.000, b24–b31)

Same A/B grammar as s3, with these changes:

- **Tighter framing:** `zoom: 1.15` on the wide shots.
- **Pins:** each finished level shrinks into a **4x2 mosaic slot** that matches the level-select
  layout (`stills/level-select-all.jpg`). As each level leaves the full frame, its last frame scales
  to a tile (0.2x) and flies (`arcTo`) into its slot in a translucent grid along the bottom third.
- **Pre-fill:** levels 01–04 are already pinned in that grid at the start of s4, so it reads as
  progress.

| t | cue | Level | A beat: wide shot | B beat: insert (files) | Mechanic tag | Extra |
|---|---|---|---|---|---|---|
| **11.250** | level-hit 5 | `05` **WATCHTOWER YARD** | `lvl-05` | `h05-coin-run` 0124→0138 (pickup f124, turning sentries) | `SENTRIES THAT TURN ON A SCHEDULE` | At **11.484** (coin) a sprig flies to the counter. Vector cone overlay rotates with the sentries. |
| **12.1875** | level-hit 6 | `06` **CONVEYOR HALLS** | `lvl-06` | `h06-sneak-corridor` 0096→0110 (plate f96, swap f100) | `1-TILE CORRIDORS` | The insert card is extra wide (letterboxed 3.5:1) to emphasise the corridors. |
| **13.125** | level-hit 7 | `07` **SPLIT SHIFT** | `lvl-07` | `h07-split-shift` 0015→0029 (plate+door, swap f18) | `SPLIT UP: EACH WING OPENS THE OTHER` | The insert splits vertically into two wings. At swap f18 the split line flashes gold. |
| **14.0625** | **level-hit 8 (1.42)**, the hardest hit | `08` **KIBBLE CORP HQ** | `h08-establish` 0060→0120 (the 40x27 HQ map, five dogs) | No insert. Instead, the **mosaic flies back up**: all 7 pinned tiles orbit and zoom past camera (parallax depth by index), and 08 punches through full-frame. | `FINALE: ALL OF THE ABOVE` | Shake 22 px. `rgbZoom` 0.6. White flash at 35 %. The 8th star chip lands with `star-pop`-style sparkles. `8 HEISTS` (Passion One, 200 px) stamps over the "08" for the last 8 frames. |
| 14.53–15.0 | power-down sweep (whoosh 14.98) | **Power-down:** the HQ frame desaturates. A CRT collapse squeezes the image to a horizontal line, then to a single point. | — | — | — | The collapse runs on an `expoIn` curve. The point ends where the s5 crate will be (screen 0.5, 0.55). Audio and picture land together on 15.0. |

---

## 5. s5 — THE REAL MISSION: real shelter cats (15.000–18.750, b32–b39)

**Look:** the breakdown, intimate and warm, with half-speed footage.

- **No shake** in this section.
- **Heartbeats** drive everything. Each `heartbeat` cue is a **radial vignette pulse**: a pink
  inner-glow ring scaling 0.96 → 1.04 → 1, with a soft 2-stage beat.
- **Palette:** shifts from night purple to warm cream / pink.

| t | cue | Picture | Asset (files) | Type | Motion |
|---|---|---|---|---|---|
| **15.000** | THE REAL CATS impact (0.54), heartbeat 1, section | Out of the s4 point: an **iris opens** onto a tight close-up of the **crate**, with the shelter cat waiting inside. Footage plays at 0.5x. | `h01-rescue` 0014→0025, crop centred on the crate (fx ≈ 0.47, fy ≈ 0.6; verify on 0020), zoom 2.2 | `FREE THE SHELTER CAT` (Cat Paw, 96 px, `cream`, low third). The word "SHELTER" is in `pink`. | `iris` from r = 0 to full over 14 frames, `expoOut`. Slow 2 % push. Floating dust particles with parallax. |
| **15.469** | meow | **RESCUE:** the game's rescue flash tint, then the crate opens with a pink heart and confetti burst. We **amplify** the heart: the pixel `heart` sprite (12x, `pixel: true`) scales 0 → 1.4 → 1 with `elasticOut` and fills the centre. | `h01-rescue` 0026 (rescue) → 0034 (heart/confetti), at 0.75x | — | Our confetti `burst` (pink/cream/coin, 60 particles, gravity) layered over the game's. The heart beats on the heartbeat cue. |
| **15.9375** | heartbeat 2 | **MATCH CUT, game cat to real cat.** The pixel heart's centre becomes the **eye line of a real cat**. An iris *inside the heart shape* (`mask` with a heart path) reveals the real footage, and the heart grows until it is the full frame. | `community/paris-cat-leap` 0000→0024 (eye contact at 0000), at 0.9x | `CAT LOVERS,` (Cat Paw, 120 px) | The heart mask scales from 380 px to cover over 12 frames (`expoInOut`). The real cat's eyes sit where the heart centre was (offset the clip so the cat's face is at 0.5 / 0.45). |
| 16.406 | snare | Same shot. The second line lands. | (continues) | `MEET REAL SHELTER CATS.` (Cat Paw, 120 px, with "REAL" in `pink`) | Line 2 slides up from behind a mask line (`wipeText`). Line 1 nudges up by 1 line (`backOut`). |
| **16.875** | heartbeat 3 | **Card beat.** A warm `pink`→`plum` full-frame card wipes on (soft 30° wipe). Pixel paw prints walk across it in sequence. **No cat footage on this card** (see §0 Truth). | sprites `paw` (6x), `heart` | `CATS IN THE GAME COME FROM` (Nunito 800, 34 px), then below it **`MIL BIGOTES · PUPPY KITTY NYC · ROŽINĖ PĖDUTĖ`** (Cat Paw or Passion One fallback, 74 px) | Kicker types on. The 3 names stagger in with `backOut` (4-frame spread), and the separators pop as tiny hearts. Each paw print steps on a kick. |
| **17.8125** | heartbeat 4, riser start (into COMMUNITY) | The card wipes away to the **hero stare**: the real cat lifts its head and looks into the lens. | `community/paris-cat-lounge` 0014→0032 (stare lands on 0032 at about 18.42), at 1x. **Hold 0032; never sample past it.** | `READY TO PLAY.` / `READY TO SAVE.` (Cat Paw, 130 px, two lines; "SAVE" in `pink`) | Slow 4 % push to the cat's eyes. On the riser, light leaks swell and claps build. From 18.28 a white rim light grows around the frame edge. |
| 18.28–18.75 | riser + clap build | The stare frame **cracks into tiles**: a 4x3 grid that pre-echoes s6. On each clap one tile flips over (`squash` scaleX 1 → 0 → 1) to reveal a community frame. | flipped tiles show first frames of the s6 clips | — | Tiles flip in a radial order from the centre. The last flip lands on 18.75. |

---

## 6. s6 — COMMUNITY (18.750–22.500, b40–b47)

**Look:** the loudest, happiest section. Real footage, landing stats and crowd "hey" shouts. Each
"hey" lands one stat card.

- **Background:** every frame shows real people and cats. Clips play at 1x, with a 1 % push per beat.
- **Stat cards:** Passion One number at 240 px in `coin`, a Cat Paw label at 56 px, and an as-of
  footnote in Nunito 700 at 20 px and 70 % opacity, exactly as the landing shows it.
- **Count-ups:** each number counts up in 10 frames (`expoOut`, `quantize` to whole K), then holds on
  the exact string.

| t | cue | Picture | Asset (files) | Type | Motion |
|---|---|---|---|---|---|
| **18.750** | COMMUNITY LIFT impact (1.4), crowd-roar | The tile grid **explodes outward** (tiles fly off with spin and smear) to reveal the Paris crew with heart hands, full frame. | `community/paris-crew` 0020→0044, **crop `[0, 0, 1, 0.58]`** | `OUR COMMUNITY` (Cat Paw, 150 px, `cream`; "COMMUNITY" scales 1.8 → 1 with `elasticOut`) | Shake 18 px. Shockwave ring (`coin`). Confetti stream from the bottom edge. |
| **19.219** | crowd-hey 1 | The frame splits into a 2-panel. Left: guests playing on their phones. Right: stat card 1. | `community/paris-phones-play` 0030→0060 | **`540K+`** / `REGISTERED PLAYERS` / footnote `All time · Apr 2026 · company-reported` | The card slams in from the right (`anticipate`, 8 frames). Number count-up. The panel divider is a 12° slant (the same angle as s2). |
| 19.688 | snare | A quick wipe to the café sign, which closes the Paris thread. | `community/paris-cafe-sign` 0010→0041 | `A DAY AT A PARIS CAT CAFÉ` (Nunito 800, 30 px, small kicker above the stat) | Sideways camera move in the clip, with our parallax layer counter-moving. |
| **20.156** | crowd-hey 2 | **Phone strip:** 4 generic phones scroll left (`reelStrip`, slight 8° tilt, glare 0.4), playing the 9:16 UGC reels. Stat card 2 sits on top. | `reelStrip` of `ugc-king-portrait` (0020→), `ugc-kitten-recommend` (0020→), `ugc-ceo-legends` (0040→), `ugc-king-portrait` (offset 0050) | **`180K+`** / `ON X` / footnote `Sep 2026` | Strip speed 420 px/s, eased up from 0 on the hey. Stat card pops with `backOut`. The burned-in captions on the UGC clips ("I RECOMMEND / TOKEN TAILS", "TOKENTAILS.COM") stay readable. |
| 20.625 | snare | The strip continues. A kinetic line passes over it. | — | `CAT INFLUENCERS + CREATORS` (Cat Paw, 80 px) | `wipeText` left to right, then out to the right. |
| **21.094** | crowd-hey 3 | **Tile wall** of 6 square tiles in a 3x2 grid, 300 px each, 16 px gutters, all playing. | `reel-tuxedo-characters` 0045→ (caption "We're characters in the game Token Tails!") · `reel-game-night` 0030→ (**redacted**, ≤ 300 px) · `reel-cat-plays-tablet` 0035→0060 · `paris-cat-lounge` 0000→0020 · `ugc-kitten-recommend` 0030→ (cover crop on the face + kitten) · `paris-chat` 0030→ | **`40`** / `INFLUENCER CATS` / footnote `Apr 2026 · company-reported` | Tiles drop in one after another (`backOut`, 2-frame stagger, from y −80). Grain is boosted on the soft 360 px reels. The stat card sits in the centre slot, so the wall wraps around the number. |
| **21.5625** | riser start (into ON-CHAIN), glitch stutters | The wall **zooms out** and multiplies into a 6x4 grid of tiles. Each tile's border turns `mint`. | same tiles plus repeats with offsets | — | Grid builds with a radial stagger. Camera pulls back 1 → 0.6 (`expoInOut`). |
| **22.031** | crowd-hey 4 | The tiles start **quantising**: `pixelate` grows 1 → 24 px per tile, and their colours flatten toward `night` / `mint`. | — | — | Stutter hold at 12 fps (`stutter`) to sync with the riser's glitch stutters. |
| 22.27, 22.38 | glitch ×2 | `glitch` on the whole grid. A hex texture (`hexStr`) bleeds into the tile faces. | — | — | 2 frames each, plus `rgbSplit` 8 px. |

**→ s7 transition (22.500), a match cut from tiles to blocks:** each flat pixelated tile becomes the
front face of an **isometric block** (`isoBlock`). The grid tilts into isometric space over the last
6 frames, so the community wall literally becomes the ledger.

---

## 7. s7 — THE ON-CHAIN MISSION (22.500–26.250, b48–b55)

**Look:** digital, precise, cool `night` / `mint` / `sky` with gold light packets.

- **Background:** a `hashStream` falls behind everything (alpha 0.18, `mint`). `scanlines` sits at
  0.06 alpha.
- **Blocks:** one `block` cue per beat (#1–#8) means **one block lands per beat**. `blockChain`
  builds left to right along a gentle diagonal, and the camera trucks right to follow the newest
  block.
- **Linking:** each new block **links** to the previous one with `chainLink` (links: 3) the moment it
  lands, and a gold packet (`pulse`) runs along the link on the off-beat `coin` cue.
- **Block cards** hold real game and site captures as their screens, plus a short label from the
  game's own copy.
- **No amounts anywhere.** Card `rows` use only `[["SHELTER","PINK PAW"],["STATUS","OPENS SOON"]]`.
  Use `shortHash` texture for the `hash` / `prev` fields. The `verified` checkmark animation is
  allowed only on block #8, and only as the "public" tick (see #8).

| t | cue | Block | Card screen (asset, files) | Type on/under block | Motion |
|---|---|---|---|---|---|
| **22.500** | ON-CHAIN impact (1.23), block #1, data-ticks | Title slam first. **`PUBLIC, ON-CHAIN`** decodes out of hex (`hashResolve`) across centre, then shrinks to a pill that docks top-left for the rest of s7. Block #1 drops in. | Block #1: `h05-rescue-exit` 0030→0045 (rescue of Juniper at f34, cover-crop on the crate) | Pill: `PUBLIC, ON-CHAIN`. Under block #1: `1 · FREE THE SHELTER CAT IN A HEIST.` | `hashResolve` over 12 frames. The pill docks with `expoInOut`. The block lands with squash (`isoBlock` p curve). Shake 12 px. |
| 22.734 | coin | A packet runs out of block #1. | — | — | Gold `pulse` on the outgoing link stub. |
| **22.969** | block #2 | Block #2 links on. | `oc-results-rescue` 0002→0040 ("HEIST COMPLETE!" card slides in, the "You rescued Juniper!" row fills, three stars pop), cover-crop on the card's top half `crop [0.38, 0.05, 0.24, 0.5]` (verify) | `HEIST COMPLETE!` echoed small in `coin` (Cat Paw, 40 px) | The card's star pops are re-timed so star 3 lands on the beat. |
| 23.203 | coin | Packet #1 → #2. | — | — | — |
| **23.438** | block #3 | Block #3. | `stills/oc-web-give-top.jpg` crop on "JUNIPER IS SAFE! / SEND A TREAT TO PINK PAW (ROŽINĖ PĖDUTĖ)" (top band only, above the "EACH TREAT" box) | `2 · TAP THE RESCUE TREAT.` then, smaller (Nunito 800, 26 px): `Token Tails sends Pink Paw a small treat.` | Line 1 `wipeText`, line 2 `typewriter`. |
| 23.672 | coin | Packet #2 → #3. | — | — | — |
| **23.906** | block #4 | Block #4. | `oc-payouts-open` 0001→0060 (static modal; we animate its pop-in ourselves: `backOut` scale 0.85 → 1 plus fade, 10 frames), crop on the "HOW IT WORKS" box | `3 · EVERY PAYOUT SHOWS UP, WITH A LINK TO CHECK IT ON THE CHAIN.` (two lines, Cat Paw, 54 px) | Biggest text card of the section. A `receiptCard` prints down beside the block, titled `SENT TO SHELTERS`, with stamp **`OPENS SOON`** in `coin` and stamp-p on the next kick. **No lines and no total** on the receipt: just the hash texture and barcode. |
| 24.141, 24.258 | coin, glitch | Packet #3 → #4. A small glitch tears the hash stream. | — | — | — |
| **24.375** | block #5 | Block #5. The camera starts pulling back to show the chain growing. | `stills/oc-payouts-modal.jpg` crop on the **SHOWCASE SHELTER** card's title rows only ("SHOWCASE SHELTER / PINK PAW (ROŽINĖ PĖDUTĖ)"), **excluding the Goal line** | `SHOWCASE SHELTER: PINK PAW` | Pull-back 1.0 → 0.8 over the next 4 beats. |
| 24.609 | coin | Packet. | — | — | — |
| **24.844** | block #6 | Block #6. | `oc-web-payouts` 0040→0090 (eased scroll to "WHERE YOUR TREATS LAND FIRST."), crop on the heading plus the paragraph | `DONATIONS ARE SPLIT ON-CHAIN, AND EVERY PAYOUT IS PUBLIC.` | — |
| 25.078, 25.195 | coin, glitch | Packet. Glitch. | — | — | — |
| **25.3125** | block #7, riser start (into LOGO SLAM), snare roll | Block #7. | `stills/oc-web-payouts-top.jpg` crop on "LIVE FROM THE CHAIN / SHELTER PAYOUTS / First payout soon" | `READ LIVE FROM THE CHAIN, NOT FROM OUR SERVERS.` | The riser speeds up the truck. Packets now run continuously, with `stream` sparks off the links. |
| **25.781** | block #8 | **Block #8, the honesty beat.** It lands and a `checkmark` sweeps on its face in `mint` with a ring. Then the whole chain lights up as one gold packet races from #1 to #8. | `oc-payouts-open` (the glowing "First payouts land soon" header, crop top band) | **`FIRST PAYOUTS LAND SOON`** (Cat Paw, 110 px, `coin` glow) | The camera pulls back fully so the 8-block chain fills the frame. In the last 6 frames before 26.25 every block **collapses along the chain** into block #8 (`expoIn`), a gravity-well implosion with smear and `zoomBlur` into the centre. |

Wording note: the user asked for "every rescue tracked on-chain". The game does not say that. It says
payouts and treats are public, on-chain and checkable "on the chain", and that they **open soon**.
The board uses only that wording.

**→ s8 transition (26.250):** the imploded block #8 **cracks open**. It splits into 4 iso faces that
fly out, and the Token Tails logo appears from inside. One frame of white, then the logo slam.

---

## 8. s8 — LOGO SLAM + CTA (26.250–30.000, b56–b63)

**Look:** the payoff. The background is the HQ win celebration (`h03-rescue-exit` 0054→0120,
confetti fountain plus rings), blurred 18 px and darkened 50 %, drifting slowly. Over it: a radial
`speedLines` burst, light leaks and full chromatic aberration on the slam.

| t | cue | Picture | Asset | Type | Motion |
|---|---|---|---|---|---|
| **26.250** | **LOGO SLAM (2.64)**, coin, whoosh | **Logo slam.** `logo` (Token Tails, pixel-crisp) slams from scale 3.2 to 1, with **`CATNIP HEIST`** below it in Cat Paw at 210 px. Two lines; "CATNIP" in `catnip` / `catnipDeep`, "HEIST" in `coin`. | `images.logo` (pixel: true, integer scale 2x) | `CATNIP HEIST` | `anticipate`, then `backOut(2.4)`, 9 frames, with a 2-frame smear. Shake **28 px**. `rgbSplit` 14 → 0 over 12 frames. Triple shockwave (`cream`, `pink`, `coin`). White flash 50 %. |
| 26.367 → 27.070 | coin ×7 (8 with 26.25) | **8 catnip sprigs** (current `catnip` asset, 6x) burst out of the logo on ballistic arcs and land in a halo around the title, one per coin cue. | `images.catnip` | — | `burst` with each sprig assigned to its own coin time. A sparkle `star` appears on each landing. The title letters bob ±4 px on `pulse`. |
| **27.1875** | **PLAY NOW / call to action**, star-pop | The title moves up 18 %. The CTA pill slams in below: a `coin`-gold pill with an `outline` stroke and a sheen sweep. | — | **`PLAY CATNIP HEIST NOW`** (Cat Paw, 84 px) / under the pill: `NO SIGN-UP` (Nunito 800, 30 px) | Pill scale 0 → 1, `elasticOut`. Sheen sweeps on the next beat. |
| 27.188, 27.422, 27.656 | star-pop ×3 | **Three gold stars** pop above the title, like the win screen. | `star()` in `coin` with `outline` | — | Each star: scale 0 → 1.3 → 1 (`backOut`), 20° spin, sparkle burst. |
| **27.773** | meow | A hero cat sprite **hops up** from the bottom edge beside the pill. It stops, then a `meowRing` pulses. | `oreo` JUMPING → SITTING (12x, pixel-crisp) | — | Ballistic hop with squash on landing. Meow ring: 2 rings. |
| **28.125** | **FINAL HIT (1.98)** | **Final lock-up:** the URL stamps under the pill. A second, smaller **`PLAY TO SAVE.`** in `pink` sits under the URL. The heart sprite beats once. | `images.heart` (4x) | **`TOKENTAILS.COM/HEIST`** (Passion One, 64 px, `cream`) / **`PLAY TO SAVE.`** (Cat Paw, 48 px, `pink`) | Stamp: scale 1.4 → 1, `punch`. Shake 16 px. Final shockwave. |
| 28.59–29.5 | tail | **Living hold.** Slow 3 % push on the lock-up. Catnip sprigs sway (`perlin1` rotation ±6°). Confetti drifts down. Light leaks breathe. | — | — | Everything keeps moving. There is no static frame. |
| 29.5–30.0 | audio fade (1.1 s cosine fade, ends at 0) | The image fades to `night` → black along a cosine curve that matches the audio. The last 3 frames are black with a few catnip-glow motes. | — | — | `flash` black, alpha = 1 − cos curve. |

---

## 9. Transition chain (summary)

| Cut | t | Device |
|---|---|---|
| s1 → s2 | 3.750 | CRT dot, 1 white frame, zoom-blur. The cat eyes in the dark **match-cut** to the two hero cats. |
| s2 → s3 | 7.500 | The diagonal slit closes on the riser and reopens as the heist-01 slice wipe (12°). |
| s3 → s4 | 11.250 | The wipe slant flips to −12°, the pip rail reaches 5, and the pace goes up. |
| s4 → s5 | 15.000 | Power-down: CRT collapse to a point, which becomes the **iris onto the crate**. |
| s5 internal | 15.9375 | **Pixel heart → real cat's eyes** (heart-shaped mask iris). This is the hero match cut. |
| s5 → s6 | 18.750 | The stare frame cracks into a tile grid. Tiles flip on the claps, then explode outward. |
| s6 → s7 | 22.500 | Community tiles pixelate into **iso blocks** (tile → block match cut). |
| s7 → s8 | 26.250 | The chain implodes into block #8, which cracks open to release the logo. |

---

## 10. Copy register (every on-screen string and its source)

| Scene | On-screen text | Source / justification |
|---|---|---|
| s1 | `KIBBLE CORP // RESTRICTED`, `SECURITY ONLINE`, `MOTION DETECTED`, `REC`, `CAM 01 …`, `!` | In-game fiction flavour. Kibble Corp is the antagonist (`catnip-heist/README.md` line 4, level names). These are not factual claims. |
| s2 | `TWO CATS.` `ONE HEIST.` | README line 4 ("two cats you swap between"). |
| s2 | `SWAP` `SNEAK` `MEOW` `CRACK THE VAULT` `COLLECT CATNIP` `DON'T GET SPOTTED` | Mechanics in the README and the captured clips (swap, sneak, meow lure, key and vault, catnip pickups, spotted alert). |
| s3/s4 | Level numbers and names `KIBBLE CORP WAREHOUSE`, `KENNEL ROW`, `TWIN LOCKS`, `COUNTING HOUSE`, `WATCHTOWER YARD`, `CONVEYOR HALLS`, `SPLIT SHIFT`, `KIBBLE CORP HQ` | README level table (lines 84–91), `clips.json` `levelName`. |
| s3/s4 | Mechanic tags (`MOVE · SNEAK · SWAP · PLATE DOORS`, `MEOW TO LURE THE DOORMAN`, `CHAINED PLATE DOORS`, `KEY + VAULT`, `SENTRIES THAT TURN ON A SCHEDULE`, `1-TILE CORRIDORS`, `SPLIT UP: EACH WING OPENS THE OTHER`, `FINALE: ALL OF THE ABOVE`) | Shortened from the README level table "focus" column (also in the `clips.json` lvl-0N descriptions). |
| s3/s4 | `HEIST N / 8`, `8 HEISTS`, three stars per level | README: 8 heists. Stars: `stills/level-select-all.jpg` shows 24/24 (3 per level). |
| s5 | `FREE THE SHELTER CAT` | README line 4 ("free the shelter cat from its crate"). Also the payouts modal, step 1. |
| s5 | `CAT LOVERS,` `MEET REAL SHELTER CATS.` | Landing `client/components/landing/ProofSection.tsx` 249, over the Paris footage the landing pairs it with. |
| s5 | `CATS IN THE GAME COME FROM` / `MIL BIGOTES · PUPPY KITTY NYC · ROŽINĖ PĖDUTĖ` | Landing `ImpactGlobeSection.tsx` 66–75 (names from `client/public/impact/snapshot.json`). Shown on a neutral card, not over any specific cat. |
| s5 | `READY TO PLAY.` `READY TO SAVE.` | Landing hero `HomePage.tsx` ("READY TO PLAY AND READY TO SAVE"). |
| s6 | `OUR COMMUNITY` | A section label, not a claim. It introduces the landing's own community videos (`ProofSection.tsx` 39–60). |
| s6 | `540K+` `REGISTERED PLAYERS` · `All time · Apr 2026 · company-reported` | F-001, `client/public/facts/facts.json` 66, rendered on the landing at `ProofSection.tsx` 342. |
| s6 | `180K+` `ON X` · `Sep 2026` | F-011, `facts.json` 116, `ProofSection.tsx` 345. |
| s6 | `40` `INFLUENCER CATS` · `Apr 2026 · company-reported` | F-013, `facts.json` 132, `ProofSection.tsx` 348. |
| s6 | `A DAY AT A PARIS CAT CAFÉ` | Landing `ProofSection.tsx` 266–267 ("We hosted a curated day at a Paris cat café…"). |
| s6 | `CAT INFLUENCERS + CREATORS` | Landing `ProofSection.tsx` 314. |
| s7 | `PUBLIC, ON-CHAIN` | Heist payouts modal pill (`catnip-heist/src/ui/shelter-payouts.ts` 228). |
| s7 | `1 · FREE THE SHELTER CAT IN A HEIST.` | `shelter-payouts.ts` 326. |
| s7 | `HEIST COMPLETE!` | Heist win screen (`tools/onchain-text.json` "results"). |
| s7 | `2 · TAP THE RESCUE TREAT.` + `Token Tails sends Pink Paw a small treat.` | `shelter-payouts.ts` 328 ("Tap the rescue treat and Token Tails sends Pink Paw a small treat."), split over two lines. |
| s7 | `3 · EVERY PAYOUT SHOWS UP, WITH A LINK TO CHECK IT ON THE CHAIN.` | `shelter-payouts.ts` 330 (the word "right here" is dropped). |
| s7 | Receipt title `SENT TO SHELTERS`, stamp `OPENS SOON` | Modal title (`shelter-payouts.ts` 223) and the rail's "Opens soon" chip (`rail.ts` pre-launch state). |
| s7 | `SHOWCASE SHELTER: PINK PAW` | Modal kicker plus shelter name (`shelter-payouts.ts` 54, 264). |
| s7 | `DONATIONS ARE SPLIT ON-CHAIN, AND EVERY PAYOUT IS PUBLIC.` | Web `/shelter-payouts` ("Donations are split to it on-chain, and every payout is public."), in `tools/onchain-text.json`. |
| s7 | `READ LIVE FROM THE CHAIN, NOT FROM OUR SERVERS.` | Web `/shelter-payouts` hero ("…read live from the chain's public RPC, not from our servers."). |
| s7 | `FIRST PAYOUTS LAND SOON` | Payouts modal glow line (`tools/onchain-text.json` "payoutsModal"). |
| s8 | `CATNIP HEIST` and the Token Tails logo | Game title and `images.logo`. |
| s8 | `PLAY CATNIP HEIST NOW` / `NO SIGN-UP` | Landing `HeistPill.tsx` 7 ("Or play Catnip Heist now, no sign-up"). |
| s8 | `TOKENTAILS.COM/HEIST` | The landing pill links to `/heist`, and the README says the build runs under tokentails.com/heist. |
| s8 | `PLAY TO SAVE.` | Heist title footer, `rail.ts` 146 ("Play to save: real shelter treats open soon."). |

**Banned or excluded:**

- **Chain-era stats:** F-003 (wallets), F-004 (transactions), F-025.
- **Snapshot-only numbers:** 525 rescue cats, 413 adopted.
- **Counts the landing doesn't show:** any country count.
- **Amounts:** any treat or goal amount (0.01, 90), and any "has sent … so far" line, since nothing
  has been paid yet.
- **Placeholder callouts:** the cue labels "REAL CATS. REAL SHELTER." and "every rescue counts" are
  not used as copy.
- **Hero cat names.**

---

## 11. Asset budget and notes for scene authors

| Scene | Assets |
|---|---|
| s1 | `h08-establish`, `h05-coin-run`, `h06-sneak-corridor`, `h02-meow-lure`, `h02-spotted`, sprite `oreo` |
| s2 | sprites `albertino`, `oreo`, `catnip`; `h01-plate-swap`, `h06-sneak-corridor`, `h02-meow-lure`, `h08-vault-rescue`, `h05-coin-run`, `h02-spotted` |
| s3 | `lvl-01`…`lvl-04`, `h01-plate-swap`, `h02-meow-lure`, `h03-twin-locks`, `h04-key-doors` |
| s4 | `lvl-05`…`lvl-07`, `h08-establish`, `h05-coin-run`, `h06-sneak-corridor`, `h07-split-shift`; reference `stills/level-select-all.jpg` for the mosaic layout |
| s5 | `h01-rescue`, sprites `heart`, `paw`; `community/paris-cat-leap`, `community/paris-cat-lounge` |
| s6 | `paris-crew` (cropped), `paris-phones-play`, `paris-cafe-sign`, `paris-chat`, `paris-cat-lounge`, `ugc-king-portrait`, `ugc-kitten-recommend`, `ugc-ceo-legends`, `reel-tuxedo-characters`, `reel-game-night` (redacted), `reel-cat-plays-tablet` |
| s7 | `h05-rescue-exit`, `oc-results-rescue`, `oc-payouts-open`, `oc-web-payouts`, `stills/oc-web-give-top.jpg`, `stills/oc-payouts-modal.jpg`, `stills/oc-web-payouts-top.jpg` |
| s8 | `h03-rescue-exit` (blurred background), `logo`, `catnip`, `heart`, sprite `oreo` |

- **Juniper thread:** s7 follows one cat through three screens. Juniper is rescued in heist-05
  (`h05-rescue-exit` f34), then appears on the win screen (`oc-results-rescue`) and on the give page
  (`oc-web-give`). Keep that order so the on-chain section reads as one rescue's journey.
- **Unused but available:** `h02-win`, `h06-rescue-exit`, `h07-rescue-exit`, `h08-rescue`,
  `h04-rescue`, `h03-chain-swap`, `yard-wander` and `stills/title.jpg` are spares. A good swap if s4
  needs more energy: an 8-frame `h08-rescue` 0028 rescue flash inside the 08 beat.
- **Verify by eye before final:**
  - the crate focus point in `h01-rescue`
  - the `oc-results-rescue` card crop
  - that the `reel-game-night` redaction covers the moving logo on frames 0, 42 and 83
  - that `paris-crew` frames 20–44 show no badge row above y 0.58
- **Render checks:**
  - `node render.mjs --step 60 --contact` after each scene
  - `node render.mjs --verify`
  - final run: `node render.mjs --clean --strict`, which fails on any banned word
