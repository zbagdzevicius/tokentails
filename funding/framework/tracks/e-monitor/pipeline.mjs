// Track E pipeline — monitor a parked program until it is worth building for.
//
//   watch-configured (HUMAN while watch: / revisit: are empty or unknown)
//   → scan (e:scan --only <watch ids>; optional: a daily cron scan keeps it fresh too)
//   → wait (completes by itself when the revisit date arrives or a watched source changed)
//   → reopen (HUMAN: move the program to its build track, or push revisit:)
//
// done() reads call.md, tracks/e-monitor/watchlist.json and state.json (FUND_E_* overrides) only.
// A source counts as changed when its lastChanged is after the baseline: the pipeline's first
// recorded scan, else `watch_since:` in call.md, else the end of the day in `created:`.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DAY = 86400000;
const DEFAULT_SCAN_HOURS = 24;

const watchlistPath = () => process.env.FUND_E_WATCHLIST || join(HERE, 'watchlist.json');
const statePath = () => process.env.FUND_E_STATE || join(HERE, 'state.json');
const readJson = (f, fallback) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback; } catch { return fallback; } };
const asList = (v) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);
const iso = (t) => new Date(t).toISOString();

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

function config(ctx) {
  const fm = ctx.app?.call?.fm || {};
  const watch = asList(fm.watch);
  const ids = new Set(readJson(watchlistPath(), []).map((s) => s.id));
  const unknown = watch.filter((w) => !ids.has(w));
  const revisit = fm.revisit ? Date.parse(fm.revisit) : NaN;
  return { fm, watch, unknown, revisit };
}

function baseline(ctx, fm) {
  const first = (ctx.state?.history || []).find((e) => e.step === 'scan' && e.event === 'done');
  if (first && !Number.isNaN(Date.parse(first.at))) return { at: Date.parse(first.at), from: 'first pipeline scan' };
  if (fm.watch_since && !Number.isNaN(Date.parse(fm.watch_since))) return { at: Date.parse(fm.watch_since), from: 'watch_since' };
  const c = fm.created ? Date.parse(String(fm.created).slice(0, 10)) : NaN;
  if (!Number.isNaN(c)) return { at: c + DAY, from: 'created' };
  return null;
}

/** { at, why } when the revisit date arrived or a watched source changed after the baseline; else null. */
function trigger(ctx) {
  const { fm, watch, revisit } = config(ctx);
  const now = ctx.now.getTime();
  const hits = [];
  if (!Number.isNaN(revisit) && revisit <= now) hits.push({ at: revisit, why: `revisit date ${fm.revisit} has arrived` });
  const base = baseline(ctx, fm);
  if (base) {
    const state = readJson(statePath(), {});
    const changed = watch.map((id) => ({ id, t: Date.parse(state[id]?.lastChanged || '') })).filter((x) => !Number.isNaN(x.t) && x.t > base.at);
    if (changed.length) hits.push({ at: Math.max(...changed.map((x) => x.t)), why: `${changed.map((x) => x.id).join(', ')} changed since ${iso(base.at).slice(0, 10)} (${base.from}) — see E-CHANGES.md` });
  }
  if (!hits.length) return null;
  return { at: Math.max(...hits.map((x) => x.at)), why: hits.map((x) => x.why).join('; ') };
}

function scanState(ctx) {
  const { fm, watch } = config(ctx);
  const hours = Number(fm.scan_every_hours) > 0 ? Number(fm.scan_every_hours) : DEFAULT_SCAN_HOURS;
  const state = readJson(statePath(), {});
  const now = ctx.now.getTime();
  const stale = watch.filter((id) => { const t = Date.parse(state[id]?.lastChecked || ''); return Number.isNaN(t) || now - t > hours * 3600000; });
  const errors = watch.filter((id) => state[id]?.lastError).map((id) => `${id}: ${state[id].lastError}`);
  if (!watch.length) return { done: false, reason: 'no watch ids' };
  if (stale.length) return { done: false, reason: `${stale.length}/${watch.length} source(s) not scanned in the last ${hours}h: ${stale.join(', ')}` };
  return { done: true, errors, reason: `${watch.length} source(s) scanned within ${hours}h${errors.length ? `; ${errors.length} error(s): ${errors.join('; ')}` : ''}` };
}

// ---------- the pipeline ----------

export default function pipeline(defaultSteps, h) {
  const watchConfigured = {
    id: 'watch-configured',
    title: 'Set watch: (watchlist ids) and revisit: in call.md',
    kind: 'human',
    estimate_h: 0.1,
    needs: [],
    optional: false,
    noOverride: true,
    command: 'fund run <slug>   # after setting watch: and revisit: in call.md',
    instructions: 'In applications/<slug>/call.md set watch: [ids from tracks/e-monitor/watchlist.json] (add a source first with fund e:add <id> <url> --kind html|rss|json) and revisit: YYYY-MM-DD. Then: fund run <slug>',
    done(ctx) {
      const { fm, watch, unknown, revisit } = config(ctx);
      const miss = [];
      if (!watch.length) miss.push('watch: is empty');
      if (unknown.length) miss.push(`not in watchlist.json: ${unknown.join(', ')} (add with fund e:add)`);
      if (!fm.revisit) miss.push('revisit: is empty');
      else if (Number.isNaN(revisit)) miss.push(`revisit "${fm.revisit}" is not a date`);
      return miss.length ? { done: false, reason: miss.join('; ') } : { done: true, reason: `${watch.length} source(s) watched, revisit ${fm.revisit}` };
    },
  };

  const scan = {
    id: 'scan',
    title: 'Scan the watched sources (e:scan --only <watch ids>)',
    kind: 'auto',
    estimate_h: 0,
    needs: ['watch-configured'],
    optional: true, // a daily cron `fund e:scan` keeps the state fresh as well; waiting never blocks on it
    runWhenParked: true, // E apps are parked by nature; the engine still runs this read-only scan
    done: (ctx) => scanState(ctx),
    async run(ctx) {
      const { watch } = config(ctx);
      const argv = ['e:scan', '--only', watch.join(',')];
      if (typeof ctx.flags?.offline === 'string') argv.push('--offline', ctx.flags.offline);
      const res = await call(ctx, argv);
      const sum = res.lines.find((l) => /changed · /.test(l));
      if (res.code !== 0) return { ok: false, message: `fund ${argv.join(' ')} exited ${res.code}: ${res.lines.slice(0, 2).join('; ')}` };
      return { ok: true, message: `scanned ${watch.join(', ')}${sum ? ` — ${sum}` : ''}` };
    },
    verify(ctx) {
      const s = scanState(ctx);
      if (!s.done) return { level: 'warn', detail: s.reason };
      return { level: s.errors.length ? 'warn' : 'ok', detail: s.reason };
    },
  };

  const wait = {
    id: 'wait',
    title: 'Wait for the revisit date or a change in a watched source',
    kind: 'human',
    estimate_h: 0,
    needs: ['watch-configured', 'scan'],
    optional: false,
    wait: true, // nobody acts: fund queue skips it, fund run prints "waiting" (see PIPELINE-CONTRACT.md)
    command: 'fund go   # daily (or fund run <slug>): re-scans; this step completes by itself',
    instructions: 'Nothing to do yet: keep `fund e:scan` running daily (cron or launchd). This step completes by itself when the revisit date arrives or a watched source changes. To reopen early anyway: fund done <slug> wait',
    done(ctx) {
      const t = trigger(ctx);
      if (t) return { done: true, reason: t.why };
      const { fm, revisit } = config(ctx);
      const days = Number.isNaN(revisit) ? null : Math.ceil((revisit - ctx.now.getTime()) / DAY);
      const base = baseline(ctx, fm);
      return { done: false, reason: `waiting: revisit ${fm.revisit || '?'}${days != null ? ` (in ${days} days)` : ''}; no watched source changed${base ? ` since ${iso(base.at).slice(0, 10)}` : ''}` };
    },
  };

  const reopen = {
    id: 'reopen',
    title: 'Move the program to its build track (or push revisit:)',
    kind: 'human',
    estimate_h: 0.5,
    needs: ['wait'],
    optional: false,
    instructions: 'The trigger fired: read applications/E-CHANGES.md and the program\'s call page. If it is now worth applying, open it in its build track (fund new <slug>-<year> --track A|B|C|D --program "..." --url ... --deadline ..., or change track: in call.md and run fund status <slug> researching), then fund run it. If not, push revisit: to a later date. Then: fund done <slug> reopen',
    done(ctx) {
      const waitMark = h.humanMark(ctx, 'wait');
      const t = trigger(ctx) || (waitMark ? { at: Date.parse(waitMark.doneAt), why: `reopened early by a person ${waitMark.doneAt}` } : null);
      const m = h.humanMark(ctx, 'reopen');
      if (m && t && Date.parse(m.doneAt) >= t.at) return { done: true, reason: `handled ${m.doneAt}${m.last && m.last !== 'marked done by a person' ? ` — ${m.last}` : ''}` };
      return { done: false, noOverride: true, reason: t ? `${t.why} — decide: build track or a later revisit` : 'waiting for the trigger' };
    },
  };

  return [watchConfigured, scan, wait, reopen];
}
