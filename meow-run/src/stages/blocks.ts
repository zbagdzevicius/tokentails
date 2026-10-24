// The block library (TRAILS lane, iteration 2). Pure (node-importable). Every set-piece "template" of the endless
// generator is a block here, and the Trail Maker chains the same blocks into player-made courses, so a block must
// compose with any other block:
//  - it opens with a calm lead of at least 30 u (no hazards; a gentle bend with a fish line), so the previous block's
//    last hazard, gap landing or chase is always far enough behind;
//  - it ends on plain ground (wall-runs bank back to 0, rivers narrow back to 9 u);
//  - everything it places is inside its own stretch of path.
// `mirror` flips every turn and lateral offset, `hard` packs more hazards (density at least 0.85), `d` is the endless
// difficulty 0..1. Blocks keep no module state: the same rng sequence always lays the same block.
import { range } from '../core/rng';
import type { Rng, ThemeId } from '../core/types';
import { CLOUD_H, vaultArc } from '../setpieces/layout';
import { Script } from './author';

export interface BlockOpts {
  mirror: boolean;
  hard: boolean;
  /** difficulty 0..1 (endless ramps it by chunk index; the Trail Maker uses TRAIL_D) */
  d: number;
}
export interface BlockDef {
  /** stable single base-36 character (trail codes store it) */
  id: string;
  key: string;
  name: string;
  /** inline SVG (24x24 view box) */
  icon: string;
  /** minimap / course strip colour */
  color: string;
  /** a big set piece (checkpoint, its own music cue): endless spaces them out */
  big: boolean;
  /** themes the block is offered in (undefined = every theme) */
  themes?: ThemeId[];
  build(k: Script, rng: Rng, o: BlockOpts): void;
}

/** the difficulty a Trail Maker block is laid at (hard blocks use HARD_D) */
export const TRAIL_D = 0.35;
export const HARD_D = 0.9;
/** the calm lead every block opens with is at least this long (u) */
export const MIN_LEAD = 36;

const side = (r: Rng): number => (r() < 0.5 ? -1 : 1);
const dens = (o: BlockOpts): number => (o.hard ? Math.max(HARD_D, o.d) : o.d);
const lerpN = (lo: number, hi: number, d: number): number => Math.round(lo + (hi - lo) * d);
const turnOf = (rng: Rng, m: number, k = 1): number => m * range(rng, -45, 45) * k;

/** the calm lead: a gentle bend with a fish line, no hazards. Returns its s0. */
function lead(k: Script, rng: Rng, m: number): number {
  const s = k.run(range(rng, 40, 60), { turn: m * range(rng, -35, 35), rise: range(rng, -4, 4) });
  k.fish(s + 8, m * range(rng, -2, 2), 5, 3);
  return s;
}

// ---------------------------------------------------------------- icons (procedural inline SVG)
const INK = '#2a1c14';
const svg = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICON = {
  fish: svg('<path d="M3 12 Q9 5 16 9 L21 6 L20 12 L21 18 L16 15 Q9 19 3 12Z" fill="#7fd0ff"/><circle cx="7.5" cy="11" r="1.2" fill="#2a1c14" stroke="none"/>'),
  bendL: svg('<path d="M15 22 V14 Q15 7 8 7 H6" stroke-width="3.2" stroke="#c98a4a"/><path d="M15 22 V14 Q15 7 8 7 H6"/><path d="M9 3 L5 7 L9 11"/>'),
  bendR: svg('<path d="M9 22 V14 Q9 7 16 7 H18" stroke-width="3.2" stroke="#c98a4a"/><path d="M9 22 V14 Q9 7 16 7 H18"/><path d="M15 3 L19 7 L15 11"/>'),
  hill: svg('<path d="M1.5 20 Q8 5 12 5 Q16 5 22.5 20Z" fill="#7ccf5a"/><path d="M8 9 Q10 6.5 12 6.5" stroke="#fff7ea"/>'),
  logs: svg('<rect x="3" y="10" width="17" height="8" rx="4" fill="#b8763e"/><ellipse cx="19" cy="14" rx="2.4" ry="4" fill="#e9b77a"/><path d="M8 6 Q12 2 16 6"/><path d="M14 4.6 L16 6 L14.4 7.8"/>'),
  branches: svg('<path d="M2 7 H22" stroke-width="3" stroke="#8a5a32"/><path d="M2 7 H22"/><circle cx="7" cy="5" r="2.2" fill="#7ccf5a"/><circle cx="16" cy="5" r="2.4" fill="#7ccf5a"/><path d="M12 12 V20"/><path d="M9 17 L12 20 L15 17"/>'),
  rocks: svg('<path d="M3 19 L5 12 L10 9 L14 12 L13 19Z" fill="#a8a29a"/><path d="M13 19 L15 14 L19 13 L21.5 19Z" fill="#c9c2b8"/>'),
  mixed: svg('<rect x="2" y="13" width="11" height="6" rx="3" fill="#b8763e"/><path d="M14 19 L15.5 13 L19 11 L22 14 L21 19Z" fill="#a8a29a"/><path d="M4 7 H20" stroke="#8a5a32" stroke-width="2.6"/>'),
  bamboo: svg('<path d="M6 21 V3 M12 21 V5 M18 21 V2" stroke="#5fb93c" stroke-width="3.4"/><path d="M6 21 V3 M12 21 V5 M18 21 V2"/><path d="M5 9 H7 M5 15 H7 M11 11 H13 M11 16 H13 M17 7 H19 M17 13 H19"/>'),
  puddles: svg('<ellipse cx="9" cy="16" rx="7" ry="3.4" fill="#4cc3ff"/><ellipse cx="18.5" cy="10" rx="4" ry="2.2" fill="#7fd0ff"/><path d="M6 15 Q8 14 10 15" stroke="#fff7ea"/>'),
  gap: svg('<path d="M1.5 19 V14 H8 V19" fill="#c98a4a"/><path d="M16 19 V14 H22.5 V19" fill="#c98a4a"/><path d="M5 12 Q12 1 19 12" stroke-dasharray="2.4 2.4"/>'),
  pounce: svg('<path d="M1.5 20 V15 H6 V20" fill="#c98a4a"/><path d="M18 20 V15 H22.5 V20" fill="#c98a4a"/><path d="M4 13 Q8 4 12 9 Q16 3 20 13" stroke-dasharray="2.2 2.2"/><path d="M11 8.5 L12 9.6 L13.4 8.4"/>'),
  vault: svg('<path d="M1.5 20 V16 H5 V20" fill="#c98a4a"/><path d="M19 20 V16 H22.5 V20" fill="#c98a4a"/><path d="M4 15 Q12 -2 20 15" stroke="#ff8a2a" stroke-width="3.4"/><path d="M4 15 Q12 -2 20 15" stroke-dasharray="1 3"/><circle cx="12" cy="6.5" r="2" fill="#ffc21a"/>'),
  river: svg('<path d="M2 8 Q5 5 8 8 T14 8 T20 8 T23 8" stroke="#4cc3ff" stroke-width="3.2"/><path d="M1 14 Q4 11 7 14 T13 14 T19 14 T23 14" stroke="#4cc3ff" stroke-width="3.2"/><path d="M8 19 Q12 16 16 19"/><ellipse cx="12" cy="19.5" rx="5" ry="1.6" fill="#7ccf5a"/>'),
  wall: svg('<path d="M4 22 L9 2 H21 V22Z" fill="#c98a4a"/><path d="M12 8 L13 12 M15 8 L16 12 M18 8 L19 12" stroke="#fff7ea"/><path d="M11 16 L12 20 M14 16 L15 20"/>'),
  dog: svg('<ellipse cx="12" cy="13" rx="7.5" ry="6.5" fill="#d9a066"/><path d="M5 9 Q2 12 4 17 L6.5 12Z M19 9 Q22 12 20 17 L17.5 12Z" fill="#8a5a32"/><circle cx="9.5" cy="12" r="1" fill="#2a1c14" stroke="none"/><circle cx="14.5" cy="12" r="1" fill="#2a1c14" stroke="none"/><ellipse cx="12" cy="15.5" rx="1.8" ry="1.2" fill="#2a1c14" stroke="none"/>'),
  yarn: svg('<circle cx="12" cy="12" r="8.5" fill="#ff4f7b"/><path d="M5 9 Q12 12 19 7 M4.5 14 Q12 17 20 12 M8 19 Q13 13 12 3.5"/><path d="M20 17 Q23 19 22 22"/>'),
  cloud: svg('<path d="M6 18 Q2 18 2.5 14.5 Q3 11 6.5 11.5 Q7 6.5 12 6.5 Q16.5 6.5 17 11 Q21.5 10.5 21.5 14.5 Q21.5 18 18 18Z" fill="#fff7ea"/><path d="M9 6.8 L10 4 L11.5 6.6 M13 6.6 L14.4 4 L15.4 7" fill="#fff7ea"/><circle cx="10" cy="12.5" r=".9" fill="#2a1c14" stroke="none"/><circle cx="14" cy="12.5" r=".9" fill="#2a1c14" stroke="none"/>'),
  bridge: svg('<path d="M1.5 14 H22.5" stroke="#b8763e" stroke-width="4"/><path d="M1.5 12 H22.5 M1.5 16 H22.5"/><path d="M5 12 V16 M9 12 V16 M13 12 V16 M17 12 V16 M21 12 V16"/><path d="M2 5 Q12 11 22 5"/><path d="M5 6.6 V12 M12 8 V12 M19 6.6 V12"/>'),
  sbend: svg('<path d="M7 22 Q7 15 12 12 Q17 9 17 2" stroke="#c98a4a" stroke-width="3.4"/><path d="M7 22 Q7 15 12 12 Q17 9 17 2"/><path d="M14 4.5 L17 1.5 L20 4.5"/>'),
};

// ---------------------------------------------------------------- the blocks
function bend(k: Script, rng: Rng, o: BlockOpts, dir: number): void {
  const m = (o.mirror ? -1 : 1) * dir; // dir -1 = left
  lead(k, rng, m);
  const s = k.run(170, { turn: m * range(rng, 80, 110), rise: range(rng, -6, 6) });
  // a fish line hugging the inside of the bend, the yarn on the outside
  k.fish(s + 10, m * 2, 9, 3).yarn(s + 52, -m * 2.2);
  if (o.hard) k.rock(s + 70, m * 2.3, 0.95).rock(s + 120, m * 2.3, 1).fish(s + 84, -m * 2, 6, 3);
  else k.fish(s + 84, 0, 8, 3, 'wave', { amp: 2 });
  k.treat(s + 150, 0);
}

export const BLOCKS: readonly BlockDef[] = [
  {
    id: '0',
    key: 'fish',
    name: 'Fish line',
    icon: ICON.fish,
    color: '#4cc3ff',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const s = k.run(130, { turn: turnOf(rng, m), rise: range(rng, -6, 6) });
      k.fish(s + 6, 0, 10, 3, 'wave', { amp: 2.4 }).treat(s + 50, m * range(rng, -2, 2)).yarn(s + 80, m * range(rng, -2, 2)).fish(s + 96, m * range(rng, -2, 2), 8, 3);
    },
  },
  { id: '1', key: 'bendL', name: 'Bend left', icon: ICON.bendL, color: '#e0a060', big: false, build: (k, rng, o) => bend(k, rng, o, -1) },
  { id: '2', key: 'bendR', name: 'Bend right', icon: ICON.bendR, color: '#d08a48', big: false, build: (k, rng, o) => bend(k, rng, o, 1) },
  {
    id: '3',
    key: 'hill',
    name: 'Hill',
    icon: ICON.hill,
    color: '#7ccf5a',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const up = k.run(80, { rise: range(rng, 14, 22), turn: m * range(rng, -15, 15) });
      k.fish(up + 10, 0, 8, 3);
      const s = k.run(110, { rise: -range(rng, 16, 26), turn: m * range(rng, -20, 20) });
      k.fish(s + 4, 0, 7, 2.6, 'arc', { h: 2.4 }).treat(s + 40, m * 2);
      if (o.hard) k.log(s + 66).fish(s + 58, 0, 6, 2.5, 'arc', { h: 2 });
      k.yarn(s + 92, -m * 2);
    },
  },
  {
    id: '4',
    key: 'logs',
    name: 'Logs',
    icon: ICON.logs,
    color: '#b8763e',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      const d = dens(o);
      lead(k, rng, m);
      const cnt = lerpN(2, 4, d);
      const s = k.run(40 + cnt * 32, { turn: turnOf(rng, m) });
      for (let i = 0; i < cnt; i++) {
        const at = s + 20 + i * 32;
        if (rng() < 0.35 + d * 0.3) k.log(at, m * side(rng) * 2.25, 4.5);
        else k.log(at).fish(at - 8, 0, 6, 2.6, 'arc', { h: 2 });
      }
    },
  },
  {
    id: '5',
    key: 'branches',
    name: 'Branches',
    icon: ICON.branches,
    color: '#8a5a32',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const cnt = lerpN(2, 3, dens(o));
      const s = k.run(40 + cnt * 34, { turn: turnOf(rng, m) });
      for (let i = 0; i < cnt; i++) k.branch(s + 20 + i * 34).fish(s + 34 + i * 34, 0, 3, 2.5, 'line', { y: 0.45 });
    },
  },
  {
    id: '6',
    key: 'rocks',
    name: 'Rock slalom',
    icon: ICON.rocks,
    color: '#a8a29a',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const cnt = lerpN(3, 6, dens(o));
      const s = k.run(30 + cnt * 22, { turn: turnOf(rng, m) });
      let x = m * side(rng) * 2.3;
      for (let i = 0; i < cnt; i++) {
        k.rock(s + 18 + i * 22, x, range(rng, 0.8, 1.1));
        x = -x;
      }
      k.yarn(s + 10 + cnt * 11, 0);
    },
  },
  {
    id: '7',
    key: 'mixed',
    name: 'Mixed bag',
    icon: ICON.mixed,
    color: '#c86b3c',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const s = k.run(150, { turn: turnOf(rng, m), rise: range(rng, -8, 8) });
      k.log(s + 20).rock(s + 50, m * side(rng) * 2.3).branch(s + 80).log(s + 110, m * side(rng) * 2.25, 4.5).fish(s + 124, 0, 6, 3);
      if (o.hard) k.rock(s + 142, -m * 2.3, 1);
    },
  },
  {
    id: '8',
    key: 'bamboo',
    name: 'Bamboo',
    icon: ICON.bamboo,
    color: '#5fb93c',
    big: false,
    build(k, rng, o) {
      // a slalom: one lane switch per cluster, spaced by time (about 1.45 s at the speed of this difficulty)
      const m = o.mirror ? -1 : 1;
      const d = dens(o);
      lead(k, rng, m);
      const cnt = lerpN(3, 5, d);
      const gap = Math.round(1.45 * (20 + 11 * d));
      const s = k.run(40 + cnt * gap, { turn: turnOf(rng, m, 0.5) });
      let x = m * side(rng) * 2.6;
      for (let i = 0; i < cnt; i++) {
        k.bamboo(s + 20 + i * gap, x, 3, 2.4).fish(s + 20 + i * gap + Math.round(gap * 0.4), -x, 3, 3);
        x = -x;
      }
    },
  },
  {
    id: '9',
    key: 'puddles',
    name: 'Puddles',
    icon: ICON.puddles,
    color: '#7fd0ff',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const s = k.run(150, { turn: turnOf(rng, m, 0.6) });
      k.sign(s + 2, 'water', m).puddle(s + 24, -m * 1.8).fish(s + 32, m * 2.2, 4, 3);
      k.puddle(s + 60, m * 1.8).fish(s + 68, -m * 2.2, 4, 3).puddle(s + 96, -m * 1.4, o.hard ? 1.9 : 1.4);
      if (o.hard) k.rock(s + 122, m * 2.3).puddle(s + 136, -m * 1.6);
      else k.treat(s + 126, 0);
    },
  },
  {
    id: 'a',
    key: 'gap',
    name: 'Jump gap',
    icon: ICON.gap,
    color: '#6b4a32',
    big: false,
    build(k, rng, o) {
      const d = dens(o);
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const g = k.gapJump(36, Math.round(8 + 6 * d), 28, { hint: d < 0.2 ? 'JUMP!' : '' });
      k.fish(g - 5, 0, 7, 2.6, 'arc', { h: 2.2 });
    },
  },
  {
    id: 'b',
    key: 'pounce',
    name: 'Pounce gap',
    icon: ICON.pounce,
    color: '#ff8a2a',
    big: false,
    build(k, rng, o) {
      const d = dens(o);
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const len = o.hard ? 17 : 15;
      const g = k.gapJump(40, len, 30, { hint: d < 0.5 ? 'JUMP TWICE TO POUNCE!' : '' });
      k.fish(g - 6, 0, 8, 2.8, 'arc', { h: 2.6 });
      k.treat(g + len + 14, m * 2);
    },
  },
  {
    id: 'c',
    key: 'vault',
    name: 'Tail vault',
    icon: ICON.vault,
    color: '#ffc21a',
    big: true,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const len = Math.round(22 + 8 * dens(o));
      const v = k.vaultGap(42, len, 36, { turn: m * range(rng, -10, 10) });
      const a = vaultArc(v, len);
      k.treat(a.mid, 0, a.height - 0.2);
    },
  },
  {
    id: 'd',
    key: 'river',
    name: 'River surf',
    icon: ICON.river,
    color: '#2f9fe0',
    big: true,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const len = Math.round(220 + 120 * dens(o));
      const s = k.riverRun(len, { turn: turnOf(rng, m) });
      k.fish(s + 16, m * side(rng) * 3, 8, 3);
      let at = s + 56;
      let x = m * side(rng) * 2.6;
      while (at < s + len - 30) {
        const r = rng();
        if (r < 0.45) k.riverrock(at, x, range(rng, 0.9, 1.3));
        else if (r < 0.75) k.driftlog(at, x * 0.9, 5);
        else k.rapid(at).fish(at - 7, 0, 5, 3, 'arc', { h: 2.2 });
        k.fish(at + 12, -x, 4, 3);
        x = -x;
        at += range(rng, 34, 48);
      }
      k.run(30, { width: 9 });
    },
  },
  {
    id: 'e',
    key: 'wall',
    name: 'Wall-run',
    icon: ICON.wall,
    color: '#c98a4a',
    big: true,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const len = Math.round(110 + 40 * dens(o));
      const up = rng() < 0.6;
      const s = k.wallRun(len, up ? { rise: range(rng, 20, 34), bank: m * side(rng) * 35, turn: turnOf(rng, m, 0.5) } : { bank: m * side(rng) * 55, turn: turnOf(rng, m, 0.6) });
      k.fish(s + 12, 0, 8, 3, 'wave', { amp: 2 }).yarn(s + len - 20, 0);
      k.run(34, { bank: 0 });
    },
  },
  {
    id: 'f',
    key: 'dog',
    name: 'Dog chase',
    icon: ICON.dog,
    color: '#d9a066',
    big: true,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      const d = dens(o);
      lead(k, rng, m);
      const len = Math.round(280 + 120 * d);
      const s = k.run(len + 40, { turn: turnOf(rng, m), rise: range(rng, -8, 4) });
      k.dogChase(s + 12, len, m * side(rng));
      for (let at = s + 60; at < s + len - 20; at += range(rng, 60, 80)) {
        if (rng() < 0.6) k.log(at);
        else k.branch(at);
        k.fish(at + 16, 0, 6, 3);
      }
    },
  },
  {
    id: 'g',
    key: 'yarn',
    name: 'Yarn chase',
    icon: ICON.yarn,
    color: '#ff4f7b',
    big: true,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const len = Math.round(300 + 100 * dens(o));
      const s = k.run(len + 40, { rise: -range(rng, 10, 24), turn: turnOf(rng, m) });
      k.yarnChase(s + 14, len);
      for (let at = s + 70; at < s + len - 20; at += range(rng, 90, 120)) k.log(at).fish(at + 14, 0, 6, 3);
    },
  },
  {
    id: 'h',
    key: 'cloud',
    name: 'Puff cloud',
    icon: ICON.cloud,
    color: '#f4e9ff',
    big: true,
    themes: ['gorge', 'sunset'],
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      // the lead-in fills the PUFF meter (yarn and treats); the cloud comes either way (auto-summon at the rim)
      const s = k.run(110, { turn: m * range(rng, -20, 20) });
      k.yarn(s + 14, -m * 2).yarn(s + 34, m * 2).treat(s + 54, 0).yarn(s + 74, -m * 2).treat(s + 94, m * 2);
      const len = lerpN(200, 300, dens(o));
      const c = k.cloudRide(42, len, 34, { turn: m * range(rng, 20, 45) });
      const air = CLOUD_H + 0.8;
      for (let i = 0; c + 30 + i * 46 < c + len - 24; i++) k.ring(c + 30 + i * 46, m * ((i % 3) - 1) * 2.4, CLOUD_H + 1.3 + (i % 2) * 0.6);
      k.fish(c + 50, -m * 2, 6, 3, 'line', { y: air }).fish(c + 140, 0, 8, 3, 'arc', { y: air, h: 1.6 });
    },
  },
  {
    id: 'i',
    key: 'bridge',
    name: 'Rope bridge',
    icon: ICON.bridge,
    color: '#9c6b3e',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const len = lerpN(60, 90, dens(o));
      const s = k.run(len, { kind: 'bridge', width: 6 });
      if (o.hard) k.fish(s + 6, 0, 6, 4).log(s + 44).fish(s + 37, 0, 6, 2.5, 'arc', { h: 2 });
      else k.fish(s + 6, 0, Math.floor((len - 12) / 4), 4);
      const e = k.run(30, { width: 9 });
      k.treat(e + 16, m * 1.6);
    },
  },
  {
    id: 'j',
    key: 'sbend',
    name: 'S-bend',
    icon: ICON.sbend,
    color: '#e6b85c',
    big: false,
    build(k, rng, o) {
      const m = o.mirror ? -1 : 1;
      lead(k, rng, m);
      const a = range(rng, 45, 70);
      const s = k.run(90, { turn: m * a });
      k.fish(s + 8, m * 1.8, 6, 3);
      const s2 = k.run(100, { turn: -m * a });
      k.fish(s2 + 8, -m * 1.8, 6, 3);
      if (o.hard) k.rock(s + 62, -m * 2.2).rock(s2 + 62, m * 2.2);
      k.yarn(s2 + 84, 0);
    },
  },
];

const BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
const BY_KEY = new Map(BLOCKS.map((b) => [b.key, b]));
export const blockById = (id: string): BlockDef | undefined => BY_ID.get(id);
export const blockByKey = (key: string): BlockDef | undefined => BY_KEY.get(key);
/** blocks the Trail Maker offers in a theme */
export const blocksFor = (theme: ThemeId): BlockDef[] => BLOCKS.filter((b) => !b.themes || b.themes.includes(theme));
export const blockAllowed = (b: BlockDef, theme: ThemeId): boolean => !b.themes || b.themes.includes(theme);
