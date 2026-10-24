// Pooled, expanding additive FX meshes (shock rings, sound-wave arcs) for the ULTRA abilities. Owned by the CATS lane.
// Everything is allocated once; fire() reuses the oldest slot. Stepped by a frame hook (also runs while paused with dt 0).
import * as THREE from 'three';
import { scene } from '../../core/engine';
import { fxMat } from '../../core/fx';
import { addFrameHook } from '../../core/loop';

interface Slot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  r0: number;
  r1: number;
  h: number; // y scale
  peak: number;
}

export class FxPool {
  private slots: Slot[] = [];
  private next = 0;

  /** geo is a unit-radius shape; `flat` lays a ring geometry onto the ground. */
  constructor(geo: THREE.BufferGeometry, color: number, n: number, flat = false) {
    for (let i = 0; i < n; i++) {
      const mat = fxMat(color);
      mat.opacity = 0;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 9;
      mesh.visible = false;
      mesh.frustumCulled = false;
      if (flat) mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);
      this.slots.push({ mesh, mat, age: 0, life: 1, r0: 1, r1: 1, h: 1, peak: 1 });
    }
    addFrameHook((dt) => this.step(dt));
  }

  /** Start one: grows from radius r0 to r1 over `life` s, fading from `peak` opacity. rotY aims arcs. */
  fire(x: number, y: number, z: number, r0: number, r1: number, life: number, peak = 0.9, rotY = 0, h = 1): THREE.Mesh {
    const s = this.slots[this.next];
    this.next = (this.next + 1) % this.slots.length;
    s.age = 0;
    s.life = life;
    s.r0 = r0;
    s.r1 = r1;
    s.h = h;
    s.peak = peak;
    s.mesh.position.set(x, y, z);
    if (s.mesh.rotation.x === 0) s.mesh.rotation.y = rotY;
    else s.mesh.rotation.z = rotY;
    s.mesh.visible = true;
    this.apply(s);
    return s.mesh;
  }

  clear(): void {
    for (const s of this.slots) {
      s.age = s.life;
      s.mesh.visible = false;
    }
  }

  private apply(s: Slot): void {
    const t = Math.min(1, s.age / s.life);
    const e = 1 - (1 - t) * (1 - t); // ease out
    const r = s.r0 + (s.r1 - s.r0) * e;
    if (s.mesh.rotation.x === 0) s.mesh.scale.set(r, s.h, r);
    else s.mesh.scale.set(r, r, 1);
    s.mat.opacity = s.peak * (1 - t) * (1 - t * 0.5);
  }

  private step(dt: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.mesh.visible) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.mesh.visible = false;
        continue;
      }
      this.apply(s);
    }
  }
}
