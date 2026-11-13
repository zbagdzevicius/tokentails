/**
 * Structures and objectives: towers, cores, fountains, rat camp monsters and Pudding. Towers flash and shudder when
 * hit, show a shimmer while invulnerable and a dashed range ring when the player's hero walks near an enemy tower;
 * a destroyed structure leaves rubble. Render only.
 *
 * Weight: a shooting tower or core charges before each shot (a glow and a crouch over the last 40% of its 1 s period,
 * or over a lock-on windup), and fires with a recoil (a stretch that rings out) and a muzzle burst on the frame its
 * bolt appears. A falling tower cracks (a flash, a swell and a shudder), topples over its base edge like a felled tree
 * (gravity, a bounce on the ground), throws chunks of its walls and roof and breaks up into rubble along the line it
 * fell on (1.1 s). A falling core bursts on the killing blow (a ring of chunks), caves in on itself and settles (1.3 s; its slow
 * motion runs over it). Chunks are a pooled instanced mesh (fewer on lower quality tiers, none with reduce motion).
 * Nothing allocates per frame.
 *
 * V21-FUN §4 damage states (views/towerDamage.ts): a tower or core shows its health on the model. Below 66% HP its
 * walls crack (the rig shader's `uDmg`) and a few chips fly off; below 33% it burns (smoke, flame licks and embers via
 * `fire`, render/fx/towerFire.ts, and the cracks glow); below 15% it blazes and wobbles. A tower leans toward the side
 * it will fall to. The state never goes back down; the rubble of a fallen one smoulders for its hold.
 *
 * Living pass (P2): the set pieces breathe. Every structure material carries the life patch (`structureLifeMaterial`,
 * uniforms only, the same program on every tier): a tower's orb (or bone) bobs ±4 cm, turns and glows ±10%, the core's
 * yarn ball turns, a camp monster sniffs (head), sways its tail, shuffles a few cm and shows a sleepy Zz while nobody
 * bothers it, and the fountain's water ripples, foams at the rim and churns round the spout (views/fountainWater.ts) with
 * droplets from the spout. Critters (views/critters.ts) flutter over the open ground away from the lanes. A falling core
 * throws its chunks further, a light burst and confetti in the winner's colour, and leaves a low warm-grey mound. Low
 * (ambient level 0) keeps only a half-amplitude orb bob (free) and still water; reduce motion scales it all down. The
 * HP-bar anchor and hit box never move (they read the entity and the model's bounding box, not the life pose).
 */
import * as THREE from 'three';
import { CORE_STATS, TOWERS } from '../../data/towers';
import { RADIUS } from '../../data/map';
import { BuffFlag } from '../../sim/api';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { RELATION } from '../palette';
import { DecalLayer, dashRingTexture } from './decals';
import { aggroPulse, TowerBeams } from '../fx/towerBeams';
import { coreGeometry, crowGeometry, fountainGeometry, grizzlechopGeometry, hedgehogGeometry, puddingGeometry, ratGeometry, toadGeometry, towerGeometry } from './models';
import { rigMaterial, type RigUniforms, casterDepthMaterial } from './rig';
import { CRACK_K, DAMAGE_POSE, EMBER_K, STAGE_HIT, nextStage, type DamageStage } from './towerDamage';
import type { TowerFire } from '../fx/towerFire';
import { MAP } from '../../data/map';
import { mapInfo } from '../../sim/map/info';
import type { Ambient, AmbientFx } from '../ambient';
import { FADE, GROW, SHAPE } from '../fx/Particles.js';
import { CritterLayer } from './critters';
import { SPOUT, WATER_GLSL, spoutDrops } from './fountainWater';
import { LIFE_PART } from './models';

/**
 * Living pass: the structure life pose (render only). `uLifeA` = (orb / yarn turn rad, orb bob m, head yaw rad, head nod
 * rad), `uLifeB` = (tail yaw rad, orb glow −0.1..0.1, 0, 0), `uLifeW` = the fountain water (fountainWater.ts).
 */
export interface LifeUniforms {
  uLifeA: { value: THREE.Vector4 };
  uLifeB: { value: THREE.Vector4 };
  uLifeW: { value: THREE.Vector4 };
}

/** The life knobs: orb bob (m) and glow (±), turn rates (rad/s), camp sniff / tail / shuffle, Zz cadence (s). */
export const LIFE = Object.freeze({ bob: 0.04, glow: 0.1, orbTurn: 0.55, yarnTurn: 0.16, lowBob: 0.5, sniff: 0.38, nod: 0.1, tail: 0.45, shuffle: 0.05, zzEvery: 2.4, sleepAfter: 3 });

const LIFE_VERT = /* glsl */ `
uniform vec4 uLifeA;
uniform vec4 uLifeB;
varying vec3 vPlLObj;
varying float vPlPart;
mat3 plLife(float p){
  if (p < ${LIFE_PART.orb - 0.5} || p > ${LIFE_PART.tail + 0.5}) return mat3(1.0);
  if (p < ${LIFE_PART.yarn + 0.5}) return plRy(uLifeA.x);
  if (p < ${LIFE_PART.head + 0.5}) return plRy(uLifeA.z) * plRz(uLifeA.w);
  return plRy(uLifeB.x);
}
`;

const LIFE_FRAG = /* glsl */ `
uniform vec4 uLifeB;
uniform vec4 uLifeW;
varying vec3 vPlLObj;
varying float vPlPart;
${WATER_GLSL}
`;

/**
 * Chain the life patch onto a structure's rig material (views/rig.ts rigMaterial): uniforms only, so every tier runs
 * the same program (Low sets the amplitudes to 0). The cache key gains `-life1`.
 */
export function structureLifeMaterial<M extends THREE.MeshLambertMaterial>(m: M): M & { userData: { life: LifeUniforms } } {
  const life: LifeUniforms = { uLifeA: { value: new THREE.Vector4() }, uLifeB: { value: new THREE.Vector4() }, uLifeW: { value: new THREE.Vector4() } };
  const out = m as M & { userData: { life: LifeUniforms } };
  out.userData.life = life;
  const base = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, r) => {
    base.call(m, shader, r);
    Object.assign(shader.uniforms, life);
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_pars_vertex>', `#include <uv_pars_vertex>\n${LIFE_VERT}`)
      .replace('objectNormal = plR * objectNormal;', 'objectNormal = plR * objectNormal;\nmat3 plL = plLife(aPart);\nobjectNormal = plL * objectNormal;')
      .replace(
        'transformed = plR * (transformed - aPivot) + aPivot;',
        `vPlLObj = transformed;\nvPlPart = aPart;\ntransformed = plR * (transformed - aPivot) + aPivot;\ntransformed = plL * (transformed - aPivot) + aPivot;\nif (aPart > ${LIFE_PART.orb - 0.5} && aPart < ${LIFE_PART.orb + 0.5}) transformed.y += uLifeA.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <uv_pars_fragment>', `#include <uv_pars_fragment>\n${LIFE_FRAG}`)
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>\nif (vPlPart > ${LIFE_PART.orb - 0.5} && vPlPart < ${LIFE_PART.orb + 0.5}) gl_FragColor.rgb *= 1.0 + uLifeB.y;\nelse if (vPlPart > ${LIFE_PART.water - 0.5}) gl_FragColor.rgb = plWater(gl_FragColor.rgb, vPlLObj, step(${LIFE_PART.spout - 0.5}, vPlPart));`,
      );
  };
  m.customProgramCacheKey = () => `${key.call(m)}-life1`;
  return out;
}

/** Confetti colours by the winner's species (0 cats: rose, 1 dogs: sky), with cream paper; v6 Lightning Rivalry. */
export const CONFETTI = Object.freeze({ max: 60, cat: Object.freeze([0xff3d7f, 0xff86a5, 0xffb3cd, 0xfff3e3]), dog: Object.freeze([0x39a6ff, 0x7cc6ff, 0xd6ecff, 0xfff3e3]) });
export function confettiColors(winnerSpecies: 0 | 1): readonly number[] {
  return winnerSpecies === 1 ? CONFETTI.dog : CONFETTI.cat;
}
/** Confetti pieces a core fall throws (≤ CONFETTI.max × the debris share; none with reduce motion). */
export function confettiCount(debris: number): number {
  return Math.round(CONFETTI.max * Math.max(0, Math.min(1, debris)));
}

/**
 * The orb and camp life amplitude for an ambient (0..1): Low keeps a half bob (free; none with reduce motion),
 * Med / High follow the ambient motion.
 */
export function lifeAmp(a: Pick<Ambient, 'level' | 'motion' | 'reduced'> | null): number {
  if (!a) return LIFE.lowBob;
  if (a.level === 0) return a.reduced ? 0 : LIFE.lowBob;
  return a.motion;
}

interface Structure {
  id: number;
  kind: ViewEntity['kind'];
  mesh: THREE.Mesh;
  rig: RigUniforms;
  material: THREE.MeshLambertMaterial;
  flash: number;
  shake: number;
  hpFrac: number;
  bubble: THREE.Mesh | null;
  phase: number;
  x: number;
  z: number;
  alive: boolean;
  /** Last shot (render s), a lock-on windup (start, length s), the fall clock (s, −1 = standing). */
  shotAt: number;
  lockAt: number;
  lockLen: number;
  dieT: number;
  /** Tilt direction for the fall (rad about the vertical), the structure height (m). */
  fallDir: number;
  height: number;
  /** The fall's ground impact (tower) or burst (core) has thrown its chunks. */
  impacted: boolean;
  team: number;
  stamp: number;
  /** Last time it took a hit (render s): a core under attack never fades. */
  hitAt: number;
  /** Under fire (0..1, smoothed): a steady light tint instead of a white pulse on every hit (no strobe). */
  heat: number;
  /** The fall has finished: a tower or core never stands up again, even if the frame still lists it (match end). */
  fallen: boolean;
  /** Footprint radius (m) for drawing unit bodies clear of it. */
  radius: number;
  /** Its rubble has been laid (it grows in while the structure sinks). */
  rubbled?: boolean;
  /** V21-FUN §4: the damage state (−1 = not seen yet; it only goes up), when the fall ended (render s). */
  stage: number;
  fallenAt: number;
  /** Fire emit accumulators: smoke, flame, ember, smoulder (towers and cores only). */
  fireAcc: Float32Array | null;
  /** Living pass: the life uniforms, a seed (rad), and the spout-drop / Zz accumulators. */
  life: LifeUniforms;
  seed: number;
  lifeAcc: Float32Array;
  /** The base's style: the dog doghouse (chunk colours, smoke tint). */
  dog: boolean;
  /** The model's half-width (m): where the flames lick out. */
  girth: number;
}

/**
 * Hit feedback on a structure (render only). Trailer review: a tower under steady fire pulsed white on every hit and
 * strobed between washed-out and saturated. Now only the first hit after a quiet `gap` s pulses; while hits keep
 * coming the structure holds a light `tint` (smoothed at `rate` per s).
 */
/**
 * MAP-GAPS A17: the clear radius (m) unit bodies are drawn outside of round a tower or core: its sim footprint
 * (RADIUS) plus 0.6 m, not the mesh's bounding box (a body drawn far out misread where the hero really stood).
 */
export const STRUCT_CLEAR_PAD = 0.6;
export function structureClearRadius(kind: 'tower' | 'core'): number {
  return (kind === 'core' ? RADIUS.core : RADIUS.tower) / 1000 + STRUCT_CLEAR_PAD;
}

export const STRUCT_HIT = Object.freeze({ gap: 1.0, pulse: 0.8, tint: 0.1, hold: 0.5, rate: 6 });

/** The hit pulse a structure takes now (pure): a full pulse after a quiet gap, none under steady fire. */
export function hitPulse(sinceLastHit: number, flash: number): number {
  return sinceLastHit > STRUCT_HIT.gap ? Math.max(flash, STRUCT_HIT.pulse) : flash;
}

/**
 * Rubble left by a fall grows in over this long (s) while the structure sinks into the ground: the structure is never
 * drawn see-through (trailer review: a translucent ghost box, then rubble popping in on one frame).
 */
export const RUBBLE_GROW = 0.35;

/**
 * The direction a tower falls (rad about the vertical, 0 = +x): across the screen, toward its own base (away from the
 * attackers). Trailer review: a tower falling toward the camera foreshortened into what looked like a tower standing.
 */
export function fallDirOf(team: number): number {
  return team === 1 ? 0 : Math.PI;
}

/** Pudding leaving the map (calmed): a hop and a shrink over this long (s), with a puff (render only). */
export const PUDDING_OUT = 0.5;

/** Shot rhythm (s) and the charge / recoil / fall shapes. */
export const STRUCT_ANIM = Object.freeze({ period: TOWERS.outer.attackEvery / 30, corePeriod: CORE_STATS.attackEvery / 30, chargeFrom: 0.6, crouch: 0.05, glow: 0.4, recoil: 0.08, fallTower: 1.1, fallCore: 1.3 });

/**
 * The fall's shape (fractions of the fall). Tower: crack until `crack`, topple (gravity) until `hit`, a bounce until
 * `settle`, then the break-up. Core: swell until `burst`, cave in until `caved`, then settle into the ground.
 */
/** Peak hit-flash tint during a fall (render only): the core's swell and burst stay a glow on its own colour. */
/**
 * The core's fall glow: a warm tint at `core` of the mix (the mix runs in linear light, so 0.2 of white lifted the dark
 * Woof doghouse to a pale grey see-through-looking box on its last frames; trailer v3.2 review), in `color`. v3.3
 * review: the tower's crack flash (0.8 of white) turned the navy dog tower pale and see-through-looking on one frame
 * two frames before it toppled; a tower now cracks with the same warm tint at `tower`.
 */
export const FALL_FLASH = Object.freeze({ core: 0.05, tower: 0.08, color: 0xffe14a });
/**
 * v3.9: the core is crushed flat and gone by this fraction of its fall (STRUCT_ANIM.fallCore 1.3 s: 0.18 s, about 7
 * frames after the burst at 60 fps); it never sinks through the plaza (the dust over a sunk roof read as a see-through
 * slab, trailer v3.8 review).
 */
export const CORE_GONE = 0.14;
export const FALL_SHAPE = Object.freeze({ crack: 0.12, hit: 0.6, settle: 0.7, topple: 1.42, bounce: 0.12, burst: 0.05, caved: 0.45 });

/**
 * Chunks thrown by a fall: pool size, per tower / core at full quality, gravity (m/s²), life (s), and the core burst's
 * launch speed (m/s) and chunk size (m). Trailer review: the core threw 26 big unit boxes that filled the frame, hung in
 * the sky and read as placeholder primitives; now fewer, smaller, faceted chunks on a short, low arc.
 */
export const DEBRIS = Object.freeze({ pool: 48, tower: 12, core: 14, gravity: 22, life: 1.0, coreSpeed: 8, coreSize: 0.42, towerSize: 0.42 });

/** LoL pass (lane C): the idle tower range ring is a pale warm white; it turns red only while the tower is on you. */
const RANGE_IDLE = 0xffe2c4;
const TOWER_RANGE_M = Math.max(TOWERS.outer.range, TOWERS.inner.range) / 1000;
/**
 * X-ray: a tower or core fades while a hero stands in the patch it hides on screen. The camera looks north (−Z)
 * from the south, so a tall structure covers the ground just north of it.
 */
const COVER = Object.freeze({ halfWidth: 1.9, north: 5.5, south: 0.6, opacity: 0.32, coreHitHold: 5, coreHpFloor: 0.6 });

/**
 * The x-ray opacity a tower or core wants. A core under attack (hit in the last `coreHitHold` s) or already hurt
 * (below `coreHpFloor` of its HP) stays solid: the climax ("Their core is falling!") must show the core, not a ghost.
 */
export function xrayOpacity(kind: string, hides: boolean, hpFrac: number, sinceHit: number): number {
  if (!hides) return 1;
  if (kind === 'core' && (sinceHit < COVER.coreHitHold || hpFrac < COVER.coreHpFloor)) return 1;
  return COVER.opacity;
}

/** A fallen tower's rubble line: held (s), then sunk into the ground over (s). */
export const RUBBLE = Object.freeze({ hold: 4, sink: 1.5 });

/** Invulnerable bubble alpha: at the rim and across the face (render only). */
export const BUBBLE = Object.freeze({ rim: 0.42, core: 0.02 });

/** Chunk colours per side (walls, trim, roof) and scratch objects (no per-frame allocation). */
const DEBRIS_CAT = [0xfff3e3, 0xe6d6b8, 0xff3d7f, 0xc8135b, 0xffe14a];
const DEBRIS_DOG = [0x9a8366, 0xb5762b, 0x6e4520, 0xd9a441, 0x7a6448];
/** Living pass: a fallen core's rubble mound (warm grey; was a cool grey ring of stones). */
const RUBBLE_WARM = 0xa8977c;
const MOUND_WARM = 0xb5a488;
const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Kinds this view draws (heroes, minions and pickups have their own views; an unknown kind is skipped). */
const STRUCTURE_KINDS: ReadonlySet<string> = new Set(['tower', 'core', 'fountain', 'camp', 'pudding', 'boss']);
/** Sim v19 (Hearthwood): how big each jungle monster is drawn (the 3v3 rat camp keeps 1.3). */
const CAMP_SCALE: Readonly<Record<string, number>> = Object.freeze({ rat: 1.3, prickle: 1.7, crow: 1.6, toad: 1.5, boss: 2.2 });

export class StructureView {
  readonly group = new THREE.Group();
  private items = new Map<number, Structure>();
  private rubble: THREE.Mesh[] = [];
  private bubbleGeo = new THREE.SphereGeometry(1, 20, 14);
  /**
   * The invulnerable bubble: a fresnel rim (bright at the silhouette, clear in the middle), normal blending. It was a
   * flat additive sphere that washed the pale plaza round the core and towers to a white glare.
   */
  private bubbleMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x7cc6ff) }, uRim: { value: BUBBLE.rim }, uCore: { value: BUBBLE.core } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uRim, uCore; varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor, uCore + uRim * f * f * f); }',
    transparent: true,
    depthWrite: false,
  });
  private rubbleMat = new THREE.MeshLambertMaterial({ color: RUBBLE_WARM });
  private moundMat = new THREE.MeshLambertMaterial({ color: MOUND_WARM });
  /** Living pass: the ambient level (null until gameView applies one: Low-like, a half bob only), the shared pools. */
  private amb: Ambient | null = null;
  private fx: AmbientFx | null = null;
  private lifeT = 0;
  /** Living pass: the critters over the open ground (one draw on Med / High; hidden on Low). */
  readonly critters: CritterLayer | null = null;
  private ranges = new DecalLayer(dashRingTexture(), 8, { additive: true, y: 0.06, name: 'tower-ranges' });
  /** LoL pass (lane C): the red aggro ring, normal blending (an additive red washed out to pink on the pale paths). */
  private aggroRings = new DecalLayer(dashRingTexture(), 6, { y: 0.065, name: 'tower-aggro' });
  private geoCache = new Map<string, THREE.BufferGeometry>();
  private time = 0;
  private stamp = 0;
  /** Projectile owner / last-seen stamp per pool index (a new bolt from a tower or core is its shot). */
  private readonly projOwner = new Int32Array(512);
  private readonly projStamp = new Int32Array(512);
  /** Reduce motion: no tilt or sink, a short fade of the fall; no crouch / recoil. */
  reduced = false;
  /** A tower / core shot left at (x, y, z) m (gameView: the muzzle burst). */
  onShot: ((x: number, y: number, z: number, team: number) => void) | null = null;
  /** Pudding left at (x, z) (calmed): gameView's puff and sparkles. */
  onCalmed: ((x: number, z: number) => void) | null = null;
  /** A fall finished at (x, z) (gameView: the dust settling). */
  onFallen: ((x: number, z: number, core: boolean) => void) | null = null;
  /**
   * A falling tower hit the ground (along the line from (x, z) toward (dx, dz) over `len` m), or a core burst at
   * (x, z) (len 0) (gameView: dust along the line, a shockwave, a kick).
   */
  onImpact: ((x: number, z: number, dx: number, dz: number, len: number, core: boolean) => void) | null = null;
  /**
   * V21-FUN §4: a tower or core crossed into damage state `stage` (1 cracked, 2 burning, 3 blazing) from `prev` (gameView:
   * the crack / ignite sound and our "tower is burning" callout). Not called for the state it already had when first seen.
   */
  onStage: ((id: number, kind: 'tower' | 'core', team: number, stage: DamageStage, prev: number, x: number, z: number, lane: string | undefined) => void) | null = null;
  /** V21-FUN §4: the fire emitter (gameView sets it; null = no fire, the cracks and lean still show). */
  fire: TowerFire | null = null;
  /** Share of the chunks a fall throws (quality tier: 1 high, 0.6 med, 0.35 low); 0 = none. */
  debris = 1;
  private debrisMesh: THREE.InstancedMesh;
  private debrisLive = 0;
  /** Per chunk: position, velocity, rotation, spin (xyz each), size, age, life. */
  private readonly dP = new Float32Array(DEBRIS.pool * 3);
  private readonly dV = new Float32Array(DEBRIS.pool * 3);
  private readonly dR = new Float32Array(DEBRIS.pool * 3);
  private readonly dW = new Float32Array(DEBRIS.pool * 3);
  private readonly dS = new Float32Array(DEBRIS.pool);
  private readonly dAge = new Float32Array(DEBRIS.pool);
  private readonly dLife = new Float32Array(DEBRIS.pool);
  private dNext = 0;
  private rng = 0x2f6b1d;
  myTeam: 0 | 1 = 0;
  /** Round 2: team 0 is the dogs (the human picked a dog): each base wears the other team's style. */
  styleSwap = false;
  /** Player hero position (m) for the range rings; null when dead. */
  me: { x: number; z: number } | null = null;
  /** Hero positions (m) this frame, for the x-ray fade. */
  heroes: { x: number; z: number }[] = [];

  /** LoL pass (lane C): tower targeting beams and charging lines. */
  readonly beams = new TowerBeams();
  /** LoL pass (lane C): when (view seconds) each tower last hit or aimed at the player (the red aggro ring). */
  private readonly aggroAt = new Map<number, number>();

  constructor() {
    this.group.name = 'structures';
    this.group.add(this.ranges.mesh, this.aggroRings.mesh, this.beams.group);
    // faceted chunks (a low-poly stone), not unit cubes
    this.debrisMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.62, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), DEBRIS.pool);
    this.debrisMesh.name = 'structure-debris';
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = true;
    this.debrisMesh.customDepthMaterial = casterDepthMaterial('instanced-color');
    for (let i = 0; i < DEBRIS.pool; i++) this.debrisMesh.setColorAt(i, _col.setHex(0xffffff));
    this.group.add(this.debrisMesh);
    // living pass: the critter layer for the bound map (built now, so the match build compiles it; nothing is drawn
    // until an ambient level asks for critters)
    try {
      const layer = new CritterLayer(mapInfo(MAP.point === 1 ? 'hearthwood' : 'crossing'));
      layer.setAmbient({ level: 1, tier: 'med', reduced: false, phone: false, motion: 0, speed: 1, density: 0 });
      layer.mesh.visible = true;
      this.group.add(layer.mesh);
      (this as { critters: CritterLayer | null }).critters = layer;
    } catch {
      /* no map bound (a bare unit test): no critters */
    }
  }

  /** Living pass: the ambient level for this tier (ambient.ts). */
  setAmbient(a: Ambient): void {
    this.amb = a;
    this.critters?.setAmbient(a);
  }

  /** Living pass: the shared particle pools (spout drops, Zz, camp dust, the core-fall confetti and light burst). */
  setAmbientFx(fx: AmbientFx): void {
    this.fx = fx;
  }

  /** Living pass: the ambient level now (tests). */
  get ambient(): Ambient | null {
    return this.amb;
  }

  /**
   * Living pass: the idle life pose of one standing structure (uniforms and, for camps, a few cm of shuffle): orb bob,
   * turn and glow, yarn turn, camp sniff and tail, fountain water and spout drops, a sleepy Zz.
   */
  private live(s: Structure, e: ViewEntity, dt: number): void {
    const a = this.amb;
    const k = lifeAmp(a);
    const t = this.lifeT + s.seed;
    const A = s.life.uLifeA.value;
    const B = s.life.uLifeB.value;
    const on = !!a && a.level > 0;
    if (s.kind === 'tower' || s.kind === 'core') {
      A.x = s.seed + this.lifeT * (s.kind === 'core' && !s.dog ? LIFE.yarnTurn : LIFE.orbTurn) * Math.max(k, 0.2);
      A.y = LIFE.bob * k * Math.sin(t * 1.6);
      B.y = on ? LIFE.glow * (a.reduced ? 0.3 : 1) * Math.sin(t * 1.9 + 0.7) : 0;
      return;
    }
    if (s.kind === 'fountain') {
      const W = s.life.uLifeW.value;
      W.x = on ? Math.max(0.35, a.motion) : 0;
      W.y = this.lifeT;
      W.z = on ? 1 : 0;
      if (on && this.fx && a.density > 0) {
        const n = spoutDrops(s.lifeAcc, dt, a.density);
        const p = this.fx.particles;
        if (n > 0 && p.room(false, n)) this.spout(s, n);
      }
      return;
    }
    if (s.kind !== 'camp' && s.kind !== 'boss') return;
    const asleep = e.hp >= e.maxHp && e.speed < 0.5 && this.time - s.hitAt > LIFE.sleepAfter && (e.state === 'idle' || e.state === 'napping');
    const idle = asleep ? 1 : 0.25;
    // sniff: a slow look about with quick nose twitches in bursts
    const burst = Math.max(0, Math.sin(t * 0.9) - 0.4) / 0.6;
    A.z = k * idle * (LIFE.sniff * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 11) * burst);
    A.w = k * LIFE.nod * (Math.sin(t * 9) * burst * idle + (asleep ? -0.6 : 0));
    B.x = k * LIFE.tail * Math.sin(t * (asleep ? 2.2 : 5.5));
    if (asleep && on) {
      // a shuffle of a few cm along its facing, a small turn
      const off = LIFE.shuffle * k * Math.sin(t * 0.7) * (Math.sin(t * 0.23) > 0 ? 1 : 0.3);
      s.mesh.position.x += Math.cos(e.yaw) * off;
      s.mesh.position.z -= Math.sin(e.yaw) * off;
      s.mesh.rotation.y = e.yaw + 0.12 * k * Math.sin(t * 0.5);
      // a sleepy Zz now and then (fewer at a lower density)
      s.lifeAcc[1] += dt * Math.min(1, a.density + 0.2);
      if (s.lifeAcc[1] >= LIFE.zzEvery && this.fx) {
        s.lifeAcc[1] = 0;
        const sc = s.mesh.scale.y;
        if (this.fx.particles.room(false, 1)) this.zz(s.x, (e.kind === 'boss' ? 2.2 : 0.9) * sc, s.z);
      }
    } else s.lifeAcc[1] = Math.min(s.lifeAcc[1], LIFE.zzEvery * 0.5);
  }

  /** Spout droplets: little arcs from the spout ball falling back into the basin. */
  private spout(s: Structure, n: number): void {
    const p = this.fx!.particles;
    const sx = s.x + (s.team === 1 ? 1.2 : -1.2);
    for (let i = 0; i < n; i++) {
      const sp = p.begin() as Record<string, number>;
      const ang = this.rand() * Math.PI * 2;
      const out = SPOUT.out * (0.6 + this.rand() * 0.6);
      sp.x = sx + Math.cos(ang) * 0.12;
      sp.y = 1.38;
      sp.z = s.z + Math.sin(ang) * 0.12;
      sp.vx = Math.cos(ang) * out;
      sp.vz = Math.sin(ang) * out;
      sp.vy = SPOUT.up * (0.8 + this.rand() * 0.4);
      sp.gravity = 9;
      sp.life = SPOUT.life;
      sp.size0 = SPOUT.size;
      sp.size1 = SPOUT.size * 0.7;
      sp.shape = SHAPE.DROPLET;
      sp.fade = FADE.HOLD;
      sp.floor = 0.08;
      sp.bounce = 0;
      _col.setHex(SPOUT.color);
      sp.r = _col.r;
      sp.g = _col.g;
      sp.b = _col.b;
      sp.a = 0.85;
      p.emit(false);
    }
  }

  /** A sleepy Zz rising off a camp monster (soft lilac, small: it reads on sand and grass, never a team colour). */
  private zz(x: number, y: number, z: number): void {
    const p = this.fx!.particles;
    const sp = p.begin() as Record<string, number>;
    sp.x = x + 0.15;
    sp.y = y;
    sp.z = z;
    sp.vx = 0.18;
    sp.vy = 0.45;
    sp.life = 1.6;
    sp.size0 = 0.32;
    sp.size1 = 0.5;
    sp.grow = GROW.OUT;
    sp.fade = FADE.IN_OUT;
    sp.shape = SHAPE.ZED;
    sp.rot = -0.2;
    _col.setHex(0xa898e6);
    sp.r = _col.r;
    sp.g = _col.g;
    sp.b = _col.b;
    sp.a = 0.9;
    p.emit(false);
  }

  /** A camp monster (re)appears: a small dust puff where it stands. */
  private campDust(x: number, z: number): void {
    const p = this.fx?.particles;
    if (!p || !this.amb || this.amb.level === 0 || !p.room(false, 6)) return;
    _v.set(x, 0.3, z);
    p.burst(_v, { n: 6, exact: true, shape: SHAPE.PUFF, color: 0xf2ddbb, alpha: 0.7, size: [0.4, 0.7], sizeEnd: 1.8, life: [0.5, 0.8], speed: [0.8, 1.8], up: 0.5, drag: 2 });
  }

  /**
   * Living pass: a core's burst. A short light burst (FALL_FLASH colour) and confetti in the winner's colour (≤
   * CONFETTI.max × debris, through the pool guard); none with reduce motion (debris 0).
   */
  private coreCelebrate(s: Structure): void {
    const p = this.fx?.particles;
    if (!p) return;
    _v.set(s.x, s.height * 0.5, s.z);
    if (p.room(true, 2)) {
      p.single(_v, { shape: SHAPE.SOFT, color: FALL_FLASH.color, intensity: 1.0, size0: 2.5, size1: 7.5, life: 0.4, alpha: 0.5 });
      p.single(_v, { shape: SHAPE.STAR8, color: 0xfff6da, intensity: 1.6, size0: 4, size1: 0.6, life: 0.32, rot: 0.3 });
    }
    const winner = ((s.team === 1 ? 0 : 1) ^ (this.styleSwap ? 1 : 0)) as 0 | 1;
    const cols = confettiColors(winner);
    const n = p.claim(false, confettiCount(this.debris));
    if (n <= 0) return;
    _v.set(s.x, s.height * 0.75, s.z);
    for (let c = 0; c < cols.length; c++) {
      const m = Math.floor(n / cols.length) + (c < n % cols.length ? 1 : 0);
      if (m > 0)
        p.burst(_v, { n: m, exact: true, shape: SHAPE.CONFETTI, color: cols[c], size: [0.22, 0.34], life: [2.2, 3.2], speed: [4, 9], dir: _up, spread: 0.95, gravity: 5, drag: 1.1, spin: 7, fade: FADE.HOLD, jitter: 0.8, floor: true, bounce: 0.1 });
    }
  }

  /** A deterministic 0..1 (render only: the chunks' spread). */
  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 4294967296;
  }

  /** Throw `n` chunks from points along (x, z) -> (x + dx·len, z + dz·len) at height y0..y1, in `colors`. */
  private throwChunks(n: number, x: number, z: number, dx: number, dz: number, len: number, y0: number, y1: number, colors: readonly number[], speed: number, size: number): void {
    const k = Math.round(n * Math.max(0, Math.min(1, this.debris)));
    for (let j = 0; j < k; j++) {
      const i = this.dNext;
      this.dNext = (this.dNext + 1) % DEBRIS.pool;
      const t = len > 0 ? this.rand() : 0;
      const a = this.rand() * Math.PI * 2;
      const o = i * 3;
      this.dP[o] = x + dx * len * t + Math.cos(a) * 0.4;
      this.dP[o + 1] = y0 + (y1 - y0) * this.rand();
      this.dP[o + 2] = z + dz * len * t + Math.sin(a) * 0.4;
      const sp = speed * (0.55 + this.rand() * 0.6);
      this.dV[o] = Math.cos(a) * sp + dx * sp * 0.3;
      this.dV[o + 1] = speed * (0.7 + this.rand() * 0.8);
      this.dV[o + 2] = Math.sin(a) * sp + dz * sp * 0.3;
      for (let c = 0; c < 3; c++) {
        this.dR[o + c] = this.rand() * 6.28;
        this.dW[o + c] = (this.rand() - 0.5) * 18;
      }
      this.dS[i] = size * (0.55 + this.rand() * 0.9);
      this.dAge[i] = 0;
      this.dLife[i] = DEBRIS.life * (0.75 + this.rand() * 0.5);
      this.debrisMesh.setColorAt(i, _col.setHex(colors[j % colors.length]));
    }
    if (k > 0) {
      this.debrisLive = DEBRIS.pool;
      if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    }
  }

  /** Chunks fly, tumble, bounce on the ground and shrink away at the end of their life. */
  private updateDebris(dt: number): void {
    if (this.debrisLive <= 0) return;
    let live = 0;
    for (let i = 0; i < DEBRIS.pool; i++) {
      const o = i * 3;
      if (this.dAge[i] >= this.dLife[i]) {
        _m4.makeScale(0, 0, 0);
        this.debrisMesh.setMatrixAt(i, _m4);
        continue;
      }
      live++;
      this.dAge[i] += dt;
      this.dV[o + 1] -= DEBRIS.gravity * dt;
      for (let c = 0; c < 3; c++) {
        this.dP[o + c] += this.dV[o + c] * dt;
        this.dR[o + c] += this.dW[o + c] * dt;
      }
      const s = this.dS[i];
      if (this.dP[o + 1] < s * 0.62) {
        // the ground (the chunk's radius): a damped bounce, friction, the tumble slows
        this.dP[o + 1] = s * 0.62;
        if (this.dV[o + 1] < 0) this.dV[o + 1] *= -0.32;
        this.dV[o] *= 0.6;
        this.dV[o + 2] *= 0.6;
        for (let c = 0; c < 3; c++) this.dW[o + c] *= 0.6;
      }
      const left = this.dLife[i] - this.dAge[i];
      const k = s * (left < 0.3 ? Math.max(0, left / 0.3) : 1);
      _e.set(this.dR[o], this.dR[o + 1], this.dR[o + 2]);
      _q.setFromEuler(_e);
      _v.set(this.dP[o], this.dP[o + 1], this.dP[o + 2]);
      _sv.set(k, k, k);
      _m4.compose(_v, _q, _sv);
      this.debrisMesh.setMatrixAt(i, _m4);
    }
    this.debrisMesh.count = DEBRIS.pool;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (live === 0) {
      this.debrisLive = 0;
      this.debrisMesh.count = 0;
    }
  }

  private geo(e: ViewEntity): THREE.BufferGeometry {
    // round 2: the base looks like its species (a dog-picking human defends the bone-topped doghouse)
    const team = ((e.team === 1 ? 1 : 0) ^ (this.styleSwap ? 1 : 0)) as 0 | 1;
    const key = `${e.kind}:${team}:${e.variant ?? ''}`;
    let g = this.geoCache.get(key);
    if (!g) {
      switch (e.kind) {
        case 'tower':
          g = towerGeometry(team, e.variant === 'inner' || e.variant === 'gate' || e.variant === 'hearth' ? e.variant : 'outer');
          break;
        case 'boss':
          g = grizzlechopGeometry();
          break;
        case 'core':
          g = coreGeometry(team);
          break;
        case 'fountain':
          g = fountainGeometry(team);
          break;
        case 'pudding':
          g = puddingGeometry();
          break;
        default:
          g = e.variant === 'prickle' ? hedgehogGeometry() : e.variant === 'crow' ? crowGeometry() : e.variant === 'toad' ? toadGeometry() : ratGeometry();
      }
      this.geoCache.set(key, g);
    }
    return g;
  }

  private ensure(e: ViewEntity): Structure {
    let s = this.items.get(e.id);
    if (!s) {
      const material = structureLifeMaterial(rigMaterial({ cracks: e.kind === 'tower' || e.kind === 'core' }));
      const mesh = new THREE.Mesh(this.geo(e), material);
      mesh.name = `${e.kind}-${e.id}`;
      mesh.castShadow = e.kind !== 'fountain';
      mesh.receiveShadow = e.kind === 'fountain';
      // Woof structures face west, Purrhaven east.
      mesh.rotation.y = e.team === 1 ? Math.PI : 0;
      this.group.add(mesh);
      let bubble: THREE.Mesh | null = null;
      if (e.kind === 'tower' || e.kind === 'core') {
        bubble = new THREE.Mesh(this.bubbleGeo, this.bubbleMat);
        bubble.scale.setScalar(e.kind === 'core' ? 3.2 : 2.4);
        bubble.position.y = e.kind === 'core' ? 2.0 : 2.4;
        bubble.visible = false;
        mesh.add(bubble);
      }
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      const height = bb ? bb.max.y : 4;
      // the footprint: the base's half-width (towers and cores are drawn at their entity point)
      const radius = e.kind === 'tower' || e.kind === 'core' ? structureClearRadius(e.kind) : bb ? Math.min(Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z), 3.2) : 1.2;
      const struct = e.kind === 'tower' || e.kind === 'core';
      const dog = ((e.team === 1 ? 1 : 0) ^ (this.styleSwap ? 1 : 0)) === 1;
      s = { id: e.id, kind: e.kind, mesh, rig: material.userData.rig, material, flash: 0, shake: 0, hpFrac: 1, bubble, phase: e.id, x: 0, z: 0, alive: true, shotAt: -99, lockAt: -99, lockLen: 0, dieT: -1, fallDir: fallDirOf(e.team), height, team: e.team, stamp: 0, impacted: false, hitAt: -99, heat: 0, fallen: false, radius, stage: -1, fallenAt: -99, fireAcc: struct ? new Float32Array(4) : null, life: material.userData.life, seed: ((e.id * 2654435761) >>> 0) / 683565275.6, lifeAcc: new Float32Array(2), dog, girth: bb ? Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z) * 0.85 : 1.3 };
      this.items.set(e.id, s);
      if ((e.kind === 'camp' || e.kind === 'boss') && this.time > 1.5) this.campDust(toX(e.fx), toZ(e.fy));
    }
    return s;
  }

  /** Tower / core `id` fell (the sim's tower event, the core's death): its fall starts now, once. */
  fell(id: number): void {
    const s = this.items.get(id);
    if (!s || !s.alive || s.fallen || (s.kind !== 'tower' && s.kind !== 'core')) return;
    s.alive = false;
    s.dieT = 0;
    s.flash = 1;
    s.impacted = false;
    if (s.bubble) s.bubble.visible = false;
  }

  /** A lock-on windup on tower / core `id` for `seconds` (the charge builds over it). */
  windup(id: number, seconds: number): void {
    const s = this.items.get(id);
    if (!s || (s.kind !== 'tower' && s.kind !== 'core')) return;
    s.lockAt = this.time;
    s.lockLen = Math.max(0.05, seconds);
  }

  /** Charge 0..1 before the next shot (the lock-on windup, else the shot rhythm while it keeps shooting). */
  private charge(s: Structure): number {
    const lt = this.time - s.lockAt;
    if (lt >= 0 && lt < s.lockLen) return lt / s.lockLen;
    const P = s.kind === 'core' ? STRUCT_ANIM.corePeriod : STRUCT_ANIM.period;
    const f = (this.time - s.shotAt) / P;
    if (f < 0 || f > 1.6) return 0;
    const c = (f - STRUCT_ANIM.chargeFrom) / (1 - STRUCT_ANIM.chargeFrom);
    return c <= 0 ? 0 : c >= 1 ? 1 : c * c;
  }

  /**
   * LoL pass (lane C): tower / core `id` hit a unit at (x, y, z) m: a beam from its tip; `me` = the player (red, thick,
   * a flare, and the tower's range ring turns red for a moment).
   */
  shotAt(id: number, x: number, y: number, z: number, me: boolean): void {
    const s = this.items.get(id);
    if (!s || !s.alive || (s.kind !== 'tower' && s.kind !== 'core')) return;
    const col = s.team === this.myTeam ? 0xffd34d : 0xff7a5c;
    this.beams.shot(s.x, s.height * 0.85, s.z, x, y, z, col, me);
    if (me) this.aggroAt.set(id, this.time);
  }

  /** LoL pass (lane C): tower / core `id` winds up a shot at (x, z) m for `seconds`: a thin charging line toward it. */
  chargeAt(id: number, x: number, z: number, seconds: number, me: boolean): void {
    const s = this.items.get(id);
    if (!s || !s.alive || (s.kind !== 'tower' && s.kind !== 'core')) return;
    const col = me ? 0xff3b3b : s.team === this.myTeam ? 0xffd34d : 0xff9a7a;
    this.beams.shot(s.x, s.height * 0.85, s.z, x, 0.9, z, col, me, true, seconds);
    if (me) this.aggroAt.set(id, this.time);
  }

  /** LoL pass (lane C): tower `id` aims at the player (its lock-on): the range ring turns red. */
  markAggro(id: number): void {
    this.aggroAt.set(id, this.time);
  }

  /** LoL pass (lane C): is tower `id`'s range ring red now (it hit or aimed at the player within 1.5 s)? */
  aggro(id: number): boolean {
    return aggroPulse(this.time - (this.aggroAt.get(id) ?? -99), this.time) > 0;
  }

  hit(id: number): void {
    const s = this.items.get(id);
    if (!s) return;
    const quiet = this.time - s.hitAt;
    s.hitAt = this.time;
    // every structure, Pudding and the camp monsters too: a pulse after a quiet spell, a steady tint under fire
    s.flash = hitPulse(quiet, s.flash);
    if (quiet > STRUCT_HIT.gap) s.shake = s.kind === 'camp' || s.kind === 'boss' ? 1 : 0.6;
  }

  setShadows(on: boolean): void {
    for (const s of this.items.values()) s.mesh.castShadow = on && s.kind !== 'fountain';
  }

  update(frame: ViewFrame, dt: number): void {
    this.time += dt;
    this.lifeT += dt * (this.amb ? this.amb.speed : 1);
    this.critters?.update(dt);
    const stamp = ++this.stamp;
    this.ranges.begin();
    this.aggroRings.begin();
    // a new bolt owned by a tower or core is its shot (the recoil and muzzle burst on that frame)
    const ps = frame.projectiles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.index < 0 || p.index >= this.projOwner.length) continue;
      if (this.projStamp[p.index] !== stamp - 1 || this.projOwner[p.index] !== p.owner + 1) {
        const s = this.items.get(p.owner);
        if (s && s.alive && (s.kind === 'tower' || s.kind === 'core')) {
          s.shotAt = this.time;
          s.lockAt = -99;
          s.flash = Math.max(s.flash, 0.55);
          this.onShot?.(s.x, s.height * 0.85, s.z, s.team);
        }
      }
      this.projOwner[p.index] = p.owner + 1;
      this.projStamp[p.index] = stamp;
    }
    for (const e of frame.entities) {
      // pickups have their own view (views/pickupView.ts)
      if (!STRUCTURE_KINDS.has(e.kind)) continue;
      const s = this.ensure(e);
      s.stamp = stamp;
      // falling, or fallen: a structure never stands up again (the match-end frame can still list a dead core)
      if (s.dieT >= 0 || s.fallen) continue;
      s.alive = true;
      s.mesh.visible = true;
      s.x = toX(e.fx);
      s.z = toZ(e.fy);
      s.hpFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
      s.flash = Math.max(0, s.flash - dt * 5);
      s.shake = Math.max(0, s.shake - dt * 4);
      const jx = Math.sin(this.time * 70) * s.shake * 0.08;
      if (e.kind === 'camp' || e.kind === 'boss') {
        s.phase += dt * (e.speed > 3 ? 12 : 2);
        s.mesh.position.set(s.x + (e.kind === 'boss' ? jx : 0), Math.abs(Math.sin(s.phase)) * 0.08, s.z);
        s.mesh.rotation.y = e.yaw;
        s.mesh.scale.setScalar(CAMP_SCALE[e.kind === 'boss' ? 'boss' : (e.variant ?? 'rat')] ?? 1.3);
      } else if (e.kind === 'pudding') {
        const w = Math.sin(this.time * 3.1);
        s.mesh.position.set(s.x, 0, s.z);
        s.mesh.rotation.y = e.yaw;
        s.mesh.scale.set(1 + w * 0.04 + s.shake * 0.1, 1 - w * 0.05 - s.shake * 0.12, 1 + w * 0.04 + s.shake * 0.1);
      } else {
        s.mesh.position.set(s.x + jx, 0, s.z);
        if (e.kind === 'tower' || e.kind === 'core') {
          // charge (a crouch and a glow) and the recoil that rings out after a shot
          const c = this.charge(s);
          const ts = this.time - s.shotAt;
          const rec = this.reduced || ts > 0.6 ? 0 : Math.exp(-ts * 9) * Math.cos(ts * 28) * STRUCT_ANIM.recoil;
          const sy = 1 - (this.reduced ? 0 : c * STRUCT_ANIM.crouch) + rec;
          const sx = 1 / Math.sqrt(sy);
          s.mesh.scale.set(sx, sy, sx);
          s.flash = Math.max(s.flash, c * STRUCT_ANIM.glow);
          this.damage(s, e, dt);
        }
      }
      this.live(s, e, dt);
      if (e.kind === 'tower' || e.kind === 'core') {
        const scale = e.kind === 'core' ? 1.6 : 1;
        let hides = false;
        for (let hi = 0; hi < this.heroes.length && !hides; hi++) {
          const h = this.heroes[hi];
          hides = Math.abs(h.x - s.x) < COVER.halfWidth * scale && s.z - h.z < COVER.north * scale && s.z - h.z > -COVER.south;
        }
        const want = xrayOpacity(e.kind, hides, s.hpFrac, this.time - s.hitAt);
        const u = s.rig.uOpacity;
        u.value += (want - u.value) * Math.min(1, dt * 10);
        if (Math.abs(u.value - want) < 0.01) u.value = want;
        const transparent = u.value < 0.999;
        if (s.material.transparent !== transparent) {
          s.material.transparent = transparent;
          s.material.depthWrite = !transparent;
          s.material.needsUpdate = true;
        }
      }
      // under steady fire: a light, smoothed tint (no strobe); the first hit after a quiet spell still pulses
      const hot = this.time - s.hitAt < STRUCT_HIT.hold ? 1 : 0;
      s.heat += (hot - s.heat) * Math.min(1, dt * STRUCT_HIT.rate);
      s.rig.uFlashK.value = Math.max(s.flash * 0.7, s.heat * STRUCT_HIT.tint);
      s.rig.uTime.value = this.time;
      if (s.bubble) s.bubble.visible = (e.buffs & BuffFlag.Invulnerable) !== 0;
      if (s.bubble?.visible) s.bubble.scale.setScalar((s.kind === 'core' ? 3.2 : 2.4) * (1 + Math.sin(this.time * 3) * 0.02));
      if (e.kind === 'tower' && e.team !== this.myTeam && this.me) {
        // LoL pass (lane C): the range ring turns red and pulses at 2 Hz while the tower is on the player (hit or aim
        // in the last 1.5 s); otherwise the faint pale ring when the player comes near
        const ag = aggroPulse(this.time - (this.aggroAt.get(e.id) ?? -99), this.time);
        const mdx = this.me.x - s.x;
        const mdz = this.me.z - s.z;
        const d = Math.sqrt(mdx * mdx + mdz * mdz);
        if (ag > 0) {
          this.aggroRings.add(s.x, s.z, TOWER_RANGE_M * 2, RELATION.danger, ag);
          this.aggroRings.add(s.x, s.z, TOWER_RANGE_M * 2 * 0.985, RELATION.danger, 0.8 * ag);
        } else if (d < TOWER_RANGE_M + 4) {
          const a = Math.min(1, (TOWER_RANGE_M + 4 - d) / 3);
          this.ranges.add(s.x, s.z, TOWER_RANGE_M * 2, RANGE_IDLE, 0.5 * a);
        }
      }
    }
    // PERF-IOS §8 Track B: values(), not entries (an entry array per structure per frame); the id is s.id
    for (const s of this.items.values()) {
      const id = s.id;
      if (s.dieT >= 0) {
        this.fall(s, dt);
        continue;
      }
      // V21-FUN §4: the rubble of a fallen tower or core smoulders while it is held
      if (s.fallen && s.fireAcc && this.fire && this.time - s.fallenAt < RUBBLE.hold) {
        // over the rubble: a tower's lies along its fall line, a core's on its plaza
        const k = s.kind === 'tower' ? s.height * 0.35 : 0;
        this.fire.smoulder(s.x + Math.cos(s.fallDir) * k, s.z + Math.sin(s.fallDir) * k, s.fireAcc, dt);
      }
      if (s.stamp === stamp || !s.alive || s.fallen) continue;
      s.alive = false;
      if (s.kind === 'tower' || s.kind === 'core') {
        // the fall plays out before the rubble is left
        s.dieT = 0;
        s.flash = 1;
        s.impacted = false;
        if (s.bubble) s.bubble.visible = false;
        // the fall is always drawn solid: an x-ray fade under way when the killing blow landed (a hero standing in
        // the patch it hides) used to carry into the fall as a see-through grey box (trailer review)
        s.rig.uOpacity.value = 1;
        if (s.material.transparent) {
          s.material.transparent = false;
          s.material.depthWrite = true;
          s.material.needsUpdate = true;
        }
        continue;
      }
      if (s.kind === 'pudding') {
        // calmed (or gone): a short hop and shrink with a puff, never a vanish on one frame (trailer review)
        s.dieT = 0;
        this.onCalmed?.(s.x, s.z);
        continue;
      }
      s.mesh.visible = false;
      if (s.kind === 'camp' || s.kind === 'boss') {
        this.items.delete(id);
        s.material.dispose();
        this.group.remove(s.mesh);
      }
    }
    this.ranges.end();
    this.aggroRings.end();
    this.beams.update(dt);
    this.updateDebris(dt);
    this.updateRubble();
  }

  /**
   * V21-FUN §4: a standing tower or core's damage state: cracks (and their ember glow), chips and a small flash when
   * it crosses into a new state, a lean toward its fall side (towers), a wobble while blazing, and the fire.
   */
  private damage(s: Structure, e: ViewEntity, dt: number): void {
    const prev = s.stage;
    const st = nextStage(prev, s.hpFrac);
    if (prev >= 0 && st > prev) {
      s.flash = Math.max(s.flash, STAGE_HIT.flash / 0.7);
      if (st === 1 || prev < 1) {
        // chips off the walls (the fall's chunk pool), a few, from the upper half
        this.throwChunks(STAGE_HIT.chips, s.x, s.z, 0, 0, 0, s.height * 0.45, s.height * 0.8, s.dog ? DEBRIS_DOG : DEBRIS_CAT, 3.2, DEBRIS.towerSize * 0.6);
      }
      this.onStage?.(s.id, s.kind as 'tower' | 'core', s.team, st, prev, s.x, s.z, e.lane);
    }
    s.stage = st;
    s.rig.uDmg.value = CRACK_K[st];
    s.rig.uEmber.value = EMBER_K[st];
    if (s.kind === 'tower') {
      const yaw = s.team === 1 ? Math.PI : 0;
      let th = 0;
      if (!this.reduced) {
        th = DAMAGE_POSE.lean[st];
        if (st >= 3) th += Math.sin((this.time + s.id * 0.37) * DAMAGE_POSE.wobbleHz * Math.PI * 2) * DAMAGE_POSE.wobble;
      }
      if (th !== 0) {
        _q.setFromAxisAngle(_v.set(Math.sin(s.fallDir), 0, -Math.cos(s.fallDir)), th);
        _q2.setFromAxisAngle(_up, yaw);
        s.mesh.quaternion.copy(_q).multiply(_q2);
      } else if (s.mesh.rotation.x !== 0 || s.mesh.rotation.z !== 0) s.mesh.rotation.set(0, yaw, 0);
    }
    if (st >= 2 && this.fire && s.fireAcc) this.fire.burn(s.x, s.z, s.height, st, s.dog, s.kind === 'core', s.fireAcc, dt, s.girth);
  }

  /** V21-FUN §4: the damage state drawn on structure `id` (−1 = none or not a tower / core). Tests and the lab. */
  stageOf(id: number): number {
    return this.items.get(id)?.stage ?? -1;
  }

  /** A tower or core falling (see the header); the rubble at the end. Pudding leaving: a hop and a shrink. */
  private fall(s: Structure, dt: number): void {
    if (s.kind === 'pudding') {
      s.dieT += dt;
      const u = Math.min(1, s.dieT / PUDDING_OUT);
      const hop = Math.sin(Math.min(1, u * 1.6) * Math.PI) * 0.9;
      const k = u < 0.35 ? 1 + u * 0.4 : Math.max(0, 1.14 * (1 - (u - 0.35) / 0.65));
      s.mesh.position.y = hop;
      s.mesh.scale.set(k, k * (u < 0.15 ? 0.85 : 1.05), k);
      if (u >= 1) {
        s.mesh.visible = false;
        this.items.delete(s.id);
        s.material.dispose();
        this.group.remove(s.mesh);
      }
      return;
    }
    const core = s.kind === 'core';
    const L = core ? STRUCT_ANIM.fallCore : STRUCT_ANIM.fallTower;
    s.dieT += dt;
    const u = Math.min(1, s.dieT / L);
    const dx = Math.cos(s.fallDir);
    const dz = Math.sin(s.fallDir);
    const yaw = s.team === 1 ? Math.PI : 0;
    if (u >= 1) {
      s.dieT = -1;
      s.fallen = true;
      s.fallenAt = this.time;
      s.mesh.visible = false;
      s.mesh.rotation.set(0, yaw, 0);
      s.mesh.scale.setScalar(1);
      s.rig.uOpacity.value = 1;
      // the rubble grew in during the settle (no pop); reduce motion adds it here
      if (!s.rubbled) this.rubbleFor(s, dx, dz, false);
      this.onFallen?.(s.x, s.z, core);
      return;
    }
    s.rig.uTime.value = this.time;
    if (this.reduced) {
      s.flash = Math.max(0, 1 - u * 3);
      s.rig.uFlashK.value = s.flash * 0.8;
      s.mesh.scale.setScalar(1 - u * 0.5);
      return;
    }
    const F = FALL_SHAPE;
    const colors = ((s.team === 1 ? 1 : 0) ^ (this.styleSwap ? 1 : 0)) === 1 ? DEBRIS_DOG : DEBRIS_CAT;
    if (core) {
      // swell and shudder, BURST (a ring of chunks), then crushed flat and gone (CORE_GONE)
      const shud = u < F.burst ? Math.sin(this.time * 70) * 0.09 * (u / F.burst) : 0;
      const swell = u < F.burst ? 0.1 * (u / F.burst) ** 2 : 0;
      // v3.9 (trailer review: as the doghouse caved in and settled into the plaza over 0.8 s, the dust over its sunk
      // roof read as a see-through slab with the bone floating in it): the core crushes flat on the spot in
      // CORE_GONE of the fall (about 7 frames after the burst), never below the plaza, and is gone; the burst's chunks,
      // dust and the rubble growing in carry the rest of the moment
      const c = u < F.burst ? 0 : Math.min(1, (u - F.burst) / (CORE_GONE - F.burst));
      const cave = c * c;
      s.flash = u < F.burst ? 0.4 + 0.6 * (u / F.burst) : Math.max(0, 1 - (u - F.burst) * 4);
      // a warm glow, not a white-out: at 0.75 the Woof doghouse turned pale grey and read as a ghost box
      s.rig.uFlash.value.setHex(FALL_FLASH.color);
      s.rig.uFlashK.value = s.flash * FALL_FLASH.core;
      if (!s.impacted && u >= F.burst) {
        s.impacted = true;
        this.throwChunks(DEBRIS.core, s.x, s.z, 0, 0, 0, 0.8, s.height * 0.6, colors, DEBRIS.coreSpeed, DEBRIS.coreSize);
        this.coreCelebrate(s);
        this.onImpact?.(s.x, s.z, 0, 0, 0, true);
        if (!s.rubbled) this.rubbleFor(s, dx, dz, true);
      }
      if (c >= 1) {
        s.mesh.visible = false;
        return;
      }
      const sy = (1 + swell) * (1 - 0.96 * cave);
      const sxz = (1 + swell) * (1 + 0.18 * cave);
      s.mesh.scale.set(sxz, sy, sxz);
      const tilt = 0.12 * cave;
      _q.setFromAxisAngle(_v.set(dz, 0, -dx), tilt);
      _q2.setFromAxisAngle(_up, yaw);
      s.mesh.quaternion.copy(_q).multiply(_q2);
      s.mesh.position.set(s.x + shud, 0, s.z);
      return;
    }
    // tower: crack (flash, swell, shudder) -> topple about the base edge (gravity) -> a bounce -> break up and sink
    const R = 1.4;
    let th = 0;
    if (u < F.crack) th = -0.05 * Math.sin((u / F.crack) * Math.PI);
    else if (u < F.hit) th = F.topple * ((u - F.crack) / (F.hit - F.crack)) ** 2;
    else if (u < F.settle) th = F.topple - F.bounce * Math.sin(((u - F.hit) / (F.settle - F.hit)) * Math.PI);
    else th = F.topple;
    const swell = u < F.crack ? Math.sin((u / F.crack) * Math.PI) * 0.07 : 0;
    const shud = u < F.crack ? Math.sin(this.time * 75) * 0.08 : 0;
    const brk = u < F.settle ? 0 : (u - F.settle) / (1 - F.settle);
    s.flash = u < F.crack ? 1 : Math.max(0, 0.6 - (u - F.crack) * 2.5) + (u >= F.hit && u < F.hit + 0.05 ? 0.5 : 0);
    // a warm, faint crack glow (FALL_FLASH): white at 0.8 read as the tower turning see-through on one frame
    s.rig.uFlash.value.setHex(FALL_FLASH.color);
    s.rig.uFlashK.value = Math.min(1, s.flash) * FALL_FLASH.tower;
    if (!s.impacted && u >= F.hit) {
      s.impacted = true;
      const len = s.height * 0.95;
      this.throwChunks(DEBRIS.tower, s.x, s.z, dx, dz, len, 0.4, 1.4, colors, 7.5, DEBRIS.towerSize);
      this.onImpact?.(s.x, s.z, dx, dz, len, false);
    }
    // the pivot is the base edge on the fall side: the base lifts as it rolls over it
    _q.setFromAxisAngle(_v.set(dz, 0, -dx), th);
    _q2.setFromAxisAngle(_up, yaw);
    s.mesh.quaternion.copy(_q).multiply(_q2);
    const lift = R * Math.sin(Math.max(0, th));
    const slide = R * (1 - Math.cos(th));
    // break-up: it sinks into the ground, opaque, while the rubble along its fall line grows in (no ghost, no pop)
    if (brk > 0 && !s.rubbled) this.rubbleFor(s, dx, dz, true);
    const sink = brk * brk * 1.9;
    s.mesh.position.set(s.x + dx * slide + shud, lift - sink, s.z + dz * slide);
    const sxz = (1 + swell) * (1 - 0.3 * brk);
    s.mesh.scale.set(sxz, (1 + swell) * (1 - 0.55 * brk), sxz);
  }

  /** The rubble a fall leaves (growing in over RUBBLE_GROW s when `grow`), once per structure. */
  private rubbleFor(s: Structure, dx: number, dz: number, grow: boolean): void {
    s.rubbled = true;
    const from = grow ? this.time : -Infinity;
    if (s.kind === 'core' || this.reduced) this.addRubble(s.x, s.z, s.kind === 'core' ? 2.4 : 1.4, 0, 0, 0, s.kind === 'core' ? Infinity : this.time + RUBBLE.hold + 0.4, from);
    // living pass: a fallen core leaves a low warm-grey mound under its stones (not a flat disc)
    if (s.kind === 'core') this.addMound(s.x, s.z, from);
    else {
      // the line of rubble the tower fell along sinks away after RUBBLE.hold s (it lay across the lane: carts
      // drove through it); a small pile stays on its base
      this.addRubble(s.x + dx * s.height * 0.45, s.z + dz * s.height * 0.45, 1.6, dx, dz, s.height * 0.5, this.time + RUBBLE.hold + 0.4, from);
      // v3.9 (trailer review: heroes and cadets walked straight through a boulder on the lane): a fallen tower frees its
      // base cells in the sim (grid.ts coverDisc), so the pile on its base sinks away with the line; no rock is left on
      // ground anyone can walk
      this.addRubble(s.x, s.z, 0.9, 0, 0, 0, this.time + RUBBLE.hold + 0.4, from);
    }
  }

  /**
   * Ground circles (m) round each core that is falling or has fallen (minions there are not drawn: no cart in the
   * burst; trailer review: hidden only while it fell, the carts and pups popped back on the rubble when it ended).
   */
  fallingCores(out: { x: number; z: number; r: number }[]): { x: number; z: number; r: number }[] {
    out.length = 0;
    for (const s of this.items.values()) if (s.kind === 'core' && (s.dieT >= 0 || s.fallen)) out.push({ x: s.x, z: s.z, r: 3.5 });
    return out;
  }

  /**
   * Footprints (m) of the standing towers and cores, Pudding and the camp monsters: unit bodies are drawn outside
   * them (render only; the sim lets a hero stand in a tower's base).
   */
  footprints(out: { x: number; z: number; r: number }[]): { x: number; z: number; r: number }[] {
    out.length = 0;
    // PERF-IOS §8 Track B: per frame; the records are reused (callers read them within the frame)
    this.fpOut = out;
    this.items.forEach(this.fpPush);
    this.fpOut = null;
    return out;
  }
  private fpOut: { x: number; z: number; r: number }[] | null = null;
  private readonly fpPool: { x: number; z: number; r: number }[] = [];
  private readonly fpPush = (s: Structure): void => {
    const out = this.fpOut;
    if (!out || s.kind === 'fountain' || !s.alive || s.fallen || s.dieT >= 0 || !s.mesh.visible) return;
    const n = out.length;
    if (this.fpPool.length <= n) this.fpPool.push({ x: 0.5, z: 0.5, r: 0.5 });
    const f = this.fpPool[n];
    f.x = s.x;
    f.z = s.z;
    f.r = s.radius * (s.kind === 'pudding' || s.kind === 'camp' || s.kind === 'boss' ? s.mesh.scale.x : 1);
    out.push(f);
  };

  /** Last drawn ground position of a structure. */
  positionOf(id: number): { x: number; z: number } | null {
    const s = this.items.get(id);
    return s ? { x: s.x, z: s.z } : null;
  }

  /** Rubble round (x, z), or (a fallen tower) strewn along the line (dx, dz) over ±len. */
  private addRubble(x: number, z: number, r: number, dx = 0, dz = 0, len = 0, sinkAt = Infinity, growFrom = -Infinity): void {
    const g = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(g, this.rubbleMat);
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const d = r * (0.3 + ((i * 37) % 10) / 14);
      const t = len ? (i / 6 - 0.5) * 2 * len : 0;
      m.position.set(x + Math.cos(a) * d * (len ? 0.5 : 1) + dx * t, 0.15, z + Math.sin(a) * d * (len ? 0.5 : 1) + dz * t);
      const sc = 0.25 + ((i * 13) % 7) / 12;
      m.scale.setScalar(Number.isFinite(growFrom) ? 0.001 : sc);
      m.rotation.set(i, i * 2, i * 3);
      m.receiveShadow = true;
      m.userData.sinkAt = sinkAt;
      m.userData.size = sc;
      m.userData.growFrom = growFrom;
      this.group.add(m);
      this.rubble.push(m);
    }
  }

  /** A low, flattened mound (warm grey) under a fallen core's stones, growing in with them. */
  private addMound(x: number, z: number, growFrom: number): void {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), this.moundMat);
    m.position.set(x, 0.02, z);
    m.rotation.set(0, 0.4, 0);
    m.userData.flat = [2.3, 0.42, 2.1];
    m.userData.size = 1;
    m.userData.sinkAt = Infinity;
    m.userData.growFrom = growFrom;
    const k = Number.isFinite(growFrom) ? 0.001 : 1;
    m.scale.set(2.3 * k, 0.42 * k, 2.1 * k);
    m.receiveShadow = true;
    this.group.add(m);
    this.rubble.push(m);
  }

  /** Rubble past its hold sinks into the ground over RUBBLE.sink s and is removed (its geometry freed with the last piece). */
  private updateRubble(): void {
    let gone = false;
    for (const m of this.rubble) {
      const g0 = m.userData.growFrom as number;
      if (Number.isFinite(g0)) {
        const k = Math.min(1, Math.max(0, (this.time - g0) / RUBBLE_GROW));
        const f = Math.max(0.001, (m.userData.size as number) * (1 - (1 - k) * (1 - k)));
        const flat = m.userData.flat as [number, number, number] | undefined;
        if (flat) m.scale.set(flat[0] * f, flat[1] * f, flat[2] * f);
        else m.scale.setScalar(f);
        if (k >= 1) m.userData.growFrom = -Infinity;
      }
      const at = m.userData.sinkAt as number;
      if (!(this.time > at)) continue;
      const k = (this.time - at) / RUBBLE.sink;
      m.position.y = 0.15 - k * 1.2;
      if (k >= 1) {
        m.userData.gone = true;
        gone = true;
      }
    }
    if (!gone) return;
    const left = this.rubble.filter((m) => !m.userData.gone);
    const used = new Set(left.map((m) => m.geometry));
    for (const m of this.rubble) {
      if (!m.userData.gone) continue;
      this.group.remove(m);
      if (!used.has(m.geometry)) {
        used.add(m.geometry);
        m.geometry.dispose();
      }
    }
    this.rubble = left;
  }

  dispose(): void {
    // each addRubble() builds its own geometry, shared by its 7 meshes
    const rubbleGeos = new Set(this.rubble.map((m) => m.geometry));
    for (const g of rubbleGeos) g.dispose();
    for (const m of this.rubble) this.group.remove(m);
    this.rubble.length = 0;
    for (const s of this.items.values()) s.material.dispose();
    for (const g of this.geoCache.values()) g.dispose();
    this.bubbleGeo.dispose();
    this.beams.dispose();
    this.aggroRings.dispose();
    this.bubbleMat.dispose();
    this.group.remove(this.debrisMesh);
    this.debrisMesh.geometry.dispose();
    (this.debrisMesh.material as THREE.Material).dispose();
    this.debrisMesh.dispose();
    this.rubbleMat.dispose();
    this.moundMat.dispose();
    this.critters?.dispose();
    this.ranges.dispose();
  }
}
