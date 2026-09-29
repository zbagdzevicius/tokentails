// Track A deploy wave: deploy ShelterSplit to every chain that unlocks money, in one human run.
//
//   fund a:wave [--network mainnet] [--chains a,b]  rank chains by the EV they unlock, write wave/deploy-<network>.sh
//   fund a:wave --token EURC                        the same for a second instance paying out in a
//                                                    chains.json splitTokens entry: wave/deploy-<network>-eurc.sh
//   (a human runs the script: it signs with a Foundry keystore, deploys, optionally makes one proof payout)
//   fund a:ingest [--network mainnet]               read Foundry's broadcast files, record + verify every
//                                                    new deployment and proof payout, re-render unblocked submissions
//
// Nothing here signs or broadcasts. The script is written for a person to read and run.

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE } from '../../lib/core.mjs';
// track.mjs imports this file to register the commands, so its helpers are loaded lazily here
// (a static import back would hit the cycle before track.mjs has finished evaluating).
let T;
const A = async () => (T ||= await import('./track.mjs'));

const HERE = dirname(fileURLToPath(import.meta.url));
const say = (s = '') => console.log(s);
const next = (s) => console.log(`next: ${s}`);
const ADDR = /^0x[0-9a-fA-F]{40}$/;

export const wavePaths = {
  dir: () => process.env.FUND_A_WAVE_DIR || join(HERE, 'wave'),
  portfolio: () => process.env.FUND_PORTFOLIO || join(HERE, '..', '..', 'portfolio', 'opportunities.json'),
};

// The token ShelterSplit pays out on this network: a network-specific splitToken (e.g. MUSD on Mezo)
// wins over the chain's USDC. With `symbol` naming a second option from the network's splitTokens
// (e.g. EURC), that one is returned instead; `listed: false` means chains.json has no entry for it.
export function splitToken(n, symbol = null) {
  const def = n.splitToken
    ? { symbol: n.splitToken.symbol, address: n.splitToken.address || null, decimals: n.splitToken.decimals ?? 18 }
    : { symbol: 'USDC', address: n.usdc || null, decimals: n.usdcDecimals ?? 6 };
  const sym = symbol ? String(symbol).toUpperCase() : null;
  if (!sym || sym === def.symbol) return { ...def, alt: false, listed: true, verify: false };
  const t = n.splitTokens?.[sym];
  return { symbol: sym, address: t?.address || null, decimals: t?.decimals ?? 6, alt: true, listed: !!t, verify: !t || !!t.verify };
}

// Which payout token a deployed instance uses, from its constructor's token argument.
export function tokenSymbolOf(n, address) {
  const a = String(address || '').toLowerCase();
  if (!a) return null;
  if (String(splitToken(n).address || '').toLowerCase() === a) return splitToken(n).symbol;
  for (const [sym, t] of Object.entries(n.splitTokens || {})) if (String(t?.address || '').toLowerCase() === a) return sym;
  return null;
}

function portfolioBySlug() {
  const f = wavePaths.portfolio();
  if (!existsSync(f)) return {};
  const o = JSON.parse(readFileSync(f, 'utf8')).opportunities || [];
  return Object.fromEntries(o.map((x) => [x.slug, x]));
}

function profileChains(key) {
  try {
    const p = JSON.parse(readFileSync(join(T.paths.programs(), `${key}.json`), 'utf8'));
    return { chains: [].concat(p.chain ?? []).map((c) => String(c).toLowerCase()), program: p.program || key, deadline: p.deadline };
  } catch { return null; }
}

// Every chain in chains.json with the programs a deploy there serves (program profiles plus open
// Track A applications), their expected value from the portfolio, and what is missing to deploy.
export async function waveRanking({ network = 'mainnet', only = null, env = process.env, token: tokenSym = null } = {}) {
  const { loadChains, loadDeployments, listProfiles, trackAApps, appChains } = await A();
  const chains = loadChains();
  const port = portfolioBySlug();
  const deployed = loadDeployments().filter((d) => d.network === network);
  const serve = {};
  for (const key of listProfiles()) {
    const pc = profileChains(key);
    if (!pc) continue;
    for (const c of pc.chains) (serve[c] ||= new Map()).set(key, { key, program: pc.program, deadline: pc.deadline });
  }
  let apps = [];
  try { apps = trackAApps(CORE).filter((a) => !CORE.CLOSED.has(a.call.fm.status)); } catch { /* no applications yet */ }
  for (const a of apps) for (const c of appChains(a)) (serve[c] ||= new Map()).set(a.slug, { key: a.slug, program: a.call.fm.program || a.slug, deadline: a.call.fm.deadline });

  const rows = [];
  for (const [chain, c] of Object.entries(chains)) {
    if (only && !only.includes(chain)) continue;
    const n = c.networks?.[network];
    if (!n) continue;
    const programs = [...(serve[chain]?.values() || [])].map((p) => {
      const e = port[p.key];
      const ev = e && typeof e.success === 'number' && typeof e.capital_mid_usd === 'number' ? e.success * e.capital_mid_usd : null;
      return { ...p, verdict: e?.verdict || '-', ev };
    });
    const token = splitToken(n, tokenSym);
    // A second token is only offered where chains.json lists it (an explicit --chains still shows the gap).
    if (token.alt && !token.listed && !(only && only.includes(chain))) continue;
    const missing = [];
    if (!token.address) missing.push(`${token.symbol} address (chains.json ${chain}.networks.${network}${token.alt ? `.splitTokens.${token.symbol}` : ''})`);
    if (!env[n.rpcEnv]) missing.push(`$${n.rpcEnv}`);
    // Deployments without a token field predate splitTokens and pay out the default token.
    const done = deployed.filter((d) => d.chain === chain && (d.token || splitToken(n).symbol) === token.symbol);
    rows.push({
      chain, name: c.name, network, chainId: n.chainId, rpcEnv: n.rpcEnv, token, programs,
      ev: programs.reduce((s, p) => s + (p.ev || 0), 0), needsCheck: !!n.verify || token.verify,
      notes: [n.notes, token.alt ? n.splitTokens?.[token.symbol]?.notes : ''].filter(Boolean).join(' '),
      forgeArgs: n.forgeArgs || [], missing, deployed: done.map((d) => d.address),
    });
  }
  return rows.filter((r) => r.programs.length || (only && only.includes(r.chain))).sort((a, b) => b.ev - a.ev || b.programs.length - a.programs.length);
}

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// The bash script a person runs. Preflight per chain (RPC answers with the right chain id, token
// address known, deployer balance shown), then deploy; a chain that fails preflight is skipped, never
// guessed. Owner defaults to the deployer so the same key can register the proof shelter; hand it to a
// multisig later with transferOwnership + acceptOwnership.
export const waveFile = (network, token = null) => `deploy-${network}${token && token.alt ? `-${token.symbol.toLowerCase()}` : ''}.sh`;

export function waveScript(rows, { network = 'mainnet', date = new Date().toISOString().slice(0, 10), project, root = join(HERE, '..', '..'), token = null } = {}) {
  const alt = token && token.alt ? token.symbol : null;
  const lines = [
    '#!/usr/bin/env bash',
    `# Generated by \`fund a:wave${alt ? ` --token ${alt}` : ''}\` on ${date}. Deploys ShelterSplit${alt ? ` (${alt} instance)` : ''} to ${rows.length} ${network} chain(s):`,
    ...rows.map((r) => `#   ${r.chain} (${r.chainId}) ${r.token.symbol} ${r.token.address || 'UNKNOWN'} unlocks: ${r.programs.map((p) => p.key).join(', ') || '-'}`),
    ...(alt ? [
      `# This is a SECOND instance per chain, paying out ${alt}; the USDC instance is separate and unchanged.`,
      '# Foundry keeps one run-latest.json per chain: let the USDC wave finish its a:ingest before running this one.',
    ] : []),
    '# YOU run this. It signs with your Foundry keystore; no key ever lands in a file.',
    '#',
    '# One-time setup:',
    '#   cast wallet import tokentails --interactive      # paste the deployer key once, set a password',
    '#   export FUND_KEYSTORE=tokentails',
    '#   export SHELTERSPLIT_TREASURY=0x...               # receives unallocated share and dust (a Safe is best)',
    ...[...new Set(rows.map((r) => r.rpcEnv))].map((e) => `#   export ${e}=https://...`),
    '# Optional proof payout (one real transfer to one real shelter, the strongest on-chain proof):',
    `#   export PROOF_SHELTER=0x... PROOF_SHELTER_NAME="..." PROOF_AMOUNT=1000000   # 1 ${alt || 'USDC'} (6 decimals)`,
    `# Dry run first: DRY_RUN=1 ./${waveFile(network, token)}   (simulates, broadcasts nothing)`,
    'set -uo pipefail',
    `PROJECT=${q(project)}`,
    `FUND_ROOT=${q(root)}`,
    'cd "$PROJECT" || exit 1',
    ': "${FUND_KEYSTORE:?run: cast wallet import tokentails --interactive; export FUND_KEYSTORE=tokentails}"',
    ': "${SHELTERSPLIT_TREASURY:?export SHELTERSPLIT_TREASURY=<treasury address>}"',
    '# FUND_KEYSTORE is a keystore name in ~/.foundry/keystores, or a path to a keystore file.',
    'if [ -e "$FUND_KEYSTORE" ]; then SIGNER=(--keystore "$FUND_KEYSTORE"); else SIGNER=(--account "$FUND_KEYSTORE"); fi',
    '[ -n "${FUND_KEYSTORE_PASSWORD_FILE:-}" ] && SIGNER+=(--password-file "$FUND_KEYSTORE_PASSWORD_FILE")',
    'DEPLOYER="$(cast wallet address "${SIGNER[@]}")" || exit 1',
    'OWNER="${SHELTERSPLIT_OWNER:-$DEPLOYER}"',
    'BROADCAST="--broadcast"; [ "${DRY_RUN:-0}" = 1 ] && BROADCAST="" && echo "DRY RUN: simulating only"',
    'echo "deployer $DEPLOYER  owner $OWNER  treasury $SHELTERSPLIT_TREASURY"',
    'OK=(); SKIP=()',
    '',
    'deploy() { # chain chainId rpcEnv token [extra forge args...]',
    '  local chain="$1" id="$2" rpcEnv="$3" token="$4"; shift 4',
    '  local url="${!rpcEnv:-}"',
    '  echo; echo "== $chain ($id)"',
    '  [ -n "$url" ] || { echo "skip: set $rpcEnv"; SKIP+=("$chain: no $rpcEnv"); return; }',
    '  [ -n "$token" ] || { echo "skip: token address unknown, fill it in chains.json"; SKIP+=("$chain: no token"); return; }',
    '  local got; got="$(cast chain-id --rpc-url "$url" 2>/dev/null)"',
    '  [ "$got" = "$id" ] || { echo "skip: RPC answered chain ${got:-nothing}, expected $id"; SKIP+=("$chain: wrong RPC"); return; }',
    '  echo "deployer balance: $(cast balance "$DEPLOYER" --rpc-url "$url" --ether 2>/dev/null || echo "?")"',
    '  if SHELTERSPLIT_TOKEN="$token" SHELTERSPLIT_OWNER="$OWNER" EXPECTED_CHAIN_ID="$id" \\',
    '     forge script script/DeployShelterSplit.s.sol:DeployShelterSplit --rpc-url "$url" \\',
    '       "${SIGNER[@]}" --sender "$DEPLOYER" $BROADCAST "$@"; then',
    '    OK+=("$chain")',
    '    if [ -n "${PROOF_SHELTER:-}" ] && [ -n "$BROADCAST" ]; then proof "$chain" "$id" "$url" "$@"; fi',
    '  else SKIP+=("$chain: forge failed"); fi',
    '}',
    '',
    'proof() { # chain chainId url [extra forge args...]',
    '  local chain="$1" id="$2" url="$3"; shift 3',
    '  local split; split="$(node -e \'const j=require(process.argv[1]);const t=j.transactions.find(x=>x.transactionType==="CREATE"&&x.contractName==="ShelterSplit");console.log(t?t.contractAddress:"")\' "$PWD/broadcast/DeployShelterSplit.s.sol/$id/run-latest.json" 2>/dev/null)"',
    '  [ -n "$split" ] || { echo "proof skipped: no ShelterSplit in the $chain broadcast"; return; }',
    '  echo "proof payout on $chain via $split"',
    '  PROOF_SPLIT="$split" EXPECTED_CHAIN_ID="$id" forge script script/ProofDisburse.s.sol:ProofDisburse --rpc-url "$url" \\',
    '    "${SIGNER[@]}" --sender "$DEPLOYER" --broadcast "$@" || SKIP+=("$chain: proof payout failed")',
    '}',
    '',
  ];
  for (const r of rows) {
    if (r.needsCheck) lines.push(`# ${r.chain}: chains.json marks this network verify: true. ${r.notes.slice(0, 240).replace(/\n/g, ' ')}`);
    lines.push(`deploy ${r.chain} ${r.chainId} ${r.rpcEnv} ${q(r.token.address || '')}${r.forgeArgs.length ? ' ' + r.forgeArgs.map(q).join(' ') : ''}`);
  }
  lines.push(
    '',
    'echo; echo "deployed: ${OK[*]:-none}"',
    'for s in "${SKIP[@]:-}"; do [ -n "$s" ] && echo "skipped: $s"; done',
    `[ -n "$BROADCAST" ] && [ \${#OK[@]} -gt 0 ] && (cd "$FUND_ROOT" && node bin/fund.mjs a:ingest --network ${network})`,
    '',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------- ingest

function readRun(project, script, chainId) {
  const f = join(project, 'broadcast', script, String(chainId), 'run-latest.json');
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
}

const txHashOf = (t) => t.hash || t.transactionHash || '';

// Pure over the broadcast folder: what is new compared with deployments.json.
export async function scanBroadcasts({ network = 'mainnet', project } = {}) {
  const { paths, loadChains, loadDeployments } = await A();
  project ||= paths.project();
  const chains = loadChains();
  const list = loadDeployments();
  const found = [];
  for (const [chain, c] of Object.entries(chains)) {
    const n = c.networks?.[network];
    if (!n) continue;
    const dep = readRun(project, 'DeployShelterSplit.s.sol', n.chainId);
    for (const t of dep?.transactions || []) {
      if (t.transactionType !== 'CREATE' || t.contractName !== 'ShelterSplit' || !ADDR.test(t.contractAddress || '')) continue;
      const known = list.find((d) => d.chain === chain && d.network === network && d.address.toLowerCase() === t.contractAddress.toLowerCase());
      const token = tokenSymbolOf(n, Array.isArray(t.arguments) ? t.arguments[0] : null);
      found.push({ kind: 'deploy', chain, network, address: t.contractAddress, tx: txHashOf(t), known: !!known, ...(token ? { token } : {}) });
    }
    const pr = readRun(project, 'ProofDisburse.s.sol', n.chainId);
    for (const t of pr?.transactions || []) {
      const fn = String(t.function || '');
      if (!fn.startsWith('disburse(')) continue;
      const to = t.contractAddress || t.transaction?.to || '';
      const known = list.find((d) => d.chain === chain && d.network === network && d.address.toLowerCase() === String(to).toLowerCase());
      found.push({ kind: 'proof', chain, network, address: to, tx: txHashOf(t), known: !!(known && (known.proofTxs || []).includes(txHashOf(t))) });
    }
  }
  return found;
}

async function cmdIngest({ flags }) {
  const { paths, loadChains, loadDeployments, saveDeployments, networkInfo, explorerLink, recordDeployment, trackAApps, matrixRows, verifyDeployment } = await A();
  const network = typeof flags.network === 'string' ? flags.network : 'mainnet';
  const chains = loadChains();
  const found = await scanBroadcasts({ network });
  const fresh = found.filter((f) => !f.known);
  if (!found.length) { say(`no ShelterSplit broadcasts for ${network} under ${join(paths.project(), 'broadcast')}`); next(`fund a:wave --network ${network}`); return 0; }
  for (const f of fresh.filter((x) => x.kind === 'deploy')) {
    recordDeployment({ chain: f.chain, network, address: f.address, tx: f.tx || undefined, token: f.token, note: 'recorded by a:ingest from the Foundry broadcast' });
    say(`recorded ${f.chain} ${network}${f.token ? ` ${f.token}` : ''} ${f.address}\n  ${explorerLink(chains, f.chain, network, 'address', f.address)}`);
  }
  const list = loadDeployments();
  for (const f of fresh.filter((x) => x.kind === 'proof')) {
    const d = list.find((x) => x.chain === f.chain && x.network === network && x.address.toLowerCase() === String(f.address).toLowerCase());
    if (!d) { say(`! proof payout on ${f.chain} targets ${f.address}, which is not a recorded deployment`); continue; }
    d.proofTxs = [...new Set([...(d.proofTxs || []), f.tx])];
    say(`proof payout on ${f.chain}: ${explorerLink(chains, f.chain, network, 'tx', f.tx) || f.tx}`);
  }
  saveDeployments(list);

  // Verify every unverified deployment on this network whose RPC env is set (read-only calls).
  let bad = 0;
  for (const d of loadDeployments().filter((x) => x.network === network && !x.verified)) {
    const n = networkInfo(chains, d.chain, network);
    const url = process.env[n.rpcEnv];
    if (!url) { say(`  verify ${d.chain} later: set $${n.rpcEnv}, then fund a:verify ${d.chain} ${network}`); continue; }
    try {
      const r = await verifyDeployment(d, { rpcUrl: url });
      const all = loadDeployments();
      const e = all.find((x) => x.chain === d.chain && x.network === d.network && x.address === d.address);
      if (r.ok) Object.assign(e, { verified: true, verifiedAt: new Date().toISOString(), codeBytes: r.codeBytes, codeSha256: r.codeHash });
      saveDeployments(all);
      say(`${r.ok ? '✓' : '✗'} ${d.chain} ${d.address}${r.ok ? '' : `: ${r.problems.join('; ')}`}`);
      if (!r.ok) bad++;
    } catch (e) { bad++; say(`✗ ${d.chain}: RPC failed (${e.message})`); }
  }

  // Re-render the submission of every Track A application a mainnet deploy now unblocks.
  let apps = [];
  try { apps = trackAApps(CORE); } catch { /* none */ }
  const rows = matrixRows(apps);
  const track = T.default;
  const unblocked = rows.filter((r) => r.unblocked && !r.closed);
  for (const r of unblocked) {
    try { await track.commands['a:submission'].run({ args: [r.slug], flags: {} }); } catch (e) { say(`! ${r.slug}: ${e.message}`); }
  }
  const still = rows.filter((r) => !r.unblocked && !r.closed);
  for (const r of still) say(`blocked ${r.slug}: ${r.blockers.map((b) => b.why).join('; ')}`);
  next(unblocked.length ? `fund go   (${unblocked.length} application(s) unblocked: ${unblocked.map((r) => r.slug).join(', ')})` : 'fund a:matrix');
  return bad ? 1 : 0;
}

async function cmdWave({ flags }) {
  const network = typeof flags.network === 'string' ? flags.network : 'mainnet';
  const only = typeof flags.chains === 'string' ? flags.chains.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null;
  const tokenSym = typeof flags.token === 'string' ? flags.token.trim().toUpperCase() : null;
  let rows = await waveRanking({ network, only, token: tokenSym });
  const skipDeployed = !flags.redeploy;
  if (skipDeployed) rows = rows.filter((r) => !r.deployed.length);
  if (!rows.length) { say(`nothing to deploy on ${network}${tokenSym ? ` for ${tokenSym}` : ''}${skipDeployed ? ' (every served chain already has a recorded deployment; --redeploy to include them)' : ''}`); next('fund a:matrix'); return 0; }
  const token = rows[0].token;
  say(`${network} deploy wave${token.alt ? ` (${token.symbol} instance)` : ''} — ranked by the expected value each chain unlocks (portfolio success × capital)\n`);
  for (const r of rows) {
    say(`${r.chain.padEnd(10)} chain ${String(r.chainId).padEnd(8)} ${r.token.symbol.padEnd(5)} EV $${Math.round(r.ev).toLocaleString('en-US').padEnd(7)} ${r.missing.length ? `MISSING ${r.missing.join(', ')}` : 'ready'}${r.needsCheck ? '  (check chains.json notes)' : ''}`);
    for (const p of r.programs) say(`    ${p.key.padEnd(26)} ${String(p.verdict).padEnd(5)} ${p.ev === null ? '' : `EV $${Math.round(p.ev)}`}  ${p.deadline || ''}`);
  }
  const dir = wavePaths.dir();
  mkdirSync(dir, { recursive: true });
  const f = join(dir, waveFile(network, token));
  writeFileSync(f, waveScript(rows, { network, token, project: (await A()).paths.project() }));
  chmodSync(f, 0o755);
  say(`\nwrote ${f}`);
  say('the script signs with your Foundry keystore; read it, run it with DRY_RUN=1 first, then for real');
  next(`${f.replace(process.cwd() + '/', '')}   (then it runs fund a:ingest --network ${network} by itself)`);
  return 0;
}

export const waveCommands = {
  'a:wave': { help: '[--network mainnet|testnet] [--chains a,b] [--token EURC] [--redeploy] — rank chains by EV unlocked, write wave/deploy-<network>[-eurc].sh (a human runs it)', run: cmdWave },
  'a:ingest': { help: '[--network mainnet|testnet] — record + verify deployments and proof payouts from Foundry broadcasts, re-render unblocked submissions', run: cmdIngest },
};
