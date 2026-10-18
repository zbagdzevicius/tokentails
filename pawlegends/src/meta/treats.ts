/**
 * Treat Track (fun plan F4): a local, free progress bar. Every match gives Treat XP (win 100, loss 60, +10 a
 * takedown, +20 when our team calmed Pudding, plus finished daily quests); every TREAT_STEP fills the bar and opens
 * a chest whose contents are shown in advance. Rewards come in a FIXED order (no random rewards, nothing to buy,
 * no currency): emotes and coats that only change how a hero looks. Browser storage in try/catch; a blocked store
 * just means the bar starts empty. Never reaches the sim or the server.
 */
import type { HeroId } from '../sim/api';

export interface TreatReward {
  id: string;
  name: string;
  kind: 'emote' | 'coat';
  hero?: HeroId;
}

/** About two to three matches a chest. */
export const TREAT_STEP = 300;

/** Fixed order. A reward the player already owns is skipped (the next one opens instead). */
export const TREAT_REWARDS: readonly TreatReward[] = Object.freeze([
  { id: 'emote.wave', name: 'Wave emote', kind: 'emote' },
  { id: 'coat.clem.marmalade', name: 'Marmalade Clem coat', kind: 'coat', hero: 'clem' },
  { id: 'coat.sage.midnight', name: 'Midnight Sage coat', kind: 'coat', hero: 'sage' },
  { id: 'coat.brutus.biscuit', name: 'Biscuit Sir Brutus coat', kind: 'coat', hero: 'brutus' },
  { id: 'coat.cacklejaw.spotted', name: 'Spotted Cacklejaw coat', kind: 'coat', hero: 'cacklejaw' },
  { id: 'coat.clem.snowpaw', name: 'Snowpaw Clem coat', kind: 'coat', hero: 'clem' },
  { id: 'coat.sage.sunrise', name: 'Sunrise Sage coat', kind: 'coat', hero: 'sage' },
  { id: 'coat.brutus.ember', name: 'Ember Sir Brutus coat', kind: 'coat', hero: 'brutus' },
  { id: 'coat.cacklejaw.dusk', name: 'Dusk Cacklejaw coat', kind: 'coat', hero: 'cacklejaw' },
] as TreatReward[]);

export const TREAT_XP = Object.freeze({ win: 100, loss: 60, takedown: 10, takedownMax: 15, pudding: 20 });

export interface TreatState {
  v: 1;
  /** Total Treat XP ever earned. */
  xp: number;
  /** Chests opened. */
  chests: number;
}

const KEY = 'tt.pawlegends.treats.v1';

export function freshTreats(): TreatState {
  return { v: 1, xp: 0, chests: 0 };
}

export function parseTreats(raw: string | null): TreatState {
  const s = freshTreats();
  if (!raw) return s;
  try {
    const o = JSON.parse(raw) as Partial<TreatState>;
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(1e7, Math.floor(v)) : 0);
    s.xp = n(o.xp);
    s.chests = Math.min(n(o.chests), Math.floor(s.xp / TREAT_STEP));
  } catch {
    /* corrupt: empty bar */
  }
  return s;
}

export function loadTreats(): TreatState {
  try {
    return parseTreats(localStorage.getItem(KEY));
  } catch {
    return freshTreats();
  }
}

export function saveTreats(s: TreatState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* blocked */
  }
}

/** Treat XP for one match (quest XP is added by the caller). Pure. */
export function treatXpFor(m: { won: boolean; takedowns: number; pudding: boolean }): number {
  return (m.won ? TREAT_XP.win : TREAT_XP.loss) + Math.min(TREAT_XP.takedownMax, Math.max(0, m.takedowns)) * TREAT_XP.takedown + (m.pudding ? TREAT_XP.pudding : 0);
}

/** The next reward the player does not own yet, or null when the track is complete. Pure. */
export function nextReward(owned: ReadonlySet<string>, skip: ReadonlySet<string> = new Set()): TreatReward | null {
  return TREAT_REWARDS.find((r) => !owned.has(r.id) && !skip.has(r.id)) ?? null;
}

export interface TreatGain {
  state: TreatState;
  /** Bar fill before and after, 0..1 of the current step (after may wrap: see `chests`). */
  before: number;
  after: number;
  gained: number;
  /** Chests opened by this gain, in order. */
  rewards: TreatReward[];
  /** What the next chest holds (shown in advance), or null. */
  next: TreatReward | null;
}

/** Add Treat XP; opens a chest per TREAT_STEP crossed. `owned` = free unlocks and items already owned. Pure. */
export function addTreatXp(s: TreatState, gained: number, owned: ReadonlySet<string>): TreatGain {
  const g = Math.max(0, Math.floor(gained));
  const before = (s.xp % TREAT_STEP) / TREAT_STEP;
  const xp = s.xp + g;
  const due = Math.floor(xp / TREAT_STEP);
  const rewards: TreatReward[] = [];
  const have = new Set(owned);
  let chests = s.chests;
  while (chests < due) {
    chests++;
    const r = nextReward(have);
    if (r) {
      rewards.push(r);
      have.add(r.id);
    }
  }
  const state: TreatState = { v: 1, xp, chests };
  return { state, before, after: (xp % TREAT_STEP) / TREAT_STEP, gained: g, rewards, next: nextReward(have) };
}
