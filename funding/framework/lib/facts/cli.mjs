// `fund facts <sub>`: the facts registry commands (plan F7.1, G11). `fund facts` with no
// subcommand still validates FACTS.md (bin/fund.mjs).
//
//   fund facts build [--check] [--quiet] [--discard-md]
//                                          regenerate every copy from facts.json; --check writes nothing
//                                          and exits 1 on schema problems, an unmarked donor-dependent goal or drift.
//                                          Refuses to overwrite FACTS.md rows edited since the last
//                                          build (run `fund facts absorb` first, or pass --discard-md)
//   fund facts absorb [--dry]              move `fund refresh --write` edits in FACTS.md into facts.json
//   fund facts report [--offline] [--out FILE] [--json]
//                                          date-dependent checks (staleness, goals, probes, impact
//                                          snapshot); exits 1 when a person is needed. Weekly job only.
//   fund facts gate                        release gate: build --check plus staleness of surfaced
//                                          facts, no network (for cdn-sync and app builds)
//
// FUND_REPO_ROOT overrides the repo root (tests); FUND_NOW the clock; FACTS_IMPACT_URL the snapshot.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY, REPO_ROOT, TARGETS, buildOutputs, factsMdState, loadRegistry, writeOutputs } from './build.mjs';
import { absorbFactsMd } from './absorb.mjs';
import { buildReport, staleness } from './report.mjs';

export const FACTS_HELP = `  facts build [--check] [--discard-md]   regenerate FACTS.md and the app copies from facts/facts.json
  facts absorb [--dry]                   move \`fund refresh --write\` edits in FACTS.md into facts.json
  facts report [--offline] [--out FILE]  weekly staleness, goal and chain reconciliation report
  facts gate                             release gate: build --check + surfaced facts not stale`;

// Not 'offline': e-monitor's --offline takes a directory.
export const FACTS_BOOLEAN_FLAGS = ['check', 'dry', 'quiet', 'json', 'discard-md'];

function repoRoot(flags) {
  return (typeof flags.root === 'string' && flags.root) || process.env.FUND_REPO_ROOT || REPO_ROOT;
}

function clock() {
  const d = process.env.FUND_NOW ? new Date(process.env.FUND_NOW) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`FUND_NOW="${process.env.FUND_NOW}" is not a date`);
  return d.getTime();
}

/** 'edited' when FACTS.md has rows changed since the last build that the new build would overwrite. */
function factsMdEdited(root, outputs) {
  const md = outputs.find((o) => o.path === TARGETS.factsMd);
  const abs = join(root, TARGETS.factsMd);
  if (!md || !existsSync(abs)) return false;
  return factsMdState(readFileSync(abs, 'utf8'), md.content) === 'edited';
}

function build(root, { check, quiet, discardMd = false, log = console.log, err = console.error }) {
  let result;
  try { result = buildOutputs({ root }); }
  catch (e) { err(`✗ ${e.message}`); return 1; }
  const { outputs, problems, warnings, goals } = result;
  for (const w of warnings) log(`  ! ${w}`);
  if (problems.length) {
    err(`✗ ${REGISTRY}: ${problems.length} problem(s)`);
    for (const p of problems) err(`  ✗ ${p}`);
    return 1;
  }
  for (const g of goals) if (!quiet) log(`  ✓ ${g.id} goal ${g.goal} ${g.unit} over ${g.days} days, counting ${g.sources.join(', ')}: Token Tails' own streams add at most ${g.tokenTailsMax} (code defaults, not the production env); ${g.donorDependent ? `donors ${g.fromDonors} (about ${g.donorPerDay}/day), marked donor-dependent` : 'no donor money needed'}`);
  const mdEdited = factsMdEdited(root, outputs);
  if (!check && mdEdited && !discardMd) {
    err(`✗ ${TARGETS.factsMd} has rows edited since the last build (by hand or by \`fund refresh --write\`); building now would overwrite them.`);
    err('  run `node funding/framework/bin/fund.mjs facts absorb` first to move them into facts.json,');
    err('  or pass --discard-md to throw the edits away.');
    return 1;
  }
  const { changed } = writeOutputs(outputs, { root, check });
  if (check) {
    if (changed.length) {
      err(`✗ generated facts are out of date (${changed.length}):`);
      for (const c of changed) err(`  - ${c}`);
      err(mdEdited
        ? '  FACTS.md was edited by hand or by `fund refresh --write`: run `fund facts absorb`, then `fund facts build`.'
        : '  run `node funding/framework/bin/fund.mjs facts build` and commit the result.');
      return 1;
    }
    if (!quiet) log(`✓ facts: ${outputs.length} generated file(s) up to date`);
    return 0;
  }
  if (!quiet) log(changed.length ? `✓ wrote ${changed.length} file(s):\n${changed.map((c) => `  - ${c}`).join('\n')}` : `✓ facts: ${outputs.length} generated file(s) already up to date`);
  return 0;
}

export async function runFacts(sub, { flags = {}, log = console.log, err = console.error, fetchImpl } = {}) {
  const root = repoRoot(flags);
  switch (sub) {
    case 'build':
      return build(root, { check: !!flags.check, quiet: !!flags.quiet, discardMd: !!flags['discard-md'], log, err });

    case 'absorb': {
      const { patched, manual, wrote } = absorbFactsMd({ root, write: !flags.dry });
      for (const p of patched) log(`  ${flags.dry ? '~' : '✓'} ${p.id}: ${p.changes.map(([k, a, b]) => `${k} ${JSON.stringify(a)} -> ${JSON.stringify(b)}`).join(', ')}`);
      for (const m of manual) log(`  ! ${m}`);
      log(patched.length ? `${wrote ? 'absorbed' : 'would absorb'} ${patched.length} row(s)${wrote ? `; next: fund facts build` : ''}` : 'FACTS.md has no value, date or status edits to absorb');
      return manual.length ? 1 : 0;
    }

    case 'report': {
      const report = await buildReport({ root, now: clock(), offline: !!flags.offline, fetchImpl, impactUrl: process.env.FACTS_IMPACT_URL || '' });
      if (typeof flags.out === 'string') writeFileSync(flags.out, report.markdown);
      if (flags.json) log(JSON.stringify({ problems: report.problems, notes: report.notes }, null, 2));
      else log(report.markdown);
      return report.problems.length ? 1 : 0;
    }

    case 'gate': {
      const code = build(root, { check: true, quiet: true, log, err });
      if (code) return code;
      const stale = staleness(loadRegistry(root), clock()).filter((s) => s.surfaced);
      if (stale.length) {
        err(`✗ ${stale.length} surfaced fact(s) are stale; re-check them before a release:`);
        for (const s of stale) err(`  - ${s.id}: ${s.detail}`);
        return 1;
      }
      log('✓ facts gate: generated copies in sync, no surfaced fact is stale');
      return 0;
    }

    default:
      err(`usage:\n${FACTS_HELP}`);
      return 2;
  }
}
