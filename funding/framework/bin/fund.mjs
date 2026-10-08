#!/usr/bin/env node
// fund — build, check and iterate funding applications.
// Usage: node bin/fund.mjs <command> [args]. Run with no args for help.

import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE } from '../lib/core.mjs';
import { runAI as sessionsRunAI } from '../lib/commands/sessions.mjs';
import { readdirSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { FACTS_BOOLEAN_FLAGS, FACTS_HELP, runFacts } from '../lib/facts/cli.mjs';

// Core command modules: lib/commands/<name>.mjs default-export { name, help, booleanFlags?, run }.
// See lib/commands/README.md. Loaded once per process.
async function loadCommands() {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'commands');
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)).default;
    for (const def of [].concat(mod || [])) {
      if (!def?.name || typeof def.run !== 'function') throw new Error(`lib/commands/${f} must default-export { name, run } (or an array of them)`);
      out[def.name] = def;
    }
  }
  return out;
}

const {
  scaffold, runChecks, listApps, renderPrompt, listPrompts, buildTracker, loadFacts, loadTracks,
  updateFrontmatter, appDir, STATUSES, unwrapFence, scaffoldHint,
} = CORE;

// Flags that never take a value, so "--sync my-app" keeps my-app as a positional.
const BOOLEAN_FLAGS = new Set(['all', 'json', 'run', 'force', 'sync', 'print', 'simulate', 'keep-cites', 'cites', 'dry', 'dry-run', 'quiet', 'help', ...FACTS_BOOLEAN_FLAGS]);

export function parseArgs(argv, booleans = BOOLEAN_FLAGS) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq === -1 ? a.slice(2) : a.slice(2, eq);
      const v = eq === -1 ? undefined : a.slice(eq + 1);
      if (v !== undefined) flags[k] = v;
      else if (!booleans.has(k) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const ICON = { ok: '✓', warn: '!', error: '✗' };

function printResults(slug, results) {
  console.log(`\n${slug}`);
  for (const r of results) {
    const detail = r.detail ? `  ${r.detail}` : '';
    console.log(`  ${ICON[r.level] || '?'} ${r.name.padEnd(22)}${detail}`);
  }
}

/**
 * runAI(prompt, meta?) → the AI's answer text. meta: { label: "<slug>/<step>", model }.
 * FUND_AI_CMD unset: one tracked Claude Code session via orc (fund ps / logs / watch / stats).
 * FUND_AI_CMD set: pipe the prompt to that shell command, exactly as before.
 */
export function runAI(prompt, meta = {}) { return sessionsRunAI(prompt, meta); }

const HELP = `fund — funding application framework

  new <slug> --track <A-E> [--program "Name"] [--frame <frame>] [--deadline ISO|rolling] [--url URL]
  check <slug> | --all [--json]          validate facts, citations, limits, banned terms, criteria, track rules
  prompt <name> <slug> [--section S]     render a prompt with facts + call + draft filled in
         [--run] [--out FILE]            --run: one Claude Code session via orc ($FUND_AI_CMD if set)
  status <slug> <status> [--next "..."]  set status (${STATUSES.join(' | ')})
  tracker                                regenerate TRACKER.md
  list                                   list applications
  facts                                  validate facts/FACTS.md
${FACTS_HELP}
  tracks                                 list tracks and their commands
  <track-command> ...                    e.g. "a:build", see "fund tracks"
`;

const ROUTER_HELP = `  router plan --chain <id> [--split 0x..] [--token EURC] [--json]
                                         print the DonateRouter deploy commands (a founder broadcasts)
  router record --chain <id> [--token EURC] [--split 0x..] [--eip3009]
                                         record the DonateRouter from the chain's Foundry broadcast in router-deployments.json
  shelter rotate --chain <id> --to <0x..> --name "..." --dry-run [--from 0x..] [--split 0x..]
                                         print the handover calls that re-point a shelter to its own wallet`;

/** `router plan` and `shelter rotate`: print-only plans from tracks/a-build/router/lib.mjs. */
async function runRouterCommand(cmd, rest, flags) {
  const lib = await import('../tracks/a-build/router/lib.mjs');
  const print = (r) => {
    for (const p of r.problems) console.error(`✗ ${p}`);
    if (r.ok) console.log(r.lines.join('\n'));
    return r.ok ? 0 : 1;
  };
  const chainId = Number(flags.chain);
  const token = typeof flags.token === 'string' ? flags.token : undefined;
  if (cmd === 'router' && rest[0] === 'plan') {
    const r = lib.routerDryRun({ chainId, split: typeof flags.split === 'string' ? flags.split : undefined, token });
    if (flags.json === true) {
      for (const p of r.problems) console.error(`✗ ${p}`);
      if (r.ok) console.log(JSON.stringify(r.plan));
      return r.ok ? 0 : 1;
    }
    return print(r);
  }
  if (cmd === 'router' && rest[0] === 'record') {
    // Reads the local Foundry broadcast and appends one public entry; never sends, never reads a key.
    const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
    const plan = lib.routerDryRun({ chainId, split: typeof flags.split === 'string' ? flags.split : undefined, token });
    if (!plan.ok) { for (const p of plan.problems) console.error(`✗ ${p}`); return 1; }
    const project = process.env.FUND_A_PROJECT || join(lib.TRACK_DIR, 'shelter-split');
    const f = join(project, 'broadcast', 'DeployDonateRouter.s.sol', String(chainId), 'run-latest.json');
    if (!existsSync(f)) { console.error(`✗ no broadcast at ${f}`); return 1; }
    const p = plan.plan;
    const r = lib.routerEntryFromBroadcast(JSON.parse(readFileSync(f, 'utf8')), { chainId, network: p.network, chain: p.chain, split: p.split, token: p.token, symbol: p.symbol, eip3009: flags.eip3009 === true });
    if (r.problem) { console.error(`✗ ${r.problem}`); return 1; }
    const file = lib.routerPaths.routers();
    const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    const writeClient = () => {
      // The client's give-from-wallet list is the public projection of router-deployments.json.
      const out = lib.routerPaths.clientRouters();
      if (!out || !existsSync(dirname(out))) return;
      writeFileSync(out, JSON.stringify(lib.publicRouters(list), null, 2) + '\n');
    };
    // Dedup on (chain, network, router): one deployer nonce sequence gives the same address on many chains.
    if (lib.routerAlreadyRecorded(list, r.entry)) { writeClient(); console.log(`already recorded: ${r.entry.router} on chain ${chainId}`); return 0; }
    const problems = lib.validateRouterDeployments([...list, r.entry]);
    if (problems.length) { for (const x of problems) console.error(`✗ ${x}`); return 1; }
    list.push(r.entry);
    writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
    writeClient();
    console.log(`recorded DonateRouter ${r.entry.router} (${p.chain} ${p.network} ${p.symbol}) in front of ${p.split}`);
    return 0;
  }
  if (cmd === 'shelter' && rest[0] === 'rotate') {
    if (flags['dry-run'] !== true) {
      console.error('shelter rotate only prints a plan: pass --dry-run (nothing is ever sent from here)');
      return 2;
    }
    const { readFileSync } = await import('node:fs');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    let oldWallet = typeof flags.from === 'string' ? flags.from : undefined;
    if (!oldWallet) {
      try {
        const reg = JSON.parse(readFileSync(join(root, 'facts', 'facts.json'), 'utf8'));
        oldWallet = reg.facts.find((f) => f.campaign)?.campaign?.shelter?.wallet || undefined;
      } catch { /* fall through to the validation message */ }
    }
    let split = typeof flags.split === 'string' ? flags.split : undefined;
    if (!split) {
      const deployments = JSON.parse(readFileSync(join(root, 'tracks', 'a-build', 'deployments.json'), 'utf8'));
      const chains = JSON.parse(readFileSync(join(root, 'tracks', 'a-build', 'chains.json'), 'utf8'));
      const c = lib.usdcSplits(chainId, deployments, lib.findNetwork(chainId, chains)?.usdc);
      split = c.length ? c[c.length - 1].address : undefined;
    }
    return print(lib.rotateDryRun({
      chainId, split, oldWallet, newWallet: typeof flags.to === 'string' ? flags.to : undefined,
      // No default: the name must match the one registered on chain (the plan prints how to read it).
      name: typeof flags.name === 'string' ? flags.name : undefined,
    }));
  }
  console.error(`usage:\n${ROUTER_HELP}`);
  return 2;
}

export async function main(argv = process.argv.slice(2)) {
  const tracks = await loadTracks();
  const commands = await loadCommands();
  const booleans = new Set([...BOOLEAN_FLAGS, ...Object.values(tracks).flatMap((t) => t.booleanFlags || []), ...Object.values(commands).flatMap((c) => c.booleanFlags || [])]);
  const { pos, flags } = parseArgs(argv, booleans);
  const [cmd, ...rest] = pos;

  switch (cmd) {
    case undefined:
    case 'help':
      console.log(HELP);
      console.log(ROUTER_HELP + '\n');
      if (Object.keys(commands).length) console.log('  ' + Object.values(commands).map((c) => `${c.name.padEnd(38)} ${c.help || ''}`).join('\n  ') + '\n');
      return 0;

    case 'new': {
      const slug = rest[0];
      if (!slug || !flags.track) { console.error('usage: new <slug> --track <A-E>'); return 2; }
      const dir = await scaffold(slug, { track: flags.track, program: flags.program, frame: flags.frame, deadline: flags.deadline, url: flags.url, force: !!flags.force });
      console.log(`created ${dir}`);
      console.log(scaffoldHint() || `next: fund run ${slug}   (runs every automatable step and names the first human one; fund plan ${slug} lists them all)`);
      return 0;
    }

    case 'check': {
      const slugs = flags.all ? listApps() : rest;
      if (!slugs.length) { console.error('usage: check <slug> | --all'); return 2; }
      let failed = 0;
      const all = [];
      for (const slug of slugs) {
        const { results, ok } = await runChecks(slug, { tracks });
        all.push({ slug, ok, results });
        if (!flags.json) printResults(slug, results);
        if (!ok) failed++;
      }
      if (flags.json) console.log(JSON.stringify(all, null, 2));
      else console.log(`\n${slugs.length - failed}/${slugs.length} passing`);
      return failed ? 1 : 0;
    }

    case 'prompt': {
      const [name, slug] = rest;
      if (!name) { console.error(`usage: prompt <${listPrompts().join('|')}> <slug>`); return 2; }
      const text = renderPrompt(name, slug, { section: flags.section });
      if (!flags.run) {
        if (flags.out) writeFileSync(flags.out, text); else process.stdout.write(text);
        return 0;
      }
      // Same label and model as the engine step of that name, so fund stats counts it there.
      const model = (await import('../lib/pipeline.mjs')).defaultSteps.find((s) => s.id === name)?.model;
      const out = runAI(text, { label: slug ? `${slug}/${name}` : `fund/prompt-${name}`, ...(model ? { model } : {}) });
      if (flags.out) writeFileSync(flags.out, unwrapFence(out));
      else if (name === 'review' && slug) {
        const demoted = unwrapFence(out).replace(/^(#{1,2})(\s)/gm, '###$2');
        appendFileSync(join(appDir(slug), 'review.md'), `\n\n## Review — ${new Date().toISOString()}\n\n${demoted}\n`);
        console.log(`appended review to applications/${slug}/review.md`);
      } else process.stdout.write(out);
      return 0;
    }

    case 'status': {
      const [slug, status] = rest;
      if (!slug || !STATUSES.includes(status)) { console.error(`usage: status <slug> <${STATUSES.join('|')}>`); return 2; }
      const patch = { status };
      if (flags.next) patch.next = flags.next;
      else if (['submitted', 'won', 'lost'].includes(status)) patch.next = '';
      if (status === 'submitted') patch.submitted = new Date().toISOString().slice(0, 10);
      updateFrontmatter(join(appDir(slug), 'call.md'), patch);
      buildTracker();
      console.log(`${slug} → ${status}`);
      return 0;
    }

    case 'tracker': {
      const rows = buildTracker();
      console.log(`TRACKER.md: ${rows.length} application(s)`);
      return 0;
    }

    case 'list':
      for (const s of listApps()) console.log(s);
      return 0;

    case 'facts': {
      if (rest[0]) return runFacts(rest[0], { flags });
      const { facts, problems } = loadFacts();
      const by = {};
      for (const f of facts.values()) by[f.status] = (by[f.status] || 0) + 1;
      console.log(`${facts.size} facts: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ')}`);
      for (const p of problems) console.log(`  ✗ ${p}`);
      return problems.length ? 1 : 0;
    }

    // DonateRouter tooling (tracks/a-build/router/lib.mjs): prints commands, never sends or reads keys.
    case 'router':
    case 'shelter':
      return runRouterCommand(cmd, rest, flags);

    case 'tracks':
      for (const t of Object.values(tracks)) {
        console.log(`${t.id}  ${t.name}${t.defaultFrame ? `  (frame: ${t.defaultFrame})` : ''}`);
        for (const [c, def] of Object.entries(t.commands || {})) console.log(`     ${c.padEnd(18)} ${def.help || ''}`);
      }
      return 0;

    default: {
      if (commands[cmd]) return (await commands[cmd].run({ args: rest, flags, core: CORE, runAI, tracks, invoke: (argv) => main(argv) })) ?? 0;
      for (const t of Object.values(tracks)) {
        const def = t.commands?.[cmd];
        if (def) return (await def.run({ args: rest, flags, core: CORE, runAI, tracks, invoke: (argv) => main(argv) })) ?? 0;
      }
      console.error(`unknown command "${cmd}"\n\n${HELP}`);
      return 2;
    }
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fund.mjs');
if (isMain) {
  main().then((code) => process.exit(code), (e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
