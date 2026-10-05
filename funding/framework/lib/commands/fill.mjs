// fund fill [<slug>...] [--write] [--ingest] [--network mainnet|testnet] [--json]
// After the deploy wave: write every single-brace placeholder ({SPLIT_ADDRESS}, {ARC_TX}, {DEMO_URL}, ...)
// that is now known into each application's draft.md, set `demo:` in call.md, re-render submission.md,
// and list what a person still owes. Dry run by default: prints the plan, writes nothing.
//   Sources: tracks/a-build/fill-map.json (which placeholder comes from where, per application),
//            tracks/a-build/deployments.json (a:ingest / a:record), fill-values.json (pasted by a person),
//            client/public/shelter-payouts/campaign.json (the shelter wallet).
// Track B entries (answers.md + generated draft.md) are filled in answers.md and re-rendered with b:fill,
// since b:fill regenerates draft.md and the paste sheet fill.md from answers.md.
// Text inside <!-- comments --> is never changed. Closed applications (submitted, won, lost, parked) are skipped.
// Env overrides for tests: FUND_FILL_MAP, FUND_FILL_VALUES, FUND_CAMPAIGN (plus FUND_A_DEPLOYMENTS, FUND_APPS_DIR).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FW = join(HERE, '..', '..');
export const fillPaths = {
  map: () => process.env.FUND_FILL_MAP || join(FW, 'tracks', 'a-build', 'fill-map.json'),
  values: () => process.env.FUND_FILL_VALUES || join(FW, 'fill-values.json'),
  campaign: () => process.env.FUND_CAMPAIGN || join(FW, '..', '..', 'client', 'public', 'shelter-payouts', 'campaign.json'),
  deployments: () => process.env.FUND_A_DEPLOYMENTS || join(FW, 'tracks', 'a-build', 'deployments.json'),
  routers: () => process.env.FUND_A_ROUTER_DEPLOYMENTS || join(FW, 'tracks', 'a-build', 'router-deployments.json'),
};

const PH = /\{([A-Z][A-Z0-9_]*)\}/g;
const CLOSED = new Set(['submitted', 'won', 'lost', 'parked']);
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const TXH = /^0x[0-9a-fA-F]{64}$/;

function readJson(f, fallback) {
  if (!existsSync(f)) return fallback;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { throw new Error(`${f} is not valid JSON (${e.message})`); }
}

// What shape a placeholder's value must have, from its name. Returns a problem string or ''.
export function validate(key, value) {
  if (/_TX$/.test(key)) return TXH.test(value) ? '' : `${key} must be a 0x-prefixed 32-byte tx hash`;
  if (/(_SPLIT|_ADDRESS|_WALLET)$/.test(key)) return ADDR.test(value) ? '' : `${key} must be a 0x-prefixed 20-byte address`;
  if (/_URL$/.test(key)) return /^https:\/\/\S+$/.test(value) ? '' : `${key} must be an https:// URL`;
  return /[{}<>]/.test(value) ? `${key} contains braces or angle brackets` : '';
}

// Apply fn to the parts of text outside HTML comments only.
export function outsideComments(text, fn) {
  return text.split(/(<!--[\s\S]*?-->)/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

export function placeholdersIn(text) {
  const found = new Set();
  outsideComments(text, (t) => { for (const m of t.matchAll(PH)) found.add(m[1]); return t; });
  return [...found];
}

const tokenOf = (d) => d.token || 'USDC';

// The same instance walletConfig (wave.mjs) hands the backend: the one a DonateRouter fronts, else the
// newest recorded. Drafts then cite the split treats actually pay into.
export function pickDeployment(deployments, spec, routers = []) {
  for (const network of spec.networks || ['mainnet']) {
    const c = deployments.filter((x) => x.chain === spec.chain && x.network === network && (!spec.token || tokenOf(x) === spec.token));
    const fronted = (x) => (routers || []).some((r) => r.network === network && String(r.split || '').toLowerCase() === String(x.address || '').toLowerCase());
    const d = c.find(fronted) || c[c.length - 1];
    if (d) return { d, network };
  }
  return null;
}

// Resolve one placeholder for one application → { value, source } or { missing }.
export function resolve(key, slug, { map, values, deployments, campaign, routers = [] }) {
  const spec = map[slug]?.[key] || map['*']?.[key];
  const human = values[slug]?.[key] ?? values[key];
  if (typeof human === 'string' && human.trim()) return { value: human.trim(), source: `fill-values.json${values[slug]?.[key] ? ` (${slug})` : ''}` };
  if (!spec) return { missing: 'no rule in fill-map.json and no value in fill-values.json' };
  const how = spec.how ? ` — ${spec.how}` : '';
  if (spec.from === 'value') return { missing: `paste it into fill-values.json${how}` };
  if (spec.from === 'campaign') {
    const v = String(spec.path || '').split('.').reduce((o, k) => (o == null ? o : o[k]), campaign);
    return v ? { value: String(v), source: 'campaign.json' } : { missing: `campaign.json has no ${spec.path}${how}` };
  }
  if (spec.from === 'deploy' || spec.from === 'network-label') {
    const hit = pickDeployment(deployments, spec, routers);
    const where = `${spec.chain} ${(spec.networks || ['mainnet']).join(' or ')}${spec.token ? ` ${spec.token}` : ''}`;
    if (!hit) return { missing: `no ${where} deployment recorded (run the wave, then fund a:ingest)${how}` };
    if (spec.from === 'network-label') return { value: spec.labels?.[hit.network] || hit.network, source: `deployments.json (${spec.chain} ${hit.network})` };
    const v = spec.field === 'proof' ? hit.d.proofTxs?.[0] : spec.field === 'memo' ? hit.d.memoTxs?.[0] : hit.d.address;
    return v ? { value: v, source: `deployments.json (${spec.chain} ${hit.network} ${spec.field || 'address'})` } : { missing: `the ${spec.chain} ${hit.network} deployment has no ${spec.field}${how}` };
  }
  return { missing: `unknown source "${spec.from}" in fill-map.json` };
}

// --fallbacks: swap the exact sentences that depend on a value nobody has yet for wording that is true
// without it (fill-map.json "<slug>": { "_fallbacks": [{ when_missing, find, replace }] }).
export function applyFallbacks(text, slug, ctx) {
  const applied = [];
  const notFound = [];
  for (const fb of ctx.map[slug]?._fallbacks || []) {
    const open = (fb.when_missing || []).filter((k) => !resolve(k, slug, ctx).value || validate(k, resolve(k, slug, ctx).value));
    if (!open.length) continue;
    let hit = false;
    const next = outsideComments(text, (t) => { if (t.includes(fb.find)) hit = true; return t.split(fb.find).join(fb.replace); });
    if (hit) { text = next; applied.push({ because: open, find: fb.find }); } else notFound.push({ because: open, find: fb.find });
  }
  return { text, applied, notFound };
}

export function planFill({ core, slugs, map, values, deployments, campaign, routers = [], fallbacks = false }) {
  const plans = [];
  const ctx = { map, values, deployments, campaign, routers };
  for (const slug of slugs) {
    const app = core.loadApp(slug);
    const status = app.call.fm.status;
    const trackB = String(app.call.fm.track || '').toUpperCase() === 'B' && existsSync(join(app.dir, 'answers.md'));
    const draftPath = join(app.dir, trackB ? 'answers.md' : 'draft.md');
    const original = existsSync(draftPath) ? readFileSync(draftPath, 'utf8') : '';
    const fb = fallbacks ? applyFallbacks(original, slug, ctx) : { text: original, applied: [], notFound: [] };
    const text = fb.text;
    const keys = placeholdersIn(text);
    if (!keys.length && !fb.applied.length && !(app.call.fm.demo === '' && resolve('DEMO_URL', slug, ctx).value)) continue;
    const plan = { slug, status, trackB, closed: CLOSED.has(status), draftPath, filled: [], missing: [], invalid: [], fallbacks: fb.applied, fallbacksNotFound: fb.notFound };
    for (const key of keys) {
      const r = resolve(key, slug, ctx);
      if (r.value) {
        const bad = validate(key, r.value);
        if (bad) plan.invalid.push({ key, value: r.value, source: r.source, problem: bad });
        else plan.filled.push({ key, value: r.value, source: r.source });
      } else plan.missing.push({ key, why: r.missing });
    }
    const demo = resolve('DEMO_URL', slug, ctx);
    if (!app.call.fm.demo && demo.value && !validate('DEMO_URL', demo.value)) plan.demo = demo.value;
    plan.next = text;
    for (const f of plan.filled) plan.next = outsideComments(plan.next, (t) => t.split(`{${f.key}}`).join(f.value));
    plans.push(plan);
  }
  return plans;
}

export default {
  name: 'fill',
  help: '[<slug>...] [--write] [--ingest] [--fallbacks] [--network N] [--json] — after the wave: write deployed addresses, tx hashes and pasted URLs into every draft, re-render submissions, list what is still owed (dry run without --write)',
  booleanFlags: ['write', 'ingest', 'json', 'fallbacks'],
  async run({ args, flags, core, invoke }) {
    let ingestCode = null;
    if (flags.ingest) {
      const network = flags.network || 'mainnet';
      console.log(`→ fund a:ingest --network ${network}`);
      ingestCode = await invoke(['a:ingest', '--network', network]);
      if (ingestCode) console.log(`! a:ingest exited ${ingestCode}: filling from what was recorded; fix the reported problems and run fund fill again`);
    }
    const all = core.listApps();
    const unknown = args.filter((s) => !all.includes(s));
    if (unknown.length) { console.error(`no application(s): ${unknown.join(', ')} — see fund list`); return 2; }
    const ctx = {
      core,
      slugs: args.length ? args : all,
      map: readJson(fillPaths.map(), {}),
      values: readJson(fillPaths.values(), {}),
      deployments: readJson(fillPaths.deployments(), []),
      routers: readJson(fillPaths.routers(), []),
      campaign: readJson(fillPaths.campaign(), {}),
      fallbacks: !!flags.fallbacks,
    };
    const plans = planFill(ctx);
    if (flags.json) {
      console.log(JSON.stringify(plans.map(({ next, ...p }) => p), null, 2));
      return plans.some((p) => p.invalid.length) ? 1 : 0;
    }
    const write = !!flags.write;
    const owed = new Map();
    for (const p of plans) {
      console.log(`\n${p.slug}${p.closed ? `  (${p.status}: skipped, never edited after submit)` : ''}`);
      for (const f of p.fallbacks) console.log(`  ↺ fallback (no ${f.because.join(', ')} yet): "${f.find.slice(0, 70)}…"`);
      for (const f of p.fallbacksNotFound) console.log(`  ! fallback sentence not found in draft.md (edited?): "${f.find.slice(0, 70)}…"`);
      for (const f of p.filled) console.log(`  ✓ {${f.key}} = ${f.value}   from ${f.source}`);
      if (p.demo) console.log(`  ✓ call.md demo: ${p.demo}`);
      for (const f of p.invalid) console.log(`  ✗ {${f.key}} = ${f.value}   from ${f.source}: ${f.problem}`);
      for (const m of p.missing) {
        console.log(`  · {${m.key}} still open: ${m.why}`);
        if (!p.closed) owed.set(m.key, [...(owed.get(m.key) || []), p.slug]);
      }
      if (write && !p.closed && !p.invalid.length) {
        if (p.filled.length || p.fallbacks.length) writeFileSync(p.draftPath, p.next);
        if (p.demo) core.updateFrontmatter(join(core.appDir(p.slug), 'call.md'), { demo: p.demo });
        if (p.filled.length || p.fallbacks.length || p.demo) {
          const render = p.trackB ? 'b:fill' : 'a:submission';
          const code = await invoke([render, p.slug]);
          if (code) console.log(`  ! ${render} ${p.slug} exited ${code}`);
        }
      }
    }
    // The final grep, outside comments, over draft.md and submission.md (what a judge would see).
    const left = [];
    if (write) {
      for (const p of plans.filter((x) => !x.closed)) {
        for (const f of p.trackB ? ['answers.md', 'fill.md'] : ['draft.md', 'submission.md']) {
          const path = join(core.appDir(p.slug), f);
          if (!existsSync(path)) continue;
          const keys = placeholdersIn(readFileSync(path, 'utf8'));
          if (keys.length) left.push(`${p.slug}/${f}: ${keys.map((k) => `{${k}}`).join(' ')}`);
        }
      }
    }
    const filledCount = plans.reduce((s, p) => s + p.filled.length, 0);
    console.log(`\n${write ? 'wrote' : 'would write'} ${filledCount} value(s) into ${plans.filter((p) => p.filled.length && !p.closed).length} draft(s)${write ? '' : ' — dry run, add --write'}`);
    if (owed.size) {
      console.log('still owed (a person or a later deploy):');
      for (const [k, s] of owed) console.log(`  {${k}}  ${s.join(', ')}`);
    }
    if (write) console.log(left.length ? `placeholders left outside comments:\n  ${left.join('\n  ')}` : 'final grep: no placeholders left outside comments');
    // The demo videos show the address and first payout in their title cards: print the re-render command.
    const val = (slug, key) => { const r = resolve(key, slug, ctx); return r.value && !validate(key, r.value) ? r.value : ''; };
    const arcSplit = val('arc-microgrants', 'SPLIT_ADDRESS');
    const arcTx = val('arc-microgrants', 'ARC_PROOF_TX');
    const tempoSplit = val('colosseum-worlds-fair', 'SPLIT_ADDRESS');
    const tempoTx = val('colosseum-worlds-fair', 'TEMPO_TX');
    if (arcSplit && arcTx) console.log(`re-render the Arc demo: node ../media/make-demo.mjs --reuse --only arc --var 'SHELTER_NAME=Pink Paw' --var SPLIT_ADDRESS=${arcSplit} --var ARC_TX=${arcTx}`);
    if (tempoSplit && tempoTx) console.log(`re-render the Colosseum demo: node ../media/make-demo.mjs --reuse --only colosseum --var 'SHELTER_NAME=Pink Paw' --var SPLIT_ADDRESS=${tempoSplit} --var TEMPO_TX=${tempoTx}`);
    const invalid = plans.some((p) => p.invalid.length);
    if (invalid) console.log('next: fix the ✗ values in fill-values.json, then fund fill --write');
    else if (!write) console.log('next: fund fill --write');
    else console.log(owed.size ? 'next: paste the owed values into fill-values.json, then fund fill --write' : 'next: fund check --all, then submit');
    return invalid || (ingestCode && ingestCode !== 0) ? 1 : 0;
  },
};
