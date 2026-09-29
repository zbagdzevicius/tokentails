#!/usr/bin/env node
// Fake `claude -p --output-format stream-json --verbose` for orc tests. No network, no AI.
// Reads the prompt on stdin and prints stream-json lines shaped like Claude Code 2.1.x.
// Behaviour is chosen by keywords in the prompt:
//   MODE:slow    sleep SLEEP:<ms> (default 1500) between the tool call and the result; spawns a
//                grandchild `sleep 30` whose pid is printed in an assistant text ("grandchild <pid>")
//   MODE:hang    print init + a tool call, spawn the grandchild, then never finish
//   MODE:error   final result with is_error=true, subtype error_during_execution, exit 1
//   MODE:crash   print init, write to stderr, exit 2 without a result
//   MODE:garbage non-JSON lines and JSON lines split across writes
//   MODE:huge    ~3 MB of assistant text and a 1 MB result
//   MODE:orphan  leave a background shell that holds stdout open for 20 s (and writes to it late);
//                its pid is printed as "grandchild <pid>"
//   WRITE:<file>:<text>     write <text> to <file> in cwd (simulated work)
//   FIXWRITE:<file>:<text>  same, but only when the prompt contains "Fix this" (a verify retry)
// $FAKE_CLAUDE_LOG: append {argv, cwd, prompt} as one JSON line per invocation.
import { appendFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const argv = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (obj) => new Promise((r) => process.stdout.write(JSON.stringify(obj) + '\n', r));

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const prompt = Buffer.concat(chunks).toString('utf8');

if (process.env.FAKE_CLAUDE_LOG) {
  appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ argv, cwd: process.cwd(), prompt }) + '\n');
}

const has = (k) => prompt.includes(k);
const resumeIdx = argv.indexOf('--resume');
const sessionId = resumeIdx >= 0 ? argv[resumeIdx + 1] : randomUUID();
const modelIdx = argv.indexOf('--model');
const model = modelIdx >= 0 ? argv[modelIdx + 1] : 'claude-sonnet-4-5';
const t0 = Date.now();
const usage = { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 9000, cache_creation_input_tokens: 800 };

function spawnGrandchild() {
  const g = spawn('sleep', ['30'], { stdio: 'ignore' });
  return g.pid;
}

await out({ type: 'system', subtype: 'init', session_id: sessionId, model, cwd: process.cwd(), tools: ['Bash', 'Read', 'Write'], permissionMode: 'auto' });
await out({ type: 'system', subtype: 'hook_response', session_id: sessionId, hook_name: 'SessionStart' });

if (has('MODE:crash')) {
  process.stderr.write('warming up\n');
  process.stderr.write('fatal: something broke inside claude\n');
  process.exit(2);
}

const msg1 = { id: 'msg_1', role: 'assistant', model, content: [{ type: 'text', text: 'Looking at the task.' }], usage: { input_tokens: 600, output_tokens: 20 } };
await out({ type: 'assistant', message: msg1, session_id: sessionId });

if (has('MODE:garbage')) {
  process.stdout.write('this is not json\n');
  process.stdout.write('\n');
  process.stdout.write('{"broken": \n');
  const line = JSON.stringify({ type: 'assistant', message: { id: 'msg_g', role: 'assistant', content: [{ type: 'text', text: 'split across writes — ünïcødé ✓' }] }, session_id: sessionId }) + '\n';
  const buf = Buffer.from(line);
  const cut = buf.indexOf(Buffer.from('ü')) + 1; // split in the middle of a multibyte char
  process.stdout.write(buf.subarray(0, cut));
  await sleep(50);
  process.stdout.write(buf.subarray(cut));
}

let pid = null;
if (has('MODE:slow') || has('MODE:hang')) pid = spawnGrandchild();
if (has('MODE:orphan')) pid = spawn('/bin/sh', ['-c', 'sleep 2; echo late-line; sleep 18'], { stdio: ['ignore', 'inherit', 'inherit'] }).pid;

await out({ type: 'assistant', message: { id: 'msg_2', role: 'assistant', model, content: [
  ...(pid ? [{ type: 'text', text: `grandchild ${pid}` }] : []),
  { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls -la', description: 'List files' } },
], usage: { input_tokens: 700, output_tokens: 40 } }, session_id: sessionId });
await out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'total 0\ndrwxr-xr-x  2 u  staff  64 .', is_error: false }] }, session_id: sessionId });
await out({ type: 'rate_limit_event', session_id: sessionId, rate_limit_info: { status: 'allowed' } });

for (const m of prompt.matchAll(/(FIX)?WRITE:([^:\s]+):(\S+)/g)) {
  if (m[1] && !has('Fix this')) continue;
  if (!m[1] && prompt.includes(`FIXWRITE:${m[2]}:`) && has('Fix this')) continue;
  writeFileSync(m[2], m[3] + '\n');
  await out({ type: 'assistant', message: { id: 'msg_w' + m.index, role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_w' + m.index, name: 'Write', input: { file_path: m[2], content: m[3] } }] }, session_id: sessionId });
  await out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_w' + m.index, content: 'File written' }] }, session_id: sessionId });
}

if (has('MODE:hang')) { await sleep(10 * 60 * 1000); process.exit(0); }
if (has('MODE:slow')) {
  await sleep(Number(prompt.match(/SLEEP:(\d+)/)?.[1] || 1500));
  try { process.kill(pid); } catch {} // a normal finish leaves nothing behind
}

let resultText = `OK: ${prompt.trim().split('\n')[0].slice(0, 120)}`;
if (has('MODE:huge')) {
  const chunk = 'x'.repeat(1000);
  for (let i = 0; i < 3000; i++) process.stdout.write(JSON.stringify({ type: 'assistant', message: { id: 'msg_h', role: 'assistant', content: [{ type: 'text', text: chunk }] }, session_id: sessionId }) + '\n');
  resultText = 'HUGE ' + 'y'.repeat(1024 * 1024);
}

const isError = has('MODE:error');
await out({
  type: 'result', subtype: isError ? 'error_during_execution' : 'success', is_error: isError,
  duration_ms: Date.now() - t0, duration_api_ms: Date.now() - t0, num_turns: 3,
  result: isError ? 'Tool permission denied' : resultText, session_id: sessionId,
  total_cost_usd: 0.0123, usage,
});
process.exit(isError ? 1 : 0);
