/**
 * Heroes: one rigged procedural model per slot (one draw call each), a relation ring underfoot, and the animation
 * state the snapshots imply (walk cycle, attack swing, cast pose, hit flash, death tumble, respawn pop, stealth).
 * Render only: reads interpolated ViewEntity data, never the sim.
 */
import * as THREE from 'three';
import { BuffFlag, type HeroId } from '../../sim/api';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { RELATION } from '../palette';
import { lookKey, type Look } from '../cosmetics';
import { DecalLayer, ringTexture } from './decals';
import { HERO_SCALE, heroGeometry } from './models';
import { rigMaterial, type RigUniforms } from './rig';

export type Relation = 'self' | 'ally' | 'enemy' | 'neutral';

interface HeroRig {
  id: number;
  hero: HeroId;
  team: 0 | 1;
  look: string;
  mesh: THREE.Mesh;
  rig: RigUniforms;
  material: THREE.MeshLambertMaterial;
  phase: number;
  walk: number;
  swing: number;
  swingT: number;
  cast: number;
  castT: number;
  flash: number;
  deadT: number;
  wasDead: boolean;
  pop: number;
  visible: boolean;
  /** Last drawn position (m) for FX anchoring. */
  pos: THREE.Vector3;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geoFor(hero: HeroId, team: 0 | 1, look?: Look | null): THREE.BufferGeometry {
  const k = `${hero}:${team}:${lookKey(look)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = heroGeometry(hero, team, look ?? undefined);
    geoCache.set(k, g);
  }
  return g;
}

export class HeroView {
  readonly group = new THREE.Group();
  private rigs = new Map<number, HeroRig>();
  // Normal blending: an additive red ring on sand reads yellow, like an ally's (enemy rings must read red).
  private rings = new DecalLayer(ringTexture(), 8, { additive: false, y: 0.05, name: 'hero-rings' });
  private time = 0;
  mySlot = 0;
  myTeam: 0 | 1 = 0;
  shadows = true;
  /** Render-only looks per hero slot (the player's cosmetics; bots wear the default). */
  looks = new Map<number, Look>();

  constructor() {
    this.group.name = 'heroes';
    this.group.add(this.rings.mesh);
  }

  relationOf(e: { id: number; team: number }): Relation {
    if (e.id === this.mySlot) return 'self';
    if (e.team === 2) return 'neutral';
    return e.team === this.myTeam ? 'ally' : 'enemy';
  }

  private ensure(e: ViewEntity): HeroRig {
    let r = this.rigs.get(e.id);
    const look = this.looks.get(e.id) ?? null;
    if (r && (r.hero !== e.hero || r.team !== e.team || r.look !== lookKey(look))) {
      this.group.remove(r.mesh);
      r.material.dispose();
      this.rigs.delete(e.id);
      r = undefined;
    }
    if (!r) {
      const hero = e.hero ?? 'clem';
      const team = (e.team === 1 ? 1 : 0) as 0 | 1;
      const material = rigMaterial();
      const mesh = new THREE.Mesh(geoFor(hero, team, look), material);
      mesh.name = `hero-${e.id}`;
      mesh.castShadow = this.shadows;
      mesh.scale.setScalar(HERO_SCALE[hero]);
      this.group.add(mesh);
      r = {
        id: e.id,
        hero,
        team,
        look: lookKey(look),
        mesh,
        rig: material.userData.rig,
        material,
        phase: e.id * 1.3,
        walk: 0,
        swing: 0,
        swingT: 1,
        cast: 0,
        castT: 1,
        flash: 0,
        deadT: 0,
        wasDead: e.state === 'dead',
        pop: 1,
        visible: true,
        pos: new THREE.Vector3(toX(e.fx), 0, toZ(e.fy)),
      };
      this.rigs.set(e.id, r);
    }
    return r;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const r of this.rigs.values()) r.mesh.castShadow = on;
  }

  /** A basic attack or ability swing by `id`. */
  swing(id: number): void {
    const r = this.rigs.get(id);
    if (r) r.swingT = 0;
  }

  /** A cast pose by `id`. */
  cast(id: number): void {
    const r = this.rigs.get(id);
    if (r) r.castT = 0;
  }

  hit(id: number, heavy = false): void {
    const r = this.rigs.get(id);
    if (r) r.flash = heavy ? 1 : 0.75;
  }

  /** Last drawn position (m) of a hero, for FX. */
  positionOf(id: number): THREE.Vector3 | null {
    const r = this.rigs.get(id);
    return r && r.visible ? r.pos : null;
  }

  update(frame: ViewFrame, dt: number): void {
    this.time += dt;
    const seen = new Set<number>();
    this.rings.begin();
    for (const e of frame.entities) {
      if (e.kind !== 'hero') continue;
      seen.add(e.id);
      const r = this.ensure(e);
      const dead = e.state === 'dead';
      const x = toX(e.fx);
      const z = toZ(e.fy);
      r.pos.set(x, 0, z);
      // walk cycle from the actual ground speed (mm per tick → m/s)
      const mps = (e.speed * 30) / 1000;
      const moving = !dead && mps > 0.4;
      r.walk += ((moving ? 1 : 0) - r.walk) * Math.min(1, dt * 10);
      r.phase += dt * (moving ? Math.max(6, mps * 2.4) : 2);
      r.swingT = Math.min(1, r.swingT + dt / 0.32);
      r.castT = Math.min(1, r.castT + dt / 0.45);
      r.swing = r.swingT < 1 ? Math.sin(Math.min(1, r.swingT / 0.55) * Math.PI * 0.5) * (1 - Math.max(0, (r.swingT - 0.55) / 0.45)) : 0;
      r.cast = r.castT < 1 ? Math.sin(r.castT * Math.PI) : 0;
      r.flash = Math.max(0, r.flash - dt * 5);
      // death tumble, respawn pop
      if (dead && !r.wasDead) r.deadT = 0;
      if (!dead && r.wasDead) r.pop = 0;
      r.wasDead = dead;
      if (dead) r.deadT += dt;
      r.pop = Math.min(1, r.pop + dt * 3.5);
      const pop = r.pop < 1 ? 1 + Math.sin(r.pop * Math.PI) * 0.35 - (1 - r.pop) * 0.6 : 1;
      const s = HERO_SCALE[r.hero] * Math.max(0.05, pop);
      const fall = dead ? Math.min(1, r.deadT / 0.35) : 0;
      const sink = dead ? Math.max(0, (r.deadT - 1.2) * 0.8) : 0;
      r.visible = !(dead && r.deadT > 2.6);
      r.mesh.visible = r.visible;
      const hop = r.walk * Math.abs(Math.sin(r.phase)) * 0.07 + r.cast * 0.25;
      const squash = 1 + r.walk * Math.sin(r.phase * 2) * 0.03 - r.swing * 0.05 + r.cast * 0.08;
      r.mesh.position.set(x, hop - sink, z);
      r.mesh.rotation.set(0, e.yaw, -fall * 1.45);
      r.mesh.scale.set(s, s * squash, s);
      const u = r.rig;
      u.uTime.value = this.time + r.id;
      u.uPhase.value = r.phase;
      u.uWalk.value = r.walk;
      u.uSwing.value = r.swing;
      u.uCast.value = r.cast;
      u.uFlashK.value = dead ? 0.35 * fall : r.flash * 0.85;
      u.uFlash.value.setHex(dead ? 0x6b6b80 : 0xffffff);
      const stealth = (e.buffs & BuffFlag.Stealth) !== 0;
      const want = stealth ? 0.42 : 1;
      if (u.uOpacity.value !== want) {
        u.uOpacity.value = want;
        r.material.transparent = want < 1;
        r.material.needsUpdate = true;
      }
      if (!dead) {
        const rel = this.relationOf(e);
        const pulse = rel === 'self' ? 0.85 + Math.sin(this.time * 4) * 0.15 : 0.75;
        this.rings.add(x, z, 1.45 * HERO_SCALE[r.hero], RELATION[rel], pulse);
      }
    }
    for (const [id, r] of this.rigs) {
      if (!seen.has(id)) {
        r.mesh.visible = false;
        r.visible = false;
      }
    }
    this.rings.end();
  }

  dispose(): void {
    for (const r of this.rigs.values()) r.material.dispose();
    this.rigs.clear();
    this.rings.dispose();
  }
}

/** A standalone hero model for the lobby turntable and the results screen. */
export function lobbyHero(hero: HeroId, team: 0 | 1 = 0, look?: Look | null): { mesh: THREE.Mesh; rig: RigUniforms; dispose(): void } {
  const material = rigMaterial();
  const mesh = new THREE.Mesh(geoFor(hero, team, look), material);
  mesh.scale.setScalar(HERO_SCALE[hero]);
  mesh.castShadow = true;
  return { mesh, rig: material.userData.rig, dispose: () => material.dispose() };
}
