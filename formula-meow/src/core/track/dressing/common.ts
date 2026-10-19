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
import { cellKey, type BuiltTrack } from '../build';
import { nearestSample } from '../query';
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
        const c = Math.sqrt(dx * dx + dz * dz) - Math.max(t.wallL[i], t.wallR[i]) - 0.6;
        if (c < best) best = c;
      }
    }
  if (best < Infinity) return best;
  const i = nearestSample(t, x, z, -1);
  const dx = x - t.px[i];
  const dz = z - t.pz[i];
  return Math.sqrt(dx * dx + dz * dz) - Math.max(t.wallL[i], t.wallR[i]) - 0.6;
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
  const hw = Math.max(t.wallL[i], t.wallR[i]) + 1.0; // posts clear of the barrier (B14)
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
