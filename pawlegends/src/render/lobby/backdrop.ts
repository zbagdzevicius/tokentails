/**
 * Lobby backdrop: one large plane behind the turntable with a cheap shader (one draw call). A two-stop gradient,
 * a soft glow behind the hero, a vignette and slow drifting bokeh from hashed cells. `uTint` is the worn card's
 * element colour, else the hero colour. Low tier or reduced motion freezes `uTime` (a still picture).
 *
 * UX pass 2 ("the lobby looks dull"): a painted scene (public/assets/lobby/, Gemini art, see LICENSES.md) is laid
 * over the gradient once it loads: cover-fitted to the screen (not the plane), dimmed so the UI column and the hero
 * read, with a gentle parallax that follows the pointer, a slow drift and an 18 s Ken Burns push (all off under
 * reduced motion / Low tier).
 * Until the image arrives (or if it fails) the gradient is the picture, so nothing waits on it.
 *
 * Render only: nothing here reaches the sim.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Uniform colours are linear (THREE.Color); the colour-space chunk writes them out as sRGB. No tone mapping.
const FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uTint;
uniform vec3 uBase;
uniform float uTime;
uniform float uBokeh;
uniform vec2 uGlow;
uniform float uAspect;
uniform sampler2D uImg;
uniform float uImgMix;
uniform float uImgAspect;
uniform vec2 uRes;
uniform vec2 uPar;
uniform float uZoom;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// one layer of soft discs: each cell holds at most one disc that drifts up and sways
float bokeh(vec2 uv, float scale, float speed, float seed) {
  vec2 p = uv * vec2(scale * uAspect, scale);
  p.y -= uTime * speed;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash(cell + seed);
  if (h < 0.55) return 0.0;
  vec2 c = vec2(0.25 + 0.5 * hash(cell + seed + 3.1), 0.25 + 0.5 * hash(cell + seed + 7.7));
  c.x += 0.12 * sin(uTime * 0.4 + h * 6.28);
  float r = 0.10 + 0.16 * hash(cell + seed + 1.3);
  float d = length(f - c);
  float tw = 0.65 + 0.35 * sin(uTime * (0.6 + h) + h * 12.0);
  return smoothstep(r, r * 0.35, d) * tw;
}

void main() {
  vec2 uv = vUv;
  // vertical gradient: deep plum at the floor, the tint mixed in towards the top
  // (the tint stays an accent: a pale element such as Star must not wash the whole frame out)
  vec3 top = uBase * 1.55 + uTint * 0.07;
  vec3 col = mix(uBase * 0.7, top, smoothstep(0.0, 0.95, uv.y));
  // soft glow around the hero
  vec2 g = (uv - uGlow) * vec2(uAspect, 1.0);
  float glow = exp(-dot(g, g) * 9.0);
  col += uTint * glow * 0.26;
  // bokeh in two depths (skipped at strength 0: Low tier, a uniform branch, so no per-pixel cost)
  if (uBokeh > 0.001) {
    float b = bokeh(uv, 7.0, 0.018, 0.0) * 0.55 + bokeh(uv + 0.37, 4.0, 0.010, 11.0) * 0.35;
    col += mix(vec3(1.0, 0.95, 0.88), uTint, 0.55) * b * uBokeh * (0.35 + 0.65 * uv.y);
  }
  // the painted scene: screen-space cover fit (the camera moves; the picture must not), zoomed 5% so the parallax
  // shift never shows an edge; dimmed and pulled toward the tint a touch so a card's element still colours the room
  if (uImgMix > 0.001) {
    vec2 s = gl_FragCoord.xy / uRes;
    float a = uRes.x / uRes.y;
    if (a > uImgAspect) s.y = (s.y - 0.5) * uImgAspect / a + 0.5;
    else s.x = (s.x - 0.5) * a / uImgAspect + 0.5;
    s = (s - 0.5) / (1.05 + uZoom) + 0.5 + uPar * 0.022;
    vec3 img = texture2D(uImg, s).rgb * 0.86;
    img = mix(img, img * (0.75 + uTint * 0.5), 0.18);
    img += uTint * glow * 0.12;
    col = mix(col, img, uImgMix);
  }
  // vignette
  vec2 v = (uv - 0.5) * vec2(1.25, 1.0);
  col *= 1.0 - smoothstep(0.32, 0.85, length(v)) * 0.55;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface Backdrop {
  readonly mesh: THREE.Mesh;
  /** Tint towards this colour (eased). */
  setTint(hex: number): void;
  /** Bokeh strength 0..1 (Low tier: dimmer). */
  setBokeh(k: number): void;
  /** Advance; `frozen` keeps the picture still (Low tier or reduced motion). */
  update(dt: number, frozen: boolean): void;
  /** Lay a painted scene over the gradient (loaded async; it fades in, at once when `instant`). */
  setImage(url: string, instant?: boolean): void;
  /** Parallax target in -1..1 (pointer position); eased. */
  setParallax(x: number, y: number): void;
  dispose(): void;
}

/** Plane size (m): wide enough to fill a 21:9 frame at the farthest lobby camera. */
const W = 90;
const H = 44;

export function createBackdrop(): Backdrop {
  const target = new THREE.Color(0xff9f6b);
  const uniforms = {
    uTint: { value: new THREE.Color(0xff9f6b) },
    uBase: { value: new THREE.Color(0x2b1d2e) },
    uTime: { value: 0 },
    uBokeh: { value: 1 },
    // the hero stands a little right of the plane's centre; the glow sits behind it
    uGlow: { value: new THREE.Vector2(0.5, 0.42) },
    uAspect: { value: W / H },
    uImg: { value: null as THREE.Texture | null },
    uImgMix: { value: 0 },
    uImgAspect: { value: 16 / 9 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uPar: { value: new THREE.Vector2(0, 0) },
    // Home (HOME-MODES.md §4): a slow Ken Burns push, 1.00 to 1.035 over 18 s (0 when frozen)
    uZoom: { value: 0 },
  };
  /** When the image arrived (performance.now ms; -1 = not yet): a 0.5 s wall-clock fade, so a slow first frame rate
   *  (clamped dt) never leaves it half in. */
  let imgAt = -1;
  let imgInstant = false;
  let imgUrl = '';
  const par = new THREE.Vector2(0, 0);
  let drift = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthWrite: false, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  mesh.name = 'lobby-backdrop';
  mesh.position.set(0, 6, -14);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  // the drawing-buffer size for the screen-space cover fit (the lobby renders full screen)
  mesh.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(uniforms.uRes.value);
  };
  return {
    mesh,
    setTint(hex) {
      target.setHex(hex);
    },
    setBokeh(k) {
      uniforms.uBokeh.value = Math.max(0, Math.min(1, k));
    },
    update(dt, frozen) {
      if (!frozen) uniforms.uTime.value += dt;
      uniforms.uTint.value.lerp(target, Math.min(1, dt * 3));
      uniforms.uImgMix.value = imgAt < 0 ? 0 : imgInstant || frozen ? 1 : Math.min(1, (performance.now() - imgAt) / 500);
      if (frozen) {
        uniforms.uPar.value.set(0, 0);
        uniforms.uZoom.value = 0;
        return;
      }
      // a slow sway (about a 40 s loop) plus the pointer, eased so it glides
      drift += dt;
      uniforms.uZoom.value = 0.0175 * (1 - Math.cos((drift * Math.PI * 2) / 18));
      const k = Math.min(1, dt * 2.5);
      const p = uniforms.uPar.value;
      p.x += (par.x + Math.sin(drift * 0.16) * 0.25 - p.x) * k;
      p.y += (par.y + Math.cos(drift * 0.11) * 0.15 - p.y) * k;
    },
    setImage(url, instant = false) {
      if (!url || url === imgUrl) return;
      imgUrl = url;
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          if (imgUrl !== url) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          const img = tex.image as { width?: number; height?: number } | undefined;
          if (img?.width && img.height) uniforms.uImgAspect.value = img.width / img.height;
          uniforms.uImg.value?.dispose();
          uniforms.uImg.value = tex;
          imgInstant = instant;
          imgAt = performance.now();
        },
        undefined,
        () => {
          // a failed load keeps the gradient (offline, blocked): nothing else depends on it
          if (imgUrl === url) imgUrl = '';
        },
      );
    },
    setParallax(x, y) {
      par.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      uniforms.uImg.value?.dispose();
      uniforms.uImg.value = null;
    },
  };
}
