/**
 * The update gate's policy source (docs/plans/moba/FORCE-UPDATE.md §4.1): may this bundle start, or must it update?
 *
 * 1. The API, `GET <api>/pawlegends/client-policy?…` (2.5 s timeout): the backend merges the signed policy.json with
 *    the sims it replays. It is preferred when it answers.
 * 2. The signed static mirror, `updates/<platform>/<compat>/policy.json` on tokentails.com: asked when the API fails,
 *    or after 1 s if the API is still quiet. Its signature is checked with the OTA key; a bad one is ignored.
 * 3. Nothing reachable (offline): the last good answer kept on the device (`pl.policy.last`, up to 7 days) decides
 *    whether the installed bundle may still play (offlineVerdict).
 *
 * The policy only decides WHETHER to update; what gets installed still comes from the signed manifest (ota.ts).
 * Everything is injected (PolicyDeps), so tests/policy.test.ts drives it without a device.
 */
import {
  canonicalPolicy,
  clientPolicyQueryString,
  decidePolicy,
  effectiveMinSim,
  maintenanceOn,
  parseClientPolicyAnswer,
  parsePolicyFile,
  type ClientPolicyAnswer,
  type ClientPolicyDecision,
  type ClientPolicyQuery,
  type PolicyFile,
  type PolicyMaintenance,
} from '@/shared-contracts/client-policy';
import { verifySigned } from './manifest';
import type { KV } from './ota';

export const POLICY_KEYS = Object.freeze({ last: 'pl.policy.last' });
export const API_TIMEOUT_MS = 2500;
export const MIRROR_DELAY_MS = 1000;
export const MIRROR_TIMEOUT_MS = 4000;
/** A kept answer older than this no longer decides anything offline (the bundle plays with a notice). */
export const CACHE_MAX_AGE_MS = 7 * 24 * 3_600_000;

export interface PolicyDeps {
  /** GET a URL as JSON within `timeoutMs` (native HTTP in the app). */
  getJson(url: string, timeoutMs: number): Promise<unknown>;
  /** `<api>/pawlegends/client-policy`, or null (the dev channel and its local server use the mirror only). */
  apiUrl: string | null;
  /** The policy.json of this platform and compat, or null (the Mac app has no OTA and no mirror). */
  mirrorUrl: string | null;
  query: ClientPolicyQuery;
  spkiPem: string;
  kv: KV;
  now(): number;
  sleep(ms: number): Promise<void>;
  subtle?: SubtleCrypto | null;
}

/** What is kept on the device: the last verified mirror file and the last API answer, each with its time. */
export interface CachedPolicy {
  fileAt?: number;
  file?: unknown;
  answerAt?: number;
  answer?: ClientPolicyAnswer;
}

export type PolicyOutcome =
  | { source: 'api'; decision: ClientPolicyDecision; answer: ClientPolicyAnswer; maintenance: PolicyMaintenance | null; retryAfterSec: number }
  | { source: 'mirror'; decision: ClientPolicyDecision; file: PolicyFile; maintenance: PolicyMaintenance | null; retryAfterSec: number }
  | { source: 'none' };

export function readCache(kv: KV): CachedPolicy | null {
  try {
    const raw = kv.getItem(POLICY_KEYS.last);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as CachedPolicy) : null;
  } catch {
    return null;
  }
}

function writeCache(kv: KV, patch: CachedPolicy): void {
  try {
    kv.setItem(POLICY_KEYS.last, JSON.stringify({ ...(readCache(kv) ?? {}), ...patch }));
  } catch {
    /* storage full or blocked: the next launch asks again */
  }
}

/** A mirror file that parses, is for this platform and compat, and whose signature is not bad (null otherwise). */
export async function verifiedPolicyFile(raw: unknown, q: ClientPolicyQuery, spkiPem: string, subtle?: SubtleCrypto | null): Promise<PolicyFile | null> {
  const file = parsePolicyFile(raw);
  if (!file) return null;
  if ((q.platform && file.platform !== q.platform) || (q.compat !== undefined && file.compat !== q.compat)) return null;
  // 'unavailable' (no WebCrypto) is accepted: a policy can only delay play, it never installs anything
  const sig = await verifySigned(canonicalPolicy(raw as object), file.signature, spkiPem, subtle === undefined ? globalThis.crypto?.subtle : subtle);
  return sig === 'bad' ? null : file;
}

function withTimeout<T>(p: Promise<T>, ms: number, sleep: (ms: number) => Promise<void>): Promise<T> {
  return Promise.race([p, sleep(ms).then(() => Promise.reject(new Error('timeout')))]);
}

/** The hedged fetch: the API first, the signed mirror when the API fails or is slow, else `none`. Never throws. */
export async function fetchPolicy(d: PolicyDeps): Promise<PolicyOutcome> {
  let apiOk = false;
  const qs = clientPolicyQueryString(d.query);
  const api: Promise<ClientPolicyAnswer | null> = d.apiUrl
    ? withTimeout(Promise.resolve().then(() => d.getJson(`${d.apiUrl}?${qs}`, API_TIMEOUT_MS)), API_TIMEOUT_MS, d.sleep)
        .then((raw) => {
          const a = parseClientPolicyAnswer(raw);
          apiOk = !!a;
          return a;
        })
        .catch(() => null)
    : Promise.resolve(null);
  const mirrorUrl = d.mirrorUrl;
  const mirror: Promise<PolicyFile | null> = mirrorUrl
    ? Promise.race([api, d.sleep(MIRROR_DELAY_MS)])
        .then(() => (apiOk ? null : withTimeout(Promise.resolve().then(() => d.getJson(`${mirrorUrl}?t=${Math.floor(d.now() / 60_000)}`, MIRROR_TIMEOUT_MS)), MIRROR_TIMEOUT_MS, d.sleep)))
        .then((raw) => (raw === null ? null : verifiedPolicyFile(raw, d.query, d.spkiPem, d.subtle)))
        .catch(() => null)
    : Promise.resolve(null);

  const answer = await api;
  if (answer) {
    writeCache(d.kv, { answer, answerAt: d.now() });
    return {
      source: 'api',
      decision: { action: answer.action, reason: answer.reason, latest: answer.latest },
      answer,
      maintenance: answer.maintenance,
      retryAfterSec: answer.retryAfterSec,
    };
  }
  const file = await mirror;
  if (file) {
    // keep the raw file (its signature was checked over it); the backend's sim list comes from the last API answer
    writeCache(d.kv, { file, fileAt: d.now() });
    const cached = readCache(d.kv);
    const decision = decidePolicy({ policy: file, acceptedSims: cached?.answer?.acceptedSims ?? null, client: d.query, now: d.now() });
    return { source: 'mirror', decision, file, maintenance: maintenanceOn(file.maintenance, d.now()) ? file.maintenance : null, retryAfterSec: 60 };
  }
  return { source: 'none' };
}

/**
 * Offline (no API, no mirror, or the manifest could not be read): may the installed bundle play? `play` when nothing
 * is known (a first launch offline) or the last kept answer still accepts its sim and native shell; `block` when that
 * answer says the backend no longer replays this sim (its matches would not save) or the shell is retired. A newer
 * required bundle alone does not block offline: it is installed once the phone is back online.
 */
export function offlineVerdict(cache: CachedPolicy | null, q: ClientPolicyQuery, now: number): 'play' | 'block' {
  if (!cache) return 'play';
  const fresh = (at: number | undefined) => typeof at === 'number' && now - at <= CACHE_MAX_AGE_MS && now >= at - 60_000;
  const file = fresh(cache.fileAt) ? parsePolicyFile(cache.file) : null;
  const answer = fresh(cache.answerAt) ? parseClientPolicyAnswer(cache.answer) : null;
  if (!file && !answer) return 'play';
  if (file && q.compat !== undefined && q.compat < file.minCompat) return 'block';
  if (!file && answer?.reason === 'compat-retired') return 'block';
  if (q.sim === undefined) return 'play';
  const accepted = answer?.acceptedSims ?? null;
  // a sim newer than every one the backend replays is the backend lagging (shared decidePolicy): never a block
  if (accepted && accepted.length && !accepted.includes(q.sim) && q.sim < Math.max(...accepted)) return 'block';
  const minSim = effectiveMinSim(file?.minSim ?? answer?.minSim ?? null, accepted);
  return minSim !== null && q.sim < minSim ? 'block' : 'play';
}
