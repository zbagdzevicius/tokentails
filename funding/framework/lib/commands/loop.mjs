// fund loop <slug> [--rounds N=3] [--target S] [--no-review] [--dry]
//
// Auto-iterate: check → autofix → scored hostile review → score, with zero human input, until the
// checks pass AND the review score reaches the target, or N rounds, or the score stalls for two
// rounds. Every round is recorded in applications/<slug>/.fund/loop.json. The loop never submits
// anything, never signs, never sends; it only rewrites draft.md (with a backup each time) and
// appends review rounds to review.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync, utimesSync } from 'node:fs';
import { join, basename } from 'node:path';
import { scoreReview, thresholdOf, splitReviews, parseRound } from '../score.mjs';

const DEFAULT_TARGET = 75;
const FUND = 'node bin/fund.mjs';

// ---------- prompt rendering ----------
// Mirrors core.renderPrompt's variables, plus loop-only ones, in ONE substitution pass so text
// pulled in from the draft or facts is never re-scanned for {{VARS}}.

function promptFile(core, name) {
  const dirs = [core.PATHS.prompts];
  if (existsSync(core.PATHS.tracks)) {
    for (const d of readdirSync(core.PATHS.tracks)) {
      const p = join(core.PATHS.tracks, d, 'prompts');
      if (existsSync(p)) dirs.push(p);
    }
  }
  const f = dirs.map((d) => join(d, `${name}.md`)).find((x) => existsSync(x));
  if (!f) throw new Error(`no prompt "${name}.md" in prompts/`);
  return f;
}

export function renderLoopPrompt(core, name, slug, extra = {}) {
  const app = core.loadApp(slug);
  const frames = core.loadFrames();
  const frameName = core.frameOf ? core.frameOf(app.call.fm) : String([].concat(app.call.fm.frame || '')[0] || '');
  const frame = frameName ? frames.frames?.[frameName] : null;
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const vars = {
    FACTS: read(core.PATHS.facts),
    BLOCKS: read(core.PATHS.blocks),
    CALL: read(join(app.dir, 'call.md')),
    DRAFT: read(join(app.dir, 'draft.md')),
    FRAME: frame ? `${frameName}: ${frame.label}\nLead with: ${frame.lead.join('; ')}\nNever mention: ${[...(frames.global_banned || []), ...frame.banned].join(', ')}` : `(no frame set)\nNever mention: ${(frames.global_banned || []).join(', ')}`,
    SECTION: '(all sections)',
    PROGRAM: app.call.fm.program || slug,
    SOURCE: read(join(app.dir, 'source.md')),
    ...extra,
  };
  // {{VAR}} = core variables; %%VAR%% = loop-only variables (so `fund prompt <name>` still renders
  // cleanly without the loop). One pass over the template: inserted text is never re-scanned.
  return readFileSync(promptFile(core, name), 'utf8').replace(/\{\{([A-Z_]+)\}\}|%%([A-Z_]+)%%/g, (m, a, b) => {
    const k = a || b;
    return k in vars ? String(vars[k]) : m;
  });
}

// ---------- helpers ----------

const errorsOf = (results) => results.filter((r) => r.level === 'error');
const fmtErr = (r) => `- ${r.name}: ${String(r.detail || '').trim()}`;

// Errors the autofix cannot clear because they are not in draft.md (call.md or FACTS.md).
const UNFIXABLE = new Set(['facts-file', 'frontmatter', 'track']);
const ISO = (d) => (Number.isNaN(d?.getTime?.()) ? new Date() : d).toISOString(); // invalid FUND_NOW never crashes a run
// Review-round headings carry the wall-clock time, never FUND_NOW: the pipeline compares them with
// draft.md's mtime to decide whether the latest review is current.
const STAMP = () => new Date().toISOString();
/** Write draft.md back to `text` with its old mtime, so a reverted autofix does not look like an edit. */
function restoreDraft(file, text, mtimeMs) {
  writeFileSync(file, text);
  if (mtimeMs) { try { utimesSync(file, Date.now() / 1000, mtimeMs / 1000); } catch { /* best effort */ } }
}
const norm = (t) => String(t ?? '').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();

/**
 * The draft inside an AI answer: the whole answer, a fence around it, or the one fenced block that
 * holds a frontmatter draft when the AI wrapped it in chatter ("Here is the draft: ```...```").
 */
export function extractDraft(core, text) {
  const out = core.unwrapFence(String(text ?? ''));
  if (/^\uFEFF?---\r?\n/.test(out.trimStart())) return out.trimStart();
  const blocks = [...out.matchAll(/^```[\w-]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)].map((m) => m[1]).filter((b) => /^---\r?\n/.test(b));
  return blocks.length === 1 ? blocks[0] + '\n' : out;
}

/**
 * Unusable AI draft: no frontmatter, no "## " sections, or (given the previous draft) a dropped
 * section heading or frontmatter key — the autofix prompt forbids both. Returns the reason or null.
 */
export function unusableReason(core, text, previous = null) {
  const t = String(text || '').trim();
  if (!t) return 'empty output';
  const { fm, body } = core.parseFrontmatter(t);
  if (!Object.keys(fm).length) return 'no frontmatter';
  const sections = core.parseSections(body);
  if (!sections.length) return 'no "## " sections';
  if (previous) {
    const prev = core.parseFrontmatter(previous);
    const lostKeys = Object.keys(prev.fm).filter((k) => !(k in fm));
    if (lostKeys.length) return `dropped frontmatter key(s): ${lostKeys.join(', ')}`;
    const have = new Set(sections.map((x) => norm(x.title).toLowerCase()));
    const lost = core.parseSections(prev.body).map((x) => norm(x.title)).filter((x) => !have.has(x.toLowerCase()));
    if (lost.length) return `dropped section(s): ${lost.join(', ')}`;
  }
  return null;
}

function nextBackup(dir) {
  let max = 0;
  for (const f of readdirSync(dir)) {
    const m = /^draft\.v(\d+)\.md$/.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return join(dir, `draft.v${max + 1}.md`);
}

/** .fund/loop.json; anything that is not { runs: [] } (corrupt, null, an array) starts fresh. */
export function readLoopState(dir) {
  const f = join(dir, '.fund', 'loop.json');
  let s = null;
  try { s = JSON.parse(readFileSync(f, 'utf8')); } catch { /* missing or corrupt */ }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { version: 1, runs: [] };
  return { ...s, version: 1, runs: Array.isArray(s.runs) ? s.runs : [] };
}
function writeLoopState(dir, state) {
  mkdirSync(join(dir, '.fund'), { recursive: true });
  writeFileSync(join(dir, '.fund', 'loop.json'), JSON.stringify(state, null, 2) + '\n');
}

/** Lines after "Fixes:" in the newest review round (up to the next blank-line-separated label). */
function latestFixes(reviewText) {
  const rounds = String(reviewText || '').split(/^##\s+Review\b.*$/gim);
  const last = rounds[rounds.length - 1] || '';
  const m = /^\s*(?:\*\*)?Fixes:?(?:\*\*)?\s*$([\s\S]*?)(?=^\s*(?:\*\*)?(?:Unsupported|Verdict)\b|$(?![\s\S]))/im.exec(last);
  return m ? m[1].trim() : '';
}

function weakestText(score) {
  if (!score || score.total === null) return '(no scored review yet — strengthen every criterion the call lists)';
  return score.weakest
    .map((id) => score.perCriterion.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => `- ${p.id} ${p.name !== p.id ? p.name + ' ' : ''}(${p.scored ? `${p.score10}/10` : 'not scored'}, losing ${p.lost.toFixed(1)} points): ${p.reason || 'no reason given'}`)
    .join('\n') || '(none below full marks)';
}

const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const pad = (s, n) => String(s).padEnd(n);

function printTable(slug, run) {
  console.log(`\nloop ${slug}  target ${run.target}  max ${run.maxRounds} round(s)${run.review ? '' : '  (no review)'}`);
  if (!run.rounds.length) { console.log('  no rounds needed'); return; }
  console.log(`  ${pad('round', 6)}${pad('errors', 9)}${pad('fix', 11)}${pad('score', 7)}${pad('Δ', 7)}${pad('weakest', 14)}secs`);
  let prev = run.startScore;
  for (const r of run.rounds) {
    const delta = r.score !== null && prev !== null && prev !== undefined ? (r.score - prev >= 0 ? '+' : '') + (r.score - prev).toFixed(1) : '—';
    if (r.score !== null) prev = r.score;
    const errs = r.errorsAfter === r.errorsBefore ? String(r.errorsBefore) : `${r.errorsBefore}→${r.errorsAfter}`;
    console.log(`  ${pad(r.round, 6)}${pad(errs, 9)}${pad(r.fix, 11)}${pad(r.score === null ? (r.carried ? '(same)' : '—') : r.score.toFixed(1), 7)}${pad(delta, 7)}${pad(r.weakest.join(',') || '—', 14)}${r.seconds.toFixed(1)}`);
    for (const n of r.notes) console.log(`         ! ${n}`);
  }
}

// ---------- the loop ----------

/** --rounds: a positive integer, else null (the CLI rejects it; loop() falls back to 3). */
export function roundsOf(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return v !== true && Number.isInteger(n) && n >= 1 ? n : null;
}
/** --target: a number 0..100, else null. */
export function targetOf(v) {
  if (v === undefined || v === null || v === true || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/%$/, ''));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Body of the newest review round that has a score table (to re-state it on a restore). */
function latestScoredBody(reviewText, criteria, fm) {
  const rounds = splitReviews(reviewText).filter((r) => parseRound(r.body, criteria, { scale: fm.score_scale }).length);
  return rounds.length ? rounds[rounds.length - 1].body.trim() : null;
}
// Draft a is better than b: fewer check errors, then a higher score.
const better = (a, b) => a.errors < b.errors || (a.errors === b.errors && a.score > b.score);

export async function loop({ slug, core, runAI, tracks, rounds = 3, target: targetFlag, review = true, dry = false }) {
  const dir = core.appDir(slug);
  const app0 = core.loadApp(slug);
  const draftFile = join(dir, 'draft.md');
  const reviewFile = join(dir, 'review.md');
  const N = roundsOf(rounds) ?? 3;
  const target = r1(targetOf(targetFlag) ?? thresholdOf(app0.call.fm) ?? DEFAULT_TARGET);
  const scoreNow = () => { const a = core.loadApp(slug); return scoreReview(a.review, a.criteria, a.call.fm); };
  const checksNow = async () => (await core.runChecks(slug, { tracks })).results;

  const start = scoreNow();
  const run = { startedAt: ISO(core.now()), target, maxRounds: N, review, startScore: start.total, rounds: [], stop: '', aiCalls: { autofix: 0, review: 0 } };

  if (dry) {
    const errs = errorsOf(await checksNow());
    console.log(`\nloop ${slug} (dry run — no AI calls, nothing written)`);
    console.log(`  target        ${target}${targetOf(targetFlag) !== null ? ' (--target)' : thresholdOf(app0.call.fm) !== null ? ' (call.md threshold)' : ' (default)'}`);
    console.log(`  rounds        up to ${N} (≤ ${N} autofix + ≤ ${review ? N : 0} review AI calls)`);
    console.log(`  check errors  ${errs.length}${errs.length ? '\n' + errs.map((e) => '    ' + fmtErr(e).split('\n')[0]).join('\n') : ''}`);
    console.log(`  latest score  ${start.total === null ? 'none (no scored review round yet)' : `${start.total} over ${start.roundCount} round(s)${start.weakest.length ? `, weakest ${start.weakest.join(', ')}` : ''}`}`);
    const firstFix = errs.length > 0 || (review && start.total !== null && start.total < target);
    const blocked = errs.filter((e) => UNFIXABLE.has(e.name));
    if (blocked.length) {
      console.log(`  would not start: ${blocked.map((e) => e.name).join(', ')} error(s) are outside draft.md`);
      console.log(`\nnext: ${FUND} check ${slug}`);
      return { run, code: 0 };
    }
    console.log(`  round 1 would ${firstFix ? 'autofix draft.md (backup kept), re-check, ' : ''}${review ? 'run a scored review and append it to review.md' : 'stop (no review)'}`);
    console.log(`\nnext: ${FUND} loop ${slug}${N !== 3 ? ` --rounds ${N}` : ''}${targetOf(targetFlag) !== null ? ` --target ${target}` : ''}${review ? '' : ' --no-review'}`);
    return { run, code: 0 };
  }

  // Already there? Spend nothing. Errors outside draft.md? Spend nothing either.
  const initialErrors = errorsOf(await checksNow());
  const unfixable = initialErrors.filter((e) => UNFIXABLE.has(e.name));
  if (unfixable.length) {
    console.log(`\nloop ${slug}: not started — ${unfixable.length} check error(s) are outside draft.md, so no autofix can clear them:`);
    for (const e of unfixable) console.log('  ' + fmtErr(e).split('\n')[0]);
    console.log(`\nnext: ${FUND} check ${slug}   (fix call.md / facts/FACTS.md, then ${FUND} loop ${slug})`);
    return { run: { ...run, stop: 'unfixable check errors' }, code: 2 };
  }
  if (!initialErrors.length && (!review || (start.total !== null && start.total >= target))) {
    run.stop = review ? `already at target (${start.total} ≥ ${target}) and checks pass` : 'checks pass';
  }

  let best = start.total === null ? -Infinity : start.total;
  let stall = 0;
  let last = start;
  let aiError = null;
  // The draft text the latest score belongs to; an unchanged draft is never re-reviewed.
  // A round that scored only some criteria (a plain `review` step table) is not a full scored review:
  // the loop reviews again instead of carrying that partial score.
  let reviewedDraft = start.total !== null && !start.unscored.length ? readFileSync(draftFile, 'utf8') : null;
  // Best draft seen (fewest check errors, then highest score), including the pre-loop draft, with
  // the review round that scored it — restored at the end if the run ends on something worse.
  let bestRun = null; // { round, score, errors, text, body }
  if (start.total !== null) {
    const body = latestScoredBody(app0.review, app0.criteria, app0.call.fm);
    bestRun = { round: 0, score: start.total, errors: initialErrors.length, text: readFileSync(draftFile, 'utf8'), body };
  }

  for (let round = 1; !run.stop && round <= N; round++) {
    const t0 = Date.now();
    const rec = { round, errorsBefore: 0, errorsAfter: 0, fix: 'skipped', backup: null, score: null, weakest: [], seconds: 0, notes: [] };
    const results = round === 1 ? initialErrors : errorsOf(await checksNow());
    rec.errorsBefore = results.length;
    rec.errorsAfter = results.length;

    // 1. autofix when checks fail, or when the latest review is below target
    const needFix = results.length > 0 || (review && last.total !== null && last.total < target);
    if (needFix && run.aiCalls.autofix < N) {
      const prompt = renderLoopPrompt(core, 'autofix', slug, {
        CHECK_FAILURES: results.length ? results.map(fmtErr).join('\n') : '(none — all checks pass)',
        WEAKEST: weakestText(last),
        REVIEW_FIXES: latestFixes(core.loadApp(slug).review) || '(none)',
      });
      run.aiCalls.autofix++;
      let out;
      try { out = extractDraft(core, String(runAI(prompt, { label: `${slug}/loop-autofix`, model: 'opus' }))); } catch (e) { aiError = e.message; }
      const before = readFileSync(draftFile, 'utf8');
      const beforeMtime = statSync(draftFile).mtimeMs;
      if (aiError) { rec.fix = 'ai-error'; rec.notes.push(`autofix AI call failed: ${aiError.split('\n')[0]}`); }
      else {
        const bad = unusableReason(core, out, before);
        if (bad) { rec.fix = 'unusable'; rec.notes.push(`autofix output unusable (${bad}); kept the previous draft.md`); }
        else if (norm(out) === norm(before)) { rec.fix = 'no-change'; rec.notes.push('autofix returned the draft unchanged'); }
        else {
          const backup = nextBackup(dir);
          copyFileSync(draftFile, backup);
          rec.backup = basename(backup);
          let text = out.endsWith('\n') ? out : out + '\n';
          const { fm, body } = core.parseFrontmatter(text);
          if (typeof fm.version === 'number') text = core.stringifyFrontmatter({ ...fm, version: fm.version + 1 }) + body;
          writeFileSync(draftFile, text);
          const after = errorsOf(await checksNow());
          if (after.length > results.length) {
            restoreDraft(draftFile, before, beforeMtime);
            rec.fix = 'reverted';
            rec.notes.push(`autofix raised check errors ${results.length}→${after.length}; restored the previous draft.md`);
          } else {
            rec.fix = 'applied';
            rec.errorsAfter = after.length;
          }
        }
      }
    }

    // 2. scored hostile review
    const current = readFileSync(draftFile, 'utf8');
    if (!aiError && review && current === reviewedDraft && last.total !== null) {
      rec.carried = true;
      rec.notes.push(`draft unchanged since the last scored review; review skipped (score ${last.total} carried)`);
    } else if (!aiError && review && run.aiCalls.review < N) {
      const a = core.loadApp(slug);
      const ids = a.criteria.length ? a.criteria.map((c) => c.id).join(', ') : '(the call publishes no criteria: score C1 Overall quality, C2 Evidence, C3 Fit with the call)';
      const checkText = (await core.runChecks(slug, { tracks })).results.map((r) => `${r.level.toUpperCase()} ${r.name}${r.detail ? ': ' + String(r.detail).split('\n')[0] : ''}`).join('\n');
      const prompt = renderLoopPrompt(core, 'review-scored', slug, { CRITERIA_IDS: ids, CHECK_RESULTS: checkText });
      run.aiCalls.review++;
      let out;
      try { out = String(runAI(prompt, { label: `${slug}/loop-review`, model: 'opus' })); } catch (e) { aiError = e.message; rec.notes.push(`review AI call failed: ${aiError.split('\n')[0]}`); }
      if (!aiError) {
        const demoted = core.unwrapFence(out).replace(/^(#{1,2})(\s)/gm, '###$2').trim();
        const head = existsSync(reviewFile) ? '' : `# Reviews — ${a.call.fm.program || slug}\n`;
        writeFileSync(reviewFile, (existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8').replace(/\s*$/, '') : head) + `\n\n## Review — ${STAMP()} loop round ${round}\n\n${demoted}\n`);
        const s = scoreNow();
        if (s.skipped) rec.notes.push('review had no parseable score table; round not scored');
        else {
          rec.score = s.total; rec.weakest = s.weakest; last = s; reviewedDraft = current;
          const cand = { round, score: s.total, errors: rec.errorsAfter, text: current, body: demoted };
          if (!bestRun || better(cand, bestRun)) bestRun = cand;
        }
      }
    }

    rec.seconds = r1((Date.now() - t0) / 1000);
    run.rounds.push(rec);
    if (aiError) { run.stop = 'AI command failed'; break; }

    // 3. stop conditions
    const pass = rec.errorsAfter === 0;
    // The score must belong to the draft on disk (a changed but unscored draft has no score yet).
    const scoredNow = last.total !== null && readFileSync(draftFile, 'utf8') === reviewedDraft;
    if (!review) { if (pass) run.stop = 'checks pass'; }
    else if (pass && scoredNow && last.total >= target) run.stop = `target reached (${last.total} ≥ ${target})`;
    else if (rec.score !== null || rec.carried) {
      if (rec.score !== null && rec.score > best) { best = rec.score; stall = 0; } else if (++stall >= 2) run.stop = `stalled (no score gain for 2 rounds, best ${r1(best)})`;
    }
    if (!run.stop && round === N) run.stop = `round limit (${N})`;
  }
  if (!run.stop) run.stop = `round limit (${N})`;

  // Never leave a worse draft behind: if the draft on disk is worse (more check errors, or the
  // same errors and a lower score) than the best draft seen — the pre-loop draft included — restore
  // that one, keep the weaker one as a backup, and re-state the review round that scored the
  // restored draft so review.md's latest score matches draft.md again.
  const nowText = readFileSync(draftFile, 'utf8');
  run.finalScore = nowText === reviewedDraft ? scoreNow().total : null;
  let finalErrors = errorsOf(await checksNow());
  if (bestRun && bestRun.body && run.finalScore !== null && nowText !== bestRun.text && better(bestRun, { errors: finalErrors.length, score: run.finalScore })) {
    const backup = nextBackup(dir);
    copyFileSync(draftFile, backup);
    writeFileSync(draftFile, bestRun.text);
    const what = bestRun.round === 0 ? 'the pre-loop draft' : `the round ${bestRun.round} draft`;
    run.restored = { round: bestRun.round, score: bestRun.score, backup: basename(backup) };
    writeFileSync(reviewFile, readFileSync(reviewFile, 'utf8').replace(/\s*$/, '') + `\n\n## Review — ${STAMP()} loop restore of ${what}\n\n_fund loop restored ${what} (score ${bestRun.score}); the weaker draft is ${basename(backup)}. Its review, re-stated:_\n\n${bestRun.body}\n`);
    run.finalScore = bestRun.score;
    finalErrors = errorsOf(await checksNow());
  }
  run.finishedAt = ISO(core.now());
  run.finalErrors = finalErrors.length;
  const state = readLoopState(dir);
  state.version = 1;
  state.runs = [...(state.runs || []), run];
  writeLoopState(dir, state);

  printTable(slug, run);
  console.log(`\nstopped: ${run.stop}`);
  const firstBackup = run.rounds.find((r) => r.backup && r.fix === 'applied')?.backup;
  if (!run.restored && firstBackup && start.total !== null && run.finalScore !== null && run.finalScore < start.total) {
    console.log(`note: the pre-loop draft scored ${start.total} and is kept as ${firstBackup} (not restored: it had more check errors); compare before continuing`);
  }
  if (run.restored) console.log(`restored: draft.md ${run.restored.round === 0 ? 'from before the loop' : `from round ${run.restored.round}`} (score ${run.restored.score}); the weaker draft is ${run.restored.backup}`);
  if (run.finalScore === null && review && !aiError && run.rounds.length) console.log('note: the final draft.md has no score yet (its review was not parseable); the next loop run reviews it first');
  console.log(`AI calls: ${run.aiCalls.autofix} autofix, ${run.aiCalls.review} review   recorded in applications/${slug}/.fund/loop.json`);
  const reached = !finalErrors.length && (!review || (run.finalScore !== null && run.finalScore >= target));
  let next;
  if (aiError) next = `fix $FUND_AI_CMD, then ${FUND} loop ${slug}`;
  else if (finalErrors.length) next = `${FUND} check ${slug}   (${finalErrors.length} error(s) the autofix could not clear: ${finalErrors.map((e) => e.name).join(', ')})`;
  else if (reached) next = existsSync(join(core.ROOT, 'lib', 'commands', 'run.mjs')) ? `${FUND} run ${slug}   (re-runs what the new draft made stale, then stops at the next human step)` : `read applications/${slug}/draft.md, then ${FUND} status ${slug} in-review`;
  else next = `improve ${last.weakest.join(', ') || 'the weakest criteria'} by hand or add facts, then ${FUND} loop ${slug} --rounds ${N}`;
  console.log(`next: ${next}`);
  return { run, code: aiError ? 1 : 0 };
}

export default {
  name: 'loop',
  help: '<slug> [--rounds N=3] [--target S] [--no-review] [--dry] [--force]  auto check → fix → review → score until target',
  booleanFlags: ['no-review', 'dry', 'force'],
  async run({ args, flags, core, runAI, tracks }) {
    const slug = args[0];
    if (!slug) { console.error('usage: loop <slug> [--rounds N=3] [--target S] [--no-review] [--dry]'); return 2; }
    if (!existsSync(join(core.appDir(slug), 'call.md'))) { console.error(`no application "${slug}"\nnext: ${FUND} list`); return 2; }
    const status = core.loadApp(slug).call.fm.status || 'researching';
    const track = tracks?.[core.loadApp(slug).call.fm.track];
    if (track?.noLoop && !flags.force) { console.error(`${slug}: track ${track.id} does not use fund loop — ${track.noLoop}\nnext: ${FUND} run ${slug}`); return 2; }
    if (core.CLOSED.has(status) && !flags.force) { console.error(`${slug} is ${status}; the loop does not spend AI calls on closed or parked applications (use --force)\nnext: ${FUND} status ${slug} drafting`); return 2; }
    if (status === 'ready' && !flags.force) { console.error(`${slug} is ready: a person already read and approved this draft, and a loop rewrite would reopen that read (use --force)\nnext: ${FUND} queue`); return 2; }
    if (flags.rounds !== undefined && roundsOf(flags.rounds) === null) { console.error(`--rounds must be a whole number ≥ 1 (got "${flags.rounds}")\nnext: ${FUND} loop ${slug} --rounds 3`); return 2; }
    if (flags.target !== undefined && targetOf(flags.target) === null) { console.error(`--target must be a score from 0 to 100 (got "${flags.target}")\nnext: ${FUND} loop ${slug} --target 75`); return 2; }
    if (!existsSync(join(core.appDir(slug), 'draft.md'))) { console.error(`applications/${slug}/draft.md is missing\nnext: ${FUND} prompt draft ${slug} --run --out applications/${slug}/draft.md`); return 2; }
    const { code } = await loop({
      slug, core, runAI, tracks,
      rounds: flags.rounds, target: flags.target, review: !flags['no-review'], dry: !!flags.dry,
    });
    return code;
  },
};
