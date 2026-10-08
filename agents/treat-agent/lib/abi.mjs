// Minimal ABI helpers for the treat agent. No dependencies: Node has no keccak256, so every selector and
// topic below was computed once with Foundry (`cast sig` / `cast keccak`) and is pinned here. The test
// suite re-derives none of them at runtime; it checks the decoders against hand-built payloads.

export const SEL = Object.freeze({
  remainingToday: '0xfc3c5515',
  spentToday: '0xf059cf2b',
  perTxCap: '0xad82cbea',
  dailyCap: '0xeb339391',
  native: '0x11b0b42d',
  token: '0xfc0c546a',
  floatBalance: '0xf2c70ada',
  decimals: '0x313ce567',
  paused: '0x5c975abb',
  agent: '0xf5ff5c76',
  split: '0xf7654176',
  give: '0xa4f2209a', // give(uint256,string)
  preview: '0xc317c377', // ShelterSplit.preview(uint256)
});

export const TOPIC = Object.freeze({
  // ShelterSplit
  DisbursementBatch: '0x485615214cb30802281e3bce3cf20125c9f665162a889b1a53eec118dd58f603',
  NativeDisbursementBatch: '0x78a8efdcf36fe135a2e17504fdd3d62c603422ba58646612f6f08bcc67d459d9',
  // DonateRouter (optional, TREAT_AGENT_ROUTER)
  RouterDonation: '0xf057bcd6794500ca5bd0ed074e76b7ab595a7b9fdc70b87528191f50eae48a0c', // (address,uint256,uint256,uint8,string,bytes32)
  // CappedSpender
  AgentGift: '0x5936d115a5d03a0687def57892742e7dfee0d3f44321c5b5506b60d8a96fd4cf',
});

/** CappedSpender custom errors by selector, with their argument count (all uint256). */
export const ERRORS = Object.freeze({
  '0x734e76f9': { name: 'OverTxCap', args: ['amount', 'cap'] },
  '0x92ec8899': { name: 'OverDailyCap', args: ['wouldSpend', 'cap'] },
  '0xf2400be7': { name: 'TreasuryShare', args: ['toTreasury'] },
  '0x68de5ce4': { name: 'SplitPaused', args: [] },
  '0xb7176044': { name: 'BadMemo', args: [] },
  '0x0d9ab13f': { name: 'NotAgent', args: [] },
  '0x51dd3741': { name: 'InsufficientFloat', args: ['available', 'amount'] },
  '0x1f2a2005': { name: 'ZeroAmount', args: [] },
});

const strip = (hex) => (hex.startsWith('0x') ? hex.slice(2) : hex);

export function word(hex, i) {
  const h = strip(hex);
  const w = h.slice(i * 64, (i + 1) * 64);
  if (w.length !== 64) throw new Error(`ABI: word ${i} out of range`);
  return w;
}

export const uintAt = (hex, i) => BigInt('0x' + word(hex, i));
export const addressAt = (hex, i) => '0x' + word(hex, i).slice(24);
export const boolAt = (hex, i) => uintAt(hex, i) !== 0n;

/** A dynamic `string` whose head word sits at word index i. */
export function stringAt(hex, i) {
  const h = strip(hex);
  const offset = Number(uintAt(hex, i)) * 2;
  const len = Number(BigInt('0x' + h.slice(offset, offset + 64)));
  const body = h.slice(offset + 64, offset + 64 + len * 2);
  if (body.length !== len * 2) throw new Error('ABI: string out of range');
  return Buffer.from(body, 'hex').toString('utf8');
}

export const topicAddress = (topic) => '0x' + strip(topic).slice(24).toLowerCase();
export const topicUint = (topic) => BigInt(topic);

/** Decode a CappedSpender revert from its raw data (0x + selector + args). Unknown data -> null. */
export function decodeRevert(data) {
  if (typeof data !== 'string') return null;
  // Error text (from cast or an RPC) may contain addresses and hashes too: take the first hex blob
  // whose length is a selector plus whole words and whose selector is a known CappedSpender error.
  for (const m of data.matchAll(/0x([0-9a-fA-F]{8}(?:[0-9a-fA-F]{64})*)(?![0-9a-fA-F])/g)) {
    const hex = m[1].toLowerCase();
    const def = ERRORS['0x' + hex.slice(0, 8)];
    if (!def) continue;
    const rest = hex.slice(8);
    if (rest.length < def.args.length * 64) continue;
    const args = {};
    def.args.forEach((name, i) => {
      args[name] = uintAt(rest, i).toString();
    });
    return { name: def.name, args };
  }
  return null;
}

// ------------------------------------------------------------------ units

/** Raw integer units -> decimal string, e.g. (50000000000000000n, 18) -> "0.05". */
export function formatUnits(raw, decimals) {
  const neg = raw < 0n;
  let v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}

/** Decimal USDC amount (number or string, at most 6 decimals) -> raw integer units. */
export function parseUnits(amount, decimals) {
  const s = typeof amount === 'number' ? amount.toFixed(6) : String(amount);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a decimal amount: ${s}`);
  const [w, f = ''] = s.split('.');
  if (f.replace(/0+$/, '').length > decimals) throw new Error(`more than ${decimals} decimals: ${s}`);
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

export const toUsdc = (raw, decimals) => Number(formatUnits(raw, decimals));
