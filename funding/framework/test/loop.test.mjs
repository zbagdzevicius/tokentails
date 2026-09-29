import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Hermetic: temp apps + tracker, stub AI. Set BEFORE importing core.
const tmp = mkdtempSync(join(tmpdir(), 'fund-loop-'));
const apps = join(tmp, 'apps');
mkdirSync(apps);
process.env.FUND_APPS_DIR = apps;
process.env.FUND_TRACKER = join(tmp, 'TRACKER.md');
const here = dirname(fileURLToPath(import.meta.url));
process.env.FUND_AI_CMD = `"${process.execPath}" "${join(here, 'fixtures', 'loop-ai.mjs')}"`;

const { CORE } = await import('../lib/core.mjs');
const S = await import('../lib/score.mjs');
const L = await import('../lib/commands/loop.mjs');
const { runAI, main } = await import('../bin/fund.mjs');
const C = await import('../tracks/c-proposals/track.mjs');

const CRITERIA = '| C1 | Impact | 50 | q |\n| C2 | Team | 30 | q |\n| C3 | Plan | not stated | q |\n';
const CLEAN = [
  '---', 'version: 1', '---',
  '## Impact <!-- criterion: C1 | limit: 600 -->', 'Our Stellar contract has 1,218,693 contract invocations [F-007].', '',
  '## Team <!-- criterion: C2 -->', 'A small Vilnius team.', '',
  '## Plan <!-- criterion: C3 -->', 'We ship in stages.', '',
].join('\n');
const UNCITED = CLEAN.replace('1,218,693 contract invocations [F-007].', '1,218,693 contract invocations.');

let n = 0;
function makeApp({ call = {}, draft = CLEAN, review = '# Reviews\n' } = {}) {
  const slug = `app-${++n}`;
  const dir = join(apps, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: `Program ${n}`, track: 'D', status: 'drafting', deadline: 'rolling', ...call }) + '## Scoring criteria\n\n' + CRITERIA);
  writeFileSync(join(dir, 'draft.md'), draft);
  writeFileSync(join(dir, 'review.md'), review);
  return { slug, dir };
}

// Fresh stub state per test.
function stub({ scores = '6', fix = 'good' } = {}) {
  const d = mkdtempSync(join(tmp, 'stub-'));
  process.env.LOOP_STUB_STATE = join(d, 'state.json');
  process.env.LOOP_STUB_SCORES = scores;
  process.env.LOOP_STUB_FIX = fix;
  return {
    calls: () => (existsSync(join(d, 'state.json')) ? JSON.parse(readFileSync(join(d, 'state.json'), 'utf8')) : { autofix: 0, review: 0 }),
    prompt: (kind) => readFileSync(join(d, `${kind}.prompt.txt`), 'utf8'),
  };
}

async function quiet(fn) {
  const logs = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  try { const res = await fn(); return { res, out: logs.join('\n') }; } finally { Object.assign(console, orig); }
}
const loop = (slug, opts = {}) => quiet(() => L.loop({ slug, core: CORE, runAI, ...opts }));
const loopJson = (dir) => JSON.parse(readFileSync(join(dir, '.fund', 'loop.json'), 'utf8'));
const backups = (dir) => readdirSync(dir).filter((f) => /^draft\.v\d+\.md$/.test(f)).sort();

// ---------- scorer ----------

test('parseScore reads x/10, decimals, %, "out of", bare numbers and European decimals', () => {
  assert.deepEqual(S.parseScore('7/10'), { frac: 0.7, scale: 10 });
  assert.equal(S.parseScore('3.5/5').frac, 0.7);
  assert.equal(S.parseScore('3,5/5').frac, 0.7);
  assert.equal(S.parseScore('70%').frac, 0.7);
  assert.equal(S.parseScore('14 out of 20').frac, 0.7);
  assert.equal(S.parseScore('**8/10**').frac, 0.8);
  assert.deepEqual(S.parseScore('8'), { bare: 8 });
  assert.equal(S.parseScore('weak'), null);
  assert.equal(S.parseScore(''), null);
});

test('weights: points or %, missing weight = mean of the known ones', () => {
  const w = S.weightsFor(CORE.parseCriteria(CRITERIA));
  assert.deepEqual(w.map((x) => x.weight), [50, 30, 40]);
  assert.equal(w[2].assumed, true);
  assert.ok(Math.abs(w.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
  assert.deepEqual(S.weightsFor(CORE.parseCriteria('| C1 | A | not stated | q |\n| C2 | B | — | q |\n')).map((x) => x.share), [0.5, 0.5]);
  assert.deepEqual(S.weightsFor(CORE.parseCriteria('| C1 | A | 25% | q |\n| C2 | B | 75% | q |\n')).map((x) => x.share), [0.25, 0.75]);
});

test('scoreReview: latest round, weighted total, weakest, roundCount, trend, mixed formats', () => {
  const crit = CORE.parseCriteria(CRITERIA);
  const review = [
    '# Reviews', '',
    '## Review — r1', '', '| ID | Score | Reason |', '|---|---|---|', '| C1 | 5/10 | thin |', '| C2 | 50% | ok |', '| C3 | 2.5 out of 5 | vague |', '',
    '## Review — r2', '', '| Criterion | Score | Reason |', '|---|---|---|', '| C1 Impact | 8/10 | better |', '| **C2** | 3.5/5 | fine |', '| C3 | 4 | no milestones |', 'Verdict: BORDERLINE', '',
  ].join('\n');
  const s = S.scoreReview(review, crit);
  // r2: C1 .8*50 + C2 .7*30 + C3 .4*40 over 120 (bare "4" is read on the table's first common denominator, 10)
  assert.equal(s.roundCount, 2);
  assert.equal(s.trend[0], 50);
  assert.equal(s.perCriterion.find((p) => p.id === 'C1').frac, 0.8);
  assert.equal(s.perCriterion.find((p) => p.id === 'C2').frac, 0.7);
  assert.equal(s.weakest[0], 'C3');
  assert.equal(s.perCriterion.find((p) => p.id === 'C3').reason, 'no milestones');
  assert.ok(s.total > 50 && s.total < 80, String(s.total));
  assert.equal(s.delta, Math.round((s.total - 50) * 10) / 10);
  assert.equal(s.skipped, null);
});

test('scoreReview: unscored criteria count 0; a newest round without a table is reported as skipped', () => {
  const crit = CORE.parseCriteria(CRITERIA);
  const s = S.scoreReview('## Review — a\n| C1 | 10/10 | x |\n\n## Review — b\nno table here\n', crit);
  assert.equal(s.total, Math.round((50 / 120) * 1000) / 10);
  assert.deepEqual(s.unscored, ['C2', 'C3']);
  assert.equal(s.skipped, 'b');
  assert.equal(S.scoreReview('', crit).total, null);
});

test('scoreReview without call criteria scores every row with equal weight', () => {
  const s = S.scoreReview('## Review — x\n| ID | Score | Reason |\n|---|---|---|\n| Overall | 6/10 | a |\n| Evidence | 8/10 | b |\n', []);
  assert.equal(s.total, 70);
  assert.deepEqual(s.weakest, ['Overall', 'Evidence']);
});

test('generic scorer agrees with Track C on the creative-europe sample review (read-only)', () => {
  const real = join(here, '..', 'applications', 'creative-europe-2027');
  const call = CORE.parseFrontmatter(readFileSync(join(real, 'call.md'), 'utf8'));
  const crit = CORE.parseCriteria(call.body);
  const review = readFileSync(join(real, 'review.md'), 'utf8');
  const mine = S.scoreReview(review, crit, call.fm);
  const theirs = C.scoreHistory(review, crit, call.fm).at(-1).total;
  assert.ok(Math.abs(mine.total - theirs) < 0.1, `${mine.total} vs ${theirs}`);
  assert.equal(S.thresholdOf(call.fm), 70);
});

test('thresholdOf reads 70, 0.7, 70% and 14/20', () => {
  assert.equal(S.thresholdOf({ threshold: 70 }), 70);
  assert.equal(S.thresholdOf({ threshold: 0.7 }), 70);
  assert.equal(S.thresholdOf({ threshold: '70%' }), 70);
  assert.equal(S.thresholdOf({ threshold: '14/20' }), 70);
  assert.equal(S.thresholdOf({}), null);
});

// ---------- loop ----------

test('converges: stops as soon as checks pass and the score reaches the target', async () => {
  const { slug, dir } = makeApp();
  const st = stub({ scores: '6,8,9' });
  const { res, out } = await loop(slug, { rounds: 5 });
  assert.equal(res.code, 0);
  assert.match(res.run.stop, /target reached/);
  assert.equal(res.run.rounds.length, 2);
  assert.deepEqual(st.calls(), { autofix: 1, review: 2 });
  // round 1 had nothing to fix (checks pass, no score yet); round 2 fixed toward the weakest criterion
  assert.equal(res.run.rounds[0].fix, 'skipped');
  assert.equal(res.run.rounds[1].fix, 'applied');
  assert.match(st.prompt('autofix'), /C3 Plan \(5\/10/);
  assert.match(st.prompt('autofix'), /Plan: add milestones/);
  assert.match(st.prompt('review'), /in this order: C1, C2, C3/);
  assert.match(readFileSync(join(dir, 'draft.md'), 'utf8'), /Milestone 1 is defined/);
  assert.equal(CORE.parseFrontmatter(readFileSync(join(dir, 'draft.md'), 'utf8')).fm.version, 2);
  assert.deepEqual(backups(dir), ['draft.v1.md']);
  assert.equal(readFileSync(join(dir, 'draft.v1.md'), 'utf8'), CLEAN);
  const rev = readFileSync(join(dir, 'review.md'), 'utf8');
  assert.equal((rev.match(/^## Review — .* loop round \d/gm) || []).length, 2);
  const lj = loopJson(dir);
  assert.equal(lj.runs.length, 1);
  assert.deepEqual(lj.runs[0].rounds.map((r) => r.score), [res.run.rounds[0].score, res.run.rounds[1].score]);
  assert.ok(lj.runs[0].rounds.every((r) => typeof r.seconds === 'number' && 'errorsBefore' in r));
  assert.ok(res.run.rounds[1].score >= 75);
  assert.match(out, /round\s+errors/);
  assert.match(out, /next: /);
});

test('stalls: stops after two rounds without a score gain', async () => {
  const { slug } = makeApp();
  const st = stub({ scores: '5' });
  const { res, out } = await loop(slug, { rounds: 6 });
  assert.match(res.run.stop, /stalled/);
  assert.equal(res.run.rounds.length, 3);
  assert.equal(st.calls().review, 3);
  assert.match(out, /next: improve C1, C3, C2 by hand/); // weakest = most weighted points lost
});

test('fixes a citation error via autofix (fenced output unwrapped), keeps a backup, --no-review', async () => {
  const { slug, dir } = makeApp({ draft: UNCITED });
  const before = await CORE.runChecks(slug);
  assert.equal(before.results.find((r) => r.name === 'citations').level, 'error');
  const st = stub({ fix: 'fence' });
  const { res } = await loop(slug, { review: false });
  assert.equal(res.run.stop, 'checks pass');
  assert.deepEqual(st.calls(), { autofix: 1, review: 0 });
  assert.match(st.prompt('autofix'), /- citations: 1 sentence\(s\) with numbers but no \[F-###\]/);
  const draft = readFileSync(join(dir, 'draft.md'), 'utf8');
  assert.ok(draft.startsWith('---\n'), 'fence removed');
  assert.match(draft, /1,218,693 contract invocations \[F-007\]\./);
  assert.equal(readFileSync(join(dir, 'draft.v1.md'), 'utf8'), UNCITED);
  assert.equal((await CORE.runChecks(slug)).ok, true);
  assert.deepEqual([res.run.rounds[0].errorsBefore, res.run.rounds[0].errorsAfter], [1, 0]);
});

test('respects --rounds: never more than N review calls and N autofix calls', async () => {
  const { slug, dir } = makeApp({ draft: UNCITED });
  const st = stub({ scores: '5,6,7,8,9' });
  const { res } = await loop(slug, { rounds: 2, target: 95 });
  assert.equal(res.run.rounds.length, 2);
  assert.deepEqual(st.calls(), { autofix: 2, review: 2 });
  assert.match(res.run.stop, /round limit \(2\)/);
  assert.equal(loopJson(dir).runs[0].maxRounds, 2);
});

test('garbage AI output never destroys the draft', async () => {
  const { slug, dir } = makeApp({ draft: UNCITED });
  stub({ fix: 'garbage' });
  const { res, out } = await loop(slug, { rounds: 2, review: false });
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), UNCITED);
  assert.deepEqual(backups(dir), []);
  assert.ok(res.run.rounds.every((r) => r.fix === 'unusable'));
  assert.match(out, /autofix output unusable \(no frontmatter\); kept the previous draft\.md/);
  assert.match(out, /next: node bin\/fund\.mjs check/);
});

test('an unchanged draft is never re-reviewed: garbage autofix spends no review calls', async () => {
  const { slug, dir } = makeApp({ review: '## Review — old\n| C1 | 5/10 | a |\n| C2 | 5/10 | b |\n| C3 | 5/10 | c |\n' });
  const st = stub({ fix: 'garbage' });
  const { res, out } = await loop(slug, { rounds: 5 });
  assert.deepEqual(st.calls(), { autofix: 2, review: 0 });
  assert.match(res.run.stop, /stalled/);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), CLEAN);
  assert.match(out, /review skipped \(score 50 carried\)/);
});

test('never leaves a worse draft: restores the best-scoring draft of the run', async () => {
  const { slug, dir } = makeApp();
  stub({ scores: '7,5,5' });
  const { res, out } = await loop(slug, { rounds: 3, target: 95 });
  assert.match(res.run.stop, /stalled/);
  assert.deepEqual(res.run.rounds.map((r) => r.score), [66.7, 46.7, 46.7]);
  assert.equal(res.run.restored.round, 1);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), CLEAN);
  assert.match(readFileSync(join(dir, res.run.restored.backup), 'utf8'), /Milestone 2/);
  assert.match(readFileSync(join(dir, 'review.md'), 'utf8'), /fund loop restored the round 1 draft/);
  // The restore re-states round 1's review, so review.md's latest score matches draft.md again.
  const after = S.scoreReview(readFileSync(join(dir, 'review.md'), 'utf8'), CORE.parseCriteria(CRITERIA));
  assert.equal(after.roundCount, 4);
  assert.equal(after.total, 66.7);
  assert.match(out, /restored: draft\.md from round 1/);
});

test('an autofix that adds check errors is reverted', async () => {
  const { slug, dir } = makeApp({ review: '## Review — old\n| C1 | 5/10 | a |\n| C2 | 5/10 | b |\n| C3 | 5/10 | c |\n' });
  stub({ scores: '5', fix: 'worse' });
  const { res } = await loop(slug, { rounds: 1 });
  assert.equal(res.run.rounds[0].fix, 'reverted');
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), CLEAN);
  assert.equal((await CORE.runChecks(slug)).ok, true);
});

test('already at target: no AI calls at all', async () => {
  const { slug } = makeApp({ call: { threshold: 60 }, review: '## Review — old\n| C1 | 8/10 | a |\n| C2 | 8/10 | b |\n| C3 | 8/10 | c |\n' });
  const st = stub();
  const { res } = await loop(slug);
  assert.match(res.run.stop, /already at target \(80 ≥ 60\)/);
  assert.deepEqual(st.calls(), { autofix: 0, review: 0 });
});

test('--dry makes no AI calls and writes nothing', async () => {
  const { slug, dir } = makeApp({ draft: UNCITED, call: { threshold: '14/20' } });
  const st = stub();
  const { res, out } = await loop(slug, { dry: true });
  assert.equal(res.code, 0);
  assert.deepEqual(st.calls(), { autofix: 0, review: 0 });
  assert.equal(existsSync(join(dir, '.fund')), false);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), UNCITED);
  assert.match(out, /target\s+70 \(call\.md threshold\)/);
  assert.match(out, /round 1 would autofix/);
});

test('CLI: fund loop parses --rounds/--no-review and prints the next command', async () => {
  const { slug, dir } = makeApp({ draft: UNCITED });
  const st = stub();
  const { res: code, out } = await quiet(() => main(['loop', slug, '--no-review', '--rounds', '2']));
  assert.equal(code, 0);
  assert.deepEqual(st.calls(), { autofix: 1, review: 0 });
  assert.match(out, /stopped: checks pass/);
  assert.match(out, /next: /);
  assert.equal(loopJson(dir).runs[0].maxRounds, 2);
  const { res: bad } = await quiet(() => main(['loop', 'no-such-app']));
  assert.equal(bad, 2);
  const parked = makeApp({ call: { status: 'parked' } });
  const { res: pc, out: po } = await quiet(() => main(['loop', parked.slug]));
  assert.equal(pc, 2);
  assert.match(po, /next: node bin\/fund\.mjs status app-\d+ drafting/);
  assert.deepEqual(st.calls(), { autofix: 1, review: 0 });
});

test('a failing AI command stops the loop with exit 1 and keeps the draft', async () => {
  const { slug, dir } = makeApp({ draft: UNCITED });
  const saved = process.env.FUND_AI_CMD;
  process.env.FUND_AI_CMD = `"${process.execPath}" -e "process.exit(3)"`;
  try {
    const { res, out } = await loop(slug);
    assert.equal(res.code, 1);
    assert.equal(res.run.stop, 'AI command failed');
    assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), UNCITED);
    assert.match(out, /next: fix \$FUND_AI_CMD/);
  } finally { process.env.FUND_AI_CMD = saved; }
});

// ---------- regressions found by the adversarial validator ----------

test('regression: a number inside a reason is never read as a score', () => {
  const crit = CORE.parseCriteria('| C1 | Impact | 50 | q |\n| C2 | Team | 50 | q |\n');
  const s = S.scoreReview('## Review — x\n| C1 | 8/10 | ok |\n| C2 | — | 2 letters of support missing |\n', crit);
  assert.equal(s.perCriterion.find((p) => p.id === 'C2').scored, false);
  assert.deepEqual(S.parseRound('| C1 | strong | 70% of users churn |', crit), []);
  assert.equal(S.parseRound('| C1 | Impact | 7/10 | 3 of 5 partners |', crit)[0].frac, 0.7); // a name column still works
  assert.equal(S.parseScore('7/10 (was 5/10)').frac, 0.7);
  assert.equal(S.parseScore('Score: 6/10').frac, 0.6);
  assert.equal(S.parseScore('about 7/10'), null);
});

test('regression: a malformed .fund/loop.json (null, {runs:{}}, array, broken) never crashes or loses the run', async () => {
  for (const bad of ['null', '{"runs":{}}', '[1,2]', '{broken']) {
    const { slug, dir } = makeApp();
    mkdirSync(join(dir, '.fund'));
    writeFileSync(join(dir, '.fund', 'loop.json'), bad);
    stub({ scores: '9' });
    const { res } = await loop(slug);
    assert.match(res.run.stop, /target reached/, bad);
    assert.equal(loopJson(dir).runs.length, 1, bad);
  }
  assert.deepEqual(L.readLoopState(join(tmp, 'nowhere')), { version: 1, runs: [] });
});

test('regression: an invalid FUND_NOW does not crash the run after AI calls were spent', async () => {
  const { slug, dir } = makeApp();
  stub({ scores: '9' });
  process.env.FUND_NOW = 'not-a-date';
  try {
    const { res } = await loop(slug);
    assert.ok(res.run.stop, 'the run finished'); // core date checks may flag the bad clock; the loop must not crash
    assert.equal(loopJson(dir).runs.length, 1);
    assert.ok(!Number.isNaN(Date.parse(loopJson(dir).runs[0].startedAt)));
  } finally { delete process.env.FUND_NOW; }
});

test('regression: the pre-loop draft is restored when the run only made it worse', async () => {
  const { slug, dir } = makeApp({ review: '## Review — old\n| C1 | 7/10 | a |\n| C2 | 7/10 | b |\n| C3 | 7/10 | c |\n' });
  stub({ scores: '5' });
  const { res, out } = await loop(slug, { rounds: 3, target: 95 });
  assert.match(res.run.stop, /stalled/);
  assert.equal(res.run.restored.round, 0);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), CLEAN);
  assert.equal(res.run.finalScore, 70);
  assert.equal(S.scoreReview(readFileSync(join(dir, 'review.md'), 'utf8'), CORE.parseCriteria(CRITERIA)).total, 70);
  assert.match(out, /restored: draft\.md from before the loop \(score 70\)/);
});

test('regression: restoring never brings back check errors a later round cleared', async () => {
  // Pre-loop draft has a citation error but scored 80; the loop fixes the error and scores lower.
  const { slug, dir } = makeApp({ draft: UNCITED, review: '## Review — old\n| C1 | 8/10 | a |\n| C2 | 8/10 | b |\n| C3 | 8/10 | c |\n' });
  stub({ scores: '5' });
  const { res } = await loop(slug, { rounds: 3, target: 95 });
  assert.equal(res.run.restored, undefined);
  assert.equal(res.run.finalErrors, 0);
  assert.match(readFileSync(join(dir, 'draft.md'), 'utf8'), /\[F-007\]/);
});

test('regression: "target reached" needs a score for the draft on disk, not a stale one', async () => {
  // Pre-loop score 80 ≥ 75 but a check error; the autofix changes the draft and the review is garbage.
  const { slug } = makeApp({ draft: UNCITED, review: '## Review — old\n| C1 | 8/10 | a |\n| C2 | 8/10 | b |\n| C3 | 8/10 | c |\n' });
  stub({ scores: 'x' }); // NaN scores → "NaN/10" is unparseable → round not scored
  const { res, out } = await loop(slug, { rounds: 2 });
  assert.doesNotMatch(res.run.stop, /target reached/);
  assert.equal(res.run.finalScore, null);
  assert.match(out, /final draft\.md has no score yet/);
});

test('regression: autofix output that drops a section or frontmatter key, or wraps the draft in chatter', () => {
  const noPlan = CLEAN.replace(/## Plan[\s\S]*$/, '');
  assert.match(L.unusableReason(CORE, noPlan, CLEAN), /dropped section\(s\): Plan/);
  assert.match(L.unusableReason(CORE, CLEAN.replace('version: 1', 'title: x'), CLEAN), /dropped frontmatter key\(s\): version/);
  assert.equal(L.unusableReason(CORE, CLEAN, CLEAN), null);
  const chatty = 'Here is the corrected draft:\n\n```markdown\n' + CLEAN + '```\n\nLet me know if you need more.\n';
  assert.equal(L.extractDraft(CORE, chatty), CLEAN);
  assert.equal(L.extractDraft(CORE, 'no draft here'), 'no draft here');
});

test('regression: an autofix that returns the same draft writes nothing and spends no review', async () => {
  const { slug, dir } = makeApp({ review: '## Review — old\n| C1 | 5/10 | a |\n| C2 | 5/10 | b |\n| C3 | 5/10 | c |\n' });
  const st = stub({ fix: 'same' });
  const { res } = await loop(slug, { rounds: 2 });
  assert.ok(res.run.rounds.every((r) => r.fix === 'no-change'));
  assert.deepEqual(backups(dir), []);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), CLEAN);
  assert.equal(st.calls().review, 0);
});

test('regression: errors outside draft.md (call.md, facts) stop the loop before any AI call', async () => {
  const { slug, dir } = makeApp({ draft: UNCITED });
  writeFileSync(join(dir, 'call.md'), readFileSync(join(dir, 'call.md'), 'utf8').replace('track: D', 'track: Z'));
  const st = stub();
  const { res, out } = await loop(slug);
  assert.equal(res.code, 2);
  assert.deepEqual(st.calls(), { autofix: 0, review: 0 });
  assert.match(out, /outside draft\.md/);
  assert.match(out, /next: node bin\/fund\.mjs check/);
  assert.equal(readFileSync(join(dir, 'draft.md'), 'utf8'), UNCITED);
});

test('regression: CLI rejects --rounds 0 / --target abc instead of silently running 3 rounds', async () => {
  const { slug } = makeApp();
  const st = stub();
  for (const argv of [['--rounds', '0'], ['--rounds', '-2'], ['--rounds', '1.5'], ['--target', 'abc'], ['--target', '150']]) {
    const { res: code, out } = await quiet(() => main(['loop', slug, ...argv]));
    assert.equal(code, 2, argv.join(' '));
    assert.match(out, /next: /);
  }
  assert.deepEqual(st.calls(), { autofix: 0, review: 0 });
});

test('regression: CRLF draft and review files are handled; re-running twice appends a second run', async () => {
  const crlf = CLEAN.replace(/\n/g, '\r\n');
  const { slug, dir } = makeApp({ draft: crlf, review: '# Reviews\r\n\r\n## Review — old\r\n| C1 | 5/10 | a |\r\n| C2 | 5/10 | b |\r\n| C3 | 5/10 | c |\r\n' });
  stub({ scores: '9' });
  const first = await loop(slug);
  assert.match(first.res.run.stop, /target reached/);
  stub({ scores: '9' });
  const second = await loop(slug);
  assert.match(second.res.run.stop, /already at target/);
  assert.equal(loopJson(dir).runs.length, 2);
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
