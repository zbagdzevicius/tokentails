// Track A — "Build once, submit many".
// One Solidity contract (ShelterSplit, in ./shelter-split) deployed to several EVM chains feeds many
// hackathon and grant submissions. This plugin turns each manual step into one command:
//   a:build → a:deploy (prints the command, never broadcasts) → a:record → a:verify → a:matrix → a:submission
// Node built-ins only. Nothing here ever signs or broadcasts a transaction.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { CORE } from '../../lib/core.mjs';
import { waveCommands, splitToken } from './wave.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRACK_ID = 'A';
const STRICT = new Set(['in-review', 'ready']);
const CLOSED = new Set(['submitted', 'won', 'lost', 'parked']);
const EVIDENCE_MAX_DAYS = 7;
const NETWORKS = ['mainnet', 'testnet'];

// Paths are resolved at call time so tests (and power users) can redirect them with env vars.
export const paths = {
  project: () => process.env.FUND_A_PROJECT || join(HERE, 'shelter-split'),
  chains: () => process.env.FUND_A_CHAINS || join(HERE, 'chains.json'),
  deployments: () => process.env.FUND_A_DEPLOYMENTS || join(HERE, 'deployments.json'),
  programs: () => process.env.FUND_A_PROGRAMS || join(HERE, 'programs'),
  master: () => join(HERE, 'submission', 'master.md'),
};

// ---------------------------------------------------------------- data

export function loadChains() {
  const raw = JSON.parse(readFileSync(paths.chains(), 'utf8'));
  delete raw._readme;
  return raw;
}

export function loadDeployments() {
  const f = paths.deployments();
  if (!existsSync(f)) return [];
  const raw = readFileSync(f, 'utf8').trim() || '[]';
  let list;
  try { list = JSON.parse(raw); } catch (e) { throw new Error(`${f} is not valid JSON (${e.message}) — fix it by hand or restore it from git`); }
  if (!Array.isArray(list)) throw new Error(`${f} must be a JSON array`);
  return list;
}

export function saveDeployments(list) {
  writeFileSync(paths.deployments(), JSON.stringify(list, null, 2) + '\n');
}

export function networkInfo(chains, chain, network) {
  const c = chains[chain];
  if (!c) throw new Error(`unknown chain "${chain}" — known: ${Object.keys(chains).join(', ')}`);
  const n = c.networks?.[network];
  if (!n) throw new Error(`unknown network "${network}" for ${chain} — known: ${Object.keys(c.networks || {}).join(', ')}`);
  return { ...n, chainName: c.name };
}

export function explorerLink(chains, chain, network, kind, value) {
  if (!value) return '';
  try {
    const n = networkInfo(chains, chain, network);
    const pattern = n[kind];
    if (!pattern) return '';
    return pattern.replace('{explorer}', n.explorer).replace(`{${kind}}`, value);
  } catch { return ''; }
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const TXH = /^0x[0-9a-fA-F]{64}$/;

export function recordDeployment({ chain, network, address, tx, contract = 'ShelterSplit', note, token }) {
  const chains = loadChains();
  const n = networkInfo(chains, chain, network);
  if (!ADDR.test(address || '')) throw new Error(`"${address}" is not a 0x-prefixed 20-byte address`);
  if (tx && !TXH.test(tx)) throw new Error(`"${tx}" is not a 0x-prefixed 32-byte tx hash`);
  const list = loadDeployments();
  const dup = list.find((d) => d.chain === chain && d.network === network && d.address.toLowerCase() === address.toLowerCase());
  if (dup) throw new Error(`already recorded: ${chain} ${network} ${address}`);
  const entry = {
    contract, chain, network, chainId: n.chainId, address,
    ...(tx ? { tx } : {}),
    ...(token ? { token } : {}),
    recorded: new Date().toISOString(),
    verified: false,
    ...(note ? { note } : {}),
  };
  list.push(entry);
  saveDeployments(list);
  return entry;
}

export function appChains(app) {
  return [].concat(app.call.fm.chain ?? []).map((c) => String(c ?? '').trim().toLowerCase()).filter(Boolean);
}

// mainnet_required as written by a human: true/yes/1 and false/no/0 (any case), empty = false.
// Anything else is 'invalid' so a typo can never silently switch the mainnet gate off.
export function mainnetRequired(app) {
  const v = app.call.fm.mainnet_required;
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return false;
  if (/^(true|yes|y|1)$/i.test(String(v).trim())) return true;
  if (/^(false|no|n|0)$/i.test(String(v).trim())) return false;
  return 'invalid';
}

export function mainnetFor(app, deployments = loadDeployments()) {
  const chains = appChains(app);
  return deployments.filter((d) => d.network === 'mainnet' && (chains.length === 0 || chains.includes(d.chain)));
}

export function trackAApps(core = CORE) {
  return core.listApps().map((s) => core.loadApp(s)).filter((a) => a.call.fm.track === TRACK_ID);
}

export function loadProfile(app) {
  const key = app.call.fm.profile || app.slug;
  const f = join(paths.programs(), `${key}.json`);
  const base = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const local = join(app.dir, 'submission.json'); // per-application override, wins over the profile
  const over = existsSync(local) ? JSON.parse(readFileSync(local, 'utf8')) : {};
  return { key, found: existsSync(f), ...base, ...over, submission: { ...(base.submission || {}), ...(over.submission || {}) } };
}

// ---------------------------------------------------------------- build evidence

export function readEvidence(app) {
  const f = join(app.dir, 'build-evidence.md');
  if (!existsSync(f)) return null;
  const { fm } = CORE.parseFrontmatter(readFileSync(f, 'utf8'));
  const t = Date.parse(fm.generated || '') || statSync(f).mtimeMs;
  return { ...fm, file: f, ageDays: (Date.now() - t) / 86400000 };
}

function forgeBin() {
  if (process.env.FORGE_BIN) return process.env.FORGE_BIN;
  const local = join(homedir(), '.foundry', 'bin', 'forge');
  return existsSync(local) ? local : 'forge';
}

function run(cmd, args, cwd) {
  const env = { ...process.env, PATH: `${join(homedir(), '.foundry', 'bin')}:${process.env.PATH || ''}` };
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { code: r.status ?? 1, out: r.stdout || '', err: r.stderr || (r.error ? r.error.message : '') };
}

export function parseForgeJson(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('forge test --json printed no JSON');
  const data = JSON.parse(text.slice(start));
  const suites = [];
  let passed = 0; let failed = 0; let skipped = 0;
  for (const [suite, v] of Object.entries(data)) {
    const tests = Object.entries(v.test_results || {}).map(([name, t]) => {
      const kind = t.kind && Object.keys(t.kind)[0];
      const st = t.status === 'Success' ? 'pass' : t.status === 'Skipped' ? 'skip' : 'fail';
      if (st === 'pass') passed++; else if (st === 'skip') skipped++; else failed++;
      return { name, status: st, kind, runs: t.kind?.Fuzz?.runs, reason: t.reason || '' };
    });
    suites.push({ suite, tests });
  }
  return { suites, passed, failed, skipped, total: passed + failed + skipped };
}

function artifactInfo(project) {
  const f = join(project, 'out', 'ShelterSplit.sol', 'ShelterSplit.json');
  if (!existsSync(f)) return { bytecodeSha256: 'n/a', runtimeBytes: 0 };
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const creation = (j.bytecode?.object || '').replace(/^0x/, '');
  const runtime = (j.deployedBytecode?.object || '').replace(/^0x/, '');
  return {
    bytecodeSha256: creation ? createHash('sha256').update(Buffer.from(creation, 'hex')).digest('hex') : 'n/a',
    runtimeBytes: runtime.length / 2,
    compiler: j.metadata?.compiler?.version || '',
  };
}

function gitInfo(project) {
  const head = run('git', ['rev-parse', '--short=12', 'HEAD'], project);
  if (head.code !== 0) return { commit: 'n/a', tree: 'not a git checkout' };
  const st = run('git', ['status', '--porcelain', '--', '.'], project);
  const lines = st.out.split('\n').filter(Boolean);
  const tree = !lines.length ? 'clean' : lines.every((l) => l.startsWith('??')) ? 'untracked, not committed yet' : 'uncommitted changes';
  return { commit: head.out.trim(), tree };
}

export function runBuild({ project = paths.project() } = {}) {
  const forge = forgeBin();
  const build = run(forge, ['build'], project);
  if (build.code !== 0) return { ok: false, stage: 'build', log: (build.out + build.err).slice(-4000) };
  const test = run(forge, ['test', '--json'], project);
  let parsed;
  try { parsed = parseForgeJson(test.out); } catch (e) {
    return { ok: false, stage: 'test', log: `${e.message}\n${(test.out + test.err).slice(-4000)}` };
  }
  const version = run(forge, ['--version'], project).out.trim().split('\n')[0];
  return {
    ok: test.code === 0 && parsed.failed === 0 && parsed.total > 0,
    stage: 'test',
    ...parsed,
    ...artifactInfo(project),
    ...gitInfo(project),
    forge: version,
    generated: new Date().toISOString(),
  };
}

export function evidenceMarkdown(b, slug) {
  const fm = CORE.stringifyFrontmatter({
    generated: b.generated,
    passed: b.ok,
    tests_total: b.total,
    tests_passed: b.passed,
    tests_failed: b.failed,
    bytecode_sha256: b.bytecodeSha256,
    runtime_bytes: b.runtimeBytes,
    commit: b.commit,
    tree: b.tree,
    forge: b.forge,
  });
  const rows = b.suites.flatMap((s) => s.tests.map((t) => `| ${s.suite.split(':').pop()} | \`${t.name}\` | ${t.kind || ''}${t.runs ? ` (${t.runs} runs)` : ''} | ${t.status}${t.reason ? `: ${t.reason}` : ''} |`));
  return `${fm}# Build evidence — ShelterSplit

Generated by \`fund a:build --slug ${slug}\`. Regenerate before submitting; \`fund check\` rejects
evidence older than ${EVIDENCE_MAX_DAYS} days once the application is \`ready\`.

| Item | Value |
|---|---|
| Result | ${b.ok ? 'PASS' : 'FAIL'} — ${b.passed}/${b.total} Foundry tests passing |
| Creation bytecode sha256 | \`${b.bytecodeSha256}\` |
| Runtime size | ${b.runtimeBytes} bytes (EIP-170 limit 24576) |
| Git commit | \`${b.commit}\` (${b.tree}) |
| Toolchain | ${b.forge}${b.compiler ? `, solc ${b.compiler}` : ''} |
| Generated | ${b.generated} |

## Tests

| Suite | Test | Kind | Result |
|---|---|---|---|
${rows.join('\n')}
`;
}

// ---------------------------------------------------------------- JSON-RPC (read-only)

const RPC_TIMEOUT_MS = () => Number(process.env.FUND_A_RPC_TIMEOUT_MS) || 15000;

export async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS()),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

// Read-only methods only. There is deliberately no path here that sends a transaction.
const READ_ONLY = new Set(['eth_chainId', 'eth_getCode', 'eth_getTransactionReceipt']);

export async function verifyDeployment(entry, { rpcUrl, project = paths.project() }) {
  const call = (m, p) => { if (!READ_ONLY.has(m)) throw new Error(`refusing non-read RPC ${m}`); return rpc(rpcUrl, m, p); };
  const problems = [];
  const chainId = parseInt(await call('eth_chainId'), 16);
  if (chainId !== entry.chainId) problems.push(`RPC is chain ${chainId}, expected ${entry.chainId}`);
  const code = await call('eth_getCode', [entry.address, 'latest']);
  if (!code || code === '0x') problems.push(`no contract code at ${entry.address}`);
  if (entry.tx) {
    const rc = await call('eth_getTransactionReceipt', [entry.tx]);
    if (!rc) problems.push(`tx ${entry.tx} not found`);
    else if (rc.contractAddress && rc.contractAddress.toLowerCase() !== entry.address.toLowerCase()) problems.push(`tx created ${rc.contractAddress}, not ${entry.address}`);
    else if (rc.status && rc.status !== '0x1') problems.push(`tx ${entry.tx} failed`);
  }
  const codeHash = code && code !== '0x' ? createHash('sha256').update(Buffer.from(code.replace(/^0x/, ''), 'hex')).digest('hex') : '';
  const codeBytes = code ? (code.length - 2) / 2 : 0;
  // Immutables are filled in place, so a deployment of this build has exactly the local runtime size.
  const notes = [];
  const local = artifactInfo(project).runtimeBytes;
  if (codeBytes && local && codeBytes !== local) notes.push(`code is ${codeBytes} bytes but the local ShelterSplit build is ${local} bytes — wrong address, or deployed from a different build`);
  return { ok: problems.length === 0, problems, notes, chainId, codeBytes, codeHash };
}

// ---------------------------------------------------------------- deploy command (print / simulate only)

export function deployPlan(chains, chain, network) {
  const n = networkInfo(chains, chain, network);
  const env = {
    SHELTERSPLIT_TOKEN: splitToken(n).address || `<set: no official ${splitToken(n).symbol} address listed, verify>`,
    SHELTERSPLIT_TREASURY: '<treasury address>',
    SHELTERSPLIT_OWNER: '<owner, ideally a multisig>',
    EXPECTED_CHAIN_ID: String(n.chainId),
  };
  const simulateArgs = ['script', 'script/DeployShelterSplit.s.sol:DeployShelterSplit', '--rpc-url', `$${n.rpcEnv}`];
  if (simulateArgs.includes('--broadcast')) throw new Error('internal: simulate must never broadcast');
  return { n, env, simulateArgs, rpcEnv: n.rpcEnv };
}

// ---------------------------------------------------------------- matrix

export function matrixRows(apps, deployments = loadDeployments()) {
  return apps.map((app) => {
    const fm = app.call.fm;
    const status = fm.status || 'researching';
    const chains = appChains(app);
    const main = mainnetFor(app, deployments);
    const test = deployments.filter((d) => d.network === 'testnet' && (chains.length === 0 || chains.includes(d.chain)));
    const ev = readEvidence(app);
    const required = mainnetRequired(app) !== false;
    const blockers = [];
    if (required && !main.length) blockers.push({ why: `needs ${chains.join('|') || 'any'} mainnet deploy`, next: `fund a:deploy ${chains[0] || '<chain>'} mainnet` });
    if (!required && !main.length && !test.length) blockers.push({ why: `needs a ${chains.join('|') || 'any'} deploy`, next: `fund a:deploy ${chains[0] || '<chain>'} testnet` });
    if (!ev) blockers.push({ why: 'no build evidence', next: `fund a:build --slug ${app.slug}` });
    else if (String(ev.passed) !== 'true') blockers.push({ why: 'build evidence failing', next: `fund a:build --slug ${app.slug}` });
    else if (ev.ageDays > EVIDENCE_MAX_DAYS) blockers.push({ why: `build evidence ${ev.ageDays.toFixed(0)}d old`, next: `fund a:build --slug ${app.slug}` });
    if (!fm.repo) blockers.push({ why: 'repo not set', next: `add repo: to applications/${app.slug}/call.md` });
    const deadline = fm.deadline && fm.deadline !== 'rolling' ? Date.parse(fm.deadline) : NaN;
    const days = Number.isNaN(deadline) ? null : (deadline - Date.now()) / 86400000;
    return {
      slug: app.slug, program: fm.program || app.slug, status, chains, mainnetRequired: required,
      mainnet: main.map((d) => `${d.chain}`), testnet: test.map((d) => d.chain),
      evidence: ev ? (String(ev.passed) === 'true' ? `${ev.ageDays.toFixed(1)}d` : 'FAIL') : '-',
      repo: !!fm.repo, days, closed: CLOSED.has(status),
      unblocked: blockers.length === 0, blockers,
    };
  });
}

// Which single deployment would unblock the most mainnet-gated applications.
export function nextDeploys(rows) {
  const score = {};
  for (const r of rows) {
    if (r.closed || !r.mainnetRequired || r.mainnet.length) continue;
    for (const c of r.chains) (score[c] ||= []).push(r.slug);
  }
  return Object.entries(score).sort((a, b) => b[1].length - a[1].length).map(([chain, slugs]) => ({ chain, slugs }));
}

// ---------------------------------------------------------------- submission rendering

// Raw draft sections, links preserved (core's parser strips link URLs, which a form needs).
export function rawSections(body) {
  return body.split(/^## /m).slice(1).map((part) => {
    const nl = part.indexOf('\n');
    const head = nl === -1 ? part : part.slice(0, nl);
    const text = (nl === -1 ? '' : part.slice(nl + 1)).replace(/<!--[\s\S]*?-->/g, '').trim();
    return { title: head.replace(/<!--[\s\S]*?-->/, '').trim(), text };
  });
}

export function stripCitations(text) {
  return text.replace(/\s*\[F-\d{3}\](?:\s*\[F-\d{3}\])*/g, '').replace(/ +([.,;:])/g, '$1');
}

const TESTNET_NAMES = {
  5042002: 'Arc', 42431: 'Tempo Moderato', 421614: 'Arbitrum Sepolia', 84532: 'Base Sepolia',
  43113: 'Avalanche Fuji', 46630: 'Robinhood Chain', 10143: 'Monad', 11155111: 'Ethereum Sepolia',
};

function deploymentsBlock(app, deployments, chains) {
  const want = appChains(app);
  const rel = deployments.filter((d) => !want.length || want.includes(d.chain));
  if (!rel.length) return `_No ShelterSplit deployment recorded on ${want.join(' / ') || 'any chain'} yet — run \`fund a:deploy ${want[0] || '<chain>'} mainnet\`, then \`fund a:record\`._`;
  const order = (d) => (d.network === 'mainnet' ? 0 : 1);
  const rows = [...rel].sort((a, b) => order(a) - order(b)).map((d) => {
    // Testnets go by their own names (Arbitrum Sepolia, not "Arbitrum One testnet").
    const name = (d.network === 'testnet' && TESTNET_NAMES[d.chainId]) || chains[d.chain]?.name || d.chain;
    const a = explorerLink(chains, d.chain, d.network, 'address', d.address);
    const t = d.tx ? explorerLink(chains, d.chain, d.network, 'tx', d.tx) : '';
    const proofs = (d.proofTxs || []).map((h, i) => `[payout ${i + 1}](${explorerLink(chains, d.chain, d.network, 'tx', h) || h})`).join(', ');
    return `| ${name}${d.network === 'testnet' && TESTNET_NAMES[d.chainId] ? ' testnet' : ' ' + d.network} (chain ${d.chainId}) | [\`${d.address}\`](${a}) | ${t ? `[deploy tx](${t})` : '-'} | ${proofs || '-'} | ${d.verified ? 'verified on-chain' : 'recorded'}${d.sourceVerified ? ', source verified' : ''} |`;
  });
  return ['| Network | Contract | Transaction | Shelter payouts | Status |', '|---|---|---|---|---|', ...rows].join('\n');
}

function buildBlock(ev) {
  if (!ev) return '_No build evidence yet — run `fund a:build --slug <slug>`._';
  const pass = String(ev.passed) === 'true';
  // Only name a commit when the built source is actually in it; otherwise a judge checking the
  // commit would find no ShelterSplit (or a different one).
  const src = ev.tree === 'clean' ? `commit \`${ev.commit}\`` : `**built from uncommitted source (${ev.tree}) — commit, push and re-run \`fund a:build\` before submitting**`;
  return `${pass ? 'All' : 'NOT all'} ${ev.tests_passed}/${ev.tests_total} Foundry tests pass (unit, fuzz, reentrancy with a malicious token, event emission). ` +
    `Creation bytecode sha256 \`${ev.bytecode_sha256}\`, runtime ${ev.runtime_bytes} bytes, ${src}, built ${String(ev.generated).slice(0, 10)}.`;
}

export function renderSubmission(app, { deployments = loadDeployments(), chains = loadChains(), keepCites = false } = {}) {
  const profile = loadProfile(app);
  const fm = app.call.fm;
  const draft = rawSections(app.draft.body);
  const find = (t) => draft.find((s) => s.title.toLowerCase() === String(t).toLowerCase());
  const specs = profile.submission.sections?.length
    ? profile.submission.sections
    : draft.map((s) => ({ title: s.title, from: s.title, ...(/on-chain proof/i.test(s.title) ? { auto: 'deployments' } : {}) }));
  const problems = [];
  const ev = readEvidence(app);
  const out = [];
  for (const spec of specs) {
    const parts = [];
    if (spec.from) {
      const s = find(spec.from);
      if (!s) problems.push(`draft.md has no "## ${spec.from}" section (needed for "${spec.title}")`);
      else if (s.text) parts.push(keepCites ? s.text : stripCitations(s.text));
    }
    if (spec.auto === 'deployments') parts.push(deploymentsBlock(app, deployments, chains));
    if (spec.auto === 'build') parts.push(buildBlock(ev));
    const text = parts.join('\n\n').trim();
    const chars = text.length;
    let head = `## ${spec.title}`;
    if (spec.limit) {
      head += `  <!-- ${chars}/${spec.limit} chars -->`;
      if (chars > spec.limit) problems.push(`"${spec.title}" is ${chars}/${spec.limit} chars`);
    }
    out.push(`${head}\n\n${text || '_(empty)_'}\n`);
  }
  const fields = Object.entries(profile.submission.fields || {}).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  const checklist = (profile.submission.checklist || []).length
    ? `## Before you press submit\n\n${profile.submission.checklist.map((c) => `- [ ] ${c}`).join('\n')}\n`
    : '';
  const text = CORE.render(readFileSync(paths.master(), 'utf8'), {
    PROGRAM: fm.program || app.slug,
    SLUG: app.slug,
    DEADLINE: fm.deadline || 'rolling',
    URL: fm.url || '',
    REPO: fm.repo || '_(not set — add `repo:` to call.md)_',
    DEMO: fm.demo || '_(not set — add `demo:` to call.md)_',
    FIELDS: fields,
    SECTIONS: `\n${out.join('\n')}`,
    CHECKLIST: checklist,
    GENERATED: new Date().toISOString(),
  });
  const left = text.match(/\{\{[A-Z_]+\}\}/g);
  if (left) problems.push(`master template left placeholders: ${left.join(', ')}`);
  return { text: text.replace(/\n{3,}/g, '\n\n'), problems, profile };
}

// ---------------------------------------------------------------- checks

function checkApp({ app }) {
  const out = [];
  const fm = app.call.fm;
  const status = fm.status || 'researching';
  if (CLOSED.has(status)) return [{ name: 'closed', level: 'ok', detail: `${status}: track checks skipped` }];
  const strict = STRICT.has(status);
  const ready = status === 'ready';

  // chain
  let chains;
  try { chains = loadChains(); } catch (e) { return [{ name: 'chains', level: 'error', detail: e.message }]; }
  const want = appChains(app);
  const unknown = want.filter((c) => !chains[c]);
  if (unknown.length) out.push({ name: 'chain', level: 'error', detail: `unknown chain(s) ${unknown.join(', ')} — see tracks/a-build/chains.json` });
  else if (!want.length) out.push({ name: 'chain', level: strict ? 'error' : 'warn', detail: 'no chain: set in call.md' });
  else out.push({ name: 'chain', level: 'ok', detail: want.join(' | ') });

  // mainnet
  const deployments = loadDeployments();
  const main = mainnetFor(app, deployments);
  const required = mainnetRequired(app);
  if (required === 'invalid') {
    out.push({ name: 'mainnet', level: 'error', detail: `mainnet_required: "${fm.mainnet_required}" is not true or false` });
  } else if (required) {
    if (main.length) {
      const unverified = main.filter((d) => !d.verified);
      out.push({ name: 'mainnet', level: unverified.length === main.length && strict ? 'warn' : 'ok', detail: `${main.map((d) => `${d.chain} ${d.address.slice(0, 10)}…${d.verified ? ' (verified)' : ''}`).join(', ')}${unverified.length === main.length ? ` — run "fund a:verify ${main[0].chain} mainnet"` : ''}` });
    } else {
      out.push({ name: 'mainnet', level: strict ? 'error' : 'warn', detail: `mainnet_required but no ${want.join('|') || ''} mainnet deployment recorded — "fund a:deploy ${want[0] || '<chain>'} mainnet", then "fund a:record"` });
    }
  } else {
    out.push({ name: 'mainnet', level: 'ok', detail: main.length ? `${main.length} mainnet deployment(s)` : 'not required' });
  }

  // source code verified on the explorer (judges open the contract; unverified bytecode can disqualify)
  const relevant = main.length ? main : deployments.filter((d) => d.network === 'testnet' && (want.length === 0 || want.includes(d.chain)));
  if (relevant.length) {
    const missing = relevant.filter((d) => !d.sourceVerified);
    out.push(missing.length
      ? { name: 'source-verified', level: ready ? 'error' : 'warn', detail: `source not verified on the explorer: ${missing.map((d) => `${d.chain} ${d.network}`).join(', ')} — run "fund a:verify-source"` }
      : { name: 'source-verified', level: 'ok', detail: relevant.map((d) => `${d.chain} ${d.network}`).join(', ') });
  }

  // build evidence
  const ev = readEvidence(app);
  const evLevel = ready ? 'error' : 'warn';
  if (!ev) out.push({ name: 'build-evidence', level: evLevel, detail: `missing — "fund a:build --slug ${app.slug}"` });
  else if (String(ev.passed) !== 'true') out.push({ name: 'build-evidence', level: evLevel, detail: `tests failing (${ev.tests_failed} failed) — fix, then "fund a:build --slug ${app.slug}"` });
  else if (ev.ageDays > EVIDENCE_MAX_DAYS) out.push({ name: 'build-evidence', level: evLevel, detail: `${ev.ageDays.toFixed(1)} days old (max ${EVIDENCE_MAX_DAYS}) — "fund a:build --slug ${app.slug}"` });
  else if (ev.tree && ev.tree !== 'clean' && strict) out.push({ name: 'build-evidence', level: ready ? 'error' : 'warn', detail: `built from uncommitted source (${ev.tree}) — commit and push ShelterSplit, then "fund a:build --slug ${app.slug}"` });
  else out.push({ name: 'build-evidence', level: 'ok', detail: `${ev.tests_passed}/${ev.tests_total} tests, ${ev.ageDays.toFixed(1)}d old${ev.tree && ev.tree !== 'clean' ? ` (${ev.tree})` : ''}` });

  // repo
  if (!fm.repo) out.push({ name: 'repo', level: ready ? 'error' : 'warn', detail: 'repo: not set in call.md (public repo URL)' });
  else if (!/^https:\/\//.test(String(fm.repo))) out.push({ name: 'repo', level: 'error', detail: `repo "${fm.repo}" is not an https URL` });
  else out.push({ name: 'repo', level: 'ok', detail: fm.repo });

  // build window
  const end = Date.parse(fm.build_window_end || '');
  const start = Date.parse(fm.build_window_start || '');
  if (!Number.isNaN(start) && !Number.isNaN(end) && start > end) out.push({ name: 'build-window', level: 'error', detail: 'build_window_start is after build_window_end' });
  else if (!Number.isNaN(start) && Date.now() < start) out.push({ name: 'build-window', level: 'warn', detail: `opens ${fm.build_window_start}: commits made before it may not count` });
  else if (!Number.isNaN(end)) {
    const days = (end + 86400000 - Date.now()) / 86400000;
    out.push({ name: 'build-window', level: days < 0 ? 'warn' : 'ok', detail: days < 0 ? `closed ${fm.build_window_end}` : `${days.toFixed(1)} days of build window left` });
  }

  // submission freshness
  const sub = join(app.dir, 'submission.md');
  const draftF = join(app.dir, 'draft.md');
  if (existsSync(sub) && existsSync(draftF)) {
    const newest = Math.max(statSync(draftF).mtimeMs, existsSync(paths.deployments()) ? statSync(paths.deployments()).mtimeMs : 0, ev ? statSync(ev.file).mtimeMs : 0);
    if (statSync(sub).mtimeMs + 1000 < newest) out.push({ name: 'submission', level: strict ? 'error' : 'warn', detail: `submission.md is older than its inputs — "fund a:submission ${app.slug}"` });
    else out.push({ name: 'submission', level: 'ok', detail: 'submission.md up to date' });
  } else if (strict) out.push({ name: 'submission', level: 'warn', detail: `no submission.md — "fund a:submission ${app.slug}"` });

  return out;
}

// ---------------------------------------------------------------- commands

const say = (...a) => console.log(...a);
const next = (cmd) => say(`\nnext: ${cmd}`);

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n - 1) + '…' : s.padEnd(n); }

async function cmdBuild({ flags }) {
  const project = paths.project();
  let slugs = [];
  if (flags.all) slugs = trackAApps().filter((a) => !CLOSED.has(a.call.fm.status)).map((a) => a.slug);
  else if (typeof flags.slug === 'string') slugs = flags.slug.split(',').map((s) => s.trim()).filter(Boolean);
  const missing = slugs.filter((s) => !existsSync(join(CORE.appDir(s), 'call.md')));
  if (missing.length) { console.error(`no application ${missing.map((s) => `"${s}"`).join(', ')} — known: ${CORE.listApps().join(', ') || 'none'}`); return 2; }
  say(`forge build + forge test in ${project}`);
  const b = runBuild({ project });
  if (b.stage === 'build' || !b.suites) {
    say(`✗ ${b.stage} failed\n${b.log}`);
    return 1;
  }
  say(`${b.ok ? '✓' : '✗'} ${b.passed}/${b.total} tests passing, ${b.failed} failing · bytecode sha256 ${b.bytecodeSha256.slice(0, 16)}… · ${b.runtimeBytes} bytes · commit ${b.commit} (${b.tree})`);
  for (const s of b.suites) for (const t of s.tests.filter((x) => x.status === 'fail')) say(`   ✗ ${s.suite} ${t.name} ${t.reason}`);
  for (const slug of slugs) {
    const dir = CORE.appDir(slug);
    writeFileSync(join(dir, 'build-evidence.md'), evidenceMarkdown(b, slug));
    say(`wrote applications/${slug}/build-evidence.md`);
  }
  const again = `fund a:build ${flags.all ? '--all' : `--slug ${slugs.join(',')}`}`;
  if (!b.ok) next(`fix the failing tests in ${project}, then ${slugs.length ? again : 'fund a:build'}`);
  else if (!slugs.length) next('fund a:build --slug <slug>   (or --all) to write build-evidence.md into applications');
  else next(slugs.length === 1 ? `fund a:submission ${slugs[0]}` : 'fund a:matrix');
  return b.ok ? 0 : 1;
}

async function cmdSubmission({ args, flags }) {
  const slug = args[0] || flags.slug;
  if (!slug) { console.error('usage: a:submission <slug> [--keep-cites]'); return 2; }
  const app = CORE.loadApp(slug);
  const { text, problems, profile } = renderSubmission(app, { keepCites: !!flags['keep-cites'] });
  const f = join(app.dir, 'submission.md');
  writeFileSync(f, text);
  say(`wrote applications/${slug}/submission.md (profile: ${profile.found ? `programs/${profile.key}.json` : 'none, draft sections as-is'}${existsSync(join(app.dir, 'submission.json')) ? ' + submission.json' : ''})`);
  for (const p of problems) say(`  ! ${p}`);
  if (profile.verify?.length) say(`  verify by hand: ${profile.verify.join('; ')}`);
  next(`fund check ${slug}`);
  return problems.length ? 1 : 0;
}

async function cmdRecord({ args, flags }) {
  const [chain, network, address] = args;
  if (!chain || !network || !address) { console.error('usage: a:record <chain> <mainnet|testnet> <address> [--tx 0x…] [--note "…"]'); return 2; }
  const e = recordDeployment({ chain, network, address, tx: typeof flags.tx === 'string' ? flags.tx : undefined, note: typeof flags.note === 'string' ? flags.note : undefined });
  const chains = loadChains();
  say(`recorded ${e.contract} on ${chains[chain].name} ${network} (chain ${e.chainId})\n  ${explorerLink(chains, chain, network, 'address', address)}`);
  if (e.tx) say(`  ${explorerLink(chains, chain, network, 'tx', e.tx)}`);
  // The pipeline picks the deployment up by itself: name the apps whose `fund run` it unblocks.
  let apps = [];
  try { apps = trackAApps(CORE).filter((a) => appChains(a).includes(chain) && !CORE.CLOSED.has(a.call.fm.status)).map((a) => a.slug); } catch { /* listing is a convenience */ }
  next(`fund a:verify ${chain} ${network}   (optional; then: ${apps.length ? apps.map((s) => `fund run ${s}`).join(' · ') : 'fund a:matrix'})`);
  return 0;
}

async function cmdDeployments({ flags }) {
  const list = loadDeployments();
  const chains = loadChains();
  if (flags.json) { say(JSON.stringify(list, null, 2)); return 0; }
  if (!list.length) {
    say('no deployments recorded (tracks/a-build/deployments.json is empty)');
    next('fund a:deploy <chain> <mainnet|testnet>   chains: ' + Object.keys(chains).join(', '));
    return 0;
  }
  for (const d of list) {
    say(`${pad(`${d.chain} ${d.network}`, 20)} ${d.address}  ${d.verified ? 'verified' : 'unverified'}  ${String(d.recorded).slice(0, 10)}`);
    say(`${' '.repeat(21)}${explorerLink(chains, d.chain, d.network, 'address', d.address)}`);
    if (d.tx) say(`${' '.repeat(21)}${explorerLink(chains, d.chain, d.network, 'tx', d.tx)}`);
  }
  const unv = list.find((d) => !d.verified);
  next(unv ? `fund a:verify ${unv.chain} ${unv.network}` : 'fund a:matrix');
  return 0;
}

async function cmdMatrix({ flags }) {
  const rows = matrixRows(trackAApps());
  if (flags.json) { say(JSON.stringify({ rows, nextDeploys: nextDeploys(rows) }, null, 2)); return 0; }
  if (!rows.length) { say('no Track A applications'); next('fund a:init <program>   programs: ' + listProfiles().join(', ')); return 0; }
  say(`${pad('application', 28)}${pad('status', 13)}${pad('due', 7)}${pad('chain', 20)}${pad('mainnet', 12)}${pad('build', 7)}${pad('repo', 5)} verdict`);
  for (const r of rows) {
    const due = r.days === null ? 'roll' : `${Math.round(r.days)}d`;
    const mn = r.mainnet.length ? r.mainnet.join(',') : r.mainnetRequired ? 'NEEDED' : '-';
    const verdict = r.closed ? r.status : r.unblocked ? 'UNBLOCKED' : `BLOCKED: ${r.blockers.map((b) => b.why).join('; ')}`;
    say(`${pad(r.slug, 28)}${pad(r.status, 13)}${pad(due, 7)}${pad(r.chains.join('|') || '-', 20)}${pad(mn, 12)}${pad(r.evidence, 7)}${pad(r.repo ? 'yes' : 'no', 5)} ${verdict}`);
  }
  const nd = nextDeploys(rows);
  if (nd.length) say(`\nhighest-leverage deploy: ${nd[0].chain} mainnet unblocks ${nd[0].slugs.join(', ')}`);
  const open = rows.filter((r) => !r.closed && !r.unblocked).sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  if (open.length) next(`${open[0].blockers[0].next}   (${open[0].slug}, soonest deadline)`);
  else {
    const ready = rows.find((r) => r.unblocked && !r.closed);
    if (ready) next(`fund a:submission ${ready.slug}`);
  }
  return 0;
}

async function cmdVerify({ args, flags }) {
  const [chain, network, addrArg] = args;
  if (!chain || !network) { console.error('usage: a:verify <chain> <network> [address]'); return 2; }
  const chains = loadChains();
  const n = networkInfo(chains, chain, network);
  const envName = typeof flags['rpc-env'] === 'string' ? flags['rpc-env'] : n.rpcEnv;
  const rpcUrl = process.env[envName];
  if (!rpcUrl) { console.error(`set ${envName} to an RPC URL for ${n.chainName} ${network} (env only; never commit it)`); return 2; }
  const list = loadDeployments();
  const targets = list.filter((d) => d.chain === chain && d.network === network && (!addrArg || d.address.toLowerCase() === addrArg.toLowerCase()));
  if (!targets.length) { console.error(`no recorded ${chain} ${network} deployment${addrArg ? ` at ${addrArg}` : ''} — "fund a:record" first`); return 2; }
  let bad = 0;
  let rpcDown = 0;
  for (const d of targets) {
    let r;
    try { r = await verifyDeployment(d, { rpcUrl }); } catch (e) {
      bad++; rpcDown++;
      const why = e.name === 'TimeoutError' ? `no answer in ${RPC_TIMEOUT_MS() / 1000}s` : e.message;
      say(`✗ ${chain} ${network} ${d.address}: RPC from $${envName} failed: ${why} (record left unchanged)`);
      continue;
    }
    for (const note of r.notes) say(`  ! ${note}`);
    if (r.ok) {
      Object.assign(d, { verified: true, verifiedAt: new Date().toISOString(), codeBytes: r.codeBytes, codeSha256: r.codeHash });
      say(`✓ ${chain} ${network} ${d.address}: chain ${r.chainId}, ${r.codeBytes} bytes of code${d.tx ? ', deploy tx ok' : ''}`);
    } else { bad++; d.verified = false; say(`✗ ${chain} ${network} ${d.address}: ${r.problems.join('; ')}`); }
  }
  saveDeployments(list);
  if (rpcDown) next(`check that $${envName} points at a working ${n.chainName} ${network} RPC, then fund a:verify ${chain} ${network}`);
  else next(bad ? `fix the deployment record (edit tracks/a-build/deployments.json), then fund a:verify ${chain} ${network}` : 'fund a:matrix');
  return bad ? 1 : 0;
}

async function cmdDeploy({ args, flags }) {
  const [chain, network] = args;
  if (!chain || !NETWORKS.includes(network)) { console.error('usage: a:deploy <chain> <mainnet|testnet> [--simulate]'); return 2; }
  const chains = loadChains();
  const plan = deployPlan(chains, chain, network);
  const project = paths.project();
  say(`ShelterSplit → ${plan.n.chainName} ${network} (chain ${plan.n.chainId})${plan.n.verify ? '  ! chains.json marks this network verify: true — check it first' : ''}`);
  if (plan.n.notes) say(`  note: ${plan.n.notes}`);
  say('\n1. export (in your shell, never in a file):');
  for (const [k, v] of Object.entries(plan.env)) say(`   export ${k}=${v}`);
  say(`   export ${plan.rpcEnv}=<rpc url>`);
  say(`\n2. simulate (no broadcast):  fund a:deploy ${chain} ${network} --simulate`);
  say(`\n3. a human broadcasts, from ${project}:`);
  say(`   forge script script/DeployShelterSplit.s.sol:DeployShelterSplit --rpc-url "$${plan.rpcEnv}" --account <keystore-name> --broadcast`);
  if (network === 'mainnet') say('   mainnet: only after tests, the AI security review and a human review. Keep balances minimal.');
  if (flags.simulate) {
    const url = process.env[plan.rpcEnv];
    if (!url) { console.error(`\n--simulate needs ${plan.rpcEnv} set`); return 2; }
    const argv = plan.simulateArgs.map((a) => (a === `$${plan.rpcEnv}` ? url : a));
    if (argv.includes('--broadcast')) throw new Error('refusing to broadcast');
    say('\nsimulating…');
    const r = run(forgeBin(), argv, project);
    say((r.out + r.err).split('\n').slice(-25).join('\n'));
    if (r.code !== 0) return 1;
  }
  next(`fund a:record ${chain} ${network} <address> --tx <hash>`);
  return 0;
}

export function listProfiles() {
  const d = paths.programs();
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort() : [];
}

// Patch a freshly scaffolded call.md from a program profile (chain, gates, windows, criteria).
export function applyProfile(dir, profile, { overwrite = {} } = {}) {
  const f = join(dir, 'call.md');
  const { fm, body } = CORE.parseFrontmatter(readFileSync(f, 'utf8'));
  const patch = {};
  for (const k of ['chain', 'mainnet_required', 'build_window_start', 'build_window_end', 'next', 'frame']) if (profile[k] !== undefined) patch[k] = profile[k];
  for (const k of ['program', 'deadline', 'url']) if (profile[k] !== undefined && !overwrite[k]) patch[k] = profile[k];
  let newBody = body;
  if (Array.isArray(profile.criteria) && profile.criteria.length && !/^\|\s*C\d+\s*\|/m.test(body)) {
    const rows = profile.criteria.map(([id, name, weight, quote]) => `| ${id} | ${name} | ${weight || 'not stated'} | "${quote || name}" |`).join('\n');
    newBody = body.replace(/(\| ID \| Criterion \| Weight \| Verbatim quote \|\n\|---\|---\|---\|---\|\n?)/, `$1${rows}\n`);
  }
  writeFileSync(f, CORE.stringifyFrontmatter({ ...fm, ...patch }) + newBody);
  return patch;
}

// `fund new <program-key> --track A` renders the templates before the profile is known, so headings
// and frontmatter would carry the slug instead of the program name. Re-render them with the profile's
// values (the files were created a moment ago by the same templates, so nothing is lost).
function rerenderTemplates(dir, vars) {
  for (const tdir of [CORE.PATHS.templates, join(HERE, 'templates')]) {
    if (!existsSync(tdir)) continue;
    for (const f of readdirSync(tdir)) {
      if (!/\.(md|json|txt|yml|yaml)$/.test(f) || !existsSync(join(dir, f))) continue;
      if (tdir === CORE.PATHS.templates && existsSync(join(HERE, 'templates', f))) continue; // track template wins
      writeFileSync(join(dir, f), CORE.render(readFileSync(join(tdir, f), 'utf8'), vars));
    }
  }
}

// Reuse a sibling application's draft: rename the program, keep only criterion ids that exist in the
// new call.md (if it has a criteria table yet). fund check then lists the criteria left unmapped.
export function copyDraftFrom(fromSlug, toDir, program) {
  const src = join(CORE.appDir(fromSlug), 'draft.md');
  if (!existsSync(src)) throw new Error(`no draft at applications/${fromSlug}/draft.md`);
  const from = CORE.parseFrontmatter(readFileSync(src, 'utf8'));
  const oldProgram = from.fm.program;
  const ids = new Set(CORE.parseCriteria(CORE.parseFrontmatter(readFileSync(join(toDir, 'call.md'), 'utf8')).body).map((c) => c.id));
  const dropped = new Set();
  let body = from.body.replace(/(<!--[^>]*?criterion\s*:\s*)([^|>]*?)(\s*(?:\||-->))/gi, (m, pre, list, post) => {
    if (!ids.size) return m;
    const kept = list.split(',').map((x) => x.trim()).filter((id) => { if (ids.has(id)) return true; if (id) dropped.add(id); return false; });
    return `${pre}${kept.join(', ')}${post}`;
  });
  body = body.replace(/(<!--[^>]*?)criterion\s*:\s*\|\s*/gi, '$1').replace(/<!--\s*criterion\s*:\s*-->/gi, '');
  if (oldProgram && program) body = body.split(String(oldProgram)).join(program);
  writeFileSync(join(toDir, 'draft.md'), CORE.stringifyFrontmatter({ ...from.fm, program: program || oldProgram, version: 0, copied_from: fromSlug }) + body);
  return { dropped: [...dropped], mapped: ids.size > 0 };
}

async function cmdInit({ args, flags }) {
  const key = args[0];
  if (!key) { console.error(`usage: a:init <program> [--slug s] [--from <slug>]   programs: ${listProfiles().join(', ')}`); return 2; }
  const f = join(paths.programs(), `${key}.json`);
  if (!existsSync(f)) { console.error(`no tracks/a-build/programs/${key}.json — copy one of: ${listProfiles().join(', ')}`); return 2; }
  const p = JSON.parse(readFileSync(f, 'utf8'));
  const slug = typeof flags.slug === 'string' ? flags.slug : key;
  if (flags.from !== undefined && (typeof flags.from !== 'string' || !existsSync(join(CORE.appDir(flags.from), 'draft.md')))) {
    console.error(`--from needs an application with a draft.md — known: ${CORE.listApps().join(', ') || 'none'}`); return 2;
  }
  const dir = await CORE.scaffold(slug, { track: TRACK_ID, program: p.program, frame: p.frame, deadline: p.deadline, url: p.url, force: !!flags.force });
  if (slug !== key) CORE.updateFrontmatter(join(dir, 'call.md'), { profile: key });
  applyProfile(dir, p);
  say(`created applications/${slug} from programs/${key}.json (chain: ${[].concat(p.chain || []).join('|') || '-'}, mainnet_required: ${!!p.mainnet_required})`);
  if (typeof flags.from === 'string') {
    const r = copyDraftFrom(flags.from, dir, p.program);
    say(`copied draft.md from applications/${flags.from}${r.mapped ? (r.dropped.length ? ` (dropped criterion ids not in this call: ${r.dropped.join(', ')})` : '') : ' (no criteria table yet: re-map the criterion ids after the extract prompt)'}`);
    next(`fund run ${slug}   (runs every automatable step; fund plan ${slug} shows them)`);
    return 0;
  }
  next(`fund run ${slug}   (if call.md has no criteria yet it asks for the call text in source.md first)`);
  return 0;
}

export default {
  id: TRACK_ID,
  name: 'Build once, submit many',
  defaultFrame: 'payout-rail',
  checks: [checkApp],
  onScaffold: async ({ slug, dir, vars }) => {
    const f = join(paths.programs(), `${slug}.json`);
    if (!existsSync(f)) return;
    const p = JSON.parse(readFileSync(f, 'utf8'));
    // keep values given on the command line; fill the rest from the profile
    const overwrite = { program: !!vars && vars.PROGRAM !== slug, deadline: !!vars && vars.DEADLINE !== 'rolling', url: !!vars?.URL };
    if (vars) rerenderTemplates(dir, {
      ...vars,
      PROGRAM: overwrite.program ? vars.PROGRAM : p.program ?? vars.PROGRAM,
      DEADLINE: overwrite.deadline ? vars.DEADLINE : p.deadline ?? vars.DEADLINE,
      URL: overwrite.url ? vars.URL : p.url ?? vars.URL,
      FRAME: p.frame ?? vars.FRAME,
    });
    applyProfile(dir, p, { overwrite });
  },
  commands: {
    'a:init': { help: '<program> [--slug s] [--from <slug>] — new application from programs/<program>.json', run: cmdInit },
    'a:build': { help: '--slug <slug>|--all — forge build + test, write build-evidence.md', run: cmdBuild },
    'a:deploy': { help: '<chain> <network> [--simulate] — print deploy command (never broadcasts)', run: cmdDeploy },
    'a:record': { help: '<chain> <network> <address> [--tx hash] — add to deployments.json', run: cmdRecord },
    'a:verify': { help: '<chain> <network> [address] — read-only RPC check, RPC URL from env', run: cmdVerify },
    'a:deployments': { help: '[--json] — list deployments with explorer links', run: cmdDeployments },
    'a:matrix': { help: '[--json] — which Track A applications are unblocked', run: cmdMatrix },
    'a:submission': { help: '<slug> [--keep-cites] — render submission.md', run: cmdSubmission },
    ...waveCommands,
  },
};

// exported for tests
export const _internal = { checkApp, cmdBuild, cmdSubmission, cmdRecord, cmdDeployments, cmdMatrix, cmdVerify, cmdDeploy, cmdInit };
