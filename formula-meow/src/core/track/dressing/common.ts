/**
 * Shared dressing helpers (render-only): placement off the road, the start gantry with its banner, canvas text signs,
 * sky dome and stars. Props merge into one GeoBuilder mesh per material.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { cellKey, outerWall, type BuiltBranch, type BuiltTrack } from '../build';
import { nearestSample } from '../query';
import { inWindow } from '../branch';
import type { Theme } from '../themes';
import { GeoBuilder, hash01 } from '../../render/geo';

/**
 * Clearance of (x, z) from the walls of every nearby part of the loop (negative = inside the walls). B14: the
 * nearest sample alone missed an off-road zone's pushed-out wall a few samples further on.
 */
export function clearance(t: BuiltTrack, x: number, z: number): number {
  let best = Infinity;
  for (let cx = -3; cx <= 3; cx++)
    for (let cz = -3; cz <= 3; cz++) {
      const list = t.cells.get(cellKey(x + cx * 8, z + cz * 8));
      if (!list) continue;
      for (const i of list) {
        const dx = x - t.px[i];
        const dz = z - t.pz[i];
        const c = Math.sqrt(dx * dx + dz * dz) - outerWall(t, i) - 0.6;
        if (c < best) best = c;
      }
    }
  if (best === Infinity) {
    const i = nearestSample(t, x, z, -1);
    const dx = x - t.px[i];
    const dz = z - t.pz[i];
    best = Math.sqrt(dx * dx + dz * dz) - outerWall(t, i) - 0.6;
  }
  // alternative routes count as road too
  for (const b of t.branches) {
    if (x < b.minX - 60 || x > b.maxX + 60 || z < b.minZ - 60 || z > b.maxZ + 60) continue;
    for (let j = 0; j < b.m; j += 2) {
      const dx = x - b.px[j];
      const dz = z - b.pz[j];
      const c = Math.sqrt(dx * dx + dz * dz) - Math.max(b.ownL[j], b.ownR[j]) - 0.6;
      if (c < best) best = c;
    }
  }
  return best;
}

/** Deterministic scatter of `count` spots with at least `margin` clearance, within radius `r` of the origin. */
export function scatter(t: BuiltTrack, seed: number, count: number, margin: number, rMin: number, rMax: number): Array<{ x: number; z: number; r: number; k: number }> {
  const out: Array<{ x: number; z: number; r: number; k: number }> = [];
  let tries = 0;
  while (out.length < count && tries < count * 40) {
    tries++;
    const a = hash01(seed * 7919 + tries * 31) * Math.PI * 2;
    const rr = rMin + (rMax - rMin) * Math.sqrt(hash01(seed * 104729 + tries * 17));
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (clearance(t, x, z) < margin) continue;
    if (out.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < margin * margin * 1.5)) continue;
    out.push({ x, z, r: hash01(seed + tries * 13) * Math.PI * 2, k: hash01(seed * 3 + tries * 5) });
  }
  return out;
}

/** A canvas-text sign texture (no font download: the system rounded stack, weight 800, GDD 11). */
export function textTexture(lines: string[], opt: { w: number; h: number; bg: string; fg: string; glow?: string; font?: number }): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = opt.w;
  c.height = opt.h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = opt.bg;
  g.fillRect(0, 0, opt.w, opt.h);
  const size = opt.font ?? Math.floor(opt.h / (lines.length + 0.6));
  g.font = `800 ${size}px ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opt.glow) {
    g.shadowColor = opt.glow;
    g.shadowBlur = size * 0.35;
  }
  g.fillStyle = opt.fg;
  lines.forEach((l, i) => g.fillText(l, opt.w / 2, (opt.h * (i + 0.5)) / lines.length));
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A flat sign (plane with a canvas text texture), centre at (x, y, z), facing yaw `ry`. */
export function sign(lines: string[], w: number, h: number, x: number, y: number, z: number, ry: number, colors: { bg: string; fg: string; glow?: string }): Mesh | null {
  const tex = textTexture(lines, { w: 512, h: Math.round((512 * h) / w), ...colors });
  if (!tex) return null;
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex, toneMapped: false, side: 2 }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

/** The start gantry: two posts and a banner across the start line. */
export function startGantry(t: BuiltTrack, g: GeoBuilder, theme: Theme, group: Group): void {
  const i = 4;
  const hw = outerWall(t, i) + 1.0; // posts clear of the barrier (B14)
  const rx = -t.tz[i];
  const rz = t.tx[i];
  const y = t.py[i];
  const ry = Math.atan2(t.tx[i], t.tz[i]);
  // B59: the beam sits high enough that the portrait chase camera on the grid sees under it, not into it
  const H = 9;
  for (const s of [-1, 1]) {
    g.cylUp(0.35, 0.35, H, 8, theme.wallA, { x: t.px[i] + rx * hw * s, y, z: t.pz[i] + rz * hw * s });
  }
  g.box(hw * 2 + 0.8, 1.6, 0.5, 0x2a1a22, { x: t.px[i], y: y + H, z: t.pz[i], ry });
  const banner = sign(['FORMULA MEOW'], hw * 2, 1.4, t.px[i], y + H, t.pz[i], ry + Math.PI, { bg: '#2a1a22', fg: '#fff3dc', glow: theme.night ? '#ff3ea5' : undefined });
  if (banner) {
    banner.position.x -= t.tx[i] * 0.3;
    banner.position.z -= t.tz[i] * 0.3;
    group.add(banner);
  }
}

/** Gradient sky dome (GDD 11: one gradient sky sphere per theme). */
export function skyDome(theme: Theme): Mesh {
  const mat = new ShaderMaterial({
    uniforms: { uTop: { value: new Color(theme.skyTop) }, uHorizon: { value: new Color(theme.skyHorizon) } },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vP;
      void main(){ float h = clamp(vP.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(uHorizon, uTop, pow(h, 0.7)), 1.0);
      #include <colorspace_fragment>
      }`,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new Mesh(new SphereGeometry(900, 24, 12), mat);
  m.name = 'sky';
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

export function stars(count: number, seed: number): Points {
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = hash01(seed + i * 3) * Math.PI * 2;
    const e = 0.08 + hash01(seed + i * 7) * 1.3;
    const r = 800;
    p[i * 3] = Math.cos(a) * Math.cos(e) * r;
    p[i * 3 + 1] = Math.sin(e) * r;
    p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p, 3));
  const s = new Points(g, new PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }));
  s.name = 'stars';
  s.frustumCulled = false;
  return s;
}

/**
 * Route signs at every branch (iteration 2): an arrow board on two posts in the gore where the branch leaves the
 * main road, readable from the approach, with the branch's name. One sign mesh per branch.
 */
export function branchSigns(t: BuiltTrack, g: GeoBuilder, theme: Theme, group: Group, label: (b: BuiltBranch) => string): void {
  for (const b of t.branches) {
    // the first spot past the fork with room for the board between the roads (else on the branch's far side)
    let j = -1;
    let i = 0;
    let x = 0;
    let z = 0;
    const start = Math.round(b.overlap / b.step);
    for (const far of [false, true]) {
      for (let jj = start; jj < b.m / 2 && j < 0; jj += 4) {
        const ii = nearestSample(t, b.px[jj], b.pz[jj], b.mapI[jj]);
        let dx = t.px[ii] - b.px[jj];
        let dz = t.pz[ii] - b.pz[jj];
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        dx /= dist;
        dz /= dist;
        const off = (Math.max(b.ownL[jj], b.ownR[jj]) + 3.8) * (far ? -1 : 1);
        const cx = b.px[jj] + dx * off;
        const cz = b.pz[jj] + dz * off;
        if (clearance(t, cx, cz) < 3) continue;
        j = jj;
        i = ii;
        x = cx;
        z = cz;
      }
      if (j >= 0) break;
    }
    if (j < 0) continue;
    const y = Math.min(b.py[j], t.py[i]);
    const ry = Math.atan2(b.tx[j], b.tz[j]) + Math.PI;
    for (const s of [-1, 1]) g.cylUp(0.18, 0.18, 4.2, 6, 0x5a4a4a, { x: x + Math.cos(ry) * 1.6 * s, y, z: z - Math.sin(ry) * 1.6 * s });
    g.box(4.4, 1.9, 0.25, theme.accent, { x, y: y + 4.3, z, ry }, { vary: 0 });
    // the arrow points from the main road toward the branch, as seen by a kart coming up to the fork (the board's
    // local +x is on the viewer's right)
    const toward = (b.px[j] - t.px[i]) * Math.cos(ry) - (b.pz[j] - t.pz[i]) * Math.sin(ry) > 0 ? 1 : -1;
    const text = toward > 0 ? `${label(b)}  ▶` : `◀  ${label(b)}`;
    const s = sign([text], 4.1, 1.6, x - Math.sin(ry) * 0.14, y + 4.3, z - Math.cos(ry) * 0.14, ry, { bg: '#fff3dc', fg: '#2a1a22' });
    if (s) group.add(s);
  }
}

/**
 * Slabs under every raised stretch of the main road (a cutting board, a folding table, a mesa top): one box per
 * `every` metres, topped just under the LOWEST road surface over its footprint (a banked turn or a climb never lets a
 * corner poke through the road, B14), skipped where a branch meets the road.
 */
export function raisedDeck(t: BuiltTrack, g: GeoBuilder, opt: { minY: number; color: number; every?: number; inset?: number; vary?: number }): void {
  const slab = opt.every ?? 8.6;
  const reach = Math.ceil(slab / 2 / t.step);
  const stride = Math.round(slab / t.step);
  for (let i = 0; i < t.n; i += stride) {
    if (t.branches.some((b) => inWindow(t, b, i)) || t.voidMask[i]) continue;
    const ry = Math.atan2(t.tx[i], t.tz[i]);
    const w = (outerWall(t, i) + (opt.inset ?? 1.2)) * 2;
    let low = Infinity;
    for (let k = -reach; k <= reach; k++) {
      const j = (i + k + t.n) % t.n;
      low = Math.min(low, t.py[j] - (w / 2) * Math.abs(t.bank[j]));
    }
    if (low < opt.minY) continue;
    g.boxUp(w, low - 0.15, slab + 0.2, opt.color, { x: t.px[i], y: 0, z: t.pz[i], ry }, { vary: opt.vary ?? 0.05 });
  }
}

/** Piers under an elevated branch deck down to `groundY` (rooftop alleys, decks over the floor). */
export function branchSupports(t: BuiltTrack, g: GeoBuilder, groundY: number, color: number): void {
  for (const b of t.branches) {
    for (let j = 0; j < b.m; j += Math.round(9 / b.step)) {
      const top = b.py[j] - 0.3;
      if (top - groundY < 1.2) continue;
      const w = (b.halfW[j] + 1.5) * 2;
      const ry = Math.atan2(b.tx[j], b.tz[j]);
      g.boxUp(w, top - groundY, 2.2, color, { x: b.px[j], y: groundY, z: b.pz[j], ry }, { vary: 0.03 });
    }
  }
}

/** A flat glowing rectangle facing yaw `ry` (displays, neon tubes). */
export function glowQuad(b: { quad(a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], col: number): void }, x: number, y: number, z: number, ry: number, w: number, h: number, col: number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const p = (u: number, v: number): [number, number, number] => [x + u * c, y + v, z - u * s];
  b.quad(p(-w / 2, -h / 2), p(w / 2, -h / 2), p(w / 2, h / 2), p(-w / 2, h / 2), col);
}
