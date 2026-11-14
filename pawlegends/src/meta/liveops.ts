/**
 * Live ops (docs/plans/moba/LIVEOPS.md): the Events calendar, the featured mode, the community goal, Winter Nap and
 * the fan vote, read from the server (`GET /pawlegends/config` through the host's `liveops.*` ops; the game never sees
 * a URL or a token). Standalone or offline, the baked weekly rotation still features a mode and Winter Nap still shows
 * its dates; the goal and the vote need the server, so they are simply not shown.
 *
 * The community goal and the Winter Nap days move only with saved matches (the backend's `/live`), never from here.
 * Rewards are free palette coats the game already draws (render/cosmetics.ts FREE_COATS): a claimed coat joins the
 * profile's free unlocks, and `liveops.me` lists every coat live ops granted, so a new device gets them back.
 *
 * The featured mode gets its ribbon through `registerMode` (a timed event state on a live mode: Mode Select's countdown
 * chip); the base entry comes back when the feature ends. No new start button, no price, no random reward.
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { FREE_COATS } from '../render/cosmetics';
import { BASE_MODES, bossModeDef, bossWeekend, registerMode, twistModeDef, unregisterMode } from '../ui/modeSelect/modes';
import { WEEKLY_TWISTS, type Mutator } from '../sim/api';
import { loadProfile, saveProfile, UNLOCKS_MAX } from './profile';

export interface LiveopsGoal {
  id: string;
  label: string;
  metric: 'matches' | 'wins' | 'takedowns';
  target: number;
  progress: number;
  reached: boolean;
  rewardItem: string;
  rewardName: string;
  startsAt: number;
  endsAt: number;
}

export interface LiveopsVoteOption {
  id: 'a' | 'b';
  name: string;
  hero: string;
  colors: string[];
}

export interface LiveopsVote {
  id: string;
  question: string;
  options: LiveopsVoteOption[];
  open: boolean;
  tallies: { a: number; b: number };
  endsAt: number;
}

export interface LiveopsNap {
  id: string;
  name: string;
  startsAt: number;
  endsAt: number;
  gifts: { day: number; item: string; name: string }[];
}

export interface LiveopsEvent {
  id: string;
  kind: 'mode' | 'goal' | 'nap' | 'vote';
  title: string;
  sub: string;
  startsAt: number;
  endsAt: number;
  mode?: string;
}

/** Sim v27 (docs/plans/moba/V27.md §4): the week's twist (a sim mutator of WEEKLY_TWISTS) and its tile's text. */
export interface LiveopsTwist {
  id: Mutator;
  name: string;
  rules: string[];
  endsAt: number;
}

export interface LiveopsConfig {
  /** True when the server answered (the goal and vote exist only then). */
  live: boolean;
  events: LiveopsEvent[];
  featuredMode: { id: string; endsAt: number } | null;
  /** Sim v27: the Weekly Twist tile's rule set (the baked rotation offline), or null when the server turned it off. */
  twist: LiveopsTwist | null;
  /**
   * Sim v28 (docs/plans/moba/V28.md §4): Boss Weekend's window (running now, else the next one; the baked Friday to
   * Monday schedule offline), or null when the server turned it off.
   */
  boss: { startsAt: number; endsAt: number } | null;
  featuredQuests: string[];
  goal: LiveopsGoal | null;
  vote: LiveopsVote | null;
  nap: LiveopsNap | null;
}

export interface LiveopsMe {
  goal: { id: string; claimed: boolean } | null;
  nap: { days: number; earned: number; claimed: number; playedToday: boolean } | null;
  vote: { id: string; choice: 'a' | 'b' | null } | null;
  items: string[];
}

export interface LiveopsState {
  config: LiveopsConfig;
  me: LiveopsMe | null;
  /** An action in flight ('goal' | 'nap' | 'vote'), for the button's busy state. */
  busy: string | null;
  /** The last action's line ("Honey coat for Clem is yours!"), or null. */
  toast: string | null;
}

const DAY = 86_400_000;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.length >= 1 && v.length <= max ? v : null);
const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const nat = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
const COAT = /^coat\.[a-z]{2,16}\.[a-z0-9._-]{1,40}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/** The modes the baked rotation features (the server's FEATURED_ROTATION). */
export const FEATURED_ROTATION: readonly string[] = Object.freeze(['blitz', 'skirmish', 'classic']);
/** The modes the server may feature: the rotation's, sim v27's Weekly Twist tile and sim v28's Boss Weekend. */
export const FEATURABLE: readonly string[] = Object.freeze([...FEATURED_ROTATION, 'twist', 'boss']);

/** The Monday 00:00 UTC after `now`. Pure. */
export function nextMonday(now: number): number {
  const d = new Date(now);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7;
  return day + (7 - dow) * DAY;
}

/** The baked weekly rotation (the same as the server's `rotationFeatured`). Pure. */
export function rotationFeatured(now: number): { id: string; endsAt: number } {
  const end = nextMonday(now);
  return { id: FEATURED_ROTATION[Math.floor(end / (7 * DAY)) % FEATURED_ROTATION.length], endsAt: end };
}

/** Sim v27: the twists' names and rule lines (the server's TWIST_INFO), for the baked rotation offline. */
export const TWIST_INFO: Readonly<Record<string, { name: string; rules: string[] }>> = Object.freeze({
  toybox: { name: 'Toy Box', rules: ['Fish comes twice as fast, so Toys arrive sooner.', 'Frenzy Catnip and Fish Snacks spawn twice as often.'] },
  rapid: { name: 'Rapid Paws', rules: ['Every ability and Paw Trick cools down 40% faster.'] },
  bounty: { name: 'Bounty Hunt', rules: ['A hero on a takedown streak is worth three times the bounty.', 'Ending a streak pays three times the Fish.'] },
});

/** Sim v27: the baked twist rotation, one twist a week (the same as the server's `rotationTwist`). Pure. */
export function rotationTwist(now: number): LiveopsTwist {
  const end = nextMonday(now);
  const id = WEEKLY_TWISTS[Math.floor(end / (7 * DAY)) % WEEKLY_TWISTS.length];
  return { id, ...TWIST_INFO[id], rules: [...TWIST_INFO[id].rules], endsAt: end };
}

function parseTwist(v: unknown, now: number): LiveopsTwist | null {
  if (!isRec(v) || typeof v.id !== 'string' || !(WEEKLY_TWISTS as readonly string[]).includes(v.id)) return null;
  const endsAt = time(v.endsAt);
  if (endsAt === null || endsAt <= now) return null;
  const info = TWIST_INFO[v.id];
  const rules = Array.isArray(v.rules) ? v.rules.map((r) => str(r, 120)).filter((r): r is string => !!r).slice(0, 3) : [];
  return { id: v.id as Mutator, name: str(v.name, 32) ?? info.name, rules: rules.length ? rules : [...info.rules], endsAt };
}

/** Winter Nap's dates, shown even offline (the server's DEFAULT_NAP). */
export const NAP_FALLBACK: LiveopsNap = Object.freeze({
  id: 'nap-2026',
  name: 'Winter Nap',
  startsAt: Date.parse('2026-12-15T00:00:00Z'),
  endsAt: Date.parse('2027-01-05T00:00:00Z'),
  gifts: [],
}) as LiveopsNap;

/** The config before (or without) a server answer. Pure. */
export function fallbackConfig(now: number): LiveopsConfig {
  // sim v27: offline, the baked twist is the featured mode (as on the server); sim v28: Boss Weekend on its weekends
  const twist = rotationTwist(now);
  const boss = bossWeekend(now);
  const featuredMode = now >= boss.startsAt ? { id: 'boss', endsAt: boss.endsAt } : { id: 'twist', endsAt: twist.endsAt };
  return { live: false, events: [], featuredMode, twist, boss, featuredQuests: [], goal: null, vote: null, nap: now < NAP_FALLBACK.endsAt ? NAP_FALLBACK : null };
}

/** Sim v28: the server's Boss Weekend window (absent: the baked schedule; null: turned off). Pure. */
function parseBoss(v: unknown, now: number): { startsAt: number; endsAt: number } | null {
  if (v === undefined) return bossWeekend(now);
  if (!isRec(v)) return null;
  const startsAt = time(v.startsAt);
  const endsAt = time(v.endsAt);
  if (startsAt === null || endsAt === null || endsAt <= now || endsAt <= startsAt) return null;
  return { startsAt, endsAt };
}

function parseGoal(v: unknown): LiveopsGoal | null {
  if (!isRec(v)) return null;
  const id = str(v.id, 40);
  const label = str(v.label, 60);
  const metric = v.metric === 'matches' || v.metric === 'wins' || v.metric === 'takedowns' ? v.metric : null;
  const target = nat(v.target);
  const progress = nat(v.progress);
  const rewardItem = typeof v.rewardItem === 'string' && COAT.test(v.rewardItem) ? v.rewardItem : null;
  const rewardName = str(v.rewardName, 60);
  const startsAt = time(v.startsAt);
  const endsAt = time(v.endsAt);
  if (!id || !label || !metric || !target || progress === null || !rewardItem || !rewardName || startsAt === null || endsAt === null) return null;
  return { id, label, metric, target, progress, reached: v.reached === true || progress >= target, rewardItem, rewardName, startsAt, endsAt };
}

function parseVote(v: unknown): LiveopsVote | null {
  if (!isRec(v) || !Array.isArray(v.options) || v.options.length !== 2) return null;
  const id = str(v.id, 40);
  const question = str(v.question, 80);
  const endsAt = time(v.endsAt);
  const options: LiveopsVoteOption[] = [];
  for (const [i, o] of v.options.entries()) {
    if (!isRec(o)) return null;
    const name = str(o.name, 32);
    const hero = typeof o.hero === 'string' && /^[a-z]{2,16}$/.test(o.hero) ? o.hero : null;
    const colors = Array.isArray(o.colors) ? o.colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 3) : [];
    if (!name || !hero || colors.length !== 3) return null;
    options.push({ id: i === 0 ? 'a' : 'b', name, hero, colors });
  }
  const t = isRec(v.tallies) ? v.tallies : {};
  if (!id || !question || endsAt === null) return null;
  return { id, question, options, open: v.open === true, tallies: { a: nat(t.a) ?? 0, b: nat(t.b) ?? 0 }, endsAt };
}

function parseNap(v: unknown): LiveopsNap | null {
  if (!isRec(v) || !Array.isArray(v.gifts)) return null;
  const id = str(v.id, 40);
  const name = str(v.name, 32);
  const startsAt = time(v.startsAt);
  const endsAt = time(v.endsAt);
  const gifts = v.gifts
    .slice(0, 21)
    .filter((g): g is Record<string, unknown> => isRec(g) && typeof g.item === 'string' && COAT.test(g.item) && !!str(g.name, 60))
    .map((g, i) => ({ day: i + 1, item: g.item as string, name: g.name as string }));
  if (!id || !name || startsAt === null || endsAt === null || !gifts.length) return null;
  return { id, name, startsAt, endsAt, gifts };
}

/** `GET /pawlegends/config` as a clean copy, or null. Pure. */
export function parseConfig(body: unknown, now: number): LiveopsConfig | null {
  if (!isRec(body) || body.v !== 1) return null;
  const twist = parseTwist(body.twist, now);
  const fm0 = isRec(body.featuredMode) && typeof body.featuredMode.id === 'string' && FEATURABLE.includes(body.featuredMode.id) ? { id: body.featuredMode.id, endsAt: time(body.featuredMode.endsAt) ?? 0 } : null;
  const boss = parseBoss(body.boss, now);
  // a featured twist needs its twist; sim v28: a featured Boss Weekend needs its weekend running
  const fm = fm0 && (fm0.id !== 'twist' || twist) && (fm0.id !== 'boss' || (boss && now >= boss.startsAt)) ? fm0 : null;
  const events = Array.isArray(body.events)
    ? body.events
        .filter(isRec)
        .slice(0, 12)
        .map((e) => ({
          id: str(e.id, 40) ?? '',
          kind: e.kind as LiveopsEvent['kind'],
          title: str(e.title, 80) ?? '',
          sub: str(e.sub, 80) ?? '',
          startsAt: time(e.startsAt) ?? 0,
          endsAt: time(e.endsAt) ?? 0,
          ...(typeof e.mode === 'string' ? { mode: e.mode } : {}),
        }))
        .filter((e) => e.id && e.title && ['mode', 'goal', 'nap', 'vote'].includes(e.kind))
    : [];
  return {
    live: true,
    events,
    featuredMode: fm && fm.endsAt > now ? fm : twist ? { id: 'twist', endsAt: twist.endsAt } : rotationFeatured(now),
    twist,
    boss,
    featuredQuests: Array.isArray(body.featuredQuests) ? body.featuredQuests.map((q) => str(q, 60)).filter((q): q is string => !!q).slice(0, 3) : [],
    goal: parseGoal(body.goal),
    vote: parseVote(body.vote),
    nap: parseNap(body.nap),
  };
}

/** `GET /pawlegends/config/me` (and the claim and vote answers) as a clean copy, or null. Pure. */
export function parseMe(body: unknown): LiveopsMe | null {
  if (!isRec(body)) return null;
  const g = isRec(body.goal) && typeof body.goal.id === 'string' ? { id: body.goal.id, claimed: body.goal.claimed === true } : null;
  const n = isRec(body.nap) ? { days: nat(body.nap.days) ?? 0, earned: nat(body.nap.earned) ?? 0, claimed: nat(body.nap.claimed) ?? 0, playedToday: body.nap.playedToday === true } : null;
  const c = isRec(body.vote) ? body.vote.choice : null;
  const choice: 'a' | 'b' | null = c === 'a' || c === 'b' ? c : null;
  const v = isRec(body.vote) && typeof body.vote.id === 'string' ? { id: body.vote.id, choice } : null;
  const items = Array.isArray(body.items) ? body.items.filter((i): i is string => typeof i === 'string' && COAT.test(i)).slice(0, 60) : [];
  return { goal: g, nap: n, vote: v, items };
}

/** The goal bar's fill, 0..100. Pure. */
export const goalPct = (g: Pick<LiveopsGoal, 'progress' | 'target'>): number => Math.max(0, Math.min(100, Math.floor((100 * g.progress) / Math.max(1, g.target))));

/** Winter Nap's phase at `now`. Pure. */
export function napPhase(n: Pick<LiveopsNap, 'startsAt' | 'endsAt'>, now: number): 'before' | 'on' | 'after' {
  return now < n.startsAt ? 'before' : now < n.endsAt ? 'on' : 'after';
}

/** The vote's shares in whole percent (a + b = 100 when anyone voted). Pure. */
export function voteShares(t: { a: number; b: number }): { a: number; b: number } {
  const total = t.a + t.b;
  if (!total) return { a: 0, b: 0 };
  const a = Math.round((100 * t.a) / total);
  return { a, b: 100 - a };
}

/** The coat ids to add to the profile's free unlocks: known palette coats not already there. Pure. */
export function unlocksToAdd(have: readonly string[], items: readonly string[]): string[] {
  return [...new Set(items)].filter((i) => i in FREE_COATS && !have.includes(i));
}

// --------------------------------------------------------------------------------------------- the live store

type Api = (op: ApiOp, args?: ApiArgs) => Promise<ApiResult>;

let api: Api | null = null;
/** Whether this player has a server account to ask `liveops.me` for (a saved match: a guest session exists). */
let hasAccount: () => boolean = () => false;
let state: LiveopsState = { config: fallbackConfig(Date.now()), me: null, busy: null, toast: null };
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let featuredTimer: ReturnType<typeof setTimeout> | null = null;
let featuredKey = '';
const subs = new Set<(s: LiveopsState) => void>();

export const liveopsState = (): LiveopsState => state;

/** Listen for changes; returns the unsubscribe. */
export function onLiveops(fn: (s: LiveopsState) => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

function emit(patch: Partial<LiveopsState>): void {
  state = { ...state, ...patch };
  for (const fn of [...subs]) {
    try {
      fn(state);
    } catch {
      /* one bad listener never stops the others */
    }
  }
}

/**
 * The featured mode's ribbon: the live base mode registered with a timed event state until `endsAt`, then the base
 * entry again. Only a mode that is live in this build is ever featured.
 */
export function applyFeatured(f: { id: string; endsAt: number } | null, now = Date.now()): boolean {
  const key = f ? `${f.id}@${f.endsAt}` : '';
  if (key === featuredKey) return false;
  if (featuredTimer) clearTimeout(featuredTimer);
  featuredTimer = null;
  // the previous feature goes back to its base entry
  const prev = featuredKey.split('@')[0];
  const prevBase = BASE_MODES.find((m) => m.id === prev);
  if (prevBase) registerMode(prevBase);
  featuredKey = '';
  // sim v27: the Weekly Twist tile is a timed event by itself (applyTwist): featuring it is only its ribbon. Sim v28:
  // so is Boss Weekend (applyBoss).
  if (f && (f.id === 'twist' || f.id === 'boss') && f.endsAt > now) {
    featuredKey = key;
    return true;
  }
  const base = f ? BASE_MODES.find((m) => m.id === f.id) : undefined;
  // round 4: Ranked is always open with its own live tile (counts, Prime Time); it is never turned into a timed event
  if (!f || !base || base.state !== 'live' || base.id === 'ranked' || f.endsAt <= now) return !!prevBase;
  registerMode({ ...base, state: { event: { endsAt: f.endsAt } } });
  featuredKey = key;
  const ms = f.endsAt - now;
  // a tab open across the end: the mode stays playable (setTimeout caps at ~24.8 days)
  if (ms < 2 ** 31 - 1)
    featuredTimer = setTimeout(() => {
      const t = Date.now();
      const twist = applyTwist(rotationTwist(t), t);
      if (applyFeatured({ id: 'twist', endsAt: rotationTwist(t).endsAt }, t) || twist) onModesChanged();
    }, ms + 50);
  return true;
}

let twistKey = '';
let bossKey = '';

/**
 * Sim v28 (V28.md §4): the Boss Weekend tile, registered with its window (an event: playable inside it, "Next: Fri"
 * before it); "Coming soon" when the server turned it off. Returns whether the mode list changed.
 */
export function applyBoss(b: { startsAt: number; endsAt: number } | null): boolean {
  const key = b ? `${b.startsAt}@${b.endsAt}` : '';
  if (key === bossKey) return false;
  bossKey = key;
  // turned off: the tile stays, as "Coming soon"
  registerMode(b ? bossModeDef(b) : { ...bossModeDef(bossWeekend(Date.now())), state: 'soon' });
  return true;
}

/**
 * Sim v27 (V27.md §4): the Weekly Twist tile, registered with its week's mutator and a countdown to its end; gone when
 * the server turned the twist off. Returns whether the mode list changed.
 */
export function applyTwist(t: LiveopsTwist | null, now = Date.now()): boolean {
  const live = t && t.endsAt > now ? t : null;
  const key = live ? `${live.id}@${live.endsAt}@${live.name}` : '';
  if (key === twistKey) return false;
  twistKey = key;
  if (live) registerMode(twistModeDef(live));
  else unregisterMode('twist');
  return true;
}

/** Home redraws its modes (a server feature replaced the baked one, or a feature ended). */
let onModesChanged: () => void = () => undefined;

/**
 * The game's one hook (app.ts, as Home renders): where the ops go, whether `liveops.me` may be asked, and how Home
 * redraws when the featured mode changes. Idempotent.
 */
export function initLiveops(call: Api, account: () => boolean, modesChanged?: () => void): void {
  api = call;
  hasAccount = account;
  if (modesChanged) onModesChanged = modesChanged;
  applyTwist(state.config.twist);
  applyBoss(state.config.boss);
  applyFeatured(state.config.featuredMode);
}

/** Grant the coats live ops lists to the profile's free unlocks (a new device gets them back). */
function grant(items: readonly string[]): string[] {
  const p = loadProfile();
  const add = unlocksToAdd(p.unlocks, items);
  if (add.length) saveProfile({ ...p, unlocks: [...p.unlocks, ...add].slice(-UNLOCKS_MAX) });
  return add;
}

/** Re-read the config (and the account's state) when older than `maxAgeMs`. Never throws. */
export function refreshLiveops(maxAgeMs = 60_000): Promise<void> {
  if (!api) return Promise.resolve();
  if (inflight) return inflight;
  if (Date.now() - fetchedAt < maxAgeMs) return Promise.resolve();
  const call = api;
  inflight = (async () => {
    try {
      const [c, m] = await Promise.all([call('liveops.config'), hasAccount() ? call('liveops.me') : Promise.resolve(null)]);
      const now = Date.now();
      const config = c?.ok ? parseConfig(c.body, now) : null;
      const me = m?.ok ? parseMe(m.body) : null;
      if (config || me) {
        fetchedAt = now;
        retries = 0;
      } else if (retries < 5 && !retryTimer) {
        // the host's bridge is not up yet (the first Home renders before the handshake) or the network blinked
        retries++;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void refreshLiveops(0);
        }, 1500 * retries);
      }
      if (me) grant(me.items);
      const twisted = config ? applyTwist(config.twist, now) || applyBoss(config.boss) : false;
      const modes = (config ? applyFeatured(config.featuredMode, now) : false) || twisted;
      emit({ ...(config ? { config } : {}), ...(me ? { me } : {}) });
      if (modes) onModesChanged();
    } catch {
      /* offline: the fallback stays */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function act(kind: 'goal' | 'nap' | 'vote', op: ApiOp, args?: ApiArgs): Promise<boolean> {
  if (!api || state.busy) return false;
  emit({ busy: kind, toast: null });
  try {
    const r = await api(op, args);
    const me = r.ok ? parseMe(r.body) : null;
    if (!me) {
      emit({ busy: null, toast: r.status === 403 ? 'Play a match first, then come back.' : 'Could not reach the server. Try again soon.' });
      return false;
    }
    const added = grant(me.items);
    const body = r.body as { granted?: unknown; tallies?: unknown };
    const granted = Array.isArray(body?.granted) ? body.granted.filter((i): i is string => typeof i === 'string') : [];
    const names = granted.map((i) => FREE_COATS[i]?.name).filter(Boolean);
    let config = state.config;
    if (kind === 'vote' && config.vote && isRec(body?.tallies)) config = { ...config, vote: { ...config.vote, tallies: { a: nat(body.tallies.a) ?? 0, b: nat(body.tallies.b) ?? 0 } } };
    const toast = kind === 'vote' ? 'Thanks for voting!' : names.length || added.length ? `${names.length ? names.join(', ') : 'New coat'} unlocked!` : null;
    emit({ busy: null, me, config, toast });
    return true;
  } catch {
    emit({ busy: null, toast: 'Could not reach the server. Try again soon.' });
    return false;
  }
}

export const claimGoal = (): Promise<boolean> => act('goal', 'liveops.claim');
export const claimNap = (): Promise<boolean> => act('nap', 'liveops.nap');
export const castVote = (option: 'a' | 'b'): Promise<boolean> => act('vote', 'liveops.vote', { option });

/** Tests only. */
export function resetLiveops(now = Date.now()): void {
  api = null;
  hasAccount = () => false;
  state = { config: fallbackConfig(now), me: null, busy: null, toast: null };
  fetchedAt = 0;
  inflight = null;
  retries = 0;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (featuredTimer) clearTimeout(featuredTimer);
  featuredTimer = null;
  featuredKey = '';
  twistKey = '';
  onModesChanged = () => undefined;
  subs.clear();
}
