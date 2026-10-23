// City generator. Owned by the CAMPAIGN lane: layouts and looks per city live here, in world/layouts.ts,
// world/props.ts and world/theme.ts.
// The public surface below (fields + methods marked CONTRACT) is used by core and other lanes: keep it stable.
import * as THREE from 'three';
import { BodySet, St } from '../core/bodies';
import { CAPS } from '../core/state';
import type { WorldDef } from '../core/types';
import { buildLayout } from './layouts';
import { Decor, Props } from './props';

export const FLOOR = 7; // one breakable segment (CONTRACT)

export interface Building {
  x: number;
  z: number;
  hx: number;
  hz: number;
  first: number;
  count: number;
  value: number; // $ per segment
}

/** Facade style per segment (the window shader branches on it). Office is the POC look. */
export const STYLE = { office: 0, container: 1, house: 2, industrial: 3, tower: 4, bunker: 5, plain: 6, stripe: 7 } as const;
export type Style = (typeof STYLE)[keyof typeof STYLE];

/** Wet areas the cat hates standing in (harbour, pools) and the dry decks inside them. Read by campaign/runtime.ts. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface Terrain {
  water: Rect[];
  dry: Rect[];
  waterName: string; // pop text when wading
}

type WinUniforms = {
  uLit: { value: number };
  uGlass: { value: THREE.Color };
  uGlow: { value: THREE.Color };
  uGlow2: { value: THREE.Color };
  uEmit: { value: number };
};

function windowMaterial(u: WinUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.05 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aStyle;\nvarying vec3 vWin; varying vec3 vWinN; varying float vStyle;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 iscale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vWin = position * iscale; vWinN = normal; vStyle = aStyle;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWin; varying vec3 vWinN; varying float vStyle;\nuniform float uLit; uniform vec3 uGlass; uniform vec3 uGlow; uniform vec3 uGlow2; uniform float uEmit;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wLit = 0.0;
        float wHue = 0.0;
        if (abs(vWinN.y) < 0.5) {
          float h = abs(vWinN.x) > 0.5 ? vWin.z : vWin.x;
          if (vStyle < 0.5) {
            // office: the POC window grid
            float u = fract(h / 3.6 + 0.5);
            float vv = fract(vWin.y / 3.5 + 0.5);
            float win = step(0.22, u) * step(u, 0.78) * step(0.28, vv) * step(vv, 0.86);
            vec2 cell = floor(vec2(h / 3.6, vWin.y / 3.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            vec3 glass = mix(uGlass, uGlow, lit);
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.9);
            wLit = win * lit;
            wHue = fract(sin(dot(cell, vec2(39.3468, 11.135))) * 24634.6345);
          } else if (vStyle < 1.5) {
            // shipping container: corrugated ribs, dark seams between boxes, no windows
            float rib = step(0.5, fract(h / 1.15));
            diffuseColor.rgb *= 0.84 + 0.16 * rib;
            diffuseColor.rgb *= 1.0 - 0.45 * step(3.05, abs(vWin.y));
          } else if (vStyle < 2.5) {
            // house: one row of framed windows per floor, wide spacing
            float u = fract(h / 6.5 + 0.5);
            float vv = fract(vWin.y / 7.0 + 0.5);
            float win = step(0.32, u) * step(u, 0.68) * step(0.36, vv) * step(vv, 0.74);
            float frame = step(0.27, u) * step(u, 0.73) * step(0.31, vv) * step(vv, 0.79) - win;
            vec2 cell = floor(vec2(h / 6.5 + 0.5, vWin.y / 7.0 + 0.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.96, 0.92), frame * 0.95);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGlass, uGlow, lit), win * 0.92);
            wLit = win * lit;
          } else if (vStyle < 3.5) {
            // warehouse / hangar: ribbed cladding, a high strip of clerestory windows
            float panel = step(0.5, fract(h / 1.6));
            diffuseColor.rgb *= 0.86 + 0.14 * panel;
            float vv = fract(vWin.y / 7.0 + 0.5);
            float u = fract(h / 5.0 + 0.5);
            float win = step(0.74, vv) * step(vv, 0.9) * step(0.08, u) * step(u, 0.92);
            vec2 cell = floor(vec2(h / 5.0 + 0.5, vWin.y / 7.0 + 0.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGlass, uGlow, lit), win * 0.85);
            wLit = win * lit;
          } else if (vStyle < 4.5) {
            // neon tower: a dense grid of small windows, many lit; each tower leans cyan or pink
            float bseed = fract(dot(diffuseColor.rgb, vec3(91.7, 47.3, 13.1)));
            float u = fract(h / 2.4 + 0.5);
            float vv = fract(vWin.y / 2.333 + 0.5);
            float win = step(0.16, u) * step(u, 0.84) * step(0.22, vv) * step(vv, 0.84);
            vec2 cell = floor(vec2(h / 2.4 + 0.5, vWin.y / 2.333 + 0.5));
            float lit = step(1.0 - uLit, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGlass, uGlow, lit), win * 0.9);
            wLit = win * lit;
            wHue = fract(bseed + 0.3 * fract(sin(dot(floor(cell / vec2(4.0, 6.0)), vec2(39.3468, 11.135))) * 24634.6345));
          } else if (vStyle < 5.5) {
            // bunker: rough concrete with one gun slit
            float vv = fract(vWin.y / 7.0 + 0.5);
            float u = fract(h / 9.0 + 0.5);
            float slit = step(0.6, vv) * step(vv, 0.7) * step(0.3, u) * step(u, 0.7);
            diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(h / 2.0 + vWin.y / 3.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05), slit * 0.9);
          } else if (vStyle < 6.5) {
            // lattice mast: cross bracing, no windows
            float d1 = abs(fract((h + vWin.y) / 5.0) - 0.5);
            float d2 = abs(fract((h - vWin.y) / 5.0) - 0.5);
            float brace = max(step(0.42, d1), step(0.42, d2));
            diffuseColor.rgb *= 0.62 + 0.38 * brace;
          } else {
            // painted stripes (lighthouse, chimneys): a plain coat with a soft band per floor
            diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, fract(vWin.y / 7.0 + 0.5));
          }
        } else {
          diffuseColor.rgb *= 0.78;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += mix(uGlow, uGlow2, step(0.62, wHue)) * wLit * uEmit;`,
      );
  };
  return mat;
}

export class City {
  // CONTRACT fields
  segs: BodySet;
  trees: BodySet;
  buildings: Building[] = [];
  segBuilding: Int32Array;
  group = new THREE.Group();
  totalSegs = 0;
  n = 9;
  block = 100;
  street = 26;
  half = 450;
  spawn = { x: 0, z: 0, heading: 0 };
  /** window shader uniforms (theme.ts sets them) */
  win: WinUniforms = {
    uLit: { value: 0.18 },
    uGlass: { value: new THREE.Color(0.22, 0.28, 0.36) },
    uGlow: { value: new THREE.Color(1.0, 0.86, 0.55) },
    uGlow2: { value: new THREE.Color(1.0, 0.86, 0.55) },
    uEmit: { value: 0 },
  };
  // campaign-lane extras (not part of the cross-lane contract)
  layout: WorldDef['layout'] = 'downtown';
  props: Props;
  decor = new Decor();
  terrain: Terrain = { water: [], dry: [], waterName: 'WATER' };
  /** per-build meshes, disposed on rebuild */
  dyn = new THREE.Group();
  private style: THREE.InstancedBufferAttribute;

  constructor(scene: THREE.Scene) {
    const segGeo = new THREE.BoxGeometry(1, 1, 1);
    this.style = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.segs), 1);
    segGeo.setAttribute('aStyle', this.style);
    this.segs = new BodySet(segGeo, windowMaterial(this.win), CAPS.segs);
    this.segBuilding = new Int32Array(CAPS.segs);
    const treeGeo = new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0, 0);
    this.trees = new BodySet(treeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), CAPS.trees);
    scene.add(this.group);
    this.group.add(this.segs.mesh, this.trees.mesh, this.dyn);
    this.props = new Props(this.group);
  }

  /** CONTRACT: street centre line k (0..n) */
  streetAt(k: number): number {
    return -this.half + k * this.block;
  }

  /**
   * Add one building column of `count` floors. `color(k, out)` colours floor k (or pass one Color for all floors).
   * Floors from `setback` up shrink to `shrink`. Returns the building index, or -1 when the segment pool is full.
   */
  addBuilding(
    x: number,
    z: number,
    hx: number,
    hz: number,
    count: number,
    value: number,
    style: Style,
    color: THREE.Color | ((k: number, out: THREE.Color) => THREE.Color),
    setback = 999,
    shrink = 0.72,
  ): number {
    if (count < 1 || this.segs.n + count > CAPS.segs) return -1;
    const bi = this.buildings.length;
    const b: Building = { x, z, hx, hz, first: this.segs.n, count, value };
    const tmp = TMP_COL;
    for (let k = 0; k < count; k++) {
      const s = k >= setback ? shrink : 1;
      const c = typeof color === 'function' ? color(k, tmp) : color;
      const idx = this.segs.add(x, FLOOR * (k + 0.5), z, hx * 2 * s, FLOOR, hz * 2 * s, c);
      this.segBuilding[idx] = bi;
      this.style.setX(idx, style);
    }
    this.buildings.push(b);
    return bi;
  }

  /** Add a tree (cone) of height h; false when the tree pool is full. */
  addTree(x: number, z: number, h: number, color: THREE.Color, base = 1, widthMul = 0.55): boolean {
    if (this.trees.n >= CAPS.trees) return false;
    this.trees.add(x, h / 2 + base, z, h * widthMul, h, h * widthMul, color);
    return true;
  }

  /** CONTRACT: regenerate the whole city (deterministic per world.seed). Resets every segment and tree. */
  build(world: WorldDef): void {
    for (const o of [...this.dyn.children]) {
      this.dyn.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    }
    this.segs.n = 0;
    this.segs.mesh.count = 0;
    this.trees.n = 0;
    this.trees.mesh.count = 0;
    this.buildings = [];
    (this.style.array as Float32Array).fill(0);
    this.props.reset();
    this.decor.reset();
    this.terrain = { water: [], dry: [], waterName: 'WATER' };
    this.layout = world.layout;
    const { n: N, block: BLOCK } = world;
    this.n = N;
    this.block = BLOCK;
    this.street = world.street;
    this.half = (N * BLOCK) / 2;
    const rnd = mulberry(world.seed);
    if (world.layout === 'downtown') this.buildDowntown(world, rnd);
    else buildLayout(this, world, rnd);
    this.decor.flush(this.dyn);
    this.props.finish();
    this.style.needsUpdate = true;
    this.totalSegs = this.segs.n;
    if (this.segs.mesh.instanceColor) this.segs.mesh.instanceColor.needsUpdate = true;
    if (this.trees.mesh.instanceColor) this.trees.mesh.instanceColor.needsUpdate = true;
    this.segs.mesh.instanceMatrix.needsUpdate = true;
    this.trees.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Meowhattan: the POC generator, untouched (same random sequence, same city for seed 7). */
  private buildDowntown(world: WorldDef, rnd: () => number): void {
    const { n: N, block: BLOCK, street: STREET, theme } = world;
    const HALF = this.half;
    const streetAt = (k: number) => this.streetAt(k);
    const cap = CAPS.segs;

    // ground: asphalt, then a raised sidewalk slab per block
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.dyn.add(ground);

    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: theme.sidewalk, roughness: 1 }), N * N);
    const grass = new THREE.MeshStandardMaterial({ color: theme.grass, roughness: 1 });
    const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: theme.dash }), Math.ceil(2 * (N + 1) * ((N * BLOCK) / 16 + 1)));
    let dashN = 0;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const palette = theme.palette;
    let si = 0;
    for (let bx = 0; bx < N; bx++) {
      for (let bz = 0; bz < N; bz++) {
        const cx = streetAt(bx) + BLOCK / 2;
        const cz = streetAt(bz) + BLOCK / 2;
        const lot = BLOCK - STREET;
        m.compose(new THREE.Vector3(cx, 0.4, cz), new THREE.Quaternion(), new THREE.Vector3(lot, 0.8, lot));
        slabs.setMatrixAt(si++, m);
        slabs.receiveShadow = true;
        const centre = 1 - Math.hypot(cx, cz) / (HALF * 1.2);
        const isPark = rnd() < world.parkChance && !(Math.abs(cx) < BLOCK && Math.abs(cz) < BLOCK);
        if (isPark) {
          const g = new THREE.Mesh(new THREE.BoxGeometry(lot - 6, 1, lot - 6), grass);
          g.position.set(cx, 0.5, cz);
          g.receiveShadow = true;
          this.dyn.add(g);
          for (let t = 0; t < 22; t++) {
            const h = 9 + rnd() * 8;
            if (this.trees.n >= CAPS.trees) break;
            this.trees.add(cx + (rnd() - 0.5) * (lot - 14), h / 2 + 1, cz + (rnd() - 0.5) * (lot - 14), h * 0.55, h, h * 0.55, col.setHSL(0.27 + rnd() * 0.06, 0.45, 0.32 + rnd() * 0.1));
          }
          continue;
        }
        // split the lot into 1, 2 or 4 buildings
        const split = rnd() < 0.25 ? 1 : rnd() < 0.5 ? 2 : 4;
        const cells: [number, number, number, number][] = [];
        const inset = 3;
        if (split === 1) cells.push([cx, cz, lot / 2 - inset, lot / 2 - inset]);
        else if (split === 2) {
          const q = lot / 4;
          if (rnd() < 0.5) cells.push([cx - q, cz, q - inset, lot / 2 - inset], [cx + q, cz, q - inset, lot / 2 - inset]);
          else cells.push([cx, cz - q, lot / 2 - inset, q - inset], [cx, cz + q, lot / 2 - inset, q - inset]);
        } else {
          const q = lot / 4;
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) cells.push([cx + sx * q, cz + sz * q, q - inset, q - inset]);
        }
        for (const [x, z, hx0, hz0] of cells) {
          const hx = hx0 * (0.8 + rnd() * 0.2);
          const hz = hz0 * (0.8 + rnd() * 0.2);
          const tall = world.heightBase + rnd() * world.heightRand + Math.max(0, centre) * (world.centreBoost + rnd() * world.centreRand);
          const count = Math.max(3, Math.round(tall / FLOOR));
          if (this.segs.n + count > cap) continue;
          col.setHex(palette[Math.floor(rnd() * palette.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
          const value = world.valueBase + rnd() * world.valueRand;
          const setback = count > 10 && rnd() < 0.6 ? Math.floor(count * (0.55 + rnd() * 0.2)) : 999;
          this.addBuilding(x, z, hx, hz, count, value, STYLE.office, col, setback);
        }
      }
    }
    slabs.instanceMatrix.needsUpdate = true;
    this.dyn.add(slabs);
    // dashed centre lines
    for (let k = 0; k <= N; k++) {
      const s = streetAt(k);
      for (let a = -HALF; a < HALF; a += 16) {
        if (dashN + 2 > dash.count) break;
        m.compose(new THREE.Vector3(s, 0.05, a + 4), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(0.8, 7, 1));
        dash.setMatrixAt(dashN++, m);
        m.compose(new THREE.Vector3(a + 4, 0.05, s), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)), new THREE.Vector3(0.8, 7, 1));
        dash.setMatrixAt(dashN++, m);
      }
    }
    dash.count = dashN;
    this.dyn.add(dash);
    // start on the avenue, looking down it
    this.spawn = { x: streetAt(Math.min(4, N)), z: streetAt(1) + 20, heading: 0 };
  }

  /** CONTRACT: height of the still-standing stack from the ground (0 when knocked down to the base). */
  standing(b: Building): number {
    let h = 0;
    for (let k = 0; k < b.count; k++) {
      if (this.segs.state[b.first + k] !== St.Static) break;
      h = (k + 1) * FLOOR;
    }
    return h;
  }

  /**
   * CONTRACT: knock segment i off with a velocity; every static segment above it loses support and falls with a share
   * of the push. Returns the number of segments set flying.
   */
  knock(i: number, vx: number, vy: number, vz: number): number {
    if (this.segs.state[i] !== St.Static) return 0;
    const b = this.buildings[this.segBuilding[i]];
    const k0 = i - b.first;
    let n = 0;
    for (let k = k0; k < b.count; k++) {
      const j = b.first + k;
      if (this.segs.state[j] !== St.Static) continue;
      const f = k === k0 ? 1 : 0.25 + 0.5 / (1 + (k - k0));
      const jitter = 0.35;
      this.segs.launch(j, vx * f * (1 + (Math.random() - 0.5) * jitter), vy * f + Math.random() * 6, vz * f * (1 + (Math.random() - 0.5) * jitter), k === k0 ? 4 : 1.5);
      n++;
    }
    return n;
  }
}

const TMP_COL = new THREE.Color();

export function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
