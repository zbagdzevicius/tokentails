# Strategy proof: which asset gives the best odds (2026-09-28)

Method:
- An asset audit ran the real tests and builds.
- For each program, the live criteria and past winners were fetched (WebFetch only).
- Three strategies were scored independently: base rate × fit, with the arithmetic shown.
- An adversarial judge then corrected inflated numbers.

Raw data: `STRATEGY-PROOF-DATA.json`.

## Verdict

**The ShelterSplit-only plan is not the best, and nothing reaches a near-certain win.** The best
option is a hybrid: the ShelterSplit contract on Arc for the crypto programs, plus Catnip Heist's
voxel art reused as an Anitya World Jam entry. That gives **P(at least one win) ≈ 28–34%**, with
total EV ≈ $1,070. ShelterSplit alone gives 20–27%.

Catnip Heist is the most polished build in the repo: 120 unit tests, 8 solver-proven levels and a
static build. **But no open cash program scores that polish.**
- The crypto rubrics weight on-chain use, traction and infrastructure. The heist has none of these.
- Jams that suit it require new games, are closed, or ban AI assets.
- The DDA Gaming grants, which would have fit a game, are closed.
- Creative Europe wants a new concept from a studio that has already shipped a game.

## Strategies compared (after the judge's corrections)

| Strategy | P(≥1 win) | Total EV | EV per human hour |
|---|---|---|---|
| S1 ShelterSplit deploy wave (6 crypto programs) | 30% independent, ~20–25% correlated | $1,050 | $21 |
| S1-lean (without Mezo) | 27% / ~20% | $1,000 | **$26** |
| S2 Catnip Heist + ShelterSplit wired in | 32% | $1,098 | $17 |
| S3 Catnip Heist, game programs only | 15% | $92 | $1 |
| **Hybrid: S1-lean + Anitya (recommended)** | **34% / ~28%** | $1,070 | $17 |

The crypto entries all rest on the same unused contract, so their outcomes are correlated. Anitya
is judged on a different asset by different judges, which is why adding it raises the chance of at
least one win more than adding another chain does.

## Per program (recommended plan)

| Program | What to submit | P | Arithmetic | Money | Human h | Deadline |
|---|---|---|---|---|---|---|
| **Arc Microgrants** | ShelterSplit on Arc mainnet, public repo, disburse page | **15%** | 0.12 base (assumed ~20 slots / 100–200 entrants) × 1.25 fit | $500 | 18 | Oct 14 |
| Anitya World Jam | A new Anitya world built from GLB-exported Catnip Heist voxel assets | 10% (borderline) | 0.15 (3 places / ~20 entries) × 0.9 fit × 0.75 payout risk | $700 | 25 | Oct 21 |
| Colosseum World's Fair | Same repo, pitch and demo videos | 2% | ~23 general slots / ~1,250 submissions (history 1.0–2.8%) | $15,000 | 8 | Oct 12 |
| Arbitrum Dubai | ShelterSplit on Arbitrum | 5% | Slot count unpublished; the rubric weights code quality plus users | $5,000 | 4 | Nov 16 – Dec 6 |
| Team1 Avalanche | ShelterSplit on Avalanche | 5% | No criteria or counts published | $5,000 | 3 | rolling |
| Circle Developer Grants | Milestone proposal reusing the Arc deploy | 2.5% | Grantees are payments infrastructure; games are not a focus | $5,000 | 6 | rolling |
| Mezo Buildathon | (not recommended) | 5% | The rules penalise surface-level MUSD use; paid in tokens | – | 12 | Oct 15 |
| Arbitrum DDA Gaming | – | 0% | **Closed** | – | – | – |

**Correction to my earlier numbers:** I previously gave Colosseum 17%, Arbitrum Dubai 15%, Team1
25%, DDA 30% and Mezo 45%. Those came from the portfolio's own estimates and from a finder agent. The
adversarial check against criteria and past winners cuts all of them, and the portfolio is now
updated. Only Arc (15%) clears the 10% bar. Anitya sits exactly on it.

## The three changes that raise the odds most

| Lever | Lift | Hours |
|---|---|---|
| One real USDC payout to a named shelter through ShelterSplit on Arc, with a public tx on the demo page | Arc 0.15 → ~0.19; P(≥1) +~0.04 | 6 |
| Current, verifiable traction: last-30-day MAU, revenue, portrait sales, USD sent to shelters. Fix the Stellar traction claim that cites a SEI Dune dashboard. | Colosseum 0.02 → ~0.035; P(≥1) +~0.03 | 4 |
| Public build: commit and push, fix the one failing heist e2e (retry leak), deploy the heist to a static URL, and record a 2-minute video (shelter story, Arc payout, heist clip) | Arc and Anitya +0.01–0.02; avoids failing the public-repo gate; P(≥1) +~0.03 | 8 |

With all three, the hybrid reaches roughly **P(≥1 win) ≈ 0.38–0.44**.

## What this means for the funding plan

- **Keep the deploy wave, but aim it at Arc first.** Arc is the only program above the bar. Add
  the other chains only if cheap entries below the bar are acceptable to you.
- **Use Catnip Heist where it actually scores:** as source art for Anitya, and as the demo clip in
  the video. Don't lead with it for crypto programs.
- **Real traction is the biggest untapped lever:** 540k registered users and a 307k MAU peak are in
  the repo, but only as peak figures with a mismatched source.
