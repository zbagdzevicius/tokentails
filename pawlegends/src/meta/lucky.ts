/**
 * Lucky Treat, client side (gap plan P2; Brawl Stars Starr Drops; founder call #3's default). The server draws it
 * inside the `/live` save on the first verified win of the UTC day (backend/src/pawlegends/progress/lucky.ts), from a
 * published odds table, every 10th at least Rare, existing cosmetics only, never for the under-16 band (who get the
 * fixed Daily Treat). The game only shows it: the chest (odds viewable BEFORE it opens), then the reveal. Earned only;
 * nothing paid opens one and it is never sold. Kept to this file and ui/rewards so it can come out in one change.
 */

export type LuckyRarity = 'common' | 'rare' | 'epic';
export const LUCKY_RARITIES: readonly LuckyRarity[] = Object.freeze(['common', 'rare', 'epic'] as LuckyRarity[]);
export const RARITY_NAME: Readonly<Record<LuckyRarity, string>> = Object.freeze({ common: 'Common', rare: 'Rare', epic: 'Epic' });

export interface LuckyOddsRow {
  rarity: LuckyRarity;
  pct: number;
  items: number;
  dupXp: number;
}

export interface LuckyTable {
  odds: LuckyOddsRow[];
  /** Every `floor`-th Lucky Treat is at least Rare. */
  floor: number;
  /** The under-16 band's fixed Daily Treat. */
  dailyTreatXp: number;
  /** Lucky Treats drawn so far (the floor counts these). */
  n: number;
  /** False for the under-16 band (no draw, the fixed Daily Treat instead). */
  eligible: boolean;
}

/** The table the backend publishes (shown before the server answers, and when it cannot be reached). */
export const LUCKY_DEFAULT: LuckyTable = Object.freeze({
  odds: [
    { rarity: 'common', pct: 62, items: 128, dupXp: 100 },
    { rarity: 'rare', pct: 28, items: 54, dupXp: 200 },
    { rarity: 'epic', pct: 10, items: 8, dupXp: 300 },
  ],
  floor: 10,
  dailyTreatXp: 150,
  n: 0,
  eligible: true,
}) as LuckyTable;

const isRarity = (v: unknown): v is LuckyRarity => v === 'common' || v === 'rare' || v === 'epic';
const num = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, v) : 0);

/** The server's `lucky` block, checked; the default table when it is missing or does not add up to 100 %. Pure. */
export function parseLuckyTable(raw: unknown): LuckyTable {
  if (!raw || typeof raw !== 'object') return LUCKY_DEFAULT;
  const o = raw as Record<string, unknown>;
  const odds = Array.isArray(o.odds)
    ? o.odds
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && isRarity((r as Record<string, unknown>).rarity))
        .map((r) => ({ rarity: r.rarity as LuckyRarity, pct: num(r.pct, 100), items: Math.floor(num(r.items, 10000)), dupXp: Math.floor(num(r.dupXp, 10000)) }))
    : [];
  const sum = odds.reduce((n, r) => n + r.pct, 0);
  return {
    odds: odds.length && Math.abs(sum - 100) < 0.01 ? odds : LUCKY_DEFAULT.odds,
    floor: Math.floor(num(o.floor, 1000)) || LUCKY_DEFAULT.floor,
    dailyTreatXp: Math.floor(num(o.dailyTreatXp, 10000)) || LUCKY_DEFAULT.dailyTreatXp,
    n: Math.floor(num(o.n, 1e7)),
    eligible: o.eligible !== false,
  };
}

/** Draws until the floor (1..floor): "Rare or better in N". Pure. */
export function untilFloor(t: Pick<LuckyTable, 'n' | 'floor'>): number {
  return t.floor - (t.n % t.floor);
}

/** A server grant (`lucky:<day>`, `treat:<day>`, `welcome:<n>`): what the `/live` save paid, applied once. */
export interface Grant {
  id: string;
  kind: 'lucky' | 'treat' | 'welcome';
  day: string;
  item?: string;
  xp?: number;
  rarity?: LuckyRarity;
  floor?: boolean;
  n?: number;
}

const GRANT_ID = /^(lucky|treat|welcome):[A-Za-z0-9:_-]{1,40}$/;
const ITEM = /^[A-Za-z0-9._:-]{1,80}$/;

/** The server's grant list, checked (unknown kinds, bad ids or empty grants dropped). Pure. */
export function parseGrants(raw: unknown): Grant[] {
  if (!Array.isArray(raw)) return [];
  const out: Grant[] = [];
  for (const g of raw.slice(-60)) {
    if (!g || typeof g !== 'object') continue;
    const o = g as Record<string, unknown>;
    if (typeof o.id !== 'string' || !GRANT_ID.test(o.id)) continue;
    if (o.kind !== 'lucky' && o.kind !== 'treat' && o.kind !== 'welcome') continue;
    const item = typeof o.item === 'string' && ITEM.test(o.item) ? o.item : undefined;
    const xp = typeof o.xp === 'number' && Number.isFinite(o.xp) && o.xp > 0 ? Math.min(10000, Math.floor(o.xp)) : undefined;
    if (!item && !xp) continue;
    out.push({
      id: o.id,
      kind: o.kind,
      day: typeof o.day === 'string' ? o.day.slice(0, 10) : '',
      ...(item ? { item } : {}),
      ...(xp ? { xp } : {}),
      ...(isRarity(o.rarity) ? { rarity: o.rarity } : {}),
      ...(o.floor === true ? { floor: true } : {}),
      ...(typeof o.n === 'number' && Number.isFinite(o.n) ? { n: Math.floor(o.n) } : {}),
    });
  }
  return out;
}
