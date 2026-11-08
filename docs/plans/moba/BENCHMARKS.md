# Pawlegends vs Wild Rift, Mobile Legends and League of Legends: benchmarks and scorecard (2026-11-08)

**What this is.** The measurement behind the claim in `PARITY.md` that Pawlegends beats the three big MOBAs "on its
own terms". It has four parts:
1. Public, cited numbers for the rivals.
2. Our numbers, measured by a harness in this repo.
3. The live KPIs (PostHog) that only real players can fill, with a query guide.
4. A scorecard.

**Base:** `main` at `a2dc4063` (SIM_VERSION 15, PROTO 2, Quick Play co-op vs bots).
**Raw output:** [`benchmarks/measured.json`](benchmarks/measured.json) and [`benchmarks/measured.md`](benchmarks/measured.md),
written by `cd pawlegends && npm run measure -- --browser`. No feature flags were added. No sim change was made (no
`SIM_VERSION` bump). The scores path is untouched.

**Confidence labels** for rival numbers:
- **High:** the publisher's own page or store listing, read on 2026-11-08.
- **Medium:** a measured third-party source, or an official figure that is old.
- **Low:** a guide, an aggregator or marketing copy.

Rival numbers change every patch. Check the source before you quote one outside this file.

---

## 1. Rival baselines (public, cited)

### 1.1 Match length

| Game | Number | Confidence | Source |
|---|---|---|---|
| Wild Rift | Riot's design target: "16-18 minutes on average" for the core game; the whole session (launch, champ select, loading, victory screen) should fit in 30 min | High for the target, Medium as a 2026 average (2020 post) | [Wild Rift Real Talk, Oct 9 2020](https://wildrift.leagueoflegends.com/en-sg/news/dev/wild-rift-real-talk-oct-9-2020) |
| Wild Rift | 15 to 20 min (encyclopedia summary) | Low | [Wikipedia: Wild Rift](https://en.wikipedia.org/wiki/League_of_Legends:_Wild_Rift) |
| MLBB | "10 Minute Matches" (store tagline) | Low (marketing) | [App Store listing (GB), read 2026-11-08](https://apps.apple.com/gb/app/id1160056295) |
| MLBB | One measured 15-min Classic match; 15 to 20 min is typical in guides | Low | [Yugatech data test](https://yugatech.com/internet-telecoms/how-much-data-does-mobile-gaming-consume), [esports.net](https://www.esports.net/news/mobile-games/mlbb-size-and-system-requirements/) |
| LoL | 28:58 average over 1,040,186 tracked matches on patch 16.13.1 | Medium (third-party tracker; Riot publishes no average) | [LoLProfile game length](https://lolprofile.net/game-length) |
| LoL | About 28:27 to 29:46 by rank, Iron to Gold, surrenders included | Medium (undated) | [Dot Esports](https://dotesports.com/league-of-legends/news/how-long-is-an-average-league-of-legends-match) |

### 1.2 Queue time

| Game | Number | Confidence | Source |
|---|---|---|---|
| LoL | "three minute queues across all players" off-peak; about 8.5 min for Master+ | Medium-Low (Riot dev post from the dynamic-queue era, archived, old) | [Riot dev corner, archived](https://archive.runeterra.net/na/developer-corner/XvqbAgrF) |
| MLBB | "10 Second Matchmaking" | Low (store tagline, not a measurement) | [App Store listing (GB)](https://apps.apple.com/gb/app/id1160056295) |
| Wild Rift | No public figure found | – | – |

### 1.3 Netcode: update rate and latency

| Game | Number | Confidence | Source |
|---|---|---|---|
| LoL | Server tick 30.3 Hz (33 ms), measured by the community wiki; Riot says "30 Hz" | Medium | [LoL Wiki: Tick and updates](https://wiki.leagueoflegends.com/en-us/Tick_and_updates) |
| LoL | Pro play is levelled to 35 ms with ±5 ms fluctuation; 40 ms is called the top-level ceiling | Medium (secondary report of a Riot tech post) | [Gigazine on Riot's latency service](https://gigazine.net/gsc_news/en/20220518-riot-games-artificial-latency) |
| Wild Rift | Riot recommends a "latency of 180ms or less" | High | [Riot support: maximum recommended latency](https://support.riotgames.com/en-us/wild-rift/performance/maximum-recommended-latency) |
| MLBB | Frame synchronisation, confirmed by a Moonton job listing. No published tick or input numbers. A "Battle Proxy" sends the battle data on two lines | Low | [Moonton job listing](https://outscal.com/job/mlbb-senior-client-mode-at-moonton-in-shanghai-china), [Gfinity](https://www.gfinityesports.com/mobile-legends/mobile-legends-network-optimizations-promise-less-lag-and-more-pizza/) |
| All three | Input-to-visible latency for your own hero: **not published** by any of them | – | – |

### 1.4 Install size and time to first match

| Game | Number | Confidence | Source |
|---|---|---|---|
| Wild Rift | 1.1 GB on the App Store (GB storefront). Other storefronts show 1.8 to 2.2 GB | High (listing, read 2026-11-08); storefronts vary | [App Store (GB)](https://apps.apple.com/gb/app/id1480616990), [App Store (DE)](https://apps.apple.com/DE/app/id1480616990) |
| MLBB | 343.9 MB on the App Store. In-game resource downloads take the total to roughly 2 to 4 GB | High for the listing, Low for the in-game total | [App Store (GB)](https://apps.apple.com/gb/app/id1160056295), [esports.net](https://www.esports.net/news/mobile-games/mlbb-size-and-system-requirements/) |
| LoL | Riot's macOS requirements list 40 GB of storage. Guides quote 16 GB for Windows | Medium | [Riot support (it-it)](https://support.riotgames.com/it-it/league-of-legends/performance/minimum-and-recommended-system-requirements-league-of-legends), [LoL Theory](https://blog.loltheory.gg/do-you-need-a-good-pc-to-play-lol/) |
| All three | Time to first match from a link: **not published**. Derived floor: listing size ÷ 9 Mbps (the 4G profile we test with) is about 16 min for Wild Rift (1.1 GB), about 5 min for MLBB (344 MB, before its in-game downloads) and hours for LoL. That covers the download only. Install, account, tutorial and the first queue come on top | Derived | – |

### 1.5 Roster and data per match

| Game | Number | Confidence | Source |
|---|---|---|---|
| MLBB | 133 heroes (Hirara, June 2026, newest) | Medium | [mlbbhub](https://mlbbhub.com/heroes), [playnews.gg](https://www.playnews.gg/en/guides/mlbb-2026-the-new-heroes-marcel-hirara-and-sora) |
| Wild Rift | About 142 champions (Oct 2026). The official wiki shows 127 with no date | Low-Medium | [1v9.gg](https://1v9.gg/blog/how-many-wild-rift-champions), [LoL Wiki WR:Champion](https://wiki.leagueoflegends.com/en-us/WR:Champion) |
| LoL | 173 champions (Sep 2026) | Medium | [Keenable roster list](https://select.keenable.ai/r/every-league-of-legends-champion/3f9st3YGgj30TmVPYzzTCQ) |
| MLBB | 25.5 MB for one measured 15-min Classic match | Medium (one measurement) | [Yugatech](https://yugatech.com/internet-telecoms/how-much-data-does-mobile-gaming-consume) |
| LoL | About 26 MB per 30-min match; estimates run from 15 to 100 MB | Low | [Smart Home Starter](https://smarthomestarter.com/how-much-data-does-league-of-legends-use/), [Times Live](https://www.timeslive.co.za/news/gamers-live/2020-08-18-how-much-data-do-games-like-fortnite-and-league-of-legends-use-not-much/) |
| Wild Rift | No measured figure found | – | – |
| All three | D1 / D7 retention, match completion, real input latency: **not published** | – | – |

---

## 2. Our side, measured (`pawlegends/tools/measure.mjs`)

One command runs every part. It writes [`benchmarks/measured.json`](benchmarks/measured.json) and
[`benchmarks/measured.md`](benchmarks/measured.md):

```sh
cd pawlegends
npm run measure                       # match length, latency, queue, sizes (about 2 min)
npm run measure -- --browser          # + cold load in Chromium (builds the game; about 5 min)
npm run measure -- --seeds 200 --skip queue,size   # a quick partial run
```

| Part | What runs | Real code | Modelled |
|---|---|---|---|
| Match length | `tools/lib/batch.mjs` (`headless-match.mjs`). 2,000 seeds of Normal vs Normal bots (the balance gate) and 400 seeds of the scripted first-timer (`naive`) vs Easy | The bundled sim | Players are bots, not humans |
| Own-input latency | `tests/perf/net-rtt.test.ts`, at 0, 50 and 150 ms RTT, plus 150 ms with heavy jitter. 90 s each, about 190 taps each | The relay `Room` (backend), the wire codec, `NetHost` (send path, coalescer, ack samples, cosmetic prediction), `NetCore` stepping the real sim, and `Pacer` | The network is an ordered delay line of RTT/2 each way plus seeded exponential jitter. The player taps a Move every 250 to 700 ms. Fake timers, so a loaded machine does not change the numbers |
| Queue time | `backend/test/mm-sim.ts --json`, at 9 arrival rates from 0.25 to 60 joins per minute, 2 h of simulated time each | The `Matchmaker` | Poisson arrivals: 30% duos, side preferences, ratings |
| Size | First-load gzip of the shipped `client/public/pawlegends-game`, and the newest signed iOS OTA zip | The shipped files | – |
| Cold load (`--browser`) | `tests/e2e/measure-load.spec.ts`: a fresh context with the cache off, one tap, until the match is live and the hero answers. Desktop 1280×720, and an 844×390 touch phone with a 4× slower CPU. Each with no throttle and on 4G (9 Mbps, 170 ms) | The production build | Local preview server, not the CDN. Chromium only. A Mac GPU |

### 2.1 Results (2026-11-08, `a2dc4063`, Apple Silicon, 12 cores)

| Metric | Measured |
|---|---|
| Match length, Normal vs Normal bots (2,000) | p50 **7:14**, p10–p90 5:22–8:15, p95 8:31, max 8:46. Every match ended on a core kill |
| Match length, first-timer vs Easy bots (400) | p50 **6:25**, p10–p90 6:06–7:21, p95 7:33 |
| Own hero drawn moving after a tap (prediction) | p50 7–8 ms, **p95 15–16 ms** at every RTT. This is the next 60 fps frame |
| Command applied by the sim, at 0 / 50 / 150 ms RTT | p50 **40 / 94 / 216 ms**, p95 65 / 127 / 250 ms. Playout buffer B = 1 |
| Command applied at 150 ms RTT with 30 ms mean jitter | p50 284 ms, p95 376 ms. The playout buffer grows to B = 2 |
| Net payload per match (1 human) | 7.4 KB/min down and 2.2 KB/min up, so about **67 KB per 7-min match**. On the wire it is an estimated 0.6 to 0.8 MB, once about 70 B of WebSocket, TLS and TCP/IP headers are added to each of about 1,350 frames a minute |
| Quick Play co-op queue | p50 **1.5 to 11.3 s** at every rate. p95 ≤ 26.1 s, max 30.5 s, because bots fill the seats at 30 s. Matches with ≥ 2 humans: 35% at 0.25 joins/min, 99% at 20 joins/min |
| First load, web | **380 KB gzip** (13 files). About 1.2 to 1.3 MB is transferred by the time the first match is live |
| iOS app | **2.86 MB** web payload (signed OTA zip, sim v15) plus the Capacitor shell. The shell is not measured: no archived `.ipa` is in the repo |
| Cold load to a live match | Desktop: **3.2 s** unthrottled, **4.4 s** on 4G. Phone (CPU 4× slower): **4.7 s** unthrottled, **5.7 s** on 4G |

The §3.11 targets the latency test asserts are all met at p95:
- Predicted own move: ≤ 50 ms.
- Applied, at 0 / 50 / 150 ms RTT: ≤ 170 / 200 / 325 ms.
- Applied, on the jittery link: ≤ 400 ms.

All four of those runs pass.

**What the harness does not measure.** These stay unknown until real players or a device run:
- Touch-panel and compositor latency. These add about 1 to 3 frames on a phone for every game alike.
- Real mobile radio behaviour: loss, retransmits and handovers.
- Match length and queue time for **humans**.

---

## 3. Live product KPIs (PostHog, consent-respecting)

### 3.1 How events reach PostHog

`src/analytics/posthog.ts` sends nothing until the player consents. The game asks from the second session. Events queued
before the answer are sent if the player says yes, and dropped if the player says no.

Embedded on tokentails.com, the events relay to the host. The host follows the site's policy and uses its own
anonymous id.

Every event carries:
- `human` (true for a real human session),
- `embed`,
- `session`,
- `quality`,
- `day_n` (new).

No personal data is sent.

### 3.2 What each KPI uses

| KPI | Events and props | Status |
|---|---|---|
| D1 / D7 retention | `day_n` on **every** event (`src/analytics/kpi.ts`): whole UTC days since this browser first opened the game, kept in browser storage | New in this change |
| Time to first match | `load_ms` (ms since page load) and `first_match` on `match_start`; `load_ms` on `mp_match_start` | New in this change |
| Match completion | `match_start` → `match_end` (`reason` other than `leave` or `forfeit`); `mp_match_start` → `mp_match_end` (`reason`, `piloted_pct`) | Existed; `match_start` now carries `party: true` for party matches |
| Queue time | `mm_found.waited_s`; `mm_cancel.by` and `waited_s` | Existed |
| Input latency | `mp_net`, every 60 s **and once at the end** (`final: true`), with `input_ms` (EWMA) and the new `input_p50`, `input_p95` and `input_n` (raw samples, `NetHost.inputSamples`). Also `rtt_p50` and `buffer` | Extended |
| Phone frame time | `perf_sample.p95`, `tier` | Existed |

### 3.3 Query guide (PostHog SQL; filter `properties.human = true` always)

```sql
-- D1 / D7 retention by first-day cohort (complete cohorts only)
SELECT d0, count() AS cohort, round(avg(d1), 3) AS d1, round(avg(d7), 3) AS d7
FROM (
  SELECT distinct_id,
         min(if(toInt(properties.day_n) = 0, toDate(timestamp), NULL)) AS d0,
         max(toInt(properties.day_n) = 1) AS d1,
         max(toInt(properties.day_n) = 7) AS d7
  FROM events
  WHERE properties.human = true AND timestamp > now() - INTERVAL 60 DAY
  GROUP BY distinct_id)
WHERE d0 IS NOT NULL AND d0 <= today() - 8
GROUP BY d0 ORDER BY d0

-- Time to first match (first-ever match only), p50 / p90, by surface
SELECT properties.embed AS embed, count() AS n,
       quantile(0.5)(toInt(properties.load_ms)) / 1000 AS p50_s,
       quantile(0.9)(toInt(properties.load_ms)) / 1000 AS p90_s
FROM events
WHERE event = 'match_start' AND properties.first_match = true AND properties.human = true
  AND timestamp > now() - INTERVAL 14 DAY
GROUP BY embed

-- Match completion, solo and party
SELECT countIf(event = 'match_end' AND properties.reason NOT IN ('leave', 'forfeit'))
       / countIf(event = 'match_start' AND properties.party IS NULL) AS solo_completion,
       countIf(event = 'mp_match_end') / countIf(event = 'mp_match_start') AS party_completion
FROM events
WHERE properties.human = true AND timestamp > now() - INTERVAL 7 DAY

-- Quick Play queue time
SELECT count() AS n, quantile(0.5)(toFloat(properties.waited_s)) AS p50_s,
       quantile(0.95)(toFloat(properties.waited_s)) AS p95_s
FROM events WHERE event = 'mm_found' AND timestamp > now() - INTERVAL 7 DAY

-- Own-input latency per match, by RTT band
SELECT multiIf(toInt(properties.rtt_p50) < 60, '<60', toInt(properties.rtt_p50) < 120, '60-120', '120+') AS rtt,
       count() AS matches,
       quantile(0.5)(toInt(properties.input_p50)) AS median_of_p50,
       quantile(0.9)(toInt(properties.input_p95)) AS p90_of_p95
FROM events
WHERE event = 'mp_net' AND properties.final = true AND toInt(properties.input_n) >= 20
  AND timestamp > now() - INTERVAL 14 DAY
GROUP BY rtt ORDER BY rtt
```

### 3.4 Caveats

- **Standalone players who never consent are invisible.** First-session-only players are therefore under-represented
  in standalone retention. Embedded play does not have this gap. Compare `embed = true` and `embed = false`
  separately.
- **Cleared storage starts a new cohort.** This undercounts retention; it never overcounts it.
- **`load_ms` stops early.** It runs from page load to the match being set up (`match_start`), so it excludes the
  match chunk's load. The lab cold-load numbers in §2.1 run to the hero answering. They differ by less than a second
  in the lab.
- **`mp_net.rtt_p95` is not a percentile.** It is the current RTT estimate, an existing shortcut. Use `rtt_p50`
  bands, as above.

---

## 4. Scorecard

The "Better?" column means Pawlegends is better on this metric for the stated reason. It is not a claim about the
whole game.

| Metric | Pawlegends (measured) | Wild Rift | MLBB | LoL | Better? |
|---|---|---|---|---|---|
| Install before the first match | Web: 0 (380 KB gzip first load, about 1.3 MB to a live match). iOS: 2.86 MB web payload plus the shell | 1.1–2.2 GB | 344 MB, then 2–4 GB of in-game downloads | 16–40 GB | **Yes**, by about 3 orders of magnitude |
| Time to first match from a link (cold) | 3.2 s desktop; 5.7 s phone-class on 4G (lab) | Not published. Derived: ≥ 16 min of download alone at 9 Mbps | Not published. Derived: ≥ 5 min, plus resource downloads | Not published. Derived: hours | **Yes** in the lab. Real devices: unknown until `load_ms` data |
| Match length (p50) | 7:14 bots vs bots; 6:25 first-timer vs Easy | 16–18 min (Riot target) | "10 min" (marketing); 15–20 min typical | ~29 min | **Yes** for the "fits a break" goal; 2–4× shorter. Human matches: unknown until real players |
| Queue time (Quick Play co-op) | p50 1.5–11.3 s, p95 ≤ 26 s, never over 30.5 s (simulated, bots fill seats) | Not published | "10 s" (marketing) | ~3 min average (old Riot figure) | **Yes** vs LoL; **unclear** vs MLBB. PvP queue: unknown, as PvP does not exist yet (M1b) |
| Tap to own hero drawn moving | p95 15–16 ms at 0, 50 and 150 ms RTT (prediction, the next frame) | Not published | Not published | Not published | **Unknown**: no rival number to compare |
| Tap to command applied by the sim | p50 40 / 94 / 216 ms at 0 / 50 / 150 ms RTT; p95 376 ms on a jittery 150 ms link | Not published; Riot advises ≤ 180 ms ping | Not published | Not published | **Unknown** |
| Server update rate | 15 Hz turns (2 sim ticks of 30 Hz each) | Not published | Not published (frame sync) | 30 Hz | **No** vs LoL: our turn is twice as coarse. Prediction hides it for movement, not for casts |
| Data per match | About 67 KB payload, an estimated 0.6–0.8 MB on the wire, per 7 min | Not published | 25.5 MB per 15 min (one test) | ~26 MB per 30 min (low confidence) | **Likely yes**, by more than 10×. It is a lab estimate: check it with a device data counter |
| Roster | 20 heroes (10 cats, 10 dogs) | ~142 | 133 | 173 | **No**. A 3v3 needs far fewer (PARITY §1), but rival players will notice |
| D1 / D7 retention | Unknown until real players (`day_n`, §3) | Not published | Not published | Not published | **Unknown** |
| Match completion rate | Unknown until real players (§3) | Not published | Not published | Not published | **Unknown** |
| Phone p95 frame time in a match | Unknown until real players (`perf_sample`); the lab gate in `perf.spec.ts` is a separate check | Not published | Not published | Not published | **Unknown** |
| PvP fairness: desync and side balance | Not measured here: `mp/soak.mjs` (desync) and the balance gate (side 45–55%) | – | – | – | n/a |

**Reading it honestly.**
- We win clearly on the things a link-first browser game is built for: install, time to first match, match length,
  co-op queue time and data.
- We lose on roster size and on server update rate against LoL.
- Every row that depends on human behaviour is unknown until real players arrive: retention, completion, real-device
  latency and frame time. The events for all of them now exist (§3).
- "Better feel than Wild Rift" cannot be claimed from this file. It needs a playtest with players of both games
  (PARITY §9).

## 5. Re-running and keeping it current

- **Every sim batch:** run `npm run measure -- --browser` and commit the new `benchmarks/measured.*`. The latency test
  also runs in `npm test` (the `perf` project) and fails if a §3.11 p95 target is broken.
- **Every quarter:** re-check the rival rows marked High and Medium against their sources.
- **Two weeks after launch:** replace every "unknown" in §4 with the §3 queries.
