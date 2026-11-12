/**
 * Gabby: Wind angel: heart balloons and white feathers. Timbre: wind chimes (high glassy sine, echo).
 * Champion sound and motif layer (audio/champ/types.ts, CHAMP-IDENTITY.md §3).
 *
 * Sound: every Q/W/E cast rings a cluster of wind chimes (a high sine retriggered every 50 ms, with an echo), climbing
 * Q → W → E. The Heart Balloon pops with a glassy pop that jumps an octave, Wing Wrap closes with a soft feather
 * flutter, and each hero Under Her Spell charms rings a falling two-note chime. The ult and basic voices stay the
 * IDENTITY ones.
 * Look: pink hearts (normal blend, so they read on grass) with white feathers drifting down. Chase the Wind streams
 * mostly feathers along her path; Under Her Spell throws its hearts forward into the cone.
 */
import type { SkillKey } from '../../render/identity';
import type { ChampAudio, MotifPainter, P3 } from './types';

/** Particles.js FADE ids (numbers: audio/champ never imports three.js). */
const FADE_HOLD = 2;
const FADE_TWINKLE = 3;
const _p = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };

function paint(p: MotifPainter, pos: P3, n: number, dir: { x: number; z: number } | null, skill: SkillKey): boolean {
  _p.x = pos.x;
  _p.y = pos.y + 0.8;
  _p.z = pos.z;
  const forward = !!dir && (skill === 'r' || skill === 'e');
  if (dir && forward) {
    const l = Math.hypot(dir.x, dir.z) || 1;
    _d.x = dir.x / l;
    _d.y = 0.25;
    _d.z = dir.z / l;
  }
  const hearts = skill === 'e' ? Math.max(1, n >> 2) : Math.max(1, Math.ceil(n * 0.6));
  p.burst(_p, { n: hearts, exact: true, shape: p.shape.HEART, color: p.colors.primary, size: [0.24, 0.34], life: [0.6, 0.85], speed: [1.2, 2.4], up: 1.6, gravity: -0.6, spin: 2, fade: FADE_HOLD, dir: forward ? _d : undefined, spread: forward ? 0.6 : undefined });
  if (n - hearts > 0)
    p.burst(_p, { n: n - hearts, exact: true, shape: p.shape.FEATHER, color: p.colors.secondary, size: [0.22, 0.3], life: [0.8, 1.1], speed: [0.8, 1.8], up: 1.2, gravity: 0.8, spin: 3, drag: 1.5, fade: FADE_TWINKLE, dir: forward ? _d : undefined, spread: forward ? 0.9 : undefined });
  return true;
}

export const gabe: ChampAudio = {
  hero: 'gabe',
  // wind chimes: a high glassy sine retriggered every 50 ms (the chime cluster), a short echo, a slight shimmer
  motif: [0.24, 0, 2349, 0.001, 0.02, 0.2, 0, 1, 0, 0, 0, 0, 0.05, 0, 0, 0, 0.04, 0.6, 0.02, 0.3, 0],
  motifRate: { q: 1, w: 1.12, e: 1.26, passive: 1.5 },
  sounds: {
    // the heart balloon pops: a glassy pop jumping an octave, with an echo
    balloonPop: [0.35, 0.05, 1568, 0, 0.01, 0.16, 0, 1, 0, 0, 784, 0.03, 0, 0.4, 0, 0, 0.05, 0.6, 0.01, 0, 0],
    // wings folding: soft high-passed noise flaps
    wingFlutter: [0.3, 0, 700, 0.03, 0.08, 0.14, 4, 1, 0, 0, 0, 0, 0.035, 0, 0, 0, 0, 0.5, 0.03, 0.5, 1500],
    // charmed: a falling two-note chime
    charm: [0.28, 0, 1760, 0.002, 0.04, 0.22, 0, 1, 0, 0, -440, 0.06, 0, 0, 0, 0, 0.06, 0.6, 0.02, 0, 0],
  },
  skills: {
    q: { impact: { sound: 'balloonPop' } },
    w: { impact: { sound: 'wingFlutter' } },
    r: { impact: { sound: 'charm' } },
  },
  fx: { paint },
};
