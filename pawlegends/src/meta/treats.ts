/**
 * Treat Track (fun plan F4, GAPS A1): a local, free progress bar. Every match gives Treat XP (win 100, loss 60, +10 a
 * takedown, +20 when our team calmed Pudding, +150 for the first win of the local day, plus finished daily quests);
 * every TREAT_STEP fills the bar and opens a chest whose contents are shown in advance. Rewards come in a FIXED order
 * (no random rewards, nothing to buy, no currency): emotes, coats, titles, frames and postcards that only change how
 * things look. 30 chests cover all 8 heroes, then a fixed loop of palette coats keeps going, so the track never runs
 * dry. The player may pick a target hero: the next chest is that hero's next reward (the order inside each hero is
 * fixed). Browser storage in try/catch; a blocked store just means the bar starts empty. Never reaches the sim or the
 * server.
 *
 * Never on this track: anything that owning a $5 card gives (element chroma, Companion Kitten, card badge, card
 * skin). The shelter champions wear their real card's coat, so their rewards are a title, a frame and a "Meet the real
 * cat" postcard, never a recolour of the real cat.
 */
import type { HeroId } from '../sim/api';
import { uiName } from '../data/heroes/shelter';

export type TreatKind = 'emote' | 'coat' | 'title' | 'frame' | 'postcard';

export interface TreatReward {
  id: string;
  name: string;
  kind: TreatKind;
  hero?: HeroId;
  /** A palette coat from the loop after chest 30. */
  loop?: true;
}

/** About two to three matches a chest. */
export const TREAT_STEP = 300;
/** A typical match's Treat XP (a loss with a few takedowns): the "N matches to go" estimate. */
export const TREAT_MATCH_XP = 120;

/** The four original heroes (coats) and the four shelter champions (title, frame, postcard). */
export const TRACK_ORIGINALS: readonly HeroId[] = Object.freeze(['clem', 'sage', 'brutus', 'cacklejaw'] as HeroId[]);
export const TRACK_CHAMPIONS: readonly HeroId[] = Object.freeze(['lambo', 'aviete', 'bengas', 'gabe'] as HeroId[]);

const NAME: Readonly<Record<HeroId, string>> = Object.freeze({
  clem: 'Clem',
  sage: 'Sage',
  brutus: 'Sir Brutus',
  cacklejaw: 'Cacklejaw',
  lambo: 'Lambo',
  aviete: uiName('Avietė'),
  bengas: 'Bengas',
  gabe: uiName('Gabė'),
});

/** Champion titles from the track (shown on the title badge and the match plate when worn). */
export const TRACK_TITLES: Readonly<Record<string, string>> = Object.freeze({
  'title.champ.lambo': `${NAME.lambo}'s Pal`,
  'title.champ.aviete': `${NAME.aviete}'s Pal`,
  'title.champ.bengas': `${NAME.bengas}'s Pal`,
  'title.champ.gabe': `${NAME.gabe}'s Pal`,
});

const coat = (hero: HeroId, key: string, name: string): TreatReward => ({ id: `coat.${hero}.${key}`, name: `${name} ${NAME[hero]} coat`, kind: 'coat', hero });
const title = (hero: HeroId): TreatReward => ({ id: `title.champ.${hero}`, name: `"${TRACK_TITLES[`title.champ.${hero}`]}" title`, kind: 'title', hero });
const frame = (hero: HeroId): TreatReward => ({ id: `frame.champ.${hero}`, name: `${NAME[hero]} frame`, kind: 'frame', hero });
const postcard = (hero: HeroId): TreatReward => ({ id: `postcard.${hero}`, name: `${NAME[hero]} postcard`, kind: 'postcard', hero });

/**
 * Fixed order, 30 chests. A reward the player already owns is skipped (the next one opens instead). The first nine
 * are the original track (ids unchanged, so a stored profile keeps what it has).
 */
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
  // GAPS A1: the champions' postcards first (meet the real cat), one new coat per original between them
  postcard('lambo'),
  coat('clem', 'lilac', 'Lilac'),
  postcard('aviete'),
  coat('sage', 'fern', 'Fern'),
  postcard('bengas'),
  coat('brutus', 'storm', 'Storm'),
  postcard('gabe'),
  coat('cacklejaw', 'frost', 'Frost'),
  // titles, and palette variants of the earlier coats
  title('lambo'),
  { id: 'coat.clem.marmalade.rose', name: 'Rose Marmalade Clem coat', kind: 'coat', hero: 'clem' },
  title('aviete'),
  { id: 'coat.sage.midnight.teal', name: 'Teal Midnight Sage coat', kind: 'coat', hero: 'sage' },
  title('bengas'),
  { id: 'coat.brutus.ember.ash', name: 'Ash Ember Sir Brutus coat', kind: 'coat', hero: 'brutus' },
  title('gabe'),
  { id: 'coat.cacklejaw.spotted.mint', name: 'Mint Spotted Cacklejaw coat', kind: 'coat', hero: 'cacklejaw' },
  // frames, then one more palette variant (in place of a second emote: the match has one emote slot)
  frame('lambo'),
  frame('aviete'),
  frame('bengas'),
  frame('gabe'),
  { id: 'coat.clem.snowpaw.sky', name: 'Sky Snowpaw Clem coat', kind: 'coat', hero: 'clem' },
] as TreatReward[]);

/** The palettes of the loop after chest 30 (render/cosmetics.ts gives each its colours), each on every original. */
export const LOOP_PALETTES: readonly { key: string; name: string }[] = Object.freeze([
  { key: 'peach', name: 'Peach' },
  { key: 'plum', name: 'Plum' },
  { key: 'moss', name: 'Moss' },
  { key: 'slate', name: 'Slate' },
  { key: 'honey', name: 'Honey' },
  { key: 'coral', name: 'Coral' },
  { key: 'ink', name: 'Ink' },
  { key: 'cocoa', name: 'Cocoa' },
]);

/** After chest 30: a fixed list of palette coats, palette by palette, one per original hero. */
export const LOOP_REWARDS: readonly TreatReward[] = Object.freeze(
  LOOP_PALETTES.flatMap((p) => TRACK_ORIGINALS.map((h): TreatReward => ({ ...coat(h, `loop.${p.key}`, p.name), loop: true }))),
);

const ALL: readonly TreatReward[] = Object.freeze([...TREAT_REWARDS, ...LOOP_REWARDS]);
const BY_ID: ReadonlyMap<string, TreatReward> = new Map(ALL.map((r) => [r.id, r]));
export const treatReward = (id: string): TreatReward | null => BY_ID.get(id) ?? null;

export const TREAT_XP = Object.freeze({ win: 100, loss: 60, takedown: 10, takedownMax: 15, pudding: 20, firstWinOfDay: 150 });

export interface TreatState {
  v: 2;
  /** Total Treat XP ever earned. */
  xp: number;
  /** Chests opened. */
  chests: number;
  /** The hero whose next reward the player is working toward (null: the track's own order). */
  target: HeroId | null;
  /** The local day (YYYY-MM-DD) of the last first-win-of-the-day bonus, or null. */
  winDay: string | null;
}

const KEY = 'tt.pawlegends.treats.v1';
const HEROES: readonly HeroId[] = Object.freeze([...TRACK_ORIGINALS, ...TRACK_CHAMPIONS]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function freshTreats(): TreatState {
  return { v: 2, xp: 0, chests: 0, target: null, winDay: null };
}

interface Parsed {
  state: TreatState;
  /** A version 1 record (9 chests): its chests are reconciled once by `migrateTreats`. */
  legacy: boolean;
}

function parse(raw: string | null): Parsed {
  const s = freshTreats();
  if (!raw) return { state: s, legacy: false };
  try {
    const o = JSON.parse(raw) as Partial<Omit<TreatState, 'v'>> & { v?: unknown };
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(1e7, Math.floor(v)) : 0);
    s.xp = n(o.xp);
    s.chests = Math.min(n(o.chests), Math.floor(s.xp / TREAT_STEP));
    s.target = HEROES.includes(o.target as HeroId) ? (o.target as HeroId) : null;
    s.winDay = typeof o.winDay === 'string' && DAY.test(o.winDay) ? o.winDay : null;
    return { state: s, legacy: o.v !== 2 };
  } catch {
    /* corrupt: empty bar */
    return { state: freshTreats(), legacy: false };
  }
}

export function parseTreats(raw: string | null): TreatState {
  return parse(raw).state;
}

/**
 * GAPS A1 migration (pure): a version 1 record opened chests on a 9-reward track, and once those 9 were owned every
 * further chest opened empty ("Track complete"). Those empty chests are paid out now from the 30-reward order, so no
 * reward is lost. Idempotent, so nothing is granted twice: the chests already paid are counted from the track
 * rewards owned (the Biscuit coat is left out of the count, since the first win gives it too), so a second run over
 * the same record grants nothing. Returns the version 2 state and the rewards to add to the profile's unlocks.
 */
export function migrateTreats(raw: string | null, owned: ReadonlySet<string>): { state: TreatState; grants: TreatReward[]; migrated: boolean } {
  const { state, legacy } = parse(raw);
  if (!legacy) return { state, grants: [], migrated: false };
  const have = new Set(owned);
  const paid = ALL.filter((r) => r.id !== 'coat.brutus.biscuit' && have.has(r.id)).length;
  const grants: TreatReward[] = [];
  for (let i = paid; i < state.chests; i++) {
    const r = nextReward(have, null, i);
    if (have.has(r.id)) break;
    grants.push(r);
    have.add(r.id);
  }
  return { state, grants, migrated: true };
}

export function loadTreatsRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function loadTreats(): TreatState {
  return parseTreats(loadTreatsRaw());
}

export function saveTreats(s: TreatState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* blocked */
  }
}

/** Treat XP for one match (quest XP and the first-win-of-the-day bonus are added by `addTreatXp`'s caller). Pure. */
export function treatXpFor(m: { won: boolean; takedowns: number; pudding: boolean }): number {
  return (m.won ? TREAT_XP.win : TREAT_XP.loss) + Math.min(TREAT_XP.takedownMax, Math.max(0, m.takedowns)) * TREAT_XP.takedown + (m.pudding ? TREAT_XP.pudding : 0);
}

/**
 * GAPS A6: the first win of the local day gives TREAT_XP.firstWinOfDay once per calendar day. No streak (missing a
 * day costs nothing) and no catnip. Pure.
 */
export function firstWinBonus(winDay: string | null, won: boolean, today: string): number {
  return won && winDay !== today ? TREAT_XP.firstWinOfDay : 0;
}

/**
 * The next reward (pure, never null): the target hero's next one when it has any left, else the first one not owned
 * in the fixed order, and when everything is owned the loop again by chest number.
 */
export function nextReward(owned: ReadonlySet<string>, target: HeroId | null = null, chests = 0): TreatReward {
  if (target) {
    const t = ALL.find((r) => r.hero === target && !owned.has(r.id));
    if (t) return t;
  }
  return ALL.find((r) => !owned.has(r.id)) ?? LOOP_REWARDS[chests % LOOP_REWARDS.length];
}

/** A hero's part of the 30-chest track: owned of total, and its next reward (originals go on into the loop). Pure. */
export function heroTrack(hero: HeroId, owned: ReadonlySet<string>): { have: number; total: number; next: TreatReward | null } {
  const mine = TREAT_REWARDS.filter((r) => r.hero === hero);
  return { have: mine.filter((r) => owned.has(r.id)).length, total: mine.length, next: ALL.find((r) => r.hero === hero && !owned.has(r.id)) ?? null };
}

/** "N matches to go" until the next chest, at a typical match's Treat XP (at least 1). Pure. */
export function matchesToGo(s: Pick<TreatState, 'xp'>): number {
  const left = TREAT_STEP - (s.xp % TREAT_STEP);
  return Math.max(1, Math.ceil(left / TREAT_MATCH_XP));
}

export interface TreatGain {
  state: TreatState;
  /** Bar fill before and after, 0..1 of the current step (after may wrap: see `chests`). */
  before: number;
  after: number;
  gained: number;
  /** The first-win-of-the-day bonus inside `gained` (0 or TREAT_XP.firstWinOfDay). */
  dayBonus: number;
  /** Chests opened by this gain, in order. */
  rewards: TreatReward[];
  /** What the next chest holds (shown in advance). */
  next: TreatReward;
  /** About how many matches until it opens. */
  toGo: number;
}

/**
 * Add Treat XP; opens a chest per TREAT_STEP crossed. `owned` = free unlocks and items already owned. With `win`,
 * the first win of the local day adds its bonus and stamps the day. Pure.
 */
export function addTreatXp(s: TreatState, gained: number, owned: ReadonlySet<string>, win?: { won: boolean; day: string }): TreatGain {
  const dayBonus = win ? firstWinBonus(s.winDay, win.won, win.day) : 0;
  const g = Math.max(0, Math.floor(gained)) + dayBonus;
  const before = (s.xp % TREAT_STEP) / TREAT_STEP;
  const xp = s.xp + g;
  const due = Math.floor(xp / TREAT_STEP);
  const rewards: TreatReward[] = [];
  const have = new Set(owned);
  let chests = s.chests;
  while (chests < due) {
    const r = nextReward(have, s.target, chests);
    chests++;
    rewards.push(r);
    have.add(r.id);
  }
  const state: TreatState = { v: 2, xp, chests, target: s.target, winDay: dayBonus > 0 && win ? win.day : s.winDay };
  return { state, before, after: (xp % TREAT_STEP) / TREAT_STEP, gained: g, dayBonus, rewards, next: nextReward(have, s.target, chests), toGo: matchesToGo(state) };
}
