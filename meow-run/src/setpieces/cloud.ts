// Puff cloud: a fluffy cat-shaped cloud (drawn by the kitten rig while P.ability === 'cloud') carries Mochi over
// the big canyon. Press E / tap at the rim: the PUFF meter (yarn, treats) turns into speed and bonus points.
// Reaching the rim without pressing summons the cloud anyway (no soft-lock, no bonus). SETPIECES lane.
import * as THREE from 'three';
import { events } from '../core/events';
import { burst } from '../core/fx';
import { callout, clearPrompt, prompt, react } from '../core/hud';
import { beginRide, boost, endAbility, onAbility, P } from '../core/player';
import { placeOnTrack } from '../core/place';
import { setPieceTypes } from '../core/registry';
import { addPoints, spendMeter } from '../core/score';
import { G, game } from '../core/state';
import { NO_FLOOR, type SetPieceType } from '../core/types';
import { GEO, MAT, mesh, num } from './kit';
import { CLOUD_H } from './layout';

const tmp = new THREE.Vector3();
let puffMat: THREE.MeshStandardMaterial | null = null;
let puffGeo: THREE.BufferGeometry | null = null;
function puff(): THREE.BufferGeometry {
  if (puffGeo) return puffGeo;
  const g = new THREE.IcosahedronGeometry(1, 2);
  puffGeo = g;
  g.userData.shared = true;
  return g;
}

// ---------------------------------------------------------------- PUFF hover (everywhere)
// A full PUFF meter is never wasted: E / tap anywhere summons the little cat cloud for a ~2 s hover high enough to
// float over log rows, branches and small chasms (it stretches to the far side of a chasm it is over). The sunset
// cloud set piece takes over if a hover reaches its rim.
export const HOVER = { h: 3.3, seconds: 2.2, min: 30 };
let hovering = false;
const isHovering = () => hovering && P.ability === 'cloud';
function registerHover(): void {
  onAbility(() => {
    const track = game.track;
    if (!track || game.mode !== 'play' || P.mode !== 'run' || P.ability || G.meter < 0.99) return false;
    let until = P.s + Math.max(HOVER.min, P.speed * HOVER.seconds);
    for (let g = 0; g < 160 && NO_FLOOR.has(track.kindAt(until)); g++) until += 1;
    spendMeter(G.meter);
    clearPrompt();
    beginRide('cloud', until, HOVER.h);
    hovering = true;
    addPoints(150);
    callout('PUFF HOVER!');
    react('wow');
    events.emit('setPiece', { id: 'puff', phase: 'start' });
    return true;
  });
  events.on('abilityEnd', (e) => {
    if (e.id === 'cloud' && hovering) {
      hovering = false;
      events.emit('setPiece', { id: 'puff', phase: 'end' });
    }
  });
  events.on('stageStart', () => (hovering = false));
  events.on('respawn', () => (hovering = false));
  // tell the player the moment the meter fills
  let full = false;
  events.on('meter', ({ value }) => {
    if (value >= 0.99 && !full && game.mode === 'play') {
      callout('PUFF READY!', 'info');
      prompt('ability', 'PUFF HOVER!', 2.4);
    }
    full = value >= 0.99;
  });
}

/** spec.s = window start. params gap (u to the rim), len (canyon length) */
const cloud: SetPieceType = {
  id: 'cloud',
  checkpoint: true,
  create(ctx) {
    const { s } = ctx.spec;
    const edge = s + num(ctx, 'gap', 30);
    const len = num(ctx, 'len', 80);
    const until = edge + len + 2;
    puffMat ??= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xfff2f8, emissiveIntensity: 0.35 });

    // the rim: a launch pad and stakes
    const pad = mesh(ctx, GEO.disc(), MAT.pad(), edge - 3, 0, 0.06, false, false);
    pad.scale.setScalar(1.8);
    pad.renderOrder = 2;
    const w = ctx.track.widthAt(edge - 1);
    for (const side of [-1, 1]) mesh(ctx, GEO.stakeStriped(), MAT.vc(), edge - 0.6, side * (w / 2 - 0.2), 0, true).scale.set(1.3, 1.4, 1.3);
    // little cloud stepping puffs lining the sky route: one InstancedMesh (4 balls per puff group, 1 draw call)
    const n = ctx.quality === 'high' ? Math.floor(len / 9) : Math.floor(len / 16);
    const im = new THREE.InstancedMesh(puff(), puffMat, Math.max(1, n * 4));
    im.count = n * 4;
    im.frustumCulled = false; // spans the whole canyon; one bounding sphere would be huge anyway
    ctx.group.add(im);
    const grpM: THREE.Matrix4[] = []; // each group's base matrix
    const ballM: THREE.Matrix4[] = []; // each ball inside its group
    const bob: number[] = [];
    const g0 = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const ss = edge + 6 + (i / Math.max(1, n)) * (len - 6);
      const side = i % 2 ? 1 : -1;
      g0.position.set(0, 0, 0);
      g0.quaternion.identity();
      g0.scale.setScalar(0.9 + (i % 3) * 0.25);
      placeOnTrack(g0, ctx.track, ss, side * (ctx.track.widthAt(ss) / 2 + 3 + (i % 3)), CLOUD_H - 1.6 + (i % 2) * 1.2, true);
      g0.updateMatrix();
      grpM.push(g0.matrix.clone());
      bob.push(i);
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Matrix4().compose(
          tmp.set((k - 1.5) * 0.9, (k % 2) * 0.35, Math.sin(k * 2) * 0.4),
          new THREE.Quaternion(),
          new THREE.Vector3().setScalar(0.9 + (k % 2) * 0.5),
        );
        ballM.push(b);
      }
    }
    const mm = new THREE.Matrix4();
    const lift = new THREE.Matrix4();
    const setPuffs = (t: number) => {
      for (let i = 0; i < n; i++) {
        lift.makeTranslation(0, Math.sin(t * 1.2 + bob[i]) * 0.25, 0);
        for (let k = 0; k < 4; k++) {
          mm.multiplyMatrices(grpM[i], ballM[i * 4 + k]).premultiply(lift);
          im.setMatrixAt(i * 4 + k, mm);
        }
      }
      im.instanceMatrix.needsUpdate = true;
    };
    setPuffs(0);

    let used = false;
    let ended = false;
    let tick = 0;
    const start = (pressed: boolean) => {
      used = true;
      clearPrompt();
      if (isHovering()) {
        endAbility(); // the hover hands over to the big cloud
        P.y = Math.max(P.y, 0);
      }
      beginRide('cloud', until, CLOUD_H);
      events.emit('setPiece', { id: 'cloud', phase: 'start' });
      const m = G.meter;
      if (pressed && m > 0.05) {
        const mul = 1 + 0.35 * m;
        boost(mul, len / Math.max(10, P.speed * mul));
        addPoints(Math.round(600 * m));
        spendMeter(m);
        callout(m > 0.6 ? 'PUFF POWER!' : 'PUFF!');
      } else callout(pressed ? 'PUFF!' : 'PHEW!', pressed ? 'good' : 'info');
      react('wow');
      tmp.copy(P.world.pos);
      burst(tmp, 26, 0xffffff, 7, 0.8, 0.6, -1, 0.3);
    };
    const off = onAbility(() => {
      if (used || P.s < s || P.s > edge || P.mode !== 'run') return false;
      start(true);
      return true;
    });
    return {
      end: until + 4,
      update(_dt, t) {
        if (!used && (P.mode === 'run' || isHovering())) {
          if (P.s >= s && P.s < edge && !isHovering()) prompt('ability', 'PUFF CLOUD!', 0.2);
          if (P.s >= edge - 1) start(false);
        }
        if (used && !ended && P.s >= until) {
          ended = true;
          events.emit('setPiece', { id: 'cloud', phase: 'end' });
        }
        pad.scale.setScalar(1.8 + Math.sin(t * 6) * 0.15);
        // bob at ~30 Hz (the fixed step is 120 Hz): plenty for a slow float
        if ((tick = (tick + 1) % 4) === 0) setPuffs(t);
      },
      onRespawn() {
        used = ended = false;
      },
      dispose() {
        off();
        im.dispose();
      },
    };
  },
};

export function registerCloud(): void {
  setPieceTypes.add(cloud);
  registerHover();
}
