# Targeting: clicks and taps that land on champions, towers and minions

Founder ask (Nov 15, shipped Nov 16): "improve clickability on champs / towers / minions, I got feedback that it's quite hard,
especially in teamfights. identify on how wild rift solves that".

Client only: no sim change, no new sim version. Every change decides which unit id or aim point a command carries
(`Orders.attack(id)`, `Orders.cast(slot, x, y, id)`); the sim is untouched. The phone HUD footprint is unchanged.

Before/after page: https://storage.googleapis.com/pawlegends-pages/targeting/index.html

## 1. Problem (audit, origin/main 5f61d8002)

Synthetic taps over every enemy body in busy spots of real bots matches, through the game's own pick.

| Input | Target | Crowd | hit | other | none |
|---|---|---|---|---|---|
| Desktop 1440x900 | Hero | all | 55% | 13% | 31% |
| Desktop 1440x900 | Hero | 4+ units within 2 m | 8% | 88% | 3% |
| Desktop 1440x900 | Tower | all | 32% | 2% | 66% |
| Touch 844x390 | Hero | 2–3 | 83% | 16% | 1% |

Causes:
- **P1** the pick projected the sim position, but the renderer draws heroes and minions pushed apart by up to ~2 m in
  a clump (`heroView.ts` SEPARATION / OBSTACLE_CLEAR, `minionInstances.ts`).
- **P2** one point 0.6 m above the feet and a fixed 44/48 px radius: a hero's head (86 px tall on desktop) and most of a
  6 m tower fell outside it.
- **P3** the hero bias (10 px) was smaller than the gap between a hero's chest and a minion's feet in front of it.
- **P4** a missed right-click on a champion became a move into the fight.
- **P5** the touch lock ran out after 5 s, mid-fight.
- **P6** Normal cast mode picked by the ground point under the tap (~2 m behind a hero's head).

## 2. Body picking (`src/input/unitPick.ts`)

League's model: every unit is a **selection cylinder** (radius + height per kind, `PICK_BODY`; heroes use their
model's height `HERO_HEIGHT`), separate from the gameplay radius. It stands where the renderer **draws** the unit
(`GameView.drawn` → `HeroView.drawnAt`, `MinionInstances.drawnAt`) and is projected as a screen capsule from feet to
head with its projected width, so it scales with zoom, camera height and viewport.

- A point inside the capsule, or within a pad outside it, hits. Pads (px): heroes 18, minions/monsters 8, structures 6;
  touch × 1.5.
- A point inside a body always beats a point only in another unit's pad (+40 px on pad-only hits), so a click
  squarely on a minion beside a hero takes the minion; the hero's bigger pad only wins on empty ground.
- Overlaps: score = gap − bias (heroes 20, units 4, structures 0) + a 0–3 px centre-line tie-break − 6 px for the unit
  already targeted (hysteresis). An enemy hero wins over a minion standing in front of it; between two heroes the one
  whose centre line is nearer wins, and a hovered/locked one keeps a small edge.
- One `getBoundingClientRect` per pick, not per unit (audit P7).
- Used by desktop hover/click (`DesktopInput.unitUnderCursor`), the touch field tap that locks a hero
  (`TouchControls.tapAt`) and Normal-mode unit casts (`castArmedAt`, P6). The hover, lock and attack rings are drawn
  at the drawn position too (`GameView.ringX/ringZ`), so the ring sits under the body that was picked.

## 3. Target lock (Wild Rift "Lock Target")

A tap on an enemy hero on the field or on its portrait locks it. The 5 s timer is gone (Wild Rift's lock has none): the
lock holds until the hero dies, hides, gets more than 9 m away or, once reached, breaks past the leash (attack range
+ 1 m melee / + 2 m ranged). A second tap on it lets go. While locked, the Attack button and quick-cast smart abilities
aim at it (`lockedId()` → `smartAim`), and the red ring + chevrons mark it. Only heroes lock (Wild Rift's
"No minions" lock filter is our only mode); the Last-hit and Tower buttons cover farming. The sticky follow-up
(`stickyAttackTarget`, V20-CHASE I2) keeps the hero you are already hitting on the next press.

## 4. Attack button priority (Settings → "Target first")

| Option | Order |
|---|---|
| **Heroes** (default) | enemy hero in range (lowest HP share) → last hit in reach → hero just past range → lowest-HP minion → tower |
| **Weakest hero** (new, Wild Rift "Low Health (Absolute)") | same order, heroes ranked by HP points, so a half-HP tank no longer wins over a carry with less HP |
| Lowest HP % | any unit in range by HP share |
| Closest | the nearest unit in range |

An enemy hero in range is never dropped for a minion with the default order; the Last-hit button (small, beside
Attack, only shown with a target) is the way to farm in a fight. The Last-hit and Tower sub-buttons were already in the
HUD layout editor (`HUD_BUTTONS`).

## 5. Desktop

- Hover and right-click use the body pick (§2); the hover ring shows what a click will hit.
- **Hold `` ` `` (Backquote)**: League's "target champions only": hover and clicks see enemy heroes only. Listed in the
  menu key help.
- **Held right button**: a steer that slides onto an enemy hero attacks it and stops steering (P4), instead of walking
  the hero into the fight.
- **A + LMB** attack-move (unchanged).

## 6. Aim assist (`src/input/aimMagnet.ts`)

Wild Rift's "generous auto aim", kept small (Riot refused a champions-only ability snap as "too close to being
automated"):
- a dragged line / cone / dash ends within 10° of an enemy hero, or with the hero within 1 m of the aim line, and in
  reach (range + 0.6 m): the aim turns onto it (the hero nearest the line wins);
- a ground circle ending within 1 m (or half its radius) of an enemy hero in cast range lands on it.
Never for blinks, escapes, flashes, ally casts or casts without a smart target. Settings → "Aim assist" (on by
default; synced in the cloud profile, `pawlegends.aimMagnet`).

## 7. Settings

| Setting | Values | Default |
|---|---|---|
| Target first (touch) | Heroes / Weakest hero / Lowest HP % / Closest | Heroes |
| Last-hit button, Tower button | on / off | on |
| Aim assist | on / off | on |
| Cast mode per ability | Quick / Indicator / Normal | Quick |

## 8. Measurement (`src/input/pickLab.ts`, `tests/e2e/targeting-measure.spec.ts`)

`__plWorld.pickLab` (e2e only, loaded on demand) taps a 4 × 5 grid over every enemy drawn body (a box from feet to model
height, independent of the new cylinders) with the old pick and the new one on the same frame, at the busiest enemy
hero again and again during a `speed=3` bots match. Desktop measures the click pick (heroes, minions, towers); touch
the field tap that locks a hero. Run: `PL_TGT_OUT=<dir> npx playwright test targeting-measure`.

Results (Nov 16, after the change, old and new pick on the same frames; hit / other / none):

| Size | Input | Target | Crowd | Taps | Before | After |
|---|---|---|---|---|---|---|
| 1440x900 | mouse | Hero | all | 540 | 65 / 13 / 22 | **100** / 0 / 0 |
| 1440x900 | mouse | Hero | 2–3 | 120 | 73 / 21 / 7 | **100** / 0 / 0 |
| 1440x900 | mouse | Hero | 4+ (earlier run) | 40 | 13 / 45 / 43 | **100** / 0 / 0 |
| 1440x900 | mouse | Minion | all | 680 | 89 / 7 / 4 | 85 / 15 / 0 |
| 1440x900 | mouse | Tower | all | 20 (160 earlier run) | 35 / 0 / 65 | **100** / 0 / 0 |
| 844x390 | touch | Hero | all | 1000 | 76 / 23 / 2 | **90** / 10 / 0 |
| 844x390 | touch | Hero | 2–3 | 500 | 64 / 33 / 3 | **91** / 9 / 0 |
| 1280x590 | touch | Hero | all | 1060 | 83 / 11 / 6 | **100** / 0 / 0 |
| 667x375 | touch | Hero | all | 1020 | 72 / 28 / 0 | **100** / 0 / 0 |
| 667x375 | touch | Hero | 4+ | 40 | 25 / 75 / 0 | **100** / 0 / 0 |

Trade-off: a desktop click on a minion that overlaps an enemy hero's body takes the hero (minion "other" 7% → 15%);
a click squarely on a minion clear of hero bodies still takes it. The 844x390 "other" left (10%) is two enemy heroes
overlapping on screen, where the nearer centre line wins.

Unit tests: `tests/unit/targeting-pick.test.ts` (head/tower hits, hero over minion overlap, minion still farmable,
hysteresis, touch pads, a random-clump teamfight metric, priority incl. Weakest hero and the lock, aim magnet).

## 9. Follow-ups

- Wild Rift's portrait **Priority display** (only enemies in reach, closest first) near the right thumb.
- Auto-hide the Last-hit / Tower buttons while an enemy hero is in reach.
- Killable-minion health bar glow on touch.
- Desktop hover check every 50 ms could run on pointer move only.
