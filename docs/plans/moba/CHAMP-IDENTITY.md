# Pawlegends: champion sound and visual identity

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
| Avietė | electric | electric (Shy, Then Shiny) | electric (Spark Swipe) | empower (Shiny Coat) | mobility (Live Wire) | electric (Short Circuit) |
| Bengas | fire | fire (Hot Toast) | fire (Burnt Toast) | arcane (Striking Pose) | mobility (Camellia Hop) | fire (Curtains Up!) |
| Gabė | projectile | heal (Heart Breeze) | heal (Heart Balloon) | guard (Wing Wrap) | mobility (Chase the Wind) | arcane (Under Her Spell) |
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
| Avietė | raspberry-tipped static sparks | #C83A8C raspberry / #FFF3A6 static lemon | theremin buzz and static | crushed zap | rising crushed zap swell |
| Bengas | toast crumbs and camellia petals | #B01838 camellia crimson / #E0A050 toast gold | castanets and sizzle | castanet clack | curtain whoosh with crowd crackle |
| Gabė | heart balloons and white feathers | #FF5C9E heart pink / #FFF4FA feather white | wind chimes | glass chime | falling chime spell |
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
- **Avietė.** Raspberry sparks on each hit, and raspberry dots crackle while she is Charged. Spark Swipe: a raspberry-tipped zig-zag edge. Shiny Coat: her coat fills with sparkle. Live Wire: a raspberry dot marks the return point. Short Circuit: the sky bolt splits into raspberry clusters.
- **Bengas.** Shots are glowing toast crumbs. Burnt Toast: a spinning smoking slice. Striking Pose: a camera-flash star, and a camellia over each stunned head. Camellia Hop: a petal swirl. Curtains Up!: crimson curtains over toast-gold flames.
- **Gabė.** A heart rides each breeze shot. Heart Breeze: the heal is a heart on a feather. Heart Balloon: pops into hearts for allies and feathers for enemies. Wing Wrap: feather wings. Chase the Wind: a feather stream. Under Her Spell: a cone of hearts, and charmed heroes float a heart.
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

## 6. Not changed

No sim code, no numbers, no balance. Heroes keep their existing PL_SFX voices; the identity reuses them.
