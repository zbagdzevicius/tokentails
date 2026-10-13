// Match desk receipts: a hashed body (no timestamp, no model text) inside an unhashed envelope.
// sha256 = hex SHA-256 of canonical(body) (log.mjs). The memo carries its first 8 hex, so the same gifts
// with the same amount under the same policy always give the same memo: sends are idempotent.
// Envelopes live in <MATCH_DESK_DIR>/<chainId>-desk-<key>/receipts/<sha256>.json, one directory per desk
// (key = the first 12 hex of sha256 over the sorted vault addresses). See MATCH-DESK.md, "Receipt" and
// "State directory".

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { canonical } from '../log.mjs';
import { microToRaw } from './abi.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STATE_DIR = path.join(HERE, '..', 'runs', 'match-desk');
export const PUBLISHED_STATEMENT = path.resolve(HERE, '../../../client/public/match-desk/statement.json');

export const RECEIPT_TYPE = 'tt.match-desk.receipt';
export const MEMO_MAX_BYTES = 44;
export const STATUSES = Object.freeze(['planned', 'sent', 'reconciled', 'failed', 'expired', 'skipped-duplicate', 'mismatch']);
export const MODES = Object.freeze(['send', 'fork', 'dry-run']);

const ADDR = /^0x[0-9a-f]{40}$/;
const INT_STR = /^(0|[1-9]\d*)$/;

/** Throws unless the body holds only strings, safe integers, booleans, null, arrays and plain objects. */
export function assertPlain(value, at = 'body') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${at}: ${value} is not a safe integer (no floats in a receipt)`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertPlain(v, `${at}[${i}]`));
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) throw new Error(`${at}.${k} is undefined`);
      assertPlain(v, `${at}.${k}`);
    }
    return;
  }
  throw new Error(`${at}: ${typeof value} is not allowed in a receipt`);
}

/**
 * The hashed receipt body for one checked match.
 * @param o.sponsor     normalized sponsor (lib/policy.mjs)
 * @param o.policyHash  sha256 hex of the policy
 * @param o.check       expectedMatch() result (ok: true)
 * @param o.unitDecimals spender units (18 native)
 */
export function buildReceiptBody({ sponsor, policyHash, check, unitDecimals }) {
  const share = new Map(check.perGift.map((r) => [r.id, r.matchMicro]));
  const body = {
    type: RECEIPT_TYPE,
    v: 1,
    sponsor: sponsor.sponsor.id,
    chainId: sponsor.chainId,
    spender: sponsor.spender.address.toLowerCase(),
    split: sponsor.split.toLowerCase(),
    policySha256: policyHash,
    ratioBps: sponsor.policy.ratioBps,
    gifts: check.gifts.map((g) => ({
      id: g.id,
      tx: g.tx.toLowerCase(),
      logIndex: g.logIndex,
      block: g.block,
      batchId: String(g.batchId),
      kind: g.kind,
      donor: g.donor ? g.donor.toLowerCase() : null,
      day: g.day,
      giftMicro: BigInt(g.giftMicro).toString(),
      matchMicro: share.get(g.id).toString(),
    })),
    uncappedMicro: check.uncappedMicro.toString(),
    amountMicro: check.amountMicro.toString(),
    amountRaw: microToRaw(check.amountMicro, unitDecimals).toString(),
    unitDecimals,
    clampedBy: check.clampedBy,
  };
  validateBody(body);
  return body;
}

export function validateBody(body) {
  assertPlain(body);
  if (body.type !== RECEIPT_TYPE || body.v !== 1) throw new Error('receipt: wrong type or version');
  if (!ADDR.test(body.spender) || !ADDR.test(body.split)) throw new Error('receipt: addresses must be lowercase 0x addresses');
  for (const k of ['uncappedMicro', 'amountMicro', 'amountRaw']) if (!INT_STR.test(body[k])) throw new Error(`receipt: ${k} must be a decimal integer string`);
  for (const g of body.gifts) {
    if (!INT_STR.test(g.giftMicro) || !INT_STR.test(g.matchMicro)) throw new Error('receipt: gift amounts must be decimal integer strings');
    if (g.donor !== null && !ADDR.test(g.donor)) throw new Error('receipt: donor must be lowercase');
  }
}

export const receiptSha = (body) => createHash('sha256').update(canonical(body), 'utf8').digest('hex');

/** tt:agent:m:<sponsor.id>:<sha256[0:8]>, at most 44 bytes (CappedSpender BadMemo / ShelterSplit MemoTooLong safe). */
export function memoFor(sponsorId, sha) {
  if (!/^[a-z0-9-]{1,24}$/.test(sponsorId)) throw new Error('sponsor id must match ^[a-z0-9-]{1,24}$');
  if (!/^[0-9a-f]{8}/.test(sha)) throw new Error('sha must be hex');
  const memo = `tt:agent:m:${sponsorId}:${sha.slice(0, 8)}`;
  if (Buffer.byteLength(memo) > MEMO_MAX_BYTES) throw new Error('memo too long');
  return memo;
}

export const demoMemo = (sponsorId) => `tt:agent:m:${sponsorId}:demo-overcap`;
export const sponsorMemoPrefix = (sponsorId) => `tt:agent:m:${sponsorId}:`;

export function newEnvelope({ body, sponsorId, mode, decision, now = Date.now() }) {
  if (!MODES.includes(mode)) throw new Error(`mode must be ${MODES.join(' | ')}`);
  const sha = receiptSha(body);
  const at = new Date(now).toISOString();
  return {
    receipt: body,
    sha256: sha,
    memo: memoFor(sponsorId, sha),
    mode,
    status: 'planned',
    createdAt: at,
    updatedAt: at,
    decision,
    tx: { hash: null, block: null, status: null },
    witness: null,
  };
}

/** Move an envelope to a new status (mutates and returns it). */
export function setStatus(env, status, patch = {}, now = Date.now()) {
  if (!STATUSES.includes(status)) throw new Error(`unknown receipt status ${status}`);
  Object.assign(env, patch);
  env.status = status;
  env.updatedAt = new Date(now).toISOString();
  return env;
}

/** The envelope's hash matches its body (a tampered or hand-edited body fails). */
export function verifyEnvelope(env) {
  try {
    return !!env && typeof env.sha256 === 'string' && receiptSha(env.receipt) === env.sha256;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ state directory

/** The v1 (one-vault) state directory: <base>/<chainId>-<spender>. Read for migration only. */
export const stateDir = (base, chainId, spender) => path.join(base || DEFAULT_STATE_DIR, `${chainId}-${String(spender).toLowerCase()}`);

/** The desk key: first 12 hex of sha256 over the sorted, lowercase vault addresses joined by ",". */
export function deskKey(vaults) {
  const list = [...new Set(vaults.map((a) => String(a).toLowerCase()))].sort();
  return createHash('sha256').update(list.join(','), 'utf8').digest('hex').slice(0, 12);
}

/** The desk state directory: <base>/<chainId>-desk-<deskKey(vaults)>. */
export const deskStateDir = (base, chainId, vaults) => path.join(base || DEFAULT_STATE_DIR, `${chainId}-desk-${deskKey(vaults)}`);

/**
 * Directories on the same chain whose receipts this desk must also honour: every v1 directory of one of
 * its vaults (<chainId>-<vault>) and every other desk directory on the chain (<chainId>-desk-*), e.g. the
 * one-vault desk that existed before a second sponsor was added. Read-only: a receipt found there is
 * copied into this desk's directory the first time it is saved again (witness, status change).
 */
export async function siblingDirs(dir) {
  const base = path.dirname(dir);
  const name = path.basename(dir);
  const chain = name.slice(0, name.indexOf('-'));
  let names = [];
  try {
    names = await readdir(base);
  } catch {
    return [];
  }
  return names
    .filter((n) => n !== name && n.startsWith(`${chain}-`) && (/^\d+-0x[0-9a-f]{40}$/.test(n) || /^\d+-desk-[0-9a-f]{12}$/.test(n)))
    .sort()
    .map((n) => path.join(base, n));
}

/**
 * The desk's envelopes: its own directory first, then any sibling directory's envelope for one of the
 * desk's vaults that this directory does not have yet. A gift matched by any vault of this desk, under any
 * earlier layout, stays matched. Also merges flagged.json and orphan-acks.json (this directory wins).
 * Returns { envelopes, bad, imported, flagged, orphanAcks }.
 */
export async function loadDeskState(dir, vaults) {
  const want = new Set(vaults.map((a) => String(a).toLowerCase()));
  const own = await loadEnvelopes(dir);
  const bySha = new Map(own.envelopes.map((e) => [e.sha256, e]));
  let imported = 0;
  const flagged = {};
  const orphanAcks = {};
  for (const sib of await siblingDirs(dir)) {
    const { envelopes } = await loadEnvelopes(sib);
    for (const e of envelopes) {
      if (!want.has(e.receipt.spender) || bySha.has(e.sha256)) continue;
      bySha.set(e.sha256, e);
      imported++;
    }
    Object.assign(flagged, await readJson(path.join(sib, 'flagged.json'), {}));
    Object.assign(orphanAcks, await readJson(path.join(sib, 'orphan-acks.json'), {}));
  }
  Object.assign(flagged, await readJson(path.join(dir, 'flagged.json'), {}));
  Object.assign(orphanAcks, await readJson(path.join(dir, 'orphan-acks.json'), {}));
  return { envelopes: [...bySha.values()], bad: own.bad, imported, flagged, orphanAcks };
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, file);
}

export async function saveEnvelope(dir, env) {
  await writeJsonAtomic(path.join(dir, 'receipts', `${env.sha256}.json`), env);
}

/** Every envelope in <dir>/receipts whose hash verifies (others are returned in `bad`). */
export async function loadEnvelopes(dir) {
  const out = [];
  const bad = [];
  let names = [];
  try {
    names = (await readdir(path.join(dir, 'receipts'))).filter((n) => n.endsWith('.json'));
  } catch {
    return { envelopes: out, bad };
  }
  for (const n of names.sort()) {
    try {
      const env = JSON.parse(await readFile(path.join(dir, 'receipts', n), 'utf8'));
      if (verifyEnvelope(env) && n === `${env.sha256}.json`) out.push(env);
      else bad.push({ file: n, reason: 'hash mismatch' });
    } catch (e) {
      bad.push({ file: n, reason: e.message });
    }
  }
  return { envelopes: out, bad };
}

/**
 * Receipts already published in statement.json for these vaults (so a lost state dir never reopens them).
 * `spenders`: one address or a list. Reads the v1 statement (contract.spender) and the desk statement
 * (sponsors[].vault.spender); only envelopes whose body names one of the vaults are returned.
 */
export async function loadPublished(file, spenders) {
  const want = new Set([].concat(spenders).map((a) => String(a).toLowerCase()));
  try {
    const st = JSON.parse(await readFile(file, 'utf8'));
    const published = new Set();
    if (st?.contract?.spender) published.add(String(st.contract.spender).toLowerCase());
    for (const s of Array.isArray(st?.sponsors) ? st.sponsors : []) if (s?.vault?.spender) published.add(String(s.vault.spender).toLowerCase());
    if (![...want].some((a) => published.has(a))) return [];
    return (st.receipts || []).filter((e) => verifyEnvelope(e) && want.has(String(e.receipt?.spender).toLowerCase()));
  } catch {
    return [];
  }
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export const writeJson = writeJsonAtomic;
