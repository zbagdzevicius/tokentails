# Catnip Heist: Single-Player Launch Plan (v2)

v2 replaces the co-op-first plan. The launch is **single-player plus a Cat Yard hub** built on plain
REST reads. There is no realtime networking, no game server and no presence. Co-op is a later step
(section 12), and the game rules are built so that adding it is additive.

Estimates marked **(J)** are judgment. Items marked **(E)** are backed by repo evidence or sources.

## 1. Summary

**What ships:**
1. **Cat Yard.** A 3D yard where cats are shown as voxel figures that wander, sit and idle.
   - **My Cats:** the player's own collection.
   - **All Cats:** every real rescued shelter cat, fed by plain paged reads.
2. **Catnip Heist.** A single-player 3D stealth run. The player brings two of their own cats and
   swaps control between them to solve the puzzles.

Both run inside the existing client on web and, once static export is re-enabled, in the Capacitor apps.

**Why this order:**
- The Yard is the lowest-risk way to put the voxel cats in front of real users. It needs almost no
  backend work.
- Dropping co-op removes the Colyseus server, the hosting, the signing keys and the riskiest
  milestone.

**Headline (J):**
- About **4 to 6 weeks** of agent work end to end, with the Yard shippable at about week 2.
- About **6 hours** of human time.
- Agent compute from low hundreds of USD up to about $600, and **no new hosting**.

## 2. Scope

**In:**
- Cat Yard with My Cats and All Cats.
- One heist level (`heist-01`) with a tutorial room.
- Swapping between two cats.
- Saves through the existing endpoint, with the backend replaying each run to verify it.

**Out:**
- Realtime networking, chat, presence ("who's online") and co-op.
- More levels, element abilities, cosmetics and leaderboards.
- Capacitor builds, until static export is re-enabled.

## 3. Cat Yard (hub)

### My Cats
- **Data:** `GET /user/cats` already returns owned cats with blessing, avatar and shelter
  (`backend/src/user/user.controller.ts:584`) **(E)**. No backend change is needed.
- **Actions** all reuse existing endpoints:
  - tap a cat to open its card (story, shelter, tier, element);
  - **Feed** calls `PUT /cat/:id`;
  - **Make active** calls `GET /cat/:_id/activate`;
  - **Take on heist** picks the two cats for the run and stores them locally.
- After an action, the client refetches.

### All Cats
There is no public list endpoint today **(E)**. Adopting clones a cat per player (`docs/API.md`), so
a raw list of every cat document would repeat the same shelter cat many times.

The plan is one new read-only endpoint, `GET /cat/yard?cursor=&limit=` (Public):
- It groups cats by `blessing`, so each real shelter cat appears once.
- It returns a **field whitelist only**:
  - `blessingId`, `name`, `type`, `tier`, `spriteImg`, `catImg`;
  - `shelter { name, country }`;
  - `adopters`, a count.
- It never returns `owner`, `code`, `token`, `staked`, user ids or blessing creator data.
- Pagination is cursor-based, with `limit` ≤ 50, sorted by newest rescue first.
- It sends `Cache-Control: public, max-age=300`.
- It is an aggregation on `cats` and adds an index on `blessing` if one is missing. The index build
  is tested against a copy of the collection first.
- Blueprints and packed cats are excluded until the team decides (section 11).

It is a read. It does not touch `Game` or `User`, so the single score write path rule is unaffected.

### Rendering
- Instanced voxel cats with at most 60 on screen. More pages load as the camera pans.
- Cats beyond that budget show as billboards (the level-of-detail fallback).
- Idle behaviour is local and seeded per cat: wander, sit, groom and sleep. It is not synced to
  anyone.
- A "rescued" plaque sits over each shelter cat. The empty state is "No cats yet, adopt one" with a
  link to the store.

## 4. Heist: single-player core loop

**Premise.** Kibble Corp's dog-bot guards hoard a shelter's catnip and keep a cat in a crate. It
extends Pixel Rescue's `CatCrate`/`RescuedCat` flow and dogBot's SNIFFING patrol **(E)**. Being
caught sends the cat back to its checkpoint. Nobody dies.

**One run takes 3 to 5 minutes, in landscape:**
1. **Sneak.** Guards patrol routes, sniff and show vision cones.
2. **Swap.** You control two cats and press Swap to switch between them. The idle cat stays where
   you left it. The level's "co-op" gates are built around this:
   - one cat holds a lever while the other passes the door;
   - one cat meows to lure a guard while the other slips by.
3. **Loot.** Catnip coins are the score. A key opens the vault.
4. **Rescue.** Free the crated cat before the exit opens. It is named from `cats/metadata/`.
5. **Extract.** Both cats reach the portal.

**Players with one cat.** A loaner "shelter volunteer" cat fills the second slot, so nobody is
blocked by ownership. Owning a second cat is a reason to adopt, not a requirement.

**Onboarding.** The tutorial room in `heist-01` teaches move, sneak, swap and the lever one at a
time. Completion is stored the way Pixel Rescue stores it.

## 5. Art direction (unchanged from v1)

- **Voxel cat rig.** One parametric template of merged BoxGeometry.
  - The palette is sampled from the IDLE row of each cat's `spriteImg`.
  - Animation is procedural: legs, a spring tail and squash-stretch.
  - One code path covers the repo cats and every CDN cat. The Yard is its first real test.
- **Props and tiles.** A script voxel-extrudes the existing 32x32 sprites and tiles, with the
  palette locked at 64 colours or fewer.
- **Camera and lighting.** Isometric orthographic camera with toon lighting.
- **Fallback.** The existing sprites as billboards, switched in one module (`CatVisual`).
- **Generated 3D and AI audio.** Not in the launch. The licence rules from v1 still apply if they
  are added later.
- **Audio.** Existing SFX plus procedural WebAudio music.

## 6. Tech stack and architecture

| Layer | Choice |
|---|---|
| Render | Vanilla three ^0.183.2, already in `client/package.json` and unused **(E)** |
| Game rules | `heist-sim/`: pure TypeScript, integer grid, fixed 30 Hz tick, seeded RNG, no trig. **Multi-actor from day one** (two cats now, two players later). Builds to both CJS (for the NestJS 9 backend) and ESM (for the client). |
| Yard | Plain three scene in `client/components/CatYard/`, with no simulation |
| Tests | Jest (existing), Vitest in `heist-sim/`, Playwright (new) |

**Sharing `heist-sim/`.**
- `client/` and `backend/` depend on it with `"heist-sim": "file:../heist-sim"`.
- Add it to `transpilePackages` in `client/next.config.js`.
- CI checks that both consumers resolve the same content hash.
- `SIM_VERSION` is sent with every save. The backend rejects saves from a version it doesn't know.

**Client.**
- Both scenes load through `dynamic(..., { ssr: false })`.
- Any Phaser instance is destroyed first, so only one WebGL context is live.
- Handle context loss and dispose the renderer on unmount.
- Input comes from the keyboard, a gamepad or `Joystick.tsx`. The stick is rotated 45° to the iso
  axes. The Swap and Meow buttons use an adapter over `MobileButtons/`, which is Phaser-wired.
- Touch targets are at least 44 px, with safe-area insets.
- QA hooks (`getState()`, `step(n)`, `render_game_to_text()`) exist only in non-production builds.

### Save integrity: replay verification (single write path)
1. The client records a compact input log: run-length encoded, per tick, including swap events.
2. At extraction it posts
   `{ type: CATNIP_HEIST, level, points, time, simVersion, inputs }` to the existing
   `POST /user/catbassadors/live`.
3. Inside that handler, before the `Game` insert, the `CATNIP_HEIST` branch:
   - rejects input logs over 18,000 ticks (10 minutes) or over the byte limit;
   - replays the log with `heist-sim`;
   - **recomputes points and time itself** and ignores the client's numbers except as a mismatch
     signal;
   - clamps to the level cap;
   - stores `replayHash`. A unique index on `(user, replayHash)` blocks identical resubmits.
4. A 5-minute run is about 9,000 ticks of integer maths. Replay CPU is small, but it must be
   measured (gate in section 7).

What this does and doesn't stop:
- It stops forged scores.
- It doesn't stop a bot playing legitimately. The per-level caps and a daily cap (section 11)
  bound that.
- It is stronger than the other modes, which trust the client **(E)**.

**Deploy order.** The backend branch ships first, with replay required. The heist entry in
`GameSelectModal` stays behind a flag until then. The Yard can ship before any of this.

**Correction (2026-10-01, task 3b).** An earlier version said that until that deploy the backend
would accept an unknown game type at the 420 cap. That stopped being true when `/live` gained its
strict DTO: `@IsIn(...)` plus `forbidNonWhitelisted` reject any type outside the list with 400, and
the endless cap is now 500 (decision #57). A plain `CATNIP_HEIST` save without a replay is also 400.

**As implemented (task 3b, plan G2 layer 2 and F6).** The body is
`{ type: 'CATNIP_HEIST', replay: <InputLog>, platform?, outcome? }`; `points`, `level` and `time` from
the client are ignored or must match. The DTO checks seed 1, the current `SIM_VERSION`, two different
known cat ids, at most 18,000 ticks and run counts summing to `ticks`; `verifyRun` (the sim, vendored
into `backend/src/vendor/heist-sim/` by `catnip-heist/scripts/vendor-sim.mjs`) enforces the per-level
cap `min(4 x parTicks, 18000)`, a win, and no input after the winning tick. The row stores the server
score and a `replayDigest` (sha256 of the canonical log, crew excluded) with a GLOBAL unique partial
index, not `(user, replayHash)`: the same winning log saves once from any account (409
`HEIST_DUPLICATE`). Replays run through a bounded queue (429 with Retry-After when full) behind a
per-IP throttle, and `/live` has its own 64 KB body limit. Measured replay cost: p95 about 9 ms over
the 8 golden solutions, so no worker threads. Heist progress lives in `heistScore` and `heistStars`
on the user and never feeds catnip, caps, loot eligibility or lives (decisions #14, #17).

**The digest is replay dedupe, not anti-cheat (task 3b review).** It stops the same canonical log
saving twice, but a scripted run can add a few idle ticks and get a new digest that still wins. That
is acceptable while nothing ranks or rewards `heistScore`. Before any Heist leaderboard, reward or
share-card ranking reads it, gate it with `notGuestFilter()` (guests are free) and treat scores as
self-reported-but-replayable. Logs that fail verification are cached by digest (about 10k for 10
minutes, per process), so a losing log sent again costs no replay. A guest's `heistScore`,
`heistStars` and cleared flags are carried into the account on sign-in (`recomputeAfterGuestMerge`),
and a resent log whose row the caller already owns re-applies its score and stars before the 409.

### Repo integration checklist

Status (2026-10-02, landing and game alignment build): items 1 to 3, 5 and 9 are done, and item 8
for the docs (the root `CLAUDE.md` package table does not list `catnip-heist/` yet), in the
form described under "As implemented" above (`replayDigest` with a global unique index instead of
`(user, replayHash)`; caps in `shared/caps.ts`). Item 4 (the Yard) is not built. Items 6 and 7 are
**superseded**: the Heist is not embedded in the `/game` Phaser shell (plan G2 option B was
rejected). It runs on `/heist` as a static build inside an iframe with the `shared/heist-bridge.ts`
bridge, and saves go through `POST /user/catbassadors/live` with the replay
(`client/components/heist/`, `docs/GAMES.md`, alignment log 4b).

Outside this plan, the game also shipped a read-only "Sent to shelters" payouts modal (ShelterSplit
payouts read from public RPCs, the Pink Paw goal meter and give button, and a "Testnet proof" section
for the seven testnets). It never signs or holds keys. See "Shelter payouts" in `catnip-heist/README.md`.

1. **Enum.** Add `CATNIP_HEIST` to `backend/src/game/game.schema.ts`, `client/models/game.ts` and
   `docs/API.md`. Check the other copies listed in `docs/DEVELOPMENT.md`.
2. **Backend `game.schema.ts`.** Add heist level keys, per-level caps, `replayHash` and the
   `(user, replayHash)` unique partial index.
3. **Backend `user.controller.ts`.** Add the `gameMaxPoints` entry and the replay branch in `/live`.
4. **Backend `cat.controller.ts`.** Add `GET /cat/yard` with the whitelist projection. Register
   anything new in `AppModule`.
5. **Catnip accounting.** Heist catnip stays out of `catnipCount` until the economy decision. Both
   `catnip-accounting.ts` copies stay unchanged.
6. **(Superseded by the `/heist` host page.)** **Client events.** Widen `IGameLoadedEvent.scene` and extend `IGameStopEvent` in
   `client/components/Phaser/events.ts`.
7. **(Superseded by the `/heist` host page; saves use `saveMatchDetailed` in
   `components/heist/heistSaves.ts`.)** **Client wiring.** Update `Game.tsx`, `GameSelectModal.tsx` (flag), `EndGameModal.tsx`,
   `GameContext.tsx` and `api/user-api.ts` `saveMatch` (send `inputs` and `simVersion`). Add a Yard
   route or entry point.
8. **Docs.** Update `docs/GAMES.md`, `docs/API.md` (the `/cat/yard` endpoint and the `inputs` field),
   `docs/DEVELOPMENT.md` and the `CLAUDE.md` package table (`heist-sim/`).
9. **Checks.**
   - Backend: `npm run lint` and `npm run build`.
   - Client: `npx tsc --noEmit`, `npx eslint .` and `npm test`.
   - Vitest in `heist-sim/`.
10. **Inherited issues.** List them in the PRs and don't fix them silently:
    - client-trusted scores in other modes;
    - unknown game types accepted;
    - no rate limit on `/live`;
    - CORS `*` fallback;
    - static export disabled;
    - in-process caches that diverge across replicas;
    - public `GET /cat/:id` returns `owner` and an unfiltered blessing. The new endpoint must not
      copy that.

    Status (2026-10-02): unknown game types are rejected by the strict `/live` DTO, `/live` has
    per-player and per-IP limits plus the replay bucket and queue, and the static export exists for
    app builds. Client-trusted scores in the other modes, the CORS fallback, the diverging caches and
    the public `GET /cat/:id` owner remain known issues (BACKEND.md).

## 7. Autonomous agent pipeline

Each stage is a PR that merges only when its gates are green.
- **Protected files.** Gate files, budgets and golden images are protected by CODEOWNERS.
- **Flaky gates.** A gate that passes only on re-run is quarantined, not counted as green.
- **Retries.** Three real failures send the ticket to the human queue.
- **Spend.** There is a spend cap per milestone.
- **Rollback.** A merged PR that later breaks main is auto-reverted.

| Stage | Output | Machine gate | Fallback |
|---|---|---|---|
| 0 Spec | `SPEC.md`, `heist-spec.json` | Schema valid. Caps ≤ `gameMaxPoints.CATNIP_HEIST`. The enum-copy checker is green. | Human edits |
| 1 Asset | Voxel rig, props, tiles | Palette-only vertex colours. Triangle budget. Turntable golden diff. **A sample of 200 CDN cats converts** with no error. | Billboards |
| 2 Yard | `CatYard/`, `/cat/yard` | Whitelist test: the response has no `owner`, `code`, `token` or user ids. Pagination test. 60 cats at ≤150 draw calls. Not blank or uniform, and motion is present. 10 mount cycles with no leak. | Billboards beyond 20 cats |
| 3 Sim | `heist-sim/` | Unit tests. **The replay hash is equal in Node, Chromium and WebKit.** | Simplify mechanics |
| 4 Level | `heist-01.json` | The grid solver proves it is **solvable with the swap and unsolvable without it**. Catnip ≤ cap. Par time 3 to 5 minutes. | Human-authored level |
| 5 Engine | Heist scene, HUD, input | `getState()` assertions. A bot completes the level headlessly. Context-loss test. | Human fix |
| 6 Save | Backend branch, client save | Valid replay saves exactly one `Game` row. Tampered points, an oversized log, an unknown `simVersion` and a duplicate `replayHash` are all rejected. Other game types unaffected. p95 replay CPU ≤ 50 ms (J). | Human queue |
| 7 Perf | Budget report | Real GPU, not SwiftShader. p95 frame ≤ 33 ms on the reference mid-range Android WebView. Chunk ≤ 1.5 MB gzip. (Budgets are J.) | Cut content |
| 8 Vision critic | Tickets | Advisory only, never blocks | n/a |

Logic jobs run headless under SwiftShader. Perf and visual jobs use a real GPU. Mobile browsers and the
Capacitor WebViews (iOS WKWebView, Android WebView) get a human spot-check.

## 8. Milestones

| # | Scope | Exit criteria |
|---|---|---|
| **M0 Spike, about 1 week** | Voxel cat from one sprite, QA hooks, gates 1 and 7 in CI | Loads on web and in mobile browsers. CDN `spriteImg` can be sampled with `crossOrigin` in desktop and mobile browsers. **Human art sign-off**, or switch to billboards. |
| **M1 Yard: My Cats, about 1 week** | Yard scene with the existing endpoint and actions | Gate 2 (client part) green. **Shippable on its own behind a flag.** |
| **M2 Yard: All Cats, under 1 week** | `/cat/yard`, paging, level-of-detail | Gate 2 fully green, including the whitelist test. Human privacy check of the response. |
| **M3 Heist solo slice, about 2 weeks** | `heist-01` with the swap mechanic, tutorial, loaner cat, no save | Gates 3 to 5 green. **Human fun check.** |
| **M4 Saves, about 1 week** | Replay branch, index, client save, flag | Gate 6 green. The backend is deployed before the flag. Human security review. |
| **M5 Soft launch, under 1 week** | Flag on for a cohort, telemetry | 20 or more external runs. Crash-free rate ≥ 98%. Human release approval. |

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The voxel cats look off-brand | The M0 art gate. The Yard shows the look to real users before the heist exists. |
| Some CDN sprites don't voxelize well | The 200-cat conversion gate, with a per-cat billboard fallback |
| The All Cats list leaks personal data | Whitelist projection plus a response-shape test plus a human check at M2 |
| All Cats is slow at scale | Grouped aggregation, `blessing` index, cursor paging, HTTP caching |
| Replay drift between client and server | Integer grid, no trig, a hash oracle across Node, Chromium and WebKit, and `simVersion` pinning |
| Replay CPU spikes on `/live` | Tick and byte caps, and the p95 CPU gate. Move the replay to a queue if the gate fails. |
| Swapping feels like a chore | Tutorial pacing, a human fun check, and at most 3 swap gates per level |
| The game is correct but dull | Arcade scope. Agents tune only exposed parameters. A human playtest at M3. |

## 10. Human touchpoints (about 6 hours)

1. Spec and economy approval (section 11): 1 hour.
2. Art sign-off at M0: 30 minutes.
3. Privacy check of the `/cat/yard` response at M2: 30 minutes.
4. Fun check at M3: 1 hour.
5. Security review of the replay branch at M4: 1.5 hours.
6. Provisioning a reference Android phone or a device farm, and CDN read access: 30 minutes.
7. Mobile browser and phone spot-checks: 2 x 20 minutes.
8. Release approval at M5: 20 minutes.

## 11. Open decisions for the team

1. **What "All Cats" includes.** The default is real shelter cats, one per blessing. Should
   blueprints or store cats show too? Should players' names appear as adopters? The default is no:
   a count only.
2. **Economy.**
   - The per-level caps.
   - Whether heist catnip counts toward `catnipCount`, which would change `totalCatnipCap` in every
     copy.
   - A daily cap.
   - Whether loaner-cat runs earn catnip.
3. **Lives.** Does a heist run use lives (`/catbassadors/lives/redeem`)?
4. **Guests.** Can a guest browse the Yard without logging in? All Cats is public, so it's
   possible.
5. **Telemetry.** Which vendor and event schema. Telemetry must never write scores.
6. **Accessibility.** Colour-blind-safe cones, reduced motion, and hold versus toggle for the lever.

## 12. Later: co-op

The v1 research still applies (Colyseus 0.17, a signed per-player result).
- Because `heist-sim` is multi-actor, co-op means giving the second cat to a second player.
- The swap levels become co-op levels with no redesign.
- The replay path can stay for solo runs. Co-op runs would use the server-signed result from v1.
- Gate co-op on M5 data: runs per user, completion rate and the share of players with two or more
  cats.

## 13. Sources

- Repo **(E)**:
  - `backend/src/user/user.controller.ts` (`GET /user/cats` at line 584, `/live`)
  - `backend/src/cat/cat.controller.ts` (`GET /cat/:id` projection at line 223)
  - `backend/src/cat/cat.schema.ts`
  - `backend/src/game/game.schema.ts`
  - `client/components/Phaser/events.ts`
  - `docs/API.md`, `docs/GAMES.md`, `docs/DEVELOPMENT.md`, `docs/CLIENT.md`
- External, carried over from v1:
  - TRELLIS.2: https://github.com/microsoft/TRELLIS.2
  - Hunyuan3D licence: https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE
  - Tripo pricing: https://developers.tripo3d.ai/en/pricing
  - SwiftShader removal: https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM
  - VideoGameQA-Bench: https://arxiv.org/abs/2505.15952
  - Colyseus 0.17: https://colyseus.io/blog/colyseus-017-is-here/
