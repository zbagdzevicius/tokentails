// Fish trucks: walk into one to eat it (+patience, +ULTRA). FROZEN core world file.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { scene } from '../core/engine';
import { events } from '../core/events';
import { pop } from '../core/hud';
import { C, CAPS, G, game, P } from '../core/state';
import { randomIntersection } from '../core/world';

export interface Fish {
  g: THREE.Group;
  fish: THREE.Object3D;
  ring: THREE.Mesh;
  respawn: number;
}
export const fishTrucks: Fish[] = [];
const pool: Fish[] = [];
const v1 = new THREE.Vector3();

function makeFish(): Fish {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 11), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  box.position.y = 3.2;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.1, 1.2, 11.1), new THREE.MeshStandardMaterial({ color: 0x2a7fff }));
  stripe.position.y = 3.6;
  const fish = new THREE.Group();
  const fb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: 0x7fd8ff, metalness: 0.4, roughness: 0.3 }));
  fb.scale.set(2.2, 3.2, 7);
  const ft = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4, 4), fb.material);
  ft.rotation.x = -Math.PI / 2;
  ft.position.z = -8;
  ft.scale.x = 0.3;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  eye.position.set(1.8, 0.8, 4.5);
  fish.add(fb, ft, eye);
  fish.position.y = 62;
  fish.scale.setScalar(3); // big enough to peek over the cat's head
  const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 1, 8, 40), new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.6 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.6;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 120, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  beacon.position.y = 60;
  g.add(box, stripe, fish, ring);
  g.traverse((o) => (o.castShadow = true));
  g.add(beacon);
  scene.add(g);
  return { g, fish, ring, respawn: 0 };
}

/** Level start: show level.fishTrucks trucks at random intersections away from the cat. */
export function placeFish(): void {
  const n = Math.min(CAPS.fish, game.level.fishTrucks);
  while (pool.length < n) pool.push(makeFish());
  fishTrucks.length = 0;
  for (let i = 0; i < pool.length; i++) {
    const f = pool[i];
    f.g.visible = i < n;
    if (i >= n) continue;
    f.g.position.copy(randomIntersection(C.pos));
    f.respawn = 0;
    fishTrucks.push(f);
  }
}

export function updateFish(dt: number, t: number): void {
  for (const f of fishTrucks) {
    if (!f.g.visible) {
      f.respawn -= dt;
      if (f.respawn <= 0) {
        f.g.position.copy(randomIntersection(C.pos));
        f.g.visible = true;
      }
      continue;
    }
    f.fish.position.y = 62 + Math.sin(t * 3) * 3;
    f.fish.rotation.y = t;
    f.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
    if (game.mode === 'play' && Math.hypot(f.g.position.x - C.pos.x, f.g.position.z - C.pos.z) < 18 && !C.air) {
      f.g.visible = false;
      f.respawn = 7;
      G.fish++;
      G.patience = Math.min(P.patienceMax, G.patience + 35);
      G.ultra = Math.min(100, G.ultra + 25);
      A.nom();
      pop('NOM NOM!', v1.set(C.pos.x, 55, C.pos.z), '#ffffff', 44).el.classList.add('nom');
      events.emit('fishEaten', { count: G.fish });
    }
  }
}
