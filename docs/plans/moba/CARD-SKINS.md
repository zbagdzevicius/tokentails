# Card skins: a skin-effects ladder built from our Cards

> **Parked 2026-11-12: no Token Tails in Paw Legends** ([NO-TOKENTAILS.md](NO-TOKENTAILS.md)). The founder dropped the
> "Your cats become skins" feature. The game no longer reads the host's roster, featured cats or Meet offer, and the
> host no longer sends them. The card side (§1, §5, §6: cat card skins, Bond, Awakened
> cards, the cards drawer, showcase bots) is parked; its render kit (`render/skins/registry.ts`, `cardFx`, `tierCardFx`)
> stays dormant in the code. The coat rung part (store coats, `coatRung.ts`, `effectKit.ts`) stays live.

Founder ask (2026-11-10, verbatim): "investigate League of Legends ( wild rift ) and mobile legends skins. we already
have Cards with tiers and multiple modifications, can't we adapt them somehow and spark more effects around it ?"

Status: MVP slice (§6) built on branch `feat/pawlegends-card-skins` (on top of `feat/pawlegends-store`), not pushed.
What shipped differs from the plan in the few places listed in §6.5. Market research and the code map that this plan
rests on were done the same day (read-only); the facts used are cited inline with file paths. Paths are relative to
`pawlegends/src/` unless they start with `docs/`, `backend/` or `client/`.

## 1. The short version

- Our Cards already form a rarity ladder (Common, Rare, Epic, Legendary from `render/skins/registry.ts`: card tier or
  play bond, whichever is higher) and already drive small in-match effects (`cardFx.ts`, `tierFx.ts`,
  `tierCardFx.ts`). The ladder is real; the rungs are thin. Every rung today is a tint or a few sparkles. Nothing
  touches recall, death, takedowns, the skill identity layer, ribbons, afterimages or sound.
- Store and pass coats (`render/cosmetics.ts` `PAID_COATS`, branch `feat/pawlegends-store`) are palette plus fur
  pattern and have no rung at all, so the Eclipse "Epic" coat and the tier-30 Sunforged Clem coat show no effects.
- Plan: one **generic effect kit** parametrised by `rung × element × motif`, so every card and every coat gets a full
  set of effects with zero bespoke art. Coats get a fixed rung from their price band; cards keep earning theirs from
  the real cat and from bond. Legendary cards with full bond get an **Awakened** form that levels up in the match.
- Wild Rift and MLBB sell desire through what other players can see: ability effects, recall, kill and multi-kill
  effects, borders, and progression you can show off. We copy that structure, never their art, and we skip their
  luxury gacha (GDD §8.1 #2, decision #19, EU loot-box rules).

## 2. What Wild Rift and MLBB teach (only what we use)

| Lesson | Source pattern | Our version |
|---|---|---|
| A tier must add something players notice, not subtle polish everywhere | Riot State of Skins: "it doesn't matter if we go and adjust every animation if players don't notice" | Each rung adds one headline moment (trail, cast, recall, takedown, awakening) |
| Recall and kill effects are premium markers | MLBB Legend and Collector skins: exclusive recall, elimination effects; WR Legendary | Recall nap at Rare+, takedown stamp at Epic+, multi-kill card at Legendary |
| Progression you can show beats a static skin | WR Awakened Supervillain Jinx, LoL Pulsefire Ezreal, Victorious skins | Awakened form: bond 30 unlocks it, hero level steps it up in the match |
| Clear rarity markers | WR red diamond / green triangle; TFT simplified tiering | One tier word + one "this tier adds" line + a 2 s preview loop (exists: `ui/cardFxView.ts`) |
| Steady base revenue is a monthly flagship, not gacha | MLBB StarLight, WR Wild Pass | Pass top reward is a real Legendary effect coat; later one featured shelter cat a month |
| Effects are the most expensive skin content, and phones turn them down first | Riot Elementalist Lux engineering post; WR performance settings | Per-rung particle and draw budgets, Low falls back to colour only |
| Cheap palette variants sell | WR chromas 300 WC, LoL 290 RP; Lux shared palette | Element chromas already free from owned cats; sold palette chromas are phase 2 |

## 3. The ladder: tier and modifications to concrete render changes

A card carries six modifications (code map, `meta/roster.ts`, `render/skins/*`). Each one gets a job:

| Modification | Where it lives | Its job in the kit |
|---|---|---|
| Tier (COMMON/RARE/EPIC/LEGENDARY) | `meta/roster.ts` `TIERS`; counts only for starter, adopt, redeem, portrait (`registry.ts` `TIER_ORIGINS`) | Which rung's effects are on |
| Bond (3/10/30 matches) | `meta/profile.ts` `noteBond` (local only) | Lifts the rung (exists); bond 30 on a Legendary-tier card unlocks Awakened |
| Element (10) | `ELEMENT_COLOR` in `render/cosmetics.ts` | Secondary FX colour and the element **motif shape** (see table below) |
| Breed family pattern (solid, tabby, points, spots, tuxedo, calico) | `render/skins/families.gen.ts` | Emission **rhythm** of the motif: tabby = stripes (3 in a line), spots = scattered dots, points = tip-only bursts, tuxedo = two-tone (cream + coat), calico = three colours, solid = one ring |
| Variant accent (`hat-samurai`, `bow-tie-red`, ...) | `render/skins/spriteProbe.ts` accent colour | Accent colour of the Legendary flourish; phase 2: a tiny merged accessory part |
| Coat palette | `CatSkin.coat`, `coatGlow()` in `cardFx.ts` | Primary FX tint (exists) |

Element motif shapes all exist in the particle pool (`render/fx/Particles.js` `SHAPE`), one per element so the shape
reads even when another hero's colour is desaturated: FIRE SPARK (ember streak), ICE SHARD, ELECTRIC STAR4 sharp,
WIND FEATHER, DARK SOFT dim, WATER DROPLET, GRASS HEART (leaf stand-in), SAND PUFF (grain), FAIRY STAR5, STELLAR STAR8. The paw print uses the 1-sprite `SHAPE.PAW` instead of today's 5 SOFT particles.

### Per-rung effects

Bold rows are new; plain rows exist today and stay.

| Rung | Effect | Where it hooks | Visible to |
|---|---|---|---|
| **Common** | Coat, eyes, ears, nose on the champion rig, element chest gem | `render/chars/specs.ts` `heroSpec` | everyone |
| **Rare** | Element trim on cape, mantle, armband, blade | `specs.ts` `skinTrim` | everyone |
| | Coat tint (50 %) on hit sparks, dash streak, projectile trail, melee slash | `cardFx.ts` `tinted()` | everyone |
| | **Coat tint on swing and dash ribbons and afterimages (Med/High only, those systems are off on Low)** | `anim/trails.ts`, `anim/ghosts.ts` tint param | everyone |
| | Respawn STAR4 ring | `tierCardFx.ts` | everyone |
| | **Recall nap: one motif ring at the feet while napping (one emission per second, not a loop)** | `tierFx.ts` recall hook | everyone |
| **Epic** | Cast sparkle (6), footfall glint, respawn column, idle twinkle | `cardFx.ts`, `tierFx.ts`, `tierCardFx.ts` | everyone |
| | **Skill identity layer tinted: the per-skill identity/nature motif (not the core painter) mixes 50 % toward the coat glow** | `render/skillfx/identityFx.ts` `drawIdentity` → `motifColors` | everyone |
| | **Element motif on hit sparks: 1 motif sprite added inside the default impact flash on ability hits** | `render/effects.ts:498` | everyone |
| | **Takedown stamp: 4 motif sprites at the victim, family rhythm** | `render/effects.ts:819` | everyone |
| | **Death: the death ghost takes the coat tint** | `render/fx/lifecycle.ts` (already reads `card.tint` for respawn) | everyone |
| **Legendary** | Foil sheen (Med/High), paw-print hit burst, takedown flourish, paw wave in the ult, recall-land ring, card flash on respawn | existing | everyone |
| | **Recall: card-flip glyph (one lifecycle sprite quad, `fx/lifecycleSprites.ts`) over the curled cat, paw ring on land** | `tierFx.ts` recall hook + lifecycleSprites | everyone |
| | **Multi-kill card: double / triple / quad paw burst above the killer (1 PAW + 6 STAR8 per step), killer's own screen only** | `render/effects.ts` takedown + `render/juice.ts` banner rail (event-driven DOM, never per frame) | killer only |
| | **SFX swap: the takedown and recall-land cues get a pitch-shifted meow or purr layer from the existing bank** | `audio/sfx.ts`, `audio/identityMix.ts` | everyone in earshot, own hero louder |
| | **Foil colour from the element instead of cream (one uniform value change)** | `render/chars/charMaterial.ts` `uFoilColor` | everyone |
| **Awakened** (Legendary tier + bond 30; not a new `Tier` value) | **Stage 1 at hero level 4 (the ult unlock), stage 2 at 7, stage 3 at 10: foil strength 0.18 (stage 0) → 0.2 → 0.24 → 0.3, always above a plain Legendary's 0.15, so Awakened reads from the first second; stage 2 adds the element motif to the ult paw wave; stage 3 adds a one-off "awakening" burst (12 motif + 1 card glyph) and a cream rim pulse for 1 s** | `charMaterial.ts` `uFoil`, `cardFx.ts` `signature`, level read from the render snapshot | everyone |
| | **Card frame upgrades per stage on the pick, versus and MVP screens (frame art: Kitten, Brave, Legend footer words)** | `ui/cards/frame.ts`, `ui/cards/vars.css` | DOM, out of match |

Why Awakened is not a new tier: `Tier` is duplicated in backend and client (`CLAUDE.md`: update every copy). A form
flag on the skin record (`CatSkin.awakened: boolean`) gives the same player result with one render-side field.

### Readability rules (unchanged, now cover the new effects too)

- Same footprint: every new emission sits inside the default flash, ring or wave radius. Nothing enlarges a hitbox
  read, nothing covers a telegraph or a `GroundDecals` mark, no new ground aura (the 8 aura slots carry gameplay).
- Colour only on the core skill painters. The 22 `render/skillfx/*.ts` painters keep their own constants; only the
  identity layer on top of them is tinted. The enemy ult keeps its red danger wave.
- On another player's hero the drawn colour passes `trimForTeam` (never gold, never within 25° of the opposing hue).
  It also keeps the friend-or-foe read for this viewer (`SkinFxProfile.mate`): an enemy's colour is never within 25° of
  `RELATION.ally` blue and an ally's never within 25° of `RELATION.enemy` / `danger` red (saturation 0.35 when it is).
  The death ghost keeps its ally / enemy mix and takes the coat tint at 25 % only.
- No effect from a stealthed hero. Team fights (4+ heroes within 12 m) drop other heroes' extras, as today.
- The `skinFx` setting (`all` / `mine` / `off`) governs every new effect, and multi-kill cards are killer-only.

## 4. Phone cost budget per rung

Phones play Medium-phone, which uses the Low particle budget (`render/quality.ts:93`; `VFX_TIERS` low = 800 particles,
countScale 0.6). Measured whole-frame VFX CPU is 0.10 ms (`docs/plans/moba/PERF-IOS.md` §8.3). The kit stays inside
today's caps: `COSMETIC_MAX` 40 and `CARD_MAX` 60 live particles, skip at 80 % pool fill. No new draw calls, no new
shader program keys, no per-frame DOM.

| Rung | New particles per event (High / Low) | Live cap per hero | New draws | CPU target | Low-tier fallback |
|---|---|---|---|---|---|
| Common | 0 | 0 | 0 | 0 | identical |
| Rare | recall 6 / 4 per second; ribbons, ghosts tint only | 8 | 0 (ribbons, ghosts already batched) | < 0.005 ms | tints only; ribbons and ghosts are off on Low anyway; recall ring own hero only |
| Epic | cast 6 / 4, ability hit +1 / 0, takedown 4 / 2 | 16 | 0 | < 0.01 ms | own hero: cast 4, takedown 2, no hit motif; other heroes: tints only |
| Legendary | paw burst 1 (was 5), multi-kill 7, recall card glyph 1 quad, ult paw wave 6 PAW (was 30) | 24 | 0 (all kit sprites go through the existing Particles.js pool) | < 0.02 ms | own hero: paw burst, recall glyph, multi-kill; no foil; SFX layer kept (audio is not GPU) |
| Awakened | stage burst 13 once per stage | 24 (shared with Legendary) | 0 (foil is a uniform) | < 0.02 ms | foil stays at 0 on Low; stage burst own hero only; frame upgrade (DOM, out of match) always |

Total kit ceiling per match: unchanged 60 card particles + 40 tier particles; replacing the 5-sprite paw with
`SHAPE.PAW` frees ~80 % of today's Legendary spend, which pays for the new Epic and Legendary moments.

Memory: no new textures in the MVP. The card-flip glyph is one cell added to the existing lifecycle atlas (target
≤ 8 KB webp). Phase 2 accessories are merged geometry (≤ 300 triangles each, no texture).

## 5. Earned vs sold

| Source | What it sets | Can be bought in Paw Legends? |
|---|---|---|
| A real Token Tails cat (starter, adopt $5, redeem, portrait) | Card rung = cat tier | No. The game never sells or names packs (GDD §7.2, §8.1 #2). Pack cats stay Common (decision #19) |
| Bond (matches played with the card) | Rung lift 3 / 10 / 30; Awakened at 30 on a Legendary-tier card | No. Earned only |
| Store coat | Fixed rung from the price band | Yes (web only; native app shows no price or buy button) |
| Legends Pass row | Fixed rung per reward | Pass $7.99 / Pass+ $19.99 |
| Treat Track (free) | Common or Rare coats | No |

Awakened is never sold and never on a coat. That keeps the best-looking form tied to a real shelter cat plus play,
which is our story and Riot's "meaningfully difficult to earn" rule in one.

Bond lives in localStorage and can be faked. That is fine while it only lifts looks a player could earn for free.
Paid rungs come from server entitlements (`PawlegendsOwned`), never from bond, so faking bond cannot unlock a sold
look. Before Awakened shows to other humans in PvP, move bond to the server (`/live` already counts matches per slot).

### Coat rungs and price bands

| Band | Price | Rung | Items today |
|---|---|---|---|
| Free row / Treat Track coats | free | Common | 6 S1 free-row coats, `coat.frankie.corndog`, `coat.bravo.opera` |
| Store patterned coats, pass premium coats | $2.99 (store) / in Pass $7.99 | Rare | 16 store coats, 21 premium pass coats |
| Pass+ exclusive, new Epic store coats | in Pass+ $19.99 / $7.99 single | Epic | Eclipse Duchess; 2 new store coats (MVP) |
| Pass tier 30, new Legendary store coats | in Pass $7.99 (tier 30) / $14.99 single | Legendary | Sunforged Clem; 2 new store coats (MVP) |
| Sets | $14.99 (unchanged) | contents keep their rung | cat and dog S1 sets |

GDD §8.5 planned Epic $9.99 and Legendary $19.99 with new model parts and voice. Our MVP effect coats have no new
model, so $7.99 / $14.99 is the honest price; $9.99 / $19.99 stays reserved for phase 2 coats with accessories.
Lifting the existing $2.99 coats from "patterned Common" to Rare is a free upgrade to buyers (tints only; zero cost).

## 6. MVP slice (buildable now)

Owner: the store lane owns `render/cosmetics.ts` and `money/catalog.ts` (branch `feat/pawlegends-store`); build this
on that branch after it merges, or on top of it in coordination. Nothing touches `sim/`, the replay record or the
backend verifier.

### 6.1 Files

| File | Change |
|---|---|
| `render/skins/effectKit.ts` (new) | `SkinFxProfile` resolver and the shared motif emitter (`emitMotif(profile, pos, n, rhythm)`), preallocated, no per-frame allocation |
| `render/skins/coatRung.ts` (new) | Adapter: `PAID_COATS` id → `SkinFxProfile` (rung from `COAT_RUNG`, element from the coat's accent hue or an explicit field, motif from `Coat.pattern`) |
| `render/cosmetics.ts` | `PAID_COATS` rows gain `rung` and `element`; 4 new store coat palettes |
| `money/catalog.ts` + `backend/src/pawlegends/pawlegends-catalog.ts` | 4 new SKUs (`pl_coat_<hero>_<key>` at 799 and 1499 cents); keep both copies equal (existing mirror test) |
| `render/views/heroView.ts` | `cardOf()` returns a profile from either the card skin or the worn coat (a card skin wins when both exist) |
| `render/skins/cardFx.ts` | Read `SkinFxProfile` instead of `CatSkin`; paw burst → `SHAPE.PAW` (1 sprite); takedown stamp, multi-kill, hit motif |
| `render/skins/tierFx.ts`, `tierCardFx.ts` | Recall nap ring (Rare+), recall card glyph (Legendary), Awakened foil steps |
| `render/skillfx/identityFx.ts` | `motifColors` mixes the hero's profile tint at Epic+ (one optional argument) |
| `anim/trails.ts`, `anim/ghosts.ts` | Rare+ tint through existing tint params (Med/High) |
| `render/fx/lifecycle.ts` | Death ghost tint at Epic+ |
| `render/chars/charMaterial.ts` | No new uniform; `uFoil`/`uFoilColor` driven per stage (program key unchanged) |
| `audio/sfx.ts` | `cardLayer(kind: 'takedown' \| 'recall', rung)` pitch-shifted meow/purr from the existing bank, Legendary only, rate-limited 1 per 2 s per hero |
| `render/skins/skinStore.ts`, `registry.ts` | `CatSkin.awakened` (Legendary tier, bond ≥ 30, tier origin counts) |
| `ui/cards/frame.ts`, `vars.css`, `cardFx.ts` copy | Awakened stage footer words; `cardFxDetail` lines for the new effects; coat cards in the store sheet show the rung word and the existing preview loop |

### 6.2 Data shape

```ts
// render/skins/effectKit.ts
export type Motif = 'ring' | 'stripes' | 'dots' | 'tips' | 'twotone' | 'tri';   // from the fur pattern
export interface SkinFxProfile {
  rung: CatTier;                 // COMMON..LEGENDARY (no new Tier value)
  element: Element;              // motif shape + secondary colour
  motif: Motif;                  // emission rhythm
  tint: number;                  // coatGlow(), team-safe for other heroes (trimForTeam)
  accent: number;                // variant accent or coat accent
  awakened: boolean;             // cards only; never true for a coat
  source: 'card' | 'coat';
  self: boolean;
  team: 0 | 1;
  extras: boolean;               // tierFx caps: setting, Low, team fight, stealth
}
// render/cosmetics.ts PAID_COATS row
{ hero, name, coat, from: 'store' | 'pass', rung: CatTier, element: Element }
```

### 6.3 Coats upgraded and added

| Coat | Rung | Element | What it now shows |
|---|---|---|---|
| Eclipse Duchess (`coat.duchess.s1_eclipse`, Pass+) | Epic | DARK | Violet-gold ribbons, dim SOFT motif on casts and ability hits, tinted identity layer, takedown stamp in points rhythm, tinted death ghost |
| Sunforged Clem (`coat.clem.s1_sunforged`, Pass tier 30) | Legendary | FIRE | All of Epic + ember-coloured foil, paw bursts, recall card glyph, multi-kill card, purr layer on recall. Only for its owner: on other heroes the gold is pushed off by `trimForTeam` |
| New store: Moonwhisker Pixel | Epic $7.99 | STELLAR | STAR8 motif, spots rhythm |
| New store: Frostbell Marshmallow | Epic $7.99 | ICE | SHARD icy motif, calico three-colour rhythm |
| New store: Thunderpaw Brutus | Legendary $14.99 | ELECTRIC | sharp STAR4 motif, tuxedo two-tone, full Legendary set |
| New store: Bloomtail Sage | Legendary $14.99 | GRASS | leaf/heart motif, tabby stripes, full Legendary set |

Names and palettes are original (cats and dogs from our own roster). The founder may rename them.

### 6.4 Tests (targeted; the machine is loaded, run only these)

- `tests/unit/card-fx.test.ts`: extend to wear each of the 6 coats above and a Legendary awakened card; the replay
  hash must equal the no-cosmetic run.
- `tests/unit/determinism.test.ts`: import-graph check also covers `effectKit.ts` and `coatRung.ts` (the sim never
  imports them).
- New `tests/unit/effect-kit.test.ts`: profile resolution (card beats coat, pack cat stays Common, coat rung never
  reads bond, awakened only with tier origin + bond 30); live particle count never above `CARD_MAX` / `COSMETIC_MAX`
  over a scripted 60 s team fight; zero allocations in `update` (count via a pooled-object spy); Low tier emits
  only own-hero extras; every drawn colour on another hero passes `trimForTeam`.
- `tests/unit/store-pass.test.ts`: every `PAID_COATS` row has a rung and an element; game and backend catalogue
  mirrors still equal; native build still has no price.
- One manual phone check: the PERF-IOS §8 probe scene on an iPhone 12-class device, frame time within today's ±0.2 ms
  with every hero Legendary.

Run: `npx vitest run tests/unit/card-fx.test.ts tests/unit/effect-kit.test.ts tests/unit/store-pass.test.ts
tests/unit/determinism.test.ts`, then `npx tsc --noEmit`.

### 6.5 As built (2026-11-10)

Built as specified, with these differences:

- **Profiles.** `SkinFxProfile` also carries `id` (hero slot, for per-hero caps), `stage` (Awakened stage from the
  hero level), `elementTint`, `cream` (team-safe highlight: pure cream reads as a hue at full saturation) and `low`.
  `coatRung.ts` has `skinFxFor()` (card first, else coat). HeroView caches each slot's profile and rebuilds its colours
  only when the look, skin revision, viewer relation or hero changes.
- **Ribbons and afterimages** are tinted where they are started (`anim/director.ts` `trailOn` / `ghost` cues, through
  `FxCtx.card`), not inside `trails.ts` / `ghosts.ts`: those take a colour already. The identity layer reads the same
  `FxCtx.card` hook.
- **Legendary takedown flourish** is 3 cream + 3 coat stars (was 10) so a takedown, a cast sparkle, a paw hit and the
  ultimate's wave fit one hero's 24-particle cap together. Per-hero caps (8 / 16 / 24) apply to the kit's emissions on
  top of `CARD_MAX` and `COSMETIC_MAX`.
- **Recall card glyph** is a spinning `SHAPE.PAW` sticker (no new atlas cell yet); the Awakened stage-up uses the same
  glyph plus 12 motif sprites. The cream rim pulse was not built.
- **Meow / purr** are two new synth defs (`cardMeow`, `cardPurr` in `audio/sfx.ts`): the bank had no cat voice.
  `sfx.cardLayer()` plays them on a Legendary takedown and recall landing, at most once per 2 s per hero.
- **Motif shapes:** one per element (§2): FIRE `SPARK`, ICE `SHARD`, WIND `FEATHER`, WATER `DROPLET`, SAND `PUFF`,
  FAIRY `STAR5`; no two elements share one.
- **Ground sprites:** the particle material depth-tests, so ground-level sprites sit at `size / 2 + 0.05` (flat motifs
  in `MotifEmitter.emit`, the ult wave paws). The wave paws stay put (`glyph(..., rise = 0)`) and read as prints.
- **Coat elements:** the six effect coats name theirs; every other Rare coat takes the element nearest its accent hue
  (`nearestElement` in `render/cosmetics.ts`).
- **Awakened in the frame:** `cardFrame({ awakened })` (footer "Awakened" at stage 0, else "Kitten / Brave / Legend · Awakened"; stronger glow);
  wired into the results MVP card (the player's own stage at match end). The pick and versus screens do not pass it yet.
- **Previews:** `mountSkillPreview(..., { look })`; the champion browser opened from the pick screen passes the
  player's chosen look; the dev lab takes `?coat=<id>` or `?card=<demo cat>&bond=30`, and `&level=<n>` (`mountSkillPreview(..., { level })`).
  The preview plays at hero level 4 (Awakened stage 1) unless a level is given.
- **Store:** the Coats tab lists the four effect coats first with their tier word and a one-line "what it adds".

Evidence: tier stills and 6-frame loops in `docs/plans/moba/card-skins/` (`<tier>.webp`, `<tier>-anim.webp`; script
`capture.mjs` there): every tier on Clem's ultimate at 720x480, the still at the hit, Awakened at hero level 10.
Brutus (Thunderpaw): his armour, jacket, cape and mantle cover most of the body, so any coat (store or free) shows on
the pug head and tail only; the team cloth (Woof ochre) is what reads orange. The coat is applied (`lookCoat`). Perf numbers are in the branch's hand-off note; the real-phone PERF-IOS §8 check is still open.

### 6.6 Coat parts: Epic and Legendary coats change the model (2026-11-14)

Before this, a coat in a match only recoloured the model (Dawnblade and Pink Bow excepted). Now every Epic and
Legendary coat adds code-built parts that follow its painted art in the skins library (brandbook v6 `skins/img`), plus
its own effect colours:

| Coat | Parts (render/chars/coatParts.ts) | Effect glow / accent (render/skins/coatVfx.ts) |
|---|---|---|
| Sunforged Clem | sun halo with flame rays behind the head, sun medallion on the plate, sun-ray pauldron flares, magenta battle skirt | sunrise orange / magenta |
| Thunderpaw Brutus | gold bolt across the shield face, bolt crests on the helmet sides, bolt emblem on the cape back, bolt on the blade | volt yellow / storm blue |
| Eclipse Duchess | eclipse orb with a gold corona and rays at her shoulder, amethyst tiara crest, rose brooch | violet / gold |
| Frostbell Marshmallow | ribbed mustard knit cuff on the hat, snowflake pin, frost bell on the scarf, ice crystal on the tail | ice blue / mustard |
| Moonwhisker Pixel | crescent moon round the antenna bead, gold stars on the box front and sides, tail star | lavender / moon gold |
| Bloomtail Sage | flower crown on the hood, leaf pauldrons (replacing the plate domes), bloom on the tail tip | petal pink / leaf green |

Rules: parts are vertex-coloured pieces on the hero's one skinned mesh (no extra draw call); ≤ 6k triangles at Med
with a chroma on top; Low (detail < 0.9) keeps the signature pieces and drops the trims (≤ 260 extra triangles); the
team colour stays on hoods, helmets, mantles, capes, hat crowns and box flaps. Another player's hero draws the effect
colours team-safe (`trimForTeam`). The store's coat line names the parts. Test: `tests/unit/coat-parts.test.ts`
(every Epic+ coat declares parts and colours, the mesh changes, budgets, a Rare coat stays a palette swap); e2e
`tests/e2e/coat-parts.spec.ts` (the coat is worn in a bot match; `COAT_SHOTS=<dir>` saves screenshots). Dev views:
`/landing-portrait.html?hero=<hero>&coat=<id>&turn=<rad>` and `/gallery.html?hero=<hero>&coat=<id>&cam=game`.

### 6.7 Coat signature effects: ultimate, recall and takedown per coat (2026-11-14, gaps3 coat-fx)

Wild Rift and Mobile Legends skins change the ultimate, the recall and the takedown, not only the colours. Every Epic
and Legendary coat now has its own three effects in its theme, and every Rare coat the shared Rare set in its own
colours and element motif (render/skins/coatFx.ts; words in render/skins/coatThemes.ts):

| Coat | Ultimate | Recall (nap, landing) | Takedown |
|---|---|---|---|
| Thunderpaw (L) | three bolts strike round the ring, sparks run out, a storm ring | storm crackle; a bolt brings him home | a bolt strikes the fallen |
| Sunforged (L) | a sun rises, rays sweep out, magenta embers | a flame halo over the head; a sunrise | a sunburst |
| Bloomtail (L) | a petal storm swirls out of an opening bloom | petals drift down; a bloom | a flower opens, leaves fall |
| Eclipse (E) | a violet corona, a gold ring, gold motes | an eclipse orb circles; the eclipse ring | a dark ring, gold motes |
| Moonwhisker (E) | a star shower under a pale moon | stars twinkle; stars fall | stars fall on the fallen |
| Frostbell (E) | ice shards, snow, the frost bell | snow falls; a frost ring and the bell | shards burst, the bell |
| every Rare coat | a motif ring in the coat colour | (the kit's motif nap); a motif ring on landing | a 3-motif stamp |

A coat's ultimate replaces the card paw wave and its takedown replaces the card stamp (a card skin keeps those).
Budgets: every sprite goes through the two pooled particle meshes (no draw call); a Legendary ultimate adds at most
one pooled shockwave (the paw wave's); each effect has a declared cost inside the hero's rung cap (Legendary 24,
Epic 16, Rare 8; `COAT_COST`), COAT_MAX 48 live in all, skipped above 80 % of a pool. Low draws about half, no
shockwave, bolts on the player's own hero only; another player's hero only with `extras` (Med / High, outside a team
fight, not stealthed, the Skin effects setting). Colours are the profile's team-safe ones.

Preview: the champion browser has a Coats tab (Home → Heroes, and the store coat detail's "Preview effects"): the
champion's Rare+ coats as chips, and Ultimate, Recall and Takedown clips in the live preview (ui/preview/skillSandbox.ts
`CoatClip`: the recall naps the full channel and lands back in the box; the takedown swings at a dummy one hit from
down). No price in the browser. Tests: `tests/unit/coat-fx.test.ts`, `tests/e2e/coat-fx.spec.ts`; the perf spec
runs with `skins=legendary,coats` (the heroes with a themed coat wear it). Captures:
`docs/plans/moba/coat-fx/capture.mjs` (stills and animations of every coat and clip, and a Low-tier A/B).

## 7. Phase 2 (not in the MVP)

- Peer looks in PvP/party: read the relay's `cosmetics.heroSkins` and the planned `party.look` so others see your card
  and coat (STORE-PASS.md "Not in this MVP"). Until then, richer effects are seen by you and by bots' viewers only.
- Server-side bond, then Awakened visible to other humans.
- Accessories from the sprite variant (hat, bow, collar) as merged geometry; these justify the $9.99 / $19.99 bands.
- Lifetime takedown counter per cat on the card footer, MVP card and kill feed (out-of-match DOM).
- Collection level: points per owned card tier unlock profile borders and titles.
- One featured shelter cat a month as the pass Legendary, moving to the store afterwards.
- Sold palette chromas ($0.99–1.99) using one shared palette per element.
- The GDD §7.2 claim "owning a FIRE cat gives fire VFX on Clem" is not true in code today (chroma dyes the cape and
  adds the ground aura only). The MVP makes the card's element drive the identity layer and the motif, which is the
  closest honest version; update GDD §7.2 when it ships.

## 8. What we deliberately do not copy

- No gacha, wheels, draws, pity counters or duplicate conversion (MLBB Magic Wheel and Exquisite Collection, LoL
  Sanctum and Exalted). Every reward is listed and bought or earned directly.
- No other game's characters, skin lines, names, art, effects, sounds, rarity icons or UI. Our motifs are our own
  shapes (paw, fish, heart, star) on our own cats and dogs; card frames are Token Tails art.
- No look that changes gameplay: no bigger effects, no new hitbox reads, no hidden telegraphs, no stat or cooldown
  changes. The sim and the replay never see a cosmetic.
- No FOMO luxury tier and no time-limited Awakened forms. Awakened comes from a real cat plus play.
- No pack links, names or advertising in the game, and no look that depends on pack luck.

## 9. Your call (defaults apply if no answer)

| Question | Default |
|---|---|
| Lift the 16 store and 21 premium pass coats to Rare (tint only) | Yes |
| New Epic and Legendary store coat prices | $7.99 / $14.99 (no new model parts yet) |
| Coat names for the 4 new effect coats | as in §6.3 |
| Multi-kill card visible to the killer only | Yes |

## Chromas and the food coats (gaps4 coats-tests, 2026-11-14)

**Chromas** (`render/skins/coatChromas.ts`): every coat with its own palette (Treat Track, store, Legends Pass and
effect coats, about 90) has four chromas, Rose, Jade, Amethyst and Gilded. A chroma keeps the coat's pattern, model
parts and effects and dyes the fur: base, shade and patch take the chroma's hue at their own lightness (clamped so a
white or black coat still shows it), the belly fur keeps most of its colour, the accent takes the chroma's second
colour.

- Earned only, never sold, the same on the web and in the apps: finished matches wearing the coat (not Practice)
  unlock them at 1, 3, 6 and 10 matches. The counts are local (`Profile.coatPlays`, at most 200 coats); a chroma only
  recolours a coat the player owns (`resolveLook` drops it otherwise), so a faked count never unlocks a sold look.
- The look carries it as `Look.dye` (profile `looks[hero].dye`); `lookKey` adds `|<dye>` so the geometry cache, the
  lobby and the portraits rebuild. A new coat starts in its own colours.
- Where: the pick screen's Look sheet (swatches under the coats; a locked one is greyed and says how many matches
  earn it), Heroes → Coats (preview any chroma on the clip; Wear an earned one on an owned coat), the store's coat
  detail (four swatches; a tap previews that chroma in Heroes → Coats), and the results ("New chroma: Rose
  Patchwork Calico coat").
- Render only: the sim, the replay and the hash never see a chroma.

**Food coats** (Epic, $7.99 in the web store like the other Epic effect coats; nothing sold in the apps):

| Coat | Model parts (`render/chars/coatParts.ts`) | Ultimate | Recall | Takedown |
|---|---|---|---|---|
| Club Sandwich Clem | a club sandwich hat with a toothpick flag and olive, a lettuce ruff, toast pauldrons, a pickle on the blade | a sandwich stacks up, crumbs fly | crumbs drift, a sandwich lands | a toothpick flag pins the fallen |
| Kebab King Frankie | a gold crown with a little skewer, a kebab skewer along his back, a chili on his tail | sizzling skewers spin, grill flames, steam | steam rises, a flame ring | a skewer drops, spice flies |

Painted store art was made with Gemini (gemini-3-pro-image-preview, the brand-book skin splashes as style references)
and encoded like `tools/import-skin-art.mjs` does (`pawlegends-web/public/pawlegends-art/skins/`).
