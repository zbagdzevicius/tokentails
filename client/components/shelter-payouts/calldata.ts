import { keccak256, keccakUtf8, toChecksumAddress } from "./keccak";

// Hand-rolled ABI encoding for ShelterSplit.donate(string memo), so the wallet button needs no web3
// dependency. The selector is keccak256("donate(string)")[0:4], checked in
// __test__/shelter-calldata.test.ts against @noble/hashes and against ethers' output.
export const DONATE_SELECTOR = "0xb5aebc80";

// Memos go on a public chain forever. They carry a source tag, never personal data.
export const MAX_MEMO_BYTES = 64;

const pad64 = (hex: string) => hex.padStart(64, "0");

function utf8Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

// donate(string): selector, offset of the string (0x20), its byte length, then the bytes
// right-padded to a multiple of 32.
export function encodeDonateCalldata(memo: string): string {
  const bytes = utf8Hex(memo);
  const len = bytes.length / 2;
  if (len > MAX_MEMO_BYTES) throw new Error(`memo is longer than ${MAX_MEMO_BYTES} bytes`);
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  return DONATE_SELECTOR + pad64("20") + pad64(len.toString(16)) + padded;
}

// Decimal wei string -> 0x quantity for JSON-RPC (no leading zeros, "0x0" for zero).
export function toQuantity(wei: bigint | string): string {
  const v = typeof wei === "bigint" ? wei : BigInt(wei);
  if (v < BigInt(0)) throw new Error("negative amount");
  return "0x" + v.toString(16);
}

// Human amount ("1.5") -> base units, e.g. parseUnits("1.5", 18). Rejects more fractional digits
// than the coin has.
export function parseUnits(amount: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(amount.trim());
  if (!m) throw new Error(`not an amount: ${amount}`);
  const frac = m[2] || "";
  if (frac.length > decimals) throw new Error(`more than ${decimals} decimals`);
  return BigInt(m[1] + frac.padEnd(decimals, "0"));
}

// ---------------------------------------------------------------- DonateRouter (feature F1)
// Selectors are keccak256(signature)[0:4], pinned here and checked in
// __test__/shelter-router-calldata.test.ts against keccak and against `cast sig`.

/** DonateRouter.donateNative(string memo) payable: the unchecked form (pays the current list). */
export const DONATE_NATIVE_SELECTOR = "0x416f3ac4";
/** DonateRouter.donateNative(string memo, bytes32 expectedRecipients) payable. */
export const DONATE_NATIVE_CHECKED_SELECTOR = "0xcf1f2d13";
/** ShelterSplit.disburse(uint256 amount, string memo). */
export const DISBURSE_SELECTOR = "0xc950e7d9";
/** DonateRouter.authNonce(bytes32 salt, string memo, bytes32 recipients) view. */
export const AUTH_NONCE_SELECTOR = "0x8a7ae4e2";
/** DonateRouter.recipientsHash(uint256 amount) view returns (bytes32). */
export const RECIPIENTS_HASH_SELECTOR = "0xbd8e8b98";
/** DonateRouter.canDonate(uint256 amount) view returns (bool ok, uint256 toTreasury). */
export const CAN_DONATE_SELECTOR = "0xdd8fca6a";
/** DonateRouter.donateWithAuthorization((address,uint256,uint256,uint256,bytes32,bytes32),string,bytes). */
export const DONATE_WITH_AUTH_SELECTOR = "0x6b115c74";
/** ERC-20 name(), version(), decimals(), balanceOf(address). */
export const NAME_SELECTOR = "0x06fdde03";
export const VERSION_SELECTOR = "0x54fd4d50";
export const DECIMALS_SELECTOR = "0x313ce567";
export const BALANCE_OF_SELECTOR = "0x70a08231";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_HEX = /^0x[0-9a-fA-F]{40}$/;

const uintWord = (v: bigint | number | string) => {
  const n = BigInt(v);
  if (n < BigInt(0)) throw new Error("negative uint");
  const h = n.toString(16);
  if (h.length > 64) throw new Error("uint256 overflow");
  return pad64(h);
};
const addressWord = (a: string) => {
  if (!ADDRESS_HEX.test(a)) throw new Error(`not an address: ${a}`);
  return pad64(a.slice(2).toLowerCase());
};
const bytes32Word = (b: string) => {
  if (!BYTES32.test(b)) throw new Error(`not bytes32: ${b}`);
  return b.slice(2).toLowerCase();
};

/** ABI tail of a dynamic `bytes`/`string`: length word, then the bytes right-padded to 32. */
function dynTail(hexBytes: string): string {
  const len = hexBytes.length / 2;
  return pad64(len.toString(16)) + hexBytes.padEnd(Math.ceil(hexBytes.length / 64) * 64, "0");
}

function memoHex(memo: string): string {
  const bytes = utf8Hex(memo);
  if (bytes.length / 2 > MAX_MEMO_BYTES) throw new Error(`memo is longer than ${MAX_MEMO_BYTES} bytes`);
  return bytes;
}

/**
 * donateNative(memo, expectedRecipients): the router splits msg.value through ShelterSplit.donate and
 * reverts if the payout list no longer hashes to expectedRecipients. Without it, the unchecked
 * donateNative(memo).
 */
export function encodeDonateNativeCalldata(memo: string, expectedRecipients?: string): string {
  if (expectedRecipients === undefined) return DONATE_NATIVE_SELECTOR + pad64("20") + dynTail(memoHex(memo));
  return DONATE_NATIVE_CHECKED_SELECTOR + pad64("40") + bytes32Word(expectedRecipients) + dynTail(memoHex(memo));
}

/** disburse(uint256 amount, string memo). */
export function encodeDisburseCalldata(amount: bigint | string, memo: string): string {
  return DISBURSE_SELECTOR + uintWord(amount) + pad64("40") + dynTail(memoHex(memo));
}

/** authNonce(bytes32 salt, string memo, bytes32 recipients) for an eth_call cross-check. */
export function encodeAuthNonceCall(salt: string, memo: string, recipients: string): string {
  return AUTH_NONCE_SELECTOR + bytes32Word(salt) + pad64("60") + bytes32Word(recipients) + dynTail(memoHex(memo));
}

/** recipientsHash(uint256 amount): the payout list a gift of `amount` would pay right now. */
export function encodeRecipientsHashCall(amount: bigint | string): string {
  return RECIPIENTS_HASH_SELECTOR + uintWord(amount);
}

/** Decodes a bytes32 return value (recipientsHash, authNonce). */
export function decodeBytes32(ret: string): string {
  const data = ret.startsWith("0x") ? ret.slice(2) : ret;
  if (!/^[0-9a-fA-F]{64}/.test(data)) throw new Error("expected a bytes32 return value");
  return "0x" + data.slice(0, 64).toLowerCase();
}

/** canDonate(uint256 amount). */
export function encodeCanDonateCall(amount: bigint | string): string {
  return CAN_DONATE_SELECTOR + uintWord(amount);
}

/** balanceOf(address). */
export function encodeBalanceOfCall(owner: string): string {
  return BALANCE_OF_SELECTOR + addressWord(owner);
}

export interface RouterAuthorization {
  from: string;
  value: bigint | string;
  validAfter: bigint | number | string;
  validBefore: bigint | number | string;
  salt: string;
  memo: string;
  /** router.recipientsHash(value) when the donor signs: the payout list is part of the signature. */
  recipients: string;
}

/**
 * donateWithAuthorization(gift, memo, signature) with gift = (from, value, validAfter, validBefore,
 * salt, recipients), a static tuple encoded inline in the head. The relay builds this on the server; the
 * donor's wallet sends the same bytes when it submits a signed gift itself.
 */
export function encodeDonateWithAuthorizationCalldata(auth: RouterAuthorization, signature: string): string {
  const memo = memoHex(auth.memo);
  if (!/^0x([0-9a-fA-F]{2})*$/.test(signature)) throw new Error("signature is not hex bytes");
  const sig = signature.slice(2);
  const head = 8 * 32;
  const memoTail = dynTail(memo);
  const memoOffset = head;
  const sigOffset = head + memoTail.length / 2;
  return (
    DONATE_WITH_AUTH_SELECTOR +
    addressWord(auth.from) +
    uintWord(auth.value) +
    uintWord(auth.validAfter) +
    uintWord(auth.validBefore) +
    bytes32Word(auth.salt) +
    bytes32Word(auth.recipients) +
    pad64(memoOffset.toString(16)) +
    pad64(sigOffset.toString(16)) +
    memoTail +
    dynTail(sig)
  );
}

/** Decodes an ABI-encoded `string` return value (name(), version()). */
export function decodeAbiString(ret: string): string {
  const data = ret.startsWith("0x") ? ret.slice(2) : ret;
  if (data.length < 128) throw new Error("return data is too short for a string");
  const offset = Number(BigInt("0x" + data.slice(0, 64)));
  const len = Number(BigInt("0x" + data.slice(offset * 2, offset * 2 + 64)));
  const start = offset * 2 + 64;
  const hex = data.slice(start, start + len * 2);
  if (hex.length !== len * 2) throw new Error("string return data is truncated");
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

/** Decodes canDonate's (bool ok, uint256 toTreasury). */
export function decodeCanDonate(ret: string): { ok: boolean; toTreasury: bigint } {
  const data = ret.startsWith("0x") ? ret.slice(2) : ret;
  if (data.length < 128) throw new Error("canDonate returned too little data");
  return { ok: BigInt("0x" + data.slice(0, 64)) !== BigInt(0), toTreasury: BigInt("0x" + data.slice(64, 128)) };
}

/**
 * The EIP-3009 nonce the router binds to (salt, memo, recipients): keccak256(abi.encode(router,
 * keccak256(memo), salt, recipients)), the same as DonateRouter.authNonce. A relayer can neither change
 * the memo nor redeem the signature anywhere but this router, and if the shelter list changes after
 * signing the router reverts (RecipientsChanged) instead of paying the new list.
 */
export function authNonce(router: string, salt: string, memo: string, recipients: string): string {
  return keccak256(
    "0x" + addressWord(router) + keccakUtf8(memo).slice(2) + bytes32Word(salt) + bytes32Word(recipients)
  );
}

/** The USDC EIP-712 domain, read on-chain from name() and version() (see wallet.readUsdcDomain). */
export interface UsdcDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

/**
 * The typed data a donor signs with eth_signTypedData_v4: a USDC ReceiveWithAuthorization whose payee
 * is the router and whose nonce is authNonce(router, salt, memo, recipients). Numbers are decimal strings, the
 * form every wallet accepts.
 */
export function receiveWithAuthorizationTypedData(domain: UsdcDomain, router: string, auth: RouterAuthorization) {
  return {
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization" as const,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: toChecksumAddress(domain.verifyingContract),
    },
    message: {
      from: toChecksumAddress(auth.from),
      to: toChecksumAddress(router),
      value: BigInt(auth.value).toString(),
      validAfter: BigInt(auth.validAfter).toString(),
      validBefore: BigInt(auth.validBefore).toString(),
      nonce: authNonce(router, auth.salt, auth.memo, auth.recipients),
    },
  };
}

// Computed on first use, not at import: some test environments load this module without TextEncoder.
const rwaTypehash = () =>
  keccakUtf8(
    "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
  );
const domainTypehash = () => keccakUtf8("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

/**
 * The EIP-712 digest of that typed data (what the wallet actually signs). The page does not need it to
 * give; it pins the builder in a unit test against a vector signed by an anvil dev account.
 */
export function receiveWithAuthorizationDigest(domain: UsdcDomain, router: string, auth: RouterAuthorization): string {
  const td = receiveWithAuthorizationTypedData(domain, router, auth);
  const domainSeparator = keccak256(
    domainTypehash() +
      keccakUtf8(td.domain.name).slice(2) +
      keccakUtf8(td.domain.version).slice(2) +
      uintWord(td.domain.chainId) +
      addressWord(td.domain.verifyingContract)
  );
  const m = td.message;
  const structHash = keccak256(
    rwaTypehash() +
      addressWord(m.from) +
      addressWord(m.to) +
      uintWord(m.value) +
      uintWord(m.validAfter) +
      uintWord(m.validBefore) +
      bytes32Word(m.nonce)
  );
  return keccak256("0x1901" + domainSeparator.slice(2) + structHash.slice(2));
}

// Tokens whose version() is missing (USDG on Robinhood Chain): the EIP-712 version is recovered by
// matching DOMAIN_SEPARATOR(), and the EIP-3009 support is probed with authorizationState().
export const DOMAIN_SEPARATOR_SELECTOR = "0x3644e515";
export const AUTHORIZATION_STATE_SELECTOR = "0xe94a0102";

/** authorizationState(address authorizer, bytes32 nonce): every EIP-3009 token has it. */
export function encodeAuthorizationStateCall(authorizer: string, nonce: string): string {
  return AUTHORIZATION_STATE_SELECTOR + addressWord(authorizer) + bytes32Word(nonce);
}

/** The EIP-712 domain separator of a (name, version, chainId, verifyingContract) domain. */
export function eip712DomainSeparator(domain: UsdcDomain): string {
  return keccak256(
    domainTypehash() +
      keccakUtf8(domain.name).slice(2) +
      keccakUtf8(domain.version).slice(2) +
      uintWord(domain.chainId) +
      addressWord(domain.verifyingContract)
  );
}

// The router's split and the split's payout list, read before a real-money gift so the page can check
// who would be paid (wallet.readPayoutWallets). Selectors checked against `cast sig`.
export const SPLIT_SELECTOR = "0xf7654176"; // split()
export const PREVIEW_SELECTOR = "0xc317c377"; // preview(uint256)
export const SYMBOL_SELECTOR = "0x95d89b41"; // symbol()

/** preview(uint256 amount). */
export function encodePreviewCall(amount: bigint | string): string {
  return PREVIEW_SELECTOR + uintWord(amount);
}

/** Decodes an `address` return value (router.split()). */
export function decodeAddress(ret: string): string {
  const data = ret.startsWith("0x") ? ret.slice(2) : ret;
  if (!/^[0-9a-fA-F]{64}/.test(data)) throw new Error("expected an address return value");
  return "0x" + data.slice(24, 64).toLowerCase();
}

/** Decodes ShelterSplit.preview's (address[] wallets, uint256[] amounts, uint256 toTreasury). */
export function decodePreview(ret: string): { wallets: string[]; amounts: bigint[]; toTreasury: bigint } {
  const data = ret.startsWith("0x") ? ret.slice(2) : ret;
  if (data.length < 192 || /[^0-9a-fA-F]/.test(data)) throw new Error("preview returned too little data");
  const word = (byteOffset: number) => {
    const w = data.slice(byteOffset * 2, byteOffset * 2 + 64);
    if (w.length !== 64) throw new Error("preview data is truncated");
    return BigInt("0x" + w);
  };
  const array = (offset: number) => {
    const n = Number(word(offset));
    if (n > 256) throw new Error("preview lists too many wallets");
    return Array.from({ length: n }, (_, i) => word(offset + 32 + i * 32));
  };
  const wallets = array(Number(word(0))).map((w) => "0x" + w.toString(16).padStart(40, "0"));
  const amounts = array(Number(word(32)));
  if (wallets.length !== amounts.length) throw new Error("preview wallets and amounts differ in length");
  return { wallets, amounts, toTreasury: word(64) };
}

/**
 * DonateRouter.recipientsHash computed locally from a preview: keccak256(abi.encode(address[] wallets,
 * uint256[] amounts)). The custody guard checks the wallets of one preview read, and the gift is signed
 * only when the router's recipientsHash equals this hash of that same read, so the list the donor signs
 * is exactly the list that passed the guard (no gap between the two reads).
 */
export function recipientsHashOf(wallets: string[], amounts: bigint[]): string {
  if (wallets.length !== amounts.length) throw new Error("wallets and amounts differ in length");
  const n = wallets.length;
  const lenWord = pad64(n.toString(16));
  const head = pad64("40") + pad64((0x40 + 32 * (1 + n)).toString(16));
  const ws = wallets.map((w) => addressWord(w)).join("");
  const as = amounts.map((a) => uintWord(a)).join("");
  return keccak256("0x" + head + lenWord + ws + lenWord + as);
}
