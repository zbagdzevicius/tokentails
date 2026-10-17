/**
 * Entitlements (GDD 8, 9.2, 10, 13.6). The server (backend/src/badcat, behind BADCAT_* flags) signs a short-lived
 * token `<base64url json>.<base64url HMAC>`; src/money caches `{ token, entitlements }` under the store key
 * `entitlements`. This file only READS that cache, synchronously: it decodes the token payload (never verified on
 * the client: Stripe and the server are the source of truth, a local unlock is only a cache) and trusts it until
 * `expiresAt`. Nothing cached, an unreadable token or an expired one means FREE. Never throws.
 *
 * Self-contained on purpose (platform must not import src/money; money imports platform).
 */
import { COSMETICS, type BadcatSku, type CosmeticSlot, type Entitlements, type Store } from '../types';
import { createStore } from './storage';

export type { Entitlements } from '../types';

/** Store key of the cached `{ token, entitlements }` (written by src/money). */
export const KEY_ENTITLEMENTS = 'entitlements';

export interface CachedEntitlements {
  /** The primary token: a verified one (restore link) when the device has one, else the widest scoped one. */
  token: string;
  entitlements?: Entitlements | null;
  savedAt?: number;
  /**
   * Scoped tokens kept beside a verified primary (a gift or a purchase whose Checkout email differs from the
   * verified one). A narrower token never replaces a verified one; the perks of every unexpired token merge.
   */
  scoped?: string[];
}

/** At most this many scoped tokens are kept beside the primary. */
export const MAX_SCOPED_TOKENS = 8;

/** The server claims of a token payload (never verified here): `ev` = verified email, `sids` = scope. */
export function tokenClaims(token: unknown): { verified: boolean; sids: string[]; email: string | null } | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const dot = token.indexOf('.');
  const head = dot < 0 ? token : token.slice(0, dot);
  const text = head ? decodeBase64urlText(head) : null;
  if (!text) return null;
  try {
    const r = JSON.parse(text) as Record<string, unknown>;
    if (!r || typeof r !== 'object') return null;
    const email = typeof r.email === 'string' && r.email ? r.email : null;
    const sids = Array.isArray(r.sids) ? r.sids.filter((x): x is string => typeof x === 'string').slice(0, 64) : [];
    return { verified: r.ev === 1 && !!email, sids, email };
  } catch {
    return null;
  }
}

/**
 * The cache after a newly issued token arrives. A verified token becomes the primary (an older scoped primary
 * moves beside it); a scoped token never replaces a verified primary, it is kept beside it; a scoped token
 * replaces a scoped primary whose scope it covers (the server merges the old scope in), else both are kept.
 */
export function mergeTokenIntoCache(prev: CachedEntitlements | null, token: string, now: number, ents: Entitlements | null = null): CachedEntitlements {
  const fresh = tokenClaims(token);
  const old = prev && typeof prev.token === 'string' && prev.token ? prev : null;
  const oldScoped = (old?.scoped ?? []).filter((t) => typeof t === 'string' && t && t !== token);
  const keep = (list: string[]): string[] => {
    // Drop expired tokens and exact duplicates; newest last.
    const out: string[] = [];
    for (const t of list) {
      const e = decodeEntitlementToken(t);
      if (!e || !(e.expiresAt > now) || out.includes(t)) continue;
      out.push(t);
    }
    return out.slice(-MAX_SCOPED_TOKENS);
  };
  if (!old || old.token === token) return { token, entitlements: ents, savedAt: now, scoped: keep(oldScoped) };
  const prevClaims = tokenClaims(old.token);
  const prevAlive = (() => {
    const e = decodeEntitlementToken(old.token);
    return !!e && e.expiresAt > now;
  })();
  if (fresh?.verified) {
    // Same verified email: replace. A different identity: the old token keeps speaking for its purchases.
    const sameEmail = prevClaims?.verified && prevClaims.email === fresh.email;
    const extra = sameEmail || !prevAlive ? [] : [old.token];
    return { token, entitlements: ents, savedAt: now, scoped: keep([...oldScoped, ...extra]) };
  }
  if (prevClaims?.verified && prevAlive) {
    // Never downgrade: the verified token stays primary, the scoped one rides beside it.
    return { ...old, scoped: keep([...oldScoped, token]) };
  }
  const covered = !!prevClaims && !!fresh && prevClaims.sids.every((sid) => fresh.sids.includes(sid));
  const extra = covered || !prevAlive ? [] : [old.token];
  return { token, entitlements: ents, savedAt: now, scoped: keep([...oldScoped, ...extra]) };
}

/** Every token in the cache (primary first). */
export function cachedEntitlementTokens(store: Store): string[] {
  try {
    const c = store.get<CachedEntitlements | null>(KEY_ENTITLEMENTS, null);
    if (!c || typeof c.token !== 'string' || !c.token) return [];
    const extra = Array.isArray(c.scoped) ? c.scoped.filter((t): t is string => typeof t === 'string' && !!t && t !== c.token) : [];
    return [c.token, ...extra];
  } catch {
    return [];
  }
}

/** The cached token that speaks for a Checkout Session or gift (`sid`), else the primary. */
export function cachedTokenFor(store: Store, sid: string | null | undefined): string | null {
  const all = cachedEntitlementTokens(store);
  if (sid) for (const t of all) if (tokenClaims(t)?.sids.includes(sid)) return t;
  return all[0] ?? null;
}

/** Merges the perks of several Entitlements (any Club wins; owned items union; caps take the max). */
export function mergeEntitlements(list: Entitlements[]): Entitlements {
  if (!list.length) return freeCopy();
  if (list.length === 1) return list[0];
  const club = list.find((e) => e.club) ?? list[0];
  const skus = [...new Set(list.flatMap((e) => e.skus))];
  const cosmetics = [...new Set(list.flatMap((e) => e.cosmetics))].sort((a, b) => a - b);
  const max = (k: 'maxCats' | 'freezesPerWeek' | 'archiveDays' | 'seasonTiers') => Math.max(...list.map((e) => e[k]));
  const out: Entitlements = {
    ...club,
    club: list.some((e) => e.club),
    skus,
    cosmetics,
    maxCats: max('maxCats'),
    freezesPerWeek: max('freezesPerWeek'),
    archiveDays: max('archiveDays'),
    seasonTiers: max('seasonTiers'),
    // The merged cache is good until its first token runs out (then money refreshes them all).
    expiresAt: Math.min(...list.map((e) => e.expiresAt)),
  };
  const email = list[0].email;
  if (email) out.email = email;
  else delete out.email;
  return out;
}

export const FREE_ENTITLEMENTS: Readonly<Entitlements> = Object.freeze({
  club: false,
  skus: [] as string[],
  cosmetics: [] as number[],
  maxCats: 1,
  freezesPerWeek: 1,
  archiveDays: 14,
  seasonTiers: 15,
  expiresAt: 0,
  source: 'free',
} as Entitlements);

/** Club perks (GDD 8): every archive day, 3 freezes a week, 5 cats, all 30 season tiers. */
export const CLUB_ENTITLEMENTS: Readonly<Entitlements> = Object.freeze({
  club: true,
  skus: [] as string[],
  cosmetics: [] as number[],
  maxCats: 5,
  freezesPerWeek: 3,
  archiveDays: 9999,
  seasonTiers: 30,
  expiresAt: 0,
  source: 'cache',
} as Entitlements);

function freeCopy(): Entitlements {
  return { ...FREE_ENTITLEMENTS, skus: [], cosmetics: [] };
}

/** base64url -> UTF-8 string (atob in browsers, Buffer in Node). Null on any error. */
export function decodeBase64urlText(s: string): string | null {
  try {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const g = globalThis as { atob?: (x: string) => string; Buffer?: { from(x: string, enc: string): { toString(enc: string): string } } };
    if (typeof g.atob === 'function') {
      const bin = g.atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    if (g.Buffer) return g.Buffer.from(b64, 'base64').toString('utf8');
    return null;
  } catch {
    return null;
  }
}

/** Cosmetic slots/ids a set of owned SKUs unlocks (cosmetic_bundle = the 3 shop items). */
export function cosmeticsForSkus(skus: readonly string[]): { slot: CosmeticSlot; id: number }[] {
  const owned = new Set<string>(skus);
  if (owned.has('cosmetic_bundle')) {
    owned.add('cosmetic_collar');
    owned.add('cosmetic_hat');
    owned.add('cosmetic_trail');
  }
  // Phase 2 store: the second bundle
  if (owned.has('cosmetic_bundle2')) {
    owned.add('cosmetic_collar_spiked');
    owned.add('cosmetic_hat_wizard');
    owned.add('cosmetic_trail_bubbles');
  }
  const out: { slot: CosmeticSlot; id: number }[] = [];
  for (const c of COSMETICS) if (c.sku && owned.has(c.sku)) out.push({ slot: c.slot, id: c.id });
  return out;
}

const num = (v: unknown, fb: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : fb;

/** Validates an untrusted payload into Entitlements; null when it is not one. */
export function sanitizeEntitlements(raw: unknown, source: Entitlements['source'] = 'cache'): Entitlements | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.club !== 'boolean') return null;
  const base = r.club ? CLUB_ENTITLEMENTS : FREE_ENTITLEMENTS;
  const skus = Array.isArray(r.skus) ? r.skus.filter((s): s is string => typeof s === 'string' && s.length <= 40).slice(0, 64) : [];
  const plan = r.plan === 'monthly' || r.plan === 'annual' || r.plan === 'founding' || r.plan === 'gift' ? r.plan : undefined;
  // Collar + hat ids (CatSpec fields) expanded from the owned SKUs, plus any the server listed.
  const ids = new Set<number>();
  if (Array.isArray(r.cosmetics)) for (const v of r.cosmetics) if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 256) ids.add(v);
  for (const c of cosmeticsForSkus(skus)) if (c.slot === 'collar' || c.slot === 'hat') ids.add(c.id);
  const e: Entitlements = {
    club: r.club,
    skus,
    cosmetics: [...ids].sort((a, b) => a - b),
    maxCats: num(r.maxCats, base.maxCats, 1, 5),
    freezesPerWeek: num(r.freezesPerWeek, base.freezesPerWeek, 0, 7),
    archiveDays: num(r.archiveDays, base.archiveDays, 0, 100000),
    seasonTiers: num(r.seasonTiers, base.seasonTiers, 0, 30),
    expiresAt: num(r.expiresAt, 0, 0, Number.MAX_SAFE_INTEGER),
    source,
  };
  if (plan) e.plan = plan;
  if (typeof r.email === 'string' && r.email.length <= 254) e.email = r.email;
  return e;
}

/** Decodes the token payload (the part before the '.'). Never verifies the HMAC. */
export function decodeEntitlementToken(token: unknown): Entitlements | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const dot = token.indexOf('.');
  const head = dot < 0 ? token : token.slice(0, dot);
  if (!head) return null;
  const text = decodeBase64urlText(head);
  if (!text) return null;
  try {
    return sanitizeEntitlements(JSON.parse(text), 'cache');
  } catch {
    return null;
  }
}

/** The cached token string, or null. */
export function cachedEntitlementToken(store: Store): string | null {
  try {
    const c = store.get<CachedEntitlements | null>(KEY_ENTITLEMENTS, null);
    return c && typeof c.token === 'string' && c.token ? c.token : null;
  } catch {
    return null;
  }
}

/**
 * Synchronous entitlements from the cached token, trusted until `expiresAt` (`now` in ms, default Date.now()).
 * Free when nothing is cached, the token is unreadable or it has expired (src/money refreshes it online).
 */
export function getEntitlements(store?: Store, now: number = Date.now()): Entitlements {
  try {
    const s = store ?? createStore();
    const live: Entitlements[] = [];
    for (const token of cachedEntitlementTokens(s)) {
      const e = decodeEntitlementToken(token);
      if (e && e.expiresAt > now) live.push(e);
    }
    return live.length ? mergeEntitlements(live) : freeCopy();
  } catch {
    return freeCopy();
  }
}

/** True when the cache holds a token (primary or scoped) whose payload has expired (needs an online refresh). */
export function entitlementsExpired(store: Store, now: number = Date.now()): boolean {
  return cachedEntitlementTokens(store).some((token) => {
    const e = decodeEntitlementToken(token);
    return !e || !(e.expiresAt > now);
  });
}

/** Owns a cosmetic (shop/charity SKU, or a Club-source item while in the Club). Track items are progress's job. */
export function ownsCosmetic(e: Entitlements, slot: CosmeticSlot, id: number): boolean {
  const def = COSMETICS.find((c) => c.slot === slot && c.id === id);
  if (!def) return false;
  if (def.source === 'club') return e.club;
  if (def.sku) return cosmeticsForSkus(e.skus).some((c) => c.slot === slot && c.id === id);
  return false;
}

/** SKUs whose purchase shows up in Entitlements.skus (one-off owned items). */
export const OWNED_SKUS: readonly BadcatSku[] = [
  'collar_pinkpaw',
  'cosmetic_collar',
  'cosmetic_hat',
  'cosmetic_trail',
  'cosmetic_bundle',
  // Phase 2 store
  'cosmetic_collar_spiked',
  'cosmetic_hat_wizard',
  'cosmetic_trail_bubbles',
  'cosmetic_stamp_neon',
  'cosmetic_bundle2',
];
