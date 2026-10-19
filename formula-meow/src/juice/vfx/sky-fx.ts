/**
 * Per-theme sky and ambience (GDD 6.1, 11): the "vibe" layer on top of the core sky dome.
 *  - a celestial billboard drawn on a canvas (no image files): Kitchen = a warm window sun with rays, Rooftops = a
 *    huge pink-rimmed moon with a cat sitting on the edge, Laundry = a soft bubble sun, Yarn Canyon = a striped
 *    synthwave sunset sun
 *  - one Points cloud of ambient particles that wraps around the camera: dust motes, neon fireflies, bubbles, fluff
 *  - Rooftops only: two sweeping searchlights behind the skyline
 * At most 3 draw calls; the particle count follows the quality tier.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  NormalBlending,
  Object3D,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import type { BuiltTrack } from '../../core/track/build';
import type { Theme } from '../../core/track/themes';

const _o = new Object3D();

function drawCelestial(themeId: number, theme: Theme): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  const cx = S / 2;
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const glow = (r: number, col: string, a: number) => {
    const gr = g.createRadialGradient(cx, cx, 0, cx, cx, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a;
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.globalAlpha = 1;
  };
  if (themeId === 1) {
    // moon + sitting cat silhouette on its rim
    glow(S / 2, hex(theme.neonA || 0xff3ea5), 0.55);
    g.fillStyle = '#ffe9f4';
    g.beginPath();
    g.arc(cx, cx, S * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,170,210,0.35)';
    for (const [x, y, r] of [
      [-0.08, -0.06, 0.05],
      [0.1, 0.05, 0.035],
      [-0.02, 0.12, 0.03],
    ])
      g.beginPath(), g.arc(cx + x * S, cx + y * S, r * S, 0, Math.PI * 2), g.fill();
    // the cat: body, head, ears, tail curling over the moon
    g.fillStyle = '#120a24';
    const by = cx + S * 0.2;
    const bx = cx + S * 0.06;
    g.beginPath();
    g.ellipse(bx, by, S * 0.075, S * 0.095, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(bx, by - S * 0.11, S * 0.05, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(bx + s * S * 0.045, by - S * 0.13);
      g.lineTo(bx + s * S * 0.03, by - S * 0.185);
      g.lineTo(bx + s * S * 0.008, by - S * 0.145);
      g.fill();
    }
    g.lineWidth = S * 0.022;
    g.lineCap = 'round';
    g.strokeStyle = '#120a24';
    g.beginPath();
    g.moveTo(bx - S * 0.06, by + S * 0.07);
    g.bezierCurveTo(bx - S * 0.2, by + S * 0.1, bx - S * 0.2, by - S * 0.05, bx - S * 0.13, by - S * 0.07);
    g.stroke();
  } else if (themeId === 3) {
    // synthwave sunset: gradient disc cut by horizontal stripes
    glow(S / 2, '#ff8a3d', 0.6);
    const gr = g.createLinearGradient(0, cx - S * 0.3, 0, cx + S * 0.3);
    gr.addColorStop(0, '#ffe066');
    gr.addColorStop(0.55, '#ff6b3d');
    gr.addColorStop(1, '#ff2e88');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cx, S * 0.3, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = cx + S * (0.02 + i * 0.04);
      g.fillRect(0, y, S, S * (0.006 + i * 0.004));
    }
    g.globalCompositeOperation = 'source-over';
  } else {
    // day sun (kitchen window / laundry): bright core, soft rays
    glow(S / 2, themeId === 0 ? '#fff1c4' : '#ffffff', 0.85);
    g.save();
    g.translate(cx, cx);
    g.fillStyle = themeId === 0 ? 'rgba(255,230,160,0.35)' : 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath();
      g.moveTo(-S * 0.025, S * 0.12);
      g.lineTo(S * 0.025, S * 0.12);
      g.lineTo(0, S * 0.46);
      g.fill();
    }
    g.restore();
    g.fillStyle = themeId === 0 ? '#fffbe8' : '#ffffff';
    g.beginPath();
    g.arc(cx, cx, S * 0.16, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface AmbientLook {
  count: number;
  colors: number[];
  size: number;
  /** drift velocity (m/s) */
  vy: number;
  additive: boolean;
  /** 0 soft dot, 1 bubble ring */
  shape: number;
  twinkle: number;
}

function ambientFor(themeId: number, theme: Theme): AmbientLook {
  switch (themeId) {
    case 1:
      return { count: 260, colors: [theme.neonA || 0xff3ea5, theme.neonB || 0x2cf6f3, 0xb07fd8], size: 0.22, vy: 0.25, additive: true, shape: 0, twinkle: 1 };
    case 2:
      return { count: 140, colors: [0xffffff, 0xbfe3f5, 0xffc4dc], size: 0.7, vy: 0.6, additive: false, shape: 1, twinkle: 0 };
    case 3:
      return { count: 180, colors: [0xffd0a0, 0xff8a3d, 0xffe0a0], size: 0.18, vy: -0.1, additive: true, shape: 0, twinkle: 0.4 };
    default:
      return { count: 200, colors: [0xfff3dc, 0xffd27a, 0xffffff], size: 0.12, vy: 0.08, additive: true, shape: 0, twinkle: 0.5 };
  }
}

const BOX = { x: 70, y: 26, z: 70 };

export class SkyFx {
  private readonly sun: Sprite | null = null;
  private readonly pts: Points;
  private readonly ptsMat: ShaderMaterial;
  private readonly base: Float32Array;
  private readonly lights: InstancedMesh | null = null;
  private time = 0;
  private readonly look: AmbientLook;

  constructor(
    private readonly scene: Scene,
    private readonly track: BuiltTrack,
    theme: Theme,
    density: number,
  ) {
    const id = track.def.theme;
    // celestial billboard, placed far along the start straight so the grid sees it
    const tex = drawCelestial(id, theme);
    if (tex) {
      const s = new Sprite(new SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
      const dx = track.tx[0];
      const dz = track.tz[0];
      const size = id === 1 ? 300 : id === 3 ? 340 : 260;
      s.position.set(track.px[0] + dx * 720, (id === 3 ? 70 : 170) + (id === 1 ? 40 : 0), track.pz[0] + dz * 720);
      s.scale.set(size, size, 1);
      s.renderOrder = -0.5;
      s.frustumCulled = false;
      scene.add(s);
      this.sun = s;
    }

    // ambient particles
    this.look = ambientFor(id, theme);
    const n = this.look.count;
    this.count = n;
    this.base = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      this.base[i * 3] = Math.random() * BOX.x;
      this.base[i * 3 + 1] = Math.random() * BOX.y;
      this.base[i * 3 + 2] = Math.random() * BOX.z;
      c.setHex(this.look.colors[i % this.look.colors.length]);
      col.set([c.r, c.g, c.b], i * 3);
      seed[i] = Math.random();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.base, 3));
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setAttribute('seed', new BufferAttribute(seed, 1));
    this.ptsMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new Vector3() },
        uBox: { value: new Vector3(BOX.x, BOX.y, BOX.z) },
        uSize: { value: this.look.size * 420 },
        uVy: { value: this.look.vy },
        uTw: { value: this.look.twinkle },
        uShape: { value: this.look.shape },
      },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float seed; uniform float uTime; uniform vec3 uCam; uniform vec3 uBox;
        uniform float uSize; uniform float uVy; uniform float uTw; varying vec3 vC; varying float vA;
        void main(){
          vec3 p = position;
          p.y += uTime * uVy * (0.6 + seed);
          p.x += sin(uTime * 0.7 + seed * 40.0) * 1.2;
          p.z += cos(uTime * 0.6 + seed * 31.0) * 1.2;
          // wrap the box around the camera
          vec3 o = uCam - uBox * 0.5;
          p = o + mod(p - o, uBox);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (1.0 - uTw * 0.6 + uTw * 0.6 * sin(uTime * (2.0 + seed * 5.0) + seed * 20.0)) * smoothstep(1.5, 5.0, d) * (1.0 - smoothstep(26.0, 36.0, d));
          vC = color;
          gl_PointSize = uSize * (0.6 + seed * 0.8) / max(1.0, d);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uShape; varying vec3 vC; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = uShape > 0.5 ? smoothstep(1.0, 0.85, d) * (0.25 + smoothstep(0.55, 0.9, d) * 0.75) : smoothstep(1.0, 0.0, d);
          a *= vA;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vC, a * 0.8);
        }`,
      transparent: true,
      depthWrite: false,
      blending: this.look.additive ? AdditiveBlending : NormalBlending,
    });
    this.pts = new Points(g, this.ptsMat);
    this.pts.frustumCulled = false;
    this.setDensity(density);
    this.pts.renderOrder = 7;
    scene.add(this.pts);

    // searchlights behind the Kaunas skyline
    if (id === 1) {
      const cg = new ConeGeometry(14, 260, 16, 1, true);
      cg.translate(0, -130, 0); // apex at the origin, opening downward → flipped below
      cg.rotateX(Math.PI); // opens upward
      const mat = new ShaderMaterial({
        vertexShader: /* glsl */ `varying float vH; varying vec3 vC; void main(){ vH = position.y / 260.0; vC = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `varying float vH; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, (1.0 - vH) * 0.22); }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      const lights = new InstancedMesh(cg, mat, 2);
      lights.instanceMatrix.setUsage(DynamicDrawUsage);
      lights.frustumCulled = false;
      lights.setColorAt(0, new Color(theme.neonA || 0xff3ea5));
      lights.setColorAt(1, new Color(theme.neonB || 0x2cf6f3));
      lights.renderOrder = 6;
      scene.add(lights);
      this.lights = lights;
    }
  }

  private readonly count: number;

  /** Scale the ambient particle count (quality tier). */
  setDensity(d: number): void {
    this.pts.geometry.setDrawRange(0, Math.max(30, Math.round(this.count * Math.max(0, Math.min(1, d)))));
  }

  update(dt: number, camera: PerspectiveCamera): void {
    this.time += dt;
    const u = this.ptsMat.uniforms;
    u.uTime.value = this.time;
    const cam = camera.position;
    (u.uCam.value as Vector3).set(cam.x, cam.y + 6, cam.z);
    if (this.lights) {
      const t = this.track;
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const nx = -t.tz[0];
        const nz = t.tx[0];
        _o.position.set(t.px[0] + t.tx[0] * 260 + nx * side * 160, -40, t.pz[0] + t.tz[0] * 260 + nz * side * 160);
        _o.rotation.set(Math.sin(this.time * 0.35 + i * 2) * 0.45, 0, Math.cos(this.time * 0.27 + i) * 0.5);
        _o.updateMatrix();
        this.lights.setMatrixAt(i, _o.matrix);
      }
      this.lights.instanceMatrix.needsUpdate = true;
    }
    if (this.sun) this.sun.material.rotation = this.track.def.theme === 0 ? this.time * 0.03 : 0;
  }

  dispose(): void {
    for (const o of [this.sun, this.pts, this.lights]) {
      if (!o) continue;
      this.scene.remove(o);
      if ('geometry' in o) o.geometry.dispose();
      const m = o.material as SpriteMaterial | ShaderMaterial;
      if ((m as SpriteMaterial).map) (m as SpriteMaterial).map?.dispose();
      m.dispose();
    }
  }
}
