// Spray-bottle helicopters (moved from the POC). Owned by the ENEMIES lane.
// Orbit the cat, then hover on a flank above paw reach and spray water (drains patience).
// Swat when facing it, pounce through it, or laser it.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { camera, scene } from '../core/engine';
import { reportKill } from '../core/enemies';
import { burst, fire, shake, water } from '../core/fx';
import { flash, showBanner } from '../core/hud';
import { soak } from '../core/player';
import { score } from '../core/score';
import { C, G, game, P } from '../core/state';
import type { Blast, EnemySpec, EnemyType, SwatHit } from '../core/types';
import { radial, smash } from '../core/world';
import { bossFight } from './common';

interface Heli {
  g: THREE.Group;
  rotor: THREE.Object3D;
  state: 'orbit' | 'attack' | 'fall' | 'dead';
  t: number;
  ang: number;
  side: number; // which flank it attacks from
  aim: number; // world angle around the cat, fixed when the attack starts so turning to face it works
  vel: THREE.Vector3;
  spin: number;
}

const helis: Heli[] = [];
let heliSide = 1;
let spec: EnemySpec | null = null;
let spawnT = 12;

const heliBody = new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.4 });
const heliWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
const heliGlass = new THREE.MeshStandardMaterial({ color: 0x8fd0ff, roughness: 0.1 });
const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x4cc3ff });
const sph = new THREE.SphereGeometry(1, 16, 12);
const tailGeo = new THREE.CylinderGeometry(0.5, 1, 9, 8);
const finGeo = new THREE.BoxGeometry(0.4, 3, 1.6);
const bladeGeo = new THREE.BoxGeometry(22, 0.25, 1);
const skidGeo = new THREE.BoxGeometry(0.5, 0.5, 8);
const nozzleGeo = new THREE.CylinderGeometry(0.5, 0.8, 3, 8);

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const nose = new THREE.Vector3();
const dirV = new THREE.Vector3();

function makeHeli(): Heli {
  const g = new THREE.Group();
  const body = new THREE.Mesh(sph, heliBody);
  body.scale.set(3.2, 3, 5.4);
  const stripe = new THREE.Mesh(sph, heliWhite);
  stripe.scale.set(3.25, 1, 5.3);
  const glass = new THREE.Mesh(sph, heliGlass);
  glass.scale.set(2.4, 2, 2.4);
  glass.position.set(0, 0.6, 3.6);
  const tail = new THREE.Mesh(tailGeo, heliBody);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.8, -8);
  const fin = new THREE.Mesh(finGeo, heliWhite);
  fin.position.set(0, 2.2, -12);
  const rotor = new THREE.Group();
  rotor.position.y = 3.6;
  for (const r of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(bladeGeo, heliBody);
    blade.rotation.y = r;
    rotor.add(blade);
  }
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(skidGeo, heliBody);
    skid.position.set(sx * 2.4, -3.4, 0);
    g.add(skid);
  }
  // a spray bottle nozzle: the helicopters fight with water, the one thing cats truly fear
  const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, -1.6, 5.6);
  g.add(body, stripe, glass, tail, fin, rotor, nozzle);
  g.traverse((o) => (o.castShadow = true));
  scene.add(g);
  heliSide = -heliSide;
  return { g, rotor, state: 'orbit', t: 0, ang: 0, side: heliSide, aim: 0, vel: new THREE.Vector3(), spin: 0 };
}

const flying = (h: Heli) => h.state === 'orbit' || h.state === 'attack';

function swatHeli(h: Heli, dir: THREE.Vector3): void {
  if (!flying(h)) return;
  h.state = 'fall';
  h.vel.copy(dir).multiplyScalar(55).setY(25);
  h.spin = 14;
  reportKill('heli', h.g.position);
  A.meow('short');
  score(6, h.g.position, 'SWAT! ');
  showBanner('SWAT!');
  shake(0.4);
  G.hitStop = 0.08;
}

function param(k: string, d: number): number {
  return spec?.params?.[k] ?? d;
}

export const heliType: EnemyType = {
  id: 'heli',
  init() {},
  begin(s) {
    spec = s;
    spawnT = s?.delay ?? 12;
  },
  clear() {
    for (const h of helis) scene.remove(h.g);
    helis.length = 0;
    spec = null;
  },
  alive() {
    let n = 0;
    for (const h of helis) if (h.state !== 'dead') n++;
    return n;
  },
  update(dt) {
    if (game.mode === 'play' && spec && !G.timeFrozen) {
      spawnT -= dt;
      const maxAlive = spec.max + (spec.maxRamp > 0 ? Math.floor(G.elapsed / spec.maxRamp) : 0);
      if (spawnT <= 0 && this.alive() < (bossFight.up ? Math.min(1, maxAlive) : maxAlive) && !G.frenzy) {
        const h = makeHeli();
        h.ang = Math.random() * Math.PI * 2;
        h.g.position.set(C.pos.x + Math.cos(h.ang) * 300, 70, C.pos.z + Math.sin(h.ang) * 300);
        h.t = 3 + Math.random() * 3;
        helis.push(h);
        spawnT = Math.max(spec.minEvery, spec.every - (G.elapsed / 10) * spec.everyRamp);
        if (G.elapsed < 20) showBanner(innerWidth < 600 ? 'SPRAY BOTTLES!' : 'INCOMING SPRAY BOTTLES', '#4cc3ff');
      }
    }
    let nearest = 999;
    const head = v2.set(C.pos.x, P.headY + C.y, C.pos.z);
    const spray = param('spray', 7.5);
    for (const h of helis) {
      const g = h.g;
      h.rotor.rotation.y += dt * 30;
      if (flying(h)) {
        h.t -= dt;
        let target: THREE.Vector3;
        if (h.state === 'orbit') {
          h.ang += dt * 0.45;
          target = v1.set(C.pos.x + Math.cos(h.ang) * 80, 85, C.pos.z + Math.sin(h.ang) * 80);
          // never fly through the camera
          const dc = Math.hypot(target.x - camera.position.x, target.z - camera.position.z);
          if (dc < 60) target.y += 60 - dc;
          if (h.t <= 0 && game.mode === 'play') {
            h.state = 'attack';
            h.t = 5;
            h.aim = C.heading + h.side * 1.2; // flank, above paw reach: turn to face it, pounce it, or laser it
            A.hiss();
          }
        } else {
          // hover on the flank above the head and spray
          target = v1.set(C.pos.x + Math.sin(h.aim) * 55, 64 + C.y * 0.5, C.pos.z + Math.cos(h.aim) * 55);
          if (g.position.distanceTo(target) < 25) {
            g.localToWorld(nose.set(0, -1.6, 7));
            for (let k = 0; k < 6; k++) {
              const dir = dirV.copy(head).sub(nose).normalize().multiplyScalar(80);
              water.spawn(nose.x, nose.y, nose.z, dir.x + (Math.random() - 0.5) * 10, dir.y + (Math.random() - 0.5) * 10, dir.z + (Math.random() - 0.5) * 10, 0.6, 1.6 + Math.random() * 0.8, 0x3fb4ff, -20, 0.5);
            }
            soak(spray * dt, 'heli');
          }
          if (h.t <= 0) {
            h.state = 'orbit';
            h.t = 4 + Math.random() * 4;
          }
        }
        g.position.lerp(target, Math.min(1, dt * 1.2));
        g.lookAt(head.x, g.position.y, head.z);
        g.rotateX(0.15);
      } else if (h.state === 'fall') {
        h.vel.y -= 60 * dt;
        g.position.addScaledVector(h.vel, dt);
        g.rotation.y += h.spin * dt;
        g.rotation.z += 2 * dt;
        fire.spawn(g.position.x, g.position.y, g.position.z, 0, 4, 0, 0.6, 1.6, Math.random() < 0.5 ? 0xff8a2a : 0x555555, 6, 1.5);
        if (g.position.y < 3) {
          h.state = 'dead';
          g.visible = false;
          A.boom();
          flash(0.35);
          shake(0.5);
          for (let k = 0; k < 40; k++) fire.spawn(g.position.x, 4, g.position.z, (Math.random() - 0.5) * 60, Math.random() * 50, (Math.random() - 0.5) * 60, 0.9, 2 + Math.random() * 2.5, [0xffd24a, 0xff8a2a, 0xff3e3e][k % 3], -10, 1.6);
          burst(g.position.x, 3, g.position.z, 8);
          const m = smash(g.position.x, g.position.z, 20, 0, 60, radial(g.position.x, g.position.z, 45, 40));
          if (m > 0) score(m, g.position, 'CRASH ');
        }
      }
      if (h.state !== 'dead') nearest = Math.min(nearest, g.position.distanceTo(camera.position));
    }
    for (let i = helis.length - 1; i >= 0; i--) {
      if (helis[i].state === 'dead') {
        scene.remove(helis[i].g);
        helis.splice(i, 1);
      }
    }
    A.setHeli(game.mode === 'over' || game.mode === 'paused' ? 0 : Math.max(0, 1 - nearest / 260) * 0.35);
  },
  onSwat(hit: SwatHit) {
    for (const h of helis) {
      if (!flying(h)) continue;
      const dx = h.g.position.x - C.pos.x;
      const dz = h.g.position.z - C.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const facing = (dx * hit.fwd.x + dz * hit.fwd.z) / d;
      if ((d < 75 && facing > 0.78 && h.g.position.y < 100 + C.y) || h.g.position.distanceTo(hit.strike) < 22) swatHeli(h, v1.copy(hit.fwd).addScaledVector(hit.right, -hit.side * 0.5).normalize());
    }
  },
  onPounceAir(p, r) {
    for (const h of helis) if (flying(h) && h.g.position.distanceTo(p) < r) swatHeli(h, C.fwd);
  },
  onLaser(p, dir) {
    for (const h of helis) if (h.g.position.distanceTo(p) < 12) swatHeli(h, dir);
  },
  onLaserSweep(x, z, ang) {
    for (const h of helis) {
      if (!flying(h)) continue;
      const dx = h.g.position.x - x;
      const dz = h.g.position.z - z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 130 && Math.sin(ang) * (dx / d) + Math.cos(ang) * (dz / d) > 0.85) swatHeli(h, dirV.set(dx / d, 0, dz / d));
    }
  },
  onBlast(b: Blast) {
    for (const h of helis) {
      if (!flying(h)) continue;
      const dx = h.g.position.x - b.x;
      const dz = h.g.position.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > b.r + 30) continue;
      if (b.cone !== undefined && b.dirX !== undefined && b.dirZ !== undefined && (dx * b.dirX + dz * b.dirZ) / d < b.cone) continue;
      swatHeli(h, dirV.set(dx / d, 0, dz / d));
    }
  },
  onFrenzy() {
    for (const h of helis) {
      if (!flying(h)) continue;
      h.state = 'fall';
      h.vel.set((Math.random() - 0.5) * 40, 10, (Math.random() - 0.5) * 40);
      h.spin = 10;
    }
  },
};
