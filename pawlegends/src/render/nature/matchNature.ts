/**
 * Nature in a match (render/nature/natureDefs.ts): a carded hero gives off a few motes of its card's element from the
 * body (embers, frost shards, sparks, leaves, ...), as a TierFx extension (`addTierExt`), in its own lazy chunk.
 *
 * Caps, on top of tierFx.ts's (TierFx only calls an extension for a hero that may show cosmetics: Skin effects Off
 * hides all, Mine only hides the others', Low and team fights hide the others', a stealthed or dead hero shows
 * nothing, the 80 % particle-pool guard and COSMETIC_MAX):
 * - the player's own hero: at most MATCH_SELF_MAX live motes (MATCH_LOW_MAX on Low);
 * - another hero: Med / High only, at most MATCH_OTHER_MAX, and none under reduced motion;
 * - never a ground aura or a trail (gameplay signals, see the tierFx.ts header); yellow (Spark, Star) goes paler on
 *   anyone but the player's own hero, since gold means "you".
 * Pooled option objects, typed-array bookkeeping: nothing is allocated per frame. Cosmetic only, never sim input.
 */
import * as THREE from 'three';
import { ELEMENTS, type Element } from '../../meta/roster';
import { addTierExt, isGoldFamily, type FxHero, type TierFx } from '../skins/tierFx';
import { mixHex } from '../skins/classify';
import { reducedMotion } from '../fx/vfxPrefs';
import { MATCH_SELF_MAX, MATCH_SIZE, NATURE, NSHAPE, matchCap, type NatureDef } from './natureDefs';

const SLOTS = 16;

/**
 * In-match mote size (m). The match camera is far (a 1 m particle is ~25 px at 1280x720) and SOFT / PUFF fade from the
 * centre, so a soft 0.5 m mote is invisible on the bright map: in a match soft embers and grains become hard-edged
 * STAR4 sparks (MATCH_SHAPE), and every mote has a floor of 0.3–0.42 m (Shadow's puffs 0.6–0.8 m).
 */
export function matchSize(d: NatureDef): [number, number] {
  const puff = d.shape === NSHAPE.PUFF;
  const lo = puff ? 0.6 : 0.3;
  const hi = puff ? 0.8 : 0.42;
  return [Math.max(lo, d.size[0] * MATCH_SIZE), Math.max(hi, d.size[1] * MATCH_SIZE)];
}

/** The in-match shape: SOFT reads as nothing at match distance, so it becomes STAR4. */
export const matchShape = (shape: number): number => (shape === NSHAPE.SOFT ? NSHAPE.STAR4 : shape);

interface State {
  /** Next emit time per hero slot. */
  next: Float64Array;
  /** Live-mote expiry per slot, MATCH_SELF_MAX entries each. */
  live: Float64Array;
  /** Emit counter per slot (alternates the second shape). */
  n: Uint32Array;
}
const states = new WeakMap<TierFx, State>();

const at = new THREE.Vector3();
/** One pooled option object per element. */
const OPTS = Object.fromEntries(
  ELEMENTS.map((e) => {
    const d = NATURE[e];
    return [
      e,
      {
        // the daylight map washes additive motes out to white: in a match every mote is alpha-blended
        additive: false,
        n: 1,
        exact: true,
        flat: true,
        shape: matchShape(d.shape),
        color: d.primary,
        alpha: Math.min(0.85, d.alpha),
        intensity: 1,
        size: matchSize(d),
        sizeEnd: Math.max(0.6, d.sizeEnd),
        life: [d.life[0] * 0.8, d.life[1] * 0.8],
        speed: [0, d.drift * 0.6],
        up: d.rise * 0.8,
        gravity: d.gravity,
        spin: d.spin,
        stretch: d.stretch,
        fade: d.fade,
        jitter: 0,
      } as Record<string, unknown>,
    ];
  }),
) as Record<Element, Record<string, unknown>>;

let reduced = false;
/** Motes emitted since load (tests, the perf readout). */
export const natureStats = { emitted: 0 };

/** The mote colour: the element's, but never gold on another player's hero. */
export function moteColor(el: Element, self: boolean, accent: boolean): number {
  const d = NATURE[el];
  let c = accent ? d.secondary : d.primary;
  if (!self && isGoldFamily(c)) c = mixHex(c, 0xffffff, 0.7);
  return c;
}

/** Live motes of hero slot `k` at time `now`. */
function liveOf(s: State, k: number, now: number): number {
  let n = 0;
  const o = k * MATCH_SELF_MAX;
  for (let i = 0; i < MATCH_SELF_MAX; i++) if (s.live[o + i] > now) n++;
  return n;
}

/** One hero's Nature this frame (TierFx calls it once the hero may show cosmetics). */
export function natureMote(fx: TierFx, h: FxHero, _wasDead: boolean): void {
  const p = fx.particles;
  if (!p || h.dead || h.stealth) return;
  const cap = matchCap(h.self, fx.low, reduced);
  if (cap <= 0) return;
  let s = states.get(fx);
  if (!s) {
    s = { next: new Float64Array(SLOTS), live: new Float64Array(SLOTS * MATCH_SELF_MAX).fill(-1), n: new Uint32Array(SLOTS) };
    states.set(fx, s);
  }
  const k = h.id & (SLOTS - 1);
  const now = fx.time;
  if (now < s.next[k]) return;
  const d = NATURE[h.element];
  // a little irregular, so two heroes of one element never pulse in step
  s.next[k] = now + (1 / d.rateMatch) * (0.8 + Math.random() * 0.4);
  if (liveOf(s, k, now) >= cap || !fx.room()) return;
  const o = OPTS[h.element];
  const i = s.n[k]++;
  o.shape = matchShape(d.shape2 >= 0 && i % 3 === 2 ? d.shape2 : d.shape);
  o.color = moteColor(h.element, h.self, i % 2 === 1);
  const a = Math.random() * Math.PI * 2;
  // beside the body, not inside it (the depth test hides motes behind the hero)
  const r = 0.35 + Math.random() * 0.25;
  const y = d.from === 'high' ? 1.45 + Math.random() * 0.25 : 0.85 + Math.random() * 0.45;
  at.set(h.x + Math.cos(a) * r, y, h.z + Math.sin(a) * r);
  p.burst(at, o);
  const life = (d.life[1] as number) * 0.8;
  const base = k * MATCH_SELF_MAX;
  for (let j = 0; j < MATCH_SELF_MAX; j++) {
    if (s.live[base + j] <= now) {
      s.live[base + j] = now + life;
      break;
    }
  }
  fx.claim(1, life);
  natureStats.emitted++;
}

let remove: (() => void) | null = null;

/** Turn Nature on for this match (idempotent); `reduce` defaults to the OS reduced-motion setting. */
export function installNature(reduce: boolean = reducedMotion()): void {
  reduced = reduce;
  if (!remove) remove = addTierExt(natureMote);
}

/** Turn it off (tests). */
export function uninstallNature(): void {
  remove?.();
  remove = null;
}
