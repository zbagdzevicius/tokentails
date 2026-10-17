# Bad Cat Daily: Game Design Document

Version 1.2, Oct 15, 2026 (v1.0 revised after three critiques, v1.1 after three more; what changed and what was
rejected is in [Appendix C](#appendix-c-critique-log)). Status: ready to build. Package: `bad-cat/` (new, top level).
Live URL (planned): `tokentails.com/badcat`, plus a short typeable domain bought before the kill test (section 18 #13).
The working name "Bad Cat Daily" is locked only after the search check in section 18 #12 (by Oct 22).
Day #1 = Monday, Nov 16, 2026 by default; Monday, Dec 7 if Arbitrum Dubai goes ahead (section 15.5).

Inputs: [RANKING.md](RANKING.md) (winner: Bad Cat Daily, 5.48, 6.0% success) and the six research lenses in
[research/](research/). Grafts from the runners-up are tagged in the text:
**[Derby]** = Cat Derby LIVE, **[Tower]** = Catnip Tower, **[Trap]** = Trap Rooms (named in the ranking as the
creator mode of this engine).

---

## 0. The whole game on one page

| Question | Answer |
|---|---|
| One line | Every day, everyone gets the same 3D room of fragile things. You play your own cat, with its real face, and have 75 s to wreck the room while the human's back is turned. The game cuts a ready-to-post 12 s vertical clip of one crime that opens on your real cat. |
| Tagline | "Cats are chaos. Adopt one anyway." |
| Fantasy | Be the cat every owner has filmed: knock the glass off the counter while staring at the human. |
| Platform | Mobile browser first (portrait), desktop second. No install, no login, one link. |
| Stack | three.js + Vite + TypeScript, a pure-TS deterministic sim on an 8-way cell grid (new code that reuses the Catnip Heist RNG, hash, replay RLE and line of sight; no physics engine in the rules), WebCodecs clip export with `mediabunny`. |
| Session | 1 ranked run a day (75 s) + unlimited practice + share. First visit from a link: snap your cat (10 s), a 40 s first heist, a postable clip within 90 s of opening the link. No paid offer in the first session. |
| UGC | (1) your real cat: a face cutout from one photo on a low-poly body, (2) "I put @owner's cat in my game" Stitches and quotes of viral cat videos, then reply videos for commenters, (3) dare links with your ghost, (4) Room Maker (M2) with rooms encoded in the URL, (5) cameos: your cat appears in upcoming rooms for everyone. |
| Viral artifacts | 12 s 720×1280 MP4 clip of one crime (2 s real cat → match cut → slow push → glass falls → the human turns too late), Stitch / reply video, 1080×1350 result card, 1080×1920 Rap Sheet mugshot, dare link with OG image, emoji text card (in chats only). |
| Money | **Chaos Club $4.99/mo or $39.99/yr**, both shown at checkout (Stripe, from M1; "your cat, featured", up to 5 cats); **Brand Shelf $199/mo** for pet brands = the product in 4 founder-account clips a month with a view floor, plus an in-room prop; cameo $4.99, guest star $9.99, gifts (December); cosmetics $1.99–4.99; sponsor day $99; Pink Paw charity collar $4.99 (100% net to the shelter); 10% of all other net game revenue to Pink Paw. |
| MVP | Static daily room files, localStorage saves, URL-encoded rooms, ghosts and cats. The only server pieces are small Vercel functions in the client for Stripe checkout, entitlements, restore and cameos. `/badcat` is served top level (no iframe). |
| Build | M0 (Oct 19–30) = the Kitchen, the sim, controls, the face decal and clip export on iOS Safari and Chrome Android. M1a (Nov 2–7) = dares, cards, analytics, Club. M1b (Nov 9–13) = launch content, cameos, paywall moments. M2 (Nov 16–29) = Room Maker, retention, creator codes. 9 parallel lanes (section 17). |
| Kill test | One TikTok account + the founder's X, 3+ human-played clips a day. Warm-up from Oct 26 with screen recordings; the gate clock runs Oct 30 – Nov 8 (≥ 30 clips). Main format: "I put @owner's cat in my game" Stitches and quotes, plus the one-crime POV. Pass = 1 clip ≥ 10k views, 3 clips of one format ≥ 2k views, and ≥ 15 "how do I make my cat" comments. Club founding pre-sale (Stripe Payment Link) and Brand Shelf outreach run alongside. |
| Success | 10k MAU and $1k MRR by May 16, 2027 (judges' estimate: 6%). MRR checkpoints: $100 Dec 31, $300 Feb 16, $600 Apr 1, $1k May 16, with new-subscriber and churn targets (section 9.3). Kill at day 45 if WAU < 500 and no clip > 50k views. |

What changed from the ranked concept, and why:

1. **No Rapier in the rules.** The ranking named "deterministic Rapier ghosts" as a trap. The sim is integer
   maths on an 8-way cell grid with scripted topples and domino rules. It is mostly new code; the RNG, hash,
   replay RLE and grid line of sight come from `catnip-heist/src/sim/`. Physics is visual only.
   Ghosts, dare links and clip re-rendering all depend on this.
2. **Retention fix (ranked 4.0).** Rap Sheet collection (48 crimes), weekly boss room, seasons with a
   cosmetic track, streak freezes, and a weekly identity card.
3. **MRR fix (ranked 4.0).** Club is not "unlimited runs". It sells "your cat, featured": a guaranteed weekly
   cameo, the "Most Wanted" credit, Club cosmetics visible in clips, the full archive and boss replays. It ships in
   M1 as a Stripe subscription, not behind a Phase 2 gate. A B2B line (Brand Shelf) carries part of the target.
4. **UGC fix (ranked 5.5).** The real cat's face goes on the 3D cat from M0, reply videos turn comments into
   content, and the Room Maker **[Trap]** ships in M2 with URL-encoded rooms, remix credit and Community Sunday.
5. **Audience fix.** The funnel works without a bio link: a short typeable URL in the clip's last 2 s, a
   searchable name with one owned hashtag, "I put @owner's cat in my game" Stitches and quotes that borrow reach
   from viral cat videos (a new account gets no comments to answer), and "comment your cat" reply videos once
   comments arrive. Creator codes **[Derby]** (20% revenue share for 6
   months) ship in M2 so attribution exists from launch week 2. Streamer mode is cut to a layout flag in Club.
6. **Brand tone fix.** Caught means the human scoops the cat up for a cuddle ("BAD KITTY... come here"). No
   spray bottles, no punishment, no "stealing" shelter cats.

---

## 1. Hook and fantasy

**Hook (first 2 seconds of every clip):** real footage of the player's actual cat, with one caption line: "POV:
you left Mochi alone for 75 seconds." On the founder's accounts this is always a 2 s real video (the cat staring,
a tail flick, a slow blink), because motion in the first second decides whether people keep watching. Players can
use a 2 s video or a photo. At 2.0 s it match-cuts to the 3D Mochi, wearing Mochi's real face, in the same
close-up framing on a kitchen counter next to a wine glass. The match cut is the hook. No game UI is visible in
the first second, so the clip does not read as a mobile-game ad.

**Fantasy:** you are the cat in every "my cat is a menace" video. You are not destroying a home out of malice;
you are doing what cats do, while the human does what humans do (cook, doom-scroll, take Zoom calls) and turns
around a frame too late.

**Three emotional beats per run:**

1. *Tension*: sneaking while the human's back is turned, freezing into an innocent loaf when they turn.
2. *Release*: the slow paw, the glass falls, a loud cartoon crash, and the human turns a beat too late with a
   long, dramatic double-take.
3. *Smugness*: a slow blink at the camera (the signature beat), the PERFECT CRIME stamp, or the CAUGHT cuddle.

**Why it spreads:** research says the cat-as-villain clip is the most repeatable shareable unit
([cat-pet-cozy §3](research/cat-pet-cozy.md)); "this is MY cat" is the strongest identity hook, and a real face
on a low-poly body ("paper-doll" look) is funny on purpose and cannot be mistaken for someone else's cat; real
shelter cats are Token Tails' own meme cast ([social-loops §3.10](research/social-loops.md)); and no polished
no-install mobile-browser 3D version of this fantasy exists ([cat-pet-cozy §5](research/cat-pet-cozy.md)).

**Tone rules:** affectionate and cheeky, never cruel. The cat never gets hurt; the human is never angry, only
dramatic. Every crash reads as slapstick: cartoon shards and a loud, crunchy cartoon crash sound (the payoff that
makes people watch twice), never a realistic shatter or anything that sounds like pain. Pink Paw cats appear as
"accomplices" and "criminals of the day", never as loot.

---

## 2. Target players and the creator who clips it

| Persona | Share of players (target) | Why they come | What they post |
|---|---|---|---|
| **Mia, 27, cat owner** (women 20–40 are the core; Astrocade's and cozy games' best users) | 50% | "Put MY cat in a game" | Clip of her cat in the game; "my actual cat vs. game cat" side by side; asks for a reply video |
| **Faceless cat-meme account runner** (Gen Z, runs 2–5 TikTok/IG pages) | 5% of players, 40% of reach | A free daily source of new cat content, and reply videos that answer her commenters | Reply videos, 1–3 clips a day, "POV" captions, carousels |
| **Daily-puzzle player** (Wordle, Globle, Connections habit) | 25% | One short daily ritual with a comparable result | Emoji card in existing group chats |
| **Small streamer / VTuber** (20–500 viewers; Suika spread through JP VTubers) | 2% of players, 10% of reach | A short filler game with a clean stream layout (Club flag) | Live sessions |
| **Rescue volunteer / shelter fan** | 10% | Real shelter cats, real donations | "This is Mila, she's adoptable, and she just wrecked my kitchen" |
| **Kids 10–15** | rest | Chaos | Little; no portal builds are made for them in the first 6 months |

**The creator who clips it:** the faceless cat-meme account runner. She has 0–2k followers, so she has no bio link
on TikTok (personal accounts need 1,000 followers for one) and links in comments are not clickable. She posts 1–3
times a day and lives on content she does not have to film. Bad Cat Daily gives her a new room every day, a clip
that renders itself, captions that work with the sound off, a Stitch template that puts a viral cat into the game
(her way to borrow reach before she has commenters), a reply-video template for her own commenters once she has
them, and a short URL and search name that viewers can type without her audience. Every design choice for the clip (section 7.3)
is tested against "would she post this without editing?"

---

## 3. Core loop

### 3.1 Second by second: one ranked run (75 s = 2,250 ticks at 30 Hz)

| Time | What happens | Design intent |
|---|---|---|
| −3.0 to 0 s | Briefing card slides up: room name ("Kitchen #18: Breakfast Heist"), the human ("Chef Dad"), 3 Must-Wreck targets with icons, today's accomplice ("Mila wants the tuna can"). Shaders compile and the shard pool warms during the card (section 11.2). Tap anywhere to start. | 3 goals = 3 things to talk about; skip after the first day |
| 0–2 s | Camera dollies from the human's back to the cat sitting, facing camera (the match-cut pose). "GO" stamp. Human is Busy (cooking). | Instant play, no menu |
| 2–8 s | Free sneaking. First Must-Wreck target is always reachable in ≤ 6 s from spawn (enforced by the validator, section 13.7). First jump up to the counter. | First crash before 10 s; this is the clip's opening |
| ~8–12 s | First turn. Telegraph 0.8 s: the human's head twitches, a "?" bubble pops, a loud two-note "hm?" sting, the vision cone fades in on the floor. Player releases the stick → cat drops into an innocent loaf. | Teaches the red-light rule by feel |
| 12–40 s | Rhythm: Busy 3–9 s → telegraph 0.5–0.8 s → Look 1.5–3.5 s. Player chains swats on the counter; combo meter climbs (×2… ×8 within 2.0 s windows). After 30 s, 20% of turns are fake-outs (twitch, no look). | Core skill loop: greed vs. timing |
| ~35–45 s | Room event (once per room): doorbell, kettle, phone call, or ad break. The human leaves the room or faces away for 6 s. A banner reads "DELIVERY! 6 seconds". | Guaranteed chaos window = the clip's mid-point peak |
| 45–70 s | Escalation: Look phases get longer (+0.5 s), Busy phases shorter (−1 s). From M1a the Roomba crosses the floor; anything that falls next to it is blamed on it ("FRAMED THE ROOMBA +300"). | Late-run drama; the "framed the Roomba" post format |
| 70–75 s | Final countdown; the last 5 s give double points ("LAST CALL ×2"). | Ends on the biggest crash, not a fade-out |
| 75 s | Freeze-frame. If caught earlier, the run ended at that moment with the cuddle animation (2.5 s). | |
| +0 to +6 s | Result: chaos score counts up, stamp (PERFECT CRIME / CLEAN-ISH / CAUGHT), rank title, Rap Sheet stamps for new crimes, par paws (bronze/silver/gold). The clip starts rendering behind the result screen. No offer card here. | Dopamine, then the share prompt |
| +6 s | Share sheet. When the clip is ready, the **Post clip** button lights up; the tap on it opens the native share sheet (a fresh gesture, section 7.3). Other buttons: **Dare a friend**, **Practice again**, "More" (card, emoji card, Rap Sheet). | The share artifact is the end of the loop, not an option buried in a menu |
| After the share | Only after the player shares or dismisses the share sheet, and never in the first session, one Club or cameo card may show ("Clip posted. Put Mochi in Kitchen #19 for everyone", section 9.2). | A purchase never sits where the share should be |

**First run from a link (FTUE):** the same loop, shortened to 40 s (1,200 ticks), with the room event fixed at
15 s and the first turn at 8 s. It is a practice run; the ranked daily run is offered right after. Section 8.

### 3.2 The minute (practice and replays)

After the ranked run, practice is unlimited on today's room. Practice runs never change the ranked score but do
feed the Rap Sheet and the season track (capped at 5 practice runs a day for season XP so the free daily stays
the main loop). A run takes 75 s; a minute of practice is one more attempt at the 3 Must-Wreck targets.

### 3.3 The session (target median 4 min, engaged 12 min)

1. Open link or home-screen icon → that link's room loads (≤ 3 s on 4G). The typed short URL first opens the
   room picker ("Which room did you see?", section 6.6), because a clip keeps getting views for days or weeks.
2. First visit from a link: snap your cat (10 s, skippable) → 40 s first heist → clip → share (≤ 90 s total).
3. Ranked run (75 s) → result (10 s) → share (20–40 s).
4. Optional: 1–4 practice runs; open a friend's dare link and beat their ghost; check the Rap Sheet.
5. Optional (from M2): build or remix a room in the Room Maker (90 s speed build) and share it.
6. Leave with a reason to return: "Tomorrow: Toilet Paper Wednesday" teaser and streak flame.

### 3.4 The day

- New room at local midnight (Wordle-style, no server): `dayNo = daysBetween(DAY1, localDate) + 1`, with `DAY1`
  a build constant (Nov 16, 2026 by default).
- **Every link pins its `dayNo`**, and every card says "Kitchen #18", never "today". A dare link opened in another
  time zone opens Kitchen #18, not that player's local today.
- One ranked attempt per day. The first completed run of the day is ranked (caught counts as completed). This is
  honour-based in the MVP: it cannot be enforced on the client and private mode resets it. Streaks show "this
  browser only" when storage throws.
- Today's accomplice: one real Pink Paw cat lounges in the room with a wish ("Mila wants the tuna can"). Grant it
  for +500 and an "accomplice" stamp on the card, plus an adopt link on the result screen.
- Spectators **[Tower]**: 10–15 cameo slots (cats on windowsills and shelves, named on hover and in the card
  footer) plus the **Club fridge wall**: 40 small face magnets on the fridge door. Both are filled per page load
  from a weighted pool, not a fixed list (section 6.5), so supply grows with players instead of running out.
- **The hook room is always open:** "The Glass" (the Kitchen with the wine glass from the clips) is playable at any
  time from the home screen and the picker, free, outside the daily rotation and the archive.

### 3.5 The week

| Day | Room | Human | Twist |
|---|---|---|---|
| Mon | Kitchen: "Breakfast Heist" | Chef Dad | Stove timer telegraphs turns |
| Tue | Living room: "TV Night" | Couch Potato | Turns on ad breaks (jingle telegraph) |
| Wed | Bathroom: "Toilet Paper Wednesday" | Skincare Sis | Mirror: she can see you in it (second cone) |
| Thu | Home office: "Zoom Call" (until the shell ships in M2: the living room with a laptop on the sofa) | WFH Worker | Crashes "on camera" give +50%; "you're on mute" triggers a turn |
| Fri | Party room: "Felony Friday" | Party Host | You play today's Pink Paw cat (or the week's paid guest star) instead of yours |
| Sat | Boss room (90 s, larger): wedding cake, Christmas tree (in season), birthday party | Two humans | Two cones, one shared suspicion meter |
| Sun | Community room (from week 3; before that "Laundry Day" bedroom) | Napper | Human sleeps; a noise meter replaces the cone **[Trap]** |

Sunday evening (18:00 local): the weekly **Rap Sheet card** (Wrapped-style identity card) unlocks: "Mochi's week:
41 crimes, 9 vases, framed the Roomba 3 times. Most wanted in Kitchen." This is the weekly share artifact and
the streak-keeper's reward. Club cats are credited by name in the week's "Most Wanted" list on the card.

---

## 4. Game rules

### 4.1 The room

- A room is a cutaway dollhouse (two walls removed) on a grid of **12 × 10 cells, 0.4 m per cell** (4.8 × 4.0 m).
  Boss rooms are 14 × 12 cells.
- Four surface levels: **L0 floor (0 m)**, **L1 seat (0.45 m: chair, sofa, bed, bathtub rim)**, **L2 counter
  (0.9 m: table, counter, desk)**, **L3 high (1.8 m: shelf, fridge top, wardrobe, tree top)**.
- **Per-cell heightmap** (int array, one entry per cell): `level` (0–3, the top walkable surface), `occludes`
  (1 if the furniture there is L2 or higher and blocks sight), `propId` (the intact prop resting on that surface,
  or −1). Furniture is part of the shell and the heightmap; props sit on top of it.
- **Positions: the cat steps cell to cell in 8 directions** (like the Heist cat, which steps tile to tile, but
  8-way). The sim stores the cell, the level, the facing (one of 8) and the progress of the current step in ticks.
  A step to an orthogonal neighbour takes 13 ticks sneaking (0.4 m at 0.9 m/s) or 7 trotting; a diagonal step
  takes 19 or 10. The renderer interpolates between cell centres, which at 0.4 m cells still reads as smooth
  walking. The stick direction is read only when a step ends, so a step is never cancelled half way.
- **Blocking:** the cat cannot step into a cell whose level is higher than its own (it must jump) or that holds an
  intact prop at its level (props block like walls until they fall). A diagonal step needs both orthogonal
  neighbours to be passable (no corner cutting). There is no continuous collision anywhere in the sim.
- **Jump:** targets the adjacent cell in the facing direction (8-way). Up: allowed if that cell's level is
  exactly current level + 1. Down: allowed to any lower level. A jump takes 12 ticks (0.4 s) and lands at the
  cell centre. If the facing cell is invalid, the jump button does nothing (no animation, no input lost).
- Because movement is on cells, the validator's BFS (section 13.7) and ghost replays use the same moves as play.
- Each room has 25–45 props (15 prop kinds in the MVP, reused), 3 Must-Wreck targets, 1 room event, and 1 human
  routine. Boss rooms: up to 60 props, 2 humans.

### 4.2 The cat (player)

| Verb | Mobile | Desktop | Effect |
|---|---|---|---|
| Sneak / trot | Drag the floating stick, small vs. full deflection | WASD / arrows; Shift = sneak toggle | Sneak 0.9 m/s (silent), trot 1.8 m/s (quiet) |
| Freeze (loaf) | Lift finger | Release all keys | The cat finishes its current step and stops at once; after 10 ticks (0.33 s) of no input it drops into a loaf: suspicion falls 10/s while seen. The delay keeps a quick thumb reposition from loafing the cat |
| Swat | SWAT button | J or left click | Pushes the nearest prop in facing direction within 1 cell; light props fall, heavy props wobble first (2 swats) |
| Jump | JUMP button | Space | Section 4.1 jump rule |
| Grab | SWAT button turns into a GRAB icon next to a glowing grabbable (slipper, sock, toy mouse, AirPods) | K | Carries it in the mouth; drop with another tap. Stash in the cat bed: +500 |
| Tablecloth / cable pull (M1a) | Swat a cloth or cable edge | J | Drags every prop on that cloth one cell; the classic "everything slides off" |

Zoomies are cut from the MVP (the gesture collided with swat and jump; section 5.1). `BTN_ZOOM` stays reserved
in the input bitmask.

Cat stats are identical for every cat (cosmetics and faces never change gameplay). Body type (slim / normal /
chonk) is visual only, except that chonk plays a heavier landing sound.

### 4.3 The human (the Watcher)

State machine (all durations seeded per room; shown in ticks at 30 Hz). This is new code: the Heist's
`telegraph.ts` warns before scripted sentry turns (`TELEGRAPH_TICKS = 36`) and has no Busy/Look/fake-out machine
or suspicion, so only the idea of a fixed warning lead carries over.

```
BUSY (90–270) ──► TELEGRAPH (15–24) ──► LOOK (45–105) ──► BUSY
      ▲                 │ 20% after 30 s
      └──── FAKE_OUT ◄──┘ (twitch only, back to BUSY)
EVENT (180, once per room): human leaves / faces away. NAP (Sunday): replaced by a noise meter.
```

- **Vision cone:** 70° wide, 4.0 m (10 cells) long. The human faces one of 8 directions, so the cone is a
  precomputed table of cell offsets per facing (no trigonometry in the sim). Occlusion is a **grid line walk** from
  the human's head cell to the cat's cell (the Heist's grid `lineOfSight`, adapted to `occludes`): the cat is
  hidden if any cell crossed has `occludes = 1` and the cat's level is below L3. Drawn on the floor during
  TELEGRAPH (outline) and LOOK (filled, red with a hatched pattern for colour-blind players).
- **The turn is a show:** on LOOK the human does a long, dramatic double-take (glance, look away, snap back, 0.8 s,
  a visual beat only; the cone timing is unchanged), so "turned 0.2 s too late" reads at phone size.
- **Suspicion meter (0–100):**
  - cat moving inside the cone during LOOK: +40 per second (sneak), +70 (trot)
  - a prop falling inside the cone during LOOK: +35 once per prop, +60 for a break
  - a crash anywhere during LOOK (out of cone, heard): +15
  - loafing inside the cone: −10 per second; during BUSY: −8 per second
  - **CAUGHT at 100.** The run ends; the human scoops the cat up (2.5 s cuddle animation, "BAD KITTY... come here").
- **Difficulty by day:** Mon easiest → Sat hardest. Telegraph length 24 ticks (Mon) → 15 ticks (Sat). Boss rooms
  have two humans sharing one suspicion meter.
- **Routines** (`content/routines.ts`): Chef Dad, Couch Potato, Skincare Sis, WFH Worker, Party Host, Napper,
  Grandma (slow turns, long looks). Each defines the Busy loop, telegraph cue (stove timer, TV jingle, "you're on
  mute"), and the room event. In the MVP every routine uses the same 3 human animation clips (section 11.1).

### 4.4 Props, falls and chain reactions (deterministic)

Prop states: `REST → WOBBLE → FALLING → BROKEN | LANDED | SPILLED`.

- **Push:** a swat pushes a prop one cell in the cat's facing direction. If the destination cell's level is lower
  than the prop's level (off the surface edge), the prop enters FALLING.
- **Fall time** is fixed by drop height: L1→L0 9 ticks, L2→L0 13 ticks, L3→L0 18 ticks, L3→L2 9 ticks.
- **Landing cell:** the cell one step in the push direction from the edge; the prop lands on that cell's level.
- **Domino rule:** if the landing cell (or the next cell in the push direction) holds an intact prop on a lower
  surface that has an edge in the push direction, that prop becomes FALLING too (cascade), at most 6 steps per
  chain.
- **Occupied landing cell:** if the landing cell holds an intact prop that cannot fall (on the floor, or no edge),
  the falling prop hits it: a fragile falling prop breaks there; a non-fragile one lands in the first free cell up
  to 2 cells further in the push direction, else it lands in place and both props count as "hit" for scoring.
  Broken pieces never occupy cells (shards are visual only).
- **Stack rule (M1a):** stacked props (plates, books, cups) fall together as one chain event with a per-item bonus.
  In M0 a stack is one prop with one base score.
- **Landing:** fragile props break (shards), soft props land (pillow, sock), liquids spill (a 2 × 2 puddle; in M0
  it is visual only, from M1a it makes the cat slide 1 cell and the Roomba spreads it).
- **M0 rule set:** push, fall, domino, occupied landing cell, break/land/spill. Spill-slide, the stack bonus,
  cloth and cable pull, and the Roomba follow in M1a.
- All randomness in the sim comes from `seedRng(roomSeed)` (xorshift32, `catnip-heist/src/sim/rng.ts`).
  Visual-only shards and wobbles may use their own RNG seeded by `tick` so a clip re-render looks identical.

### 4.5 Scoring

```
points(prop) = base(prop) × heightMult × comboMult × (event ? 1.25 : 1) × (lastCall ? 2 : 1)
heightMult  = 1.0 (L1) | 1.5 (L2) | 2.5 (L3)
comboMult   = 1 + number of breaks in the current chain, capped at 8; a chain ends after 60 ticks (2.0 s) without a break
```

| Bonus | Points |
|---|---|
| Must-Wreck target (×3 per room) | +1,000 each |
| Accomplice wish (Pink Paw cat) | +500 |
| Slipper / sock stashed in the cat bed | +500 per item, max 2 |
| Framed the Roomba (a prop lands within 1 cell of the Roomba while a human looks at it) | +300, and suspicion from that fall is 0 |
| On camera (Thursday) | +50% for crashes in the webcam's view |
| Perfect Crime (never above 50 suspicion, not caught) | +25% of total |
| Caught | keep 50% of total (a caught run still makes a good clip) |

Rank titles by score: Mildly Naughty (< 2,000), Menace (2,000+), Gremlin (5,000+), Agent of Chaos (9,000+),
Legendary Bad Cat (14,000+). Par paws per room come from recorded runs, not a bot: bronze = the median of 5 dev
runs, silver = the best dev run, gold = best × 1.15 (`tools/par.mjs`, section 13.7). Par can be re-set after
launch from the anonymous score distribution once analytics has enough runs.

### 4.6 The Pink Paw cast

- `public/pink-paw-cats.json`: names, colours, pattern, short bio, adoption URL and photo path for every
  adoptable Pink Paw cat, generated by `tools/sync-pink-paw.mjs` from the existing `GET /cat/sale` shape in
  `shared/pink-paw.ts` (snapshot at build time, so the MVP needs no live backend). The licence for names and photos
  exists (Oct 11). Pink Paw cats get face decals from their licensed photos.
- Each day one is the **accomplice** (wish + adopt link on the result screen). Every Friday one is the
  **playable criminal of the day**. Adopted cats move to an "Alumni" list and keep appearing as cameos with a
  "found a home" badge.
- **"Still waiting" story arc (post format 6, section 7.5):** each week one adoptable cat gets a crime clip
  ("Mila wrecked the Kitchen") ending on "Mila is still waiting", posted on Pink Paw's channels and the founder's
  account. When she is adopted, the "found a home" badge gets its payoff clip ("Mila went home. Her crimes stay in
  the game."). This is the press hook in section 15.3: "this cat got adopted because of a video game". Only real
  adoptions are claimed, with Pink Paw's confirmation; a clip never says the game caused an adoption unless the
  adopter said so.

---

## 5. Controls

### 5.1 Mobile (portrait, one or two thumbs)

- **Left 55% of the screen: floating stick.** Touch anywhere to place it; drag below 35% of radius = sneak,
  above 45% = trot, and between the two the speed does not change (hysteresis band). Lift = stop, then loaf after
  10 ticks (section 4.2).
- **Direction quantisation with hysteresis:** the stick angle maps to 8 sectors of 45°, but the current direction
  only changes when the angle moves more than 12° past the sector border, and a new direction must be held for 3
  ticks. Thumb jitter at a border therefore never flips the direction (it would also bloat ghosts, section 6.6).
- **Right side: two fixed buttons, SWAT (large) and JUMP (above it).** No taps, swipes or double-taps on the
  open screen, so a swat has no gesture-detection delay. SWAT shows a GRAB icon when a grabbable is in reach.
- **Browser gestures off:** `touch-action: none` and `overscroll-behavior: none` on the stage, `user-scalable=no` in
  the viewport meta, and a 24 px dead strip on the left and right edges (no stick placement there) so Safari's
  edge-swipe-back, pull-to-refresh and double-tap zoom never fire. These work only because the game is the top-level
  document (section 6.6); inside an iframe the parent page would own zoom, edge swipes and pull-to-refresh, and
  `env(safe-area-inset-*)` would report 0.
- **Input latch:** a button press is latched until the next sim tick reads it, so a tap released between two
  30 Hz ticks is never lost.
- **Haptics:** `navigator.vibrate(12)` on swat and 30 ms on a break (Android; iOS has no web vibration).
- **Safe areas:** HUD respects `env(safe-area-inset-*)`. Score top centre, suspicion meter as an eye icon above the
  human, timer top right, combo under the score.
- **Auto-assist:** swat snaps to the nearest prop within 60° of facing; jump targets the facing cell (section 4.1).
  Assist strength is identical for all players (fair ghosts).

### 5.2 Desktop

WASD / arrows move; Shift toggles sneak; Space jump; J or left click swat; K grab; Esc pause; R restart (practice
only). The stage is a 3:4 portrait viewport centred with side panels (left: today's targets and accomplice; right:
dare ghosts and Rap Sheet progress). Gamepad is deferred past M2.

### 5.3 Input to the sim

Each tick the input layer produces one `TickInput` (section 13.3): an 8-way direction + speed (0 none, 1 sneak,
2 trot), and a bitmask (SWAT, JUMP, GRAB; ZOOM reserved). Analog input is quantised (with the hysteresis in 5.1)
before it reaches the sim so replays are exact on every device. The sim reads the direction only at step ends,
but the recorded input is per tick, so the hysteresis is what keeps ghost RLE runs few.

---

## 6. UGC system

Five creation surfaces, ordered by how many players use them (1-9-90 rule from
[ugc-platforms §4](research/ugc-platforms.md)): seconds-long identity creation for everyone, reply videos for the
people who comment, a link for many, an editor for a few, cameos for fans.

### 6.1 My Cat (everyone, ~20 s, M0)

Flow: from a link, **before** the first run ("Snap your cat (10 s)", with "Skip, use a house cat"); from the home
screen, any time. Options: **Take photo / Choose photo or short video / Pick by hand**.

1. The photo is read into a canvas **on the device** (never uploaded in the MVP).
2. **Face decal** (`catmaker/face-decal.ts`, M0): the player drags and pinches an oval over the cat's face (pre-placed
   at the centre). The crop becomes a 256 × 256 texture with a feathered alpha edge. The cat model has a **dedicated
   face quad** (its own UV island, parented to the head bone, authored once in Blender), and the crop simply
   replaces that quad's `map`. It moves with every animation because it is part of the skinned head; a projected
   `DecalGeometry` would be static and slide off. The rest of the cat stays low-poly. The mismatch, a real face on
   a toy body, is the paper-doll joke, and it makes the cat recognisable as *this* cat. Whether it reads as funny
   rather than creepy at phone size is tested before the kill test (section 15.0, stranger check).
3. **Body colour:** the median colour of the crop's outer ring seeds the base fur colour; the player fixes it with
   chips. Full k-means palette + pattern guess (`photo-palette.ts`, `pattern-guess.ts`) is deferred to M2.
4. Confirm screen: live 3D preview turning on a plinth; chips for pattern (solid and tabby in M0; all 7 from M1a),
   base and secondary colour, eye colour (6), ears (normal / fold), tail (normal / fluffy / bob), body (slim /
   normal / chonk), and a 12-character name.
5. Save: the body is a **CatSpec** (section 13.3), 11 bytes, encoded as a 15-character cat code. The face decal and
   the source photo stay in IndexedDB on the device.

**Photo input:** the file input asks for `image/jpeg, image/png, image/*` and decodes with `createImageBitmap`.
iOS hands Safari a JPEG; where a browser cannot decode a HEIC file, the game asks for a screenshot or a JPEG. Live
Photos are not supported (a web file picker returns only the still).

**Opener media:** the source photo or the first 2 s of a chosen video (M1a; M0 uses a still, or a frame grabbed
from the video) is kept as the clip opener (section 7.3). "Show my cat's photo in clips" is on by default for media
chosen in this flow, with a visible toggle on the share sheet.

**More than one cat (Club, M2):** free players keep one cat. Club members keep up to 5 cats, each with its own face
decal, and get the "household" clip format ("Mochi vs Luna: who's worse?", two runs of the same room cut
together) and their other cats as spectators in their own rooms. Many owners have two or more cats, and identity
is what they pay for.

**What travels in links:** only the CatSpec. Other players see your cat's colours and pattern with the default
low-poly face; face decals do not fit in a URL. Faces reach other players only through moderated cameos (6.4).

**In-app browsers:** TikTok and Instagram webviews keep IndexedDB apart from Safari/Chrome. When the handoff
(section 7.3) moves a player to the real browser, the run travels in the URL but the photo does not; the browser
asks for the photo again with one tap ("Add Mochi's photo again for the clip opener", skippable).

Phase 2: "Import from /yourcat" uses the existing Gemini pipeline for a better pattern guess and adds the pixel
portrait to cards (after the `/yourcat` launch checklist in `docs/YOURCAT.md` is done).

### 6.2 Stitches, quotes and reply videos (borrowed reach first, then comments)

A brand-new account gets no comments, so "comment your cat and I'll put it in the game" cannot start on its own.
The first format borrows reach from accounts that already have it; reply videos take over once comments arrive.

- **Stitch and quote (main format for the first 2 weeks of the kill test):** take an already-viral cat video, put
  that cat in the game, and post it as a TikTok Stitch of the original, or on X as a quote of the original post,
  tagging the owner: "I put @owner's cat in my game." **Ask the owner first** (DM or a comment on the post) and post
  only after a yes; ask about 10 owners a day to get 2–3 yeses. The owner's audience sees their cat; the owner often
  reposts.
- **Reply videos (from the first real comments):** "Comment your cat's name and photo and I'll put them in the game",
  answered with TikTok "Reply to comment" videos. Each reply tags the commenter, who shares it with their own circle.
  The founder asks "ok if I put her in the game?" in the comment thread first.
- **Founder pipeline** (M0: the game itself; M1a: `?studio=1`, a dev URL flag, not a separate tool): drop in a
  **screenshot of the source video** or the commenter's photo → face decal crop (10 s) → name → play a 40 s practice
  run by hand → the clip renders, with the handle in the caption overlay from M1a ("I put @luna.mom's cat in my
  game"; in M0 the founder types the caption in TikTok) → save. Target: ≤ 2 minutes of founder time per clip.
- **Player template** (M1b): the share sheet's "Stitch / Reply video" format does the same for any creator: pick a
  screenshot or photo, type the handle, play, post.
- Every replied or stitched cat is offered a free cameo (section 6.5), capped at 20 free reply cameos a week.

### 6.3 Dare links with ghosts (many players, M1)

- After a ranked or practice run, **Dare a friend** creates a link that opens the same room (pinned `dayNo`) with
  the sender's run replaying as a translucent ghost cat (with the sender's cat colours and name).
- The receiver plays immediately with no login: snap a cat or skip to the default cat. Result: "You beat Mochi by
  1,240" or "Mochi still rules Kitchen #18". The result card links back with both ghosts (`g` and `g2`), so dares
  chain.
- Received ghosts are stored locally (max 50) and form the **Friends board** for that room without a server.

### 6.4 Room Maker (few players, M2) [Trap]

- **Entry:** "Build a room" on the home screen, or "Remix" on any room opened from a link.
- **Step 1, shell:** Kitchen, Living room, Bathroom, Home office, Party room, Bedroom (6).
- **Step 2, props:** a bottom palette with 6 tabs (Fragile, Food, Fabric, Tech, Plants, Party) and the prop kinds
  available at the time (15 at launch). Tap a cell to place (auto-snaps to the highest surface in that cell), drag
  to move, tap a placed prop to rotate 90°, long-press to delete. Undo/redo (20 steps).
- **Step 3, human:** pick one of 4 routines (Chef Dad, Couch Potato, WFH Worker, Napper) and one room event.
- **Step 4, targets:** tap 3 props to mark Must-Wreck.
- **Limits:** 40 props, chaos budget 3,000 base points, at least 1 occluding furniture piece, the cat spawn
  reachable to every target (checked by the BFS validator).
- **Step 5, clear it:** the maker must finish a run with ≥ 1 of 3 targets wrecked before Publish unlocks (Mario
  Maker rule: no impossible rooms). Built as 1 of 3 (`CLEAR_MIN_TARGETS`, QA round 3 noted the gap): the BFS
  validator already proves every target reachable and wreckable, and 2 of 3 in a first-time maker's own run broke
  the 3-minute bar in testing. Revisit with real maker data.
- **Publish:** generates the room link and a 1200 × 630 OG card. Nothing is uploaded, so publishing is unlimited
  and free for everyone. Optional "Speed build" mode adds a 90 s timer and a "built in 0:87" badge (a clip format of
  its own).
- **Remix:** opens the room in the editor; the payload keeps up to 3 ancestor author names ("Remix of Zyg's
  Kitchen by Mia"), shown on the room card.
- **Community Sunday:** from week 3, the founder picks one shared room per week (sent by link or by comment) as
  Sunday's daily room, credited on the briefing card. Free for the creator; it is the strongest status reward the
  game has.

### 6.5 Cameos (fans, M1) [Tower]

- **Places per daily room:** 10–15 spectator slots (cats on windowsills and shelves), the fridge wall (40 face
  magnets), and 1 accomplice slot reserved for Pink Paw.
- **Filled per page load from a weighted pool, not a fixed list.** A fixed list breaks at the target: ~94 Club
  weekly cameos + ~11 paid + up to 20 free + 2 streak winners ≈ 127 cameos a week against 70–105 slots, and a
  "daily fridge wall for every Club cat" stops fitting above 40 members. Instead, each page load is assigned one of
  8 **shuffles** of the day (`hash(sessionId, dayNo) % 8`); each shuffle is a seeded sample of the day's pool:
  - spectator slots: weight 4 for a paid cameo or guest star on its day, 2 for a Club cat's weekly cameo, 1 for a
    free cameo;
  - fridge wall: 40 magnets sampled from all Club cats (weight 2) and the day's other cameo cats (weight 1).
- **What is sold is views, not a slot:** a cameo guarantees "shown in at least 300 room loads" on the chosen day
  (it stays in the pool on later days until it reaches 300). The shuffle design makes this cheap to count: the
  cameos function does one `INCR` per page load on that shuffle's counter, and a cat's count is the sum of the
  counters of the shuffles it was in. No per-cat writes, no personal data.
- **How to get one:**
  - buy a cameo ($4.99, Stripe Checkout): your cat in the pool on a chosen upcoming day, ≥ 300 room loads;
  - buy a **guest star** ($9.99): your cat is a playable criminal on a chosen Friday, next to the Pink Paw cat (the
    player picks which one to play; the briefing card names both);
  - Club: one weekly cameo in the pool, plus a place in the fridge-wall pool every day of the membership;
  - gift one (M1b, section 9.2);
  - win one free: stitched and reply-video cats (capped at 20 a week), the top Community Sunday builder, and 2
    random 7-day-streak players a week who opt in.
- **Fulfilment without the founder:** the Stripe Checkout collects the cat code, name, chosen day and an optional
  face photo. The Stripe webhook (`client/pages/api/badcat/stripe-webhook.ts`) writes the cameo into a key-value
  store (Upstash Redis from the Vercel Marketplace, or Vercel Edge Config); the game reads
  `GET /api/badcat/cameos?day=<n>&s=<shuffle>` at load. No room file edit, no redeploy.
- **Faces in cameos:** a submitted face photo is shown only after the founder approves it in a one-tap review list.
  Approval is once per cat, not per cameo, so the load is the new cats a week (≈ 10 new members + ~11 cameo
  buyers + up to 20 free cats ≈ 40 at the May target), under the ~50 a week a person can do in a few minutes a day.
  Until approved, the cameo shows the cat's colours with the default face. Beyond ~50 new faces a week, faces move
  to the `/yourcat` moderation path (Phase 2).
- The cameo card ("Mochi is in Kitchen #18, find her on the fridge") is generated for the owner to post. Each
  owner who posts it brings their own circle into that day's room. Cameo buyers see "Weekly cameo with Club,
  $4.99/mo" on the thank-you page.
- **Seen counter (M1b):** "Mochi was seen in 3,214 rooms this week" on the owner's home screen, the weekly Rap
  Sheet card, and (M2) a weekly email to Club members. It comes from the same shuffle counters, so subscribers see
  what they pay for.

### 6.6 Share-link format

All game links work with no backend. **`/badcat` is served top level, with no iframe.** Inside an iframe,
`env(safe-area-inset-*)` reports 0, the game's `user-scalable=no` is ignored (the parent page owns zoom), edge
swipes and pull-to-refresh belong to the parent document, iOS sizes iframes unreliably, and `navigator.share`
needs an `allow` attribute. Instead, `client/next.config.js` rewrites `/badcat/*` to the static build in
`client/public/badcat-game/`, and the build pre-renders one small HTML file per `dayNo` (`d/<n>.html`, with that
day's OG title and image) plus one per link shell (`r.html`, `c.html`, `pick.html`) with static OG tags, all
loading the same JS bundle. This runs in `tools/render-og.mjs`, which already runs at build. The Heist host
(`client/pages/heist.tsx`) is not changed. Standalone exports use the same parameters in the hash (`#d=18&g=…`).

**Room picker for typed arrivals.** TikTok keeps pushing a clip for days or weeks, so a viewer who saw "Christmas
tree" and types the short URL would otherwise land on today's bathroom. The short-domain root opens
`/badcat/pick?e=t`: "Which room did you see?" with thumbnails (the OG images) of the last 14 daily rooms, "The
Glass" hook room first, and today's room. Each thumbnail opens its own `/badcat/d/<n>` as a practice run (today's
opens the ranked run). Clips carry the room name and number on their caption ("Kitchen #18"), so the viewer can
match them.

| Link | Format | Example |
|---|---|---|
| Daily room | `/badcat/d/<dayNo>` | `tokentails.com/badcat/d/18` |
| Dare (ghost) | `/badcat/d/<dayNo>?g=<ghost>&c=<cat>&n=<name>` | `…/d/18?g=AQ3k…&c=Bv4LmQ…&n=Mochi` |
| Chained dare | adds `&g2=<ghost>&c2=<cat>&n2=<name>` (max 2 ghosts in a link) | |
| Clip handoff | `/badcat/d/<dayNo>?rp=<ghost>&c=<cat>&n=<name>&clip=1` | opens straight into the clip render in the real browser (section 7.3) |
| Player room | `/badcat/r?r=<room>&n=<title>&a=<author>` | `…/r?r=AgEMCg…&n=Zyg%27s%20Kitchen&a=Zyg` |
| Room + dare | `/badcat/r?r=<room>&g=<ghost>&c=<cat>&n=…` | |
| Cat card | `/badcat/c/<cat>?n=<name>` | opens the cat on a plinth with "Play as a cat like Mochi" |
| Creator code | any link + `&via=<code>` (6–12 chars) | `…/d/18?via=catmemes` |
| Short URL | the short domain root → `/badcat/pick?e=t` (room picker) | counted as `entry=typed` (section 14) |
| Hook room | `/badcat/glass` | "The Glass", always playable, free |

**Encoding** (`src/codec/`): a version byte, a bit-packed payload, CRC-16, then base64url. Ghosts are
deflate-compressed with `CompressionStream('deflate-raw')` (Safari 16.4+; a flag bit marks uncompressed fallback).

| Payload | Layout | Typical size |
|---|---|---|
| CatSpec (`c`) | v:4, pattern:3, ears:1, tail:2, body:2, eyes:3, base RGB565:16, secondary:16, tertiary:16, collar:8, hat:8, reserved:9 = 88 bits | 11 B → 15 chars |
| Ghost (`g`, `rp`) | v, dayNo or roomHash:32, simVersion:8, ticks:12, then RLE runs of (dir:4, speed:2, flags:4, count:8) | ~150 runs → ~280 B deflated → ~380 chars (an estimate until the size test below passes) |
| Room (`r`) | v, shell:3, routine:2, event:2, spawn x:4 z:4, prop count:6, per prop (kind:7, x:4, z:4, level:2, rot:2, target:1) = 20 bits, ancestors ≤ 3 × 12 chars | 40 props → ~150 B → ~200 chars |
| Name / title | URL-encoded UTF-8 after the filter (section 6.7), ≤ 12 / 24 chars | |

The spawn cell is two 4-bit fields (x ≤ 15, z ≤ 15), which covers the 14 × 12 boss rooms; a single 7-bit index
(max 127) could not hold 168 cells. The codec tests round-trip a boss-size room. Worst case (room + 2 ghosts + 2
cats + names) stays under 1,600 characters, below the ~2,000 character limit that some chat apps apply to links.
**Size test:** the ghost-size budget is locked by a test that encodes recorded human runs on a real phone (5 runs,
touch input with the 5.1 hysteresis), not a scripted run. Without hysteresis, thumb jitter at sector borders would
produce hundreds of direction changes and ghosts 2–4× the estimate. If a recorded run exceeds 600 characters, the
input layer is tuned before the codec ships.

### 6.7 Moderation

- **No uploads in the MVP game.** Photos never leave the device; rooms and ghosts are numbers; the only free text is
  a 12-char cat name, a 24-char room title and a 12-char author name. The one exception is the optional cameo face
  photo, which goes through Stripe Checkout to the founder and is shown only after manual approval (6.5).
- `codec/text-filter.ts`: normalise (NFKC, lower case, leetspeak map), block-list in EN, LT, ES, PT, DE, FR, PL, RU,
  strip URLs, @handles, phone numbers and emails, allow letters, digits, space and 20 whitelisted emoji. Blocked
  names render as "A Cat" and blocked titles as "Untitled Room". The filter runs on encode and again on decode (so
  hand-crafted links are filtered too). The reply-video handle overlay is typed by the poster, not stored in links.
- Every link-opened room or ghost has a "Hide and report" item: hides it locally and sends `ugc_reported` with the
  payload hash (when analytics consent is granted).
- Only hand-picked rooms ever reach other players without a link (Community Sunday). There is no public feed in the
  MVP; a feed waits for Phase 2 with server-side checks.
- Phase 2 photo upload goes through the existing `/yourcat` moderation path (App Check, Gemini safety), not a new one.

---

## 7. Viral loops and share artifacts

### 7.1 The loops

```
(S) Borrowed reach    viral cat video → owner says yes → Stitch / X quote "I put @owner's cat in my game" → owner's
                      audience sees it, owner reposts → comments "do mine" → feeds (A)
(A) Reply loop        comment "put my cat in" → reply video tags the commenter → commenter shares → more comments
(B) Clip loop         play → 12 s clip → TikTok / Reels / Shorts / X → viewer types the short URL from the clip's
                      last 2 s, or searches the name → room picker → the room they saw → snaps cat → plays → clip
(C) Dare loop         play → "Dare a friend" → friend plays vs ghost → "beat you by 1,240" → re-dare
(D) Identity loop     My Cat → cat card / Rap Sheet mugshot → "make your cat" → new player makes cat → card
(E) Cameo loop        owner gets a cameo → posts "my cat is in Kitchen #18" → their circle plays that room
(F) Room loop (M2)    build room → "nobody can wreck my kitchen" → link → players → remix → credit chain
(G) Chat loop         emoji card pasted into an existing group chat → friends open /d/18 (in-chat only)
(H) Shelter loop      Pink Paw accomplice + treat meter → weekly "Mila is still waiting" clip → rescue communities
                      share → "Mila went home" payoff clip → press
```

Planned K-factor: 0.2–0.4 from A–E combined ([social-loops §2](research/social-loops.md): plan on K < 1). Growth
comes from the volume of distinct clips, Stitches and reply videos (section 15) and a 1-day cycle time, not from
compounding. (S) is not a player loop; it is how the founder's accounts get their first viewers and comments.

### 7.2 Emoji text card (in-chat feature only)

Wordle spread through group chats of people who already knew each other. A zero-follower account posting text
grids gets no impressions, and the card has nothing a stranger can watch. So the emoji card is a "Copy for the
group chat" button under "More", not a post format, and no founder time goes into daily emoji posts.

```
BAD CAT DAILY #18 🍳
🐾💥💥🙀🧊💥🤖💥🎯
chaos 8,420 · ×6 combo · seen 0×
🟢 PERFECT CRIME · Agent of Chaos
tokentails.com/badcat/d/18
```

Line 2 is a spoiler-free timeline: one emoji per ~8 s bucket. 🐾 sneak, 💥 break, 🙀 seen, 🧊 froze in time,
🤖 framed the Roomba, 🎯 Must-Wreck target, 😾 caught. Line 4 stamps: 🟢 PERFECT CRIME, 🟡 CLEAN-ISH, 🔴 CAUGHT.

### 7.3 The 12 s clip (720 × 1280 MP4, H.264, 30 fps, ~2–4 MB)

The clip tells **one crime**, not a montage. The cat clip that keeps working is one act: the cat stares at the
camera, a slow paw, the glass falls, the human turns too late. Two or three low-poly gameplay cuts in a row read as
noise at feed speed, so the clip is built on a single take.

| Time | Content | Rule |
|---|---|---|
| 0.0–2.0 s | **Real footage of the cat:** a 2 s video (always, on the founder's accounts, joined by hand until M1a; players can use a video from M1a or a photo, which gets a slow 3% push-in), with one caption line (white text with a soft shadow, top third), e.g. "POV: you left Mochi alone for 75 seconds". Without opener media: a close-up of the game cat staring at the wine glass, no HUD. | **0–1 s contains no UI**: no HUD, score, buttons, logo or URL. Motion in the first second |
| 2.0 s | **Match cut** to the game cat in a fixed close-up pose whose face fills the same face rectangle the photo was cropped to (section 6.1). No camera solve: the crop rectangle and the 3D pose are both fixed. | The hook |
| 2.0–9.0 s | **One crime, one take (6–8 s at 1×):** the camera holds on the cat and the target. The cat looks into the camera and blinks slowly (0.6 s, the signature beat), then the slow push on the chosen target. The human's "hm?" sting and double-take land as the target goes over the edge. HUD hidden; only diegetic cues (cone, "?" bubble). | The cat and the falling object fill the frame; the diorama never does |
| 9.0–11.0 s | Slow motion (0.35×) of the fall and the loud crash, then the human's long double-take at 1× ("turned 0.2 s too late") | The payoff that makes people watch twice |
| 10.0–12.0 s | The caption line changes to the short URL and the room: "{short URL} · Kitchen #18". It is caption text over the action, not an end card | The call to action sits inside the safe area |
| 11.0–12.0 s | The crash's peak cuts back to the real cat (the opener's first frame) | Seamless loop: the clip restarts on the real cat |

**Choosing the crime (`share/clip/highlights.ts`): tension, not points.**

- Candidates: every fall of a Must-Wreck target or fragile prop, each with a 7 s window that ends 1.5 s after the
  break.
- Tension score per candidate: the peak suspicion in the 3 s before the fall (near 100 without a catch scores
  highest), + a bonus if the cat froze in the cone and got away in that window, + the largest bonus for a **"turned
  too late"** beat: a LOOK that starts within 12 ticks (0.4 s) after the prop leaves the surface. The caption uses
  the measured gap ("He turned around 0.2 seconds too late").
- Ties go to the earliest candidate; with no tension at all, the clip uses the first Must-Wreck target's push. On a
  CAUGHT run, the cuddle replaces the slow motion as the payoff.
- The clip camera is a close follow camera with a slow push-in, separate from the gameplay camera (section 11.1).

**Branding and call to action:**

- **No end card and no stamp.** Score, stamp and rank stay on the image cards.
- **Watermark top left** (paw + short URL, ~4% of frame height) from 1.0 s onwards, on every tier, inside the
  safe box that keeps clear of the top 11% (feed tabs), the right 16% (like, comment and share buttons) and the
  bottom 25% (caption and sound) of the frame. The old bottom-right spot sat under TikTok's buttons and caption.
- **The URL is written into the caption text in the last 2 s** (above). Without it, the "typed arrivals per 1,000
  views" metric (section 16) would measure the overlap, not interest.
- **Gates for every clip format** (checked in `highlights.ts` tests and the device matrix): 0–1 s has no UI; the
  caption is readable with the sound off in 1 s; the watermark and the URL line sit inside the safe box; the URL
  line is present in the last 2 s; the last frame matches the first frame's framing; no "link in bio" anywhere.

**Audio:** SFX only by default: the loud, crunchy cartoon crash and the "hm?" sting (section 12). The founder
always adds a trending sound inside TikTok on their own posts (it matters more than the in-game mix) and keeps the
SFX under it. Other creators get the SFX-only clip by default; a toggle "Add music" adds a 12 s music sting.

**Caption templates** (`ui/copy.ts`): "POV: you left {cat} alone for 75 seconds", "{cat} has never been caught",
"He turned around {gap} seconds too late", "Framed the Roomba. Again.", "Kitchen #{day}: my cat vs. the wine
glass", "Rate how bad {cat} is 1–10", "This is what {cat} does when you leave", "Me pretending I didn't hear that
crash", "{cat}'s criminal record keeps growing", "My cat in a video game vs. my cat in real life", "Day {streak}
of letting my cat destroy a kitchen", "I put @{owner}'s cat in my game", "{cat} is still waiting for a home".

**Rendering (same renderer, same context):** after the run, the game's own `Renderer` re-runs the sim from the
recorded inputs and draws each clip frame at 720 × 1280 into the same canvas behind a cover overlay (the result
screen). No second WebGL context.

- The clip pass **freezes the DPR governor** (`quality.ts`) at its current tier, resizes the drawing buffer to
  720 × 1280 once at the start, and restores the size and tier at the end, so the governor never fights the resize.
- Each frame is rendered and wrapped with `new VideoFrame(canvas)` **in the same task**, before the browser can
  clear the buffer (no `preserveDrawingBuffer`, which costs speed on every frame).
- The encoder is WebCodecs `VideoEncoder` muxed with `mediabunny` (the successor of `mp4-muxer`). Before encoding,
  probe `VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', … })` and fall back down the profile list. Every
  `VideoFrame` is closed right after `encode()`, and rendering waits while `encodeQueueSize > 4` (backpressure).
- **`webglcontextlost` during the clip pass** (backgrounding mid-encode) aborts the encode; after the context is
  restored, "Clip interrupted. Tap to retry" re-renders from the recorded inputs.
- **Lazy loading:** `mediabunny` and `share/clip/*` load with a dynamic `import()` when the run ends (during the
  result screen), so they stay out of the 450 KB first-load JS budget (section 11.2).
- **Audio on iOS, decided now:** `AudioEncoder` appears to be missing in iOS 17–18 Safari, the main matrix targets.
  The boot probe checks it. Where it is missing, the clip is made with fallback 1 (real-time `MediaRecorder` on
  `canvas.captureStream(30)` plus a `MediaStreamAudioDestinationNode` for the SFX, ~12 s to record), if the M0
  device test shows that this gives a valid MP4 with sound on a real iPhone. If it does not, iOS clips ship silent
  from the WebCodecs path and the share sheet says "Add a sound in TikTok". Either way the iOS result is known by
  Oct 30, not found in week 2, and `bc_clip_export.audio` measures it.
- Fallback 2: the image card plus a 2 s animated GIF of the slow-motion crash. Target: ≥ 85% clip success on iOS
  Safari 17+ and Chrome Android 120+, tested on a real iPhone 11 in M0, not only in Playwright WebKit.

**Delivery:** the clip renders during the result screen. When it is ready, the **Post clip** button lights up; the
player's tap on it calls `navigator.share({ files: [mp4] })` (a fresh user gesture; calling it after the async
encode without a new tap throws `NotAllowedError` on iOS). Where file sharing is missing: download with a "Saved.
Post it to TikTok" toast, else an inline `<video>` with "long-press to save".

**In-app browsers (TikTok, Instagram):** detected at boot (`bc_boot.in_app_browser`). The game plays there. TikTok
and Instagram webviews often disable `navigator.share`, so at share time the sheet shows "Open in Safari/Chrome to
save your clip" and copies the clip handoff link (`?rp=…&clip=1`, section 6.6) with the "•••" → "Open in browser"
steps. That is all M0 does. M1a adds the Android `intent://` link that opens Chrome directly and the handoff events;
the real browser re-renders the clip from the replay in the URL. Target: ≥ 60% of in-app sessions that reach the
share sheet save a clip, measured from week 1. It is a KPI, not an M0 gate, because it depends on other apps' menus.

### 7.4 Image cards and OG images

| Artifact | Size | Content | Where made |
|---|---|---|---|
| Result card | 1080 × 1350 | Freeze-frame of the biggest crash, cat inset (real photo circle if enabled), score, stamp, rank, timeline emoji, "beat {cat} → tokentails.com/badcat/d/18" | Client canvas, `share/image-card.ts` |
| Story card | 1080 × 1920 | Same, vertical, for IG/TikTok stories and photo mode | Client canvas |
| Rap Sheet mugshot | 1080 × 1920 | Mugshot pose in front of a height chart, "Wanted for: 212 vases, 14 cakes, framed the Roomba 9×", rank, streak | Client canvas, weekly and on demand |
| Cat card | 1080 × 1350 | 3D cat with its face decal on a plinth, name, pattern, "Make your cat: {short URL}" | Client canvas |
| Cameo card | 1080 × 1350 | "Mochi is in Kitchen #18 · find her on the fridge" | Client canvas |
| OG daily | 1200 × 630 | Room render, "Kitchen #18 · Breakfast Heist · can your cat wreck it?"; also the picker thumbnails | Pre-rendered at build by `tools/render-og.mjs` into `public/og/d/<n>.png`, with the per-day HTML (section 6.6) |
| OG dare/room | 1200 × 630 | Static per-shell image in the MVP (a dare link shows its day's OG); Phase 2: a per-link image ("Mochi scored 8,420. Your cat can't.") from a server function | Phase 2 needs a server-rendered page for these paths, since the MVP pages are static |

### 7.5 The six post formats a zero-follower creator will use

None of them uses "link in bio": TikTok personal accounts get a bio link only at 1,000 followers, and links in
TikTok comments are not clickable. Every format points to the short URL (in the top-left watermark and written into
the caption text in the clip's last 2 s, section 7.3) and to the search name with **one owned hashtag** used on
every post (working name "bad cat daily" / `#badcatdaily`, locked only after the search check in section 18 #12).
The poster pins a comment: "Type {short URL} and pick the room you saw." Each format is a template in the share
sheet ("Post as…") that pre-fills the caption and picks the artifact.

1. **"I put @owner's cat in my game"** (TikTok Stitch of a viral cat video; on X, a quote of the original post).
   The owner's cat goes in from a screenshot of their video (section 6.2), the owner is tagged, and the owner said
   yes first. **The main format for the first 2 weeks of the kill test**, because a new account has no comments
   to answer and this borrows the original's audience.
2. **One-crime POV: "POV: you left {cat} alone for 75 seconds"** (TikTok, Reels, Shorts). The default 12 s clip:
   2 s real video, match cut, one crime, the human turns too late (section 7.3). Caption: "{cat} chose violence 😼
   {short URL} #badcatdaily #catsoftiktok #cattok".
3. **Reply video: "Replying to @user: I put {cat} in the game"** (TikTok "reply to comment", Reels comment reply).
   Takes over from format 1 once comments arrive. The commenter's cat goes in, their handle goes in the caption
   overlay; every video ends in "comment your cat's name and I'll do yours".
4. **"My cat in real life vs. my cat in the game"** (split screen, stitch-friendly). The share sheet exports a
   720 × 640 top-half game clip; the owner films their real cat for the bottom half (or uses an old video). The
   weekly **Crime of the Week** (e.g. "the counter push") gives a pose to recreate, the Dress to Impress "Pose 28"
   mechanic. This is also the format for cat subreddits (section 15.1), because it is mostly a real cat.
5. **"Framed the Roomba"** (X, native video, from M1a when the Roomba ships). A 6 s clip of the frame-up + "he
   never suspected a thing", posted as native video, never as a link. Replies weigh 10× a like and author-answered
   replies 150× ([creator-virality §3](research/creator-virality.md)), so the poster answers every reply. The URL
   goes only in a self-reply. The "Rate how bad my cat is" carousel (TikTok photo mode, IG carousel: real cat photo
   → game cat card → crash freeze-frame → Rap Sheet mugshot → "Your cat next? {short URL}") stays as a no-filming
   variant for creators, but it is not a founder kill-test format.
6. **"Mila is still waiting"** (weekly; Pink Paw's channels and the founder's account). An adoptable Pink Paw
   cat's one-crime clip, ending on "Mila is still waiting" and her adoption link in a self-reply or Pink Paw's bio;
   when she is adopted, the payoff clip "Mila went home" with the "found a home" badge (section 4.6). It tells the
   strongest story the game has, and it is the press hook (section 15.3).

The emoji card is not a post format (section 7.2). Household clips ("Mochi vs Luna", Club, M2) are a variant of
format 2.

---

## 8. Progression and retention

| System | Rule | Free | Club |
|---|---|---|---|
| Daily seed | New room at local midnight; 1 ranked run (honour-based) | yes | yes |
| Archive and replays | Replay any past daily (ranked score frozen; practice score new) | last 14 days (the same rooms the picker shows) + "The Glass" | all days + boss-room replay pack |
| Streak | Days with a ranked run; flame on the home screen and card | yes | yes |
| Streak freeze ("Nine Lives") | Auto-used on a missed day | 1 per week | 3 per week |
| Rap Sheet | 48 crime entries (one per prop kind + 8 special: Roomba frame, tablecloth, Zoom crash, etc.); each stamps a mugshot page | yes | yes, plus gold stamps |
| Most Wanted | Weekly credit on the Rap Sheet card | 7 golds in a week | every Club cat named |
| Cameo | Your cat in other players' rooms | free cameos (6.5) | 1 weekly cameo in the pool + a daily place in the fridge-wall pool, with the seen counter |
| Cats | Cats saved on this device | 1 | up to 5, each with a face decal; household clip (M2) |
| Par paws | Bronze / silver / gold per room | yes | yes |
| Season track | 6-week seasons, 30 tiers earned with chaos XP (ranked run = 100 XP + score/100, practice runs capped at 5 a day) | 15 free cosmetic tiers | all 30 tiers (the season pass is part of Club, not sold alone) |
| Club cosmetics | Club collar, 4 clip caption styles, animated Rap Sheet card; all visible in clips | — | yes |
| Weekly Rap Sheet card | Sunday 18:00 local | yes | animated version |
| Friends board | From received dare ghosts (local, max 50) | yes | yes |
| Streamer layout | Clean 16:9 layout with the stage and a dare QR code | — | flag in settings |
| Global board | Phase 2 (backend) | top 100 + your rank | — |

**Seasons:**

| Season | Dates | Theme | Boss rooms | Club track cosmetics |
|---|---|---|---|---|
| S0 "Soft Launch" | Nov 16 – Nov 30, 2026 (skipped if Day #1 moves to Dec 7) | House basics | Birthday party | none (free track only) |
| S1 "Deck the Halls" | Dec 1, 2026 – Jan 10, 2027 | Christmas tree, gift wrap, cookie tray | Christmas tree (every Saturday), New Year's party (Dec 31) | Elf collar, Santa hat, tinsel trail, "Grinch" stamp |
| S2 "New Year, Same Cat" | Jan 11 – Feb 21, 2027 | Gym gear, meal prep, home office | Valentine's dinner (Feb 14) | Sweatband, heart-glasses |
| S3 | Feb 22 – Apr 4 | Spring cleaning | Easter brunch | |

**Return reasons without an app:** "Add to Home Screen" prompt after the 2nd daily (PWA manifest, offline-capable
service worker for assets); an optional `.ics` calendar reminder at the player's chosen time (no email needed);
Club members get the receipt email address used for restore, and Phase 2 adds optional streak emails or web push.

**First-time user experience (from a link).** Goal: a postable clip within 90 s of the link opening.

1. Loading screen shows the room and "Be a bad cat" (≤ 3 s). In an in-app browser, a small banner offers "Open in
   Safari/Chrome for the best clip" (dismissable; play continues here).
2. "Snap your cat (10 s)" with **Skip** (skip = the hard-coded default house cat, a grey tabby called "Tofu"; the
   Pink Paw roster is not needed for the FTUE).
3. A 40 s first heist on today's room (practice): first turn at 8 s, room event fixed at 15 s, three contextual
   prompts in the first 10 s (drag to sneak, SWAT, let go when he turns).
4. The clip renders behind the result screen; **Post clip** lights up (≤ 90 s from link open; measured as
   `link_to_clip_ms`).
5. After the share sheet: "Your ranked run for Kitchen #18 is ready" (75 s).
6. **No Club, cameo or gift card anywhere in the first session** from a link (section 9.2).

Typed arrivals (short URL) see the room picker before step 2 (section 6.6); a picked past room is the step 3
practice run.

Dare-link arrivals skip step 3 and play the full ranked run against the ghost after step 2. No account and no name
prompt before the first crash (the cat maker's name field defaults to "Tofu" or blank-to-skip).

---

## 9. Monetization

### 9.1 Principles

1. Never sell power. Every cat plays the same; ranked runs are equal.
2. Sell "your cat, featured": identity that shows in clips and in other players' rooms (cameos, Most Wanted,
   cosmetics, more than one cat), because every sale is then an ad.
3. MRR counts only recurring lines: Club subscriptions and Brand Shelf contracts. One-off sponsor days, cameos,
   gifts and cosmetics are not MRR ([monetization §1.1](research/monetization.md): fly.pieter.com $87k MRR → $0).
4. The watermark and short URL stay on every tier.
5. Money stays on tokentails.com (Stripe, ~91–97% kept depending on price). No portal builds in the first 6 months.
6. Purchases must survive the in-app browser: Stripe Checkout works inside it, always collects an email, and
   restore by email works in any browser.
7. A purchase never comes before the share, and never in a player's first session.

### 9.2 Catalogue and price points

| Product | Price | What it is | Ships |
|---|---|---|---|
| **Chaos Club** | **$4.99/mo or $39.99/yr**, shown side by side at checkout as a toggle ("$3.33/mo, save 33%") | Promise, line 1: **"Your cat, featured: in other players' rooms every week."** Line 2: **"Keep all your cats: up to 5."** Weekly cameo in the pool with the seen counter (6.5), a daily place in the fridge-wall pool, named in the weekly Most Wanted credit, up to 5 cats with face decals and the household clip (M2), Club cosmetics visible in clips (collar, 4 caption styles, animated Rap Sheet card), full archive + boss-room replay pack, all 30 season tiers, 3 streak freezes a week, streamer layout flag; monthly HD portrait of your cat after the `/yourcat` launch | **M1a** (Stripe subscription Checkout; entitlement by email, section 10) |
| Founding Bad Cat | $24.99 for the first year, first 200 members only; **renews at $39.99/yr** by default (your call, 18 #8), stated on the pre-sale page and the receipt | Club annual at a founding price; the pre-sale that tests willingness to pay | Kill test (Stripe Payment Link, no code, Oct 26); founders get Club by email lookup from M1a |
| Cameo | $4.99 | Your cat in the cameo pool on a chosen upcoming day, guaranteed ≥ 300 room loads; cameo card to post | M1b (Checkout + webhook, no founder step) |
| Guest star | $9.99 per Friday | Your cat is a playable criminal on a chosen Friday, next to the Pink Paw cat | M1b |
| Gift cameo | $4.99 | A cameo for another cat owner: the buyer gets a redeem link; the recipient enters their cat, photo and day | **M1b**, for the December peak |
| Gift Club, 3 months | $14.99 one-off | 3 months of Club for another owner by redeem link (entitlement by the recipient's email). At the end the recipient is offered to continue at $4.99/mo or $39.99/yr; a gift cannot turn into a subscription without the recipient's own card | **M1b**; a "Gift a cat owner" card on the result screen during S1 (Dec 1 – Jan 10) |
| **Brand Shelf** | **$199/mo** (B2B; range $149–249) | **The brand's product inside 4 founder-account clips a month, with a guaranteed floor of 20,000 total views** (short of the floor → extra clips the next month). Bonus: the product as a recurring prop in its rooms, named on the briefing card, and a monthly report (post views, consented plays). Small pet DTC brands already pay micro-creators $50–200 a video; a prop alone at ~10k impressions a month would cost them ~$20 CPM on an object nobody recognises. Every paid clip is labelled (TikTok's paid-partnership label, `#ad` on X and Instagram), and at most 1 in 5 founder posts is paid | Outreach and pilots from the kill test (section 15.0); Stripe subscription from M1b; placement by hand |
| Sponsor prop of the day | $99/day launch price; public ladder +$50 after each sold-out week, cap $499/day | One-off branded object in one daily room | M1b (Checkout + form, manual) |
| Sponsor room of the week | $499/week (Saturday boss room themed) | Theme, props and name ("Birthday party presented by …") | M1b (manual) |
| Cosmetic items | $1.99 collar or stamp style, $2.99 hat or trail, $3.99 outfit, $4.99 bundle of 3 | Visible on your cat in the game, cards and clips | M2 (same Checkout + entitlement path, 3 launch items); Phase 2 full store |
| Pink Paw charity collar | $4.99 one-off | Pink collar with a paw tag, visible in every clip; 100% of net goes to Pink Paw, receipt published monthly. A donation: not counted as a monetization conversion | M1b (same path) |
| Creator codes | 20% of net revenue from players a creator brings, for their first 6 months **[Derby]**; $25 minimum payout | Any player can request a code; attribution by `via` from M1a, codes and payouts from M2 | M2 |

Cut from the first 6 months: Host Kit (forecast 5 subscribers), the standalone season pass (folded into Club),
portal builds and portal ads (kids at ~$1.30 per 1,000 plays, off-domain), Twitch IRC chat mode, friends leagues.

**Paywall moments.** Each is a small card, never a blocking modal. Rules: at most one per session; **none in a
player's first session**; never on the result screen before the share sheet, only after the player shares or
dismisses it (section 3.1).

| Trigger | Offer | Note |
|---|---|---|
| A clip was just shared (`bc_share_action`, artifact `clip` or `reply_video`) | "Clip posted. Put Mochi in Kitchen #19 for everyone: $4.99, or every week with Club" | The highest-intent moment. A/B test against the PERFECT CRIME card (50/50 by session hash) |
| PERFECT CRIME, after the share sheet is shared or dismissed | "Mochi belongs on the Most Wanted list. Join Club" | The other A/B arm |
| The cat maker saves, session 2 or later | "Keep all your cats in Club: up to 5" | Never in the first visit, where it would cost the 90 s link-to-clip goal |
| A streak is about to break and no freeze is left | "Keep the 12-day streak: Club gives 3 Nine Lives a week" | Rare while D7 is ~8%; kept because it costs nothing |
| Tap on an archive day older than 14 days | "The full archive and boss replays come with Club" | |
| S1 only (Dec 1 – Jan 10), after a share or dismissal | "Gift a cat owner: a cameo $4.99, or 3 months of Club $14.99" | Replaces the Club card on alternate sessions |

**Checkout inside the in-app browser.** Most traffic arrives in the TikTok and Instagram in-app browsers, and the
iOS "•••" → "Open in browser" steps before paying lose most buyers (and the photo). So Stripe Checkout opens
right there: card and Link work, the email is always collected, the entitlement token is cached in the webview's
storage, and "Restore purchases" by email rebuilds it in any other browser (section 10). The handoff is offered only
as a second button, "Pay with Apple Pay in Safari", because Apple Pay is often missing in webviews.
`bc_checkout_complete` and the Stripe metadata are split by `from_in_app` to see which path sells.

**Shelter tie-in:** 10% of all net game revenue (after Stripe fees and refunds) goes to Pink Paw, plus 100% of the
charity collar. A live "Treat Meter" on the home screen shows this month's total (MVP: updated by hand in a static
JSON; Phase 2: from the backend). Pink Paw's share is paid through the existing shelter share path, not a new one.

### 9.3 MRR model at month 6 (May 2027)

MRR here is **gross recurring revenue before Stripe fees, the Pink Paw share and creator-code shares**; the net
figure is shown under the checkpoint table. Whether the $1k goal is gross or net is decision 18 #17 (default: gross,
with net reported next to it).

Club per subscriber: with annual shown at checkout, the assumed mix is 65% monthly at $4.99, 27% annual at $39.99
($3.33/mo) and 8% founding at $24.99 ($2.08/mo) = **$4.31 gross** ($3.98 after Stripe's 2.9% + $0.30, which takes
~9% of a $4.99 payment). That is $0.25 less per subscriber than v1.1's monthly-first mix ($4.56); the trade is
accepted because annual members do not churn inside the year. Brand Shelf at $199 ($193 after Stripe). WAU/MAU
30% / 33% / 35%. Cosmetics $3.80 gross per buyer. Cameos average $6 (mix of $4.99 and $9.99).

| Line | Conservative | Base | Upside |
|---|---|---|---|
| MAU / WAU | 3,000 / 900 | 15,000 / 4,950 | 80,000 / 28,000 |
| Club subs (1.5% / 2.5% / 3.5% of WAU, as a cross-check only) | 14 → $60 | 124 → $534 | 980 → $4,224 |
| Brand Shelf contracts (only if gate G-B passes) | 0 → $0 | 2 → $398 | 6 → $1,194 |
| **MRR (recurring only, gross)** | **$60** | **$932** | **$5,418** |
| Cosmetics (0.5% / 0.8% / 1.0% of MAU) | $57 | $456 | $3,040 |
| Cameos, guest stars and gifts (8 / 45 / 150 a month) | $48 | $270 | $900 |
| Sponsor days (spike, not MRR) | $0 | $400 | $4,000 |
| **Total monthly revenue** | **$165** | **$2,058** | **$13,358** |
| Pink Paw (10% of net + 10 / 60 / 400 collars, pass-through) | ~$60 | ~$460 | ~$3,060 |
| Running cost (Vercel, key-value store, PostHog free tier, domains; Phase 2 adds backend and storage) | ~$25 | ~$70 | ~$400 |

Reading: v1.0 counted the season pass as MRR ($736 base); with subscriptions only, v1.0's base was ~$436. With the
$4.99 price, Club perks people want, paywall moments and the Brand Shelf line, the base case lands at ~$930, just
short of $1k. The conversion and churn rates are not measured for a web cat game
([monetization §5](research/monetization.md)); the first real numbers come from the founding pre-sale and M1.

**Working backwards from $1k MRR on May 16: subscribers are a flow, not a share.** Club is modelled as monthly new
subscribers minus cancellations. Assumptions: churn 13% a month on monthly plans and 0% inside the year on annual
and founding plans, **~9% a month blended**; new subscribers ≈ 0.5–1% of a month's new players; new players ≈ 60%
of MAU each month; WAU = 33% of MAU; link open → first run 45%; clip view → link open 0.5% (typed URL and search,
**unmeasured**: the kill test measures it, section 15.0). One mix that gets there: 3 Brand Shelf + 94 Club. Periods
are the ~1.5 months between checkpoints, starting from 0 subscribers on Nov 16.

| Checkpoint | MRR target | Mix (gross MRR) | Club subs at the date | New subs / month in the period | Cancelled in the period | Net adds in the period | WAU (Club ≈ 2.5%) | MAU | Link opens / month | Clip views / month |
|---|---|---|---|---|---|---|---|---|---|---|
| Dec 31 | $100 | 24 Club ($103) | 24 | 17 | 2 | +24 | 960 | 2,900 | 3,900 | 0.8M |
| Feb 16 | $300 | 1 Shelf + 30 Club ($328) | 30 | 7 | 4 | +6 | 1,200 | 3,600 | 4,800 | 1.0M |
| Apr 1 | $600 | 2 Shelf + 47 Club ($601) | 47 | 15 | 5 | +17 | 1,880 | 5,700 | 7,600 | 1.5M |
| May 16 | $1,000 | 3 Shelf + 94 Club ($1,002) | 94 | 38 | 10 | +47 | 3,760 | 11,400 | 15,200 | 3.0M |

That is ~115 gross sign-ups over 6 months to hold 94 subscribers in May.

**Net:** at the May mix, Stripe fees leave ~$953; 10% to Pink Paw leaves ~$858; creator codes (20% on an assumed
30% of Club revenue that arrives through codes) leave **~$835 net**. If the goal is $1k net, the May mix becomes
about 3 Shelf + 140 Club.

**Without Brand Shelf** (gate G-B fails, section 15.0): $1k gross needs ~232 Club subscribers, ~100 new subscribers
a month by April–May, ~9,300 WAU and ~7.4M clip views a month. The plan then says so plainly and rebases on Club
only; it does not keep Brand Shelf in the targets on hope.

### 9.4 What is never sold

Score boosts, extra ranked attempts, a quieter human, a removal of the watermark, Pink Paw cats as loot, anything
random for money (no loot boxes), or anything that needs Telegram.

---

## 10. Token Tails integration

| Piece | MVP | Phase 2 (existing NestJS backend at `api`) |
|---|---|---|
| Identity | Local profile in localStorage; save code export/import. Paying players are identified by their Stripe customer email | Firebase sign-in (optional); every API call sends the lowercase `accesstoken` header with the `fb`-prefixed ID token; Stripe customers linked to accounts |
| Your cat | Face decal + manual chips (section 6.1), on the device | "Import from /yourcat" (Gemini pattern + pixel portrait), after the `/yourcat` launch checklist |
| Pink Paw cats | `public/pink-paw-cats.json` snapshot from `shared/pink-paw.ts` shape | Live from `GET /cat/sale`; adopted cats auto-move to Alumni |
| Scores | Local only; par from recorded dev runs | Saved **only** through `POST /user/catbassadors/live` with a new `type: 'BAD_CAT'` and a replay (same pattern as `CATNIP_HEIST`: vendored sim, server replay). Adding `BAD_CAT` means updating `GameType` in `shared/enums.ts` and every synced copy listed in `docs/DEVELOPMENT.md` |
| Payments and entitlements | Small Vercel functions in the client, under `client/pages/api/badcat/`: `checkout` (creates Stripe Checkout sessions, subscription or one-off, always collecting an email), `stripe-webhook` (cameos into the key-value store, subscription state), `entitlement` (looks up active subscriptions, paid SKUs and redeemed gifts by customer email, returns a short-lived signed token cached in localStorage, also inside in-app browsers), `restore` (email magic link, verified against Stripe), `redeem` (gift links, M1b), and a link to the Stripe customer portal for cancellations. Stripe is the source of truth; local unlocks are only a cache | Move to the existing backend Stripe checkout and webhooks; accounts claim past purchases by email |
| Cameos | Key-value store written by the webhook, read by `GET /api/badcat/cameos?day=<n>&s=<shuffle>`, which also increments that shuffle's load counter for the seen counts (6.5) | `GET /badcat/cameo/:day` |
| Boards, short links | none | New `backend/src/badcat/` controller registered in `AppModule`: `GET /badcat/board/:day`, `POST /badcat/room` (short id for long room links), `GET /badcat/meter` |
| Shelter share | Manual monthly transfer, published | Existing shelter-share keeper path |
| Treats | Personal "treats earned" count | Optional: a Perfect Crime run lets the player tap one sponsored treat on the existing guest treat route used by `/heist` (within the existing daily cap; never a new spend path) |
| Analytics | PostHog EU with the shared consent key (`tt-analytics-consent`, `shared/analytics-core.ts`) | Same |
| Hosting | `npm run build:client` → `client/public/badcat-game/` with pre-rendered per-day and per-shell HTML; `client/next.config.js` rewrites `/badcat/*` to those files, top level, no iframe (section 6.6); the short domain redirects to `/badcat/pick?e=t` through a tiny function that also counts typed arrivals per day in the key-value store (no personal data), which works before analytics ships and without consent | Same |

The Stripe functions add a payment path beside the backend's existing Stripe integration. Their secret and webhook
signing key are new client environment variables, to be documented in `docs/CLIENT.md` when they land. They never
write scores; the only score write path stays `POST /user/catbassadors/live`. Every Checkout session carries
`trigger`, `via`, `entry` and `from_in_app` in its metadata, so purchases are counted from Stripe itself, including
buyers who declined analytics (section 14).

Known open issues this game inherits and must not "fix" silently: the `/yourcat` launch blockers (App Check, billed
Gemini key, controller text, ToS) and the `TRUST_PROXY` requirement for replay saves in production (`docs/API.md`
returns 503 without it). The Heist host iframe (`client/components/heist/HeistHost.tsx`) also lacks `web-share` and
`clipboard-write`; this plan does not change it.

---

## 11. Art direction and performance

### 11.1 Look

- **Low-poly, flat-shaded, warm "cozy diorama".** Cutaway dollhouse with two walls removed, a soft gradient sky
  through the window, baked ambient occlusion in vertex colours where the CC0 kits allow it.
- **Gameplay camera: the whole room, always.** The game is about reading the human's turn, so the human, the "?"
  bubble and the cone must stay on screen. A follow camera with a 32° vertical FOV would show only ~18°
  horizontally in 9:16, about 1.5–2 m of a 4.8 m room. Instead: perspective, vertical FOV ~45–50°, pitch 52°, a
  fixed or slowly drifting camera whose distance is derived from the room's width so the full width fits the
  portrait screen (boss rooms included). If anything ever crops the human (a desktop window resize, a future
  larger room), an edge arrow points to them. Prototyped on M0 day 3, because the framing decides how big the props
  must be to read. On a break the camera kicks 2° (off with Reduce Motion).
- **Clip camera:** a separate close follow camera with push-ins, used only in the clip pass (section 7.3): the cat
  and the falling object fill the frame, the diorama never does.
- **Materials:** each CC0 kit keeps its own colormap texture or vertex colours (2–3 prop materials in all, not one
  re-UV'd palette); Token Tails brand colours from `client/components/yourcat/brand.tsx` for UI and the human's
  outfit, which is desaturated so the cat and the breaks pop.
- **Readability first:** vision cone with hatch pattern, telegraph "?" bubble, Must-Wreck props with a slow gold
  pulse outline, grabbables with a soft glow, the Roomba with a blinking green LED.
- **Sources (art is the critical path, so the MVP buys none of it):**
  - **Props:** 15 prop kinds for the MVP (Appendix B, marked), all CC0 from the Kenney and Quaternius furniture,
    kitchen and food kits, used with their own colormaps (re-UVing 15 props to one palette would be days of Blender
    work). Shells are assembled from the same kits. The look risks reading as a cheap reused-asset game, which is
    why clips stay close on the cat and the falling object, and why the stranger check (section 15.0) runs before
    the kill test.
  - **Shards:** one generic set of ~12 chunk meshes in a single `InstancedMesh`, tinted from the broken prop's palette
    swatch. No pre-cut shard sets per prop.
  - **The cat:** one CC0 rigged low-poly cat (Quaternius animal packs or similar; if none fits, one paid rig), with
    whatever clips it ships (idle, walk/run, jump, sit). Missing poses (loaf, swat, the slow blink) are short
    procedural bone offsets. Patterns are done in the shader with procedural masks in object space; M0 ships 2
    (solid, tabby), the other 5 (tuxedo, bicolor, calico, colorpoint, tortie) follow in M1a. The **face** is a
    dedicated face quad with its own UV island, parented to the head bone, whose `map` is swapped for the player's
    crop (section 6.1); it is added to the model once in Blender. Morph targets (fold ears, chonk belly) wait until
    after launch; body type scales bones.
  - **The human:** M0 uses a CC0 glTF human that already includes idle and turn clips, or, if none fits, a stylised
    human whose torso and head rotate as rigid parts (no skinning). Either can do the long double-take (glance, look
    away, snap back) with rotations alone. The scoop animation is rigged in M1 (until then CAUGHT cuts to the
    cuddle card). No Mixamo FBX → glTF conversion with its own bone names in M0. Routines differ by props in hand
    and the telegraph cue, not by animation.
- **No AI-generated art for the brand's visuals** (Trainwreck Labs saw backlash, [web-hits §2](research/web-hits.md));
  AI is used for code only. The player's own cat comes from their own photo.

### 11.2 Performance budget (mid-range phone: Galaxy A15, Moto G Power 2024, iPhone 11)

| Item | Budget |
|---|---|
| First playable on 4G | ≤ 3.0 s (p75) |
| Download before the first run | ≤ 2.5 MB (JS ≤ 450 KB gzip incl. three.js, without `mediabunny` and `share/clip/*`, which load after the run; models ≤ 1.2 MB with meshopt compression only, no Draco and its ~300 KB wasm decoder; textures ≤ 400 KB; audio ≤ 300 KB first load, rest lazy) |
| Frame rate | 60 fps target, 30 fps floor; sim at fixed 30 Hz decoupled from render |
| Triangles on screen | ≤ 60k |
| Draw calls | ≤ 80 (static room merged per material; resting props instanced by kind; when a prop starts to fall, its instance is hidden (scale 0) and a pooled standalone mesh of that kind takes over for the fall and the landing, so no instance matrix is updated per frame; shards as one `InstancedMesh`, pool of 300) |
| Lights | 1 hemisphere + 1 directional; no real-time shadow maps on low/mid tier (blob shadows for cat, human, Roomba); one 1024 shadow map on high tier |
| Post-processing | none on low/mid; FXAA on high |
| Shader programs and warm-up | The real fix for a first-crash hitch is few programs: one prop material, one skinned material (cat, human), one shard material, one cone material, one face material. They are compiled during the briefing card with `renderer.compileAsync(scene, camera)`; where `KHR_parallel_shader_compile` is missing (likely iOS), that call simply blocks during the card, which is acceptable |
| DPR | start at 1.25 on Android and 1.5 on iOS; step down after 2 s under 45 fps, up after 10 s above 58 fps; cap 2.0 (reuse `catnip-heist/src/render/quality.ts`); frozen during the clip pass |
| Context loss | handle `webglcontextlost` / `webglcontextrestored` (in-app browsers drop the context when backgrounded): pause the sim, rebuild GPU resources and the scene, resume on tap; during the clip pass, abort the encode and offer a retry (section 7.3) |
| Memory | ≤ 250 MB; one WebGL context only (the clip pass reuses it, section 7.3) |
| Clip render | ≤ 8 s for a 12 s clip on iPhone 11, ≤ 12 s on Galaxy A15 |

---

## 12. Audio

- **Music:** one lo-fi "heist jazz" loop, 90 bpm, 3 stems (bass + brushes; sneaky pizzicato layer that fades in
  during TELEGRAPH and LOOK; full band during the room event). Stingers: PERFECT CRIME (4-note brass hit), CAUGHT (sad
  trombone "wah-wah" softened, then a cat purr). Weekly: the Saturday boss has its own loop; S1 adds sleigh bells.
- **The crash is the payoff, so it is loud:** a crunchy, exaggerated cartoon crash (glass and ceramic layered with
  a comic "kshhh" tail), mixed 3–4 dB above everything else. It stays slapstick: no realistic shatter, nothing
  that sounds like pain (section 1).
- **The turn gets a sting:** the "hm?" is a short, loud two-note sting with the human's voice on top, so the turn
  reads with the sound on even before the eye finds the human.
- **SFX (≈ 40):** paw steps on 4 surfaces, swat "pap", wobble rattle, falls by material (glass 3 variants, ceramic 3,
  plastic bonk, metal clang, cake splat, liquid splash, paper flutter, tree jingle), Roomba hum, the human's wordless
  vocal set ("hm?", gasp, "BAD KITTY", sigh, humming), doorbell, kettle, TV jingle, "you're on mute" chime, combo
  ticks rising in pitch, stamp slam, purr. CC0 sources first (Kenney audio packs, freesound CC0).
- **Voice:** wordless gibberish plus the two English phrases "BAD KITTY" and "come here" (no localisation needed for
  launch).
- **Tech:** Web Audio API, unlocked on first tap; AAC `.m4a` (plays on iOS and Android); first-load set ≤ 300 KB, the
  rest lazy. Master, music and SFX sliders; muted by default inside in-app browsers (TikTok, Instagram) until a tap.
- **Clip audio:** SFX-only mix by default (the crash and the sting) so creators can add a trending sound; optional
  12 s music sting. The founder always adds a trending sound inside TikTok on their own posts. On iOS without
  `AudioEncoder`, the clip uses the MediaRecorder path with sound, or ships silent if that fails in the M0 device
  test (section 7.3).

---

## 13. Technical architecture

### 13.1 Package

New top-level folder `bad-cat/` (Vite + TypeScript + three.js, like `catnip-heist/`). Commands:

| Command | What |
|---|---|
| `npm run dev` | Vite dev server, port 5174 (the founder's Stitch and reply pipeline is the game with `?studio=1`, dev builds only) |
| `npm run build` | `tsc --noEmit && vite build` (standalone, relative base) |
| `npm run build:client` | `BADCAT_BASE=/badcat-game/ vite build --outDir ../client/public/badcat-game --emptyOutDir` (commit the output, as with the Heist) |
| `npm test` | `vitest run` (sim, codecs incl. boss-room round trip and the recorded-run ghost size test, scoring, filter, clip gates) |
| `npm run e2e` | Playwright: load, play a scripted run, export a card, open a dare link, open a clip handoff link |
| `npm run validate` | Validates every room and daily file (BFS reachability, first target ≤ 6 s, budget, occluders) |
| `npm run par` | Writes par scores into the daily files from recorded dev runs |
| `npm run og` | Renders `public/og/d/<n>.png` and the per-day and per-shell HTML pages with OG tags (section 6.6) |

Dependencies: `three`, `mediabunny`. Dev: `vite`, `typescript`, `vitest`, `@playwright/test`, `sharp`. No physics
engine, no UI framework (plain DOM + CSS, like the Heist UI). Client side: `stripe` (server functions only).

Repo docs to update when the package lands: the package table in `CLAUDE.md`, `docs/ARCHITECTURE.md`,
`docs/DEVELOPMENT.md` (generated output `client/public/badcat-game/`), and `docs/CLIENT.md` (the new Stripe and
key-value environment variable names).

### 13.2 Module map and file ownership

```
bad-cat/
  index.html
  vite.config.ts                     L8
  public/
    daily/index.json                 L2   (dayNo → file, theme, sponsor, brand shelf)
    daily/001.json … 021.json        L2   (RoomDef + par + accomplice; +7 a week after launch)
    pink-paw-cats.json               L9   (generated)
    models/cat.glb human.glb props.glb   L3   (CC0, licences in models/LICENSES.md)
    audio/*.m4a                      L7
    og/d/*.png                       L9   (generated)
    manifest.webmanifest sw.js       L8
  src/
    types.ts                         LEAD (frozen interfaces, SIM_VERSION)
    main.ts                          L5
    sim/       rng.ts hash.ts replay.ts (copied from catnip-heist/src/sim/) grid.ts (Heist lineOfSight
               adapted) cone.ts sim.ts cat.ts human.ts props.ts scoring.ts events.ts   (new)                L1
    content/   props-catalog.ts shells.ts routines.ts daily.ts validate.ts rooms/*.json                   L2
    codec/     bits.ts base64url.ts crc16.ts cat-codec.ts room-codec.ts ghost-codec.ts link.ts text-filter.ts L2
    render/    Renderer.ts room-view.ts cat-rig.ts cat-material.ts face-decal-material.ts human-rig.ts
               props-view.ts shards.ts camera.ts clip-camera.ts vision-cone.ts quality.ts clip-pass.ts
               context-loss.ts                                                                            L3
    catmaker/  face-decal.ts CatMaker.ts preview.ts photo-store.ts (M2: photo-palette.ts pattern-guess.ts
               household.ts)                                                                              L4
    ui/        app-shell.ts router.ts screens/{Home,Picker,Briefing,Hud,Result,Share,Archive,RapSheet,
               Settings,Thanks,Paywall,Redeem}.ts input/{touch,keyboard,quantise}.ts copy.ts styles.css   L5
    editor/    RoomMaker.ts palette.ts placement.ts budget.ts publish.ts (M2)                             L5b
    share/     emoji-card.ts image-card.ts share-sheet.ts inapp-handoff.ts clip/{highlights,compose,
               encoder-webcodecs,encoder-mediarecorder,gates}.ts                                          L6
    audio/     audio.ts sfx-map.ts music.ts                                                               L7
    platform/  storage.ts analytics.ts entitlements.ts checkout.ts env.ts pink-paw.ts cameos.ts
               backend.ts (Phase 2 stub)                                                                  L8
    progress/  streak.ts rapsheet.ts season.ts unlocks.ts                                                 L8
  tools/       par.mjs validate.mjs render-og.mjs sync-pink-paw.mjs                                        L9
  e2e/                                                                                                    L9
client/pages/api/badcat/{checkout,stripe-webhook,entitlement,restore,redeem,cameos,t}.ts   L8  (`t` = short-domain redirect + typed counter)
client/next.config.js                 L8  (`/badcat/*` → static per-day / per-shell HTML rewrites; no host page, no iframe)
```

### 13.3 Core interfaces (`src/types.ts`, frozen at the end of M0 day 2)

```ts
export const SIM_VERSION = 1;
export const TICK_HZ = 30;
export const RUN_TICKS = 2250;            // 75 s; boss rooms 2700; FTUE first heist 1200

export type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;   // 0 = none, 1 = N, clockwise
export const BTN_SWAT = 1, BTN_JUMP = 2, BTN_GRAB = 4, BTN_ZOOM = 8;   // ZOOM reserved, unused in the MVP
export interface TickInput { dir: Dir8; speed: 0 | 1 | 2; buttons: number }

export type Pattern = 'solid' | 'tabby' | 'tuxedo' | 'bicolor' | 'calico' | 'colorpoint' | 'tortie';
export interface CatSpec {
  pattern: Pattern; ears: 'normal' | 'fold'; tail: 'normal' | 'fluffy' | 'bob';
  body: 'slim' | 'normal' | 'chonk'; eyes: number;              // 0..5
  base: number; secondary: number; tertiary: number;            // RGB565
  collar: number; hat: number;                                   // cosmetic ids, 0 = none
  name: string;                                                  // filtered, ≤ 12 chars
}
// The face decal is not part of CatSpec: it stays on the device (IndexedDB) or comes from an approved cameo URL.
export interface FaceDecal { texture: Blob; crop: { x: number; y: number; w: number; h: number } }  // crop rectangle in the photo; the match cut aligns it with the fixed 3D close-up

export interface Cell { level: 0 | 1 | 2 | 3; occludes: 0 | 1; propId: number }   // propId −1 = none
export interface PropPlacement { kind: number; x: number; z: number; level: 0 | 1 | 2 | 3; rot: 0 | 1 | 2 | 3; target?: boolean }
export interface RoomDef {
  id: string;                       // 'daily-018' or 'ugc-<crc32>'
  shell: number; routine: number; event: number;
  width: number; depth: number;     // 12 × 10, boss 14 × 12
  spawn: { x: number; z: number }; props: PropPlacement[];
  seed: number; ticks: number;
  accomplice?: { pinkPawId: string; wishPropIndex: number };
  sponsor?: { propIndex: number; label: string; url?: string };
  par?: { bronze: number; silver: number; gold: number };
  title?: string; author?: string; ancestors?: string[];
}
// Cameos are not in RoomDef: they load at runtime from /api/badcat/cameos?day=<n>.
export interface Cameo { cat: string; name: string; slot: number | 'fridge'; faceUrl?: string; guestStar?: boolean }

export type SimEvent =
  | { t: 'push'; tick: number; prop: number }
  | { t: 'fall'; tick: number; prop: number; from: number; dir: Dir8 }
  | { t: 'break' | 'land' | 'spill' | 'hit'; tick: number; prop: number; points: number; combo: number }
  | { t: 'target'; tick: number; prop: number } | { t: 'wish'; tick: number }
  | { t: 'framed'; tick: number; prop: number } | { t: 'stash'; tick: number; prop: number }
  | { t: 'human'; tick: number; human: number; state: 'busy' | 'telegraph' | 'look' | 'fakeout' | 'event' }
  | { t: 'seen'; tick: number; suspicion: number } | { t: 'caught'; tick: number } | { t: 'end'; tick: number };

export interface SimState { /* plain data only: integers, no class instances; snapshot-copyable */ tick: number; score: number; suspicion: number; grid: Int16Array; /* … */ }

export interface RunResult {
  roomId: string; dayNo?: number; simVersion: number;
  score: number; stamp: 'perfect' | 'clean' | 'caught'; rank: string;
  maxCombo: number; seenCount: number; targets: number; framed: number;
  timeline: string;                 // emoji line
  inputs: TickInput[]; events: SimEvent[]; finalHash: number;
}

// sim/sim.ts (L1)
export declare function initSim(room: RoomDef, cat: CatSpec): SimState;
export declare function stepSim(s: SimState, input: TickInput, out: SimEvent[]): void;  // mutates s
export declare function runToEnd(room: RoomDef, cat: CatSpec, inputs: TickInput[]): RunResult;

// render/Renderer.ts (L3)
export interface Renderer {
  load(room: RoomDef, cats: CatSpec[], faces?: Map<number, FaceDecal>): Promise<void>;
  frame(s: SimState, alpha: number, events: SimEvent[]): void;
  setTarget(size: { w: number; h: number; hud: boolean }): void;   // clip pass: 720 × 1280, no HUD
  dispose(): void;
}
// render/clip-pass.ts (L3) – used by L6; reuses the live Renderer and its WebGL context
export declare function renderFrames(r: Renderer, room: RoomDef, cat: CatSpec, inputs: TickInput[], plan: ClipPlan, onFrame: (c: HTMLCanvasElement, i: number) => Promise<void>): Promise<void>;

// share/clip (L6)
export interface ClipPlan { opener?: { media: Blob; kind: 'photo' | 'video' }; matchCutTick: number; crime: { prop: number; fromTick: number; breakTick: number; toTick: number; turnGapTicks?: number }; slowMo: { fromTick: number; toTick: number; speed: number }; hook: string; overlay?: string /* @handle for Stitch / reply */; urlLine: string /* last 2 s */ }
export declare function planClip(r: RunResult): ClipPlan;   // picks one crime by tension (section 7.3)
export declare function exportClip(room: RoomDef, cat: CatSpec, r: RunResult, opts: { opener?: Blob; music: boolean; overlay?: string }): Promise<Blob>;

// codec/link.ts (L2)
export interface LinkState { dayNo?: number; room?: RoomDef; glass?: boolean; pick?: boolean; ghosts: { inputs: TickInput[]; cat: CatSpec }[]; replay?: { inputs: TickInput[]; cat: CatSpec }; via?: string; entry?: 'typed' }
export declare function parseLink(url: URL): LinkState;
export declare function buildLink(s: LinkState, base: string): string;

// platform/storage.ts (L8)
export interface Store { get<T>(k: string, fallback: T): T; set<T>(k: string, v: T): boolean }   // never throws
// platform/entitlements.ts (L8)
export interface Entitlements { club: boolean; skus: string[]; expiresAt: number }   // from the signed token
export declare function getEntitlements(): Promise<Entitlements>;                    // cache first, refresh online
// platform/analytics.ts (L8)
export declare function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void;
```

### 13.4 The deterministic sim

- **Mostly new code, honestly budgeted.** The Heist sim (`catnip-heist/src/sim/`) is a flat 2D tile grid with a
  cat that moves one tile per 6 ticks, 4-way `distanceField` pathing, sentry-turn telegraphs and an immutable
  `step`. Bad Cat needs a 4-level heightmap, 8-way stepping, jumps, push/fall/domino, suspicion and the
  Busy/Look/fake-out machine, none of which exist there. What is copied on M0 day 1: `rng.ts`, `hash.ts`, the RLE
  in `replay.ts` and the grid `lineOfSight` (adapted to `occludes`). Everything else is new, and L1 is budgeted
  at **5–6 days** in M0 (section 17.1). The copies are not a shared module, so Heist replays and the backend's
  vendored Heist sim are never affected.
- Integer maths only: positions are cells plus step progress in ticks (section 4.1), facings are 8 directions, and
  the cone is a lookup table of cell offsets per facing. No trigonometry, no `Math.sin`, no floats in state. One
  RNG (`xorshift32`).
- The grid (section 4.1) is the single source for blocking, jumps, falls and cone occlusion (grid line walk).
- `stepSim` mutates its own state (the Heist `step` returns a new state; Bad Cat mutates for speed during the clip
  re-render and golden tests copy snapshots instead).
- The renderer reads state and events but never writes them.
- `finalHash` (FNV-1a over the state at the end) is checked in golden tests: 30 recorded runs must produce identical
  hashes in Node, Chrome, Safari and Firefox (Playwright runs the sim in each browser in CI).
- A change that alters outcomes bumps `SIM_VERSION`; old ghosts then play as "replay only" with a notice.
- Phase 2 vendors `sim/` into the backend for replay verification (same pattern as `backend/src/vendor/heist-sim`).

### 13.5 State and screens

`ui/router.ts` owns one state machine: `boot → (typed? picker) → (link? linkIntro → catmaker(skippable) : home) →
briefing → run → result → share → (session ≥ 2? offer card) → home`, with side screens `picker`, `redeem`, `catmaker`, `archive`, `rapsheet`, `settings`, `paywall`, `editor` (M2),
`thanks`, and the `clipHandoff` entry (`?clip=1`: boot → re-add photo (skippable) → clip render → share). The game
loop runs the sim at 30 Hz with an accumulator and renders at display rate with interpolation (`alpha`).

### 13.6 Save data (localStorage, all keys prefixed `bcd:v1:`, every access in try/catch)

| Key | Content | Cap |
|---|---|---|
| `profile` | CatSpec list and the active cat, createdAt, session count (for the no-offer first session), A/B arm, settings (audio, reduce motion, show photo in clips, streamer layout) | 1 cat free, 5 with Club |
| `days` | `{ [dayNo]: { score, stamp, rank, inputsB64, shared: boolean } }` | 400 days, oldest pruned |
| `streak` | current, best, lastDay, freezesLeft, weekId | — |
| `rapsheet` | counts per crime id, first-stamp dates | — |
| `season` | seasonId, xp, claimed tiers | — |
| `entitlements` | the last signed entitlement token and the customer email (a cache; Stripe is the source of truth, "Restore purchases" rebuilds it) | — |
| `ghosts` | received ghosts per room (inputsB64, cat code, name, score) | 50 |
| `rooms` | my rooms (payloads, titles, cleared flag) | 30 |
| `photo` | IndexedDB `bcd-photo` store, per cat: face decal Blob + crop, opener media Blob (photo, or a 2 s video ≤ 3 MB) | 1 cat free, 5 with Club |

Total budget ≤ 1 MB in localStorage (IndexedDB media up to ~5 MB for one cat, ~20 MB for 5). "Move to another device" exports a save code
(base64url of the JSON, deflated) shown as text and a QR code; import on the other device. Purchases move by
"Restore purchases" with the email. If storage is blocked, the game still runs; streaks show "this browser only".

### 13.7 Content pipeline

- Rooms are authored as JSON (`content/rooms/*.json`) with a dev-only in-game editor (the M2 Room Maker in admin mode;
  before M2, JSON by hand plus the debug overlay).
- `daily/index.json` maps `dayNo` to a room file plus sponsor, Brand Shelf props and accomplice. 21 days (3 weeks)
  are authored before launch from the M1 shells by seeded prop jitter and routine swaps, plus hand-made boss rooms;
  7 more are authored each week after launch. Cameos are not in these files (section 6.5).
- `tools/validate.mjs` (no bot): BFS over the heightmap from the spawn cell with the sim's own 8-way moves (steps to
  equal-or-lower neighbours without corner cutting, jumps to +1 neighbours) to every target; "first target ≤ 6 s" =
  the sum of the trot ticks of the shortest path's steps + jump ticks; prop budget; occluders present; file loads under the current `SIM_VERSION`.
- `tools/par.mjs`: reads 5 recorded dev runs per room (`content/runs/<room>/*.ghost`) and writes bronze / silver /
  gold (section 4.5). A scripted-input runner exists only for golden tests and e2e, not as a gameplay bot.
- Founder workflow for a sponsor day or Brand Shelf placement: edit `daily/index.json`, run `npm run validate && npm
  run og && npm run build:client`, commit; Vercel deploys the client. Cameos need no founder step.

### 13.8 Optional backend later (Phase 2)

Listed in section 10. Rules: register the new controller in `AppModule`; scores only via `POST
/user/catbassadors/live`; roles via `PermissionGuard(n)`; no `.env` reads by tooling.

---

## 14. Analytics events

Sent to PostHog EU only after consent (`tt-analytics-consent = granted`); without consent, nothing leaves the
device. Analytics ships in M1a; during the kill test, typed arrivals are counted by the short-domain redirect
itself (section 10, Hosting). Every event carries `day_no`, `room_id`, `sim_version`, `platform`, `entry` (direct,
**typed** (arrived via the short domain, `?e=t`), typed_or_direct (no referrer, no parameters on the main path), daily_link, dare_link,
room_link, cat_link, clip_handoff), `via` (creator code, if any), `utm_source`, `in_app_browser`,
`is_first_session`.

| Event | Extra properties | Answers |
|---|---|---|
| `bc_boot` | `load_ms`, `quality_tier`, `in_app_browser` (tiktok, instagram, facebook, none) | Load speed, TikTok/IG in-app share of traffic |
| `bc_link_open` | `link_type`, `ghosts`, `has_room` | Link-open volume by artifact |
| `bc_picker` | `choice` (today, glass, past), `days_back` | Do typed arrivals look for an older room? |
| `bc_run_start` | `ranked`, `ftue`, `practice_index`, `cat_source` (default, photo, manual, pinkpaw, guest_star) | |
| `bc_first_crash` | `ms_from_start` | Is the first crash under 10 s? |
| `bc_run_end` | `score`, `stamp`, `combo_max`, `targets`, `seen`, `caught_tick`, `duration_ms`, `quit` | Completion, difficulty |
| `bc_catmaker_open` / `bc_catmaker_done` | `method` (camera, gallery, video, manual, skipped), `face_decal`, `pattern`, `ms` | Cat creation funnel |
| `bc_share_open` | `trigger` (auto, button) | |
| `bc_share_action` | `artifact` (clip, reply_video, card, story, rapsheet, cat, cameo, dare, room, emoji_chat), `format` (stitch, pov, reply, irl_vs_game, roomba, carousel, still_waiting, household), `method` (native_share, download, long_press, clipboard) | Share rate per artifact and format |
| `bc_clip_export` | `ok`, `encoder` (webcodecs, mediarecorder, fallback), `codec`, `audio`, `ms`, `bytes`, `error_code`, `crime_pick` (tension, turned_late, default) | iOS clip success; which crimes get picked |
| `bc_clip_saved` | `in_app_browser`, `method`, `link_to_clip_ms` (first session only) | In-app clip-save rate; link-to-clip time |
| `bc_inapp_handoff` | `step` (shown, link_copied, intent_opened, arrived), `purpose` (clip, pay) | Does the Safari/Chrome handoff work? |
| `bc_dare_result` | `beat`, `margin` | Dare loop health |
| `bc_streak` | `length`, `freeze_used` | Retention |
| `bc_rapsheet_new` | `crime_id`, `total` | Collection pace |
| `bc_room_maker` | `step` (open, placed, cleared, published, remix), `props`, `ms` | 1-9-90 measurement |
| `bc_paywall_view` | `trigger` (post_share, perfect_crime, catmaker_saved, streak_break, archive_old, gift_s1), `offer`, `ab_arm`, `session_index` | Which moment sells |
| `bc_checkout_start` | `sku`, `price`, `from_in_app` | Funnel to Stripe |
| `bc_checkout_complete` | `sku`, `price`, `plan` (monthly, annual, founding, gift, one_off), `revenue_bearing` (false for the collar), `from_in_app` | Funnel joins for consenting players only; counts come from Stripe (below) |
| `bc_cameo_seen` | `loads` (the owner's seen counter when shown) | Do members look at what they pay for? |
| `bc_restore` | `ok` | Lost-purchase rate |
| `bc_pinkpaw_adopt_click` | `cat_id` | Shelter outcome |
| `bc_a2hs` | `shown`, `accepted` | Home-screen installs |
| `ugc_reported` | `payload_hash`, `kind` | Moderation load |

**Derived metrics:** K = new players whose first `bc_boot` has a link `entry` ÷ active players in the same week;
share rate = `bc_share_action` ÷ ranked `bc_run_end`; link conversion = first `bc_run_end` ÷ `bc_link_open`;
in-app clip-save rate = `bc_clip_saved` (in-app sessions, including those finished after a handoff) ÷ in-app
`bc_share_open`; link-to-clip time = median `link_to_clip_ms`; paywall rate = revenue-bearing
`bc_checkout_complete` ÷ `bc_paywall_view` (both from consenting players, so the ratio is fair; totals come from
Stripe, below).

**Purchases and MRR are counted on the server, from Stripe, not from client events.** `bc_checkout_complete` is
sent only after analytics consent, so it misses everyone who declined. Each Checkout session carries `trigger`,
`via`, `entry`, `from_in_app` and the A/B arm in its metadata; purchase counts, MRR, new subscribers and
cancellations come from Stripe (webhook records in the key-value store, or a Stripe export), split by those fields.
Paywall rates are judged only after **≥ 300 paywall views** per arm (at 3%, fewer views are a handful of sales and
noise), not at a fixed week. MRR is reported gross and net (section 9.3).

Shares from players without consent are invisible, so the founder's own accounts also track per-post views
against typed arrivals per day (from the redirect counter) and UTM links where a link is possible
(`?utm_source=x&utm_campaign=<account>`), which gives the clip view → link open rate used in section 9.3.

---

## 15. Launch plan (zero audience)

### 15.0 Before launch: name check, stranger check and kill test (Oct 21 – Nov 8)

- **Name and hashtag check (Oct 21–22, before anything is posted):** search the exact phrase in TikTok search, on
  TikTok's hashtag page, on Google (in quotes) and in the app stores. "Bad cat" alone brings up the Roblox game BAD
  CAT and millions of real cat videos, and "Daily" can sound like a chore. The name passes if the exact phrase and
  its hashtag return near-empty results (no game and no big account using it). Lock the name and **one owned
  hashtag**, used on every post (section 18 #12).
- **Short domain (bought by Oct 23, live by Oct 26):** the name's short domain redirects to the room picker and
  counts typed arrivals (section 10, Hosting). Without it the typed-arrival measurement means little.
- **Stranger check (Oct 27–29, before the gate clock):** 3 test clips (screen recordings of the M0 Kitchen, edited
  by hand to the one-crime structure of section 7.3) shown to 20 strangers, not friends or family (a paid panel, or
  people met in person). Questions: "Is this funny? (1–5)" and "Which real cat is this?" (the clip next to 4 real
  cat photos). Pass: median ≥ 3, ≥ 14 of 20 pick the right cat, and ≤ 4 of 20 call it creepy or cheap without being
  asked. Fail: fix the named problem (face crop and feather, a bigger double-take, closer clip framing) in 2 days
  and recheck with 10 new strangers. It informs the kill test; it does not delay the gate clock past Nov 1.
- **What is tested is the actual hook:** real-cat opening → match cut → face-decal cat, one crime, the human
  turning too late.
- **A human plays every run that becomes a clip** (the founder or a helper), so clips have near-misses, greed and
  caught moments. No bot clips.
- **Accounts: one TikTok account plus the founder's X.** Four cold accounts at ~1.5 clips a day each would each be
  too thin to learn anything. The TikTok account is "I put your cat in my game", with one recurring cat (a
  volunteer's or a Pink Paw cat) for the POV clips. Pink Paw posts format 6 on its own channels; those posts are
  recorded but are not part of the gate.
- **Warm-up (Oct 26–29):** 2–3 posts a day from hand-edited screen recordings, mostly format 1 (Stitches and X
  quotes, owners asked first). Not counted toward the gate.
- **Gate clock: Oct 30 – Nov 8 (10 days)**, starting when the in-game clip pipeline works on iOS Safari and Chrome
  Android. If it slips, the clock starts when it works, and G-A, M1b and Day #1 move by the same number of days.
- **Volume:** ≥ 3 clips a day on TikTok, **≥ 30 in the 10 days** (scaled from 60 in 14 days on 4 accounts), each
  also posted natively on X with its own caption. Mix: ≥ 12 of format 1 (Stitch / quote), ≥ 10 of format 2
  (one-crime POV), and format 3 (reply videos) from the first real comments. Every clip is its own run with its own
  camera seed, caption and cat; a render is never posted twice on one platform. The founder adds a trending sound
  to every TikTok post (section 7.3). Until the video opener ships in M1a, the 2 s real-cat video is joined in front
  of the game clip in TikTok's editor by hand.
- **Landing:** the short domain and `tokentails.com/badcat` show the picker with the playable Kitchen prototype and
  "The Glass", the search name, and the **Founding Bad Cat pre-sale** ($24.99 for the first year, first 200, renews
  at $39.99) as a Stripe Payment Link (no code) for the willingness-to-pay test.
- **Brand Shelf outreach (from Nov 2, with the real view numbers):** 20 small pet DTC brands and Etsy cat-product
  sellers, offering the product inside 4 founder-account clips a month with a view floor (section 9.2), a mock-up
  of their product in a clip, and a $99 first-month pilot or a signed letter of intent.
- Control: 2 posts on X of an AI photoreal "my cat destroys the kitchen" clip (the threat named in the ranking);
  not on the TikTok account, so its niche stays clean.
- **Gate G-A (Nov 8):** pass if ≥ 1 clip reaches 10k views, **and** at least 3 clips of one format pass 2k views,
  **and** ≥ 15 comments in total ask "how do I make my cat" or "what game is this". Also recorded: saves/views on the
  best 5 (target ≥ 1%), owner reposts of Stitches, and typed arrivals per 1,000 views (from the redirect counter;
  replaces the 0.5% assumption in section 9.3). Fail → stop at M0, reuse the sim for Catnip Tower or test the Cat
  Runway 2D page (ranking §4). Mixed (one condition missed) → ship M1 anyway with only the winning format's
  tooling, and cut M2 until a clip clears 50k.
- **Gate G-A$ (willingness to pay):** ≥ 25 founding pre-orders by Nov 29 (the end of launch week 2). Fail → change
  the offer or price and retest within 7 days; this gate never kills the game on its own.
- **Gate G-B (brand demand):** ≥ 1 paid Brand Shelf pilot or signed letter of intent by Nov 29. Fail → rebase the
  section 9.3 targets on Club only and state plainly that $1k MRR then needs ~232 subscribers; Brand Shelf stays
  open to inbound requests only.
- No M1 work that depends on G-A starts before Nov 8 (section 17.3 splits M1 into M1a and M1b).

### 15.1 Week 1: Nov 16–22, soft launch

- Day #1 live Monday 08:00 Vilnius (Nov 16). Rooms #1–#7: Appendix A.
- Daily: 3+ unique clips on TikTok; Stitches and quotes continue, and reply videos are answered within the day
  (target 5–10 a day with `?studio=1`); X native clips + quote-replies under large cat, pet and cozy-game accounts
  (clip, not the link). One "Mila is still waiting" clip a week (format 6) with Pink Paw.
- Search presence from day 1: a crawlable landing page at `/badcat` (title "Bad Cat Daily: put your cat in a daily
  cat-chaos game", or the name chosen in 18 #12), the same name and the one owned hashtag on every account and post, and the pinned "type {short
  URL} and pick the room you saw" comment on every post.
- **Reddit, without counting on it:** r/catsareassholes and r/cats probably remove game footage. The playable link
  goes to r/WebGames and r/IndieGaming; the cat subreddits get only real-cat side-by-sides (format 4), posted as a
  cat owner after reading each sub's rules, with no link unless asked. Also cat Discords, Lithuanian cat groups, and
  Pink Paw's own channels (Pink Paw posts "our cat Mila is in a game today").
- Free cameos: every stitched or reply-video cat gets one (capped at 20 a week).
- Watch: load time, first-crash time, clip export errors on iOS, in-app clip-save rate, link-to-clip time, picker
  choices; fix daily.

### 15.2 Week 2: Nov 23–29, the cameo, dare and Brand Shelf push

- Cameo and guest-star checkouts promoted in reply videos ("want her on the fridge for everyone? $4.99").
- Dare links go to the top of the result screen; X posts switch to "Can your cat beat Mochi? (Kitchen #9)".
- **Brand Shelf:** close the pilots started in the kill test before G-B on Nov 29; first paid clips posted (labelled).
- Outreach: DM 50 small cat accounts (5k–100k followers) offering their cat as Friday's guest star for free and a
  creator code.
- Submit to Vibe Jam if a 2026–27 edition is open (dates unknown), itch.io (web, free), r/WebGames and
  r/IndieGaming.

### 15.3 Week 3: Nov 30 – Dec 6, Season 1 "Deck the Halls"

- Dec 1: Christmas tree boss room (the most proven cat clip fantasy) every Saturday; S1 free track and Club track.
  Gift cameo and gift Club cards run on the result screen through S1 (section 9.2).
- Room Maker beta (M2) behind a link; first Community Sunday on Dec 6 from the best room sent in.
- **Press hook: "this cat got adopted because of a video game"** (format 6, section 4.6), for Lithuanian, pet and
  games media, as soon as one "still waiting" cat is adopted and the adopter confirms the game played a part. Until
  then the angle is "A Vilnius shelter's cats star in a daily game; 10% goes to the shelter."

### 15.4 Week 4: Dec 7–13, money

- First sponsor day placed; Brand Shelf clips running if G-B passed.
- Club price and paywall review on Stripe's numbers, once each paywall arm has ≥ 300 views (section 14).
- Decide Phase 2 (accounts, backend boards, server OG and short links) on the week-4 KPIs below. Club does not wait
  for this decision; it shipped in M1.

### 15.5 Founder time and Arbitrum Dubai

- **Budget: 3 h/day in launch weeks 1–2** (posting, Stitches and reply videos, community answers), ~1.5 h/day from
  week 3. The plan already runs on one TikTok account + X, the smallest useful set. `?studio=1` (section 6.2) is
  what makes Stitches and replies affordable.
- **Dubai trade-off (G10, Oct 31):** Arbitrum Dubai (build Nov 16 – Dec 6) competes directly with launch weeks 1–3.
  They do not run in parallel. If Dubai goes ahead, the kill test, M0 and M1 still run on schedule, the prototype and
  the pre-sale stay live, and **Day #1 moves to Monday, Dec 7**, launching straight into Season 1 (opened Dec 1; S0
  is skipped). The MRR checkpoints in section 9.3 stay as they are.

---

## 16. KPIs and kill criteria

| When | Metric | Target | Kill / change trigger |
|---|---|---|---|
| Kill test (Nov 8) | Best clip views; clips of one format ≥ 2k; intent comments | ≥ 10k; ≥ 3; ≥ 15 | All three missed → stop (G-A); one missed → mixed |
| Before the clock (Oct 29) | Stranger check: funny median; right cat picked; unprompted "creepy/cheap" | ≥ 3 of 5; ≥ 14 of 20; ≤ 4 of 20 | Fail → fix and recheck with 10 new strangers within 2 days |
| Kill test (Nov 8) | Typed arrivals per 1,000 clip views (redirect counter; URL in the top-left watermark and the last-2 s caption) | measured (planned 5) | < 1 → rework the URL line, the name and the picker before launch |
| Kill test (Nov 8) | Stitch owners who said yes / asked; owner reposts | ≥ 25%; ≥ 3 reposts | < 10% yes → switch the main format to POV + replies |
| By Nov 29 | Founding pre-orders (G-A$) | ≥ 25 | < 25 → change offer or price, retest within 7 days |
| By Nov 29 | Brand Shelf paid pilots or signed LOIs (G-B) | ≥ 1 | 0 → rebase 9.3 on Club only (~232 subscribers for $1k) |
| M0 device test (Oct 30) | Clip export with sound (or a decided silent path) on iOS Safari and Chrome Android | works on a real iPhone 11 and Galaxy A15 | Not working → the gate clock waits (15.0) |
| Week 1 | Load p75 on mobile | ≤ 3.0 s | > 5 s → stop marketing, fix |
| Week 1 | Link open → postable clip (median `link_to_clip_ms`) | ≤ 90 s | > 150 s → shorten the FTUE |
| Week 1 | First crash median | ≤ 10 s | > 15 s → rework room spawns |
| Week 1 | Ranked run completion | ≥ 75% | < 60% → difficulty and FTUE pass |
| Week 1 | In-app clip-save rate | ≥ 60% | < 40% → handoff redesign |
| Week 2 | D1 retention | ≥ 25% | < 15% → retention pass before more posting |
| Week 2 | Share rate (shares ÷ ranked runs) | ≥ 8% | < 4% → redesign the share sheet and clip |
| Week 2 | Link open → first run | ≥ 45% | < 30% → in-app browser load fixes |
| Week 2 | Clip export success on iOS | ≥ 85% | < 70% → server render fallback (Phase 2) |
| From ≥ 300 views per arm (not a fixed week) | Paywall view → revenue-bearing purchase, per A/B arm (post-share vs PERFECT CRIME) | ≥ 3% | < 1% → change offer or price and retest after the next 300 views |
| Week 4 | WAU | ≥ 1,000 | < 300 → see day 45 |
| Week 4 | K (link-attributed new ÷ actives) | ≥ 0.2 | < 0.1 → artifact redesign |
| Week 4 | D7 retention | ≥ 8% | < 4% → retention systems first |
| Week 4 | Revenue-bearing purchases counted from Stripe (Club, cameo, guest star, gifts, cosmetics, sponsor; not the collar) | ≥ 20 | 0 → change offer or price and retest within 7 days |
| Week 4 | Club members who opened their seen counter (`bc_cameo_seen`, consenting players) | ≥ 50% | < 25% → put the counter on the home screen's first view |
| Week 8 (Jan 10) | Club new subscribers a month; monthly-plan churn (from Stripe) | ≥ 15; ≤ 13% | churn > 20% → perk and seen-counter review before more paid promotion |
| Dec 31 | MRR gross (and net) | ≥ $100 (24 Club) | below → pricing and Club-perk review |
| Day 45 (Dec 31) | WAU and best clip | ≥ 2,000 WAU or 1 clip ≥ 250k views | **Kill: WAU < 500 and no clip > 50k views** → freeze content, keep the daily on autopilot (pre-authored rooms), move the engine to the next mode (Trap Rooms or Café Raid) |
| Month 3 (Feb 16, 2027) | MAU; MRR; Club subs | ≥ 5,000; ≥ $300; ≥ 30 | < 2,000 MAU → maintenance mode |
| Apr 1, 2027 | MRR; Club new subs a month | ≥ $600; ≥ 15 | below → Brand Shelf push or price test |
| Month 6 (May 16, 2027) | MAU; MRR | ≥ 10,000; ≥ $1,000 | Success definition from the ranking |

---

## 17. MVP scope cut and build plan

### 17.1 What ships when

M0 is cut to what the kill test needs: the Kitchen, the sim, controls, the face decal and clip export on iOS
Safari and Chrome Android. Everything a player only needs after launch (dares, cards, analytics, the founder flag,
Club) moves to M1a.

| Feature | M0 MVP (Oct 19–30, 12 days) | M1a (Nov 2–7, does not depend on G-A) | M1b (Nov 9–13, after G-A) | M2 (Nov 16–29) | Phase 2 (Dec+) |
|---|---|---|---|---|---|
| Sim (8-way cell grid, cat, human, props, scoring, replay) | push, fall, domino, break, Busy/Look/fake-out, cone, suspicion, scoring, replay, FTUE 40 s mode | spill-slide, stack bonus, cloth and cable pull, Roomba, tuning | — | Napper, two-human boss | vendored in backend |
| Rooms | Kitchen shell, "The Glass", ~7 seeded variants | Living room + Bathroom shells (CC0 kit assembly) | Party room + Bedroom, 21 dailies, birthday boss | Home office, S1 Christmas rooms | weekly authoring |
| Art | 15 CC0 props with their kits' colormaps, CC0 cat with a face quad, 2 patterns, CC0 glTF or rigid-part human with the double-take, generic shards | 5 more patterns | scoop animation, more prop kinds | Christmas props | morph targets |
| Cameras | whole-room gameplay camera (prototype day 3), clip camera | edge arrow for the human | — | — | — |
| My Cat | **face decal** + manual chips + default cat; photo or a video frame as opener | 2 s video opener | — | k-means palette + pattern guess; up to 5 cats (Club), household clip | /yourcat import |
| Run loop, HUD, result, 2-button controls with hysteresis | yes | polish | — | — | — |
| Clip export | one-crime planner, clip camera, same-context render, WebCodecs + `mediabunny` (lazy), share-on-tap, iOS audio decision; tested on a real iPhone 11 (Safari) and Galaxy A15 (Chrome) | MediaRecorder fallback, clip gates, handle overlay | Stitch / reply template, the 6 formats | household clip | server fallback |
| In-app browser | detect, play, copy the clip handoff link | Android `intent://`, handoff events | — | — | — |
| Founder Stitch / reply pipeline | the game + editing in TikTok | `?studio=1` dev flag | — | batch mode | — |
| Short domain, typed counter, room picker | yes (redirect, counter, picker with "The Glass" and the Kitchen variants) | per-day and per-shell HTML with OG tags | picker with the last 14 dailies | — | — |
| Emoji card, result card | — | emoji, result, story and cat cards | cameo card, OG dailies | Rap Sheet card | animated cards, server OG |
| Dare links and ghosts | — | yes, with the recorded-run size test | — | friends board | global boards |
| Analytics | redirect counter only | PostHog events, `entry=typed`, handoff and clip-save events | paywall events, Stripe metadata reporting | — | — |
| Club (Stripe subscription), founding pre-sale, restore, customer portal | pre-sale as a Stripe Payment Link (no code, Oct 26) | Club Checkout with the monthly/annual toggle, in-app checkout, entitlement, restore, founders by email | paywall moments (none in session 1; post-share vs PERFECT CRIME A/B) | weekly seen email | backend accounts |
| Cameos, guest star, gifts, collar | — | — | Checkout + webhook + key-value store, shuffles and seen counter, gift redeem links | cosmetics (3), face approvals | entitlements store |
| Brand Shelf, sponsor day | — (outreach from Nov 2 needs no code) | — | Stripe subscription + manual placement | — | — |
| Pink Paw accomplice + Felony Friday | — | Pink Paw sync | yes; "still waiting" clip caption | Alumni + "went home" clip | live data |
| Streak, par | — | streak, par from dev runs | — | Rap Sheet + season track | — |
| Room Maker + room links + remix | — | — | — | yes | short links, feed |
| PWA, `.ics` reminder | — | — | — | yes | web push |
| Creator codes | `via` param | — | — | codes + manual payouts | dashboard |

**Not in the plan for the first 6 months:** accounts before Phase 2, global leaderboards, public room feed, photo
upload outside the cameo approval list, TikTok LIVE connector, Twitch IRC mode, multiplayer, gamepad, zoomies,
Host Kit, portal builds, Live Photos.

**Suggested M0 order (12 calendar days, lanes in parallel):**

| Days | Lanes | Work |
|---|---|---|
| 1–2 (Oct 19–20) | LEAD, L1, L2 | Lock the grid spec (section 4.1) and `types.ts`; copy `rng.ts`, `hash.ts`, the replay RLE and `lineOfSight`; Kitchen room JSON |
| 1–6 (Oct 19–24) | L1 | The sim: 8-way stepping, jumps, push, fall, domino, human machine, cone, suspicion, scoring, replay, FTUE mode (5–6 days) |
| 1–6 (Oct 19–24) | L3, L7 | Kitchen from CC0 kits, the cat's face quad in Blender, the human, **gameplay camera prototype on day 3** (it sets prop scale), shards, few shader programs; core SFX incl. the loud crash and the "hm?" sting |
| 2–6 (Oct 20–24) | L4, L5 | Face decal crop and photo input; touch controls with hysteresis, HUD, briefing, result |
| 3–7 (Oct 21–25) | L6 | Clip planner (tension pick), clip camera and encoder against scripted inputs |
| 7–8 (Oct 25–26) | all | Integration; **playable Kitchen by Oct 26** (warm-up screen recordings start) |
| 8–10 (Oct 26–28) | L6, L3, L8 | One-crime clip on the real renderer, lazy loading, context-loss retry; short-domain redirect + counter + picker; pre-sale Payment Link on the landing |
| 10–12 (Oct 28–30) | L9 | Real iPhone 11 (Safari) and Galaxy A15 (Chrome): clip export, the iOS audio decision, webview detection and copy-link; **gate clock starts Oct 30** |

### 17.2 Lanes (parallel engineers or agents) with file ownership

Each lane owns its folder; cross-lane changes go through `src/types.ts` (owned by the lead, frozen at M0 day 2; later
changes need a note in the PR). Lanes communicate only through the interfaces in section 13.3.

| Lane | Owns | Depends on | M0 deliverable | M1 deliverable | M2 deliverable | Done when |
|---|---|---|---|---|---|---|
| **LEAD** | `src/types.ts`, `package.json`, CI | — | Interfaces, SIM_VERSION, repo scaffold, CI (tsc, vitest, Playwright) | Integration, perf budget checks, G-A go/no-go split | Release checklist | All lanes green in CI |
| **L1 Sim** | `src/sim/**` | types | Copied RNG, hash, replay RLE, line of sight; new 8-way cell stepping, heightmap, jumps, swat, push, fall, domino, human state machine, cone table, suspicion, scoring, replay, FTUE 40 s mode (5–6 days) | Spill-slide, stack bonus, cloth and cable pull, Roomba, tuning hooks, golden replays | Napper noise meter, two-human boss | 30 golden runs identical in Node, Chrome, Safari, Firefox; 100% branch coverage on scoring |
| **L2 Content + codec** | `src/content/**`, `src/codec/**`, `public/daily/**` | types, L1 for validation | Prop catalog (15 kinds), Kitchen room + variants, "The Glass", CatSpec | Ghost and link codecs with the recorded-run size test, 4 more shells' rooms, 21 dailies, room codec, handoff link, text filter | Home office, room codec v1 for editor, ancestors | Round-trip tests for every codec incl. a boss-size room; recorded human ghosts ≤ 600 chars; validator passes all dailies |
| **L3 Render** | `src/render/**`, `public/models/**` | types, L1 state shape | Room, CC0 cat with 2 shader patterns and the face quad, human with the double-take, props (fall meshes pulled out of instances), generic shards, whole-room camera, clip camera, cone, same-context clip pass with the frozen DPR tier, warm-up, context loss | Quality tiers, 4 more shells, 5 more patterns, scoop animation | Christmas props, two humans | 60 fps on iPhone 11, ≥ 30 on Galaxy A15 in the Kitchen; no hitch on the first crash; the human always on screen |
| **L4 Cat maker** | `src/catmaker/**` | types, L3 preview | Face decal crop, manual picker, photo store, JPEG/PNG input | 2 s video opener, re-add after handoff | k-means palette + pattern guess, up to 5 cats, /yourcat import stub | 9 of 10 testers recognise their own cat in a lineup of 5 game cats |
| **L5 UI + input** | `src/ui/**`, `src/main.ts` | types, L1, L3 | Touch (2 buttons, latch, gesture blocking, direction and speed hysteresis) and keyboard, HUD, briefing, result, FTUE order, picker | Home, archive, share screen shell, thanks and restore pages, settings | Paywall cards (M1b), redeem page, Rap Sheet, season screen | E2E: link → snap → run → clip in ≤ 90 s and ≤ 6 taps; no offer card in session 1 |
| **L5b Editor** | `src/editor/**` | L2 room codec, L3 | — | — | Room Maker, clear-to-publish, remix | A new player builds and publishes a room in ≤ 3 min (5 playtesters) |
| **L6 Share + clip** | `src/share/**` | L3 clip pass, L2 links | One-crime clip planner (tension pick), real-cat opener and match cut, WebCodecs + `mediabunny` encoder (lazy), share-on-tap, iOS audio path, watermark and URL line in the safe box | MediaRecorder fallback, clip gates, handle overlay, in-app handoff, image cards; (M1b) share sheet with the 6 formats incl. Stitch / reply | Rap Sheet card, cameo card, household clip | Clip ≤ 8 s on iPhone 11; ≥ 85% success across the device matrix; ≥ 60% in-app clip-save from week 1 |
| **L7 Audio** | `src/audio/**`, `public/audio/**` | L1 events | SFX core set (CC0) incl. the loud crash and the "hm?" sting, music loop | Full SFX, stems, stingers, clip mix | S1 sleigh layer | ≤ 300 KB first load; no audio on iOS before first tap |
| **L8 Platform + progress** | `src/platform/**`, `src/progress/**`, `vite.config.ts`, `client/pages/api/badcat/**`, `client/next.config.js` (badcat lines only) | types | Storage, env, build:client, `/badcat/*` rewrites (top level), short-domain redirect with the typed counter, pre-sale Payment Link | Analytics, Club Checkout (monthly/annual toggle, in-app), webhook with Stripe metadata, entitlement token, restore, customer portal, Pink Paw data, per-day HTML with OG, streak, par display; (M1b) cameo store, shuffles and seen counter, gifts | Rap Sheet, season, PWA, `.ics`, creator codes, weekly seen email | `/badcat/d/1` loads top level with OG tags; a purchase made in the TikTok webview is restored in Safari by email; storage survives blocked localStorage |
| **L9 Tools + QA** | `tools/**`, `e2e/**`, `public/og/**`, `public/pink-paw-cats.json` | L1, L2, L3, L6 | BFS validator, device test on a real iPhone 11 and Galaxy A15 | Par from dev runs, OG and HTML renderer, Pink Paw sync, e2e suite, device matrix incl. TikTok/IG in-app on real phones | `?studio=1` batch mode | A Stitch or reply clip in ≤ 2 min of founder time; every daily has par and OG |

### 17.3 Milestone checklist

**M0 (Oct 19–30), "it's fun in the Kitchen, and it posts":** one room plus "The Glass", one human, face-decal cat,
a full 75 s run and the 40 s FTUE run, 2-button controls, the one-crime clip with the real-cat opening exported on
a real iPhone (Safari) and a Galaxy A15 (Chrome), the short domain with the picker and typed counter, the pre-sale
Payment Link. Exit: 5 playtesters each ask for "one more go"; the stranger check has run; clips export on both
phones (with sound, or with the silent iOS path decided); warm-up recordings running from Oct 26; the gate clock
starts Oct 30.

**M1a (Nov 2–7), work that is useful whatever G-A says:** dare and ghost codecs, emoji, result, story and cat cards,
analytics, `?studio=1`, clip fallbacks and gates, in-app handoff for clips, Club Checkout with the annual toggle and
in-app checkout + entitlement + restore, Living room and Bathroom shells, the M1a sim rules (spill-slide, stacks,
pulls, Roomba), 5 more patterns, 2 s video opener, per-day HTML with OG, streak, par, Pink Paw sync.

**M1b (Nov 9–13), only after G-A passes (or is mixed):** Party room and Bedroom shells, 21 dailies, birthday boss,
the picker with the last 14 dailies, paywall moments, cameos/guest star/gifts/collar with the webhook, shuffles and
the seen counter, Brand Shelf checkout, the Stitch / reply template and the 6 formats, OG dailies. Exit: all week-1
KPIs measurable; device matrix (iPhone 11 / 13 / 15 on iOS 17–18 Safari, Galaxy A15, Pixel 7, desktop
Chrome/Safari/Firefox, TikTok and Instagram in-app browsers) passes the e2e flow. If M1b is not done by Nov 13,
Day #1 moves to Nov 23 rather than launching without clips or checkout.

**M2 (Nov 16–29, during launch weeks 1–2), "they come back and build":** Rap Sheet, season track, Room Maker,
remix, Community Sunday pipeline, PWA, Home office shell, cosmetics, k-means palette, up to 5 cats and the
household clip, weekly seen email, creator codes. Exit: S1 ready by Dec 1.

**Phase 2 (from Dec 7, only if the week-4 KPIs pass):** accounts, `BAD_CAT` score type with replay verification,
boards, Stripe moved to the backend, store with entitlements, server OG and short links, `/yourcat` import, face
uploads through `/yourcat` moderation, live treat meter.

---

## 18. Risks and "Your call" (defaults apply if no answer)

| # | Risk or decision | Default |
|---|---|---|
| 1 | Clips get views but viewers do not play (the top risk in the ranking) | Measure typed arrivals per 1,000 views in the kill test; the gate checks comment intent, not just views |
| 2 | A recoloured low-poly cat does not read as "my cat", or the pasted face looks creepy or cheap at feed size | The real face decal on a face quad from M0, the 2 s real-cat opening and match cut, clips framed close on the cat and the falling object, a bigger double-take and the slow blink; the 20-stranger check before the gate clock (15.0) |
| 3 | Existing competitors (Cat Life Simulator, Tail of Catastrophe, Roblox BAD CAT, I Am Cat), and "bad cat" search crowded by the Roblox game and millions of real cat videos | Our edge is the daily shared room, the real-cat clip, Stitches and reply videos and the shelter cast; do not compete on sandbox depth. Search: the exact-phrase check and one owned hashtag (#12) |
| 4 | iOS clip export fragile, and possibly silent (`AudioEncoder` likely missing on iOS 17–18) | Same-context render with the DPR tier frozen, frame wrapped in the same task, codec probe, share-on-tap, lazy-loaded encoder; the iOS audio path decided in the M0 device test (MediaRecorder with sound, else silent + "add a sound in TikTok"); image card third; server render in Phase 2 if < 85% |
| 5 | Brand tone vs. the shelter | Cuddle on caught, no punishment, tagline "Cats are chaos. Adopt one anyway." |
| 6 | Purchases lost between the in-app browser and the real browser | Stripe Checkout works inside the in-app browser, email on every checkout, entitlement cached in the webview, restore by email against Stripe in any browser; "Pay with Apple Pay in Safari" is a second button; no honour-only unlocks |
| 7 | Shelter share size | **Your call; default 10% of net game revenue + 100% of the collar** |
| 8 | Club price and founding renewal | **Your call; default $4.99/mo and $39.99/yr shown side by side at checkout; founding $24.99 for the first year for the first 200, renewing at $39.99/yr (alternative: $24.99/yr locked for life), stated on the pre-sale page before anyone pays** |
| 9 | Sponsor and Brand Shelf prices | **Your call; default $99/day with the public ladder; Brand Shelf $199/mo for 4 founder-account clips with a 20,000-view floor plus the prop (range $149–249), $99 first-month pilot** |
| 10 | Showing the player's real photo in clips by default | **Your call; default on for photos and videos chosen in the flow, with a visible toggle** |
| 11 | Founder time vs. Arbitrum Dubai (Nov 16 – Dec 6) | **Your call at G10 (Oct 31); default: Bad Cat launches Nov 16 and Dubai is dropped, unless G10 shows a strong fit; if Dubai goes ahead, Day #1 = Dec 7 (section 15.5)** |
| 12 | Game name and hashtag | **Your call by Oct 22; default "Bad Cat Daily" and `#badcatdaily` if the exact phrase and the hashtag return near-empty TikTok, Google and app-store results (15.0). If not, take the first name from your shortlist that passes the same check; never launch on a name whose search results are someone else's** |
| 13 | Short typeable domain | **Do it now: buy one short domain that matches the name (e.g. `badcatdaily.com`, checked for availability and price) by Oct 23, live by Oct 26, redirecting to `/badcat/pick?e=t`. Default: buy it unless it costs more than ~$50 a year, in which case take the cheapest close variant** |
| 14 | Several new accounts look like spam, and thin posting on each teaches nothing | One TikTok account plus the founder's X during the kill test and launch weeks 1–2; no render posted twice on one platform; unique camera seed and caption per clip. Instagram and YouTube accounts only after a format clears 50k views |
| 15 | Other people's cats in Stitches, quotes and reply videos | Ask the owner or commenter first and post only after a yes; only cats; tag the owner; delete on request. Stitch only where the original allows Stitch; on X, quote the original post instead of reuploading it |
| 16 | New Stripe path in the client beside the backend's | Accept for the MVP (it ships Club months earlier); move to the backend in Phase 2 |
| 17 | Is the $1k MRR goal gross or net? | **Your call; default gross (before Stripe fees, the Pink Paw share and creator codes), with net reported next to it every month. At the May mix, $1k gross ≈ $835 net; $1k net needs about 3 Shelf + 140 Club (9.3)** |
| 18 | Brand Shelf has no proven demand and carries ~60% of the target | Sold as clips with a view floor, not a prop; outreach from Nov 2 with real numbers; gate G-B (≥ 1 paid pilot or LOI by Nov 29), else the targets are rebased on Club only (~232 subscribers) |
| 19 | Paid clips on the founder's accounts read as ads and lose reach or trust | Label every paid clip (TikTok paid-partnership label, `#ad`), at most 1 in 5 founder posts paid, the product inside a normal crime clip, never a separate ad |
| 20 | Club churn erases sign-ups | Seen counter and weekly "seen N times" line from M1b, annual plan at checkout, up to 5 cats; churn and new-subscriber KPIs in section 16 |

---

## Appendix A. First 14 daily rooms

Week 1 uses the 5 M1 shells; the Home office shell arrives in M2, so Thursday Nov 19 is a living-room Zoom call.
If Day #1 moves to Dec 7, the same list starts on Dec 7 with Christmas props on Saturdays.

Thursday #11 (Thanksgiving, Nov 26) is a Kitchen dinner with Chef Dad and Grandma and no webcam: intended (QA round 3
asked). It is the one holiday Thursday; every other Thursday is the Home office with the "on camera" twist.

| # | Date | Room | Human | Must-Wreck targets | Accomplice wish | Event |
|---|---|---|---|---|---|---|
| 1 | Mon Nov 16 | Kitchen: Breakfast Heist | Chef Dad | wine glass, fruit bowl, egg carton | tuna can | kettle |
| 2 | Tue Nov 17 | Living room: TV Night | Couch Potato | remote, popcorn bowl, lamp | knitting yarn | pizza delivery |
| 3 | Wed Nov 18 | Bathroom: Toilet Paper Wednesday | Skincare Sis | toilet roll, perfume, toothbrush cup | bath duck | phone call |
| 4 | Thu Nov 19 | Living room: Zoom Call (laptop on the sofa) | WFH Worker | coffee mug, plant, laptop | pen cup | doorbell |
| 5 | Fri Nov 20 | Party room: Felony Friday (play as a Pink Paw cat or the guest star) | Party Host | cake, cups tower, balloon | ribbon | "Surprise!" lights off |
| 6 | Sat Nov 21 | Boss: Birthday Party (90 s, two humans) | Party Host + Grandma | cake, gift stack, punch bowl | candles | song |
| 7 | Sun Nov 22 | Bedroom: Laundry Day | Napper | laundry basket, alarm clock, jewellery dish | sock | alarm |
| 8 | Mon Nov 23 | Kitchen: Bake Sale | Chef Dad | cookie tray, flour bag, mixer bowl | butter | oven ding |
| 9 | Tue Nov 24 | Living room: Game Night | Couch Potato | board game, snack tower, controller | dice | doorbell |
| 10 | Wed Nov 25 | Bathroom: Spa Day | Skincare Sis | candle, face-mask jar, towel stack | rubber duck | phone call |
| 11 | Thu Nov 26 | Kitchen: Thanksgiving | Chef Dad + Grandma | gravy boat, pie, turkey platter | turkey leg | guests arrive |
| 12 | Fri Nov 27 | Party room: Black Friday Boxes | Party Host | box tower, bubble wrap, receipt pile | box (sit in it) | courier |
| 13 | Sat Nov 28 | Boss: Wedding Cake | Two caterers | cake tiers, champagne tower, bouquet | ribbon | speeches |
| 14 | Sun Nov 29 | Bedroom: Sunday Nap | Napper | phone on the edge, water glass, plant | blanket | alarm |

Rooms beyond the 15 MVP prop kinds (popcorn bowl, perfume, gift stack and so on) are built in M1b from the same CC0
kits; each room's targets must exist in the catalog before its daily file passes the validator.

## Appendix B. Prop catalog (excerpt; ● = one of the 15 MVP kinds, all CC0)

| Kind | Name | Base points | Material | Notes |
|---|---|---|---|---|
| 1 ● | Wine glass | 150 | glass | fragile, light |
| 2 ● | Mug | 100 | ceramic | light |
| 3 ● | Plate stack (×4) | 80 each | ceramic | stack rule (M1a; one prop worth 320 in M0) |
| 4 ● | Fruit bowl | 120 | ceramic | spills 3 fruit that roll 2 cells |
| 5 ● | Egg carton | 200 | paper/egg | splat, slippery |
| 6 ● | Cake | 400 | food | heavy (2 swats), splat |
| 7 ● | Vase with flowers | 250 | ceramic | water spill |
| 8 ● | Potted plant | 180 | ceramic/soil | soil puddle |
| 9 | Lamp | 220 | metal/glass | heavy, pulls cable |
| 10 ● | TV remote | 60 | plastic | lands |
| 11 ● | Laptop | 300 | tech | heavy; on Thursday "on camera" |
| 12 | Toilet roll | 120 | paper | unrolls 4 cells (trail, visual) |
| 13 | Perfume bottle | 200 | glass | light |
| 14 ● | Tablecloth | 0 | fabric | pull drags everything on it (the pull ships in M1a; in M0 it is decoration) |
| 15 ● | Book stack (×5) | 40 each | paper | stack rule (M1a; one prop worth 200 in M0) |
| 16 | Christmas ornament | 90 | glass | S1 |
| 17 | Christmas tree | 1,500 | tree | boss target; needs 3 swats at L3; topples 4 cells |
| 18 ● | Slipper | 0 | fabric | grabbable, stash +500 |
| 19 ● | Sock | 0 | fabric | grabbable, stash +500 |
| 20 ● | Roomba | — | actor | moves on a loop; frame-up target (behaviour ships in M1a) |

## Appendix C. Critique log

### v1.1 (Oct 15, 2026): three critiques of v1.0

v1.1 applies three critiques of v1.0: (1) the zero-follower creator view, (2) the $1k MRR view, (3) the 2-week
mobile-browser MVP view. Accepted items are folded into the sections above; this log lists what was rejected,
changed on the way in, or decided where two critiques conflicted. Items reversed in v1.2 are listed under v1.2.

**Accepted as written (pointers only):** real-cat opening, no UI in 0–1 s, no end card (7.3); no "link in bio",
typed URL, search name, `entry=typed` (7.5, 14); face decal in M0 (6.1); human-played kill-test clips with the real
hook, ≥ 60 clips (15.0); reply videos as format #1 with a scripted pipeline (6.2, 7.5); in-app handoff and the
≥ 60% clip-save KPI tested in M0 (7.3, 16); snap-first FTUE, 40 s first run, 90 s link-to-clip (8); one niche per
account, no repeated renders (15.0, 18 #14); emoji card demoted (7.2); 3 h/day and the Dubai trade-off (15.5,
18 #11); Club in M1 on Stripe (9.2, 10); MRR restated as recurring only (9.3); $4.99 / $39.99, annual after month 2
(9.2); "your cat, featured" perks (9.2); paywall moments and events (9.2, 14); pay in the real browser, email
restore, customer portal (9.2, 10); cameo webhook, 10–15 slots, $9.99 guest star (6.5); Brand Shelf (9.2, 15.2);
money KPIs and the changed zero-conversion trigger (16); Host Kit, portal builds and Twitch mode cut (9.2, 17.1);
2-week M0 cut (17.1); CC0 art plan (11.1); iframe `allow` and share-on-tap (6.6, 7.3); same-context clip render,
codec probe, silent fallback, frame closing, backpressure, `mediabunny` (7.3); 2 buttons, no zoomies, gesture
blocking, input latch (5.1); Heist sim fork and grid spec (4.1, 13.4); spawn x:4 z:4 (6.6); no bot for validator
or par (4.5, 13.7); meshopt only, `compileAsync`, context loss, DPR start (11.2); default FTUE cat, pinned `dayNo`,
honour-based ranked runs (3.4, 8).

**Rejected or changed:**

| Critique item | Decision | Why |
|---|---|---|
| (2) #3: the founding annual "does not dilute monthly MRR" | Changed | Annual plans count at 1/12 per month in MRR, so a $24.99 year does dilute ($2.08/mo). Kept anyway as the pre-sale and willingness-to-pay test, capped at 200, and counted honestly in 9.3. |
| (2) #4: "unlimited Room Maker publishes" as a Club perk | Rejected for now | Publishing is URL-only with no server, so there is no limit to lift; it would be a perk that sells nothing. Revisit if publishing goes server-side in Phase 2. |
| (2) #2: "make the season pass an auto-renewing $4.99 every 6 weeks" | Took the other option | Folded the pass into Club instead: one subscription is simpler to sell and to count. |
| (2) #10: "leave a streamer flag inside Club" | Accepted as a layout flag only | No chat integration in the first 6 months; the flag gives a clean 16:9 layout with a dare QR code. |
| (3) #1: defer the photo palette and Payment Links from the 2-week MVP | Changed, conflicts with (1) #3 and (2) #1 | The k-means palette is deferred to M2, but the face decal (simpler, and the actual hook) moves into M0. Payment Links are replaced by one Stripe Checkout path; only the pre-sale page is in M0, Club checkout in M1a. |
| (3) #1: defer the 5 other shells | Accepted for M0 only | The 7-day rotation needs 5 shells at launch, so 4 come in M1 (2 before G-A as low-risk CC0 assembly, 2 after). The Home office waits for M2; Thursday uses the living room. |
| (3) #3: serve `/badcat` top-level without an iframe | Kept the iframe first | The iframe with `allow="web-share; clipboard-write; …"` keeps per-path OG tags from the Next.js page. Top-level with pre-rendered per-day HTML is the fallback if the M0 iOS test fails. The Heist host is not changed. |
| (3) #8: "build the real bot only for promo clips" | Went further | Clips are human-played (critique 1 #4), so no gameplay bot is built at all. A scripted-input runner exists only for golden tests and e2e. |
| (1) #4: replace the kill-test pass condition | Merged | Kept the "≥ 15 intent comments" condition next to the new view conditions, because the ranking's top risk is views that do not convert. Added typed arrivals per 1,000 views. |
| (1) #6: "keeps the run via a URL-encoded replay" | Accepted with a gap noted | The run travels in the URL, but the photo and face decal cannot. After a handoff the real browser asks for the photo again with one tap (6.1). |
| (1) #6 and (3) #3: "one-tap Open in Safari" | Changed | Android can open Chrome with an `intent://` link. iOS in-app browsers have no reliable way to open Safari from a web page, so iOS shows the "•••" → "Open in browser" steps with the link already copied. |
| (1) #8: "start with 1–2 accounts" | Merged | 3 accounts on 3 platforms or devices (TikTok A, TikTok B on a second phone, Instagram/Shorts) plus the founder's X; with one device only, TikTok B + Instagram + X. |
| (1) #10: "start launch day 1 on Dec 7, after Season 1 opens on Dec 1" | Accepted, with S0 skipped | Day #1 = Dec 7 launches straight into S1. The default if nobody answers is the Nov 16 launch with Dubai dropped, since Dubai was rated 1–5%. |
| (2) #7: "Vercel KV" | Changed | Vercel KV is no longer offered for new projects; the plan uses Upstash Redis from the Vercel Marketplace or Edge Config. |
| (2) #8: views report "taken from PostHog" | Changed | PostHog only sees consented sessions, so the Brand Shelf report combines consented plays with the founder accounts' public post views. |
| (2) #1: "the Stripe customer email is the account" | Accepted with a note | It adds a Stripe path in the client beside the backend's. Recorded as risk 18 #16 and moved to the backend in Phase 2. It never writes scores. |

### v1.2 (Oct 15, 2026): three more critiques

v1.2 applies three critiques of v1.1: (4) the zero-follower growth view (10 items), (5) the $1k MRR by May 16 view
(10 items), (6) the 2-week mobile-browser MVP view, checked against `catnip-heist/src/` (10 items). The code claims
in (6) were checked: the Heist sim has no `trig.ts`, uses 4-way `distanceField` pathing, `TELEGRAPH_TICKS = 36`
and an immutable `step`, as stated.

Some v1.1 decisions above are reversed by v1.2: the iframe host (now top level), pay-in-the-real-browser (now
in-app Checkout), annual after month 2 (now at checkout), 3 accounts plus X (now one TikTok + X), ≥ 60 kill-test
clips (now ≥ 30 in a 10-day clock), reply videos as format #1 (now format 3, after Stitches), one Stripe Checkout
path for the pre-sale (now a Payment Link), and the in-app clip-save rate as an M0 gate (now a week-1 KPI).

**Accepted as written (pointers only):** (4) #1 Stitch / quote format first, screenshot input (6.2, 7.5 #1, 15.0);
(4) #2 one crime, tension pick, "turned too late", 2 s real video opener on founder accounts (1, 7.3); (4) #3
watermark top left, URL in the last-2 s caption, domain bought before the test (7.3, 15.0, 18 #13); (4) #4 one
TikTok + X, 3+ a day, clock from Oct 30 (15.0); (4) #5 room picker and "The Glass" always open (3.4, 6.6); (4) #6
loud cartoon crash, "hm?" sting, trending sound on founder posts, SFX-only for others (1, 7.3, 12); (4) #7 result →
Post clip → offer only after a share or dismissal, none in the first session (3.1, 8, 9.2); (4) #8 stranger check,
double-take, slow blink, close clip framing (4.3, 7.3, 15.0); (4) #9 format 6 "still waiting", press hook (4.6,
7.5, 15.3); (4) #10 exact-phrase name check, one hashtag, Reddit plan (15.0, 15.1, 18 #12). (5) #1 Brand Shelf as
clips with a view floor, outreach in the kill test, gate G-B (9.2, 15.0, 16); (5) #2 subscriber flow with churn
(9.3, 16); (5) #3 weighted pool, views sold instead of slots, random fridge sample, 20 free cameos a week (6.5);
(5) #4 seen counter in M1b (6.5); (5) #5 Checkout inside the in-app browser (9.2, 10); (5) #6 paywall moments moved,
post-share trigger and A/B (9.2); (5) #7 up to 5 cats in Club (6.1, 9.2, 13.6); (5) #8 annual at checkout,
founding renewal stated (9.2, 18 #8); (5) #9 gift cameo and gift Club in M1b (9.2, 15.3); (5) #10 Stripe-side
counting, ≥ 300 views per arm, gross vs net (14, 9.3, 18 #17). (6) #1 M0 cut (17.1); (6) #2 8-way cell stepping,
L1 at 5–6 days, M1a rules (4.1, 4.4, 13.4); (6) #3 whole-room camera, separate clip camera (11.1); (6) #4 frozen
DPR tier, same-task `VideoFrame`, lazy encoder, no Live Photos, HEIC handling (6.1, 7.3); (6) #5 face quad on the
head bone, fixed-rectangle match cut (6.1, 7.3); (6) #6 top level, per-day HTML (6.6, 10); (6) #7 webview
detect-and-copy only in M0 (7.3, 16); (6) #8 kit colormaps, 2 patterns, rigid or CC0 glTF human, scoop in M1
(11.1); (6) #9 few shader programs, falling props pulled out of instances, context loss in the clip pass (11.2);
(6) #10 direction and speed hysteresis, 10-tick loaf, recorded-run size test (5.1, 6.6).

**Rejected or changed:**

| Critique item | Decision | Why |
|---|---|---|
| (4) #6: "there is no music" | Partly wrong | The game has a music loop with stems (section 12); the clip is SFX-only on purpose so creators can add a trending sound. The quiet "plink" was the real problem and is fixed. |
| (4) #8: CC0 Kenney and Quaternius kits look cheap | Kept the kits | 12 days leave no room for custom art. The risk is handled by framing (the cat and the falling object fill the clip), the bigger double-take and blink, and the stranger check, which can force changes before the gate clock. |
| (4) #2: 2 s real video opener | Founder accounts only; players may still use a photo | Requiring a video from players would cost the 90 s link-to-clip goal. Until M1a ships the video opener, founder clips get the 2 s video joined by hand in TikTok. |
| (4) #4: one TikTok + X only | Accepted; Pink Paw still posts | Format 6 belongs on Pink Paw's own channels (not a new founder-run account), and those posts are recorded but outside the gate. The AI-photoreal control moves to X so the TikTok niche stays clean. Volume scaled to ≥ 30 TikTok clips in the 10-day clock, each also posted natively on X. |
| (4) #5: picker with the last 14 rooms | Changed timing | There are no dailies before launch, so the kill-test picker shows "The Glass" and the Kitchen variants; the 14-room picker ships in M1b. The free archive grows from 3 to 14 days so it matches what the picker already gives away. |
| (4) #9: "this cat got adopted because of a video game" | Accepted with a guard | Only real adoptions confirmed by Pink Paw are posted, and the game is credited only if the adopter says it played a part; otherwise the press angle stays the shelter-cast story. |
| (4) #10: change the name | Not changed by default | The exact-phrase check decides by Oct 22 (18 #12). "Bad Cat Daily" stays if its exact phrase and hashtag come back near-empty. |
| (5) #1: Brand Shelf clip package | Accepted, with disclosure added | Paid clips must be labelled (TikTok's paid-partnership label, `#ad`), and at most 1 in 5 founder posts is paid, or the accounts start to read as ads. If kill-test clips average under ~5k views, the 20k floor for 4 clips is not credible and the pilot price drops to match. |
| (5) #2: churn | Accepted with chosen numbers | 13% a month on monthly plans, 0% inside the year on annual and founding (~9% blended). ~115 gross sign-ups for 94 subscribers in May, in line with the critique's 110–130. |
| (5) #3: "manual face approval overflows" | Rejected for the target | Approval is once per cat, not per cameo, so it is ~40 new faces a week at the May target, under the ~50 limit. The rest of the item (pool, views not slots, random fridge sample, 20 free a week) is accepted. The guarantee counts room loads, not unique players, because there are no accounts and no tracking for it. |
| (5) #4: seen counter "as an increment" | Changed | One increment per shown cat per page load would be ~55 writes a load. Page loads are assigned to 8 seeded shuffles of the day, and only the shuffle's counter is incremented (one write a load). The weekly email waits for M2 because it needs an email sender. |
| (5) #6: drop the streak-break offer as rare | Kept | It costs nothing and fires only when it applies. The other changes (no offers in session 1, post-share trigger, cat-maker offer from session 2, A/B) are accepted. |
| (5) #7: up to 5 cats | M2, not M1b | It needs a cat switcher and per-cat IndexedDB storage. The household clip cuts two runs of the same room together, because the sim has one player cat. |
| (5) #8: annual at checkout | Accepted, with the cost stated | Gross per subscriber falls from $4.56 to $4.31, so the May mix becomes 3 Shelf + 94 Club (was 88). Founding renewal default: $39.99/yr; lifetime $24.99 is the alternative (18 #8). |
| (5) #9: gift Club "converts into a subscription" | Changed | A gift cannot turn into a subscription without the recipient's own card. At the end of the 3 months the recipient is offered to continue. |
| (5) #10: net figures | Accepted, numbers differ | With this model's assumptions (Stripe 2.9% + $0.30, 10% Pink Paw, 20% creator share on 30% of Club revenue), $1k gross ≈ $835 net (the critique estimated ~$780), and $1k net needs about 3 Shelf + 140 Club (the critique said ~125; the annual mix lowers revenue per subscriber). Default: the goal is gross, with net reported (18 #17). |
| (6) #1: analytics out of M0 | Accepted, with a counter kept | The kill test still needs typed arrivals, so the short-domain redirect counts them per day in the key-value store from Oct 26. The pre-sale moves to a Payment Link, which reverses v1.1's "one Checkout path"; founders get Club by email lookup from M1a. |
| (6) #2: cell stepping | Accepted; `stepSim` still mutates | Step times come from the 4.2 speeds (13/7 ticks orthogonal, 19/10 diagonal). Unlike the Heist's immutable `step`, Bad Cat mutates state for clip re-render speed; golden tests copy snapshots. |
| (6) #4: decide `AudioEncoder` now | Decided | Where it is missing, iOS uses the real-time MediaRecorder path with sound if the M0 device test shows a valid MP4 with audio; otherwise iOS clips ship silent with "add a sound in TikTok". |
| (6) #6: top level instead of an iframe | Accepted; reverses v1.1 | v1.1 kept the iframe for per-path OG tags, but the build already renders OG images, so it can also write one HTML file per day and per link shell. The dynamic per-dare OG image moves to Phase 2, since the MVP pages are static. |
| (6) #10: "needs a `SIM_VERSION` bump" | Not needed | Nothing is built yet, so the 10-tick loaf and the hysteresis are part of `SIM_VERSION = 1`. Hysteresis values: ±12° and a 3-tick hold for direction; 35% / 45% of the stick radius for sneak / trot. |
| (4) #7 and (5) #6 | Merged | Both ask that no offer comes before the share; one rule now covers both (sections 3.1 and 9.2). |
| (4) #1 and (6) #1: the reply studio | Merged | (4) wants the studio to accept a screenshot of the source video; (6) wants it to be the game with a dev flag. It is `?studio=1` from M1a, and any photo input accepts a screenshot. In M0 the founder uses the game and types the caption in TikTok. |
