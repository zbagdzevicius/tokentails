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
import { ELEMENT_COLOR, lookKey, type Look } from '../cosmetics';
import { boldRingTexture, DecalLayer, discTexture, ringTexture } from './decals';
import { HERO_RING } from './models';
import { DETAIL, makeHero, type Character, type CharState } from '../chars';
import { getSkin, isCardSkinId } from '../skins/skinStore';
import { TierFx, type FxHero } from '../skins/tierFx';
import { cardFxFor, type CardFx } from '../skins/cardFx';
import { mixColor } from '../cosmetics';

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

/** The player's own ring is this much larger than a relation ring (it sits outside the hero's footprint). */
export const SELF_RING_SCALE = 1.15;
/** Seconds between the own ring's outward pings. */
const SELF_PING = 1.3;

/** Sim v9 status glows underfoot: Avietė's charge (her sparks) and a charm (Gabė's hearts). */
const CHARGE_GLOW = 0xffe24d;
const CHARM_GLOW = 0xff6fa8;

/** Wrap an angle difference to -PI..PI. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The animation state a hero snapshot implies. */
export function charState(e: Pick<ViewEntity, 'state' | 'buffs' | 'speed' | 'charmed'>): CharState {
  if (e.state === 'dead') return 'dead';
  if (e.state === 'napping') return 'napping';
  if (e.buffs & BuffFlag.Stunned) return 'stunned';
  // Sim v9: a charmed hero walks to its charmer (Gabė's Under Her Spell), it does not cower.
  if (e.buffs & BuffFlag.Feared) return e.charmed ? 'moving' : 'feared';
  if (e.buffs & BuffFlag.Blocking) return 'blocking';
  if (e.buffs & BuffFlag.Channeling) return 'channel';
  return (e.speed * 30) / 1000 > 0.35 ? 'moving' : 'idle';
}

export class HeroView {
  readonly group = new THREE.Group();
  private rigs = new Map<number, HeroRig>();
  // Normal blending: an additive red ring on sand reads yellow, like an ally's (enemy rings must read red).
  private rings = new DecalLayer(ringTexture(), 8, { additive: false, y: 0.05, name: 'hero-rings' });
  /** Round 0: a chroma reads at match zoom: a soft element-coloured glow underfoot, pulsing with the stride. */
  private auras = new DecalLayer(discTexture(), 8, { additive: true, y: 0.045, renderOrder: 1, name: 'hero-chroma' });
  /**
   * The player's own hero (brawl readability): a thick gold ring on an ink band, breathing, plus a ping ring that
   * rolls outward every SELF_PING s. Both draw after every VFX layer (renderOrder 9; particles 6–7, shockwaves 4–7),
   * so sparks and shockwaves never bury them; the depth test stays on, so the hero's body still sits in front.
   */
  private selfRing = new DecalLayer(boldRingTexture(), 1, { y: 0.065, renderOrder: 9, name: 'hero-self-ring' });
  private selfPing = new DecalLayer(ringTexture(), 1, { additive: true, y: 0.06, renderOrder: 9, name: 'hero-self-ping' });
  private time = 0;
  mySlot = 0;
  myTeam: 0 | 1 = 0;
  shadows = true;
  /** Mesh detail and the outline hull (quality tier: Low is lighter and has no hull, POC.md §10). */
  detail: number = DETAIL.med;
  outlines = true;
  /** Render-only looks per hero slot (the player's cosmetics; bots wear the default). */
  looks = new Map<number, Look>();
  /** Card skin rarity effects (render/skins/tierFx.ts); null = none (the lobby). GameView sets it with its particles. */
  tierFx: TierFx | null = null;
  /** The camera focus (m) for the team-fight test. */
  focus = { x: 0, z: 0 };
  private readonly fxHero: FxHero = { id: 0, x: 0, z: 0, rung: 'COMMON', element: 'FIRE', self: false, moving: false, stealth: false, dead: false, napping: false, phase: 0 };
  private readonly fxPos: { x: number; z: number; dead: boolean }[] = Array.from({ length: 8 }, () => ({ x: 0, z: 0, dead: true }));
  /** Wave C (C4): per slot, the last drawn frame's team and stealth, and a reused CardFx. */
  private readonly slotTeam = new Uint8Array(16);
  private readonly slotStealth = new Uint8Array(16);
  private readonly cardOut: CardFx[] = Array.from({ length: 16 }, () => ({ rung: 'COMMON', name: '', tint: 0, self: false, team: 0, extras: false }));

  constructor() {
    this.group.name = 'heroes';
    this.group.add(this.rings.mesh);
    this.group.add(this.auras.mesh);
    this.group.add(this.selfRing.mesh, this.selfPing.mesh);
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
    const self = e.id === this.mySlot;
    const key = `${hero}:${team}:${lookKey(look)}:${this.detail}:${this.outlines ? 1 : 0}:${self ? 1 : 0}`;
    if (r && r.key !== key) {
      this.drop(r);
      r = undefined;
    }
    if (!r) {
      const ch = makeHero(hero, team, look, { detail: this.detail, outline: this.outlines, shadows: this.shadows, match: true, self });
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
    this.auras.begin();
    this.selfRing.begin();
    this.selfPing.begin();
    const fx = this.tierFx;
    if (fx) {
      let n = 0;
      for (const e of frame.entities) {
        if (e.kind !== 'hero' || n >= this.fxPos.length) continue;
        const q = this.fxPos[n++];
        q.x = toX(e.fx);
        q.z = toZ(e.fy);
        q.dead = e.state === 'dead';
      }
      for (let i = n; i < this.fxPos.length; i++) this.fxPos[i].dead = true;
      fx.begin(dt, this.focus.x, this.focus.z, this.fxPos);
    }
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
      if (e.id >= 0 && e.id < 16) {
        this.slotTeam[e.id] = e.team === 1 ? 1 : 0;
        this.slotStealth[e.id] = stealth ? 1 : 0;
      }
      const want = stealth ? 0.42 : 1;
      if (u.uOpacity.value !== want) {
        u.uOpacity.value = want;
        ch.material.transparent = want < 1;
        ch.material.needsUpdate = true;
        if (ch.outline) ch.outline.visible = want === 1;
      }
      // card skins (GDD §7.2): Epic glints, Legendary foil and recall flourish; never an aura
      const lookCoat = this.looks.get(e.id)?.coat;
      const skin = fx && isCardSkinId(lookCoat) ? getSkin(lookCoat) : null;
      if (fx && skin) {
        const h = this.fxHero;
        h.id = e.id;
        h.x = x;
        h.z = z;
        h.rung = skin.rung;
        h.element = skin.element;
        h.self = e.id === this.mySlot;
        h.moving = charState(e) === 'moving';
        h.stealth = stealth;
        h.dead = dead;
        h.napping = e.state === 'napping';
        h.phase = ch.anim.stridePhase;
        const foil = fx.hero(h);
        u.uFoil.value = foil;
        if (foil > 0) u.uFoilColor.value.setHex(mixColor(0xffffff, ELEMENT_COLOR[skin.element], 0.5));
      } else u.uFoil.value = 0;
      if (!dead) {
        const rel = this.relationOf(e);
        if (rel === 'self') {
          const size = HERO_RING[r.hero] * SELF_RING_SCALE;
          this.selfRing.add(x, z, size * (1 + Math.sin(this.time * 5) * 0.035), RELATION.self, 0.92 + Math.sin(this.time * 5) * 0.08);
          const ph = (this.time % SELF_PING) / SELF_PING;
          this.selfPing.add(x, z, size * (1 + ph * 0.6), RELATION.self, (1 - ph) * 0.9);
        } else this.rings.add(x, z, HERO_RING[r.hero], RELATION[rel], 0.75);
        const chroma = this.looks.get(e.id)?.chroma;
        if (chroma && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * 1.45, ELEMENT_COLOR[chroma], 0.55 + Math.sin(this.time * 3 + e.id) * 0.12);
        // Sim v9: Avietė's charge (a fast spark flicker both teams see: the counterplay) and a charmed hero's pink glow.
        if (e.charged && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * 1.7, CHARGE_GLOW, 0.75 + Math.sin(this.time * 14 + e.id) * 0.25);
        if (e.charmed) this.auras.add(x, z, HERO_RING[r.hero] * 1.5, CHARM_GLOW, 0.7 + Math.sin(this.time * 6) * 0.2);
      }
    }
    for (const [id, r] of this.rigs) {
      if (!seen.has(id)) {
        r.ch.object.visible = false;
        r.visible = false;
      }
    }
    fx?.end();
    this.rings.end();
    this.auras.end();
    this.selfRing.end();
    this.selfPing.end();
  }

  /**
   * Wave C (C4): what hero `id`'s card skin adds (render/skins/cardFx.ts), as the Skin effects setting allows: Off
   * hides every card, Mine only hides the others'. Tints always; the extras follow tierFx's caps (another hero's only
   * on Med / High and outside a team fight; never from a stealthed hero). Reuses one object per slot.
   */
  cardOf(id: number): CardFx | null {
    if (id < 0 || id >= 16) return null;
    const fx = this.tierFx;
    const mode = fx?.mode ?? 'all';
    const self = id === this.mySlot;
    if (mode === 'off' || (mode === 'mine' && !self)) return null;
    const coat = this.looks.get(id)?.coat;
    const skin = isCardSkinId(coat) ? getSkin(coat) : null;
    const extras = this.slotStealth[id] === 0 && (self || (!(fx?.low ?? false) && !(fx?.teamFight ?? false)));
    return cardFxFor(skin, self, this.slotTeam[id] === 1 ? 1 : 0, extras, this.cardOut[id]);
  }

  dispose(): void {
    for (const r of [...this.rigs.values()]) this.drop(r);
    this.rings.dispose();
    this.auras.dispose();
    this.selfRing.dispose();
    this.selfPing.dispose();
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
