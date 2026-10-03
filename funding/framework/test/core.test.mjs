import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apps = mkdtempSync(join(tmpdir(), 'fund-core-'));
process.env.FUND_APPS_DIR = apps;
const { CORE } = await import('../lib/core.mjs');

function makeApp(slug, { call = {}, criteria = '', draft = '' }) {
  const dir = join(apps, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: slug, status: 'drafting', deadline: 'rolling', ...call }) + criteria);
  writeFileSync(join(dir, 'draft.md'), '---\nversion: 1\n---\n' + draft);
}

async function check(slug) {
  const { app } = { app: CORE.loadApp(slug) };
  const { facts } = CORE.loadFacts();
  return CORE.coreChecks(app, { facts, frames: CORE.loadFrames() });
}
const level = (rs, name) => rs.find((r) => r.name === name)?.level;

test('frontmatter round-trips scalars, arrays and block lists', () => {
  const { fm, body } = CORE.parseFrontmatter('---\na: 1\nb: "x: y"\nc: [p, q]\nd:\n  - one\n  - two\ne: true\n---\nhello');
  assert.deepEqual(fm, { a: 1, b: 'x: y', c: ['p', 'q'], d: ['one', 'two'], e: true });
  assert.equal(body, 'hello');
  const again = CORE.parseFrontmatter(CORE.stringifyFrontmatter(fm) + 'x').fm;
  assert.deepEqual(again, fm);
});

test('fact base loads with no problems', () => {
  const { facts, problems } = CORE.loadFacts();
  assert.equal(problems.length, 0, problems.join('; '));
  assert.ok(facts.size >= 20);
  assert.equal(facts.get('F-007').status, 'verified');
});

test('a clean draft passes', async () => {
  makeApp('clean', {
    call: { frame: 'payout-rail' },
    criteria: '| C1 | Impact | 50% | "impact" |\n| C2 | Team | 50% | "team" |\n',
    draft: '## Impact <!-- criterion: C1 | limit: 400 -->\nThe Stellar contract has 1,218,693 invocations [F-007].\n\n## Team <!-- criterion: C2 -->\nA Vilnius team.\n',
  });
  const rs = await check('clean');
  assert.deepEqual(rs.filter((r) => r.level === 'error'), []);
  assert.equal(level(rs, 'citations'), 'ok');
  assert.equal(level(rs, 'criteria'), 'ok');
});

test('uncited numbers, unknown facts, banned terms, limits and coverage all fail', async () => {
  makeApp('dirty', {
    call: { frame: 'payout-rail' },
    criteria: '| C1 | Impact | 50% | "x" |\n| C2 | Team | 50% | "y" |\n',
    draft: '## Impact <!-- criterion: C1, C9 | limit: 60 -->\nWe have 542,000 users. Join our $TAILS airdrop via card pack [F-999].\n',
  });
  const rs = await check('dirty');
  assert.equal(level(rs, 'citations'), 'error');
  assert.equal(level(rs, 'facts-exist'), 'error');
  assert.equal(level(rs, 'banned-terms'), 'error');
  assert.equal(level(rs, 'limits'), 'error');
  assert.equal(level(rs, 'criteria'), 'warn');
  assert.equal(level(rs, 'criteria-ids'), 'error');
});

test('sei-era facts warn while drafting and fail once in review', async () => {
  const draft = '## Volume <!-- criterion: C1 -->\nOn SEI we peaked at 659,000 weekly transactions [F-004].\n';
  makeApp('sei-draft', { criteria: '| C1 | V | 100% | "v" |\n', draft });
  assert.equal(level(await check('sei-draft'), 'facts-soft'), 'warn');
  makeApp('sei-review', { call: { status: 'in-review' }, criteria: '| C1 | V | 100% | "v" |\n', draft });
  assert.equal(level(await check('sei-review'), 'facts-soft'), 'error');
});

test('years, code blocks, comments and link URLs are not treated as metrics', async () => {
  makeApp('noise', {
    criteria: '| C1 | V | 100% | "v" |\n',
    draft: '## Plan <!-- criterion: C1 -->\nWe launched in 2024 and grow in 2027. See [docs](https://x.io/100000).\n```\nconst users = 542000;\n```\n<!-- 999 users -->\n',
  });
  assert.equal(level(await check('noise'), 'citations'), 'ok');
});

test('a passed deadline fails unless the application is closed', async () => {
  makeApp('late', { call: { deadline: '2020-01-01T00:00:00Z' } });
  assert.equal(level(await check('late'), 'deadline'), 'error');
  makeApp('late-done', { call: { deadline: '2020-01-01T00:00:00Z', status: 'submitted' } });
  assert.equal(level(await check('late-done'), 'deadline'), 'ok');
});

test('unknown frame fails', async () => {
  makeApp('badframe', { call: { frame: 'nope' } });
  assert.equal(level(await check('badframe'), 'frame'), 'error');
});

test('prompt rendering fills every placeholder', () => {
  makeApp('p', { call: { frame: 'payout-rail' }, draft: '## A <!-- criterion: C1 -->\nhi\n' });
  // Core prompts only; track prompts (e.g. tracks/b-forms/prompts) are rendered by their track with extra variables.
  for (const name of readdirSync(CORE.PATHS.prompts).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))) {
    const out = CORE.renderPrompt(name, 'p');
    assert.doesNotMatch(out, /\{\{[A-Z_]+\}\}/, `${name} left a placeholder`);
  }
});

// ---------- regressions for core fixes requested by the track validators ----------

test('a leading UTF-8 BOM does not hide the frontmatter', () => {
  const { fm } = CORE.parseFrontmatter('﻿---\ntrack: B\n---\nx');
  assert.equal(fm.track, 'B');
});

test('missing frontmatter or track is an error, not a vacuous pass', async () => {
  const dir = join(apps, 'nofm');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), 'program: x\n');
  writeFileSync(join(dir, 'draft.md'), '## A\nhi\n');
  const a = await CORE.runChecks('nofm');
  assert.equal(a.ok, false);
  assert.equal(a.results[0].name, 'frontmatter');
  makeApp('notrack', { draft: '## A <!-- criterion: C1 -->\nhi\n', criteria: '| C1 | A | 1 | "a" |\n' });
  const b = await CORE.runChecks('notrack');
  assert.ok(b.results.some((r) => r.name === 'track' && r.level === 'error'));
});

test('unwrapFence strips a whole-file fence and leaves other text alone', () => {
  assert.equal(CORE.unwrapFence('```markdown\n---\na: 1\n---\nbody\n```\n'), '---\na: 1\n---\nbody\n');
  assert.equal(CORE.unwrapFence('plain\n```js\nx\n```\nafter'), 'plain\n```js\nx\n```\nafter');
});

test('date-only deadlines mean the end of that day; FUND_NOW makes checks deterministic', async () => {
  process.env.FUND_NOW = '2026-10-14T12:00:00';
  try {
    makeApp('dateonly', { call: { deadline: '2026-10-14' } });
    const r = await check('dateonly');
    assert.equal(level(r, 'deadline'), 'warn', 'same day is still open, with a warning');
    process.env.FUND_NOW = '2026-10-15T09:00:00';
    assert.equal(level(await check('dateonly'), 'deadline'), 'error');
  } finally { delete process.env.FUND_NOW; }
});

test('a number whose sentence wraps onto the next line counts its citation', async () => {
  makeApp('wrap', { criteria: '| C1 | V | 100% | "v" |\n', draft: '## V <!-- criterion: C1 -->\nThe Stellar contract has processed 1,218,693\ninvocations since January [F-007].\n\n- A list line with 542,000 users and no cite\n' });
  const r = await check('wrap');
  assert.equal(level(r, 'citations'), 'error');
  assert.match(r.find((x) => x.name === 'citations').detail, /list line/);
  assert.doesNotMatch(r.find((x) => x.name === 'citations').detail, /1,218,693/);
});

test('criteria: none silences the missing-criteria warning for short forms', async () => {
  makeApp('nocrit', { call: { criteria: 'none' }, draft: '## A\nhello\n' });
  assert.equal(level(await check('nocrit'), 'criteria'), 'ok');
});

test('CLI parseArgs: boolean flags do not swallow positionals; values may contain "="', async () => {
  const { parseArgs } = await import('../bin/fund.mjs');
  assert.deepEqual(parseArgs(['c:annexes', '--sync', 'my-app']), { pos: ['c:annexes', 'my-app'], flags: { sync: true } });
  assert.deepEqual(parseArgs(['x', '--url=https://a.io/?a=b&c=d']).flags, { url: 'https://a.io/?a=b&c=d' });
  assert.deepEqual(parseArgs(['x', '--next', 'do it']).flags, { next: 'do it' });
});

test('an empty "frame:" (block-list start or empty string) means no frame, not an unknown one', async () => {
  const dir = join(apps, 'emptyframe');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), '---\nprogram: x\nstatus: drafting\nframe: \ndeadline: rolling\n---\n');
  writeFileSync(join(dir, 'draft.md'), '## A\nhi\n');
  assert.equal(level(await check('emptyframe'), 'frame'), 'ok');
});

test('single-brace fill-after-deploy slots ({SPLIT_ADDRESS}, {ARC_TX}) are placeholders; JSON and lowercase braces are not', async () => {
  const criteria = '| C1 | Impact | 100% | "impact" |\n';
  makeApp('slots', { call: { status: 'ready' }, criteria, draft: '## Impact <!-- criterion: C1 -->\nContract {SPLIT_ADDRESS}, payout {ARC_TX}.\n' });
  const rs = await check('slots');
  assert.equal(level(rs, 'placeholders'), 'error');
  makeApp('braces', { criteria, draft: '## Impact <!-- criterion: C1 -->\nThe payload is {"id": 1} and {shelter}.\n' });
  assert.equal(level(await check('braces'), 'placeholders'), 'ok');
});
