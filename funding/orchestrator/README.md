# orc — a tiny Claude Code orchestrator

orc runs Claude Code sessions as subprocesses (`claude -p --output-format stream-json --verbose
--permission-mode auto`) and measures each one: duration, turns, tools, tokens and cost. You can
track every session and flow step from the CLI. It uses only Node 22 built-ins and no packages.
It knows nothing about funding. The fixed interface is in [CONTRACT.md](CONTRACT.md).

## 5-minute tour

```bash
cd funding/orchestrator
alias orc="node $PWD/bin/orc.mjs"       # the store is ./.orc (override with ORC_HOME)
```

| Do | Command |
|---|---|
| One session for a program: result text on stdout, exit 0/1 | `echo "Summarise README.md" \| orc exec --label sum --model haiku --budget 0.2` |
| Same, as a JSON summary | `… \| orc exec --json` |
| One session for a person: live progress and a summary | `orc run hello "Say hello in one word"` |
| Same, in the background | `orc run research --file prompts/research.md --bg` |
| What is running, and what ran | `orc ps` (`--all`, `--flow <runId>`, `--json`) |
| What a session did | `orc logs <id>` (`-f` to follow, `last` for the newest) |
| Live dashboard (every 2 s, exits when idle) | `orc watch` (`--flow <runId>`, `--once`) |
| Stop a session and its whole process tree | `orc kill <id>` |
| Continue a conversation (`--resume <session_id>`) | `orc resume <id> "Now shorten it to 50 words"` |
| Where the time and money went | `orc stats --by label` (`model`, `flow`, `--since 2026-09-01`) |
| A DAG of steps | `orc flow examples/hello-flow.json` (`--parallel 3`, `--dry`, `--resume <runId>`) |

Every command ends with a `next:` line: the command you most likely want to run next.

Flags for `exec`, `run` and `resume`: `--label --cwd --model --budget <usd> --timeout <sec> --mode
<permission mode> --resume <session_id>`. Defaults are mode `auto` (`ORC_PERMISSION_MODE`) and
timeout 900 s (`ORC_TIMEOUT`). A timeout or `orc kill` stops the whole process group, which also
catches shells the session started.

## What gets recorded

```
.orc/sessions/<id>/meta.json     status, pid, sessionId, durationMs, numTurns, costUsd, usage, tools{}, lastEvent, error, flow, step
.orc/sessions/<id>/prompt.md     what was sent
.orc/sessions/<id>/events.jsonl  the raw stream, appended live (non-JSON lines are kept as {"type":"orc_raw"})
.orc/sessions/<id>/result.md     the final result text
.orc/flows/<runId>.json          per step: status, attempts, sessions, result, verify output
```

- `meta.json` is rewritten at most twice a second while a session runs. Every write goes to a temp
  file and is then renamed, so `ps` and `watch` in another terminal never read half a file.
- Statuses: `running`, `done`, `error`, `timeout` and `killed`. `ps` also shows `lost` for a
  session marked `running` whose orc process has died.
- If the stream ends without a `result` event, the status is `error`. The error names the exit
  code and includes the last stderr lines.

## Flows

The example is `examples/hello-flow.json`. Run `orc flow examples/hello-flow.json --dry` to print
the plan without running anything.

```json
{ "name": "hello",
  "defaults": { "model": "haiku", "budget": 0.2, "timeout": 300, "cwd": "." },
  "steps": [
    { "id": "write", "prompt": "Create hello.txt …", "verify": "test -s hello.txt", "retries": 1 },
    { "id": "translate", "prompt": "Translate: {{steps.write.result}}", "needs": ["write"] },
    { "id": "show", "cmd": "cat hello.txt", "needs": ["write"] } ] }
```

- A step has exactly one of `prompt`, `prompt_file` (an AI session) or `cmd` (a shell step with no
  AI). `cwd` and `prompt_file` are relative to the flow file.
- `{{steps.<id>.result}}` inlines an earlier step's result text.
- `verify` is a shell command that must exit 0. If it fails, the step is retried up to `retries`
  times. The retry prompt ends with the verify output under "Fix this:".
- Ready steps run in parallel, up to `--parallel` at once (default 2). A failed step blocks only
  its dependants; the other steps keep running.
- `--resume <runId>` keeps the steps that are already done and re-runs the rest. You can edit the
  flow file between runs.
- A session stopped with `orc kill`, or a flow stopped with Ctrl-C, is never retried. The flow
  starts no new steps after that.

### Competition and bounty flows

Three flows for the ranked opportunities in `../AUTOMATABLE-OPPORTUNITIES.md` that fit orc better
than a `fund` track. Each one runs research → build → verify (a shell step that must exit 0) →
package, works in `work/<name>/` (git-ignored), and never submits anything. A person records the
video and presses submit, following the `Human checklist` in `SUBMISSION.md`.

| Flow | Target | Verify step |
|---|---|---|
| `examples/huntr-challenge-flow.json` | huntr AI prompt-injection challenge ($15,000 pot) | every success in `findings/attempts.jsonl` replayed at least twice |
| `examples/youcam-hackathon-flow.json` | YouCam VTO hackathon (Devpost, Nov 2 2026) | `tsc --noEmit`, ESLint, `npm test`, Playwright e2e |
| `examples/nebius-hackathon-flow.json` | Nebius x NVIDIA hackathon (Devpost, Oct 30 2026) | `npm test`, spend cap present, `FEEDBACK.md` written |

The huntr flow stops at its `gate` step until a person has read the challenge rules and created
`work/huntr/RULES-OK` with the allowed automation and rate limit. Check every flow with `--dry`
first: `orc flow examples/youcam-hackathon-flow.json --dry`.

## From other programs

```js
import { execSync, runSession, runFlow, listSessions, stats } from './lib/orc.mjs';
const { ok, result, meta } = execSync('Write a haiku', { label: 'poem', model: 'haiku' });
```

`fund` can use orc as its AI backend without code changes, because `exec` prints only the result on
stdout and exits 1 on failure:

```bash
export FUND_AI_CMD="node $PWD/bin/orc.mjs exec --label fund --timeout 840"
```

Keep `--timeout` below `FUND_AI_TIMEOUT` (900 s by default). fund kills its AI command with
SIGKILL, and orc cannot clean up after SIGKILL.

## Tests

```bash
npm test   # 40 tests, about 7 s; hermetic (temp ORC_HOME) and never runs the real claude
```

The tests set `ORC_CLAUDE_BIN=test/fixtures/fake-claude.mjs`, a fake that prints stream-json in the
same shape as the real CLI. Keywords in the prompt pick its behaviour: `MODE:slow`, `MODE:hang`,
`MODE:error`, `MODE:crash`, `MODE:garbage`, `MODE:huge`, `MODE:orphan`, `WRITE:file:text`. You can use the same
fake to try any command without network access or spending money:

```bash
ORC_HOME=/tmp/orc-demo ORC_CLAUDE_BIN=$PWD/test/fixtures/fake-claude.mjs orc run demo "MODE:slow hello"
```

Resolving `claude`: `$ORC_CLAUDE_BIN`, then `claude` on PATH, then
`/Applications/cmux.app/Contents/Resources/bin/claude`, then `~/.claude/local/claude`.
