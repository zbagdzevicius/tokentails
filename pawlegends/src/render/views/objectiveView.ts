/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md §8.7): the pool maps' objective props, a lazy chunk loaded only on Lanternfall
 * Ridge, Twinbark Thicket, Geode Quarry and Pawball Park. Built from primitives in our toon palette (no textures, no
 * models): the Fish Mill (a stone ring and a turning water wheel), the Paw Shrines (a pillar with an owner-coloured
 * flame), the Geode (a crystal cluster; gems as small instanced octahedrons, a gem over each carrier's head), the goals
 * (posts, crossbar and net) and the crates (boxes that crack). Each prop stays under 2.5 m so the fixed camera never
 * loses a hero behind one. Render only: reads the snapshot's `obj`.
 */
import * as THREE from 'three';
import { ACTIVE_MAP, MAP } from '../../data/map';
import type { ObjSnap } from '../../sim/api';
import { toX, toZ } from '../coords';

export interface ObjectiveView {
  readonly group: THREE.Group;
  update(obj: ObjSnap | undefined, heroes: readonly { id: number; fx: number; fy: number; state: string }[], myTeam: number, dt: number): void;
  dispose(): void;
}

const ALLY = 0x4fb6ff;
const ENEMY = 0xff4f6b;
const NEUTRAL = 0xffd34a;
const STONE = 0xcfc3ad;
const WOOD = 0x9a6a40;
const GEM = 0x7cf0c8;

export function createObjectiveView(): ObjectiveView {
  const group = new THREE.Group();
  group.name = 'objective';
  const o = ACTIVE_MAP.objective;
  const trash: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    trash.push(x);
    return x;
  };
  const mat = (color: number, emissive = 0): THREE.MeshLambertMaterial => keep(new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: emissive ? 0.6 : 0 }));
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const me = new THREE.Mesh(keep(geo), m);
    me.position.set(x, y, z);
    me.castShadow = true;
    me.receiveShadow = true;
    group.add(me);
    return me;
  };
  /** A flat ring on the ground (capture progress), drawn as a thin torus segment. */
  const ring = (x: number, z: number, r: number): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; set(p: number, color: number): void } => {
    const m = keep(new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.85, depthWrite: false }));
    const me = new THREE.Mesh(keep(new THREE.RingGeometry(r - 0.18, r, 48, 1, 0, Math.PI * 2)), m);
    me.rotation.x = -Math.PI / 2;
    me.position.set(x, 0.05, z);
    group.add(me);
    let last = -1;
    return {
      mesh: me,
      mat: m,
      set(p, color) {
        const q = Math.round(Math.max(0, Math.min(1, p)) * 48);
        if (q !== last) {
          last = q;
          me.geometry.dispose();
          me.geometry = keep(new THREE.RingGeometry(r - 0.18, r, 48, 1, Math.PI / 2, (Math.PI * 2 * Math.max(q, 0.001)) / 48));
        }
        m.color.setHex(color);
        me.visible = q > 0;
      },
    };
  };
  const teamColor = (t: number, my: number): number => (t < 0 ? NEUTRAL : t === my ? ALLY : ENEMY);
  let time = 0;

  // ---------------------------------------------------------------- mill
  let wheel: THREE.Group | null = null;
  let millRing: ReturnType<typeof ring> | null = null;
  let millGlow: THREE.MeshLambertMaterial | null = null;
  if (o?.kind === 'mill') {
    const x = toX(o.x);
    const z = toZ(o.y);
    const stone = mat(STONE);
    const base = mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.5, 18), stone, x, 0.25, z);
    base.name = 'mill-base';
    millGlow = mat(0xfff0b0, 0xffb347);
    mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.12, 18), millGlow, x, 0.52, z);
    const w = new THREE.Group();
    const wm = mat(WOOD);
    const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(1.25, 0.12, 6, 20)), wm);
    w.add(rim);
    for (let k = 0; k < 8; k++) {
      const spoke = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 2.4, 0.3)), wm);
      spoke.rotation.z = (k * Math.PI) / 8;
      w.add(spoke);
    }
    w.position.set(x, 1.45, z - 1.6);
    group.add(w);
    wheel = w;
    for (const dx of [-2.6, 2.6]) {
      mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6), wm, x + dx, 1.1, z + 1.8);
      mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0xffe08a, 0xffb347), x + dx, 2.3, z + 1.8);
    }
    millRing = ring(x, z, o.r / 1000);
  }

  // ---------------------------------------------------------------- shrines
  const flames: THREE.MeshLambertMaterial[] = [];
  const shrineRings: ReturnType<typeof ring>[] = [];
  if (o?.kind === 'shrines') {
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? o.x : MAP.width - o.x;
      const x = toX(sx);
      const z = toZ(o.y);
      mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.3, 16), mat(STONE), x, 0.15, z);
      mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), mat(0xe9dcc0), x, 1.1, z);
      const f = mat(NEUTRAL, NEUTRAL);
      flames.push(f);
      const flame = mesh(new THREE.ConeGeometry(0.42, 0.9, 8), f, x, 2.3, z);
      flame.castShadow = false;
      shrineRings.push(ring(x, z, o.r / 1000));
    }
  }

  // ---------------------------------------------------------------- gems
  let gems: THREE.InstancedMesh | null = null;
  let carried: THREE.InstancedMesh | null = null;
  const MAXG = 20;
  if (o?.kind === 'gems') {
    const x = toX(o.x);
    const z = toZ(o.y);
    const crystal = mat(0x9ff6dc, 0x2fbf9a);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const c = mesh(new THREE.OctahedronGeometry(0.45 + (k % 3) * 0.12, 0), crystal, x + Math.cos(a) * 0.55, 0.6 + (k % 2) * 0.25, z + Math.sin(a) * 0.55);
      c.scale.set(0.7, 1.6, 0.7);
      c.rotation.set(Math.cos(a) * 0.3, a, Math.sin(a) * 0.3);
    }
    mesh(new THREE.OctahedronGeometry(0.7, 0), crystal, x, 1.1, z).scale.set(0.8, 1.8, 0.8);
    const gm = mat(GEM, 0x1fa77a);
    gems = new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(0.28, 0)), gm, MAXG);
    gems.count = 0;
    gems.name = 'gems';
    group.add(gems);
    carried = new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(0.22, 0)), gm, 6);
    carried.count = 0;
    group.add(carried);
  }

  // ---------------------------------------------------------------- goals and crates
  const crates: THREE.Mesh[] = [];
  const crateMats: THREE.MeshLambertMaterial[] = [];
  if (o?.kind === 'goal' && ACTIVE_MAP.goalMouth && ACTIVE_MAP.crates) {
    const g = ACTIVE_MAP.goalMouth;
    const post = mat(0xfff3e3);
    const net = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    for (const flip of [false, true]) {
      const fx = (x: number): number => toX(flip ? MAP.width - x : x);
      const front = fx(g[2]);
      const back = fx(g[0] - 600);
      for (const y of [g[1], g[3]]) mesh(new THREE.CylinderGeometry(0.12, 0.12, 2, 8), post, front, 1, toZ(y));
      const bar = mesh(new THREE.CylinderGeometry(0.1, 0.1, (g[3] - g[1]) / 1000, 8), post, front, 2, toZ((g[1] + g[3]) / 2));
      bar.rotation.x = Math.PI / 2;
      const n = mesh(new THREE.PlaneGeometry(Math.abs(front - back), (g[3] - g[1]) / 1000), net, (front + back) / 2, 1.8, toZ((g[1] + g[3]) / 2));
      n.rotation.x = -Math.PI / 2;
      n.castShadow = false;
    }
    const all = ACTIVE_MAP.crates;
    for (let k = 0; k < all.length * 2; k++) {
      const c = all[k % all.length];
      const x0 = k < all.length ? c[0] : MAP.width - c[2];
      const x1 = k < all.length ? c[2] : MAP.width - c[0];
      const m = mat(0xc08a56);
      crateMats.push(m);
      const box = mesh(new THREE.BoxGeometry((x1 - x0) / 1000, 1.1, (c[3] - c[1]) / 1000), m, toX((x0 + x1) / 2), 0.55, toZ((c[1] + c[3]) / 2));
      box.name = 'crate';
      crates.push(box);
    }
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);

  return {
    group,
    update(obj, heroes, myTeam, dt) {
      time += dt;
      if (!obj) return;
      if (obj.mill && wheel) {
        const st = obj.mill.state;
        wheel.rotation.z -= dt * (st === 'open' ? 1.6 : 0.2);
        if (millGlow) millGlow.emissiveIntensity = st === 'open' ? 0.4 + 0.4 * Math.min(1, obj.mill.pot / 360) : 0.05;
        millRing?.set(obj.mill.progTeam >= 0 ? obj.mill.prog / obj.mill.need : 0, teamColor(obj.mill.progTeam, myTeam));
      }
      if (obj.shrines) {
        obj.shrines.forEach((s, i) => {
          const f = flames[i];
          if (!f) return;
          const c = teamColor(s.owner, myTeam);
          f.color.setHex(c);
          f.emissive.setHex(c);
          f.emissiveIntensity = 0.5 + 0.2 * Math.sin(time * 6 + i);
          shrineRings[i]?.set(s.progTeam >= 0 ? s.prog / 90 : 0, teamColor(s.progTeam, myTeam));
        });
      }
      if (obj.gems && gems && carried) {
        const gl = obj.gems.ground;
        gems.count = Math.min(MAXG, gl.length);
        for (let i = 0; i < gems.count; i++) {
          q.setFromAxisAngle(v.set(0, 1, 0), time * 2 + i);
          m4.compose(v.set(toX(gl[i].x), 0.45 + 0.12 * Math.sin(time * 3 + i), toZ(gl[i].y)), q, sc);
          gems.setMatrixAt(i, m4);
        }
        gems.instanceMatrix.needsUpdate = true;
        let n = 0;
        for (const h of heroes) {
          if (h.id >= 6 || h.state === 'dead' || (obj.gems.carried[h.id] ?? 0) <= 0) continue;
          q.setFromAxisAngle(v.set(0, 1, 0), time * 3);
          const s = 1 + Math.min(1.2, obj.gems.carried[h.id] * 0.12);
          m4.compose(v.set(toX(h.fx), 2.7, toZ(h.fy)), q, new THREE.Vector3(s, s, s));
          carried.setMatrixAt(n++, m4);
        }
        carried.count = n;
        carried.instanceMatrix.needsUpdate = true;
      }
      if (obj.goal) {
        obj.goal.crates.forEach((hits, k) => {
          const c = crates[k];
          if (!c) return;
          c.visible = hits > 0;
          crateMats[k].color.setHex(hits >= 2 ? 0xc08a56 : 0x8f6440);
        });
      }
    },
    dispose() {
      group.removeFromParent();
      for (const d of trash) d.dispose();
    },
  };
}
