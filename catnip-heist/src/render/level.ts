/**
 * LevelView: everything that belongs to the level itself.
 *
 * Static terrain (floor checker, rugs, walls with a top trim, box stacks) is built once with
 * InstancedMesh, a handful of draw calls regardless of level size. Interactive props (doors, plates,
 * key, vault, rescue cage, exit portal, checkpoints, catnip coins) are small groups animated from the
 * sim state each frame. 1 tile = 1 world unit; tile (tx, ty) spans world x in [tx, tx+1], z in [ty, ty+1].
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, type AssetManifest, type DoorDef, type LevelDef, type SimState, type Vec2i } from '../types';
import { CAMERA_YAW } from './camera';
import { EXIT_ART, KEY_ART, VAULT_ART, voxelArt } from './pixelart';
import { glowTexture } from './textures';
import { Terrain, WALL_H } from './terrain';
import { ALL, ArtBuilder, CELLS, F, levelAtlas } from './art';
import { hdr } from './post';
import { assetUrl, getVoxelMaterial, loadPixels, loadVoxelSheet, voxelizeImage } from './voxel/sheets';
import { nightLiftSprig } from './catnipNight';
import { VoxelSprite } from './voxel/VoxelSprite';

/** The 16 px catnip sprig master (written by client/scripts/art/catnip-export.mjs). */
const CATNIP_VOXEL_SOURCE = 'images/catnip-16.png';
/**
 * World size of one catnip voxel: 16 voxels span two thirds of a tile. It was 1/30 (half a tile, as
 * the old 15 at 1/28); review 3e #4 found the sprig too small to read, so it is 1.25x that.
 */
const CATNIP_VOXEL_SCALE = 1 / 24;
/** The floor glow under a pickup: the spike's lavender (catnip-heist palette: --lilac family). */
const CATNIP_GLOW = '#b896ea';

export { WALL_H };
const NO_BOTTOM_FACES = 63 & ~8;

/** See-through marker material: dithered, link colour, drawn only where it is hidden (GreaterDepth). */
function xrayMarkerMat(color: string): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, depthFunc: THREE.GreaterDepth, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  if (mod(floor(gl_FragCoord.x / 2.0) + floor(gl_FragCoord.y / 2.0), 2.0) < 1.0) discard;',
    );
  };
  m.customProgramCacheKey = () => 'xray-marker-dither';
  return m;
}

/**
 * Adds `amount` of each voxel's vertex colour as emissive, so the sprig keeps its own hues (mint
 * leaves, lavender spike) under coloured lights while the faces keep their Lambert shading.
 */
export const CATNIP_SELF_LIGHT = 1;
function catnipSelfLight<M extends THREE.MeshLambertMaterial>(m: M, amount = CATNIP_SELF_LIGHT): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n  #ifdef USE_COLOR\n  totalEmissiveRadiance += vColor.rgb * ${amount.toFixed(3)};\n  #endif`,
    );
  };
  m.customProgramCacheKey = () => `catnip-self-light-${amount}`;
  return m;
}

/** Colours of plate -> door links (one per plate, cycled). */
const LINK_COLORS = [PALETTE.pink, PALETTE.mint, PALETTE.sky, PALETTE.lilac, PALETTE.rust];

export const LEVEL_COLORS = {
  floorA: '#7b5aa6',
  floorB: '#6c4c98',
  rug: '#b0406e',
  wall: '#4a2c6e',
  trim: '#d9b8f5',
  box: '#c98a4b',
  vault: '#51466e',
};

export function _unusedHash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface DoorView {
  def: DoorDef;
  /** Status light colours (linear, before the blink): shut, open. */
  shutColor: THREE.Color;
  openColor: THREE.Color;
  axis: 'h' | 'v';
  group: THREE.Group;
  panel: THREE.Object3D;
  open: number;
  color: string;
  /** Status lights on the frame: red while shut, link colour / green when open. */
  lights: THREE.MeshBasicMaterial;
  dial: THREE.Object3D | null;
}

interface PlateView {
  pad: THREE.Mesh;
  glow: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  ring: THREE.MeshBasicMaterial;
  color: THREE.Color;
  down: number;
}

interface CheckpointView {
  tile: Vec2i;
  mesh: THREE.Mesh | null;
  glow: THREE.Mesh;
  lit: number;
}

export interface LevelContext {
  manifest: Promise<AssetManifest>;
  base: string;
  shadows?: boolean;
}

export const tileCenter = (t: Vec2i) => ({ x: t.x + 0.5, z: t.y + 0.5 });

export class LevelView {
  readonly group = new THREE.Group();
  readonly level: LevelDef;
  readonly width: number;
  readonly height: number;
  /** 1 = blocks sight (wall, void, box). Doors are handled separately. */
  private readonly solid: Uint8Array;
  private readonly doorAt = new Map<number, number>();
  readonly doors: DoorView[] = [];
  private readonly plates: PlateView[] = [];
  private readonly checkpoints: CheckpointView[] = [];
  private coinMesh: THREE.InstancedMesh | null = null;
  private coinGlow: THREE.InstancedMesh | null = null;
  private keyGroup: THREE.Group | null = null;
  private exitSign: THREE.Mesh | null = null;
  private keyVisible = 1;
  /** Rescue cage (bars + wood) and its occupant. */
  readonly crateGroup = new THREE.Group();
  private cage: THREE.Group | null = null;
  private cageOpen = 0;
  crateCat: VoxelSprite | null = null;
  private heart: THREE.Mesh | null = null;
  private readonly portals: { swirl: THREE.ShaderMaterial; beam: THREE.Mesh; beamMat: THREE.ShaderMaterial }[] = [];
  private orbit: THREE.InstancedMesh | null = null;
  private pylonTips: THREE.Mesh | null = null;
  private pylonMat: THREE.MeshBasicMaterial | null = null;
  private exitSignMat: THREE.MeshBasicMaterial | null = null;
  private keyBeam: THREE.Mesh | null = null;
  private portalActive = 0;
  readonly exitCenter = new THREE.Vector3();
  private readonly disposables: { dispose(): void }[] = [];
  /** Objects animated from update(); everything else in the level is frozen once built. */
  private readonly live = new Set<THREE.Object3D>();
  terrain: Terrain | null = null;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v3 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  private readonly v3b = new THREE.Vector3();
  private readonly coinPop: (number | undefined)[] = [];
  private readonly glowTex: THREE.Texture;
  /** Resolves when async props (icons, crate cat) are built. */
  readonly ready: Promise<void>;
  private disposed = false;

  constructor(level: LevelDef, ctx: LevelContext) {
    this.level = level;
    this.height = level.tiles.length;
    this.width = Math.max(...level.tiles.map((r) => r.length));
    this.solid = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.charAt(x, y);
        this.solid[y * this.width + x] = c === '#' || c === ' ' || c === 'b' ? 1 : 0;
      }
    }
    level.doors.forEach((d, i) => this.doorAt.set(d.tile.y * this.width + d.tile.x, i));
    this.group.name = 'level';
    this.glowTex = glowTexture();
    this.disposables.push(this.glowTex);

    this.buildTerrain(ctx.shadows ?? true);
    this.buildDoorsAndPlates();
    this.buildExit();
    this.group.add(this.crateGroup);
    this.ready = this.buildAsync(ctx)
      .catch((e) => {
        console.warn('[render] level props failed to load', e);
      })
      .then(() => {
        if (!this.disposed) this.freezeStatic();
      });
  }

  charAt(x: number, y: number): string {
    if (y < 0 || y >= this.height || x < 0) return ' ';
    return this.level.tiles[y][x] ?? ' ';
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.solid[y * this.width + x] === 1;
  }

  /** Blocks sight: terrain or a closed door (per the sim's doorsOpen). */
  blocksSight(x: number, y: number, doorsOpen: boolean[]): boolean {
    if (this.isSolid(x, y)) return true;
    const d = this.doorAt.get(y * this.width + x);
    return d !== undefined && !doorsOpen[d];
  }

  // -------------------------------------------------------------------------------------------
  // Static terrain
  // -------------------------------------------------------------------------------------------

  private buildTerrain(shadows: boolean): void {
    this.terrain = new Terrain(this.level, { shadows });
    this.group.add(this.terrain.group);
    // Warm light pools on the floor in front of every wall lamp (one instanced draw call).
    const lamps = this.terrain.lamps;
    if (lamps.length) {
      const geo = new THREE.PlaneGeometry(2.6, 2.6);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: '#ffb866', map: this.glowTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geo, mat, lamps.length);
      lamps.forEach((l, i) => {
        this.m4.makeScale(l.nx ? 0.8 : 1.15, 1, l.nz ? 0.8 : 1.15).setPosition(l.x, 0.012, l.z);
        mesh.setMatrixAt(i, this.m4);
      });
      mesh.renderOrder = 1;
      mesh.name = 'light-pools';
      this.group.add(mesh);
      this.disposables.push(geo, mat, mesh);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Doors and plates
  // -------------------------------------------------------------------------------------------

  private buildDoorsAndPlates(): void {
    // One colour per PLATE door; each plate takes the colour of the (first) door it opens.
    const doorColor = new Map<string, string>();
    this.level.doors.filter((d) => d.kind === 'PLATE').forEach((d, i) => doorColor.set(d.id, LINK_COLORS[i % LINK_COLORS.length]));
    const plateColor = (i: number) => doorColor.get(this.level.plates[i].doors[0] ?? '') ?? LINK_COLORS[i % LINK_COLORS.length];
    const atlas = levelAtlas();
    const artMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
    artMat.shadowSide = THREE.DoubleSide;
    this.disposables.push(artMat);

    // ---- pressure plates: steel frame + glowing link-colour pad that sinks when pressed ----
    const fb = new ArtBuilder();
    fb.box(-0.44, 0, -0.44, 0.44, 0.06, 0.44, { top: CELLS.steel, side: CELLS.darkMetal }, { faces: ALL, color: 0xcfc6e0 });
    fb.box(-0.36, 0.06, -0.36, 0.36, 0.065, 0.36, CELLS.darkMetal, { faces: F.PY, color: 0x888888 });
    for (const [x, z] of [[-0.44, -0.44], [0.34, -0.44], [-0.44, 0.34], [0.34, 0.34]]) fb.box(x, 0.06, z, x + 0.1, 0.09, z + 0.1, CELLS.stripeTrim, { faces: NO_BOTTOM_FACES });
    const frameGeo = fb.build();
    const pb = new ArtBuilder();
    pb.box(-0.3, -0.04, -0.3, 0.3, 0.04, 0.3, CELLS.white, { faces: ALL, color: 0xffffff, top: 0xffffff });
    // Paw emboss on top.
    for (const [x, z, w] of [[0, 0.06, 0.12], [-0.14, -0.1, 0.05], [-0.04, -0.15, 0.05], [0.06, -0.15, 0.05], [0.15, -0.1, 0.05]] as const) pb.box(x - w, 0.04, z - w, x + w, 0.055, z + w, CELLS.white, { faces: NO_BOTTOM_FACES, color: 0xd8d8d8 });
    const padGeo = pb.build();
    const ringGeo = new THREE.RingGeometry(0.42, 0.47, 4, 1, Math.PI / 4);
    ringGeo.rotateX(-Math.PI / 2);
    const glowGeo = new THREE.PlaneGeometry(1.9, 1.9);
    glowGeo.rotateX(-Math.PI / 2);
    // X-ray markers: drawn only where something nearer hides them (GreaterDepth), so a plate behind
    // a tall wall or the exit portal, or a plate door behind a wall, still shows where it is.
    const xrayPlateGeo = new THREE.RingGeometry(0.16, 0.46, 4, 1, Math.PI / 4);
    xrayPlateGeo.rotateX(-Math.PI / 2);
    const xrayDoorGeo = new THREE.PlaneGeometry(0.8, WALL_H - 0.16);
    this.disposables.push(frameGeo, padGeo, ringGeo, glowGeo, xrayPlateGeo, xrayDoorGeo);

    this.level.plates.forEach((p, i) => {
      const color = plateColor(i);
      const g = new THREE.Group();
      const c = tileCenter(p.tile);
      g.position.set(c.x, 0, c.z);
      const frame = new THREE.Mesh(frameGeo, artMat);
      frame.receiveShadow = true;
      const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
      const pad = new THREE.Mesh(padGeo, mat);
      pad.position.y = 0.1;
      pad.receiveShadow = true;
      const ringMat = new THREE.MeshBasicMaterial({ color: hdr(color, 1), transparent: true, depthWrite: false });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.1;
      ring.renderOrder = 1;
      const glowMat = new THREE.MeshBasicMaterial({ color, map: this.glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 0.02;
      glow.renderOrder = 1;
      const xrayMat = xrayMarkerMat(color);
      const xray = new THREE.Mesh(xrayPlateGeo, xrayMat);
      xray.position.y = 0.14;
      xray.renderOrder = 10;
      g.add(frame, pad, ring, glow, xray);
      this.disposables.push(xrayMat);
      this.group.add(g);
      this.plates.push({ pad, glow, mat, ring: ringMat, color: new THREE.Color(color), down: 0 });
      this.live.add(pad);
      this.disposables.push(mat, glowMat, ringMat);
    });

    // ---- doors ----
    for (const d of this.level.doors) {
      const axis: 'h' | 'v' = d.axis ?? (this.isSolid(d.tile.x - 1, d.tile.y) && this.isSolid(d.tile.x + 1, d.tile.y) ? 'h' : 'v');
      const g = new THREE.Group();
      const c = tileCenter(d.tile);
      g.position.set(c.x, 0, c.z);
      if (axis === 'v') g.rotation.y = Math.PI / 2;
      const vault = d.kind === 'VAULT';
      const color = vault ? PALETTE.coin : (doorColor.get(d.id) ?? PALETTE.pink);
      // Static frame: posts at both ends, a header beam and a floor track.
      const f = new ArtBuilder();
      const H = WALL_H + 0.1;
      f.box(-0.5, 0, -0.2, 0.5, 0.02, 0.2, CELLS.hazard, { faces: F.PY });
      for (const sx of [-1, 1]) {
        f.box(sx * 0.5 - 0.09, 0, -0.2, sx * 0.5 + 0.09, H, 0.2, { side: vault ? CELLS.vault : CELLS.pillar, top: CELLS.wallTop }, { faces: ALL, color: 0xe8e0f4, ao: 0.6 });
      }
      f.box(-0.5, H - 0.12, -0.18, 0.5, H, 0.18, { side: CELLS.stripeTrim, top: CELLS.wallTop }, { faces: ALL, color: vault ? 0xffffff : 0xe0d8f0 });
      const frame = new THREE.Mesh(f.build(), artMat);
      frame.castShadow = true;
      frame.receiveShadow = true;
      g.add(frame);
      this.disposables.push(frame.geometry);
      // Status lights on both faces of both posts.
      const lights = new THREE.MeshBasicMaterial({ color: hdr(PALETTE.ember, 3) });
      // Both posts' lights in one mesh (one draw call per door).
      const lb = mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(0.07, 0.07, 0.43).translate(sx * 0.5, H - 0.24, 0)))!;
      g.add(new THREE.Mesh(lb, lights));
      this.disposables.push(lights, lb);

      const panel = new THREE.Group();
      let dial: THREE.Object3D | null = null;
      if (vault) {
        const vb = new ArtBuilder();
        vb.box(-0.41, 0, -0.16, 0.41, WALL_H - 0.02, 0.16, { side: CELLS.vault, top: CELLS.steel }, { faces: ALL, color: 0xffffff, ao: 0.7 });
        for (const y of [0.1, WALL_H - 0.14]) vb.box(-0.42, y, -0.18, 0.42, y + 0.06, 0.18, CELLS.white, { faces: ALL, color: 0xffc93c });
        for (const x of [-0.33, 0.33]) for (const y of [0.24, 0.52]) vb.box(x - 0.03, y, -0.19, x + 0.03, y + 0.06, 0.19, CELLS.white, { faces: ALL, color: 0xfff3b0 });
        const body = new THREE.Mesh(vb.build(), artMat);
        body.castShadow = true;
        body.receiveShadow = true;
        panel.add(body);
        this.disposables.push(body.geometry);
        dial = new THREE.Group();
        dial.position.set(0, WALL_H * 0.5, 0);
        panel.add(dial);
      } else {
        // Roll-up shutter: origin at the top so opening shrinks it up into the header.
        const sb = new ArtBuilder();
        const top = H - 0.12;
        sb.box(-0.41, -top, -0.07, 0.41, 0, 0.07, { side: CELLS.shutter, top: CELLS.shutter }, { faces: ALL, color: 0xffffff, uv: 'world' });
        sb.box(-0.41, -top, -0.1, 0.41, -top + 0.1, 0.1, CELLS.white, { faces: ALL, color });
        for (const sx of [-0.2, 0.2]) sb.box(sx - 0.04, -top * 0.62, -0.09, sx + 0.04, -top * 0.38, 0.09, CELLS.white, { faces: ALL, color });
        const body = new THREE.Mesh(sb.build(), artMat);
        body.castShadow = true;
        body.receiveShadow = true;
        panel.add(body);
        panel.position.y = top;
        this.disposables.push(body.geometry);
      }
      g.add(panel);
      // A plate door gets an x-ray panel just in front of its shutter (camera side): it is drawn
      // only where something nearer hides it, so a door behind a tall wall still shows its colour.
      if (!vault) {
        const xm = xrayMarkerMat(color);
        const xb = new THREE.Mesh(xrayDoorGeo, xm);
        xb.position.set(0, (WALL_H - 0.16) / 2, 0.13);
        xb.renderOrder = 10;
        g.add(xb);
        this.disposables.push(xm);
      }
      this.group.add(g);
      this.doors.push({ def: d, axis, group: g, panel, open: 0, color, lights, dial, shutColor: new THREE.Color(PALETTE.ember), openColor: new THREE.Color(vault ? '#7cff9a' : color) });
      this.live.add(panel);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Exit portal
  // -------------------------------------------------------------------------------------------

  private buildExit(): void {
    const tiles = this.level.exit.tiles;
    if (!tiles.length) return;
    let sx = 0, sz = 0;
    for (const t of tiles) {
      sx += t.x + 0.5;
      sz += t.y + 0.5;
    }
    this.exitCenter.set(sx / tiles.length, 0, sz / tiles.length);

    // Raised landing platform over the whole exit, with pylons at its corners.
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const t of tiles) {
      x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x + 1); z0 = Math.min(z0, t.y); z1 = Math.max(z1, t.y + 1);
    }
    const pf = new ArtBuilder();
    pf.box(x0 + 0.04, 0, z0 + 0.04, x1 - 0.04, 0.06, z1 - 0.04, { top: CELLS.steel, side: CELLS.stripeTrim }, { faces: ALL, color: 0xd8f0e8 });
    const pylons: [number, number][] = [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]];
    const tips = new ArtBuilder();
    for (const [px, pz] of pylons) {
      pf.block(px, 0.06, pz, 0.07, 0.55, 0.07, { side: CELLS.pillar, top: CELLS.steel }, { faces: ALL, color: 0xe8f0ff });
      tips.block(px, 0.61, pz, 0.05, 0.1, 0.05, CELLS.white, { faces: ALL, color: 0xd5f4e5 });
    }
    const platform = new THREE.Mesh(pf.build(), new THREE.MeshLambertMaterial({ map: levelAtlas(), vertexColors: true }));
    platform.receiveShadow = true;
    platform.castShadow = true;
    const tipMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: hdr(0xffffff, 2) });
    this.pylonTips = new THREE.Mesh(tips.build(), tipMat);
    this.pylonMat = tipMat;
    this.group.add(platform, this.pylonTips);
    this.disposables.push(platform.geometry, platform.material as THREE.Material, this.pylonTips.geometry, tipMat);
    const padGeo = new THREE.CylinderGeometry(0.46, 0.48, 0.04, 8);
    padGeo.translate(0, 0.07, 0);
    const padMat = new THREE.MeshLambertMaterial({ color: '#5a8f80', emissive: '#1f5a46' });
    const swirlGeo = new THREE.CircleGeometry(0.44, 32);
    swirlGeo.rotateX(-Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.6, 20, 1, true);
    beamGeo.translate(0, 0.8, 0);
    this.disposables.push(padGeo, padMat, swirlGeo, beamGeo);

    // Every exit tile gets a pad, a swirl disc and a beam; the tiles' copies are merged so the
    // whole portal is three draw calls however many tiles it has (each copy keeps its own UVs).
    const at = (g: THREE.BufferGeometry, y: number) => tiles.map((t) => g.clone().translate(tileCenter(t).x, y, tileCenter(t).z));
    const mergeAt = (g: THREE.BufferGeometry, y: number) => {
      const parts = at(g, y);
      const m = tiles.length === 1 ? parts[0] : mergeGeometries(parts)!;
      if (tiles.length > 1) for (const p of parts) p.dispose();
      return m;
    };
    const padsGeo = mergeAt(padGeo, 0);
    const discsGeo = mergeAt(swirlGeo, 0.1);
    const beamsGeo = mergeAt(beamGeo, 0.08);
    this.disposables.push(padsGeo, discsGeo, beamsGeo);
    {
      const pad = new THREE.Mesh(padsGeo, padMat);
      pad.receiveShadow = true;
      const swirl = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uActive: { value: 0 },
          uA: { value: new THREE.Color(PALETTE.violet) },
          uB: { value: new THREE.Color(PALETTE.mint) },
          uBoost: { value: 1 },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          varying vec2 vUv; uniform float uTime; uniform float uActive; uniform vec3 uA; uniform vec3 uB; uniform float uBoost;
          void main(){
            vec2 p = floor((vUv * 2.0 - 1.0) * 10.0 + 0.5) / 10.0;
            float r = length(p);
            if (r > 1.0) discard;
            float a = atan(p.y, p.x);
            float speed = mix(0.8, 3.5, uActive);
            float s = sin(a * 3.0 + r * 9.0 - uTime * speed);
            float band = step(0.15, s);
            vec3 col = mix(uA, uB, band * (0.35 + 0.65 * uActive));
            col = mix(col, vec3(0.9, 1.0, 0.95), smoothstep(0.3, 0.0, r) * uActive * 0.6);
            float alpha = mix(0.7, 1.0, uActive) * (0.6 + 0.4 * band);
            gl_FragColor = vec4(col * mix(0.7, 1.0, uActive) * mix(1.0, uBoost, uActive * band), alpha);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(discsGeo, swirl);
      disc.renderOrder = 1;
      const beamMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uActive: { value: 0 }, uC: { value: new THREE.Color(PALETTE.mint).multiplyScalar(1.1) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          varying vec2 vUv; uniform float uTime; uniform float uActive; uniform vec3 uC;
          void main(){
            float y = vUv.y;
            float stripes = step(0.5, fract(vUv.x * 10.0 + y * 2.0 - uTime * 0.8));
            float a = (1.0 - y) * (1.0 - y) * (0.16 + 0.14 * stripes) * uActive;
            gl_FragColor = vec4(uC, a);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(beamsGeo, beamMat);
      beam.renderOrder = 4;
      this.group.add(pad, disc, beam);
      this.portals.push({ swirl, beam, beamMat });
      this.disposables.push(swirl, beamMat);
    }

    // Orbiting voxel sparks around the whole portal.
    const n = 14;
    const orbitGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const orbitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) });
    this.orbit = new THREE.InstancedMesh(orbitGeo, orbitMat, n);
    const cols = [PALETTE.mint, PALETTE.lilac, PALETTE.sky, PALETTE.cream];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) this.orbit.setColorAt(i, c.set(cols[i % cols.length]));
    this.orbit.frustumCulled = false;
    this.group.add(this.orbit);
    this.disposables.push(orbitGeo, orbitMat, this.orbit);
  }

  // -------------------------------------------------------------------------------------------
  // Async props: coins, key, crate cat, checkpoints, vault emblem
  // -------------------------------------------------------------------------------------------

  private async buildAsync(ctx: LevelContext): Promise<void> {
    const manifest = await ctx.manifest;
    const url = (p: string) => assetUrl(p, ctx.base);
    const voxelMat = getVoxelMaterial();
    const lvl = this.level;

    const tasks: Promise<unknown>[] = [];

    // Catnip pickups (instanced) with a soft lavender glow under each (plan G8). The voxel source
    // is the 16 px sprig master itself, read without smoothing, so each master pixel is one voxel
    // (the old source was the 320 px cannabis-shaped leaf, box-filtered down to 15).
    if (lvl.coins.length) {
      tasks.push(
        // The leaves are lifted toward mint first (catnipNight.ts), so they do not sink into the
        // purple floor. The geometry is built from a recoloured copy, so it is this view's own.
        loadPixels(url(CATNIP_VOXEL_SOURCE)).then((px) => voxelizeImage(nightLiftSprig(px), { size: 16 })).then((geo) => {
          if (this.disposed) {
            geo.dispose();
            return;
          }
          this.disposables.push(geo);
          // Vertex colours lifted 1.4x (as the key's 1.35x), plus a self-light in each voxel's own
          // colour (catnipSelfLight): the purple night lights carry little green, so lit-only mint
          // went grey-teal and the sprig read as an amethyst (review 3e #4). The old flat lavender
          // emissive tinted the leaves too, so it is gone.
          const coinMat = catnipSelfLight(new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(1.4, 1.4, 1.4) }));
          this.disposables.push(coinMat);
          this.coinMesh = new THREE.InstancedMesh(geo, coinMat, lvl.coins.length);
          this.coinMesh.castShadow = true;
          this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.coinMesh.frustumCulled = false;
          this.coinMesh.name = 'coins';
          const glowGeo = new THREE.PlaneGeometry(1.15, 1.15);
          glowGeo.rotateX(-Math.PI / 2);
          const glowMat = new THREE.MeshBasicMaterial({ color: CATNIP_GLOW, map: this.glowTex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
          this.coinGlow = new THREE.InstancedMesh(glowGeo, glowMat, lvl.coins.length);
          this.coinGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.coinGlow.frustumCulled = false;
          this.coinGlow.renderOrder = 1;
          this.group.add(this.coinMesh, this.coinGlow);
          this.disposables.push(glowGeo, glowMat, this.coinMesh, this.coinGlow);
        }),
      );
    }

    // Key.
    if (lvl.key) {
      const kt = lvl.key.tile;
      tasks.push(
        voxelArt(KEY_ART, 1).then((geo) => {
          if (this.disposed) return;
          const g = new THREE.Group();
          const c = tileCenter(kt);
          g.position.set(c.x, 0, c.z);
          const keyMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.35, 1.35, 1.35) });
          this.disposables.push(keyMat);
          const mesh = new THREE.Mesh(geo, keyMat);
          mesh.scale.setScalar(1 / 12);
          mesh.castShadow = true;
          mesh.name = 'key-mesh';
          const glowGeo = new THREE.PlaneGeometry(1.3, 1.3);
          glowGeo.rotateX(-Math.PI / 2);
          const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.coin, map: this.glowTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
          const glow = new THREE.Mesh(glowGeo, glowMat);
          glow.position.y = 0.03;
          glow.renderOrder = 1;
          g.add(mesh, glow);
          g.name = 'key';
          // A soft vertical light shaft so the key reads from across the level.
          const beamGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 8, 1, true);
          beamGeo.translate(0, 1.1, 0);
          const beamMat = new THREE.MeshBasicMaterial({ color: hdr(PALETTE.coin, 1.4), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: this.beamTexture() });
          this.keyBeam = new THREE.Mesh(beamGeo, beamMat);
          this.keyBeam.position.set(c.x, 0, c.z);
          this.keyBeam.renderOrder = 4;
          this.group.add(this.keyBeam);
          this.disposables.push(beamGeo, beamMat);
          this.keyGroup = g;
          this.live.add(g);
          this.group.add(g);
          this.disposables.push(geo, glowGeo, glowMat);
        }),
      );
    }

    // Floating EXIT sign over the portal so the goal reads from the first second.
    if (lvl.exit.tiles.length) {
      tasks.push(
        voxelArt(EXIT_ART, 1).then((geo) => {
          if (this.disposed) return;
          this.exitSignMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.2, 1.2, 1.2) });
          this.disposables.push(this.exitSignMat);
          const m = new THREE.Mesh(geo, this.exitSignMat);
          m.rotation.y = CAMERA_YAW;
          m.position.set(this.exitCenter.x, 1.7, this.exitCenter.z);
          m.name = 'exit-sign';
          this.exitSign = m;
          this.live.add(m);
          this.group.add(m);
          this.disposables.push(geo);
        }),
      );
    }

    // Vault emblem on the camera-facing side of each vault door.
    const vaults = this.doors.filter((d) => d.def.kind === 'VAULT');
    if (vaults.length) {
      tasks.push(
        voxelArt(VAULT_ART, 1).then((geo) => {
          if (this.disposed) return;
          for (const d of vaults) {
            for (const side of [1, -1]) {
              const e = new THREE.Mesh(geo, voxelMat);
              e.scale.setScalar(1 / 22);
              e.position.set(0, d.dial ? 0 : WALL_H / 2, side * 0.2);
              if (side < 0) e.rotation.y = Math.PI;
              (d.dial ?? d.panel).add(e);
            }
          }
          this.disposables.push(geo);
        }),
      );
    }

    // Checkpoints: flat voxel paw prints that light up when a cat claims them.
    const cpGlowGeo = new THREE.PlaneGeometry(1.2, 1.2);
    cpGlowGeo.rotateX(-Math.PI / 2);
    this.disposables.push(cpGlowGeo);
    for (const cp of lvl.checkpoints) {
      const c = tileCenter(cp.tile);
      const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.mint, map: this.glowTex, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
      const glow = new THREE.Mesh(cpGlowGeo, glowMat);
      glow.position.set(c.x, 0.03, c.z);
      glow.renderOrder = 1;
      this.group.add(glow);
      this.disposables.push(glowMat);
      this.checkpoints.push({ tile: cp.tile, mesh: null, glow, lit: 0 });
    }
    if (lvl.checkpoints.length) {
      tasks.push(
        voxelizeImage(url(manifest.images.paw), { size: 12, baseDepth: 1, maxExtra: 0 }).then((geo) => {
          if (this.disposed) return;
          for (const cp of this.checkpoints) {
            const c = tileCenter(cp.tile);
            const mesh = new THREE.Mesh(geo, voxelMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.rotation.z = CAMERA_YAW;
            mesh.scale.setScalar(1 / 20);
            mesh.position.set(c.x, 0.03, c.z);
            mesh.receiveShadow = true;
            cp.mesh = mesh;
            this.group.add(mesh);
          }
        }),
      );
    }

    // Rescue cage + shelter cat.
    tasks.push(this.buildCrate(manifest, ctx.base));

    await Promise.all(tasks);
  }

  private async buildCrate(manifest: AssetManifest, base: string): Promise<void> {
    const cd = this.level.crate;
    const c = tileCenter(cd.tile);
    this.crateGroup.position.set(c.x, 0, c.z);
    this.crateGroup.name = 'crate';

    const woodMat = new THREE.MeshLambertMaterial({ color: '#9b6235' });
    const barMat = new THREE.MeshLambertMaterial({ color: '#cfc3e6' });
    const wood: THREE.BufferGeometry[] = [];
    const bars: THREE.BufferGeometry[] = [];
    const box = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      arr.push(g);
    };
    box(wood, 0.94, 0.1, 0.94, 0, 0.05, 0);
    // Open roof frame (so the cat inside stays visible from the iso camera) with two cross bars.
    box(wood, 0.98, 0.1, 0.12, 0, 0.92, 0.43);
    box(wood, 0.98, 0.1, 0.12, 0, 0.92, -0.43);
    box(wood, 0.12, 0.1, 0.98, 0.43, 0.92, 0);
    box(wood, 0.12, 0.1, 0.98, -0.43, 0.92, 0);
    box(bars, 0.045, 0.045, 0.86, -0.15, 0.93, 0);
    box(bars, 0.045, 0.045, 0.86, 0.15, 0.93, 0);
    for (const x of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) box(wood, 0.11, 0.82, 0.11, x, 0.49, z);
    for (const t of [-0.21, 0, 0.21]) {
      box(bars, 0.045, 0.78, 0.045, t, 0.49, 0.43);
      box(bars, 0.045, 0.78, 0.045, t, 0.49, -0.43);
      box(bars, 0.045, 0.78, 0.045, 0.43, 0.49, t);
      box(bars, 0.045, 0.78, 0.045, -0.43, 0.49, t);
    }
    const woodGeo = mergeGeometries(wood)!;
    const barGeo = mergeGeometries(bars)!;
    for (const g of [...wood, ...bars]) g.dispose();
    const cage = new THREE.Group();
    const woodMesh = new THREE.Mesh(woodGeo, woodMat);
    const barMesh = new THREE.Mesh(barGeo, barMat);
    woodMesh.castShadow = barMesh.castShadow = true;
    woodMesh.receiveShadow = true;
    cage.add(woodMesh, barMesh);
    this.cage = cage;
    this.live.add(cage);
    this.crateGroup.add(cage);
    this.disposables.push(woodMat, barMat, woodGeo, barGeo);

    const heartGeo = await voxelizeImage(assetUrl(manifest.images.heart, base), { size: 12 });
    if (this.disposed) return;
    this.heart = new THREE.Mesh(heartGeo, getVoxelMaterial());
    this.heart.scale.setScalar(1 / 30);
    this.heart.rotation.y = CAMERA_YAW;
    this.heart.position.y = 1.45;
    this.live.add(this.heart);
    this.crateGroup.add(this.heart);

    const entry = manifest.cats.find((k) => k.id === cd.catId) ?? manifest.cats[0];
    if (!entry) return;
    const sheet = await loadVoxelSheet(entry, base);
    if (this.disposed) return;
    const cat = new VoxelSprite(sheet, { anim: 'LOAF', castShadow: true, scale: (1 / 24) * 0.78 });
    cat.object3d.rotation.y = CAMERA_YAW;
    cat.object3d.position.y = 0.1;
    this.crateCat = cat;
    this.live.add(cat.object3d);
    this.crateGroup.add(cat.object3d);
  }

  private beamTex: THREE.CanvasTexture | null = null;
  /** Vertical fade (bright at the floor, gone at the top) for light shafts. */
  private beamTexture(): THREE.CanvasTexture {
    if (this.beamTex) return this.beamTex;
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
    this.beamTex = new THREE.CanvasTexture(c);
    this.disposables.push(this.beamTex);
    return this.beamTex;
  }

  /**
   * Stop recomputing the matrices of everything that never moves (floor, walls, frames, pads,
   * glows, instanced props: their instances carry their own matrices). Animated objects (door
   * panels, plate pads, key, sign, cage, heart, crate cat) and their subtrees keep auto updates.
   */
  private freezeStatic(): void {
    const visit = (o: THREE.Object3D) => {
      if (this.live.has(o)) return;
      o.matrixAutoUpdate = false;
      o.updateMatrix();
      for (const c of o.children) visit(c);
    };
    visit(this.group);
  }

  // -------------------------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------------------------

  /** Link colour of plate `i` (the colour its door's shutter and lights use), as a CSS hex string. */
  plateColor(i: number): string {
    const p = this.plates[i];
    return p ? `#${p.color.getHexString()}` : PALETTE.pink;
  }

  /** True once the rescue happened and the cage has finished its break-open animation. */
  get cageGone(): boolean {
    return this.cageOpen >= 1;
  }

  update(s: SimState, dt: number, time: number): void {
    this.terrain?.update(time);
    const k = (rate: number) => 1 - Math.exp(-rate * dt);

    // Doors: PLATE doors roll up into the header, VAULT doors sink into the floor.
    this.doors.forEach((d, i) => {
      const goal = s.doorsOpen[i] ? 1 : 0;
      d.open += (goal - d.open) * k(d.def.kind === 'VAULT' ? 3 : 9);
      if (Math.abs(goal - d.open) < 0.002) d.open = goal;
      if (d.def.kind === 'VAULT') {
        d.panel.position.y = -0.98 * d.open;
        if (d.dial) d.dial.rotation.z = d.open * Math.PI * 3;
      } else {
        d.panel.scale.y = Math.max(0.06, 1 - 0.94 * d.open);
      }
      const open = s.doorsOpen[i];
      const blink = open ? 1 : 0.6 + 0.4 * Math.max(0, Math.sin(time * 5 + i));
      d.lights.color.copy(open ? d.openColor : d.shutColor).multiplyScalar(3 * blink);
    });

    // Plates.
    this.plates.forEach((p, i) => {
      const goal = s.platesDown[i] ? 1 : 0;
      p.down += (goal - p.down) * k(14);
      p.pad.position.y = 0.1 - 0.04 * p.down;
      p.mat.emissiveIntensity = 0.3 + 0.75 * p.down + 0.12 * Math.sin(time * 3 + i);
      p.ring.color.copy(p.color).multiplyScalar(1 + 1.2 * p.down + 0.25 * Math.sin(time * 4 + i));
      (p.glow.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.34 * p.down;
    });

    // Coins: spin, bob, hide when taken.
    if (this.coinMesh && this.coinGlow) {
      const up = this.v3;
      for (let i = 0; i < s.coins.length && i < this.level.coins.length; i++) {
        const t = this.level.coins[i].tile;
        const taken = s.coins[i].taken;
        // Pickup pop: grow, rise and spin out over 0.3 s instead of vanishing.
        if (taken && this.coinPop[i] === undefined) this.coinPop[i] = time;
        if (!taken) this.coinPop[i] = undefined;
        const pt = taken ? (time - (this.coinPop[i] ?? time)) / 0.3 : -1;
        const popping = pt >= 0 && pt < 1;
        const sc = taken ? (popping ? CATNIP_VOXEL_SCALE * (1 + pt * 0.9) * (1 - pt * pt) : 0) : CATNIP_VOXEL_SCALE;
        const lift = popping ? pt * 0.7 : 0;
        // Wobble around facing the camera instead of a full spin, so the icon never goes edge-on.
        this.q.setFromAxisAngle(up.set(0, 1, 0), CAMERA_YAW + Math.sin(time * 2.2 + i * 0.9) * 0.75 + (popping ? pt * 9 : 0));
        this.m4.compose(this.s3.set(t.x + 0.5, 0.42 + lift + Math.sin(time * 3 + i) * 0.06, t.y + 0.5), this.q, this.v3b.set(sc, sc, sc));
        this.coinMesh.setMatrixAt(i, this.m4);
        const gs = taken ? 0 : 1;
        this.m4.makeScale(gs, gs, gs).setPosition(t.x + 0.5, 0.025, t.y + 0.5);
        this.coinGlow.setMatrixAt(i, this.m4);
      }
      this.coinMesh.instanceMatrix.needsUpdate = true;
      this.coinGlow.instanceMatrix.needsUpdate = true;
    }

    // Key.
    if (this.keyGroup) {
      const goal = s.keyTaken ? 0 : 1;
      this.keyVisible += (goal - this.keyVisible) * k(10);
      const sc = this.keyVisible < 0.02 ? 0 : this.keyVisible;
      this.keyGroup.visible = sc > 0;
      this.keyGroup.scale.setScalar(sc);
      const mesh = this.keyGroup.children[0];
      mesh.position.y = 0.5 + Math.sin(time * 2.6) * 0.07;
      mesh.rotation.y = time * 1.8;
    }

    // Checkpoints: light up when either cat's respawn point is here.
    for (const cp of this.checkpoints) {
      const on = s.cats.some((c) => c.checkpoint.x === cp.tile.x && c.checkpoint.y === cp.tile.y);
      cp.lit += ((on ? 1 : 0) - cp.lit) * k(6);
      (cp.glow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.6 * cp.lit * (0.85 + 0.15 * Math.sin(time * 4));
    }

    // Crate: break-open after the rescue.
    if (s.rescued && this.cageOpen < 1) this.cageOpen = Math.min(1, this.cageOpen + dt * 2.2);
    if (!s.rescued) this.cageOpen = 0;
    if (this.cage) {
      const t = this.cageOpen;
      const pop = t < 0.3 ? 1 + t * 0.6 : Math.max(0, 1.18 * (1 - (t - 0.3) / 0.7));
      this.cage.visible = t < 1;
      this.cage.scale.set(pop, t < 0.3 ? 1 + t * 0.4 : pop, pop);
    }
    if (this.heart) {
      this.heart.visible = !s.rescued;
      this.heart.position.y = 1.45 + Math.sin(time * 3) * 0.08;
      this.heart.scale.setScalar((1 / 30) * (1 + 0.12 * Math.max(0, Math.sin(time * 6))));
    }
    if (this.crateCat && this.crateCat.object3d.parent === this.crateGroup) this.crateCat.update(dt);

    // Exit portal: softly lit until the rescue is done, then bright and fast.
    this.portalActive += ((s.rescued ? 1 : 0) - this.portalActive) * k(3);
    if (this.exitSign) {
      const pulse = 1 + 0.14 * this.portalActive * Math.max(0, Math.sin(time * 5));
      this.exitSign.scale.setScalar((1 / 11) * pulse);
      this.exitSign.position.y = 1.7 + Math.sin(time * 2) * 0.08;
    }
    if (this.exitSignMat) {
      // Neon: dim and flickering until the rescue, then bright.
      const flick = this.portalActive > 0.5 ? 1 : Math.sin(time * 23) > 0.93 ? 0.55 : 1;
      this.exitSignMat.color.setScalar((1.05 + 1.6 * this.portalActive) * flick);
    }
    if (this.pylonMat) this.pylonMat.color.setScalar(1.2 + this.portalActive * (1.6 + Math.sin(time * 6) * 0.4));
    if (this.keyBeam) {
      (this.keyBeam.material as THREE.MeshBasicMaterial).opacity = (0.28 + 0.08 * Math.sin(time * 3)) * this.keyVisible;
      this.keyBeam.visible = this.keyVisible > 0.02;
    }
    for (const p of this.portals) {
      p.swirl.uniforms.uTime.value = time;
      p.swirl.uniforms.uActive.value = 0.35 + 0.65 * this.portalActive;
      p.swirl.uniforms.uBoost.value = 1.25;
      p.beamMat.uniforms.uTime.value = time;
      p.beamMat.uniforms.uActive.value = this.portalActive;
      p.beam.visible = this.portalActive > 0.02;
    }
    if (this.orbit) {
      const n = this.orbit.count;
      const r = 0.55 + 0.25 * Math.max(0, this.level.exit.tiles.length - 1);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * (0.6 + this.portalActive * 1.6);
        const y = 0.25 + ((i * 0.37 + time * (0.2 + 0.5 * this.portalActive)) % 1) * (0.4 + this.portalActive * 1.0);
        const sc = 0.6 + this.portalActive * 0.6;
        this.m4.makeScale(sc, sc, sc).setPosition(this.exitCenter.x + Math.cos(a) * r, y, this.exitCenter.z + Math.sin(a) * r);
        this.orbit.setMatrixAt(i, this.m4);
      }
      this.orbit.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.crateCat?.dispose();
    this.terrain?.dispose();
    this.heart?.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.group.removeFromParent();
  }
}
