# How to use the funding framework

A practical guide for each track and each of the 25 remaining opportunities. Run everything from
`funding/framework`. Every command prints the next command to run, so you rarely need this page
after the first time.

Deeper reference per track: `tracks/<a-build|b-forms|c-proposals|d-dao|e-monitor>/README.md`.

---

## 0. Autopilot: plan → execute → verify

A person does only what needs a person: sign a deploy, paste into a funder's form and press submit,
post to a forum, find a sponsor, add annex files, read the application once. Everything else runs
from files and is checked objectively.

```bash
alias fund='node bin/fund.mjs'
fund go [--scaffold]           # 1. plan + execute: rank the portfolio, scaffold new apps, run every automatable
                               #    step of each active app, re-scan Track E monitors, write applications/WEEK.md
fund queue                     # 2. only what needs a person, soonest deadline first: why / do / then
fund done <slug> <step>        # 3. after you did it: marks it and continues with fund run (--no-run stops);
                               #    if stale automation blocks the step (you edited call.md), that runs first
fund run <slug>                # 4. after editing files by hand; fund loop <slug> = scored autofix ↔ review to
                               #    the target (Track C runs it itself; refused for Track B, E and ready apps)
fund verify --all --offline    # 5. evidence behind every done step, facts, secrets/PII, policy, cross-app → VERIFY.md
```

`fund plan <slug>` shows every step with the evidence behind it (and writes PLAN.md). Every command
ends with the exact next command. For a step `fund done` cannot stand in for, that is the real action
(`fund a:deploy base mainnet`, `fund a:record …`, `fund d:post … --url …`, `fund d:log …`). The
human-read step lists what the strict gates at `ready` will refuse (unverified facts, `repo:` unset,
build from uncommitted source), so one reading session fixes it all.

| Track | Automated by `fund run` | Human (and what closes it) |
|---|---|---|
| A build | extract · draft (copied from a sibling, no AI) · check · build (forge build+test) · verify-deploy (RPC, optional) · submission · check · review · revise · ready · record | source (only when the program profile has no criteria) · deploy (`fund a:deploy`, you sign) · record (`fund a:record`) · human-read · submit |
| B forms | answer (b:answer) · fill (b:fill) · check · ready · record | form (only when form.md is the stock template or `ask:`/`contact:` are empty) · human-read · submit |
| C proposals | extract · plan (c:plan) · fit · draft · check · revise · review (c:review, scored) · iterate (`fund loop` to threshold) · annexes sync · compliance · budget (c:budget) · ready · record | source · budget-lines (budget.csv) · annex-files · human-read · submit |
| D DAO | extract · draft · check · revise · review · export (re-exported after the post and each sponsor row) · ready · record | source · budget (budget.md) · post (`fund d:post --url`) · sponsor-hunt (`fund d:log`) · submit (the sponsor goes onchain) |
| E monitor | scan (runs while parked) | watch-configured · reopen. `wait` needs nobody: it completes on the revisit date or a source change |

Measured on one app per track (Sep 2026, stub AI): A 11 automated / 5 human steps, B 5 / 3,
C 13 / 5, D 8 / 5, E 1 / 2 (+1 passive wait). Engine state lives in `applications/<slug>/.fund/`
(git-ignored); `fund stats` reads it.

## Sessions: every AI step is a tracked Claude Code session

With `FUND_AI_CMD` unset (the default), every AI call is one Claude Code session run by orc
(`../orchestrator`): `claude -p --output-format stream-json --verbose --permission-mode auto`,
cwd = `funding/framework`. Each session is labelled `<slug>/<step>` (`b:answer`, `c:review` and
`fund loop` label theirs too) and records duration, turns, tool calls, tokens and cost in `.orc/`
(git-ignored).

```bash
fund ps [<slug>] [--all]       # sessions, running first: label, status, elapsed, turns, tools, cost, tokens
fund logs <id|last> [-f]       # what one session did: text, tool calls, results, cost; -f follows it live
fund watch [--once]            # live dashboard, refreshes every 2 s until nothing runs
fund stats [<slug>]            # per step: engine runs and seconds vs estimate, plus sessions, cost, tokens, turns
fund go --parallel 3           # up to 3 applications at once, one process each (each app stays sequential); Ctrl-C kills their sessions, starts no more, exits 130
fund orc kill <id>             # anything else orc does: kill, resume <id> "follow-up", stats --by label
```

Models are set per step (`model:` in the step): `haiku` for extract and fit, `sonnet` for the source
fetch and compliance, `opus` for draft, review and revise. Steps without one use `FUND_AI_MODEL`.

The **source** step fetches the call itself when call.md has a `url:` and source.md is still the
template: a session reads the call page and its linked rules and FAQ with its web tools and writes
the text to source.md (it is told never to submit, sign or log in). Check the text against the page.
If the session fails or writes nothing, the step turns back into the human paste step.
`FUND_AGENT_SOURCE=0` turns the fetch off.

| Env | Does |
|---|---|
| `FUND_AI_CMD` | Set it to skip orc and pipe each prompt to that command instead (the old way: `claude -p`, a stub in tests). No sessions are tracked then |
| `FUND_AI_MODEL` | The model for steps that set none |
| `FUND_AI_TIMEOUT` | Seconds per session (passed as orc `--timeout`; orc's default is 900) |
| `ORC_HOME` | The session store (default `funding/framework/.orc`) |
| `ORC_CLAUDE_BIN` | The claude binary (default: `claude` on PATH). Tests point it at a fake |

---

## 1. One-time setup (5 minutes)

```bash
cd funding/framework
alias fund='node bin/fund.mjs'            # the "next:" lines are printed as "fund ..."
# AI steps run as tracked Claude Code sessions via ../orchestrator (fund ps / logs / watch / stats).
# export FUND_AI_CMD='claude -p'          # only to skip orc and pipe prompts to a command instead
export PATH="$HOME/.foundry/bin:$PATH"    # Track A only (forge)
npm test                                  # 340 tests; should end with "fail 0"
fund tracks                               # lists the five tracks and their commands
```

If `claude` is a shell alias rather than a binary, give orc its full path:
`export ORC_CLAUDE_BIN=/full/path/to/claude`. Test with `node ../orchestrator/bin/orc.mjs run hello "Say hello"`.

Before your first real application, do the shared prerequisites in `../AI-EXECUTION-PLAN.md` §2 —
above all, verify the numbers in `facts/FACTS.md`. Every application draws its numbers from that
file, and `fund check` blocks unverified ones once an application reaches review.

**Never** put secrets, keys, bank details or personal data in `facts/` or any application folder:
these files are pasted into AI prompts.

---

## 2. The daily five minutes

The autopilot above (`fund go`, `fund queue`, `fund done`) is the daily routine. The scans below
are what `fund go` does not do for you:

```bash
fund e:scan                 # what changed across 22 funding sources since yesterday
fund e:triage --run         # AI sorts the changes: real opportunity? which track? next command
fund e:remind               # parked programs whose revisit date has arrived
fund check --all            # every open application, one pass/fail line each
fund tracker                # rebuild TRACKER.md (status, deadline, next action for everything)
```

---

## 3. The loop every application follows

```bash
fund new <slug> --track <A-E> --program "Name" --deadline <ISO with timezone | rolling> --url <call URL>
# paste the funder's call text, FAQ and rules into applications/<slug>/source.md
fund prompt extract <slug> --run --out applications/<slug>/call.md   # criteria, limits, annexes, exclusions
fund prompt fit <slug> --run                                          # GO / NO-GO before writing anything
fund prompt draft <slug> --run --out applications/<slug>/draft.md     # only uses facts, cites them, fits the frame
fund check <slug>                                                     # fix until it passes
fund prompt review <slug> --run                                       # hostile panel → review.md; revise; repeat once
fund prompt compliance <slug> --run
fund status <slug> ready        # strict gates switch on; check must still pass
fund status <slug> submitted    # after you submit by hand
```

`--out` strips the code fence an AI tends to wrap around a file. Still read the result (`git diff`)
before moving on. The tracks below replace or extend parts of this loop.

**What `fund check` tells you, and how to fix it**

| Failure | Fix |
|---|---|
| `citations` — a sentence has a number but no `[F-###]` | Cite the fact from `facts/FACTS.md`, or add the fact there first, with a source |
| `facts-soft` — unverified or SEI-era fact | Verify it and set `verified`, or say "on SEI" and drop it before review |
| `banned-terms` | Rephrase. The frame (`facts/frames.json`) lists what each audience must never see |
| `limits` | Cut the section to the `<!-- limit: N -->` shown on its heading |
| `criteria` | Map the section to the missing criterion: `## Title <!-- criterion: C3 -->` |
| `frontmatter` / `track` | An AI answer replaced call.md's header. Restore it from git, or re-add the `---` block |
| `deadline` | Past: set `status parked`. Under 3 days: submit what you have |

---

## 4. Track A — build once, submit many

**For:** Colosseum (#1), Arc Microgrants (#2), Arbitrum Dubai (#5) and Singapore (#6), Circle (#8),
Base (#13), Arbitrum DDA (#14), Team1 (#17). **Saves:** ~90% vs manual.

The contract, ShelterSplit, already exists (`tracks/a-build/shelter-split`) and passes 33 tests.
Every program has a profile in `tracks/a-build/programs/`, so `a:init <key>` sets up everything.

**Example — Colosseum, then Arc from the same build:**

```bash
fund a:init colosseum-worlds-fair                         # already exists as the example; shown for completeness
fund a:build --slug colosseum-worlds-fair                 # forge build + 33 tests → build-evidence.md
fund a:deploy base testnet                                # prints the forge command; YOU run it and sign
fund a:record base testnet 0xDEPLOYED --tx 0xTXHASH       # register the deployment
fund a:verify base testnet                                # read-only check that the code is on chain
fund a:submission colosseum-worlds-fair                   # submission.md: sections + deployment links + test evidence
fund check colosseum-worlds-fair
fund prompt review colosseum-worlds-fair --run
# → paste submission.md into the Colosseum form, record a demo video, then:
fund status colosseum-worlds-fair submitted

fund a:init arc-microgrants --from colosseum-worlds-fair  # reuses the Colosseum draft
fund a:deploy arc mainnet                                 # Arc requires MAINNET
fund a:record arc mainnet 0xDEPLOYED --tx 0xTXHASH
fund a:matrix                                             # which programs are now unblocked
fund a:submission arc-microgrants && fund check arc-microgrants
```

**Rules:** nothing in this track signs or broadcasts; you do, with a Foundry keystore. RPC URLs go in
env vars (`RPC_<CHAIN>_<NETWORK>`), never files. Commit and push `shelter-split/` before the final
`a:build`, because `ready` needs evidence from committed source. Mainnet only after tests, an AI
security review and a human review. Chains marked `"verify": true` in `chains.json` need a human
check first.

**Profile keys:** `colosseum-worlds-fair`, `arc-microgrants`, `arbitrum-dubai`,
`arbitrum-singapore`, `circle-developer-grants`, `base-builder-grants`, `arbitrum-dda-gaming`,
`team1-avalanche`.

---

## 5. Track B — quick forms

**For:** Game3 (#3), SKALE forum post (#4), Sonic intake (#16), Beam (#18), IMX (#19), MegaETH
(#20), Mastercard (#22), Artizen (#24). **Saves:** ~90% vs manual. **Aim:** all of them in one
sitting.

**Example — MegaETH, from an open form to a paste-ready sheet in ~10 minutes:**

```bash
fund b:new-form megaeth-mafia --program "MegaETH Mega Mafia" --url https://www.megaeth.com/builder --frame high-throughput \
  --fields "name:Project name:text:60:yes;pitch:One-liner:text:140:yes:block:One-liner;desc:What are you building:longtext:1000:yes;web:Website:url::yes:fm:website;email:Email:email-role::yes:fm:contact"
# set in applications/megaeth-mafia/call.md:  website: https://tokentails.com   contact: team@<your domain>
fund b:answer megaeth-mafia --run     # AI drafts every empty or over-limit answer from the facts
fund b:fill megaeth-mafia             # fill.md: each field, its answer, its count vs limit
fund check megaeth-mafia
# read fill.md, paste into the form, submit
fund status megaeth-mafia submitted --next "Chase in 2 weeks"
```

**The batch sitting:** `fund b:batch` fills and checks every open form, ranks them *ready / needs
answers / blocked*, and writes `applications/B-BATCH.md` with minutes per form. Work top-down.

**Field spec:** `id:label:type:limit:required[:source]`, separated by `;`. Types: `text`,
`longtext`, `url`, `select`, `number`, `email-role` (role addresses only). Limit `140` = characters,
`150w` = words. Sources: `block:<Heading>` (from `facts/BLOCKS.md`), `fact:F-###`, `fm:<key>`, or
`answer` (default, from answers.md). When the AI can't answer from the facts it writes `TODO: …` —
answer that field yourself.

**For the SKALE forum post (#4):** use a single `longtext` field, paste `fill.md` into topic 848.

---

## 6. Track C — large written proposals

**For:** SDF Marketing (#7), Creative Europe (#9), Women TechEU (#10), Eurostars (#11), EIC probe
(#12). **Saves:** 81–92% vs manual. The win or loss happens in the draft → hostile review → revise
loop; this track makes each turn one command with a score.

**Example — Creative Europe (the example app exists as `creative-europe-2027`):**

```bash
fund new creative-europe-2027 --track C --program "Creative Europe MEDIA — Video Games 2027" \
  --frame eu-cultural --deadline 2027-02-10T17:00:00+01:00 --url https://www.eacea.ec.europa.eu/grants/2021-2027/creative-europe_en
# in call.md set: threshold: 70   max_grant: 200000   funding_rate: 0.6
# when the call publishes (Track E alerts you: creative-europe-2027-topic flips 404 → 200), paste it into source.md:
fund prompt extract creative-europe-2027 --run --out applications/creative-europe-2027/call.md
fund c:plan creative-europe-2027                    # backward schedule to deadline − 7 days → plan.md
fund prompt fit creative-europe-2027 --run --out applications/creative-europe-2027/fit.md
fund prompt draft creative-europe-2027 --run --out applications/creative-europe-2027/draft.md
fund check creative-europe-2027
fund c:review creative-europe-2027                  # scored hostile review; prints the fix-next chain
# below threshold? paste the printed chain: it redrafts the weakest section and re-reviews
fund c:score creative-europe-2027                   # weighted total vs 70, trend, top 3 criteria to fix
fund c:budget creative-europe-2027                  # budget.csv → grant = eligible × 60%, ≤ €200k
fund c:annexes creative-europe-2027 --sync          # which attachments are still missing
fund prompt compliance creative-europe-2027 --run
fund status creative-europe-2027 ready              # fails unless score ≥ threshold, budget valid, annexes present
```

**Creative Europe specifics:** a new standalone narrative game (no puzzle or social genres), a
contracted narrative lead and **hand-made** key art (no AI art in the dossier), a UAB with a
non-publishing NACE code, and a sales report from one Token Tails game.

**Other programs:** `--frame payout-rail` for SDF Marketing (scope it to user acquisition only),
`--frame ai-creative` for Women TechEU, Eurostars and the EIC probe. Budget figures are not facts, so
keep them out of the prose; point to `budget-summary.md`.

---

## 7. Track D — DAO proposals

**For:** Nouns (#23), and any DAO with a candidate → sponsor → vote flow. **Saves:** ~89% vs
manual. The rule it enforces: find a sponsor within 21 days or stop.

**Example — Nouns (the example app exists as `nouns-dao`):**

```bash
# fill budget.md (| Item | Amount | Currency |) and set eth_usd, min_budget, max_budget in call.md
fund prompt draft nouns-dao --run --out applications/nouns-dao/draft.md
fund check nouns-dao
fund prompt review nouns-dao --run
fund d:export nouns-dao                              # proposal.md: sections + ETH/USD table + sponsor ask
# post proposal.md on the Nouns forum as a candidate, then start the clock:
fund d:post nouns-dao --url <thread URL>
fund d:log nouns-dao --who "Noun owner" --channel Discord --ask "Sponsor the candidate?" --response pending
fund d:clock nouns-dao                               # daily: FIND SPONSOR / CONTINUE / KILL
# a sponsor says yes → d:log ... --response yes → d:export → status ready
```

**Rules:** log roles, never names with contact details (`fund check` fails on emails or phone
numbers). `d:post` can't be re-run to reset the clock. At `KILL`, run `fund status nouns-dao parked`.

---

## 8. Track E — monitor, don't build

**For:** Ronin (#15), Superteam (#21), the Lithuanian travel subsidy (#25), and finding new
opportunities for every other track. **Saves:** ~90% vs checking pages by hand.

```bash
fund e:scan                                  # first run baselines 22 sources; later runs show only changes
fund e:triage --run                          # AI: which changes are real, remote grants/accelerators, and for which track
fund e:add nouns-forum https://discourse.nouns.wtf/latest.rss --kind rss --keywords grant,proposal --feeds D
fund e:scan --only nouns-forum
```

**Park a program you're not building for yet:**

```bash
fund new ronin-pod --track E --program "Ronin Proof of Distribution" --url https://docs.roninchain.com/proof-of-distribution
# in call.md:  watch: [ronin-pod-docs]   revisit: 2027-01-15
fund check ronin-pod
```

Source kinds: `json` (a list at a dot path), `rss` (item titles), `html` (a regex capture, or a hash
of visible text), `wp-modified` (a WordPress page's modified date), `status` (an HTTP code, e.g. an
EU call page that 404s until publication). Schedule `fund e:scan` daily with cron or launchd.

---

## 9. All 25 opportunities: where to start

| # | Opportunity | Track | Start with | Framework time |
|---|---|---|---|---|
| 1 | Colosseum World's Fair | A | `fund a:build --slug colosseum-worlds-fair` (app exists) | 7 h |
| 2 | Arc Microgrants | A | `fund a:init arc-microgrants --from colosseum-worlds-fair` | 1.5 h |
| 3 | Game3 Grants | B | `fund b:fill game3-grants` (app exists) | 0.75 h |
| 4 | SKALE SIP-6 forum post | B | `fund b:new-form skale-sip6 --program "SKALE SIP-6" --url https://forum.skale.network/t/848 --frame high-throughput --fields "post:Forum post:longtext:3000:yes"` | 0.5 h |
| 5 | Arbitrum Dubai buildathon | A | `fund a:init arbitrum-dubai --from colosseum-worlds-fair` | 1.5 h |
| 6 | Arbitrum Singapore buildathon | A | `fund a:init arbitrum-singapore --from colosseum-worlds-fair` | 2 h |
| 7 | SDF Marketing Grants | C | `fund new sdf-marketing --track C --frame payout-rail --program "SDF Marketing Grants" --deadline rolling --url https://stellar.org/grants-and-funding/marketing-grants` | 42 h |
| 8 | Circle Developer Grants | A | `fund a:init circle-developer-grants --from colosseum-worlds-fair` | 62 h |
| 9 | Creative Europe MEDIA | C | `fund c:plan creative-europe-2027` (app exists) | 52 h + art |
| 10 | Women TechEU 2 | C | `fund new women-techeu --track C --frame ai-creative --program "Women TechEU 2" --deadline 2027-01-14T17:00:00+01:00 --url https://womentecheurope.eu/active-calls/` — only if a woman co-founder is CEO/CTO | 8.5 h |
| 11 | Eurostars Call 12 | C | `fund new eurostars-12 --track C --frame ai-creative --program "Eurostars Call 12" --deadline 2027-03-04T14:00:00+01:00 --url https://www.eurekanetwork.org/programmes-and-calls/eurostars/` | 30 h |
| 12 | EIC Accelerator (Step 1 probe) | C | `fund new eic-step1 --track C --frame ai-creative --program "EIC Accelerator Step 1" --deadline rolling --url https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en` | 6 h probe |
| 13 | Base Builder Grants | A | `fund a:init base-builder-grants --from colosseum-worlds-fair`, then deploy on Base | 1 h |
| 14 | Arbitrum DDA Gaming | A | `fund a:init arbitrum-dda-gaming --from colosseum-worlds-fair` | 31 h |
| 15 | Ronin Proof of Distribution | E | `fund new ronin-pod --track E ...` (watch `ronin-pod-docs`) | 0.5 h to park |
| 16 | Sonic Innovator Fund | B | `fund new sonic-innovator --track B --frame high-throughput --program "Sonic Innovator Fund" --url https://docs.soniclabs.com/funding/innovator-fund` | 0.75 h (intake only) |
| 17 | Team1 Avalanche | A | `fund a:init team1-avalanche --from colosseum-worlds-fair`, deploy ShelterSplit on Avalanche | 3 h |
| 18 | Beam Foundation | B | `fund new beam-grants --track B --program "Beam Foundation Grants" --url https://grants.onbeam.com/` | 0.75 h (form); port only if they reply |
| 19 | IMX Developer Incentives | B | `fund new imx-incentives --track B --program "IMX Developer Incentives" --url https://www.digitalworldsnfts.com/developer-incentives` | 0.75 h (form); port only if they reply |
| 20 | MegaETH Mega Mafia | B | `fund b:new-form megaeth-mafia ...` (see §5) | 0.5 h |
| 21 | Superteam | E | Already watched (`superteam-listings`); `fund e:triage --run` flags chain-agnostic bounties | 0 h |
| 22 | Mastercard Start Path | B | `fund new mastercard-startpath --track B --frame payout-rail --program "Mastercard Start Path" --url https://www.mastercard.com/global/en/business/fintech/fintech-programs/startpath.html` — check the seed-raised gate first | 2 h |
| 23 | Nouns DAO proposal | D | `fund d:export nouns-dao` (app exists) | 27 h |
| 24 | Artizen Fund S7 | B | Open artizen.fund in a browser; if it fits, `fund new artizen-s7 --track B --frame ai-creative ...` | 0.5 h |
| 25 | Lithuanian travel subsidy | E | `fund e:remind` (app `lt-travel-subsidy-2027` exists; revisit 2027-07-01) | 2 h in 2027 |

---

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `--run` fails with "AI command … failed" | `FUND_AI_CMD` isn't runnable by `/bin/sh`. Use the binary's full path |
| An AI step fails with "AI session <id> … ended error" | `fund logs <id>` shows what the session did and why it stopped; `fund ps --all` lists them all |
| Track checks (`A:`, `B:` …) vanished from `fund check` | call.md lost its frontmatter or `track:`. Now reported as an error; restore from git |
| A number passes locally but the panel questions it | It came from an `unverified` or `sei-era` fact. Verify it in FACTS.md |
| `a:build` warns "uncommitted source" | Commit and push `tracks/a-build/shelter-split`, then re-run |
| `b:fill` says `summary 161/140` | The One-liner block is longer than the form allows; `b:answer --run` writes a trimmed override |
| `d:clock` says KILL | The 21-day window passed without a sponsor: `fund status <slug> parked` |
| `e:scan` shows ERROR for a source | One source failing never stops the scan. Re-run with `--only <id> --timeout 30000`; if it keeps failing, fix the URL with `e:add` under a new id |
| Tests touch real files | They shouldn't: tests set `FUND_APPS_DIR`, `FUND_TRACKER` and the `FUND_E_*` / `FUND_A_*` paths. Report it as a bug |
