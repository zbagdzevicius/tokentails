/**
 * Heroes: one upright PPK-style character per slot (render/chars/: one skinned mesh, plus an ink outline hull on Med
 * and High), a relation ring underfoot, and the animation the snapshots imply: facing from the interpolated yaw with
 * a turn lean, a gait whose phase follows ground distance, the per-hero attack and cast, hit flinch, held poses for
 * block / channel / stun / fear, the faint pose and sink on death, the nap pose while recalling, a respawn pop, and
 * stealth. Render only: reads interpolated ViewEntity data, never the sim.
 */
import * as THREE from 'three';
import { BuffFlag, type HeroId } from '../../sim/api';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { RELATION } from '../palette';
import { lookKey, type Look } from '../cosmetics';
import { DecalLayer, ringTexture } from './decals';
import { HERO_RING } from './models';
import { DETAIL, makeHero, type Character, type CharState } from '../chars';

export type Relation = 'self' | 'ally' | 'enemy' | 'neutral';

interface HeroRig {
  id: number;
  hero: HeroId;
  team: 0 | 1;
  key: string;
  ch: Character;
  yaw: number;
  deadT: number;
  wasDead: boolean;
  visible: boolean;
  flash: number;
  /** Last drawn position (m) for FX anchoring. */
  pos: THREE.Vector3;
}

/** Wrap an angle difference to -PI..PI. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The animation state a hero snapshot implies. */
export function charState(e: Pick<ViewEntity, 'state' | 'buffs' | 'speed'>): CharState {
  if (e.state === 'dead') return 'dead';
  if (e.state === 'napping') return 'napping';
  if (e.buffs & BuffFlag.Stunned) return 'stunned';
  if (e.buffs & BuffFlag.Feared) return 'feared';
  if (e.buffs & BuffFlag.Blocking) return 'blocking';
  if (e.buffs & BuffFlag.Channeling) return 'channel';
  return (e.speed * 30) / 1000 > 0.35 ? 'moving' : 'idle';
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
  /** Mesh detail and the outline hull (quality tier: Low is lighter and has no hull, POC.md §10). */
  detail: number = DETAIL.med;
  outlines = true;
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

  /** Quality tier: rebuilds the heroes at the new detail on their next frame. */
  setQuality(low: boolean, outlines: boolean): void {
    this.detail = low ? DETAIL.low : DETAIL.med;
    this.outlines = outlines;
  }

  private drop(r: HeroRig): void {
    this.group.remove(r.ch.object);
    r.ch.dispose();
    this.rigs.delete(r.id);
  }

  private ensure(e: ViewEntity): HeroRig {
    let r = this.rigs.get(e.id);
    const look = this.looks.get(e.id) ?? null;
    const hero = e.hero ?? 'clem';
    const team = (e.team === 1 ? 1 : 0) as 0 | 1;
    const key = `${hero}:${team}:${lookKey(look)}:${this.detail}:${this.outlines ? 1 : 0}`;
    if (r && r.key !== key) {
      this.drop(r);
      r = undefined;
    }
    if (!r) {
      const ch = makeHero(hero, team, look, { detail: this.detail, outline: this.outlines, shadows: this.shadows });
      // no outline hull (Low): a darker ink rim keeps the silhouette off the sand (ivory Clem faded into the lane)
      if (!this.outlines) ch.material.userData.u.uRim.value = 0.78;
      ch.object.name = `hero-${e.id}`;
      this.group.add(ch.object);
      r = { id: e.id, hero, team, key, ch, yaw: e.yaw, deadT: 0, wasDead: e.state === 'dead', visible: true, flash: 0, pos: new THREE.Vector3(toX(e.fx), 0, toZ(e.fy)) };
      this.rigs.set(e.id, r);
    }
    return r;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const r of this.rigs.values()) r.ch.mesh.castShadow = on;
  }

  /** A basic attack or ability swing by `id`. */
  swing(id: number): void {
    this.rigs.get(id)?.ch.anim.swing();
  }

  /** A cast pose by `id`. */
  cast(id: number): void {
    this.rigs.get(id)?.ch.anim.cast();
  }

  /** Play an emote pose on hero `id` (render only). Returns false when that hero is not drawn. */
  emote(id: number, pose: string, seconds = 1.4): boolean {
    const r = this.rigs.get(id);
    if (!r || !r.visible) return false;
    r.ch.anim.emote(pose, seconds);
    return true;
  }

  hit(id: number, heavy = false): void {
    const r = this.rigs.get(id);
    if (!r) return;
    r.flash = heavy ? 1 : 0.75;
    r.ch.anim.hit(heavy);
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
      const ch = r.ch;
      const dead = e.state === 'dead';
      const x = toX(e.fx);
      const z = toZ(e.fy);
      r.pos.set(x, 0, z);
      if (dead && !r.wasDead) r.deadT = 0;
      if (!dead && r.wasDead) ch.anim.respawn();
      r.wasDead = dead;
      if (dead) r.deadT += dt;
      // facing: the interpolated yaw, with the yaw rate for the turn lean
      const dyaw = dead ? 0 : wrap(e.yaw - r.yaw);
      const yawRate = dt > 0 ? dyaw / dt : 0;
      r.yaw = dead ? r.yaw : e.yaw;
      ch.anim.update(dt, { state: charState(e), speed: (e.speed * 30) / 1000, height: ch.height, yawRate });
      const sink = dead ? Math.max(0, (r.deadT - 1.2) * 0.8) : 0;
      r.visible = !(dead && r.deadT > 2.6);
      ch.object.visible = r.visible;
      ch.object.position.set(x, -sink, z);
      ch.object.rotation.y = r.yaw;
      r.flash = Math.max(0, r.flash - dt * 5);
      const u = ch.material.userData.u;
      const fall = dead ? Math.min(1, r.deadT / 0.35) : 0;
      // the hit flash is capped so it never washes out the coat (a flashing pug read as a pale-pink blob)
      u.uFlashK.value = dead ? 0.35 * fall : Math.min(0.42, r.flash * 0.5);
      u.uFlash.value.setHex(dead ? 0x6b6b80 : 0xffffff);
      const stealth = (e.buffs & BuffFlag.Stealth) !== 0;
      const want = stealth ? 0.42 : 1;
      if (u.uOpacity.value !== want) {
        u.uOpacity.value = want;
        ch.material.transparent = want < 1;
        ch.material.needsUpdate = true;
        if (ch.outline) ch.outline.visible = want === 1;
      }
      if (!dead) {
        const rel = this.relationOf(e);
        const pulse = rel === 'self' ? 0.85 + Math.sin(this.time * 4) * 0.15 : 0.75;
        this.rings.add(x, z, HERO_RING[r.hero], RELATION[rel], pulse);
      }
    }
    for (const [id, r] of this.rigs) {
      if (!seen.has(id)) {
        r.ch.object.visible = false;
        r.visible = false;
      }
    }
    this.rings.end();
  }

  dispose(): void {
    for (const r of [...this.rigs.values()]) this.drop(r);
    this.rings.dispose();
  }
}

export interface LobbyHero {
  /** Place and turn this (it faces +X at rotation.y 0, like the match models). */
  object: THREE.Group;
  /** The character (animator, mesh) for idle life and the hop. */
  ch: Character;
  dispose(): void;
}

/** A standalone hero for the lobby turntable, the results screen and the portraits (full detail, outlined). */
export function lobbyHero(hero: HeroId, team: 0 | 1 = 0, look?: Look | null, o: { outline?: boolean } = {}): LobbyHero {
  const ch = makeHero(hero, team, look ?? null, { detail: DETAIL.lobby, outline: o.outline ?? true, shadows: true });
  return { object: ch.object, ch, dispose: () => ch.dispose() };
}
