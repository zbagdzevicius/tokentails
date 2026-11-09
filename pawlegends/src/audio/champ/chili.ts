/**
 * Chili: Tiny rage: chili peppers and anger '!'. Timbre: high square yap.
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: a two-note square "yip-yip" on every Q/W/E (Zoomies higher, Purse Mode lower); Purse Mode's cast swaps the yip
 * for a handbag clasp snap on top of the guard shimmer. Each yap projectile keeps its own pitched chiliYap (skillfx),
 * BIG DOG's basics keep the big bark. Basic voice chiliYap, ult voice chiliBigBark (IDENTITY.chili.voice).
 * Look: little chili peppers (pepper-orange body, green stem) thrown out with an anger "!"; at 5 Rage the peppers sit
 * in a ring over his head (the pepper crown); Zoomies leaves them behind as afterimages.
 */
import type { SkillKey } from '../../render/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers here: this file stays free of render imports). */
const FADE_HOLD = 2;

const AT = { x: 0, y: 0, z: 0 };
const ONE = { shape: 0, color: 0, size0: 0.26, size1: 0.26, life: 0.55, alpha: 1, additive: false, fade: FADE_HOLD, grow: 0, rot: 0, spin: 0, vx: 0, vy: 0, vz: 0 };
let seed = 0x2c1b;
/** Render-side variety in [0, 1) (an LCG; never the sim RNG). */
function vary(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

/** One pepper at AT moving (vx, vy, vz): a pepper-orange body and its green stem. 2 particles. */
function pepper(p: MotifPainter, vx: number, vy: number, vz: number, rot: number, life: number): void {
  ONE.vx = vx;
  ONE.vy = vy;
  ONE.vz = vz;
  ONE.life = life;
  ONE.rot = rot;
  ONE.shape = p.shape.DROPLET;
  ONE.color = p.colors.primary;
  ONE.size0 = ONE.size1 = 0.28;
  p.single(AT, ONE);
  const y = AT.y;
  AT.y = y + 0.13;
  ONE.shape = p.shape.FEATHER;
  ONE.color = p.colors.secondary;
  ONE.size0 = ONE.size1 = 0.12;
  p.single(AT, ONE);
  AT.y = y;
}

/** Peppers (2 particles each) and one anger "!" when the count allows. */
export function paintChili(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  if (n <= 0) return true;
  const bang = n >= 3 || n === 1;
  const peppers = (n - (bang ? 1 : 0)) >> 1;
  const crown = skill === 'passive';
  for (let i = 0; i < peppers; i++) {
    const a = crown ? (i / peppers) * Math.PI * 2 : vary() * Math.PI * 2;
    if (crown) {
      // the pepper crown: a ring of peppers sitting over his head
      AT.x = pos.x + Math.cos(a) * 0.32;
      AT.y = pos.y + 0.7;
      AT.z = pos.z - Math.sin(a) * 0.32;
      pepper(p, 0, 0.1, 0, a, 0.7);
    } else if (skill === 'w' && dir) {
      // Zoomies: peppers left behind (afterimages drifting back along the run)
      AT.x = pos.x - dir.x * i * 0.35;
      AT.y = pos.y + 0.5;
      AT.z = pos.z - dir.z * i * 0.35;
      pepper(p, -dir.x * 0.6, 0.2, -dir.z * 0.6, 0.6, 0.4);
    } else {
      AT.x = pos.x;
      AT.y = pos.y + 0.6;
      AT.z = pos.z;
      const sp = 1.4 + vary() * 1.2;
      pepper(p, Math.cos(a) * sp, 1.2 + vary(), -Math.sin(a) * sp, a, 0.55);
    }
  }
  if (bang) {
    AT.x = pos.x + 0.2;
    AT.y = pos.y + (crown ? 1.05 : 1.0);
    AT.z = pos.z;
    ONE.vx = ONE.vz = 0;
    ONE.vy = 0.5;
    ONE.rot = 0.15;
    ONE.life = 0.5;
    ONE.shape = p.shape.EXCLAIM;
    ONE.color = p.colors.primary;
    ONE.size0 = ONE.size1 = 0.4;
    p.single(AT, ONE);
  }
  return true;
}

export const chili: ChampAudio = {
  hero: 'chili',
  // a two-note square yip (F6 up to A6, ≈0.08 s)
  motif: [0.24, 0, 1397, 0.002, 0.025, 0.04, 5, 1, 0, 0, 349, 0.03, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0],
  // Q as is, Zoomies higher, Purse Mode lower, Rage a little up
  motifRate: { q: 1, w: 1.19, e: 0.84, passive: 1.12 },
  sounds: {
    // Purse Mode: the handbag clasp snapping shut (a falling square click with a breath of noise)
    purseSnap: [0.3, 0, 1800, 0, 0.01, 0.06, 5, 1, -40, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0.01, 0, 0],
  },
  skills: {
    e: { cast: { sound: 'purseSnap', vol: 0.3 } },
  },
  // skillfx/chili.ts draws the peppers on every cast itself (identity()), so the owned-cast burst is off
  fx: { motifCount: 7, ownedMotif: false, paint: paintChili },
};
