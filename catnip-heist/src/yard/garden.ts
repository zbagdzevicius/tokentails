/**
 * The Cat Yard garden plaza, built from voxel boxes: grass tiles, stone paths, a fountain,
 * benches, trees, flower beds, hedges, lamp posts, a cat tower and a few toys, on a raised stone
 * terrace in a golden-hour meadow ringed by distant voxel trees.
 *
 * Draw calls: static props (1), swaying grass + flowers (1), swaying tree canopies (1), lamp glass
 * (1), water (1), meadow (1), distant tree line (1). Wind sway is a vertex-shader offset scaled by
 * height (onBeforeCompile), so no per-frame geometry work. Everything here is DOM-free (it also
 * runs in the Node unit tests).
 */
import * as THREE from 'three';
import { layoutRng, VoxelBuilder, ALL_BUT_BOTTOM, PX, NX, PZ, NZ, PY } from './builder';
import type { Circle, YardWorld } from './wander';

export interface Garden {
  group: THREE.Group;
  world: YardWorld;
  /** Where fountain droplets start. */
  spout: THREE.Vector3;
  /** Water surface mesh (animated by the yard). */
  water: THREE.Mesh;
  /** Lamp glass centres (for light pools). */
  lamps: THREE.Vector3[];
  /** Half extents of the plaza (for camera clamps). */
  halfX: number;
  halfZ: number;
  triangles: number;
  /** Shared sky uniforms (colours + drawing-buffer size) used by the backdrop and the distance haze. */
  sky: SkyUniforms;
  /** Animate wind and water (seconds). */
  update(time: number): void;
  /** Toggle real-time shadow casting / receiving of the garden meshes. */
  setShadows(on: boolean): void;
  /** `keepMaterials`: leave materials alive so a shared renderer keeps their compiled programs. */
  dispose(keepMaterials?: boolean): void;
}

export interface SkyUniforms {
  uRes: { value: THREE.Vector2 };
  uSkyA: { value: THREE.Color };
  uSkyB: { value: THREE.Color };
  uSkyC: { value: THREE.Color };
  uSun: { value: THREE.Color };
  [k: string]: THREE.IUniform;
}

/** GLSL: golden-hour sky/haze colour by screen position (uv 0..1, y up). Sun glow top-left. */
export const SKY_GLSL = /* glsl */ `
uniform vec2 uRes;
uniform vec3 uSkyA;
uniform vec3 uSkyB;
uniform vec3 uSkyC;
uniform vec3 uSun;
vec3 skyAt(vec2 uv) {
  float t = clamp(0.7 * (1.0 - uv.y) + 0.3 * uv.x, 0.0, 1.0);
  vec3 c = mix(uSkyA, uSkyB, smoothstep(0.0, 0.5, t));
  c = mix(c, uSkyC, smoothstep(0.45, 1.0, t));
  float sun = 1.0 - smoothstep(0.0, 0.75, length((uv - vec2(0.12, 1.02)) * vec2(1.0, 1.4)));
  return c + uSun * sun * sun * 0.55;
}
`;

const C = {
  grassA: 0x8cc463, grassB: 0x80b95a, grassC: 0x98cd6c, grassD: 0xb4d873, grassE: 0x76ad57,
  soil: 0x6a4432, soilTop: 0x7c5139,
  terrace: 0xb89bc9, terraceDark: 0x8e6fa6, terraceCap: 0xe8d6ef,
  stoneA: 0xf0e0ea, stoneB: 0xe2cfe2, stoneC: 0xd4bdd8, stoneEdge: 0xa888bb,
  wood: 0xc2764a, woodDark: 0x8e4d31, iron: 0x3b2a45,
  leafA: 0x55a052, leafB: 0x72b957, leafC: 0x3f8750, leafSun: 0x9ccc5e, trunk: 0x7a4a33,
  hedge: 0x4d9450, hedgeTop: 0x67b25a,
  basin: 0xd4bfe0, basinTop: 0xf6ecf7,
  carpet: 0x9966cc, carpetTop: 0xb488e0, rope: 0xe8cf9a,
  meadowA: 0xa8c46c, meadowB: 0xa0bd67, meadowC: 0xb5ca73,
  farA: 0x7fa463, farB: 0x6f9a60, farTrunk: 0x7a5249,
  petals: [0xff7aa2, 0xffc93c, 0xf0c5fd, 0xc4e2fc, 0xffffff, 0xee642a],
};

/** Plaza half extents in world units (1 unit = 1 heist tile). */
const HX = 14, HZ = 10;
/** Meadow level (the plaza is a raised terrace above it). */
const MEADOW_Y = -0.55;

/** Wind: sway offset grows with height above `base`; phase varies across the garden. */
function windMaterial(uTime: { value: number }, base: number, amp: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float w = max(0.0, transformed.y - ${base.toFixed(3)}) * ${amp.toFixed(4)};
          float ph = transformed.x * 0.55 + transformed.z * 0.4;
          float gust = 0.65 + 0.35 * sin(uTime * 0.45 + transformed.x * 0.08);
          transformed.x += sin(uTime * 1.9 + ph) * w * gust;
          transformed.z += cos(uTime * 1.6 + ph * 1.3) * w * 0.6 * gust;
        }`,
      );
  };
  m.customProgramCacheKey = () => `yard-wind-${base}-${amp}`;
  return m;
}

/** Lambert that fades into the sky colour with distance from the plaza (aerial haze). */
function hazeMaterial(sky: SkyUniforms, near: number, far: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, sky);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHazeW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vHazeW;\n${SKY_GLSL}`)
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          vec2 q = max(abs(vHazeW.xz) - vec2(${HX.toFixed(1)}, ${HZ.toFixed(1)}), 0.0);
          float f = smoothstep(${near.toFixed(1)}, ${far.toFixed(1)}, length(q) + max(0.0, vHazeW.y) * 0.6);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyAt(gl_FragCoord.xy / uRes), f);
        }`,
      );
  };
  m.customProgramCacheKey = () => `yard-haze-${near}-${far}`;
  return m;
}

function waterMaterial(uTime: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime,
      uDeep: { value: new THREE.Color(0x4d8fd0) },
      uShallow: { value: new THREE.Color(0x9ee6ff) },
      uFoam: { value: new THREE.Color(0xfff4e0) },
      uWarm: { value: new THREE.Color(0xffc98a) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uFoam, uWarm;
      varying vec2 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 cell = floor(vW * 9.0);
        vec2 p = (cell + 0.5) / 9.0;          // voxel-quantised water
        float r = length(p);
        float caus = sin(p.x * 6.0 + uTime * 1.3) * sin(p.y * 5.5 - uTime * 1.1) + 0.6 * sin((p.x - p.y) * 4.3 + uTime * 0.8);
        float ring = sin(r * 10.0 - uTime * 2.6) * 0.5 + 0.5;
        vec3 col = mix(uDeep, uShallow, clamp(0.35 + 0.28 * caus + 0.25 * smoothstep(1.9, 0.6, r), 0.0, 1.0));
        col += uFoam * smoothstep(0.86, 0.99, ring) * 0.28 * smoothstep(0.3, 0.9, r);
        // Golden reflection band from the low sun (upper-left), and splash foam around the spout.
        col = mix(col, uWarm, 0.25 * smoothstep(0.4, 1.0, sin((p.x - p.y) * 1.2 + 1.2)));
        col = mix(col, uFoam, smoothstep(0.55, 0.25, r) * (0.55 + 0.25 * sin(uTime * 7.0 + r * 30.0)));
        // Sparkles: HDR (> 1) so they catch the bloom.
        float h = hash(cell);
        float tw = step(0.965, h) * pow(max(0.0, sin(uTime * 2.6 + h * 60.0)), 10.0);
        col += vec3(1.0, 0.97, 0.9) * tw * 2.4;
        gl_FragColor = vec4(col, 0.9);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildGarden(seed = 7): Garden {
  const rnd = layoutRng(seed);
  const b = new VoxelBuilder();
  const sway = new VoxelBuilder();
  const leaves = new VoxelBuilder();
  const glow = new VoxelBuilder();
  const far = new VoxelBuilder();
  const obstacles: Circle[] = [];
  const spots: { x: number; z: number }[] = [];
  const lamps: THREE.Vector3[] = [];
  const uTime = { value: 0 };
  const sky: SkyUniforms = {
    uRes: { value: new THREE.Vector2(1280, 720) },
    uSkyA: { value: new THREE.Color(0xffd9a0) },
    uSkyB: { value: new THREE.Color(0xf6b9cf) },
    uSkyC: { value: new THREE.Color(0xb68ad8) },
    uSun: { value: new THREE.Color(0xfff0c0) },
  };

  const onPath = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r >= 2.4 && r < 3.7) return true;
    return (Math.abs(x) < 1.05 && r >= 2.4) || (Math.abs(z) < 1.05 && r >= 2.4);
  };
  const treeSpots = [
    { x: -10.5, z: -6.5 }, { x: 10.5, z: -6.2 }, { x: -10.2, z: 6.4 }, { x: 10.6, z: 6.6 },
  ];
  const shadeAt = (x: number, z: number) => {
    // Soft baked shade (the low tier has no real shadows): trees cast towards +x / -z (sun upper left).
    for (const t of treeSpots) if (Math.hypot(x - t.x - 0.9, z - t.z + 0.4) < 1.8) return true;
    return false;
  };

  // ---- terrace (raised plaza) and tiles ----------------------------------------------------
  // Stone retaining wall with a light cap: the plaza reads as a built garden terrace in the meadow.
  b.box(-HX - 0.5, MEADOW_Y, -HZ - 0.5, HX + 0.5, -0.12, HZ + 0.5, C.terrace, PX | NX | PZ | NZ);
  b.box(-HX - 0.62, -0.12, -HZ - 0.62, HX + 0.62, 0.02, HZ + 0.62, C.terraceCap, PX | NX | PZ | NZ);
  b.box(-HX - 0.62, 0.0, HZ + 0.5, HX + 0.62, 0.02, HZ + 0.62, C.terraceCap, PY);
  b.box(-HX - 0.62, 0.0, -HZ - 0.62, HX + 0.62, 0.02, -HZ - 0.5, C.terraceCap, PY);
  b.box(HX + 0.5, 0.0, -HZ - 0.5, HX + 0.62, 0.02, HZ + 0.5, C.terraceCap, PY);
  b.box(-HX - 0.62, 0.0, -HZ - 0.5, -HX - 0.5, 0.02, HZ + 0.5, C.terraceCap, PY);
  // Brick courses on the two camera-facing walls.
  for (let x = -HX - 0.5; x < HX + 0.5; x += 0.7) {
    b.box(x, -0.42, HZ + 0.5, x + 0.64, -0.36, HZ + 0.52, C.terraceDark, PZ);
    b.box(x + 0.3, -0.26, HZ + 0.5, Math.min(HX + 0.5, x + 0.94), -0.2, HZ + 0.52, C.terraceDark, PZ);
  }
  for (let z = -HZ - 0.5; z < HZ + 0.5; z += 0.7) {
    b.box(HX + 0.5, -0.42, z, HX + 0.52, -0.36, z + 0.64, C.terraceDark, PX);
    b.box(HX + 0.5, -0.26, z + 0.3, HX + 0.52, -0.2, Math.min(HZ + 0.5, z + 0.94), C.terraceDark, PX);
  }
  const gridCol = (x: number, z: number) => {
    const n = rnd();
    const checker = ((Math.floor(x) + Math.floor(z)) & 1) === 0;
    return n < 0.07 ? C.grassD : n < 0.12 ? C.grassE : checker ? (n < 0.55 ? C.grassA : C.grassC) : n < 0.6 ? C.grassB : C.grassA;
  };
  const tuft = (tx: number, tz: number, col: number) => {
    sway.block(tx, 0, tz, 0.035, 0.12 + rnd() * 0.1, 0.035, col);
    sway.block(tx + 0.08, 0, tz + 0.04, 0.03, 0.08 + rnd() * 0.06, 0.03, C.grassD);
    if (rnd() < 0.5) sway.block(tx - 0.06, 0, tz + 0.07, 0.03, 0.07 + rnd() * 0.05, 0.03, C.grassC);
  };
  for (let x = -HX - 0.5; x < HX + 0.5; x += 1) {
    for (let z = -HZ - 0.5; z < HZ + 0.5; z += 1) {
      const cx = x + 0.5, cz = z + 0.5;
      if (onPath(cx, cz)) {
        const pick = rnd();
        const col = pick < 0.34 ? C.stoneA : pick < 0.7 ? C.stoneB : C.stoneC;
        // Stones sit slightly proud with a dark seam around them.
        b.tile(x, z, x + 1, z + 1, -0.02, C.stoneEdge);
        b.box(x + 0.05, -0.02, z + 0.05, x + 0.95, 0.05, z + 0.95, shadeAt(cx, cz) ? darken(col, 0.86) : col, PY | PZ | PX);
        if (rnd() < 0.12) {
          // Moss creeping between the stones.
          b.box(x + 0.02, 0.0, z + 0.9, x + 0.4, 0.03, z + 0.98, C.grassE, PY);
        }
      } else {
        const col = gridCol(x, z);
        b.tile(x, z, x + 1, z + 1, 0, shadeAt(cx, cz) ? darken(col, 0.86) : col);
        const n = rnd();
        if (n < 0.42) tuft(x + 0.15 + rnd() * 0.7, z + 0.15 + rnd() * 0.7, n < 0.2 ? C.grassE : C.grassC);
        if (n > 0.93) {
          // Wildflower.
          const fx = x + 0.2 + rnd() * 0.6, fz = z + 0.2 + rnd() * 0.6;
          const hgt = 0.14 + rnd() * 0.1;
          sway.block(fx, 0, fz, 0.02, hgt, 0.02, C.leafA);
          const pc = C.petals[Math.floor(rnd() * C.petals.length)];
          sway.block(fx, hgt, fz, 0.06, 0.05, 0.06, pc, ALL_BUT_BOTTOM, lighten(pc, 1.1));
        }
      }
    }
  }

  // ---- fountain -------------------------------------------------------------------------------
  const cell = 0.35;
  for (let x = -2.45; x < 2.45; x += cell) {
    for (let z = -2.45; z < 2.45; z += cell) {
      const r = Math.hypot(x + cell / 2, z + cell / 2);
      if (r < 1.85) b.box(x, 0, z, x + cell, 0.12, z + cell, 0x5a82b0, PY);
      else if (r < 2.4) b.box(x, 0, z, x + cell, 0.55, z + cell, C.basin, ALL_BUT_BOTTOM, C.basinTop);
    }
  }
  // Pillar, bowl and top.
  b.block(0, 0, 0, 0.32, 1.35, 0.32, C.basin, ALL_BUT_BOTTOM, C.basinTop);
  for (let x = -0.9; x < 0.9; x += 0.3) {
    for (let z = -0.9; z < 0.9; z += 0.3) {
      if (Math.hypot(x + 0.15, z + 0.15) < 0.95) b.box(x, 1.35, z, x + 0.3, 1.52, z + 0.3, C.basin, ALL_BUT_BOTTOM, C.basinTop);
    }
  }
  b.block(0, 1.52, 0, 0.16, 0.45, 0.16, C.basinTop);
  glow.block(0, 1.97, 0, 0.1, 0.12, 0.1, 0xffc93c);
  obstacles.push({ x: 0, z: 0, r: 2.45 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    spots.push({ x: Math.cos(a) * 3.0, z: Math.sin(a) * 3.0 });
  }
  const waterGeo = new THREE.CircleGeometry(1.95, 32);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = waterMaterial(uTime);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0.38;
  water.name = 'water';
  water.renderOrder = 1;

  // ---- benches --------------------------------------------------------------------------------
  const bench = (cx: number, cz: number, facing: 1 | -1) => {
    // Along x, backrest on the side away from the fountain.
    const back = -facing * 0.28;
    for (const lx of [-0.8, 0.8]) {
      b.block(cx + lx, 0, cz - 0.2, 0.06, 0.34, 0.06, C.iron);
      b.block(cx + lx, 0, cz + 0.2, 0.06, 0.34, 0.06, C.iron);
    }
    for (let s = -1; s <= 1; s++) b.block(cx, 0.34, cz + s * 0.13, 1.0, 0.07, 0.055, s === 0 ? C.woodDark : C.wood);
    b.block(cx - 0.8, 0.34, cz + back, 0.06, 0.52, 0.05, C.iron);
    b.block(cx + 0.8, 0.34, cz + back, 0.06, 0.52, 0.05, C.iron);
    b.block(cx, 0.58, cz + back, 1.0, 0.1, 0.05, C.wood);
    b.block(cx, 0.76, cz + back, 1.0, 0.1, 0.05, C.woodDark);
    obstacles.push({ x: cx - 0.6, z: cz, r: 0.45 }, { x: cx + 0.6, z: cz, r: 0.45 });
    spots.push({ x: cx, z: cz + facing * 0.95 });
  };
  bench(-5.8, -3.1, 1);
  bench(5.8, -3.1, 1);
  bench(-5.8, 3.1, -1);
  bench(5.8, 3.1, -1);

  // ---- trees ----------------------------------------------------------------------------------
  for (const t of treeSpots) {
    b.block(t.x, 0, t.z, 0.28, 1.5, 0.28, C.trunk);
    b.block(t.x + 0.35, 0, t.z, 0.12, 0.25, 0.3, C.trunk);
    b.block(t.x - 0.3, 0, t.z + 0.2, 0.1, 0.18, 0.2, C.trunk);
    const layers = [
      { y: 1.3, r: 1.5, h: 0.7, c: C.leafC },
      { y: 2.0, r: 1.25, h: 0.65, c: C.leafA },
      { y: 2.65, r: 0.85, h: 0.55, c: C.leafB },
      { y: 3.2, r: 0.45, h: 0.35, c: C.leafB },
    ];
    for (const L of layers) {
      const step = 0.5;
      for (let x = -L.r; x < L.r; x += step) {
        for (let z = -L.r; z < L.r; z += step) {
          if (Math.hypot(x + step / 2, z + step / 2) > L.r) continue;
          const jitter = rnd() * 0.12;
          // Sun-kissed upper-left edge of each layer.
          const sunny = x + step / 2 < -L.r * 0.35 && z + step / 2 > -L.r * 0.2 ? true : rnd() < 0.12;
          const col = sunny ? C.leafSun : rnd() < 0.2 ? C.leafB : L.c;
          leaves.box(t.x + x, L.y, t.z + z, t.x + x + step, L.y + L.h + jitter, t.z + z + step, col, ALL_BUT_BOTTOM);
        }
      }
    }
    // A few fruit / blossoms.
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      leaves.block(t.x + Math.cos(a) * 1.1, 1.75 + rnd() * 0.6, t.z + Math.sin(a) * 1.1, 0.09, 0.18, 0.09, C.petals[i % 2]);
    }
    // Trunk plus the low canopy the sprites would poke into.
    obstacles.push({ x: t.x, z: t.z, r: 0.85 });
    spots.push({ x: t.x + 0.9, z: t.z + 0.9 });
  }

  // ---- flower beds ----------------------------------------------------------------------------
  const bed = (x0: number, z0: number, x1: number, z1: number) => {
    b.box(x0, 0, z0, x1, 0.12, z1, C.soil, ALL_BUT_BOTTOM, C.soilTop);
    // Keep cats out of the flowers: a row of circles along the bed's long axis.
    {
      const w = x1 - x0, d = z1 - z0;
      const r = Math.min(w, d) / 2;
      const long = Math.max(w, d);
      const n = Math.max(1, Math.ceil(long / (r * 1.4)));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        obstacles.push(w >= d ? { x: x0 + w * u, z: (z0 + z1) / 2, r } : { x: (x0 + x1) / 2, z: z0 + d * u, r });
      }
    }
    b.box(x0 - 0.08, 0, z0 - 0.08, x1 + 0.08, 0.16, z0 + 0.04, C.woodDark);
    b.box(x0 - 0.08, 0, z1 - 0.04, x1 + 0.08, 0.16, z1 + 0.08, C.woodDark);
    b.box(x0 - 0.08, 0, z0, x0 + 0.04, 0.16, z1, C.woodDark);
    b.box(x1 - 0.04, 0, z0, x1 + 0.08, 0.16, z1, C.woodDark);
    for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.42) {
      for (let z = z0 + 0.25; z < z1 - 0.1; z += 0.42) {
        const fx = x + (rnd() - 0.5) * 0.15, fz = z + (rnd() - 0.5) * 0.15;
        const hgt = 0.2 + rnd() * 0.22;
        sway.block(fx, 0.12, fz, 0.03, hgt, 0.03, C.leafA);
        sway.block(fx + 0.07, 0.12, fz, 0.06, 0.05, 0.03, C.leafB);
        const pc = C.petals[Math.floor(rnd() * C.petals.length)];
        sway.block(fx, 0.12 + hgt, fz, 0.1, 0.1, 0.1, pc, ALL_BUT_BOTTOM, lighten(pc, 1.1));
        sway.block(fx, 0.12 + hgt + 0.1, fz, 0.035, 0.035, 0.035, 0xffc93c);
      }
    }
  };
  bed(-12.8, -4.4, -9.2, -2.0);
  bed(-12.8, 2.0, -9.2, 4.4);
  bed(9.4, 2.0, 12.8, 4.4);
  bed(10.2, -4.2, 12.8, -2.2);
  bed(-3.6, -9.2, -1.6, -6.4);
  bed(1.6, 6.4, 3.6, 9.2);

  // ---- hedges around the edge (gaps where the paths leave) ---------------------------------
  const hedgeAt = (x0: number, z0: number, x1: number, z1: number) => {
    b.box(x0, 0, z0, x1, 0.75, z1, C.hedge, ALL_BUT_BOTTOM, C.hedgeTop);
    // Bumpy top.
    for (let x = x0; x < x1 - 0.01; x += 0.5) {
      for (let z = z0; z < z1 - 0.01; z += 0.5) {
        if (rnd() < 0.45) b.box(x + 0.05, 0.75, z + 0.05, Math.min(x1, x + 0.45), 0.87 + rnd() * 0.08, Math.min(z1, z + 0.45), rnd() < 0.3 ? C.leafSun : C.hedgeTop);
        else if (rnd() < 0.08) b.block(x + 0.25, 0.75, z + 0.25, 0.06, 0.08, 0.06, C.petals[Math.floor(rnd() * 3)]);
      }
    }
  };
  hedgeAt(-HX - 0.5, -HZ - 0.5, -1.4, -HZ + 0.3);
  hedgeAt(1.4, -HZ - 0.5, HX + 0.5, -HZ + 0.3);
  hedgeAt(-HX - 0.5, HZ - 0.3, -1.4, HZ + 0.5);
  hedgeAt(1.4, HZ - 0.3, HX + 0.5, HZ + 0.5);
  hedgeAt(-HX - 0.5, -HZ + 0.3, -HX + 0.3, -1.4);
  hedgeAt(-HX - 0.5, 1.4, -HX + 0.3, HZ - 0.3);
  hedgeAt(HX - 0.3, -HZ + 0.3, HX + 0.5, -1.4);
  hedgeAt(HX - 0.3, 1.4, HX + 0.5, HZ - 0.3);
  // Gate posts where the paths leave the plaza.
  for (const [gx, gz] of [[-1.25, -HZ], [1.25, -HZ], [-1.25, HZ], [1.25, HZ], [-HX, -1.25], [-HX, 1.25], [HX, -1.25], [HX, 1.25]]) {
    b.block(gx, 0, gz, 0.17, 1.0, 0.17, C.terrace, ALL_BUT_BOTTOM, C.terraceCap);
    b.block(gx, 1.0, gz, 0.22, 0.08, 0.22, C.terraceCap);
    glow.block(gx, 1.08, gz, 0.07, 0.1, 0.07, 0xffc93c);
  }

  // ---- lamp posts -----------------------------------------------------------------------------
  for (const [lx, lz] of [[-3.9, -3.9], [3.9, -3.9], [-3.9, 3.9], [3.9, 3.9]]) {
    b.block(lx, 0, lz, 0.2, 0.12, 0.2, C.iron);
    b.block(lx, 0.12, lz, 0.07, 1.9, 0.07, C.iron);
    b.block(lx, 2.02, lz, 0.2, 0.06, 0.2, C.iron);
    glow.block(lx, 2.08, lz, 0.15, 0.34, 0.15, 0xffe39a);
    b.block(lx, 2.42, lz, 0.22, 0.07, 0.22, C.iron);
    b.block(lx, 2.49, lz, 0.08, 0.1, 0.08, C.iron);
    obstacles.push({ x: lx, z: lz, r: 0.2 });
    lamps.push(new THREE.Vector3(lx, 2.25, lz));
  }

  // ---- cat tower -----------------------------------------------------------------------------
  const tx = 8.2, tz = -6.6;
  b.block(tx, 0, tz, 0.8, 0.18, 0.8, C.carpet, ALL_BUT_BOTTOM, C.carpetTop);
  b.block(tx - 0.35, 0.18, tz - 0.3, 0.13, 1.4, 0.13, C.rope);
  b.block(tx + 0.4, 0.18, tz + 0.35, 0.13, 0.8, 0.13, C.rope);
  b.block(tx + 0.4, 0.98, tz + 0.35, 0.5, 0.14, 0.5, C.carpet, ALL_BUT_BOTTOM, C.carpetTop);
  b.block(tx - 0.35, 1.58, tz - 0.3, 0.55, 0.14, 0.55, C.carpet, ALL_BUT_BOTTOM, C.carpetTop);
  b.block(tx - 0.35, 1.72, tz - 0.3, 0.12, 0.25, 0.12, C.rope);
  b.block(tx + 0.2, 0.98, tz + 0.35, 0.05, 0.2, 0.05, 0xff7aa2);
  obstacles.push({ x: tx, z: tz, r: 0.9 });
  spots.push({ x: tx - 1.2, z: tz + 1.1 });

  // ---- food bowls, yarn, cardboard box --------------------------------------------------------
  const bowl = (x: number, z: number, col: number, food: number) => {
    b.block(x, 0, z, 0.22, 0.1, 0.22, col, ALL_BUT_BOTTOM, lighten(col, 1.15));
    b.block(x, 0.1, z, 0.15, 0.02, 0.15, food);
  };
  bowl(-4.4, 6.6, 0xff7aa2, 0xa0633c);
  bowl(-3.8, 6.9, 0xffc93c, 0xc4e2fc);
  obstacles.push({ x: -4.1, z: 6.75, r: 0.45 });
  spots.push({ x: -4.1, z: 6.0 });
  const yarn = (x: number, z: number, col: number) => {
    b.block(x, 0, z, 0.14, 0.26, 0.14, col, ALL_BUT_BOTTOM, lighten(col, 1.2));
    b.block(x, 0.05, z, 0.18, 0.16, 0.1, col);
    b.block(x, 0.05, z, 0.1, 0.16, 0.18, darken(col, 0.9));
    b.block(x + 0.24, 0, z + 0.05, 0.12, 0.015, 0.015, col);
    obstacles.push({ x, z, r: 0.2 });
  };
  yarn(-7.2, -6.2, 0xff7aa2);
  yarn(6.4, 7.0, 0x9966cc);
  yarn(-1.9, 4.7, 0xc4e2fc);
  // Cardboard box (every cat's favourite).
  const bx = -8.4, bz = 6.9;
  b.box(bx - 0.55, 0, bz - 0.4, bx + 0.55, 0.55, bz + 0.4, 0xc9955c, PX | NX | PZ | NZ);
  b.tile(bx - 0.47, bz - 0.32, bx + 0.47, bz + 0.32, 0.12, 0x6b4a2e);
  b.box(bx - 0.55, 0.55, bz - 0.4, bx + 0.55, 0.6, bz - 0.32, 0xd9a86a);
  b.box(bx - 0.55, 0.55, bz + 0.32, bx + 0.55, 0.6, bz + 0.4, 0xd9a86a);
  b.box(bx - 0.55, 0.55, bz - 0.32, bx - 0.47, 0.6, bz + 0.32, 0xd9a86a);
  b.box(bx + 0.47, 0.55, bz - 0.32, bx + 0.55, 0.6, bz + 0.32, 0xd9a86a);
  b.box(bx - 0.55, 0.55, bz + 0.4, bx + 0.55, 0.62, bz + 0.75, 0xd9a86a, PY | PX | NX | PZ);
  obstacles.push({ x: bx, z: bz, r: 0.65 });

  // ---- the world beyond: meadow, rolling hills and a distant tree line (hazed into the sky) ----
  const frnd = layoutRng(seed * 31 + 5);
  const RANGE = 46;
  const NEAR = 9;
  const inPlaza = (x: number, z: number) => Math.abs(x) < HX + 0.62 && Math.abs(z) < HZ + 0.62;
  for (let x = -RANGE; x < RANGE; x += 2) {
    for (let z = -RANGE; z < RANGE; z += 2) {
      const nearRing = Math.abs(x + 1) < HX + NEAR && Math.abs(z + 1) < HZ + NEAR;
      if (nearRing) {
        // Finer 1-unit meadow tiles close to the terrace, with a few tufts.
        for (let dx = 0; dx < 2; dx++)
          for (let dz = 0; dz < 2; dz++) {
            const tx = x + dx, tz = z + dz;
            if (inPlaza(tx + 0.5, tz + 0.5)) continue;
            const n = frnd();
            far.tile(tx, tz, tx + 1, tz + 1, MEADOW_Y, n < 0.5 ? C.meadowA : n < 0.93 ? C.meadowB : C.meadowC);
            if (n > 0.86) {
              const m = frnd();
              far.block(tx + 0.2 + m * 0.6, MEADOW_Y, tz + 0.8 - m * 0.6, 0.05, 0.1, 0.05, m < 0.3 ? C.petals[Math.floor(m * 20) % 4] : C.meadowC);
            }
          }
        continue;
      }
      const n = frnd();
      far.tile(x, z, x + 2, z + 2, MEADOW_Y, n < 0.5 ? C.meadowA : n < 0.9 ? C.meadowB : C.meadowC);
    }
  }
  // Path continuing out of each gate.
  for (const [x0, z0, x1, z1] of [[-1, -RANGE, 1, -HZ - 0.62], [-1, HZ + 0.62, 1, RANGE], [-RANGE, -1, -HX - 0.62, 1], [HX + 0.62, -1, RANGE, 1]]) {
    far.box(x0 + (x1 - x0 > 3 ? 0 : 0.2), MEADOW_Y, z0 + (z1 - z0 > 3 ? 0 : 0.2), x1 - (x1 - x0 > 3 ? 0 : 0.2), MEADOW_Y + 0.03, z1 - (z1 - z0 > 3 ? 0 : 0.2), C.stoneC, PY);
  }
  const farTree = (x: number, z: number, s: number) => {
    far.block(x, MEADOW_Y, z, 0.18 * s, 0.9 * s, 0.18 * s, C.farTrunk);
    const c = frnd() < 0.5 ? C.farA : C.farB;
    far.block(x, MEADOW_Y + 0.8 * s, z, 0.95 * s, 0.8 * s, 0.95 * s, c, ALL_BUT_BOTTOM, lighten(c, 1.12));
    far.block(x, MEADOW_Y + 1.6 * s, z, 0.62 * s, 0.6 * s, 0.62 * s, c, ALL_BUT_BOTTOM, lighten(c, 1.18));
    if (frnd() < 0.6) far.block(x, MEADOW_Y + 2.2 * s, z, 0.3 * s, 0.35 * s, 0.3 * s, c, ALL_BUT_BOTTOM, lighten(c, 1.22));
  };
  for (let i = 0; i < 160; i++) {
    const a = frnd() * Math.PI * 2;
    const x = Math.cos(a) * (HX + 3 + frnd() * 26);
    const z = Math.sin(a) * (HZ + 3 + frnd() * 24);
    if (Math.abs(x) < 2.2 || Math.abs(z) < 2.2) continue; // keep the paths clear
    // Trees on the camera side (+x / +z) would hide the terrace edge: keep those small and far.
    const front = x > HX || z > HZ;
    const gapX = Math.abs(x) - HX, gapZ = Math.abs(z) - HZ;
    const gap = Math.max(gapX, gapZ);
    if (gap < (front ? 9 : 2.5)) continue;
    farTree(x, z, front ? 0.6 + frnd() * 0.3 : 0.75 + frnd() * 0.8);
  }
  // Low voxel hills far away (steps of boxes).
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + frnd() * 0.3;
    const cx = Math.cos(a) * 40, cz = Math.sin(a) * 34;
    const w = 5 + frnd() * 5;
    for (let k = 0; k < 3; k++) {
      const hw = w * (1 - k * 0.3);
      far.block(cx, MEADOW_Y + k * 0.9, cz, hw, 0.9, hw * 0.7, k === 2 ? C.farA : C.meadowB, ALL_BUT_BOTTOM, lighten(C.meadowA, 1.05));
    }
  }

  // ---- assemble -------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'garden';
  const staticGeo = b.build();
  const staticMesh = new THREE.Mesh(staticGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  staticMesh.name = 'garden-static';
  staticMesh.matrixAutoUpdate = false;
  const swayGeo = sway.build();
  const swayMesh = new THREE.Mesh(swayGeo, windMaterial(uTime, 0.02, 0.32));
  swayMesh.name = 'garden-sway';
  swayMesh.matrixAutoUpdate = false;
  const leafGeo = leaves.build();
  const leafMesh = new THREE.Mesh(leafGeo, windMaterial(uTime, 1.4, 0.035));
  leafMesh.name = 'garden-leaves';
  leafMesh.matrixAutoUpdate = false;
  const glowGeo = glow.build();
  // Lamp glass and gate lights: HDR colour so they catch the bloom (clamped on the low tier).
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.color.setScalar(2.6);
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.name = 'garden-glow';
  glowMesh.matrixAutoUpdate = false;
  const farGeo = far.build();
  const farMesh = new THREE.Mesh(farGeo, hazeMaterial(sky, 1.5, 17));
  farMesh.name = 'garden-far';
  farMesh.matrixAutoUpdate = false;
  group.add(farMesh, staticMesh, swayMesh, leafMesh, glowMesh, water);

  const setShadows = (on: boolean) => {
    staticMesh.castShadow = staticMesh.receiveShadow = on;
    leafMesh.castShadow = on;
    leafMesh.receiveShadow = on;
    swayMesh.receiveShadow = on;
    farMesh.receiveShadow = false;
  };
  setShadows(false);

  return {
    group,
    world: { bounds: { minX: -HX + 0.8, maxX: HX - 0.8, minZ: -HZ + 0.9, maxZ: HZ - 0.9 }, obstacles, spots },
    spout: new THREE.Vector3(0, 2.1, 0),
    water,
    lamps,
    halfX: HX,
    halfZ: HZ,
    triangles: b.triangles + sway.triangles + leaves.triangles + glow.triangles + far.triangles + 32,
    sky,
    update(time: number) {
      uTime.value = time;
    },
    setShadows,
    dispose(keepMaterials = false) {
      for (const m of [staticMesh, swayMesh, leafMesh, glowMesh, farMesh, water]) {
        m.geometry.dispose();
        if (!keepMaterials) (m.material as THREE.Material).dispose();
      }
    },
  };
}

function darken(hex: number, k: number): number {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return c.getHex();
}
function lighten(hex: number, k: number): number {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return c.getHex();
}
