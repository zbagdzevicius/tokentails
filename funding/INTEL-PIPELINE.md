# Funding intelligence pipeline — how to see the money without living on X

**Verified 2026-09-22/23.** Every channel below was probed live. Dead ones are listed as dead so
nobody re-tries them.

## The core insight

You framed the problem as "most of the info goes through X." That is half true and the half that is
false is the useful half.

X is where funding news is **amplified**. It is almost never where it **originates**. Three
categories of channel sit *upstream* of the tweet:

| Upstream channel | Lead time vs X | Why |
|---|---|---|
| DAO governance forums (Discourse) | **days to weeks ahead** | A grant program must be proposed, discussed and voted before it can be announced. The thread carries exact amounts and eligibility that the tweet omits. |
| Chain registries on GitHub | **days to weeks ahead** | A new chain must merge a PR into `ethereum-lists/chains` to appear in wallets. You see chain ID, RPC and explorer before marketing exists. |
| Program pages themselves | **zero lag** | SCF publishes round deadlines weeks ahead. YC, Alliance, EIC publish calendars a year ahead. No monitoring required at all — just a calendar. |

And for the genuinely X-first residue, a paid read-only X API costs single-digit dollars a month —
far less than the effort of scraping mirrors.

So the pipeline has four tiers, cheapest and highest-signal first.

---

## Tier 0 — Calendar, not monitoring (free, zero maintenance)

These publish their dates in advance. Monitoring them is wasted effort; put the dates in a calendar
and work backwards.

| Source | URL | What to calendar |
|---|---|---|
| Stellar Community Fund awards | `communityfund.stellar.org/awards` | Round number + submission close. Poll monthly. |
| EIC Accelerator | `eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en` | Cut-offs published a year ahead |
| Eurostars / Eureka | `eurekanetwork.org/programmes-and-calls/eurostars/` | Two cut-offs a year |
| Innovation Agency Lithuania | `inovacijuagentura.lt` (kvietimai list) | National calls; server-rendered, so cron+diff works |
| EU structural-funds calls (LT) | `esinvesticijos.lt/kvietimai`, filtered to Inovacijų agentūra | Where the actual GameTech-style grant calls are published |
| Startup Lithuania open calls | `startuplithuania.com/open-calls/` | Five open calls listed as of 2026-09-23 |
| GameTech Vilnius revival sentinel | `gametech.gamebcn.co/wp-json/wp/v2/pages?per_page=50` | Alert when page id 839's `modified` changes from `2025-09-25T15:08:35` — the cheapest signal that a 4th edition is funded |
| SCF project page | `communityfund.stellar.org/project/token-tails-gov` | Your own award history — what every SDF reviewer sees |
| Y Combinator | `ycombinator.com/apply` | Batch deadlines — every aggregator gets these wrong, check the source |
| Alliance DAO | `alliance.xyz` | Cohort code + deadline in the hero; 3 cohorts/year |
| a16z SPEEDRUN | `speedrun.a16z.com/apply` | Priority windows |
| Orange DAO Fellowship | `orangedao.xyz` | Cohort dates on homepage |
| Colosseum | `colosseum.com/hackathon` | Two hackathons a year — late March and late August |
| Accelerator Atlas | `acceleratoratlas.com/deadlines` | **Has per-vertical ICS calendar feeds + a free weekly digest** — the single best structured ingest found |
| Causo Hub | `hub.causo.ai/deadlines` | 381 programs, 108 rolling, free, no signup. One HTML page — weekly cron+diff |

**Do this first.** Tier 0 alone covers most of the money in this report and costs nothing to run.

---

## Tier 1 — Upstream origin sources (free, RSS/JSON, zero lag or better)

### Governance forums — the highest-value non-X channel

Every Discourse instance exposes the same fixed paths. No auth, no key.

```
<forum>/latest.rss                      # everything
<forum>/c/<category-slug>.rss           # grants category only
<forum>/latest.json?order=created       # for scripts
<forum>/search.json?q=grant%20after:2026-09-01
```

Verified live:

- `gov.optimism.io/latest.rss` — Builder Grants, Missions, Retro Funding rounds
- `forum.arbitrum.foundation/latest.rss` — DAO grant programs, treasury allocations
- `gov.gitcoin.co/latest.rss` — GG round design, matching pools, partner rounds
- `forum.skale.network` — SIP-6 Growth Allocation is being debated here right now
- `forum.giveth.io` — next QF round announcements

Build one OPML of the forums for every chain you care about. Poll every 30 minutes.

### New-chain registries — see a chain before it has marketing

| Feed | Signal |
|---|---|
| `github.com/ethereum-lists/chains/commits/master.atom` | **Earliest possible signal.** Every EVM chain must land a PR here. Filter titles on `add` + `Mainnet`/`Testnet`. |
| `github.com/electric-capital/crypto-ecosystems/commits/master.atom` | Fires when a chain becomes machine-visible as an ecosystem. Grep `Add .* ecosystem`, then watch the GitHub orgs named in the added TOML. |
| `api.llama.fi/v2/chains` | Free, no key. Daily cron, diff the `name` set. A chain crossing $1M TVL inside 30 days = a live incentive program. |
| `l2beat.com/api/scaling/summary` | Free JSON. The `stack` badge (OP Stack / Orbit / ZK Stack) predicts which ecosystem fund the chain can tap. Also `l2beat.com/scaling/upcoming`. |
| `chainlist.org/rpcs.json` | New mainnets appear the moment RPC registration merges |
| `portal.caldera.xyz` | **Pre-fame layer.** Chains appear with a "Testnet" badge months before any incentive announcement. ~75 chains, cheap to snapshot daily. |
| `api.growthepie.com/v1/master.json` | Curated — use as the "is this chain real" filter, not for discovery |

### Foundation blogs (primary source, not a mirror)

Nearly every foundation exposes `/feed.xml`, `/rss.xml` or `/feed/`. Verified:
`blog.ethereum.org/en/feed.xml`, `solana.com/news/rss.xml`.

### The opportunity itself, as JSON

- `superteam.fun/api/listings?take=50` — unauthenticated JSON: `title`, `rewardAmount`, `token`,
  `deadline`, `type`, `slug`. **Note: `earn.superteam.fun/api/...` now 308-redirects — update old
  scrapers.** Solana-weighted, so low relevance for Token Tails, but it is the cleanest example of
  the pattern.
- `github.com/w3f/Grants-Program/pulls` — live grant applications as public PRs. **Read the merged
  ones to reverse-engineer what a winning proposal looks like.** Same pattern at
  `filecoin-project/devgrants`. This is an answer key, not a news feed.

---

## Tier 2 — X itself, priced correctly

Do not scrape mirrors. The Nitter era is over:

- **xcancel.com — DEAD.** HTTP 451, legal takedown; X Corp C&D 2026-08-24, shut 2026-08-26.
- **Nitter upstream repo archived read-only 2026-09-11.** Surviving instances are behind
  proof-of-work walls or 502-ing. Do not build on them.
- **OpenRSS, RSS-Bridge TwitterBridge** — not usable today.
- **RSSHub** works only if you self-host with your own logged-in X cookie — against ToS, ban risk.

Use a paid read API instead. Both verified live:

| Option | Cost | Notes |
|---|---|---|
| **TwitterAPI.io** | $0.15/1k tweets, $0.18/1k profiles, no monthly fee | ~200 accounts × 8 posts/day ≈ **$7/month**. Has `advanced_search` for keyword alerts. **Recommended.** |
| TwexAPI | $0.05/1k tweets | Ships a native **MCP server** — wire it directly into Claude Code as a tool |
| Official X API v2 | $0.005/post read, $0.010/user read | ~$240/month for the same coverage. ToS-clean. Only if you need compliance cover. Legacy Basic/Pro tiers closed to new signups. |

Keyword queries worth standing up: `"applications open"`, `"grants are open"`,
`"incentivized testnet"`, `"ecosystem fund"`, `"RFP"`, `"grant program"` + `deadline`.

### Cross-post mirrors (free, partial coverage)

- **Farcaster** — genuinely crypto-native; Base/OP ecosystem news sometimes lands *ahead* of X.
  `api.farcaster.xyz/v2/*` is unauthenticated. Keyword search via Neynar (free tier).
- **Bluesky** — `bsky.app/profile/<handle>/rss` is native RSS, zero auth. Coverage of crypto
  foundations is thin but growing. `public.api.bsky.app/xrpc/app.bsky.actor.getProfile` works
  unauthenticated **if you send a browser User-Agent**; `searchPosts` needs a Bearer token from a
  free app password.

---

## Tier 3 — Aggregators and breadth (free, days behind — the safety net)

| Source | URL | Note |
|---|---|---|
| Karma Funding Map | `karmahq.org/funding-map` | Open programs with live amounts and end dates, plus grantee milestone history |
| Web3Grants.co | `web3grants.co` | 200+ programs, ~48h refresh, free email digest |
| Blockchain Academics | `blockchainacademics.com/grants` | 225 grants / 166 funders incl. AI, cloud, government. Weekly. Free deadline alerts |
| awesome-web3-grants | `github.com/zkprimecapital/awesome-web3-grants` | Subscribe to `/commits/main.atom` — free zero-maintenance alert on new programs |
| Questbook | `questbook.app` | Hosts live rounds; Circle and Arbitrum apply here |
| Nodes.Guru testnets | `nodes.guru/testnets` | Active + upcoming incentivized testnets. No RSS — scrape and diff |
| AirdropAlert farm list | `airdropalert.com/farm/` | Every row carries an "Added <date>" stamp — trivially diffable |
| Luma crypto | `luma.com/crypto` | 916 events. ICS per organizer at `api.lu.ma/ics/get?entity=calendar&id=<id>` — harvest ids from organizer pages |
| HackQuest | `hackquest.io/hackathons` | Best crypto hackathon board that fetches cleanly; live countdowns |
| TAIKAI | `taikai.network/en/hackathons` | **EU-weighted** — surfaces non-crypto EU public money (CASSINI, Copernicus) crypto teams can enter |
| Google News RSS | `news.google.com/rss/search?q=...` | Free unlimited keyword feeds. Hours-to-a-day behind. Pure safety net |
| The Block | `theblock.co/rss.xml` | Fastest mainstream newsroom feed |
| Chainwire | `chainwire.org/newsroom/` | Press-release wire — carries the *full detail* a tweet omits. Poor S/N, filter hard |

### Dead or broken — do not retry

`web3grants.tech` (DNS gone) · `grants.gitcoin.co` (moved — use `gov.gitcoin.co` RSS) ·
`Dev-Rel-as-a-Service/Web3Grants` (404) · `api.llama.fi/raises` (HTTP 402, now DefiLlama Pro) ·
`blockworks.com/feeds/rss` (404 — use `blockworks.co/feed`) · `earnifi.xyz` (parked, for sale) ·
`app.onlydust.com` (shut down) · GlobeNewswire blockchain subject feed (mis-categorised, dominated
by securities class-action PR).

**Bot-walled, needs a headless browser:** Galxe (`app.galxe.com/quest`, client-rendered),
Layer3 (403), DoraHacks (405), CryptoRank (403), Commonwealth (403), Octant (403), Cookie.fun.
403 is bot protection, not death — verify in a real browser before writing them off.

---

## The build: one weekend, ~$12/month

```
n8n (self-hosted, Docker, ~$5/mo VPS)
├── RSS Feed Trigger  ×N   → Discourse forums, GitHub .atom feeds, foundation blogs, dev.events
├── HTTP Request      ×N   → llama.fi/v2/chains, l2beat summary,
│                            chainlist rpcs.json, caldera portal, superteam listings
├── HTTP Request      ×1   → TwitterAPI.io advanced_search (keyword alerts, ~$7/mo)
├── Keyword filter         → grant|testnet|ecosystem fund|applications open|accelerator|RFP|
│                            cohort|deadline|hackathon
├── Dedupe on URL/id       → persisted store
└── Output                 → email digest, twice daily
```

Poll interval 5–15 min for Tier 1–2, daily for Tier 3. Subscribe Accelerator Atlas's ICS feeds
directly into the team calendar so deadlines arrive without any code at all.

**Sequence:** Tier 0 (a calendar, one afternoon) → Tier 1 (forum + GitHub RSS, half a day) →
Tier 2 (TwitterAPI.io, an hour) → Tier 3 (optional).

Tier 0 and Tier 1 together catch the large majority of what matters. Do not build the whole thing
before applying to anything — the deadlines in `OPPORTUNITIES.md` are the priority.
