# Pipeline contract (plan → execute → verify)

Fixed interface shared by the engine (`lib/pipeline.mjs`), the per-track pipelines
(`tracks/<dir>/pipeline.mjs`) and everything that reads pipeline state. Do not change it without
updating every consumer.

## Step

```js
{
  id: 'draft',                    // unique within the pipeline, kebab-case
  title: 'Write the draft',       // imperative, shown in plans and queues
  kind: 'auto' | 'ai' | 'human',  // auto = deterministic, no AI; ai = calls runAI; human = a person must act
  estimate_h: 0.5,                // expected framework hours for a person (human steps) or review time (ai/auto)
  needs: ['extract'],             // ids that must be done first (may be empty)
  optional: false,                // true = skipping it never blocks later steps
  done(ctx) → { done: boolean, reason: string },         // PURE detection from files; idempotent; no network, no AI
  run(ctx)  → Promise<{ ok: boolean, message: string }>, // auto/ai only; must be safe to re-run
  instructions: 'what the person does, exactly',         // human only (may also be set on ai/auto as a hint)
  verify(ctx) → { level: 'ok'|'warn'|'error', detail },  // optional; objective re-check used by `fund verify`
  // optional extras (added by the golden-path integration):
  command: 'fund d:post <slug> --url <u>' | (ctx) => string, // human steps: the action that moves it forward; printed after next:/then:
  noOverride: true,               // `fund done` cannot stand in for the evidence (it only re-checks done())
  wait: true,                     // human step nobody acts on (Track E wait): fund queue skips it, fund run prints "waiting"
  runWhenParked: true,            // the engine runs this pipeline while status is parked (Track E monitors)
  verifyAfterRun: false,          // skip the done() re-check right after run() (revise)
  // optional extras (added by the orc integration):
  model: 'haiku',                 // ai steps: the Claude model for this step's sessions (else FUND_AI_MODEL)
  agent: { title, model, when(ctx), run(ctx, step) }, // human steps: resolvePipeline makes it an ai step
                                  //   while when(ctx) holds and done() is false (the default source step
                                  //   fetches the call page; after one failed run it stays human)
}
```

- `done()` and `verify()` may return a Promise. `done()` may add fields that evaluate exposes as
  `row.extra`: `noOverride` (this result cannot be overridden by `fund done`), `blocked: true` (the
  step cannot proceed at all, e.g. Track D's KILL: status `blocked`, run stops with reason `blocked`
  and prints the command named at the end of the reason), `skipped`, `kill`.
- `done()` is transitive: a step counts as done only when its non-optional needs are done too.
- `instructions` may be a function `(ctx) => string`; consumers call `instructionsOf(step, ctx)`.
- The next command for a human step comes from `humanCommand(slug, row, ctx)`: `command`, else
  `fund done <slug> <id>` (for a noOverride step only when its instructions say so, else `fund run <slug>`).

- `done()` decides state from the application folder only (files, frontmatter, `.fund/state.json`).
  A step is never "done" just because it ran; the evidence must exist.
- `run()` must never submit anything to a funder, sign or broadcast a transaction, send an email, or
  post publicly. Those are always `human` steps.
- `run()` for `ai` steps goes through `ctx.runAI(prompt)` only (one tracked Claude Code session via orc,
  or `$FUND_AI_CMD` when set, so tests can stub it) and must write its output to a file, then return. Never loop forever: one AI call
  per `run()` unless the step is the explicit iterate loop.

## ctx

```js
{
  slug, dir,                 // application slug and absolute folder
  app,                       // core.loadApp(slug), reloaded before every done()/run()
  core,                      // CORE
  runAI,                     // (prompt, meta?) => string; the engine adds meta { label: '<slug>/<step>', model }
  invoke,                    // (argv[]) => Promise<exitCode> — run any fund command in-process
  tracks,                    // loaded track plugins
  flags,                     // CLI flags of the current command
  now,                       // Date (honours FUND_NOW)
  state,                     // parsed .fund/state.json (read-only in done())
}
```

## Pipelines

- `lib/pipeline.mjs` exports `defaultSteps` — the core loop:
  `source` (human: paste call text) → `extract` (ai) → `fit` (ai) → `draft` (ai) → `check` (auto) →
  `review` (ai) → `revise` (ai; only when the review or check found problems) → `compliance` (ai) →
  `human-read` (human) → `ready` (auto: set status ready if check passes) → `submit` (human) →
  `record-submission` (auto: status submitted, date).
- A track customises it by default-exporting from `tracks/<dir>/pipeline.mjs`:
  `export default function pipeline(defaultSteps, helpers) { return steps; }`
  It may reuse, replace, insert or remove steps. `helpers` (from `lib/pipeline.mjs`) offers
  `replace(steps, id, step)`, `insertAfter(steps, id, ...newSteps)`, `insertBefore(...)`, `remove(steps, id)`,
  `fileExists(ctx, name)`, `fileNewer(ctx, a, b)`, `checkPasses(ctx)`.
- The engine resolves the pipeline for an app from its `call.md` `track:`; no track pipeline file →
  `defaultSteps`.

## State file: `applications/<slug>/.fund/state.json`

```json
{
  "version": 1,
  "steps": { "<id>": { "status": "done|running|failed|skipped", "startedAt": "ISO", "doneAt": "ISO", "runs": 2, "last": "message", "seconds": 12.4 } },
  "history": [ { "at": "ISO", "step": "<id>", "event": "start|done|fail|skip|human-done", "message": "" } ]
}
```

Written only by the engine. Humans mark a human step done with `fund done <slug> <step>` (records
`human-done` with a timestamp) — the step's `done()` may also detect it from files. `fund done`
then continues with `fund run` automatically when the next step is automatable (`--no-run` stops).
`fund loop` keeps its own history in `.fund/loop.json` and stamps review rounds with wall-clock time
(`## Review — <ISO> loop round N`), which the default review step and Track C both read as current.

## Commands (who builds what)

| Command | Owner module | Does |
|---|---|---|
| `plan <slug>` / `plan --all` | `lib/commands/plan.mjs` | Resolve pipeline, evaluate `done()`, print a plan (done / next / blocked / human), write `applications/<slug>/PLAN.md` |
| `next <slug>` | same | The single next step and the exact command |
| `run <slug> [--until id] [--max N] [--no-ai] [--dry]` | `lib/commands/run.mjs` | Execute auto/ai steps in order until a human step, a failure, `--until`, or `--max`; record state |
| `done <slug> <step> [--note ""]` | same | Mark a human step done |
| `queue` | `lib/commands/queue.mjs` | Every pending human step across all apps, sorted by deadline, with instructions |
| `stats [<slug>]` | same | Actual time per step from state history vs `estimate_h` |
| `verify <slug> \| --all [--offline]` | `lib/commands/verify.mjs` | Deep verification (see below) |
| `refresh [--offline]` | `lib/commands/refresh.mjs` | Refresh facts with machine-checkable sources |
| `loop <slug> [--rounds N] [--target S]` | `lib/commands/loop.mjs` | Automatic draft → check → auto-fix → review → score until the target or N rounds (refuses status ready and tracks with `noLoop`, e.g. B, unless `--force`) |
| `go [--hours N] [--dry]` | `lib/commands/go.mjs` | Portfolio autopilot: rank apps, run automatable steps for each, write WEEK.md with the human queue |

## `lib/pipeline.mjs` exports (fixed names — other modules import these)

```js
export const defaultSteps;                                   // Step[] (the core loop above)
export const helpers;                                        // { replace, insertAfter, insertBefore, remove, fileExists, fileNewer, checkPasses }
                                                             //   extras: readFile, sourceText, reviewRounds, latestReview, currentReview, humanMark,
                                                             //   checkErrors, strictErrors (the gates `ready` applies, previewed), keepFrontmatter, aiStep
export async function resolvePipeline({ slug, core, tracks }) // → Step[] for that app (track pipeline or defaultSteps)
export function makeCtx({ slug, core, runAI, invoke, tracks, flags }) // → ctx (see above)
export async function evaluate(steps, ctx)                   // → [{ step, done, reason, blocked, blockedBy: [ids], status }]
                                                             //   status ∈ 'done' | 'next' | 'blocked' | 'pending' | 'human'
export async function runPipeline(steps, ctx, { until, max, noAi, dry }) // → { ran: [{id, ok, message, seconds}], stoppedAt, reason, failures }
                                                             //   failures: steps that failed in this run and are still not done (run exits 1)
export function isMonitor(steps)                             // true when a step has runWhenParked
export function instructionsOf(step, ctx), humanCommand(slug, row, ctx), nextCommand(slug, row, ctx)
export function readState(dir); export function writeState(dir, state);
export function markHumanDone(dir, stepId, note)
```

Modules that start before `lib/pipeline.mjs` exists must import it lazily
(`await import('../pipeline.mjs')` inside a try/catch) and degrade gracefully when it is missing.
