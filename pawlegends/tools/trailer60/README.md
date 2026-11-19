# Trailer 60 ("The Understudy", feat. Rocket, dev only)

A 60 s comedy trailer for Paw Legends: Bravo, the dramatic pug, keeps losing his spotlight; Rocket keeps missing the
Kibble Cannon; both pay off in one fight (Bravo's ENCORE! charms the cat winding up the cannon, she fumbles it, Rocket
finally fires it). Real Cannon Chaos gameplay is 85 % of the runtime, cut on a 120 BPM grid, with Gemini comic panels
and motion graphics for the story beats. Nothing here is part of `build` or `build:client`; outputs go to a scratch
folder, never the repo.

| Time | Shot |
|---|---|
| 0.0-1.5 | Hook: Bravo (Opening Night) poses in Center Stage, a Sage hit, he flops legs-up; iris freeze, STARRING: BRAVO |
| 1.5-2.5 | Magenta and blue curtains close over the freeze: the logo PRESENTS BRAVO IN THE UNDERSTUDY |
| 2.5-6.0 | The cannon spawns; Rocket and Sage race for it side by side; Sage takes it a step ahead: ROCKET 0 |
| 6.0-8.0 | AUDITION #1: Bravo poses in a teamfight, Sage's Moonshot steals the scene (wah-wah-waah) |
| 8.0-10.0 | ZOOM... ZZZ: Rocket sprints past the carrier and naps next to her: ROCKET 0 (AND ASLEEP) |
| 10.0-12.0 | AUDITION #2: Nova's ultimate lands on his stage |
| 12.0-12.5 | Comic panel: Bravo with a megaphone, CUT! |
| 12.5-20.5 | Fake film credits: eight ultimates in coats, NAME as Role (Meatball as A Bowling Ball, ...) |
| 20.5-22.0 | AUDITION #3: his own Champ's KNOCKOUT! |
| 22.0-22.5 | Comic panel: his eye twitches, THAT'S IT. |
| 22.5-24.5 | Costume change: the same take in four coats, a match cut and a bolt puff on every beat |
| 24.5-27.0 | The bush: Ranger hides (the screen dims), Meatball (Mega Meal) sits in the same bush (the dim lifts) |
| 27.0-28.0 | ACT II: Pixel carries the cannon to the dog tower |
| 28.0-35.0 | The band enters: seven ultimates (Brutus, Avietė, Barkula, Ziggy, Stilts, Chili, Meatball) |
| 35.0-37.5 | He plays dead in slow motion; comic panel: one eye opens |
| 37.5-42.5 | The payoff: Pixel winds up the shot, Bravo bows (ENCORE!), she is charmed and fumbles: BRAVO! and roses |
| 42.5-45.0 | Rocket fires the stolen cannon: KABOOM on Nova, ROCKET 1 |
| 45.0-47.5 | The cat core falls |
| 47.5-51.0 | The curtain call: all 28 champions on the lobby stage, THE CAST OF PAW LEGENDS |
| 51.0-55.5 | End card: the v6 logo, CATS VS DOGS. PICK A SIDE., PLAY FREE · pawlegends.app |
| 55.5-60.0 | Stinger: Meatball rolls through his spotlight, he plays dead; freeze, Bravo will return. (rimshot) |

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
| `timeline.mjs` | The edit as data (segments, overlays, freezes, hits, copy); `timeline.test.mjs` checks length, grid, gameplay share and copy. |
| `score.mjs` | The original 120 BPM comedy score: an oom-pah overture, the band from 28 s, comedy cues, the game's sounds and announcer, the v6 sting; -14 LUFS, true peak under -1 dBTP. |
| `mg.html`, `mg.js` | Motion graphics: iris freeze, curtain title, tags, the ROCKET scoreboard, slates, credits, coat tags, bush dim, roses, end card, stinger. |
| `edit.mjs` | Cuts, grades, overlays and exports 16:9, 9:16 and 1:1, posters, a web copy, the 15 s cutdowns and `report.json`. |

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
