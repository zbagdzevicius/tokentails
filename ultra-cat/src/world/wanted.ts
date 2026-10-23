// WANTED landmark: a pulsing red tower worth 3x, a bonus and extra seconds when toppled. FROZEN core world file.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { scene } from '../core/engine';
import { events } from '../core/events';
import { flash, pop, showBanner } from '../core/hud';
import { bossFight } from '../enemies/common';
import { money } from '../core/scoring';
import { bonus } from '../core/score';
import { shake } from '../core/fx';
import { C, G, game, W } from '../core/state';
import { city, staticSegs } from '../core/world';

const wantedRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.8 }));
wantedRing.rotation.x = Math.PI / 2;
const wantedBeacon = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
wantedRing.visible = wantedBeacon.visible = false;
scene.add(wantedRing, wantedBeacon);
const RED = new THREE.Color(0xff2030);
const col = new THREE.Color();
const v1 = new THREE.Vector3();

export function clearWanted(): void {
  if (W.bi >= 0 && W.bi < city.buildings.length) {
    const b = city.buildings[W.bi];
    for (let k = 0; k < b.count; k++) city.segs.mesh.setColorAt(b.first + k, W.orig[k]);
    if (city.segs.mesh.instanceColor) city.segs.mesh.instanceColor.needsUpdate = true;
  }
  W.bi = -1;
  wantedRing.visible = wantedBeacon.visible = false;
}

/** Forget the marked tower without restoring colours (the city was just rebuilt). */
export function resetWanted(): void {
  W.bi = -1;
  W.next = game.level.wanted.first;
  wantedRing.visible = wantedBeacon.visible = false;
}

/** Pick the tallest standing building 120 to 300 away. */
function pickWanted(): void {
  clearWanted();
  let best = -1;
  let bh = 0;
  const minH = game.level.wanted.minHeight;
  for (let pass = 0; pass < 2 && best < 0; pass++) {
    for (let bi = 0; bi < city.buildings.length; bi++) {
      const b = city.buildings[bi];
      const d = Math.hypot(b.x - C.pos.x, b.z - C.pos.z);
      if (pass === 0 && (d < 120 || d > 300)) continue;
      const h = city.standing(b);
      if (h > bh && h > minH) {
        bh = h;
        best = bi;
      }
    }
  }
  if (best < 0) return;
  W.bi = best;
  W.t = game.level.wanted.every;
  const b = city.buildings[best];
  W.orig = [];
  for (let k = 0; k < b.count; k++) {
    const c = new THREE.Color();
    city.segs.mesh.getColorAt(b.first + k, c);
    W.orig.push(c);
  }
  const r = Math.hypot(b.hx, b.hz) + 6;
  wantedRing.scale.set(r, r, 1);
  wantedRing.position.set(b.x, 1.5, b.z);
  wantedBeacon.scale.set(7, 260, 7);
  wantedBeacon.position.set(b.x, 130, b.z);
  wantedRing.visible = wantedBeacon.visible = true;
  if (!bossFight.up) showBanner('WANTED: KNOCK IT DOWN', '#ff4a4a'); // no re-announce over a boss fight
  A.hiss();
  events.emit('wantedPicked', { index: best });
}

export function updateWanted(dt: number, t: number): void {
  if (game.mode !== 'play') return;
  const cfg = game.level.wanted;
  if (!G.timeFrozen) W.next -= dt;
  if (W.bi >= 0) {
    W.t -= dt;
    const b = city.buildings[W.bi];
    if (staticSegs(b) <= b.count * 0.2) {
      const v = bonus(cfg.bonus);
      G.time += cfg.timeBonus;
      G.wanted++;
      pop(`LANDMARK! +${money(v)}  +${cfg.timeBonus}s`, v1.set(b.x, 60, b.z), '#ff4a4a', 40);
      showBanner(`LANDMARK TOPPLED! +${cfg.timeBonus}s`, '#ff4a4a');
      flash(0.4);
      shake(0.5);
      A.meow('short');
      events.emit('landmarkToppled', { index: W.bi, count: G.wanted, bonus: v });
      clearWanted();
      W.next = Math.min(W.next, 3);
    } else if (W.t <= 0) {
      clearWanted();
      W.next = 0;
    } else {
      // pulse the tower red
      const k = 0.35 + 0.25 * Math.sin(t * 8);
      for (let i = 0; i < b.count; i++) city.segs.mesh.setColorAt(b.first + i, col.copy(W.orig[i]).lerp(RED, k));
      if (city.segs.mesh.instanceColor) city.segs.mesh.instanceColor.needsUpdate = true;
      (wantedRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 8);
    }
  }
  if (W.next <= 0 && G.time > 4) {
    W.next = cfg.every;
    pickWanted();
  }
}
