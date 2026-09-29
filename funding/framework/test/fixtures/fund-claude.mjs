#!/usr/bin/env node
// Fake `claude` for fund's session tests: orc's fake (funding/orchestrator/test/fixtures/fake-claude.mjs,
// the real stream-json shapes and MODE:* keywords) plus fund-shaped work. No network, no AI.
//   - a source-fetch prompt ("Write everything you fetched to this exact file:\n   <path>") writes a
//     realistic call text to <path> (FUND_FAKE_SOURCE=empty writes nothing) and reports a Write tool call
//   - FUND_FAKE_ANSWERS=<shell cmd>: the final result text is that command's stdout for the same prompt
//     (e.g. test/fixtures/engine-ai.mjs), so extract/fit/draft answers look real
//   - FUND_FAKE_SLEEP=<ms>: every session takes that long (orc's MODE:slow)
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORC_FAKE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'orchestrator', 'test', 'fixtures', 'fake-claude.mjs');

let prompt = '';
for await (const c of process.stdin) prompt += c;

const target = /Write everything you fetched to this exact file, replacing its contents:\n\s*(\S+)/.exec(prompt)?.[1];
let wrote = null;
if (target && process.env.FUND_FAKE_SOURCE !== 'empty') {
  const program = /^Program: (.*)$/m.exec(prompt)?.[1] || 'Program';
  const url = /^Call page: (.*)$/m.exec(prompt)?.[1] || '';
  wrote = `# Source text — ${program}

## Call for proposals (${url})

${program} 2026 call. Remote teams welcome. Section 3: projects are scored on quality (50%)
and expected impact (50%). Section 4: the summary is limited to 600 characters. Deadline: rolling.

## FAQ (${url}/faq)

Contact: [redacted]. Grants are paid in two tranches; no equity is taken.
`;
  writeFileSync(target, wrote);
}

const forwarded = process.env.FUND_FAKE_SLEEP ? `${prompt}\nMODE:slow SLEEP:${process.env.FUND_FAKE_SLEEP}\n` : prompt;

let answer = null;
if (process.env.FUND_FAKE_ANSWERS) {
  answer = spawnSync(process.env.FUND_FAKE_ANSWERS, { shell: true, input: prompt, encoding: 'utf8' }).stdout;
}
if (wrote) answer = `WROTE 2 pages, ${wrote.length} chars`;

// Stream orc's fake line by line (like the real claude), so live progress (fund watch, go's live
// line, a kill mid-session) sees the events as they happen.
const child = spawn(process.execPath, [ORC_FAKE, ...process.argv.slice(2)], { env: process.env, stdio: ['pipe', 'pipe', 'inherit'] });
child.stdin.end(forwarded);
const write = (s) => new Promise((r) => process.stdout.write(s, r));
let buf = '';
let chain = Promise.resolve();
const emit = async (line) => {
  let ev = null;
  try { ev = JSON.parse(line); } catch { return write(line + '\n'); }
  if (ev?.type === 'result') {
    if (wrote) {
      await write(JSON.stringify({ type: 'assistant', message: { id: 'msg_src', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_src', name: 'Write', input: { file_path: target, content: wrote.slice(0, 40) } }] }, session_id: ev.session_id }) + '\n');
      await write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_src', content: 'File written' }] }, session_id: ev.session_id }) + '\n');
    }
    if (answer != null && !ev.is_error) ev.result = answer;
  }
  return write(JSON.stringify(ev) + '\n');
};
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  const lines = buf.split('\n'); buf = lines.pop();
  for (const l of lines) if (l) chain = chain.then(() => emit(l));
});
child.on('close', (code) => { chain.then(() => (buf ? emit(buf) : null)).then(() => process.exit(code ?? 1)); });
