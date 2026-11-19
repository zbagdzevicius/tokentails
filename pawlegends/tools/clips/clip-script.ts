/**
 * Scripted seats for clip takes (trailer 60, "The Understudy"). A take may name `script` rules for its piloted seats
 * (team 0's human slots: slot 0, or 0..2 with `variant: 'coop'`). Each tick a rule may replace that seat's pilot
 * commands with its own, the way a player's hands would: it only issues the game's normal commands (move, cast, fire),
 * so the sim, every other seat and every rule of the game stay untouched. Pure sim-side code: the Node scan and the
 * browser harness run the same rules on the same ticks, so a scripted take is as deterministic as any other.
 *
 * Behaviours (`do`):
 * - `encore`: hold R; when an enemy carries the cannon, shadow the carrier; the tick its firing windup starts within
 *   `radius` (default 4300 mm), bow (R). The charm lands inside the cannon's 23-tick windup, so the carrier fumbles.
 * - `stage`: cast W (Center Stage) at the caster's feet when any hero in `heroes` casts its ultimate within `near` mm
 *   (default 9000), and/or when `fight` and an enemy hero stands within `fight` mm.
 * - `cannon`: walk onto a cannon lying on the ground within `reach` mm (default 30000); carrying it, walk to the nearest
 *   enemy tower (or core) and fire from `fireAt` mm (default 14000); never cast R while carrying (his nap drops it).
 * - `zzz`: hold R; when an enemy carries the cannon within `range` mm (default 9000), sprint (R) through the carrier
 *   so the 11 m sprint ends just past it (cast from 6.5 to `range` mm, default 9500).
 * - `holdR`: never cast the ultimate (the pilot's R casts are dropped).
 * - `castR`: cast R at the nearest enemy hero within `range` mm when ready (an ultimate on demand for a showcase).
 * - `avoid`: keep off a cannon lying on the ground (step away inside `radius`, default 4000 mm), so a teammate takes it.
 * - `gag` (trailer Wild Rivals): hold ability `key` (the pilot never casts it, so it is ready) and cast it when `when`
 *   fires: `foes` (at least `foes` enemy heroes within `range`, default 1 and 6000 mm), `cast` (hero `hero` casts its
 *   `trigKey`, default 3, within `near` mm, default 12000; ally, enemy or the seat's own hero), `clip` (this seat's own clip event `clip`,
 *   e.g. 'flop'), or `hp` (own HP under `hpBp` / 10000 with an enemy hero within `range`). `delay` ticks after the
 *   trigger (default 0). `aim`: 'foe' (the nearest enemy hero in `range`, `hero` first; default), 'self' (own feet),
 *   'centre' (the centre of the enemy heroes in `range`). `chase`: an enemy hero to walk toward while the gag is
 *   ready and it is farther than `chaseR` mm (default 5000), so the pair meets. `still`: stand still while a delayed
 *   cast is due. With `when: 'foes'` and `hero`, that enemy hero must be among the foes in range.
 */
import { NO_TARGET, Op, type Command, type HeroId, type SimEvent } from '../../src/sim/api';
import type { MatchHandle } from '../../src/sim/state';
import { CANNON_STATE, G, Kind } from '../../src/sim/world';

export interface ScriptRule {
  slot: number;
  do: 'encore' | 'stage' | 'cannon' | 'zzz' | 'holdR' | 'castR' | 'avoid' | 'gag';
  /** gag: the ability (0 Q, 1 W, 2 E, 3 R) and its trigger (see the header). */
  key?: 0 | 1 | 2 | 3;
  when?: 'foes' | 'cast' | 'clip' | 'hp';
  foes?: number;
  hero?: HeroId;
  trigKey?: number;
  clip?: string;
  hpBp?: number;
  delay?: number;
  aim?: 'foe' | 'self' | 'centre';
  chase?: HeroId;
  chaseR?: number;
  /** gag: stand still between the trigger and the delayed cast. */
  still?: boolean;
  /** Only from this game second on (and before `until`). */
  from?: number;
  until?: number;
  radius?: number;
  near?: number;
  fight?: number;
  heroes?: HeroId[];
  reach?: number;
  fireAt?: number;
  range?: number;
}

const HZ = 30;
/** gag: armed triggers per match (rule index -> the tick the cast is due). Deterministic: the Node scan and the browser
 * run the same ticks from tick 0, so both arm the same triggers. */
const armed = new WeakMap<MatchHandle, Map<string, number>>();
const d2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;
const ready = (m: MatchHandle, s: number, k: number): boolean => m.world.cooldowns[s * 5 + k] === 0;
const cast = (k: 0 | 1 | 2 | 3, x: number, y: number, id = NO_TARGET): Command => ({ op: Op.Cast, slot: k, x: Math.round(x), y: Math.round(y), id });
const move = (x: number, y: number): Command => ({ op: Op.Move, x: Math.round(x), y: Math.round(y) });

/** Apply the rules of one seat; returns that seat's commands for this tick. */
export function scriptCommands(m: MatchHandle, picks: readonly HeroId[], rules: readonly ScriptRule[], slot: number, pilot: readonly Command[], lastEvents: readonly SimEvent[]): Command[] {
  const w = m.world;
  const tick = w.globals[G.Tick];
  const mine = rules.filter((r) => r.slot === slot && (r.from === undefined || tick >= r.from * HZ) && (r.until === undefined || tick < r.until * HZ));
  if (!mine.length || w.alive[slot] !== 1) return pilot.slice();
  const team = w.team[slot];
  const x = w.x[slot], y = w.y[slot];
  const carried = w.globals[G.CannonState] === CANNON_STATE.Carried;
  const ground = w.globals[G.CannonState] === CANNON_STATE.Ground;
  const by = w.globals[G.CannonBy];
  const enemyCarrier = carried && by >= 0 && w.team[by] !== team && w.alive[by] === 1 ? by : -1;
  const iCarry = carried && by === slot;
  const holdR = mine.some((r) => r.do === 'holdR' || r.do === 'encore' || r.do === 'zzz') || (iCarry && mine.some((r) => r.do === 'cannon'));
  const held = new Set<number>(mine.filter((r) => r.do === 'gag').map((r) => r.key ?? 3));
  let out: Command[] = (holdR ? pilot.filter((c) => !(c.op === Op.Cast && c.slot === 3)) : pilot.slice()).filter((c) => !(c.op === Op.Cast && held.has(c.slot as number)));
  const think = tick % 6 === slot % 6;
  for (const r of mine) {
    if (r.do === 'gag') {
      const k = r.key ?? 3;
      if (!ready(m, slot, k)) continue;
      const rg = r.range ?? 6000;
      const foes: number[] = [];
      for (let s = 0; s < picks.length; s++) if (w.team[s] !== team && w.alive[s] === 1 && d2(x, y, w.x[s], w.y[s]) <= rg * rg) foes.push(s);
      let st = armed.get(m);
      if (!st) armed.set(m, (st = new Map()));
      const id = `${slot}:${rules.indexOf(r)}`;
      let due = st.get(id);
      if (due === undefined) {
        let fire = false;
        const when = r.when ?? 'foes';
        if (when === 'foes') fire = foes.length >= (r.foes ?? 1) && (!r.hero || foes.some((f) => picks[f] === r.hero));
        else if (when === 'cast') fire = lastEvents.some((e) => e.type === 'cast' && (e.src !== slot || r.hero === picks[slot]) && e.slot === (r.trigKey ?? 3) && (!r.hero || picks[e.src] === r.hero) && d2(x, y, w.x[e.src], w.y[e.src]) <= (r.near ?? 12000) ** 2);
        else if (when === 'clip') fire = lastEvents.some((e) => e.type === 'clip' && e.id === slot && e.what === (r.clip ?? 'flop'));
        else if (when === 'hp') fire = foes.length > 0 && w.hp[slot] * 10000 < (r.hpBp ?? 3000) * w.maxHp[slot];
        if (fire) st.set(id, (due = tick + (r.delay ?? 0)));
      }
      if (due !== undefined && tick < due && r.still) return [move(x, y)];
      if (due !== undefined && tick >= due) {
        st.delete(id);
        const aim = r.aim ?? 'foe';
        if (aim === 'self') return [cast(k, x, y)];
        if (!foes.length) continue;
        if (aim === 'centre') {
          let cx = 0, cy = 0;
          for (const s of foes) (cx += w.x[s]), (cy += w.y[s]);
          return [cast(k, cx / foes.length, cy / foes.length)];
        }
        let best = foes.find((s) => r.hero && picks[s] === r.hero) ?? -1;
        if (best < 0) {
          let bd = Infinity;
          for (const s of foes) if (d2(x, y, w.x[s], w.y[s]) < bd) (bd = d2(x, y, w.x[s], w.y[s])), (best = s);
        }
        return [cast(k, w.x[best], w.y[best], best)];
      }
      if (r.chase && think) {
        const c = picks.findIndex((h, s) => h === r.chase && w.team[s] !== team && w.alive[s] === 1);
        const cr = r.chaseR ?? 5000;
        if (c >= 0 && d2(x, y, w.x[c], w.y[c]) > cr * cr && d2(x, y, w.x[c], w.y[c]) < 26000 * 26000) out = [move(w.x[c], w.y[c])];
      }
      continue;
    }
    if (r.do === 'encore' && enemyCarrier >= 0 && ready(m, slot, 3)) {
      const cx = w.x[enemyCarrier], cy = w.y[enemyCarrier];
      const dd = d2(x, y, cx, cy);
      const rad = r.radius ?? 4300;
      if (w.globals[G.CannonWind] > 0 && dd <= rad * rad) return [cast(3, x, y)];
      if (think && dd > 3200 * 3200) out = [move(cx, cy)];
    }
    if (r.do === 'zzz' && enemyCarrier >= 0 && ready(m, slot, 3)) {
      const cx = w.x[enemyCarrier], cy = w.y[enemyCarrier];
      const dd = d2(x, y, cx, cy);
      // the sprint always runs its full 11 m (Aim.Dir): from 6.5-9.5 m it ends 1.5-4.5 m past the carrier
      const rg = r.range ?? 9500;
      if (dd <= rg * rg && dd > 6500 * 6500) {
        const l = Math.sqrt(dd);
        const past = Math.min(11000, l + 3500);
        return [cast(3, x + ((cx - x) / l) * past, y + ((cy - y) / l) * past)];
      }
    }
    if (r.do === 'stage' && ready(m, slot, 1)) {
      const near = r.near ?? 9000;
      const ult = lastEvents.some((e) => e.type === 'cast' && e.slot === 3 && e.src !== slot && (!r.heroes || r.heroes.includes(picks[e.src])) && d2(x, y, w.x[e.src], w.y[e.src]) <= near * near);
      let foe = false;
      if (r.fight) for (let s = 0; s < picks.length; s++) if (w.team[s] !== team && w.alive[s] === 1 && d2(x, y, w.x[s], w.y[s]) <= r.fight * r.fight) foe = true;
      if (ult || foe) return [cast(1, x, y)];
    }
    if (r.do === 'avoid' && ground) {
      const gx = w.globals[G.CannonX], gy = w.globals[G.CannonY];
      const rad = r.radius ?? 4000;
      const dd = d2(x, y, gx, gy);
      if (dd < rad * rad) {
        const l = Math.max(1, Math.sqrt(dd));
        return [move(gx + ((x - gx) / l) * (rad + 1500), gy + ((y - gy) / l) * (rad + 1500))];
      }
    }
    if (r.do === 'castR' && ready(m, slot, 3)) {
      const rg = r.range ?? 6000;
      let best = -1, bd = rg * rg;
      for (let s = 0; s < picks.length; s++) if (w.team[s] !== team && w.alive[s] === 1 && d2(x, y, w.x[s], w.y[s]) <= bd) (best = s), (bd = d2(x, y, w.x[s], w.y[s]));
      if (best >= 0) return [cast(3, w.x[best], w.y[best], best)];
    }
    if (r.do === 'cannon') {
      if (iCarry) {
        if (w.globals[G.CannonWind] > 0) return [];
        let best = -1, bd = Infinity;
        for (let id = picks.length; id < w.kind.length; id++) {
          const k = w.kind[id];
          if ((k === Kind.Tower || k === Kind.Core) && w.alive[id] === 1 && w.hp[id] > 0 && w.team[id] !== team) {
            const dd = d2(x, y, w.x[id], w.y[id]);
            if (dd < bd) (bd = dd), (best = id);
          }
        }
        if (best >= 0) {
          const f = r.fireAt ?? 14000;
          if (bd <= f * f) return [{ op: Op.Fire, x: w.x[best], y: w.y[best] }];
          if (think) out = [move(w.x[best], w.y[best])];
        }
      } else if (ground) {
        const gx = w.globals[G.CannonX], gy = w.globals[G.CannonY];
        const rc = r.reach ?? 30000;
        if (d2(x, y, gx, gy) <= rc * rc && think) out = [move(gx, gy)];
      }
    }
  }
  return out;
}
