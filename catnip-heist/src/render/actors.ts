/**
 * Cat and guard views: a VoxelSprite each, plus an x-ray silhouette that shows through walls
 * (so an occluded cat or dog is never lost), animation selection from sim state, and screen-space
 * facing (a sprite faces screen-right or screen-left depending on how its motion projects on screen).
 */
import * as THREE from 'three';
import { PALETTE, SUBTILE, type CatState, type GuardMode, type GuardState, type Vec2i } from '../types';
import { CAMERA_PITCH, CAMERA_YAW, screenSign } from './camera';
import { VOXEL_WORLD_SCALE, type VoxelSheet } from './voxel/sheets';
import { VoxelSprite } from './voxel/VoxelSprite';

/** Positions further apart than this (sub-tile units) between two ticks are teleports: no interpolation. */
export const TELEPORT_SUB = SUBTILE * 1.5;

/**
 * Render position of an actor that the player drives: `cur` plus `vel * alpha` (sub-tile units per
 * tick), i.e. drawn at the time the input is being applied, with no tick of interpolation lag.
 * Falls back to prev/cur interpolation when the sim does not provide a velocity.
 */
export function extrapolatePos(prev: Vec2i, cur: Vec2i, vel: Vec2i | undefined, alpha: number, out: { x: number; z: number }): { x: number; z: number } {
  if (!vel) return lerpPos(prev, cur, alpha, out);
  const dx = cur.x - prev.x, dy = cur.y - prev.y;
  if (Math.abs(dx) > TELEPORT_SUB || Math.abs(dy) > TELEPORT_SUB) {
    out.x = cur.x / SUBTILE;
    out.z = cur.y / SUBTILE;
    return out;
  }
  out.x = (cur.x + vel.x * alpha) / SUBTILE;
  out.z = (cur.y + vel.y * alpha) / SUBTILE;
  return out;
}

/** Optional per-tick velocity some sim versions put on CatState (sub-tile units per tick). */
export type CatStateWithVel = CatState & { vel?: Vec2i };

export function lerpPos(a: Vec2i, b: Vec2i, alpha: number, out: { x: number; z: number }): { x: number; z: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > TELEPORT_SUB || Math.abs(dy) > TELEPORT_SUB) {
    out.x = b.x / SUBTILE;
    out.z = b.y / SUBTILE;
  } else {
    out.x = (a.x + dx * alpha) / SUBTILE;
    out.z = (a.y + dy * alpha) / SUBTILE;
  }
  return out;
}

const X_RAY_OFFSET = 0.32;

function makeSilhouette(color: string, opts: { opacity?: number; dither?: boolean } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opts.opacity ?? 0.55,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
  });
  if (opts.dither) {
    // Screen-space 2x2 checker: reads as a deliberate "seen through the wall" x-ray, not a blob.
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n  if (mod(floor(gl_FragCoord.x / 2.0) + floor(gl_FragCoord.y / 2.0), 2.0) < 1.0) discard;',
      );
    };
    m.customProgramCacheKey = () => 'xray-dither';
  }
  return m;
}

/** Shared base: sprite + x-ray silhouette + facing logic. */
abstract class ActorView {
  readonly group = new THREE.Group();
  readonly sprite: VoxelSprite;
  protected readonly xray: THREE.Mesh;
  protected face: 1 | -1 = 1;
  readonly headY: number;
  protected readonly p = { x: 0, z: 0 };
  protected readonly lastP = { x: 0, z: 0 };
  protected moveHold = 0;
  /** Smoothed ground velocity (tiles/s), for camera look-ahead and dust. */
  readonly vel = { x: 0, z: 0 };
  /** Squash/stretch spring (1 = rest). */
  private sq = 1;
  private sqV = 0;
  private wasMoving = false;
  private bobT = 0;
  /** Distance walked since the last footstep puff (tiles). */
  stride = 0;
  /** Set when a footstep should puff dust this frame. */
  footstep = false;
  /** Scale of the walk bob / squash (0 disables, e.g. reduced motion). */
  motionScale = 1;

  constructor(sheet: VoxelSheet, xrayMat: THREE.Material, scale = VOXEL_WORLD_SCALE) {
    this.sprite = new VoxelSprite(sheet, { castShadow: true, scale, phase: Math.random() });
    this.sprite.object3d.rotation.y = CAMERA_YAW;
    this.group.add(this.sprite.object3d);
    // X-ray copy: shifted towards the camera along the view direction (no screen-space change for an
    // ortho camera) so the figure's own depth never triggers it, only real occluders in front.
    this.xray = new THREE.Mesh(this.sprite.mesh.geometry, xrayMat);
    const d = X_RAY_OFFSET / scale;
    this.xray.position.set(0, d * Math.sin(CAMERA_PITCH), d * Math.cos(CAMERA_PITCH));
    this.xray.renderOrder = 10;
    this.sprite.mesh.add(this.xray);
    const idle = sheet.rows.find((r) => r.name === 'IDLE') ?? sheet.rows[0];
    this.headY = idle ? (sheet.anchorY - idle.bounds.minY) * scale : 0.8;
  }

  protected place(x: number, z: number, dt: number, simFace: 1 | -1, facing: Vec2i | null): boolean {
    const dx = x - this.lastP.x;
    const dz = z - this.lastP.z;
    this.lastP.x = x;
    this.lastP.z = z;
    this.group.position.set(x, 0, z);
    let s = screenSign(dx, dz);
    if (s === 0 && facing) s = screenSign(facing.x, facing.y);
    if (s === 0 && dx === 0 && dz === 0 && !facing) s = simFace;
    if (s !== 0) this.face = s;
    this.sprite.setFacing(this.face);
    const moved = Math.abs(dx) + Math.abs(dz) > 1e-4;
    this.moveHold = moved ? 0.12 : Math.max(0, this.moveHold - dt);
    if (dt > 0) {
      const k = 1 - Math.exp(-14 * dt);
      const tele = Math.abs(dx) + Math.abs(dz) > 1.2;
      this.vel.x += ((tele ? 0 : dx / dt) - this.vel.x) * k;
      this.vel.z += ((tele ? 0 : dz / dt) - this.vel.z) * k;
      if (!tele) this.stride += Math.hypot(dx, dz);
    }
    return moved || this.moveHold > 0;
  }

  /** Kick the squash spring: > 0 stretches (taller), < 0 squashes. */
  kick(amount: number): void {
    this.sqV += amount * 14 * this.motionScale;
  }

  /** Squash/stretch + walk bob, then advance the sprite animation. */
  protected finish(dt: number, moving = false, stepLen = 0.5): void {
    if (moving !== this.wasMoving) {
      this.kick(moving ? 0.55 : -0.8);
      this.wasMoving = moving;
    }
    // Critically-damped-ish spring towards 1.
    const d = Math.min(dt, 1 / 30);
    this.sqV += (1 - this.sq) * 380 * d - this.sqV * 22 * d;
    this.sq += this.sqV * d;
    this.sq = Math.max(0.7, Math.min(1.3, this.sq));
    this.bobT = moving ? this.bobT + dt : 0;
    const bob = moving ? Math.abs(Math.sin(this.bobT * 11)) * 0.035 * this.motionScale : 0;
    const o = this.sprite.object3d;
    const inv = 1 / Math.sqrt(this.sq);
    o.scale.set(inv, this.sq * this.extraY, inv);
    o.position.y = bob;
    this.footstep = false;
    if (moving && this.stride >= stepLen) {
      this.stride = 0;
      this.footstep = true;
    }
    if (!moving) this.stride = Math.min(this.stride, stepLen * 0.6);
    this.sprite.update(dt);
    this.xray.geometry = this.sprite.mesh.geometry;
  }

  /** Extra vertical scale on top of the squash (meow hop). */
  protected extraY = 1;

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  dispose(): void {
    this.sprite.dispose();
    this.group.removeFromParent();
  }
}

const catXray = makeSilhouette(PALETTE.lilac);
const guardXray = makeSilhouette(PALETTE.coin, { opacity: 0.8, dither: true });

export class CatView extends ActorView {
  private idleT = 0;
  private hitT = 0;

  constructor(sheet: VoxelSheet) {
    super(sheet, catXray);
    this.group.name = `cat:${sheet.id}`;
  }

  update(prev: CatState, cur: CatState, alpha: number, dt: number, snap = false, extrapolate = false): void {
    if (extrapolate) extrapolatePos(prev.pos, cur.pos, (cur as CatStateWithVel).vel, alpha, this.p);
    else lerpPos(prev.pos, cur.pos, alpha, this.p);
    if (snap) {
      this.lastP.x = this.p.x;
      this.lastP.z = this.p.z;
    }
    const moving = this.place(this.p.x, this.p.z, dt, cur.faceX, null) && cur.stunTicks === 0;
    if (cur.stunTicks > 0 || cur.pose === 'HIT') {
      this.hitT = 0.5;
    } else {
      this.hitT = Math.max(0, this.hitT - dt);
    }
    let anim: string;
    if (this.hitT > 0) {
      anim = 'HIT';
      this.idleT = 0;
    } else if (moving || cur.moving) {
      anim = 'WALKING';
      this.idleT = 0;
    } else if (cur.pose === 'SLEEP') {
      anim = 'SLEEP';
    } else if (cur.pose === 'SIT') {
      anim = 'SITTING';
    } else if (cur.pose === 'MEOW') {
      anim = 'SITTING';
      this.idleT = 0;
    } else {
      this.idleT += dt;
      anim = this.idleT < 4 ? 'IDLE' : this.idleT < 9 ? 'SITTING' : this.idleT < 13 ? 'GROOMING' : 'LOAF';
    }
    this.sprite.setAnim(anim);
    // Meow: a quick stretch.
    const sy = cur.pose === 'MEOW' ? 1.12 : 1;
    this.extraY += (sy - this.extraY) * Math.min(1, dt * 18);
    this.finish(dt, anim === 'WALKING', 0.42);
  }
}

export class GuardView extends ActorView {
  /** Smoothed facing angle (radians, atan2(z, x)) for the vision cone. */
  angle = 0;
  private angleInit = false;
  mode: GuardMode = 'PATROL';
  mark: THREE.Mesh | null = null;
  private markPop = 0;
  private markKind: 'none' | '?' | '!' = 'none';

  private readonly ring: THREE.Mesh;

  constructor(sheet: VoxelSheet) {
    super(sheet, guardXray, VOXEL_WORLD_SCALE * 0.92);
    this.group.name = `guard:${sheet.id}`;
    // Kibble Corp security tag: a small ember ring under every guard so dogs never read as cats.
    this.ring = new THREE.Mesh(guardRingGeo(), guardRingMat);
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 1;
    this.group.add(this.ring);
  }

  update(prev: GuardState, cur: GuardState, alpha: number, dt: number, time: number, marks: { q: THREE.BufferGeometry | null; e: THREE.BufferGeometry | null }): void {
    lerpPos(prev.pos, cur.pos, alpha, this.p);
    const moving = this.place(this.p.x, this.p.z, dt, cur.faceX, cur.facing);
    this.mode = cur.mode;
    const goalA = Math.atan2(cur.facing.y, cur.facing.x);
    if (!this.angleInit) {
      this.angle = goalA;
      this.angleInit = true;
    } else {
      let d = goalA - this.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.angle += d * (1 - Math.exp(-14 * dt));
    }
    let anim: string;
    switch (cur.mode) {
      case 'ALERT':
        anim = moving ? 'RUNNING' : 'CROUCHED';
        break;
      case 'INVESTIGATE':
        anim = moving ? 'RUNNING' : 'SNIFFING';
        break;
      case 'SNIFF':
        anim = 'SNIFFING';
        break;
      default:
        anim = moving ? 'WALKING' : 'SNIFFING';
    }
    this.sprite.setAnim(anim);
    this.finish(dt, moving, cur.mode === 'ALERT' || cur.mode === 'INVESTIGATE' ? 0.5 : 0.7);
    this.ring.scale.setScalar(cur.mode === 'ALERT' ? 1.15 + Math.sin(time * 16) * 0.1 : 1);

    // '?' while investigating, '!' when alerted: a voxel glyph on a glowing badge that pops in
    // with an elastic overshoot and wobbles.
    const kind = cur.mode === 'ALERT' ? '!' : cur.mode === 'INVESTIGATE' ? '?' : 'none';
    if (kind !== this.markKind) {
      this.markKind = kind;
      this.markPop = 0;
      const geo = kind === '!' ? marks.e : kind === '?' ? marks.q : null;
      if (geo) {
        if (!this.mark) {
          this.markRoot = new THREE.Group();
          this.markRoot.rotation.y = CAMERA_YAW;
          this.mark = new THREE.Mesh(geo, markMaterial());
          this.mark.renderOrder = 12;
          this.badge = new THREE.Mesh(badgeGeo(), badgeMaterial('!'));
          this.badge.renderOrder = 11;
          this.badge.position.z = -0.02;
          this.markRoot.add(this.badge, this.mark);
          this.group.add(this.markRoot);
        }
        this.mark.geometry = geo;
        this.badge!.material = badgeMaterial(kind);
      }
    }
    if (this.mark && this.markRoot && this.badge) {
      this.markRoot.visible = kind !== 'none';
      this.markPop = Math.min(1, this.markPop + dt / 0.42);
      const t = this.markPop;
      // Elastic out.
      const pop = t >= 1 ? 1 : 1 - Math.pow(2, -9 * t) * Math.cos(t * Math.PI * 3.2);
      const breathe = 1 + Math.sin(time * (kind === '!' ? 12 : 5)) * (kind === '!' ? 0.06 : 0.03);
      this.mark.scale.setScalar((1 / 15) * pop * breathe);
      this.badge.scale.setScalar(pop * breathe * (kind === '!' ? 1.05 : 0.95));
      this.mark.rotation.z = Math.sin(time * 6) * 0.12 * (1 - t * 0.5) + (1 - pop) * 0.6;
      this.markRoot.position.y = this.headY + 0.5 + Math.sin(time * 5) * 0.05 + (1 - t) * -0.2;
    }
  }

  private markRoot: THREE.Group | null = null;
  private badge: THREE.Mesh | null = null;
}

const guardRingMat = new THREE.MeshBasicMaterial({ color: PALETTE.ember, transparent: true, opacity: 0.7, depthWrite: false });
let ringGeo: THREE.BufferGeometry | null = null;
function guardRingGeo(): THREE.BufferGeometry {
  if (!ringGeo) {
    ringGeo = new THREE.RingGeometry(0.3, 0.38, 6, 1);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.rotateY(Math.PI / 6);
  }
  return ringGeo;
}

let markMat: THREE.MeshBasicMaterial | null = null;
/** Unlit (HDR-boosted so they bloom) so the marks pop against the scene, drawn on top of walls. */
function markMaterial(): THREE.Material {
  if (!markMat) markMat = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, color: new THREE.Color(1.5, 1.5, 1.5) });
  return markMat;
}

let badgeG: THREE.BufferGeometry | null = null;
/** Chunky octagon badge behind a mark (billboard plane in the camera-facing root). */
function badgeGeo(): THREE.BufferGeometry {
  if (!badgeG) {
    badgeG = new THREE.CircleGeometry(0.34, 8);
    badgeG.rotateZ(Math.PI / 8);
  }
  return badgeG;
}
const badgeMats = new Map<string, THREE.Material>();
function badgeMaterial(kind: string): THREE.Material {
  let m = badgeMats.get(kind);
  if (!m) {
    const c = kind === '!' ? new THREE.Color(PALETTE.ember).multiplyScalar(2.2) : new THREE.Color(PALETTE.coin).multiplyScalar(0.9);
    m = new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.92 });
    badgeMats.set(kind, m);
  }
  return m;
}
