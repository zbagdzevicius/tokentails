// act: turn a decision into a `cast send` to CappedSpender.give(uint256,string).
// Default: DRY RUN, print the command only. The founder runs it with their own Foundry keystore
// (--account <keystore>); this code never sees a key.
// --fork: send to a LOCAL anvil fork with an unlocked anvil dev account (--unlocked --from <agent>).
// The fork guard refuses any RPC that is not localhost/127.0.0.1, so --fork can never reach a live chain.

import { execFile, spawn } from 'node:child_process';
import { decodeRevert, formatUnits, parseUnits } from './lib/abi.mjs';
import { GuardError } from './lib/policy.mjs';

export const GIVE_SIG = 'give(uint256,string)';

const shq = (s) => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

export function isLocalRpc(url) {
  try {
    const u = new URL(url);
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * The cast argv for one gift.
 * @param {object} o
 * @param {string} o.spender  CappedSpender address
 * @param {bigint} o.amountRaw  raw units (18 decimals native, token decimals otherwise)
 * @param {string} o.memo  full memo, starts with tt:agent:
 * @param {string} o.rpc  RPC URL used for --rpc-url (for printing, pass a placeholder such as "$TREAT_AGENT_RPC")
 * @param {string} [o.keystore]  Foundry keystore name (dry run / founder)
 * @param {boolean} [o.fork]  local anvil fork: --unlocked --from <from>
 * @param {string} [o.from]  the agent address on the fork
 */
export function buildCastArgs({ spender, amountRaw, memo, rpc, keystore = '<keystore>', fork = false, from }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(spender)) throw new Error('spender must be an address');
  if (typeof amountRaw !== 'bigint' || amountRaw <= 0n) throw new Error('amountRaw must be a positive bigint');
  if (!memo.startsWith('tt:agent:')) throw new Error('memo must start with tt:agent:');
  const args = ['send', spender, GIVE_SIG, amountRaw.toString(), memo, '--rpc-url', rpc];
  if (fork) {
    if (!from) throw new Error('--fork needs the agent address (--from)');
    args.push('--unlocked', '--from', from);
  } else {
    args.push('--account', keystore);
  }
  return args;
}

export const formatCommand = (args) => ['cast', ...args].map(shq).join(' ');

/** Raw units for a USDC decision amount given the spender's unit decimals. */
export const toRaw = (amountUsdc, decimals) => parseUnits(amountUsdc, decimals);

export function runCast(args, { execImpl = execFile } = {}) {
  return new Promise((resolve) => {
    execImpl('cast', [...args, '--json'], { env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' }, timeout: 120_000 }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/**
 * Executes (fork) or prints (dry run) one decision.
 * Returns { mode, command, txHash?, status?, revert?, error? }.
 */
export async function act(decision, { spender, rpc, rpcDisplay, unitDecimals, keystore, fork = false, from, execImpl } = {}) {
  if (decision.action !== 'give') return { mode: 'none' };
  const amountRaw = toRaw(decision.amountUsdc, unitDecimals);
  const shown = buildCastArgs({ spender, amountRaw, memo: decision.memo, rpc: rpcDisplay || rpc, keystore, fork, from });
  const out = {
    mode: fork ? 'fork' : 'dry-run',
    amountRaw: amountRaw.toString(),
    amountUsdc: formatUnits(amountRaw, unitDecimals),
    command: formatCommand(shown),
  };
  if (!fork) return out;
  if (!isLocalRpc(rpc)) throw new Error(`--fork only sends to a local anvil RPC, not ${new URL(rpc).host}`);

  const args = buildCastArgs({ spender, amountRaw, memo: decision.memo, rpc, fork: true, from });
  const { err, stdout, stderr } = await runCast(args, { execImpl });
  if (err) {
    const text = `${stderr}\n${stdout}\n${err.message || ''}`;
    out.status = 'reverted';
    out.revert = decodeRevert(text);
    out.error = (stderr || err.message || '').trim().split('\n').slice(-3).join(' ').slice(0, 400);
    return out;
  }
  try {
    const receipt = JSON.parse(stdout);
    out.txHash = receipt.transactionHash;
    out.status = receipt.status === '0x1' || receipt.status === 1 || receipt.status === '1' ? 'success' : 'reverted';
    out.block = receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : undefined;
  } catch {
    out.status = 'unknown';
    out.error = stdout.slice(0, 400);
  }
  return out;
}

// ================================================================== match desk (MATCH-DESK.md, "Act")

/** Chains --send may reach: Arc mainnet and Arc testnet. */
export const SEND_CHAIN_IDS = Object.freeze([5042, 5042002]);
export const MINED_REVERT_GAS = 300000;

/**
 * Gates for --send. Returns null when every gate passes, else the reason (run.mjs exits 2).
 * The send itself runs in the founder's own terminal: an AI session (CLAUDECODE set) is refused.
 */
export function sendGates({ rpc, chainId, sponsorChainId, once, keystore, env = process.env }) {
  if (env.CLAUDECODE) return '--send is refused in an AI session (CLAUDECODE is set): run it from your own terminal';
  // The statement labels each receipt's text "Claude's reason": a real send must come from Claude, never the stub.
  if (env.TREAT_AGENT_FAKE_LLM === '1' || env.TREAT_AGENT_FAKE_WRONG === '1') return '--send refuses the offline stub: unset TREAT_AGENT_FAKE_LLM and TREAT_AGENT_FAKE_WRONG';
  if (!once) return '--send needs --once (one founder-approved round at a time)';
  if (!keystore || keystore === '<keystore>') return '--send needs --keystore <name> (or TREAT_AGENT_KEYSTORE): a Foundry keystore in your own terminal';
  if (isLocalRpc(rpc)) return '--send is for Arc mainnet or testnet; use --fork for a local anvil';
  if (chainId !== undefined) {
    if (!SEND_CHAIN_IDS.includes(chainId)) return `--send only reaches chains ${SEND_CHAIN_IDS.join(', ')} (eth_chainId is ${chainId})`;
    if (chainId !== sponsorChainId) return `eth_chainId ${chainId} != sponsor.json chainId ${sponsorChainId}`;
    if (chainId === 5042 && env.CONFIRM_MAINNET !== 'yes') return 'Arc mainnet needs CONFIRM_MAINNET=yes';
  }
  return null;
}

/**
 * Runs cast in the founder's terminal: stdin and stderr stay on the TTY (the keystore password prompt),
 * stdout (--json) is captured. This code never sees the key or the password.
 */
export function runCastInteractive(args, { spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl('cast', args, { stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } });
    } catch (e) {
      resolve({ code: -1, stdout: '', error: e.message });
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (d) => {
      stdout += String(d);
    });
    child.on('error', (e) => resolve({ code: -1, stdout, error: e.message }));
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

/** cast call (eth_call, no tx, no gas): the simulation of one give() from the agent. */
export function buildCallArgs({ spender, amountRaw, memo, rpc, from }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(spender)) throw new Error('spender must be an address');
  if (!from) throw new Error('cast call needs --from <agent>');
  return ['call', spender, GIVE_SIG, amountRaw.toString(), memo, '--rpc-url', rpc, '--from', from];
}

function parseReceipt(stdout, out) {
  try {
    const receipt = JSON.parse(stdout);
    out.txHash = receipt.transactionHash;
    out.status = receipt.status === '0x1' || receipt.status === 1 || receipt.status === '1' ? 'success' : 'reverted';
    out.block = receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : undefined;
  } catch {
    out.status = 'unknown';
    out.error = String(stdout).slice(0, 400);
  }
  return out;
}

/**
 * One checked match: dry-run prints, fork sends unlocked on a local anvil, send runs cast with the
 * founder's keystore. Returns { mode, command, amountRaw, status?, txHash?, block?, revert?, error? }.
 */
export async function actMatch({ amountRaw, memo, mode, spender, rpc, rpcDisplay, keystore = '<keystore>', from, execImpl, spawnImpl }) {
  const shown = buildCastArgs({ spender, amountRaw, memo, rpc: rpcDisplay || rpc, keystore, fork: mode === 'fork', from });
  const out = { mode, amountRaw: amountRaw.toString(), command: formatCommand(shown) };
  if (mode === 'dry-run') return out;
  if (mode === 'fork') {
    if (!isLocalRpc(rpc)) throw new Error(`--fork only sends to a local anvil RPC, not ${new URL(rpc).host}`);
    const { err, stdout, stderr } = await runCast(buildCastArgs({ spender, amountRaw, memo, rpc, fork: true, from }), { execImpl });
    if (err) {
      out.status = 'reverted';
      out.revert = decodeRevert(`${stderr}\n${stdout}\n${err.message || ''}`);
      out.error = (stderr || err.message || '').trim().split('\n').slice(-3).join(' ').slice(0, 400);
      return out;
    }
    return parseReceipt(stdout, out);
  }
  if (mode !== 'send') throw new Error(`unknown act mode ${mode}`);
  if (isLocalRpc(rpc)) throw new GuardError('--send refuses a local RPC');
  const { code, stdout, error } = await runCastInteractive([...buildCastArgs({ spender, amountRaw, memo, rpc, keystore }), '--json'], { spawnImpl });
  if (code === -1) {
    // cast never started (spawn error): certainly nothing was broadcast.
    out.status = 'not-sent';
    out.error = error || 'cast could not be started';
    return out;
  }
  if (code !== 0) {
    // cast can exit non-zero after it broadcast (receipt wait timeout, Ctrl-C while waiting), and a
    // keystore or simulation error looks the same from here. Never assume nothing was sent.
    out.status = 'unknown';
    out.error = `cast exited ${code} (see its message above); the tx may or may not have been broadcast`;
    if (stdout.trim()) {
      const parsed = parseReceipt(stdout, { ...out });
      if (parsed.txHash) return parsed;
    }
    return out;
  }
  return parseReceipt(stdout, out);
}

/**
 * The over-cap demonstration amount, chosen in code (the model is not called).
 * - tx:   amount = 2 x perTx, expect OverTxCap(amount, perTx)
 * - day:  needs remainingToday < perTx; amount = perTx, expect OverDailyCap(spent + perTx, daily)
 * - auto: day when remainingToday < perTx, else tx
 */
export function overcapPlan({ perTx, daily, remaining, spent }, kind = 'auto') {
  const k = kind === 'auto' ? (remaining < perTx ? 'day' : 'tx') : kind;
  if (k === 'tx') return { kind: 'tx', amountRaw: 2n * perTx, expect: { name: 'OverTxCap', args: { amount: (2n * perTx).toString(), cap: perTx.toString() } } };
  if (k === 'day') {
    if (!(remaining < perTx)) throw new GuardError(`--overcap-kind day needs less than one gift's cap left today (left ${remaining}, per gift ${perTx}): spend the day first`);
    return { kind: 'day', amountRaw: perTx, expect: { name: 'OverDailyCap', args: { wouldSpend: (spent + perTx).toString(), cap: daily.toString() } } };
  }
  throw new GuardError(`--overcap-kind must be auto, tx or day (got ${kind})`);
}

export const sameRevert = (got, want) =>
  !!got && got.name === want.name && JSON.stringify(got.args) === JSON.stringify(want.args);

/**
 * Run the over-cap demo. Fork: cast send (unlocked). Live with --send: cast call (simulation) or, with
 * minedRevert, cast send --gas-limit 300000 from the keystore (a mined failed tx), then cast call to read
 * the reason. Dry run: prints both commands. status: refused-as-expected | unexpected | printed.
 */
export async function actOvercap({ plan, memo, mode, minedRevert = false, spender, rpc, rpcDisplay, keystore = '<keystore>', from, execImpl, spawnImpl }) {
  const callArgs = (r) => buildCallArgs({ spender, amountRaw: plan.amountRaw, memo, rpc: r, from });
  const sendArgs = (r) => [...buildCastArgs({ spender, amountRaw: plan.amountRaw, memo, rpc: r, keystore }), '--gas-limit', String(MINED_REVERT_GAS)];
  const out = { mode, demo: plan.kind, amountRaw: plan.amountRaw.toString(), expected: plan.expect };
  const judge = (revert) => {
    out.revert = revert;
    out.status = sameRevert(revert, plan.expect) ? 'refused-as-expected' : 'unexpected';
    return out;
  };
  const simulate = async () => {
    const { err, stdout, stderr } = await runCast(callArgs(rpc), { execImpl });
    if (!err) return null; // the call succeeded: no refusal
    return decodeRevert(`${stderr}\n${stdout}\n${err.message || ''}`);
  };
  if (mode === 'dry-run') {
    out.status = 'printed';
    out.command = formatCommand(callArgs(rpcDisplay || rpc));
    out.minedCommand = formatCommand(sendArgs(rpcDisplay || rpc));
    return out;
  }
  if (mode === 'fork') {
    if (!isLocalRpc(rpc)) throw new Error(`--fork only sends to a local anvil RPC, not ${new URL(rpc).host}`);
    out.command = formatCommand(buildCastArgs({ spender, amountRaw: plan.amountRaw, memo, rpc: rpcDisplay || rpc, fork: true, from }));
    const { err, stdout, stderr } = await runCast(buildCastArgs({ spender, amountRaw: plan.amountRaw, memo, rpc, fork: true, from }), { execImpl });
    if (!err) {
      parseReceipt(stdout, out);
      if (out.status === 'success') return judge(null);
    }
    return judge(decodeRevert(`${stderr}\n${stdout}\n${err?.message || ''}`));
  }
  if (mode !== 'send') throw new Error(`unknown act mode ${mode}`);
  if (isLocalRpc(rpc)) throw new GuardError('--send refuses a local RPC');
  if (!minedRevert) {
    out.simulated = true;
    out.command = formatCommand(callArgs(rpcDisplay || rpc));
    return judge(await simulate());
  }
  out.simulated = false;
  out.command = formatCommand(sendArgs(rpcDisplay || rpc));
  const { code, stdout, error } = await runCastInteractive([...sendArgs(rpc), '--json'], { spawnImpl });
  if (code === 0) parseReceipt(stdout, out);
  if (out.status === 'success') return judge(null);
  if (code !== 0 && !out.txHash) out.error = error || `cast exited ${code}`;
  // A mined failed tx carries no reason in its receipt: read it with the same call.
  return judge(await simulate());
}
