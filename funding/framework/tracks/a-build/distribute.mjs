// One-wallet funding: the person sends everything to the deployer, a script does the rest.
//
//   fund a:distribute --network mainnet|testnet     write wave/distribute-<network>.sh from funding-plan.json:
//                                                    tops up donatehot (treat float + gas) and the x402 agent
//                                                    (demo amount + gas) from the deployer keystore, per chain
//     [--plan topup | PLAN=topup]                   use the plan's profiles.topup instead (one week of treats,
//                                                    the Base agent); writes wave/distribute-<network>-topup.sh
//   fund a:mainnet-plan --network mainnet|testnet   write wave/<network>-all.sh, the run-order wrapper:
//                                                    balance check -> ShelterSplit (USDC, EURC) -> DonateRouters
//                                                    -> a:ingest -> a:verify + a:verify-source -> distribute
//                                                    -> fund fill -> files to commit
//   fund a:pending --network <n> [--chains a,b]     what the wrapper still has to deploy, per chain (JSON)
//
// Nothing here signs or broadcasts. The scripts are written for a person to read and run; the mainnet
// ones refuse to start without CONFIRM_MAINNET=yes and refuse to run inside an AI agent session.
// `node distribute.mjs math <op> ...` is the BigInt helper the generated scripts call (tested here).

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const say = (s = '') => console.log(s);
const ADDR = /^0x[0-9a-fA-F]{40}$/;
let T;
const A = async () => (T ||= await import('./track.mjs'));

export const MAINNET_CHAIN_IDS = [5042, 4217, 42161, 43114, 8453, 4663, 143];
export const TESTNET_CHAIN_IDS = [5042002, 42431, 421614, 84532, 43113, 46630, 10143];
export const NETWORK_IDS = { mainnet: MAINNET_CHAIN_IDS, testnet: TESTNET_CHAIN_IDS };
/** Plan roles that receive transfers, and their wallets.public.json label (testnet- prefixed on testnet). */
export const ROLES = { donatehot: 'donate-hot-wallet', agent: 'agent-wallet' };

export const distPaths = {
  plan: () => process.env.FUND_A_FUNDING_PLAN || join(HERE, 'funding-plan.json'),
  wallets: () => process.env.FUND_A_WALLETS || join(HERE, 'wallets.public.json'),
  chains: () => process.env.FUND_A_CHAINS || join(HERE, 'chains.json'),
  deployments: () => process.env.FUND_A_DEPLOYMENTS || join(HERE, 'deployments.json'),
  routers: () => process.env.FUND_A_ROUTER_DEPLOYMENTS || join(HERE, 'router-deployments.json'),
  dir: () => process.env.FUND_A_WAVE_DIR || join(HERE, 'wave'),
  project: () => process.env.FUND_A_PROJECT || join(HERE, 'shelter-split'),
  root: () => join(HERE, '..', '..'),
};

const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback);

// ---------------------------------------------------------------- amounts

/** "1.5" with 6 decimals -> "1500000". Plain decimals only; never a float. */
export function parseUnits(value, decimals) {
  const s = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`amount "${value}" is not a plain decimal`);
  const [i, f = ''] = s.split('.');
  if (f.length > decimals) throw new Error(`amount "${value}" has more than ${decimals} decimals`);
  return (BigInt(i) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}

export function formatUnits(raw, decimals) {
  const v = BigInt(raw);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const frac = (a % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${a / base}${frac ? `.${frac}` : ''}`;
}

/** Default tolerance: a recipient within 1% of its target counts as funded (no dust top-ups that cost more gas than they add). */
export const TOPUP_TOLERANCE_BPS = 100;

/** What to send so `balance` reaches `target`; 0 when it already holds the target (within tolBps). */
export const topUp = (target, balance, tolBps = TOPUP_TOLERANCE_BPS) => {
  const t = BigInt(target), b = BigInt(balance), tol = BigInt(tolBps);
  if (b * 10000n >= t * (10000n - tol)) return '0';
  return (t - b).toString();
};

/**
 * The per-asset balance check for one chain. `recipient` is aligned with c.rows (raw balances),
 * `deployer` maps asset key -> raw balance. Each transfer that sends anything adds gasPerTransfer to
 * the gas asset; withReserve adds the deployer's own reserve (the wrapper's check before deploying).
 * Returns rows { asset, symbol, decimals, sends, need, have, short }.
 */
export function shortfallTable(c, { recipient = [], deployer = {}, withReserve = false, tolBps = TOPUP_TOLERANCE_BPS } = {}) {
  return c.assets.map((a) => {
    let need = 0n, sends = 0;
    c.rows.forEach((r, i) => {
      if (r.asset !== a.key) return;
      const t = BigInt(topUp(r.target, recipient[i] ?? '0', tolBps));
      if (t > 0n) { need += t; sends++; }
    });
    const gasSends = c.rows.filter((r, i) => BigInt(topUp(r.target, recipient[i] ?? '0', tolBps)) > 0n).length;
    if (a.key === c.gas.asset) need += BigInt(c.gas.perTransfer) * BigInt(gasSends);
    if (withReserve) need += BigInt(a.reserve || '0');
    const have = BigInt(deployer[a.key] ?? '0');
    return { asset: a.key, symbol: a.symbol, decimals: a.decimals, sends, need: need.toString(), have: have.toString(), short: (need > have ? need - have : 0n).toString() };
  });
}

// ---------------------------------------------------------------- plan

/** The recipient address for a plan role on a network, from wallets.public.json only. */
export function walletFor(wallets, role, network) {
  const label = ROLES[role];
  if (!label) return { problem: `unknown role "${role}" (expected ${Object.keys(ROLES).join(', ')} or deployer)` };
  const full = network === 'testnet' ? `testnet-${label}` : label;
  const w = (wallets || []).find((x) => x.label === full);
  if (!w) return { problem: `wallets.public.json has no "${full}" entry` };
  if (!ADDR.test(w.address || '')) return { problem: `wallets.public.json "${full}" has no 0x address` };
  return { address: w.address, chains: (w.chains || []).map((c) => String(c).toLowerCase()), label: full };
}

export function deployerFor(wallets, network) {
  const w = (wallets || []).find((x) => x.label === (network === 'testnet' ? 'testnet-deployer' : 'deployer'));
  return ADDR.test(w?.address || '') ? w.address : null;
}

/** A plan token symbol on a chain: the plan's own tokens map, then chains.json (USDC, splitToken, splitTokens). */
export function resolveToken(n, pc, symbol) {
  const own = pc?.tokens?.[symbol];
  if (own) return ADDR.test(own.address || '') ? { symbol, address: own.address, decimals: own.decimals ?? 6 } : null;
  const sym = String(symbol).toUpperCase();
  if (sym === 'USDC' && n.usdc) return { symbol, address: n.usdc, decimals: n.usdcDecimals ?? 6 };
  if (n.splitToken && String(n.splitToken.symbol).toUpperCase() === sym && n.splitToken.address) return { symbol, address: n.splitToken.address, decimals: n.splitToken.decimals ?? 18 };
  const t = n.splitTokens?.[sym];
  if (t?.address) return { symbol, address: t.address, decimals: t.decimals ?? 6 };
  return null;
}

const castArgsOf = (n) => {
  const out = [];
  const a = n.forgeArgs || [];
  for (let i = 0; i < a.length; i++) { if (a[i] === '--gas-estimate-multiplier') { i++; continue; } out.push(a[i]); }
  return out;
};

/**
 * Validates funding-plan.json for one network against chains.json and wallets.public.json.
 * Returns { chains: [...resolved], deploy, problems }. A chain with a problem is left out.
 */
export function resolvePlan({ plan, chains, wallets, network, only = null, profile = null }) {
  const problems = [];
  let block = plan?.[network];
  if (!block || typeof block !== 'object') return { chains: [], deploy: null, problems: [`funding-plan.json has no "${network}" section`] };
  if (profile) {
    const over = block.profiles?.[profile]?.chains;
    if (!over || typeof over !== 'object') return { chains: [], deploy: null, problems: [`funding-plan.json has no "${network}.profiles.${profile}" section`] };
    block = withProfile(block, over);
  }
  const allowed = NETWORK_IDS[network];
  if (!allowed) return { chains: [], deploy: null, problems: [`unknown network "${network}" (mainnet or testnet)`] };
  const deployer = deployerFor(wallets, network);
  if (!deployer) problems.push(`wallets.public.json has no ${network === 'testnet' ? 'testnet-' : ''}deployer address`);
  const out = [];
  for (const [chain, pc] of Object.entries(block.chains || {})) {
    if (only && !only.includes(chain)) continue;
    const at = `${network}.${chain}`;
    const n = chains?.[chain]?.networks?.[network];
    if (!n) { problems.push(`${at}: not in chains.json`); continue; }
    if (!allowed.includes(Number(n.chainId))) { problems.push(`${at}: chain id ${n.chainId} is not a ${network} chain id (${allowed.join(', ')})`); continue; }
    const local = [];
    const nativeSymbol = pc.nativeSymbol ?? null;
    const assets = new Map();
    const asset = (key, symbol, decimals) => { if (!assets.has(key)) assets.set(key, { key, symbol, decimals, reserve: '0' }); return assets.get(key); };
    const tokenAsset = (sym) => {
      if (nativeSymbol && String(sym).toUpperCase() === String(nativeSymbol).toUpperCase()) { local.push(`${at}: ${sym} is the native coin here (one balance): fund it as "native"`); return null; }
      const t = resolveToken(n, pc, sym);
      if (!t) { local.push(`${at}: token ${sym} has no address (plan tokens map or chains.json)`); return null; }
      return asset(t.address.toLowerCase(), t.symbol, t.decimals);
    };
    const amount = (v, d, what) => { try { return parseUnits(v, d); } catch (e) { local.push(`${at}: ${what}: ${e.message}`); return null; } };
    // gas: what each transfer costs the deployer, in the native coin or (Tempo) a fee token
    let gas = { asset: 'native', perTransfer: '0' };
    if (pc.gasAsset && pc.gasAsset !== 'native') {
      const g = tokenAsset(pc.gasAsset);
      if (g) gas = { asset: g.key, perTransfer: amount(pc.gasPerTransfer ?? '0', g.decimals, 'gasPerTransfer') ?? '0' };
    } else if (nativeSymbol) {
      asset('native', nativeSymbol, 18);
      gas = { asset: 'native', perTransfer: amount(pc.gasPerTransfer ?? '0', 18, 'gasPerTransfer') ?? '0' };
    }
    const rows = [];
    for (const [role, spec] of Object.entries(pc)) {
      if (['nativeSymbol', 'gasPerTransfer', 'gasAsset', 'tokens', 'baseFeeCapGwei'].includes(role)) continue;
      if (!spec || typeof spec !== 'object') { local.push(`${at}.${role}: must be an object`); continue; }
      if (!String(spec.reason || '').trim()) local.push(`${at}.${role}: give a short reason`);
      if (role === 'deployer') {
        if (spec.native !== undefined) {
          if (!nativeSymbol) local.push(`${at}.deployer: no native coin on this chain`);
          else { const v = amount(spec.native, 18, 'deployer.native'); if (v) asset('native', nativeSymbol, 18).reserve = v; }
        }
        for (const [sym, v] of Object.entries(spec.tokens || {})) { const a = tokenAsset(sym); const r = a && amount(v, a.decimals, `deployer.${sym}`); if (r) a.reserve = r; }
        continue;
      }
      const w = walletFor(wallets, role, network);
      if (w.problem) { local.push(`${at}.${role}: ${w.problem}`); continue; }
      if (!w.chains.includes(chain)) { local.push(`${at}.${role}: ${w.label} does not list chain "${chain}" in wallets.public.json`); continue; }
      if (deployer && w.address.toLowerCase() === deployer.toLowerCase()) { local.push(`${at}.${role}: recipient is the deployer itself`); continue; }
      const reason = String(spec.reason || '').trim();
      if (spec.native !== undefined) {
        if (!nativeSymbol) local.push(`${at}.${role}: no native coin on this chain (use tokens)`);
        else { const v = amount(spec.native, 18, `${role}.native`); if (v) rows.push({ role, to: w.address, asset: 'native', symbol: nativeSymbol, decimals: 18, target: v, amount: String(spec.native), reason }); asset('native', nativeSymbol, 18); }
      }
      for (const [sym, v] of Object.entries(spec.tokens || {})) {
        const a = tokenAsset(sym);
        const raw = a && amount(v, a.decimals, `${role}.${sym}`);
        if (raw) rows.push({ role, to: w.address, asset: a.key, tokenAddress: resolveToken(n, pc, sym).address, symbol: a.symbol, decimals: a.decimals, target: raw, amount: String(v), reason });
      }
    }
    // The highest base fee the deployer reserve covers: forge sets maxFee at about 2x the base fee and
    // the node wants gasLimit x maxFee up front, so a fee spike can refuse the deploy the reserve was sized for.
    let baseFeeCap = '';
    if (pc.baseFeeCapGwei !== undefined) { const v = amount(String(pc.baseFeeCapGwei), 9, 'baseFeeCapGwei'); if (v) baseFeeCap = v; }
    if (local.length) { problems.push(...local); continue; }
    out.push({
      chain, chainId: Number(n.chainId), rpcEnv: n.rpcEnv, publicRpc: n.publicRpc || '', nativeSymbol,
      castArgs: castArgsOf(n), gas, assets: [...assets.values()], rows, baseFeeCap,
    });
  }
  return { chains: out, deploy: block.deploy || null, deployer, problems };
}

/** A profile replaces whole roles (deployer, donatehot, agent) per chain; chain settings and other roles stay. */
export function withProfile(block, over) {
  const chains = {};
  for (const [chain, pc] of Object.entries(block.chains || {})) chains[chain] = { ...pc, ...(over[chain] || {}) };
  return { ...block, chains };
}

export function loadResolved(network, only = null, profile = null) {
  const chains = readJson(distPaths.chains(), {});
  const plan = readJson(distPaths.plan(), null);
  if (!plan) return { chains: [], problems: [`no funding plan at ${distPaths.plan()}`] };
  const wallets = readJson(distPaths.wallets(), {}).wallets || [];
  return { ...resolvePlan({ plan, chains, wallets, network, only, profile }), wallets, chainsJson: chains };
}

// ---------------------------------------------------------------- shell

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** The guard every mainnet script starts with: an explicit human confirmation, never an AI session. */
export function mainnetGuard(network, what) {
  if (network !== 'mainnet') return [];
  return [
    '# MAINNET GUARD: real money. A person runs this, never an AI agent.',
    'if [ -n "${CLAUDECODE:-}${CLAUDE_CODE_ENTRYPOINT:-}${AI_AGENT:-}" ]; then',
    `  echo "refused: ${what} moves real money on mainnet and must not be run by an AI agent session (CLAUDECODE/AI_AGENT is set)"; exit 3`,
    'fi',
    'if [ "${CONFIRM_MAINNET:-}" != yes ]; then',
    `  echo "refused: ${what} touches MAINNET. Re-run with CONFIRM_MAINNET=yes (and DRY_RUN=1 first)."; exit 3`,
    'fi',
  ];
}

/** The network guard: a testnet script refuses a mainnet chain id and the other way round. */
const idGuard = (network) => `ALLOWED_IDS=${q(` ${NETWORK_IDS[network].join(' ')} `)}   # ${network} chain ids only`;

const signerLines = (expected) => [
  'export FOUNDRY_DISABLE_NIGHTLY_WARNING=1',
  'CAST="${CAST_BIN:-cast}"',
  'FUND_KEYSTORE="${FUND_KEYSTORE:-tokentails}"',
  '# FUND_KEYSTORE is a keystore name in ~/.foundry/keystores, or a path to a keystore file. The password',
  '# file is passed by path only (FUND_KEYSTORE_PASSWORD_FILE); without it cast asks for the password.',
  'if [ -e "$FUND_KEYSTORE" ]; then SIGNER=(--keystore "$FUND_KEYSTORE"); else SIGNER=(--account "$FUND_KEYSTORE"); fi',
  '[ -n "${FUND_KEYSTORE_PASSWORD_FILE:-}" ] && SIGNER+=(--password-file "$FUND_KEYSTORE_PASSWORD_FILE")',
  'DEPLOYER="$($CAST wallet address "${SIGNER[@]}")" || { echo "cannot read the deployer address from keystore $FUND_KEYSTORE"; exit 1; }',
  `EXPECTED_DEPLOYER=${q(expected || '')}`,
  'lc() { printf %s "$1" | tr A-F a-f; }',
  'if [ -n "$EXPECTED_DEPLOYER" ] && [ "$(lc "$DEPLOYER")" != "$(lc "$EXPECTED_DEPLOYER")" ]; then',
  '  echo "refused: keystore $FUND_KEYSTORE is $DEPLOYER, wallets.public.json names the deployer $EXPECTED_DEPLOYER"; exit 1',
  'fi',
];

export const distributeFile = (network, profile = null) => `distribute-${network}${profile ? `-${profile}` : ''}.sh`;
export const runAllFile = (network) => `${network}-all.sh`;

/** wave/distribute-<network>.sh: per chain, top up each recipient from the deployer to its target. */
export function distributeScript(resolved, { network, profile = null, date = new Date().toISOString().slice(0, 10), mathPath = join(HERE, 'distribute.mjs'), deployer = resolved.deployer } = {}) {
  if (resolved.problems?.length) throw new Error(`funding plan problems:\n  ${resolved.problems.join('\n  ')}`);
  const allow = [...new Set(resolved.chains.flatMap((c) => c.rows.map((r) => r.to.toLowerCase())))];
  for (const c of resolved.chains) if (!NETWORK_IDS[network].includes(c.chainId)) throw new Error(`${c.chain}: chain id ${c.chainId} is not ${network}`);
  const L = [
    '#!/usr/bin/env bash',
    `# Generated by \`fund a:distribute --network ${network}${profile ? ` --plan ${profile}` : ''}\` on ${date} from tracks/a-build/funding-plan.json${profile ? ` (${network}.profiles.${profile})` : ''}.`,
    `# Tops up the hot wallet (donatehot) and the x402 agent FROM THE DEPLOYER, per ${network} chain:`,
    ...resolved.chains.flatMap((c) => c.rows.map((r) => `#   ${c.chain.padEnd(10)} ${r.role.padEnd(9)} ${r.to}  ${r.amount} ${r.symbol}${r.asset === 'native' ? ' (native)' : ''}: ${r.reason}`)),
    '#',
    '# Only these recipients (wallets.public.json) can receive; anything else is refused before signing.',
    '# Top-up semantics: a recipient already holding its target (within TOPUP_TOLERANCE_BPS, default 100 = 1%)',
    '# is skipped, so a rerun is safe; otherwise it receives exactly target - balance.',
    '#   DRY_RUN=1      print every transfer (the exact cast command), send nothing',
    '#   CHECK_ONLY=1   print the per-chain balance table and stop (exit 1 on any shortfall)',
    "#   WITH_RESERVE=1 also count the deployer's own deploy reserve (funding-plan.json \"deployer\")",
    '#   CHAINS=a,b     only these chains          FAILED_FILE=f  write the chains that failed or fell short',
    'set -uo pipefail',
    ...mainnetGuard(network, distributeFile(network, profile)),
    `MATH=(node ${q(mathPath)} math)`,
    ...signerLines(deployer),
    idGuard(network),
    `ALLOW=${q(` ${allow.join(' ')} `)}`,
    'DRY="${DRY_RUN:-0}"; [ "$DRY" = 1 ] && echo "DRY RUN: nothing is sent"',
    'echo "deployer $DEPLOYER"',
    'FAILED=(); SENT=(); SKIPPED=()',
    `TOL="\${TOPUP_TOLERANCE_BPS:-${TOPUP_TOLERANCE_BPS}}"`,
    'want() { [ -z "${CHAINS:-}" ] && return 0; case ",$CHAINS," in *",$1,"*) return 0;; esac; return 1; }',
    'failed() { local x; for x in "${FAILED[@]:-}"; do [ "$x" = "$1" ] && return 0; done; return 1; }',
    'fail() { failed "$1" || FAILED+=("$1"); echo "  ✗ $1: $2"; }',
    '# bal url asset who: raw units (asset "native" or a token address); empty when the RPC fails',
    'bal() {',
    '  local out',
    '  if [ "$2" = native ]; then out="$($CAST balance "$3" --rpc-url "$1" 2>/dev/null)" || return 1',
    '  else out="$($CAST call "$2" "balanceOf(address)(uint256)" "$3" --rpc-url "$1" 2>/dev/null)" || return 1; fi',
    '  out="${out%% *}"; [[ "$out" =~ ^[0-9]+$ ]] || return 1; printf %s "$out"',
    '}',
    '',
    '# chain_setup sets URL for a chain and checks the RPC answers with the expected chain id.',
    'chain_setup() { # chain id rpcEnv publicRpc',
    '  local got',
    '  case "$ALLOWED_IDS" in *" $2 "*) ;; *) fail "$1" "chain id $2 is not allowed in this script"; return 1;; esac',
    '  URL="${!3:-$4}"',
    '  [ -n "$URL" ] || { fail "$1" "set $3"; return 1; }',
    '  got="$($CAST chain-id --rpc-url "$URL" 2>/dev/null)"',
    '  [ "$got" = "$2" ] || { fail "$1" "RPC answered chain ${got:-nothing}, expected $2"; return 1; }',
    '}',
    '',
    '# check chain: prints the balance table; returns 1 on a shortfall or an unreadable balance.',
    '# ROWS entries: role|to|asset|symbol|decimals|target   ASSETS entries: asset|symbol|decimals|reserve',
    'check() {',
    '  local chain="$1" a sym dec res need sends have short r role to asset rs rd target b t bad=0',
    '  for a in "${ASSETS[@]}"; do',
    '    IFS="|" read -r a sym dec res <<<"$a"',
    '    need=0; sends=0',
    '    for r in "${ROWS[@]}"; do',
    '      IFS="|" read -r role to asset rs rd target <<<"$r"',
    '      b="$(bal "$URL" "$asset" "$to")" || { fail "$chain" "cannot read the $rs balance of $role"; return 1; }',
    '      t="$("${MATH[@]}" topup "$target" "$b" "$TOL")"',
    '      if [ "$t" != 0 ]; then',
    '        [ "$asset" = "$a" ] && need="$("${MATH[@]}" add "$need" "$t")"',
    '        [ "$GAS_ASSET" = "$a" ] && need="$("${MATH[@]}" add "$need" "$GAS_PER")"',
    '        [ "$asset" = "$a" ] && sends=$((sends + 1))',
    '      fi',
    '    done',
    '    [ "${WITH_RESERVE:-0}" = 1 ] && need="$("${MATH[@]}" add "$need" "$res")"',
    '    have="$(bal "$URL" "$a" "$DEPLOYER")" || { fail "$chain" "cannot read the deployer $sym balance"; return 1; }',
    '    short="$("${MATH[@]}" sub "$need" "$have")"',
    '    printf "  %-10s %-8s sends %-2s need %-22s have %-22s %s\\n" "$chain" "$sym" "$sends" "$("${MATH[@]}" fmt "$need" "$dec")" "$("${MATH[@]}" fmt "$have" "$dec")" "$([ "$short" = 0 ] && echo ok || echo "SHORT $("${MATH[@]}" fmt "$short" "$dec") $sym")"',
    '    [ "$short" = 0 ] || bad=1',
    '  done',
    '  [ $bad = 0 ] || { fail "$chain" "the deployer is short (table above): send it more, then rerun"; return 1; }',
    '  # The deploy reserve assumes a base fee; forge asks for about 2x it up front. Refuse above the cap.',
    '  if [ "${WITH_RESERVE:-0}" = 1 ] && [ -n "${BASEFEE_CAP:-}" ]; then',
    '    local bf; bf="$($CAST base-fee --rpc-url "$URL" 2>/dev/null)"; bf="${bf%% *}"',
    '    if ! [[ "$bf" =~ ^[0-9]+$ ]]; then fail "$chain" "cannot read the base fee"; return 1; fi',
    '    echo "  $chain base fee $("${MATH[@]}" fmt "$bf" 9) gwei (the deploy reserve covers up to $("${MATH[@]}" fmt "$BASEFEE_CAP" 9) gwei)"',
    '    [ "$("${MATH[@]}" sub "$bf" "$BASEFEE_CAP")" = 0 ] || { fail "$chain" "base fee is above what the deploy reserve covers: wait for a lower fee, or send the deployer more and raise baseFeeCapGwei"; return 1; }',
    '  fi',
    '}',
    '',
    '# send chain: tops up every row, re-reading each balance right before the transfer.',
    'send() {',
    '  local chain="$1" r role to asset sym dec target b t out h',
    '  for r in "${ROWS[@]}"; do',
    '    IFS="|" read -r role to asset sym dec target <<<"$r"',
    '    case "$ALLOW" in *" $(lc "$to") "*) ;; *) fail "$chain" "refused: $to is not an allowed recipient"; return 1;; esac',
    '    [ "$(lc "$to")" != "$(lc "$DEPLOYER")" ] || { fail "$chain" "refused: recipient is the deployer"; return 1; }',
    '    b="$(bal "$URL" "$asset" "$to")" || { fail "$chain" "cannot read the $sym balance of $role"; return 1; }',
    '    t="$("${MATH[@]}" topup "$target" "$b" "$TOL")"',
    '    if [ "$t" = 0 ]; then echo "  skip $chain $role $sym: holds $("${MATH[@]}" fmt "$b" "$dec") (target $("${MATH[@]}" fmt "$target" "$dec"))"; SKIPPED+=("$chain $role $sym"); continue; fi',
    '    if [ "$asset" = native ]; then CMD=("$CAST" send "$to" --value "$t" --rpc-url "$URL" "${SIGNER[@]}" ${FEE[@]+"${FEE[@]}"} --json)',
    '    else CMD=("$CAST" send "$asset" "transfer(address,uint256)" "$to" "$t" --rpc-url "$URL" "${SIGNER[@]}" ${FEE[@]+"${FEE[@]}"} --json); fi',
    '    echo "  $chain $role: top up $("${MATH[@]}" fmt "$t" "$dec") $sym (holds $("${MATH[@]}" fmt "$b" "$dec"), target $("${MATH[@]}" fmt "$target" "$dec"))"',
    '    if [ "$DRY" = 1 ]; then echo "    would run: ${CMD[*]}"; continue; fi',
    '    out="$("${CMD[@]}" 2>&1)" || { fail "$chain" "transfer to $role failed: $(printf %s "$out" | tail -1)"; return 1; }',
    '    h="$(printf %s "$out" | node -e \'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.status!=="0x1"&&r.status!==1&&r.status!=="1")process.exit(1);console.log(r.transactionHash)})\')" || { fail "$chain" "transfer to $role reverted"; return 1; }',
    '    echo "    tx $h"; SENT+=("$chain $role $sym $t $h")',
    '  done',
    '}',
    '',
  ];
  for (const c of resolved.chains) {
    L.push(
      `chain_${c.chain}() { # ${c.chain} ${network} ${c.chainId}`,
      `  CH=${q(c.chain)}; ID=${c.chainId}; RPCENV=${q(c.rpcEnv)}; PUBRPC=${q(c.publicRpc)}`,
      `  FEE=(${c.castArgs.map(q).join(' ')})`,
      `  GAS_ASSET=${q(c.gas.asset)}; GAS_PER=${q(c.gas.perTransfer)}; BASEFEE_CAP=${q(c.baseFeeCap || '')}`,
      `  ASSETS=(${c.assets.map((a) => q(`${a.key}|${a.symbol}|${a.decimals}|${a.reserve}`)).join(' ')})`,
      `  ROWS=(${c.rows.map((r) => q(`${r.role}|${r.to}|${r.asset}|${r.symbol}|${r.decimals}|${r.target}`)).join(' ')})`,
      '}',
    );
  }
  const names = resolved.chains.map((c) => c.chain);
  L.push(
    '',
    `ALL=(${names.map(q).join(' ')})`,
    'echo; echo "== balance check (deployer needs; WITH_RESERVE=${WITH_RESERVE:-0})"',
    'OKC=()',
    'for c in "${ALL[@]}"; do',
    '  want "$c" || continue',
    '  "chain_$c"',
    '  chain_setup "$CH" "$ID" "$RPCENV" "$PUBRPC" || continue',
    '  check "$CH" && OKC+=("$c")',
    'done',
    'if [ "${CHECK_ONLY:-0}" != 1 ]; then',
    '  echo; echo "== transfers"',
    '  for c in "${OKC[@]:-}"; do',
    '    [ -n "$c" ] || continue',
    '    "chain_$c"; chain_setup "$CH" "$ID" "$RPCENV" "$PUBRPC" || continue',
    '    send "$CH"',
    '  done',
    'fi',
    'echo',
    'for s in "${SENT[@]:-}"; do [ -n "$s" ] && echo "sent: $s"; done',
    '[ ${#SKIPPED[@]} -gt 0 ] && echo "already funded: ${#SKIPPED[@]} transfer(s) skipped"',
    'if [ ${#FAILED[@]} -gt 0 ]; then',
    '  echo "failed or short: ${FAILED[*]}"',
    '  [ -n "${FAILED_FILE:-}" ] && printf "%s\\n" "${FAILED[@]}" > "$FAILED_FILE"',
    '  exit 1',
    'fi',
    '[ -n "${FAILED_FILE:-}" ] && : > "$FAILED_FILE"',
    'echo "done"',
    '',
  );
  return L.join('\n');
}

// ---------------------------------------------------------------- pending deploys

/** Per chain: which deploy steps the wrapper still has to run (usdc, eurc, router-usdc, router-eurc). */
export function pendingSteps({ deploy, network, chains, deployments, routers, only = null }) {
  const out = {};
  // A primary instance is any recorded split whose token is not a chains.json second token (EURC):
  // the recorded spelling varies (USDC, pathUSD on Tempo testnet, mUSDC, USDG).
  const recorded = (chain, sym) => deployments.filter((d) => {
    if (d.chain !== chain || d.network !== network || d.contract === 'DonateRouter') return false;
    const t = String(d.token || '').toUpperCase();
    const second = Object.keys(chains?.[chain]?.networks?.[network]?.splitTokens || {}).map((k) => k.toUpperCase());
    return sym === 'PRIMARY' ? !second.includes(t) : t === sym;
  });
  for (const chain of deploy?.chains || []) {
    if (only && !only.includes(chain)) continue;
    const n = chains?.[chain]?.networks?.[network];
    if (!n) continue;
    const steps = [];
    if (!recorded(chain, 'PRIMARY').length) steps.push('usdc');
    if ((deploy.eurcChains || []).includes(chain) && !recorded(chain, 'EURC').length) steps.push('eurc');
    const has = (addr) => routers.some((r) => r.network === network && Number(r.chainId) === Number(n.chainId) && String(r.usdc || '').toLowerCase() === String(addr || '').toLowerCase());
    if ((deploy.routerChains || []).includes(chain) && !has(n.usdc)) steps.push('router-usdc');
    if ((deploy.eurcRouterChains || []).includes(chain) && !has(n.splitTokens?.EURC?.address)) steps.push('router-eurc');
    // A recorded mainnet split whose proof payout never landed (the deploy went through, the proof did
    // not): the wrapper pays it again instead of losing it. Testnet records predate proofTxs: no step.
    if (network === 'mainnet') {
      const newest = (l) => l.length ? l[l.length - 1] : null;
      const prim = newest(recorded(chain, 'PRIMARY'));
      if (prim && !(prim.proofTxs || []).length) steps.push('proof');
      const eu = (deploy.eurcChains || []).includes(chain) ? newest(recorded(chain, 'EURC')) : null;
      if (eu && !(eu.proofTxs || []).length) steps.push('proof-eurc');
    }
    const mine = deployments.filter((d) => d.chain === chain && d.network === network);
    if (mine.some((d) => !d.verified)) steps.push('verify');
    if (n.verifier && mine.some((d) => !d.sourceVerified)) steps.push('verify-source');
    out[chain] = steps;
  }
  return out;
}

// ---------------------------------------------------------------- the run-order wrapper

/** Raw proof payout per instance (6-decimal tokens): 0.1 on mainnet (the minimal plan), 1 on testnet. */
export const PROOF_AMOUNT_DEFAULT = { mainnet: '100000', testnet: '1000000' };
export const proofDefault = (network) => PROOF_AMOUNT_DEFAULT[network] || '1000000';

/** wave/<network>-all.sh: every mainnet step in order, per-chain stop-on-error, DRY_RUN throughout. */
export function runAllScript({ network, deploy, chains, wallets, date = new Date().toISOString().slice(0, 10), root = distPaths.root(), project = distPaths.project(), waveDir = distPaths.dir() }) {
  if (!NETWORK_IDS[network]) throw new Error(`unknown network ${network}`);
  if (!deploy?.chains?.length) throw new Error(`funding-plan.json ${network}.deploy.chains is empty`);
  const list = deploy.chains;
  for (const c of list) {
    const n = chains?.[c]?.networks?.[network];
    if (!n) throw new Error(`${network}.deploy: ${c} is not in chains.json`);
    if (!NETWORK_IDS[network].includes(Number(n.chainId))) throw new Error(`${network}.deploy: ${c} chain id ${n.chainId} is not ${network}`);
  }
  const pick = (label) => (wallets || []).find((w) => w.label === (network === 'testnet' ? `testnet-${label}` : label))?.address || '';
  const treasury = pick('shelter-split-treasury');
  const pinkPaw = (wallets || []).find((w) => w.label === 'pink-paw-receiving')?.address || '';
  const net = (c) => chains[c].networks[network];
  const rpcLines = [...new Map(list.map((c) => [net(c).rpcEnv, net(c).publicRpc])).entries()]
    .map(([env, url]) => (url ? `export ${env}="\${${env}:-${url}}"` : `# ${env}: no public RPC in chains.json; export it yourself`));
  const ids = list.map((c) => `${c}:${net(c).chainId}`).join(' ');
  const fargs = list.map((c) => `${c}:${(net(c).forgeArgs || []).join(',')}`).join(' ');
  const self = runAllFile(network);
  const dist = distributeFile(network);
  const L = [
    '#!/usr/bin/env bash',
    `# Generated by \`fund a:mainnet-plan --network ${network}\` on ${date}. The ONE command after funding the deployer:`,
    '#   1. balance check: the deployer holds every chain\'s deploy reserve plus the distribution (funding-plan.json)',
    `#   2. ShelterSplit USDC instance (fund a:wave, then wave/deploy-${network}.sh) on chains without one`,
    `#   3. ShelterSplit EURC instance (wave/deploy-${network}-eurc.sh) on: ${(deploy.eurcChains || []).join(', ') || '-'}`,
    `#   4. DonateRouter (USDC) on: ${(deploy.routerChains || []).join(', ') || '-'}; EURC routers on: ${(deploy.eurcRouterChains || []).join(', ') || '-'}`,
    '#   4b. proof payouts a recorded split is still missing (a deploy that went through while its proof failed)',
    '#   5. fund a:ingest (records, wallet.config.ts, the client and Heist lists) + a:backend-deployments',
    '#   6. fund a:verify + a:verify-source per chain',
    `#   7. wave/${dist} (donatehot treat float + gas, agent x402 amount + gas; top-ups only)`,
    `#   8. fund fill --ingest${network === 'mainnet' ? ' --write' : ' (preview; FILL_WRITE=1 writes)'}`,
    '#   9. prints the files to commit and the Tempo campaign-memo commands',
    '# Rerun-safe: chains with a recorded split/router are skipped; distribution only tops up.',
    '# Per-chain stop-on-error: a chain that fails a step is left out of every later step; the others go on.',
    `#   DRY_RUN=1 ./${self}      simulate everything (forge without --broadcast, transfers printed, nothing recorded)`,
    `#   CHAINS=a,b ./${self}     limit the run (default: ${list.join(',')})`,
    '#   FUND_KEYSTORE (default tokentails), FUND_KEYSTORE_PASSWORD_FILE (optional, a path), RPC_* (default: the public RPCs)',
    `#   PROOF_SHELTER / PROOF_SHELTER_NAME / PROOF_AMOUNT: the wave's proof payout and the Tempo memo (default: Pink Paw, ${proofDefault(network) === '100000' ? '0.1' : '1'} token = ${proofDefault(network)} raw); PROOF_SHELTER= turns it off`,
    'set -uo pipefail',
    ...mainnetGuard(network, self),
    `NETWORK=${network}`,
    `FUND_ROOT=${q(root)}`,
    `PROJECT=${q(project)}`,
    `WAVE=${q(waveDir)}`,
    'cd "$FUND_ROOT" || exit 1',
    'FUND=(node bin/fund.mjs)',
    `DEPLOYMENTS="\${FUND_A_DEPLOYMENTS:-$FUND_ROOT/tracks/a-build/deployments.json}"`,
    'export FOUNDRY_DISABLE_NIGHTLY_WARNING=1',
    'export FUND_KEYSTORE="${FUND_KEYSTORE:-tokentails}"',
    `export SHELTERSPLIT_TREASURY="\${SHELTERSPLIT_TREASURY:-${treasury}}"`,
    `export PROOF_SHELTER="\${PROOF_SHELTER-${pinkPaw}}"`,
    `export PROOF_SHELTER_NAME="\${PROOF_SHELTER_NAME:-Pink Paw}" PROOF_AMOUNT="\${PROOF_AMOUNT:-${proofDefault(network)}}"`,
    '# A value left exported in this shell (the testnet deploy header sets PROOF_AMOUNT=1000000) must not',
    '# silently change what the plan budgeted: refuse anything else unless it is overridden on purpose.',
    `if [ "$PROOF_AMOUNT" != ${q(proofDefault(network))} ] && [ "\${OVERRIDE_PROOF_AMOUNT:-}" != yes ]; then echo "refused: PROOF_AMOUNT=$PROOF_AMOUNT, but funding-plan.json budgets ${proofDefault(network)} raw per proof. unset PROOF_AMOUNT, or OVERRIDE_PROOF_AMOUNT=yes after funding the deployer for it"; exit 1; fi`,
    ...(treasury ? [`if [ "$(printf %s "$SHELTERSPLIT_TREASURY" | tr A-F a-f)" != ${q(treasury.toLowerCase())} ] && [ "\${OVERRIDE_TREASURY:-}" != yes ]; then echo "refused: SHELTERSPLIT_TREASURY=$SHELTERSPLIT_TREASURY is not the wallets.public.json treasury ${treasury}. unset it, or OVERRIDE_TREASURY=yes"; exit 1; fi`] : []),
    ...(network === 'mainnet' ? ['export CONFIRM_MAINNET   # the generated deploy scripts carry the same guard'] : []),
    ...rpcLines,
    'DRY="${DRY_RUN:-0}"; export DRY_RUN="$DRY"',
    'if [ -e "$FUND_KEYSTORE" ]; then SIGNER=(--keystore "$FUND_KEYSTORE"); else SIGNER=(--account "$FUND_KEYSTORE"); fi',
    '[ -n "${FUND_KEYSTORE_PASSWORD_FILE:-}" ] && SIGNER+=(--password-file "$FUND_KEYSTORE_PASSWORD_FILE")',
    'DEPLOYER="$(cast wallet address "${SIGNER[@]}")" || exit 1',
    `ALL=${q(list.join(','))}`,
    `IDS=${q(` ${ids} `)}`,
    `FARGS=${q(` ${fargs} `)}`,
    `RPCS=${q(` ${list.map((c) => `${c}:${net(c).rpcEnv}`).join(' ')} `)}`,
    `CASTP=${q(` ${list.filter((c) => net(c).proofVia === 'cast').join(' ')} `)}   # chains whose proof payout runs as cast sends`,
    'CH_LIST="${CHAINS:-$ALL}"',
    'FAILED=(); WARN=()',
    'lc() { printf %s "$1" | tr A-F a-f; }',
    'failed() { local x; for x in "${FAILED[@]:-}"; do [ "$x" = "$1" ] && return 0; done; return 1; }',
    'fail() { failed "$1" || FAILED+=("$1"); echo "  ✗ $1 stopped: $2"; }',
    'alive() { local out=() c; IFS=, read -r -a cs <<<"$CH_LIST"; for c in "${cs[@]}"; do case ",$ALL," in *",$c,"*) ;; *) continue;; esac; failed "$c" || out+=("$c"); done; local IFS=,; echo "${out[*]:-}"; }',
    'idof() { local x="${IDS#* $1:}"; echo "${x%% *}"; }',
    'fargsof() { local x="${FARGS#* $1:}"; x="${x%% *}"; echo "${x//,/ }"; }',
    'rpcof() { local x="${RPCS#* $1:}"; echo "${x%% *}"; }',
    'pending() { "${FUND[@]}" a:pending --network "$NETWORK" --chains "$1" 2>/dev/null; }',
    'has_step() { node -e \'const j=JSON.parse(process.argv[1]);process.exit((j[process.argv[2]]||[]).includes(process.argv[3])?0:1)\' "$1" "$2" "$3"; }',
    'chains_with() { node -e \'const j=JSON.parse(process.argv[1]);console.log(Object.keys(j).filter(c=>(j[c]||[]).includes(process.argv[2])).join(","))\' "$1" "$2"; }',
    'step() { echo; echo "=================== $*"; }',
    '[ "$DRY" = 1 ] && echo "DRY RUN: simulating; nothing is broadcast or recorded"',
    'echo "network $NETWORK  deployer $DEPLOYER  chains $CH_LIST"',
    '',
    'step "1. balance check (deploy reserve + distribution)"',
    'PEND="$(pending "$(alive)")" || { echo "fund a:pending failed"; exit 1; }',
    'echo "pending deploys: $PEND"',
    '# The deploy reserve is counted only where a ShelterSplit is still to deploy. On a rerun after the split',
    '# went through, its gas and proof are already spent: routers and a retried proof are checked without it',
    '# (forge simulates first, so a short deployer stops that step without spending).',
    'RES_CHAINS="$(node -e \'const j=JSON.parse(process.argv[1]);console.log(Object.keys(j).filter(c=>j[c].some(s=>s==="usdc"||s==="eurc")).join(","))\' "$PEND")"',
    'FF="$(mktemp)"',
    `dist() { # what chains [ENV=VALUE...]: runs ${dist}, stops every chain it reports (or all of them if it died)`,
    '  local what="$1" cs="$2" rc; shift 2',
    '  : > "$FF"',
    `  env CHAINS="$cs" FAILED_FILE="$FF" "$@" bash "$WAVE/${dist}"; rc=$?`,
    `  if [ $rc != 0 ] && [ ! -s "$FF" ]; then for c in \${cs//,/ }; do fail "$c" "$what: ${dist} exited $rc"; done; fi`,
    '  while read -r c; do [ -n "$c" ] && fail "$c" "$what"; done < "$FF"',
    '}',
    '# Chains with nothing left to deploy are checked without the deploy reserve (it was spent already).',
    '[ -n "$RES_CHAINS" ] && dist "balance check" "$RES_CHAINS" WITH_RESERVE=1 CHECK_ONLY=1',
    'REST="$(node -e \'const a=process.argv[1].split(",").filter(Boolean),r=process.argv[2].split(",");console.log(a.filter(c=>!r.includes(c)).join(","))\' "$(alive)" "$RES_CHAINS")"',
    '[ -n "$REST" ] && dist "balance check" "$REST" CHECK_ONLY=1',
    '',
    '# wave TOKEN STEP: regenerate the deploy script for the chains still missing that instance, run it,',
    '# then stop each chain whose deploy did not end up recorded (or that the script skipped).',
    'wave() { # suffix(""|-eurc) step(usdc|eurc) [--token EURC]',
    '  local sfx="$1" st="$2"; shift 2',
    '  local todo; todo="$(chains_with "$(pending "$(alive)")" "$st")"',
    '  [ -n "$todo" ] || { echo "nothing to deploy: every chain already has its $st ShelterSplit recorded"; return; }',
    '  local f="$WAVE/deploy-$NETWORK$sfx.sh"',
    '  rm -f "$f"',
    '  "${FUND[@]}" a:wave --network "$NETWORK" --chains "$todo" "$@" || { for c in ${todo//,/ }; do fail "$c" "fund a:wave"; done; return; }',
    '  [ -f "$f" ] || { echo "a:wave wrote no script (nothing to deploy)"; return; }',
    '  local log; log="$(mktemp)"',
    '  bash "$f" 2>&1 | tee "$log"',
    '  for c in ${todo//,/ }; do grep -q "^skipped: $c:" "$log" && fail "$c" "$st deploy (see the output above)"; done',
    '  if [ "$DRY" != 1 ]; then',
    '    local after; after="$(pending "$todo")"',
    '    for c in ${todo//,/ }; do failed "$c" || ! has_step "$after" "$c" "$st" || fail "$c" "$st ShelterSplit not recorded after the deploy"; done',
    '  fi',
    '}',
    `step "2. ShelterSplit (primary token) — deploy-${network}.sh"`,
    'wave "" usdc',
    `step "3. ShelterSplit EURC — deploy-${network}-eurc.sh"`,
    'wave -eurc eurc --token EURC',
    '',
    'router() { # chain step(router-usdc|router-eurc)',
    '  local c="$1" st="$2" id tok sym plan split token url',
    '  id="$(idof "$c")"; sym=USDC; [ "$st" = router-eurc ] && sym=EURC',
    '  local rerr; rerr="$(mktemp)"',
    '  if ! plan="$("${FUND[@]}" router plan --chain "$id" --token "$sym" --json 2>"$rerr")"; then',
    '    if [ "$DRY" = 1 ] && grep -q "ShelterSplit recorded" "$rerr"; then echo "  $c $sym router: would deploy a DonateRouter after the $sym ShelterSplit (dry run: nothing is recorded)"; rm -f "$rerr"; return; fi',
    '    cat "$rerr" >&2; rm -f "$rerr"; fail "$c" "router plan ($sym)"; return',
    '  fi',
    '  rm -f "$rerr"',
    '  split="$(node -e \'console.log(JSON.parse(process.argv[1]).split)\' "$plan")"; token="$(node -e \'console.log(JSON.parse(process.argv[1]).token)\' "$plan")"',
    '  if [ "$(node -e \'console.log(JSON.parse(process.argv[1]).routers.length)\' "$plan")" != 0 ]; then echo "  skip $c $sym router: already recorded"; return; fi',
    '  local rpcEnv; rpcEnv="$(node -e \'console.log(JSON.parse(process.argv[1]).rpcEnv)\' "$plan")"; url="${!rpcEnv:-}"',
    '  [ -n "$url" ] || { fail "$c" "set $rpcEnv"; return; }',
    '  [ "$(cast chain-id --rpc-url "$url" 2>/dev/null)" = "$id" ] || { fail "$c" "RPC $rpcEnv is not chain $id"; return; }',
    '  echo "  $c $sym router in front of $split (token $token)"',
    '  cast call "$token" "authorizationState(address,bytes32)(bool)" 0x0000000000000000000000000000000000000001 0x0000000000000000000000000000000000000000000000000000000000000000 --rpc-url "$url" >/dev/null 2>&1 || { fail "$c" "$sym has no EIP-3009: no router"; return; }',
    '  local bc=(); [ "$DRY" = 1 ] || bc=(--broadcast)',
    '  (cd "$PROJECT" && SPLIT="$split" USDC="$token" EXPECTED_CHAIN_ID="$id" forge script script/DeployDonateRouter.s.sol:DeployDonateRouter --rpc-url "$url" "${SIGNER[@]}" --sender "$DEPLOYER" ${bc[@]+"${bc[@]}"} $(fargsof "$c")) || { fail "$c" "DonateRouter $sym deploy"; return; }',
    '  [ "$DRY" = 1 ] && return',
    '  # Recorded right away: the next router on this chain overwrites the same run-latest.json.',
    '  "${FUND[@]}" router record --chain "$id" --token "$sym" --split "$split" || fail "$c" "router record ($sym)"',
    '}',
    'step "4. DonateRouters"',
    'if true; then',
    '  PEND="$(pending "$(alive)")"',
    '  RT="$(chains_with "$PEND" router-usdc)$(chains_with "$PEND" router-eurc)"',
    '  [ -n "$RT" ] || echo "  nothing to deploy: every planned DonateRouter is already recorded"',
    '  for st in router-usdc router-eurc; do for c in $(chains_with "$PEND" "$st" | tr , " "); do failed "$c" || router "$c" "$st"; done; done',
    'fi',
    '',
    '# proof_for CHAIN STEP(proof|proof-eurc): pays the proof a recorded split is still missing (the deploy',
    '# went through, its proof did not). Same calls as the deploy script; a:ingest records it right after.',
    'proof_for() {',
    '  local c="$1" st="$2" id env url split owner tok h sym=PRIMARY fa=() a',
    '  [ "$st" = proof-eurc ] && sym=EURC',
    '  id="$(idof "$c")"; env="$(rpcof "$c")"; url="${!env:-}"',
    '  [ -n "$url" ] || { fail "$c" "set $env"; return; }',
    '  [ "$(cast chain-id --rpc-url "$url" 2>/dev/null)" = "$id" ] || { fail "$c" "RPC $env is not chain $id"; return; }',
    '  split="$(node -e \'const d=require(process.argv[1]),[c,n,s]=process.argv.slice(2);const x=d.filter(e=>e.contract!=="DonateRouter"&&e.chain===c&&e.network===n&&(s==="EURC"?String(e.token).toUpperCase()==="EURC":String(e.token).toUpperCase()!=="EURC"));const e=x[x.length-1];console.log(e&&!(e.proofTxs||[]).length?e.address:"")\' "$DEPLOYMENTS" "$c" "$NETWORK" "$sym")"',
    '  [ -n "$split" ] || return 0',
    '  owner="$(cast call "$split" "owner()(address)" --rpc-url "$url" 2>/dev/null)"',
    '  [ "$(lc "${owner%% *}")" = "$(lc "$DEPLOYER")" ] || { WARN+=("$c: the $st payout needs the split owner ${owner:-?}; pay it from that key"); return; }',
    '  echo "  $c: $st payout still missing on $split: paying $PROOF_AMOUNT raw to $PROOF_SHELTER"',
    '  [ "$DRY" = 1 ] && { echo "    (dry run: nothing sent)"; return; }',
    '  for a in $(fargsof "$c"); do fa+=("$a"); done',
    '  case "$CASTP" in',
    '    *" $c "*)',
    '      local ca=() i=0; while [ $i -lt ${#fa[@]} ]; do if [ "${fa[$i]}" = --gas-estimate-multiplier ]; then i=$((i + 2)); else ca+=("${fa[$i]}"); i=$((i + 1)); fi; done',
    '      tok="$(cast call "$split" "token()(address)" --rpc-url "$url")" || { fail "$c" "$st payout (token)"; return; }',
    '      if ! cast call "$split" "getShelter(address)" "$PROOF_SHELTER" --rpc-url "$url" >/dev/null 2>&1; then',
    '        cast send "$split" "addShelter(address,uint16,string)" "$PROOF_SHELTER" "${PROOF_BPS:-10000}" "$PROOF_SHELTER_NAME" --rpc-url "$url" "${SIGNER[@]}" ${ca[@]+"${ca[@]}"} >/dev/null || { fail "$c" "$st payout (addShelter)"; return; }',
    '      fi',
    '      cast send "$tok" "approve(address,uint256)" "$split" "$PROOF_AMOUNT" --rpc-url "$url" "${SIGNER[@]}" ${ca[@]+"${ca[@]}"} >/dev/null || { fail "$c" "$st payout (approve)"; return; }',
    '      h="$(cast send "$split" "disburse(uint256,string)" "$PROOF_AMOUNT" "${PROOF_MEMO:-Token Tails first payout}" --rpc-url "$url" "${SIGNER[@]}" ${ca[@]+"${ca[@]}"} --json | node -e \'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.status!=="0x1"&&r.status!==1&&r.status!=="1")process.exit(1);console.log(r.transactionHash)})\')" || { fail "$c" "$st payout (disburse)"; return; }',
    '      mkdir -p "$PROJECT/broadcast/ProofDisburse.s.sol/$id"',
    '      printf \'{"transactions":[{"transactionType":"CALL","function":"disburse(uint256,string)","contractAddress":"%s","hash":"%s"}]}\\n\' "$split" "$h" > "$PROJECT/broadcast/ProofDisburse.s.sol/$id/run-latest.json"',
    '      ;;',
    '    *)',
    '      (cd "$PROJECT" && PROOF_SPLIT="$split" EXPECTED_CHAIN_ID="$id" forge script script/ProofDisburse.s.sol:ProofDisburse --rpc-url "$url" "${SIGNER[@]}" --sender "$DEPLOYER" --broadcast ${fa[@]+"${fa[@]}"}) || { fail "$c" "$st payout"; return; }',
    '      ;;',
    '  esac',
    '  # Recorded now: a second proof on this chain overwrites the same run-latest.json.',
    '  FUND_A_SKIP_SOURCE_VERIFY=1 "${FUND[@]}" a:ingest --network "$NETWORK" >/dev/null || WARN+=("$c: a:ingest after the $st payout failed; rerun fund a:ingest --network $NETWORK")',
    '}',
    'step "4b. proof payouts still missing on recorded splits"',
    'if [ -z "${PROOF_SHELTER:-}" ]; then echo "  PROOF_SHELTER is empty: no proof payouts"',
    'else',
    '  PEND="$(pending "$(alive)")"',
    '  PR="$(chains_with "$PEND" proof)$(chains_with "$PEND" proof-eurc)"',
    '  [ -n "$PR" ] || echo "  nothing missing: every recorded split has its proof payout"',
    '  for st in proof proof-eurc; do for c in $(chains_with "$PEND" "$st" | tr , " "); do failed "$c" || proof_for "$c" "$st"; done; done',
    'fi',
    '',
    'step "5. a:ingest + wallet.config.ts"',
    'if [ "$DRY" = 1 ]; then echo "  would run: fund a:ingest --network $NETWORK; fund a:backend-deployments"',
    'else',
    '  "${FUND[@]}" a:ingest --network "$NETWORK" || WARN+=("a:ingest exited non-zero (see above)")',
    '  "${FUND[@]}" a:backend-deployments || WARN+=("a:backend-deployments failed")',
    'fi',
    '',
    'step "6. a:verify + a:verify-source (only records not yet verified)"',
    'PEND="$(pending "$(alive)")"',
    'for c in $(alive | tr , " "); do',
    '  if has_step "$PEND" "$c" verify; then',
    '    if [ "$DRY" = 1 ]; then echo "  would run: fund a:verify $c $NETWORK"',
    '    else "${FUND[@]}" a:verify "$c" "$NETWORK" || { fail "$c" "a:verify"; continue; }; fi',
    '  else echo "  $c: every recorded split already verified"; fi',
    '  if has_step "$PEND" "$c" verify-source; then',
    '    # Explorer source verification lags behind new blocks: a failure is reported, not a stop; rerun later.',
    '    if [ "$DRY" = 1 ]; then echo "  would run: fund a:verify-source $c $NETWORK"',
    '    else "${FUND[@]}" a:verify-source "$c" "$NETWORK" || WARN+=("$c: a:verify-source failed; rerun fund a:verify-source $c $NETWORK"); fi',
    '  else echo "  $c: source already verified"; fi',
    'done',
    '',
    `step "7. distribute — ${dist}"`,
    'ALIVE="$(alive)"',
    '[ -n "$ALIVE" ] && dist "distribution" "$ALIVE"',
    '',
    'step "8. fund fill"',
    ...(network === 'mainnet'
      ? ['if [ "$DRY" = 1 ]; then "${FUND[@]}" fill || true; else "${FUND[@]}" fill --ingest --write || WARN+=("fund fill reported open values (see above)"); fi']
      : ['if [ "$DRY" != 1 ] && [ "${FILL_WRITE:-0}" = 1 ]; then "${FUND[@]}" fill --ingest --network testnet --write || WARN+=("fund fill"); else "${FUND[@]}" fill --network testnet || true; fi']),
    '',
    'step "9. commit these files, then the Tempo campaign memo"',
    'cd "$FUND_ROOT/../.." && git status --short -- funding/framework/tracks/a-build/deployments.json funding/framework/tracks/a-build/router-deployments.json \\',
    '  backend/src/shelter/onchain/wallet.config.ts client/public/shelter-payouts catnip-heist/public/payouts client/public/heist-game/payouts \\',
    '  funding/framework/applications; cd "$FUND_ROOT"',
    'echo "  git add <the paths above> && git commit -m \\"chore(funding): record $NETWORK deployments\\" && git push"',
    'echo "  client/public/shelter-payouts/routers.json is rewritten by fund router record (the public router list): commit it too"',
    `TEMPO_SPLIT="$(node -e 'const d=require(process.argv[1]);const x=d.filter(e=>e.chain==="tempo"&&e.network===process.argv[2]);console.log(x.length?x[x.length-1].address:"")' "$DEPLOYMENTS" "$NETWORK")"`,
    'SIGNER_TXT="${SIGNER[*]}"',
    `TEMPO_TOKEN=${q(chains.tempo?.networks?.[network]?.usdc || '')}; TEMPO_RPC=${q(chains.tempo?.networks?.[network]?.rpcEnv || 'RPC_TEMPO')}`,
    'if [ -n "${PROOF_SHELTER:-}" ] && [ -n "$TEMPO_SPLIT" ] && case ",$(alive)," in *,tempo,*) true;; *) false;; esac; then',
    '  echo "Tempo campaign memo (you run it; fund fill reads TEMPO_TX from fill-values.json):"',
    '  echo "  cast send $TEMPO_TOKEN \\"approve(address,uint256)\\" $TEMPO_SPLIT $PROOF_AMOUNT --rpc-url \\$$TEMPO_RPC $SIGNER_TXT --tempo.fee-token 0x20c0000000000000000000000000000000000000"',
    '  echo "  cast send $TEMPO_SPLIT \\"disburseWithMemo(uint256,bytes32)\\" $PROOF_AMOUNT \\$(cast format-bytes32-string \\"Catnip Heist campaign\\") --rpc-url \\$$TEMPO_RPC $SIGNER_TXT --tempo.fee-token 0x20c0000000000000000000000000000000000000"',
    'fi',
    '',
    'echo; for w in "${WARN[@]:-}"; do [ -n "$w" ] && echo "warning: $w"; done',
    'echo "chains done: $(alive)"',
    'if [ ${#FAILED[@]} -gt 0 ]; then echo "chains stopped: ${FAILED[*]} (fix, then rerun this same command: finished steps are skipped)"; exit 1; fi',
    '',
  ];
  return L.join('\n');
}

// ---------------------------------------------------------------- commands

const netFlag = (flags) => (typeof flags.network === 'string' ? flags.network : 'mainnet');
const profileFlag = (flags) => {
  const p = typeof flags.plan === 'string' ? flags.plan : process.env.PLAN;
  return p && p !== 'default' && p !== 'minimal' ? p : null;
};
const onlyFlag = (flags) => (typeof flags.chains === 'string' ? flags.chains.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null);

async function cmdDistribute({ flags }) {
  const network = netFlag(flags);
  if (!NETWORK_IDS[network]) { console.error('--network mainnet|testnet'); return 2; }
  const profile = profileFlag(flags);
  const r = loadResolved(network, onlyFlag(flags), profile);
  if (r.problems.length) { for (const p of r.problems) console.error(`✗ ${p}`); return 1; }
  say(`${network} distribution from the deployer ${r.deployer}${profile ? ` (profile ${profile})` : ''}`);
  for (const c of r.chains) for (const x of c.rows) say(`  ${c.chain.padEnd(10)} ${x.role.padEnd(9)} ${x.amount} ${x.symbol}${x.asset === 'native' ? ' (native)' : ''}  ${x.to}`);
  const dir = distPaths.dir();
  mkdirSync(dir, { recursive: true });
  const f = join(dir, distributeFile(network, profile));
  writeFileSync(f, distributeScript(r, { network, profile }));
  chmodSync(f, 0o755);
  say(`\nwrote ${f}`);
  say(`next: ${network === 'mainnet' ? 'CONFIRM_MAINNET=yes ' : ''}DRY_RUN=1 ${f}   (then without DRY_RUN)`);
  return 0;
}

async function cmdRunPlan({ flags }) {
  const network = netFlag(flags);
  if (!NETWORK_IDS[network]) { console.error('--network mainnet|testnet'); return 2; }
  // The wrapper always runs the default (minimal) plan, whatever PLAN says.
  const code = await cmdDistribute({ flags: { network, plan: 'default' } });
  if (code) return code;
  const r = loadResolved(network);
  const dir = distPaths.dir();
  const f = join(dir, runAllFile(network));
  writeFileSync(f, runAllScript({ network, deploy: r.deploy, chains: r.chainsJson, wallets: r.wallets }));
  chmodSync(f, 0o755);
  say(`wrote ${f}`);
  say(network === 'mainnet'
    ? `next (a person, never an AI agent): CONFIRM_MAINNET=yes DRY_RUN=1 ${f}   then   CONFIRM_MAINNET=yes ${f}`
    : `next: DRY_RUN=1 ${f}   then   ${f}   (CHAINS=a,b to limit)`);
  return 0;
}

async function cmdPending({ flags }) {
  const network = netFlag(flags);
  const plan = readJson(distPaths.plan(), {});
  const out = pendingSteps({
    deploy: plan?.[network]?.deploy, network, chains: readJson(distPaths.chains(), {}),
    deployments: readJson(distPaths.deployments(), []), routers: readJson(distPaths.routers(), []), only: onlyFlag(flags),
  });
  console.log(JSON.stringify(out));
  return 0;
}

export const distributeCommands = {
  'a:distribute': { help: '--network mainnet|testnet [--chains a,b] [--plan topup] — write wave/distribute-<network>[-topup].sh: top up donatehot + agent from the deployer (funding-plan.json; PLAN=topup = profiles.topup)', run: cmdDistribute },
  'a:mainnet-plan': { help: '[--network mainnet|testnet] — write wave/<network>-all.sh: balance check, deploys, routers, ingest, verify, distribute, fill (a person runs it)', run: cmdRunPlan },
  'a:pending': { help: '[--network n] [--chains a,b] — JSON: per chain, the deploy steps still missing (usdc, eurc, router-usdc, router-eurc)', run: cmdPending },
};

// ---------------------------------------------------------------- math CLI for the generated scripts

export function math(op, args) {
  const [a, b] = args;
  switch (op) {
    case 'topup': return topUp(a, b, args[2] === undefined ? TOPUP_TOLERANCE_BPS : Number(args[2]));
    case 'add': return (BigInt(a) + BigInt(b)).toString();
    case 'sub': return topUp(a, b, 0); // floor at 0: need - have
    case 'fmt': return formatUnits(a, Number(b));
    default: throw new Error(`unknown math op ${op}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'math') {
  try { console.log(math(process.argv[3], process.argv.slice(4))); } catch (e) { console.error(e.message); process.exit(2); }
}
