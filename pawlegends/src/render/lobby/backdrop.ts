/**
 * Lobby backdrop: one large plane behind the turntable with a cheap shader (one draw call). A two-stop gradient,
 * a soft glow behind the hero, a vignette and slow drifting bokeh from hashed cells. `uTint` is the worn card's
 * element colour, else the hero colour. Low tier or reduced motion freezes `uTime` (a still picture).
 *
 * UX pass 2 ("the lobby looks dull"): a painted scene (public/assets/lobby/, Gemini art, see LICENSES.md) is laid
 * over the gradient once it loads: cover-fitted to the screen (not the plane), dimmed so the UI column and the hero
 * read, with a gentle parallax that follows the pointer, a slow drift and an 18 s Ken Burns push (all off under
 * reduced motion / Low tier). Home's key art (`setSplit(1)`) is shown as painted: no dim, tint or vignette.
 * Until the image arrives (or if it fails) the gradient is the picture, so nothing waits on it.
 *
 * Home poster (docs/plans/moba/HOME-POSTER.md, `setPoster(1)`): no picture at all. The same plane draws the flat
 * poster in screen space: the rose and sky fields split by a halftone lightning bolt (render/lobby/poster.ts `BOLT`,
 * mirrored by `uFlip` for a dog champion), sparse paw and bone prints, a few speed streaks, grain, a contact shadow
 * under the champion and the rival's flat dark silhouette (a ≤ 14 KB alpha image streamed from pawlegends.app; the
 * poster is complete without it). One draw call, no extra pass; the first frame needs no download.
 *
 * Render only: nothing here reaches the sim.
 */
import * as THREE from 'three';
import type { HeroSide } from '../../data/heroes/types';
import { BOLT, BOLT_SHIFT, rivalBox } from './poster';

const glf = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
const BOLT_GLSL = BOLT.map(([x, y], i) => `const vec2 B${i} = vec2(${glf(x + BOLT_SHIFT)}, ${glf(y)});`).join('\n');

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
uniform float uSplit;
uniform float uPoster;
uniform float uFlip;
uniform float uFlash;
uniform sampler2D uRival;
uniform vec4 uRivalBox;
uniform float uRivalMix;
uniform vec3 uFoot;
uniform vec3 uPink;
uniform vec3 uSky;
uniform vec3 uBolt;
uniform vec3 uGold;
uniform vec3 uOrange;
uniform vec3 uCream;
uniform vec3 uPlum;

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

// ---- Home poster (HOME-POSTER.md) ----
${BOLT_GLSL}
vec2 bp(vec2 b) { return vec2(uFlip * b.x, b.y); }
float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float boltX(float y, vec2 p0, vec2 p1, vec2 p2, vec2 p3) {
  if (y >= p1.y) return mix(p1.x, p0.x, (y - p1.y) / (p0.y - p1.y));
  if (y >= p2.y) return mix(p2.x, p1.x, (y - p2.y) / (p1.y - p2.y));
  return mix(p3.x, p2.x, (y - p3.y) / (p2.y - p3.y));
}
float pawShape(vec2 p) {
  float pad = length((p - vec2(0.0, -0.08)) / vec2(0.2, 0.16));
  float toe = min(min(length(p - vec2(-0.2, 0.1)), length(p - vec2(-0.07, 0.21))), min(length(p - vec2(0.07, 0.21)), length(p - vec2(0.2, 0.1))));
  return max(1.0 - smoothstep(0.92, 1.05, pad), 1.0 - smoothstep(0.07, 0.085, toe));
}
float boneShape(vec2 p) {
  float bar = segD(p, vec2(-0.2, 0.0), vec2(0.2, 0.0));
  float knob = min(min(length(p - vec2(-0.24, 0.06)), length(p - vec2(-0.24, -0.06))), min(length(p - vec2(0.24, 0.06)), length(p - vec2(0.24, -0.06))));
  return max(1.0 - smoothstep(0.05, 0.065, bar), 1.0 - smoothstep(0.07, 0.085, knob));
}
vec3 posterCol() {
  vec2 s = gl_FragCoord.xy / uRes;
  float a = uRes.x / uRes.y;
  vec2 q = vec2((s.x - 0.5) * a, s.y);
  float fw = 1.5 / uRes.y;
  vec2 p0 = bp(B0), p1 = bp(B1), p2 = bp(B2), p3 = bp(B3);
  // the two fields (0 rose, 1 sky), split along the bolt's centre line
  float m = smoothstep(-fw, fw, q.x - boltX(q.y, p0, p1, p2, p3));
  vec3 col = mix(uPink, uSky, m);
  // prints: sparse paws on the rose field, bones on the sky field, a shade darker
  vec2 pc = mat2(0.97, -0.24, 0.24, 0.97) * q * 5.5;
  vec2 cell = floor(pc);
  float h = hash(cell + m * 17.0);
  if (h > 0.58) {
    float r = h * 37.0;
    vec2 f = mat2(cos(r), -sin(r), sin(r), cos(r)) * (fract(pc) - 0.5) * 1.35;
    float shp = m < 0.5 ? pawShape(f) : boneShape(f);
    col *= 1.0 - 0.14 * shp;
  }
  // speed streaks along the bolt
  vec2 dir = normalize(vec2(uFlip * 0.2, 1.0));
  vec2 nrm = vec2(dir.y, -dir.x);
  float lane = dot(q, nrm) * 90.0;
  float lh = hash(vec2(floor(lane), 3.1));
  float along = fract(dot(q, dir) * 1.6 + lh * 10.0 + uTime * 0.25 * (0.5 + lh));
  float streak = step(0.93, lh) * (1.0 - smoothstep(0.08, 0.5, abs(fract(lane) - 0.5))) * smoothstep(0.0, 0.25, along) * (1.0 - smoothstep(0.55, 1.0, along));
  col += streak * 0.07;
  // a soft light behind the champion's chest, darker toward the floor and the outer edges (the HUD reads)
  vec2 g = (s - uFoot.xy - vec2(0.0, 0.34)) * vec2(a, 1.0);
  col *= 1.0 + 0.22 * exp(-dot(g, g) * 4.0);
  col *= 0.8 + 0.2 * smoothstep(0.0, 0.55, s.y);
  col *= 1.0 - 0.2 * smoothstep(0.32, 0.8, abs(s.x - 0.5) * min(a, 2.0));
  // the rival: a flat silhouette a shade darker than its field
  vec2 ru = (s - uRivalBox.xy) / max(uRivalBox.zw - uRivalBox.xy, vec2(1e-4));
  if (uRivalMix > 0.001 && ru.x > 0.0 && ru.x < 1.0 && ru.y > 0.0 && ru.y < 1.0) {
    // kept on its own field (a wide pose never reaches across the bolt)
    float own = (uRivalBox.x + uRivalBox.z) < 1.0 ? 1.0 - m : m;
    float ra = texture2D(uRival, ru).a * uRivalMix * own;
    col = mix(col, mix(col * 0.5, uPlum, 0.18), ra * 0.9);
  }
  // the champion's contact shadow
  vec2 c = (s - uFoot.xy) * vec2(a, 1.0) / vec2(max(uFoot.z, 0.01), max(uFoot.z, 0.01) * 0.2);
  col *= 1.0 - 0.38 * exp(-dot(c, c) * 2.2);
  // the bolt: an orange outline round a gold band with cream halftone dots, larger toward its edges
  float d = min(segD(q, p0, p1), min(segD(q, p1, p2), segD(q, p2, p3)));
  // the band tapers from the top to a point at the foot, like a struck bolt
  float hw = mix(0.018, 0.068, smoothstep(-0.08, 1.0, q.y));
  float ow = mix(0.01, 0.02, smoothstep(-0.08, 1.0, q.y));
  vec2 hp = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / (uRes.y / 75.0);
  float rr = 0.14 + 0.26 * smoothstep(0.0, hw, d);
  float dotM = 1.0 - smoothstep(rr - 0.07, rr + 0.07, length(fract(hp) - 0.5));
  vec3 bc = mix(uGold, uBolt, smoothstep(0.1, 0.9, s.y));
  bc = mix(bc, uCream, dotM * 0.8) + uFlash * 0.5;
  col = mix(col, uPlum, (1.0 - smoothstep(hw + ow + 0.005 - fw, hw + ow + 0.005 + fw, d)) * 0.5);
  col = mix(col, uOrange, 1.0 - smoothstep(hw + ow - fw, hw + ow + fw, d));
  col = mix(col, bc, 1.0 - smoothstep(hw - fw, hw + fw, d));
  // grain, and the swap's flicker
  col += (hash(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5) * 0.03;
  return mix(col, vec3(1.0), uFlash * 0.14);
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
    col += mix(vec3(1.0, 0.95, 0.89), uTint, 0.55) * b * uBokeh * (0.35 + 0.65 * uv.y);
  }
  // the painted scene: screen-space cover fit (the camera moves; the picture must not), zoomed 5% so the parallax
  // shift never shows an edge; dimmed and pulled toward the tint a touch so a card's element still colours the room
  if (uImgMix > 0.001) {
    vec2 s = gl_FragCoord.xy / uRes;
    float a = uRes.x / uRes.y;
    if (a > uImgAspect) s.y = (s.y - 0.5) * uImgAspect / a + 0.5;
    else s.x = (s.x - 0.5) * a / uImgAspect + 0.5;
    s = (s - 0.5) / (1.05 + uZoom) + 0.5 + uPar * 0.022;
    vec3 raw = texture2D(uImg, s).rgb;
    vec3 img = raw * 0.86;
    img = mix(img, img * (0.75 + uTint * 0.5), 0.18);
    img += uTint * glow * 0.12;
    // Home's key art (uSplit 1, one-style pass Nov 13): the bright comic art is final as painted (rose, sky and the
    // bolt are in the picture), so no dimming, element tint or warm glow on it
    img = mix(img, raw, uSplit);
    col = mix(col, img, uImgMix);
  }
  // vignette (none on Home's key art: midday light, no dusk falloff)
  vec2 v = (uv - 0.5) * vec2(1.25, 1.0);
  col *= 1.0 - smoothstep(0.32, 0.85, length(v)) * 0.55 * (1.0 - uSplit * uImgMix);
  // Home's poster replaces everything above (a uniform branch: no cost on the other screens)
  if (uPoster > 0.001) col = mix(col, posterCol(), uPoster);
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
  /** Home's key art, 0..1: 1 shows the painted scene as is (no dim, tint or vignette). */
  setSplit(k: number): void;
  /** Lay a painted scene over the gradient (loaded async; it fades in, at once when `instant`). */
  setImage(url: string, instant?: boolean): void;
  /** Parallax target in -1..1 (pointer position); eased. */
  setParallax(x: number, y: number): void;
  /** Home's poster on (1) or off (0): drawn in the shader, no picture. */
  setPoster(k: number): void;
  /**
   * The poster's layout for the champion's side (a cat: bolt right of centre; a dog: mirrored) and its rival's
   * silhouette file (null: none). A change of side swings the bolt over in SWAP_S with a flicker (at once when
   * `instant`, reduced motion or Low); the silhouette fades out, swaps and fades back in.
   */
  setLayout(side: HeroSide, rivalUrl: string | null, instant?: boolean): void;
  /** The champion's feet in screen UV (0..1, y up) and its half width (screen heights): the contact shadow and glow. */
  setFoot(x: number, y: number, halfWidth: number): void;
  /** The poster's current flip (-1..1) and the rival silhouette's opacity, for e2e. */
  posterState(): { flip: number; rival: number; side: HeroSide };
  dispose(): void;
}

/** Plane size (m): wide enough to fill a 21:9 frame at the farthest lobby camera. */
const W = 90;
const H = 44;
/** The poster swap (s): the bolt swings over and flickers, the rival fades out and back. */
export const SWAP_S = 0.3;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createBackdrop(): Backdrop {
  const target = new THREE.Color(0xff9f6b);
  const uniforms = {
    uTint: { value: new THREE.Color(0xff9f6b) },
    // v6: the night-2 ground under the gradient (the old plum #2b1d2e)
    uBase: { value: new THREE.Color(0x1c1230) },
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
    uSplit: { value: 0 },
    uPoster: { value: 0 },
    uFlip: { value: 1 },
    uFlash: { value: 0 },
    uRival: { value: null as THREE.Texture | null },
    uRivalBox: { value: new THREE.Vector4(0, 0, 0, 0) },
    uRivalMix: { value: 0 },
    uFoot: { value: new THREE.Vector3(0.3, 0.06, 0.12) },
    // v6 Lightning Rivalry (brand book): rose, sky, bolt, gold, a bolt orange, cream and plum (THREE.Color: linear)
    uPink: { value: new THREE.Color('#ff3d7f') },
    uSky: { value: new THREE.Color('#39a6ff') },
    uBolt: { value: new THREE.Color('#ffe14a') },
    uGold: { value: new THREE.Color('#f7bc3c') },
    uOrange: { value: new THREE.Color('#ff8a1e') },
    uCream: { value: new THREE.Color('#fff3e3') },
    uPlum: { value: new THREE.Color('#12091f') },
  };
  // the poster: the side the layout swings to, the swap clock, and the rival (shown, and the one waiting to come in)
  let posterTarget = 0;
  let side: HeroSide = 'cat';
  let flipFrom = 1;
  let flipTo = 1;
  let swapT = SWAP_S;
  let rivalShown = '';
  let rivalWant: string | null = null;
  let rivalSide: HeroSide = 'cat';
  let rivalAspect = 0.7;
  let rivalLoaded = false;
  let rivalInstant = false;
  /** Silhouettes that failed to load (offline, not deployed yet): not retried every frame. */
  const rivalFailed = new Set<string>();
  const loadRival = (url: string): void => {
    rivalShown = url;
    rivalLoaded = false;
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        if (rivalShown !== url) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.NoColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        const img = tex.image as { width?: number; height?: number } | undefined;
        if (img?.width && img.height) rivalAspect = img.width / img.height;
        uniforms.uRival.value?.dispose();
        uniforms.uRival.value = tex;
        rivalLoaded = true;
      },
      undefined,
      () => {
        // offline or not deployed yet: the poster stands without its rival (and does not ask again this session)
        rivalFailed.add(url);
      },
    );
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
    setSplit(k) {
      uniforms.uSplit.value = Math.max(0, Math.min(1, k));
    },
    setBokeh(k) {
      uniforms.uBokeh.value = Math.max(0, Math.min(1, k));
    },
    update(dt, frozen) {
      if (!frozen) uniforms.uTime.value += dt;
      if (posterTarget > 0) {
        // the swap: the bolt swings through upright to the other side, with a short flicker (none when frozen)
        if (frozen) swapT = SWAP_S;
        else swapT = Math.min(SWAP_S, swapT + dt);
        const k = swapT / SWAP_S;
        uniforms.uFlip.value = flipFrom + (flipTo - flipFrom) * easeInOut(k);
        uniforms.uFlash.value = k < 1 ? Math.max(0, Math.sin(k * Math.PI)) * (0.55 + 0.45 * Math.sin(k * 40)) : 0;
        // the rival: fade out what is shown when another is wanted, then load it and fade it in on its side
        const want = rivalWant && !rivalFailed.has(rivalWant) ? rivalWant : '';
        const mix = uniforms.uRivalMix;
        const step = frozen || rivalInstant ? 1 : dt / (SWAP_S / 2);
        if (want !== rivalShown) {
          mix.value = Math.max(0, mix.value - step);
          if (mix.value <= 0) {
            rivalSide = side;
            if (want) loadRival(want);
            else {
              rivalShown = '';
              rivalLoaded = false;
            }
          }
        } else if (rivalLoaded) mix.value = Math.min(1, mix.value + step);
        const res = uniforms.uRes.value;
        const [x0, y0, x1, y1] = rivalBox({ w: res.x || 1, h: res.y || 1, side: rivalSide, imgAspect: rivalAspect });
        uniforms.uRivalBox.value.set(x0, y0, x1, y1);
      }
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
    setPoster(k) {
      posterTarget = Math.max(0, Math.min(1, k));
      // the poster appears at once (it is the first picture: nothing to wait for)
      uniforms.uPoster.value = posterTarget;
    },
    setLayout(next, rivalUrl, instant = false) {
      const to = next === 'dog' ? -1 : 1;
      if (to !== flipTo) {
        flipFrom = instant ? to : uniforms.uFlip.value;
        flipTo = to;
        swapT = instant ? SWAP_S : 0;
      }
      side = next;
      rivalInstant = instant;
      rivalWant = rivalUrl;
      if (instant || !rivalShown) rivalSide = next;
    },
    setFoot(x, y, halfWidth) {
      uniforms.uFoot.value.set(x, y, halfWidth);
    },
    posterState() {
      return { flip: uniforms.uFlip.value, rival: uniforms.uRivalMix.value, side };
    },
    setParallax(x, y) {
      par.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
      uniforms.uImg.value?.dispose();
      uniforms.uImg.value = null;
      uniforms.uRival.value?.dispose();
      uniforms.uRival.value = null;
    },
  };
}
