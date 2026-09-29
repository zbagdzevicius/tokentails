# High-probability opportunities (as of 2026-09-28)

The bar is a realistic chance of getting paid **above 10%**. Each P below comes from published
numbers, and the arithmetic is shown. Where a number had no source, the item was left out.

Other rules:

- Remote only.
- Grants, prizes, bounties, competitions and accelerators only.
- Excluded: BGA, Mantle, Stellar Community Fund, Giveth, Game3, Taiko (they owe the team money) and
  everything Solana.
- Programs already in the pipeline are not repeated here.

**Result: one survivor.** I did not pad the list.

## Survivors

| # | Opportunity | Deadline (quoted) | Money (quoted) | P and arithmetic | EV | Human min | Path | Payee |
|---|---|---|---|---|---|---|---|---|
| 1 | [Micro Jam 066: Toxic, "Best Games Made With Ziva" category](https://itch.io/jam/micro-jam-066) | "2026-10-03 01:00:00 to 2026-10-05 01:00:00". Late entries are accepted "6 hours after the submission window closes" via Discord. The page shows no timezone; UTC is assumed. | 1st "$30 USD + certificate", 2nd $25, 3rd $20, 4th $15, 5th $10, paid by "PayPal". That is 5 cash slots, $100 in total. "You can't win 2 prizes in the same category." | **P = 5 ÷ 25 = 0.20.** 5 paid Ziva slots, divided by at most 25 possible Ziva entrants. The 25 is itch.io's all-time count of games tagged ziva ("24 results", [tag page](https://itch.io/games/tag-ziva)) plus our entry. That count spans many jam editions and a separate Ziva game jam, so even if every Ziva game ever made entered this one jam, P would still be 20%. The whole of Micro Jam 065 had "54 entries" ([results](https://itch.io/jam/micro-jam-065/results)), and 066 has 65 members joined so far. | about $4 (0.20 × $20 mean prize) | 40 the first time, then 15 to 20 per edition | orc flow [`micro-jam-ziva-flow.json`](orchestrator/examples/micro-jam-ziva-flow.json). Track E watches the `micro-jam-itch` source. | The individual who holds the itch.io and PayPal accounts, not the MB |

**Human steps for #1:**

1. Install Godot 4 and the Ziva plugin, and sign in. The Hobby plan is free.
2. Keep the editor open during the jam so the agents can drive it through Ziva's MCP server.
3. Join the Micro Jam Discord. This is required: "To be eligible for prizes, you must be a member of
   our Discord community".
4. When the jam starts, copy the theme and the prerequisite into `JAM-OK`.
5. Play the build for 5 minutes, create the itch.io page, add the `ziva` tag and submit.
6. Have a PayPal account ready for the payout.

The rules state "Yes, AI is allowed."

**Risks with no source, not priced in:**

- Whether all 5 places are paid when fewer than 5 games enter the Ziva category.
- Whether past Ziva prizes were actually paid. The 065 results page lists only the Overall, Art,
  Audio, Polish, Fun, Theme and Prerequisite rankings. Sponsor-category winners are not shown
  there.
- Whether the rating process penalises a game that agents built.

**Repeatable:** Micro Jam runs every two weeks. 065 ran Sep 19 to 21, 066 runs Oct 3 to 5, and the
Ziva category has run since at least [Micro Jam 056](https://itch.io/jam/micro-jam-056). After the
one-time setup, each edition takes about 15 to 20 human minutes. That works out to about $12 to $16
EV per human hour, or roughly $8 to $10 a month. **The money is trivial.**

Pages fetched on 2026-09-28:

- https://itch.io/jam/micro-jam-066
- https://itch.io/games/tag-ziva
- https://itch.io/jam/micro-jam-065/results
- https://itch.io/jams/upcoming?q=micro+jam

## Near misses

These were rejected because they sit below the bar or because the P has no source.

| Item | Why it misses |
|---|---|
| [Nervos CKB Spark mini-grants](https://talk.nervos.org/t/spark-program-mini-grant-initiative/8752) | Q3 2026 topics show about 5 approved of 31 decided (16%). Fiber payment and splitting proposals went 0 for 8, including the closest analogs FiberSplit (t/10579) and FiberTap (t/10655). Thread t/10576 criticises AI-generated proposals in public. Recomputed P for us: about 7%. EV: about $70. |
| Meta VR Start Developer Competition 2026 | 19 to 20 slots ÷ about 206 expected submissions (902 registrants × the 2025 submit rate of 22.9%) = 9.2% to 9.7%. This falls toward 2.9% as sign-ups grow, and it needs a real Quest VR build. |
| Veles Hack 2026 (Eclipse, Taikai) | $3,000 prize pool, 51 participants, 4 projects. The number of cash slots and whether online entrants can win are not published. Even with 2 slots, P is about 10%, which does not clear the bar. |
| Micro Jam 066, Easel category | 1 × $30 slot ÷ at most 15 Easel-tagged games gives P ≥ 6.7%. That cannot be shown to exceed 10%. |
| DEV Kaggle Benchmarking Challenge | 5 × $500 ÷ about 60 entries so far = 8.3%, and falling before the Oct 11 deadline. |
| NLnet NGI Zero Commons | 60 ÷ 599 = 10.0%, which is not above 10%. It also says "We are not interested in AI-generated projects or proposals." |
| Cardano Catalyst | Fund 14 funded 131 ÷ 1,280 = 10.2%, which is borderline. Submissions are closed and the Fund 16 dates are not published. |
| Rootstock Hacktivator | About 41.7% approval (125 ÷ 300), but the terms forbid using "any GenAI Tools". |
| Zcash Community Grants | About 43% overall, but new technical applicants went 0 of 9. |
| Student-only programs (EurekaDev, Creator Colosseum, Checkpoint 1, Neighborhood Hacks, Cosmo Hacks) | High P, but the team is an adult professional MB, so it is not eligible. |
| Algora and Opire bounties | 19 to 236 claims per open bounty, so P ≤ 5%. New bounties are taken within minutes. |

The earlier list in [AUTOMATABLE-OPPORTUNITIES.md](AUTOMATABLE-OPPORTUNITIES.md) was also checked.
Every row there is at or below 10%, or excluded, except these two:

- **Drips Stellar Wave (#14):** 60% per merged PR. It is already in the pipeline, and the question of
  whether the SCF exclusion covers it is still open.
- **Tenstorrent (#19):** a monitor with no P estimated.

## Honest assessment

Only 1 item clears the bar, and it pays pocket money: EV is about $4 per jam, about $8 to $10 a
month if it repeats. In September 2026, the published numbers show the same pattern across every
channel an adult company can enter for more than about $1,000:

- **Hackathons:** 3% to 10% when you divide prize slots by entrants.
- **Grants:** 7% to 10.2% (NLnet 10.0%, Catalyst 10.2%, Nervos Spark about 7% for us).
- **Bounties:** 5% or less, because AI agents swarm them.

The channels above 10% are student-only, ban GenAI (Rootstock) or pay $10 to $30 (Ziva). Several
programs penalise AI-generated entries outright: NLnet, Nervos t/10576, Rootstock and some game
jams. That undercuts the main advantage of running many agents in parallel.

You have two options:

1. **Keep the 10% bar.** Accept about $10 a month of low-EV wins that repeat. Run the Ziva flow
   each Micro Jam edition, and treat it as practice for the pipeline, not as income.
2. **Relax the bar to about 3% to 10%** and bet on larger single prizes. The EV per human hour is
   higher: Meta VR Start is about 5% × about $10k, but it needs a real VR build, and Hack Apertus
   is about 2% to 3% × EUR 2,670. These need more human involvement: genuine authorship, forum
   presence and demos.

**Coverage gap:** every scout ran out of WebSearch budget (200 of 200). Several programs that pay
every qualifying entry were never verified:

- Celo Proof of Ship
- Base/Talent Builder Rewards
- Akindo WaveHacks
- DoraHacks (returned HTTP 405)

Re-running with a higher `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` is the only realistic way to
find a second or third survivor.

## Wired into the tools

- **Portfolio:** row 35 (`micro-jam-066-ziva`) in `framework/portfolio/opportunities.json` is
  `COND`, with `success: 0.2` and `condition_met: false`. Once the human setup is done, set
  `condition_met` to true.
- **Purge:** Taiko and Solana rows (including Superteam) are `SKIP` with the note "user excluded: …".
  Every row with success ≤ 0.10 is `SKIP` with the note "below the 10% bar". The rows are kept for
  history.
- **Exclusions:** `exclusionReason()` in `framework/lib/portfolio.mjs` now rejects Game3, Taiko,
  Solana and Superteam, so the monitor stops proposing them.
- **Monitor:** Track E dropped the `taiko-grant-program` and `superteam-listings` sources and added
  `micro-jam-itch`.
- **orc flow:** `orchestrator/examples/micro-jam-ziva-flow.json` has six steps:
  1. setup
  2. a gate that checks the jam window is open and that `JAM-OK` exists
  3. research
  4. the Godot 4 build through Ziva, with verify (it checks for a Godot 4 project, a web export
     with `.pck` and `.wasm`, and at least 5 Ziva actions logged)
  5. zip
  6. `SUBMISSION.md`

  It passes `orc flow … --dry`.
