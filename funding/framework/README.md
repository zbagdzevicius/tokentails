# fund — the funding application framework

A dependency-free Node CLI for winning grants and accelerators fast with AI. One fact base, one
checker, five track plugins, and a draft → hostile-review → revise loop that runs in minutes.

```bash
cd funding/framework
node bin/fund.mjs            # help
npm test                     # core + all track tests
```

## Autopilot: plan → execute → verify

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

## The manual loop (fallback: every program, every track)

```bash
node bin/fund.mjs new <slug> --track <A-E> --program "Name" --deadline 2026-10-12T23:59:00-07:00 --url https://…
# paste the call text into applications/<slug>/source.md
node bin/fund.mjs prompt extract <slug> --run --out applications/<slug>/call.md   # rubric, limits, exclusions
node bin/fund.mjs prompt fit <slug> --run                                          # GO / NO-GO before writing
node bin/fund.mjs prompt draft <slug> --run --out applications/<slug>/draft.md     # cites facts, fits the frame
node bin/fund.mjs check <slug>                                                     # citations, limits, banned terms, criteria, track rules
node bin/fund.mjs prompt review <slug> --run                                       # hostile panel, appended to review.md
# revise → check → review again (two rounds), then a human read
node bin/fund.mjs prompt compliance <slug> --run
node bin/fund.mjs status <slug> submitted
```

`--run` sends the rendered prompt to one tracked Claude Code session (labelled `<slug>/<prompt>`), or to `$FUND_AI_CMD` when that is set. Without `--run`, the
prompt is printed so it can be pasted anywhere.

## What `fund check` enforces

| Check | Rule |
|---|---|
| citations | Every sentence with a metric-like number cites `[F-###]` from `facts/FACTS.md` |
| facts | Cited IDs exist; `retired` fails; `unverified` and `sei-era` warn while drafting and fail in review |
| banned-terms | Global token/speculation terms plus the frame's own list (`facts/frames.json`) |
| limits | `<!-- limit: N -->` chars / `<!-- words: N -->` per section |
| criteria | Every `| C# |` in call.md is mapped by some section; unknown IDs fail |
| deadline | Past deadline fails unless submitted/won/lost/parked; under 3 days warns |
| placeholders | TODO/TBD/`{{…}}` warn while drafting, fail in review |
| track rules | Each track adds its own (deployments, form fields, budget and score, kill clock, watchlist) |

## Tracks

| Track | Dir | For | Key commands |
|---|---|---|---|
| A | `tracks/a-build` | One ShelterSplit contract → many hackathons and grants | `a:build` `a:record` `a:deployments` `a:matrix` `a:submission` |
| B | `tracks/b-forms` | Short rolling forms, done in one sitting | `b:fill` `b:batch` `b:new-form` |
| C | `tracks/c-proposals` | 20–70 page rubric-scored proposals | `c:plan` `c:score` `c:budget` `c:annexes` |
| D | `tracks/d-dao` | DAO treasury proposals with a sponsor kill clock | `d:export` `d:clock` `d:log` |
| E | `tracks/e-monitor` | Watch sources, catch new calls, feed the other tracks | `e:scan` `e:triage` `e:add` `e:remind` |

Each track has its own README with its fast loop. **Step-by-step usage for every track and all 25 opportunities: `GUIDE.md`.** Plugin contract: `tracks/README.md`.

## Rules that keep it safe

- `facts/FACTS.md` is pasted into AI prompts. **Never** put secrets, keys, bank details or personal
  data in it, or in any application file.
- The fact base is the single source of truth. Change a number there first, then everywhere.
- Exclusions (user decision, 2026-09-25): remote-only; grants and accelerators only; no BGA,
  Mantle, Stellar Community Fund or Giveth.

## Validated

340 tests (`npm test`) cover the core, all five tracks, the engine, loop, verify, go, the orc
sessions (`test/sessions.test.mjs`, with a fake claude) and the golden path between them (`test/golden-path.test.mjs`); each track was built by one agent and
then attacked by a separate validator that ran a fresh program end to end and fixed what broke
(40 bugs fixed across A–D). Track A's contract passes 33 Foundry tests (`fund a:build`). Track E's
22 sources were verified live on 2026-09-25.

## Good to know

- `--out` strips a code fence an AI wraps around a whole file, and `prompt review --run` demotes the
  AI's own headings so they can't start fake review rounds.
- `fund check` errors if call.md lost its frontmatter or `track:` (an AI overwrite), instead of
  passing with no track checks.
- Date-only deadlines (`2026-10-14`) mean the end of that day. `FUND_NOW=2026-10-01` fixes the
  clock for every date check.
- Short forms with no published scoring criteria: set `criteria: none` in call.md.
- Env overrides: `FUND_APPS_DIR`, `FUND_TRACKER`, `FUND_FACTS`, `FUND_SOURCES`, `FUND_PORTFOLIO`,
  `FUND_AI_CMD`, `FUND_AI_MODEL`, `FUND_AI_TIMEOUT` (seconds, default 900), `FUND_AGENT_SOURCE`, `ORC_HOME`, `FUND_NOW`, `FUND_E_WATCHLIST`,
  `FUND_E_STATE`, `FUND_E_CHANGES`, `FUND_A_DEPLOYMENTS`, `FUND_A_PROJECT`. Tests set these so they
  never touch real applications.
