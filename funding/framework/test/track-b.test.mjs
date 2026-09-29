import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apps = mkdtempSync(join(tmpdir(), 'fund-track-b-'));
process.env.FUND_APPS_DIR = apps;
const { CORE } = await import('../lib/core.mjs');
const B = await import('../tracks/b-forms/track.mjs');
const track = B.default;
const TRACKS = { B: track };

const HEAD = '| id | label | type | limit | required | source |\n|---|---|---|---|---|---|\n';

function makeApp(slug, { call = {}, form = '', answers = '' } = {}) {
  const dir = join(apps, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: slug, track: 'B', status: 'drafting', frame: 'game-studio', deadline: 'rolling', ...call }) + '# call\n');
  if (form !== null) writeFileSync(join(dir, 'form.md'), HEAD + form);
  writeFileSync(join(dir, 'answers.md'), answers);
  return dir;
}

const field = (res, id) => res.fields.find((f) => f.id === id);
const kinds = (f) => f.problems.map((p) => p.kind);
const level = (rs, name) => rs.find((r) => r.name === name)?.level;
async function checks(slug) { return (await CORE.runChecks(slug, { tracks: TRACKS })).results; }
async function quiet(fn) {
  const log = console.log; const err = console.error; const w = process.stdout.write;
  console.log = () => {}; console.error = () => {}; process.stdout.write = () => true;
  try { return await fn(); } finally { console.log = log; console.error = err; process.stdout.write = w; }
}
const run = (cmd, args, flags = {}, runAI) => quiet(() => track.commands[cmd].run({ args, flags, core: CORE, runAI }));

test('limits parse as chars, words, select options, or fail', () => {
  assert.deepEqual(B.parseLimit('text', '140'), { chars: 140 });
  assert.deepEqual(B.parseLimit('text', '150w'), { words: 150 });
  assert.deepEqual(B.parseLimit('text', '150 words'), { words: 150 });
  assert.deepEqual(B.parseLimit('text', ''), {});
  assert.deepEqual(B.parseLimit('select', 'A/B / C'), { options: ['A', 'B', 'C'] });
  assert.ok(B.parseLimit('text', 'lots').error);
});

test('sources parse into block, fact, answer and fm', () => {
  assert.deepEqual(B.parseSource('block:game-studio/Shipped record'), { kind: 'block', frame: 'game-studio', heading: 'Shipped record' });
  assert.deepEqual(B.parseSource('block:One-liner'), { kind: 'block', frame: null, heading: 'One-liner' });
  assert.deepEqual(B.parseSource('fact:F-007'), { kind: 'fact', id: 'F-007' });
  assert.deepEqual(B.parseSource('fm:ask'), { kind: 'fm', key: 'ask' });
  assert.equal(B.parseSource('answer').kind, 'answer');
  assert.equal(B.parseSource('web:foo').kind, 'invalid');
});

test('BLOCKS.md headings are indexed per frame', () => {
  const blocks = B.parseBlocks(readFileSync(CORE.PATHS.blocks, 'utf8'));
  assert.ok(blocks.get('game-studio').get('one-liner').text.includes('[F-019]'));
  assert.ok(blocks.get('payout-rail').has('traction'));
});

test('every source kind resolves; citations are stripped from the paste text; answers override', () => {
  makeApp('resolve', {
    call: { website: 'https://tokentails.com', ask: 25000 },
    form: [
      '| name | Name | text | 60 | yes | answer |',
      '| web | Website | url | 200 | yes | fm:website |',
      '| shipped | Shipped | text | 300 | yes | block:game-studio/Shipped record |',
      '| oneliner | One-liner | text | 400 | yes | block:One-liner |',
      '| inv | Invocations | text | 100 | yes | fact:F-007 |',
      '| ask | Ask | number | 10 | yes | fm:ask |',
      '| short | Short | text | 140 | yes | block:game-studio/One-liner |',
      '| cat | Category | select | Gaming/AI | yes | answer |',
    ].join('\n') + '\n',
    answers: '### name\n\nToken Tails\n\n### short\n\nA cat-rescue game where AI turns shelter cats into characters [F-019].\n\n### cat\n\ngaming\n',
  });
  const res = B.resolve('resolve');
  assert.deepEqual(res.formErrors, []);
  assert.ok(res.ok, JSON.stringify(res.fields.filter((f) => !f.ok).map((f) => [f.id, f.problems])));
  assert.equal(field(res, 'web').value, 'https://tokentails.com');
  assert.match(field(res, 'shipped').value, /\[F-018\]/);
  assert.doesNotMatch(field(res, 'shipped').paste, /\[F-/);
  assert.match(field(res, 'shipped').paste, /leaderboards\.$/);
  assert.match(field(res, 'oneliner').paste, /^A Lithuanian studio/);
  assert.equal(field(res, 'inv').paste, '1,218,693');
  assert.equal(field(res, 'ask').value, '25000');
  assert.match(field(res, 'short').via, /overrides block:game-studio\/One-liner/);
  assert.equal(field(res, 'cat').value, 'Gaming', 'select value is canonicalised');
});

test('char and word limits are enforced on the pasted text (citations excluded)', async () => {
  const words = Array.from({ length: 12 }, (_, i) => `word${i}`).join(' ');
  makeApp('limits', {
    form: '| a | A | text | 20 | yes | answer |\n| b | B | longtext | 10w | yes | answer |\n| c | C | text | 13 | yes | answer |\n',
    answers: `### a\n\nThis answer is definitely too long.\n\n### b\n\n${words}\n\n### c\n\nSee the pass [F-015].\n`,
  });
  const res = B.resolve('limits');
  assert.deepEqual(kinds(field(res, 'a')), ['limit']);
  assert.match(field(res, 'a').problems[0].msg, /35\/20 chars/);
  assert.deepEqual(kinds(field(res, 'b')), ['limit']);
  assert.match(field(res, 'b').problems[0].msg, /12\/10 words/);
  assert.ok(field(res, 'c').ok, '"See the pass." is 13 chars once the citation is stripped');
  assert.equal(level(await checks('limits'), 'B:limits'), 'error');
  assert.equal(await run('b:fill', ['limits']), 1);
  assert.match(readFileSync(join(apps, 'limits', 'fill.md'), 'utf8'), /Fix before pasting/);
});

test('missing blocks and facts are reference errors; missing required fails, missing optional warns', async () => {
  makeApp('refs', {
    form: [
      '| x | X | text | 100 | yes | block:game-studio/No such heading |',
      '| y | Y | text | 100 | yes | block:nope-frame/One-liner |',
      '| z | Z | text | 100 | yes | fact:F-999 |',
      '| r | R | longtext | 500 | yes | answer |',
      '| o | O | text | 100 | no | answer |',
    ].join('\n') + '\n',
    answers: '### r\n\nTODO\n',
  });
  const res = B.resolve('refs');
  assert.deepEqual(kinds(field(res, 'x')), ['ref']);
  assert.match(field(res, 'x').problems[0].msg, /have: One-liner, Shipped record/);
  assert.deepEqual(kinds(field(res, 'y')), ['ref']);
  assert.deepEqual(kinds(field(res, 'z')), ['ref']);
  assert.deepEqual(kinds(field(res, 'r')), ['missing'], 'TODO counts as empty');
  assert.ok(field(res, 'o').ok);
  const rs = await checks('refs');
  assert.equal(level(rs, 'B:sources'), 'error');
  assert.equal(level(rs, 'B:required'), 'error');
  assert.equal(level(rs, 'B:optional'), 'warn');
});

test('form.md must exist and parse', async () => {
  makeApp('noform', { form: null });
  assert.equal(level(await checks('noform'), 'B:form'), 'error');
  makeApp('badform', { form: '| a | A | colour | 10 | yes | answer |\n| a | A | text | lots | yes | web:x |\n' });
  const rs = await checks('badform');
  assert.equal(level(rs, 'B:form'), 'error');
  const d = rs.find((r) => r.name === 'B:form').detail;
  assert.match(d, /type "colour"/);
  assert.match(d, /duplicate field id "a"/);
  assert.match(d, /limit "lots"/);
});

test('type rules: url, number, role-only email, select options', () => {
  makeApp('types', {
    call: { contact: 'jane.doe@example.com', ok: 'grants@example.com' },
    form: [
      '| u | U | url | 100 | yes | answer |',
      '| n | N | number | 10 | yes | answer |',
      '| e | E | email-role | 100 | yes | fm:contact |',
      '| e2 | E2 | email-role | 100 | yes | fm:ok |',
      '| s | S | select | Gaming/AI | yes | answer |',
    ].join('\n') + '\n',
    answers: '### u\n\ntokentails.com\n\n### n\n\n$25k\n\n### s\n\nDeFi\n',
  });
  const res = B.resolve('types');
  for (const id of ['u', 'n', 'e', 's']) assert.deepEqual(kinds(field(res, id)), ['type'], id);
  assert.match(field(res, 'e').problems[0].msg, /looks personal/);
  assert.ok(field(res, 'e2').ok);
});

test('uncited numbers and banned terms in answers are content errors', async () => {
  makeApp('content', {
    form: '| t | Traction | longtext | 500 | yes | answer |\n| p | Pitch | text | 200 | yes | answer |\n',
    answers: '### t\n\nWe have 542,000 users.\n\n### p\n\nJoin our airdrop.\n',
  });
  const res = B.resolve('content');
  assert.deepEqual(kinds(field(res, 't')), ['content']);
  assert.deepEqual(kinds(field(res, 'p')), ['content']);
  assert.equal(level(await checks('content'), 'B:content'), 'error');
});

test('fill.md out of date with answers fails once status is ready, warns before', async () => {
  const form = '| name | Name | text | 60 | yes | answer |\n';
  const answers = '### name\n\nToken Tails\n';
  for (const [slug, status, want] of [['stale-ready', 'ready', 'error'], ['stale-draft', 'drafting', 'warn']]) {
    const dir = makeApp(slug, { call: { status }, form, answers });
    assert.equal(await run('b:fill', [slug]), 0);
    assert.equal(level(await checks(slug), 'B:fresh'), 'ok');
    writeFileSync(join(dir, 'answers.md'), '### name\n\nToken Tails Studio\n');
    assert.equal(level(await checks(slug), 'B:fresh'), want);
  }
});

test('regression: freshness is by content — a changed call.md ask is stale, a touched file is not', async () => {
  const dir = makeApp('stale-ask', {
    call: { status: 'ready', ask: 10000 },
    form: '| ask | Ask | number | 12 | yes | fm:ask |\n',
  });
  assert.equal(await run('b:fill', ['stale-ask']), 0);
  assert.equal(level(await checks('stale-ask'), 'B:fresh'), 'ok');
  const future = new Date(Date.now() + 60_000);
  utimesSync(join(dir, 'answers.md'), future, future); // mtime alone must not make it stale
  assert.equal(level(await checks('stale-ask'), 'B:fresh'), 'ok');
  CORE.updateFrontmatter(join(dir, 'call.md'), { ask: 99999 });
  const rs = await checks('stale-ask');
  assert.equal(level(rs, 'B:fresh'), 'error', 'fill.md still says 10000 — pasting it would send the wrong amount');
  assert.match(rs.find((r) => r.name === 'B:fresh').detail, /fill\.md/);
  CORE.updateFrontmatter(join(dir, 'call.md'), { status: 'submitted', ask: 10000 });
  assert.equal(level(await checks('stale-ask'), 'B:fresh'), 'ok', 'a status change alone does not stale the sheet');
});

test('regression: fact-sourced number fields pass the type check and unverified facts are gated', async () => {
  makeApp('factnum', {
    form: '| users | Registered users | number | 12 | yes | fact:F-001 |\n| x | X followers | number | 12 | yes | fact:F-011 |\n',
  });
  let res = B.resolve('factnum');
  assert.ok(field(res, 'users').ok, JSON.stringify(field(res, 'users').problems));
  assert.equal(field(res, 'users').paste, '542,000');
  assert.ok(field(res, 'x').ok, 'unverified only warns while drafting');
  assert.match(field(res, 'x').warnings.join(' '), /unverified fact F-011/);
  assert.equal(level(await checks('factnum'), 'B:content'), 'warn');
  makeApp('factnum-strict', {
    call: { status: 'in-review' },
    form: '| x | X followers | number | 12 | yes | fact:F-011 |\n| y | Y | number | 12 | yes | answer |\n',
    answers: '### y\n\n5 [F-999]\n',
  });
  res = B.resolve('factnum-strict');
  assert.deepEqual(kinds(field(res, 'x')), ['soft']);
  assert.deepEqual(kinds(field(res, 'y')), ['ref'], 'an unknown fact on a number answer is caught too');
});

test('regression: a field named "id" is not mistaken for the header row', () => {
  makeApp('idfield', { form: '| id | ID number | text | 20 | yes | answer |\n', answers: '### id\n\nTT-1\n' });
  const res = B.resolve('idfield');
  assert.deepEqual(res.fields.map((f) => f.id), ['id']);
  assert.ok(res.ok);
});

test('regression: select tolerates a trailing full stop or quotes, still rejects other values', () => {
  makeApp('selpunct', {
    form: '| a | A | select | Gaming/AI | yes | answer |\n| b | B | select | Gaming/AI | yes | answer |\n| c | C | select | Gaming/AI | yes | answer |\n',
    answers: '### a\n\nGaming.\n\n### b\n\n"ai"\n\n### c\n\nGaming platform\n',
  });
  const res = B.resolve('selpunct');
  assert.equal(field(res, 'a').value, 'Gaming');
  assert.equal(field(res, 'b').value, 'AI');
  assert.deepEqual(kinds(field(res, 'c')), ['type']);
});

test('regression: b:answer --run survives fenced, decorated AI output', async () => {
  const dir = makeApp('fenced', {
    form: '| d | Desc | longtext | 300 | yes | answer |\n| e | E | text | 100 | yes | answer |\n',
    answers: '### d\n\nTODO\n\n### e\n\nTODO\n',
  });
  const fake = () => 'Here you go:\n\n```markdown\n### d\n\nA cat-rescue game on iOS [F-015].\n\n### `e` — E\n\nToken Tails\n```\n';
  assert.equal(await run('b:answer', ['fenced'], { run: true }, fake), 0);
  const a = B.parseAnswers(readFileSync(join(dir, 'answers.md'), 'utf8'));
  assert.equal(a.get('d'), 'A cat-rescue game on iOS [F-015].');
  assert.equal(a.get('e'), 'Token Tails');
  assert.ok(B.resolve('fenced').ok);
});

test('regression: Windows line endings in form, answers and call parse the same', () => {
  const crlf = (s) => s.replace(/\n/g, '\r\n');
  const dir = makeApp('crlf', { form: '| name | Name | text | 60 | yes | answer |\n| d | D | longtext | 200 | yes | answer |\n' });
  writeFileSync(join(dir, 'form.md'), crlf(HEAD + '| name | Name | text | 60 | yes | answer |\n| d | D | longtext | 200 | yes | answer |\n'));
  writeFileSync(join(dir, 'answers.md'), crlf('### name\n\nToken Tails\n\n### d\n\nLine one [F-015].\n\nLine two.\n'));
  writeFileSync(join(dir, 'call.md'), crlf(readFileSync(join(dir, 'call.md'), 'utf8')));
  const res = B.resolve('crlf');
  assert.ok(res.ok, JSON.stringify(res.fields.map((f) => f.problems)));
  assert.equal(field(res, 'd').paste, 'Line one.\n\nLine two.');
  assert.equal(field(res, 'name').charCount, 11);
});

test('regression: b:new-form refuses an empty --fields and other tracks\' apps', async () => {
  assert.equal(await run('b:new-form', ['nofields'], { fields: true }), 2, '--fields with no value is a usage error, not a field called "true"');
  assert.ok(!existsSync(join(apps, 'nofields')));
  assert.equal(await run('b:new-form', ['nofields'], { fields: ' ; ' }), 1, 'a spec with no fields is refused');
  const dir = join(apps, 'dao-app');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: 'x', track: 'D', status: 'drafting' }));
  assert.equal(await run('b:new-form', ['dao-app'], { fields: 'a:A:text:10:yes' }), 1);
  assert.ok(!existsSync(join(dir, 'form.md')));
});

test('regression: citations at a line start leave no leading space in the paste text', () => {
  assert.equal(B.toPaste('First [F-001].\n\n[F-015] Second.'), 'First.\n\nSecond.');
});

test('b:batch ranks ready, then needs answers, then blocked, and writes B-BATCH.md', async () => {
  const ok = '| name | Name | text | 60 | yes | answer |\n';
  makeApp('z-ready', { form: ok, answers: '### name\n\nToken Tails\n' });
  makeApp('a-needs', { form: ok + '| d | Desc | longtext | 500 | yes | answer |\n', answers: '### name\n\nToken Tails\n' });
  makeApp('m-blocked', { form: ok + '| x | X | text | 100 | yes | fact:F-999 |\n', answers: '### name\n\nToken Tails\n' });
  makeApp('done', { call: { status: 'submitted' }, form: ok, answers: '### name\n\nToken Tails\n' });
  makeApp('other-track', { call: { track: 'C' }, form: ok });
  const { rows, done, file } = await quiet(() => B.batch());
  const mine = rows.filter((r) => ['z-ready', 'a-needs', 'm-blocked'].includes(r.slug));
  assert.deepEqual(mine.map((r) => [r.slug, r.bucket]), [['z-ready', 'ready to paste'], ['a-needs', 'needs answers'], ['m-blocked', 'blocked']]);
  const order = { 'ready to paste': 0, 'needs answers': 1, blocked: 2 };
  assert.deepEqual(rows.map((r) => order[r.bucket]), [...rows.map((r) => order[r.bucket])].sort());
  assert.ok(!rows.some((r) => r.slug === 'other-track' || r.slug === 'done'));
  assert.ok(done.some((d) => d.slug === 'done'));
  assert.equal(file, join(apps, 'B-BATCH.md'));
  const md = readFileSync(file, 'utf8');
  assert.ok(md.indexOf('z-ready') < md.indexOf('a-needs') && md.indexOf('a-needs') < md.indexOf('m-blocked'));
  assert.ok(existsSync(join(apps, 'a-needs', 'fill.md')));
  assert.ok(mine[1].minutes > mine[0].minutes);
  assert.equal(await run('b:batch', []), 0);
});

test('b:new-form parses specs with colon sources, appends to an existing form and stubs answers', async () => {
  const { fields, errors } = B.parseFieldSpec('pitch:Pitch:text:140:yes:block:game-studio/One-liner; d:Description:longtext:150w:no ;bad id:x');
  assert.equal(errors.length, 1);
  assert.equal(fields[0].source, 'block:game-studio/One-liner');
  assert.deepEqual([fields[1].limit, fields[1].required, fields[1].source], ['150w', 'no', 'answer']);
  assert.ok(B.parseFieldSpec('x:X:colour').errors.length);

  const dir = makeApp('newform', { form: '| name | Name | text | 60 | yes | answer |\n', answers: '### name\n\nToken Tails\n' });
  assert.equal(await run('b:new-form', ['newform'], { fields: 'name:Name:text:60:yes;why:Why us:longtext:500:yes' }), 0);
  const form = B.parseForm(readFileSync(join(dir, 'form.md'), 'utf8'));
  assert.deepEqual(form.fields.map((f) => f.id), ['name', 'why']);
  const answers = B.parseAnswers(readFileSync(join(dir, 'answers.md'), 'utf8'));
  assert.equal(answers.get('name'), 'Token Tails');
  assert.equal(answers.get('why'), 'TODO');
  assert.equal(await run('b:new-form', ['newform'], { fields: 'q:Q:text:10:yes', force: true }), 0);
  assert.deepEqual(B.parseForm(readFileSync(join(dir, 'form.md'), 'utf8')).fields.map((f) => f.id), ['q']);
  assert.equal(await run('b:new-form', ['newform'], { fields: 'bad:Bad:colour' }), 1);
  assert.equal(await run('b:new-form', ['newform'], {}), 2);
});

test('b:answer builds a prompt for failing fields and --run merges the AI output', async () => {
  const dir = makeApp('answer', {
    form: '| name | Name | text | 60 | yes | answer |\n| d | Desc | longtext | 300 | yes | answer |\n| ask | Ask | number | 10 | yes | fm:ask |\n',
    answers: '# Answers\n\n### name\n\nToken Tails\n\n### d\n\nTODO\n',
  });
  const { prompt, targets } = B.answerPrompt(B.resolve('answer'));
  assert.deepEqual(targets.map((f) => f.id), ['d'], 'fm and non-prose fields are never AI-written');
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  assert.match(prompt, /- d — "Desc" \(longtext, max 300 characters/);
  let seen = '';
  const fake = (p) => { seen = p; return '### d\n\nA cat-rescue game on iOS [F-015].\n\n### name\n\nIgnored\n'; };
  assert.equal(await run('b:answer', ['answer'], { run: true }, fake), 0);
  assert.equal(seen, prompt);
  const answers = B.parseAnswers(readFileSync(join(dir, 'answers.md'), 'utf8'));
  assert.equal(answers.get('d'), 'A cat-rescue game on iOS [F-015].');
  assert.equal(answers.get('name'), 'Token Tails', 'only target fields are replaced');
});

test('mergeAnswers replaces existing sections and appends new ones', () => {
  const out = B.mergeAnswers('# A\n\n### a\n\nold\n\n### b\n\nkeep\n', new Map([['a', 'new'], ['c', 'added']]));
  const m = B.parseAnswers(out);
  assert.deepEqual([m.get('a'), m.get('b'), m.get('c')], ['new', 'keep', 'added']);
  assert.ok(out.startsWith('# A'));
});

test('the draft mirror keeps core checks meaningful: prose as sections, other fields in a code block', () => {
  makeApp('mirror', {
    call: { ask: 25000 },
    form: '| name | Name | text | 60 | yes | answer |\n| ask | Ask | number | 10 | yes | fm:ask |\n',
    answers: '### name\n\nToken Tails\n',
  });
  B.fill('mirror');
  const app = CORE.loadApp('mirror');
  assert.deepEqual(app.sections.map((s) => s.title), ['Name']);
  const rs = CORE.coreChecks(app, { facts: CORE.loadFacts().facts, frames: CORE.loadFrames() });
  assert.equal(level(rs, 'citations'), 'ok', 'the ask number sits in a code block and is not a claim');
});

test('the track template scaffolds a Track B app with the game-studio frame', async () => {
  const tracks = await CORE.loadTracks().catch(() => null);
  if (!tracks?.B) return; // another track failing to load is not this track's concern
  await CORE.scaffold('scaffolded', { track: 'B', program: 'Example Fund', url: 'https://example.org' });
  const app = CORE.loadApp('scaffolded');
  assert.equal(app.call.fm.frame, 'game-studio');
  assert.equal(app.call.fm.track, 'B');
  const res = B.resolve('scaffolded');
  assert.deepEqual(res.formErrors, []);
  assert.match(field(res, 'summary').value, /^A Lithuanian studio/, 'block:One-liner resolves via the app frame');
  assert.deepEqual(kinds(field(res, 'summary')), ['limit'], 'the stock one-liner is over 140 chars, so an override is needed');
  assert.deepEqual(kinds(field(res, 'description')), ['missing']);
});

// ---------- adversarial-validation regressions ----------

test('regression: a form table with a header but no rows fails b:fill and lands in "blocked"', async () => {
  makeApp('emptyform', { form: '' });
  const res = B.resolve('emptyform');
  assert.equal(res.ok, false);
  assert.match(res.formErrors.join(' '), /no rows/);
  assert.equal(await run('b:fill', ['emptyform']), 1, 'b:fill must not say "ready" for a form with no fields');
  assert.equal(level(await checks('emptyform'), 'B:form'), 'error');
  const { rows } = await quiet(() => B.batch({ write: false }));
  assert.equal(rows.find((r) => r.slug === 'emptyform').bucket, 'blocked');
});

test('regression: malformed citations never reach the paste text', () => {
  makeApp('badcite', {
    form: '| a | A | longtext | 300 | yes | answer |\n| b | B | text | 100 | yes | answer |\n| c | C | text | 100 | yes | answer |\n',
    answers: '### a\n\nLive on iOS and Android [F-015, F-016].\n\n### b\n\nShipped [F-15].\n\n### c\n\nLive on iOS [F-015].\n',
  });
  const res = B.resolve('badcite');
  assert.deepEqual(kinds(field(res, 'a')), ['content']);
  assert.match(field(res, 'a').problems[0].msg, /malformed citation "\[F-015, F-016\]"/);
  assert.deepEqual(kinds(field(res, 'b')), ['content']);
  assert.ok(field(res, 'c').ok);
});

test('regression: AI output with merged citations is split into one [F-###] per fact', () => {
  const got = B.parseAIAnswers('### a\n\nLive on iOS and Android [F-015, F-016; F-018].\n');
  assert.equal(got.get('a'), 'Live on iOS and Android [F-015] [F-016] [F-018].');
  assert.equal(B.toPaste(got.get('a')), 'Live on iOS and Android.');
});

test('regression: bullet and numbered lists keep their line breaks; hard-wrapped prose is joined', () => {
  assert.equal(B.normalize('Plan:\n- M1: port\n- M2: ship the\n  build\n1. M3: open\n2) M4: grow'), 'Plan:\n- M1: port\n- M2: ship the build\n1. M3: open\n2) M4: grow');
  assert.equal(B.normalize('One line\nwrapped here.\n\nSecond para.'), 'One line wrapped here.\n\nSecond para.');
  assert.equal(B.normalize('- a\r\n- b\r\n'), '- a\n- b', 'CRLF lists too');
  makeApp('bullets', { form: '| m | M | longtext | 200 | yes | answer |\n| t | T | text | 200 | yes | answer |\n', answers: '### m\n\n- M1: port\n- M2: ship\n\n### t\n\n- one\n- two\n' });
  const res = B.resolve('bullets');
  assert.equal(field(res, 'm').paste, '- M1: port\n- M2: ship');
  assert.equal(field(res, 't').paste, '- one - two', 'single-line text fields still collapse');
});

test('regression: any non-### heading ends an answer, so notes never reach the paste sheet', () => {
  const a = B.parseAnswers('### name\n\nToken Tails\n\n## Notes for us\n\nask the lead\n\n### d\n\nText <!-- ## not a heading -->\n\n#### sub\n\nhidden\n');
  assert.equal(a.get('name'), 'Token Tails');
  assert.equal(a.get('d'), 'Text');
});

test('regression: typo, case-mismatched and duplicate answer ids are reported, not silently dropped', async () => {
  makeApp('typo', {
    form: '| team | Team | longtext | 300 | yes | answer |\n| Name | Name | text | 60 | yes | answer |\n| d | D | text | 60 | yes | answer |\n',
    answers: '### tema\n\nA small team.\n\n### name\n\nToken Tails\n\n### d\n\nFirst.\n\n### d\n\nSecond.\n',
  });
  const res = B.resolve('typo');
  const w = res.answerWarnings.join('\n');
  assert.match(w, /"### tema" matches no field .* did you mean "### team"\?/);
  assert.match(w, /"### name" matches no field .* did you mean "### Name"\?/);
  assert.match(w, /"### d" appears 2 times/);
  assert.equal(field(res, 'd').value, 'Second.');
  assert.equal(level(await checks('typo'), 'B:answers'), 'warn');
  B.fill('typo');
  assert.match(readFileSync(join(apps, 'typo', 'fill.md'), 'utf8'), /did you mean "### team"/);
});

test('regression: a UTF-8 byte-order mark does not drop the first answer', () => {
  const dir = makeApp('bom', { form: '| name | Name | text | 60 | yes | answer |\n' });
  writeFileSync(join(dir, 'answers.md'), '﻿### name\n\nToken Tails\n');
  assert.ok(B.resolve('bom').ok);
});

test('regression: b:fill and b:answer refuse other tracks\' apps and unreadable call.md, and write nothing', async () => {
  const other = makeApp('track-d-app', { call: { track: 'D' }, form: '| name | Name | text | 60 | yes | answer |\n' });
  writeFileSync(join(other, 'draft.md'), '# my D draft\n');
  assert.equal(await run('b:fill', ['track-d-app']), 1);
  assert.equal(await run('b:answer', ['track-d-app'], { run: true }, () => '### name\n\nX\n'), 1);
  assert.equal(readFileSync(join(other, 'draft.md'), 'utf8'), '# my D draft\n', 'b:fill must not overwrite another track\'s draft');
  assert.ok(!existsSync(join(other, 'fill.md')));
  assert.equal(readFileSync(join(other, 'answers.md'), 'utf8'), '');

  const bom = makeApp('bom-call', { form: '| name | Name | text | 60 | yes | answer |\n', answers: '### name\n\nToken Tails\n' });
  writeFileSync(join(bom, 'call.md'), '﻿' + readFileSync(join(bom, 'call.md'), 'utf8'));
  // The core now strips a leading BOM, so a BOM-prefixed call.md is a normal Track B app.
  assert.ok(!B.notTrackB(CORE.loadApp('bom-call')));
  assert.equal(await run('b:fill', ['bom-call']), 0);
  const nofm = makeApp('no-fm', { form: '| name | Name | text | 60 | yes | answer |\n' });
  writeFileSync(join(nofm, 'call.md'), 'program: x\ntrack: B\n');
  assert.match(B.notTrackB(CORE.loadApp('no-fm')), /no readable "---" frontmatter/);
  const { skipped } = await quiet(() => B.batch({ write: false }));
  assert.deepEqual(skipped.map((x) => x.slug).filter((s) => ['bom-call', 'no-fm'].includes(s)).sort(), ['no-fm'],
    'b:batch names Track B folders it cannot read instead of silently leaving them out');
});

test('regression: an AI "TODO: <reason>" is reported as needing a human, not as an update', async () => {
  const dir = makeApp('ai-todo', { form: '| d | D | longtext | 200 | yes | answer |\n| e | E | text | 60 | yes | answer |\n' });
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  let code;
  try { code = await track.commands['b:answer'].run({ args: ['ai-todo'], flags: { run: true }, core: CORE, runAI: () => '### d\n\nTODO: need the Beam chain id\n' }); }
  finally { console.log = log; }
  assert.equal(code, 1, 'nothing usable came back');
  assert.match(lines.join('\n'), /d: AI could not answer .*need the Beam chain id/);
  assert.match(lines.join('\n'), /answer "### d" by hand/);
  assert.match(readFileSync(join(dir, 'answers.md'), 'utf8'), /TODO: need the Beam chain id/, 'the reason is kept for the human');
  const f = field(B.resolve('ai-todo'), 'd');
  assert.equal(f.todo, 'need the Beam chain id');
  assert.match(f.problems[0].msg, /required, unfinished — answers.md "### d" still has "TODO: need the Beam chain id" — finish it by hand/);
});

test('regression: a TODO inside an otherwise written answer names the gap instead of saying "empty"', () => {
  makeApp('mid-todo', {
    form: '| gtm | GTM | longtext | 800 | yes | answer |\n| s | Stub | text | 60 | yes | answer |\n',
    answers: '### gtm\n\n- Month 1: list the game.\n- Month 3: TODO: confirm the marketing package\n\n### s\n\nTODO\n',
  });
  const res = B.resolve('mid-todo');
  assert.match(field(res, 'gtm').problems[0].msg, /unfinished .*"TODO: confirm the marketing package"/);
  assert.match(field(res, 's').problems[0].msg, /required, empty — write "### s"/, 'a bare stub is still just empty');
});
