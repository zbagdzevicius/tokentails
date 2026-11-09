/**
 * Sir Brutus: Sand knight: heraldic crest stamps and anvil clangs. Timbre: anvil and armour clank (metallic).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/W/E cast adds a short anvil ping (the motif: a ring-modulated sine, inharmonic like struck steel);
 * Shield Slam (Q) swaps it for a heavy anvil clang and Front Guard (W) for an armour "crest" clank, in place of the
 * stand-in thud / clang / fwoomp cues; the Pug Charge hit (E) rings the anvil on the victim (skillfx/brutus.ts);
 * Champion's Challenge is the two-note horn call (IDENTITY ult voice; the stand-in gong is gone).
 *
 * Look: a heraldic crest stamp: a steel ring with a sandstone star (the chevron stand-in) inside it that holds, with
 * a little sand kicked up. Colour pair #D6A36A sandstone / #C8CED6 steel.
 */
import type { SkillKey } from '../../data/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: this data file carries no render import). */
const FADE_HOLD = 2;
const FADE_POP = 1;

/** Brutus's own sounds, baked as `c:brutus:<name>`. */
export const BRUTUS_SOUNDS = Object.freeze({
  /** Shield Slam / the Pug Charge hit: a heavy anvil clang (tan wave, ring-modulated, a little crushed) (0.34 s). */
  anvil: [0.45, 0, 330, 0, 0.02, 0.3, 3, 1, 0, 0, 0, 0, 0, 0.3, 23, 0.1, 0, 0.5, 0.02, 0, 0],
  /** Front Guard / Honour: an armour clank that steps down (a crest stamped into steel) (0.17 s). */
  crest: [0.38, 0, 520, 0, 0.01, 0.15, 3, 1, 0, 0, -130, 0.03, 0, 0.2, 0, 0, 0, 0.6, 0.01, 0, -3000],
});

const _p: P3 = { x: 0, y: 0, z: 0 };

/** The crest stamp: a steel ring, a sandstone star inside it, and (budget allowing) sand kicked up round it. */
function paint(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  const { primary, secondary } = p.colors;
  const big = skill === 'w' || skill === 'r';
  _p.x = pos.x;
  _p.y = pos.y + (big ? 1.3 : 1.0);
  _p.z = pos.z;
  // the shield: steel rim, sandstone charge (normal blend so the sand reads on bright ground)
  p.single(_p, { shape: p.shape.RING, color: secondary, size0: big ? 0.9 : 0.55, size1: big ? 1.0 : 0.62, life: 0.55, fade: FADE_HOLD, intensity: 1.3 });
  p.single(_p, { shape: p.shape.STAR5, color: primary, size0: big ? 0.55 : 0.34, size1: big ? 0.6 : 0.36, life: 0.55, fade: FADE_HOLD, additive: false, spin: 0 });
  const k = n - 2;
  if (k > 0) {
    _p.y = pos.y + 0.2;
    p.burst(_p, { n: k, exact: true, shape: p.shape.PUFF, color: primary, additive: false, size: [0.2, 0.32], life: [0.35, 0.55], speed: [1.2, 2.2], up: 0.8, gravity: 2, fade: FADE_POP });
  }
  return true;
}

export const brutus: ChampAudio = {
  hero: 'brutus',
  /** The anvil ping: a struck-steel sine, ring-modulated (0.23 s). */
  motif: [0.26, 0, 990, 0, 0.01, 0.2, 0, 1, 0, 0, 0, 0, 0, 0, 37, 0, 0, 0.5, 0.01, 0, 0],
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 0.9 },
  sounds: BRUTUS_SOUNDS,
  skills: {
    q: { cast: { sound: 'anvil', vol: 0.3 } },
    w: { cast: { sound: 'crest', vol: 0.3 } },
  },
  fx: { motifCount: 6, paint },
};
