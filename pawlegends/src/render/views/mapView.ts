/**
 * Purrhaven Crossing (POC.md §5), drawn from src/data/map.ts at load: a painted ground texture (grass, lanes, base
 * plazas, the rat camp clearing, river banks), an animated river, bridges, Catnip Bushes, a forest ring outside the
 * playfield, base banners and the gate barrier. Static scenery only; units and structures have their own views.
 * About 12 draw calls in all. Render only.
 */
import * as THREE from 'three';
import { BUSHES, CORE, FOUNTAIN, LANE_WAYPOINTS, MAP, PUDDING_SPOT, RAT_CAMP, mirrorX } from '../../data/map';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { TEAM } from '../palette';
import { ModelBuilder } from './rig';
import { onPlayfield } from '../../sim/map/grid';

const W = MAP.width / 1000;
const H = MAP.height / 1000;

/** Seeded LCG so the scenery looks the same every load (render only). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Pt = readonly [number, number];

function lanePolylines(): Pt[][] {
  const out: Pt[][] = [];
  for (const lane of ['sunny', 'puddle'] as const) {
    const pts = LANE_WAYPOINTS[lane].map(([x, y]) => [x / 1000, y / 1000] as const);
    const mirrored = pts.map(([x, y]) => [W - x, y] as const).reverse();
    out.push([...pts, ...mirrored.slice(1)]);
  }
  return out;
}

function distToPolyline(x: number, y: number, pl: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pl.length; i++) {
    const [ax, ay] = pl[i];
    const [bx, by] = pl[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

function paintGround(): THREE.Texture {
  const PX = 20;
  const c = document.createElement('canvas');
  c.width = W * PX;
  c.height = H * PX;
  const g = c.getContext('2d')!;
  const X = (x: number): number => x * PX;
  const Y = (y: number): number => (H - y) * PX;
  const rnd = lcg(7);
  // grass
  const grd = g.createLinearGradient(0, 0, c.width, 0);
  grd.addColorStop(0, '#a7d98a');
  grd.addColorStop(0.5, '#9fd383');
  grd.addColorStop(1, '#a3d488');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 0.6 + rnd() * 3.2;
    g.fillStyle = rnd() < 0.5 ? 'rgba(120,180,95,0.16)' : 'rgba(190,230,150,0.16)';
    g.beginPath();
    g.ellipse(X(x), Y(y), r * PX, r * PX * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // grass tufts
  g.strokeStyle = 'rgba(95,150,80,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i < 1600; i++) {
    const x = X(rnd() * W);
    const y = Y(rnd() * H);
    g.beginPath();
    g.moveTo(x - 3, y + 3);
    g.lineTo(x - 1, y - 3);
    g.moveTo(x + 1, y + 3);
    g.lineTo(x + 3, y - 2);
    g.stroke();
  }
  const stroke = (pl: readonly Pt[], width: number, color: string): void => {
    g.strokeStyle = color;
    g.lineWidth = width * PX;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pl.forEach(([x, y], i) => (i === 0 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y))));
    g.stroke();
  };
  const disc = (x: number, y: number, r: number, color: string): void => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(X(x), Y(y), r * PX, 0, Math.PI * 2);
    g.fill();
  };
  // jungle footpaths: core → rat camp → river (both sides)
  const cx = CORE.x / 1000;
  const cy = CORE.y / 1000;
  const rx = RAT_CAMP.x / 1000;
  for (const flip of [false, true]) {
    const f = (x: number): number => (flip ? W - x : x);
    const path: Pt[] = [
      [f(cx), cy],
      [f(rx), RAT_CAMP.y / 1000],
      [f(44), 30],
    ];
    stroke(path, 3.4, '#c9b27c');
    stroke(path, 2.4, '#dcc792');
    disc(f(rx), RAT_CAMP.y / 1000, 5.5, '#cdb784');
    disc(f(rx), RAT_CAMP.y / 1000, 4.6, '#d9c595');
  }
  // lanes
  const lanes = lanePolylines();
  const lw = MAP.laneWidth / 1000;
  for (const pl of lanes) stroke(pl, lw, '#c8a96e');
  for (const pl of lanes) stroke(pl, lw - 1.2, '#e6cf98');
  for (const pl of lanes) stroke(pl, lw * 0.35, 'rgba(240,222,170,0.8)');
  // pebbles on the lanes
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (Math.min(...lanes.map((pl) => distToPolyline(x, y, pl))) > lw / 2 - 0.6) continue;
    disc(x, y, 0.08 + rnd() * 0.12, rnd() < 0.5 ? 'rgba(170,140,95,0.6)' : 'rgba(255,245,215,0.7)');
  }
  // base plazas
  for (const team of [0, 1] as const) {
    const bx = team === 0 ? cx : W - cx;
    const fx = team === 0 ? FOUNTAIN.x / 1000 : W - FOUNTAIN.x / 1000;
    const stone = team === 0 ? '#efe2c9' : '#c9d0e2';
    const edge = team === 0 ? '#d9c3a0' : '#a5b0cc';
    disc(bx, cy, 10.5, edge);
    disc(bx, cy, 9.7, stone);
    g.strokeStyle = edge;
    g.lineWidth = 3;
    for (let r = 4; r < 9.5; r += 2.2) {
      g.beginPath();
      g.arc(X(bx), Y(cy), r * PX, 0, Math.PI * 2);
      g.stroke();
    }
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(X(bx + Math.cos(t) * 4), Y(cy + Math.sin(t) * 4));
      g.lineTo(X(bx + Math.cos(t) * 9.6), Y(cy + Math.sin(t) * 9.6));
      g.stroke();
    }
    disc(fx, FOUNTAIN.y / 1000, FOUNTAIN.radius / 1000 + 1.6, edge);
    disc(fx, FOUNTAIN.y / 1000, FOUNTAIN.radius / 1000 + 1.0, stone);
    // team-coloured paw print in the plaza
    g.fillStyle = team === 0 ? 'rgba(255,111,145,0.35)' : 'rgba(61,90,158,0.35)';
    const px = bx + (team === 0 ? 5.5 : -5.5);
    disc(px, cy - 5.5, 1.2, g.fillStyle as string);
    for (let k = 0; k < 4; k++) disc(px - 1.2 + k * 0.8, cy - 5.5 + 1.5 + (k === 0 || k === 3 ? -0.3 : 0), 0.45, g.fillStyle as string);
  }
  // river banks
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  g.fillStyle = '#e8d6a0';
  g.fillRect(X(r0 - 1.1), 0, (r1 - r0 + 2.2) * PX, c.height);
  g.fillStyle = '#d7c189';
  g.fillRect(X(r0 - 0.4), 0, (r1 - r0 + 0.8) * PX, c.height);
  // bush footprints
  for (const b of BUSHES) {
    for (const x of [b.x, mirrorX(b.x)]) {
      g.fillStyle = 'rgba(70,120,70,0.45)';
      g.beginPath();
      g.ellipse(X(x / 1000), Y(b.y / 1000), (b.w / 1000 / 2 + 0.6) * PX, (b.h / 1000 / 2 + 0.6) * PX, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // flowers
  const petals = ['#ffffff', '#ffd27a', '#ff9fc0', '#c7a6ff'];
  for (let i = 0; i < 520; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (Math.min(...lanes.map((pl) => distToPolyline(x, y, pl))) < lw / 2 + 0.5) continue;
    if (x > r0 - 2 && x < r1 + 2) continue;
    disc(x, y, 0.14 + rnd() * 0.1, petals[(rnd() * petals.length) | 0]);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

const RIVER_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RIVER_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vW;
void main(){
  float edge = min(vUv.x, 1.0 - vUv.x);
  float w1 = sin(vW.z * 0.9 + uTime * 1.6 + sin(vW.x * 1.7) * 1.2);
  float w2 = sin(vW.z * 2.3 - uTime * 2.2 + vW.x * 0.6);
  vec3 deep = vec3(0.30, 0.62, 0.86);
  vec3 lite = vec3(0.56, 0.84, 0.98);
  vec3 col = mix(deep, lite, smoothstep(0.1, 0.5, edge) * 0.25 + 0.35 + 0.18 * w1 + 0.08 * w2);
  float sparkle = smoothstep(0.93, 1.0, sin(vW.z * 3.1 + uTime * 3.0) * sin(vW.x * 4.3 - uTime * 1.3));
  col += sparkle * 0.35;
  float foam = smoothstep(0.09, 0.0, edge);
  col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.85);
  gl_FragColor = vec4(col, smoothstep(0.0, 0.03, edge));
}`;

export interface MapView {
  group: THREE.Group;
  update(frame: ViewFrame | null, dt: number): void;
  setShadows(on: boolean): void;
  dispose(): void;
}

export function createMapView(): MapView {
  const group = new THREE.Group();
  group.name = 'map';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const shadowCasters: THREE.Object3D[] = [];
  const rnd = lcg(11);

  // outside grass
  const outerGeo = keep(new THREE.PlaneGeometry(W + 160, H + 140));
  outerGeo.rotateX(-Math.PI / 2);
  const outer = new THREE.Mesh(outerGeo, keep(new THREE.MeshLambertMaterial({ color: 0x86bf6c })));
  outer.position.set(W / 2, -0.02, -H / 2);
  outer.receiveShadow = true;
  group.add(outer);

  // playfield
  const tex = typeof document !== 'undefined' ? keep(paintGround()) : null;
  const groundGeo = keep(new THREE.PlaneGeometry(W, H));
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, keep(new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex })));
  ground.position.set(W / 2, 0, -H / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // river
  const riverU = { uTime: { value: 0 } };
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  const riverGeo = keep(new THREE.PlaneGeometry(r1 - r0, H + 140, 1, 1));
  riverGeo.rotateX(-Math.PI / 2);
  const river = new THREE.Mesh(
    riverGeo,
    keep(new THREE.ShaderMaterial({ uniforms: riverU, vertexShader: RIVER_VERT, fragmentShader: RIVER_FRAG, transparent: true, depthWrite: false })),
  );
  river.position.set((r0 + r1) / 2, 0.02, -H / 2);
  river.renderOrder = 1;
  group.add(river);

  // scenery built into a few merged meshes (vertex colours, toon lit)
  const sceneryMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const addMerged = (b: ModelBuilder, name: string, cast = true): void => {
    const g = keep(b.build());
    const m = new THREE.Mesh(g, sceneryMat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    if (cast) shadowCasters.push(m);
    group.add(m);
  };

  // pudding island, bridges
  const props = new ModelBuilder();
  props.cyl(6.2, 6.6, 0.08, 0xe8d6a0, { at: [toX(PUDDING_SPOT.x), 0.0, toZ(PUDDING_SPOT.y)] }, 28);
  props.cyl(5.6, 5.6, 0.1, 0xd7c189, { at: [toX(PUDDING_SPOT.x), 0.0, toZ(PUDDING_SPOT.y)] }, 28);
  for (const lane of lanePolylines()) {
    // the lane crosses the river at the middle point (x = 50 m)
    const mid = lane.find(([x]) => Math.abs(x - W / 2) < 0.01) ?? lane[Math.floor(lane.length / 2)];
    const [bx, by] = mid;
    for (let i = 0; i < 12; i++) {
      const x = r0 - 1 + i * ((r1 - r0 + 2) / 11);
      props.box(0.75, 0.08, 7.2, i % 2 ? 0xb07a4a : 0xc08a56, { at: [x, 0.03, -by] });
    }
    for (const s of [-1, 1]) {
      props.box(r1 - r0 + 2.6, 0.18, 0.22, 0x8a5a3a, { at: [bx, 0.75, -(by + s * 3.5)] });
      for (let i = 0; i < 6; i++) props.cyl(0.13, 0.13, 0.9, 0x8a5a3a, { at: [r0 - 1.2 + i * ((r1 - r0 + 2.4) / 5), 0.45, -(by + s * 3.5)] }, 6);
    }
  }
  // base banners
  for (const team of [0, 1] as const) {
    const t = TEAM[team];
    const bx = team === 0 ? CORE.x / 1000 : W - CORE.x / 1000;
    for (const [dx, dy] of [
      [-3, 9.5],
      [3, 9.5],
      [-3, -9.5],
      [3, -9.5],
    ] as const) {
      const x = bx + dx;
      const z = -(CORE.y / 1000 + dy);
      props.cyl(0.09, 0.11, 4.2, 0xfff3dc, { at: [x, 2.1, z] }, 6);
      props.box(1.2, 1.7, 0.06, t.main, { at: [x + 0.6, 3.3, z] });
      props.box(1.2, 0.25, 0.07, t.second, { at: [x + 0.6, 2.4, z] });
      props.sphere(0.16, t.second, { at: [x, 4.3, z] }, 8);
    }
  }
  addMerged(props, 'props');

  // Catnip Bushes
  const bush = new ModelBuilder();
  for (const b of BUSHES) {
    for (const bx of [b.x, mirrorX(b.x)]) {
      const cxm = bx / 1000;
      const cym = b.y / 1000;
      const hw = b.w / 2000;
      const hh = b.h / 2000;
      for (let i = 0; i < 16; i++) {
        const x = cxm + (rnd() * 2 - 1) * hw * 0.85;
        const y = cym + (rnd() * 2 - 1) * hh * 0.88;
        const r = 0.7 + rnd() * 0.45;
        bush.sphere(r, i % 3 ? 0x4f9a5a : 0x5fb06a, { at: [x, 0.45 + rnd() * 0.25, -y], scale: [1, 0.85, 1] }, 9);
      }
      for (let i = 0; i < 12; i++) {
        const x = cxm + (rnd() * 2 - 1) * hw;
        const y = cym + (rnd() * 2 - 1) * hh;
        bush.sphere(0.12, 0xb98cff, { at: [x, 1.15 + rnd() * 0.2, -y] }, 6);
      }
    }
  }
  addMerged(bush, 'bushes', false);

  // forest ring outside the playfield, plus a hedge on the edge
  const trees = new ModelBuilder();
  const tree = (x: number, z: number, s: number): void => {
    trees.cyl(0.25 * s, 0.35 * s, 1.6 * s, 0x8a5a3a, { at: [x, 0.8 * s, z] }, 6);
    const green = [0x5aa35a, 0x4f9a4a, 0x6bb565][(rnd() * 3) | 0];
    trees.add(new THREE.IcosahedronGeometry(1.5 * s, 0), green, { at: [x, 2.3 * s, z] });
    trees.add(new THREE.IcosahedronGeometry(1.05 * s, 0), 0x7cc46e, { at: [x + 0.2 * s, 3.2 * s, z - 0.1 * s] });
  };
  for (let i = 0; i < 260; i++) {
    const side = i % 4;
    let x = 0;
    let y = 0;
    const m = 2.5 + rnd() * 16;
    if (side === 0) {
      x = -m;
      y = rnd() * (H + 30) - 15;
    } else if (side === 1) {
      x = W + m;
      y = rnd() * (H + 30) - 15;
    } else if (side === 2) {
      x = rnd() * (W + 30) - 15;
      y = -m;
    } else {
      x = rnd() * (W + 30) - 15;
      y = H + m;
    }
    if (x > r0 - 2 && x < r1 + 2) continue;
    tree(x, -y, 0.9 + rnd() * 0.7);
  }
  // sim v5: the forest also fills every corner of the map outside the playfield (the same cells the nav grid
  // blocks), so where a hero cannot walk there are trees, and where there are no trees it can.
  const clear = (xm: number, ym: number): boolean => !onPlayfield(Math.round(xm * 1000), Math.round(ym * 1000));
  for (let gx = 1.2; gx < W; gx += 2.6) {
    for (let gy = 1.2; gy < H; gy += 2.6) {
      const x = gx + (rnd() - 0.5) * 1.4;
      const y = gy + (rnd() - 0.5) * 1.4;
      if (!clear(x, y) || !clear(x + 1.3, y) || !clear(x - 1.3, y) || !clear(x, y + 1.3) || !clear(x, y - 1.3)) continue;
      if (x > r0 - 1 && x < r1 + 1) continue;
      tree(x, -y, 0.75 + rnd() * 0.6);
    }
  }
  addMerged(trees, 'forest');

  const hedge = new ModelBuilder();
  const edgeBush = (x: number, y: number): void => {
    if (x > r0 - 1.5 && x < r1 + 1.5) return;
    hedge.sphere(0.7 + rnd() * 0.3, rnd() < 0.5 ? 0x5fa860 : 0x6db86a, { at: [x, 0.4, -y], scale: [1.2, 0.8, 1.2] }, 8);
  };
  for (let x = 0; x <= W; x += 1.6) {
    edgeBush(x, -0.8);
    edgeBush(x, H + 0.8);
  }
  for (let y = 0; y <= H; y += 1.6) {
    edgeBush(-0.8, y);
    edgeBush(W + 0.8, y);
  }
  // rocks dotted around the rat camps and the river banks
  for (let i = 0; i < 26; i++) {
    const flip = i % 2 === 0;
    const a = rnd() * Math.PI * 2;
    const d = 5.5 + rnd() * 1.5;
    const x0 = RAT_CAMP.x / 1000 + Math.cos(a) * d;
    const y0 = RAT_CAMP.y / 1000 + Math.sin(a) * d;
    hedge.add(new THREE.DodecahedronGeometry(0.4 + rnd() * 0.4, 0), 0xb9b2a6, { at: [flip ? W - x0 : x0, 0.15, -y0], rot: [rnd(), rnd(), rnd()] });
  }
  addMerged(hedge, 'hedge', false);

  // gate barriers (up for the first 10 s)
  const gateMat = keep(
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  const gateGeo = keep(new THREE.PlaneGeometry(H, 2.4));
  const gates: THREE.Mesh[] = [];
  for (const x of [MAP.barrierX / 1000, W - MAP.barrierX / 1000]) {
    const m = new THREE.Mesh(gateGeo, gateMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(x, 1.2, -H / 2);
    gates.push(m);
    group.add(m);
  }

  let time = 0;
  return {
    group,
    update(frame, dt) {
      time += dt;
      riverU.uTime.value = time;
      const up = !frame || frame.latest.clock.phase === 'gate';
      gateMat.opacity = up ? 0.28 + Math.sin(time * 4) * 0.08 : Math.max(0, gateMat.opacity - dt);
      for (const g of gates) g.visible = gateMat.opacity > 0.01;
    },
    setShadows(on) {
      for (const m of shadowCasters) m.castShadow = on;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
