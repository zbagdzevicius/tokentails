// CAT-AUDIO juice: speed lines, landing dust, run dust, claw sparks, wet drips, pickup sparkles, the pounce trail,
// leaf-surf spray, puff-cloud trail, vault boing dust and hit stars. Everything goes through core/fx.ts (one pooled
// draw call; LOW quality already drops half the spawns) and respects prefs.reducedMotion.
// Iteration 2 (STYLE lane): landing shockwaves (impact.ts) and combo-tier gold speed lines (speedlines.ts).
import * as THREE from 'three';
import { events } from '../core/events';
import { burst, spawnParticle } from '../core/fx';
import { addFrameHook } from '../core/loop';
import { kittenRig, P } from '../core/player';
import { game, prefs } from '../core/state';
import { Mochi } from '../cat/mochi';
import { onLand } from './impact';
import { initSpeedLines } from './speedlines';

const DUST: Record<string, number> = { ground: 0xe3c79b, bridge: 0xc29a66, wall: 0xd6b48a, river: 0xe8fbff, cloud: 0xffffff, gap: 0xe3c79b };
const PICK: Record<string, number[]> = {
  fish: [0x9fe8ff, 0xffffff, 0x5ccfff],
  bell: [0xffd23f, 0xffffff, 0xffb000],
  yarn: [0xff7ea3, 0xffffff, 0xff4f86],
  treat: [0xffb35c, 0xfff1c9, 0xff8a3d],
  food: [0xffe0a0, 0xffffff, 0xffb35c],
};
const v = new THREE.Vector3();
const w = new THREE.Vector3();

const live = () => game.mode === 'play' || game.mode === 'finish';
const mochi = () => {
  const r = kittenRig();
  return r instanceof Mochi ? r : null;
};

/**
 * A small burst carried along with the kitten (so it stays beside her instead of streaming back into the camera),
 * offset behind/beside her so it never covers her.
 */
function carryBurst(at: THREE.Vector3, n: number, color: number, speed: number, lifeS: number, sizeU: number, gravity: number, opacity = 0.85): void {
  const W = P.world;
  const f = P.speed * 0.9;
  for (let k = 0; k < Math.min(12, n); k++) {
    const a = Math.random() * Math.PI * 2;
    const v0 = speed * (0.4 + Math.random() * 0.6);
    const side = Math.cos(a) * v0;
    const up = Math.abs(Math.sin(a)) * v0 + 0.5;
    spawnParticle(
      at.x - W.fwd.x * 0.3,
      at.y,
      at.z - W.fwd.z * 0.3,
      W.right.x * side + W.fwd.x * (f - 1.5) + W.up.x * up,
      W.right.y * side + W.fwd.y * f + W.up.y * up,
      W.right.z * side + W.fwd.z * (f - 1.5) + W.up.z * up,
      lifeS * (0.6 + Math.random() * 0.6),
      sizeU * (0.7 + Math.random() * 0.6),
      color,
      gravity,
      opacity,
    );
  }
}

/** n dust particles in a flat ring around the kitten's feet (track plane). Tan, semi-transparent puffs. */
function dustRing(n: number, color: number, speed: number, size = 0.32, opacity = 0.55): void {
  const W = P.world;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const ca = Math.cos(a) * speed;
    const sa = Math.sin(a) * speed;
    spawnParticle(
      W.pos.x + W.right.x * ca * 0.05,
      W.pos.y + 0.08,
      W.pos.z + W.right.z * ca * 0.05,
      W.right.x * ca + W.fwd.x * sa * 0.6 + W.up.x * 0.8,
      W.right.y * ca + W.fwd.y * sa * 0.6 + 0.8 + Math.random(),
      W.right.z * ca + W.fwd.z * sa * 0.6 + W.up.z * 0.8,
      0.45 + Math.random() * 0.25,
      size * (0.7 + Math.random() * 0.6),
      color,
      2,
      opacity,
    );
  }
}

let dustT = 0;
let sparkT = 0;
let dripT = 0;
let sprayT = 0;
let puffT = 0;
let trailT = 0;

export function registerJuice(): void {
  initSpeedLines();
  events.on('land', (e) => {
    if (!live()) return;
    onLand(e.impact);
    if (P.surface === 'river') {
      burst(v.copy(P.world.pos).addScaledVector(P.world.up, 0.1), 14, 0xe8fbff, 5, 0.5, 0.22, 14, 1.2);
      return;
    }
    if (P.ability === 'cloud') {
      dustRing(8, 0xffffff, 2.5, 0.5);
      return;
    }
    if (e.impact > 5) dustRing(Math.min(16, 5 + Math.floor(e.impact / 2.5)), DUST[P.surface] ?? DUST.ground, 2 + e.impact * 0.12);
  });
  events.on('jump', () => {
    if (!live() || P.ability) return;
    dustRing(5, P.surface === 'river' ? 0xe8fbff : (DUST[P.surface] ?? DUST.ground), 1.8, 0.26);
  });
  events.on('pounce', () => {
    if (!live()) return;
    // a quick ring of air around the kitten, carried along so it never flies into the camera
    const W = P.world;
    const f = P.speed * 0.85;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const c = Math.cos(a) * 3.5;
      const sn = Math.sin(a) * 3.5;
      v.copy(W.pos).addScaledVector(W.up, 0.5);
      spawnParticle(v.x, v.y, v.z, W.right.x * c + W.fwd.x * f, sn + W.fwd.y * f, W.right.z * c + W.fwd.z * f, 0.25, 0.16, 0xffffff, 0);
    }
  });
  events.on('pickup', (e) => {
    if (game.mode !== 'play' && game.mode !== 'finish') return;
    const cols = PICK[e.kind] ?? PICK.treat;
    v.set(e.x, e.y, e.z);
    if (v.lengthSq() === 0) v.copy(P.world.pos).addScaledVector(P.world.up, 0.8);
    const big = e.kind === 'bell';
    // small, fading and carried with the kitten (40% of the old size, at most 12 per burst)
    carryBurst(v, big ? 8 : 4, cols[0], big ? 5 : 3, big ? 0.6 : 0.4, big ? 0.14 : 0.09, 2);
    carryBurst(v, big ? 4 : 2, cols[1], big ? 3.5 : 2.5, 0.45, 0.07, 0);
  });
  events.on('abilityStart', (e) => {
    if (!live()) return;
    if (e.id === 'cloud') {
      v.copy(P.world.pos).addScaledVector(P.world.up, -0.2);
      burst(v, 26, 0xffffff, 6, 0.8, 0.7, 0, 0.2);
      burst(v, 10, 0xdcefff, 3, 1, 0.9, 0, 0.5);
    } else if (e.id === 'vault') {
      dustRing(8, 0xd9c39a, 3, 0.26, 0.45);
    }
  });
  events.on('abilityEnd', (e) => {
    if (!live() || e.id !== 'cloud') return;
    burst(v.copy(P.world.pos), 18, 0xffffff, 5, 0.7, 0.6, 0, 0.3);
  });
  events.on('hit', () => {
    if (!live()) return;
    v.copy(P.world.pos).addScaledVector(P.world.up, 0.9);
    carryBurst(v, 10, 0xfff07a, 5, 0.6, 0.16, 3, 0.9);
    carryBurst(v, 5, 0xffffff, 3, 0.5, 0.13, 0, 0.8);
  });
  events.on('wet', () => {
    if (!live()) return;
    carryBurst(v.copy(P.world.pos).addScaledVector(P.world.up, 0.1), 10, 0x9fd8ff, 4, 0.5, 0.13, 14, 0.75);
  });
  events.on('nearMiss', () => {
    if (!live()) return;
    // a whoosh of wind streaks past the kitten
    const W = P.world;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      spawnParticle(
        W.pos.x + W.right.x * side * 0.7 + W.up.x * (0.3 + i * 0.12),
        W.pos.y + 0.3 + i * 0.12,
        W.pos.z + W.right.z * side * 0.7 + W.up.z * (0.3 + i * 0.12),
        -W.fwd.x * 14,
        -W.fwd.y * 14,
        -W.fwd.z * 14,
        0.22,
        0.18,
        0xffffff,
        0,
      );
    }
  });

  addFrameHook((dt) => {
    if (dt <= 0 || !live()) return;
    const m = mochi();
    const W = P.world;
    const reduced = prefs.reducedMotion;
    // run dust and slide spray
    if (P.grounded && P.mode !== 'finish' && P.ability !== 'cloud' && P.surface !== 'river' && P.speed > 8) {
      dustT += dt;
      const every = P.sliding ? 0.02 : 0.075;
      while (dustT > every) {
        dustT -= every;
        const back = m ? (Math.random() < 0.5 ? m.pawW[2] : m.pawW[3]) : W.pos;
        const col = DUST[P.surface] ?? DUST.ground;
        const side = (Math.random() - 0.5) * 2;
        spawnParticle(
          back.x,
          back.y + 0.05,
          back.z,
          -W.fwd.x * 2 + W.right.x * side * (P.sliding ? 3 : 0.8),
          1 + Math.random() * (P.sliding ? 2.5 : 1),
          -W.fwd.z * 2 + W.right.z * side * (P.sliding ? 3 : 0.8),
          P.sliding ? 0.45 : 0.4,
          P.sliding ? 0.34 : 0.22,
          col,
          3,
        );
      }
    }
    // claw sparks on cliff faces
    if (m && P.surface === 'wall' && P.grounded) {
      sparkT += dt;
      while (sparkT > 0.022) {
        sparkT -= 0.022;
        const paw = m.pawW[Math.random() < 0.5 ? 0 : 1];
        // bright sparks that spray out sideways from the claws and ride along with her (no blobs streaming back
        // into the camera)
        const f = P.speed * 0.8;
        const side = (Math.random() - 0.5) * 6;
        spawnParticle(
          paw.x,
          paw.y,
          paw.z,
          W.fwd.x * f + W.right.x * side + W.up.x * 2.5,
          W.fwd.y * f + W.right.y * side + W.up.y * 2.5 + Math.random() * 2,
          W.fwd.z * f + W.right.z * side + W.up.z * 2.5,
          0.22,
          0.13,
          Math.random() < 0.45 ? 0xffb347 : Math.random() < 0.6 ? 0xfff3b8 : 0xffffff,
          10,
        );
        // the scritch trail: tiny pale marks left on the rock (world-still, quick fade)
        if (Math.random() < 0.35) spawnParticle(paw.x, paw.y + 0.03, paw.z, 0, 0, 0, 0.45, 0.07, 0xfff6e0, 0, 0.7);
      }
    }
    // wet: rain from the little storm cloud, drips off the fur, and the shake spray
    if (P.wet > 0) {
      dripT += dt;
      const shaking = (performance.now() / 1000) % 0.85 < 0.32;
      const every = shaking ? 0.012 : 0.03;
      while (dripT > every) {
        dripT -= every;
        const fromCloud = m && Math.random() < 0.6;
        if (fromCloud) {
          w.copy(m.stormW).addScaledVector(W.right, (Math.random() - 0.5) * 0.45).addScaledVector(W.fwd, (Math.random() - 0.5) * 0.3);
          w.y -= 0.12;
          const f = P.speed * 0.95;
          spawnParticle(w.x, w.y, w.z, W.fwd.x * f, -3, W.fwd.z * f, 0.3, 0.12, 0x6fc4ff, 10);
        } else {
          w.copy(W.pos).addScaledVector(W.up, 0.45 + Math.random() * 0.4).addScaledVector(W.right, (Math.random() - 0.5) * 0.5);
          const fling = shaking ? 5 : 0.3;
          const side = Math.random() < 0.5 ? -1 : 1;
          const f = P.speed * 0.6;
          spawnParticle(w.x, w.y, w.z, W.right.x * side * fling + W.fwd.x * f, shaking ? 2 : 0, W.right.z * side * fling + W.fwd.z * f, 0.45, 0.15, 0x8fd0ff, 18);
        }
      }
    }
    // pounce afterimage trail
    if (P.sincePounce < 0.35 && !reduced) {
      trailT += dt;
      while (trailT > 0.012) {
        trailT -= 0.012;
        w.copy(W.pos).addScaledVector(W.up, 0.45);
        const f = P.speed * 0.7;
        spawnParticle(w.x, w.y, w.z, W.fwd.x * f, W.fwd.y * f, W.fwd.z * f, 0.18, 0.22, Math.random() < 0.5 ? 0xffb066 : 0xfff2e0, 0);
      }
    }
    // leaf surf spray from both rails and a wake
    if (P.surface === 'river' && P.grounded && P.ability !== 'cloud') {
      sprayT += dt;
      while (sprayT > 0.018) {
        sprayT -= 0.018;
        const side = Math.random() < 0.5 ? -1 : 1;
        w.copy(W.pos).addScaledVector(W.right, side * 0.65).addScaledVector(W.fwd, -0.3 - Math.random() * 0.5);
        const out = 2 + Math.random() * 2.5 + Math.abs(P.lean) * 3 * (Math.sign(P.lean) === side ? 1 : 0.3);
        const f = P.speed * 0.55;
        spawnParticle(
          w.x,
          w.y + 0.05,
          w.z,
          W.right.x * side * out + W.fwd.x * f,
          2.5 + Math.random() * 2.5,
          W.right.z * side * out + W.fwd.z * f,
          0.42,
          0.12 + Math.random() * 0.1,
          Math.random() < 0.7 ? 0xf2fdff : 0xa8e6ff,
          12,
        );
      }
    }
    // puff cloud trail
    if (P.ability === 'cloud') {
      puffT += dt;
      while (puffT > 0.06) {
        puffT -= 0.06;
        const base = P.y - P.base;
        w.copy(W.pos)
          .addScaledVector(W.up, -base - 0.4)
          .addScaledVector(W.fwd, -0.9)
          .addScaledVector(W.right, (Math.random() - 0.5) * 1.4);
        // the puffs travel with the cloud at most of its speed, so they trail behind it instead of hitting the camera
        const f = P.speed * 0.8;
        spawnParticle(w.x, w.y, w.z, W.fwd.x * f, W.fwd.y * f - 0.6, W.fwd.z * f, 0.6, 0.3 + Math.random() * 0.2, 0xffffff, 0.5);
      }
    }
  });
}
