/**
 * DEV ONLY (gallery): synthetic sim streams. Each scenario produces one Snapshot per tick (the hero, a training dummy,
 * bolts, zones) with the events of that tick, built from the real timings (render/anim/timing.ts): a basic combo at
 * the hero's period with the 8 t windup, windups, casts, dashes moving at 20 m/s for their travel ticks, skillshots
 * at their speed, zones arming, reactions, death and respawn, a mock fight. The gallery pushes these into a real
 * SnapBuffer and GameView, so clips bind through the same director code as a match (ANIM-SPEC §11).
 */
import type { HeroId } from '../data/heroes/types';
import { HEROES } from '../data/heroes';
import { PROJECTILE_KIND } from '../data/towers';
import { ZONE_KIND } from '../data/effects';
import type { EntitySnap, ProjectileSnap, SimEvent, Snapshot, ZoneSnap, CastSlot } from '../sim/api';
import { BASIC_WINDUP, BOLT_SPEED, DASH_SPEED, SIM_TIMING, travelTicks } from '../render/anim/timing';
import type { Slot } from '../render/anim/types';

export const ORIGIN = Object.freeze({ x: 36000, y: 30000 });
export const T0 = 12;
const ME = 0;
const DUMMY = 3;

interface Unit {
  id: number;
  hero: HeroId;
  team: 0 | 1;
  x: number;
  y: number;
  facing: number;
  state: EntitySnap['state'];
  buffs: number;
  hp: number;
}

interface Proj {
  index: number;
  owner: number;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  until: number;
}

export interface Scenario {
  name: string;
  /** The tick the scenario's key moment happens (the ruler marks it). */
  key: number;
  /** Anchor ticks for the ruler. */
  anchors: Record<string, number>;
  end: number;
  /** The snapshot for `tick` (call in tick order). */
  at(tick: number): Snapshot;
}

const facingTo = (dx: number, dy: number): number => (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 4096) + 4096) % 4096;

class Stream {
  readonly units: Unit[];
  readonly projs: Proj[] = [];
  readonly zones: ZoneSnap[] = [];
  readonly events = new Map<number, SimEvent[]>();
  readonly moves: ((tick: number) => void)[] = [];
  private nextProj = 0;

  constructor(hero: HeroId, vs: HeroId, gap: number) {
    this.units = [
      { id: ME, hero, team: 0, x: ORIGIN.x, y: ORIGIN.y, facing: 0, state: 'idle', buffs: 0, hp: 600 },
      { id: DUMMY, hero: vs, team: 1, x: ORIGIN.x + gap, y: ORIGIN.y, facing: 2048, state: 'idle', buffs: 0, hp: 900 },
    ];
  }

  ev(tick: number, e: SimEvent): void {
    const l = this.events.get(tick) ?? [];
    l.push(e);
    this.events.set(tick, l);
  }

  bolt(tick: number, owner: number, kind: number, tx: number, ty: number, speed: number, hitAmount: number, hitKind: 'basic' | 'ability', dst: number): number {
    const o = this.units[owner === ME ? 0 : 1];
    const d = Math.hypot(tx - o.x, ty - o.y);
    const n = Math.max(1, Math.ceil((d * 30) / speed));
    const p: Proj = { index: this.nextProj++ % 40, owner, kind, x: o.x, y: o.y, vx: ((tx - o.x) / d) * (speed / 30), vy: ((ty - o.y) / d) * (speed / 30), until: tick + n };
    this.moves.push((t) => {
      if (t === tick) this.projs.push(p);
      if (t > tick && t <= p.until) {
        p.x += p.vx;
        p.y += p.vy;
      }
      if (t === p.until) this.projs.splice(this.projs.indexOf(p), 1);
    });
    if (dst >= 0) this.ev(tick + n, { type: 'hit', tick: tick + n, src: owner, dst, amount: hitAmount, shielded: 0, kind: hitKind });
    return tick + n;
  }

  snapshot(tick: number): Snapshot {
    for (const m of this.moves) m(tick);
    const entities: EntitySnap[] = this.units.map((u) => ({
      id: u.id,
      kind: 'hero',
      team: u.team,
      slot: u.id,
      hero: u.hero,
      level: 6,
      x: Math.round(u.x),
      y: Math.round(u.y),
      hp: u.hp,
      maxHp: 900,
      shield: 0,
      state: u.state,
      facing: u.facing,
      buffs: u.buffs | (u.id !== ME ? DUMMY_BUFFS.bits : 0),
      resource: 0,
      // gallery query branch=1: the level-6 shape branch on the hero (Sage's lance, Brutus's Guard Post)
      branch: u.id === ME && DUMMY_BUFFS.branch ? true : undefined,
    }));
    if (DUMMY_BUFFS.shield > 0) for (const e of entities) if (e.id !== ME) e.shield = DUMMY_BUFFS.shield;
    const projectiles: ProjectileSnap[] = this.projs.map((p) => ({ index: p.index, team: p.owner === ME ? 0 : 1, owner: p.owner, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx, vy: p.vy, kind: p.kind }));
    return {
      team: 0,
      clock: { tick, seconds: Math.floor(tick / 30), phase: 'play', nextPhaseIn: 0 },
      score: { kills: [0, 0], towers: [0, 0] },
      entities,
      projectiles,
      zones: this.zones.map((z) => ({ ...z })),
      events: this.events.get(tick) ?? [],
    };
  }
}

const SLOT_INDEX: Readonly<Record<Slot, CastSlot>> = { q: 0, w: 1, e: 2, r: 3 };

/**
 * Gallery-wide extras (main.ts sets them from the query): BuffFlag bits and a shield on the dummy (Gabė's W shield
 * glow, a Feared charm target), and the level-6 branch flag on the hero.
 */
export const DUMMY_BUFFS = { bits: 0, shield: 0, branch: false };

/** The scenario list for a hero. */
export function scenarioNames(hero: HeroId): string[] {
  const out = ['basic', 'q', 'w', 'e', 'r'];
  if (SIM_TIMING[hero].slots.q.recasts > 0) out.push('q-recast');
  out.push('react-light', 'react-heavy', 'knock', 'death', 'respawn', 'fight');
  return out;
}

export function makeScenario(name: string, hero: HeroId, vs: HeroId): Scenario {
  const T = SIM_TIMING[hero];
  const ranged = T.ranged;
  const gap = ranged ? 5000 : 1500;
  const s = new Stream(hero, vs, gap);
  const me = s.units[0];
  const du = s.units[1];
  const anchors: Record<string, number> = {};
  let key = T0;
  let end = T0 + 60;
  const P = T.period;
  if (name === 'basic' || name === 'fight') {
    const swings = name === 'fight' ? 6 : 3;
    s.moves.push((t) => {
      me.state = t >= T0 && t < T0 + swings * P ? 'attacking' : 'idle';
      if (name === 'fight') du.state = t >= T0 + 4 && t < T0 + swings * P ? 'attacking' : 'idle';
    });
    for (let k = 0; k < swings; k++) {
      const c = T0 + BASIC_WINDUP + k * P;
      if (k === 0) anchors.contact = c;
      if (ranged) s.bolt(c, ME, PROJECTILE_KIND.hero, du.x, du.y, BOLT_SPEED, 60, 'basic', DUMMY);
      else s.ev(c, { type: 'hit', tick: c, src: ME, dst: DUMMY, amount: k === 3 ? 130 : 60, shielded: 0, kind: k === 3 ? 'ability' : 'basic' });
      if (name === 'fight') {
        const cb = T0 + 4 + BASIC_WINDUP + k * SIM_TIMING[vs].period;
        if (SIM_TIMING[vs].ranged) s.bolt(cb, DUMMY, PROJECTILE_KIND.hero, me.x, me.y, BOLT_SPEED, 55, 'basic', ME);
        else s.ev(cb, { type: 'hit', tick: cb, src: DUMMY, dst: ME, amount: 55, shielded: 0, kind: 'basic' });
      }
    }
    anchors.swingStart = T0;
    key = anchors.contact;
    end = T0 + swings * P + 24;
  } else if (name === 'q' || name === 'w' || name === 'e' || name === 'r' || name === 'q-recast') {
    const sl: Slot = name === 'q-recast' ? 'q' : (name as Slot);
    const st = T.slots[sl];
    const casts = name === 'q-recast' ? 1 + st.recasts : 1;
    let t = T0;
    for (let c = 0; c < casts; c++) {
      const away = hero === 'sage' && sl === 'e';
      const dash = st.dashMm;
      const aimX = dash > 0 ? me.x + (away ? -dash : dash) : sl === 'r' && hero === 'sage' ? me.x + 40000 : du.x;
      const aimY = du.y;
      if (st.windup > 0) {
        s.ev(t, { type: 'windup', tick: t, src: ME, slot: SLOT_INDEX[sl], x: aimX, y: aimY, ticks: st.windup });
        anchors.windupStart ??= t;
        t += st.windup;
      }
      const cast = t;
      anchors.cast ??= cast;
      s.ev(cast, { type: 'cast', tick: cast, src: ME, slot: SLOT_INDEX[sl], x: aimX, y: aimY, target: 0xff });
      if (dash > 0) {
        const n = travelTicks(dash, DASH_SPEED);
        const dir = away ? -1 : 1;
        const x0 = me.x;
        anchors.travelEnd ??= cast + n;
        s.moves.push((tt) => {
          if (tt > cast && tt <= cast + n) me.x = x0 + dir * Math.min(dash, ((tt - cast) * DASH_SPEED) / 30);
        });
        if (!away) s.ev(cast + n, { type: 'hit', tick: cast + n, src: ME, dst: DUMMY, amount: 90, shielded: 0, kind: 'ability' });
        // keep the dummy in front of the next dash
        s.moves.push((tt) => {
          if (tt === cast + n && !away) du.x = me.x + 1500;
        });
      } else if (st.arm > 0) {
        anchors.zoneArm ??= cast + st.arm;
        const z: ZoneSnap = { index: c, team: 0, owner: ME, x: du.x, y: du.y, radius: (HEROES[hero].abilities[sl].radius as number | undefined) ?? 2200, ttl: st.arm + Math.max(15, st.duration > 0 ? Math.min(st.duration, 90) : 15), kind: ZONE_KIND.burst, arm: st.arm };
        s.moves.push((tt) => {
          if (tt === cast) s.zones.push(z);
          if (tt > cast) {
            z.arm = Math.max(0, (z.arm ?? 0) - 1);
            z.ttl--;
            if (z.ttl <= 0) s.zones.splice(s.zones.indexOf(z), 1);
          }
        });
        s.ev(cast + st.arm, { type: 'hit', tick: cast + st.arm, src: ME, dst: DUMMY, amount: 70, shielded: 0, kind: 'ability' });
      } else if (st.projSpeed > 0) {
        const kind = hero === 'sage' ? (sl === 'r' ? PROJECTILE_KIND.moonshot : PROJECTILE_KIND.arrow) : hero === 'lambo' ? PROJECTILE_KIND.tuna : hero === 'bengas' ? PROJECTILE_KIND.toast : PROJECTILE_KIND.wave;
        anchors.hit ??= s.bolt(cast, ME, kind, du.x, du.y, st.projSpeed, 80, 'ability', DUMMY);
      } else {
        s.ev(cast, { type: 'hit', tick: cast, src: ME, dst: DUMMY, amount: 80, shielded: 0, kind: 'ability' });
      }
      if (st.duration > 0) anchors.stateEnd ??= cast + Math.min(st.duration, 120);
      key = anchors.cast;
      t = cast + (dash > 0 ? travelTicks(dash, DASH_SPEED) : 0) + 22;
    }
    end = Math.max(t + 20, (anchors.stateEnd ?? 0) + 10, (anchors.zoneArm ?? 0) + 25);
  } else if (name === 'react-light' || name === 'react-heavy' || name === 'knock') {
    const heavy = name !== 'react-light';
    for (let k = 0; k < 3; k++) {
      const c = T0 + 6 + k * 24;
      s.ev(c, { type: 'hit', tick: c, src: DUMMY, dst: ME, amount: heavy ? 140 : 60, shielded: 0, kind: heavy ? 'ability' : 'basic' });
      if (name === 'knock') {
        s.moves.push((tt) => {
          if (tt > c && tt <= c + 6) me.x -= 1500 / 6;
          if (tt === c + 20) me.x += 1500;
        });
      }
    }
    anchors.contact = T0 + 6;
    key = anchors.contact;
    end = T0 + 6 + 3 * 24 + 10;
  } else if (name === 'death') {
    s.ev(T0 + 6, { type: 'death', tick: T0 + 6, id: ME, killer: DUMMY });
    s.moves.push((tt) => {
      if (tt >= T0 + 6) me.state = 'dead';
    });
    anchors.contact = T0 + 6;
    key = T0 + 6;
    end = T0 + 6 + 75;
  } else if (name === 'respawn') {
    s.moves.push((tt) => {
      me.state = tt < T0 + 6 ? 'dead' : 'idle';
    });
    anchors.cast = T0 + 6;
    key = T0 + 6;
    end = T0 + 6 + 40;
  }
  me.facing = facingTo(du.x - me.x, du.y - me.y);
  du.facing = facingTo(me.x - du.x, me.y - du.y);
  return { name, key, anchors, end, at: (tick) => s.snapshot(tick) };
}
