// act: turn a decision into a `cast send` to CappedSpender.give(uint256,string).
// Default: DRY RUN, print the command only. The founder runs it with their own Foundry keystore
// (--account <keystore>); this code never sees a key.
// --fork: send to a LOCAL anvil fork with an unlocked anvil dev account (--unlocked --from <agent>).
// The fork guard refuses any RPC that is not localhost/127.0.0.1, so --fork can never reach a live chain.

import { execFile } from 'node:child_process';
import { decodeRevert, formatUnits, parseUnits } from './lib/abi.mjs';

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

function runCast(args, { execImpl = execFile } = {}) {
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
