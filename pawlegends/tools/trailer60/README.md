# Trailer 60 ("The Understudy", feat. Rocket, dev only)

A 60 s comedy trailer for Paw Legends: Bravo, the dramatic pug, keeps losing his spotlight; Rocket keeps missing the
Kibble Cannon; both pay off in one fight (Bravo's ENCORE! charms the cat winding up the cannon, she fumbles it, Rocket
finally fires it). Real Cannon Chaos gameplay is 85 % of the runtime, cut on a 120 BPM grid, with Gemini comic panels
and motion graphics for the story beats. Nothing here is part of `build` or `build:client`; outputs go to a scratch
folder, never the repo.

| Time | Shot |
|---|---|
| 0.0-1.0 | Hook: Bravo (Opening Night) poses; a jump cut and a white flash on Sage's hit, straight to the legs-up flop |
| 1.0-3.0 | Iris freeze STARRING: BRAVO; curtains close: the logo PRESENTS BRAVO IN THE UNDERSTUDY, held a second once set |
| 3.0-6.25 | ALSO STARRING: ONE KIBBLE CANNON with a pointer on the cannon itself; Rocket's tag; Sage (tagged GOT THERE FIRST) takes it a step ahead: ROCKET 0 |
| 6.25-8.75 | AUDITION #1: Sage's Moonshot steals his spotlight; BRAVO / THE STAR rides on him until the steal, then the thief's tag (STEALS THE SHOW) and an UPSTAGED. stamp |
| 8.75-11.25 | ZOOM... ZZZ: Rocket sprints past the carrier and naps; the Zs rise from him; ROCKET 0 (AND ASLEEP) held 0.5 s |
| 11.25-13.75 | AUDITION #2: Nova's ultimate on his stage, UPSTAGED. AGAIN.; punch-in into CUT! (hard cuts into every panel) |
| 13.75-14.25 | Comic panel: CUT! |
| 14.25-20.75 | Credits: six cards; a before/after hold on each coat swap (6 + 8 frames), each swap its own sound; Duchess declines hers (COAT DECLINED.) |
| 20.75-22.75 | AUDITION #3: his own teammate Champ's KNOCKOUT!, UPSTAGED. BY HIS OWN TEAM.; punch-in into THAT'S IT. |
| 23.25-25.25 | Costume change: four coats, a match cut and a bolt puff on every beat |
| 25.25-28.25 | The bush: Ranger hides (the screen dims), Meatball (Mega Meal) sits in the same bush (the dim lifts) |
| 28.25-29.25 | ACT II (an orchestra hit and a drumroll) |
| 29.25-36.75 | The band: Ziggy (punched in), Sir Brutus, Meatball, 2.5 s each from the first move; the tag, then the ultimate's card |
| 36.75-39.25 | He plays dead in slow motion (PLAYING DEAD) beside Ziggy's rising knockout ghost (ACTUALLY K.O.’D); comic panel: one eye opens |
| 39.25-43.75 | The payoff: Pixel tagged WINDING UP THE CANNON, Bravo bows (ENCORE!), she fumbles: FUMBLE!, BRAVO! and roses |
| 43.75-46.75 | Rocket (HAS THE CANNON!) fires it: KABOOM!, ROCKET 1 |
| 46.75-48.75 | The cat core, tagged GOING DOWN, bursts at 0.55 s: VICTORY! |
| 48.75-49.75 | Bravo takes the bow for it: "YOU'RE WELCOME." |
| 49.75-52.25 | The curtain call: five lineups, every champion named (9:16 and 1:1 fit the landscape lineup to the width) |
| 52.25-54.75 | End card: the v6 logo, CATS VS DOGS. PICK A SIDE., PLAY FREE · pawlegends.app |
| 54.75-60.0 | Stinger: Meatball rolls through his spotlight; freeze: Bravo will return., then the logo and PLAY FREE · pawlegends.app (rimshot) |

Round 4 (jury of round 3, 7.1/10): every audition shows its failure without sound (his tag hands over to the thief's,
an UPSTAGED. stamp with a slam), the cannon has a taker (SAGE: GOT THERE FIRST) and a shooter (ROCKET: HAS THE CANNON!,
KABOOM!), the payoff drops the rose BONK! (no visible cause) for FUMBLE! on the carrier, the core is tagged before it
bursts (`anchor`: a fixed take point mapped through the punch and the 9:16 inset), the slow-motion flop tags the yellow
figure that read as a glitch (Ziggy's knockout ghost: ACTUALLY K.O.’D), and each credit swap holds the before and after
frames (`swap.hold`) with a lighter puff and bigger credit lines.

Round 3 (jury of round 2, 6.3/10): Bravo is tagged in every audition, the title holds, the Zs and AND ASLEEP sit on
Rocket and read, the hook skips the hit's white puff (a jump cut), the peek panel is redrawn from the CUT! panel (on
model, one style), VICTORY! is 2 s and punched in, Bravo then takes the bow, the end card is 2.5 s and the last frame
carries the logo and the address, the overture runs under the costume change and the bush (no silent hole before ACT
II), the credits are six cards with six different swap sounds and a twist, the coat takes put only the credited
champion in a coat (round 2 also dressed the others: a second burger), the curtain call names everyone, the cannon is
pointed at from its first frame on screen (`colorTrack`), and the 15 s cut carries the costume change and ROCKET 1.

Round 2 (jury of round 1): the burning core's dark smoke no longer blobs over the frame, the hook punches in, Rocket is
tagged wherever he matters, the credits are five short gags with five coat swaps, takes are graded to one target (mean
luma and saturation measured per take after the grade, edit.mjs `normOf`), the Act II fight is three readable hero
moments, the Gemini panels use in-engine Bravo captures as references (`style: 'game'`), the 9:16 cut burns sound-off
captions (timeline.mjs `CAPS`), and the 15 s cut is one whole gag arc (audition, CUT!, two ultimates, the payoff).
`tools/clips/record.mjs` now writes each take's per-frame drawn hero boxes as `<id>.qc.json`; the edit places the name
tags and aims the bridge punch-ins from them.

The comic moments are real sim moments. `tools/clips/clip-script.ts` lets a take script team 0's piloted seats with
ordinary commands (move, cast, fire), the way a player's hands would: Bravo shadows the cannon carrier and bows the tick
her firing windup starts (the charm lands inside the 23-tick windup, so she fumbles, `cannonDrop` why `fumble`), poses
in Center Stage when an ultimate lands near him; Rocket sprints at the carrier from 6.5-9.5 m (his 11 m sprint ends just
past her, then the nap) and runs for a dropped cannon. The cats, every other seat and every game rule are untouched;
the Node scan and the browser harness run the same rules, and every take's event hash matched.

| File | Role |
|---|---|
| `search.mjs` | Plays Cannon Chaos takes headless over a seed range and lists the gags (fumble, miss, zzz, flop, bush, audition, ult with hits, tower, victory). |
| `specs.mjs` | The takes as clip-engine specs (16:9 and 9:16, 60 fps): the game's play angle brought closer, coats per seat, the curtain-call lineups. |
| `gemini.mjs` | The comic panels (gemini-3-pro-image-preview, `GEMINI_API_KEY`), Bravo's brand-book art as reference, no text in any image. |
| `timeline.mjs` | The edit as data (segments, overlays, freezes, coat swaps, tracked tags, hits, captions, copy); `timeline.test.mjs` checks length, grid, gameplay share, copy and captions. |
| `score.mjs` | The original 120 BPM comedy score: an oom-pah overture, the band from 28 s, comedy cues, the game's sounds and announcer, the v6 sting; -14 LUFS, true peak under -1 dBTP. |
| `mg.html`, `mg.js` | Motion graphics: iris freeze, curtain title, tags, the ROCKET scoreboard, slates, credits, coat tags, bush dim, roses, end card, stinger. |
| `edit.mjs` | Cuts, grades (matched per take), overlays (tags tracked from the takes' QC boxes), captions (9:16) and exports 16:9, 9:16 and 1:1, posters, a web copy, the 15 s cutdowns and `report.json`. |

```sh
node tools/trailer60/search.mjs --take '<json: variant, teams, script>' --seeds 1-120 --out A.json
node tools/trailer60/specs.mjs > specs.json
node tools/clips/record.mjs specs.json --out-dir <dir>/takes        # one browser, 60 fps, ~35 min for all 70
node tools/trailer60/gemini.mjs jobs.json <dir>/gem
node tools/trailer60/score.mjs --out <dir>/audio --sting <kit>/audio/pawlegends-sting-lightning-rivalry.wav
node tools/trailer60/edit.mjs --takes <dir>/takes --gem <dir>/gem --audio <dir>/audio --fonts <dir>/fonts --out <dir>/out
```

Cannon Chaos is a 3v3 mode, so the shot list's 5v5 ask became 3v3 takes from several seeds and team sets (A: Bravo,
Rocket, Champ vs Pixel, Sage, Nova; B: Bravo, Brutus, Chili vs Meatball, Avietė, Ziggy; C: Ranger, Barkula, Bravo vs
Meatball, Stilts, Avietė; D and E for the credits).
