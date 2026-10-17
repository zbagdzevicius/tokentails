/**
 * The match view: owns every render-side piece of a match (map, structures, minions, heroes, projectiles, FX,
 * telegraphs, juice) and draws one interpolated frame per animation frame. The camera follows the player's hero
 * unless the player pans it (edge pan, arrows, minimap); Space re-centres. Render only: no sim imports beyond types.
 */
import * as THREE from 'three';
import { loadZoom } from './camera/zoom';
import type { HeroId, SimEvent, TrickId } from '../sim/api';
import { sfx } from '../audio/sfx';
import { aimFor, trickAim, type AimSpec } from '../input/abilities';
import { Effects, type Who } from './effects';
import { Particles, SHAPE } from './fx/Particles.js';
import { Shockwaves } from './fx/Shockwaves.js';
import type { ViewEntity, ViewFrame } from './interp';
import { Juice } from './juice';
import { RELATION } from './palette';
import type { GameRenderer } from './renderer';
import { MOBA_DIST } from './renderer';
import { TelegraphPool, type TelegraphSpec } from './telegraph';
import { toX, toZ } from './coords';
import type { Companion } from '../meta/roster';
import type { Look } from './cosmetics';
import { CompanionView } from './views/companionView';
import { HeroView } from './views/heroView';
import { createMapView, type MapView } from './views/mapView';
import { MinionInstances } from './views/minionInstances';
import { ProjectileView } from './views/projectileView';
import { StructureView } from './views/towerView';

export interface AimPreview {
  spec: AimSpec;
  /** Aim point (m, three.js X/Z). */
  x: number;
  z: number;
  /** For unit aims: the target entity id, or -1. */
  target: number;
  valid: boolean;
}

export interface GameViewHooks {
  onKill?(e: Extract<SimEvent, { type: 'death' }>, victim: Who | null, killer: Who | null): void;
  onLevel?(level: number): void;
  onTalentOffer?(tier: number): void;
  onWindupAtMe?(): void;
  onTowerDown?(ours: boolean): void;
}

/**
 * Camera framing (m). The focus may run a few metres past the playable edge (the outer ground plane fills it), so a
 * hero at its fountain or in a lane corner stays near the middle of the screen instead of in a corner under the
 * minimap. `lead` is the look-ahead toward the enemy base, `below` shifts the focus south a little (the hero sits
 * slightly above centre, clear of the bottom bar).
 */
export const CAMERA_FRAME = Object.freeze({ minX: 0, maxX: 100, minZ: -62, maxZ: 2, lead: 4, below: 0.8 });
export const clampFocusX = (x: number): number => Math.min(CAMERA_FRAME.maxX, Math.max(CAMERA_FRAME.minX, x));
export const clampFocusZ = (z: number): number => Math.min(CAMERA_FRAME.maxZ, Math.max(CAMERA_FRAME.minZ, z));
const WHO_TTL = 3;
const _sw = new THREE.Vector3();

export class GameView {
  readonly scene: THREE.Scene;
  readonly map: MapView;
  readonly heroes = new HeroView();
  readonly minions = new MinionInstances();
  readonly structures = new StructureView();
  readonly projectiles: ProjectileView;
  readonly telegraphs = new TelegraphPool(20);
  readonly particles: Particles;
  readonly shock: Shockwaves;
  readonly juice: Juice;
  readonly effects: Effects;
  /** Companion Kittens (render only; set by `dress`). */
  companions: CompanionView | null = null;
  /** Ground point (m) the camera follows, and the player's pan offset from it. */
  readonly follow = new THREE.Vector3(5, 0, -30);
  readonly pan = new THREE.Vector3();
  /** True while the camera is panned away from the hero (Space or a new order clears it). */
  panned = false;
  mySlot = 0;
  myTeam: 0 | 1 = 0;
  tricks: TrickId[] = [];
  aim: AimPreview | null = null;
  frame: ViewFrame | null = null;
  private who = new Map<number, Who & { t: number }>();
  private time = 0;
  private lastMe: ViewEntity | null = null;

  constructor(
    readonly gr: GameRenderer,
    uiRoot: HTMLElement,
    hooks: GameViewHooks = {},
  ) {
    this.scene = gr.scene;
    this.map = createMapView();
    this.scene.add(this.map.group);
    this.particles = new Particles({ rng: Math.random, groundY: () => 0 });
    this.particles.attach(this.scene);
    this.shock = new Shockwaves(null, { particles: this.particles, groundY: () => 0, rng: Math.random });
    this.shock.init(this.scene);
    this.projectiles = new ProjectileView(this.particles);
    this.scene.add(this.heroes.group, this.minions.group, this.structures.group, this.projectiles.group, this.telegraphs.group);
    this.juice = new Juice(uiRoot);
    const self = this;
    const numbersCtx = {
      get camera() {
        return gr.camera;
      },
      game: {
        get realTime() {
          return self.time;
        },
      },
      cam: {
        isIso: true,
        get distance() {
          return MOBA_DIST * gr.zoom;
        },
        get focus() {
          return gr.focus;
        },
      },
      params: {},
      assets: { url: (p: string) => `${import.meta.env.BASE_URL ?? './'}assets/${p}` },
    };
    this.effects = new Effects(
      this.particles,
      this.shock,
      this.juice,
      {
        who: (id) => this.who.get(id) ?? null,
        get mySlot() {
          return self.mySlot;
        },
        get myTeam() {
          return self.myTeam;
        },
        trickOf: (slot) => this.tricks[slot] ?? 'pounce',
        onSwing: (id) => {
          this.heroes.swing(id);
          this.minions.swing(id);
          this.swipe(id);
        },
        onCast: (id) => this.heroes.cast(id),
        onHit: (id, kind, heavy) => {
          if (kind === 'hero') this.heroes.hit(id, heavy);
          else if (kind === 'minion') this.minions.hit(id);
          else this.structures.hit(id);
        },
        onKill: hooks.onKill,
        onLevel: hooks.onLevel,
        onTalentOffer: hooks.onTalentOffer,
        onWindupAtMe: hooks.onWindupAtMe,
        onTowerDown: hooks.onTowerDown,
      },
      numbersCtx,
    );
    const shake = this.juice.shake as unknown as { apply(cam: THREE.Camera, dt: number, scale: number, mix: object): void };
    gr.preRender = (cam) => shake.apply(cam, this.lastDt, 1, { rotMul: 0.5, rotMaxDeg: 1.2, transMul: 2, transMax: 0.35 });
    this.setShadows(gr.settings.shadows);
    gr.zoom = this.zoomTarget;
  }

  private lastDt = 0;
  private wasDead = false;

  setShadows(on: boolean): void {
    this.heroes.setShadows(on);
    this.minions.setShadows(on);
    this.structures.setShadows(on);
    this.map.setShadows(on);
  }

  setTeam(slot: number, team: 0 | 1, tricks: TrickId[]): void {
    this.mySlot = slot;
    this.myTeam = team;
    this.tricks = tricks;
    this.heroes.mySlot = slot;
    this.heroes.myTeam = team;
    this.structures.myTeam = team;
    this.minions.myTeam = team;
    this.projectiles.myTeam = team;
  }

  /** Render-only cosmetics: the player's look (slot `mySlot`) and Companion Kittens. */
  dress(look: Look | null, companions: readonly Companion[]): void {
    if (look) this.heroes.looks.set(this.mySlot, look);
    else this.heroes.looks.delete(this.mySlot);
    if (this.companions) {
      this.scene.remove(this.companions.group);
      this.companions.dispose();
      this.companions = null;
    }
    if (companions.length) {
      this.companions = new CompanionView(companions);
      this.companions.myTeam = this.myTeam;
      this.scene.add(this.companions.group);
    }
  }

  /**
   * A melee hero's basic attack: a quick bright arc of sprites sweeping in front of it (one batched particle draw),
   * so the swing reads at ~25 px tall where the pose alone did not.
   */
  private swipe(id: number): void {
    const w = this.who.get(id);
    if (!w || w.kind !== 'hero' || !w.hero || w.hero === 'sage') return;
    const color = w.hero === 'clem' ? 0xfff1c4 : w.hero === 'brutus' ? 0xeef3fa : 0xe9e0ff;
    const r = w.hero === 'brutus' ? 1.7 : 1.5;
    const n = 7;
    const side = (this.swipeSide = -this.swipeSide);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const a = w.yaw + side * (t - 0.5) * 2.1;
      const ca = Math.cos(a);
      const sa = -Math.sin(a);
      _sw.set(w.x + ca * r, 1.1 + t * 0.25, w.z + sa * r);
      this.particles.single(_sw, {
        shape: SHAPE.SOFT,
        color,
        intensity: 1.7,
        size0: 0.55 - t * 0.25,
        size1: 0.08,
        life: 0.12 + t * 0.1,
        vx: -sa * side * 3,
        vz: ca * side * 3,
        alpha: 0.9,
      });
    }
  }

  private swipeSide = 1;

  /** Wheel zoom target (render/camera/zoom.ts); `gr.zoom` eases toward it. */
  zoomTarget = loadZoom();

  /**
   * The camera looks a few metres ahead of the hero toward the enemy base (MOBA lead), so the fight in front of the
   * hero sits in the middle of the screen, not under the ability cluster on the right. Scales with the zoom.
   */
  lead(): number {
    return (this.myTeam === 0 ? 1 : -1) * CAMERA_FRAME.lead * this.gr.zoom;
  }

  /** The player's hero in the current frame. */
  me(): ViewEntity | null {
    return this.frame?.byId.get(this.mySlot) ?? null;
  }

  /** Re-centre on the hero (Space). */
  recentre(): void {
    this.pan.set(0, 0, 0);
    this.panned = false;
    this.panHold = 3;
  }

  /** Pan the camera by (dx, dz) metres. */
  panBy(dx: number, dz: number): void {
    this.pan.x += dx;
    this.pan.z += dz;
    this.pan.x = Math.max(-40, Math.min(40, this.pan.x));
    this.pan.z = Math.max(-30, Math.min(30, this.pan.z));
    this.panned = true;
    this.panAt = this.time;
  }

  private panAt = -99;
  /** Seconds after the last pan before the camera drifts back to the hero. */
  panHold = 3;

  /** Look at a map point (m) for a moment (minimap). */
  lookAt(x: number, z: number, hold = 2.5): void {
    this.pan.set(x - this.follow.x, 0, z - this.follow.z);
    this.panned = true;
    this.panAt = this.time;
    this.panHold = hold;
  }

  private remember(frame: ViewFrame): void {
    for (const e of frame.entities) {
      let w = this.who.get(e.id);
      if (!w) {
        w = { id: e.id, kind: e.kind, team: e.team, hero: e.hero, x: 0, z: 0, yaw: 0, t: 0 };
        this.who.set(e.id, w);
      }
      w.kind = e.kind;
      w.team = e.team;
      w.hero = e.hero;
      w.x = toX(e.fx);
      w.z = toZ(e.fy);
      w.yaw = e.yaw;
      w.t = this.time;
    }
    for (const [id, w] of this.who) if (this.time - w.t > WHO_TTL) this.who.delete(id);
  }

  /** Draw one frame. `frame` may be null before the first snapshot. */
  update(frame: ViewFrame | null, dt: number): void {
    this.time += dt;
    this.lastDt = dt;
    this.frame = frame ?? this.frame;
    this.telegraphs.begin(dt);
    if (frame) {
      this.remember(frame);
      const me = frame.byId.get(this.mySlot) ?? null;
      this.lastMe = me;
      this.heroes.setQuality(this.gr.settings.tier === 'low', this.gr.settings.outlines);
      this.heroes.update(frame, dt);
      this.minions.update(frame, dt, this.time);
      this.structures.me = me && me.state !== 'dead' ? { x: toX(me.fx), z: toZ(me.fy) } : null;
      this.structures.heroes.length = 0;
    for (const e of frame.entities) if (e.kind === 'hero' && e.state !== 'dead') this.structures.heroes.push({ x: toX(e.fx), z: toZ(e.fy) });
    this.structures.update(frame, dt);
      this.projectiles.update(frame, dt);
      this.companions?.update(frame, dt);
      this.drawWindups(frame);
      this.drawAim();
      if (me) this.follow.set(toX(me.fx), 0, toZ(me.fy));
      // respawn: snap the camera onto the fountain at once, so the pop-then-cheer plays on screen (a smoothed pan
      // across the map arrived after it)
      const meDead = me?.state === 'dead';
      if (me && this.wasDead && !meDead) {
        this.recentre();
        this.gr.focus.x = clampFocusX(this.follow.x + this.lead());
        this.gr.focus.z = clampFocusZ(this.follow.z + CAMERA_FRAME.below);
      }
      this.wasDead = meDead;
    }
    this.map.update(frame, dt);
    this.particles.update(dt);
    this.shock.render(dt, this.time);
    this.effects.render(dt);
    this.juice.update(dt);
    // camera: follow + pan, smoothed; a pan drifts back to the hero after a few quiet seconds
    if (this.panned && this.time - this.panAt > this.panHold) {
      this.pan.multiplyScalar(Math.max(0, 1 - dt * 3));
      if (this.pan.lengthSq() < 0.01) this.recentre();
    }
    // ease the zoom toward the wheel's target
    this.gr.zoom += (this.zoomTarget - this.gr.zoom) * Math.min(1, dt * 10);
    const tx = clampFocusX(this.follow.x + this.pan.x + (this.panned ? 0 : this.lead()));
    const tz = clampFocusZ(this.follow.z + this.pan.z + CAMERA_FRAME.below);
    const k = Math.min(1, dt * (this.panned ? 12 : 7));
    this.gr.focus.x += (tx - this.gr.focus.x) * k;
    this.gr.focus.z += (tz - this.gr.focus.z) * k;
    sfx.ear.x = this.gr.focus.x;
    sfx.ear.z = this.gr.focus.z;
    this.gr.render();
  }

  private drawWindups(frame: ViewFrame): void {
    const fx = this.effects;
    fx.pruneWindups(frame.tick);
    for (const w of fx.windups) {
      const who = this.who.get(w.src);
      const aim = fx.aimOf(who ?? null, w.slot);
      if (!who || !aim) continue;
      const fill = Math.max(0, Math.min(1, (frame.tick - w.start) / w.ticks));
      // wind-ups are threats: enemy ones in danger red, ours in the team rose
      const color = who.team === 2 ? RELATION.neutral : who.team === this.myTeam ? RELATION.ally : RELATION.danger;
      const tx = w.x / 1000;
      const tz = -w.y / 1000;
      const yaw = Math.atan2(-(tz - who.z), tx - who.x);
      const spec = toSpec(aim, who.x, who.z, tx, tz, Number.isFinite(yaw) ? yaw : who.yaw, color);
      if (spec) this.telegraphs.draw({ ...spec, fill, alpha: 0.95 });
    }
  }

  private drawAim(): void {
    const a = this.aim;
    const me = this.lastMe;
    if (!a || !me || me.state === 'dead') return;
    const mx = toX(me.fx);
    const mz = toZ(me.fy);
    const color = a.valid ? RELATION.self : 0xff9f7a;
    const yaw = Math.atan2(-(a.z - mz), a.x - mx);
    const r = a.spec.range / 1000;
    // max range ring for point and unit aims
    if (a.spec.kind === 'point' || a.spec.kind === 'unit') this.telegraphs.draw({ shape: 'ring', x: mx, z: mz, yaw: 0, length: r, color: RELATION.self, alpha: 0.6 });
    const spec = toSpec(a.spec, mx, mz, a.x, a.z, Number.isFinite(yaw) ? yaw : me.yaw, color);
    if (spec) this.telegraphs.draw({ ...spec, alpha: 0.9 });
  }

  dispose(): void {
    this.gr.preRender = null;
    this.scene.remove(this.map.group, this.heroes.group, this.minions.group, this.structures.group, this.projectiles.group, this.telegraphs.group);
    if (this.companions) {
      this.scene.remove(this.companions.group);
      this.companions.dispose();
      this.companions = null;
    }
    this.particles.clear();
    this.shock.clear();
    this.map.dispose();
    this.heroes.dispose();
    this.minions.dispose();
    this.structures.dispose();
    this.projectiles.dispose();
    this.telegraphs.dispose();
    this.effects.dispose();
    this.juice.dispose();
  }
}

/** Aim spec + caster + aim point (m) → a telegraph shape. */
export function toSpec(aim: AimSpec, x: number, z: number, ax: number, az: number, yaw: number, color: number): TelegraphSpec | null {
  const r = aim.range / 1000;
  switch (aim.shape) {
    case 'cone':
      return { shape: 'cone', x, z, yaw, length: r, arc: aim.arc, color };
    case 'line':
      return { shape: 'line', x, z, yaw, length: Math.min(r, 40), width: (aim.width ?? 1000) / 1000, color };
    case 'dash':
      return { shape: 'dash', x, z, yaw: aim.away ? yaw + Math.PI : yaw, length: r, width: (aim.width ?? 900) / 1000, color };
    case 'circle': {
      const d = Math.hypot(ax - x, az - z);
      const k = d > r && aim.kind === 'point' ? r / d : 1;
      return { shape: 'circle', x: x + (ax - x) * k, z: z + (az - z) * k, yaw: 0, length: (aim.radius ?? 1000) / 1000, color };
    }
    case 'ring':
      return { shape: 'ring', x, z, yaw: 0, length: (aim.radius ?? aim.range) / 1000, color };
    default:
      return null;
  }
}

/** Convenience for HUD and input: the aim spec of slot 0..3 or the trick (4). */
export function aimOfSlot(hero: HeroId, trick: TrickId, slot: 0 | 1 | 2 | 3 | 4): AimSpec {
  return slot === 4 ? trickAim(trick) : aimFor(hero, slot);
}
