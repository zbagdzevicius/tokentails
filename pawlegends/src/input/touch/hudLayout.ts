/**
 * Gaps round 3 (hud-controls): the custom touch HUD layout (Wild Rift / MLBB "Edit HUD"), as data. Pure, unit-tested.
 *
 * What the player can move and resize: the nine touch buttons (touchArc.ts: Attack, Q, W, E, R, the trick, Nap, the
 * last-hit and tower buttons), the minimap (with its satellites: the ping paw, the Fish chip, and in party matches the
 * emote and chat buttons move with it as one group) and the joystick (its home: the floating stick's zone moves with it, and its size).
 *
 * Rules (the editor and every load enforce them; `problems` lists what breaks them):
 *   - every control stays inside the screen's safe area (EDGE px in from the insets);
 *   - no two controls overlap (GAP px between them at least);
 *   - nothing covers the score bar (the top-centre band, where the editor's toolbar sits).
 * The left-handed mirror flips the arc and the joystick; the right-edge column (Nap, last-hit, tower) stays on the right
 * edge (mirrored, it sat on the minimap; touchControls.ts places it the same way).
 * Nothing is stored until the player saves a layout; with no layout stored, the HUD is the default arc exactly
 * (the hud-area spec footprint is unchanged). A stored layout that does not fit this screen (another phone of the same
 * class, a rotated tablet) falls back to the default as a whole, never to a half-moved one.
 *
 * Storage: one JSON map in `pawlegends.hudLayout.v1`, keyed by device class (`deviceClass`: phone or tablet, landscape
 * or portrait), each control `[x, y, k]`: its centre as a fraction of the viewport (in the right-handed frame; the
 * left-handed mirror flips x when it is applied) and its size factor. It follows the account (meta/progressCloud.ts
 * `prefs.data.hud`), so a phone keeps the phone layout and a tablet the tablet one.
 */
import { ARC_MAIN, arcLayout, type ArcButton } from './touchArc';

export type HudCtl = ArcButton | 'minimap' | 'stick';
export const HUD_BUTTONS: readonly ArcButton[] = Object.freeze(['attack', 'q', 'w', 'e', 'r', 'trick', 'nap', 'lasthit', 'tower'] as ArcButton[]);
export const HUD_CTLS: readonly HudCtl[] = Object.freeze([...HUD_BUTTONS, 'minimap', 'stick'] as HudCtl[]);

/** A control on screen (CSS px): a circle (`d` across) or the minimap group's rect (`w` × `h`), by its centre. */
export interface HudShape {
  x: number;
  y: number;
  /** Circle diameter (buttons, the stick ring); 0 for the rect. */
  d: number;
  /** Rect size (the minimap group); 0 for a circle. */
  w: number;
  h: number;
  /** Size factor against the default (1 = default). */
  k: number;
}
export type HudLayout = Record<HudCtl, HudShape>;

export interface Insets {
  t: number;
  r: number;
  b: number;
  l: number;
}

export interface HudView {
  w: number;
  h: number;
  safe: Insets;
  /** Settings "Button size: Large". */
  large: boolean;
  /** Left-handed mirror (buttons left, stick right). */
  lefty: boolean;
  /** Minimap size factor (S / M / L: ui/minimapPrefs.ts MINIMAP_SIZE_K). */
  mmK: number;
}

/** The cluster's bottom-right corner offset (ui/css/match.css `.pl-tcluster`: right 28 px, bottom 24 px). */
export const CLUSTER = Object.freeze({ right: 28, bottom: 24 });
/** Edge margin (px) inside the safe area, and the least gap between two controls (px). */
export const EDGE = 4;
export const GAP = 4;
/** Size factors the editor allows (buttons and the stick). */
export const SIZE = Object.freeze({ min: 0.8, max: 1.4, step: 0.1 });
/** The joystick ring at size 1 (px across; touchControls STICK.radius × 2). */
export const STICK_D = 120;
/**
 * The minimap group: the box plus the Fish chip that hangs under its rim (ui/lol-hud.css). The ping paw sits inside
 * the box; the party emote and chat buttons (a column under it, party matches only) move with the group too.
 */
export const MM_TAIL = 18;
/** The hero's spot the editor draws for reference (px radius around the screen centre; not a rule). */
export const HERO_R = 56;
/** The score bar band (top centre): its width (px) and height under the top inset. The editor's toolbar sits in it. */
export const TOP_BAND = Object.freeze({ w: 340, h: 44 });
/** Snap distance (px) to another control's centre line or the safe edge. */
export const SNAP_PX = 8;

/** The device class a layout is saved under: phone or tablet (short side 600 px and up), landscape or portrait. */
export function deviceClass(w: number, h: number): string {
  const kind = Math.min(w, h) >= 600 ? 'tablet' : 'phone';
  return `${kind}-${w >= h ? 'l' : 'p'}`;
}

/** The minimap box (px) on a touch screen (ui/feel.css `--mm-w`/`--mm-h`: 112 px square, 104 px at 380 px tall or less). */
export function minimapBox(_w: number, h: number, k = 1): { w: number; h: number } {
  const s = (h <= 380 ? 104 : 112) * k;
  return { w: s, h: s };
}

/** The joystick's default home: the middle of the floating stick's zone's lower part (the left 40% × bottom 70%). */
export function defaultStickHome(v: Pick<HudView, 'w' | 'h' | 'safe' | 'lefty'>): { x: number; y: number } {
  const x = v.lefty ? v.w - v.safe.r - Math.max(STICK_D / 2 + 12, v.w * 0.17) : v.safe.l + Math.max(STICK_D / 2 + 12, v.w * 0.17);
  return { x, y: v.h - v.safe.b - STICK_D / 2 - 16 };
}

const circle = (x: number, y: number, d: number, k = 1): HudShape => ({ x, y, d, w: 0, h: 0, k });

/** Every control's default spot for a view (the arc of touchArc.ts, the top-left minimap, the stick home). Pure. */
export function defaultLayout(v: HudView): HudLayout {
  const arc = arcLayout(v.w, v.h, v.large);
  const cy = v.h - v.safe.b - CLUSTER.bottom;
  const out = {} as HudLayout;
  for (const id of HUD_BUTTONS) {
    const s = arc[id];
    const x = v.lefty && mirrors(id) ? v.safe.l + CLUSTER.right + s.rx : v.w - v.safe.r - CLUSTER.right - s.rx;
    out[id] = circle(x, cy - s.by, s.d);
  }
  const mm = minimapBox(v.w, v.h, v.mmK);
  const gh = mm.h + MM_TAIL;
  out.minimap = { x: v.safe.l + 8 + mm.w / 2, y: v.safe.t + 8 + gh / 2, d: 0, w: mm.w, h: gh, k: 1 };
  const home = defaultStickHome(v);
  out.stick = circle(home.x, home.y, STICK_D);
  return out;
}

/** One stored control: [x fraction, y fraction, size factor] in the right-handed frame. */
export type StoredCtl = [number, number, number];
export type StoredLayout = Partial<Record<HudCtl, StoredCtl>>;
export type HudStore = Record<string, StoredLayout>;

const r4 = (n: number): number => Math.round(n * 10000) / 10000;
const clampK = (k: number): number => (Number.isFinite(k) ? Math.max(SIZE.min, Math.min(SIZE.max, Math.round(k * 10) / 10)) : 1);

/** A stored layout from untrusted JSON (storage, the account): known controls, finite fractions in 0..1. Pure. */
export function parseStored(v: unknown): StoredLayout | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: StoredLayout = {};
  for (const id of HUD_CTLS) {
    const c = (v as Record<string, unknown>)[id];
    if (!Array.isArray(c) || c.length !== 3) continue;
    const [x, y, k] = c.map(Number);
    if (![x, y, k].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1) continue;
    out[id] = [r4(x), r4(y), clampK(k)];
  }
  return Object.keys(out).length ? out : null;
}

export function parseStore(v: unknown): HudStore {
  const out: HudStore = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [key, l] of Object.entries(v as Record<string, unknown>).slice(0, 8)) {
    if (!/^(phone|tablet)-[lp]$/.test(key)) continue;
    const p = parseStored(l);
    if (p) out[key] = p;
  }
  return out;
}

/** A screen layout to its stored form (only the controls that differ from the default). Pure. */
export function toStored(l: HudLayout, v: HudView): StoredLayout | null {
  const def = defaultLayout(v);
  const out: StoredLayout = {};
  for (const id of HUD_CTLS) {
    const s = l[id];
    const d = def[id];
    if (Math.abs(s.x - d.x) < 0.5 && Math.abs(s.y - d.y) < 0.5 && Math.abs(s.k - d.k) < 0.01) continue;
    const x = mirrors(id) && v.lefty ? v.w - s.x : s.x;
    out[id] = [r4(x / v.w), r4(s.y / v.h), clampK(s.k)];
  }
  return Object.keys(out).length ? out : null;
}

/** The left-handed mirror flips the arc's main buttons and the stick; the right-edge column and the minimap stay. */
export const mirrors = (id: HudCtl): boolean => id === 'stick' || ARC_MAIN.includes(id as ArcButton);

/** Resize a control to factor k (its default size × k, buttons never under 44 px). Pure. */
export function sized(def: HudShape, k: number): Pick<HudShape, 'd' | 'w' | 'h' | 'k'> {
  const kk = clampK(k);
  if (def.d > 0) return { d: Math.max(44, Math.round(def.d * kk)), w: 0, h: 0, k: kk };
  return { d: 0, w: def.w, h: def.h, k: 1 };
}

/**
 * The stored layout applied to a view (mirrored for the left-handed setting). null when it breaks a rule here among
 * the controls on screen (`ids`: the last-hit and tower buttons only when Settings shows them). Pure.
 */
export function fromStored(st: StoredLayout | null | undefined, v: HudView, ids: readonly HudCtl[] = HUD_CTLS): HudLayout | null {
  if (!st) return null;
  const def = defaultLayout(v);
  const out = { ...def };
  for (const id of HUD_CTLS) {
    const c = st[id];
    if (!c) continue;
    const x = c[0] * v.w;
    out[id] = { ...def[id], ...sized(def[id], c[2]), x: mirrors(id) && v.lefty ? v.w - x : x, y: c[1] * v.h };
  }
  return problems(out, v, ids).length ? null : out;
}

/** The box a shape covers (px). */
export function bounds(s: HudShape): { x0: number; y0: number; x1: number; y1: number } {
  const hw = s.d > 0 ? s.d / 2 : s.w / 2;
  const hh = s.d > 0 ? s.d / 2 : s.h / 2;
  return { x0: s.x - hw, y0: s.y - hh, x1: s.x + hw, y1: s.y + hh };
}

/** The safe rectangle every control stays inside (px). */
export function safeRect(v: HudView): { x0: number; y0: number; x1: number; y1: number } {
  return { x0: v.safe.l + EDGE, y0: v.safe.t + EDGE, x1: v.w - v.safe.r - EDGE, y1: v.h - v.safe.b - EDGE };
}

/** The score bar band (top centre) and the hero disc. */
export function keepOuts(v: HudView): { band: { x0: number; y0: number; x1: number; y1: number }; hero: { x: number; y: number; r: number } } {
  const bw = Math.min(TOP_BAND.w, v.w * 0.5);
  return { band: { x0: v.w / 2 - bw / 2, y0: 0, x1: v.w / 2 + bw / 2, y1: v.safe.t + TOP_BAND.h }, hero: { x: v.w / 2, y: v.h / 2, r: HERO_R } };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
const rectDist = (r: Rect, x: number, y: number): number => Math.hypot(x - Math.max(r.x0, Math.min(r.x1, x)), y - Math.max(r.y0, Math.min(r.y1, y)));

/** Edge-to-edge gap (px) between two shapes (negative = overlap). */
export function gapBetween(a: HudShape, b: HudShape): number {
  if (a.d > 0 && b.d > 0) return Math.hypot(a.x - b.x, a.y - b.y) - a.d / 2 - b.d / 2;
  if (a.d > 0 || b.d > 0) {
    const c = a.d > 0 ? a : b;
    const r = a.d > 0 ? b : a;
    const box = bounds(r);
    const inside = c.x >= box.x0 && c.x <= box.x1 && c.y >= box.y0 && c.y <= box.y1;
    return inside ? -c.d / 2 : rectDist(box, c.x, c.y) - c.d / 2;
  }
  const p = bounds(a);
  const q = bounds(b);
  const dx = Math.max(p.x0 - q.x1, q.x0 - p.x1, 0);
  const dy = Math.max(p.y0 - q.y1, q.y0 - p.y1, 0);
  return dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -Math.min(p.x1 - q.x0, q.x1 - p.x0, p.y1 - q.y0, q.y1 - p.y0);
}

/** Why one control is not allowed where it is ('edge', 'top', or the control it overlaps), or null. Pure. */
export function problemOf(l: HudLayout, id: HudCtl, v: HudView, ids: readonly HudCtl[] = HUD_CTLS): string | null {
  const s = l[id];
  const b = bounds(s);
  const sr = safeRect(v);
  if (b.x0 < sr.x0 - 0.5 || b.y0 < sr.y0 - 0.5 || b.x1 > sr.x1 + 0.5 || b.y1 > sr.y1 + 0.5) return 'edge';
  const ko = keepOuts(v);
  const band = { x: (ko.band.x0 + ko.band.x1) / 2, y: (ko.band.y0 + ko.band.y1) / 2, d: 0, w: ko.band.x1 - ko.band.x0, h: ko.band.y1 - ko.band.y0, k: 1 };
  if (gapBetween(s, band) < 0) return 'top';
  for (const o of ids) if (o !== id && gapBetween(s, l[o]) < GAP - 0.5) return o;
  return null;
}

/** Every control that breaks a rule (empty = the layout is valid). Pure. */
export function problems(l: HudLayout, v: HudView, ids: readonly HudCtl[] = HUD_CTLS): HudCtl[] {
  return ids.filter((id) => problemOf(l, id, v, ids) !== null);
}

/**
 * Snap a dragged control's centre: to another control's centre line (x or y) or flush with the safe edge, within
 * SNAP_PX. Returns the snapped centre and the guide lines to draw (screen px). Pure.
 */
export function snap(l: HudLayout, id: HudCtl, x: number, y: number, v: HudView, ids: readonly HudCtl[] = HUD_CTLS): { x: number; y: number; gx: number | null; gy: number | null } {
  const s = l[id];
  const hw = s.d > 0 ? s.d / 2 : s.w / 2;
  const hh = s.d > 0 ? s.d / 2 : s.h / 2;
  const sr = safeRect(v);
  let bx: { at: number; guide: number; dist: number } | null = null;
  let by: { at: number; guide: number; dist: number } | null = null;
  const tryX = (at: number, guide: number): void => {
    const dist = Math.abs(x - at);
    if (dist <= SNAP_PX && (!bx || dist < bx.dist)) bx = { at, guide, dist };
  };
  const tryY = (at: number, guide: number): void => {
    const dist = Math.abs(y - at);
    if (dist <= SNAP_PX && (!by || dist < by.dist)) by = { at, guide, dist };
  };
  for (const o of ids) {
    if (o === id) continue;
    tryX(l[o].x, l[o].x);
    tryY(l[o].y, l[o].y);
  }
  tryX(sr.x0 + hw, sr.x0);
  tryX(sr.x1 - hw, sr.x1);
  tryY(sr.y0 + hh, sr.y0);
  tryY(sr.y1 - hh, sr.y1);
  const sx = bx as { at: number; guide: number } | null;
  const sy = by as { at: number; guide: number } | null;
  return { x: sx ? sx.at : Math.round(x), y: sy ? sy.at : Math.round(y), gx: sx ? sx.guide : null, gy: sy ? sy.guide : null };
}

// ------------------------------------------------------------------------------------------------- storage

export const HUD_KEY = 'pawlegends.hudLayout.v1';
/** The layout changed (the editor saved, the account brought one): the touch HUD lays itself out again. */
export const HUD_EVENT = 'pawlegends:hudlayout';

let mem: HudStore | null = null;

export function loadHudStore(): HudStore {
  if (mem) return mem;
  try {
    return (mem = parseStore(JSON.parse(localStorage.getItem(HUD_KEY) ?? 'null')));
  } catch {
    return (mem = {});
  }
}

export function saveHudStore(s: HudStore, notify = true): void {
  mem = parseStore(s);
  try {
    // an emptied store stays as "{}" (a reset the account sync carries), unlike a device that never saved one
    localStorage.setItem(HUD_KEY, JSON.stringify(mem));
  } catch {
    /* storage blocked: this page only */
  }
  if (!notify) return;
  try {
    window.dispatchEvent(new Event(HUD_EVENT));
  } catch {
    /* no window */
  }
}

/** Has this device ever saved (or reset) a HUD layout? (The account sync sends the map only then.) */
export function hudStoreTouched(): boolean {
  try {
    return localStorage.getItem(HUD_KEY) !== null;
  } catch {
    return mem !== null && Object.keys(mem).length > 0;
  }
}

/** Save (or with null, reset) the layout of one device class. */
export function saveDeviceLayout(key: string, l: StoredLayout | null): void {
  const s = { ...loadHudStore() };
  if (l) s[key] = l;
  else delete s[key];
  saveHudStore(s);
}

/** The stored layout for this screen's device class, or null (the default). */
export function storedFor(w: number, h: number): StoredLayout | null {
  return loadHudStore()[deviceClass(w, h)] ?? null;
}

/** Tests: forget the in-memory copy. */
export function resetHudStore(): void {
  mem = null;
}

/** The safe-area insets in px (env(safe-area-inset-*)), read through a probe element. */
export function readInsets(): Insets {
  if (typeof document === 'undefined' || !document.body) return { t: 0, r: 0, b: 0, l: 0 };
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const n = (s: string): number => Math.max(0, parseFloat(s) || 0);
  const out = { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
  p.remove();
  return out;
}
