/**
 * Ranked tiers (docs/plans/moba/SOCIAL-RANKED.md §7.2, §11.1): the game's copy of
 * `backend/src/pawlegends/ranked/tiers.ts` (names, anchors, protection and the point constants), deep-compared by
 * tests/unit/ranked-tiers.test.ts. The server computes every number; the game only labels them. Since round 4
 * (SOCIAL-RANKED.md §7.11) ranked is always open: a quiet queue fills with labelled bots (`RANKED_BOTS`), Prime Time
 * (`RANKED_PRIME_TIME`) asks players to come together, and the status answer carries the searching count and regions.
 *
 * Naming: "Kitten" and "Legend" are also card awaken words, so a ranked label always carries its division or points
 * ("Kitten III", "Legend · 240 pts").
 */

export interface RankedTierDef {
  id: 'kitten' | 'tabby' | 'alley' | 'lion' | 'legend';
  name: string;
  anchors: number[];
  protected: boolean;
}

export const RANKED_TIERS: readonly RankedTierDef[] = Object.freeze([
  { id: 'kitten', name: 'Kitten', anchors: [1000, 1075, 1150], protected: true },
  { id: 'tabby', name: 'Tabby', anchors: [1225, 1300, 1375], protected: true },
  { id: 'alley', name: 'Alley', anchors: [1450, 1525, 1600], protected: false },
  { id: 'lion', name: 'Lion', anchors: [1675, 1750, 1825], protected: false },
  { id: 'legend', name: 'Legend', anchors: [1900], protected: false },
]);

export const DIVISION_NUMERALS = Object.freeze(['III', 'II', 'I']);

export const RANKED_POINTS = Object.freeze({
  win: 20,
  loss: 15,
  span: 400,
  cMin: 0.5,
  cMax: 1.5,
  division: 100,
  shield: 1,
  demotedTo: 75,
  dodge: 3,
  decayAfterDays: 14,
  decayPerDay: 20,
});

export const PLACEMENTS = Object.freeze({ first: 5, season: 3 });
export const LEGEND_IDX = 12;

/**
 * Low-population ranked (SOCIAL-RANKED.md §7.11): the backend's RANKED_BOTS. Labelled bots fill the empty seats after
 * `fillS` (`primeFillS` in Prime Time) when each team has a player; no opponent player by `fillS + aiAfterS` plays vs AI.
 * Bot-filled matches move `filledShare` of the points, vs AI `aiShare`, and vs AI nothing from `aiCapIdx` (Alley III).
 */
export const RANKED_BOTS = Object.freeze({
  fillS: 40,
  primeFillS: 75,
  aiAfterS: 30,
  filledShare: 0.5,
  aiShare: 0.25,
  aiCapIdx: 6,
});

/** Prime Time (UTC hours): every day, and on Saturday and Sunday also the weekend window. The backend's copy. */
export const RANKED_PRIME_TIME = Object.freeze({
  daily: Object.freeze({ fromH: 18, toH: 22 }),
  weekend: Object.freeze({ fromH: 12, toH: 18 }),
});

/** Who a ranked match was against: six players, players with labelled bots in the empty seats, or bots (vs AI). */
export type RankedKind = 'players' | 'filled' | 'ai';

/** The one line that says what a ranked match of this kind pays. Pure. */
export function rankedKindLine(kind: RankedKind): string {
  if (kind === 'ai') return 'Ranked vs AI · quarter points (none from Alley III)';
  if (kind === 'filled') return 'Bots filled empty seats · half points';
  return 'Six players · full points';
}

/** "Tabby II", or "Legend · 240 pts". Pure. */
export function rankedLabel(tierIdx: number, points?: number): string {
  if (tierIdx >= LEGEND_IDX) return `Legend · ${Math.max(0, Math.floor(points ?? 0))} pts`;
  const t = RANKED_TIERS[Math.max(0, Math.min(3, Math.floor(tierIdx / 3)))];
  const div = DIVISION_NUMERALS[Math.max(0, tierIdx) % 3];
  return points === undefined ? `${t.name} ${div}` : `${t.name} ${div} · ${Math.max(0, Math.floor(points))} / 100`;
}

// ------------------------------------------------------------------------------------------ the live gate (gap plan P4)

/** The queue card offers "Play Casual instead" after this long (backend mm-limits.ts MM_RANKED.offerCasualMs). */
export const RANKED_CASUAL_AFTER_S = 180;
/** Ranked plays 3v3 on the Crossing in Season 1 (SOCIAL-RANKED.md §7.1). */
export const RANKED_MAP = 'crossing' as const;

/** `GET /pawlegends/ranked/status` (always open since round 4): live counts, Prime Time, the regions and the season. */
export interface RankedStatus {
  open: boolean;
  online: number;
  /** Players searching ranked now (null: an older server that does not send it). */
  searching: number | null;
  /** The current (active) or next Prime Time window, epoch ms. */
  primeTime?: { active: boolean; startsAt: number; endsAt: number };
  /** Queue regions (one today) and the API path the game times for each one's ping. */
  regions: { id: string; name: string; ping: string }[];
  season?: { id: string; name?: string; endsAt?: string };
}

/** A status answer, or null when it is malformed (never a guessed number). Pure. */
export function parseRankedStatus(v: unknown): RankedStatus | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e7 ? Math.floor(x) : null);
  const online = n(o.online);
  if (typeof o.open !== 'boolean' || online === null) return null;
  const s = o.season && typeof o.season === 'object' ? (o.season as Record<string, unknown>) : null;
  const season =
    s && typeof s.id === 'string' && /^s\d{1,3}$/.test(s.id)
      ? { id: s.id, ...(typeof s.name === 'string' ? { name: s.name.slice(0, 60) } : {}), ...(typeof s.endsAt === 'string' ? { endsAt: s.endsAt } : {}) }
      : undefined;
  const p = o.primeTime && typeof o.primeTime === 'object' ? (o.primeTime as Record<string, unknown>) : null;
  const ms = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
  const startsAt = p ? ms(p.startsAt) : null;
  const endsAt = p ? ms(p.endsAt) : null;
  const primeTime = p && typeof p.active === 'boolean' && startsAt !== null && endsAt !== null ? { active: p.active, startsAt, endsAt } : undefined;
  const regions = Array.isArray(o.regions)
    ? (o.regions as unknown[])
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .filter((r) => typeof r.id === 'string' && /^[a-z0-9-]{1,16}$/.test(r.id) && typeof r.name === 'string' && typeof r.ping === 'string' && /^\/[a-z0-9/_-]{1,64}$/.test(r.ping))
        .slice(0, 8)
        .map((r) => ({ id: r.id as string, name: (r.name as string).slice(0, 24), ping: r.ping as string }))
    : [];
  return { open: o.open, online, searching: n(o.searching), regions, ...(primeTime ? { primeTime } : {}), ...(season ? { season } : {}) };
}

/** "18:00" in the player's own time. */
const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The Prime Time line: "Prime Time now · until 22:00" or "Prime Time 20:00–00:00" (the player's time), or ''. */
export function primeTimeText(st: RankedStatus | null): string {
  const p = st?.primeTime;
  if (!p) return '';
  return p.active ? `Prime Time now · until ${hhmm(p.endsAt)}` : `Prime Time ${hhmm(p.startsAt)}–${hhmm(p.endsAt)}`;
}

/** The tile's live line: "3 searching · Prime Time now" (counts only when the server sent them). Pure. */
export function rankedLiveText(st: RankedStatus | null): string {
  if (!st) return 'Always open';
  const parts = [st.searching !== null ? `${st.searching} searching` : `${st.online} online`];
  if (st.primeTime?.active) parts.push('Prime Time now');
  return parts.join(' · ');
}

/** The rules' line about a quiet queue (the honest bot rule). Pure. */
export function rankedBotsRule(prime = false): string {
  const fill = prime ? RANKED_BOTS.primeFillS : RANKED_BOTS.fillS;
  return `Quiet queue: labelled bots fill after ${fill} s (half points); alone after ${fill + RANKED_BOTS.aiAfterS} s, vs AI (quarter points, none from Alley III).`;
}

// ------------------------------------------------------------------------------------------ region ping (§7.11)

/** One region's measured ping (ms), or null when it could not be measured. */
export interface RegionPing {
  id: string;
  name: string;
  ms: number | null;
}

let pings: { atMs: number; api: string; value: RegionPing[] } | null = null;
let pinging: Promise<RegionPing[]> | null = null;

/**
 * Time each region's ping path three times (no-store) and keep the median, cached 60 s. Groundwork for region choice:
 * one region today. Never throws; an unreachable region reads null.
 */
export function measureRegionPings(api: string, regions: RankedStatus['regions'], now = Date.now()): Promise<RegionPing[]> {
  const base = api.replace(/\/+$/, '');
  if (pings && pings.api === base && now - pings.atMs < 60_000) return Promise.resolve(pings.value);
  if (pinging) return pinging;
  pinging = (async () => {
    const out: RegionPing[] = [];
    for (const r of regions) {
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const t0 = performance.now();
          const res = await fetch(`${base}${r.ping}`, { cache: 'no-store', credentials: 'omit' });
          if (!res.ok) break;
          await res.text();
          samples.push(performance.now() - t0);
        } catch {
          break;
        }
      }
      samples.sort((a, b) => a - b);
      out.push({ id: r.id, name: r.name, ms: samples.length ? Math.round(samples[Math.floor(samples.length / 2)]) : null });
    }
    pings = { atMs: Date.now(), api: base, value: out };
    pinging = null;
    return out;
  })();
  return pinging;
}

/** The last measured pings this visit (empty before any). */
export const regionPingsNow = (): RegionPing[] => pings?.value ?? [];

/** "Europe · 48 ms" (one region), "Europe · …" while measuring. Pure. */
export function regionText(r: RegionPing | { name: string; ms?: number | null }): string {
  return `${r.name} · ${typeof r.ms === 'number' ? `${r.ms} ms` : '…'}`;
}

let cache: { atMs: number; api: string; value: RankedStatus | null } | null = null;
let inflight: Promise<RankedStatus | null> | null = null;

/**
 * The ranked status from the API (public, cached 30 s here as on the server). Null when it cannot be read: the tile
 * stays live (ranked is always open) without counts, never a guessed number.
 */
export function fetchRankedStatus(api: string, now = Date.now()): Promise<RankedStatus | null> {
  const base = api.replace(/\/+$/, '');
  if (cache && cache.api === base && now - cache.atMs < 30_000) return Promise.resolve(cache.value);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctl?.abort(), 5000);
      const r = await fetch(`${base}/pawlegends/ranked/status`, { signal: ctl?.signal ?? undefined, credentials: 'omit' });
      clearTimeout(timer);
      const value = r.ok ? parseRankedStatus(await r.json()) : null;
      cache = { atMs: Date.now(), api: base, value };
      return value;
    } catch {
      cache = { atMs: Date.now(), api: base, value: null };
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The last status read this visit (null before any answer). */
export const rankedStatusNow = (): RankedStatus | null => cache?.value ?? null;

/** Tests only. */
export function resetRankedStatus(): void {
  cache = null;
  inflight = null;
  pings = null;
  pinging = null;
}

// ------------------------------------------------------------------------------------------ the results block (P4)

/** `GET /pawlegends/ranked/me` → `ranked` (placed fields only once placements are done). */
export interface RankedCard {
  placementsLeft: number;
  placementsOf: number;
  tierIdx?: number;
  points?: number;
  shield?: number;
  peak?: string;
}

/** The `ranked` object of a `ranked/me` answer, or null. Pure. */
export function parseRankedCard(body: unknown): RankedCard | null {
  const r = body && typeof body === 'object' ? (body as { ranked?: unknown }).ranked : null;
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const int = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? Math.floor(x) : undefined);
  const left = int(o.placementsLeft, 10);
  if (left === undefined) return null;
  const tierIdx = int(o.tierIdx, LEGEND_IDX);
  return {
    placementsLeft: left,
    placementsOf: int(o.placementsOf, 10) ?? PLACEMENTS.first,
    ...(tierIdx !== undefined ? { tierIdx } : {}),
    ...(int(o.points, 1e6) !== undefined ? { points: int(o.points, 1e6) } : {}),
    ...(int(o.shield, 9) !== undefined ? { shield: int(o.shield, 9) } : {}),
    ...(typeof o.peak === 'string' ? { peak: o.peak.slice(0, 40) } : {}),
  };
}

export interface RankedResult {
  /** "Tabby II · 40 / 100", "Placement 3 / 5". */
  tier: string;
  /** "+18 pts", "Promoted to Alley III", "Shield used: no points lost", "Kitten and Tabby never lose points". */
  change: string;
  tone: 'up' | 'down' | 'flat';
  /** The shield line for a placed non-protected tier ("Shield ready" | "Shield used"), else ''. */
  shield: string;
}

const tierName = (idx: number): string => rankedLabel(idx);

/**
 * What a ranked match changed, from the card before and after the save (gap plan P4: points, the shield and the tier).
 * Pure; `after` null: the save has not landed yet.
 */
export function rankedResult(before: RankedCard | null, after: RankedCard | null, won: boolean): RankedResult | null {
  if (!after) return null;
  if (after.tierIdx === undefined) {
    const done = Math.max(0, after.placementsOf - after.placementsLeft);
    return { tier: `Placement ${done} / ${after.placementsOf}`, change: won ? 'Placement win' : 'Placement match played', tone: won ? 'up' : 'flat', shield: '' };
  }
  const idx = after.tierIdx;
  const pts = after.points ?? 0;
  const tier = idx >= LEGEND_IDX ? rankedLabel(idx, pts) : `${tierName(idx)} · ${pts} / ${RANKED_POINTS.division}`;
  const protectedTier = RANKED_TIERS[Math.min(4, Math.floor(idx / 3))].protected;
  const shield = idx < LEGEND_IDX && !protectedTier ? ((after.shield ?? 0) > 0 ? 'Shield ready' : 'Shield used') : '';
  if (!before || before.tierIdx === undefined) return { tier, change: `Placed in ${tierName(idx)}`, tone: 'up', shield };
  if (idx > before.tierIdx) return { tier, change: `Promoted to ${idx >= LEGEND_IDX ? 'Legend' : tierName(idx)}`, tone: 'up', shield };
  if (idx < before.tierIdx) return { tier, change: `Demoted to ${tierName(idx)}`, tone: 'down', shield };
  const d = pts - (before.points ?? 0);
  if (d > 0) return { tier, change: `+${d} pts`, tone: 'up', shield };
  if (d < 0) return { tier, change: `${d} pts`, tone: 'down', shield };
  if (!won && protectedTier) return { tier, change: 'Kitten and Tabby never lose points', tone: 'flat', shield };
  if (!won && (before.shield ?? 0) > (after.shield ?? 0)) return { tier, change: 'Shield used: no points lost', tone: 'flat', shield };
  return { tier, change: 'No change', tone: 'flat', shield };
}
