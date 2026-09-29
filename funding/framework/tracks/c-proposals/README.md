# Track C: large written proposals

This track covers proposals of 20 to 70 pages that a panel scores against a weighted rubric:
SDF Marketing Grants, Creative Europe MEDIA (video games, around Jan–Feb 2027), Women TechEU 2,
Eurostars Call 12 (Mar 4 2027) and the EIC Accelerator Step 1 probe.

On these programmes you win or lose in the loop that goes draft, hostile review, revise. The
track makes each turn of that loop one command and gives it a number: a weighted score against
the call's own threshold, a trend across rounds, and the criteria that carry the most points
still missing.

## Setup (once per shell)

```bash
cd funding/framework
alias fund='node bin/fund.mjs'        # every "next:" line is printed as "fund ...", so it pastes as-is
export FUND_AI_CMD='claude -p'        # what the --run steps pipe the prompt into (this is the default)
```

`--run` pipes the prompt into `/bin/sh -c "$FUND_AI_CMD"`. If `claude` is a zsh alias or function
and not a binary on the PATH, set the binary's full path: `export FUND_AI_CMD="/full/path/to/claude -p"`.
Check it with `sh -c "$FUND_AI_CMD --version"`.

## The fast loop

```bash
# 0. Scaffold (templates add threshold, max_grant, funding_rate, internal_buffer_days, budget.csv, annexes.md)
fund new eurostars-12 --track C --program "Eurostars Call 12" --frame ai-creative --deadline 2027-03-04T14:00:00+01:00 --url https://www.eurekanetwork.org/programmes-and-calls/eurostars/

# 1. Rules: paste the call into applications/eurostars-12/source.md, then
fund prompt extract eurostars-12 --run --out applications/eurostars-12/call.md
fund c:plan eurostars-12                     # unwraps a ``` fence the AI put around call.md, writes plan.md, prints what is due

# 2. Go / no-go (recorded in fit.md, which ticks the fit milestone in plan.md)
fund prompt fit eurostars-12 --run --out applications/eurostars-12/fit.md

# 3. The loop (repeat until c:score says PASS)
fund prompt draft eurostars-12 --run --out applications/eurostars-12/draft.md
fund c:unwrap eurostars-12                   # AI CLIs usually wrap the file in ```; without this C:fence fails the check
fund check eurostars-12                      # citations, banned words, limits, criteria, track rules
fund c:review eurostars-12                   # hostile review in a scorable table, appended to review.md and scored
# below threshold: c:review prints this chain for the section with the most missing points, paste it as-is
fund prompt draft eurostars-12 --section "<printed section>" --run --out applications/eurostars-12/draft.md && fund c:unwrap eurostars-12 && fund check eurostars-12 && fund c:review eurostars-12
fund c:score eurostars-12                    # re-score any time: weighted total, trend, top 3 criteria to fix

# 4. Money and paperwork (c:score / c:review print this once the score passes)
fund c:budget eurostars-12                   # validates budget.csv, writes budget-summary.md
fund c:annexes eurostars-12 --sync           # ticks annexes whose files exist, lists what is missing
fund prompt compliance eurostars-12 --run

# 5. Gate and submit
fund status eurostars-12 ready               # fund check now also fails on unverified facts, placeholders, uncovered criteria
fund check eurostars-12 && fund status eurostars-12 submitted
```

Every command ends with a `next:` line that names the command to run after it. `fund c:plan` is
safe to re-run at any point. It keeps your ticks and ticks on its own the milestones the files
already prove: rubric extracted (criteria present and real call text in source.md), fit check
(fit.md exists), v1 (every criterion mapped, no empty section), review 1 (one scored round), and
v2 plus review 2 (two rounds, latest at or above the threshold). Once the status is `submitted`,
`won`, `lost` or `parked`, `c:plan` has nothing to schedule and says so. Tick the human read and
compliance milestones by hand.

## Commands

| Command | Does | Writes |
|---|---|---|
| `c:plan <slug> [--buffer N] [--start YYYY-MM-DD] [--today YYYY-MM-DD]` | Builds a backward schedule from `deadline` minus `internal_buffer_days` (default 7; a whole number ≥ 0). Milestones: rubric extracted, fit check, v1, review 1, v2, review 2, human read, compliance, submit. The schedule compresses when time is short, and stretches to `plan_start` when that is set. `plan_start` on or after the internal deadline is an error. Once the internal deadline has passed, it exits 1 and says "submit now" while the official deadline is still open, or "park" once it has closed. | `plan.md` |
| `c:review <slug> [--print]` | Renders the core `review` prompt plus a strict `\| C1 \| 7/10 \| reason \|` format, runs `$FUND_AI_CMD`, appends a `## Review — <timestamp>` round (it demotes the AI's own `#`/`##` headings so they cannot start fake rounds) and scores it. `--print` only prints the prompt. | `review.md` |
| `c:score <slug> [--json]` | Scores the latest `## Review — ...` round. It reads 7/10, 3.5/5, 3,5/5 (decimal comma), 70%, "14 out of 20" and bare numbers. A bare number is read out of its criterion's weight when the table scores out of weights, otherwise on the table's usual denominator, then on `score_scale`. Criteria match by ID or name. Weights come from the call's criteria (points or %); a missing weight takes the mean of the others, and an unscored criterion counts as 0. If the newest round has no table, it says so rather than silently scoring the older one. | — |
| `c:budget <slug>` | Validates `budget.csv` (`category,item,cost_eur,eligible`), sums eligible costs, computes grant = eligible × `funding_rate` against `max_grant` (optional `requested_grant`), and checks own co-financing against `cofinancing_min` (default 1 − rate). `next:` names the file to fix. | `budget-summary.md` |
| `c:annexes <slug> [--sync] [--strict]` | Reads `- [ ] Name — file` lines in `annexes.md` and reports missing files and unticked items. Only a path-like tail (`x.pdf`, `annexes/x.pdf`, or anything in backticks) counts as a file, so `- [ ] PIC — registered on the Portal` is a no-file item. `--sync` ticks items whose file exists and keeps the file's line endings. It exits 1 only with `--strict` or when the status is `ready`. | `annexes.md` with `--sync` |
| `c:unwrap <slug>` | Strips the code fence an AI wraps around a file written with `--out` (in `call.md` and `draft.md`). Every other `c:` command does this automatically first. | `call.md`, `draft.md` |

Frontmatter numbers can be written the way people write them: `threshold: 70`, `70%` or on the call's own scale (`3/5`, `7 out of 10`),
`funding_rate: 0.6` or `60%`, `max_grant: 200000`, `200,000` or `€200 000`.

## Checks added to `fund check`

| Check | researching / drafting | in-review | ready |
|---|---|---|---|
| `C:fence`: draft.md is not a fenced AI answer | error | error | error |
| `C:plan`: plan.md exists and matches the current internal deadline | warn (missing or stale) | error when missing | error when missing |
| `C:internal-deadline`: not passed unless submitted, won, lost or parked | error once passed, warn inside 7 days | same | same |
| `C:budget`: valid, request ≤ `max_grant` | error when invalid, warn when budget.csv is missing | error when missing | error when missing |
| `C:annexes`: all ticked, files present | warn | warn | error |
| `C:score`: newest round is scored and ≥ `threshold` | warn | warn | error |

If the `C:` lines disappear from `fund check` output, call.md has lost its `track: C` frontmatter
(usually an AI answer written over it). Run `fund c:unwrap <slug>`, or restore the file from git.

## Add a new program in under 5 minutes

1. Run `fund new <slug> --track C --program "..." --deadline <ISO with offset> --url <call url>`. If the
   date is only expected, say so in `next:` in call.md. The default frame is `eu-cultural`; pass
   `--frame` for others (for example `payout-rail` for SDF Marketing, `ai-creative` for Women
   TechEU, Eurostars or EIC).
2. Set `threshold`, `max_grant`, `funding_rate` and, if you want, `internal_buffer_days` and
   `plan_start` in the `call.md` frontmatter.
3. Paste the call into `source.md` and run the extract step, or fill the criteria table
   `| C1 | Name | Weight | Quote |` by hand. Put any doubt about a weight in the quote column.
   The draft.md skeleton maps C1 to C6. The draft prompt re-maps it, and `fund check` flags any
   ID that no longer exists (`criteria-ids`).
4. Put the cost lines in `budget.csv` and one annex per line in `annexes.md`, then run
   `fund c:plan <slug>`.

## Gotchas

- A sentence may wrap across lines: the core joins soft-wrapped lines before checking citations.
  List items and table rows are still checked line by line.
- At `in-review` and `ready`, the core turns `facts-soft` into an error: any unverified or SEI-era
  fact cited in the draft blocks the gate. Verify the fact in FACTS.md or drop the sentence.
- The `eu-cultural` frame bans "token", so the applicant's trading name cannot appear in the
  draft. Refer to "the studio" or use the legal form only.
- Budget figures are not facts, so they stay out of draft prose (every number needs `[F-###]`).
  Point the prose to `budget-summary.md` and the budget annex.
- Creative Europe: use a contracted narrative lead and hand-made key art. Do not put AI art in the
  dossier.
- Excluded programmes (never scaffold them): BGA, Mantle, Stellar Community Fund, Giveth,
  investment options and credits.
