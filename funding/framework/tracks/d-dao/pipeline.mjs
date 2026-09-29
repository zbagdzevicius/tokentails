// Track D pipeline — a DAO candidate proposal as one `fund run`.
//
//   source → extract → budget (HUMAN while budget.md is empty or out of bounds) → draft → check
//   → revise → review → export (d:export) → post (HUMAN pastes proposal.md, then d:post --url)
//   → sponsor-hunt (HUMAN, repeating: d:log; done when d:clock says CONTINUE) → ready
//   → submit (HUMAN: the sponsor puts it onchain) → record-submission
//
// A KILL verdict (kill window passed, no sponsor) leaves sponsor-hunt blocked with the
// "fund status <slug> parked" instruction. done() reads files only. Nothing here posts or signs.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadDao, budgetBounds, ethUsdProblem, buildProposal, clock, killDays } from './track.mjs';

// ---------- invoke a fund command, capture its output into a one-line message ----------

async function call(ctx, argv) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  const grab = (...a) => lines.push(a.map(String).join(' '));
  console.log = grab; console.error = grab; console.warn = grab;
  let code;
  try { code = await ctx.invoke(argv); } catch (e) { lines.push(`error: ${e.message}`); code = 1; } finally { Object.assign(console, orig); }
  return { code: code ?? 0, lines: lines.join('\n').split('\n').map((l) => l.trim()).filter(Boolean) };
}

// ---------- detectors ----------

const fmOf = (ctx) => ctx.app?.call?.fm || {};

function budgetState(ctx) {
  const fm = fmOf(ctx);
  const { budget, totals } = loadDao(ctx.dir, fm);
  if (!budget) return { done: false, reason: 'no budget.md — copy tracks/d-dao/templates/budget.md' };
  const problems = [...budget.problems, ethUsdProblem(fm.eth_usd)].filter(Boolean);
  if (problems.length) return { done: false, reason: `budget.md: ${problems.slice(0, 2).join('; ')}` };
  if (!budget.rows.length) return { done: false, reason: 'budget.md has no "| Item | Amount | Currency |" rows yet' };
  const b = budgetBounds(totals, { min: fm.min_budget, max: fm.max_budget, unit: fm.budget_unit });
  if (b.level === 'error') return { done: false, reason: `budget ${b.detail}` };
  return { done: true, reason: `${budget.rows.length} row(s), ${b.detail}` };
}

function proposalState(ctx) {
  const p = join(ctx.dir, 'proposal.md');
  if (!existsSync(p)) return { done: false, reason: 'no proposal.md yet' };
  const norm = (t) => t.replace(/\r\n?/g, '\n').trim();
  const have = norm(readFileSync(p, 'utf8'));
  let fresh = false;
  try { fresh = [false, true].some((keepCites) => norm(buildProposal(ctx.app, { keepCites }).text) === have); } catch (e) { return { done: false, reason: e.message }; }
  return fresh ? { done: true, reason: 'proposal.md matches draft.md + budget.md + call.md + sponsors.md' } : { done: false, reason: 'proposal.md is out of date (draft, budget, posted date or a sponsor row changed)' };
}

function clockState(ctx) {
  const fm = fmOf(ctx);
  const kd = killDays(fm.kill_after_days);
  if (kd.problem) return { error: `${kd.problem} — fix kill_after_days in call.md` };
  try { return { c: clock({ posted: fm.posted, killAfterDays: fm.kill_after_days, sponsors: loadDao(ctx.dir, fm).sponsors }) }; } catch (e) { return { error: e.message }; }
}

// ---------- scoped checks ----------
//
// Every D:* check (budget, kill-window, sponsors-pii, proposal, criteria-quotes) is about budget.md,
// sponsors.md, proposal.md or call.md — never draft.md prose — so an AI revise can never fix one and
// must never be triggered by one. D:kill-window belongs to sponsor-hunt (which turns KILL into the
// "park it" instruction); if the draft check waited on it, a KILL would block the whole pipeline at
// `check` and send revise rewriting a finished draft. ready still runs every check.

const CORE_NOT_DRAFT = new Set(['status', 'deadline', 'frame', 'frontmatter', 'track', 'facts-file']);
const draftFixable = (e) => !CORE_NOT_DRAFT.has(e.name) && !/^D:/.test(e.name);
const notClock = (e) => e.name !== 'D:kill-window';

/** ctx whose core.runChecks only reports the errors `keep` accepts (warnings pass through). */
function withChecks(ctx, keep) {
  const core = Object.create(ctx.core);
  core.runChecks = async (...a) => {
    const r = await ctx.core.runChecks(...a);
    const results = r.results.filter((x) => x.level !== 'error' || keep(x, ctx));
    return { ...r, results, ok: !results.some((x) => x.level === 'error') };
  };
  return { ...ctx, core };
}

// ---------- the pipeline ----------

export default function pipeline(defaultSteps, h) {
  const by = Object.fromEntries(defaultSteps.map((s) => [s.id, s]));

  const budget = {
    id: 'budget',
    title: 'Fill budget.md and set eth_usd / min_budget / max_budget in call.md',
    kind: 'human',
    estimate_h: 0.5,
    needs: [],
    optional: false,
    noOverride: true, // evidence is a budget.md that parses and sits inside the bounds
    instructions: 'Add one "| Item | Amount | Currency |" row per line item to applications/<slug>/budget.md (ETH or USD, no Total row). In call.md set eth_usd (today\'s rate), budget_unit, min_budget and max_budget. Then: fund run <slug>',
    done: (ctx) => budgetState(ctx),
  };

  const draft = { ...by.draft, needs: ['extract', 'budget'] };

  const checkErrs = async (ctx) => (await h.checkErrors(ctx)).filter(notClock);
  const check = {
    ...by.check,
    title: 'Run fund check (the kill window is judged by sponsor-hunt)',
    async done(ctx) {
      const e = await checkErrs(ctx);
      return e.length ? { done: false, reason: `${e.length} error(s): ${e.slice(0, 3).map((x) => x.name).join(', ')}` } : { done: true, reason: 'fund check passes (kill window: see sponsor-hunt)' };
    },
    async run(ctx) {
      const e = await checkErrs(ctx);
      if (!e.length) return { ok: true, message: 'fund check passes' };
      const people = e.filter((x) => !draftFixable(x));
      const hint = people.length ? ` — needs a person: ${people.map((x) => `${x.name} (${x.detail})`).join('; ')}` : ' — the revise step will fix them';
      return { ok: false, message: `${e.length} error(s): ${e.map((x) => x.name).join(', ')}${hint}` };
    },
    async verify(ctx) {
      const e = await checkErrs(ctx);
      return e.length ? { level: 'error', detail: e.map((x) => `- ${x.name}: ${x.detail}`).join('\n') } : { level: 'ok', detail: 'fund check passes (kill window: see sponsor-hunt)' };
    },
  };

  // The AI only ever sees (and is only triggered by) check errors it can fix in draft.md.
  const revise = {
    ...by.revise,
    done: (ctx) => by.revise.done(withChecks(ctx, draftFixable)),
    run: (ctx) => by.revise.run(withChecks(ctx, draftFixable)),
  };
  const review = { ...by.review, needs: ['check'] };

  const exportStep = {
    id: 'export',
    title: 'Write proposal.md: sections, ETH/USD budget table, sponsor ask (d:export)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['review', 'revise'],
    optional: false,
    done: (ctx) => proposalState(ctx),
    async run(ctx) {
      const argv = ['d:export', ctx.slug];
      const res = await call(ctx, argv);
      const line = res.lines.find((l) => l.startsWith('wrote '));
      if (res.code === 0) return { ok: true, message: line || 'wrote proposal.md' };
      const why = res.lines.find((l) => /not exported|fund check still fails|no "## "/.test(l)) || res.lines.slice(-1)[0] || '';
      return { ok: false, message: `fund d:export ${ctx.slug} exited ${res.code}: ${why}` };
    },
    verify(ctx) { const s = proposalState(ctx); return { level: s.done ? 'ok' : 'warn', detail: s.reason }; },
  };

  const post = {
    id: 'post',
    title: 'Post proposal.md to the forum as a candidate and start the kill clock',
    kind: 'human',
    estimate_h: 0.25,
    needs: ['export'],
    optional: false,
    noOverride: true, // evidence is `posted:` in call.md, set by d:post
    command: 'fund d:post <slug> --url <thread-url>   # after you paste proposal.md to the forum',
    instructions: 'Read applications/<slug>/proposal.md end to end, then paste it to the DAO forum as a candidate yourself (forum_url or url in call.md). Start the clock: fund d:post <slug> --url <thread-url>. fund run <slug> then refreshes proposal.md with the withdraw date; paste that over the post.',
    done(ctx) {
      const fm = fmOf(ctx);
      if (!fm.posted) return { done: false, reason: 'not posted yet — after posting: fund d:post <slug> --url <thread-url>'.replace('<slug>', ctx.slug) };
      return { done: true, reason: `posted ${fm.posted}${fm.forum_url ? ` at ${fm.forum_url}` : ''}` };
    },
  };

  const sponsorHunt = {
    id: 'sponsor-hunt',
    title: 'Find one sponsor inside the kill window (log every ask with d:log)',
    kind: 'human',
    estimate_h: 1,
    needs: ['post'],
    optional: false,
    noOverride: true, // evidence is a "yes" / "sponsor" row in sponsors.md
    command: 'fund d:log <slug> --who "<role>" --channel <channel> --ask "Sponsor the candidate?" --response pending|yes',
    instructions: 'Ask voters and delegates to sponsor the candidate (forum thread, Discord, X). Log every ask by role, never contact details: fund d:log <slug> --who "Noun owner" --channel Discord --ask "Sponsor the candidate?" --response pending (re-log with --response yes when someone agrees). Check daily: fund d:clock <slug>. On KILL: fund status <slug> parked --next "No sponsor in kill window"',
    done(ctx) {
      const { c, error } = clockState(ctx);
      if (error) return { done: false, reason: error };
      if (c.verdict === 'CONTINUE') return { done: true, reason: `sponsor: ${c.sponsorRows.map((r) => `${r.who} (${r.date})`).join(', ')}` };
      if (c.verdict === 'KILL') return { done: false, kill: true, blocked: true, reason: `KILL: day ${c.daysSince} of ${c.killAfterDays}, no sponsor — park it: fund status ${ctx.slug} parked --next "No sponsor in kill window"` };
      if (c.verdict === 'NOT POSTED') return { done: false, reason: 'not posted yet' };
      return { done: false, reason: `FIND SPONSOR: day ${c.daysSince} of ${c.killAfterDays} (${c.daysLeft} left, window closes ${c.killDate}), ${c.asks} ask(s) logged — ask someone, then fund d:log ${ctx.slug} ...` };
    },
    verify(ctx) {
      const { c, error } = clockState(ctx);
      if (error) return { level: 'error', detail: error };
      return { level: c.verdict === 'CONTINUE' ? 'ok' : c.verdict === 'KILL' ? 'error' : 'warn', detail: c.verdict };
    },
  };

  const ready = { ...by.ready, needs: ['sponsor-hunt', 'check'] };

  const submit = {
    ...by.submit,
    title: 'Get the candidate onchain with the sponsor',
    instructions: 'The sponsor puts the candidate onchain (or you submit it together through the DAO\'s governance UI). You sign nothing from this framework. When it is a live proposal: fund done <slug> submit',
  };

  return [by.source, by.extract, budget, draft, check, revise, review, exportStep, post, sponsorHunt, ready, submit, by['record-submission']];
}
