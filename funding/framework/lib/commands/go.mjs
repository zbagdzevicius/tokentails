// fund go — portfolio autopilot. Rank every opportunity, scaffold what is missing (--scaffold),
// run the automatable steps of each application in rank order within the weekly capacity, collect
// the human queue, and write applications/WEEK.md. Never submits, signs, sends or posts anything.

import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  loadPortfolio, validatePortfolio, weekPlan, weekMarkdown, portfolioPath, money, dueLabel, CLOSED_STATUSES,
} from '../portfolio.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILTINS = ['new', 'check', 'prompt', 'status', 'tracker', 'list', 'facts', 'tracks', 'help'];
const FUND = 'node bin/fund.mjs';
const FUND_BIN = join(HERE, '..', '..', 'bin', 'fund.mjs');

/** Live one-liner per app: the step its running Claude Code session is on (orc sessions "<slug>/<step>"). */
async function liveSteps(slugs) {
  try {
    const s = await import('./sessions.mjs');
    const lib = await s.orcLib();
    if (!lib) return '';
    const live = lib.listSessions({ store: s.orcHome(), all: false }).filter((m) => m.status === 'running');
    return slugs.map((slug) => {
      const m = live.find((x) => String(x.label || '').startsWith(`${slug}/`));
      return m ? `${slug}: ${m.label.slice(slug.length + 1)} ${lib.fmtDur(lib.elapsedMs(m))}${m.costUsd ? ` ${lib.fmtCost(m.costUsd)}` : ''}` : `${slug}: …`;
    }).join(' · ');
  } catch { return ''; }
}

/**
 * fund go --parallel N: each application's pipeline in its own process (node bin/fund.mjs run <slug>),
 * up to N at once; each app stays sequential. → [{ argv, code, out }] in job order.
 */
async function runParallel(jobs, n, log) {
  const results = new Array(jobs.length);
  const running = new Map();
  let nextIdx = 0; let finished = 0;
  const t0 = Date.now();
  const secs = (t) => `${((Date.now() - t) / 1000).toFixed(1)}s`;
  const counts = () => `${running.size} running · ${finished}/${jobs.length} done · ${jobs.length - nextIdx} queued`;
  const tickS = Number(process.env.FUND_GO_TICK) || 15;
  const tick = setInterval(async () => {
    if (!running.size) return;
    const line = await liveSteps([...running.values()].map((r) => r.slug));
    log(`  … ${secs(t0)} · ${counts()}${line ? ` · ${line}` : ''}`);
  }, tickS * 1000);
  const children = new Set();
  let interrupted = false;
  // Each `fund run` child leads its own process group, so SIGTERM reaches its `orc exec` too (which
  // then stops its Claude Code session and records it as killed). Queued jobs are not started.
  const stop = () => {
    interrupted = true;
    log(`  ✗ interrupted — stopping ${children.size} running application(s), not starting ${jobs.length - nextIdx} queued`);
    for (const c of children) { try { process.kill(-c.pid, 'SIGTERM'); } catch { try { c.kill('SIGTERM'); } catch { /* gone */ } } }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  log(`  parallel ${n}: ${jobs.length} application(s), one process each — track the AI sessions: fund watch   (or fund ps)`);
  try {
    await new Promise((resolve) => {
      const launch = () => {
        if (finished === jobs.length || (interrupted && !running.size)) return resolve();
        while (!interrupted && running.size < n && nextIdx < jobs.length) {
          const i = nextIdx++;
          const { argv, slug } = jobs[i];
          const started = Date.now();
          let out = '';
          const child = spawn(process.execPath, [FUND_BIN, ...argv], { cwd: join(HERE, '..', '..'), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
          children.add(child);
          child.stdout.on('data', (b) => { out += b; });
          child.stderr.on('data', (b) => { out += b; });
          running.set(i, { slug, started });
          log(`  ▶ ${quote(argv).padEnd(38)} started · ${counts()}`);
          child.on('close', (code) => {
            children.delete(child);
            running.delete(i);
            finished++;
            results[i] = { argv, code: code ?? 1, out, seconds: (Date.now() - started) / 1000 };
            log(`  ${code === 0 ? '✓' : '!'} ${quote(argv).padEnd(38)} ${secs(started).padStart(7)}  ${resultNote(out, 2, code ?? 1).slice(0, 100)} · ${counts()}`);
            launch();
          });
          child.on('error', (e) => { out += `✗ ${e.message}`; });
        }
      };
      launch();
    });
  } finally {
    clearInterval(tick);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
  log(`  parallel run ${interrupted ? 'interrupted' : 'finished'} in ${secs(t0)}`);
  results.interrupted = interrupted;
  return results;
}


async function registeredCommands(tracks = {}) {
  const names = new Set(BUILTINS);
  for (const t of Object.values(tracks)) for (const c of Object.keys(t.commands || {})) names.add(c);
  for (const f of readdirSync(HERE).filter((x) => x.endsWith('.mjs'))) {
    try {
      const mod = (await import(pathToFileURL(join(HERE, f)).href)).default;
      for (const d of [].concat(mod || [])) if (d?.name) names.add(d.name);
    } catch { /* a broken sibling module must not stop go */ }
  }
  return names;
}

/** Run fn with console.log/error and stdout captured; → { value, out } */
async function capture(fn) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, write: process.stdout.write };
  const push = (...a) => lines.push(a.map(String).join(' '));
  console.log = push; console.error = push; console.warn = push;
  process.stdout.write = (chunk, ...rest) => { lines.push(String(chunk)); const cb = rest.find((x) => typeof x === 'function'); if (cb) cb(); return true; };
  try { return { value: await fn(), out: lines.join('\n') }; } finally {
    console.log = orig.log; console.error = orig.error; console.warn = orig.warn; process.stdout.write = orig.write;
  }
}

const lastLines = (text, n = 2) => text.split('\n').map((l) => l.trim()).filter(Boolean).slice(-n).join(' · ');

/** Short result note: a failure line if there is one (so it is never hidden behind a hint), then the tail. */
function resultNote(text, n = 2, code = 1) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const fail = code !== 0 && lines.find((l) => /(^✗|\bfail(ed)?\b|\berror\b|\bthrew\b)/i.test(l));
  const tail = lines.slice(-n);
  return [...(fail && !tail.includes(fail) ? [fail] : []), ...tail].join(' · ');
}

/** invoke with output captured; a throwing command becomes exit 1 with its message, never aborts go. */
async function safeInvoke(invoke, argv) {
  try {
    return await capture(() => invoke(argv));
  } catch (e) {
    return { value: 1, out: `✗ threw: ${e?.message || e}` };
  }
}

async function loadPipeline() {
  try { return await import('../pipeline.mjs'); } catch { return null; }
}

/** Existing applications: status, next, and remaining human hours from the pipeline when available. */
async function appInfo(core, tracks, pipeline) {
  const out = {};
  for (const slug of core.listApps()) {
    let app;
    try { app = core.loadApp(slug); } catch { continue; }
    const info = { status: app.call.fm.status || '', next: app.call.fm.next || '', deadline: app.call.fm.deadline || 'rolling' };
    if (pipeline?.resolvePipeline && pipeline?.evaluate && pipeline?.makeCtx && !CLOSED_STATUSES.has(info.status)) {
      try {
        const steps = await pipeline.resolvePipeline({ slug, core, tracks });
        const ctx = pipeline.makeCtx({ slug, core, runAI: () => { throw new Error('no AI while planning'); }, invoke: async () => 0, tracks, flags: {} });
        const ev = await pipeline.evaluate(steps, ctx);
        info.monitor = !!pipeline.isMonitor?.(steps);
        info.remaining_h = Math.round(ev.filter((e) => !e.done).reduce((s, e) => s + (Number(e.step.estimate_h) || 0), 0) * 100) / 100;
        info.evaluation = ev;
        const n = ev.find((e) => e.status === 'human' && !e.step.wait) || ev.find((e) => e.status === 'next');
        const cmd = (row) => (pipeline.nextCommand ? pipeline.nextCommand(slug, row, ctx) : `fund done ${slug} ${row.step.id}`);
        if (n) info.next = n.step.kind === 'human' ? `${n.step.title} → ${cmd(n)}` : `autopilot: ${n.step.id} → fund run ${slug}`;
        info.nextCommand = n ? cmd(n) : '';
      } catch { /* fall back to framework_hours */ }
    }
    out[slug] = info;
  }
  return out;
}

function normaliseQueue(raw) {
  const list = Array.isArray(raw) ? raw : raw?.queue || raw?.items || raw?.steps || [];
  return list.map((q) => {
    const slug = q.slug || q.app || q.application || '';
    const step = q.step?.id || q.step || q.id || q.stepId || '';
    return {
      slug, step,
      title: q.title || q.step?.title || '',
      instructions: q.instructions || q.step?.instructions || q.title || '',
      deadline: q.deadline || '',
      due: q.due || (q.deadline ? String(q.deadline).slice(0, 10) : 'rolling'),
      estimate_h: q.estimate_h ?? q.step?.estimate_h ?? null,
      command: q.command || q.doneCommand || (slug && step ? `${FUND} done ${slug} ${step}` : ''),
    };
  });
}

/** Human queue without the queue command: pipeline human steps, else the call.md "next:" line. */
function fallbackQueue(apps, plan) {
  const order = new Map(plan.ranked.map((r, i) => [r.slug, i]));
  const q = [];
  for (const [slug, info] of Object.entries(apps)) {
    if (CLOSED_STATUSES.has(info.status) || info.status === 'parked') continue;
    const human = info.evaluation?.find((e) => !e.done && !e.blocked && e.step.kind === 'human' && !e.step.wait);
    const due = info.deadline && info.deadline !== 'rolling' ? String(info.deadline).slice(0, 10) : 'rolling';
    if (human) q.push({ slug, step: human.step.id, title: human.step.title, instructions: typeof human.step.instructions === 'string' ? human.step.instructions.replace(/<slug>/g, slug) : human.step.title, due, command: info.nextCommand && info.nextCommand !== `fund done ${slug} ${human.step.id}` ? info.nextCommand : `${FUND} done ${slug} ${human.step.id}` });
    else if (!info.evaluation && info.next) q.push({ slug, step: 'next', title: info.next, instructions: info.next, due, command: `${FUND} check ${slug}` });
  }
  return q.sort((a, b) => (a.due === 'rolling') - (b.due === 'rolling') || a.due.localeCompare(b.due) || (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99));
}

/** Portfolio-level human actions: unpark reached apps, confirm conditions and verify CHECK rows. */
function portfolioActions(plan) {
  const file = 'portfolio/opportunities.json';
  const unpark = plan.waiting.filter((w) => w.parked).map((w) => ({
    slug: w.slug,
    step: 'unpark',
    instructions: `${w.program} is active (${w.verdict}) but its application is parked. Decide whether to work on it this week.`,
    due: w.deadline && w.deadline !== 'rolling' ? String(w.deadline).slice(0, 10) : 'rolling',
    command: `${FUND} status ${w.slug} drafting`,
  }));
  return [...unpark, ...plan.waiting.filter((w) => !w.parked && (w.verdict === 'COND' || w.verdict === 'CHECK')).map((w) => ({
    slug: w.slug,
    step: w.verdict === 'COND' ? 'confirm-condition' : 'verify-program',
    instructions: w.verdict === 'COND' ? `Confirm: ${w.condition}` : `Open ${w.url} and decide DO / SKIP`,
    due: w.deadline && w.deadline !== 'rolling' ? String(w.deadline).slice(0, 10) : 'rolling',
    command: w.verdict === 'COND' ? `set "condition_met": true for ${w.slug} in ${file}, then ${FUND} go --scaffold` : `set "verdict" for ${w.slug} in ${file}, then ${FUND} go`,
  }))];
}

function scaffoldArgv(o, core, programsDir) {
  const key = o.a_program || o.slug;
  if (o.track === 'A' && existsSync(join(programsDir, `${key}.json`))) {
    const argv = ['a:init', key];
    if (key !== o.slug) argv.push('--slug', o.slug);
    if (o.from && existsSync(join(core.appDir(o.from), 'draft.md'))) argv.push('--from', o.from);
    return argv;
  }
  const argv = ['new', o.slug, '--track', o.track, '--program', o.program, '--deadline', String(o.deadline || 'rolling')];
  if (o.url) argv.push('--url', o.url);
  if (o.frame) argv.push('--frame', o.frame);
  return argv;
}

const quote = (argv) => argv.map((a) => (/[\s"'$&|;()]/.test(a) ? JSON.stringify(a) : a)).join(' ');

export async function go({ flags = {}, core, tracks = {}, invoke, hasCommand, pipeline: injected, log = console.log }) {
  const capacity = flags.hours !== undefined && flags.hours !== true ? Number(flags.hours) : 20;
  if (!(capacity > 0)) { console.error('--hours must be a positive number'); return 2; }
  const dry = !!flags.dry;
  const noAi = !!flags['no-ai'];
  const parallel = flags.parallel !== undefined && flags.parallel !== true ? Number(flags.parallel) : 1;
  if (!(Number.isInteger(parallel) && parallel >= 1)) { console.error('--parallel must be a whole number >= 1, e.g. --parallel 2'); return 2; }
  const now = core.now();
  if (Number.isNaN(now.getTime())) { console.error(`FUND_NOW="${process.env.FUND_NOW}" is not a date (use e.g. 2026-10-01 or 2026-10-01T12:00:00Z)`); return 2; }
  if (!existsSync(portfolioPath())) { console.error(`no portfolio file at ${portfolioPath()} — create it (see portfolio/opportunities.json) or set FUND_PORTFOLIO`); return 1; }
  let doc;
  try { doc = loadPortfolio(); } catch (e) { console.error(e.message); return 1; }
  const problems = validatePortfolio(doc);
  if (problems.length) { console.error(`${portfolioPath()} problems:\n  ${problems.join('\n  ')}`); return 1; }
  const registry = hasCommand ? null : await registeredCommands(tracks);
  const has = hasCommand || ((name) => registry.has(name));
  const pipeline = injected === undefined ? await loadPipeline() : injected || null;

  // (a) plan
  let apps = await appInfo(core, tracks, pipeline);
  let plan = weekPlan(doc.opportunities, { now, capacity, apps });
  log(`go — ${plan.ranked.length} active, ${plan.waiting.length} waiting, ${plan.dropped.length} dropped · capacity ${capacity} h${dry ? ' · DRY RUN' : ''}${noAi ? ' · no AI' : ''}`);

  const ran = [];
  const notes = [];

  // (b) scaffold missing applications for eligible DO / COND-met entries
  const missing = plan.ranked.filter((r) => !r.app_exists && r.tier <= 1);
  if (missing.length && !flags.scaffold) notes.push(`${missing.length} active opportunit${missing.length === 1 ? 'y has' : 'ies have'} no application yet (${missing.map((m) => m.slug).join(', ')}) — run \`${FUND} go --scaffold\``);
  if (flags.scaffold) {
    const programsDir = process.env.FUND_A_PROGRAMS || join(core.PATHS.tracks, 'a-build', 'programs');
    for (const o of missing) {
      const argv = scaffoldArgv(o, core, programsDir);
      if (dry) { log(`  would scaffold: ${FUND} ${quote(argv)}`); ran.push({ command: `${FUND} ${quote(argv)}`, code: 0, note: 'dry: not run' }); continue; }
      const { value: code, out } = await safeInvoke(invoke, argv);
      const note = code === 0 ? lastLines(out, 1) : resultNote(out, 1);
      log(`  ${code === 0 ? '✓' : '✗'} scaffold ${o.slug}: ${note}`);
      ran.push({ command: `${FUND} ${quote(argv)}`, code, note });
    }
    if (missing.length && !dry) {
      apps = await appInfo(core, tracks, pipeline);
      plan = weekPlan(doc.opportunities, { now, capacity, apps });
    }
  }

  // (c) run the automatable steps, in rank order, for applications that got hours this week
  const engine = has('run');
  if (!engine) notes.push(`\`run\` (the pipeline engine) is not installed — ran \`check\` instead`);
  const jobs = plan.ranked.filter((x) => x.app_exists && x.alloc_h > 0).map((r) => ({ slug: r.slug, argv: engine ? ['run', r.slug, ...(noAi ? ['--no-ai'] : []), ...(dry ? ['--dry'] : [])] : ['check', r.slug] }));
  if (parallel > 1 && engine && !dry && jobs.length > 1) {
    const results = await runParallel(jobs, parallel, log);
    if (results.interrupted) {
      log(`next: fund ps   (killed sessions show as "killed"), then ${FUND} go${flags.parallel ? ` --parallel ${parallel}` : ''} to continue`);
      return 130;
    }
    for (const { argv, code, out } of results) ran.push({ command: `${FUND} ${quote(argv)}`, code, note: resultNote(out, 2, code) });
  } else for (const { argv } of jobs) {
    const { value: code, out } = await safeInvoke(invoke, argv);
    const note = resultNote(out, 2, code);
    log(`  ${code === 0 ? '✓' : '!'} ${quote(argv).padEnd(40)} ${note.slice(0, 110)}`);
    ran.push({ command: `${FUND} ${quote(argv)}`, code, note });
  }

  // Monitors (Track E apps, parked by nature) cost no AI and no hours: keep their scans fresh too.
  if (engine) {
    const done = new Set(plan.ranked.filter((x) => x.app_exists && x.alloc_h > 0).map((x) => x.slug));
    for (const [slug, info] of Object.entries(apps)) {
      if (!info.monitor || done.has(slug) || info.status !== 'parked') continue;
      const argv = ['run', slug, ...(dry ? ['--dry'] : [])];
      const { value: code, out } = await safeInvoke(invoke, argv);
      const note = resultNote(out, 2, code);
      log(`  ${code === 0 ? '✓' : '!'} ${quote(argv).padEnd(40)} ${note.slice(0, 110)}`);
      ran.push({ command: `${FUND} ${quote(argv)}`, code, note });
    }
  }

  // Refresh status / next after autopilot ran, so WEEK.md shows where each app is now (the hour
  // allocation stays as planned at the start of the run).
  if (!dry && ran.some((x) => !/dry: not run/.test(x.note || ''))) {
    apps = await appInfo(core, tracks, pipeline);
    for (const r of plan.ranked) {
      const a = apps[r.slug];
      if (!a) continue;
      r.app_exists = true; r.app_status = a.status || ''; r.next = a.next || '';
    }
  }

  // Applications that exist but are not in the portfolio are never planned — say so.
  const known = new Set(doc.opportunities.map((o) => o.slug));
  const orphans = Object.keys(apps).filter((s) => !known.has(s));
  if (orphans.length) notes.push(`${orphans.length} application(s) not in the portfolio, so never planned (${orphans.join(', ')}) — add them to ${portfolioPath().endsWith(join('portfolio', 'opportunities.json')) ? 'portfolio/opportunities.json' : portfolioPath()}`);

  // (d) human queue
  let queue = [];
  if (has('queue')) {
    const { out } = await safeInvoke(invoke, ['queue', '--json']);
    try { queue = normaliseQueue(JSON.parse(out.slice(out.search(/[[{]/)))); } catch { notes.push('`queue --json` did not return JSON — derived the queue from the applications instead'); }
  }
  if (!queue.length) queue = fallbackQueue(apps, plan);
  const rankIdx = new Map(plan.ranked.map((r, i) => [r.slug, i]));
  queue = queue.filter((q) => !CLOSED_STATUSES.has(apps[q.slug]?.status) && apps[q.slug]?.status !== 'parked');
  const inactive = queue.filter((q) => !rankIdx.has(q.slug));
  if (inactive.length) notes.push(`${inactive.length} human step(s) in applications not active this week (${[...new Set(inactive.map((q) => q.slug))].join(', ')}) — see \`${FUND} queue\``);
  queue = queue.filter((q) => rankIdx.has(q.slug));
  queue.sort((a, b) => (a.due === 'rolling') - (b.due === 'rolling') || String(a.due).localeCompare(String(b.due)) || (rankIdx.get(a.slug) ?? 99) - (rankIdx.get(b.slug) ?? 99));
  const byDue = (a, b) => (a.due === 'rolling') - (b.due === 'rolling') || String(a.due).localeCompare(String(b.due));
  queue.push(...portfolioActions(plan).sort(byDue));

  // (e) WEEK.md
  const file = join(core.PATHS.apps, 'WEEK.md');
  writeFileSync(file, weekMarkdown(plan, { ran, queue, dry, notes }));

  log('');
  log('RANK  PROGRAM                               EV/h     DEADLINE           HOURS');
  plan.ranked.slice(0, 8).forEach((r, i) => log(`${String(i + 1).padStart(3)}.  ${r.program.slice(0, 36).padEnd(37)} ${(r.ev ? money(r.ev_per_hour) : '?').padEnd(8)} ${dueLabel(r).padEnd(18)} ${r.alloc_h}${r.partial ? ' (partial)' : ''}`));
  log(`\nhours: ${plan.used} / ${capacity} allocated`);
  for (const n of notes) log(`note: ${n.replace(/`/g, '')}`);
  log('\nTOP HUMAN ACTIONS');
  if (!queue.length) log('  none');
  queue.slice(0, 5).forEach((q, i) => log(`  ${i + 1}. [${q.due}] ${q.slug}: ${String(q.instructions || q.title).slice(0, 100)}\n     then: ${q.command}`));
  log(`\nwrote ${file}`);
  log(`next: ${/^(node bin\/fund\.mjs|fund) /.test(queue[0]?.command || '') ? queue[0].command : `open ${file}, do the first human action, then ${FUND} go`}`);
  return 0;
}

export default {
  name: 'go',
  help: '[--hours N=20] [--dry] [--no-ai] [--scaffold] [--parallel N=1] — portfolio autopilot: rank, run automatable steps (N apps at once), write WEEK.md',
  booleanFlags: ['dry', 'no-ai', 'scaffold'],
  run: ({ flags, core, tracks, invoke, hasCommand }) => go({ flags, core, tracks, invoke, hasCommand }),
};
