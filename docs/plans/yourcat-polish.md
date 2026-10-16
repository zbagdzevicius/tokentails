# /yourcat polish: "Step out of the painting" (final design spec)

Status: final design spec (2026-10-12) for the five build batches in §16. Branch `v2`, flags off.
Builds on concept #1 ("Step out of the painting"). Adds the judges' best ideas and closes every
high and critical finding from the six audits (brand, motion, emotion, simplicity, fun-moat, graphics).
The feature spec, [yourcat-v2.md](yourcat-v2.md), still governs the backend, privacy, budget and
analytics. This document only changes the look, the motion, the copy and the share link.

Audit screenshots are under
`/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/90036e17-2f2f-4789-b2bd-035db0b49f4b/scratchpad/polish-shots/`
(`brand/`, `motion/`, `story/`, `ux-lead/`, `game-fun/`, `artdir/`).

---

## 1. Principles

1. **One object, one stage.** A gilt frame stands on the landing's night altar. On S1 the frame is
   empty. On S2 the photo hangs in it. On S3 the cat steps out of it. On S6 the paid painting fills
   it. The `<Stage>` and its `<Frame>` stay mounted from S1 to S3. They never change size or position
   between screens: only their contents change. This removes the screen cuts (M2) and the layout shifts.
2. **Landing brand, not a bespoke look.** Use the canonical lockup, the painted night art, landing
   headlines with `.glow`, `PixelButton` for the one primary action per screen, and the night gold
   pill for everything else. Delete the `/yourcat`-only styles (`GOLD_BUTTON`, `GHOST_BUTTON`,
   `TITLE`, `SUBTITLE`, `EYEBROW`).
3. **Earned, honest anticipation.** Every progress cue fires on a real event (body sent, response,
   portrait ready). There are no percentages, timers or fake steps.
4. **The cat is a character, not a GIF.** The visitor's cat is driven from its own 720x480 sheet. It
   stands on stone, has a shadow, faces the last tap, and loafs and purrs when petted.
5. **Pixel integrity.** Pixel art is drawn only at integer multiples: the 96-cell avatar at
   192, 384, 576 or 768 px, and a 48 px sprite cell at 2x, 3x, 4x, 6x or 8x. Painted art (Pink Paw
   cards, portrait examples, the HD portrait) keeps image smoothing on and its native 2:3 aspect.
6. **Honest warmth.** Name the shelter cat, show its licensed art and say "a real cat at Pink Paw".
   Never mention status, location, money or sharing proceeds. Keep the €14 copy away from the shelter
   block. `tools/copy-lint` and `__test__/yourcat-copy.test.tsx` must pass.
7. **A calm twin for every motion.** Under `prefers-reduced-motion: reduce`, every animation has an
   opacity-only equivalent of 120 to 400 ms. Haptics are off. Interaction stays on: the cat can still
   be petted. Sound follows the effects volume, not the motion setting, and plays only after a gesture.
8. **Lean.** No new dependencies, and no framer-motion import in `components/yourcat`. Use CSS
   keyframes, WAAPI and one short-lived 2D canvas at a time. The H1 is the LCP element. Every image
   box has a fixed size.

---

## 2. Brand alignment

### 2.1 Canonical logo
- **Asset:** `/logo/logo-text.webp` (600x337, 51 KB), loaded as a same-origin path, not through
  `cdnFile`. This is the lockup painted into the landing hero (`landing/hero-top.webp`) and used by
  the game (`IntroCurtain.tsx:238`, `GameSelect.tsx:393`).
- **Header copy:** a new derivative, `public/yourcat/logo-text-320.webp` (320 px wide, ≤ 16 KB), made
  with `cwebp -resize 320 0 -q 90` from the canonical file. The header uses it through `srcSet`.
- **Component:** a new `client/components/yourcat/YourcatHeader.tsx`, used only on `/yourcat`. Do not
  change the shared `layouts/Header.tsx`.
  - Markup: `<header>` fixed `top-0 inset-x-0 z-50` with a plain `<a href="/">` (full page load, as in
    the shared Header) around
    `<img src="/logo/logo-text.webp" srcSet="/yourcat/logo-text-320.webp 320w, /logo/logo-text.webp 600w" sizes="(min-width: 768px) 142px, 100px" width={600} height={337} alt="Token Tails" class="h-14 md:h-20 w-auto" decoding="async">`.
  - No live "TOKEN TAILS" text.
  - `<Socials/>` from `layouts/Socials` on md+ only.
  - At the top of the page the header is transparent, `py-2`.
  - Scrolled (`scrollY > 8`): `bg-tt-night-900/85 backdrop-blur-sm border-b border-tt-gold-400/30 shadow-[0_4px_0_rgb(var(--tt-night-950))]`.
  - Hide on scroll down and show on scroll up with `translate-y` only, over 200 ms std.
  - Reduced motion: no transition.
  - Header height is 72 px on mobile and 96 px on desktop, and the page top padding matches it
    (`pt-[76px] md:pt-[104px]`).
- **Share card:** draws the same `/logo/logo-text.webp`, with the text wordmark as the load-failure
  fallback.
- **Known issue (report, do not fix):** the shared Header's `bg-[rgba(45, 30, 107, 1)]` is invalid
  Tailwind, so `bg-blue-300` shows instead. This also affects `/cats` and the payout pages. Add it to
  `docs/YOURCAT.md` under Known issues.

### 2.2 Tokens
| Use | Token |
|---|---|
| Page and footer | `tt-night-900 #0b0820`, deepest `tt-night-950 #07051a` |
| Gold | `tt-gold-400 #ffcc55` (fill, glow), `tt-gold-500 #e2c05a` (hairline), `tt-gold-shadow #713f12` (bevel only, never text) |
| Text | `tt-cream #fcecbb` body, `tt-lilac #f0c5fd` secondary, `tt-muted #9a88c9` tertiary, white for headlines |
| Danger | `tt-rust #ee642a` |
| Canvas | `NIGHT`, `GOLD`, `INK` from `client/design/tokens.ts` only; no hex literals in `shareCard.ts` |

### 2.3 Type
- **Headline** (`HEADLINE` in `brand.tsx`):
  `font-primary uppercase leading-none text-white drop-shadow-lg text-balance outline-none text-h6 sm:text-h5 md:text-h4 xl:text-h3`.
  The key words go in `<Glow>`, which renders `<span class="glow text-tt-cream">` (`globals.scss:152`).
  Strings stay in sentence case in `copy.ts`, so screen readers read normal case.
- **Second-level heading** (`H2`): the same, at `text-p2 md:text-h6`.
- **Body:** `text-p5 md:text-p4 text-tt-cream`. Captions: `text-p6 md:text-p5 text-tt-lilac`.
- **Chip** (`CHIP`): the landing `CHIP_CLASS` (`ProofSection.tsx:83`) with `/icons/check.webp` at 16 px.

### 2.4 Controls
- **Primary action:** `PrimaryAction` in `brand.tsx` wraps `components/shared/PixelButton.tsx` at
  `size="lg"`. As a link it renders `<Link><PixelButton as="span"/></Link>`. Only one per screen.
- **Secondary:** `NIGHT_PILL`:
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-tt-gold-400/60 bg-tt-night-900/70 px-4 py-2 font-primary text-p5 md:text-p4 uppercase tracking-wide text-tt-gold-400 transition-colors hover:bg-tt-night-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tt-cream disabled:cursor-not-allowed disabled:opacity-60`.
  `DANGER_PILL` is the same with `border-tt-rust text-tt-cream`.
- **Panel:** `PANEL`, moved into `brand.tsx`:
  `w-full rounded-2xl border-4 border-tt-cream/70 bg-black/35 p-4 md:p-6 text-tt-cream backdrop-blur-[2px]`.
- **Inputs:** keep the current `INPUT` and `ALERT`.

### 2.5 Art (every source already exists except three new files)
| Layer | Source | Notes |
|---|---|---|
| Sky | `/brand/hero-bg-dim.webp` 1200x670, 11 KB | absolute inset-0, object-cover, `pixelated`, `aria-hidden`, `fetchpriority="low"`, `decoding="async"`. `animate-hoverSlow` on md+ only, never under reduced motion |
| Altar | **new** `public/yourcat/altar-strip.webp` about 1200x340, ≤ 60 KB | A crop of the glowing altar from `/landing/hero-ground.webp` (2752x1536), made with `cwebp -crop … -resize 1200 0 -q 82`. Pinned to the stage bottom at `aspect-[1200/340]`. Export the constant `ALTAR_SURFACE` (the walkable stone line, as a fraction of the strip height from its bottom) in `Stage.tsx` |
| Foot | `/landing/plates/hub-night-near-v1.png` 1376x384 | md+ only (`hidden md:block`, `loading="lazy"`). Card foot |
| Fade | `bg-gradient-to-b from-transparent to-tt-night-900` | as `index.tsx:126` |
| Card sky | `/landing/card-bg.webp` 76 KB | card only |
| Example cat | `/cats/yellow/sprites/original.png` frame 0 | S1 companion, labelled "Example" |
| Step-out FX | `/flare-effect/effects/lvlup.gif` 3.4 KB | one play, 1.5x, 900 ms, then unmount |
| Pink Paw | `/yourcat/pink-paw/<name>-card.webp` 216x322 | native 2:3, smoothing on, 25% night wash |
| Roundel | `/logo/shelters/pink-paw.webp` 16 KB | card only |
| Arrow | `/logo/arrow.webp` | S5 strip |
| OG | **new** `public/yourcat/og.jpg` 1200x630, ≤ 150 KB | See §9.3 |
| Header logo | **new** `public/yourcat/logo-text-320.webp` ≤ 16 KB | §2.1 |

Never `git add` `client/public/tail/mascot*`, `client/.vitest/` or `docs/plans/flywheel.md`. The
mascot narrator is out of scope (§12).

### 2.6 The Frame (one component, mirrored on canvas)
- Square corners. Two-tone bevel from outside in:
  - 4 px `tt-gold-400`;
  - 4 px `tt-gold-shadow`;
  - a 2 px `tt-night-950` keyline;
  - a 2x2 px `tt-cream` highlight in each of the 3 top-left outer pixels.
- The inner box is `box-content` and an integer multiple of 96: **192 px on phones and 384 px on md+**.
- Two 4x8 px gold "legs" stand it on the altar.
- Tone `cream` (the shelter frame): 2 px cream, 2 px `tt-muted`, 1 px night keyline. Its inner box is
  any 2:3 size.
- Canvas `drawFrame(ctx, rect, scale)` draws the same bevel at `scale` (2 on story and post cards).

---

## 3. Layout system

The DOM order is the same on every screen: **heading block, then stage, then panel(s)**.

- **Phones (< md).**
  - The screens stack in a column with a 16 px gutter.
  - The heading block has a fixed height: a 28 px kicker slot, then a 2-line H1 slot (`min-h-[2em]`,
    items-end). The stage therefore never moves when the heading changes.
  - Stage height is `h-[clamp(320px,42svh,400px)]`, full width.
- **md+.**
  - The route is a 2-column studio inside `max-w-[1240px] mx-auto px-12`:
    `grid-cols-[minmax(0,1fr)_420px] gap-x-12`.
  - The stage sits in column 1, rows 1 to 3, at `h-[clamp(560px,66svh,620px)]`.
  - The heading block is in column 2, row 1. The screen panel is in column 2, row 2, as
    `md:sticky md:top-[104px] md:self-start`.
  - Screen extras (the S3 meeting text) go in column 1, row 4.
  - The grid is the same on S1, S2, S3, manual, S6 and the friend view. The stage keeps its width, so
    nothing reflows when the screen changes.
- **Route wrapper:** `min-h-[100svh] flex flex-col` (B8). `<YourCatPage>` is `flex-1` with
  `min-h-[100svh]`, so the footer always starts below the fold and its movement never counts toward
  CLS. The night footer follows.
- **Placement on the altar** (`Stage` props: `frame`, `companion` on the left, `cat` on the right,
  `overlay`):
  - **Frame:** horizontally centred. Its legs stand on the `ALTAR_SURFACE` line.
  - **Phones on S3:** the frame moves `translateX(-40px)`, inside the step-out (transform only). The
    cat stands at 3x (144 px) with its feet on the stone line. Its box overlaps the frame's right leg
    by about 30 px, which reads as "just stepped out". The cream shelter frame (48x72 art) arrives at
    the frame's bottom-left (rotate -4deg); the meeting layout below then keeps it clear of the portrait.
  - **md+:** no shift. The cat is at 4x (192 px). The shelter frame has 128x192 art.
  - **No overlap (phone-r3, every width):** the portrait, the cat's painted body, the Pink Paw frame
    with its name plate and the friend view's empty frame never overlap, and nothing covers a
    button. Idle phones (S1, S2, the cap screen, the manual pick): the cat's slot overlaps the frame by
    32 px, so its body starts 4 px right of it, and the group moves left by `max(0, 208px - 50vw)` so
    the caption stays on the stage. The S3 meeting: the portrait steps back from its bottom-right
    corner and slides right (0.75 and 86 px on phones, 0.8 and 136 px on md+), so the row reads
    "Pink Paw frame, sitting cat, portrait" side by side. The friend view: the portrait steps back
    from its bottom-left corner (0.66 under 390 px, 0.8 up to md, 0.9 on md+) and the row "empty
    frame, portrait, friend's cat" is centred. Transform only. e2e checks it at 360, 390, 768, 1280
    and 1440 (`Stage.tsx` holds the arithmetic).
  - Tolerance is ±8 px. Nothing may be clipped at 360, 390 or 1440 widths.

---

## 4. Storyboard

Easings (`EASE` in `motion.ts`):
- **out:** `cubic-bezier(.2,.8,.2,1)`
- **spring:** `cubic-bezier(.34,1.56,.64,1)`
- **std:** `cubic-bezier(.4,0,.2,1)`

All motion uses transform, opacity, clip-path or canvas. Never animate layout properties.

### S0: Friend view (`/yourcat?cat=<shareId>`, new, moat)
- **Data:** a client-side fetch of `GET /yourcat/public/:shareId` (§8). It returns the name (when the
  cat is named), the family label, `avatarUrl` (when ready) and `spriteImg`.
  - On 404, network error or an invalid id: drop the `cat` parameter with `history.replaceState` and
    show S1. No error message.
  - Keep the UTM parameters.
- **Layout:**
  - The main frame holds the friend's pixel portrait (or sprite frame 0 at 4x/8x).
  - The friend's cat stands outside it on the altar and can be petted (§5).
  - The companion slot (left) holds a small **empty gold frame** (96 px inner) with the dashed
    silhouette and the label "Your cat here".
- **Copy:**
  - Kicker: the chip `ONE PHOTO · FREE · NO SIGN-UP`.
  - H1: `MOCHI SAYS <glow>HI.</glow>` (unnamed: `A PIXEL CAT SAYS <glow>HI.</glow>`).
  - Body: `Someone turned their cat into a pixel cat. Hang a photo of yours in the empty frame.`
  - Primary: `CHOOSE A PHOTO`.
  - If the visitor already has a record: a pill `See your cat` that opens their S3.
  - Uploads closed or paused: the primary is `Play Token Tails` and the chip is hidden.
- **Motion:**
  - The friend's frame uses `animate-appear` (600 ms).
  - The friend's cat walks in from 24 px left over 480 ms with `steps(6)`.
  - The empty frame appears at 300 ms (opacity, 240 ms out).
- **On choose:** the friend's cat and frame contents fade out over 200 ms. The flight from the button
  to the frame (S1) targets the **main** frame. The empty companion frame unmounts.
- **Reduced motion:** a 150 ms fade for everything. The cat is static and can still be petted.

### S1: Upload ("the empty frame")
- **Phone layout:**
  - Header.
  - Kicker slot: the chip.
  - H1: `YOUR CAT, <glow>IN THE GAME.</glow>`.
  - Stage: the empty frame centred. The companion is the example cat at 3x, labelled "Example" in
    `text-p6 text-tt-muted`.
  - Then the primary action, `CHOOSE A PHOTO`.
  - Then the body, then the two captions (confirm and privacy, unchanged).
  - With consent already given, the CTA is fully above the fold at 390x844.
- **md+:** column 2 holds the chip, H1, body, CTA (with "or drop it here" under it) and captions. The
  whole stage acts as the drop zone too.
- **Frame contents:**
  - A dashed cream silhouette of a sitting cat: an inline SVG path, 8% cream fill, 2 px dash.
  - The label `Your cat here` in `tt-lilac`.
- **Copy:**
  - Chip: `ONE PHOTO · FREE · NO SIGN-UP`. Hidden in the paused and spent states.
  - Body: `Hang one photo of your cat here. It steps out as a pixel cat you can play, with a card to share.`
  - Paused and spent replace the body with the existing status lines and keep their one way forward
    (`Pick your cat's look yourself` or `Play Token Tails`).
  - Delete the `TOKEN TAILS` eyebrow.
- **Motion** (70 ms rhythm, from mount):
  - Kicker at 0 ms: opacity over 240 ms.
  - H1 at 70 ms: rises 16 px over 420 ms, out.
  - Frame at 140 ms: `animate-appear` (600 ms).
  - CTA at 240 ms: scale .94 to 1 over 380 ms, spring.
  - Captions at 320 ms: opacity over 240 ms.
  - Example cat at 500 ms: peeks from behind the frame's right leg (translateY 100% to 0, 320 ms,
    `steps(4)`), then plays the idle loop at 8 fps.
  - Idle: a sheen crosses the frame glass every 5 s (a 700 ms pseudo-element, translateX -120% to 120%).
    The sky drifts with `animate-hoverSlow` on md+.
  - Drag-over: frame scale 1.03 over 160 ms out. The silhouette's `stroke-dashoffset` marches (1 s
    linear, infinite while dragging). The example cat turns to the frame (`scaleX(-1)`).
  - On select:
    1. The CTA presses (scaleY .94, 90 ms).
    2. **Flight:** the photo flies from the CTA rect into the frame's inner box. It is a fixed-position
       `<img>` animated with WAAPI translate and scale over 420 ms, out (`flyTo` in `motion.ts`). The
       photo is then shown in the frame and the flying copy is removed.
    3. The silhouette fades out over 120 ms.
- **Sound:** none until the tap. In the tap handler, call `primeHomeSounds(["meow","purr"])`, which
  plays and pauses the cached elements muted. The reveal arrives 5 to 20 s after the gesture, so iOS
  needs this unlock.
- **Haptics:** none.
- **Reduced motion:** everything appears together with a 150 ms opacity fade. No peek, sheen, drift or
  dash march. On select, the photo cross-fades into the frame over 150 ms.

### S2: Working ("the paint is drying")
- **Layout:**
  - Same stage. The frame holds the sharp photo (object-cover).
  - The kicker slot holds the **honest 3-segment meter** (§4.1).
  - H1: `TURNING <glow>YOUR CAT</glow> INTO PIXELS`.
  - Panel (below the stage on phones, column 2 on md+):
    - the name prompt label `While you wait: what's their name?`;
    - the input (placeholder `Mochi`);
    - the caption `You can leave. Your cat will wait for you here.`
  - This is the only name field in the flow (UX-04).
  - The example cat stays on the altar.
- **Beat A, sending** (`sent=false`):
  - A scan line runs down the photo at 1,800 ms per pass, ease-in-out. It is a 2 px gold line with a
    24 px `linear-gradient(transparent, rgb(var(--tt-gold-400)/.35))` tail.
  - Meter segment 1 shows a waiting pulse.
- **Beat B, body sent** (`sent=true`):
  - Segment 1 fills and pops (scale 0 to 1.25 to 1, 260 ms, spring) with a 3x3 pixel check.
  - The scan speeds to 1,200 ms per pass.
  - 10 gold 4 px **paint motes** lift off the photo: translateY 0 to -40 px, opacity 0 to 1 to 0, a
    1.4 to 2.2 s life, staggered 180 ms.
  - The example cat changes to the sit row and faces the frame.
- **Beat C, 6 s after S2 began:**
  - The photo pushes in (scale 1 to 1.04 over 8 s, linear).
  - The frame breathes (a glow pseudo-element, opacity .25 to .55, 2 s, alternate).
  - A 1/16 quantised copy of the photo (block = inner/16, drawn once on a small canvas) fades in to
    opacity .35 over 1.2 s. The painting visibly starts to crack before the payoff.
- **Response arrives:** the visual screen holds until the current scan pass ends, capped at 400 ms
  (`scanRemainingMs`). Then S3 starts in the same frame with no cut. Focus moves to the S3 heading when
  the visual screen changes.
  - If the stage top is not in the viewport (for example the keyboard scrolled it), first
    `window.scrollTo({ top: 0, behavior: "instant" })`, then start the clock (the 9:16 recording rule).
- **Failure:**
  - The scan stops and fades over 200 ms.
  - The photo desaturates (`filter: grayscale(.6)`, 300 ms).
  - The failed meter segment turns rust and shakes 3 cycles of 2 px over 150 ms, once.
  - The H1 becomes `WE COULDN'T MAKE <glow>YOUR PIXEL CAT</glow>`.
  - The panel shows one `ALERT` with the reason (existing `ERROR_TEXT`), then the actions. The first
    action is `PrimaryAction`, the others are night pills. The panel rises 8 px over 220 ms.
  - The step list no longer repeats the failure: the meter text reads `Stopped`.
  - At 390x844 (consent given) the reason and both actions are in the first viewport.
  - The countdown on `Try again` is unchanged.
- **Sound and haptics:** none.
- **Reduced motion:** no scan, motes, push-in, breathing or shake. The active meter segment pulses in
  opacity over 1.2 s (opacity is calm). The frame shows a static 2 px gold inner border. On failure the
  desaturation is instant.

#### 4.1 The meter (S2 and S3)
- Three 24x8 px pixel segments with a 4 px gap, followed by a single line of live text (`aria-live="polite"`).
- **Segments:** `Photo`, `Coat`, `Portrait`.
- Each segment fills only on a real event:
  - **Photo:** the request body has been sent (`sent`).
  - **Coat:** POST `/yourcat` has returned.
  - **Portrait:** `avatarStatus === "ready"`.
- **Text by state:**
  - `Sending your photo…`
  - `Photo received · Finding the right coat and colours…`
  - On S3: `Painting your pixel portrait…`, then `Your pixel portrait is ready`.
  - On failure: `Stopped`. Portrait failed: `S3.drawFailed`.
- Once the portrait is ready, or on a returning visit, the kicker slot cross-fades (220 ms) to the
  chip `IN THE GAME`.
- Under reduced motion the text swaps with no fade.

### S3: Reveal and share ("it steps out")

#### 4.2 The transformation clock (1,450 ms, one rAF timeline)
It is driven by `startCueClock` (one `requestAnimationFrame` loop, cues fired by elapsed time, not
chained timeouts) and drawn by `TransformFrame` inside the frame's inner box. The canvas size is
`inner × devicePixelRatio`, capped at 768.

| t (ms) | Beat | What happens |
|---|---|---|
| 0 | Hold | The sharp photo. Frame `bump("hold")`: scale 1.00 to 1.03, 150 ms std. Cue `hold` |
| 150–750 | Crack | `REVEAL_BLOCKS = [4, 8, 16, 32, 48]` (block size in canvas px at a 384 canvas, scaled for others), 120 ms each. After each draw, a gold tint: `globalCompositeOperation = "color"`, `globalAlpha = .25`, `fillStyle = GOLD[400]`, `fillRect`, reset. The painting breaks into big gold-tinted pixels |
| 750 | Gather 1 | Cross-dissolve at 48: the photo at 48, then the target at 48 with `globalAlpha .5` |
| 825 / 900 / 975 | Gather 2–4 | The target at 24, then 12, then crisp (`GATHER_BLOCKS = [48, 24, 12, 0]`, 75 ms each; 0 means crisp) |
| **1,050** | **Step out** | Frame `bump("settle")`: 1.03 to 1.00, 320 ms spring. On phones it also moves `translateX(-40px)` at the same time. White flash overlay: opacity .6 to 0, 180 ms out. Cue `stepOut`. The page then: (a) mounts `PetCat` in `entrance="jumpOut"`: jump row 5, a 480 ms arc from the frame's lower-right edge to its standing spot (translate path through a -64 px apex, `steps(6)`), landing on the stone; (b) mounts `lvlup.gif` at the cat's feet (1.5x, 900 ms, then unmount); (c) mounts `<Burst count={28}>` centred on the frame; (d) `playHomeSound("meow")`; (e) `hapticReveal()` = `navigator.vibrate?.([12, 40, 18])` |
| 1,170 | Title | Cue `title`. The H1 `MEET <glow>MOCHI.</glow>` lands: scale .9 to 1, opacity 0 to 1, 280 ms spring. The glow text-shadow goes from 0 to full over 400 ms (the `.glow` span's opacity layer) |
| 1,450 | Done | Cue `done`. The replay pill fades in (240 ms) |
| 1,650 | Purr | `playHomeSound("purr")` (the page schedules it at stepOut + 600) |
| 1,450 + 400 | Meeting | The shelter frame slides onto the altar (§4.4) |

**Target of the gather:**
- **Avatar ready when the clock starts** (loaded, CORS-safe): the avatar.
- **Avatar pending:** the photo quantised to a 32-cell grid with the gold tint. The frame shows the
  in-frame label `Painting your pixel portrait…`: a cream pill at the bottom, `text-p6`, inside the
  inner box. The sprite never appears twice (UX-06).
  - When the avatar lands: a mini gather (48, 24, 12, crisp at 70 ms steps), Frame `bump("pulse")`
    (1 to 1.02 to 1, 260 ms spring) and `<Burst count={8}>`. No sound. Meter segment 3 fills.
- **Avatar failed:** keep the quantised photo. The meter shows `S3.drawFailed`.
- **No photo** (returning visitor or manual cat): no clock.
  - Returning visitor: the frame shows the avatar, else sprite frame 0 at 4x/8x. The cat is already
    standing.
  - Manual cat: the frame `animate-appear`, a gather from 48 to crisp of the sprite frame (300 ms),
    then step-out with `<Burst count={14}>`.

**Replay** (judges' steal):
- A night pill `Watch again` (aria-label `Watch Mochi step out again`) in the stage's top-right
  corner, shown after `done`, only while the photo blob is in memory (a fresh upload on this page view).
- It re-runs the whole clock from the blob, sound included. The pet cat returns to the frame first:
  opacity 0, 120 ms.
- The whole show stays inside one 390x844 viewport, so a screen recording is clean.

**Status line:** the meter (§4.1) replaces the old caption. It reserves its height and fades instead of
unmounting (M6).

**Reduced motion:**
- The sharp photo shows for 600 ms, then a 400 ms linear cross-fade to the target.
- No bump, flash, burst, jump, GIF or haptics. The cat appears standing (120 ms fade). The title is
  static.
- A 64 px `Your photo` thumbnail (2 px cream border, aria-hidden) stays pinned to the frame's top-left
  inner corner, so before and after stay readable (M10).
- Sounds still play on the cues (sound is not motion).

#### 4.3 Pet to purr (`PetCat`, replaces `PlayableCat`)
- **Sheet:** the cat's own 720x480 sheet (15 columns x 10 rows of 48 px cells). Rows and frame counts
  are pinned to `Catbassador.ts` by a test:

  | Animation | Row | Frames |
  |---|---|---|
  | sleep | 0 | 7 |
  | dig | 1 | 4 |
  | groom | 2 | 15 |
  | hit | 3 | 7 |
  | idle | 4 | 12 |
  | jump | 5 | 7 |
  | loaf | 6 | 9 |
  | run | 7 | 4 |
  | sit | 8 | 5 |
  | walk | 9 | 8 |

  It is driven with CSS `background-position` and `steps(n)` at 8 fps. The scale comes from the
  `--s` custom property: 3 on phones, 4 on md+.
- **Body:** a `<button>` (aria-label `Pet Mochi`, unnamed `Pet your cat`) with a 1-pixel-step oval
  shadow under it in `tt-night-950/.5`, and a `min-h-11` hit area.
- **Idle:** the idle row loops. Every 6 s there is a 6 px hop (300 ms, `cubic-bezier(.3,1.6,.5,1)`).
  The hop stops after 3 cycles. The loop pauses when the cat is offscreen (IntersectionObserver sets
  `animation-play-state`).
- **Tap or hold** (pointerdown):
  - A squash press: scaleY .9 and scaleX 1.08 for 90 ms.
  - The cat switches to the loaf row while held, and for at least 1.2 s.
  - 3 to 5 pixel hearts (6x6 px SVG, `tt-pink`) rise 24 px and fade over 600 ms out.
  - `playHomeSound("purr")`.
  - The caption under the cat (`aria-live="polite"`, `text-p6 text-tt-lilac`, reserved height)
    changes from `Tap Mochi` to `Mochi purrs.`
- **Double tap** (two pointerdowns within 300 ms): the jump row plays once.
- **Facing:** the cat faces the side of the last tap relative to its centre (`scaleX(-1)`, instant).
- **Reduced motion:** the button stays enabled. A tap swaps idle frame 0 for loaf frame 0 with a 120 ms
  opacity change, plays the purr and updates the caption. There are no hearts, hop or idle loop (the
  idle frame is static).

#### 4.4 The quiet meeting beat (Pink Paw)
- **Pick:** `pickPinkPawCat(candidates, record.id)` stays as it is (fnv1a, stable per upload; WAITING or
  RECOVERING only; the licensed four).
- **Null rule:** if the gallery is null or has no candidate, show nothing. No shelter frame, no
  meeting H2, no heart, no toggle and no placeholder cat. The card is drawn solo.
- **On stage:** 400 ms after `done` (no clock: at mount), the **cream frame** with the shelter cat's
  art slides onto the altar's left (translateX -16 to 0, opacity 0 to 1, 240 ms out).
  - The art is at native 2:3, `object-cover`, smoothing on, with a `bg-tt-night-950/25` wash.
  - 300 ms later the visitor's cat switches to the **sit row facing it**. **One pixel heart** rises
    between them (600 ms). There is **no sound**.
  - After that beat, pet to purr is live.
- **Text** (the meeting block, under the card on phones and under the stage on md+, in `PANEL`):
  - H2: `MOCHI, MEET <glow>ZARE.</glow>` (unnamed: `YOUR CAT, MEET <glow>ZARE.</glow>`).
  - Body: `Zare is a real cat at Pink Paw, a cat shelter. Put them on one card?`
  - The toggle sits **under the card** (it controls the card): a `role="switch"` labelled
    `Put Zare on my card`, on by default. The knob moves with translateX 0 to 20 px over 180 ms spring.
  - There is no status, location or money wording.
- **Reduced motion:** the shelter frame and heart arrive with 120 ms fades. The cat changes to sit
  frame 0 with no motion.

#### 4.5 S3 layout and actions
- **Phones** (order):
  1. Kicker (meter, then the chip).
  2. H1, with a pencil `NIGHT_PILL` icon button after it (aria-label `Rename Mochi`, unnamed
     `Name your cat`).
  3. Stage.
  4. The card preview at `max-h-[52svh]`, centred, with no `object-contain` letterbox (the img is
     sized to its aspect, with the border and glow on the img).
  5. The toggle.
  6. The meeting block.
  7. One footer line: `Delete my photo · Start over`.
  8. The guest note: `Mochi lives in this browser for now. Create an account to keep Mochi for good.`,
     with a second small line `Already have an account? Mochi can't move to it yet.`
  9. The upsell (S5) after `mt-24`.
- **Sticky share bar** (phones, once the first card exists):
  - `PrimaryAction` **Share**. Download when Web Share with files is unavailable.
  - The pill **Play as Mochi** (`/game`).
  - The pill **More**. It opens a bottom sheet (dialog: focus trap, Esc closes, focus returns) with
    the Story/Post radio, Download and Copy link. The default format is story on phones.
  - Bar classes: `bg-tt-night-900/95 border-t-2 border-tt-gold-400/30` with safe-area padding.
  - It enters once: translateY(100%) to 0, 260 ms out.
- **md+:** column 2 holds:
  - the heading block;
  - the card at 400 px wide (420 at ≥ 1000 px viewport height), post by default;
  - the toggle;
  - the Story/Post night pills;
  - the actions row: `PrimaryAction` (Share or Download), then the pills Copy link and Play as Mochi.

  Everything fits within 900 px. The meeting block and the footer line go in column 1 under the stage.
- **Rename:** the pencil opens an inline form row under the H1 (input plus a `Save` pill). This is
  user-initiated, so its shift is CLS-exempt. Enter or blur saves. The existing debounce and the
  "card follows the accepted name" rules stay. The S3 "Name for the card" field is deleted.
- **Coat line** (story-02): one body line in the meeting PANEL's header on md+, and under the stage
  on phones:
  - Matched, base family: `Mochi is in the game. Same ginger coat, new pixel paws.`
  - Picked: `Mochi is in the game, in the ginger look you picked.`
  - `COAT_WORDS`: BLACK black, GREY grey, YELLOW ginger, WHITE white, SIAMESE siamese.
  - Other families: `Mochi is in the game, with the Oreo look.`
  - Unnamed: `Your cat is in the game…`
- **Card motion:**
  - The first card "prints": translateY 12 px, rotate -1.5deg and opacity 0 to rest, 420 ms spring,
    then one 600 ms sheen.
  - Format and toggle changes keep the old image under the new one and cross-fade over 220 ms out.
    A format change also animates the container's aspect with a 300 ms out FLIP.
  - Reduced motion: 120 ms opacity cross-fades only.
- **Share text:**
  - With panel: `Mochi is a pixel cat now, and just met Zare, a real cat from Pink Paw. Turn your cat into one: <url>`
  - Without panel: `Mochi is a pixel cat now. Turn your cat into one: <url>`
  - Unnamed: `My cat is a pixel cat now…`
  - `<url>` is the per-cat link from `buildShareUrl` (§8).

### Manual pick (§1.5 path)
- The stage stays mounted. The frame is empty. The companion previews the selected family's sprite at
  3x/4x, with the idle loop.
- The panel holds:
  - H2 `PICK <glow>YOUR CAT'S LOOK</glow>`;
  - a centred grid (`justify-center`) showing the **6 base families first** (Black, Grey, Pinkie,
    Siamese, Ginger, White) and a `More looks` pill that expands the other 15;
  - the first family **preselected**;
  - the name input;
  - `PrimaryAction` `MAKE MY CAT`, sticky at the bottom on phones;
  - the pill `Back` or `Back to the photo`.
- Tiles stagger in at 50 ms. The selected tile lifts (translateY -4 px plus a shadow, 160 ms).
- Reduced motion: no stagger or lift.

### S5: Upsell ("hang the real painting")
- **Layout:** a `PANEL` (max-w-3xl, centred, full width under the grid). It enters on
  IntersectionObserver: 16 px rise, 360 ms out, once.
  - Centred H2.
  - The strip: the visitor's pixel avatar (or sprite frame) in a small gold Frame (96 px inner), then
    `/logo/arrow.webp`, then the selected style example in a large gilt Frame with a cream 8 px mat at
    **native 2:3** (160x240 on phones, 240x360 on md+, smoothing on).
  - The four style thumbnails are 2:3 (`aspect-[2/3]`, object-cover). They form a 2x2 grid on phones
    and a row on md+.
  - Choosing a style cross-fades the large frame over 220 ms.
- **Copy:**
  - H2: `MOCHI, <glow>PAINTED LIKE ROYALTY.</glow>`
  - Body: `A 4K painted portrait from the same photo, in the style you pick. €14, paid once. We paint it after you pay. It appears here and in your email when it's ready. If it doesn't look like Mochi, reply to the email and we'll paint it again once.`
    The price always comes from `formatPrice(status)`; `€14` above is only the rendered example.
    "We paint it after you pay" stays, so the examples are never read as the visitor's result.
  - Legend: `Pick a style (examples)`.
  - CTA: `PrimaryAction` `GET THE HD PORTRAIT · {price}`.
  - The fine print is unchanged.
- **Motion:** on CTA hover or focus, the large frame's sheen runs once. No countdowns and no urgency.
- **Sound:** none. **Reduced motion:** a static strip with instant swaps.
- **Placement:** never in the app build, never next to Share or the meeting block (it comes after the
  footer line with `mt-24`).

### S6: Paid ("the painting is hung")
- **Layout:** the stage returns.
  - The frame inner box is 2:3 here: 128x192 on phones, 256x384 on md+. It is a separate screen on a
    fresh page load, so there is no shift.
  - While painting: the pixel avatar centred on a cream mat, quantised to 1/8, under a 30% cream veil,
    with the in-frame label `Painting…`.
  - The cat sits in front (sit row) with a slow blink every 4 s (frame 0 to 2 and back, steps).
- **Copy:**
  - Painting: H1 `MOCHI'S PORTRAIT IS <glow>BEING PAINTED.</glow>`. Body
    `It appears here and in your email when it's ready. You can close this page.`
  - Late and failed copy is unchanged.
- **When ready** (poll):
  - The veil wipes top to bottom (`clip-path: inset(0 0 0 0)` to `inset(100% 0 0 0)`, 900 ms std).
  - The painted portrait shows in the frame (object-cover, smoothing on).
  - The cat stands and looks up (idle row), with one `purr` and `<Burst count={12}>`.
  - H1 `HUNG IN <glow>THE GALLERY.</glow>`.
  - `PrimaryAction` `DOWNLOAD 4K`, then the pills `Play as Mochi` and `Back to Mochi's card`.
- The old paw pulse runs at 2 s and stops after 4 cycles (M9).
- **Reduced motion:** the veil fades out over 300 ms. No burst. The cat is static.
- The inline S6 on S3 (painting while on S3) keeps today's placement under S3, restyled with `PANEL`
  and the brand classes, without its own stage.

### App build
`AppOnlyNotice` is restyled with `HEADLINE` and `PANEL`. It has no stage and no prices.

---

## 5. The fun moment
At **t = 1,050 ms** the cat **jumps out of its own portrait** and lands on the stone with a dust puff,
a meow, a burst of gold pixels and, on Android, a small double buzz. Then it is the visitor's cat to
pet: holding it makes it loaf and purr with rising hearts. A real Pink Paw cat's cream frame slides
onto the altar. The visitor's cat sits, faces it, and one quiet heart rises. The share card is a still
of that exact scene, and `Watch again` lets people record a clean take.

## 6. The moat element
**The frame is a place that persists, and only the visitor's own cat can fill it.**
1. **Per-cat share link, in v1.** Every share opens the friend's cat, pettable, beside an empty frame
   that says "Your cat here". Each share is therefore a working demo with a real cat in it (S0, §8).
2. **A real shelter cat in the scene.** A generic photo-to-sprite tool cannot copy that.
3. **The paid painting fills the same frame** (S6). The €14 product continues the free cat instead of
   being a separate shop.
4. **Portrait in the Cat Yard:** this is a *Your call* item (§12). It needs the owner of
   `shared/home-yard.ts`. It is not in these batches.

## 7. Simplicity cuts
- One persistent `<Stage>`. `WorkingStep`'s own frame, `RevealFrame` and the 320 px rounded photo are
  gone. The flight happens only once, from the CTA into the frame.
- One name field: the S2 prompt, then the pencil-editable H1. The S3 "Name for the card" field is
  deleted.
- On phones, Story/Post, Download and Copy link sit behind `More`. The footer is one line.
- Visible S3 decisions above the upsell, on phones: Share, Play, More, the toggle, the pencil, and the
  footer links (down from about 12).
- Deleted: the `TOKEN TAILS` eyebrow, the lilac card wordmark, `GOLD_BUTTON`, `GHOST_BUTTON`, `TITLE`,
  `SUBTITLE`, `EYEBROW`, `FadeUp`, the old `YourcatStyles` keyframes, `PlayableCat` with `GIF_PLAY_MS`,
  `RevealFrame.tsx`, and the `.yc-fade` no-op.
- The step checklist becomes the 3-segment meter, with one line of text.
- Not built:
  - the "Catch the yarn" run (FUN-2, phase 2);
  - the WebAudio synth;
  - the stat plate;
  - the mascot narrator;
  - the friends-in-yard collection;
  - "Follow the shelter cat";
  - the S1 family carousel during the wait (UX-05's carousel; the meter and the beats cover the wait);
  - the 429 countdown fill bar.

---

## 8. Share link (data path)
- **Schema:** `YourCat.shareId: string`, unique and sparse, 12 characters of base64url from
  `crypto.randomBytes(9)`.
  - Set on create (photo and manual).
  - Backfilled lazily in `service.view()` for records without one, using an atomic
    `updateOne({_id, shareId: {$exists: false}})`.
- **Contract:**
  - `YourcatView` gains `shareId: string`.
  - New `YourcatPublicView { name: string | null; familyLabel: string; avatarUrl: string | null; spriteImg: string }`.
    `name` is null unless `named`. `avatarUrl` is null unless the avatar status is ready.
  - Never returns the photo, owner, record id, dates or `catImg`.
  - The client copy goes in `client/models/yourcat.ts`, pinned by `yourcat-contract.test.ts`.
- **Route:** `GET /yourcat/public/:shareId`.
  - Public, with no guard list. The per-IP limit is applied in the handler, like `status`:
    `YOURCAT_THROTTLES.public = { ip: { limit: 60, ttl: 60000 } }`.
  - `Cache-Control: public, max-age=60`.
  - The id must match `^[A-Za-z0-9_-]{12}$` before any database query. Otherwise, or when no record
    matches: 404 `YOURCAT_NOT_FOUND`.
  - Declare it **before** `@Get(':id')`.
  - A deleted photo or avatar returns the sprite only. A record removed by retention returns 404.
- **Client:**
  - `YOURCAT_API.publicCat(shareId)` is an unauthenticated GET (no `accesstoken`, no guest session).
  - `buildShareUrl(medium, content, shareId?, origin)` returns
    `…/yourcat?cat=<shareId>&utm_source=share&utm_medium=…&utm_campaign=yourcat&utm_content=…`.
  - `readShareId(search)` validates the same regex.
- **Privacy copy:**
  - Add a paragraph to `PRIVACY.paragraphs`:
    `If you share your cat's link, anyone who opens it sees your cat's name and pixel look, never your photo.`
  - Bump `PRIVACY_NOTICE_VERSION` to `"2026-10-12"`.
  - Update the `utm.ts` docblock: the link now carries a random public share id, never the record id
    or a user id.
- **Docs:** `docs/API.md` route table and `docs/BACKEND.md`.

---

## 9. Share card redesign ("the gallery print")
Drawn on the existing canvas as a still of the S3 stage (R1-05). Since R2-07 the meeting sits
**below** the portrait: the portrait is alone in its gold frame, and under it the visitor's cat and the
Pink Paw cat's cream frame stand on one ground line (the foot plate's horizon), with one heart above
the gap between their heads. Every image is same-origin (`/logo/…`, `/landing/…`, `/yourcat/…`)
except the avatar and the sprite, which keep `corsUrl` and `crossOrigin`.

### 9.1 Layers (both formats, back to front)
1. `/landing/card-bg.webp`, cover-cropped **from x 0.15** of its width (`BACKGROUND_CROP_X`), not
   centred: the centre crop put the milky way's bright vertical beam behind the portrait. Then a
   `NIGHT[950]` scrim at .35.
2. 4 seeded gold cross stars (`GOLD[400]`, 3 px arms) in the margins beside the frame.
3. The ground: a `NIGHT[950]` fill (`groundFill`) from just above the plate's bottom edge down to the
   card's bottom edge, then the foot plate `/landing/plates/hub-night-near-v1.png` drawn 1262 wide
   (352 tall, centred, wider than the card) with its open horizon (plate y 224 of 384,
   `FOOT_GROUND`) on the **ground line**. Its ruins frame the scene.
4. The logo `/logo/logo-text.webp` at its native aspect, centred. If it fails to load, draw the text
   wordmark (`CARD_TEXT.wordmark`, `INK.cream`, hud font).
5. The gold bevel frame (`drawFrame` at scale 2) and the avatar, nearest-neighbour, at an **integer**
   size. With no avatar: sprite frame 0 at 12x (story) or 10x (post), centred in the portrait box.
   Nothing of the scene is ever drawn over the portrait.
6. **With the shelter cat:** the cream 2:3 frame stands on the ground line left of the visitor's cat,
   leaning -4° around its bottom centre (like the stage's `-rotate-[4deg]`): a soft night shadow, the
   art (smoothing on, `imageSmoothingQuality = "high"`, a 25% `NIGHT[900]` wash), the cream bevel
   (scale 1.6) and the Pink Paw roundel on its bottom-right corner. Without an avatar (no standing
   cat) the cream frame stands alone, centred, with no heart.
7. The visitor's cat beside an avatar: **walk row 9, frame 3** at 8x (story) or 6x (post), feet on the
   ground line, mirrored to face the shelter cat (solo: centred, facing right), over a stepped
   1-pixel night shadow. With the shelter cat, PetCat's 6x6 `PixelHeart` (`tt-pink`, one-cell night
   keyline) floats above the gap between the two heads, a cell above the cat's head top and always
   below the portrait.
8. The title, **uppercased** (fitted in capitals so measure and draw agree), title font, `GOLD[400]`,
   with the page's `.glow` on canvas: `shadowColor` cream at 0.6 alpha, `shadowBlur` 24
   (`NAME_GLOW`), restored before the next line. Under it the subline (caption font, `INK.cream`).
   No NEW FRIEND block, no shelter-share or donation wording.
9. The link line with the drawn paw (unchanged).

### 9.2 Geometry
The tests (`__test__/yourcat-card-layout.test.ts`, `__test__/yourcat-share-card.test.ts`) pin the
invariants: every rect but the foot plate and ground fill inside the safe area (the leaning frame by
its rotated bounds); an integer avatar scale; shelter art at 2:3; the logo at 337/600; the sprite's
and the cream frame's feet on the ground line; a whole sprite cell (hat room included) between the
gold frame and the ground; nothing of the scene (sprite cell, cream frame bounds, heart) over the
portrait; the heart in the gap between the frame's bounds and the cat's visible body, above the head;
the title under the scene; the same portrait, ground and text with and without the shelter cat.

The stack, top to bottom: logo, 16 px, the gold frame, one sprite cell of hat room, the ground line,
the title. Against the R1-05 layout (portrait 768 at y 452, sprite on the bottom rail, title at 1348
and a ~250 px dead band above the link) the meeting moved under the portrait, the portrait went to 7x
so a whole cell fits under it, and the title moved down 152 px into the old dead band. The ground
line sits at 1392 rather than the ~1300 first proposed: at 1300 an 8x cell (384) would cut into the
portrait.

| | Story 1080x1920 (safe 60–1020 x 220–1680) | Post 1080x1350 (safe 60–1020 x 60–1290) |
|---|---|---|
| Logo | w 260, h 146 at (410, 228) | w 220, h 124 at (430, 64) |
| Avatar | 672 (7x) at (204, 410) | 576 (6x) at (252, 222) |
| Frame | avatar grown by 20 (bevel scale 2): bottom 1102 | same: bottom 818 |
| Ground line | y 1392 | y 1034 |
| Foot plate | 1262x352 at (-91, 1187), horizon on the ground | 1262x352 at (-91, 829) |
| Sprite (meeting) | 384 cell at (514, 1104), mirrored, feet at 1392 | 288 cell at (522, 818), mirrored |
| Sprite (solo) | centred on the card, facing right | same |
| Shelter frame | art 168x252, cream bevel 8 → 184x268 at (278, 1124), -4° | art 120x180 → 136x196 at (342, 838) |
| Gap frame → cat | 140 | 110 |
| Roundel | 64 | 52 |
| Heart | 6x6 cells of 10 px (60) at (513, 1142) | cells of 7 px (42) at (521, 849) |
| Title | baseline 1500, start 112, min 64, uppercase | baseline 1128, start 96, min 56 |
| Subline | baseline 1560, 40 | baseline 1178, 36 |
| Link | baseline 1660, 44 | baseline 1255, 40 |

### 9.3 Text and fallbacks
- **Name line:**
  - Panel on and the cat named: `Mochi & Zare`, shrinking 4 px at a time to the minimum size. If it
    still does not fit, `Mochi`, then the ellipsis rule.
  - Unnamed: `Ginger cat`.
- **Subline:**
  - With the panel: `Mochi met Zare, a real cat from Pink Paw`.
  - Unnamed with the panel: `Met Zare, a real cat from Pink Paw`.
  - Without the panel: `Now a pixel cat in Token Tails`.
- **Layout input:** `cardLayout` takes the strings ready-made through `CardText` (§11), so the layout
  stays pure and copy stays in `copy.ts`.
- **Shelter art:** if the image fails, drop the panel and draw solo (the same as gallery null).
- **Preload:** card images are preloaded once `sent === true` on S2: the logo, card-bg, the foot plate
  and the roundel (about 225 KB, after the upload body has left). The first card must be ready no more
  than 600 ms after `done` on a mid-range phone.

### 9.4 OG image (`public/yourcat/og.jpg`)
- 1200x630, ≤ 150 KB.
- **Content:** the card-bg nebula; the altar strip along the bottom; a gold bevel frame (inner 288)
  holding `cats/yellow/sprites/original.png` frame 0 at 6x; the same cat mid-jump outside the frame
  (jump row 5, frame 3, 6x); the lockup at the top-left (360 wide); and `YOUR CAT, IN THE GAME.` in
  Passion One, white, with a cream glow on "IN THE GAME.".
- **How:** compose it in a scratchpad HTML page, take a Playwright screenshot to JPEG at q≈82, and
  commit only the JPEG.
- **Meta:** `SeoHead image={{ url: "/yourcat/og.jpg", width: 1200, height: 630, alt: "A pixel cat steps out of a gold frame on a glowing altar. Your cat, in the game." }}`.
  The title is `Turn your cat into a pixel cat - Token Tails` (B9 separator).

---

## 10. Performance budget
| Metric | Budget | How it is checked |
|---|---|---|
| LCP (mobile, Lighthouse simulated 4G, S1) | < 2.5 s; the LCP element is the H1 | Lighthouse on `next build` + static serve |
| CLS (S1 to S3 with mocks, 390 and 1440) | < 0.05 total; 0 from the footer | `PerformanceObserver('layout-shift')` sum in e2e (excluding `hadRecentInput`) |
| Above-the-fold image bytes on S1, phone | ≤ 120 KB (sky 11, altar ≤ 60, logo-320 ≤ 16, example sheet ≈ 22) | network log |
| md+ extra | foot plate 80 KB, lazy | |
| JS | the `/yourcat` First Load JS grows ≤ 15 KB gzip compared with `1ac9819e`; no new dependencies; no `framer-motion` or `phaser` import in `components/yourcat` | `next build` output plus a grep test |
| Runtime | one rAF loop at a time; the `Burst` canvas is removed within 1.2 s; the only infinite animations are the S2 scan (while working), the S1 sheen and the pet-cat idle loop, and the loop is paused offscreen | code review plus a test |
| Card | the first card is ready ≤ 600 ms after `done` (images preloaded on S2) | e2e timing log |
| Sound | the purr mp3 (241 KB) is fetched only after a gesture (priming happens in the tap) | network log |

---

## 11. Interfaces (the contract between batches)
The letters are the batches in §16: A share link (backend, API, utm), B brand kit and stage
primitives, C reveal engine and share card, D screens S0 to S3 with copy and e2e, E manual, upsell,
paid and app screens. Recommended order: A and B in parallel, then C, then D, then E. Every batch
codes to these names exactly, so a later batch can start against the names before the earlier one
lands; `tsc` only has to pass once all five are in.

**`brand.tsx` (B):**
- `HEADLINE`, `H2`, `CHIP`, `PANEL`, `NIGHT_PILL`, `DANGER_PILL`
- `Glow({ children })`
- `ChipCheck({ children })`
- `PrimaryAction(props: { text: ReactNode; onClick?(): void; href?: string; disabled?: boolean; busy?: boolean; fullWidth?: boolean; className?: string; describedBy?: string })`
- `HeadlineParts = { before?: string; glow: string; after?: string }`
- `Headline({ parts, level?: 1 | 2, className?, ref })`: a focusable heading (tabIndex -1) that
  renders `before <Glow>glow</Glow> after`.
- `YourcatMotionStyles`: one `<style>` element with every `yc-*` keyframe and its reduced-motion block.

**`motion.ts` (B):**
- `EASE`
- `CLOCK = { HOLD: 0, CRACK_START: 150, CRACK_STEP: 120, GATHER_START: 750, GATHER_STEP: 75, STEP_OUT: 1050, TITLE: 1170, DONE: 1450, PURR_AFTER_STEP_OUT: 600, MEETING_AFTER_DONE: 400, RM_HOLD: 600, RM_FADE: 400 }`
- `startCueClock(cues: { at: number; run(): void }[], opts?: { now?(): number; raf?(cb): number; caf?(id): void }): () => void`
- `scanRemainingMs(startedAt: number, periodMs: number, now: number, cap = 400): number`
- `flyTo(src: string, from: DOMRect, to: HTMLElement, ms = 420, reduced: boolean): Promise<void>`
- `hapticReveal(reduced: boolean): void`
- `useInView(ref, { once?: boolean }): boolean`

**`components/home/homeSfx.ts` (B):** adds `primeHomeSounds(kinds: HomeSound[]): void`. It creates
or reuses the cached elements, then plays them muted, pauses them and unmutes them. It never throws.

**`spriteSheet.ts` (B):**
- `SHEET = { cols: 15, rows: 10, cell: 48, width: 720, height: 480 }`
- `ANIMS: Record<"sleep"|"dig"|"groom"|"hit"|"idle"|"jump"|"loaf"|"run"|"sit"|"walk", { row: number; frames: number; fps: number }>`
- `framePosition(anim, frame, scale): string`

**`Frame.tsx` (B):**
- `Frame` is a forwardRef to `FrameHandle { inner: HTMLDivElement | null; bump(kind: "hold" | "settle" | "pulse" | "drop"): void }`.
- Props:
  `{ tone?: "gold" | "cream"; inner: { w: number; h: number; mdW?: number; mdH?: number }; legs?: boolean; sheen?: boolean; breathe?: boolean; dragOver?: boolean; failed?: boolean; label?: string; reducedMotion: boolean; className?: string; style?: CSSProperties; children?: ReactNode }`.
- `FrameSilhouette({ label })`: the empty-frame contents.

**`Stage.tsx` (B):**
- `Stage(props: { frame: ReactNode; companion?: ReactNode; cat?: ReactNode; overlay?: ReactNode; shifted?: boolean; reducedMotion: boolean; onDrop?(file: File): void; onDragState?(over: boolean): void; className?: string })`
- `ALTAR_SURFACE: number`

**`PetCat.tsx` (B):**
- Props:
  `{ spriteImg: string; name: string; labels: { pet: string; tap: string; purrs: string }; scale?: { base: 2 | 3 | 4; md?: 3 | 4 | 6 }; mode?: "idle" | "sit" | "loaf"; facing?: "left" | "right"; entrance?: "none" | "jumpOut" | "walkIn" | "peek"; interactive?: boolean; sound?: boolean; reducedMotion: boolean; heartOnce?: number /* increment to float one heart */; onEntranceEnd?(): void }`.

**`YourcatHeader.tsx` (B):** `YourcatHeader()`.

**`TransformFrame.tsx` (C):**
- Props:
  `{ photoUrl: string | null; avatarUrl: string | null; spriteImg: string; mode: "empty" | "working" | "reveal" | "settled" | "manual"; working?: { sent: boolean; beatC: boolean; failed: boolean }; reducedMotion: boolean; label: string; pendingLabel: string; photoBadgeLabel: string; replayToken?: number; onCue?(cue: "hold" | "stepOut" | "title" | "done"): void; onAvatarLanded?(): void }`.
- It fills the parent inner box. It owns the scan, motes, quantise overlay, push-in, desaturation,
  the clock canvas, the flash, the pending label, the reduced-motion photo badge and the late-avatar
  mini gather.

**`Burst.tsx` (C):** `Burst({ count: number; reducedMotion: boolean; onDone?(): void })`. It fills its
parent at 1.4x size. Particles are 3 to 6 px squares in `GOLD[400]`, `INK.cream` and `INK.lilac`, at
220 to 420 px/s, with gravity 900, drag .92 and a life of 700 to 1,000 ms. It returns null under
reduced motion.

**`pixelateReveal.ts` (C):** `REVEAL_BLOCKS = [4, 8, 16, 32, 48]`, `GATHER_BLOCKS = [48, 24, 12, 0]`,
`LATE_GATHER_STEP_MS = 70`, `drawPixelated(canvas, image, block, opts?: { tint?: string; alpha?: number; crop?: Rect })`,
`coverCrop`, `loadRevealImage`.

**`cardLayout.ts` (C):**
- `CardText { wordmark: string; link: string; nameLine: string; nameFallback: string; subline: string; panel: { name: string } | null }`
- `CardInput { format; text: CardText; standing?: boolean }` (false without an avatar: the sprite sits in the portrait box)
- `cardLayout(input, measure)` adds `logo`, `foot`, `groundFill`, `ground`, `roundel`, `panelPivot`, `panelBounds`, `heart` and `spriteMirror`, and keeps the rest.

**`useShareCards.ts` (C):** options gain `textFor(withShelter: boolean): CardText`. The rest is
unchanged.

**`copy.ts` (D)** exports for E and the components:
- `S1.chip`, `S1.title: HeadlineParts`, `S1.body`, `S1.frameLabel`, `S1.example`
- `S2.title`, `S2.failedTitle`, `S2.meter`
- `S3.title(name)`, `S3.rename(name)`, `S3.coatLine(name, family, label, manual)`, `S3.pet`,
  `S3.replay`, `S3.meeting`, `S3.more`, `S3.shareText(name, url, shelterName | null)`,
  `S3.guestNote`, `S3.guestCaveat`
- `CARD_TEXT`, `cardText(name, named, familyLabel, shelterName | null): CardText`
- `FRIEND`, `MANUAL` (with `moreLooks`, title parts), `S5` (title parts, body, legend, button),
  `S6` (title parts)
- `PRIVACY` (with the new paragraph)
- `allStaticCopy()` walks every group.

**`PaidState.tsx` (E):** exports `PaidFrameContent({ avatarUrl, spriteImg, portraitUrl, status, reducedMotion })`
for the stage frame on the `paid` screen. `PaidState` keeps its props and renders only the panel.

**`YourCatPage.tsx` (D)** renders the stage for these screens: upload, working, reveal, manual, paid
and friend. It does not render it for the app build.

---

## 12. Out of scope and Your call
| Item | Default if no answer |
|---|---|
| Portrait badge in the Cat Yard and on `/game` (MOAT-1 part 2; needs `shared/home-yard.ts` and its owner) | Not built; raise with the owner |
| Compact analytics consent banner on `/yourcat`. It covers the CTA and the share bar on the first visit (story-11, UX-11; shared component) | Raise with the owner; no change. The acceptance runs with consent set |
| The shared Header's invalid rgba class (B2, AD-13) | Report in the known issues; `/yourcat` uses its own header |
| "Catch the yarn" 10-second run (FUN-2 phase 2) | Deferred; FUN-2 is closed by pet to purr plus Play in the sticky bar |
| Stop sharing a cat's link | Not built; deleting the photo removes the portrait from the link |
| Mascot narrator (`tail/cat-celebrate.webp`) | Off |
| Re-exporting the Pink Paw cards at 2x | Not needed: the card draws them at ≤ 1x |
| Per-cat recolour or new painted art | Out |

Never touched: `/heist`, `/shelter-payouts`, `catnip-heist/`, `shelter-rail/`, `contracts/`,
`client/public/heist-game/`, `backend/src/shelter/**`, `client/components/shelter-payouts/**`,
`shared/**`, `layouts/Header.tsx`, `components/shared/AnalyticsConsentBanner.tsx` and `.env*`.

---

## 13. Findings coverage
Every high and critical finding is closed here. Medium and low findings are closed where it is cheap.

| Id | Severity | Closed by |
|---|---|---|
| B1 | high | §2.1 YourcatHeader with the lockup; the eyebrow is deleted |
| B2 | high | §2.1 scrolled night state; the shared class is reported |
| B3, AD-02 | high | §2.5 / §3 Stage with sky, altar and foot |
| M1 | critical | §4.2 crack then gather, in order |
| M2 | high | §1 persistent stage, the S1 flight, the S2 scan gate, the footer below the fold |
| M3 | high | §4 S2 beats A, B and C plus the meter |
| M4, story-04 | high | §4.2 step-out: burst, GIF, meow, purr, haptics, title spring |
| story-01, UX-10, MOAT-3 | high, low, medium | §4.4 meeting on stage and the meeting block (no status line: `waiting for a home` is banned copy) |
| story-02 | high | §4.5 coat line |
| story-03, UX-01 | high | S1 example cat, empty frame with silhouette, one-line body, chip |
| UX-02 | high | §4.5 md+ column 2 with card and actions within 900 px |
| UX-03 | high | §4.5 phone order: stage, then card, then the sticky bar |
| FUN-1, FUN-4, M5 | high, medium | §4.3 PetCat |
| FUN-2 | high | Pet to purr on the reveal plus `Play as Mochi` in the sticky bar and column 2 (the run is deferred, §12) |
| MOAT-1 | high | v1: the per-cat share link carries the portrait (§8); the Yard badge is a Your-call item (§12) |
| MOAT-2 | medium | §8 per-cat link, S0 |
| AD-01 | critical | §9 2:3 shelter art, smoothing on |
| AD-03 | high | §9.1 card-bg, scrim, stars, foot plate |
| AD-04 | high | §2.6 192/384 inner, §9.2 672/576 |
| B4, B5, B6, AD-07, AD-12 | medium, low | §2.3 / §2.4, `PANEL`, Frame bevel, S5 at 2:3 |
| B7, AD-09, AD-08, AD-10 | medium, low | §9 logo, roundel, sprite on the rail |
| B8 | low | §3 route wrapper |
| B9, B10 | low | §9.4 title separator, OG image |
| M6, AD-11 | medium, low | §4.1 meter with reserved height; `min-h-[100svh]` is dropped from the reveal section |
| M7, AD-06 | medium | §4.5 card motion and sizing |
| M8 | medium | §4 S1 motion |
| M9 | low | S2 failure, manual stagger, S5 on view, paw stops after 4 cycles |
| M10 | low | §4.2 reduced-motion photo badge |
| story-05, story-06 | medium | §9.3 and §4.5 share text |
| story-07, UX-07 | medium | §4.5 sticky bar: Share, Play and More |
| story-08, UX-05 | medium | S2 copy and the meter's third segment |
| story-09 | low | §4.5 guest note split |
| story-10 | low | S5 copy |
| UX-04 | medium | one name field plus the pencil |
| UX-06 | medium | §4.2 pending target |
| UX-08 | medium | manual pick: preselect, base 6 first, sticky CTA |
| UX-09 | low | S2 failure panel inside the first viewport |
| FUN-3, AD-05 | medium | §3 altar placement, shadow, integer scale |
| story-11, UX-11 | low | §12 raise |

---

## 14. Acceptance criteria

### 14.1 Automated
- `cd client && npx tsc --noEmit && npx eslint . && npm test` pass. Updated or new suites:
  - `yourcat-flow`, `yourcat-copy`, `yourcat-card-layout`, `yourcat-share`, `yourcat-utm`,
    `yourcat-api`, `yourcat-contract`, `yourcat-analytics`;
  - new: `yourcat-stage`, `yourcat-sprite-sheet`, `yourcat-motion`, `yourcat-reveal-clock`,
    `yourcat-share-card`, `yourcat-screens`.
- `cd backend && npm run lint && npm run build && npm test` pass. `yourcat.controller.spec.ts`
  covers:
  - the public route: shape, no private fields, 404 for a bad or unknown id;
  - the per-IP limit;
  - the share id set on create and backfilled once.
- `node tools/copy-lint/bin/copy-lint.mjs` passes on `client/components/yourcat` and
  `client/pages/yourcat.tsx`.
- Playwright `client/e2e/yourcat.spec.ts` (route mocks only):
  - the existing flows, with new selectors;
  - the friend view (`?cat=`), including the 404 fallback to S1;
  - reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`): the cat can be pet, there is
    no burst canvas, and the photo badge shows;
  - CLS < 0.05 at 390x844 and 1440x900 from S1 to S3;
  - at 390x844 (consent cookie set) after the reveal: the card preview's top is ≤ 560 px and the
    Share button is fully visible with no scroll;
  - at 1440x900: the card, the toggle and the primary action are all within `y ≤ 900`;
  - no element overflows horizontally at 360, 390 and 1440;
  - grep tests: no `framer-motion` or `phaser` import, and no `GOLD_BUTTON`, `GHOST_BUTTON`,
    `EYEBROW` or `TOKEN TAILS` eyebrow in `components/yourcat`.
- The card unit tests (fake 2D context):
  - the shelter `drawImage` destination is 2:3;
  - the avatar destination is 672 or 576;
  - the sprite, the cream frame and the heart sit below the portrait, feet on the ground line;
  - the title is uppercase with the cream glow; the nebula is cropped from x 0.15;
  - every rect is inside the safe area;
  - the logo is drawn at 337/600, with the text fallback when it is null;
  - smoothing is on for the shelter art and off for the avatar and sprite.
- The clock unit test (fake rAF and fake canvas): the block order `4, 8, 16, 32, 48`, then the
  cross-dissolve at 48, then `24, 12, crisp`; the cues `hold`, `stepOut`, `title` and `done` fire at
  0, 1050, 1170 and 1450 (±1 frame); the gold `color` composite is used during the crack.

### 14.2 Screenshot checks
Save to `…/scratchpad/polish-shots/final/` (mocks; at most 1 real upload, for the final sanity check).
For each check, `m-` is 390x844 and `d-` is 1440x900.

| File | Pass when |
|---|---|
| `m-s1.png`, `d-s1.png` | Lockup in the header (no live "TOKEN TAILS"); painted sky and altar; empty gold bevel frame with the dashed silhouette; example cat on the stone; white uppercase H1 with cream glow on "IN THE GAME."; PixelButton CTA above the fold |
| `d-s1-scrolled.png` | Header is night-900/85 with a gold hairline; no blue band |
| `m-s2-a.png`, `m-s2-c.png` | Photo in the same frame at the same position as S1 (diff the frame box: ±0 px); meter segment 1 empty in A, filled in C; motes and the quantise overlay visible in C |
| `m-s2-fail.png` | Desaturated photo, rust segment, reason and both actions inside 844 px |
| `m-s3-0300.png`, `-0900.png`, `-1100.png`, `-1500.png` | 300: gold-tinted big blocks; 900: cat forming from blocks; 1100: cat mid-jump outside the frame with burst particles; 1500: "MEET MOCHI." landed, cat standing on stone, frame unchanged in size |
| `m-s3-settled.png` | Cream Pink Paw frame at 2:3 on the altar; cat sitting and facing it; card top visible; sticky bar with Share, Play as Mochi and More |
| `d-s3-settled.png` | Two columns; card (post), toggle and Share inside 900 px; meeting block under the stage |
| `m-s3-pending.png` | Frame holds the pixelated photo with "Painting your pixel portrait…"; the sprite appears only outside the frame |
| `m-s3-rm.png` | Reduced motion: "Your photo" thumbnail pinned in the frame corner; cat standing; no particles |
| `m-s3-pet.png` | After a tap: loaf frame, hearts, caption "Mochi purrs." |
| `card-story-shelter.png`, `card-post-shelter.png`, `card-post-solo.png` | Nebula background, lockup at the top, bevel frame, crisp even pixel cells (zoom 400%: no uneven columns), the meeting under the portrait: sprite and leaning cream frame standing on the foot plate's horizon, heart above the gap, Zare unsquashed at 2:3 with roundel, uppercase "MOCHI & ZARE" with a cream glow; no vertical beam behind the portrait; the solo post has no empty band |
| `m-s0-friend.png` | Friend's portrait in the frame, friend's cat on the stone, small empty frame "Your cat here", CTA |
| `d-s5.png` | Centred heading, avatar, then arrow, then a 2:3 gilt example with the full costume; four 2:3 thumbnails; PixelButton with the price from the status |
| `m-s6-painting.png`, `m-s6-ready.png` | Veiled 2:3 frame with the sitting cat; then the painted portrait in the frame with Download 4K |
| `m-manual.png` | Base 6 first, the first one selected, sticky Make my cat, preview cat on the stage |

---

## 15. Known issues to raise (not fixed here)
- `layouts/Header.tsx`: the invalid `bg-[rgba(45, 30, 107, 1)]` class (it affects `/cats`,
  `/marketing`, `/stats` and the payout pages).
- `AnalyticsConsentBanner`: on phones it covers the S1 CTA and the S3 share bar on the first visit.
  It needs a scoped compact variant from its owner.
- Each family sheet must follow the `Catbassador.ts` row order. B's test checks the starters and the
  four base colours that are available locally. The CDN families are assumed to be the same, and are
  spot-checked in the e2e mocks only.

---

## 16. Build batches
Each file is in exactly one batch. Paths are relative to the repo root. "New" means the file does not
exist yet; "delete" means the batch removes it. No batch touches the never-touched list in §12, and
none adds `client/public/tail/mascot*`, `client/.vitest/` or `docs/plans/flywheel.md` to git.

| Batch | Owns | Depends on |
|---|---|---|
| **A. Share link** | `backend/src/yourcat/yourcat.schema.ts`, `yourcat.contracts.ts`, `yourcat.service.ts`, `yourcat.controller.ts`, `yourcat.controller.spec.ts`; `client/models/yourcat.ts`; `client/api/yourcat-api.ts`; `client/components/yourcat/utm.ts`; `client/__test__/yourcat-contract.test.ts`, `yourcat-api.test.ts`, `yourcat-utm.test.ts`; `docs/API.md`, `docs/BACKEND.md` | none |
| **B. Brand kit and stage** | new `client/components/yourcat/brand.tsx`, `motion.ts`, `spriteSheet.ts`, `Frame.tsx`, `Stage.tsx`, `PetCat.tsx`, `YourcatHeader.tsx`; `client/components/home/homeSfx.ts`; new `client/public/yourcat/altar-strip.webp`, `client/public/yourcat/logo-text-320.webp`; new `client/__test__/yourcat-stage.test.tsx`, `yourcat-sprite-sheet.test.ts`, `yourcat-motion.test.ts` | none |
| **C. Reveal engine and card** | new `client/components/yourcat/TransformFrame.tsx`, `Burst.tsx`; `pixelateReveal.ts`, `cardLayout.ts`, `shareCard.ts`, `useShareCards.ts`; delete `RevealFrame.tsx`; new `client/public/yourcat/og.jpg`; `client/__test__/yourcat-card-layout.test.ts`; new `yourcat-reveal-clock.test.ts`, `yourcat-share-card.test.ts` | B (`motion.ts`, `brand.tsx` names) |
| **D. Screens S0 to S3** | `client/pages/yourcat.tsx`; `client/components/yourcat/YourCatPage.tsx`, `UploadStep.tsx`, `WorkingStep.tsx`, `RevealStep.tsx`, `useYourcat.ts`, `copy.ts`, `ui.tsx`; `client/__test__/yourcat-flow.test.tsx`, `yourcat-copy.test.tsx`, `yourcat-analytics.test.tsx`; `client/e2e/yourcat.spec.ts`; `docs/YOURCAT.md` | A (API, `buildShareUrl`), B, C |
| **E. Manual, upsell, paid, app** | `client/components/yourcat/ManualPick.tsx`, `PortraitUpsell.tsx`, `PaidState.tsx`, `AppOnlyNotice.tsx`, `PrivacyPanel.tsx`; new `client/__test__/yourcat-screens.test.tsx` | B, D (`copy.ts` names in §11) |

`copy.ts` is in D only. E reads the `MANUAL`, `S5`, `S6` and `PRIVACY` names that D adds (§11). If
E needs a string that §11 does not list, it asks D to add it rather than writing copy in a component.
