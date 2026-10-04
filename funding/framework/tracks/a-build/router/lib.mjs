// DonateRouter tooling: print, never run. No dependencies, no network, no keys.
//
// routerDryRun({ chainId })   the forge command a founder runs to deploy DonateRouter in front of the
//                             chain's USDC ShelterSplit, plus how to record it in router-deployments.json.
// rotateDryRun({ chainId, split, oldWallet, newWallet, name })
//                             the `cast` calls that hand a shelter entry over to the shelter's own wallet.
//
// Both return { ok, lines, problems } and never broadcast, never read a key or an env file: every
// signer is a `--account <keystore>` placeholder the founder fills in at their own terminal.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROUTER_DEPLOYMENTS = join(TRACK_DIR, 'router-deployments.json');
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const NETWORKS = ['testnet', 'mainnet'];

/**
 * Chains whose USDC is known to lack Circle's EIP-3009 (receiveWithAuthorization): a router there could
 * only take gifts through flush(). Tempo's stablecoins are TIP-20 tokens, not FiatToken. Every other
 * chain still gets the on-chain preflight below before the deploy.
 */
export const NO_EIP3009 = { tempo: 'Tempo stablecoins are TIP-20 tokens without EIP-3009' };

/** The read-only EIP-3009 probe: a FiatToken answers `false`, a token without it reverts. */
export const EIP3009_PROBE_ARGS =
  '"authorizationState(address,bytes32)(bool)" 0x0000000000000000000000000000000000000001 0x0000000000000000000000000000000000000000000000000000000000000000';
export const EIP3009_REFUSAL = 'token has no EIP-3009; router would only support flush';

/** The `cast call` that reads a shelter entry: (wallet, bps, active, name). */
export const getShelterCall = (split, wallet, rpc) =>
  `cast call ${split} "getShelter(address)((address,uint16,bool,string))" ${wallet} --rpc-url ${rpc}`;

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** { chain, network, chainId, usdc, rpcEnv } for a chain id, from chains.json, or null. */
export function findNetwork(chainId, chains) {
  const id = Number(chainId);
  for (const [chain, def] of Object.entries(chains || {})) {
    if (chain.startsWith('_') || !def?.networks) continue;
    for (const [network, n] of Object.entries(def.networks)) {
      if (Number(n.chainId) === id) return { chain, network, chainId: id, usdc: n.usdc ?? null, rpcEnv: n.rpcEnv ?? null };
    }
  }
  return null;
}

/** The USDC ShelterSplit candidates on a chain id (deployments.json is only read). Newest last. */
export function usdcSplits(chainId, deployments, usdc) {
  if (!usdc) return [];
  return (Array.isArray(deployments) ? deployments : [])
    .filter((d) => d && d.contract === 'ShelterSplit' && Number(d.chainId) === Number(chainId) && ADDR.test(d.address || ''))
    .filter((d) => !d.token || d.token === 'USDC')
    .sort((a, b) => String(a.recorded || '').localeCompare(String(b.recorded || '')));
}

/** Validates router-deployments.json entries; returns problems (strings). */
export function validateRouterDeployments(list) {
  const problems = [];
  if (!Array.isArray(list)) return ['router-deployments.json must be an array'];
  list.forEach((e, i) => {
    const at = `entry ${i}`;
    if (!e || typeof e !== 'object') { problems.push(`${at}: must be an object`); return; }
    if (!Number.isInteger(e.chainId)) problems.push(`${at}: chainId must be an integer`);
    if (!NETWORKS.includes(e.network)) problems.push(`${at}: network must be testnet or mainnet`);
    for (const k of ['router', 'split', 'usdc']) if (!ADDR.test(e[k] || '')) problems.push(`${at}: ${k} must be a 0x address`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(e.deployTx || '')) problems.push(`${at}: deployTx must be a 0x tx hash`);
    if (typeof e.deployedAt !== 'string' || Number.isNaN(Date.parse(e.deployedAt))) problems.push(`${at}: deployedAt must be an ISO date`);
  });
  return problems;
}

/**
 * The deploy plan for one chain. Prints the simulate and broadcast commands; the AI never broadcasts.
 * opts: { chainId, split?, chains?, deployments?, routerDeployments? } (the last three default to the files).
 */
export function routerDryRun({ chainId, split, chains, deployments, routerDeployments } = {}) {
  const problems = [];
  const lines = [];
  if (!Number.isInteger(Number(chainId)) || !chainId) return { ok: false, lines, problems: ['--chain <chain id> is required'] };
  chains = chains ?? readJson(join(TRACK_DIR, 'chains.json'), {});
  deployments = deployments ?? readJson(join(TRACK_DIR, 'deployments.json'), []);
  routerDeployments = routerDeployments ?? readJson(ROUTER_DEPLOYMENTS, []);

  const net = findNetwork(chainId, chains);
  if (!net) return { ok: false, lines, problems: [`chain ${chainId} is not in chains.json`] };
  if (!net.usdc) problems.push(`${net.chain} ${net.network} has no USDC in chains.json; the router needs a FiatToken with EIP-3009 (native gifts still work through donateNative on Arc)`);
  else if (NO_EIP3009[net.chain]) problems.push(`${net.chain} ${net.network}: ${EIP3009_REFUSAL} (${NO_EIP3009[net.chain]})`);

  const candidates = usdcSplits(chainId, deployments, net.usdc);
  let target = split;
  if (target && !ADDR.test(target)) problems.push(`--split ${target} is not a 0x address`);
  if (!target) {
    if (!candidates.length) problems.push(`no USDC ShelterSplit recorded for chain ${chainId} in deployments.json; deploy ShelterSplit first (fund a:wave) or pass --split`);
    else target = candidates[candidates.length - 1].address;
  }
  if (problems.length) return { ok: false, lines, problems };

  const existing = (Array.isArray(routerDeployments) ? routerDeployments : []).filter((r) => Number(r.chainId) === Number(chainId));
  const rpc = net.rpcEnv ? `"$${net.rpcEnv}"` : '<rpc url>';
  lines.push(`DonateRouter on ${net.chain} ${net.network} (chain ${net.chainId})`);
  lines.push(`  split  ${target}${candidates.length > 1 && !split ? `  (newest of ${candidates.length} USDC splits recorded; pass --split to choose)` : ''}`);
  lines.push(`  usdc   ${net.usdc}`);
  if (existing.length) lines.push(`  note   router-deployments.json already has ${existing.length} router(s) on this chain: ${existing.map((r) => r.router).join(', ')}`);
  if (net.network === 'mainnet') lines.push('  note   mainnet: real money. Public gifts stay off in the app until the shelter holds its own key (handover).');
  lines.push('');
  lines.push('0. Preflight: the USDC must support EIP-3009 (read-only; expects: false):');
  lines.push(`   cast call ${net.usdc} ${EIP3009_PROBE_ARGS} --rpc-url ${rpc}`);
  lines.push(`   If it reverts, STOP: ${EIP3009_REFUSAL}. Do not deploy a router on this chain.`);
  lines.push('');
  lines.push('1. Simulate (no broadcast, no key):');
  lines.push(`   cd funding/framework/tracks/a-build/shelter-split`);
  lines.push(`   SPLIT=${target} USDC=${net.usdc} EXPECTED_CHAIN_ID=${net.chainId} \\`);
  lines.push(`     forge script script/DeployDonateRouter.s.sol --rpc-url ${rpc}`);
  lines.push('');
  lines.push('2. MANUAL founder step: broadcast with your own keystore:');
  lines.push(`   SPLIT=${target} USDC=${net.usdc} EXPECTED_CHAIN_ID=${net.chainId} \\`);
  lines.push(`     forge script script/DeployDonateRouter.s.sol --rpc-url ${rpc} --account <keystore> --broadcast`);
  lines.push('');
  lines.push('3. Check the live guard (expects: true, 0) and the payout list donors will sign:');
  lines.push(`   cast call <router> "canDonate(uint256)(bool,uint256)" 1000000 --rpc-url ${rpc}`);
  lines.push(`   cast call <router> "recipientsHash(uint256)(bytes32)" 1000000 --rpc-url ${rpc}`);
  lines.push('');
  lines.push('4. Record it in funding/framework/tracks/a-build/router-deployments.json:');
  lines.push(`   { "chainId": ${net.chainId}, "network": "${net.network}", "router": "<router>", "split": "${target}", "usdc": "${net.usdc}", "deployTx": "<tx hash>", "deployedAt": "<ISO date>" }`);
  lines.push('   then set fact router_guard verified with that entry as its source (fund facts build).');
  return { ok: true, lines, problems, plan: { ...net, split: target } };
}

/**
 * The handover plan: re-point a shelter entry from the wallet Token Tails holds to the shelter's own.
 * Order: pause, removeShelter(old), addShelter(new, 10000, name), unpause, then preview(1 USDC) must show
 * toTreasury == 0. Removing first keeps totalBps <= 10000; pausing around it means no treat or router
 * gift lands in the gap (the router reverts while paused or while any share would reach the treasury).
 */
export function rotateDryRun({ chainId, split, oldWallet, newWallet, name, bps = 10000, chains } = {}) {
  const problems = [];
  const lines = [];
  if (!chainId) problems.push('--chain <chain id> is required');
  if (!ADDR.test(split || '')) problems.push('split must be a 0x address (pass --split, or record the chain in deployments.json)');
  if (!ADDR.test(oldWallet || '')) problems.push('old wallet must be a 0x address (--from)');
  if (!ADDR.test(newWallet || '')) problems.push('new wallet must be a 0x address (--to)');
  if (ADDR.test(oldWallet || '') && ADDR.test(newWallet || '') && oldWallet.toLowerCase() === newWallet.toLowerCase()) problems.push('--to is the wallet already registered');
  if (/^0x0{40}$/i.test(newWallet || '')) problems.push('--to must not be the zero address');
  if (typeof name !== 'string' || !name.trim()) {
    const at = ADDR.test(split || '') && ADDR.test(oldWallet || '') ? getShelterCall(split, oldWallet, '<rpc url>') : 'cast call <split> "getShelter(address)((address,uint16,bool,string))" <old wallet> --rpc-url <rpc url>';
    problems.push(`--name is required: pass the name registered on chain now (the last field of: ${at})`);
  }
  else if (Buffer.byteLength(name, 'utf8') > 64) problems.push('name is over 64 bytes (ShelterSplit MAX_NAME_BYTES)');
  else if (/["\\$`]/.test(name)) problems.push('name must not contain quotes, backslashes, $ or backticks (it is pasted into a shell)');
  if (!(Number.isInteger(bps) && bps > 0 && bps <= 10000)) problems.push('bps must be 1..10000');
  if (problems.length) return { ok: false, lines, problems };

  const net = findNetwork(chainId, chains ?? readJson(join(TRACK_DIR, 'chains.json'), {}));
  const rpc = net?.rpcEnv ? `"$${net.rpcEnv}"` : '<rpc url>';
  const as = '--account <split owner keystore>';
  lines.push(`Shelter handover on ${net ? `${net.chain} ${net.network}` : 'chain'} ${chainId} (DRY RUN: nothing is sent; the split owner runs these)`);
  lines.push(`  split ${split}`);
  lines.push(`  from  ${oldWallet}  (held by Token Tails)`);
  lines.push(`  to    ${newWallet}  (the shelter's own wallet)`);
  lines.push('');
  lines.push('0. Before: the shelter proves it controls --to (a signed message or a small test transfer back).');
  lines.push(`   Check the name you passed matches the registered one (last field): ${getShelterCall(split, oldWallet, rpc)}`);
  lines.push(`1. cast send ${split} "pause()" --rpc-url ${rpc} ${as}`);
  lines.push(`2. cast send ${split} "removeShelter(address)" ${oldWallet} --rpc-url ${rpc} ${as}`);
  lines.push(`3. cast send ${split} "addShelter(address,uint16,string)" ${newWallet} ${bps} "${name}" --rpc-url ${rpc} ${as}`);
  lines.push(`4. cast send ${split} "unpause()" --rpc-url ${rpc} ${as}`);
  lines.push(`5. cast call ${split} "preview(uint256)(address[],uint256[],uint256)" 1000000 --rpc-url ${rpc}`);
  lines.push(`   expect: [${newWallet}] [${Math.floor((1000000 * bps) / 10000)}] ${1000000 - Math.floor((1000000 * bps) / 10000)}${bps === 10000 ? '  (toTreasury must be 0, or router gifts revert)' : '  (toTreasury > 0: router gifts will revert by design)'}`);
  lines.push('');
  lines.push('After (founder steps, not automated): move any balance left in the old wallet to the shelter, update');
  lines.push('facts.json C-001 campaign.shelter (wallet, handover, fromBlock) and the Pink Paw handover facts, run');
  lines.push('`fund facts build`, then switch on the public paths (NEXT_PUBLIC_WALLET_DONATE, SHELTER_HANDED_OVER).');
  return { ok: true, lines, problems };
}
