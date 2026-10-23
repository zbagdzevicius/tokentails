// Shared set-piece kit: materials, merged vertex-coloured geometries, canvas textures and small helpers.
// SETPIECES lane. Everything here is built lazily on first use and shared by every piece instance
// (geometry.userData.shared = true so core never disposes it on despawn).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { placeOnTrack } from '../core/place';
import type { PieceCtx } from '../core/types';

// ---------------------------------------------------------------- helpers
export const shared = <T extends THREE.BufferGeometry>(g: T): T => {
  g.userData.shared = true;
  return g;
};
export const num = (ctx: PieceCtx, k: string, d: number): number => {
  const v = ctx.spec.params?.[k];
  return typeof v === 'number' ? v : d;
};
export const str = (ctx: PieceCtx, k: string, d: string): string => {
  const v = ctx.spec.params?.[k];
  return typeof v === 'string' ? v : d;
};
const lazy = <T>(make: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};

/** paint a geometry with one vertex colour (for merging) */
function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (ng.attributes.uv) ng.deleteAttribute('uv');
  return ng;
}
/** merge painted parts into one shared geometry */
function merged(parts: [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map(([geo, c]) => paint(geo, c)));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return shared(g);
}
/** jitter vertices (rocks, bushes) deterministically */
function lumpy(g: THREE.BufferGeometry, amt: number, seed: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.7 + seed * 0.3);
    v.multiplyScalar(1 + n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function mesh(ctx: PieceCtx, geo: THREE.BufferGeometry, mat: THREE.Material, s: number, x = 0, y = 0, upright = false, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow && ctx.quality === 'high';
  m.receiveShadow = false;
  placeOnTrack(m, ctx.track, s, x, y, upright);
  ctx.group.add(m);
  return m;
}

// ---------------------------------------------------------------- materials
export const MAT = {
  vc: lazy(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 })),
  vcShiny: lazy(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15, emissive: 0x112233, emissiveIntensity: 0.6 })),
  gold: lazy(() => new THREE.MeshStandardMaterial({ color: 0xffc41f, roughness: 0.28, metalness: 0.65, emissive: 0x8a5200, emissiveIntensity: 0.55 })),
  goldGlow: lazy(() => new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })),
  halo: lazy(() => new THREE.SpriteMaterial({ map: TEX.halo(), color: 0xffd35a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 })),
  haloBlue: lazy(() => new THREE.SpriteMaterial({ map: TEX.halo(), color: 0x7fe3ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 })),
  beam: lazy(() => new THREE.MeshBasicMaterial({ map: TEX.beam(), color: 0xffd060, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide })),
  yarn: lazy(() => new THREE.MeshStandardMaterial({ map: TEX.yarn(), roughness: 0.95 })),
  yarnBig: lazy(() => new THREE.MeshStandardMaterial({ map: TEX.yarnBig(), roughness: 0.95 })),
  bark: lazy(() => new THREE.MeshStandardMaterial({ map: TEX.bark(), roughness: 0.95 })),
  logEnd: lazy(() => new THREE.MeshStandardMaterial({ map: TEX.rings(), roughness: 0.9 })),
  foam: lazy(() => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })),
  warn: lazy(() => new THREE.MeshBasicMaterial({ map: TEX.chevrons(), color: 0xff5a3c, transparent: true, depthWrite: false, opacity: 0.0, side: THREE.DoubleSide })),
  dots: lazy(() => new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })),
  pad: lazy(() => new THREE.MeshBasicMaterial({ map: TEX.paw(), color: 0xffb347, transparent: true, depthWrite: false, opacity: 0.95 })),
};
const signMats = new Map<string, THREE.MeshStandardMaterial>();
export function signMat(icon: string): THREE.MeshStandardMaterial {
  let m = signMats.get(icon);
  if (!m) signMats.set(icon, (m = new THREE.MeshStandardMaterial({ map: TEX.sign(icon), roughness: 0.9 })));
  return m;
}
const bannerMats = new Map<string, THREE.MeshStandardMaterial>();
export function bannerMat(text: string): THREE.MeshStandardMaterial {
  let m = bannerMats.get(text);
  if (!m) bannerMats.set(text, (m = new THREE.MeshStandardMaterial({ map: TEX.banner(text), roughness: 0.85, side: THREE.DoubleSide })));
  return m;
}

// ---------------------------------------------------------------- canvas textures
function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  draw(el.getContext('2d')!);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function pawPath(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.ellipse(x, y + r * 0.35, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
  for (const [dx, dy] of [[-0.62, -0.32], [-0.22, -0.72], [0.22, -0.72], [0.62, -0.32]]) {
    c.moveTo(x + dx * r + r * 0.2, y + dy * r);
    c.ellipse(x + dx * r, y + dy * r, r * 0.2, r * 0.26, 0, 0, Math.PI * 2);
  }
  c.fill();
}
export const TEX = {
  halo: lazy(() =>
    canvas(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    }),
  ),
  beam: lazy(() =>
    canvas(16, 128, (c) => {
      const g = c.createLinearGradient(0, 128, 0, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.0)');
      g.addColorStop(0.15, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0.0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 16, 128);
    }),
  ),
  yarn: lazy(() =>
    canvas(
      128,
      64,
      (c) => {
        c.fillStyle = '#ff6fae';
        c.fillRect(0, 0, 128, 64);
        c.lineWidth = 3;
        for (let i = 0; i < 26; i++) {
          c.strokeStyle = i % 3 === 0 ? '#ffb3d4' : i % 3 === 1 ? '#e04a8c' : '#ff8cc0';
          c.beginPath();
          const y = (i * 37) % 64;
          c.moveTo(0, y);
          c.bezierCurveTo(40, y - 18, 88, y + 18, 128, y);
          c.stroke();
        }
      },
      true,
    ),
  ),
  yarnBig: lazy(() =>
    canvas(
      256,
      128,
      (c) => {
        // hot pink and teal: it must pop off the orange sunset dirt
        c.fillStyle = '#ff4f9a';
        c.fillRect(0, 0, 256, 128);
        c.lineWidth = 5;
        for (let i = 0; i < 40; i++) {
          c.strokeStyle = i % 4 === 0 ? '#ffd1e6' : i % 4 === 1 ? '#b8125f' : i % 4 === 2 ? '#3fd6c8' : '#ff86bd';
          c.beginPath();
          const y = (i * 29) % 128;
          c.moveTo(0, y);
          c.bezierCurveTo(80, y - 40, 170, y + 40, 256, y);
          c.stroke();
        }
      },
      true,
    ),
  ),
  bark: lazy(() =>
    canvas(
      128,
      64,
      (c) => {
        c.fillStyle = '#8a5a32';
        c.fillRect(0, 0, 128, 64);
        for (let i = 0; i < 40; i++) {
          c.fillStyle = i % 2 ? '#6e4423' : '#a0703f';
          c.fillRect((i * 53) % 128, (i * 17) % 64, 3 + (i % 4) * 4, 2 + (i % 3));
        }
        c.strokeStyle = '#5a3519';
        c.lineWidth = 2;
        for (let x = 6; x < 128; x += 14) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x + 3, 64);
          c.stroke();
        }
      },
      true,
    ),
  ),
  rings: lazy(() =>
    canvas(64, 64, (c) => {
      c.fillStyle = '#e8c48e';
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#b98a52';
      c.lineWidth = 2;
      for (let r = 5; r < 30; r += 6) {
        c.beginPath();
        c.arc(32, 32, r, 0, Math.PI * 2);
        c.stroke();
      }
      c.strokeStyle = '#6e4423';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(32, 32, 30, 0, Math.PI * 2);
      c.stroke();
    }),
  ),
  chevrons: lazy(() =>
    canvas(
      64,
      64,
      (c) => {
        c.clearRect(0, 0, 64, 64);
        c.fillStyle = 'rgba(255,255,255,0.18)';
        c.fillRect(0, 0, 64, 64);
        c.fillStyle = 'rgba(255,255,255,0.95)';
        c.beginPath();
        c.moveTo(8, 40);
        c.lineTo(32, 16);
        c.lineTo(56, 40);
        c.lineTo(56, 54);
        c.lineTo(32, 30);
        c.lineTo(8, 54);
        c.closePath();
        c.fill();
      },
      true,
    ),
  ),
  paw: lazy(() =>
    canvas(128, 128, (c) => {
      c.clearRect(0, 0, 128, 128);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.arc(64, 64, 60, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,1)';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(64, 64, 56, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,1)';
      pawPath(c, 64, 70, 36);
    }),
  ),
  sign: (icon: string) =>
    canvas(128, 128, (c) => {
      // wooden board with a painted icon
      c.fillStyle = '#c98e52';
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#b07a42';
      for (let y = 0; y < 128; y += 32) c.fillRect(0, y + 29, 128, 3);
      c.strokeStyle = '#6e4423';
      c.lineWidth = 8;
      c.strokeRect(4, 4, 120, 120);
      c.fillStyle = icon === 'water' || icon === 'dog' || icon === 'yarn' || icon === 'warn' ? '#e8432e' : '#fff6e0';
      c.strokeStyle = '#3a2410';
      c.lineWidth = 5;
      c.lineJoin = 'round';
      const shape = () => {
        c.beginPath();
        if (icon === 'left' || icon === 'right') {
          const d = icon === 'left' ? -1 : 1;
          c.moveTo(64 - 40 * d, 52);
          c.lineTo(64 + 6 * d, 52);
          c.lineTo(64 + 6 * d, 28);
          c.lineTo(64 + 44 * d, 64);
          c.lineTo(64 + 6 * d, 100);
          c.lineTo(64 + 6 * d, 76);
          c.lineTo(64 - 40 * d, 76);
        } else if (icon === 'jump' || icon === 'up') {
          c.moveTo(64, 18);
          c.lineTo(104, 62);
          c.lineTo(78, 62);
          c.lineTo(78, 108);
          c.lineTo(50, 108);
          c.lineTo(50, 62);
          c.lineTo(24, 62);
        } else if (icon === 'slide') {
          c.moveTo(64, 110);
          c.lineTo(104, 66);
          c.lineTo(78, 66);
          c.lineTo(78, 20);
          c.lineTo(50, 20);
          c.lineTo(50, 66);
          c.lineTo(24, 66);
        } else {
          // warning triangle
          c.moveTo(64, 14);
          c.lineTo(116, 108);
          c.lineTo(12, 108);
        }
        c.closePath();
      };
      shape();
      c.fill();
      c.stroke();
      if (icon === 'warn' || icon === 'water' || icon === 'dog' || icon === 'yarn') {
        c.fillStyle = '#fff6e0';
        if (icon === 'warn') {
          c.font = 'bold 60px sans-serif';
          c.textAlign = 'center';
          c.fillText('!', 64, 98);
        } else if (icon === 'water') {
          c.beginPath();
          c.moveTo(64, 46);
          c.quadraticCurveTo(84, 76, 64, 92);
          c.quadraticCurveTo(44, 76, 64, 46);
          c.fill();
        } else if (icon === 'yarn') {
          c.beginPath();
          c.arc(64, 78, 18, 0, Math.PI * 2);
          c.fill();
        } else pawPath(c, 64, 80, 20);
      }
      if (icon === 'vault' || icon === 'paw') {
        c.fillStyle = '#ff8a2a';
        pawPath(c, 64, 66, 40);
      }
    }),
  banner: (text: string) =>
    canvas(512, 128, (c) => {
      // checker trims and bold text
      c.fillStyle = '#fff3d6';
      c.fillRect(0, 0, 512, 128);
      for (let x = 0; x < 512; x += 16)
        for (const y of [0, 112]) {
          c.fillStyle = ((x / 16 + y / 16) & 1) === 0 ? '#e8432e' : '#fff3d6';
          c.fillRect(x, y, 16, 16);
        }
      c.fillStyle = '#ff8a2a';
      pawPath(c, 50, 66, 26);
      pawPath(c, 462, 66, 26);
      c.font = 'bold 66px "Trebuchet MS", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 10;
      c.strokeStyle = '#3a2410';
      c.strokeText(text, 256, 66);
      c.fillStyle = '#ffd23f';
      c.fillText(text, 256, 66);
    }),
  pennant: lazy(() =>
    canvas(64, 64, (c) => {
      c.fillStyle = '#ff8a2a';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#fff6e0';
      pawPath(c, 22, 34, 12);
    }),
  ),
};

// ---------------------------------------------------------------- geometries
export const GEO = {
  /** fish snack: body along +z, tail at -z, centred */
  fish: lazy(() => {
    const body = new THREE.SphereGeometry(0.22, 14, 10).scale(0.75, 1, 1.9);
    const belly = new THREE.SphereGeometry(0.2, 12, 8).scale(0.7, 0.6, 1.6).translate(0, -0.06, 0.02);
    const tail = new THREE.ConeGeometry(0.22, 0.34, 4).scale(0.25, 1.4, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    const fin = new THREE.ConeGeometry(0.1, 0.22, 4).scale(0.2, 1, 1.2).translate(0, 0.24, -0.02);
    const eyeL = new THREE.SphereGeometry(0.05, 6, 5).translate(0.13, 0.06, 0.26);
    const eyeR = new THREE.SphereGeometry(0.05, 6, 5).translate(-0.13, 0.06, 0.26);
    return merged([
      [body, 0x4fb8ff],
      [belly, 0xd8f4ff],
      [tail, 0x2a86e0],
      [fin, 0x2a86e0],
      [eyeL, 0x10202e],
      [eyeR, 0x10202e],
    ]);
  }),
  /** golden bell: lathe profile, open at the bottom */
  bell: lazy(() => {
    const pts: THREE.Vector2[] = [];
    const prof = [
      [0.0, 0.62],
      [0.1, 0.6],
      [0.22, 0.52],
      [0.3, 0.36],
      [0.34, 0.16],
      [0.4, 0.02],
      [0.46, -0.06],
      [0.44, -0.1],
      [0.36, -0.06],
    ];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 20);
    const knob = new THREE.TorusGeometry(0.09, 0.035, 6, 12).translate(0, 0.7, 0);
    const clap = new THREE.SphereGeometry(0.1, 8, 6).translate(0, -0.1, 0);
    const band = new THREE.TorusGeometry(0.33, 0.03, 6, 20).rotateX(Math.PI / 2).translate(0, 0.14, 0);
    const g2 = mergeGeometries([g, knob, clap, band].map((x) => { const n = x.index ? x.toNonIndexed() : x; n.deleteAttribute('uv'); return n; }));
    g2.computeVertexNormals();
    return shared(g2);
  }),
  /** the red bow on top of the bell */
  bow: lazy(() => {
    const l = new THREE.ConeGeometry(0.12, 0.24, 4).rotateZ(Math.PI / 2).translate(-0.13, 0, 0);
    const r = new THREE.ConeGeometry(0.12, 0.24, 4).rotateZ(-Math.PI / 2).translate(0.13, 0, 0);
    const k = new THREE.SphereGeometry(0.06, 6, 5);
    const t1 = new THREE.BoxGeometry(0.05, 0.22, 0.02).rotateZ(0.4).translate(-0.06, -0.14, 0);
    const t2 = new THREE.BoxGeometry(0.05, 0.22, 0.02).rotateZ(-0.4).translate(0.06, -0.14, 0);
    return merged([
      [l, 0xe8322e],
      [r, 0xe8322e],
      [k, 0xc4201c],
      [t1, 0xe8322e],
      [t2, 0xe8322e],
    ]);
  }),
  yarnBall: lazy(() => shared(new THREE.SphereGeometry(0.36, 16, 12))),
  yarnTail: lazy(() => {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0.3, -0.2, 0), new THREE.Vector3(0.55, -0.32, 0.1), new THREE.Vector3(0.75, -0.3, -0.1), new THREE.Vector3(0.95, -0.36, 0)]);
    return shared(new THREE.TubeGeometry(c, 12, 0.035, 5, false));
  }),
  treat: lazy(() => {
    // a heart cookie with icing dots
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.28);
    sh.bezierCurveTo(-0.08, -0.2, -0.34, -0.04, -0.3, 0.12);
    sh.bezierCurveTo(-0.26, 0.28, -0.06, 0.3, 0, 0.16);
    sh.bezierCurveTo(0.06, 0.3, 0.26, 0.28, 0.3, 0.12);
    sh.bezierCurveTo(0.34, -0.04, 0.08, -0.2, 0, -0.28);
    const cookie = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.05);
    const icing = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 10 }).scale(0.72, 0.72, 1).translate(0, 0.01, 0.08);
    const d1 = new THREE.SphereGeometry(0.03, 5, 4).translate(-0.1, 0.08, 0.11);
    const d2 = new THREE.SphereGeometry(0.03, 5, 4).translate(0.09, 0.04, 0.11);
    const d3 = new THREE.SphereGeometry(0.03, 5, 4).translate(0, -0.08, 0.11);
    return merged([
      [cookie, 0xd9954a],
      [icing, 0xff8fbf],
      [d1, 0xffffff],
      [d2, 0x7fe3ff],
      [d3, 0xffe27a],
    ]);
  }),
  ring: lazy(() => shared(new THREE.TorusGeometry(1.35, 0.13, 8, 32))),
  ringInner: lazy(() => shared(new THREE.TorusGeometry(1.35, 0.05, 6, 32))),
  /** log: bark cylinder along x, unit length, radius 0.45 (+ end caps separately) */
  log: lazy(() => {
    const g = new THREE.CylinderGeometry(0.45, 0.45, 1, 14, 1, true).rotateZ(Math.PI / 2);
    // uv repeat around and along
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 1);
    return shared(g);
  }),
  logCap: lazy(() => shared(new THREE.CircleGeometry(0.45, 14))),
  stub: lazy(() => merged([[new THREE.CylinderGeometry(0.1, 0.14, 0.5, 6).rotateZ(1.1).translate(0, 0.2, 0), 0x7a4b26], [new THREE.IcosahedronGeometry(0.22, 0).translate(0.28, 0.42, 0), 0x6fbf3a]])),
  rocks: lazy(() =>
    [0, 1, 2].map((k) => {
      const g = lumpy(new THREE.DodecahedronGeometry(1, 1), 0.22, k * 2.3 + 1);
      g.scale(1, 0.78, 1);
      const c = new THREE.Color();
      const ng = g.index ? g.toNonIndexed() : g;
      const pp = ng.attributes.position;
      const cc = new Float32Array(pp.count * 3);
      for (let i = 0; i < pp.count; i++) {
        const y = pp.getY(i);
        c.setHex(y > 0.42 ? 0x8cbf4a : y > 0.05 ? 0xc9a77c : 0xa8865e);
        cc[i * 3] = c.r;
        cc[i * 3 + 1] = c.g;
        cc[i * 3 + 2] = c.b;
      }
      ng.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      ng.computeVertexNormals();
      return shared(ng);
    }),
  ),
  riverRock: lazy(() => {
    const g = lumpy(new THREE.DodecahedronGeometry(1, 1), 0.25, 7).scale(1, 0.7, 1);
    const p = g.attributes.position;
    const cc = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      c.setHex(p.getY(i) > 0.35 ? 0x9a9a8c : 0x6e6e66);
      cc[i * 3] = c.r;
      cc[i * 3 + 1] = c.g;
      cc[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.computeVertexNormals();
    return shared(g);
  }),
  foamRing: lazy(() => shared(new THREE.RingGeometry(0.85, 1.35, 24).rotateX(-Math.PI / 2))),
  /** leafy clump (branches, bushes) */
  leaves: lazy(() => {
    const parts: [THREE.BufferGeometry, number][] = [];
    const cols = [0x5fae3a, 0x77c447, 0x4c9a30];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.7;
      parts.push([lumpy(new THREE.IcosahedronGeometry(0.42 + (i % 3) * 0.1, 1), 0.15, i).translate(Math.cos(a) * 0.45, Math.sin(i * 2.1) * 0.18, Math.sin(a) * 0.3), cols[i % 3]]);
    }
    return merged(parts);
  }),
  trunk: lazy(() => merged([[new THREE.CylinderGeometry(0.28, 0.4, 1, 8).translate(0, 0.5, 0), 0x7a4b26]])),
  bough: lazy(() => {
    // a slightly bent branch along x, unit length
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, -0.04, 0), new THREE.Vector3(-0.2, 0.03, 0.02), new THREE.Vector3(0.15, 0.02, -0.02), new THREE.Vector3(0.5, -0.05, 0)]);
    return merged([[new THREE.TubeGeometry(c, 16, 0.17, 8, false), 0x80522c]]);
  }),
  post: lazy(() => merged([[new THREE.CylinderGeometry(0.09, 0.11, 1, 6).translate(0, 0.5, 0), 0x8a5a32]])),
  stakeStriped: lazy(() => {
    const parts: [THREE.BufferGeometry, number][] = [];
    for (let i = 0; i < 4; i++) parts.push([new THREE.CylinderGeometry(0.08, 0.08, 0.3, 6).translate(0, 0.15 + i * 0.3, 0), i % 2 ? 0xffffff : 0xff5a3c]);
    parts.push([new THREE.SphereGeometry(0.11, 6, 5).translate(0, 1.25, 0), 0xffd23f]);
    return merged(parts);
  }),
  board: lazy(() => shared(new THREE.BoxGeometry(1, 1, 0.08))),
  plane: lazy(() => shared(new THREE.PlaneGeometry(1, 1))),
  disc: lazy(() => shared(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2))),
  dot: lazy(() => shared(new THREE.SphereGeometry(0.12, 6, 5))),
  beam: lazy(() => shared(new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, true).translate(0, 0.5, 0))),
  pennant: lazy(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.5, 0, -0.9, -0.25, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0.5], 2));
    g.computeVertexNormals();
    return shared(g);
  }),
  bamboo: lazy(() => {
    const parts: [THREE.BufferGeometry, number][] = [];
    for (let i = 0; i < 7; i++) {
      parts.push([new THREE.CylinderGeometry(0.13, 0.14, 0.95, 7).translate(0, 0.5 + i, 0), i % 2 ? 0x7cc04a : 0x8fd05a]);
      parts.push([new THREE.CylinderGeometry(0.16, 0.16, 0.08, 7).translate(0, 1 + i, 0), 0x5f9a34]);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      parts.push([new THREE.ConeGeometry(0.16, 1.1, 3).scale(1, 1, 0.2).rotateZ(1.1).rotateY(a).translate(Math.cos(a) * 0.35, 5.6 + i * 0.4, Math.sin(a) * 0.35), 0x6fbf3a]);
    }
    return merged(parts);
  }),
  hay: lazy(() => {
    const g = new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14).rotateZ(Math.PI / 2);
    const b1 = new THREE.TorusGeometry(0.91, 0.04, 4, 16).rotateY(Math.PI / 2).translate(0.4, 0, 0);
    const b2 = new THREE.TorusGeometry(0.91, 0.04, 4, 16).rotateY(Math.PI / 2).translate(-0.4, 0, 0);
    return merged([
      [g, 0xe8c25a],
      [b1, 0xb5452a],
      [b2, 0xb5452a],
    ]);
  }),
};

/** shared puddle water material (animated ripples, unlit toon water) */
export const puddleMat = lazy(
  () =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float time;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p);
          float edge = smoothstep(1.0, 0.86, r);
          float rim = smoothstep(0.7, 0.92, r) * edge;
          float rip = smoothstep(0.06, 0.0, abs(fract(r * 2.2 - time * 0.6) - 0.5) - 0.38) * (1.0 - r);
          vec3 deep = vec3(0.23, 0.56, 0.86); vec3 lite = vec3(0.62, 0.86, 1.0);
          vec3 c = mix(deep, lite, rim * 0.8 + rip * 0.6);
          float hl = smoothstep(0.18, 0.0, length(p - vec2(-0.35, 0.3))) * 0.8;
          c = mix(c, vec3(1.0), hl);
          gl_FragColor = vec4(c, edge * 0.92);
        }`,
    }),
);
/** shared rapid / foam band material (scrolling white foam) */
export const foamBandMat = lazy(
  () =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float time;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float v = n(vec2(vUv.x * 14.0, vUv.y * 4.0 - time * 3.0)) * 0.6 + n(vec2(vUv.x * 30.0 + time, vUv.y * 9.0 - time * 5.0)) * 0.4;
          float band = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float a = smoothstep(0.35, 0.6, v) * band;
          gl_FragColor = vec4(mix(vec3(0.75, 0.93, 1.0), vec3(1.0), a), max(a, band * 0.35) * 0.95);
        }`,
    }),
);

/** shared ticking clock for shader uniforms (advanced by pieces' update, once per step) */
let lastTick = -1;
export function tickShared(t: number): void {
  if (t === lastTick) return;
  lastTick = t;
  if (puddleUsed) puddleMat().uniforms.time.value = t;
  if (foamUsed) foamBandMat().uniforms.time.value = t;
}
let puddleUsed = false;
let foamUsed = false;
export const usePuddle = () => ((puddleUsed = true), puddleMat());
export const useFoam = () => ((foamUsed = true), foamBandMat());

export const rockGeo = (i: number) => GEO.rocks()[Math.abs(Math.floor(i)) % 3];
