// Leaf surf: on 'river' segments Mochi surfs a leaf (drawn by the kitten rig). This file adds the river's set
// pieces: the stretch marker (callouts, setPiece river events, lily pads), rocks with foam and spray, drifting
// logs to hop and rapids (a standing foam wave: jump it, or get splashed). SETPIECES lane.
import * as THREE from 'three';
import { events } from '../core/events';
import { burst, spawnParticle } from '../core/fx';
import { callout, prompt } from '../core/hud';
import { placeOnTrack } from '../core/place';
import { P, soak } from '../core/player';
import { setPieceTypes } from '../core/registry';
import { addPoints } from '../core/score';
import type { SetPieceType } from '../core/types';
import { GEO, MAT, mesh, num, tickShared, useFoam } from './kit';

const tmp = new THREE.Vector3();
let padGeo: THREE.BufferGeometry | null = null;
function lilyPad(): THREE.BufferGeometry {
  if (padGeo) return padGeo;
  const pad = new THREE.CircleGeometry(1, 16, 0.35, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
  const cols = new Float32Array(pad.attributes.position.count * 3).fill(0);
  for (let i = 0; i < pad.attributes.position.count; i++) {
    cols[i * 3] = 0.36;
    cols[i * 3 + 1] = 0.72;
    cols[i * 3 + 2] = 0.27;
  }
  pad.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  pad.userData.shared = true;
  padGeo = pad;
  return pad;
}
let flowerGeo: THREE.BufferGeometry | null = null;
function flower(): THREE.BufferGeometry {
  if (flowerGeo) return flowerGeo;
  flowerGeo = new THREE.ConeGeometry(0.22, 0.3, 6).translate(0, 0.15, 0);
  flowerGeo.userData.shared = true;
  return flowerGeo;
}
let flowerMat: THREE.MeshStandardMaterial | null = null;

/** marks a river stretch [s, s + len]: callouts, events, lily pads along the banks */
const river: SetPieceType = {
  id: 'river',
  checkpoint: true,
  create(ctx) {
    const { s } = ctx.spec;
    const len = ctx.spec.len ?? 120;
    flowerMat ??= new THREE.MeshStandardMaterial({ color: 0xff8fc8, roughness: 0.7, emissive: 0x5a1a3a, emissiveIntensity: 0.3 });
    const pads: THREE.Object3D[] = [];
    const n = ctx.quality === 'high' ? Math.floor(len / 8) : Math.floor(len / 16);
    for (let i = 0; i < n; i++) {
      const ss = s + 6 + (i / n) * (len - 10);
      const side = i % 2 ? 1 : -1;
      const w = ctx.track.widthAt(ss);
      const g = new THREE.Group();
      const p = new THREE.Mesh(lilyPad(), MAT.vc());
      p.scale.setScalar(0.7 + (i % 3) * 0.25);
      g.add(p);
      if (i % 3 === 0) {
        const f = new THREE.Mesh(flower(), flowerMat);
        f.position.set(0.2, 0.02, 0.1);
        g.add(f);
      }
      g.rotation.y = i * 1.3;
      ctx.group.add(g);
      placeOnTrack(g, ctx.track, ss, side * (w / 2 - 0.6 - (i % 2) * 0.5), 0.06, true);
      g.userData.y = g.position.y;
      g.userData.ph = i;
      pads.push(g);
    }
    let on = false;
    let done = false;
    return {
      end: s + len + 2,
      update(_dt, t) {
        if (!on && P.s >= s) {
          on = true;
          callout("SURF'S UP!");
          events.emit('setPiece', { id: 'river', phase: 'start' });
        }
        if (on && !done && P.s >= s + len) {
          done = true;
          addPoints(200);
          callout('PURRFECT!');
          events.emit('setPiece', { id: 'river', phase: 'end' });
        }
        for (let i = 0; i < pads.length; i++) pads[i].position.y = pads[i].userData.y + Math.sin(t * 2 + pads[i].userData.ph) * 0.04;
      },
      onRespawn() {
        on = done = false;
      },
      dispose() {
        if (on && !done) events.emit('setPiece', { id: 'river', phase: 'end' });
      },
    };
  },
};

/** a rock in the river with a foam collar and spray. params r */
const riverrock: SetPieceType = {
  id: 'riverrock',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const r = num(ctx, 'r', 1);
    const m = mesh(ctx, GEO.riverRock(), MAT.vc(), s, x, r * 0.3, true);
    m.scale.set(r, r * 1.1, r);
    m.rotation.y = s;
    const foam = mesh(ctx, GEO.foamRing(), MAT.foam(), s, x, 0.08, false, false);
    foam.scale.setScalar(r * 1.1);
    foam.renderOrder = 3;
    const fp = foam.position.clone();
    ctx.addCollider({ shape: 'sphere', s, x, y: r * 0.45, r: r * 0.92, kind: 'hurt', label: 'rock' });
    let acc = 0;
    return {
      end: s + r,
      update(dt, t) {
        foam.scale.setScalar(r * (1.1 + Math.sin(t * 5 + s) * 0.08));
        const ds = s - P.s;
        if (ds > -5 && ds < 45 && (acc += dt) > 0.06) {
          acc = 0;
          const a = Math.random() * Math.PI * 2;
          spawnParticle(fp.x + Math.cos(a) * r, fp.y + 0.1, fp.z + Math.sin(a) * r, Math.cos(a) * 1.5, 2.5 + Math.random() * 2, Math.sin(a) * 1.5, 0.6, 0.35, 0xffffff, 9);
        }
      },
    };
  },
};

/** a log drifting down the river: jump it. params w */
const driftlog: SetPieceType = {
  id: 'driftlog',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const w = num(ctx, 'w', 4);
    const root = new THREE.Group();
    const body = new THREE.Mesh(GEO.log(), MAT.bark());
    body.scale.set(w, 1, 1);
    body.castShadow = ctx.quality === 'high';
    const capL = new THREE.Mesh(GEO.logCap(), MAT.logEnd());
    capL.rotation.y = Math.PI / 2;
    capL.position.x = w / 2;
    const capR = new THREE.Mesh(GEO.logCap(), MAT.logEnd());
    capR.rotation.y = -Math.PI / 2;
    capR.position.x = -w / 2;
    const st = new THREE.Mesh(GEO.stub(), MAT.vc());
    st.position.set(w * 0.2, 0.3, 0);
    root.add(body, capL, capR, st);
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, x, 0.3);
    const p0 = root.position.clone();
    const foam = mesh(ctx, GEO.plane(), MAT.foam(), s, x, 0.07, false, false);
    foam.rotateX(-Math.PI / 2);
    foam.scale.set(w + 0.8, 1.4, 1);
    foam.renderOrder = 3;
    ctx.addCollider({ s, x, y: 0, hs: 0.45, hx: w / 2, h: 0.75, kind: 'hurt', label: 'log' });
    return {
      end: s + 1,
      update(_dt, t) {
        root.position.y = p0.y + Math.sin(t * 2.2 + s) * 0.08;
        root.rotation.z = Math.sin(t * 1.4 + s) * 0.06;
      },
    };
  },
};

/** rapids: a standing foam wave across the river. Jump it (or get splashed: slowed + wet). Prompts JUMP. */
const rapid: SetPieceType = {
  id: 'rapid',
  create(ctx) {
    const { s } = ctx.spec;
    const w = ctx.track.widthAt(s);
    const band = mesh(ctx, GEO.plane(), useFoam(), s, 0, 0.25, false, false);
    band.rotateX(-Math.PI / 2 + 0.5);
    band.scale.set(w + 1, 3.2, 1);
    band.renderOrder = 3;
    const back = mesh(ctx, GEO.plane(), useFoam(), s + 1.6, 0, 0.12, false, false);
    back.rotateX(-Math.PI / 2 - 0.4);
    back.scale.set(w + 1, 2.4, 1);
    back.renderOrder = 3;
    const centre = band.position.clone();
    ctx.addCollider({
      s: s + 0.5,
      x: 0,
      y: 0,
      hs: 1.2,
      hx: w / 2,
      h: 0.45,
      kind: 'trigger',
      label: 'rapid',
      onTouch: () => {
        soak(0.9, 0.8);
        tmp.copy(P.world.pos);
        burst(tmp, 22, 0xe8f8ff, 7, 0.6, 0.35, 12, 1.4);
        callout('SPLASH!', 'bad');
      },
    });
    let acc = 0;
    let cleared = false;
    return {
      end: s + 3,
      update(dt, t) {
        tickShared(t);
        if (P.s > s - 26 && P.s < s - 1 && P.mode === 'run') prompt('jump', 'JUMP THE RAPIDS!', 0.2);
        if (!cleared && P.s > s + 2 && !P.grounded) {
          cleared = true;
          addPoints(100);
        }
        const ds = s - P.s;
        if (ds > -4 && ds < 50 && (acc += dt) > 0.035) {
          acc = 0;
          const u = Math.random() - 0.5;
          spawnParticle(centre.x + u * w * P.world.right.x, centre.y + 0.4, centre.z + u * w * P.world.right.z, 0, 3 + Math.random() * 3, 0, 0.7, 0.45, 0xffffff, 10);
        }
      },
    };
  },
};

export function registerRiver(): void {
  for (const t of [river, riverrock, driftlog, rapid]) setPieceTypes.add(t);
}
