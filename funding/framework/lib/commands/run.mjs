// fund run <slug> [--until id] [--max N] [--no-ai] [--dry]   and   fund done <slug> <step> [--note ""]
// Executes auto/ai steps in order until a human step, a failure, --until or --max.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePipeline, makeCtx, evaluate, runPipeline, markHumanDone, firstActionable, instructionsOf, nextCommand } from '../pipeline.mjs';

function nextLine(slug, rows, ctx) {
  const r = firstActionable(rows);
  if (!r) return 'fund queue   # this application is complete';
  return nextCommand(slug, r, ctx);
}

function printStop(slug, res, steps, ctx) {
  const step = steps.find((s) => s.id === res.stoppedAt);
  for (const f of res.failures || []) console.log(`\n✗ ${f.id} failed in this run and is still not done — ${f.message}`);
  const row = res.rows?.find((r) => r.step.id === res.stoppedAt);
  switch (res.reason) {
    case 'human':
      if (step.wait) {
        console.log(`\n⧗ waiting: ${step.id} — ${res.message || step.title}`);
        if (step.instructions) console.log(`  note: ${instructionsOf(step, ctx, slug)}`);
        console.log(`next: ${nextCommand(slug, row || { step }, ctx)}`);
        break;
      }
      console.log(`\n☐ waiting for a person: ${step.id} — ${step.title}`);
      if (res.message) console.log(`  why: ${res.message}`);
      if (step.instructions) console.log(`  do: ${instructionsOf(step, ctx, slug)}`);
      console.log(`next: ${nextCommand(slug, row || { step }, ctx)}`);
      break;
    case 'failed':
      console.log(`\n✗ stopped: ${res.stoppedAt} failed — ${res.message}`);
      if (step?.instructions) console.log(`  hint: ${instructionsOf(step, ctx, slug)}`);
      console.log(`next: fix it, then fund run ${slug}   (or fund next ${slug})`);
      break;
    case 'no-ai':
      console.log(`\n· stopped before ${res.stoppedAt} (ai step, --no-ai)`);
      console.log(`next: fund run ${slug}`);
      break;
    case 'max':
      console.log(`\n· stopped at --max; ${res.stoppedAt} is next`);
      console.log(`next: fund run ${slug}`);
      break;
    case 'until':
      console.log(`\n✓ ${res.message}`);
      console.log(`next: ${nextLine(slug, res.rows, ctx)}`);
      break;
    case 'complete':
      console.log('\n✓ every step is done');
      console.log('next: fund queue');
      break;
    case 'closed':
      console.log(res.message);
      console.log(`next: fund plan ${slug}`);
      break;
    case 'blocked': {
      console.log(`\n· blocked: ${res.message}`);
      // A step that blocks itself (Track D's KILL) names the way out in its reason: print that command.
      const way = /(fund [a-z][\w:-]* [^—]*?)\s*$/.exec(res.message || '');
      console.log(`next: ${way ? way[1] : `fund plan ${slug}`}`);
      break;
    }
    default:
      console.log(`\n· stopped: ${res.message || res.reason}`);
      console.log(`next: fund plan ${slug}`);
  }
}

const run = {
  name: 'run',
  help: '<slug> [--until id] [--max N] [--no-ai] [--dry]   run every automatable step until a human one',
  booleanFlags: ['no-ai', 'dry'],
  async run({ args, flags, core, runAI, tracks, invoke }) {
    const slug = args[0];
    if (!slug) { console.error('usage: run <slug> [--until id] [--max N] [--no-ai] [--dry]'); return 2; }
    if (!existsSync(join(core.appDir(slug), 'call.md'))) { console.error(`no application "${slug}" — see fund list`); return 2; }
    const steps = await resolvePipeline({ slug, core, tracks });
    if (flags.until && !steps.some((s) => s.id === flags.until)) { console.error(`no step "${flags.until}" — steps: ${steps.map((s) => s.id).join(', ')}`); return 2; }
    if (flags.max != null && !/^\d+$/.test(String(flags.max))) { console.error('--max needs a whole number, e.g. --max 2'); return 2; }
    const ctx = makeCtx({ slug, core, runAI, invoke, tracks, flags });
    return execute(slug, steps, ctx, flags);
  },
};

/** Run the pipeline and print the result (shared by `fund run` and the auto-continue of `fund done`). */
async function execute(slug, steps, ctx, flags = {}) {
    const res = await runPipeline(steps, ctx, { until: flags.until, max: flags.max, noAi: !!flags['no-ai'], dry: !!flags.dry });

    if (res.dry) {
      console.log(`${slug} — dry run, nothing executed`);
      if (!res.ran.length) console.log('  nothing automatable to run now');
      res.ran.forEach((r, i) => { const s = steps.find((x) => x.id === r.id); console.log(`  ${i + 1}. ${r.id.padEnd(18)} ${s.kind.padEnd(5)} ${s.title}`); });
      if (res.stoppedAt) console.log(`  then stops at ${res.stoppedAt} (${res.reason})`);
      console.log(`next: fund run ${slug}${flags.until ? ` --until ${flags.until}` : ''}`);
      return 0;
    }

    console.log(`${slug}`);
    let total = 0;
    for (const r of res.ran) {
      total += r.seconds;
      console.log(`  ${r.ok ? '✓' : '✗'} ${r.id.padEnd(18)} ${`${r.seconds.toFixed(2)}s`.padStart(8)}  ${r.message}`);
    }
    if (!res.ran.length) console.log('  nothing ran');
    else console.log(`  ${res.ran.length} step(s) in ${total.toFixed(2)}s`);
    printStop(slug, res, steps, ctx);
    return res.reason === 'failed' || res.failures?.length ? 1 : 0;
}

const done = {
  name: 'done',
  help: '<slug> <step> [--note ""] [--no-run]  mark a human step done, then run what is automatable next',
  booleanFlags: ['no-run'],
  async run({ args, flags, core, runAI, tracks, invoke }) {
    const [slug, id] = args;
    if (!slug || !id) { console.error('usage: done <slug> <step> [--note "..."]'); return 2; }
    if (!existsSync(join(core.appDir(slug), 'call.md'))) { console.error(`no application "${slug}" — see fund list`); return 2; }
    const steps = await resolvePipeline({ slug, core, tracks });
    const step = steps.find((s) => s.id === id);
    if (!step) { console.error(`no step "${id}" — steps: ${steps.map((s) => s.id).join(', ')}`); return 2; }
    if (step.kind === 'auto') { console.error(`${id} is an auto step: it is done when its evidence exists. Run: fund run ${slug}`); return 2; }
    const ctx = makeCtx({ slug, core, runAI, invoke, tracks, flags });
    // A person can only finish a step whose inputs exist: marking submit before ready (or fit before
    // extract) would let the engine later record a submission nobody verified.
    let before = (await evaluate(steps, ctx)).find((r) => r.step.id === id);
    // Blocked only by automatable steps (a call.md edit made submission.md stale, say)? Re-run those
    // first instead of refusing: the person already did their part.
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    if (before.blocked && before.blockedBy.length && before.blockedBy.every((b) => byId[b]?.kind !== 'human') && !flags['no-run'] && !core.CLOSED.has(ctx.app?.call?.fm?.status)) {
      console.log(`→ ${id} waits for ${before.blockedBy.join(', ')} (automatable) — running them first`);
      const res = await runPipeline(steps, makeCtx({ slug, core, runAI, invoke, tracks, flags }), {});
      for (const r of res.ran) console.log(`  ${r.ok ? '✓' : '✗'} ${r.id.padEnd(18)} ${`${r.seconds.toFixed(2)}s`.padStart(8)}  ${r.message}`);
      ctx.refresh();
      before = (await evaluate(steps, ctx)).find((r) => r.step.id === id);
    }
    if (before.blocked) {
      console.error(`✗ ${id} cannot be marked done yet: ${before.blockedBy.length ? `it waits for ${before.blockedBy.join(', ')}` : before.reason}`);
      const nx = firstActionable(await evaluate(steps, ctx));
      console.error(`next: ${nx ? nextCommand(slug, nx, ctx) : `fund plan ${slug}`}`);
      return 1;
    }
    if (step.noOverride || before.extra?.noOverride) {
      const d = await step.done(ctx);
      if (!d.done) {
        console.error(`✗ ${id} is detected from files and is not done: ${d.reason}`);
        console.error(`  do: ${instructionsOf(step, ctx, slug) || step.title}`);
        console.error(`next: ${nextCommand(slug, before, ctx)}`);
        return 1;
      }
    }
    markHumanDone(ctx.dir, id, typeof flags.note === 'string' ? flags.note : '');
    const rows = await evaluate(steps, ctx);
    const row = rows.find((r) => r.step.id === id);
    if (!row.done) { console.log(`! ${id} recorded, but it still is not done: ${row.reason}`); }
    else console.log(`✓ ${slug}: ${id} done`);
    const nx = firstActionable(rows);
    // Auto-continue: when the next step is automatable, run the pipeline now (one command per human step).
    if (nx && nx.step.kind !== 'human' && !flags['no-run'] && !core.CLOSED.has(ctx.app?.call?.fm?.status)) {
      console.log(`→ continuing: fund run ${slug}   (--no-run to stop here)\n`);
      return execute(slug, steps, makeCtx({ slug, core, runAI, invoke, tracks, flags }), {});
    }
    console.log(`next: ${nx ? `${nextCommand(slug, nx, ctx)}${nx.step.kind === 'human' ? `   # ${nx.step.title}` : ''}` : 'fund queue'}`);
    return 0;
  },
};

export default [run, done];
