/**
 * Rap Sheet (GDD 8, 13.6 key `rapsheet`): one mugshot stamp per crime. The catalog is every prop kind worth
 * points or worth smuggling (`kind-<n>`) plus the special crimes below (Roomba frame, tablecloth, cable,
 * Zoom crash, puddle slide, stack avalanche, tree topple, accomplice, box sit and friends): 48+ entries.
 * Counts per crime id, the dayNo and local date of the first stamp, and per-week tallies for the weekly
 * card (Sunday 18:00, GDD 3.5). Club gets gold stamps at 5+ of a crime. Never throws.
 */
import { PROP_KINDS, propKind, type CrimeView, type PropKindDef, type RapSheetSummary, type SimEvent, type Store, type WeeklySummary } from '../types';
import { isoWeekId, weekdayRoom, weeklyReadyAt, ymd, dateOfDay } from './dates';
import { readStreak } from './streak';

export const KEY_RAPSHEET = 'rapsheet';
export const GOLD_AT = 5;
/** Weeks of tallies kept for weekly cards. */
export const WEEKS_KEPT = 10;

export interface CrimeDef {
  id: string;
  name: string;
  icon: string;
  special: boolean;
  /** The line on the mugshot page. */
  blurb: string;
  kind?: number;
}

/** Special crimes (decided from events alone). Order = Rap Sheet page order. */
export const SPECIAL_CRIMES: readonly CrimeDef[] = Object.freeze([
  { id: 'framed-roomba', name: 'Framed the Roomba', icon: '🤖', special: true, blurb: 'It was the robot. Obviously.' },
  { id: 'tablecloth-pull', name: 'The Tablecloth Trick', icon: '🎩', special: true, blurb: 'Everything came along for the ride.' },
  { id: 'cable-pull', name: 'Cable Yanker', icon: '🔌', special: true, blurb: 'Pulled the plug on the lamp. Literally.' },
  { id: 'zoom-crash', name: 'Live on Zoom', icon: '📹', special: true, blurb: 'Crashed it on camera. The whole team saw.' },
  { id: 'puddle-slide', name: "Slip 'n' Slide", icon: '🛝', special: true, blurb: 'Wheee. Then crash.' },
  { id: 'stack-avalanche', name: 'Stack Avalanche', icon: '🏔️', special: true, blurb: 'One swat, whole tower.' },
  { id: 'tree-topple', name: 'Timber!', icon: '🎄', special: true, blurb: 'The tree had it coming.' },
  { id: 'accomplice', name: 'Accomplice', icon: '🤝', special: true, blurb: "Granted a Pink Paw cat's wish." },
  { id: 'box-sit', name: 'If I Fits, I Sits', icon: '📦', special: true, blurb: 'Hid in plain sight.' },
  { id: 'sock-smuggler', name: 'Sock Smuggler', icon: '🧦', special: true, blurb: 'Contraband secured under the sofa.' },
  { id: 'last-call', name: 'Last Call', icon: '⏰', special: true, blurb: 'Saved the best crash for the last 5 seconds.' },
  { id: 'chain-reaction', name: 'Chain Reaction', icon: '⛓️', special: true, blurb: 'Five crashes in one combo.' },
  { id: 'nine-lives', name: 'Nine Crashes', icon: '💥', special: true, blurb: 'Nine things broken in one run. One for each life.' },
  { id: 'ghost', name: 'Ghost', icon: '👻', special: true, blurb: 'Wrecked the place. Never seen.' },
  { id: 'cuddled', name: 'Cuddled', icon: '🤗', special: true, blurb: 'Caught. Scooped up. Worth it.' },
  { id: 'woke-napper', name: 'Rude Awakening', icon: '😴', special: true, blurb: 'Woke the napper. Zero regrets.' },
] as CrimeDef[]);

/** Emoji per prop slug (falls back to the material icon). */
const PROP_ICONS: Readonly<Record<string, string>> = {
  'wine-glass': '🍷', mug: '☕', 'plate-stack': '🍽️', 'fruit-bowl': '🍎', 'egg-carton': '🥚', cake: '🎂', vase: '💐',
  'potted-plant': '🪴', lamp: '💡', 'tv-remote': '📺', laptop: '💻', 'toilet-roll': '🧻', perfume: '🌸', 'book-stack': '📚',
  ornament: '🔴', 'christmas-tree': '🎄', slipper: '🥿', sock: '🧦', 'tuna-can': '🐟', 'popcorn-bowl': '🍿', 'yarn-ball': '🧶',
  'rubber-duck': '🦆', 'toothbrush-cup': '🪥', 'pen-cup': '🖊️', 'cups-tower': '🥤', balloon: '🎈', ribbon: '🎀', 'gift-stack': '🎁',
  'punch-bowl': '🥣', 'birthday-candles': '🕯️', 'laundry-basket': '🧺', 'alarm-clock': '⏰', 'jewellery-dish': '💍',
  'cookie-tray': '🍪', 'flour-bag': '🌾', 'mixer-bowl': '🥣', butter: '🧈', 'board-game': '🎲', 'snack-tower': '🍫',
  controller: '🎮', dice: '🎲', 'scented-candle': '🕯️', 'face-mask-jar': '🫙', 'towel-stack': '🛁', 'gravy-boat': '🫗', pie: '🥧',
  'turkey-platter': '🦃', 'turkey-leg': '🍗', 'box-tower': '📦', 'bubble-wrap': '🫧', 'receipt-pile': '🧾', 'champagne-tower': '🥂',
  bouquet: '💐', phone: '📱', 'water-glass': '🥛', blanket: '🛏️', 'snow-globe': '🔮', 'gift-wrap': '🎁', 'champagne-bottle': '🍾',
  'sponsor-product': '⭐', 'perfume-tray': '🧴',
};
const MATERIAL_ICONS: Readonly<Record<string, string>> = { glass: '🍷', ceramic: '🏺', paper: '📄', food: '🍰', plastic: '🧸', tech: '🔌', fabric: '🧵', metal: '🥫', actor: '🤖' };

/** A prop kind is a Rap Sheet crime when it scores (base > 0) or can be smuggled (grabbable). */
export const isCrimeKind = (k: PropKindDef): boolean => k.base > 0 || k.grabbable;
export const crimeIdForKind = (kind: number): string => `kind-${kind}`;

function propCrime(k: PropKindDef): CrimeDef {
  return {
    id: crimeIdForKind(k.kind),
    name: k.name,
    icon: PROP_ICONS[k.id] ?? MATERIAL_ICONS[k.material] ?? '🐾',
    special: false,
    blurb: k.grabbable ? `Smuggled a ${k.name.toLowerCase()}.` : `${k.name}: ${k.onLand === 'spill' ? 'spilled' : k.onLand === 'break' ? 'smashed' : 'knocked down'}.`,
    kind: k.kind,
  };
}

let catalogCache: CrimeDef[] | null = null;
/** Every crime: prop kinds (Appendix B order) then specials. 48+ entries. */
export function crimeCatalog(): CrimeDef[] {
  if (!catalogCache) catalogCache = [...PROP_KINDS.filter(isCrimeKind).map(propCrime), ...SPECIAL_CRIMES];
  return catalogCache.slice();
}
export function crimeDef(id: string): CrimeDef | undefined {
  return crimeCatalog().find((c) => c.id === id);
}

/** Old (M0/M1a) ids → current ids. */
const LEGACY: Readonly<Record<string, string>> = {
  framed: 'framed-roomba',
  wish: 'accomplice',
  stash: 'sock-smuggler',
  'combo-5': 'chain-reaction',
  unseen: 'ghost',
  caught: 'cuddled',
};
function migrateId(id: string): string {
  if (id.startsWith('prop:')) {
    const k = PROP_KINDS.find((p) => p.id === id.slice(5));
    return k ? crimeIdForKind(k.kind) : id;
  }
  return LEGACY[id] ?? id;
}

interface WeekTally {
  counts: Record<string, number>;
  rooms: Record<string, number>;
}
export interface RapSheet {
  counts: Record<string, number>;
  /** crime id -> dayNo of the first stamp (0 when unknown). */
  first: Record<string, number>;
  /** crime id -> local date 'YYYY-MM-DD' of the first stamp. */
  firstAt: Record<string, string>;
  /** ISO week id -> tallies (newest WEEKS_KEPT weeks). */
  weeks: Record<string, WeekTally>;
}

const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const ID_RE = /^[a-z0-9:-]{1,40}$/;

function readCounts(raw: unknown, migrate: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!posInt(v)) continue;
    const id = migrate ? migrateId(k) : k;
    if (!ID_RE.test(id)) continue;
    out[id] = Math.min(1e9, (out[id] ?? 0) + v);
  }
  return out;
}

export function readRapSheet(store: Store): RapSheet {
  const out: RapSheet = { counts: {}, first: {}, firstAt: {}, weeks: {} };
  try {
    const raw = store.get<Record<string, unknown> | null>(KEY_RAPSHEET, null);
    if (!raw || typeof raw !== 'object') return out;
    out.counts = readCounts(raw.counts, true);
    const first = raw.first && typeof raw.first === 'object' ? (raw.first as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(first)) {
      const id = migrateId(k);
      if (typeof v === 'number' && Number.isInteger(v) && out.counts[id] && !(id in out.first)) out.first[id] = v;
    }
    const firstAt = raw.firstAt && typeof raw.firstAt === 'object' ? (raw.firstAt as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(firstAt)) if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && out.counts[k]) out.firstAt[k] = v;
    const weeks = raw.weeks && typeof raw.weeks === 'object' ? (raw.weeks as Record<string, unknown>) : {};
    for (const [w, t] of Object.entries(weeks)) {
      if (!/^\d{4}-W\d{2}$/.test(w) || !t || typeof t !== 'object') continue;
      const tt = t as Record<string, unknown>;
      const rooms: Record<string, number> = {};
      if (tt.rooms && typeof tt.rooms === 'object') {
        for (const [r, n] of Object.entries(tt.rooms as Record<string, unknown>)) if (posInt(n) && r.length <= 40) rooms[r] = n;
      }
      out.weeks[w] = { counts: readCounts(tt.counts, false), rooms };
    }
  } catch {
    /* defaults */
  }
  return out;
}

/** Crimes committed in one run's events (with multiplicity). Pure. Works for v4 and v5 event streams. */
export function crimesIn(events: readonly SimEvent[], propKinds?: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, n = 1) => (out[id] = (out[id] ?? 0) + n);
  const kindOf = (prop: number): PropKindDef | undefined => {
    const k = propKinds && prop >= 0 ? propKinds[prop] : undefined;
    return k !== undefined ? propKind(k) : undefined;
  };
  let wrecks = 0;
  let maxCombo = 0;
  let seen = false;
  let caught = false;
  let ended = false;
  let lastCall = false;
  let lastCallWreck = false;
  for (const e of events) {
    switch (e.t) {
      case 'break':
      case 'land':
      case 'spill':
      case 'hit': {
        wrecks++;
        if (e.combo > maxCombo) maxCombo = e.combo;
        if (lastCall) lastCallWreck = true;
        if (e.cam) add('zoom-crash');
        const def = kindOf(e.prop);
        if (def && def.base > 0) add(crimeIdForKind(def.kind));
        break;
      }
      case 'stash': {
        add('sock-smuggler');
        const def = kindOf(e.prop);
        if (def && def.grabbable) add(crimeIdForKind(def.kind));
        break;
      }
      case 'framed':
        add('framed-roomba');
        break;
      case 'wish':
        add('accomplice');
        break;
      case 'pull':
        add(e.kind === 'cloth' ? 'tablecloth-pull' : 'cable-pull');
        break;
      case 'slide':
        add('puddle-slide');
        break;
      case 'stack':
        add('stack-avalanche');
        break;
      case 'topple':
        add('tree-topple');
        break;
      case 'enter':
        add('box-sit');
        break;
      case 'wake':
        add('woke-napper');
        break;
      case 'lastcall':
        lastCall = true;
        break;
      case 'seen':
        seen = true;
        break;
      case 'caught':
        caught = true;
        break;
      case 'end':
        ended = true;
        break;
      default:
        break;
    }
  }
  if (lastCallWreck) add('last-call');
  if (maxCombo >= 5) add('chain-reaction');
  if (wrecks >= 9) add('nine-lives');
  if (caught) add('cuddled');
  else if (ended && !seen && wrecks > 0) add('ghost');
  return out;
}

export interface RecordCrimeOptions {
  /** When the run was played (default: now). Decides the week of the weekly card and `firstAt`. */
  now?: Date;
  /** Room label for "Most wanted in" (default: the GDD 3.5 weekday room of dayNo, else of `now`). */
  room?: string;
}

/**
 * Count a run's crimes; returns the crime ids stamped for the first time. `propKinds[i]` is the kind of
 * prop index i (e.g. `state.props.map(p => p.kind)`); without it only special crimes are counted.
 */
export function recordCrimes(store: Store, events: readonly SimEvent[], propKinds?: readonly number[], dayNo?: number, opts: RecordCrimeOptions = {}): string[] {
  try {
    const now = opts.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
    const validDay = typeof dayNo === 'number' && Number.isInteger(dayNo);
    const sheet = readRapSheet(store);
    const fresh: string[] = [];
    const run = crimesIn(events, propKinds);
    const weekId = isoWeekId(now);
    const week = sheet.weeks[weekId] ?? { counts: {}, rooms: {} };
    const room = (opts.room ?? weekdayRoom(validDay ? dateOfDay(dayNo!) : now)).slice(0, 40);
    let total = 0;
    for (const [id, n] of Object.entries(run)) {
      if (!sheet.counts[id]) {
        fresh.push(id);
        sheet.first[id] = validDay && dayNo! > 0 ? dayNo! : 0;
        sheet.firstAt[id] = ymd(now);
      }
      sheet.counts[id] = (sheet.counts[id] ?? 0) + n;
      week.counts[id] = (week.counts[id] ?? 0) + n;
      total += n;
    }
    if (total > 0) {
      week.rooms[room] = (week.rooms[room] ?? 0) + total;
      sheet.weeks[weekId] = week;
      const keep = Object.keys(sheet.weeks).sort().slice(-WEEKS_KEPT);
      sheet.weeks = Object.fromEntries(keep.map((k) => [k, sheet.weeks[k]]));
    }
    store.set(KEY_RAPSHEET, sheet);
    return fresh;
  } catch {
    return [];
  }
}

/** Every catalog entry with its count (unstamped ones count 0). Gold = Club and 5+. */
export function crimes(store: Store, opts: { club?: boolean } = {}): CrimeView[] {
  try {
    const sheet = readRapSheet(store);
    return crimeCatalog().map((c) => {
      const count = sheet.counts[c.id] ?? 0;
      const v: CrimeView = { id: c.id, name: c.name, icon: c.icon, count, gold: !!opts.club && count >= GOLD_AT, special: c.special };
      if (sheet.firstAt[c.id]) v.firstAt = sheet.firstAt[c.id];
      return v;
    });
  } catch {
    return [];
  }
}

/** Rap Sheet titles by stamped entries (smile, never shame). */
export const RAP_RANKS: readonly { min: number; title: string }[] = [
  { min: 0, title: 'Innocent (Allegedly)' },
  { min: 1, title: 'Person of Interest' },
  { min: 5, title: 'Petty Paws' },
  { min: 10, title: 'Counter Criminal' },
  { min: 18, title: 'Repeat Offender' },
  { min: 28, title: 'Known to Local Humans' },
  { min: 40, title: 'Most Wanted' },
  { min: 55, title: 'Criminal Mastermind' },
  { min: 70, title: 'Legend of the Litter Box' },
];
export function rapRank(distinct: number): string {
  let t = RAP_RANKS[0].title;
  for (const r of RAP_RANKS) if (distinct >= r.min) t = r.title;
  return t;
}

const top = (counts: Record<string, number>, n = 3): { name: string; icon: string; count: number }[] =>
  Object.entries(counts)
    .map(([id, count]) => ({ def: crimeDef(id), count }))
    .filter((x): x is { def: CrimeDef; count: number } => !!x.def && x.count > 0)
    .sort((a, b) => b.count - a.count || a.def.name.localeCompare(b.def.name))
    .slice(0, n)
    .map((x) => ({ name: x.def.name, icon: x.def.icon, count: x.count }));

export function rapSheet(store: Store, _opts: { club?: boolean } = {}): RapSheetSummary {
  try {
    const sheet = readRapSheet(store);
    const known = Object.entries(sheet.counts).filter(([id]) => !!crimeDef(id));
    const distinct = known.length;
    return {
      total: known.reduce((a, [, n]) => a + n, 0),
      distinct,
      catalog: crimeCatalog().length,
      framed: sheet.counts['framed-roomba'] ?? 0,
      topCrimes: top(sheet.counts),
      rank: rapRank(distinct),
      streak: readStreak(store).current,
    };
  } catch {
    return { total: 0, distinct: 0, catalog: crimeCatalog().length, framed: 0, topCrimes: [], rank: rapRank(0), streak: 0 };
  }
}

/**
 * The weekly Rap Sheet card for the week of `now` (Monday..Sunday local). `ready` once Sunday 18:00 local
 * has passed. Null when nothing was committed that week (no empty card). `seen` and `mostWanted` (Club cats
 * credited by name) come from the caller (cameo counter, server list).
 */
export function weekly(store: Store, now: Date, opts: { club?: boolean; seen?: number; mostWanted?: string[] } = {}): WeeklySummary | null {
  try {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
    const weekId = isoWeekId(now);
    const w = readRapSheet(store).weeks[weekId];
    if (!w) return null;
    const crimesN = Object.entries(w.counts).reduce((a, [id, n]) => a + (crimeDef(id) ? n : 0), 0);
    if (crimesN === 0) return null;
    const rooms = Object.entries(w.rooms).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const out: WeeklySummary = {
      weekId,
      crimes: crimesN,
      topCrimes: top(w.counts),
      framed: w.counts['framed-roomba'] ?? 0,
      ready: now.getTime() >= weeklyReadyAt(now).getTime(),
    };
    if (rooms.length) out.mostWantedIn = rooms[0][0];
    if (opts.club && typeof opts.seen === 'number' && Number.isFinite(opts.seen) && opts.seen >= 0) out.seen = Math.floor(opts.seen);
    if (Array.isArray(opts.mostWanted)) out.mostWanted = opts.mostWanted.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.slice(0, 12)).slice(0, 50);
    return out;
  } catch {
    return null;
  }
}

/** The headline for the card: "Mochi's week: 41 crimes, 9 vases, framed the Roomba 3 times." */
export function weeklyLine(catName: string, w: WeeklySummary): string {
  const parts = [`${catName}'s week: ${w.crimes} crime${w.crimes === 1 ? '' : 's'}`];
  if (w.topCrimes[0]) parts.push(`${w.topCrimes[0].count}× ${w.topCrimes[0].name.toLowerCase()}`);
  if (w.framed > 0) parts.push(`framed the Roomba ${w.framed === 1 ? 'once' : `${w.framed} times`}`);
  return `${parts.join(', ')}.${w.mostWantedIn ? ` Most wanted in ${w.mostWantedIn}.` : ''}`;
}
