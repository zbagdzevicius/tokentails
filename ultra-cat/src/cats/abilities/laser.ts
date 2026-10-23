// Orange tabby ULTRA: LASER EYES (moved from the POC). Owned by the CATS lane.
import * as THREE from 'three';
import * as A from '../../audio/sfx';
import { St } from '../../core/bodies';
import { scene } from '../../core/engine';
import { laserEnemies, laserSweepEnemies } from '../../core/enemies';
import { fire, fxMat, shake } from '../../core/fx';
import { popMoney } from '../../core/hud';
import { comboHit, score } from '../../core/score';
import { C, G, game } from '../../core/state';
import type { UltraAbility } from '../../core/types';
import { city, FLOOR, markTouched, valMul } from '../../core/world';
import { cars, launchCar } from '../../world/traffic';

// drawn on top of everything, additive, so the beams read through the cat's head and the towers
const beamMat = new THREE.MeshBasicMaterial({ color: 0xff1f4f, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
const beamCore = new THREE.MeshBasicMaterial({ color: 0xfff0f4, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
export const beams = [0, 1].map(() => {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), beamMat);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2), beamCore);
  outer.renderOrder = core.renderOrder = 10;
  g.add(outer, core);
  g.visible = false;
  scene.add(g);
  return g;
});
const hitGlow = new THREE.Mesh(new THREE.RingGeometry(4, 10, 32), fxMat(0xff3e7a));
hitGlow.rotation.x = -Math.PI / 2;
hitGlow.renderOrder = 10;
hitGlow.visible = false;
scene.add(hitGlow);

const eyes = [new THREE.Vector3(), new THREE.Vector3()];
const hitV = new THREE.Vector3();
const dirV = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

function hide(): void {
  for (const b of beams) b.visible = false;
  hitGlow.visible = false;
}

export const laser: UltraAbility = {
  id: 'laser',
  name: 'LASER EYES!',
  color: '#ff3e7a',
  tallyLabel: 'ZAP',
  moveMul: 0.6,
  camWide: true,
  start() {
    A.setLaser(true);
  },
  stop() {
    A.setLaser(false);
    hide();
    if (G.zap > 0 && game.mode === 'play') popMoney('LASER TOTAL ', G.zap, v2.set(C.pos.x, 70, C.pos.z));
  },
  update(_dt, t) {
    game.rig.eyes(eyes);
    const sweep = Math.sin(t * 2.6) * 0.35;
    const a = C.heading + sweep;
    const reach = 170; // far enough ahead that the beams run up the screen past the head
    const hit = hitV.set(C.pos.x + Math.sin(a) * reach, 0, C.pos.z + Math.cos(a) * reach);
    let money = 0;
    for (let e = 0; e < 2; e++) {
      const from = eyes[e];
      const dir = dirV.copy(hit).sub(from);
      const len = dir.length();
      dir.normalize();
      // the beam stops at the first building it burns through this frame (only one segment per sample)
      for (let s = 6; s < len; s += 3) {
        const px = from.x + dir.x * s;
        const py = from.y + dir.y * s;
        const pz = from.z + dir.z * s;
        for (let bi = 0; bi < city.buildings.length; bi++) {
          const b = city.buildings[bi];
          if (Math.abs(px - b.x) > b.hx || Math.abs(pz - b.z) > b.hz) continue;
          const k = Math.floor(py / FLOOR);
          if (k < 0 || k >= b.count) continue;
          const i = b.first + k;
          if (city.segs.state[i] !== St.Static) continue;
          const n = city.knock(i, dir.x * 50 + (Math.random() - 0.5) * 20, 30, dir.z * 50 + (Math.random() - 0.5) * 20);
          money += n * b.value * valMul(bi);
          markTouched(bi);
          for (let q = 0; q < 3; q++) fire.spawn(px, py, pz, (Math.random() - 0.5) * 30, Math.random() * 30, (Math.random() - 0.5) * 30, 0.6, 1.5 + Math.random() * 2, q ? 0xff8a2a : 0xffd24a, -20, 1);
        }
        laserEnemies(v1.set(px, py, pz), dir);
        for (let i = 0; i < cars.n; i++) {
          const p = i * 3;
          if (Math.abs(cars.pos[p] - px) < 5 && Math.abs(cars.pos[p + 2] - pz) < 5 && py < 6) launchCar(i, dir.x * 40, 50, dir.z * 40);
        }
      }
      hit.set(C.pos.x + Math.sin(a) * reach, 0, C.pos.z + Math.cos(a) * reach);
      const bm = beams[e];
      bm.visible = true;
      bm.position.copy(from);
      tmpQ.setFromUnitVectors(Z, dir);
      bm.quaternion.copy(tmpQ);
      const w = 1 + Math.sin(t * 50 + e) * 0.25;
      bm.scale.set(w, w, len);
      fire.spawn(hit.x, 2, hit.z, 0, 0, 0, 0.12, 16 + Math.random() * 3, 0xffb0c8, 0, 0);
      if (Math.random() < 0.7) fire.spawn(hit.x, 1, hit.z, (Math.random() - 0.5) * 40, 20 + Math.random() * 20, (Math.random() - 0.5) * 40, 0.5, 2.5, 0xff3e7a, -40, 1);
    }
    hitGlow.visible = true;
    hitGlow.position.set(hit.x, 1.5, hit.z);
    hitGlow.scale.setScalar(1 + Math.sin(t * 30) * 0.2);
    // the eyes lock on to any helicopter (or other flyer) in front
    laserSweepEnemies(C.pos.x, C.pos.z, a);
    if (money > 0) {
      score(money, v2.set(hit.x, 30, hit.z), 'ZAP ', false);
      if (G.zapComboT <= 0) {
        G.zapComboT = 0.25; // the laser feeds the chain at most 4 hits a second
        comboHit();
      }
      shake(0.08);
    }
  },
};
