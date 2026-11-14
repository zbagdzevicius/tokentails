/**
 * Account progress sync (gap plan P2 `rewards-cloud`): the Treat Track, today's quests, the local match counters, the
 * free unlocks and the settings follow the account between the web and the apps. The browser copies stay the offline
 * cache; `POST /pawlegends/progress {blob}` (the host's `progress.sync` op) max-merges this device's blob into the
 * account's and answers the merge, which is folded back here, so progress only ever goes up on either side
 * (backend/src/pawlegends/progress/progress-merge.ts is the server half of the same rules).
 *
 * The same answer carries what only the `/live` save writes: the grants (the Lucky Treat, the under-16 Daily Treat and
 * the Welcome Path gifts; each applied once, tracked in `applied`), champion mastery, the Welcome Path days and the
 * published Lucky Treat odds. This is never a score path: nothing here posts a match.
 *
 * Settings: the profile's own choices plus a short list of device settings keys, newest change wins as a whole. A
 * device that never synced and never played sends `at` 0, so it takes the account's settings instead of overwriting
 * them with its defaults.
 */
import type { HeroId } from '../sim/api';
import { HERO_IDS } from '../data/heroes';
import { parseGrants, parseLuckyTable, LUCKY_DEFAULT, type Grant, type LuckyTable } from './lucky';
import { parseMastery, saveMastery } from './mastery';
import { loadProfile, saveProfile, UNLOCKS_MAX, BISCUIT_UNLOCK, parseProfile, type Profile } from './profile';
import { dayKey, loadQuests, parseQuests, saveQuests, type QuestState } from './quests';
import { addTreatXp, loadTreats, saveTreats, TREAT_STEP, type TreatReward, type TreatState } from './treats';
import { parseWelcome, type WelcomeState } from './welcome';
import { TCAST_KEYS } from '../input/presets';
import { hudStoreTouched, loadHudStore, parseStore, saveHudStore, type HudStore } from '../input/touch/hudLayout';

export interface CloudBlob {
  v: 1;
  treats: { xp: number; chests: number; winDay: string | null };
  quests: { day: string | null; progress: Record<string, number>; done: string[] };
  counts: { matches: number; wins: number; firstWin: number; heroMatches: Record<string, number> };
  unlocks: string[];
  applied: string[];
  prefs: { at: number; data: { profile?: Record<string, unknown>; keys?: Record<string, string>; hud?: HudStore } };
}

/** Device settings that follow the account (Settings rows). Applied values take effect from the next page load. */
export const SYNCED_KEYS: readonly string[] = Object.freeze([
  'pawlegends.castMode',
  'pawlegends.cursorSize',
  'pawlegends.targetFirst',
  'pawlegends.lastHitButton',
  'pawlegends.towerButton',
  'pawlegends.leftHanded',
  'pawlegends.touchSize',
  'pawlegends.shake',
  'pawlegends.camHeight.v1',
  'pawlegends.minimap.cvd',
  'pawlegends.minimap.size',
  'pl.party.hideNames',
  // gaps round 3 (hud-controls): the per-ability touch cast mode and aim sensitivity
  ...TCAST_KEYS,
]);

/** Profile choices that follow the account (never counters: those merge by max in `counts`). */
const PROFILE_PREFS = ['hero', 'trick', 'tipsOff', 'numbers', 'veteran', 'skinFx', 'wornTitle', 'wornFrame', 'looks', 'side', 'lastBySide'] as const;

const KEY = 'tt.pawlegends.cloud.v1';
/** The local sync state: grants applied here, the settings hash and change time, and the last server extras. */
export interface CloudLocal {
  applied: string[];
  prefsHash: string;
  prefsAt: number;
  /** Lucky grants shown (opened) on this device. */
  opened: string[];
  lucky: LuckyTable | null;
  welcome: WelcomeState | null;
  /** UTC day the server last answered (the Welcome Path's "today"). */
  today: string | null;
}

const fresh = (): CloudLocal => ({ applied: [], prefsHash: '', prefsAt: 0, opened: [], lucky: null, welcome: null, today: null });

export function loadCloud(): CloudLocal {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CloudLocal> | null;
    if (!o || typeof o !== 'object') return fresh();
    const ids = (v: unknown, cap: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 64).slice(-cap) : []);
    return {
      applied: ids(o.applied, 200),
      prefsHash: typeof o.prefsHash === 'string' ? o.prefsHash : '',
      prefsAt: typeof o.prefsAt === 'number' && Number.isFinite(o.prefsAt) ? o.prefsAt : 0,
      opened: ids(o.opened, 60),
      lucky: o.lucky ? parseLuckyTable(o.lucky) : null,
      welcome: parseWelcome(o.welcome),
      today: typeof o.today === 'string' ? o.today.slice(0, 10) : null,
    };
  } catch {
    return fresh();
  }
}

export function saveCloud(c: CloudLocal): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* blocked: this page only */
  }
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function readKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SYNCED_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null && v.length <= 32) out[k] = v;
    } catch {
      /* blocked */
    }
  }
  return out;
}

function prefsData(p: Profile): CloudBlob['prefs']['data'] {
  const profile: Record<string, unknown> = {};
  for (const k of PROFILE_PREFS) profile[k] = p[k];
  // gaps round 3 (hud-controls): the HUD layouts, one per device class (a phone keeps the phone layout); sent only once
  // this device saved or reset one, so the settings of a player who never opened the editor hash as before
  return { profile, keys: readKeys(), ...(hudStoreTouched() ? { hud: loadHudStore() } : {}) };
}

/** This device's blob (and the local sync state with the settings change time brought up to date). */
export function buildBlob(now = Date.now(), c: CloudLocal = loadCloud()): { blob: CloudBlob; local: CloudLocal } {
  const p = loadProfile();
  const t = loadTreats();
  const q = loadQuests();
  const data = prefsData(p);
  const h = hash(JSON.stringify(data));
  const local = { ...c };
  if (h !== c.prefsHash) {
    // never synced: a device that has played sends its settings as old (1), a fresh one as unset (0)
    local.prefsAt = c.prefsHash === '' ? (p.matches > 0 ? Math.max(1, c.prefsAt) : 0) : now;
    local.prefsHash = h;
  }
  const blob: CloudBlob = {
    v: 1,
    treats: { xp: t.xp, chests: t.chests, winDay: t.winDay },
    quests: { day: q.day, progress: q.progress, done: q.done },
    counts: { matches: p.matches, wins: p.wins, firstWin: p.firstWinDone ? 1 : 0, heroMatches: { ...p.heroMatches } },
    unlocks: [...p.unlocks],
    applied: [...local.applied],
    prefs: { at: local.prefsAt, data },
  };
  return { blob, local };
}

const n = (v: unknown, max = 1e7): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
const later = (a: string | null, b: unknown): string | null => (typeof b === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b) && (!a || b > a) ? b : a);

/** Fold the server's merged Treat Track into the local one (max per field; the target stays local). Pure. */
export function mergeTreats(local: TreatState, server: Record<string, unknown> | undefined): TreatState {
  if (!server) return local;
  const xp = Math.max(local.xp, n(server.xp));
  const chests = Math.min(Math.max(local.chests, n(server.chests)), Math.floor(xp / TREAT_STEP));
  const winDay = later(local.winDay, server.winDay);
  return xp === local.xp && chests === local.chests && winDay === local.winDay ? local : { ...local, xp, chests, winDay };
}

/** Fold the server's quests into today's local ones (same day: max and union; another day: ignored). Pure. */
export function mergeQuests(local: QuestState, server: Record<string, unknown> | undefined): QuestState {
  if (!server || server.day !== local.day) return local;
  const s = parseQuests(JSON.stringify({ v: 1, ...server }), local.day);
  const progress = { ...local.progress };
  for (const [k, v] of Object.entries(s.progress)) progress[k] = Math.max(progress[k] ?? 0, v);
  const done = [...new Set([...local.done, ...s.done])];
  const same = done.length === local.done.length && Object.entries(progress).every(([k, v]) => local.progress[k] === v);
  return same ? local : { v: 1, day: local.day, progress, done };
}

const ITEM = /^[A-Za-z0-9._:-]{1,80}$/;

/**
 * Fold the server's counters, unlocks and (when newer) settings into the profile. Never lowers a counter, never drops
 * an unlock. Pure: returns a new profile and whether the settings were taken.
 */
export function mergeProfile(local: Profile, blob: Record<string, unknown>, localPrefsAt: number): { profile: Profile; prefsTaken: boolean } {
  const p: Profile = { ...local, unlocks: [...local.unlocks], heroMatches: { ...local.heroMatches } };
  const c = (blob.counts ?? {}) as Record<string, unknown>;
  p.matches = Math.max(p.matches, n(c.matches));
  p.wins = Math.max(p.wins, Math.min(n(c.wins), p.matches));
  if (c.firstWin === 1 && !p.firstWinDone) p.firstWinDone = true;
  if (p.firstWinDone && !p.unlocks.includes(BISCUIT_UNLOCK)) p.unlocks.push(BISCUIT_UNLOCK);
  if (p.matches > 0 && p.firstPlaySession === 0) p.firstPlaySession = Math.max(1, p.sessions);
  const hm = c.heroMatches && typeof c.heroMatches === 'object' ? (c.heroMatches as Record<string, unknown>) : {};
  for (const h of HERO_IDS) {
    const v = n(hm[h], 99999);
    if (v > (p.heroMatches[h] ?? 0)) p.heroMatches[h] = v;
  }
  if (Array.isArray(blob.unlocks))
    for (const u of blob.unlocks) if (typeof u === 'string' && ITEM.test(u) && !p.unlocks.includes(u) && p.unlocks.length < UNLOCKS_MAX) p.unlocks.push(u);
  const prefs = (blob.prefs ?? {}) as { at?: unknown; data?: { profile?: Record<string, unknown> } };
  const at = n(prefs.at, Number.MAX_SAFE_INTEGER);
  let prefsTaken = false;
  if (at > localPrefsAt && prefs.data?.profile && typeof prefs.data.profile === 'object') {
    // the server's settings, read through the profile parser so a bad value falls back to its default
    const merged = parseProfile(JSON.stringify({ ...p, ...prefs.data.profile, unlocks: p.unlocks }));
    for (const k of PROFILE_PREFS) (p as unknown as Record<string, unknown>)[k] = merged[k];
    prefsTaken = true;
  }
  return { profile: p, prefsTaken };
}

/** The server's device settings keys, written to storage (known keys and short strings only). */
function writeKeys(keys: unknown): void {
  if (!keys || typeof keys !== 'object') return;
  for (const k of SYNCED_KEYS) {
    const v = (keys as Record<string, unknown>)[k];
    try {
      if (typeof v === 'string' && v.length <= 32) localStorage.setItem(k, v);
    } catch {
      /* blocked */
    }
  }
}

export interface ApplyOutcome {
  /** Grants applied now (newest last): the UI shows the Lucky Treat chest and the Welcome gift toasts. */
  fresh: Grant[];
  /** Treat Track chests the grants' XP opened. */
  chests: TreatReward[];
  /** Something the player can see changed (redraw Home). */
  changed: boolean;
}

/**
 * Apply grants not applied yet (on this device or, per the server's `applied`, on another): an item joins the free
 * unlocks, Treat XP fills the Treat Track (it may open chests). Returns the fresh ones. Mutates storage.
 */
export function applyGrants(grants: readonly Grant[], serverApplied: readonly string[], local: CloudLocal): ApplyOutcome {
  const done = new Set([...local.applied, ...serverApplied]);
  const fresh: Grant[] = [];
  const chests: TreatReward[] = [];
  for (const g of grants) {
    if (done.has(g.id)) continue;
    const p = loadProfile();
    if (g.item && !p.unlocks.includes(g.item) && p.unlocks.length < UNLOCKS_MAX) {
      p.unlocks.push(g.item);
      saveProfile(p);
    }
    if (g.xp) {
      const gain = addTreatXp(loadTreats(), g.xp, new Set(loadProfile().unlocks));
      saveTreats(gain.state);
      if (gain.rewards.length) {
        const pp = loadProfile();
        for (const r of gain.rewards) if (!pp.unlocks.includes(r.id)) pp.unlocks.push(r.id);
        saveProfile(pp);
        chests.push(...gain.rewards);
      }
    }
    done.add(g.id);
    local.applied = [...local.applied, g.id].slice(-200);
    fresh.push(g);
  }
  return { fresh, chests, changed: fresh.length > 0 };
}

/** The server's answer, checked. Null when it is not a progress view. */
export interface CloudView {
  blob: Record<string, unknown>;
  grants: Grant[];
  lucky: LuckyTable;
  welcome: WelcomeState | null;
  mastery: ReturnType<typeof parseMastery>;
  today: string | null;
}

export function parseView(body: unknown): CloudView | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (!o.blob || typeof o.blob !== 'object') return null;
  return {
    blob: o.blob as Record<string, unknown>,
    grants: parseGrants(o.grants),
    lucky: o.lucky ? parseLuckyTable(o.lucky) : LUCKY_DEFAULT,
    welcome: parseWelcome(o.welcome),
    mastery: parseMastery(o.mastery),
    today: typeof o.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.today) ? o.today : null,
  };
}

/**
 * Fold one server answer into this device: treats, quests and profile (max-merge), settings when the server's are
 * newer, then the grants. Saves the local sync state. Mutates storage; returns what the UI should show.
 */
export function applyView(v: CloudView, local: CloudLocal, now = Date.now()): ApplyOutcome {
  const b = v.blob;
  const t0 = loadTreats();
  const t1 = mergeTreats(t0, b.treats as Record<string, unknown> | undefined);
  if (t1 !== t0) saveTreats(t1);
  const q0 = loadQuests(dayKey(new Date(now)));
  const q1 = mergeQuests(q0, b.quests as Record<string, unknown> | undefined);
  if (q1 !== q0) saveQuests(q1);
  const p0 = loadProfile();
  const { profile, prefsTaken } = mergeProfile(p0, b, local.prefsAt);
  saveProfile(profile);
  if (prefsTaken) {
    const prefs = b.prefs as { at?: number; data?: { keys?: unknown; hud?: unknown } };
    writeKeys(prefs.data?.keys);
    // an answer from a build before the HUD editor has no `hud`: the layouts here stay (an empty map is a reset)
    if (prefs.data && 'hud' in prefs.data) saveHudStore(parseStore(prefs.data.hud));
    local.prefsAt = n(prefs.at, Number.MAX_SAFE_INTEGER);
    local.prefsHash = hash(JSON.stringify(prefsData(loadProfile())));
  }
  const applied = Array.isArray(b.applied) ? b.applied.filter((x): x is string => typeof x === 'string') : [];
  const out = applyGrants(v.grants, applied, local);
  local.applied = [...new Set([...local.applied, ...applied])].slice(-200);
  local.lucky = v.lucky;
  local.welcome = v.welcome;
  local.today = v.today;
  saveMastery(v.mastery);
  saveCloud(local);
  const changed =
    out.changed || prefsTaken || t1.xp !== t0.xp || t1.chests !== t0.chests || q1 !== q0 || profile.unlocks.length !== p0.unlocks.length || profile.matches !== p0.matches;
  return { ...out, changed };
}

/** Lucky grants applied on this device but not opened yet (the chest still to show). */
export function unopened(fresh: readonly Grant[], local: CloudLocal = loadCloud()): Grant[] {
  return fresh.filter((g) => (g.kind === 'lucky' || g.kind === 'treat') && !local.opened.includes(g.id));
}

export function markOpened(id: string): void {
  const c = loadCloud();
  if (!c.opened.includes(id)) c.opened = [...c.opened, id].slice(-60);
  saveCloud(c);
}

/** The heroes a blob's mastery may name (tests). */
export const KNOWN_HEROES: readonly HeroId[] = HERO_IDS;
