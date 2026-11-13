/**
 * Ranked tiers (docs/plans/moba/SOCIAL-RANKED.md §7.2, §11.1): the game's copy of
 * `backend/src/pawlegends/ranked/tiers.ts` (names, anchors, protection and the point constants), deep-compared by
 * tests/unit/ranked-tiers.test.ts. The server computes every number; the game only labels them. The liquidity gate's
 * thresholds are shown from the server's answer (`RANKED_OPEN_FALLBACK` only before it arrives).
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
/** Shown only until the server's `ranked/status` answers. */
export const RANKED_OPEN_FALLBACK = 24;

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

/** `GET /pawlegends/ranked/status`: the liquidity gate and the season. */
export interface RankedStatus {
  open: boolean;
  online: number;
  need: number;
  season?: { id: string; name?: string; endsAt?: string };
}

/** A status answer, or null when it is malformed (never a guessed number). Pure. */
export function parseRankedStatus(v: unknown): RankedStatus | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e7 ? Math.floor(x) : null);
  const online = n(o.online);
  const need = n(o.need);
  if (typeof o.open !== 'boolean' || online === null || need === null) return null;
  const s = o.season && typeof o.season === 'object' ? (o.season as Record<string, unknown>) : null;
  const season =
    s && typeof s.id === 'string' && /^s\d{1,3}$/.test(s.id)
      ? { id: s.id, ...(typeof s.name === 'string' ? { name: s.name.slice(0, 60) } : {}), ...(typeof s.endsAt === 'string' ? { endsAt: s.endsAt } : {}) }
      : undefined;
  return { open: o.open, online, need, ...(season ? { season } : {}) };
}

/** The locked tile's line: "Opens at 24 online · 9 now" (before the answer: the fallback line, no count). Pure. */
export function rankedGateText(st: RankedStatus | null): string {
  if (!st) return `Opens at ${RANKED_OPEN_FALLBACK} players online`;
  return `Opens at ${st.need} online · ${st.online} now`;
}

/** The longer line for the rules and the Home nav ("Ranked opens at 24 players online. 9 online now."). Pure. */
export function rankedGateSentence(st: RankedStatus | null): string {
  if (!st) return `Ranked opens at ${RANKED_OPEN_FALLBACK} players online.`;
  if (st.open) return `Ranked is open · ${st.online} players online.`;
  return `Ranked opens at ${st.need} players online. ${st.online} online now.`;
}

let cache: { atMs: number; api: string; value: RankedStatus | null } | null = null;
let inflight: Promise<RankedStatus | null> | null = null;

/**
 * The gate from the API (public, cached 30 s here as on the server). Null when it cannot be read: the tile stays
 * locked with the fallback line, never opens on a guess.
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
