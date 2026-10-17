/**
 * Daily rotation (GDD 3.4): dayNo = daysBetween(DAY1, local date) + 1, Wordle-style, no server.
 *
 * - Preview days (dayNo <= 0, before launch) cycle the 7 frozen Kitchen variants, labelled by date
 *   ("Kitchen · Nov 2"); pre-launch v4 ghosts depend on them, so they never change.
 * - Days 1..21 are the authored rooms baked as JSON (rooms/daily-001..021.json, Appendix A + week 3).
 * - Later days come from the deterministic generator (schedule.ts) and are cached per session.
 * - The founder's hand-edited fields in public/daily/index.json are applied on top: a Community Sunday room
 *   (from day 21; an invalid code falls back to the generated room) and a sponsor product. Par paws come from
 *   par.json (written by tools/par.mjs).
 */
import { ROOM_EVENT_NAMES, RUN_TICKS, BOSS_TICKS, type DailyEntry, type PropPlacement, type RoomDef } from '../types';
import { dailyRoomId, decodeRoom } from '../codec';
import glassJson from './rooms/glass.json';
import v1 from './rooms/kitchen-v1.json';
import v2 from './rooms/kitchen-v2.json';
import v3 from './rooms/kitchen-v3.json';
import v4 from './rooms/kitchen-v4.json';
import v5 from './rooms/kitchen-v5.json';
import v6 from './rooms/kitchen-v6.json';
import v7 from './rooms/kitchen-v7.json';
import d001 from './rooms/daily-001.json';
import d002 from './rooms/daily-002.json';
import d003 from './rooms/daily-003.json';
import d004 from './rooms/daily-004.json';
import d005 from './rooms/daily-005.json';
import d006 from './rooms/daily-006.json';
import d007 from './rooms/daily-007.json';
import d008 from './rooms/daily-008.json';
import d009 from './rooms/daily-009.json';
import d010 from './rooms/daily-010.json';
import d011 from './rooms/daily-011.json';
import d012 from './rooms/daily-012.json';
import d013 from './rooms/daily-013.json';
import d014 from './rooms/daily-014.json';
import d015 from './rooms/daily-015.json';
import d016 from './rooms/daily-016.json';
import d017 from './rooms/daily-017.json';
import d018 from './rooms/daily-018.json';
import d019 from './rooms/daily-019.json';
import d020 from './rooms/daily-020.json';
import d021 from './rooms/daily-021.json';
import scheduleJson from '../../public/daily/index.json';
import parJson from './par.json';
import { KITS } from './kits';
import { KIND, propKind } from './props-catalog';
import { resolve } from './resolve';
import { ROUTINES } from './routines';
import { SHELLS } from './shells';
import {
  AUTHORED_DAYS,
  DAY1,
  DAY1_UTC,
  FIRST_COMMUNITY_DAY,
  dateOfDay,
  generateRoom,
  isPreviewDay,
  labelForPlan,
  mixSeed,
  planForDay,
  seasonOf,
  shellLabel,
  shortDate,
  targetSlugs,
  twistFor,
  weekdayOf,
} from './schedule';
import { validate } from './validate';

export { DAY1, dateOfDay, isPreviewDay };
const MS_DAY = 86_400_000;

/** The baked Kitchen variants (rooms/kitchen-v1..7.json), in rotation order. FROZEN. */
export const KITCHEN_VARIANTS: readonly RoomDef[] = Object.freeze([v1, v2, v3, v4, v5, v6, v7] as unknown as RoomDef[]);
const GLASS: RoomDef = glassJson as unknown as RoomDef;

/** The authored days 1..21 (rooms/daily-NNN.json, baked by rooms.bake.test.ts), index = dayNo - 1. */
export const DAILY_ROOMS: readonly RoomDef[] = Object.freeze([
  d001, d002, d003, d004, d005, d006, d007, d008, d009, d010, d011, d012, d013, d014, d015, d016, d017, d018, d019, d020, d021,
] as unknown as RoomDef[]);

const clone = (r: RoomDef): RoomDef => {
  const c: RoomDef = { ...r, spawn: { ...r.spawn }, props: r.props.map((p) => ({ ...p, ...(p.cable ? { cable: { ...p.cable } } : {}) })) };
  if (r.accomplice) c.accomplice = { ...r.accomplice };
  if (r.sponsor) c.sponsor = { ...r.sponsor };
  if (r.par) c.par = { ...r.par };
  if (r.ancestors) c.ancestors = r.ancestors.slice();
  return c;
};

/** Day number of a local calendar date (time of day and time zone offset do not matter). */
export function dayNoFor(date: Date): number {
  const t = date.getTime();
  if (!Number.isFinite(t)) return 0;
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((local - DAY1_UTC) / MS_DAY) + 1;
}

export function variantIndexForDay(dayNo: number): number {
  const n = KITCHEN_VARIANTS.length;
  return (((Math.trunc(dayNo) - 1) % n) + n) % n;
}

// ---------------------------------------------------------------------------------------------
// Hand-edited schedule fields (public/daily/index.json) and par
// ---------------------------------------------------------------------------------------------

/** Fields the founder adds by hand to a day of public/daily/index.json (GDD 6.4 Community Sunday, 9.2 sponsor). */
export interface HandFields {
  community?: { code: string; title: string; author: string };
  sponsor?: { label: string; url?: string; brandShelf?: boolean };
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function parseHand(json: unknown): Map<number, HandFields> {
  const out = new Map<number, HandFields>();
  const days = (json as { days?: unknown })?.days;
  if (!Array.isArray(days)) return out;
  for (const d of days) {
    if (!d || typeof d !== 'object') continue;
    const o = d as Record<string, unknown>;
    const n = o.dayNo;
    if (typeof n !== 'number' || !Number.isInteger(n)) continue;
    const h: HandFields = {};
    const c = o.community as Record<string, unknown> | undefined;
    if (c && typeof c === 'object') {
      const code = str(c.code, 2000);
      if (code) h.community = { code, title: str(c.title, 40) ?? 'Community room', author: str(c.author, 24) ?? 'a player' };
    }
    const s = o.sponsor as Record<string, unknown> | undefined;
    if (s && typeof s === 'object') {
      const label = str(s.label, 24);
      if (label) {
        h.sponsor = { label };
        const url = str(s.url, 300);
        if (url && /^https:\/\//.test(url)) h.sponsor.url = url;
        if (s.brandShelf === true) h.sponsor.brandShelf = true;
      }
    }
    if (h.community || h.sponsor) out.set(n, h);
  }
  return out;
}

const HAND = parseHand(scheduleJson);
const PAR = (parJson ?? {}) as Record<string, { bronze: number; silver: number; gold: number } | undefined>;

/** The founder's hand fields of a day (empty when none). */
export function scheduleHand(dayNo: number): HandFields {
  return HAND.get(Math.trunc(dayNo)) ?? {};
}

function parFor(roomId: string): { bronze: number; silver: number; gold: number } | undefined {
  const p = PAR[roomId];
  if (!p || ![p.bronze, p.silver, p.gold].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) return undefined;
  return { bronze: Math.round(p.bronze), silver: Math.round(p.silver), gold: Math.round(p.gold) };
}

// ---------------------------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------------------------

const generated = new Map<number, RoomDef>();

function baseRoom(n: number): RoomDef {
  if (n >= 1 && n <= DAILY_ROOMS.length && n <= AUTHORED_DAYS) return clone(DAILY_ROOMS[n - 1]);
  let r = generated.get(n);
  if (!r) {
    r = generateRoom(n);
    if (generated.size > 256) generated.clear();
    generated.set(n, r);
  }
  return clone(r);
}

/** A player's Roomba goes back to its dock: the first free cell of the shell's loop (dropped when none is free). */
function onLoop(r: RoomDef): PropPlacement[] {
  const loop = SHELLS[r.shell]?.roombaLoop;
  if (!loop?.length) return r.props.map((p) => ({ ...p }));
  const isLoop = (x: number, z: number): boolean => loop.some((c) => c.x === x && c.z === z);
  const out: PropPlacement[] = [];
  for (const p of r.props) {
    if (propKind(p.kind)?.actor !== 'roomba' || isLoop(p.x, p.z)) {
      out.push({ ...p });
      continue;
    }
    const free = loop.find((c) => !r.props.some((q) => q.x === c.x && q.z === c.z) && !out.some((q) => q.x === c.x && q.z === c.z));
    if (free) out.push({ ...p, x: free.x, z: free.z, level: 0 });
  }
  return out;
}

/**
 * Community Sunday: the founder's chosen player room, decoded and validated; null when the code does not decode
 * or the room does not pass the validator (the day then keeps its generated room).
 */
export function communityRoom(dayNo: number, c: NonNullable<HandFields['community']>): RoomDef | null {
  const r = decodeRoom(c.code);
  if (!r) return null;
  const n = Math.trunc(dayNo);
  const room: RoomDef = {
    ...r,
    props: onLoop(r),
    id: dailyRoomId(n),
    title: `${shellLabel(r.shell)} #${n}: ${c.title}`,
    author: c.author,
    telegraph: 24,
    ticks: r.width === 14 ? BOSS_TICKS : RUN_TICKS,
    seed: mixSeed(r.seed, n),
  };
  try {
    return validate(resolve(room, 'ranked')).ok ? room : null;
  } catch {
    return null;
  }
}

/**
 * Place the sponsor product (kind 63) on the first free kit cell that keeps the room valid. Returns the room
 * unchanged when no cell works (the sponsor line still shows on the briefing card).
 */
export function placeSponsor(room: RoomDef, s: NonNullable<HandFields['sponsor']>): RoomDef {
  const kit = KITS[room.shell];
  if (!kit) return room;
  const taken = new Set(room.props.filter((p) => propKind(p.kind)?.pull !== 'cloth').map((p) => `${p.x},${p.z}`));
  const cells: [number, number][] = [...kit.slots.map((x) => [x.x, x.z] as [number, number]), ...kit.floor];
  for (const [x, z] of cells) {
    if (taken.has(`${x},${z}`)) continue;
    const play = resolve(room, 'ranked');
    const level = play.shell.levels[z * play.shell.width + x];
    const prop: PropPlacement = { kind: KIND.sponsorProduct, x, z, level, rot: 0 };
    const trial: RoomDef = { ...room, props: [...room.props, prop], sponsor: { propIndex: room.props.length, label: s.label } };
    if (s.url) trial.sponsor!.url = s.url;
    if (validate(resolve(trial, 'ranked')).ok) return trial;
  }
  return room;
}

/**
 * A day's room with the given hand fields (dailyRoom uses the ones in public/daily/index.json). `base` replaces
 * the baked/generated room of days >= 1 (the bake test passes the generator's fresh output).
 */
export function roomForDay(dayNo: number, hand: HandFields = {}, base?: RoomDef): RoomDef {
  const n = Number.isFinite(dayNo) ? Math.trunc(dayNo) : 1;
  if (n <= 0) {
    const r = clone(KITCHEN_VARIANTS[variantIndexForDay(n)]);
    r.id = dailyRoomId(n);
    r.seed = mixSeed(r.seed, n);
    r.ticks = RUN_TICKS;
    // round 3: "Preview" no longer repeats on every line of Home; the kicker alone says TODAY · PREVIEW.
    // Review round 1: every preview Kitchen version has its own name, so "Tomorrow: ..." gives a reason to return.
    r.title = `Kitchen: ${previewName(n)}`;
    return r;
  }
  let room: RoomDef | null = null;
  if (hand.community && n >= FIRST_COMMUNITY_DAY && weekdayOf(n) === 6) room = communityRoom(n, hand.community);
  if (!room) room = base ? clone(base) : baseRoom(n);
  if (hand.sponsor) room = placeSponsor(room, hand.sponsor);
  const par = parFor(room.id);
  if (par) room.par = par;
  return room;
}

export function dailyRoom(dayNo: number): RoomDef {
  const n = Number.isFinite(dayNo) ? Math.trunc(dayNo) : 1;
  return roomForDay(n, scheduleHand(n));
}

/** "The Glass": the wine glass on the counter edge is target #1 (props[0]). Always open, outside the rotation. */
export function glassRoom(): RoomDef {
  return clone(GLASS);
}

// ---------------------------------------------------------------------------------------------
// Labels, entries, archive, picker
// ---------------------------------------------------------------------------------------------

/** Names of the 7 preview Kitchen versions (KITCHEN_VARIANTS order), shown before launch. */
/** Preview names by weekday (Monday first): the variant index is the weekday, so Sunday Roast falls on a Sunday. */
export const PREVIEW_NAMES: readonly string[] = ['Breakfast Heist', 'Bake Sale', 'Pancake Panic', 'Midnight Snack', 'Tea Time', 'Leftovers', 'Sunday Roast'];

/** The preview name of a pre-launch day (its Kitchen version's). */
export function previewName(n: number): string {
  return PREVIEW_NAMES[variantIndexForDay(n)] ?? 'Breakfast Heist';
}

/** Label of a day given its room (a Community Sunday room is labelled by its own shell). */
function labelFor(n: number, room?: RoomDef): string {
  if (isPreviewDay(n)) return `${previewName(n)} · ${shortDate(n)}`;
  if (room?.author !== undefined) return `${shellLabel(room.shell)} #${n}`;
  return labelForPlan(planForDay(n), n);
}

/** "Kitchen #18", "Boss: Christmas Tree #20", or "Kitchen · Nov 2" before launch (short: it sits in a list row). */
export function roomLabel(dayNo: number): string {
  const n = Number.isFinite(dayNo) ? Math.trunc(dayNo) : 1;
  const hand = scheduleHand(n);
  const community = !!hand.community && n >= FIRST_COMMUNITY_DAY && weekdayOf(n) === 6;
  return labelFor(n, community ? dailyRoom(n) : undefined);
}

/** Kept for callers of the M0 API: same as roomLabel. */
export function dayLabel(dayNo: number): string {
  return roomLabel(dayNo);
}

/** The schedule entry of a day (GDD 3.5, 13.7): room, humans, twist, event, targets, wish, theme, accomplice... */
export function dailyEntry(dayNo: number): DailyEntry {
  const n = Number.isFinite(dayNo) ? Math.trunc(dayNo) : 1;
  return entryFor(n, dailyRoom(n));
}

/** "Chef Dad", "Party Host + Grandma", "Two caterers" (Caterer A and B are one job, review round 1). */
export function humanPair(humans: readonly string[]): string {
  if (humans.length < 2) return humans[0] ?? 'Chef Dad';
  const base = (n: string): string => n.replace(/\s+[A-Z]$/, '');
  if (base(humans[0]) === base(humans[1])) return `Two ${base(humans[0]).toLowerCase()}s`;
  return `${humans[0]} + ${humans[1]}`;
}

/** The schedule entry of day `n` built from its (already resolved) room. */
export function entryFor(n: number, room: RoomDef): DailyEntry {
  const wd = weekdayOf(n);
  const humans = [ROUTINES[room.routine]?.name ?? 'Chef Dad'];
  if (room.routine2 !== undefined) humans.push(ROUTINES[room.routine2]?.name ?? 'Chef Dad');
  const e: DailyEntry = {
    dayNo: n,
    date: dateOfDay(n),
    weekday: wd,
    roomId: room.id,
    title: room.title ?? labelFor(n, room),
    label: labelFor(n, room),
    shell: room.shell,
    routine: room.routine,
    human: humanPair(humans),
    event: ROOM_EVENT_NAMES[room.event] ?? ROOM_EVENT_NAMES[0],
    targets: targetSlugs(room),
  };
  if (room.routine2 !== undefined) e.routine2 = room.routine2;
  if (isPreviewDay(n)) {
    e.preview = true;
    e.season = seasonOf(n);
    return e;
  }
  const community = room.author !== undefined ? scheduleHand(n).community : undefined;
  const plan = planForDay(n);
  const twist = community ? `Community room by ${community.author}` : twistFor(n, plan);
  if (twist) e.twist = twist;
  if (room.accomplice) {
    const w = room.props[room.accomplice.wishPropIndex];
    if (w) e.wish = propKind(w.kind)?.id ?? String(w.kind);
    e.accomplice = room.accomplice.pinkPawId;
  }
  if (room.boss) e.boss = true;
  if (room.theme) e.theme = room.theme;
  const season = seasonOf(n);
  if (season) e.season = season;
  if (wd === 4 && !room.boss) e.felonyFriday = true;
  if (community) e.community = { ...community };
  const hand = scheduleHand(n);
  if (hand.sponsor) {
    e.sponsor = { label: hand.sponsor.label };
    if (hand.sponsor.url) e.sponsor.url = hand.sponsor.url;
    if (room.sponsor) e.sponsor.propIndex = room.sponsor.propIndex;
    if (hand.sponsor.brandShelf) e.sponsor.brandShelf = true;
  }
  if (room.par) e.par = { ...room.par };
  return e;
}

/** Past dailies, newest first (yesterday first). After launch never before Day #1; before launch, preview days. */
export function archive(todayNo: number, count: number): DailyEntry[] {
  const today = Number.isFinite(todayNo) ? Math.trunc(todayNo) : 1;
  const max = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  const back = today >= 1 ? Math.min(max, today - 1) : Math.min(max, KITCHEN_VARIANTS.length - 1);
  const out: DailyEntry[] = [];
  for (let k = 1; k <= back; k++) out.push(dailyEntry(today - k));
  return out;
}

/** Past days the picker shows after launch (GDD 8: the free archive is the last 14 days). */
export const PICKER_PAST_DAYS = 14;

/**
 * Room picker for typed arrivals (GDD 6.6): The Glass first, today, then recent days newest first.
 * After launch: up to 14 past days (never before Day #1). Before launch: the 6 previous preview days, so the
 * kill-test picker shows The Glass and all 7 Kitchen variants.
 */
export function pickerRooms(todayNo: number): { dayNo?: number; room: RoomDef; label: string }[] {
  const today = Number.isFinite(todayNo) ? Math.trunc(todayNo) : 1;
  const out: { dayNo?: number; room: RoomDef; label: string }[] = [
    { room: glassRoom(), label: 'The Glass' },
    { dayNo: today, room: dailyRoom(today), label: `Today: ${roomLabel(today)}` },
  ];
  const back = today >= 1 ? Math.min(PICKER_PAST_DAYS, today - 1) : KITCHEN_VARIANTS.length - 1;
  for (let k = 1; k <= back; k++) out.push({ dayNo: today - k, room: dailyRoom(today - k), label: roomLabel(today - k) });
  return out;
}
