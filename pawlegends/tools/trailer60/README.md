# Trailer 60 ("The Understudy", feat. Rocket, dev only)

A 60 s comedy trailer for Paw Legends: Bravo, the dramatic pug, keeps losing his spotlight; Rocket keeps missing the
Kibble Cannon; both pay off in one fight (Bravo's ENCORE! charms the cat winding up the cannon, she fumbles it, Rocket
finally fires it). Real Cannon Chaos gameplay is 85 % of the runtime, cut on a 120 BPM grid, with Gemini comic panels
and motion graphics for the story beats. Nothing here is part of `build` or `build:client`; outputs go to a scratch
folder, never the repo.

| Time | Shot |
|---|---|
| 0.0-1.25 | Hook: Bravo (Opening Night) poses, a Sage hit, the camera punches in as he flops legs-up |
| 1.25-2.5 | Iris freeze STARRING: BRAVO; curtains close: the logo PRESENTS BRAVO IN THE UNDERSTUDY |
| 2.5-6.5 | ALSO STARRING: ONE KIBBLE CANNON; Rocket's name tag rides on him (FASTEST DOG ALIVE); Sage takes it a step ahead: ROCKET 0 |
| 6.5-8.5 | AUDITION #1: Sage's Moonshot steals his spotlight (wah-wah-waah) |
| 8.5-10.5 | ZOOM... ZZZ: Rocket (tagged) sprints past the carrier and naps: ROCKET 0 (AND ASLEEP) |
| 10.5-12.5 | AUDITION #2: Nova's ultimate on his stage; the camera punches in on him into the CUT! panel |
| 12.5-13.0 | Comic panel (Gemini, in-engine Bravo as the reference): CUT! |
| 13.0-18.0 | Credits: five 1 s mini gags, NAME as Role, the ultimate, a match cut into the store coat on the half beat |
| 18.0-19.5 | AUDITION #3: his own Champ's KNOCKOUT!; punch-in into THAT'S IT. |
| 20.0-22.0 | Costume change: the same ticks in four coats, a match cut and a bolt puff on every beat |
| 22.0-25.0 | The bush: Ranger hides (the screen dims), Meatball (Mega Meal) sits in the same bush (the dim lifts) |
| 25.0-26.0 | ACT II: Pixel carries the cannon to the dog tower |
| 26.0-35.0 | The band enters: three hero moments, cast > hit > result at 0.8x, named (Ziggy, Sir Brutus, Meatball) |
| 35.0-37.5 | He plays dead in slow motion; comic panel: one eye opens |
| 37.5-41.5 | The payoff: Bravo bows (ENCORE!), the carrier fumbles: BRAVO! and roses; the button: a rose BONK! |
| 41.5-44.5 | Rocket (tagged) fires the stolen cannon: KABOOM, ROCKET 1 (the digit drops into its box) |
| 44.5-47.5 | The cat core falls (framed so its smoke column leaves the frame): VICTORY! |
| 47.5-50.5 | The curtain call: seven quick lineups of two cats and two dogs, an accelerando into the logo |
| 50.5-55.0 | End card: the v6 logo, CATS VS DOGS. PICK A SIDE., PLAY FREE · pawlegends.app (a soft bed, no dead air) |
| 55.0-60.0 | Stinger: Meatball rolls through his spotlight, he plays dead; freeze, Bravo will return. (rimshot on 59.5) |

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
