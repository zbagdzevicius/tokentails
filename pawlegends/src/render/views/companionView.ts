/**
 * Companion Kittens (POC.md §11.1, GDD "your cats in the game"): the player's first two Token Tails cats, in their
 * coat with an element collar and a name tag. Each one trots behind the front melee minion of the player's wave in
 * its lane (kitten 0 the Sunny lane, kitten 1 the Puddle lane) and naps at the player's fountain when there is no
 * wave. Pure decoration: they are not entities, cannot be hit and never reach the sim. Two meshes and two tags.
 */
import * as THREE from 'three';
import type { Companion } from '../../meta/roster';
import { ELEMENT_COLOR, kittenCoat } from '../cosmetics';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { kittenGeometry } from './models';
import { rigMaterial, type RigUniforms } from './rig';

const LANES = ['sunny', 'puddle'] as const;
const KITTEN_SCALE = 0.62;

interface Kitten {
  c: Companion;
  mesh: THREE.Mesh;
  rig: RigUniforms;
  material: THREE.MeshLambertMaterial;
  tag: THREE.Sprite;
  pos: THREE.Vector3;
  yaw: number;
  phase: number;
  walk: number;
  napping: boolean;
}

function nameTag(name: string, color: number): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d');
  if (g) {
    g.font = '600 30px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = Math.min(240, g.measureText(name).width + 34);
    g.fillStyle = 'rgba(42,26,34,0.78)';
    g.beginPath();
    g.roundRect((256 - w) / 2, 10, w, 44, 22);
    g.fill();
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.beginPath();
    g.arc((256 - w) / 2 + 16, 32, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff3dc';
    g.fillText(name, 128 + 6, 33);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.renderOrder = 5;
  return sp;
}

export class CompanionView {
  readonly group = new THREE.Group();
  private kittens: Kitten[] = [];
  private time = 0;
  myTeam: 0 | 1 = 0;

  constructor(companions: readonly Companion[]) {
    this.group.name = 'companions';
    companions.slice(0, 2).forEach((c, i) => {
      const material = rigMaterial();
      const mesh = new THREE.Mesh(kittenGeometry(kittenCoat(c.coat), ELEMENT_COLOR[c.element]), material);
      mesh.name = `kitten-${i}`;
      mesh.scale.setScalar(KITTEN_SCALE);
      const tag = nameTag(c.name, ELEMENT_COLOR[c.element]);
      this.group.add(mesh, tag);
      this.kittens.push({ c, mesh, rig: material.userData.rig, material, tag, pos: new THREE.Vector3(), yaw: 0, phase: i * 2.1, walk: 0, napping: true });
    });
    this.group.userData.count = this.kittens.length;
  }

  get count(): number {
    return this.kittens.length;
  }

  update(frame: ViewFrame | null, dt: number): void {
    this.time += dt;
    if (!frame || this.kittens.length === 0) return;
    let fountain: ViewEntity | null = null;
    const front: (ViewEntity | null)[] = [null, null];
    for (const e of frame.entities) {
      if (e.team !== this.myTeam) continue;
      if (e.kind === 'fountain') fountain = e;
      else if (e.kind === 'minion' && e.variant === 'melee' && e.state !== 'dead') {
        const li = e.lane === 'puddle' ? 1 : 0;
        const f = front[li];
        // the front minion: furthest from our fountain
        if (!f || (fountain ? dist2(e, fountain) > dist2(f, fountain) : e.id < f.id)) front[li] = e;
      }
    }
    this.kittens.forEach((k, i) => {
      const lead = front[LANES[i] === 'puddle' ? 1 : 0];
      let tx: number;
      let tz: number;
      if (lead) {
        // trot a little behind and beside the lead minion
        const back = lead.yaw + Math.PI;
        tx = toX(lead.fx) + Math.cos(back) * 1.1 + Math.sin(back) * 0.6;
        tz = toZ(lead.fy) - Math.sin(back) * 1.1 + Math.cos(back) * 0.6;
      } else if (fountain) {
        tx = toX(fountain.fx) + (i === 0 ? 1.4 : -1.4);
        tz = toZ(fountain.fy) + 1.6;
      } else return;
      const dx = tx - k.pos.x;
      const dz = tz - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (k.pos.lengthSq() === 0 || d > 25) k.pos.set(tx, 0, tz);
      else if (d > 0.05) {
        const step = Math.min(d, dt * 6);
        k.pos.x += (dx / d) * step;
        k.pos.z += (dz / d) * step;
        k.yaw = Math.atan2(-dz, dx);
      }
      const moving = d > 0.15;
      k.napping = !lead && !moving;
      k.walk += ((moving ? 1 : 0) - k.walk) * Math.min(1, dt * 8);
      k.phase += dt * (moving ? 10 : 1.2);
      const breathe = k.napping ? 1 + Math.sin(this.time * 1.6 + i) * 0.03 : 1;
      k.mesh.position.set(k.pos.x, k.napping ? -0.12 : Math.abs(Math.sin(k.phase)) * 0.05 * k.walk, k.pos.z);
      k.mesh.rotation.set(0, k.yaw, 0);
      k.mesh.scale.set(KITTEN_SCALE, KITTEN_SCALE * (k.napping ? 0.78 : 1) * breathe, KITTEN_SCALE);
      k.rig.uTime.value = this.time + i;
      k.rig.uPhase.value = k.phase;
      k.rig.uWalk.value = k.walk;
      k.tag.position.set(k.pos.x, k.napping ? 0.95 : 1.15, k.pos.z);
    });
  }

  dispose(): void {
    for (const k of this.kittens) {
      k.material.dispose();
      k.mesh.geometry.dispose();
      (k.tag.material as THREE.SpriteMaterial).map?.dispose();
      k.tag.material.dispose();
    }
    this.kittens = [];
    this.group.clear();
  }
}

function dist2(a: { fx: number; fy: number }, b: { fx: number; fy: number }): number {
  const dx = a.fx - b.fx;
  const dy = a.fy - b.fy;
  return dx * dx + dy * dy;
}
