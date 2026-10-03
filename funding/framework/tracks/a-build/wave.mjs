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
import { spawnSync } from 'node:child_process';
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
  // Public copies of the mainnet deployment list: the client's /shelter-payouts page and the
  // Catnip Heist win-screen total read these. FUND_A_PUBLISH overrides them with a comma-separated
  // list of files, or turns the copies off with 0.
  publish: () => process.env.FUND_A_PUBLISH === '0' ? [] : process.env.FUND_A_PUBLISH ? process.env.FUND_A_PUBLISH.split(',') : [
    join(HERE, '..', '..', '..', '..', 'client', 'public', 'shelter-payouts', 'deployments.json'),
    join(HERE, '..', '..', '..', '..', 'catnip-heist', 'public', 'payouts', 'deployments.json'),
  ],
  portfolio: () => process.env.FUND_PORTFOLIO || join(HERE, '..', '..', 'portfolio', 'opportunities.json'),
};

// The token ShelterSplit pays out on this network: a network-specific splitToken (e.g. MUSD on Mezo)
// wins over the chain's USDC. With `symbol` naming a second option from the network's splitTokens
// (e.g. EURC), that one is returned instead; `listed: false` means chains.json has no entry for it.
// A testnet with no stablecoin at all (Robinhood Chain testnet) lists a `mockToken` instead: the wave
// deploys the test MockUSDC in the same broadcast as ShelterSplit (DeployShelterSplit.s.sol,
// SHELTERSPLIT_MOCK_TOKEN=1) and records the instance with mock: true. Testnet only: waveRanking,
// waveScript and the Solidity script itself all refuse it anywhere else.
export function splitToken(n, symbol = null) {
  if (n.mockToken && !n.usdc && !n.splitToken && !symbol) {
    return { symbol: n.mockToken.symbol || 'mUSDC', address: null, decimals: n.mockToken.decimals ?? 6, alt: false, listed: true, verify: false, mock: true };
  }
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
    if (token.mock && network !== 'testnet') throw new Error(`chains.json ${chain}.networks.${network} lists a mockToken: mock payout tokens are testnet-only`);
    // A second token is only offered where chains.json lists it (an explicit --chains still shows the gap).
    if (token.alt && !token.listed && !(only && only.includes(chain))) continue;
    const missing = [];
    if (!token.address && !token.mock) missing.push(`${token.symbol} address (chains.json ${chain}.networks.${network}${token.alt ? `.splitTokens.${token.symbol}` : ''})`);
    if (!env[n.rpcEnv]) missing.push(`$${n.rpcEnv}`);
    // Deployments without a token field predate splitTokens and pay out the default token.
    const done = deployed.filter((d) => d.chain === chain && (d.token || splitToken(n).symbol) === token.symbol);
    rows.push({
      chain, name: c.name, network, chainId: n.chainId, rpcEnv: n.rpcEnv, token, programs,
      ev: programs.reduce((s, p) => s + (p.ev || 0), 0), needsCheck: !!n.verify || token.verify,
      notes: [n.notes, token.alt ? n.splitTokens?.[token.symbol]?.notes : ''].filter(Boolean).join(' '),
      forgeArgs: n.forgeArgs || [], proofVia: n.proofVia || 'forge', missing, deployed: done.map((d) => d.address),
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
  const mocks = rows.filter((r) => r.token.mock);
  if (mocks.length && network !== 'testnet') throw new Error(`mock payout token on ${network} (${mocks.map((r) => r.chain).join(', ')}): mocks are testnet-only`);
  const lines = [
    '#!/usr/bin/env bash',
    `# Generated by \`fund a:wave${alt ? ` --token ${alt}` : ''}\` on ${date}. Deploys ShelterSplit${alt ? ` (${alt} instance)` : ''} to ${rows.length} ${network} chain(s):`,
    ...rows.map((r) => `#   ${r.chain} (${r.chainId}) ${r.token.symbol} ${r.token.mock ? 'MOCK (deployed by this script, testnet only)' : r.token.address || 'UNKNOWN'} unlocks: ${r.programs.map((p) => p.key).join(', ') || '-'}`),
    ...(mocks.length ? [
      `# MOCK TOKEN (testnet only): ${mocks.map((r) => r.chain).join(', ')} has no stablecoin, so the deploy also creates the test`,
      '# MockUSDC ("Mock USDC", mUSDC, 6 decimals, anyone can mint) and mints PROOF_AMOUNT (default 1000000) to the',
      '# deployer for the proof payout. fund a:ingest records that instance with mock: true. Not a real dollar.',
    ] : []),
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
    ...rows.filter((r) => !alt && r.token.symbol !== 'USDC').map((r) => r.token.mock
      ? `#   on ${r.chain} the same PROOF_AMOUNT is paid in the MOCK ${r.token.symbol} (${r.token.decimals} decimals) this script mints to the deployer`
      : `#   on ${r.chain} the same PROOF_AMOUNT is paid in ${r.token.symbol} (${r.token.decimals} decimals): hold that token there, not USDC`),
    `# Dry run first: DRY_RUN=1 ./${waveFile(network, token)}   (simulates, broadcasts nothing)`,
    'set -uo pipefail',
    'export FOUNDRY_DISABLE_NIGHTLY_WARNING=1   # the Tempo-aware nightly prints a warning that would pollute captured output',
    `PROJECT=${q(project)}`,
    `FUND_ROOT=${q(root)}`,
    'SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"',
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
    '[[ "$SHELTERSPLIT_TREASURY" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "SHELTERSPLIT_TREASURY is not a 0x address"; exit 1; }',
    '# Checked up front: with set -u an unset PROOF_AMOUNT would abort the script after the first deploy.',
    'if [ -n "${PROOF_SHELTER:-}" ]; then',
    '  [[ "$PROOF_SHELTER" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "PROOF_SHELTER is not a 0x address"; exit 1; }',
    '  [[ "${PROOF_AMOUNT:-}" =~ ^[1-9][0-9]*$ ]] || { echo "PROOF_SHELTER is set: export PROOF_AMOUNT in raw token units (1000000 = 1 token at 6 decimals)"; exit 1; }',
    '  [[ "${PROOF_BPS:-10000}" =~ ^[1-9][0-9]*$ ]] && [ "${PROOF_BPS:-10000}" -le 10000 ] || { echo "PROOF_BPS must be 1..10000"; exit 1; }',
    'fi',
    'OK=(); SKIP=(); PRIOR=()   # PRIOR: chains an earlier run of this script already deployed',
    `CAST_PROOF_CHAINS=${q(rows.filter((r) => r.proofVia === 'cast').map((r) => r.chainId).join(' '))}`,
    `MOCK_OK_CHAINS=${q(network === 'testnet' ? mocks.map((r) => r.chainId).join(' ') : '')}   # testnet chains allowed a mock payout token`,
    '',
    'deploy() { # chain chainId rpcEnv token [extra forge args...]',
    '  local chain="$1" id="$2" rpcEnv="$3" token="$4"; shift 4',
    '  local url="${!rpcEnv:-}"',
    '  echo; echo "== $chain ($id)"',
    '  [ -n "$url" ] || { echo "skip: set $rpcEnv"; SKIP+=("$chain: no $rpcEnv"); return; }',
    '  [ -n "$token" ] || { echo "skip: token address unknown, fill it in chains.json"; SKIP+=("$chain: no token"); return; }',
    '  local mockenv=()',
    '  if [ "$token" = MOCK ]; then',
    '    case " $MOCK_OK_CHAINS " in *" $id "*) ;; *) echo "skip: mock token refused on $id (testnet only)"; SKIP+=("$chain: mock refused"); return;; esac',
    '    mockenv=(SHELTERSPLIT_MOCK_TOKEN=1 SHELTERSPLIT_MOCK_MINT="${PROOF_AMOUNT:-1000000}" SHELTERSPLIT_MOCK_MINT_TO="$DEPLOYER")',
    '    echo "MOCK payout token: this deploy also creates MockUSDC (mUSDC) and mints ${PROOF_AMOUNT:-1000000} raw units to the deployer"',
    '  fi',
    '  local got; got="$(cast chain-id --rpc-url "$url" 2>/dev/null)"',
    '  [ "$got" = "$id" ] || { echo "skip: RPC answered chain ${got:-nothing}, expected $id"; SKIP+=("$chain: wrong RPC"); return; }',
    '  echo "deployer balance: $(cast balance "$DEPLOYER" --rpc-url "$url" --ether 2>/dev/null || echo "?")"',
    '  # The proof payout spends PROOF_AMOUNT of the payout token (USDC, or USDG on Robinhood): show it before deploying.',
    '  [ "$token" = MOCK ] || echo "deployer payout-token balance (raw units): $(cast call "$token" "balanceOf(address)(uint256)" "$DEPLOYER" --rpc-url "$url" 2>/dev/null || echo "?")"',
    '  # Re-running this script after a partial failure must not deploy a second instance: skip a chain whose',
    '  # broadcast, written after this script, already holds a mined ShelterSplit for this token.',
    '  local prev="$PWD/broadcast/DeployShelterSplit.s.sol/$id/run-latest.json"',
    '  if [ -n "$BROADCAST" ] && [ -z "${FORCE_REDEPLOY:-}" ] && [ "$prev" -nt "$SELF" ] && node -e \'const j=require(process.argv[1]),T=j.transactions||[],m=T.find(x=>x.transactionType==="CREATE"&&x.contractName==="MockUSDC"),k=(process.argv[2]==="MOCK"?String(m&&m.contractAddress||"none"):process.argv[2]).toLowerCase();const t=T.find(x=>x.transactionType==="CREATE"&&x.contractName==="ShelterSplit"&&String((x.arguments||[])[0]||"").toLowerCase()===k);const r=t&&(j.receipts||[]).find(y=>y.transactionHash===t.hash);process.exit(r&&r.status==="0x1"?0:1)\' "$prev" "$token" 2>/dev/null; then',
    '    echo "skip: already deployed by an earlier run of this script (see $prev); FORCE_REDEPLOY=1 deploys again"; PRIOR+=("$chain")',
    '    # The earlier run may have deployed and then failed the proof payout: retry it unless it already went through.',
    '    if [ -n "${PROOF_SHELTER:-}" ] && ! proof_done "$id"; then maybe_proof "$chain" "$id" "$url" "$@"; fi',
    '    return',
    '  fi',
    '  if SHELTERSPLIT_TOKEN="$token" SHELTERSPLIT_OWNER="$OWNER" EXPECTED_CHAIN_ID="$id" \\',
    '     env ${mockenv[@]+"${mockenv[@]}"} forge script script/DeployShelterSplit.s.sol:DeployShelterSplit --rpc-url "$url" \\',
    '       "${SIGNER[@]}" --sender "$DEPLOYER" $BROADCAST "$@"; then',
    '    OK+=("$chain")',
    '    if [ -n "${PROOF_SHELTER:-}" ] && [ -n "$BROADCAST" ]; then maybe_proof "$chain" "$id" "$url" "$@"; fi',
    '  else SKIP+=("$chain: forge failed"); fi',
    '}',
    '',
    'maybe_proof() { # chain chainId url [extra forge args...]',
    '  # addShelter is onlyOwner: with SHELTERSPLIT_OWNER set to another address the deployer key cannot register the shelter.',
    '  if [ "$(printf %s "$OWNER" | tr A-F a-f)" = "$(printf %s "$DEPLOYER" | tr A-F a-f)" ]; then proof "$@";',
    '  else echo "proof skipped: owner $OWNER is not the deployer; register the shelter and disburse from the owner"; SKIP+=("$1: proof needs the owner key"); fi',
    '}',
    '',
    '# A proof payout written after this script with a mined disburse (the cast-written file has no receipts:',
    '# it is only written once the disburse receipt checked out).',
    'proof_done() { # chainId',
    '  local f="$PWD/broadcast/ProofDisburse.s.sol/$1/run-latest.json"',
    '  [ "$f" -nt "$SELF" ] && node -e \'const j=require(process.argv[1]);const t=(j.transactions||[]).find(x=>String(x.function||"").startsWith("disburse("));if(!t)process.exit(1);if(!Array.isArray(j.receipts))process.exit(0);const r=j.receipts.find(y=>y.transactionHash===t.hash);process.exit(r&&r.status==="0x1"?0:1)\' "$f" 2>/dev/null',
    '}',
    '',
    'proof() { # chain chainId url [extra forge args...]',
    '  local chain="$1" id="$2" url="$3"; shift 3',
    '  local split; split="$(node -e \'const j=require(process.argv[1]);const t=j.transactions.find(x=>x.transactionType==="CREATE"&&x.contractName==="ShelterSplit");console.log(t?t.contractAddress:"")\' "$PWD/broadcast/DeployShelterSplit.s.sol/$id/run-latest.json" 2>/dev/null)"',
    '  [ -n "$split" ] || { echo "proof skipped: no ShelterSplit in the $chain broadcast"; return; }',
    '  echo "proof payout on $chain via $split"',
    '  case " $CAST_PROOF_CHAINS " in *" $id "*) proof_cast "$chain" "$id" "$url" "$split" "$@"; return;; esac',
    '  PROOF_SPLIT="$split" EXPECTED_CHAIN_ID="$id" forge script script/ProofDisburse.s.sol:ProofDisburse --rpc-url "$url" \\',
    '    "${SIGNER[@]}" --sender "$DEPLOYER" --broadcast "$@" || SKIP+=("$chain: proof payout failed")',
    '}',
    '',
    '# Tempo: Foundry\'s local TIP-20 emulation rejects transferFrom inside a script (PolicyForbids), while the',
    '# real node accepts it, so the proof payout runs as three cast sends and records a broadcast-shaped file',
    '# that fund a:ingest reads like a forge broadcast.',
    'proof_cast() { # chain chainId url split [extra forge args...]',
    '  local chain="$1" id="$2" url="$3" split="$4"; shift 4',
    '  local fa=(); while [ $# -gt 0 ]; do case "$1" in --gas-estimate-multiplier) shift 2;; *) fa+=("$1"); shift;; esac; done',
    '  local tok; tok="$(cast call "$split" "token()(address)" --rpc-url "$url")" || { SKIP+=("$chain: proof payout failed (token)"); return; }',
    '  if ! cast call "$split" "getShelter(address)" "$PROOF_SHELTER" --rpc-url "$url" >/dev/null 2>&1; then',
    '    cast send "$split" "addShelter(address,uint16,string)" "$PROOF_SHELTER" "${PROOF_BPS:-10000}" "${PROOF_SHELTER_NAME:-shelter}" --rpc-url "$url" "${SIGNER[@]}" ${fa[@]+"${fa[@]}"} >/dev/null || { SKIP+=("$chain: proof payout failed (addShelter)"); return; }',
    '  fi',
    '  cast send "$tok" "approve(address,uint256)" "$split" "$PROOF_AMOUNT" --rpc-url "$url" "${SIGNER[@]}" ${fa[@]+"${fa[@]}"} >/dev/null || { SKIP+=("$chain: proof payout failed (approve)"); return; }',
    '  local h; h="$(cast send "$split" "disburse(uint256,string)" "$PROOF_AMOUNT" "${PROOF_MEMO:-Token Tails first payout}" --rpc-url "$url" "${SIGNER[@]}" ${fa[@]+"${fa[@]}"} --json | node -e \'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.status!=="0x1"&&r.status!==1&&r.status!=="1")process.exit(1);console.log(r.transactionHash)})\')" || { SKIP+=("$chain: proof payout failed (disburse)"); return; }',
    '  mkdir -p "$PWD/broadcast/ProofDisburse.s.sol/$id"',
    '  printf \'{"transactions":[{"transactionType":"CALL","function":"disburse(uint256,string)","contractAddress":"%s","hash":"%s"}]}\\n\' "$split" "$h" > "$PWD/broadcast/ProofDisburse.s.sol/$id/run-latest.json"',
    '  echo "proof payout tx $h"',
    '}',
    '',
  ];
  for (const r of rows) {
    if (r.needsCheck) lines.push(`# ${r.chain}: chains.json marks this network verify: true. ${r.notes.slice(0, 240).replace(/\n/g, ' ')}`);
    lines.push(`deploy ${r.chain} ${r.chainId} ${r.rpcEnv} ${q(r.token.mock ? 'MOCK' : r.token.address || '')}${r.forgeArgs.length ? ' ' + r.forgeArgs.map(q).join(' ') : ''}   # pays ${r.token.symbol}${r.token.mock ? ' (MOCK, testnet only)' : ''}`);
  }
  lines.push(
    '',
    'echo; echo "deployed: ${OK[*]:-none}"; [ ${#PRIOR[@]} -gt 0 ] && echo "deployed by an earlier run: ${PRIOR[*]}"',
    'for s in "${SKIP[@]:-}"; do [ -n "$s" ] && echo "skipped: $s"; done',
    `[ -n "$BROADCAST" ] && [ $(( \${#OK[@]} + \${#PRIOR[@]} )) -gt 0 ] && (cd "$FUND_ROOT" && node bin/fund.mjs a:ingest --network ${network})`,
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

// Whether a broadcast tx was mined successfully. Forge always writes a receipts array; a failed or
// timed-out run leaves the CREATE in transactions with a status-0 receipt or none at all, and must
// never be recorded as a live deployment. The cast-written proof file has no receipts key: the wave
// script only writes it after checking the disburse receipt's status itself.
function mined(run, t) {
  if (!Array.isArray(run?.receipts)) return 'ok';
  const h = txHashOf(t).toLowerCase();
  const r = run.receipts.find((x) => String(x.transactionHash || '').toLowerCase() === h);
  if (!r) return 'pending';
  return r.status === '0x1' || r.status === 1 || r.status === '1' ? 'ok' : 'failed';
}

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
      const arg0 = Array.isArray(t.arguments) ? t.arguments[0] : null;
      let token = tokenSymbolOf(n, arg0);
      // Testnet mock payout token: the MockUSDC created in the same broadcast (DeployShelterSplit.s.sol).
      const mock = !token && network === 'testnet' && n.mockToken && arg0
        ? (dep.transactions || []).find((m) => m.transactionType === 'CREATE' && m.contractName === 'MockUSDC' && String(m.contractAddress || '').toLowerCase() === String(arg0).toLowerCase())
        : null;
      if (mock) token = n.mockToken.symbol || 'mUSDC';
      found.push({ kind: 'deploy', chain, network, address: t.contractAddress, tx: txHashOf(t), known: !!known, mined: mined(dep, t), ...(token ? { token } : {}), ...(mock ? { mock: true, tokenAddress: mock.contractAddress } : {}) });
    }
    const pr = readRun(project, 'ProofDisburse.s.sol', n.chainId);
    for (const t of pr?.transactions || []) {
      const fn = String(t.function || '');
      if (!fn.startsWith('disburse(')) continue;
      const to = t.contractAddress || t.transaction?.to || '';
      const known = list.find((d) => d.chain === chain && d.network === network && d.address.toLowerCase() === String(to).toLowerCase());
      found.push({ kind: 'proof', chain, network, address: to, tx: txHashOf(t), known: !!(known && (known.proofTxs || []).includes(txHashOf(t))), mined: mined(pr, t) });
    }
  }
  return found;
}

async function cmdIngest({ flags }) {
  const { paths, loadChains, loadDeployments, saveDeployments, networkInfo, explorerLink, recordDeployment, trackAApps, matrixRows, verifyDeployment } = await A();
  const network = typeof flags.network === 'string' ? flags.network : 'mainnet';
  const chains = loadChains();
  const found = await scanBroadcasts({ network });
  if (!found.length) { say(`no ShelterSplit broadcasts for ${network} under ${join(paths.project(), 'broadcast')}`); next(`fund a:wave --network ${network}`); return 0; }
  for (const f of found.filter((x) => !x.known && x.mined !== 'ok')) {
    say(`! ${f.kind === 'deploy' ? 'deploy' : 'proof payout'} on ${f.chain} ${f.tx || f.address} ${f.mined === 'failed' ? 'failed on-chain' : 'has no receipt in the broadcast'}: not recorded${f.mined === 'pending' && f.kind === 'deploy' ? ` (if the explorer shows it succeeded: fund a:record ${f.chain} ${network} ${f.address}${f.tx ? ` --tx ${f.tx}` : ''})` : ''}`);
  }
  const fresh = found.filter((f) => !f.known && f.mined === 'ok');
  for (const f of fresh.filter((x) => x.kind === 'deploy')) {
    recordDeployment({ chain: f.chain, network, address: f.address, tx: f.tx || undefined, token: f.token, note: 'recorded by a:ingest from the Foundry broadcast' });
    if (f.mock) {
      const all = loadDeployments();
      const e = all.find((x) => x.chain === f.chain && x.network === network && x.address.toLowerCase() === f.address.toLowerCase());
      Object.assign(e, { mock: true, tokenAddress: f.tokenAddress, note: `${e.note}; MOCK payout token: test MockUSDC (${f.token}) deployed by the wave, testnet only, not a real dollar` });
      saveDeployments(all);
    }
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

  // Verify the contract source on the explorers: unverified source can disqualify an entry.
  if (process.env.FUND_A_SKIP_SOURCE_VERIFY !== '1') {
    const sv = await verifyAllSources({ network });
    if (sv.bad) bad += sv.bad;
  }

  // Publish the mainnet list to the read-only pages (only public fields; nothing secret is in it).
  if (network === 'mainnet') {
    const pub = loadDeployments().filter((d) => d.network === 'mainnet' && !d.mock)
      .map(({ contract, chain, network: n, chainId, address, tx, token, proofTxs }) => {
        // Any non-USDC instance states its symbol and decimals: a second-token instance (EURC) and a chain
        // whose default payout token is not USDC (USDG on Robinhood, MUSD on Mezo). The pages otherwise
        // label every ERC-20 payout on a chain with that chain's default token, and must never sum it as USDC.
        let alt = null;
        try { const ni = networkInfo(chains, chain, n); const t = splitToken(ni, token || null); if (t.symbol !== 'USDC') alt = t; } catch { /* unknown chain */ }
        return { contract, chain, network: n, chainId, address, ...(tx ? { tx } : {}), ...(token ? { token } : {}), ...(alt ? { symbol: alt.symbol, decimals: alt.decimals } : {}), ...(proofTxs ? { proofTxs } : {}) };
      });
    for (const f of wavePaths.publish()) {
      if (!existsSync(dirname(f))) continue;
      writeFileSync(f, JSON.stringify(pub, null, 2) + '\n');
      say(`published ${pub.length} deployment(s) to ${f.replace(join(HERE, '..', '..', '..', '..') + '/', '')}`);
    }
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

// ---------------------------------------------------------------- source verification

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const bin = (name) => process.env[`FUND_${name.toUpperCase()}_BIN`] || name;
// The Tempo-aware nightly Foundry prints a warning; keep it out of every captured cast/forge output.
const QUIET_ENV = () => ({ ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' });

// Constructor arguments of a recorded deployment: from the deploy broadcast when it is still on disk,
// otherwise read back from the contract (token(), treasury(), owner()). An owner moved to a Safe after
// the deploy would no longer match the creation arguments, so the broadcast is always preferred.
export function constructorArgs(entry, { project, rpcUrl, run = spawnSync } = {}) {
  const f = join(project, 'broadcast', 'DeployShelterSplit.s.sol', String(entry.chainId), 'run-latest.json');
  if (existsSync(f)) {
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      const t = (j.transactions || []).find((x) => x.transactionType === 'CREATE' && String(x.contractAddress).toLowerCase() === entry.address.toLowerCase());
      if (t && Array.isArray(t.arguments) && t.arguments.length === 3 && t.arguments.every((a) => ADDR_RE.test(a))) return { args: t.arguments, from: 'broadcast' };
    } catch { /* fall through */ }
  }
  if (!rpcUrl) return null;
  const read = (sig) => {
    const r = run(bin('cast'), ['call', entry.address, sig, '--rpc-url', rpcUrl], { encoding: 'utf8', env: QUIET_ENV() });
    const v = String(r.stdout || '').trim().split(/\s+/)[0];
    return r.status === 0 && ADDR_RE.test(v) ? v : null;
  };
  const args = ['token()(address)', 'treasury()(address)', 'owner()(address)'].map(read);
  return args.every(Boolean) ? { args, from: 'chain (owner may differ from the creation value)' } : null;
}

const VERIFIED_RE = /(successfully verified|Pass - Verified|exact_match|already (fully |partially )?verified)/i;

// Submits ShelterSplit's source to the network's explorer verifier with forge verify-contract --watch.
// Read-only towards the chain; it only uploads public source. Returns {ok, detail, skipped}.
export function verifySource(entry, n, { project, rpcUrl, run = spawnSync } = {}) {
  const v = n.verifier;
  if (!v || !v.type || !v.url) return { ok: false, skipped: true, detail: `no verifier configured for ${entry.chain} ${entry.network} in chains.json` };
  const ca = constructorArgs(entry, { project, rpcUrl, run });
  if (!ca) return { ok: false, detail: 'constructor arguments unknown (no deploy broadcast and no RPC)' };
  const enc = run(bin('cast'), ['abi-encode', 'constructor(address,address,address)', ...ca.args], { encoding: 'utf8', env: QUIET_ENV() });
  const encoded = String(enc.stdout || '').trim();
  if (enc.status !== 0 || !/^0x[0-9a-fA-F]*$/.test(encoded)) return { ok: false, detail: `cast abi-encode failed: ${String(enc.stderr || '').trim().slice(0, 200)}` };
  const argv = ['verify-contract', entry.address, 'src/ShelterSplit.sol:ShelterSplit', '--chain-id', String(entry.chainId),
    '--constructor-args', encoded, '--verifier', v.type, '--verifier-url', v.url, '--watch'];
  if (v.apiKey) argv.push('--etherscan-api-key', v.apiKey);
  const r = run(bin('forge'), argv, { cwd: project, encoding: 'utf8', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' }, timeout: 300000 });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (VERIFIED_RE.test(out)) return { ok: true, detail: `${v.type} ${(out.match(VERIFIED_RE) || [''])[0]}`, argsFrom: ca.from };
  return { ok: false, detail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
}

// Verifies the source of every recorded deployment (optionally one chain/network) that is not yet marked.
export async function verifyAllSources({ chain, network, force = false, log = say } = {}) {
  const { paths, loadChains, loadDeployments, saveDeployments, networkInfo, explorerLink } = await A();
  const chains = loadChains();
  let bad = 0, done = 0, skipped = 0;
  for (const d of loadDeployments()) {
    if ((chain && d.chain !== chain) || (network && d.network !== network)) continue;
    if (d.sourceVerified && !force) continue;
    let n; try { n = networkInfo(chains, d.chain, d.network); } catch { continue; }
    const r = verifySource(d, n, { project: paths.project(), rpcUrl: process.env[n.rpcEnv] });
    if (r.skipped) { skipped++; log(`  source ${d.chain} ${d.network}: skipped (${r.detail})`); continue; }
    const all = loadDeployments();
    const e = all.find((x) => x.chain === d.chain && x.network === d.network && x.address === d.address);
    if (r.ok) {
      Object.assign(e, { sourceVerified: true, sourceVerifiedAt: new Date().toISOString(), sourceVerifier: n.verifier.type });
      done++; log(`✓ source verified: ${d.chain} ${d.network} ${d.address} (${r.detail}) ${explorerLink(chains, d.chain, d.network, 'address', d.address)}`);
    } else { bad++; log(`✗ source NOT verified: ${d.chain} ${d.network} ${d.address}: ${r.detail}`); }
    saveDeployments(all);
  }
  return { bad, done, skipped };
}

async function cmdVerifySource({ args, flags }) {
  const [chain, network] = args;
  const r = await verifyAllSources({ chain, network: network || (typeof flags.network === 'string' ? flags.network : undefined), force: !!flags.force });
  if (!r.done && !r.bad && !r.skipped) say('nothing to verify (every matching deployment is already source-verified; --force re-submits)');
  next(r.bad ? 'fix the failure above and re-run fund a:verify-source' : 'fund a:matrix');
  return r.bad ? 1 : 0;
}

export const waveCommands = {
  'a:wave': { help: '[--network mainnet|testnet] [--chains a,b] [--token EURC] [--redeploy] — rank chains by EV unlocked, write wave/deploy-<network>[-eurc].sh (a human runs it)', run: cmdWave },
  'a:verify-source': { help: '[chain] [network] [--force] — verify ShelterSplit source code on each explorer (Blockscout, Sourcify, Routescan) for recorded deployments', run: cmdVerifySource },
  'a:ingest': { help: '[--network mainnet|testnet] — record + verify deployments and proof payouts from Foundry broadcasts, re-render unblocked submissions', run: cmdIngest },
};
