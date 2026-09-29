/**
 * VoxelSprite: an animated voxel figure built from a spritesheet.
 *
 *   const sheet = await loadVoxelSheet(manifest.cats[0]);
 *   const cat = new VoxelSprite(sheet, { anim: 'IDLE' });
 *   scene.add(cat.object3d);
 *   cat.setAnim('WALKING');
 *   cat.setFacing(-1);          // moving left
 *   cat.update(dt);             // every render frame, dt in seconds
 *
 * `object3d` is what you position and rotate in the world. The figure stands on its local y = 0 with
 * its sprite plane on local z = 0 (front faces +z). Sprites face RIGHT (+x) in their sheet; facing -1
 * mirrors the figure through scale.x = -1 on an inner node, so the outer transform stays yours.
 * One VoxelSprite = one Mesh = one draw call. Geometry is shared via the per-frame cache.
 */
import * as THREE from 'three';
import type { ExtrudeOptions } from './extrude';
import {
  getFrameGeometry,
  getVoxelMaterial,
  rowIndex,
  SPRITE_EXTRUDE,
  VOXEL_WORLD_SCALE,
  voxelizeImage as voxelizeImageFn,
  type PixelSource,
  type VoxelSheet,
  type VoxelizeImageOptions,
} from './sheets';

/** Default playback rates (frames per second) by row name. */
export const DEFAULT_FPS: Record<string, number> = {
  SLEEP: 4,
  DIGGING: 8,
  GROOMING: 8,
  HIT: 12,
  IDLE: 8,
  JUMPING: 10,
  LOAF: 5,
  RUNNING: 12,
  SITTING: 6,
  WALKING: 10,
  CROUCHED: 8,
  DAMAGE: 10,
  DEAD: 8,
  LYING: 4,
  SNIFFING: 8,
};

/** Rows that play once and hold their last frame unless `loop: true` is passed. */
export const ONE_SHOT_ROWS = new Set(['HIT', 'JUMPING', 'DAMAGE', 'DEAD']);

export interface VoxelSpriteOptions {
  /** Initial animation row (index or name). Default IDLE, else row 0. */
  anim?: number | string;
  /** World units per voxel. Default VOXEL_WORLD_SCALE (1/24). */
  scale?: number;
  material?: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  extrude?: ExtrudeOptions;
  /** Randomise the starting frame phase (0..1) so crowds do not animate in lockstep. */
  phase?: number;
}

export interface SetAnimOptions {
  fps?: number;
  loop?: boolean;
  /** Restart from frame 0 even if this row is already playing. */
  restart?: boolean;
}

export class VoxelSprite {
  readonly sheet: VoxelSheet;
  /** Position/rotate this. */
  readonly object3d: THREE.Group;
  /** The mesh (inner node, mirrored for facing). */
  readonly mesh: THREE.Mesh;
  private readonly flipNode: THREE.Group;
  private readonly extrude: ExtrudeOptions;
  private row = 0;
  private frame = 0;
  private time = 0;
  private fps = 8;
  private loop = true;
  private facing: 1 | -1 = 1;
  private playing = true;
  /** Called once when a non-looping animation reaches its last frame. */
  onAnimEnd: ((row: number) => void) | null = null;

  constructor(sheet: VoxelSheet, opts: VoxelSpriteOptions = {}) {
    this.sheet = sheet;
    this.extrude = opts.extrude ?? SPRITE_EXTRUDE;
    this.object3d = new THREE.Group();
    this.object3d.name = `voxel:${sheet.id}`;
    this.flipNode = new THREE.Group();
    const s = opts.scale ?? VOXEL_WORLD_SCALE;
    this.flipNode.scale.set(s, s, s);
    this.object3d.add(this.flipNode);
    this.mesh = new THREE.Mesh(getFrameGeometry(sheet, 0, 0, this.extrude), opts.material ?? getVoxelMaterial());
    this.mesh.castShadow = opts.castShadow ?? false;
    this.mesh.receiveShadow = opts.receiveShadow ?? false;
    this.mesh.userData.voxelSprite = this;
    this.flipNode.add(this.mesh);
    const start = opts.anim ?? (rowIndex(sheet, 'IDLE') >= 0 ? 'IDLE' : 0);
    this.setAnim(start, { restart: true });
    if (opts.phase) {
      const n = this.frameCount();
      this.time = (opts.phase * n) / this.fps;
      this.frame = Math.floor(opts.phase * n) % Math.max(1, n);
      this.applyGeometry();
    }
  }

  /** Current row index. */
  get anim(): number {
    return this.row;
  }

  get animName(): string {
    return this.sheet.rows[this.row]?.name ?? String(this.row);
  }

  get currentFrame(): number {
    return this.frame;
  }

  get facingX(): 1 | -1 {
    return this.facing;
  }

  frameCount(row = this.row): number {
    return this.sheet.rows[row]?.frames ?? 0;
  }

  /** Switch animation row. No-op if already playing it (unless restart). Unknown names are ignored. */
  setAnim(row: number | string, opts: SetAnimOptions = {}): this {
    const idx = typeof row === 'number' ? row : rowIndex(this.sheet, row);
    if (idx < 0 || idx >= this.sheet.rows.length) return this;
    const name = this.sheet.rows[idx].name;
    this.fps = opts.fps ?? DEFAULT_FPS[name] ?? 8;
    this.loop = opts.loop ?? !ONE_SHOT_ROWS.has(name);
    if (idx === this.row && !opts.restart && this.playing) return this;
    this.row = idx;
    this.frame = 0;
    this.time = 0;
    this.playing = true;
    this.applyGeometry();
    return this;
  }

  /** Jump to a frame (wraps). Stops auto-advance until the next setAnim/play. */
  setFrame(n: number): this {
    const c = Math.max(1, this.frameCount());
    this.frame = ((n % c) + c) % c;
    this.time = this.frame / this.fps;
    this.playing = false;
    this.applyGeometry();
    return this;
  }

  play(): this {
    this.playing = true;
    return this;
  }

  pause(): this {
    this.playing = false;
    return this;
  }

  /** +1 faces right (sheet orientation), -1 mirrors to face left. */
  setFacing(dir: 1 | -1): this {
    if (dir !== this.facing) {
      this.facing = dir;
      this.flipNode.scale.x = Math.abs(this.flipNode.scale.x) * dir;
    }
    return this;
  }

  /** Flip from a horizontal velocity; zero keeps the last facing (vertical movement keeps facing). */
  faceFromVelocity(vx: number): this {
    if (vx > 0) this.setFacing(1);
    else if (vx < 0) this.setFacing(-1);
    return this;
  }

  /** Advance the animation by dt seconds. */
  update(dt: number): void {
    if (!this.playing) return;
    const count = this.frameCount();
    if (count <= 1) return;
    this.time += dt;
    let f = Math.floor(this.time * this.fps);
    if (this.loop) {
      f %= count;
    } else if (f >= count - 1) {
      f = count - 1;
      this.playing = false;
      if (this.onAnimEnd) this.onAnimEnd(this.row);
    }
    if (f !== this.frame) {
      this.frame = f;
      this.applyGeometry();
    }
  }

  /** Triangles of the current frame. */
  triangles(): number {
    return (this.mesh.geometry.userData.triangles as number | undefined) ?? 0;
  }

  /** Remove from the scene. Geometry and material are shared and are NOT disposed. */
  dispose(): void {
    this.object3d.removeFromParent();
    this.onAnimEnd = null;
  }

  private applyGeometry(): void {
    this.mesh.geometry = getFrameGeometry(this.sheet, this.row, this.frame, this.extrude);
  }

  /** Voxelize an icon image (coin, catnip...) at `size` voxels; centred on the origin. */
  static voxelizeImage(src: string | PixelSource, opts: VoxelizeImageOptions = {}): Promise<THREE.BufferGeometry> {
    return voxelizeImageFn(src, opts);
  }
}
