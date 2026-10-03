# Catnip Heist: Strategy & Best-Case Plan (2026-09-28)

Tags: **(E)** means backed by a repo file or a URL read on 2026-09-28. **(J)** means judgment. Effort is in agent-assisted days (d) unless marked. None of this is legal advice.

## 1. Bottom line

1. **Make it safe and measurable before anything else.** Commit `catnip-heist/` to git, since it is untracked today (E, `git status`). Add CI, replace the catnip icon that looks like a cannabis leaf, and add telemetry with a consent note. Run 5 to 8 remote playtests. Nobody has played it yet, and the solver's par times say nothing about how hard it is for humans (E).
2. **Make the portal decision once, in week 1.** Submit to Poki with the web build private, and ask for a written carve-out covering tokentails.com. If Poki has not said yes by 2026-10-19, go wide: CrazyGames Basic Launch, then Newgrounds and Y8, with GameDistribution last (E: Poki's deal terms; J: the timeline).
3. **Soft launch on Black Cat Day (Oct 27) on channels you own, with local saves only.** That means a standalone page on tokentails.com with 1 or 2 partner shelters. Hold off on Show HN and the press push until there is a month of data. There is no Capacitor embed until static export is re-enabled (E, `docs/plans/catnip-heist-3d.md:42`).
4. **Connect it to Token Tails accounts only after the numbers pass.** Once completion on levels 1 to 3 is at least 40%, build the replay-verified saves through `POST /user/catbassadors/live`, with the backend first. Before that, the Heist build must be unable to reach `/live` at all. (Corrected 2026-10-01: an earlier version said the backend accepts an unknown game type at the 420 cap. It does not: the strict `/live` DTO rejects unknown types with 400, and a `CATNIP_HEIST` save is accepted only with a replay that the server re-simulates. The backend branch landed in task 3b; see `catnip-heist-3d.md`, Save integrity. Its `replayDigest` only stops the same log saving twice; it is not anti-cheat, so any future Heist leaderboard must exclude guests with `notGuestFilter()`.)
5. **Keep the Heist free of crypto, and treat the rescue as the product.** No $TAILS, NFTs or wallets, and ads never grant catnip. The value is in portal reach plus real shelter cats: impact that can be audited, which is the evidence showcases and jurors reward. No cash grant clears the >10% bar (E, funding brief), so the funding track is showcases, not grants.

## 2. Where the game stands

**Strengths (E)**
- It is a standalone Vite and three.js package: 230 KB gzip JS and 2.7 MB total, with no crypto code (grep of `catnip-heist/src`).
- The simulation is deterministic (30 Hz, seeded, `SIM_VERSION=3`) and produces a replay hash. That allows server-side replay checks, which are stronger anti-cheat than any other Token Tails mode.
- Levels come out of a pipeline: ASCII map, then A* solver over the real sim, then tests. There are 8 levels. Each is proven completable with every coin and without being spotted, and each needs both cats except heist-02.
- It looks commercial (voxel cats, readable vision cones). It supports keyboard, gamepad and touch, and it drops to a lower quality tier automatically. It handles WebGL context loss and reduced motion.
- The mission is the core loop: every level ends with freeing a named shelter cat.

**Gaps (E unless marked)**

| Gap | Effort (J) |
|---|---|
| No human playtests and no telemetry | 3–4 d, plus 2 d tuning |
| The catnip icon reads as cannabis. The level-select screenshot is blank. The Results numbers look odd. Stars and paws use two different rating rules | 1.5 d |
| About 16k lines of agent-written code that no human has reviewed | 2–3 d for the risky paths |
| Only tested on headless Chromium. High quality tier is on by default | 3–5 d for a device matrix |
| 8 levels, roughly 45–90 min of human play (J). Levels are bundled into the JS | 1–1.5 d per level, 2 d to load levels remotely |
| Saves are localStorage only | 8–12 d for plan §6 |
| English only | 3–4 d |
| No privacy handling, crash reporting or support path | 1–2 d |
| Licences for the 58 breed sprites and the Cat Paw font are not confirmed. No licence file found in `cat-assets` | human, 0.5 d |

## 3. Best-case scenario

All numbers are **(J)** unless tagged. The earlier strategy drafts had plans reaching 1M plays by March. Those depended on portal featuring nobody has promised, so they are dropped here.

| | 3 months (Dec 2026) | 6 months (Mar 2027) | 12 months (Sep 2027) |
|---|---|---|---|
| Levels | 12–16, plus Daily Heist | 20–24, plus a weekly rescue level | 30+, plus a Steam demo |
| Cumulative plays | 15–40k | 60–150k | 200–500k |
| Revenue per month | $0–300 | $300–1,500 | $1–4k |
| Accounts created from the Heist | 300–1,000 | 2–5k | 8–15k |
| Partner shelters | 2–5 | 8–12 | 15–25 |
| Traced adoptions or sponsorships | ≥10 | ≥50 | ≥150 |
| Recognition | Steam Coming Soon page, G4C entry drafted | G4C and Wholesome Direct filed | Next Fest June 2027 done, 10–20k wishlists |

The revenue anchor is the monetisation brief's benchmark of $100–1,500 a month for a short HTML5 game (E, derived from Cinevva). The top of the range assumes a portal features the game.

**Realistic case:** about a third of these player numbers, with the shelter network, the Steam page and the press as the lasting assets.

**What must be true**
1. Humans can finish it: at least 70% complete level 1, and at least 40% complete levels 1 to 3.
2. A portal promotes it past Basic Launch. Portal reach is the whole top of the range.
3. The solver pipeline produces at least one level a week.
4. It runs acceptably on low-end Android and in mobile WebViews: p95 frame time of 33 ms or less (E, plan §7).
5. Shelters supply consented cats every week.
6. The builds stay strictly free of crypto.

## 4. Strategy: phases

| Phase | Dates | Goal | Exit criteria |
|---|---|---|---|
| **0: Hygiene, playtest, telemetry** | Sep 28 – Oct 18 | Safe, measurable, and fun to play | CI green. Icon replaced. 5–8 playtests done. Level 1 completion ≥70% in playtests. Telemetry live with consent. Licences cleared. Risky paths reviewed |
| **1: Launch channels** | Oct 19 – Dec 2026 | Real players and a repeatable content rhythm | Poki decision taken. Standalone page live with local saves. A portal live. ≥12 levels plus Daily Heist before submitting to a portal. 5k plays with a funnel |
| **2: Ecosystem funnel** | Dec 2026 – Mar 2027 | Turn players into accounts and rescues | Completion on levels 1–3 ≥40% (the gate). Backend replay branch shipped first. Saves through `/live`, 100% replay-verified. Rescue moment auditable on `/impact`. Payment fixes merged |
| **3: Scale, cosmetics, UGC, co-op** | Apr 2027 onward | Retention and revenue | Portal-level D7 ≥8%. IAP and Stripe cosmetics with server-side prices. Level editor (with solver-gated sharing) only if Daily Heist retains. Co-op only if the M5 gate passes |

**Capacity rule (J):** run one track per month. Phase 0 and Phase 1 together take about 25–30 d, which is more than one person-month. Either the main-app roadmap pauses for October, or these dates slip one to one.

## 5. Next 30 days

| Week | Task | Owner | Effort |
|---|---|---|---|
| **1 (Sep 28–Oct 4)** | Commit `catnip-heist/`, add CI (tsc, vitest, e2e), add CODEOWNERS | Agent | 0.5 d |
| | Replace the catnip icon with a sprig or paw | Agent draft, human approves | 0.5 d |
| | Fix the blank level-select screen and the Results count-up. Merge stars and paws into one rating | Agent | 1 d |
| | Add PostHog EU events: start, spotted, quit tick, win, stars, fps, device tier, "meet the real cat" click. Telemetry never writes scores. Add a consent banner and a privacy policy entry | Agent builds, human decides consent basis | 2 d + 0.5 d |
| | Start on the low tier when `deviceMemory` is 4 or less | Agent | 0.25 d |
| | Confirm licences for the sprites, voxels and Cat Paw font | Human | 0.5 d |
| | Human review of the storage, network and future SDK surfaces. Add a CI check that the Heist build contains no `/live` call | Human + agent | 1.5 d |
| | Submit to Poki and request the carve-out | Human | 0.25 d |
| **2 (Oct 5–11)** | 5–8 moderated remote playtests (Zoom) plus an unmoderated cohort of about 20–30 from an owned channel (a human picks which) | Human | 3 d |
| | Contact 5 shelters from the network, aiming for 1–2 signed. Write the consent and takedown template | Human | 1.5 d |
| **3 (Oct 12–18)** | Retune par times and cone readability from the data | Agent | 1.5 d |
| | Load levels from remote JSON. Add a slot for the "Rescue Cat of the Week" | Agent | 2 d |
| | 2 new levels, one of them a Black Cat Day theme | Agent | 2–3 d |
| | Add crash and context-loss reporting and a bug-report link | Agent | 0.5 d |
| **4 (Oct 19–25)** | Poki gate on Oct 19. If there is no written yes, choose go-wide | Human | 0.25 d |
| | Start Daily Heist: seeded level plus an emoji share grid. No leaderboard until replay verification exists | Agent | 3–4 d |
| | Standalone page soft-launch build. Check the rescue copy is accurate ("featured cat", not "you saved this cat", until `/impact` mapping exists) | Agent + human | 1 d |
| | Short press kit. Start recording replays for ai-ugc clips | Agent | 1 d |

**Totals:** about 17–21 agent days and about 8–9 human days (recomputed after the September 2026 scope change; a human should confirm). The Oct 27 soft launch is the standalone page, with one shelter post.

## 6. Distribution channels ranked

Reach figures are (J) for the first 6 months.

| # | Channel | Why | Requirements (E) | Effort | Expected reach |
|---|---|---|---|---|---|
| 1 | **Poki** (if it gives a carve-out) | 100M monthly players. Revenue share plus marketing, and it can publish to YouTube Playables | 5-year web exclusive. No IAP or crypto, kid-safe, SDK | 2–3 d | 0–500k. Selective |
| 2 | **CrazyGames** (if go-wide) | Non-exclusive, fast, large audience | Basic Launch needs no SDK. Full Launch needs the SDK, gameplay within 20 s and PEGI 12 | 1 d Basic, +2–3 d Full | 5–150k |
| 3 | **tokentails.com/heist, then in-app embed** | Owned, converts to accounts | Embed with `dynamic(ssr:false)`. Saves only after replay verification. Capacitor waits for static export | 1 d, later 8–12 d | 2–10k |
| 4 | **Steam** (demo, Electron) | Showcases and wishlists | $100 fee, AI-content disclosure. No NFT or chain mention anywhere on the page | 3–4 d | 1–20k wishlists |
| 5 | **itch.io / Newgrounds** | Feedback and devlogs | HTML5 zip. Counts as web under a Poki exclusive | 0.5 d | 1–5k |
| 6 | **Y8, then GameDistribution** | Long tail | Syndication cannot be undone, so put it last | 1–2 d | 5–30k |
| 7 | **Reddit Devvit** | Daily Heist suits it | Needs a port. Payout tiers start at 250 installs | 5+ d | Unknown |
| — | Skip: Discord (until co-op exists), YouTube Playables (invite only), standalone app stores (Apple 4.2 risk), Facebook (web games end 2026-09-30) | | | | |

## 7. Monetization

**Do**
- **Portal ads** between levels, plus **rewarded ads** that grant a hint, a retry that keeps collected loot, or a 24-hour cosmetic trial. Ads **never** grant catnip. Catnip is a capped sum of per-level best scores with no spend endpoint, and anything above the caps trips the leaderboard cheat filter (E, `docs/BACKEND.md:125,139,142`). An ad reward that wrote catnip would also be a second write path, which is not allowed (E, CLAUDE.md).
- **"Meet the real cat" upsell** at the rescue moment, on owned channels only (portals restrict outgoing links). It links to the existing SHELTER flow. This is probably the biggest lever (J).
- **Published % of proceeds pledge.** Apple allows a proceeds claim. The MB is not a nonprofit, so donations happen outside the app (E, Apple 3.2.2(iv)).

**Later (Phase 3)**
- Cosmetics through Apple IAP and Stripe on the web. Start with 10–15 voxel accessories.
- Before this goes live, fix the known payment bugs as a scoped PR with a named owner: prices come from the client, there is no receipt verification, and reward paths swallow errors in empty catches (E, `BACKEND.md:183,286,293`).
- Leave out the 4 cigarette accessories (E, `cat-assets/`). This is not a week-1 task today, because the Heist has no accessory code.

**Don't**
- $TAILS, NFTs, wallets or token rewards. The MiCA white paper and CASP concerns, and the MB's inability to take investors both argue against it (E, `funding/PLAN.md:19-33`). Steam and Poki ban it.
- Paid level packs or a season pass before there is D7 retention data.

**Sponsored level pilot** with a pet-food brand: only after about 50k plays a month (J).

## 8. Growth playbook (top 8)

1. **Rescue Cat of the Week.** A real adoptable cat, used with consent, that the shelter posts to its own followers. For comparison, a Stray raffle raised $7k from 550 donors in a week for a shelter (E, WHYY 2022). That was money raised, not adoptions.
2. **Daily Heist with a spoiler-free emoji share grid.** The Wordle mechanic (E). The sim is already seeded. It ships before any portal submission because portals judge early retention.
3. **Seasonal hooks:** Black Cat Day (Oct 27, soft launch), Halloween (Oct 31), Giving Tuesday (Dec 1), International Cat Day (Aug 8).
4. **Portal launch** of the crypto-free version.
5. **Build-in-public dev-log.** The angle is "AI agents plus a solver that proves every level is winnable". Post Show HN, r/threejs and the three.js forum **after about a month of real numbers**, because a first HN spike can't be repeated. Lead with the rescue story and technical rigour to avoid the "AI slop" reaction.
6. **Short clips from ai-ugc** built on real `?replay=` footage, with AI video only for wrappers (E, `/Users/zygimantasbagdzevicius/me/apps/ai-ugc/README.md`). These support other channels rather than drive discovery on their own (E, GameDiscoverCo on Little Kitty, Big City).
7. **"Stream for Strays" weekend** with charity cat streamers around Giving Tuesday. Cats Protection's streamer programme has raised over £52k (E).
8. **Open-source the solver and voxel converter** in Dec to Jan as tech-press material.

## 9. Funding & competitions

Exclusions are respected, and only remote programmes are listed. **No cash programme clears the >10% bar (E, funding brief; `funding/HIGH-PROBABILITY-OPPORTUNITIES.md`).**

| Name | Deadline | Amount | Remote | Est. chance | Action |
|---|---|---|---|---|---|
| Steam Next Fest June 2027 | Register by 2027-04-25; demo by 05-17 (E) | Exposure; $100 fee | Yes | ~100% entry (E) | **Do.** Coming Soon page in Dec. Choose June over Feb (Feb registration closes 2027-01-10) |
| Games for Change Awards 2027 | ~mid-Feb 2027 (J; 2026 edition closed 02-16, E) | Award; $75 fee | Yes, attendance optional (E) | Finalist 5–10% (J) | **Do** if the release date falls in the window. Enter under Impact with traced rescues |
| Wholesome Direct 2027 | ~2027-03-20 (J) | Exposure; free | Yes | 3–8% (J) | **Do**, reusing the same trailer |
| Cursor Vibe Jam 2027 | Not dated | Prizes (2026: $25k top) | Yes | 1–2% (J) | Only as a new spin-off, and only if it returns |
| GDWC | Season not announced | Small | Yes | <5% (J) | Enter once it opens (low effort) |
| Creative Europe MEDIA Video Games Dev 2027 | ~Feb 2027 (J) | Up to €200k at 60%, so about €133k co-funding (J) | Yes | 6–9% (J; base rate ~13%, E) | **Excluded** unless the team lowers the bar. It would need a new narrative non-puzzle project, a change to the MB's main activity and NACE code, a sales report, and co-funding |
| EIT C&C Shape | 2027, not dated | €100k+ | Not remote, and involves equity | 3–5% | **Drop** |

## 10. KPIs & decision gates

| Metric | Kill or rethink | Continue | Double down |
|---|---|---|---|
| Level 1 completion (playtests, then live) | <40% after 2 tuning rounds | 50–70% | ≥70% |
| Completion of levels 1–3 | <20% | 20–40% | ≥40%, which opens Phase 2 |
| D1 / D7 (web) | <10% / <3% | 15–25% / 4–8% | ≥25% / ≥8% |
| Plays per month by the end of Dec | <2k | 2–20k | >50k or a portal feature |
| Daily Heist share rate | <1% | 1–5% | ≥5% |
| "Meet the real cat" click-through (owned channels) | <1% | 1–5% | ≥5% |
| Adoptions or sponsorships per quarter | 0 with shelters engaged | 1–10 | ≥10 |
| p95 frame time, low-end Android | >50 ms | 33–50 ms | ≤33 ms |
| Crash or context-loss sessions | >3% | 1–3% | <1% |
| Replay rejections (Phase 2) | >5%, so investigate | ≤2% | — |

"Kill" means freezing the Heist at maintenance level: no new levels, and team time returns to the main app.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Launching on owned channels before account saves are verified | Local saves only until G2 layer 3. The replay-verified branch of `/live` is in place (task 3b): unknown types get 400 and Heist saves need a replay the server re-simulates. (Corrected 2026-10-01: the backend never accepted unknown types at a 420 cap once the strict DTO landed.) |
| Capacity overrun | One track per month. Main app on hold in October, or dates slip |
| Poki exclusivity trap | Build stays private. Hard gate on Oct 19. Carve-out in writing |
| Humans don't find the swap mechanic fun | Phase 0 playtests before any launch spend |
| Consumer-protection exposure from rescue claims | Wording is "featured cat" until the `/impact` mapping is auditable |
| Shelter consent and data | Written consent, a takedown SLA, no donor personal data in the game |
| Privacy (PostHog on portals and the standalone page) | Consent decision and a policy entry in week 1 |
| IP and AI disclosure | Licence check. Steam AI-content disclosure. Font licence |
| Age rating (icon, PEGI 12, IARC when embedded in the app) | Icon replaced in week 1. IARC update before the in-app release |
| Payment bugs before IAP | Scoped PR with an owner, before Phase 3 |
| Content runs out | Remote JSON levels and one level a week |
| Crypto leaks into the Heist | Separate build and repo checks. No NFT copy on Steam or portal pages |

## 12. Open decisions for the team

1. **Poki exclusive or go wide?** Recommended: try Poki with a hard deadline of Oct 19, then go wide.
2. **Pause the main app in October to staff Phase 0 and 1?**
3. **Consent basis for telemetry** (consent banner vs legitimate interest).
4. **Heist catnip caps per level and per day, and whether loaner cats earn.** About 0.5 d of human time, needed before Phase 2.
5. **Lower the >10% bar for Creative Europe 2027?** Default is no.
6. **Which 1–2 shelters to approach first, and who owns that relationship.**
7. **Owner for the payment-bug PR.**
8. **Steam: Next Fest in June 2027** (recommended) or February.

## 13. Sources

Repo (E):
- `/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/README.md`, `package.json`, `src/`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/docs/plans/catnip-heist-3d.md` (§6, §7, §9, §11, §12; lines 42 and 143–173)
- `/Users/zygimantasbagdzevicius/me/tokentails-app/docs/BACKEND.md` (lines 125, 139, 142, 183, 286, 293)
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/PLAN.md` (lines 19–33, 164–169, 268, 285, 436)
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/HIGH-PROBABILITY-OPPORTUNITIES.md`, `ALL-OPPORTUNITIES.md`, `FRESH-SWEEP-2026-09-28.json`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/cat-assets/`
- `/Users/zygimantasbagdzevicius/me/apps/ai-ugc/README.md`
- `CLAUDE.md`

Web (read or searched 2026-09-28):
- Poki deal types: developers.poki.com/guide/revenue-deal-types
- Poki requirements: sdk.poki.com/new-requirements
- CrazyGames docs: docs.crazygames.com/requirements (intro, technical, quality) and /payouts
- Cinevva guides: app.cinevva.com/guides/publish-game-crazygames and /web-game-monetization
- Steam Next Fest: partner.steamgames.com/doc/marketing/upcoming_events/nextfest/feb_2027 and presskit.gg/field-guides/next-fest-scheduling-registration
- Steam blockchain ban: pcgamer.com/steam-bans-nfts-cryptocurrencies-blockchain
- Apple review guidelines: developer.apple.com/app-store/review/guidelines and forum thread 799549
- Games for Change: festival.gamesforchange.org/2026-awards-categories
- Creative Europe 2026 call fiche (CREA-MEDIA-2026-DEVVGIM) and the 2025 results portal
- Stray shelter raffle: whyy.org/articles/stray-video-game-helping-real-cats
- Little Kitty, Big City: newsletter.gamediscover.co/p/how-little-kitty-big-city-purred
- Cats Protection: cats.org.uk
- Facebook web games sunset: ppc.land/meta-announces-web-games-sunset-by-september-2026
- Reddit Developer Funds H2 2026 terms (search snippet only; the page returned 403)
