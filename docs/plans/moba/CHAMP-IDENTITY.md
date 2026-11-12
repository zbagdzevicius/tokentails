# Pawlegends: champion sound and visual identity

> Names (Nov 12, 2026): the shelter champions have English names in the game. Raspberry, Gabby and Bengal were Avietė, Gabė and Bengas (Lambo kept his name); hero ids stay `aviete`, `gabe`, `bengas`. The real Pink Paw cats keep their own names, written in plain letters (Aviete, Gabe, Bengas).

Founder request (Nov 9): "create sound effects that are tied per-champ rather than generic. also do the same for
skills - each skill nature type should have it's own effects that ties with their nature. also each champ should have
their own individual trait around which skills should be based on in terms of visual effects (so I could understand
and remember which skills are of which champs)."

Data: `pawlegends/src/data/identity.ts` (every recipe below, as zzfx arrays and colours).
Test: `pawlegends/tests/unit/champ-identity.test.ts` checks that every hero and skill is covered, that the sounds are
short and under the volume caps, that reused voices match `PL_SFX`, that the 20 colour pairs are distinct and away from
the relation colours, and that the Q/W/E/R names match the kit docs. Render and audio only: the sim never reads it.

## 1. The two layers

Every skill plays two layers at the same moment:

1. **Nature: what the skill does.** One sound family and one VFX grammar per nature, shared by all heroes. A frost
   skill always crunches and sheds shards. A guard skill always bloops up a dome and clangs when hit. A player who has
   never seen a hero can still read a skill by ear: "that was a slow", "that was a shield".
2. **Trait: whose skill it is.** Each hero has one signature motif (sun rays, feathers, frisbees, Zzz...), a colour pair,
   a timbre (kalimba, kazoo, tuba...) and two short synth voices: one for the basic attack, one for the ultimate. The
   motif sits on top of the nature effect in every one of that hero's skills, so the motif tells you who cast it and
   the nature tells you what it does.

Rims, telegraphs and ground warnings keep the relation colours (ally blue, enemy red, "you" gold) through `fx.rim`.
Signature colours only fill motif particles, projectile cores and trails. That keeps team reads intact.

## 2. Skill natures (14)

zzfx order: `[volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]`.
Full arrays are in `NATURE` in identity.ts. Below, each recipe is described in words.

| Nature | Reads as | Cast sound | Travel loop | Impact sound | VFX recipe (shape · motion · timing · mark) |
|---|---|---|---|---|---|
| slash | melee claw, swipe, bite | high-passed noise swish rising, 0.12 s | none | short claw tick, low-passed noise, 0.12 s | SPARK · crescent sweep across the real cone, sparks fly outward · 0.18 s sweep · scratches |
| impact | slam, landing, bump, knockback | 80 Hz sine thump, crushed, 0.3 s | none | 55 Hz noise boom, 0.33 s | PUFF · one shockwave at the true radius, dust kicks out and settles · 0.25 s ring · crater |
| projectile | thrown or shot object | triangle "pew" falling from 900 Hz | soft triangle whirr, tremolo, low-passed | small noise pop-tick | SOFT core plus a motif trail every 0.05 s, star burst on hit · flight time |
| fire | burn, area denial | noise "fwoomp", low-passed, rising | crackle (noise with tremolo, high-passed) | high sizzle | SPARK embers rise and flicker, heat-glow disc · 0.3 s flare · scorch |
| frost | slow, freeze | 1.8 kHz crystal ting with a jump | sine shimmer (fast vibrato) | icy crunch, high-passed noise | SHARD spray drifting down, pale frost ring · 0.4 s · frost ring |
| splash | water, tears, ink, goo | rising sine "bloop" | none | wet splat, low-passed noise | DROPLET arcs under gravity with one bounce, puddle at the real radius · 0.35 s · puddle |
| arcane | stars, fairy magic, charms, marks, beams, traps | two-step sparkle chime | twinkle arpeggio | bell chime with echo | STAR4 twinkle and orbit, converge on hit · 0.5 s · glow |
| shadow | stealth, fear, marks | breathy low noise whisper | none | dark saw thud with a falling jump | SOFT smoke imploding toward the point, the hero dims · 0.35 s · no mark |
| electric | instant shock, blink, beam | square zap falling fast, crushed | 120 Hz square buzz | noise crack | SPARK zig-zag bolt, jittering sparks, one white flash frame · 0.12 s · crackLine |
| sonic | voice, bark, laugh, horn | sine "voice" with vibrato | none | echoing triangle thump | RING concentric arcs along the real cone or ring, NOTE / EXCLAIM glyphs · 3 ripples in 0.4 s |
| heal | restore HP | rising sine with a pitch jump | none | soft two-note bell on the receiver | PLUS marks spiral up from the receiver · 0.8 s |
| guard | shield, damage cut | sine "bloop" rising | none | metallic clang when a hit is blocked | dome or wall rises with a hex shimmer, flashes on each block, SHARD break · held for the duration |
| mobility | dash, blink, hop, leap | rising noise whoosh, high-passed | none | soft landing thud | PUFF dust at take-off and landing, speed lines, 3 motif afterimages · 0.25 s · trail |
| empower | self buff or transformation | saw power-up rising with a jump | none | a small pip when the buff ends | STAR4 light pillar on cast, 3 motif particles orbit the body for the whole buff |

Crowd-control kinds keep their own cue on top (`render/ccCue.ts`: stun, root, charm, fear, sleep), so "it stunned me"
is still told apart from the nature.

### Every skill mapped to a nature

| Hero | Basic | Passive | Q | W | E | R |
|---|---|---|---|---|---|---|
| Clem | slash | empower (Valor) | slash (Paw Combo) | guard (The Stand) | mobility (Tumble) | empower (Golden Hour) |
| Sage | projectile | projectile (Steady Paw) | projectile (Volley) | arcane (Sun Snare) | mobility (Hop Back) | arcane (Moonshot) |
| Sir Brutus | impact | guard (Honour) | impact (Shield Slam) | guard (Front Guard) | mobility (Pug Charge) | sonic (Champion's Challenge) |
| Cacklejaw | slash | shadow (Pack Flank) | slash (Jeer Slash) | sonic (Gloat) | shadow (Bush Slink) | shadow (Pack Hunt) |
| Lambo | impact | guard (Brave With Friends) | splash (Tuna Toss) | guard (Big Hug) | impact (Belly Flop) | electric (Tangled Lights) |
| Raspberry | electric | electric (Shy, Then Shiny) | electric (Spark Swipe) | empower (Shiny Coat) | mobility (Live Wire) | electric (Short Circuit) |
| Bengal | fire | fire (Hot Toast) | fire (Burnt Toast) | arcane (Striking Pose) | mobility (Camellia Hop) | fire (Curtains Up!) |
| Gabby | projectile | heal (Heart Breeze) | heal (Heart Balloon) | guard (Wing Wrap) | mobility (Chase the Wind) | arcane (Under Her Spell) |
| Meatball | impact | guard (Food Coma) | impact (Bowling Roll) | guard (Loaf Mode) | mobility (Big Brother) | empower (Unstoppable Chonk) |
| Pixel | projectile | guard (Cardboard Plating) | projectile (Cap Cannon) | electric (Laser Pointer) | guard (Duck and Cover) | empower (BOXBOT MK II) |
| Duchess | shadow | shadow (Utter Disdain) | projectile (Fluff Puff) | shadow (Not Amused) | mobility (Cushion Glide) | sonic (Royal Decree) |
| Stilts | slash | empower (Long Stride) | mobility (High Leap) | sonic (Ear Swivel) | slash (Swat-Swat) | empower (Zoomies) |
| Nugget | projectile | heal (Treat Pouch) | projectile (Frisbee) | guard (Best Friend) | heal (Sploot) | sonic (Herding Time) |
| Marshmallow | frost | frost (Fresh Snow) | frost (Snowball) | frost (Snow Patch) | mobility (Belly Slide) | frost (SNOW DAY!) |
| Bravo | impact | heal (Dramatic Flop) | splash (Crocodile Tears) | guard (Center Stage) | impact (Stage Dive) | sonic (ENCORE!) |
| Chili | electric | empower (Small Dog Syndrome) | sonic (Yap Yap Yap) | mobility (Tiny Zoomies) | guard (Purse Mode) | empower (BIG DOG ENERGY) |
| Howler | slash | empower (Zoomie Brain) | sonic (AWOO) | mobility (Derp Dash) | guard (Talk Back) | sonic (THE SCREAM) |
| Rocket | projectile | empower (Sighthound) | projectile (Lure Shot) | mobility (Photo Finish) | sonic (SQUIRREL!) | mobility (ZOOM… ZZZ) |
| Frankie | slash | splash (Ketchup and Mustard) | impact (Weenie Roll) | impact (Dig) | mobility (Bun Hop) | fire (FOOTLONG!) |
| Domino | splash | arcane (Spot On) | projectile (Spot Shot) | splash (Splatter) | impact (Big Shake) | arcane (CONNECT THE DOTS!) |

## 3. Champion traits (20)

Each line gives: motif · colour pair (primary / secondary) · timbre · basic voice · ult voice. How the motif shows in
each skill is in `IDENTITY[hero].skills[*].motif`. The headline per skill is below.

| Hero | Signature motif | Colours | Timbre | Basic voice | Ult voice |
|---|---|---|---|---|---|
| Clem | golden-hour sunbursts (STAR8) | #FF9F6B sun peach / #FFE9A8 sunlight | kalimba pluck | 880 Hz pluck | rising C arpeggio |
| Sage | arrow feathers and crescent moons | #5FE6C0 wind mint / #E8F0FF moon white | wooden flute | high fluttered note | rising moon note with vibrato |
| Sir Brutus | heraldic crest stamps | #D6A36A sandstone / #C8CED6 steel | anvil clank | anvil ping | horn call, two notes down |
| Cacklejaw | lime grin crescents, "hee hee" | #3A2A5A shadow plum / #B8F040 acid lime | kazoo cackle | kazoo blat | repeating kazoo cackle |
| Lambo | twinkling string-light bulbs, tuna | #A8B0BC tabby silver / #FFB347 bulb amber | music box | single music-box tink | twinkling lights arpeggio |
| Raspberry | raspberry-tipped static sparks | #C83A8C raspberry / #FFF3A6 static lemon | theremin buzz and static | crushed zap | rising crushed zap swell |
| Bengal | toast crumbs and camellia petals | #B01838 camellia crimson / #E0A050 toast gold | castanets and sizzle | castanet clack | curtain whoosh with crowd crackle |
| Gabby | heart balloons and white feathers | #FF5C9E heart pink / #FFF4FA feather white | wind chimes | glass chime | falling chime spell |
| Meatball | bowling pins and Zzz | #5FB84A basil / #7A68FF sleepy indigo | tuba | tuba "oom" | oom-pah, an octave down |
| Pixel | 8-bit pixel squares, cardboard tape | #3FD8E8 LED cyan / #C89A5E kraft | chiptune | square blip | power-on arpeggio |
| Duchess | tiny gold crowns and fluff | #7A28D0 royal plum / #FFCF4A crown gold | harpsichord | plucked flick | royal flourish |
| Stilts | long paw-print tracks | #B85A30 terracotta / #E9D3A8 savannah dust | bongo | bongo slap | drum roll |
| Nugget | frisbee rings and bone treats | #E0782E corgi orange / #FFB3E0 frisbee pink | rubber squeak and bork | `nuggetSqueak` | `nuggetBork` |
| Marshmallow | snow puffs and flakes | #F6FBFF snow / #9FE8FF ice | sleigh bells | bell shimmer | `marshAwoo` |
| Bravo | spotlights, tears, bows | #B07CFF stage violet / #FFF4DC spotlight | brass trumpet | trumpet blip | `bravoBow` fanfare |
| Chili | chili peppers and anger "!" | #FF6A2A pepper / #6CD04A stem green | high square yap | `chiliYap` | `chiliBigBark` |
| Howler | echo rings and "AWOO" letters | #6E7FA8 storm slate / #E8FFF4 echo white | synth howl | short "wo" | `howlerScream` |
| Rocket | checkered flags and speed streaks | #1E8F4E race green / #FFFFFF checker | race whistle and start beeps | start beep | three start beeps (then `rocketWhoosh` on the sprint) |
| Frankie | ketchup and mustard squiggles | #E8B020 mustard / #E8302A ketchup | slide whistle and cork pop | `frankieYip` | `frankieStretch` |
| Domino | ink spots joined by star lines | #1E1A2A ink / #D8C8FF starlight | marimba | `dominoBoop` | `dominoDraw` |

### How each motif shows, skill by skill

- **Clem.** Basic: a sunburst blinks at the claw tip. Valor: a sun ring fills over her head. Paw Combo: sun-ray streaks, and the 3rd hit is a full sunburst. The Stand: a sun-disc wall. Tumble: tiny-sun afterimages. Golden Hour: a sunset tint, and each wave is a sun-ray fan.
- **Sage.** Arrows shed feathers. Steady Paw: a line of feathers. Volley: feather tails. Sun Snare: a crescent moon trap that closes like a moon phase. Hop Back: feathers drift down. Moonshot: a full moon rises in the wind-up, and the beam is edged with crescents.
- **Sir Brutus.** A crest stamp on every bash. Honour: the shield wears the crest. Shield Slam: crests ring the edge. Front Guard: a giant steel crest wall. Pug Charge: a sand plume and a stamp. Champion's Challenge: a horn call, a jousting circle and a banner tether.
- **Cacklejaw.** A lime grin flashes on each slash. Pack Flank: a grin glyph behind the victim. Jeer Slash: a row of grins. Gloat: "hee" glyphs. Bush Slink: a faint grin left behind, seen only by his own team. Pack Hunt: a big grin over the victim and grin afterimages.
- **Lambo.** A bulb blinks on each bop. Brave With Friends: a light cord to the ally. Tuna Toss: lit bulbs trail the can, and the splat is fish-shaped. Big Hug: shields ringed with bulbs. Belly Flop: a circle of bulbs on landing. Tangled Lights: string lights lasso the pulled heroes.
- **Raspberry.** Raspberry sparks on each hit, and raspberry dots crackle while she is Charged. Spark Swipe: a raspberry-tipped zig-zag edge. Shiny Coat: her coat fills with sparkle. Live Wire: a raspberry dot marks the return point. Short Circuit: the sky bolt splits into raspberry clusters.
- **Bengal.** Shots are glowing toast crumbs. Burnt Toast: a spinning smoking slice. Striking Pose: a camera-flash star, and a camellia over each stunned head. Camellia Hop: a petal swirl. Curtains Up!: crimson curtains over toast-gold flames.
- **Gabby.** A heart rides each breeze shot. Heart Breeze: the heal is a heart on a feather. Heart Balloon: pops into hearts for allies and feathers for enemies. Wing Wrap: feather wings. Chase the Wind: a feather stream. Under Her Spell: a cone of hearts, and charmed heroes float a heart.
- **Meatball.** A pin wobbles over each bump target. Food Coma: Zzz rises from the shield. Bowling Roll: victims spin like pins, and a "strike" bursts on 2+ heroes. Loaf Mode: Zzz and pin icons. Big Brother: pins scatter on landing. Unstoppable Chonk: an orbit of pins, and pins fly on every bump.
- **Pixel.** Square pixel bullets that break into 4 pixels. Plating: taped cardboard that breaks into pixels. Cap Cannon: a cap trailing pixels, with a pixel "!" on reveal. Laser Pointer: a pixel-stepped beam. Duck and Cover: a "loading" ring. BOXBOT: pixels assemble the suit.
- **Duchess.** Plum glare bolts with a crown glint. Disdain: 1-3 tiny crowns, and the Snub drops a crown on the head. Fluff Puff: a crowned fluff ball. Not Amused: crown-point edges. Cushion Glide: a velvet trail. Royal Decree: a scroll and a ring of crowns.
- **Stilts.** A paw print on each target. Long Stride: prints brighten as Stride fills. High Leap: a big landing print. Ear Swivel: a sonar ripple of prints. Swat-Swat: left then right prints. Zoomies: a glowing running track.
- **Nugget.** Bone treats. Treat Pouch: a treat arcs to the ally. Frisbee: a spinning pink ring. Best Friend: a frisbee-ring shield. Sploot: treats bounce up. Herding Time: bark rings with bone glyphs.
- **Marshmallow.** Snow puffs that burst into flakes. Fresh Snow: puffs at her paws. Snowball: a rolling puff that grows. Snow Patch: puffs fall. Belly Slide: a sled track and a snow-shell shield. SNOW DAY!: a puff blizzard, and Frozen heroes become snow-puff statues.
- **Bravo.** A spotlight blink on each bonk. Dramatic Flop: a spotlight, fake tears and a rose. Crocodile Tears: a big tear and a puddle of tears. Center Stage: a spotlight cone from above. Stage Dive: out of a spotlight onto stage planks. ENCORE!: confetti and a bow, and small spotlights on the charmed heroes.
- **Chili.** Pepper sparks on each shot. Rage: one anger "!" per stack, and a pepper crown at 5. Yap Yap Yap: pepper-shaped sound bubbles. Tiny Zoomies: pepper afterimages. Purse Mode: a pink handbag, with peppers puffing out. BIG DOG ENERGY: a pepper burst as he grows.
- **Howler.** An echo arc on each bite. Zoomie Brain: a double echo. AWOO: echo arcs and the word "AWOO". Derp Dash: echoing faces. Talk Back: "woo-woo" bubbles. THE SCREAM: the rings are sucked in on the inhale and blasted out.
- **Rocket.** White streaks with a checker spark. Sighthound: checker squares on long shots. Lure Shot: a mini flag, and a lap number on the revealed hero. Photo Finish: a flash and a finish line. SQUIRREL!: lands on a checker square. ZOOM… ZZZ: start beeps, a checkered streak, then Zzz on a flag.
- **Frankie.** A mustard squiggle on each bite. Ketchup and Mustard: the two squiggles cross into an X. Weenie Roll: a spiral trail. Dig: pops up out of mustard. Bun Hop: crumbs and a zig-zag. FOOTLONG!: a sizzling striped stretch.
- **Domino.** Ink-spot splats. Spot On: spots stick on with a star glint. Spot Shot: a spot with a sparkle. Splatter: a splash of spots. Big Shake: spots shake off in a ring. CONNECT THE DOTS!: star lines drawn from spot to spot.

## 4. Mix rules (`MIX` in identity.ts)

A 10-hero teamfight must stay readable and must not tire the ear.

- **Short.** Casts are 0.3 s or less, impacts 0.35 s, travel loops 0.45 s (repeated), basic voices 0.2 s and ult voices
  1 s. The test enforces these limits on every recipe.
- **Volume caps.** Before distance falloff and the host's sfx volume: cast 0.5, impact 0.5, travel 0.2, motif layer
  0.3, basic voice 0.4, ult voice 0.75. The master limiter still ducks THE SCREAM.
- **Per-sound cooldown.** `Sfx.play` already drops any sound repeated within 40 ms. The identity layer adds: the same
  cast within 60 ms, impact within 50 ms, travel within 120 ms, basic voice within 120 ms and ult voice within 400 ms.
  The skill FX cue cap stays at 3 per 100 ms.
- **Voice stealing.** At most 14 voices at once, 3 per nature and 2 per hero. A new sound over a cap replaces the
  oldest sound of lower priority. Priority, highest first: the player's ult, any ult, CC aimed at the player, the
  player's hero, enemies, allies, minions. At most 4 projectile travel loops play, the closest ones.
- **Relation gain.** The player's hero plays at ×1.1, enemies at ×1, allies at ×0.7. Ally noise sits back, and the
  threats stay loud.
- **Thinning.** Other heroes' basic-attack voices play only within 10 m and only on every 3rd basic. The player's own
  basics always voice. When 8 or more voices play, each new one is scaled ×0.6.
- **Variety.** Bakes stay deterministic (randomness 0). Variety comes from the playback-rate jitter (±6%) that
  `Sfx.play` already applies.

## 5. Wiring plan (next step, render and audio only)

1. `audio/sfx.ts`: bake `NATURE[*].cast/travel/impact` as `n:<nature>:<layer>` and each hero's voices as
   `v:<hero>:basic|ult` (where `reuse` is set, alias the existing PL_SFX buffer). Bake them in the same idle slices.
   Add `playLayer(layer, name, opts)` to apply `MIX`: the per-layer cooldown, voice caps with stealing, relation gain
   and ducking.
2. `render/effects.ts` cast dispatch: replace the generic `swipe` / `slam` / `dash` / `magic` / `ult` choices with
   `natureOf(hero, slot)` cast, plus the hero's ult voice on R. Hero-hit events play the attacker's basic nature
   impact, and the basic voice is thinned as above.
3. Skill FX scripts (`render/skillfx/*.ts`): already per hero. Add the motif particle (`IDENTITY[h].motif.shape`
   tinted with `colors`) to the generic cast paths and to any skill whose script has no motif yet. Swap the FUN_SFX
   stand-ins for the nature layers where they duplicate them.
4. New sprites later (stand-ins in brackets): crest (STAR5), grin (SPARK), bulb (SOFT), toast (SHARD), bowling pin
   (ZED), crown (STAR5), chili (EXCLAIM), checker (CONFETTI), squiggle (DROPLET).

### 5a. Framework (built)

- `audio/identityMix.ts`: `VoiceMixer` applies `MIX` (per-layer cooldown, 14 / 3 per nature / 2 per hero / 4 travel
  voices with stealing, layer volume caps, relation gain, duck at 8).
- `audio/sfx.ts`: `registerDefs(defs, aliases)` bakes the identity sounds; `playLayer(req)` plays one through the mixer
  with the usual falloff and pan.
- `audio/skillSfx.ts`: `playSkillSfx(hero, skill, phase, ctx)` (skill = key or slot 0..3; phase cast, impact,
  travel) plays the nature layer and the champion layer (motif ping on Q/W/E, ult voice on R, thinned basic voice on
  basics). `planSkillSfx` is the pure plan.
- `render/fx/natureFx.ts`: `NatureFx.skillFx(hero, skill, phase, pos, dir, opts)` and `motifBurst(hero, pos, n, dir)`,
  under a per-0.1 s particle budget by quality tier and reduce motion. `Effects.natureFx` owns one.
- `audio/champ/<hero>.ts` (one file per hero, registered in `audio/champ/index.ts`): `motif` ping, `motifRate`,
  `sounds`, per-skill `skills` overrides (`false` mutes a nature layer, `replace` swaps it), and `fx` (`motifCount`,
  `ownedMotif`, `paint`). Defaults: the basic voice is the motif ping, the IDENTITY motif shape the particle.
- `render/effects.ts`: every hero Q/W/E/R cast plays `playSkillSfx(..., 'cast')` instead of the generic swipe / slam /
  dash / magic / ult; generic casts also draw the nature FX and motif, casts a hero script draws get a 3-particle motif.
  Hero basic and ability hits play the nature impact (ability hits use the hero's last cast slot).

## 6. Not changed

No sim code, no numbers, no balance. Heroes keep their existing PL_SFX voices; the identity reuses them.

## 7. What you'll hear and see

Built on `feat/pawlegends-champ-identity` (render and audio only). Every Q/W/E/R plays two sounds: the skill's
**nature** sound (the same for every fire skill, every frost skill...) and the **champion** sound (the hero's motif
ping in its own instrument on Q/W/E, the hero's ult voice on R). Every skill also draws two layers: the nature effect
and the hero's motif in its colour pair. On an enemy, gold-family motif colours draw as a pale glint, because gold
means "you". The tables below say what each one adds on top of that.

Shared helpers: `render/skillfx/identityFx.ts` (`drawIdentity`, `champLayer`, `MIX_REL`, `mixRel`) and
`render/fx/natureFx.ts` (`paleGold`, `motifColors`, and an `enemy` flag on `skillFx` / `motifBurst`). No hero script
keeps its own copy.

Known limits: the sim's `hit` event names no slot, so an ability hit sounds like the hero's last cast skill (a Q
projectile that lands after an R cast sounds like R). Every Clem Q hit adds the fifth pluck; only the visual knows the
third hit. Howler's echo ring pops on every ability hit, not only on fears. `render/moves/sage.ts` and `stilts.ts`
animation cues still play the generic whooshes.

### Clem: sunrise knight, golden-hour sunbursts (peach / sunlight), kalimba

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Paw swipe (slash) | slash impact, kalimba voice | slash sparks and a sunburst at the claw tip |
| Valor (empower) | – | a sun rises over her head at 100 |
| Q Paw Combo (slash) | slash + kalimba C; each hit adds a soft fifth | sun rays down the cone; the 3rd hit is a full sunburst |
| W The Stand (guard) | guard + kalimba E; a parry is a clank and a high ting | guard shards, a sun on the wall, a sun with a reflected ray on a parried bolt |
| E Tumble (mobility) | dash + kalimba G | tiny suns along the dash |
| R Golden Hour (empower) | empower + rising arpeggio ult voice | a pillar and a big sunburst; each wave fans sun rays |

### Sage: moon archer, feathers and crescent moons (mint / moon white), flute

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Arrow (projectile) | projectile impact, fluttered flute voice | a feather spins off each arrow |
| Q Volley / Piercing Shot (projectile) | projectile + flute note | feather tails; every arrow hit puffs feathers |
| W Sun Snare (arcane) | arcane + flute a minor third up; arming: low "moonSet" (own team only); springing: falling "moonClose" | a crescent on each armed trap (own team); two crescents close on the victim |
| E Hop Back (mobility) | dash + flute a fifth up | feathers drift down where she stood |
| R Moonshot (arcane) | arcane + rising flute ult voice | a full moon in the wind-up, crescents on alternate sides of the beam |

### Sir Brutus: crest stamps (sandstone / steel), anvil and armour

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Shield bash (impact) | impact, anvil-ping voice | a crest stamp on the target |
| Honour (guard) | a clank on the bash | a crest on the bashed hero |
| Q Shield Slam (impact) | impact + anvil clang | crests ring the edge of the slam |
| W Front Guard (guard) | guard + armour clank | a giant steel crest on the wall (over the dome on Guard Post) |
| E Pug Charge (mobility) | dash + anvil ring on the hit | a sand puff and a crest stamp |
| R Champion's Challenge (sonic) | sonic + two-note horn ult voice | a circle of crests above the obelisks |

### Cacklejaw: lime grins and "hee hee" (shadow plum / acid lime), kazoo

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Claw (slash) | slash, kazoo blat | a lime grin with a plum puff |
| Pack Flank (shadow) | shadow impact | a grin just behind the flanked victim |
| Q Jeer Slash (slash) | slash + kazoo "hee" | a row of grins along the dash |
| W Gloat (sonic) | sonic + kazoo "hee-hee-hee" | lime laugh notes |
| E Bush Slink (shadow) | shadow + kazoo "hee" | a faint grin where he vanished (own team only) |
| R Pack Hunt (shadow) | shadow + kazoo cackle ult voice; the maul cackles | a big grin over the hunted hero |

### Lambo: cuddly tank, string lights and tuna (silver / amber), music box

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Paw bop (impact) | impact, music-box tink | a bulb blinks |
| Q Tuna Toss (splash) | splash + two music-box notes; the splat adds a tin-can clank | bulbs on a cord along the aim and behind the flying tuna |
| W Big Hug (guard) | guard + music box; on an ally a bulb "tink" | bulbs in an arc around the hug |
| E Belly Flop (impact) | impact + music box; the landing a falling run of notes | a circle of lit bulbs just inside the flop ring |
| R Tangled Lights (electric) | electric + twinkling-lights ult voice; each lassoed hero a high tink | string lights lasso the pulled heroes |

### Raspberry: raspberry static (raspberry / pale volt), theremin and static

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Static claw (electric) | electric, crushed-zap voice | sparks ending in raspberry dots |
| Shy, Then Shiny (electric) | Charged proc: a small "pop" | a raspberry on the victim |
| Q Spark Swipe (electric) | electric + crackly static buzz | both far corners of the zig-zag end in a raspberry |
| W Shiny Coat (empower) | empower + theremin swell | raspberry sparkle through her coat; shed sparks end in raspberry dots |
| E Live Wire (mobility) | dash + static buzz; a pop on the return point | a raspberry marks the return point |
| R Short Circuit (electric) | electric + rising zap ult voice; the ZAP! pops | the bolt lands with a big raspberry |

### Bengal: toast crumbs and camellia petals (crimson / toast gold), castanets and sizzle

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Ember flick (fire) | fire, castanet clack | each shot lands as gold crumbs |
| Hot Toast (fire) | fire impact | a buttery glint and a burst of crumbs |
| Q Burnt Toast (fire) | fire + castanet double clack; sizzles while it flies; a crunch on hit | a spinning smoking slice, crumbs on hit |
| W Striking Pose (arcane) | arcane + camera shutter | camellia petals with the flash; a camellia over each stunned head |
| E Camellia Hop (mobility) | dash + castanets | a petal swirl in the trail |
| R Curtains Up! (fire) | fire + curtain-whoosh ult voice; each pulse a castanet roll | crimson curtains; each pulse pops crumbs |

### Gabby: wind angel, heart balloons and white feathers (pink / white), wind chimes

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Heart puff (projectile) | projectile, glass chime | a heart rides each shot |
| Q Heart Balloon (heal) | heal + rising chime cluster; a glassy balloon pop on impact | hearts for allies, feathers for enemies |
| W Wing Wrap (guard) | guard + chimes; a feather flutter on impact | feather wings |
| E Chase the Wind (mobility) | dash + highest chimes | mostly feathers along her path |
| R Under Her Spell (arcane) | arcane + falling chime ult voice; a two-note chime per charm | hearts thrown forward into the cone |

### Meatball: sleepy bowler, bowling pins and Zzz (basil / indigo), tuba

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Belly bump (impact) | impact, tuba "oom" | a pin wobbles over the target |
| Food Coma (guard) | – | lilac Zs |
| Q Bowling Roll (impact) | impact + tuba oom-pah; a pin clatter on hit | a 5-pin strike burst on the first hero, 2 pins on later ones |
| W Loaf Mode (guard) | guard + sleepy tuba yawn | lilac Zs |
| E Big Brother (mobility) | dash + oom-pah; landing plus a pin scatter | pins scatter on landing |
| R Unstoppable Chonk (empower) | empower + octave-down ult voice; a pin clatter on each bump | a ring of pins on cast, pins orbit him (not on Low), pins fly on every bump |

### Pixel: cardboard robot, 8-bit pixels (LED cyan / kraft), chiptune

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Pellet (projectile) | projectile, square blip | the pellet breaks into 4 pixels |
| Q Cap Cannon (projectile) | projectile + bit-crushed "pew"; a travel whirr | pixels at the muzzle and behind the cap; the hit breaks into 6 pixels |
| W Laser Pointer (electric) | electric + rising "vwee" | a pixel-stepped beam; each pulse hit drops pixels |
| E Duck and Cover (guard) | guard + three-step "loading" bloop | a ring of pixels orbits the shut box |
| R BOXBOT MK II (empower) | empower + power-on arpeggio ult voice | eight pixels fly in to assemble the suit |

### Duchess: royal Persian, tiny gold crowns and fluff (plum / crown gold), harpsichord

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Disdainful glare (shadow) | shadow, plucked flick | a plum bolt with a crown glint |
| Utter Disdain / Snub (shadow) | shadow hit + crown "ting" | a crown drops onto the stunned head |
| Q Fluff Puff (projectile) | projectile + harpsichord; the ball whooshes as it rolls | a crown rides the rolling ball |
| W Not Amused (shadow) | shadow + falling two-note "hmph" | a shadow implode in the cone, a crown at each edge |
| E Cushion Glide (mobility) | dash + harpsichord | a trail with a crown and gold-flecked fluff |
| R Royal Decree (sonic) | sonic + royal-flourish ult voice | ripples and two crowns |

### Stilts: savannah sprinter, long paw-print tracks (terracotta / cream), bongo

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Swat / Pounce (slash) | slash + double bongo slap | a paw print on the target |
| Q High Leap (mobility) | dash + low bongo; landing: a deep bongo thump | one big terracotta print stamped in the centre |
| W Ear Swivel (sonic) | sonic + high bongo | a ring of paw prints out to the reveal radius |
| E Swat-Swat (slash) | slash + bongo, again a step higher on the second swat | a terracotta print, then a cream one |
| R Zoomies (empower) | empower + drum-roll ult voice | a glowing running track of prints |

### Nugget: good-boy corgi, frisbees and bone treats (orange / frisbee pink), rubber squeak

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Treat toss (projectile) | projectile, squeak voice | bone treats |
| Q Frisbee (projectile) | projectile + wobbling disc whirr; a travel whirr | a pink ring rides the disc |
| W Best Friend (guard) | guard + double "pal!" squeak | three frisbee rings orbit him when he lands |
| E Sploot (heal) | heal + squeak a step higher | a fountain of bone treats; every third heal sparkle is a hopping bone |
| R Herding Time (sonic) | sonic + bork ult voice | bone glyphs ride the bark ring |

### Marshmallow: snow puppy, snow puffs and flakes (snow / ice blue), sleigh bells

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Snow puff (frost) | frost, bell shimmer | snow puffs and flakes |
| Q Snowball (frost) | frost + sleigh bells; a frost travel sound while it rolls; a crunch and a poof on hit | ice-blue trail flakes; a puff on the ball that grows |
| W Snow Patch (frost) | frost + bells | puffs fall |
| E Belly Slide (mobility) | dash + bells | a sled track and puffs |
| R SNOW DAY! (frost) | frost + `marshAwoo` ult voice; a frozen cat gets a long sleigh-bell chord | puffs and flakes fall from above |

### Bravo: spotlights, tears and bows (stage violet / cream), brass trumpet

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Head bonk (impact) | impact, trumpet blip | a spotlight blink |
| Q Crocodile Tears (splash) | splash + trumpet C | one big tear rolls off; the splash leaves a puddle of tears |
| W Center Stage (guard) | guard + trumpet E; the bow flourish through the mixer | a spotlight cone from above |
| E Stage Dive (impact) | impact + trumpet G (Q, W, E = a fanfare); a landing "ta-da" | out of a spotlight onto a ring of stage boards |
| R ENCORE! (sonic) | sonic + `bravoBow` fanfare ult voice; a "ta-da" per charmed hero | cream and violet confetti; a small spotlight on each charmed hero |

### Chili: tiny rage, chili peppers and an anger "!" (pepper orange / stem green), square yap

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Static nip (electric) | electric, `chiliYap` | hit sparks and a small pepper burst |
| Small Dog Syndrome (empower) | – | a pepper crown over his head at 5 Rage |
| Q Yap Yap Yap (sonic) | sonic + two-note yip | sound ripples; every second crescent carries a pepper |
| W Tiny Zoomies (mobility) | dash + higher yip | pepper afterimages |
| E Purse Mode (guard) | guard + handbag-clasp snap | guard shards; peppers puff out of the bag |
| R BIG DOG ENERGY (empower) | empower + `chiliBigBark` | a pillar, a pepper burst and an "!" as he grows |

### Howler: loud husky, echo rings and "AWOO" (slate / mint), synth howl

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Bite (slash) | slash, short "wo" | an echo ring on the target |
| Q AWOO (sonic) | sonic + `howlerAwoo` howl; each hit an echo ping | echo rings pushed forward and the word "AWOO!" |
| W Derp Dash (mobility) | dash + high "woo" | three fading echo rings left behind |
| E Talk Back (guard) | guard + `howlerArgue` grumble | echo rings |
| R THE SCREAM (sonic) | sonic + `howlerScream` (once) | rings drawn in on the inhale, then blasted out |

### Rocket: race greyhound, checkered flags (race green / white), start beeps and race whistle

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Dart (projectile) | projectile, start beep | white streaks with a checker spark |
| Q Lure Shot (projectile) | projectile + start beep; a travel whirr | a small checker flag at the muzzle, checker squares off the lure |
| W Photo Finish (mobility) | dash + camera shutter "ch-chk" | a checker finish line on landing |
| E SQUIRREL! (sonic) | sonic + high beep and the squirrel squeak | the squirrel lands on a checker square |
| R ZOOM… ZZZ (mobility) | a "get set" beep on the crouch, then dash + race-whistle ult voice | green and white squares along the sprint, a checker flag by the nap |

### Frankie: hot dog, ketchup and mustard squiggles (mustard / ketchup), slide whistle and cork pop

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Weenie nip (slash) | slash, `frankieYip` | a mustard squiggle |
| Ketchup and Mustard (splash) | splash + small cork pop | the two squiggles cross into an X |
| Q Weenie Roll (impact) | impact + rising slide-whistle blip | a dust ring and a spiral squiggle trail |
| W Dig (impact) | impact + lower blip; the pop-up a thud and a cork pop | a mustard squiggle where he dives and where he bursts out |
| E Bun Hop (mobility) | dash + higher blip | a zig-zag under the hop |
| R FOOTLONG! (fire) | fire + `frankieStretch`; the grab a fire snap | embers, ketchup and mustard stripes down the stretch |

### Domino: starry dalmatian, ink spots joined by star lines (ink / lilac), marimba

| Skill (nature) | You hear | You see |
|---|---|---|
| Basic Ink blot (splash) | splash, `dominoBoop` | an ink-spot splat |
| Spot On (arcane) | arcane impact | a star glint as each spot sticks |
| Q Spot Shot (projectile) | projectile + marimba boop; the shot whooshes | a sparkle and a spot with a star |
| W Splatter (splash) | splash + ink splat | droplets and a splash of spots |
| E Big Shake (impact) | impact + rattle | a dust ring and spots flung outward |
| R CONNECT THE DOTS! (arcane) | arcane + `dominoDraw`; each hit a high marimba "star" | a twinkle around him and a starred spot on each target |
