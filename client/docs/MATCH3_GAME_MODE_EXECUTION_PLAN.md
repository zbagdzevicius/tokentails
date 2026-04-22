# Token Tails Match-3 Mode: Creation + Delivery Plan

## Goal
Ship a new in-game **Match-3** mode that is cat-themed, integrated into existing Token Tails game flow, tracked in backend progression, and polished for replayability.

## Product Design (Cat + Project Theme)
- Mode name: **PAW MATCH**
- Fantasy: collect catnip, hearts, paws, and elemental tokens to score fast combos.
- Session style: time attack with level targets.
- Level structure:
  - Level 1 `KITTEN STARTER`: 120s, target 280
  - Level 2 `PAW PRO`: 90s, target 360
  - Level 3 `SHELTER LEGEND`: 75s, target 460
- Core loop:
  - Swap adjacent tiles.
  - Match 3+ in row/column.
  - Cascades auto-resolve.
  - 4+ clears grant bonus time.
  - Special tiles: row clear, column clear, bomb, rainbow.
  - Juice pass: flashing clears, sparkle bursts, shake impacts, smooth tile motion.
  - No dead board: auto-reshuffle available and fallback auto-fix.

## In-Project Asset Sourcing (Used)
These are already integrated into Match-3 implementation:
- Tile icons:
  - `public/logo/catnip.webp`
  - `public/logo/heart.webp`
  - `public/logo/logo.webp`
  - `public/logo/paw.webp`
  - `public/ability/FIRE.png`
  - `public/ability/WATER.png`
  - `public/ability/NATURE.png`
- Backgrounds:
  - `public/backgrounds/bg-min-5.webp`
  - `public/backgrounds/bg-min-10.webp`
- UI accents:
  - `public/tail/cat-promo.webp`
  - `public/icons/close.webp`

## Itch.io Asset Candidates (For Future Visual Upgrade)
These were shortlisted to match the style and scope:
- **Kitty and Mushrooms - 32x32** (CC0)  
  Link: https://kaicreative.itch.io/kitty-and-mushrooms-32x32-cat-and-obstacles  
  Use case: cat sprites/obstacles/decor.
- **Match 3 - Magic Set** (Paid asset pack)  
  Link: https://nymphaart.itch.io/match-3-magic-set  
  Use case: polished gem/tile replacement set.
- **Match3 Bundle** (Paid bundle)  
  Link: https://devilsworkshop.itch.io/match3bundle  
  Use case: complete pieces/backgrounds/UI elements.
- **Match3 Template** (Free template)  
  Link: https://monixxy.itch.io/match3-template  
  Use case: reference for extra mechanics/juice ideas.

## Implementation Plan
- [x] Add `MATCH_3` game type in frontend model.
- [x] Build Match-3 module:
  - [x] level select
  - [x] board generation (no initial matches)
  - [x] swap validation
  - [x] cascade resolution
  - [x] smooth animated movement and cascades
  - [x] flashing clear effects
  - [x] sparkle particle effects
  - [x] special tiles and chained special hits
  - [x] scoring + combo bonus
  - [x] timer + extra seconds
  - [x] reshuffle system
  - [x] game finish event dispatch
- [x] Integrate mode into game router (`Game.tsx`).
- [x] Add mode to Game Select modal (`PAW MATCH`).
- [x] Extend shared visuals/audio handling for new game type.
- [x] Improve end-game modal score labeling for new type.
- [x] Add profile fields for Match-3 progress (`match3`, `match3Count`).
- [x] Extend backend save endpoint to support Match-3 levels and score cap.
- [x] Return Match-3 aggregates from backend and patch frontend profile update flow.

## Iteration Log (Polish)
### Iteration 1: Core Playable
- Implemented complete board logic and gameplay loop.
- Added target progress tracking and run-ending behavior.

### Iteration 2: Feel + Replayability
- Added combo messaging and bonus-time behavior.
- Added dead-board protection and manual reshuffle actions.
- Added level-based difficulty tuning.

### Iteration 3: Integration + Data
- Added full game-mode routing and menu selection entry.
- Wired backend profile persistence and per-level best tracking.
- Extended end-game labels/icons and global mode systems.

### Iteration 4: Juice + Impact
- Added animated tile movement using layout animation.
- Added flashing clear passes and sparkle particles on hits.
- Added special item generation:
  - 4-match => row/column clear
  - 5-match => rainbow
  - cross matches => bomb
- Added chained special-hit propagation and board shake feedback.

### Iteration 5: Phaser Refactor
- Replaced HTML board implementation with a Phaser scene.
- Added native swipe + drag detection inside Phaser input system.
- Kept combo/special/cascade logic while moving visuals and interactions fully into canvas.

### Iteration 6: Retention Hooks Pass
- Added FTUE guided first move (level 1) with persistent completion flag.
- Added idle hint pulses that suggest a high-value swap after inactivity.
- Added objective layer (`GOAL <tile> x/y`) and weighted progress bar.
- Added star milestones (1/2/3) with bonus-time rewards.
- Added fever mode (`x2 score`) for high-pressure endgame moments.
- Added one-time comeback mechanic (`LAST CHANCE +5s`) near-fail moments.
- Added special-swap detonations (including rainbow/rainbow and bomb hybrids).
- Added deterministic QA hooks: `window.render_game_to_text()` and `window.advanceTime(ms)`.

## Files Added
- `components/Match3/match3.config.ts`
- `components/Match3/Match3Levels.tsx`
- `components/Match3/config.tsx`
- `components/Match3/scenes/Match3Scene.ts`
- `components/Match3/Match3.tsx`

## Files Updated
- `models/game.ts`
- `components/game/Game.tsx`
- `components/shared/GameSelectModal.tsx`
- `components/shared/GameMusicPlayer.tsx`
- `components/shared/EndGameModal.tsx`
- `constants/hooks.ts`
- `context/GameContext.tsx`
- `models/profile.ts`
- `tokentails-be/src/game/game.schema.ts`
- `tokentails-be/src/user/user.schema.ts`
- `tokentails-be/src/user/user.controller.ts`

## Verification Results
- Frontend targeted lint (changed files): ✅
- Frontend type-check (`npx tsc --noEmit`): ✅
- Backend build (`npm run build` in `tokentails-be`): ✅
- Full frontend build notes:
  - Turbopack build failed in sandbox due port binding permissions.
  - Webpack build still blocked by existing `/box` prerender setup issue (`createAppKit` / `useAppKit` ordering).
  - Additional pre-existing wallet package resolution warnings appear in appkit/solana bundles and are unrelated to Match-3 scene changes.

## Done Criteria
- [x] New Match-3 mode is accessible in game selection.
- [x] Mode is fully playable with polished loop and difficulty tiers.
- [x] Scores persist through existing backend save flow with mode-specific progression.
- [x] Asset strategy documented for both internal and itch.io sources.
- [x] Verification commands executed and issues documented.
