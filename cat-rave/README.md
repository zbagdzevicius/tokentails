# Moon Rave (`cat-rave/`)

A three.js environment for Token Tails: **every US dollar paid out on-chain to the Pink Paw shelter is
one dancing cat.** Night, a huge glowing green moon on the horizon, a ginger DJ kitten in big
headphones at a glowing green booth, a glossy green dance floor, green and violet lasers through haze,
and a crowd of cream kittens on their hind legs with hot-pink paw pads raised. At every drop the DJ
raises a sword and pink bows rain down. It is ambient first (it loops forever and is watchable without
touching it) and interactive second (tap, hold, find your cat, add a cat).

It is inspired by the "no sleep, just grind" kitten-rave meme, but nothing from the meme ships: no video
frames, no song, no likeness. Every 3D asset is procedural geometry and shaders, and the music is
synthesized live in WebAudio.

Design spec and lane notes: `SPEC.md`, `LANE-NOTES/`.

## The $1 = 1 cat rule

1. Read every mainnet ShelterSplit payout to Pink Paw, dedupe by `chainId:txHash:logIndex`, and sort
   oldest first by (timestamp, chainId, logIndex).
2. Keep a running total in integer micro-USD. Each time it crosses a whole dollar, that payout
   completes a cat. One $5 gift makes five cats from the same tx; a dollar of $0.01 treats has about
   100 contributors ("made of N payouts").
3. Cats on the floor = `floor(total USD)`. The remainder is the progress paw ("97¢ to cat #16"), drawn
   as a translucent hologram filling bottom-up in the next free slot.
4. Never fabricated. `?cats=N` is a demo override with a permanent DEMO banner; the real total and the
   CTA stay real, and demo cats have no payout.
5. Conversion: USDC, USDC.e, USDG and pathUSD at 1:1. EURC at a fixed 1.00 USD (undercounts, never
   inflates; same as the backend's checkout FX). Gas coins, unknown tokens and testnets are not counted.

Implemented in `src/data/index.ts` (`buildSnapshot`), tested in `src/data/count.test.ts`.

### Data source

`GET https://api.tokentails.com/shelter/payouts?network=mainnet&limit=2000` (public, CORS `*`, cached
30 s; the backend index job runs every 2 min). It covers every ShelterSplit `Disbursed` /
`NativeDisbursed` event on the 8 mainnet splits on 7 chains (Arc USDC + EURC, Base, Arbitrum One,
Avalanche, Tempo, Robinhood Chain, Monad): free treats, wallet gifts, sponsor matches, partner
campaigns and the 50% Pink Paw share of each $5 shelter-cat purchase (`tt:cat` memo).

Live mode: the page paints instantly from the bundled snapshot, swaps to live within ~1.2 s, then polls
every 60 s (backing off to 5 min on errors, pausing while the tab is hidden). New whole dollars drop new
cats in from the sky, the DJ shouts them out, and the music queues a drop.

**As of 2026-10-16 18:38 UTC** (`src/data/snapshot.json`, regenerated today with `npm run snapshot`):

| Symbol | Amount | Payouts |
|---|---|---|
| USDC (Arc native + token, Base, Arbitrum, Avalanche, Monad) | 14.63 | 190 |
| USDC.e (Tempo) | 0.20 | 2 |
| USDG (Robinhood Chain) | 0.10 | 1 |
| EURC (Arc, at 1:1) | 0.10 | 1 |
| **Total** | **$15.03** | **194** |

**15 cats dancing, 97¢ to cat #16.** The live page showed the same at 18:38 UTC. The index reports
Base (indexed through Oct 8) and Avalanche (Oct 15) with `lastRunFailed: true`, so the HUD says
"live · Base, Avalanche delayed"; payouts on those two chains after those dates are missing until the
backend job recovers.

Raw memos (such as `motored:user-51`) are never bundled or shown; only a source label (treat, Heist
treat, wallet gift, adoption share, sponsor match, partner campaign, proof payout, gift).

### Add a cat (existing live paths only)

| Path | What happens |
|---|---|
| Free treat (in-page, tokentails.com only) | Token Tails' hot wallet pays $0.01 to the split, one per visitor per UTC day; `POST /shelter/donate/guest` `{source: "page"}`. Shown as "on its way" until the index confirms |
| Give with a wallet | https://tokentails.com/shelter-payouts/give |
| Adopt a $5 shelter cat (50% to the shelter) | https://tokentails.com/cats |
| Every payout with its explorer link | https://tokentails.com/shelter-payouts |

## Commands

```bash
cd cat-rave
npm install
npm run dev            # http://127.0.0.1:5180 (next free port if taken)
npx tsc --noEmit       # typecheck
npx vitest run         # unit tests (count rule, feed, slots, picking, beat clock, DJ, director, params)
npm run build          # tsc + vite build into dist/
npm run snapshot       # refresh src/data/snapshot.json from the live index
npm run og             # re-render public/og.jpg from the scene (?og=1; needs the dev server)
npm run build:client   # build into ../client/public/rave for tokentails.com/rave (see Ship)
```

## URL parameters

| Param | Effect |
|---|---|
| `?cats=N` | Demo count override (0–100000), DEMO banner always visible |
| `?shot=hero\|top\|pov\|dj\|orbit\|sweep` | Opening camera shot |
| `?auto=0` | Auto-director off |
| `?mute=1` | Start muted |
| `?cat=12`, `?cat=%2312`, `?tx=0x…` | Fly to that cat at boot (highlight ring + follow spot) |
| `?quality=low\|mid\|high` | Force a quality tier |
| `?embed=1` | Minimal chrome for iframes (counter only) |
| `?debug=1` | FPS, draw calls, triangles, tier, bar/section, shot, cat count |
| `?api=https://…` | API base override (ignored on tokentails.com) |
| `?og=1` | Clean hero frame for the OG image script |
| `?arc=1` / `?arc=0` | Force the Arc week look on or off (previews) |

### Controls

| Input | Effect |
|---|---|
| Tap / click the floor | Crowd hops in a wave from the tap point, paws pulse, a hat hit in the music |
| Hold (≥ 350 ms) / hold Space | Build-up: riser and snare roll, crowd crouches and shakes, lasers fan (auto-drops after 8 bars) |
| Release, double tap, or Enter | Drop on the next downbeat: sword up, bow confetti, crowd jump, strobe |
| Drag / pinch / wheel | Orbit and dolly (auto-director resumes after 12 s) |
| Tap or hover a cat | Cat card: index, amount, chain, date, source, explorer link |
| 1–6, A, M, F | Shots, auto-director, mute, find my cat |

## Architecture

```
src/
  main.ts          wiring: params → quality → world → clock → crowd → DJ → director → HUD → feed; frame loop
  types.ts         shared contracts (WorldApi, CrowdApi, DjApi, BeatClock, PayoutFeed, Director, …)
  config.ts        layout, palette, BPM + arrangement, chains, links, quality tiers
  world/           renderer, sky + stars, procedural moon (far plane), reflective floor (half-res planar
                   mirror on high, fake reflection + caustics on mid/low), glowing booth, instanced
                   lasers and spot cones, haze sheets, bloom (postprocessing), flash, capture
  crowd/           one merged low-poly kitten (~420 tris) as an InstancedMesh for near cats plus
                   camera-facing SDF impostors for far cats; all dancing in the vertex shader (kick
                   bounce, paw waves, build crouch, drop jump, tap ripple, vortex, drop-in); stable hex
                   slots from the booth out; CPU ray picking on a uniform grid
  dj/              fluffy shell-textured ginger kitten with headphones, decks + mixer, beat-synced
                   moves (nod, scratch, fader), sword raise, instanced bow confetti, comic speech bubble
  audio/           WebAudio synth at 136 BPM (kick with hardstyle tail in the drop, ducked offbeat bass,
                   hats, claps, supersaw stabs, pad, snare-roll build, riser), look-ahead scheduler,
                   arrangement intro 4 / groove 12 / build 8 / drop 16 / breakdown 8 bars, and a beat
                   clock that keeps the visuals dancing before unlock or while muted
  data/            live payout feed (paging, dedupe, staleness, polling, diff → new cats, find by #N or
                   tx, free-treat call), bundled snapshot.json
  ui/              camera director (6 shots, auto cuts on bars), gestures + keys, HUD, CTA sheet, cat
                   card, find my cat, share + save picture, quality pick + frame-time governor
```

Performance: one draw call per system, no textures shipped (moon noise, bow sprite and fur are
generated at runtime), DPR capped per tier, and a governor that steps the tier down after 3 s over
budget. Tiers (`QUALITY` in `src/config.ts`): low 2,500 cats / mid 6,000 / high 10,000 rendered; above
that the HUD says "+N more dancing off-screen". Measured in headless Chromium on an M-series Mac
(Oct 16): phone viewport `?cats=2000&shot=top` 58 fps on low (71 calls, 118k tris); desktop
`?cats=300&shot=pov` 60 fps on high (121 calls, 296k tris). Not yet measured on a physical mid-range
phone.

Bundle: `index` 259 kB (88 kB gzip, including the bundled snapshot) + `three`/`postprocessing` 624 kB (156 kB gzip), CSS 13 kB.

## Arc week

From 2026-10-16 00:00 UTC to 2026-10-23 23:59 UTC (`src/arc/arcweek.ts`, `ARC_WEEK`) the rave is live
on Arc: a "LIVE ON Arc" badge under the HUD tools and the Arc logo on the booth's front panel; both hide
outside the window (re-checked every minute). The logo files in `public/brand/` are the official,
unmodified Circle Brand Kit files; `public/brand/SOURCE.md` has the URLs and the usage rules (no
recoloring or effects on the mark, clear space, at least 50 px tall, Token Tails stays the primary
brand). Arc-first defaults that do not depend on the window: the USDC tab opens on Arc, and a cat whose
payout was on Arc (5042 / 5042002) gets a "paid on Arc" chip on its card. Rave checkout payouts are sent
by the shelter-share keeper on `SHELTER_CHAIN_ID`, which defaults to Arc.

## Ad space

20 slots in the world at $100 for 30 days (`src/ads/slots.ts`; the backend copy is
`backend/src/rave/ads/rave-ads.slots.ts`): 2 giant LED screens flanking the stage, 6 floor-edge
banners, 6 laser-tower wraps, 4 blimps and 2 banners on a neon ring round the moon. None covers the
moon or the DJ in the hero shot (`src/ads/ads.test.ts`); all 20 show up across the shots (orbit, POV,
sweep, and the blimps over their 140 s orbit). While `GET /rave/ads/status` is enabled
(`RAVE_ADS_ENABLED`), empty slots say "Your ad here · $100", sold ones "Ad space sold · coming soon",
and "📣 Advertise" (or a tap on an empty slot) opens the in-page sheet: pick a slot on the mini-map,
upload an image (cropped to the slot's shape), name, https link, optional X handle, card fee toggle,
then the Stripe Payment Element with the slot held for 15 minutes. Paid ads wait for an admin
(`POST /rave/ads/:id/approve|reject`, reject refunds). Live ads come from `GET /rave/ads`; a tap opens a
"Sponsored by X" card whose link opens in a new tab (`rel="noopener nofollow sponsored"`), and the HUD
lists them under "Sponsors".

## Ship it to tokentails.com/rave

1. `npm run snapshot` (fresh fallback), then `npm run build:client`. This runs `tsc` and builds with
   `RAVE_BASE=/rave/` and `RAVE_API_URL=https://api.tokentails.com` into `../client/public/rave`
   (emptied first). Assets land under `/rave/build/`.
2. Commit `client/public/rave` (same as the Heist's `client/public/heist-game`). Vercel builds the
   client; `client/next.config.js` rewrites `/rave` to `/rave/index.html`, so the page is served at
   `https://tokentails.com/rave` and the address bar keeps `/rave` (`/rave/` redirects there first).
   Web builds only: the Capacitor export has no rewrites.
3. Canonical, `og:url` and `LINKS.self` are `https://tokentails.com/rave`; the OG image is
   `https://tokentails.com/rave/og.jpg`. The API host is chosen by page host (`API_BY_HOST`), so the
   path changes nothing there.

## Known gaps

- `client/public/rave` is built (Oct 17) but not committed yet; `/rave` answers 404 on production until it is
  until the build is committed.
- The payout index has Base and Avalanche on `lastRunFailed` (backend issue, not fixed here); newer
  payouts on those chains are not counted until it recovers. The page labels them delayed.
- EURC counts at a fixed 1:1 USD, so the total slightly undercounts.
- `crowd.highlight` takes one cat: a tx that made several cats flies to the first one, and the card
  says how many cats came from that payout.
- Bows have no collision (they fall through cats and the booth).
- In the tight `dj` close-up on a phone, the speech bubble is kept on screen and can overlap part of
  the DJ's face.
- Crowd fur reads more tan than cream under the green light in the close hero shot.
- Performance is verified in headless desktop Chromium only; check a real Pixel 6a / iPhone 12 class
  phone before launch.
- `public/og.jpg` is a static render with no live number; re-run `npm run og` after visual changes.
- `SPEC.md` quotes the earlier snapshot ($10.11 = 10 cats at 15:41 UTC); this README has the current one.
