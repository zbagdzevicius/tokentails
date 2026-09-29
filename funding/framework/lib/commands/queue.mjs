// fund queue [--json]   every step that needs a person, across all apps, soonest deadline first
// fund stats [<slug>]   actual time per step (from .fund/state.json history) vs estimate_h

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePipeline, readState, instructionsOf, nextCommand } from '../pipeline.mjs';
import { planFor, daysLeft, dueLabel } from './plan.mjs';
import { sessionsBySlugStep, usesOrc } from './sessions.mjs';

export async function humanQueue({ core, tracks, runAI, invoke, flags = {} }) {
  const items = [];
  for (const slug of core.listApps()) {
    let p;
    try { p = await planFor(slug, { core, tracks, runAI, invoke, flags }); } catch (e) {
      items.push({ slug, step: 'load', kind: 'fix', title: 'Application does not load', instructions: e.message, command: `fund check ${slug}`, deadline: 'rolling', days: null, estimate_h: 0.1 });
      continue;
    }
    if (p.closed || p.fm.status === 'submitted') continue;
    const base = { slug, program: p.fm.program || slug, deadline: p.fm.deadline || 'rolling', days: daysLeft(core, p.fm.deadline), url: p.fm.url || '' };
    for (const r of p.rows) {
      if (r.status !== 'human' || r.step.wait) continue; // a wait step (Track E) needs nobody until it fires
      items.push({ ...base, step: r.step.id, kind: 'human', title: r.step.title, reason: r.reason, estimate_h: r.step.estimate_h ?? 0, instructions: instructionsOf(r.step, p.ctx, slug) || r.step.title, command: nextCommand(slug, r, p.ctx) });
    }
    // An automatable step that failed on its last run needs a person too.
    if (p.next && p.next.step.kind !== 'human' && p.lastFail) {
      items.push({ ...base, step: p.next.step.id, kind: 'fix', title: `Unblock ${p.next.step.id}: ${p.next.step.title}`, reason: p.next.reason, estimate_h: 0.25, instructions: p.lastFail, command: `fund run ${slug}` });
    }
  }
  const key = (i) => (i.days == null ? 1e9 : i.days);
  items.sort((a, b) => key(a) - key(b) || a.slug.localeCompare(b.slug));
  return items;
}

const queue = {
  name: 'queue',
  help: '[--json]                         every step waiting for a person, soonest deadline first',
  booleanFlags: ['json'],
  async run({ flags, core, runAI, tracks, invoke }) {
    const items = await humanQueue({ core, tracks, runAI, invoke, flags });
    if (flags.json) { console.log(JSON.stringify(items, null, 2)); return 0; }
    if (!items.length) { console.log('Nothing waits for a person.'); console.log('next: fund plan --all'); return 0; }
    const hours = items.reduce((n, i) => n + (i.estimate_h || 0), 0);
    console.log(`${items.length} step(s) wait for a person (~${hours.toFixed(2)}h)\n`);
    items.forEach((i, n) => {
      console.log(`${String(n + 1).padStart(2)}. ${i.kind === 'fix' ? '✗' : '☐'} ${i.slug} · ${i.step}  (due ${dueLabel(core, i.deadline)}, ~${i.estimate_h}h)`);
      console.log(`    ${i.title}`);
      if (i.reason) console.log(`    why: ${i.reason}`);
      console.log(`    do: ${i.instructions}`);
      if (i.url && i.step === 'submit') console.log(`    form: ${i.url}`);
      console.log(`    then: ${i.command}`);
    });
    console.log(`\nnext: ${items[0].command}`);
    return 0;
  },
};

// ---------- stats ----------

export function stepStats(state) {
  const by = {};
  let lastEngineAt = null;
  for (const h of state.history || []) {
    const s = (by[h.step] ||= { runs: 0, ok: 0, fail: 0, seconds: 0, humanWaitH: null });
    if (h.event === 'start') s.runs++;
    if (h.event === 'done') { s.ok++; s.seconds += Number(h.seconds) || 0; }
    if (h.event === 'fail') { s.fail++; s.seconds += Number(h.seconds) || 0; }
    if (h.event === 'human-done' && lastEngineAt) s.humanWaitH = (Date.parse(h.at) - Date.parse(lastEngineAt)) / 3600000;
    if (h.event !== 'human-done') lastEngineAt = h.at;
  }
  return by;
}

const money = (x) => `$${(Number(x) || 0).toFixed(x && x < 0.1 ? 4 : 2)}`;
const toks = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0));

const stats = {
  name: 'stats',
  help: '[<slug>]                         per step: runs and seconds vs estimate, AI sessions, cost, tokens, turns',
  booleanFlags: ['json'],
  async run({ args, flags, core, tracks }) {
    if (args[0] && !existsSync(join(core.appDir(args[0]), 'call.md'))) { console.error(`no application "${args[0]}" — see fund list`); return 2; }
    const sess = await sessionsBySlugStep(); // orc sessions labelled "<slug>/<step>"
    const slugs = args[0] ? [args[0]] : [...new Set([...core.listApps(), ...Object.keys(sess).filter((s) => existsSync(join(core.appDir(s), 'call.md')))])].sort();
    const out = [];
    let totalSec = 0; let totalRuns = 0; let totalEstAuto = 0; let totalEstHuman = 0;
    const ai = { sessions: 0, costUsd: 0, tokens: 0, turns: 0 };
    for (const slug of slugs) {
      const state = readState(core.appDir(slug));
      const bySess = sess[slug] || {};
      if (!state.history.length && !Object.keys(bySess).length) continue;
      const steps = await resolvePipeline({ slug, core, tracks });
      const by = stepStats(state);
      const blank = { runs: 0, ok: 0, fail: 0, seconds: 0, humanWaitH: null };
      const ids = [...steps.map((s) => s.id).filter((id) => by[id] || bySess[id]), ...[...new Set([...Object.keys(by), ...Object.keys(bySess)])].filter((id) => !steps.some((s) => s.id === id))];
      const rows = ids.map((id) => {
        const s = steps.find((x) => x.id === id);
        // a human step the engine ran (the agentic source fetch) was an ai step at the time
        const kind = s?.kind === 'human' && by[id]?.runs ? 'ai' : s?.kind || (bySess[id] ? 'ai' : '?');
        return { id, kind, estimate_h: s?.estimate_h ?? 0, ...blank, ...by[id], ai: bySess[id] || null };
      });
      for (const r of rows) {
        totalSec += r.seconds; totalRuns += r.runs;
        if (r.kind === 'human') totalEstHuman += r.estimate_h; else if (r.ok) totalEstAuto += r.estimate_h;
        if (r.ai) for (const k of Object.keys(ai)) ai[k] += r.ai[k] || 0;
      }
      out.push({ slug, rows });
    }
    if (flags.json) { console.log(JSON.stringify({ apps: out, totals: { seconds: totalSec, runs: totalRuns, automatedEstimateH: totalEstAuto, humanEstimateH: totalEstHuman, ai } }, null, 2)); return 0; }
    if (!out.length) { console.log('No pipeline history yet.'); console.log(`next: fund run ${args[0] || '<slug>'}`); return 0; }
    for (const a of out) {
      console.log(`\n${a.slug}`);
      console.log(`  ${'step'.padEnd(18)} ${'kind'.padEnd(6)} ${'runs'.padStart(4)} ${'ok'.padStart(3)} ${'fail'.padStart(4)} ${'actual'.padStart(8)} ${'est'.padStart(6)} ${'sess'.padStart(4)} ${'cost'.padStart(8)} ${'tokens'.padStart(7)} ${'turns'.padStart(5)}  note`);
      for (const r of a.rows) {
        const note = r.kind === 'human' ? (r.humanWaitH != null ? `person took ${r.humanWaitH.toFixed(2)}h wall-clock` : 'marked by a person') : r.fail ? `${r.fail} failed run(s)` : '';
        const x = r.ai || { sessions: 0, costUsd: 0, tokens: 0, turns: 0 };
        const aiCols = r.ai ? `${String(x.sessions).padStart(4)} ${money(x.costUsd).padStart(8)} ${toks(x.tokens).padStart(7)} ${String(x.turns).padStart(5)}` : `${'-'.padStart(4)} ${'-'.padStart(8)} ${'-'.padStart(7)} ${'-'.padStart(5)}`;
        console.log(`  ${r.id.padEnd(18)} ${r.kind.padEnd(6)} ${String(r.runs).padStart(4)} ${String(r.ok).padStart(3)} ${String(r.fail).padStart(4)} ${`${r.seconds.toFixed(2)}s`.padStart(8)} ${`${r.estimate_h}h`.padStart(6)} ${aiCols}  ${note}`);
      }
    }
    console.log(`\ntotal: ${totalRuns} run(s), ${totalSec.toFixed(2)}s of engine time; ai/auto steps done carry ~${totalEstAuto.toFixed(2)}h of estimated review time; human steps estimated ${totalEstHuman.toFixed(2)}h`);
    console.log(`ai: ${ai.sessions} Claude Code session(s), ${money(ai.costUsd)}, ${toks(ai.tokens)} tokens, ${ai.turns} turns${usesOrc() ? '' : '   (FUND_AI_CMD is set: new AI calls are not tracked as sessions)'}`);
    console.log(ai.sessions ? 'next: fund ps --all   (fund logs <id> for one session)' : 'next: fund queue');
    return 0;
  },
};

export default [queue, stats];
