/**
 * The match view: owns every render-side piece of a match (map, structures, minions, heroes, projectiles, FX,
 * telegraphs, juice) and draws one interpolated frame per animation frame. Feel pass B1: the camera is FIXED on the
 * player's hero (render/camera/frame.ts): it moves only for a minimap peek, the aim pan of the longest skills, a
 * scripted look (the core falling) and a capped shake. Render only: no sim imports beyond types.
 */
import { screenRightXZ, setViewTeam, towardCameraXZ } from './coords';
import { PingMarkers } from './views/pingMarkers';
import type { PingKind } from '../data/pings';
import * as THREE from 'three';
import { heightFactor, loadCameraHeight, type CameraHeight } from './camera/height';
import { aimPan, groundReach, reachAlong, returnShare, SHAKE_MAX_M } from './camera/frame';
import { teamOfSlot, type EntityKind, type HeroId, type SimEvent, type TrickId } from '../sim/api';
import { makeHero, type Character } from './chars';
import { sfx } from '../audio/sfx';
import { aimFor, attackRingMm, trickAim, type AimSpec } from '../input/abilities';
import { Effects, type Who } from './effects';
import { Particles, SHAPE } from './fx/Particles.js';
import { CombatVfx, elementColor, isMelee } from './fx/combatVfx';
import { reducedMotion, shakePref, shakeScaleFor } from './fx/vfxPrefs';
import { Shockwaves } from './fx/Shockwaves.js';
import type { ViewEntity, ViewFrame } from './interp';
import { Juice } from './juice';
import { RELATION, setSideSwap, setTeam0Dogs } from './palette';
import type { GameRenderer } from './renderer';
import { poseWatchers, TelegraphPool, type TelegraphSpec } from './telegraph';
import { HEROES } from '../data/heroes';
import { steadfastEdges } from './steadfast';
import { toX, toZ } from './coords';
import type { Companion } from '../meta/roster';
import { BOT_COATS, FREE_BISCUIT, FREE_COATS, cardLook, type Look } from './cosmetics';
import { setCharTime } from './chars/charMaterial';
import { getSkin } from './skins/skinStore';
import { mixHex } from './skins/classify';
import { TierFx, type SkinFxMode } from './skins/tierFx';
import { CardVfx, tinted } from './skins/cardFx';
import { CompanionView } from './views/companionView';
import { AUTO_TARGET_HOLD, CHEVRON_LIFE, chevronSize, chevronTexture, MOVE_RING_LIFE, TARGET_MARK_LIFE, targetMarkAlpha } from './fx/orderMarks';
import { boldRingTexture, crosshairTexture, dashRingTexture, DecalLayer, ringTexture } from './views/decals';
import { HeroView } from './views/heroView';
import { HERO_RING } from './views/models';
import { createMapView, type MapView } from './views/mapView';
import { inClearZone, MinionInstances } from './views/minionInstances';
import { PickupView } from './views/pickupView';
import { ProjectileView } from './views/projectileView';
import { StructureView } from './views/towerView';
import { AnimDirector } from './anim/director';
import { CueSfx, FxRuntime, type HeroLookup } from './anim/fxctx';
import { MeshFx } from './anim/fxkit/meshFx';
import { Linger } from './anim/fxkit/linger';
import { coverageFade, packTele } from './anim/fxkit/readability';
import { Ribbons } from './anim/trails';
import { Ghosts } from './anim/ghosts';
import { FightCam, type FightHero } from './anim/cam';
import { UltMoment } from './anim/ultMoment';
import { talentIdsOf } from './anim/timing';
import { HERO_NAME } from './effects';
import type { Lifecycle } from './fx/lifecycle'; // lifecycle: start gate, respawn, nap, waves, match end (own chunk)

export interface AimPreview {
  spec: AimSpec;
  /** Aim point (m, three.js X/Z). */
  x: number;
  z: number;
  /** For unit aims: the target entity id, or -1. */
  target: number;
  valid: boolean;
  /**
   * The point is the ground under the desktop cursor: the aim pan (feel pass B1) must not move toward it, or the
   * camera slides the ground under a still cursor and the aim drifts (QA 2026-11-07). Touch drag aims are measured
   * from the button, so they keep the pan. A press-fired heading cast's ghost landing marker sets it too (not an aim).
   */
  pointer?: boolean;
}

export interface GameViewHooks {
  onKill?(e: Extract<SimEvent, { type: 'death' }>, victim: Who | null, killer: Who | null): void;
  onLevel?(level: number): boolean | void;
  /** Lane F (F3): the session's own level-up rail line (render/effects.ts EffectsHooks.levelNote). */
  levelNote?(level: number, guided: boolean): boolean;
  onTalentOffer?(tier: number): void;
  onWindupAtMe?(): void;
  onTowerDown?(ours: boolean): void;
  onTowerAim?(src: number, ticks: number): void;
  onCoreDown?(who: Who): void;
}

const WHO_TTL = 3;
/** Warm-up heroes stand this high (m): out of every view, see `warmup()`. */
const WARM_LIFT_M = 5000;
/** Feel pass B3: how long (s) the quiet "nothing in reach" ring shows after an Attack press with no target. */
export const DENY_RING_S = 0.4;

/** Hover ring size (m) by unit kind: just outside the unit's own relation ring. Heroes use HERO_RING × 1.3. */
export const HOVER_RING: Readonly<Record<EntityKind, number>> = Object.freeze({ hero: 0, minion: 1.55, tower: 3.8, core: 7, fountain: 0, camp: 1.8, pudding: 4.8, pickup: 0 });
export const hoverRingSize = (kind: EntityKind, hero: HeroId | undefined | null): number => (kind === 'hero' ? HERO_RING[hero ?? 'clem'] * 1.3 : HOVER_RING[kind]);
/** Hover ring colours: red = a click attacks it (the enemy cursor is red too), mint = an ally. */
export const HOVER_COLOR = Object.freeze({ enemy: RELATION.danger, ally: 0x5ff0a8 });

/** Order markers: how long one lasts (s), and how many can show at once. */
export const MARKER_LIFE = 0.55;
const MARKERS = 4;
/** Move orders mint, attack orders red (the attack marker also carries crosshair ticks). */
export const MARKER_COLOR = Object.freeze({ move: 0x5ff0a8, attack: RELATION.danger });
/** Order marker diameter (m) at age `t` (s): lands big, snaps in, then shrinks away; 0 when over. */
export function markerSize(t: number): number {
  if (t < 0 || t >= MARKER_LIFE) return 0;
  const k = t / MARKER_LIFE;
  if (k < 0.25) return 2.8 - 1.4 * (k / 0.25);
  return 1.4 * (1 - ((k - 0.25) / 0.75) * 0.7);
}
const NO_ENTITIES: ViewEntity[] = [];

export class GameView {
  readonly scene: THREE.Scene;
  readonly map: MapView;
  readonly heroes = new HeroView();
  readonly minions = new MinionInstances();
  readonly structures = new StructureView();
  private readonly minionClear: { x: number; z: number }[] = [];
  private footprints: { x: number; z: number; r: number }[] = [];
  private coreZones: { x: number; z: number; r: number }[] = [];
  readonly pickups = new PickupView();
  readonly projectiles: ProjectileView;
  readonly telegraphs = new TelegraphPool(20);
  readonly particles: Particles;
  readonly shock: Shockwaves;
  readonly juice: Juice;
  readonly effects: Effects;
  /** Wave C (C3): combat VFX juice (render only; budgets per quality tier). */
  readonly vfx: CombatVfx;
  /** Companion Kittens (render only; set by `dress`). */
  companions: CompanionView | null = null;
  /** Ground point (m) the camera follows: the player's hero (its interpolated render position). */
  readonly follow = new THREE.Vector3(5, 0, -30);
  /**
   * Feel pass B1: the camera's offset (m) from the hero this frame: a minimap peek, a scripted look or the aim pan,
   * else 0. The focus is always follow + camOff (no smoothing of the follow itself).
   */
  readonly camOff = { x: 0, z: 0 };
  /** Scratch for the aim pan's screen axes. */
  private readonly panR = { x: 0, z: 0 };
  private readonly panT = { x: 0, z: 0 };
  /** A peek point (m) and until when (view s; Infinity while a finger or mouse button holds the minimap), or null. */
  private peekPt: { x: number; z: number; until: number } | null = null;
  /** The return to the hero after a peek or an aim pan: where it started (m) and its clock (s), Infinity = none. */
  private readonly retFrom = { x: 0, z: 0 };
  private retT = Infinity;
  private offActive = false;
  /** The aim pan this frame (m; e2e and tests). */
  aimPanM = 0;
  mySlot = 0;
  myTeam: 0 | 1 = 0;
  tricks: TrickId[] = [];
  aim: AimPreview | null = null;
  /**
   * Show the own hero's basic attack range ring (a thin dashed ring, subtler than a skill's range ring): the desktop
   * input sets it while A is armed or a skill is aimed, the touch input while Attack is held or a skill is aimed.
   */
  attackRange = false;
  /** C5: when (view time, s) the Attack button found nothing in reach: the range ring flashes red for a moment. */
  private ringDenyAt = -9;
  denyRing(): void {
    this.ringDenyAt = this.time;
  }
  /** Radius (m) of the attack range ring drawn this frame, 0 when none (e2e telemetry). */
  attackRingM = 0;
  /** The unit under the desktop cursor (DesktopInput.hover): a bright ring shows what a click or cast hits. */
  hover: { id: number; rel: 'enemy' | 'ally'; castId?: number } | null = null;
  /** GAPS A5: the touch-locked enemy hero (TouchControls.lock): the same ring as an enemy hover while it holds. */
  lock: number | null = null;
  /** UX pass 2 (touch): the unit the Attack button would hit now (TouchControls.preview): a thin red ring under it. */
  atkPreview: number | null = null;
  /** UX pass 2: the Attack target is out of reach (the tap walks to it first): its ring is drawn fainter. */
  atkPreviewFar = false;
  /** Hold-to-select (touch): the enemies the held Attack button offers (a faint ring each), or null. */
  atkCands: readonly number[] | null = null;
  /** Hold-to-select: the one the release would lock (the bold ring), or null (none, or the drag is on cancel). */
  atkSelect: number | null = null;
  frame: ViewFrame | null = null;
  /**
   * Hover ring and order markers: thick bold rings drawn after the VFX layers (renderOrder 9), so a brawl's sparks
   * and shockwaves never hide them.
   */
  private hoverRing = new DecalLayer(boldRingTexture(), 1, { y: 0.07, renderOrder: 9, name: 'hover-ring' });
  /** The hero a unit-target quick cast would hit when it is not the hovered unit: a thinner red ring. */
  private castRing = new DecalLayer(ringTexture(), 1, { y: 0.07, renderOrder: 9, name: 'hover-cast-ring' });
  /** Hold-to-select: a faint ring under every candidate the held Attack button offers (ATK_SELECT.max). */
  private candRings = new DecalLayer(ringTexture(), 8, { y: 0.07, renderOrder: 9, name: 'atk-cand-rings' });
  private moveMarks = new DecalLayer(boldRingTexture(), MARKERS, { y: 0.075, renderOrder: 9, name: 'order-move' });
  private attackMarks = new DecalLayer(crosshairTexture(), MARKERS, { y: 0.075, renderOrder: 9, name: 'order-attack' });
  private marks = Array.from({ length: MARKERS }, () => ({ x: 0, z: 0, t: -1, attack: false }));
  /** LoL pass (lane C): move chevrons, the red outline under an attack order's target, the touch auto-attack ring. */
  private chevrons = new DecalLayer(chevronTexture(), MARKERS, { y: 0.08, renderOrder: 9, name: 'order-chevrons' });
  private targetRings = new DecalLayer(ringTexture(), 2, { y: 0.07, renderOrder: 9, name: 'target-rings' });
  private targetMark = { id: -1, t: -1 };
  /** The unit the player's last basic attack landed on, and when (view s); -1 = none. */
  autoTarget = -1;
  autoTargetAt = -99;
  /** Telemetry (e2e): the touch auto-attack ring's unit this frame, -1 = none. */
  autoRingId = -1;
  private markNext = 0;
  private who = new Map<number, Who & { t: number }>();
  /** Sim v9: heroes facing a Bengas mid Striking Pose wind-up (the overhead draws a "!" eye glyph over them). */
  readonly watchers = new Set<number>();
  private poseHits = new Set<number>();
  private time = 0;
  private lastMe: ViewEntity | null = null;
  /** ANIM-SPEC: authored animation, skill FX kit, fight camera and ult moments (render/anim/). */
  readonly director: AnimDirector;
  readonly meshFx = new MeshFx();
  readonly linger: Linger;
  readonly ribbons = new Ribbons();
  readonly ghosts = new Ghosts();
  readonly fightCam: FightCam;
  readonly ultMoment: UltMoment;
  /** Pending events ahead of the render clock (matchSession sets it to SnapBuffer.peekEvents). */
  peek: ((horizonTicks: number, out: SimEvent[]) => SimEvent[]) | null = null;
  private readonly fightHeroes: FightHero[] = Array.from({ length: 12 }, () => ({ x: 0, z: 0, team: 0, dead: true }));
  private readonly talentKey = new Map<number, { key: string; ids: string[] }>();
  private coverK = 1;
  /** lifecycle (render/fx/lifecycle.ts): start gate, death and respawn sequence, nap, wave puffs, match end. Loaded as
   *  its own chunk during the match load (first-load budget); null until then. */
  lifecycle: Lifecycle | null = null;
  private lifecycleGone = false;

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
    this.heroes.tierFx = new TierFx(this.particles);
    this.vfx = new CombatVfx(this.particles, this.shock);
    this.vfx.setTier(gr.settings.vfxTier, reducedMotion());
    this.projectiles.vfx = this.vfx;
    this.scene.add(this.heroes.group, this.minions.group, this.structures.group, this.projectiles.group, this.telegraphs.group, this.pickups.group);
    this.scene.add(this.vfx.auras.mesh);
    this.scene.add(this.hoverRing.mesh, this.castRing.mesh, this.candRings.mesh, this.moveMarks.mesh, this.attackMarks.mesh, this.chevrons.mesh, this.targetRings.mesh, this.pingMarks.group);
    this.juice = new Juice(uiRoot);
    // Settings → Screen shake, capped under the OS reduce-motion switch (render/fx/vfxPrefs.ts)
    this.juice.shakeScale = shakeScaleFor(shakePref(), this.vfx.reduced);
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
          return gr.dist;
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
        visible: (id) => this.frame?.byId.has(id) === true,
        get mySlot() {
          return self.mySlot;
        },
        get myTeam() {
          return self.myTeam;
        },
        trickOf: (slot) => this.tricks[slot] ?? 'pounce',
        onSwing: (id, tick) => {
          // a hero's swing starts on its sim swing (the director's BasicClock), not on the hit (ANIM-SPEC D1)
          if (this.director) this.director.basicFired(id, tick ?? Math.round(this.frame?.tick ?? 0));
          else this.heroes.swing(id);
          this.minions.swing(id);
          this.swipe(id);
        },
        // the director plays the stub heroes' legacy cast and the filled heroes' clips
        onCast: (id) => {
          if (!this.director) this.heroes.cast(id);
        },
        onHit: (id, kind, heavy, src) => {
          if (kind === 'hero') this.heroes.hit(id, heavy);
          else if (kind === 'minion') {
            const w = src !== undefined ? this.who.get(src) : undefined;
            this.minions.hit(id, w ? w.x : NaN, w ? w.z : NaN);
            // C11b: the player's own hits read on the minion (a squash and a white flash)
            if (src === this.mySlot) this.minions.flash(id);
          } else this.structures.hit(id);
        },
        onKill: hooks.onKill,
        onLevel: hooks.onLevel,
        levelNote: hooks.levelNote,
        onTalentOffer: hooks.onTalentOffer,
        onWindupAtMe: hooks.onWindupAtMe,
        onTowerDown: hooks.onTowerDown,
        onTowerAim: hooks.onTowerAim,
        onCoreDown: hooks.onCoreDown,
        onStructureWindup: (id, sec) => this.structures.windup(id, sec),
        // LoL pass (lane C): tower beams, charging lines and the red aggro ring
        onTowerShot: (src, x, y, z, me, charge, sec) => {
          if (!charge) this.structures.shotAt(src, x, y, z, me);
          else if (me) this.structures.markAggro(src);
          else this.structures.chargeAt(src, x, z, sec, false);
        },
        onMyBasic: (dst) => {
          this.autoTarget = dst;
          this.autoTargetAt = this.time;
        },
        onStructureFell: (id) => this.structures.fell(id),
        hiddenMinionAt: (x, z) => {
          // a core at 0 HP this frame (its burst starts on this tick) or one already falling
          for (const e of this.frame?.entities ?? NO_ENTITIES) if (e.kind === 'core' && e.hp <= 0 && Math.hypot(toX(e.fx) - x, toZ(e.fy) - z) < 3.5) return true;
          return inClearZone(this.structures.fallingCores(this.coreZones), x, z);
        },
        onPickupSpawn: (index, kind, x, y) => this.pickups.spawn(index, kind, x, y),
        onPickupTaken: (kind, who) => {
          if (who) this.pickups.take(kind, who.x, who.z);
        },
        card: (id) => this.heroes.cardOf(id),
      },
      numbersCtx,
    );
    this.effects.vfx = this.vfx;
    // ANIM-SPEC §2: the director, the skill FX kit (one material, compiled at load), ribbons, ghosts, fight camera
    this.linger = new Linger(this.meshFx.uniforms);
    this.fightCam = new FightCam(this.juice);
    // feel pass B1: the own punch is a short darkening vignette over the view (CSS), never a zoom
    if (typeof document !== 'undefined') {
      const vig = document.createElement('div');
      vig.className = 'pl-punch';
      vig.setAttribute('aria-hidden', 'true');
      uiRoot.appendChild(vig);
      this.fightCam.onPunch = (ms, dark) => {
        vig.style.setProperty('--punch-ms', `${ms}ms`);
        vig.style.setProperty('--punch-dark', String(dark));
        vig.classList.remove('on');
        void vig.offsetWidth;
        vig.classList.add('on');
      };
    }
    this.ultMoment = new UltMoment(uiRoot, this.juice, this.fightCam);
    this.scene.add(this.meshFx.group, this.linger.mesh, this.ribbons.mesh, this.ghosts.group);
    const lookup: HeroLookup = {
      get mySlot() {
        return self.mySlot;
      },
      get myTeam() {
        return self.myTeam;
      },
      teamOf: (id) => this.who.get(id)?.team ?? 2,
      heroOf: (id) => this.who.get(id)?.hero ?? null,
      posOf: (id, out) => {
        const w = this.who.get(id);
        if (!w) return false;
        out.x = w.x;
        out.y = 0;
        out.z = w.z;
        return true;
      },
      bone: (id, b) => this.heroes.rigOf(id)?.ch.rig.bone(b) ?? null,
      talentsOf: (id) => this.talentsOf(id),
      branchOf: (id) => this.who.get(id)?.branch === true,
      yawOf: (id) => {
        const r = this.heroes.rigOf(id);
        return r && r.visible ? r.yaw : NaN;
      },
    };
    const cueSfx = new CueSfx();
    const runtime = new FxRuntime(this.meshFx, this.ribbons, this.linger, this.vfx, this.shock as never, this.fightCam, this.juice, cueSfx, lookup);
    // fun-fx (skill FX lanes): comic pops ("POW!", "MEOW!") and sticker sprites from hero skill scripts
    // (the kit is shared by the lazy skill-FX chunks only, so it loads with them and stays out of the first-load JS)
    void import('./fx/fun/funKit')
      .then((m) => {
        if (!this.lifecycleGone) m.setFunSink({ particles: this.particles, camera: gr.camera, pop: (text, pos) => this.effects.numbers.pop(text, pos, true) /* fun pops: their own slot */ });
      })
      .catch(() => undefined);
    this.director = new AnimDirector({
      rig: (id) => this.heroes.rigOf(id),
      get mySlot() {
        return self.mySlot;
      },
      get myTeam() {
        return self.myTeam;
      },
      get peek() {
        return self.peek;
      },
      particles: this.particles,
      ribbons: this.ribbons,
      ghosts: this.ghosts,
      cam: this.fightCam,
      fx: runtime,
      sfx: cueSfx,
      shakeScale: () => (this.vfx.reduced ? 0 : this.juice.shakeScale),
      reduced: () => this.vfx.reduced,
      tier: () => this.gr.settings.tier,
      teamFight: () => this.fightCam.fight || this.heroes.tierFx?.teamFight === true,
    });
    this.heroes.director = this.director;
    this.effects.anim = {
      castFired: (e) => this.director.castFired(e),
      windupFired: (e) => this.director.windupFired(e),
      hitFired: (e, sh, dh, big) => this.director.hitFired(e, sh, dh, big),
      deathFired: (e) => this.director.deathFired(e),
      levelFired: (id) => this.director.levelFired(id),
      clipFired: (e) => this.director.clipFired(e),
      ult: (src, mine, name, color, atMe) => {
        if (src.kind !== 'hero' || !src.hero) return false;
        if (mine) this.ultMoment.own(HERO_NAME(src.hero), name, color);
        else if (src.team !== this.myTeam) {
          if (!atMe) return false;
          this.ultMoment.enemy(name);
        } else this.ultMoment.ally(src);
        return mine;
      },
    };
    this.applyAnimTier();
    // structures: a muzzle burst on each tower / core shot, dust when a fall ends
    const sv = new THREE.Vector3();
    this.structures.onShot = (x, y, z, team) => {
      sv.set(x, y, z);
      const c = team === this.myTeam ? RELATION.ally : RELATION.danger;
      this.particles.burst(sv, { additive: true, n: 10, shape: SHAPE.SPARK, color: c, intensity: 2, size: [0.12, 0.22], life: [0.18, 0.3], speed: [3, 6], stretch: 2.2, drag: 4, up: 1 });
      this.particles.single(sv, { shape: SHAPE.STAR4, color: 0xfff6da, intensity: 2.2, size0: 1.3, size1: 0.2, life: 0.14, rot: 0 });
    };
    this.structures.onCalmed = (x, z) => {
      sv.set(x, 1, z);
      this.particles.burst(sv, { n: 16, shape: SHAPE.PUFF, color: 0xffe6f0, alpha: 0.8, size: [0.6, 1.1], sizeEnd: 1.8, life: [0.5, 0.8], speed: [1.5, 3.5], up: 1.2, drag: 2 });
      this.particles.burst(sv, { additive: true, n: 14, shape: SHAPE.STAR5, color: 0xff9ec0, intensity: 1.6, size: [0.18, 0.32], life: [0.5, 0.8], speed: [2, 4.5], up: 3, gravity: 5 });
    };
    this.structures.onFallen = (x, z, core) => {
      sv.set(x, 0.4, z);
      // the settle: a low puff only (trailer review: a second shockwave ring after the burst read as a second blast)
      this.particles.burst(sv, { n: core ? 18 : 12, shape: SHAPE.PUFF, color: 0xf2ddbb, alpha: 0.7, size: [0.8, 1.3], sizeEnd: 2.2, life: [0.7, 1.1], speed: [1, 3], up: 0.4, drag: 1.8 });
    };
    // a toppled tower hits the ground (dust along its length, a ring, a kick); a core bursts (a big ring and a puff)
    this.structures.onImpact = (x, z, dx, dz, len, core) => {
      if (core) {
        sv.set(x, 1.2, z);
        this.particles.burst(sv, { n: 30, shape: SHAPE.PUFF, color: 0xf2ddbb, alpha: 0.85, size: [1, 1.8], sizeEnd: 3, life: [0.8, 1.3], speed: [3, 7], up: 1.2, drag: 1.4 });
        sv.set(x, 0.2, z);
        this.shock.start(sv, { r1: 9, dur: 0.5, color: '#FFF1D6', height: 0.7 });
        this.juice.kick(0.5);
        return;
      }
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4;
        sv.set(x + dx * len * t, 0.3, z + dz * len * t);
        this.particles.burst(sv, { n: 8, shape: SHAPE.PUFF, color: 0xf2ddbb, alpha: 0.85, size: [0.7, 1.3], sizeEnd: 2.2, life: [0.6, 1.1], speed: [1.5, 4], up: 0.8, drag: 1.8 });
      }
      sv.set(x + dx * len * 0.7, 0.1, z + dz * len * 0.7);
      this.shock.start(sv, { r1: 5.5, dur: 0.4, color: '#FFE0C8', height: 0.45 });
      this.juice.kick(0.4);
    };
    // compile the FX programs now, never mid-fight (§7)
    try {
      this.meshFx.pools.ground.mesh.visible = this.meshFx.pools.vertical.mesh.visible = this.meshFx.pools.dome.mesh.visible = true;
      this.linger.mesh.visible = this.ribbons.mesh.visible = true;
      gr.renderer.compile(this.scene, gr.camera);
      // fun pass: the Toy rings' dashed texture uploads now, not on the first Toy mid-match (a ~1 s SwiftShader stall)
      gr.renderer.initTexture(dashRingTexture());
    } catch {
      /* a headless or lost context: they compile on first use */
    }
    this.meshFx.pools.ground.mesh.visible = this.meshFx.pools.vertical.mesh.visible = this.meshFx.pools.dome.mesh.visible = false;
    this.linger.mesh.visible = this.ribbons.mesh.visible = false;
    // Wave C (C4): card-tier effects, cosmetic only (render/skins/cardFx.ts)
    this.effects.cards = new CardVfx(this.particles, this.shock as never);
    this.projectiles.card = (id) => this.heroes.cardOf(id);
    const shake = this.juice.shake as unknown as { apply(cam: THREE.Camera, dt: number, scale: number, mix: object): void };
    // feel pass B1: the shake is the only camera motion besides the follow, capped at SHAKE_MAX_M on the ground (the
    // turn's share at the camera distance plus the screen-plane jolt)
    gr.preRender = (cam) => {
      const transMax = SHAKE_MAX_M * 0.5;
      const rotMaxDeg = (Math.atan(transMax / Math.max(1, gr.dist)) * 180) / Math.PI;
      shake.apply(cam, this.lastDt, 1, { rotMul: 0.5, rotMaxDeg, transMul: 1, transMax });
    };
    this.setShadows(gr.settings.shadows);
    gr.zoom = heightFactor(loadCameraHeight());
    // lifecycle: built last (it reads particles, shock, meshFx, juice, heroes), from its own chunk
    void import('./fx/lifecycle')
      .then((m) => {
        if (!this.lifecycleGone) this.lifecycle = new m.Lifecycle(this, uiRoot);
      })
      .catch(() => {
        /* cosmetic only: the match plays without it */
      });
  }

  private lastDt = 0;
  private wasDead = false;

  /** Load the move sets and skill FX of the heroes in this match (their own chunks; stubs until then). */
  loadAnim(picks: readonly HeroId[]): Promise<void> {
    this.roster = picks.slice();
    this.animLoad = this.director.preload(picks);
    return this.animLoad;
  }

  /** The match's picks (from the welcome), for the warm-up; empty until then. */
  private roster: HeroId[] = [];
  private animLoad: Promise<void> | null = null;
  /** Warm-up heroes: off the scene, kept (not disposed) so their programs stay linked until the match ends. */
  private warmKeep: Character[] = [];
  private gone = false;

  /** True once the warm-up finished inside its deadline (e2e and the perf readout). */
  warmed = false;
  /** True once the roster is known (the welcome arrived): `warmup()` can build both teams. */
  get hasRoster(): boolean {
    return this.roster.length > 0;
  }

  /**
   * PERF-IOS §8 Track C: link every program the match will draw while the loading veil is still up. Builds a hero for
   * each slot that has no rig yet (the enemies stay hidden by the fog until first contact, and their skinned, outline
   * and shadow-depth programs linked there: 75–186 ms WebKit frame gaps), shows every hidden object for one frame
   * (FX pools, rings, minion variants), compiles, then draws one frame with a fresh shadow map so the depth variants
   * link too. Everything hidden is hidden again; the extra heroes leave the scene but keep their materials until
   * `dispose()`, so three.js keeps their programs (the real rigs built later reuse them and the cached geometry).
   * `deadline` (performance.now() ms): the veil's cap. Past it the veil is going, so the frame with everything shown
   * is not drawn (block 2 below). Returns the warm-up heroes built (tests).
   */
  async warmup(deadline = Infinity): Promise<number> {
    await this.animLoad?.catch(() => undefined);
    // the first snapshot drawn first: the rigs, minions and structures it brings are then in the scene too
    for (let k = 0; k < 40 && !this.frame && !this.gone; k++) await new Promise((r) => setTimeout(r, 25));
    if (this.gone) return 0;
    const gr = this.gr;
    this.heroes.setQuality(gr.settings.tier === 'low', gr.settings.outlineScope);
    const group = new THREE.Group();
    group.name = 'warmup';
    const plan = warmPlan(this.roster, this.mySlot, this.myTeam, this.heroes.outlineScope, (slot) => this.heroes.drawnAt(slot) !== null);
    const focus = this.heroes.focus;
    for (const w of plan) {
      const dress = (this.heroes.styleSwap ? 1 - w.team : w.team) as 0 | 1;
      const ch = makeHero(w.hero, dress, this.heroes.looks.get(w.slot) ?? null, { detail: this.heroes.detail, outline: w.outline, shadows: this.heroes.shadows, match: true, self: false });
      if (!w.outline) ch.material.userData.u.uRim.value = 0.78;
      // far above the camera: never frustum-culled (skinned), so drawn, but every vertex is clipped (no pixel, here
      // or in the shadow map) should a frame run while they are in the scene
      ch.object.position.set(focus.x, WARM_LIFT_M, focus.z);
      group.add(ch.object);
      this.warmKeep.push(ch);
    }
    this.scene.add(group);
    // a dash afterimage (skinned, additive; its program linked at the first dash, 11–13 s in): one spawned now lives
    // 0.18 s, gone under the veil. Spawned whatever the tier caps (Low has none; the governor can move the tier)
    const anyHero = this.warmKeep[0]?.mesh ?? this.heroes.rigOf(this.mySlot)?.ch.mesh ?? null;
    if (anyHero) {
      group.updateMatrixWorld(true);
      anyHero.updateMatrixWorld(true);
      this.ghosts.setTier('med', false);
      this.ghosts.spawn(anyHero, 0xffffff);
      this.animTier = '';
      this.applyAnimTier();
    }
    // everything hidden is shown for each synchronous block only: no frame runs in between (pools that read their
    // own `visible` as "in use" never see it). Block 1 queues every program (compiled in parallel where the browser
    // can); block 2, once they are ready, draws one frame with a fresh shadow map so the shadow-depth variants link
    const reveal = (): THREE.Object3D[] => {
      const hidden: THREE.Object3D[] = [];
      this.scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
      return hidden;
    };
    let done: Promise<unknown> = Promise.resolve();
    let hidden = reveal();
    try {
      done = gr.renderer.compileAsync(this.scene, gr.camera).catch(() => undefined);
      // towers and cores turn see-through while a hero stands behind them (towerView's x-ray fade flips
      // `transparent`, a new program): their see-through variants are queued too
      const flipped = new Set<THREE.Material>();
      this.structures.group.traverse((o) => {
        const m = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).material : null;
        if (m && !Array.isArray(m) && !m.transparent) flipped.add(m);
      });
      if (flipped.size) {
        for (const m of flipped) m.transparent = true;
        const both = gr.renderer.compileAsync(this.scene, gr.camera).catch(() => undefined);
        for (const m of flipped) {
          m.transparent = false;
          m.needsUpdate = true;
        }
        done = Promise.all([done, both]);
      }
    } catch {
      /* best effort: the match draws anyway */
    } finally {
      for (const o of hidden) o.visible = false;
    }
    await done;
    if (this.gone || performance.now() > deadline) {
      this.scene.remove(group);
      return 0;
    }
    hidden = reveal();
    try {
      if (gr.renderer.shadowMap.enabled) gr.renderer.shadowMap.needsUpdate = true;
      gr.render();
    } catch {
      /* best effort */
    } finally {
      for (const o of hidden) o.visible = false;
      this.scene.remove(group);
    }
    this.warmed = true;
    return plan.length;
  }

  /** Talent ids of hero `id` (own team only; enemies' are unknown → base numbers), cached per talent triple. */
  private talentsOf(id: number): readonly string[] | null {
    const e = this.frame?.byId.get(id);
    if (!e?.hero || !e.talents) return null;
    const key = `${e.hero}:${e.talents.join(',')}`;
    const c = this.talentKey.get(id);
    if (c && c.key === key) return c.ids;
    const ids = talentIdsOf(e.hero, e.talents);
    this.talentKey.set(id, { key, ids });
    return ids;
  }

  private animTier = '';
  /** Quality tier / reduce motion → the FX kit pools, ribbons, ghosts (§10). */
  private applyAnimTier(): void {
    const t = this.gr.settings.tier;
    const red = this.vfx.reduced;
    const k = `${t}:${red}`;
    if (k === this.animTier) return;
    this.animTier = k;
    this.meshFx.tier = t;
    this.meshFx.reduced = red;
    this.linger.tier = t;
    this.ribbons.setTier(t, red);
    this.ghosts.setTier(t, red);
    this.director.runtime.tier = t;
    this.director.runtime.reduced = red;
    this.effects.natureFx.setTier(t, red);
    this.fightCam.reduced = red;
    this.ultMoment.reduced = red;
    this.minions.reduced = red;
    this.structures.reduced = red;
    this.structures.debris = red ? 0 : t === 'low' ? 0.35 : t === 'med' ? 0.6 : 1;
  }

  /** Per frame after the heroes: FX kit, readability, fight camera (ANIM-SPEC §7–§9). */
  private animPost(frame: ViewFrame | null, dt: number): void {
    this.applyAnimTier();
    this.ribbons.update(dt);
    this.ghosts.update(dt);
    this.meshFx.update(dt, this.time);
    this.linger.update(dt);
    // readability: enemy windups dim any mesh FX over them; own / ally FX fade past the coverage budget
    packTele(this.effects.windups, (id) => this.who.get(id) ?? null, this.myTeam, this.meshFx.uniforms.uTele.value);
    const d = this.gr.dist;
    const want = coverageFade(this.meshFx.area(false), d * d * 0.9, this.gr.settings.tier);
    this.coverK += (want - this.coverK) * Math.min(1, dt * 6);
    this.meshFx.uniforms.uFadeOwn.value = this.coverK;
    // the fight meter
    let n = 0;
    if (frame)
      for (const e of frame.entities) {
        if (e.kind !== 'hero' || n >= this.fightHeroes.length) continue;
        const h = this.fightHeroes[n++];
        h.x = toX(e.fx);
        h.z = toZ(e.fy);
        h.team = e.team;
        h.dead = e.state === 'dead';
      }
    const me = this.lastMe;
    const c = this.gr.renderer.domElement;
    this.fightCam.portrait = c.clientHeight > c.clientWidth;
    this.fightCam.update(dt, this.fightHeroes, n, me ? toX(me.fx) : 0, me ? toZ(me.fy) : 0, !!me && me.state !== 'dead');
  }

  setShadows(on: boolean): void {
    this.heroes.setShadows(on);
    this.minions.setShadows(on);
    this.structures.setShadows(on);
    this.map.setShadows(on);
  }

  setTeam(slot: number, team: 0 | 1, tricks: TrickId[]): void {
    this.mySlot = slot;
    this.myTeam = team;
    // MAP-GAPS A24: a team-1 seat sees the map turned 180°
    setViewTeam(team);
    this.tricks = tricks;
    this.heroes.mySlot = slot;
    this.heroes.myTeam = team;
    this.structures.myTeam = team;
    this.minions.myTeam = team;
    this.projectiles.myTeam = team;
  }

  /**
   * Round 2 ("my pink team is the Woof pack, and the enemy cats defend the bone-topped core"): bases and minions take
   * their species' style. Team 0 wears the cat style unless its heroes are dogs. Relation colours (rings, plates,
   * minimap) stay by relation.
   */
  setSpecies(team0IsDogs: boolean): void {
    this.structures.styleSwap = team0IsDogs;
    this.minions.styleSwap = team0IsDogs;
    // cats vs dogs reads the same from either side: heroes' cloth, bolts, banners and the plaza paw follow the
    // species, and "ally" / "enemy" colours (rings, plates, bars, minimap) take our species' hue (palette.ts)
    setTeam0Dogs(team0IsDogs);
    setSideSwap(team0IsDogs !== (this.myTeam === 1));
    this.heroes.styleSwap = team0IsDogs;
    this.map.setStyleSwap(team0IsDogs);
  }

  /**
   * Round 2 ("the same faces every match"): every bot wears a coat from the free unlock pool (or the classic one),
   * picked from the match seed, and two bots of the same hero never share one.
   */
  dressBots(seed: number, picks: readonly HeroId[], showcase: readonly string[] = []): Map<number, string> {
    const used = new Set<string>();
    const shown = new Map<number, string>();
    picks.forEach((hero, slot) => {
      if (slot === this.mySlot) return;
      const pool: (string | null)[] = [null, ...BOT_COATS.filter((id) => FREE_COATS[id].hero === hero), ...(hero === 'brutus' ? [FREE_BISCUIT] : [])];
      let k = (Math.imul((seed >>> 0) ^ (slot * 0x27d4eb2f), 0x165667b1) >>> 0) % pool.length;
      for (let n = 0; n < pool.length && used.has(`${hero}:${pool[k]}`); n++) k = (k + 1) % pool.length;
      used.add(`${hero}:${pool[k]}`);
      const coat = pool[k];
      if (coat) this.heroes.looks.set(slot, { coat, chroma: null });
      else this.heroes.looks.delete(slot);
    });
    // GDD §7.2 bot showcase (web, from session 2, never the first match; the caller gates it): a featured cat's
    // skin on at most one bot per team and two per match, picked by a render-side hash of the seed (never the sim RNG)
    if (showcase.length) {
      const h = (k: number): number => Math.imul((seed >>> 0) ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
      let next = h(7) % showcase.length;
      for (const team of [0, 1] as const) {
        if (shown.size >= Math.min(2, showcase.length)) break;
        const bots = [0, 1, 2].map((k) => team * 3 + k).filter((slot) => slot !== this.mySlot && slot < picks.length);
        if (!bots.length) continue;
        const slot = bots[h(team) % bots.length];
        const id = showcase[next % showcase.length];
        next++;
        const skin = getSkin(id);
        if (!skin) continue;
        this.heroes.looks.set(slot, cardLook(id));
        shown.set(slot, skin.name);
      }
    }
    return shown;
  }

  /** Card skin effects setting (Settings: All / Mine only / Off). */
  setSkinFx(mode: SkinFxMode): void {
    if (this.heroes.tierFx) this.heroes.tierFx.mode = mode;
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
      this.companions.mySlot = this.mySlot;
      this.scene.add(this.companions.group);
    }
  }

  /**
   * A melee hero's basic attack: a slash crescent in front of it (Wave C C3: a bright edge over a soft glow, tinted
   * with the hero's element), so the swing reads at ~25 px tall where the pose alone did not. Ranged heroes have none.
   */
  private swipe(id: number): void {
    const w = this.who.get(id);
    if (!w || w.kind !== 'hero' || !w.hero || !isMelee(w.hero)) return;
    const base = w.hero === 'clem' ? 0xfff1c4 : w.hero === 'brutus' ? 0xeef3fa : 0xe9e0ff;
    const color = tinted(mixHex(base, elementColor(w.hero), 0.45), this.heroes.cardOf(id));
    const r = w.hero === 'brutus' || w.hero === 'lambo' ? 1.7 : 1.5;
    const side = (this.swipeSide = -this.swipeSide);
    this.vfx.slash(w.x, w.z, w.yaw, r, 2.1, color, side, 1);
  }

  private swipeSide = 1;

  /** Feel pass B1: the Camera height step (Normal / High, render/camera/height.ts), applied at once. */
  setCameraHeight(h: CameraHeight): void {
    this.gr.zoom = heightFactor(h);
  }

  /** The player's hero in the current frame. */
  me(): ViewEntity | null {
    return this.frame?.byId.get(this.mySlot) ?? null;
  }

  /**
   * Back on the hero (Space, a joystick push): a scripted look returns over PEEK_RETURN_S. A minimap held by another
   * finger keeps its peek until it lifts (steering while peeking, as in Wild Rift).
   */
  recentre(): void {
    if (this.peekPt && this.peekPt.until !== Infinity) this.peekPt = null;
  }

  /** Feel pass B1: hold the view on (x, z) m until peekEnd (the minimap held by a finger or the mouse). */
  peekHold(x: number, z: number): void {
    this.peekPt = { x, z, until: Infinity };
  }

  /** The minimap let go: the view returns to the hero over PEEK_RETURN_S. */
  peekEnd(): void {
    this.peekPt = null;
  }

  /** Look at a map point (m) for `hold` s (the core falling, the respawn pan), then return to the hero. */
  lookAt(x: number, z: number, hold = 2.5): void {
    this.peekPt = { x, z, until: this.time + hold };
  }

  /** Is the view off the hero (a peek or a scripted look)? */
  get peeking(): boolean {
    return this.peekPt !== null;
  }

  /**
   * Feel pass B1: the camera offset (m) from the hero for this frame: the peek point, else the aim pan of a skill
   * that reaches past most of the visible half-width, else 0; when either ends, the offset returns over
   * PEEK_RETURN_S (ease out). A peek snaps (it follows a scrubbing finger); the aim pan eases in.
   */
  private cameraOffset(dt: number): void {
    const p = this.peekPt;
    if (p && this.time > p.until) this.peekPt = null;
    let wx = 0;
    let wz = 0;
    let active = false;
    let snap = false;
    this.aimPanM = 0;
    if (this.peekPt) {
      wx = this.peekPt.x - this.follow.x;
      wz = this.peekPt.z - this.follow.z;
      active = snap = true;
    } else {
      const a = this.aim;
      const me = this.lastMe;
      if (a && !a.pointer && me && me.state !== 'dead') {
        const c = this.gr.renderer.domElement;
        const range = a.spec.range / 1000;
        const dx = a.x - this.follow.x;
        const dz = a.z - this.follow.z;
        const l = Math.hypot(dx, dz);
        // the visible ground toward the aim: the near (down-screen) side shows about half the far side's ground
        const sr = screenRightXZ(this.panR);
        const tc = towardCameraXZ(this.panT);
        const reach = groundReach(this.gr.dist, c.clientWidth || 1, c.clientHeight || 1);
        const half = l > 1e-6 ? reachAlong((dx * sr.x + dz * sr.z) / l, -(dx * tc.x + dz * tc.z) / l, reach) : reach.side;
        const pan = aimPan(range, half);
        if (pan > 0 && l > 0.5) {
          const k = pan * Math.min(1, l / Math.max(0.1, range));
          this.aimPanM = k;
          wx = (dx / l) * k;
          wz = (dz / l) * k;
          active = true;
        }
      }
    }
    const o = this.camOff;
    if (active) {
      const k = snap ? 1 : Math.min(1, dt * 25);
      o.x += (wx - o.x) * k;
      o.z += (wz - o.z) * k;
      this.offActive = true;
      this.retT = Infinity;
      return;
    }
    if (this.offActive) {
      this.offActive = false;
      this.retFrom.x = o.x;
      this.retFrom.z = o.z;
      this.retT = 0;
    }
    if (this.retT === Infinity) {
      o.x = o.z = 0;
      return;
    }
    this.retT += dt;
    const s = returnShare(this.retT);
    o.x = this.retFrom.x * s;
    o.z = this.retFrom.z * s;
    if (s === 0) this.retT = Infinity;
  }

  /** MAP-GAPS A10: the ground ping markers (a ring, a pillar and the ping's glyph in its colour). */
  readonly pingMarks = new PingMarkers();
  /** A ping on the ground at (x, z) m: its own marker, never the move-order one. */
  pingMarker(x: number, z: number, color: string, kind: PingKind | null): void {
    this.pingMarks.add(x, z, color, kind);
  }

  /** A ground order marker at (x, z) m: mint for a move, red with crosshair ticks for an attack. */
  orderMarker(x: number, z: number, attack: boolean): void {
    const m = this.marks[this.markNext];
    this.markNext = (this.markNext + 1) % MARKERS;
    m.x = x;
    m.z = z;
    m.t = 0;
    m.attack = attack;
    // LoL pass (lane C): an attack order on a unit outlines that unit in red for a moment
    if (attack && this.frame) {
      let best = -1;
      let bd = 1.2;
      for (const e of this.frame.entities) {
        if (e.state === 'dead' || e.team === this.myTeam || e.kind === 'fountain' || e.kind === 'pickup') continue;
        const d = Math.hypot(toX(e.fx) - x, toZ(e.fy) - z);
        if (d < bd) {
          bd = d;
          best = e.id;
        }
      }
      if (best >= 0) {
        this.targetMark.id = best;
        this.targetMark.t = 0;
      }
    }
  }

  /** Hover ring and order markers for this frame (no allocation). */
  private drawMarks(frame: ViewFrame | null, dt: number): void {
    this.hoverRing.begin();
    // the desktop hover, else a unit aim's target (touch drag-aim and hold-aim show who the cast will hit), else the
    // touch lock (GAPS A5: one ring means "what you hit" on both inputs)
    const a = this.aim;
    const aimId = a && a.spec.kind === 'unit' && a.valid && a.target >= 0 && a.target !== 0xff ? a.target : -1;
    const id = this.hover ? this.hover.id : this.atkCands ? (this.atkSelect ?? -1) : aimId >= 0 ? aimId : (this.lock ?? -1);
    const e = id >= 0 && frame ? frame.byId.get(id) : null;
    if (e && e.state !== 'dead') {
      const size = hoverRingSize(e.kind, e.hero);
      if (size > 0) this.hoverRing.add(toX(e.fx), toZ(e.fy), size * (1 + Math.sin(this.time * 9) * 0.04), HOVER_COLOR[this.hover ? this.hover.rel : 'enemy'], 1);
    }
    this.hoverRing.end();
    this.castRing.begin();
    // a desktop unit-cast preview, else (touch, UX pass 2) the Attack button's target when no bold ring is on it
    const pid = this.atkPreview ?? -1;
    const cid = this.hover?.castId ?? (pid >= 0 && pid !== id && !this.atkCands ? pid : -1);
    const ce = cid >= 0 && frame ? frame.byId.get(cid) : null;
    if (ce && ce.state !== 'dead') {
      const size = hoverRingSize(ce.kind, ce.hero);
      if (size > 0) this.castRing.add(toX(ce.fx), toZ(ce.fy), size, HOVER_COLOR.enemy, cid === pid && this.atkPreviewFar ? 0.45 : 0.85);
    }
    this.castRing.end();
    this.candRings.begin();
    if (this.atkCands && frame) {
      for (const cid2 of this.atkCands) {
        if (cid2 === id) continue;
        const c = frame.byId.get(cid2);
        if (!c || c.state === 'dead') continue;
        const size = hoverRingSize(c.kind, c.hero);
        if (size > 0) this.candRings.add(toX(c.fx), toZ(c.fy), size, HOVER_COLOR.enemy, 0.4);
      }
    }
    this.candRings.end();
    this.pingMarks.update(dt);
    this.moveMarks.begin();
    this.chevrons.begin();
    this.attackMarks.begin();
    for (const m of this.marks) {
      if (m.t < 0) continue;
      m.t += dt;
      const size = markerSize(m.t);
      if (size <= 0) {
        m.t = -1;
        continue;
      }
      if (m.attack) this.attackMarks.add(m.x, m.z, size, MARKER_COLOR.attack, 1, m.t * 2);
      else {
        // LoL pass (lane C): a steady mint ring that fades, and four chevrons collapsing into the point
        if (m.t < MOVE_RING_LIFE) this.moveMarks.add(m.x, m.z, 1.3, MARKER_COLOR.move, 1 - (m.t / MOVE_RING_LIFE) * 0.8);
        const cs = chevronSize(m.t);
        if (cs > 0) this.chevrons.add(m.x, m.z, cs, MARKER_COLOR.move, 1 - (m.t / CHEVRON_LIFE) * 0.4);
      }
    }
    this.moveMarks.end();
    this.attackMarks.end();
    this.chevrons.end();
    // LoL pass (lane C): the attack order's target outline, and on touch a thin ring under the auto-attack target
    this.targetRings.begin();
    const tm = this.targetMark;
    if (tm.t >= 0) {
      tm.t += dt;
      const te = frame?.byId.get(tm.id);
      const a = targetMarkAlpha(tm.t);
      if (a <= 0 || !te || te.state === 'dead') tm.t = -1;
      else {
        const size = hoverRingSize(te.kind, te.hero);
        if (size > 0) this.targetRings.add(toX(te.fx), toZ(te.fy), size * (1.08 - 0.08 * (tm.t / TARGET_MARK_LIFE)), MARKER_COLOR.attack, a);
      }
    }
    this.autoRingId = -1;
    const touch = typeof document !== 'undefined' && document.documentElement.dataset.touch === '1';
    if (touch && this.autoTarget >= 0 && this.time - this.autoTargetAt < AUTO_TARGET_HOLD && this.autoTarget !== id) {
      const ae = frame?.byId.get(this.autoTarget);
      if (ae && ae.state !== 'dead' && ae.hp > 0) {
        const size = hoverRingSize(ae.kind, ae.hero);
        if (size > 0) {
          this.targetRings.add(toX(ae.fx), toZ(ae.fy), size, MARKER_COLOR.attack, 0.75);
          this.autoRingId = ae.id;
        }
      }
    }
    this.targetRings.end();
  }

  private remember(frame: ViewFrame): void {
    const ents = frame.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      let w = this.who.get(e.id);
      if (!w) {
        w = { id: e.id, kind: e.kind, team: e.team, hero: e.hero, x: 0, z: 0, yaw: 0, t: 0 };
        this.who.set(e.id, w);
      }
      w.level = e.level;
      w.maxHp = e.maxHp;
      w.kind = e.kind;
      w.team = e.team;
      w.hero = e.hero;
      w.branch = e.branch === true;
      w.x = toX(e.fx);
      w.z = toZ(e.fy);
      w.yaw = e.yaw;
      w.t = this.time;
    }
    // PERF-IOS §8 Track C: values() and the record's own id (the [id, w] entries cost an array per unit per frame)
    for (const w of this.who.values()) if (this.time - w.t > WHO_TTL) this.who.delete(w.id);
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
      this.heroes.setQuality(this.gr.settings.tier === 'low', this.gr.settings.outlineScope);
      if (this.vfx.tierName !== this.gr.settings.vfxTier) this.vfx.setTier(this.gr.settings.vfxTier);
      if (this.heroes.tierFx) this.heroes.tierFx.low = this.gr.settings.tier === 'low';
      this.heroes.focus.x = this.gr.focus.x;
      this.heroes.focus.z = this.gr.focus.z;
      setCharTime(this.time);
      this.director.update(frame, dt);
      // bodies are drawn clear of the structures (last frame's footprints: they do not move)
      this.heroes.obstacles = this.footprints;
      this.minions.blocks = this.footprints;
      this.heroes.update(frame, dt);
      this.structures.me = me && me.state !== 'dead' ? { x: toX(me.fx), z: toZ(me.fy) } : null;
      this.structures.heroes.length = 0;
      for (const e of frame.entities) if (e.kind === 'hero' && e.state !== 'dead') this.structures.heroes.push({ x: toX(e.fx), z: toZ(e.fy) });
      // minions are drawn clear of every hero body, a fallen one too (a corpse lay through a cart)
      this.minionClear.length = 0;
      // v3.6: from where each hero is drawn (its pushed-apart body), not its sim point: the push-apart moves a body up
      // to half a metre, which left a cadet standing in Sir Brutus's legs and cape (trailer v3.5 review)
      for (const e of frame.entities) {
        if (e.kind !== 'hero') continue;
        const at = this.heroes.drawnAt(e.id);
        this.minionClear.push(at ? { x: at.x, z: at.z } : { x: toX(e.fx), z: toZ(e.fy) });
      }
      this.minions.heroes = this.minionClear;
      this.minions.clearZones = this.structures.fallingCores(this.minions.clearZones);
      this.minions.update(frame, dt, this.time);
      this.structures.update(frame, dt);
      this.footprints = this.structures.footprints(this.footprints);
      this.projectiles.update(frame, dt);
      this.pickups.sync(frame.entities);
      this.companions?.update(frame, dt);
      this.drawWindups(frame);
      // Sim v17 Steadfast: the one-off word when a hero's CC-cap immunity starts (the outline is heroView's)
      for (const id of steadfastEdges(this.steadfastWas, frame.entities, this.steadfastNew)) this.effects.steadfast(id);
      this.drawAim();
      if (me) this.follow.set(toX(me.fx), 0, toZ(me.fy));
      // respawn: back on the hero at once (the follow is rigid, so this only ends a look at the fountain)
      const meDead = me?.state === 'dead';
      if (me && this.wasDead && !meDead) {
        this.peekPt = null;
        this.offActive = false;
        this.retT = Infinity;
        this.camOff.x = this.camOff.z = 0;
      }
      this.wasDead = meDead;
      // lifecycle: after the respawn snap, before the camera eases (its iris moves the focus to the fountain early)
      this.lifecycle?.update(frame, dt);
    }
    this.animPost(frame, dt);
    this.drawMarks(this.frame, dt);
    this.map.setDetail?.(this.gr.settings.forestHalf);
    this.map.setTeam?.(this.myTeam);
    this.map.update(frame, dt, this.gr.camera.position);
    this.pickups.update(dt);
    this.vfx.update(dt, this.frame?.entities ?? NO_ENTITIES, this.mySlot);
    this.particles.update(dt);
    this.shock.render(dt, this.time);
    this.effects.render(dt);
    this.juice.update(dt);
    // feel pass B1: the camera is fixed on the hero (its interpolated render position, no smoothing, no lead, no
    // look-ahead, no fight lean or zoom, no map-edge clamp); only a peek or the long-skill aim pan moves it
    this.cameraOffset(dt);
    this.gr.focus.x = this.follow.x + this.camOff.x;
    this.gr.focus.z = this.follow.z + this.camOff.z;
    sfx.ear.x = this.gr.focus.x;
    sfx.ear.z = this.gr.focus.z;
    this.gr.render();
  }

  /** Sim v17: hero ids Steadfast last frame, and this frame's new ones (scratch). */
  private readonly steadfastWas = new Set<number>();
  private readonly steadfastNew: number[] = [];

  private drawWindups(frame: ViewFrame): void {
    const fx = this.effects;
    fx.pruneWindups(frame.tick);
    this.watchers.clear();
    for (const w of fx.windups) {
      const who = this.who.get(w.src);
      const aim = fx.aimOf(who ?? null, w.slot);
      if (!who || !aim) continue;
      if (who.hero === 'bengas' && w.slot === 1) {
        const src = frame.byId.get(w.src);
        if (src) for (const id of poseWatchers(src, w.x, w.y, frame.entities, this.poseHits)) this.watchers.add(id);
      }
      const fill = Math.max(0, Math.min(1, (frame.tick - w.start) / w.ticks));
      // wind-ups are threats: enemy ones in danger red, ours in the team rose
      const color = who.team === 2 ? RELATION.neutral : who.team === this.myTeam ? RELATION.ally : RELATION.danger;
      const tx = w.x / 1000;
      const tz = -w.y / 1000;
      const yaw = Math.atan2(-(tz - who.z), tx - who.x);
      const spec = windupSpec(who.hero, w.slot, w.dst, frame, aim, who.x, who.z, tx, tz, Number.isFinite(yaw) ? yaw : who.yaw, color);
      // Wave C (C3): an enemy wind-up draws after every VFX layer, so no spark, slash or debris ever hides it
      if (!spec) continue;
      const over = who.team !== this.myTeam;
      // QA v15: a big self ring (Domino's 11 m CONNECT THE DOTS!) filled as a disc covered half a phone screen in
      // fights. Past BIG_RING_M it is the hollow edge plus a thin front that grows to it, so the edge still says
      // where it reaches and the front says when it lands.
      if (spec.shape === 'ring' && spec.length > BIG_RING_M) {
        this.telegraphs.draw({ ...spec, alpha: 0.95, over });
        this.telegraphs.draw({ ...spec, length: Math.max(0.5, spec.length * fill), alpha: 0.75, over });
      } else this.telegraphs.draw({ ...spec, fill, alpha: 0.95, over });
    }
  }

  private drawAim(): void {
    const a = this.aim;
    const me = this.lastMe;
    this.attackRingM = 0;
    if (!me || me.state === 'dead') return;
    const mx = toX(me.fx);
    const mz = toZ(me.fy);
    // the basic attack range ring: thin, dashed, cream with an ink outline per dash (reads on the cream plaza and sand
    // lanes), under the VFX, so it never reads as a skill's solid range ring
    // feel pass B3: "nothing in reach" is a quiet white dashed ring at 30% for 0.4 s (was a big saturated red circle)
    const deny = this.time - this.ringDenyAt < DENY_RING_S;
    if ((this.attackRange || deny) && me.hero) {
      this.attackRingM = attackRingMm(me.hero) / 1000;
      if (deny && !this.attackRange) this.telegraphs.draw({ shape: 'ring', x: mx, z: mz, yaw: 0, length: this.attackRingM, color: 0xffffff, alpha: 0.3, dashed: true });
      else this.telegraphs.draw({ shape: 'ring', x: mx, z: mz, yaw: 0, length: this.attackRingM, color: ATTACK_RING_COLOR, alpha: 0.9, dashed: true });
    }
    if (!a) return;
    const color = a.valid ? RELATION.self : 0xff9f7a;
    const yaw = Math.atan2(-(a.z - mz), a.x - mx);
    const r = a.spec.range / 1000;
    // the skill's max range ring around the hero for every aimed kind (a self cast's shape is its own range; a map-long
    // line, Sage's ult, would only fill the screen)
    // the player's own indicator draws over the VFX with an ink edge (top), so a thumb or cursor aim reads in a brawl
    if (a.spec.kind !== 'self' && r > 0 && r <= RANGE_RING_MAX_M) this.telegraphs.draw({ shape: 'ring', x: mx, z: mz, yaw: 0, length: r, color: RELATION.self, alpha: 0.7, top: true });
    const spec = toSpec(a.spec, mx, mz, a.x, a.z, Number.isFinite(yaw) ? yaw : me.yaw, color);
    // C10: a filled body (0.35), an arrowhead on lines and dashes, and never thinner than 18 px on screen
    if (spec && spec.width !== undefined) spec.width = Math.max(spec.width, AIM_MIN_PX / Math.max(1, this.pxPerMetre(mx, mz)));
    if (spec) this.telegraphs.draw({ ...spec, alpha: 0.95, top: true, solid: 0.35 });
  }

  private readonly _pa = new THREE.Vector3();
  private readonly _pb = new THREE.Vector3();

  /** Screen pixels per world metre at ground point (x, z) (C10's minimum aim width). */
  pxPerMetre(x: number, z: number): number {
    const cam = this.gr.camera;
    // PERF-IOS P1-5: the CSS size cached on resize (clientWidth/Height every frame forced a layout)
    const h = this.gr.cssH || 1;
    this._pa.set(x, 0, z).project(cam);
    this._pb.set(x + 1, 0, z).project(cam);
    const w = this.gr.cssW || 1;
    const dx = ((this._pb.x - this._pa.x) * w) / 2;
    const dy = ((this._pb.y - this._pa.y) * h) / 2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  dispose(): void {
    this.gone = true;
    for (const ch of this.warmKeep) ch.dispose();
    this.warmKeep.length = 0;
    this.gr.preRender = null;
    this.scene.remove(this.map.group, this.heroes.group, this.minions.group, this.structures.group, this.projectiles.group, this.telegraphs.group, this.pickups.group);
    this.scene.remove(this.hoverRing.mesh, this.castRing.mesh, this.candRings.mesh, this.moveMarks.mesh, this.attackMarks.mesh, this.chevrons.mesh, this.targetRings.mesh, this.vfx.auras.mesh);
    this.pingMarks.dispose();
    this.vfx.dispose();
    this.scene.remove(this.meshFx.group, this.linger.mesh, this.ribbons.mesh, this.ghosts.group);
    this.meshFx.dispose();
    this.linger.dispose();
    this.ribbons.dispose();
    this.ghosts.dispose();
    this.ultMoment.dispose();
    this.director.dispose();
    this.hoverRing.dispose();
    this.castRing.dispose();
    this.candRings.dispose();
    this.moveMarks.dispose();
    this.attackMarks.dispose();
    this.chevrons.dispose();
    this.targetRings.dispose();
    this.pickups.dispose();
    if (this.companions) {
      this.scene.remove(this.companions.group);
      this.companions.dispose();
      this.companions = null;
    }
    this.map.dispose();
    this.heroes.dispose();
    this.minions.dispose();
    this.structures.dispose();
    this.projectiles.dispose();
    this.telegraphs.dispose();
    this.effects.dispose();
    this.juice.dispose();
    // GameView owns both: dispose (not clear) so their pools, rings and cracks leave the shared scene and free their GL buffers
    this.particles.dispose();
    this.shock.dispose();
    this.lifecycleGone = true; // lifecycle
    // fun-fx: drop this view's pools, camera and pop target (the chunk is cached by now, or never loaded)
    void import('./fx/fun/funKit').then((m) => m.clearFunSink(this.particles)).catch(() => undefined);
    this.lifecycle?.dispose();
    this.lifecycle = null;
  }
}

/** The basic attack range ring's colour (warm cream: neither the gold skill ring nor a team colour). */
const ATTACK_RING_COLOR = 0xfff1d6;
/** C10: the aim shape's width is at least this many screen pixels. */
const AIM_MIN_PX = 18;
/** A skill range ring wider than this (m) is not drawn (it would only fill the screen). */
const RANGE_RING_MAX_M = 15;
/** A wind-up ring wider than this (m) draws hollow with a growing front instead of a filled disc (QA v15). */
const BIG_RING_M = 7;

/** Sim v17 (V17.md §7): the Pack Hunt mark's radius over its victim (m). */
export const HUNT_MARK_M = 1.2;

/**
 * Sim v17 (V17.md §7): a windup's telegraph. Most read the slot's aim shape (toSpec); Lambo's Belly Flop draws its
 * stun ring at the landing point the event carries, and Cacklejaw's Pack Hunt marks its victim (`dst`) instead of a
 * 12 m ring. Pure apart from reading `frame`.
 */
export function windupSpec(
  hero: HeroId | undefined,
  slot: number,
  dst: number,
  frame: Pick<ViewFrame, 'byId'>,
  aim: AimSpec,
  x: number,
  z: number,
  ax: number,
  az: number,
  yaw: number,
  color: number,
): TelegraphSpec | null {
  if (hero === 'lambo' && slot === 2) return { shape: 'circle', x: ax, z: az, yaw: 0, length: (HEROES.lambo.abilities.e.radius ?? 1800) / 1000, color };
  if (hero === 'cacklejaw' && slot === 3) {
    const v = dst >= 0 ? frame.byId.get(dst) : undefined;
    return v ? { shape: 'circle', x: toX(v.fx), z: toZ(v.fy), yaw: 0, length: HUNT_MARK_M, color } : null;
  }
  return toSpec(aim, x, z, ax, az, yaw, color);
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
export function aimOfSlot(hero: HeroId, trick: TrickId, slot: 0 | 1 | 2 | 3 | 4, branch = false): AimSpec {
  return slot === 4 ? trickAim(trick) : aimFor(hero, slot, branch);
}

/** One hero the warm-up builds (PERF-IOS §8 Track C). */
export interface WarmHero {
  slot: number;
  hero: HeroId;
  team: 0 | 1;
  outline: boolean;
}

/**
 * The heroes `GameView.warmup()` builds: every slot without a rig yet (`has`; each slot, so its look's cached geometry
 * is built too, not only its programs), with the outline hull HeroView gives it under `scope` (all, own hero and
 * enemies on phones, own hero, none). The own hero is skipped: its rig is up from the first frame. Pure, unit-tested.
 */
export function warmPlan(roster: readonly HeroId[], mySlot: number, myTeam: number, scope: 'all' | 'key' | 'own' | 'none', has: (slot: number) => boolean): WarmHero[] {
  const out: WarmHero[] = [];
  for (let slot = 0; slot < roster.length; slot++) {
    if (slot === mySlot || has(slot)) continue;
    const team = teamOfSlot(slot) as 0 | 1;
    const outline = scope === 'all' || (scope === 'key' && team !== myTeam);
    out.push({ slot, hero: roster[slot], team, outline });
  }
  return out;
}
