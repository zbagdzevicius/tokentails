/**
 * Domino: Starry dalmatian: black spots joined by star lines. Timbre: marimba boop (short sine).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: a marimba boop on every Q (E5); Splatter swaps it for the ink splat (dominoSplat) and Big Shake for the
 * brr-rattle (dominoShake) on top of their nature layers; every CONNECT THE DOTS! hit rings a high marimba star over
 * the arcane impact; Spot Shot carries the projectile travel whoosh. Basic voice dominoBoop, ult voice dominoDraw
 * (IDENTITY.domino.voice).
 * Look: ink-black spots joined by starlight: each spot with a lilac star twinkling on the line to the next one. Big
 * Shake flings the spots out in a ring; Spot On sticks one spot with a star glint.
 */
import type { SkillKey } from '../../data/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers here: this file stays free of render imports). */
const FADE_HOLD = 2;
const FADE_TWINKLE = 3;

const AT = { x: 0, y: 0, z: 0 };
const ONE = { shape: 0, color: 0, size0: 0.3, size1: 0.26, life: 0.6, alpha: 1, additive: false, intensity: 1, fade: FADE_HOLD, grow: 0, rot: 0, spin: 0, vx: 0, vy: 0, vz: 0 };
const SX = new Float32Array(8);
const SZ = new Float32Array(8);
let seed = 0x7d0e;
/** Render-side variety in [0, 1) (an LCG; never the sim RNG). */
function vary(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

/** Spots (about 60%, ink, normal blend so they stay black) and lilac stars on the lines between them. */
export function paintDomino(p: MotifPainter, pos: P3, n: number, _dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  if (n <= 0) return true;
  const spots = Math.min(8, Math.max(1, Math.ceil(n * 0.6)));
  const stars = n - spots;
  const shake = skill === 'e';
  const a0 = vary() * Math.PI * 2;
  ONE.shape = p.shape.SOFT;
  ONE.color = p.colors.primary;
  ONE.additive = false;
  ONE.intensity = 1;
  ONE.fade = FADE_HOLD;
  for (let i = 0; i < spots; i++) {
    const a = a0 + (i / spots) * Math.PI * 2;
    const r = spots === 1 ? 0 : 0.3 + 0.25 * vary();
    SX[i] = pos.x + Math.cos(a) * r;
    SZ[i] = pos.z - Math.sin(a) * r;
    AT.x = SX[i];
    AT.y = pos.y + 0.6 + 0.2 * vary();
    AT.z = SZ[i];
    // Big Shake: the spots fly off him in a ring; otherwise they hang and drift a little
    const sp = shake ? 3.2 : 0.4;
    ONE.vx = Math.cos(a) * sp;
    ONE.vy = shake ? 1.2 : 0.3;
    ONE.vz = -Math.sin(a) * sp;
    ONE.size0 = 0.24 + 0.1 * vary();
    ONE.size1 = ONE.size0 * 0.9;
    ONE.life = shake ? 0.45 : 0.65;
    p.single(AT, ONE);
  }
  // the star lines: a twinkling star halfway between each spot and the next
  ONE.shape = p.shape.STAR4;
  ONE.color = p.colors.secondary;
  ONE.additive = true;
  ONE.intensity = 1.5;
  ONE.fade = FADE_TWINKLE;
  ONE.vx = ONE.vz = 0;
  ONE.vy = 0.2;
  for (let i = 0; i < stars; i++) {
    const a = i % spots;
    const b = (i + 1) % spots;
    AT.x = (SX[a] + SX[b]) * 0.5;
    AT.y = pos.y + 0.75;
    AT.z = (SZ[a] + SZ[b]) * 0.5;
    ONE.size0 = 0.22;
    ONE.size1 = 0.1;
    ONE.life = 0.5;
    ONE.rot = vary();
    p.single(AT, ONE);
  }
  ONE.rot = 0;
  return true;
}

export const domino: ChampAudio = {
  hero: 'domino',
  // marimba boop: a short sine at E5 with a wooden decay (≈0.19 s)
  motif: [0.28, 0, 659, 0.003, 0.02, 0.14, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.03, 0, 0],
  // Spot Shot E5; Spot On's glint up a fifth
  motifRate: { q: 1, w: 1.33, e: 0.75, passive: 1.5 },
  sounds: {
    // a high marimba star on each CONNECT THE DOTS! link
    star: [0.22, 0, 1319, 0.002, 0.02, 0.16, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.03, 0, 0],
  },
  skills: {
    w: { cast: { sound: 'dominoSplat', vol: 0.3 } },
    e: { cast: { sound: 'dominoShake', vol: 0.3 } },
    r: { impact: { sound: 'star', vol: 0.24 } },
  },
  // skillfx/domino.ts draws the spots on every cast itself (identity()), so the owned-cast burst is off
  fx: { motifCount: 6, ownedMotif: false, paint: paintDomino },
};
