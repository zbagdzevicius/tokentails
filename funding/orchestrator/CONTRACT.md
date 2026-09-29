# orc — contract

A tiny, dependency-free (Node 22) orchestrator that runs Claude Code sessions as subprocesses,
records everything they do, and lets you track every session and step from the CLI. Generic: it
knows nothing about funding. `funding/framework` uses it as its AI backend.

## Session runner

One session = one subprocess:

```
<claude> -p --output-format stream-json --verbose --permission-mode <mode>
         [--model M] [--max-budget-usd B] [--resume <session_id>]
```

- prompt on stdin; cwd = `--cwd` (default: current dir)
- `<claude>` = `$ORC_CLAUDE_BIN`, else the first `claude` executable on PATH, else
  `/Applications/cmux.app/Contents/Resources/bin/claude`, else `~/.claude/local/claude`, else error.
- mode default `auto` (`$ORC_PERMISSION_MODE` overrides); timeout `--timeout <sec>` (default
  `$ORC_TIMEOUT` or 900) kills the process tree and records status `timeout`.
- stream-json lines observed in Claude Code 2.1.282: `{"type":"system","subtype":"init","session_id","model","cwd"}`,
  hook events, `{"type":"assistant","message":{"content":[{type:"text"|"tool_use",...}]}}`,
  `{"type":"user","message":{"content":[{type:"tool_result",...}]}}`, `rate_limit_event`, and a final
  `{"type":"result","subtype":"success"|"error_*","is_error","duration_ms","num_turns","total_cost_usd","usage":{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens},"result","session_id"}`.

## Store (`$ORC_HOME`, default `<cwd>/.orc`)

```
.orc/sessions/<id>/meta.json     # { id, label, status: running|done|error|timeout|killed, pid, cwd, model, mode,
                                 #   startedAt, endedAt, sessionId, durationMs, numTurns, costUsd,
                                 #   usage:{input,output,cacheRead,cacheWrite}, tools:{Name:count}, lastEvent, error, flow, step }
.orc/sessions/<id>/prompt.md
.orc/sessions/<id>/events.jsonl  # raw stream, appended live
.orc/sessions/<id>/result.md     # final result text
.orc/flows/<runId>.json          # flow run state: steps with status, session ids, attempts, verify output
```

`<id>` = sortable, e.g. `20260927-143012-a1b2`. meta.json is rewritten on every event (throttled to
≤ 2/s) so other terminals see live progress.

## CLI: `node funding/orchestrator/bin/orc.mjs <cmd>`

| Command | Does |
|---|---|
| `exec [--label L] [--cwd D] [--model M] [--budget USD] [--timeout S] [--mode M] [--resume SID] [--json]` | Run ONE session, prompt from stdin. Streams to the store; prints the result text (or a JSON summary with `--json`) to stdout at the end; exit 0 on success, 1 on error/timeout. **This is what other programs call with spawnSync.** |
| `run <label> [prompt or --file F] [same flags] [--bg]` | Human-friendly exec: prints a live one-line progress (turns, tools, cost, elapsed) and a summary. `--bg` detaches and prints the id |
| `flow <flow.json> [--parallel N] [--resume <runId>] [--dry]` | Run a DAG of steps (see below) with concurrency N; each step verified; state in `.orc/flows/` |
| `ps [--all] [--flow runId] [--json]` | Table: id, label, status, elapsed, turns, tools, cost, tokens. Running first |
| `logs <id> [-f]` | Readable event stream: text, tool calls (name + short input), tool results (short), result |
| `watch [--flow runId]` | Live dashboard, refresh every 2 s, until nothing is running |
| `kill <id>` | SIGTERM the process tree, status `killed` |
| `resume <id> <follow-up prompt>` | New session with `--resume <sessionId>` of that session, linked in meta |
| `stats [--by label|model|flow] [--since ISO]` | Totals and averages: sessions, success rate, duration, turns, cost, tokens |

## Flow file

```json
{
  "name": "example",
  "defaults": { "model": "sonnet", "budget": 1.0, "timeout": 900, "cwd": "." },
  "steps": [
    { "id": "research", "prompt": "…", "verify": "test -s notes.md" },
    { "id": "draft", "prompt_file": "prompts/draft.md", "needs": ["research"], "verify": "node check.mjs", "retries": 1 },
    { "id": "lint", "cmd": "npm test", "needs": ["draft"] }
  ]
}
```

- `prompt` / `prompt_file` → a session; `cmd` → a plain shell step (no AI). `{{steps.<id>.result}}` in a
  prompt inlines an earlier step's result text.
- `verify` (shell, cwd = step cwd) must exit 0 for the step to be `done`; otherwise it is retried up
  to `retries` times with the verify output appended to the prompt ("fix this"), then `failed`.
- Steps whose `needs` are done run in parallel up to `--parallel`. A failed step blocks its dependants
  only. `--resume <runId>` skips done steps.

## Library (`funding/orchestrator/lib/orc.mjs`)

```js
export function resolveClaude()                       // → absolute path or throws
export async function runSession(opts)                // async, streams; opts = exec flags + { prompt, store, onEvent }
export function execSync(prompt, opts)                // spawnSync(node orc.mjs exec …) → { ok, result, meta }
export function listSessions({ store, all, flow })    // → meta[]
export function readSession(id, { store })            // → { meta, events }
export async function runFlow(flow, { store, parallel, resume, dry, onUpdate })
export function stats({ store, by, since })
```
