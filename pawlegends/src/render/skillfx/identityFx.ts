/**
 * Shared champion-identity helpers for the hero skill FX scripts (docs/plans/moba/CHAMP-IDENTITY.md §1–§5), so the 20
 * scripts stop copying them: the identity mix relation of a viewer relation, a champion's own sound through the mix,
 * the "gold stays you" colour rule, and the skill's nature accent plus the hero's motif drawn through the fun sticker
 * pool. Render and audio only; never feeds the sim. Nothing allocates per call.
 */
import { CHAMP_AUDIO } from '../../audio/champ';
import type { MotifPainter } from '../../audio/champ/types';
import { mixPriority, type MixLayer, type MixRelation } from '../../audio/identityMix';
import { sfx } from '../../audio/sfx';
import { champSound } from '../../audio/skillSfx';
import type { HeroId } from '../../data/heroes/types';
import { IDENTITY, type SkillKey } from '../identity';
import type { FxCtx, Relation3 } from '../anim/types';
import { NATURE_FX, motifColors } from '../fx/natureFx';
import { FADE, SHAPE } from '../fx/Particles.js';
import { funCount, funPool } from '../fx/fun/funKit';

/** The identity mix relation of a viewer relation. */
export const MIX_REL: Readonly<Record<Relation3, MixRelation>> = Object.freeze({ own: 'mine', ally: 'ally', enemy: 'enemy' });

/** The identity mix relation of hero `id` to the player. */
export const mixRel = (fx: FxCtx, id: number): MixRelation => MIX_REL[fx.relation(id)] ?? 'enemy';

/**
 * One of a champion's own sounds (`c:<hero>:<name>`, audio/champ/<hero>.ts `sounds`) through the identity mix, on the
 * motif layer by default. A no-op before the audio unlock. Returns whether it played.
 */
export function champLayer(hero: HeroId, name: string, relation: MixRelation, at?: { x: number; z: number }, rate = 1, layer: MixLayer = 'motif', skill: SkillKey = 'basic'): boolean {
  try {
    return sfx.playLayer({ name: champSound(hero, name), layer, hero, nature: IDENTITY[hero].skills[skill].nature, priority: mixPriority({ relation }), relation, rate, at });
  } catch {
    return false; // audio not unlocked yet (tests, before the first gesture)
  }
}

export { ENEMY_PAIR, motifColors, paleGold } from '../fx/natureFx';

// ------------------------------------------------------------------------------------------------ nature accent + motif

type Pool = Pick<MotifPainter, 'burst' | 'single' | 'ring'>;
let pool: Pool | null = null;
const SH = SHAPE as unknown as Readonly<Record<string, number>>;
/** The fun sticker pool as the champion motif painter (audio/champ/<hero>.ts paint draws through it). */
const PAINTER: MotifPainter & { colors: { primary: number; secondary: number } } = {
  burst: (pos, o) => pool?.burst(pos, o),
  single: (pos, o) => pool?.single(pos, o),
  ring: (pos, o) => pool?.ring(pos, o),
  shape: SH,
  colors: { primary: 0xffffff, secondary: 0xffffff },
};
const IAT = { x: 0, y: 0, z: 0 };
const IDIR = { x: 0, z: 0 };
const IDIR3 = { x: 0, y: 0, z: 0 };
const NB = { n: 1, exact: true, shape: 0, color: 0, additive: false, intensity: 1, size: [0.1, 0.2] as readonly number[], life: [0.3, 0.5] as readonly number[], speed: [1, 2] as readonly number[], gravity: 0, up: 0, dir: undefined as typeof IDIR3 | undefined, spread: Math.PI, stretch: 1, drag: 1, flat: false, fade: 0 as number, r0: 0.5, sizeEnd: 1 };
const NS = { shape: 0, color: 0, size0: 0.4, size1: 1.6, life: 0.3, alpha: 0.7, intensity: 1.4, additive: true };

/** The skill's nature accent at IAT (NATURE_FX: its shape, colour and motion), about half a cast's worth of particles. */
function natureAccent(fx: FxCtx, hero: HeroId, skill: SkillKey, has: boolean): void {
  const s = NATURE_FX[IDENTITY[hero].skills[skill].nature];
  const p = pool!;
  const o = NB;
  o.n = funCount(fx, Math.max(2, Math.round(s.count.cast * 0.5)));
  o.shape = SH[s.shape];
  o.color = s.color;
  o.additive = s.additive;
  o.intensity = s.additive ? 1.4 : 1;
  o.size = s.size;
  o.life = s.life;
  o.speed = s.speed;
  o.gravity = s.gravity;
  o.up = 0.6;
  o.dir = undefined;
  o.spread = Math.PI;
  o.stretch = 1;
  o.drag = 1;
  o.flat = false;
  o.fade = FADE.TWINKLE;
  switch (s.motion) {
    case 'slam':
    case 'dome':
    case 'implode':
    case 'twinkle':
      o.r0 = s.motion === 'implode' ? 1.4 : 0.6;
      o.up = s.motion === 'dome' ? 1.6 : 0.4;
      o.sizeEnd = s.motion === 'slam' ? 2 : 0.7;
      p.ring(IAT, o);
      return;
    case 'ripple':
      NS.shape = SH.RING;
      NS.color = s.color;
      for (let i = 0; i < 2; i++) {
        NS.size0 = 0.4 + i * 0.5;
        NS.size1 = 1.6 + i * 0.9;
        NS.life = 0.3 + i * 0.06;
        NS.alpha = 0.75 - i * 0.15;
        p.single(IAT, NS);
      }
      return;
    case 'sweep':
    case 'bolt':
    case 'streak':
      if (has) {
        o.dir = IDIR3;
        o.spread = 0.6;
      }
      o.stretch = 2.5;
      o.drag = 4;
      break;
    case 'rise':
    case 'pillar':
      o.up = 2.5;
      break;
    case 'arc':
      o.up = 3;
      break;
    case 'trail':
      o.flat = true;
      o.up = 0.4;
      break;
    default:
  }
  p.burst(IAT, o);
}

/**
 * Champion identity at (x, y, z): the skill's nature accent and the hero's motif in its colour pair (gold-family colours
 * pale when caster `src` is an enemy; `src` null: never paled), `n` motif particles (the tier halves it), along (dx, dz)
 * when given. `nature` false: the motif alone. A no-op without the fun pool (unit stubs).
 */
export function drawIdentity(fx: FxCtx, hero: HeroId, src: number | null, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void {
  const p = funPool(fx) as unknown as Partial<Pool> | null;
  if (!p || typeof p.burst !== 'function') return;
  pool = p as Pool;
  motifColors(hero, src !== null && fx.relation(src) === 'enemy', PAINTER.colors);
  const has = dx !== 0 || dz !== 0;
  IAT.x = x;
  IAT.y = y;
  IAT.z = z;
  IDIR.x = IDIR3.x = dx;
  IDIR.z = IDIR3.z = dz;
  if (nature) natureAccent(fx, hero, skill, has);
  CHAMP_AUDIO[hero].fx?.paint?.(PAINTER, IAT, funCount(fx, n), has ? IDIR : null, skill);
}
