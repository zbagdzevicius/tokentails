# Aligned opportunities and warm intros (checked 2026-09-28)

**Result: no new opportunity clears the >10% bar today.** Six research sessions found 23 candidates.
Ten looked above 10%. An adversarial re-check against the live pages (WebFetch, 7 agents, plus a
critic pass) refuted all ten: programs are dead, pages are gone, entry counts grew, or the "funder"
turned out not to fund anything. The real lever is still the one already in the portfolio: **deploy
ShelterSplit with real USDC flow, then apply to Circle Developer Grants / Arc.** What this round
added is a cheap, verified **discovery and warm-intro system**.

## 1. Verification results

| Candidate | Claimed P | Verified P | Verdict | Why |
|---|---|---|---|---|
| Celo Proof of Ship | 30% | ~1% | DROP | Run by Talent Protocol, which shut down (announced 2026-08-19). The final campaign ended 2026-07-27. Karma lists 0 open Celo programs. |
| Base Builder Rewards (Talent) | 20% | 0% | DROP | Same shutdown. It also paid individuals, not the MB. |
| Uplifting Game Jam | 17% | ~7% | WATCH | The Sep 2026 edition had 73 entries for 5 paid places, and the pool shrank to $265. Enter only if an edition looks like ≤50 entries. |
| Base Builder Grants | 15% | ~3% | WATCH | The 1–5 ETH post is from 2023. The current Base offer is ≤$5k and needs real Base-mainnet activity. Other Base funding is equity. |
| Circle Developer Bounties | 12% | ~2% | DROP | The only round is from 2024. No 2026 group is verifiable. |
| Appodeal jam | 12% | 0% | DROP | The page is gone (404). The accelerator is publishing/UA money, which is investment-like. |
| Anima International (AI × animals) | 50% | 0% | DROP (network only) | Not a funder, and the article names no funder network. |
| Falcon Fund (Manifund) | 5–30% | ~1% | DROP | No inbound form. It funds AI and policy work for farmed animals, not consumer apps. |
| Circle Alliance | 45% | 0% | Warm-intro only | A directory with no cash. It needs a live Circle integration first. |
| The Digital PawPrint | 30% | 0% | DROP | Media only, dormant since Feb 2026. |
| New jams (Micro Jam 066, Eclipse $500, Comfy Autumn) | – | 0–4% | DROP | Big fields, cash tied to sponsor tools, or AI banned. |

Below 10% from the start: AI-video contests (Chroma, PixLight, NEXT ART, OpenArt), other
animal-welfare funders (SFF, Innovate Animal Ag), GoodDollar and Prezenti.

Raw data: `ALIGNED-VERIFIED.json` (in this folder).

## 2. The one path above the bar (already tracked)

Circle Developer Grants (`portfolio/opportunities.json` → `circle-developer-grants`, watch source
`circle-grants`). The grants are live, rolling, milestone USDC and not equity; Arc is the priority.
The estimate is 10–20% **after** ShelterSplit is on Arc with real payouts, and ≤5% before.
Circle Alliance membership then becomes a free credibility add-on.

## 3. Warm-intro and discovery system

### 3.1 Sources now in Track E (`tracks/e-monitor/watchlist.json`, all scanned OK today)

| id | What it catches | P(reply) to a good post |
|---|---|---|
| `celo-forum` | MiniPay/game launches, public-goods calls (staff reply to launches) | 10–15% |
| `arbitrum-grants-ecosystem` | New Arbitrum grant programs, RFPs, the audit subsidy | 3–5% |
| `optimism-grants` | Builder grant cycles (mostly infra) | ~2% |
| `ea-forum-new` | Animal-welfare funding calls (keyword-filtered) | <3% money, ~10% feedback |
| `lightbear-jams` | New Uplifting Game Jam editions (feeds orc) | – |
| `karma-funding-map` | New rounds on Karma's funding map | – |
| `gitcoin-campaigns` | A GG25 announcement | – |
| existing `circle-grants`, `arbitrum-forum` | Circle grant page changes, the Arbitrum forum | – |

Removed `lt-travel-subsidy-2026-h2` (the subsidy was dropped).

Run it daily: `node bin/fund.mjs e:scan && node bin/fund.mjs e:triage --run --apply`.

### 3.2 X (Twitter) without the official API

nitter.net is dead and xcancel is blocked (451). The cheapest reliable option is
**twitterapi.io**: $0.15 per 1k tweets, no minimum. Ten queries every 6 h cost **≈$3.60/month** at
worst. rss.app costs $8.32/month for 15 feeds, and its free tier (2 feeds) works as a fallback. Both
need an account and key from you; the key goes in an env var, never in this repo.

Queries (they work in X search, twitterapi.io `advanced_search` and rss.app):

1. `("looking for projects" OR "looking for builders" OR "calling all builders") (grant OR grants OR funding) -filter:replies lang:en`
2. `("we're funding" OR "we are funding" OR "now funding") (games OR gaming OR "mini apps") -filter:replies`
3. `("DM me" OR "reply with") ("building on" OR "what are you building") (cats OR pets OR "animal welfare" OR shelter)`
4. `(RFP OR "request for proposals") (Celo OR MiniPay OR Arbitrum OR USDC OR Arc) -filter:replies`
5. `("grant program" OR "grants round" OR "builder grants") (consumer OR games OR "social impact") -filter:replies min_faves:5`
6. `("animal welfare" OR "animal shelter" OR rescue) (web3 OR onchain OR USDC OR stablecoin)`
7. `(MiniPay "mini app" OR "minipay games") -filter:replies`
8. `(from:circle OR from:arc) (grant OR builders OR "office hours")` (confirm the handles by hand)
9. `("show me your" OR "drop your") (game OR "web game" OR "browser game") -filter:replies`
10. `("office hours" OR "demo day") (Celo OR Arbitrum OR Circle) builders`

Pipeline:
- Cron every 6 h pulls the queries and the Track E feeds and dedupes by id.
- An LLM scores each item 0–3 on "asks for projects AND fits games/cats/USDC".
- Items scoring 2 or more go into one daily digest with a pre-filled reply from §3.4.
- **A human approves and posts. Nothing auto-posts**, to avoid spam flags and so no one is contacted automatically.

Budget: about 15 minutes a day.

### 3.3 Warm-intro paths (public roles, shared surface)

| Role | Where to meet them | Move | P(reply) | Money it can unlock |
|---|---|---|---|---|
| Circle devrel / grants team | Replies to Circle/Arc builder posts (query 8), developer Discord office hours | Deploy on an Arc testnet, reply with a demo, ask which grant tier fits | 15–25% | Circle Grants |
| Celo / MiniPay ecosystem lead | `/celo` on Farcaster (public casting), a Celo forum Ecosystem post | Post "Token Tails on MiniPay" with a GIF; staff reply to launches | 15–20% | Celo public goods (unverified) |
| Arbitrum grants / audit program | Forum `grants-ecosystem`, governance calls | Ask about the Audit Program for ShelterSplit (in-kind, not cash) | 5–10% | Audit subsidy |
| Base builders | `/base-builds` (invite only) | Visibility only | ~5% | None (equity) |
| Shelters / rescue digital leads | Their public adoption channels | Offer a free 30-day feature of their cats with a click report | 10–20% | None directly; named shelters make every application stronger |
| Any grant reviewer | A free Karma project profile | Keep milestones current (tests → deploy → first payout) | – | Credibility |

### 3.4 Templates (fill every `{placeholder}` with real, checkable numbers; no token-sale language)

**A. X reply to a call for projects**
> Token Tails fits this: free browser games (Phaser, no install) whose characters are AI-drawn
> portraits of real shelter cats. Each cat is linked to its shelter, and our ShelterSplit contract
> pays that shelter in USDC automatically (41 Foundry tests, testnet today). Demo: {demo_url}.
> {players} players so far. Happy to share the repo or a 2-minute walkthrough.

**B. DM or email to an ecosystem lead**
> Hi {name}, I saw your {post/office_hours} about {program}. We build Token Tails: casual browser
> games where each playable cat is a real shelter cat, and a ShelterSplit contract routes USDC to that
> shelter. It is tested (41 Foundry tests) but not yet on mainnet. We'd like to deploy it on {chain}
> and run a {n}-shelter pilot. Would a 15-minute look at the demo ({demo_url}) be worthwhile, or is
> there a better program or person for this? Repo: {repo_url}.

**C. Pitch to a shelter or animal-welfare org**
> Hello {org} team, we make Token Tails, free browser games starring real adoptable shelter cats,
> drawn from your photos with your permission. Players meet {cat_name}, see your adoption link, and a
> share of what players spend on that cat goes to you, paid via {payout_method}. It costs you nothing
> and needs no crypto knowledge. Could we feature {n} of your cats for a free 30-day trial and send
> you a report of clicks to your adoption page?

Before sending C, check that `{payout_method}` and the share match what ShelterSplit actually does.

## 4. What would actually move the odds

1. **Deploy ShelterSplit on Arc** (and later Celo or Base) with one named shelter receiving real
   USDC. That unlocks Circle Grants (10–20%), Circle Alliance, a credible MiniPay post and the Base
   ≤$5k grant.
2. **Get a public repo and a named team.** Every reviewer asked for these.
3. **Sign one shelter partnership** (template C). It is the proof every animal-welfare and
   impact funder looks for.

## 5. Fresh sweep (2026-09-28, second pass)

This pass covered 7 areas: game grants, jams, crypto hackathons, ecosystem grants, pet and impact
funders, EU and Lithuanian public funding, and pay-every-qualifier programs. Each area was
adversarially re-verified, then a critic judged the survivors. Three web-search sessions also looked
for calls announced in the last 30 days (orc, $10). About 50 candidates were checked; **2 clear the
bar**. Raw data: `FRESH-SWEEP-2026-09-28.json`.

| # | Opportunity | Money | P | Human h | Deadline | Portfolio |
|---|---|---|---|---|---|---|
| 1 | **[Mezo Buildathon (AKINDO)](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10)**: build with MUSD | $7k in MEZO tokens (W1 $2k, W2 $5k), split pro-rata by points with no winner cap; EV ~$230 | **45%** = 0.65 accepted × 0.8 nonzero points × 0.9 KYB | ~10 | Pre-register **by Oct 15**; builds Oct 16–26 and Nov 2–15 | `mezo-buildathon` COND, Track A |
| 2 | [Anitya World Jam](https://itch.io/jam/anitya-world-jam-2700-in-prizes) | $1,000 / $700 / $400 + $600 in challenges | 11% (borderline: 3 places over an assumed 20–40 entries) | ~20 | Oct 21 | `anitya-world-jam` COND |

Why Mezo fits:
- ShelterSplit already exists in Solidity and Foundry. Adding MUSD as a donation currency and
  deploying on Base, Mezo, Ethereum or BNB is exactly what the program favours: "Teams that already
  have a working product and want to add MUSD/MEZO integration … are explicitly prioritized."
- Lithuania is not excluded.
- KYB (W-8BEN, ID, proof of address) is the human step.
- Risk: the prize is paid in MEZO tokens, so its value is volatile.

Anitya caveat: it is a no-code 3D tool, not Phaser. Confirm that you can import images, that AI
assets are allowed and that the payout reaches Lithuania before building.

**Watch (a real program, but under the bar today):**
- **Farcaster Developer Rewards:** weekly USDC to the top 100 mini apps, $56–$200 a week, P ≈ 10%.
  The ranking factor is unknown.
- **Reddit Developer Funds (Devvit):** a fixed payout per engagement tier, P ≈ 9%. The terms page
  returned 403, so country eligibility is unverified.
- **Cardano Catalyst:** the base rate is 10%, but fit pulls it to ~5%. No fund is open.
- **XRPL Grants:** new programming is announced for October 2026.
- **EIT Culture & Creativity:** gaming is excluded in 2026 but planned for the 2027 calls.

All five are now Track E sources: `farcaster-dev-rewards`, `xrpl-grants`, `catalyst-funds` and
`eit-cc-calls`, plus the Reddit terms page, which needs a browser.

**Notable refutations:**
- EIT Culture & Creativity Shape: a 3% equity call option and in-person events.
- EIT Innovation Projects: gaming is out of scope for 2026.
- NLnet Restack: infrastructure only.
- Unity for Humanity: Unity-only.
- RevenueCat Shipaton: new apps only, closes Sep 30.
- Meta VR Start: VR only.
- MIT Solve, AI for Good and Purina: under 2% or no open call.
- BNB and Rootstock grants: 5–6%, with payment currency unclear.
- Optimism Retro Funding: 0 OP budgeted until April 2027.
- ICP grants: paused.
- Lithuanian Council for Culture: the 2027 cycle closed Sep 9.

**Out of scope but worth knowing:** browser-game portals pay revenue share on every listed game:
GameDistribution (33% net) and Y8 (50% of ad revenue). This is income, not a grant. The Phaser
games could be listed with mostly AI labour. Consider it outside the funding track.
