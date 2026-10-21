# Moon Rave (`cat-rave/`): every $1 raised for the shelter is one dancing cat

Status: spec + scaffold (Oct 16, 2026). `npx tsc --noEmit` and `npx vitest run` pass. Six lanes build in
parallel from here (see "Module ownership").

## 1. Concept

A living 3D environment after the "no sleep, just grind" kitten-rave meme: night, a huge glowing green
full moon on the horizon, a ginger DJ kitten in big headphones at a glowing green booth, a glossy green
reflective dance floor, green and violet lasers through haze, and a crowd of fluffy cream kittens on
their hind legs with front paws raised and hot-pink glowing paw pads. At the drop the DJ raises a sword
and pink bows rain down.

The rule: **every US dollar paid out on-chain to the Pink Paw shelter is one cat on the dance floor.**
The crowd is the fundraiser. It is an environment first (ambient, watchable, loops forever), and
interactive second (tap, hold, find your cat, add a cat).

Nothing from the meme ships: no frames, no song, no likeness. Every asset is procedural geometry and
shaders; the Moon Rave tune is synthesized in WebAudio. The second track (Back on Track, a mix by
ModeGospel) is licensed by the founder and streamed (8.1).

**The hook today is the empty floor.** The real total is about $9.97, so the floor has 9 cats, the
next one is 97% formed, and the rest of the floor is empty. The copy says so: "9 cats are dancing.
Fill the dance floor." With a lonely DJ and a handful of cats, every new dollar is visible.

## 2. Real data (checked Oct 16, 2026 15:30 UTC)

### Source of truth: the public payout index

`GET https://api.tokentails.com/shelter/payouts?network=mainnet&limit=2000`

- Public, no account. `Access-Control-Allow-Origin: *` (checked with a foreign Origin), so it works from
  tokentails.com, localhost:5180 and any embed.
- `Cache-Control: public, max-age=30, stale-while-revalidate=60`; the server also caches each answer for
  30 s, and the index job runs every 2 min (`*/2 * * * *`). Throttle 60 requests per minute per IP.
- What it counts: every ShelterSplit `Disbursed` and `NativeDisbursed` event on every mainnet split in
  `backend/src/shelter/onchain/wallet.config.ts`. That covers treats, wallet gifts, sponsor matches,
  partner campaigns and the **$5 shelter-cat purchase shares**: the share keeper pays them through
  `ShelterSplit.disburse` with memo `tt:cat:…`
  (`backend/src/payments/crypto/crypto-shelter-share.service.ts`). No separate fiat or Stripe feed is
  needed or publicly exposed.
- Shape (`PublicPayouts`, `backend/src/shelter/onchain/payout-index.service.ts`, docs/API.md):
  `{ network, generatedAt, source: 'index', contracts: [{chainId, contract, symbol, decimals,
  nativeSymbol, nativeDecimals, fromBlock, head, indexedThrough: {block, time, at}, lastRunFailed,
  count, totals: [{symbol, kind, amount, decimals, amount18, count}]}], chains: [{chainId,
  indexedThrough}], totals: [{symbol, amount18, count}], count, events: [{chainId, contract, txHash,
  logIndex, blockNumber, timestamp, shelter, kind, amount, decimals, symbol, amount18, memo, memoRaw}],
  nextCursor }`. Events are newest first; page with `cursor=nextCursor` until it is null. `amount18`
  is an integer string at 18 decimals for every chain. Errors: 409 `PAYOUTS_NOT_INDEXED`, 424
  `PAYOUTS_INDEX_UNAVAILABLE`, never 503.

Bundled snapshot (`src/data/snapshot.json`), as of 2026-10-16T15:41:35.825Z: 129 payouts on 7 chains.

| Symbol | Amount | Payouts |
|---|---|---|
| USDC (Arc native + token, Base, Arbitrum, Avalanche, Monad) | 9.71 | 125 |
| USDC.e (Tempo) | 0.20 | 2 |
| USDG (Robinhood Chain) | 0.10 | 1 |
| EURC (Arc) | 0.10 | 1 |
| **Total (EURC at 1:1)** | **$10.11** | **129** |

**10 cats, 11% of cat #11.** Cat #1 was completed Oct 9 by a $0.01 treat on Arc (19 payouts); cats
#3–#7 came from one $5.00 wallet gift on Arc (tx 0x92110dd4c5…, Oct 16 13:44 UTC); cat #10 by a $0.03
partner payout (0xf660ad2176…, Oct 16 15:37 UTC). Payouts span Oct 7 – Oct 16.

### Conversion

- USDC, USDC.e, USDG (and pathUSD on testnets): 1:1 USD.
- EURC: **1.00 USD, fixed** (`EURC_USD` in `src/config.ts`). EUR trades above USD, so this undercounts
  and never inflates. The backend's own FX is also `fixed` at 1 (`GET /payments/crypto/config` →
  `fx.EURC = {perUsd: "1", asOf: null, source: "fixed"}`), and that route is not CORS-open anyway.
- Gas coins and unknown tokens are not counted. Only the 7 mainnet chains in `CHAINS` are counted;
  testnets never are.
- All money math is integer micro-USD (`amount18 / 1e12`, truncated); summing is exact.

### Fallback

`src/data/snapshot.json`: the full mainnet index, written by `npm run snapshot` (scripts/snapshot.mjs),
with `asOf` (currently 2026-10-16T15:41:35.825Z: 129 events, $10.11, 10 cats) and the memo reduced to a source label (raw memos such as
`motored:user-51` are never bundled or shown). The page renders from it instantly, then swaps to live.
The HUD shows "as of <date>" when it is serving the snapshot.

### Other endpoints considered (not used for the count)

| Endpoint | Why not |
|---|---|
| `GET /shelter/goal/C-001` | Counts USDC Transfer inflows to the campaign wallets, not split payouts, and excludes EURC; read Oct 16 it said `raised: "9.57"` with Base, Avalanche and Monad not scanned. CORS only for the allow-listed origins (no `*`) |
| `GET /impact` | Hourly snapshot; CORS only for allow-listed origins; `money.bySymbol` lagged the index (9.2 USDC at 15:05) |
| CDN mirror `…digitaloceanspaces.com/impact/impact.json` | 403 on Oct 16 |
| `client/public/shelter-payouts/deployments.json` | Split addresses, deploy and proof tx only, no amounts. Useful for the "on-chain proof" links |
| `GET /shelter/donate/status` | Treat rail state (`treatsLeftToday`, per chain). Used for the free-treat button, not the count |

### Naming each cat by its payout

Each cat links to the payout whose running total crossed its dollar: chain, amount, date, source label,
and the explorer link `${explorer}/tx/${txHash}`:

| Chain | id | Explorer |
|---|---|---|
| Arc | 5042 | https://explorer.arc.io |
| Base | 8453 | https://basescan.org |
| Arbitrum One | 42161 | https://arbiscan.io |
| Avalanche C-Chain | 43114 | https://subnets.avax.network/c-chain |
| Tempo | 4217 | https://explore.tempo.xyz |
| Robinhood Chain | 4663 | https://robinhoodchain.blockscout.com |
| Monad | 143 | https://monadvision.com |

Source labels from the memo: `tt:page`/`tt:treat` treat, `tt:heist` Catnip Heist treat, `tt:wallet`
wallet gift, `tt:cat` shelter-cat adoption share, `tt:match` sponsor match, `tt:paws` paw settlement,
`motored:` partner campaign, "first payout" proof payout, else gift.

## 3. The count rule

1. Normalize, dedupe by `chainId:txHash:logIndex`, sort oldest first by (timestamp, chainId, logIndex).
2. Running total in micro-USD. Each time it crosses a whole dollar, that payout completes a cat:
   `RaveCat { index, payout, contributors, completedAt, seed }`. One $5 gift completes five cats with the
   same tx; a dollar of $0.01 treats has ~100 contributors.
3. Cats shown = `floor(total USD)`. The remainder is the **progress paw**: `progressToNext` (0..1) and
   `microToNext`. On the floor the next cat stands half-formed (a translucent hologram filling bottom-up
   to that percentage) in the next free slot.
4. Never fabricate. The count only comes from data. `?cats=N` is a DEMO override: real cats keep their
   payouts, extra cats have `payout: null` and `demo: true`, and the HUD shows a permanent DEMO banner.
   The real total and the CTA stay real.
5. Above the quality ceiling (`QUALITY[q].maxCats`) the HUD says "+N more dancing off-screen"; the count
   text always uses the real number.

Implemented and tested in `src/data/index.ts` `buildSnapshot` (`src/data/count.test.ts`).

## 4. Add a cat (existing, live paths)

| Path | What happens | URL |
|---|---|---|
| Free treat (primary CTA) | Token Tails' hot wallet pays $0.01 to the split; one per visitor per UTC day across chains; no sign-in. 100 treats = 1 cat. Called in-page: `POST {api}/shelter/donate/guest` body `{"source":"page"}` (only `heist`/`page` are accepted); answers `{txHash, chainId, amountWei, explorerUrl, coin?}`, 429 `DONATE_ALREADY_TODAY`, 409 `DONATE_PAUSED`/`DONATE_BUDGET_SPENT`. Works only from an allow-listed origin (tokentails.com); elsewhere the button links to the give page. Read `GET {api}/shelter/donate/status` first and hide it when `railState !== 'live'` | `https://api.tokentails.com/shelter/donate/guest` |
| Give with a wallet | Gasless USDC/EURC gift through the DonateRouter, or native USDC on Arc; also has the free treat | https://tokentails.com/shelter-payouts/give |
| Adopt a shelter cat | $5 Pink Paw cat; 50% goes to the shelter as an on-chain payout (`tt:cat`) | https://tokentails.com/cats |
| See every payout | Proof page, each payout with its explorer link | https://tokentails.com/shelter-payouts |
| Embeddable widget | `client/public/rail/widget.js` (shelter-rail, `data-index="https://api.tokentails.com"`) | https://tokentails.com/rail/widget.js |

After a treat succeeds: show the tx link at once, call `feed.refresh()` after 30 s and again at 2.5 min
(the index runs every 2 min), and move the progress paw optimistically by $0.01 with an "on its way"
label until the index confirms.

Copy rule: say "free treat (Token Tails pays $0.01)" so nobody thinks they paid. Never call the
shelter's wallet "Pink Paw's own" in copy (custody is disclosed on /shelter-payouts).

## 5. Experience

### Scene (reference stills: scratchpad `meme/sheet1-3.jpg`)

- Night sky, faint stars, dense green fog at the horizon.
- The moon: huge (radius 70 at z = −260), low on the horizon behind the booth, green-white with soft
  craters (procedural noise), a wide bloom halo.
- Floor: glossy dark green, reflective (planar mirror on high, a fake reflection term plus caustic
  ripples on mid/low), glowing where cats stand; a bright green glow ring around the booth.
- Booth: a green-lit translucent box table (2.4 × 1.1 × 1.2) with a dark top; the decks sit on top.
- Lasers: green and violet beams from rigs left and right of the moon, sweeping, fanning and strobing
  with the music; spotlight cones through the haze; volumetric look via additive cones plus haze sheets.
- DJ: ginger/cream fluffy kitten, 1.35× crowd scale, big black headphones, nods on the kick, scratches
  on the offbeat, hand on the fader in builds; at every drop raises a sword overhead (2 bars) while pink
  bows rain down.
- Crowd: cream kittens on hind legs, both front paws raised, glowing hot-pink pads; they bounce on the
  kick, sway on the bar, crouch and shake in the build, jump at the drop. Each cat varies by its seed
  (fur shade cream to light ginger, ear tilt, height ±6%, dance phase).

### States

| Cats | Feel |
|---|---|
| 0 | The DJ plays to an empty floor; ghost paw-prints mark the first slots; HUD: "The floor is empty. Add the first cat." |
| 1–30 (today: 9) | Cats close to the booth, front first; ghost markers on the next ~12 slots; camera framed tighter so the floor looks intimate, not empty |
| 30–2,000 | Crowd fills out; top shot starts to show the vortex |
| 2,000+ | Sea of cats to the horizon (impostors far out) |

### Cameras (L-UI `Director`)

| Shot | Description |
|---|---|
| `hero` | Front, low, behind the crowd looking at the booth with the moon behind the DJ (the reference's main shot); raised paws in the foreground |
| `top` | Straight down from above; the crowd swirls in a slow vortex around the booth (`crowd.setFormation('vortex')`) |
| `pov` | Inside the crowd at cat height; two big raised paws in frame bottom (dedicated foreground paws, camera-attached), bobbing on the beat |
| `dj` | Close on the DJ and decks, slight handheld wobble |
| `orbit` | Slow 360° around the booth at mid height |
| `sweep` | Low dolly across the floor through the laser beams |

Auto-director: cuts on bar boundaries; holds 4–8 bars per shot; `top` and `hero` on drops; `pov` in
builds; framing scales with `crowd.extentRadius` so 9 cats fill the frame. Any drag pauses auto for 12 s,
then it eases back. `?shot=` locks the opening shot.

### Interactions

| Input | Effect |
|---|---|
| Tap / click on the floor | Crowd hops (wave out from the tap point), paw glow pulse, a hat hit in the music |
| Hold (≥ 350 ms) | Build-up: riser + snare roll, crowd crouches and shakes, lasers fan; up to 8 bars |
| Release after a hold, or double tap | Drop on the next downbeat: DJ sword raise, pink bow confetti, crowd jump, strobe |
| Drag | Orbit (pauses auto-director); pinch / wheel to dolly |
| Hover (desktop) / tap a cat | Cat card: "Cat #12 · $0.10 USDC on Arc · Oct 16, 2026 · wallet gift · View tx ↗", plus "made of 47 payouts" when a dollar had many |
| Find my cat | Paste a tx hash or #N; the camera flies to the cat, it gets a highlight ring and a spotlight. A tx that made several cats highlights all of them. `?cat=` / `?tx=` do this at boot |
| Keyboard | Space hold = build, Enter = drop, 1–6 = shots, A = auto, M = mute, F = find |

Tap vs. hold vs. drag: movement over 8 px makes it a drag; double tap within 300 ms is a drop.

### Live updates

Poll every 60 s (`POLL_MS`; back off ×2 to 5 min after failures; pause while the tab is hidden; refresh
on `visibilitychange`). The first live read takes every page; each poll after that reads only the
newest pages until it meets an event it already has and merges (deduped by chainId:tx:logIndex), with
one full re-read if the merged count disagrees with the index's `count`. When a new payout crosses a
dollar: the camera cuts to a landing shot, the new cats drop in from the sky (`dropIn`, 1.5 s, squash
on landing) and glow for ~10 s, the counter bounces with "+N", the DJ points at it, the HUD shouts "Cat #10 just landed! Thanks to a wallet
gift on Arc", and the music queues a drop. New payouts that don't complete a dollar just fill the
progress paw with a sparkle.

## 6. Performance and scale

Targets: 10,000 cats at 60 fps on desktop, 30 fps on a mid-range phone (Pixel 6a / iPhone 12 class) in
portrait, at the quality tiers in `QUALITY` (`src/config.ts`).

- Crowd = one `InstancedMesh` for near cats (≤ ~400 triangles, body + head + ears + arms + tail in one
  merged low-poly geometry with a per-vertex part id) and one `InstancedMesh` of camera-facing impostor
  quads (a procedural cat silhouette in the fragment shader with pink pad dots) for far cats.
  `nearCats` per tier picks the N closest to the camera each ~250 ms (sorted slot buckets, not per frame).
- Dance animation entirely in the vertex shader: uniforms `uBeat, uKick, uEnergy, uJump, uTime,
  uSection`; per-instance attributes `aSlot (vec3), aSeed, aDrop (drop-in start time), aHighlight`.
  No per-frame matrix uploads except for drop-ins and highlights.
- Vortex: cats re-form on an even golden-angle spiral (inner radius 2.4 m) and rotate in the shader
  (angular speed falls off with radius), which shears the spiral into arms.
- Picking: CPU ray against slot cylinders using a uniform grid; no GPU readback.
- One draw call each for floor, moon, lasers (instanced), haze, booth, confetti (instanced bows).
- Bloom via `postprocessing` (`EffectComposer` + `BloomEffect` with mipmap blur); off on `low`.
- DPR capped per tier; a frame-time governor steps the tier down after 3 s over budget and never back
  up in the same session. `antialias: false` (bloom hides edges); `powerPreference: 'high-performance'`.
- Above `maxCats`: show `maxCats` cats and "+N more".
- No textures shipped beyond tiny generated ones (moon noise, bow sprite) created at runtime.

## 7. HUD (L-UI)

Portrait first, 16 px side gutters plus safe areas, no horizontal scroll, large tap targets (≥ 44 px).

- Top: the counter **"$10.11 raised = 10 cats dancing"**, a source line "live · public on-chain payouts"
  (or "as of Oct 16, 15:41 UTC" on the snapshot, "live · Base, Avalanche delayed" naming the lagging
  chains when stale), and the DEMO banner when `?cats=` is set (the headline then reads "N cats (demo)"
  with the real total in small text).
- Next-cat progress paw: a paw icon filling to 11% with "89¢ to cat #11".
- Primary CTA "Add a cat": opens a small sheet with the three paths (free treat in-page, give with a
  wallet, adopt a $5 shelter cat) and the "every payout ↗" link.
- Secondary: find my cat, share, mute, shot picker (top right, icon buttons).
- Cat card (hover or tap), DJ shout-out toasts, a one-time hint "tap to hop · hold to build · double tap
  to drop".
- `?embed=1` hides the CTA sheet and secondary buttons, keeps the counter.
- Accessibility: `aria-live` counter, buttons labelled, `prefers-reduced-motion` turns off strobe and
  camera shake and slows lasers, and the flash never exceeds 3 per second.

## 8. Audio (L-AUDIO)

The Moon Rave tune is synthesized with WebAudio, scheduled ahead with a look-ahead scheduler on `AudioContext.currentTime`.
136 BPM (`BPM`), 4/4. Driving rave/hardstyle-ish loop:

- Kick: sine pitch-drop with a distorted click (hardstyle-ish tail via waveshaper in the drop).
- Offbeat bass: saw through a resonant lowpass, sidechain-ducked by the kick.
- Hats: filtered noise on offbeats; claps on 2 and 4.
- Lead: detuned supersaw stab pattern (original melody, minor key) in the drop; a pad in the breakdown.
- Build: snare roll that doubles each bar, white-noise riser, lowpass sweep up, kick drops out the last
  bar; then the drop.
- Arrangement loop (`ARRANGEMENT`): intro 4, groove 12, build 8, drop 16, breakdown 8 bars (~85 s).
- Master: compressor + limiter, −14 LUFS-ish; mute toggle; audio unlocks on the first tap (any gesture),
  `?mute=1` starts muted; resume on visibility.
- `BeatClock` drives every visual: before unlock (or muted) it runs on the performance clock with the
  same arrangement, so the scene always dances. Events: `beat`, `bar`, `section`, `build`, `drop`.
- Low-end phones: cap polyphony, no convolver reverb (short feedback delay instead).

### 8.1 Second track (Back on Track)

- Source: "Back on Track (mix) by ModeGospel", 62.4 min, licensed by the founder. It is the only
  audio file in the package; the Moon Rave tune stays synthesized and is the default.
- Files: `client/public/music/back-on-track-v1/` (`bot-v1-000.m4a` … `bot-v1-124.m4a`, 30 s AAC-LC
  128 kbps segments cut on sample boundaries with 4096 samples of padding each side, plus
  `bot-v1-manifest.json` and `bot-v1-beatmap.json`). Versioned names, so the CDN sync gives them
  immutable cache headers. Manifest and beat map load same-origin first (CDN fallback); segments try
  the CDN first (same-origin on localhost, and after the first failure). `?mixBase=` overrides both.
  Regenerate with `npm run track:split -- --src <mp3>` and `npm run track:check -- --src <mp3>`.
- Player (`audio/mix.ts`): each segment is an `AudioBufferSourceNode` started at an absolute time
  (anchor + segment start, explicit offset and duration), hard seams, the next segment scheduled 8 s
  ahead, at most 3 decoded buffers (released when the synth is back). A late segment starts part way
  in (sync wins). Each fetch attempt times out after 8 s (then the other base); a segment still
  missing 10 s after it was due hands back to the synth. The mix loops.
- Tempo: the audio is never time-stretched. The visuals follow the mix's own beat map (~145 BPM,
  drifting): `MixTempo` maps track seconds to beats, `MixPlan` gives sections (intro, breakdown,
  build, drop, groove), kick spans and energy. The beatless 0–30 s intro shows no kick, hat or flash.
  While the mix is audible the audio is master: the clock re-bases when they disagree by > 30 ms.
  Above 0.5 s (an interrupted or stalled context) the virtual playhead wins and the audio re-seeks,
  the same as after a mute, a hidden tab or an iOS interruption.
- Switching (track button with an LED, or `T`): the swap lands on the next bar line, and the mix is
  entered at its first downbeat (0.76 s, inside the beatless intro), so the swap bar is mix bar 0;
  `beat` and `bar` never run backwards. The loop wrap after ~62 min is not on a bar line (the beat
  jumps forward once). The swap back waits for a bar far enough ahead to cover output latency. A
  second toggle while a swap is armed undoes it. Event `track`. A failed load keeps the synth (toast,
  and a stored mix choice goes back to the synth); a segment that fails mid-play hands back to the
  synth (toast).
- In the mix, hold, double tap and a new cat give visual-only builds and drops (8 bars, cut short by
  the mix's own next build or drop, which always fires on its bar); the audio plays on. Above 140 BPM the strobe runs on quarter notes, so it never flashes faster than the synth.
- Lights: Green (Moon Rave) ↔ Red (Back on Track) cross-fades the whole stage key light (sky, fog,
  moon, floor, booth, lasers, spots, flashes, crowd, DJ, POV paws, ad boards) and the HUD accent (with
  the ad and checkout sheets, the Stripe form when it mounts, and "Save picture") in 0.6 s, when
  the mix starts. Violet and pink stay. `world/theme.ts` holds both themes; uniforms only.
- Credit: "Now playing: Back on Track (mix) by ModeGospel" while the mix plays.
- `?track=synth|mix` picks the start track (else the viewer's stored choice, else the synth).
  `?og=1` and `?embed=1` always play the synth, never fetch the mix and show no button.

## 9. Share and meta

- Share button: Web Share API where available (title, text "9 cats are dancing for Pink Paw. Add one:",
  URL), else copy the link. The link carries `?cat=N` when a cat is focused.
- "Save picture": `world.capture()` → PNG of the next frame with the counter burned in (2D canvas
  overlay), downloaded or shared as a file.
- OG/Twitter tags in `index.html`; `public/og.jpg` (1200×630, JPEG ~120 KB) rendered from the scene by L-UI with a
  script (hero shot plus the counter), never a meme frame.

## 10. URL parameters

| Param | Effect |
|---|---|
| `?cats=N` | DEMO count override (0–100000), DEMO banner always visible |
| `?shot=hero\|top\|pov\|dj\|orbit\|sweep` | Opening shot |
| `?mute=1` | Start muted |
| `?track=synth\|mix` | Start track (Moon Rave synth or the Back on Track mix) |
| `?mixBase=https://…/` | Base URL for the mix manifest, beat map and segments |
| `?cat=12` / `?cat=%2312` / `?tx=0x…` | Find this cat at boot |
| `?quality=low\|mid\|high` | Force a tier |
| `?auto=0` | Auto-director off |
| `?embed=1` | Minimal chrome for iframes |
| `?debug=1` | FPS, draw calls, tier, beat info |
| `?api=https://…` | API base override, ignored on tokentails.com |

## 11. Package, build, deploy

- `cat-rave/`: three 0.183.2, postprocessing 6.39.5, Vite 8, TypeScript 7, Vitest 5 (same conventions as
  `catnip-heist/`). `npm run dev` on port 5180 (`127.0.0.1`).
- Checks: `npx tsc --noEmit`, `npx vitest run`.
- `npm run build:client` builds into `client/public/cat-rave` with `RAVE_BASE=/cat-rave/` and
  `RAVE_API_URL=https://api.tokentails.com` (commit the output, as with the Heist). Do not run it until
  the lanes land.
- Public URL after deploy: `https://tokentails.com/cat-rave/index.html`. A pretty `/cat-rave` needs a
  redirect in `client/next.config.js` (like `heistRedirects`) or a host page: client work, outside this
  package, not done.

## 12. Module ownership (6 parallel lanes)

Each lane edits only its own folder. `src/types.ts` and `src/config.ts` are shared and frozen; ask the
spec owner for a change. The stubs already export the final factory signatures.

| Lane | Owns | Factory | Implements |
|---|---|---|---|
| L-WORLD | `src/world/**` | `createWorld(canvas, profile): WorldApi` | Renderer, scene, sky, fog, moon, reflective floor, booth table, lasers, spotlights, haze, bloom (`postprocessing`), `flash`, `setLaserMode`, `setSpotTarget`, `capture`, resize |
| L-CROWD | `src/crowd/**` | `createCrowd(world, profile): CrowdApi` | Instanced cat model (near + impostor), dance vertex shader, slots (booth out, front first, stable), vortex, jump, paw pulse, drop-in, next-cat hologram + ghost markers, picking, highlight |
| L-DJ | `src/dj/**` | `createDj(world, clock, profile): DjApi` | DJ kitten, headphones, decks and mixer on the booth top, beat-synced moves, sword raise (subscribes to `clock.on('drop')` itself or via main), bow confetti (instanced), `pointAt` |
| L-AUDIO | `src/audio/**` | `createBeatClock({muted, track?}): RaveClock` (`setTrack`) | Synth + scheduler, arrangement, build/drop control, mute/unlock, beat events, performance-clock fallback |
| L-DATA | `src/data/**`, `scripts/snapshot.mjs` | `createPayoutFeed({api, demoCats}): PayoutFeed` | Live fetch with paging, normalize (`buildSnapshot` exists), staleness (`indexedThrough.time` older than 15 min), polling + backoff + visibility, diff → `newCats`, `findCat` / `catsForTx`, treat call helper `sendTreat(api)` + `treatStatus(api)`, tests |
| L-UI | `src/main.ts`, `src/ui/**`, `index.html`, `public/**` | `createDirector`, `createHud`, `parseParams` | Camera director + controls, input (tap/hold/double tap/drag/keys), HUD, CTA sheet, cat card, find my cat, share + capture, quality pick + governor, OG image, reduced motion, wiring |

### Wiring (main.ts, already sketched)

1. `parseParams` → quality tier → `createWorld` → `createBeatClock` → `createCrowd` → `createDj` →
   `createDirector` → `createHud` → `createPayoutFeed`.
2. `clock.on('drop')` → `dj.raiseSword()`, `dj.confetti()`, `crowd.jump(1)`, `world.flash('pink')`.
3. `feed.load()` → `crowd.setCats(catList.slice(0, capacity))`, `crowd.setNextCat(progress)`,
   `hud.setSnapshot`.
4. `feed.subscribe` → new cats: `crowd.dropIn(i)`, `dj.pointAt(pos)`, `hud.shout`, `clock.queueDrop('new-cat')`.
5. Per frame: `clock.tick()` → `FrameContext{dt, time, beat: clock.now(), camera, profile}` →
   `world.update`, `crowd.update`, `dj.update`, `director.update` → `world.render(director.camera)`.
6. Input (L-UI): tap → `crowd.jump(0.6, point)`, `crowd.pulsePaws()`; hold → `clock.beginBuild()`;
   release → `clock.endBuild()`; double tap → `clock.queueDrop('viewer')`; first gesture → `clock.unlock()`.

### Shared world conventions

- 1 unit = 1 m; +Y up. Booth centred at the origin, top at `LAYOUT.boothSize.h` (`world.boothTop`).
- Hero camera on +Z looking at −Z; the moon at `LAYOUT.moon.center` = (0, 34, −260).
- Crowd faces the booth; slots start at `crowdInnerRadius` 3.2, spacing 1.05; a cat is 1.0 tall with
  paws up. The DJ is 1.35× and stands behind the decks (−Z side of the booth top).
- Colours from `PALETTE`. Bloom picks up anything brighter than ~1.0, so paw pads, the moon, the booth,
  lasers and confetti use emissive values above 1; fur stays below.
- Renderer: `outputColorSpace` sRGB, `toneMapping` ACES (L-WORLD sets it; others use plain
  `MeshBasicMaterial`/`ShaderMaterial` and respect fog via three's fog chunks).

### Acceptance per lane

- Builds with `npx tsc --noEmit`; lane tests with `npx vitest run` (pure logic: slot layout, count rule,
  beat math, param parsing, director shot schedule).
- Runs on `npm run dev` (5180) with `?cats=0`, the real data (9), `?cats=300`, `?cats=10000`.
- Portrait phone viewport 390×844 and desktop 1440×900 have no overflow and hold the tier's fps.
- No network calls except the API base; no external assets except Google Fonts if L-UI chooses one.

## 13. Known issues found (not fixed here)

- The payout index lists Base (8453) and Avalanche (43114) with `lastRunFailed: true`; Base's
  `indexedThrough` is Oct 8 and Avalanche's Oct 15. The rows it has are right, but a newer payout on those
  chains would be missing until the backend job recovers. Mark the page `stale` when any contract's
  `indexedThrough.time` is older than 15 min (as the other readers do); no RPC tail read in v1.
- `GET /shelter/goal/C-001` reports less than the index (9.57 vs 9.97) because it skips EURC and has not
  scanned Base, Avalanche or Monad; do not mix the two numbers on one page.
- The DigitalOcean CDN impact mirror answered 403 on Oct 16.
