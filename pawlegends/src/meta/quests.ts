/**
 * Daily quests (fun plan F4): three a day, picked from a fixed pool by the local date (same three all day, no
 * random rolls the player can buy or reroll). Each one finished gives Treat XP. Local only, browser storage in
 * try/catch. Copy follows docs/CLAIMS.md: play goals only, no money or currency words.
 */
import type { HeroId } from '../sim/api';

export type QuestMetric = 'takedowns' | 'pudding' | 'win' | 'matches' | 'towers' | 'combos';

export interface Quest {
  id: string;
  text: string;
  goal: number;
  metric: QuestMetric;
  /** `win` with this hero only. */
  hero?: HeroId;
}

export const QUEST_XP = 50;

export const QUEST_POOL: readonly Quest[] = Object.freeze([
  { id: 'takedowns5', text: 'Get 5 takedowns (K + A)', goal: 5, metric: 'takedowns' },
  { id: 'pudding', text: 'Calm Pudding', goal: 1, metric: 'pudding' },
  { id: 'win', text: 'Win a match', goal: 1, metric: 'win' },
  { id: 'win_clem', text: 'Win with Clem', goal: 1, metric: 'win', hero: 'clem' },
  { id: 'win_sage', text: 'Win with Sage', goal: 1, metric: 'win', hero: 'sage' },
  { id: 'win_brutus', text: 'Win with Sir Brutus', goal: 1, metric: 'win', hero: 'brutus' },
  { id: 'win_cacklejaw', text: 'Win with Cacklejaw', goal: 1, metric: 'win', hero: 'cacklejaw' },
  { id: 'play2', text: 'Play 2 matches', goal: 2, metric: 'matches' },
  { id: 'towers2', text: 'Take down 2 towers', goal: 2, metric: 'towers' },
  { id: 'combo3', text: 'Land 3 combos', goal: 3, metric: 'combos' },
  { id: 'takedowns10', text: 'Get 10 takedowns (K + A)', goal: 10, metric: 'takedowns' },
] as Quest[]);

export interface QuestState {
  v: 1;
  day: string;
  progress: Record<string, number>;
  done: string[];
}

export interface MatchFacts {
  won: boolean;
  hero: HeroId;
  takedowns: number;
  pudding: boolean;
  /** Towers our team took. */
  towers: number;
  combos: number;
}

const KEY = 'tt.pawlegends.quests.v1';

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The day's three quests: a fixed pick per date, at most one "win with a hero". Pure. `hero` (the player's first
 * matches, round 0): the "win with a hero" quest names the hero being played, since the first route never shows
 * the pick screen ("Win with Cacklejaw" while the game put the player on Clem).
 */
export function dailyQuests(day: string, hero?: HeroId): Quest[] {
  const base = dayPick(day);
  if (!hero) return base;
  const mine = QUEST_POOL.find((q) => q.metric === 'win' && q.hero === hero);
  return mine ? base.map((q) => (q.hero && !base.includes(mine) ? mine : q)) : base;
}

function dayPick(day: string): Quest[] {
  const out: Quest[] = [];
  let h = fnv(`pawlegends:${day}`);
  let heroWin = false;
  for (let guard = 0; out.length < 3 && guard < 64; guard++) {
    const q = QUEST_POOL[h % QUEST_POOL.length];
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    if (out.includes(q)) continue;
    if (q.hero) {
      if (heroWin) continue;
      heroWin = true;
    }
    if (q.metric === 'takedowns' && out.some((o) => o.metric === 'takedowns')) continue;
    out.push(q);
  }
  return out;
}

export function freshQuests(day: string): QuestState {
  return { v: 1, day, progress: {}, done: [] };
}

export function parseQuests(raw: string | null, day: string): QuestState {
  if (!raw) return freshQuests(day);
  try {
    const o = JSON.parse(raw) as Partial<QuestState>;
    if (o.day !== day) return freshQuests(day);
    const ids = new Set(QUEST_POOL.map((q) => q.id));
    const progress: Record<string, number> = {};
    if (o.progress && typeof o.progress === 'object') {
      for (const [k, v] of Object.entries(o.progress)) if (ids.has(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) progress[k] = Math.min(1000, Math.floor(v));
    }
    const done = Array.isArray(o.done) ? o.done.filter((d): d is string => typeof d === 'string' && ids.has(d)) : [];
    return { v: 1, day, progress, done };
  } catch {
    return freshQuests(day);
  }
}

export function loadQuests(day = dayKey()): QuestState {
  try {
    return parseQuests(localStorage.getItem(KEY), day);
  } catch {
    return freshQuests(day);
  }
}

export function saveQuests(s: QuestState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* blocked */
  }
}

function amount(q: Quest, m: MatchFacts): number {
  switch (q.metric) {
    case 'takedowns':
      return m.takedowns;
    case 'pudding':
      return m.pudding ? 1 : 0;
    case 'win':
      return m.won && (!q.hero || q.hero === m.hero) ? 1 : 0;
    case 'matches':
      return 1;
    case 'towers':
      return m.towers;
    case 'combos':
      return m.combos;
  }
}

export interface QuestView {
  quest: Quest;
  value: number;
  done: boolean;
  /** Finished by this match. */
  fresh: boolean;
}

/** Count one match toward today's quests. Pure. Returns the new state, each quest's view and the XP earned. */
export function progressQuests(s: QuestState, m: MatchFacts, followHero = false): { state: QuestState; views: QuestView[]; xp: number } {
  const state: QuestState = { v: 1, day: s.day, progress: { ...s.progress }, done: [...s.done] };
  const views: QuestView[] = [];
  let xp = 0;
  for (const q of dailyQuests(s.day, followHero ? m.hero : undefined)) {
    const was = state.done.includes(q.id);
    const value = Math.min(q.goal, (state.progress[q.id] ?? 0) + (was ? 0 : amount(q, m)));
    state.progress[q.id] = value;
    const done = was || value >= q.goal;
    const fresh = done && !was;
    if (fresh) {
      state.done.push(q.id);
      xp += QUEST_XP;
    }
    views.push({ quest: q, value, done, fresh });
  }
  return { state, views, xp };
}

/** Today's quests as they stand (title screen). Pure. */
export function questViews(s: QuestState, hero?: HeroId): QuestView[] {
  return dailyQuests(s.day, hero).map((q) => ({ quest: q, value: Math.min(q.goal, s.progress[q.id] ?? 0), done: s.done.includes(q.id), fresh: false }));
}
