// Shared helpers for the testnet end-to-end harness (funding/e2e).
// Safety rules enforced here:
//   - only testnet chain IDs from funding/framework/tracks/a-build/chains.json are accepted;
//   - only a localhost MongoDB URI is accepted;
//   - secrets (keys, tokens) are kept in memory and scrubbed from every message printed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..');
export const BACKEND = join(REPO, 'backend');
export const CLIENT = join(REPO, 'client');
export const OUT = join(HERE, 'out');
export const SECRETS = join(REPO, 'funding', '.secrets');
export const CHAINS_JSON = join(REPO, 'funding', 'framework', 'tracks', 'a-build', 'chains.json');
export const DEPLOYMENTS_JSON =
  process.env.E2E_DEPLOYMENTS || join(REPO, 'funding', 'framework', 'tracks', 'a-build', 'deployments.json');

/** require() resolved from backend/node_modules (ethers, firebase-admin, mongodb, dotenv). */
export const requireBackend = createRequire(join(BACKEND, 'package.json'));

export const ARC_TESTNET = 5042002;
export const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27027/tt-e2e';
export const DEFAULT_BE_URL = 'http://localhost:3105';

/** Public wallet addresses (no keys). */
export const WALLETS = {
  deployer: '0xd6F37D1241dA20BbE40D1210940Bc43A1Ec56263',
  pinkpaw: '0xE299299b846Ba629f5A591dBF4F562bcC07A0f37',
  treasury: '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A',
  donatehot: '0x8D03d8295892F7dE2B7cE57585Aa45Dd4B3C2ba0',
  agent: '0x3333c1661B93f56DeC472eF89ACa03F56E70F9B7',
};

/** The e2e Firebase/test identity. The email domain is reserved (RFC 2606), never a real inbox. */
export const E2E_UID = 'e2e-tester';
export const E2E_EMAIL = process.env.E2E_EMAIL || 'e2e-tester@example.com';
export const E2E_TAG = 'tt-e2e';

// ---------------------------------------------------------------- chain guards

function chainIds() {
  const raw = JSON.parse(readFileSync(CHAINS_JSON, 'utf8'));
  const testnet = new Set();
  const mainnet = new Set();
  for (const [k, c] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    if (c.networks?.testnet?.chainId) testnet.add(Number(c.networks.testnet.chainId));
    if (c.networks?.mainnet?.chainId) mainnet.add(Number(c.networks.mainnet.chainId));
  }
  return { testnet, mainnet };
}

export const CHAIN_IDS = chainIds();

/** Throws unless `id` is a testnet chain ID listed in chains.json and not any mainnet ID. */
export function assertTestnet(id, what = 'chain') {
  const n = Number(id);
  if (!Number.isInteger(n) || CHAIN_IDS.mainnet.has(n) || !CHAIN_IDS.testnet.has(n)) {
    throw new Error(`refusing ${what} ${id}: not a testnet chain ID from chains.json (testnets: ${[...CHAIN_IDS.testnet].join(', ')})`);
  }
  return n;
}

// ---------------------------------------------------------------- local DB guard

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Throws unless `uri` is a plain mongodb:// URI whose every host is localhost. */
export function assertLocalMongoUri(uri) {
  const text = String(uri || '');
  if (!/^mongodb:\/\//.test(text)) throw new Error('refusing MongoDB URI: only mongodb://localhost URIs are allowed (no mongodb+srv)');
  const rest = text.slice('mongodb://'.length);
  const authority = rest.split('/')[0].split('?')[0];
  const hosts = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  for (const h of hosts.split(',')) {
    const host = h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0];
    if (!LOCAL_HOSTS.has(host)) throw new Error('refusing MongoDB URI: host is not localhost');
  }
  const db = rest.split('/')[1]?.split('?')[0] || '';
  if (!db || db === 'tokentails') throw new Error('refusing MongoDB URI: name a throwaway database (for example tt-e2e)');
  return text;
}

// ---------------------------------------------------------------- deployments

export function loadTestnetDeployments() {
  if (!existsSync(DEPLOYMENTS_JSON)) return [];
  const list = JSON.parse(readFileSync(DEPLOYMENTS_JSON, 'utf8').trim() || '[]');
  if (!Array.isArray(list)) throw new Error(`${DEPLOYMENTS_JSON} must be a JSON array`);
  return list.filter((d) => d && d.network === 'testnet' && CHAIN_IDS.testnet.has(Number(d.chainId)) && /^0x[0-9a-fA-F]{40}$/.test(d.address || ''));
}

/** The newest Arc testnet ShelterSplit that pays USDC (not the EURC instance). */
export function arcTestnetSplit(list = loadTestnetDeployments()) {
  const arc = list.filter((d) => Number(d.chainId) === ARC_TESTNET && (!d.token || d.token === 'USDC'));
  arc.sort((a, b) => String(b.recorded || '').localeCompare(String(a.recorded || '')));
  return arc[0] || null;
}

// ---------------------------------------------------------------- secrets

const secrets = new Set();

/** Registers a value that must never be printed. */
export function registerSecret(value) {
  if (typeof value === 'string' && value.length >= 8) {
    secrets.add(value);
    if (value.startsWith('0x')) secrets.add(value.slice(2));
  }
  return value;
}

/** A message with every registered secret, JWT-like string and Bearer value removed. */
export function scrub(text) {
  let out = String(text ?? '');
  for (const s of secrets) out = out.split(s).join('<redacted>');
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<redacted-jwt>');
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '<redacted-key>');
  out = out.replace(/(accesstoken|authorization)(["':\s=]+)[^\s"',}]+/gi, '$1$2<redacted>');
  return out;
}

export function errMsg(e) {
  return scrub(e?.shortMessage || e?.code || e?.message || String(e)).slice(0, 300);
}

/**
 * The private key of a Foundry keystore, read with `cast wallet private-key`. Held in memory and
 * registered as a secret; cast's output is captured, never echoed. The address is checked.
 */
export function keystoreKey(account, expectedAddress) {
  const pw = join(SECRETS, `${account}-password.txt`);
  if (!existsSync(pw)) throw new Error(`missing password file for keystore '${account}' (funding/.secrets/${account}-password.txt)`);
  let key;
  try {
    key = execFileSync('cast', ['wallet', 'private-key', '--account', account, '--password-file', pw], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    throw new Error(`cast could not unlock keystore '${account}' (exit ${e.status ?? '?'})`);
  }
  registerSecret(key);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`keystore '${account}' did not yield a 32-byte key`);
  const { computeAddress } = requireBackend('ethers');
  const addr = computeAddress(key);
  if (expectedAddress && addr.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(`keystore '${account}' is ${addr}, expected ${expectedAddress}`);
  }
  return key;
}

// ---------------------------------------------------------------- local DB seed helpers

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Creates (or refreshes) the registered e2e user the backend resolves for uid `e2e-tester`, plus
 * one saved game, so POST /shelter/donate passes the instant-treat policy: registered, email
 * verified, account older than 24 h, at least one non-Heist game.
 */
export async function ensureE2eUser(db, now = new Date()) {
  const users = db.collection('users');
  const games = db.collection('games');
  const created = new Date(now.getTime() - 2 * DAY_MS);
  await users.updateOne(
    { firebaseUids: E2E_UID },
    {
      $set: {
        name: 'E2E Tester',
        email: E2E_EMAIL.toLowerCase(),
        firebaseUids: [E2E_UID],
        emailVerifiedAt: created,
        isGuest: false,
        e2e: E2E_TAG,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: created },
      $unset: { deletedAt: 1, promotedAt: 1, transient: 1 },
    },
    { upsert: true }
  );
  const user = await users.findOne({ firebaseUids: E2E_UID });
  // Keep createdAt old even if the doc existed (an earlier run on a different day).
  if (!user.createdAt || now.getTime() - new Date(user.createdAt).getTime() < DAY_MS + 60_000) {
    await users.updateOne({ _id: user._id }, { $set: { createdAt: created } });
  }
  if (!(await games.findOne({ user: user._id, type: { $ne: 'CATNIP_HEIST' } }))) {
    await games.insertOne({ type: 'SHELTER', points: 1, score: 1, user: user._id, e2e: E2E_TAG, createdAt: created, updatedAt: created });
  }
  return user._id;
}

/** The data dir start-local.sh gives mongod: `mktemp -d .../tt-e2e-mongo.XXXXXX`. */
const E2E_DBPATH = /(^|\/)tt-e2e-mongo\.[A-Za-z0-9]+\/?$/;

/**
 * Connects to `uri` only if it is a localhost URI AND the mongod behind it runs on a start-local.sh
 * temp data dir. A localhost port can still be an SSH tunnel or a dev mongod holding real data; the
 * dbPath check (getCmdLineOpts) refuses both before anything is read or written.
 */
export async function withLocalDb(uri, fn) {
  assertLocalMongoUri(uri);
  const { MongoClient } = requireBackend('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, directConnection: true });
  await client.connect();
  try {
    let dbPath = '';
    try {
      const opts = await client.db('admin').command({ getCmdLineOpts: 1 });
      dbPath = String(opts?.parsed?.storage?.dbPath || '');
    } catch (e) {
      throw new Error(`refusing MongoDB: could not read the server's dbPath (${e?.codeName || e?.code || 'error'})`);
    }
    if (!E2E_DBPATH.test(dbPath)) {
      throw new Error('refusing MongoDB: the server is not the start-local.sh throwaway mongod (dbPath is not a tt-e2e-mongo.* temp dir)');
    }
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

// ---------------------------------------------------------------- crash-safe files

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Writes `data` to `dest` through a sibling temp file and rename(2), so `dest` is never half written. */
export function atomicWrite(dest, data) {
  const tmp = `${dest}.e2e-tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, dest);
}

/** Copies `src` to `dest` through a sibling temp file and rename(2). */
export function atomicCopy(src, dest) {
  const tmp = `${dest}.e2e-tmp`;
  copyFileSync(src, tmp);
  renameSync(tmp, dest);
}
