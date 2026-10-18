/**
 * Pickups on the ground (fun plan S9 / F2 item 8): Frenzy Catnip (a spinning green gem) and Fish Snack (an orange
 * fish), each with a glowing ground ring and a light beam so they read from across the screen. Driven by the
 * `pickupSpawn` / `pickup` events, and by `pickup` entities when the snapshot carries them (then those win).
 * Render only; cheap (shared geometry, basic materials, at most CAPS.pickups items).
 */
import * as THREE from 'three';
import type { PickupKind } from '../feelEvents';

interface Item {
  key: string;
  kind: PickupKind;
  x: number;
  z: number;
  root: THREE.Group;
  body: THREE.Object3D;
  ring: THREE.Mesh;
  t: number;
  /** Spawned via an event (removed by a `pickup` event) or seen as an entity this frame. */
  fromEntity: boolean;
}

const COLOR: Record<PickupKind, number> = { frenzy: 0x7dff8a, snack: 0xffa64d };

export class PickupView {
  readonly group = new THREE.Group();
  private readonly items = new Map<string, Item>();
  private readonly gem = new THREE.OctahedronGeometry(0.42, 0);
  private readonly fish = new THREE.SphereGeometry(0.3, 12, 8);
  private readonly tail = new THREE.ConeGeometry(0.22, 0.32, 4);
  private readonly ringGeo = new THREE.RingGeometry(0.75, 1.0, 32);
  private readonly beamGeo = new THREE.CylinderGeometry(0.12, 0.3, 6, 8, 1, true);
  private readonly mats: Record<PickupKind, { body: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial }> = {
    frenzy: this.makeMats('frenzy'),
    snack: this.makeMats('snack'),
  };
  private time = 0;

  constructor() {
    this.group.name = 'pickups';
  }

  private makeMats(k: PickupKind): { body: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial } {
    return {
      body: new THREE.MeshBasicMaterial({ color: COLOR[k] }),
      glow: new THREE.MeshBasicMaterial({ color: COLOR[k], transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    };
  }

  private make(key: string, kind: PickupKind, x: number, z: number, fromEntity: boolean): Item {
    const root = new THREE.Group();
    const m = this.mats[kind];
    let body: THREE.Object3D;
    if (kind === 'frenzy') body = new THREE.Mesh(this.gem, m.body);
    else {
      const g = new THREE.Group();
      const b = new THREE.Mesh(this.fish, m.body);
      b.scale.set(1.5, 0.8, 0.6);
      const t = new THREE.Mesh(this.tail, m.body);
      t.rotation.z = Math.PI / 2;
      t.position.x = -0.55;
      g.add(b, t);
      body = g;
    }
    body.position.y = 0.9;
    const ring = new THREE.Mesh(this.ringGeo, m.glow);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const beam = new THREE.Mesh(this.beamGeo, m.glow);
    beam.position.y = 3;
    root.add(body, ring, beam);
    root.position.set(x, 0, z);
    this.group.add(root);
    const it: Item = { key, kind, x, z, root, body, ring, t: 0, fromEntity };
    this.items.set(key, it);
    return it;
  }

  /** `pickupSpawn` (sim mm). */
  spawn(index: number, kind: PickupKind, xMm: number, yMm: number): void {
    const key = `e${index}`;
    this.remove(key);
    this.make(key, kind, xMm / 1000, -yMm / 1000, false);
  }

  /** `pickup`: the hero at (x, z) m took one of `kind`: the nearest one within 5 m goes. */
  take(kind: PickupKind, x: number, z: number): void {
    let best: Item | null = null;
    let bd = 25;
    for (const it of this.items.values()) {
      if (it.kind !== kind) continue;
      const d = (it.x - x) ** 2 + (it.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    if (best) this.remove(best.key);
  }

  /** Pickup entities from the snapshot (when the host sends them): they replace the event-driven ones. */
  sync(entities: readonly { id: number; kind: string; variant?: string; sub?: string; x: number; y: number; state: string }[]): void {
    const seen = new Set<string>();
    let any = false;
    for (const e of entities) {
      if ((e.kind as string) !== 'pickup' || e.state === 'dead') continue;
      any = true;
      const kind: PickupKind = (e.sub ?? e.variant) === 'snack' ? 'snack' : 'frenzy';
      const key = `n${e.id}`;
      seen.add(key);
      if (!this.items.has(key)) this.make(key, kind, e.x / 1000, -e.y / 1000, true);
    }
    if (!any) {
      for (const it of [...this.items.values()]) if (it.fromEntity) this.remove(it.key);
      return;
    }
    for (const it of [...this.items.values()]) if (!seen.has(it.key)) this.remove(it.key);
  }

  private remove(key: string): void {
    const it = this.items.get(key);
    if (!it) return;
    this.group.remove(it.root);
    this.items.delete(key);
  }

  /** Where the pickups are (sim mm), for the minimap. */
  list(): { x: number; y: number; kind: PickupKind }[] {
    return [...this.items.values()].map((it) => ({ x: it.x * 1000, y: -it.z * 1000, kind: it.kind }));
  }

  get count(): number {
    return this.items.size;
  }

  update(dt: number): void {
    this.time += dt;
    for (const it of this.items.values()) {
      it.t += dt;
      const pop = Math.min(1, it.t * 4);
      it.body.rotation.y = this.time * 2.2;
      it.body.position.y = 0.9 + Math.sin(this.time * 3 + it.x) * 0.15;
      it.body.scale.setScalar(pop * (it.kind === 'frenzy' ? 1 : 1.1));
      const pulse = 1 + Math.sin(this.time * 4) * 0.08;
      it.ring.scale.setScalar(pulse * pop);
    }
  }

  dispose(): void {
    for (const k of [...this.items.keys()]) this.remove(k);
    this.gem.dispose();
    this.fish.dispose();
    this.tail.dispose();
    this.ringGeo.dispose();
    this.beamGeo.dispose();
    for (const m of Object.values(this.mats)) {
      m.body.dispose();
      m.glow.dispose();
    }
  }
}
