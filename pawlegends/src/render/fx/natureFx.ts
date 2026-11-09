/**
 * Skill VFX by nature and champion (docs/plans/moba/CHAMP-IDENTITY.md §1–§3, §5): the NATURE effect (what the skill
 * does: embers rise for fire, shards fall for frost, smoke implodes for shadow) and the CHAMPION motif on top (whose it
 * is: sun rays, frisbees, ink spots... in the hero's colour pair). Pooled particles and shockwaves only (one small
 * option object per call, no meshes), under a per-0.1 s particle budget that the quality tier and reduce-motion set. Per-hero motif painters
 * live in audio/champ/<hero>.ts (`fx`). Render only; never feeds the sim.
 */
import type { HeroId } from '../../data/heroes/types';
import { IDENTITY, NATURES, type Nature, type ParticleShape, type SkillKey } from '../../data/identity';
import { CHAMP_AUDIO } from '../../audio/champ';
import type { MotifPainter, P3, SkillPhase } from '../../audio/champ/types';
import { skillKey } from '../../audio/skillSfx';
import type { QualityTier } from '../quality';
import { FADE, SHAPE, type Particles } from './Particles.js';
import type { Shockwaves } from './Shockwaves.js';
import { REDUCED_COUNT } from './vfxPrefs';

/** How a nature's particles move (one painter per motion). */
export type NatureMotion = 'sweep' | 'slam' | 'streak' | 'rise' | 'spray' | 'arc' | 'twinkle' | 'implode' | 'bolt' | 'ripple' | 'spiral' | 'dome' | 'trail' | 'pillar';

export interface NatureFxSpec {
  motion: NatureMotion;
  shape: ParticleShape;
  /** Nature tint (the hero's colours ride on the motif, the nature keeps its own read). */
  color: number;
  additive: boolean;
  /** Particles on the cast and on each impact (before the tier's count scale). */
  count: { cast: number; impact: number };
  life: readonly [number, number];
  speed: readonly [number, number];
  size: readonly [number, number];
  gravity: number;
  /** A ground shockwave ring on the cast (radius m, 0 = none). */
  ring: number;
}

/** The 14 natures' VFX grammar (identity.ts NATURE[*].vfx, as numbers). */
export const NATURE_FX: Readonly<Record<Nature, Readonly<NatureFxSpec>>> = Object.freeze({
  slash: { motion: 'sweep', shape: 'SPARK', color: 0xfff2d8, additive: true, count: { cast: 10, impact: 5 }, life: [0.16, 0.26], speed: [5, 8], size: [0.1, 0.18], gravity: 4, ring: 0 },
  impact: { motion: 'slam', shape: 'PUFF', color: 0xf3e2c4, additive: false, count: { cast: 12, impact: 8 }, life: [0.4, 0.6], speed: [2, 4], size: [0.3, 0.45], gravity: 0, ring: 2.4 },
  projectile: { motion: 'streak', shape: 'SOFT', color: 0xffffff, additive: true, count: { cast: 6, impact: 7 }, life: [0.15, 0.25], speed: [3, 5], size: [0.15, 0.3], gravity: 0, ring: 0 },
  fire: { motion: 'rise', shape: 'SPARK', color: 0xff8a3a, additive: true, count: { cast: 12, impact: 8 }, life: [0.45, 0.7], speed: [0.6, 1.6], size: [0.08, 0.16], gravity: -3, ring: 0 },
  frost: { motion: 'spray', shape: 'SHARD', color: 0xbfefff, additive: false, count: { cast: 12, impact: 8 }, life: [0.5, 0.8], speed: [2, 4], size: [0.08, 0.16], gravity: 3, ring: 1.6 },
  splash: { motion: 'arc', shape: 'DROPLET', color: 0x7fd4ff, additive: false, count: { cast: 12, impact: 8 }, life: [0.35, 0.55], speed: [2.5, 4], size: [0.12, 0.2], gravity: 12, ring: 0 },
  arcane: { motion: 'twinkle', shape: 'STAR4', color: 0xe6d4ff, additive: true, count: { cast: 10, impact: 8 }, life: [0.4, 0.6], speed: [0.8, 1.8], size: [0.14, 0.26], gravity: 0, ring: 0 },
  shadow: { motion: 'implode', shape: 'SOFT', color: 0x3a3048, additive: false, count: { cast: 12, impact: 8 }, life: [0.3, 0.4], speed: [-4, -2.5], size: [0.35, 0.55], gravity: 0, ring: 0 },
  electric: { motion: 'bolt', shape: 'SPARK', color: 0xcfe8ff, additive: true, count: { cast: 10, impact: 8 }, life: [0.1, 0.22], speed: [3, 7], size: [0.08, 0.14], gravity: 0, ring: 0 },
  sonic: { motion: 'ripple', shape: 'RING', color: 0xfff4dc, additive: true, count: { cast: 3, impact: 2 }, life: [0.35, 0.45], speed: [0, 0], size: [0.6, 0.9], gravity: 0, ring: 2.2 },
  heal: { motion: 'spiral', shape: 'PLUS', color: 0x9dffb0, additive: true, count: { cast: 8, impact: 6 }, life: [0.7, 0.9], speed: [0.3, 0.8], size: [0.16, 0.26], gravity: -1.5, ring: 0 },
  guard: { motion: 'dome', shape: 'SHARD', color: 0xdfe8ff, additive: true, count: { cast: 14, impact: 6 }, life: [0.4, 0.6], speed: [0.2, 0.5], size: [0.12, 0.2], gravity: -2, ring: 1.4 },
  mobility: { motion: 'trail', shape: 'PUFF', color: 0xfff4e0, additive: false, count: { cast: 10, impact: 6 }, life: [0.3, 0.45], speed: [0.2, 0.8], size: [0.3, 0.45], gravity: 0, ring: 0 },
  empower: { motion: 'pillar', shape: 'STAR4', color: 0xfff0b0, additive: true, count: { cast: 12, impact: 4 }, life: [0.5, 0.7], speed: [0.2, 0.6], size: [0.14, 0.24], gravity: -4, ring: 0 },
});

/** Identity particles allowed per 0.1 s window, by tier (reduce motion × REDUCED_COUNT). */
export const NATURE_FX_BUDGET: Readonly<Record<QualityTier, number>> = Object.freeze({ low: 36, med: 72, high: 110 });

/** Default motif particles per cast. */
export const MOTIF_COUNT = 6;

export interface SkillFxOpts {
  /** Area radius (m) for ring/slam/dome natures; length (m) for streak/trail/sweep. */
  radius?: number;
  length?: number;
  /** Scale (rank growth). */
  scale?: number;
  /** Skip the motif (the hero's own script draws its signature). */
  noMotif?: boolean;
}

const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };

export class NatureFx {
  private budget = NATURE_FX_BUDGET.med;
  private left = NATURE_FX_BUDGET.med;
  private win = -1;
  private time = 0;
  /** Particles requested so far (tests). */
  spent = 0;
  private readonly painter: MotifPainter & { colors: { primary: number; secondary: number } };

  constructor(
    private readonly particles: Particles,
    private readonly shock: Shockwaves | null,
  ) {
    const p = particles;
    this.painter = {
      burst: (pos, o) => p.burst(pos, o),
      single: (pos, o) => p.single(pos, o),
      ring: (pos, o) => p.ring(pos, o),
      shape: SHAPE as unknown as Record<string, number>,
      colors: { primary: 0xffffff, secondary: 0xffffff },
    };
  }

  setTier(t: QualityTier, reduced: boolean): void {
    this.budget = Math.round(NATURE_FX_BUDGET[t] * (reduced ? REDUCED_COUNT : 1));
  }

  tick(dt: number): void {
    this.time += dt;
  }

  /** Take up to `n` particles from this window's budget (0 when spent). */
  private take(n: number): number {
    const w = Math.floor(this.time * 10);
    if (w !== this.win) (this.win = w), (this.left = this.budget);
    const k = Math.max(0, Math.min(n, this.left));
    this.left -= k;
    this.spent += k;
    return k;
  }

  /**
   * A skill's nature effect plus the hero's motif. `phase` cast (at the caster or the aim point) or impact (on the
   * target); `dir` the flat aim direction (x, z), null for none.
   */
  skillFx(hero: HeroId, skill: SkillKey | number, phase: SkillPhase, pos: P3, dir: { x: number; z: number } | null = null, o: SkillFxOpts = {}): void {
    const key = skillKey(skill);
    const nature = IDENTITY[hero].skills[key].nature;
    const spec = NATURE_FX[nature];
    const S = o.scale ?? 1;
    const n = this.take(Math.round((phase === 'cast' ? spec.count.cast : spec.count.impact) * S));
    if (n > 0) this.paintNature(spec, phase, pos, dir, n, o.radius ?? spec.ring * S, o.length ?? 3 * S, S);
    if (!o.noMotif) this.motifBurst(hero, pos, Math.round((CHAMP_AUDIO[hero].fx?.motifCount ?? MOTIF_COUNT) * (phase === 'cast' ? 1 : 0.5)), dir, key);
  }

  /** The hero's motif (IDENTITY motif shape, or the champion's own painter) in its colour pair. */
  motifBurst(hero: HeroId, pos: P3, n: number, dir: { x: number; z: number } | null = null, skill: SkillKey = 'basic'): void {
    const k = this.take(n);
    if (k <= 0) return;
    const id = IDENTITY[hero];
    this.painter.colors.primary = id.colors.primary;
    this.painter.colors.secondary = id.colors.secondary;
    if (CHAMP_AUDIO[hero].fx?.paint?.(this.painter, pos, k, dir, skill)) return;
    const shape = SHAPE[id.motif.shape];
    const half = Math.max(1, k >> 1);
    _a.x = pos.x;
    _a.y = pos.y + 0.6;
    _a.z = pos.z;
    // normal blending: dark colour pairs (Domino's ink, Cacklejaw's dusk) stay visible
    this.particles.burst(_a, { n: half, exact: true, shape, color: id.colors.primary, size: [0.22, 0.32], life: [0.5, 0.75], speed: [1.2, 2.4], up: 1.4, gravity: 2.5, spin: 3, fade: FADE.HOLD });
    if (k - half > 0)
      this.particles.burst(_a, { n: k - half, exact: true, additive: true, shape, color: id.colors.secondary, intensity: 1.3, size: [0.14, 0.22], life: [0.4, 0.6], speed: [1.6, 2.8], up: 1.2, gravity: 2, spin: 4, fade: FADE.TWINKLE });
  }

  private paintNature(s: NatureFxSpec, phase: SkillPhase, pos: P3, dir: { x: number; z: number } | null, n: number, radius: number, length: number, S: number): void {
    const P = this.particles;
    const shape = SHAPE[s.shape];
    const base = { n, exact: true, shape, color: s.color, additive: s.additive, intensity: s.additive ? 1.5 : 1, size: [s.size[0] * S, s.size[1] * S], life: s.life, speed: s.speed, gravity: s.gravity };
    const dl = dir ? Math.hypot(dir.x, dir.z) || 1 : 1;
    const dx = dir ? dir.x / dl : 0;
    const dz = dir ? dir.z / dl : 0;
    _a.x = pos.x;
    _a.y = pos.y;
    _a.z = pos.z;
    const ringOn = phase === 'cast' && radius > 0 && this.shock;
    switch (s.motion) {
      case 'sweep':
        _dir.x = dx;
        _dir.y = 0.15;
        _dir.z = dz;
        P.burst(_a, { ...base, dir: dir ? _dir : undefined, spread: dir ? 0.7 : Math.PI, stretch: 3, drag: 3 });
        break;
      case 'slam':
        P.ring(_a, { ...base, r0: 0.3, up: 0.5, sizeEnd: 2.2, drag: 3.2, fade: FADE.HOLD, floor: true });
        if (ringOn) this.shock!.start(_a, { r1: radius, dur: 0.25, color: '#F3E2C4', height: 0.4 });
        break;
      case 'streak':
        if (phase === 'cast' && dir) {
          for (let i = 0; i < n; i++) {
            const t = (i + 1) / n;
            _b.x = pos.x + dx * length * t;
            _b.y = pos.y + 0.8;
            _b.z = pos.z + dz * length * t;
            P.single(_b, { shape, color: s.color, intensity: 2, size0: 0.5 * S, size1: 0.1, life: 0.18 + t * 0.12 });
          }
        } else P.burst(_a, { ...base, shape: SHAPE.STAR4, up: 0.8 });
        break;
      case 'rise':
        P.burst(_a, { ...base, up: 1.6, jitter: 0.5 * S, fade: FADE.TWINKLE, drag: 1 });
        break;
      case 'spray':
        P.burst(_a, { ...base, up: 2.4, spin: 6, fade: FADE.HOLD, floor: true, bounce: 0.2 });
        if (ringOn) this.shock!.start(_a, { r1: radius, dur: 0.4, color: '#BFEFFF', height: 0.15, intensity: 1 });
        break;
      case 'arc':
        P.burst(_a, { ...base, up: 3, floor: true, bounce: 0.35, fade: FADE.HOLD });
        break;
      case 'twinkle':
        P.ring(_a, { ...base, r0: 0.9 * S, up: 0.9, y: 0.8, sizeEnd: 0.6, drag: 1, fade: FADE.TWINKLE });
        break;
      case 'implode':
        P.ring(_a, { ...base, r0: 1.6 * S, up: 0.2, y: 0.6, sizeEnd: 0.3, drag: 0, fade: FADE.IN_OUT });
        break;
      case 'bolt':
        P.burst(_a, { ...base, stretch: 2.5, jitter: 0.3, drag: 6 });
        if (phase === 'cast' && dir && this.shock) {
          _dir.x = dx;
          _dir.y = 0;
          _dir.z = dz;
          this.shock.crack(_a, _dir, { length: Math.min(6, length), width: 0.5 });
        }
        break;
      case 'ripple':
        _b.x = pos.x;
        _b.y = pos.y + 0.9;
        _b.z = pos.z;
        for (let i = 0; i < n; i++) P.single(_b, { shape, color: s.color, intensity: 1.4, size0: (0.4 + i * 0.5) * S, size1: (1.6 + i * 0.9) * S, life: 0.3 + i * 0.06, alpha: 0.75 - i * 0.15 });
        if (ringOn) this.shock!.start(_a, { r1: radius, dur: 0.4, color: '#FFF4DC', height: 0.3, intensity: 1 });
        break;
      case 'spiral':
        P.burst(_a, { ...base, up: 1.6, jitter: 0.45, spin: 2, fade: FADE.IN_OUT });
        break;
      case 'dome':
        P.ring(_a, { ...base, r0: Math.max(0.6, radius * 0.7), up: 2, y: 0.2, sizeEnd: 0.8, drag: 2, fade: FADE.HOLD });
        if (ringOn) this.shock!.start(_a, { r1: radius, dur: 0.2, color: '#DFE8FF', height: 1.1, intensity: 1.2 });
        break;
      case 'trail':
        for (let i = 0; i < n; i++) {
          const t = i / Math.max(1, n - 1);
          _b.x = pos.x + dx * length * t;
          _b.y = pos.y + 0.3;
          _b.z = pos.z + dz * length * t;
          P.burst(_b, { ...base, n: 1, sizeEnd: 1.8, up: 0.5, drag: 2 });
        }
        break;
      case 'pillar':
        P.burst(_a, { ...base, up: 4, jitter: 0.35, spread: 0.3, dir: UP, fade: FADE.TWINKLE });
        break;
    }
  }
}

const UP = { x: 0, y: 1, z: 0 };

/** Every nature has a VFX spec (tests). */
export function natureFxComplete(): boolean {
  return NATURES.every((n) => !!NATURE_FX[n] && NATURE_FX[n].shape in SHAPE);
}
