/**
 * Home's map backdrop (render/lobby/mapViews.ts): one full-screen quad, one draw call, that shows the spot's picture
 * cover-fitted with the feet kept at FEET, crossfading into the next spot. On top of the picture, in the same pass:
 * - a soft contact shadow under the champion (all tiers; High and Medium add the sun's real shadow on a shadow-only
 *   ground plane, render/lobby.ts),
 * - the readability scrim of the concepts: plum darkening from the top bar, the bottom row, the left stack and the
 *   right side (the friends rail and the PLAY corner), the champion's middle left clear.
 * Until a picture is in (or when it fails) the spot's own sky-to-ground gradient stands in, so nothing waits on it.
 * Pictures load as ImageBitmaps (decoded off the main thread where the browser can) and are uploaded right away, so a
 * crossfade never stalls on a texture upload; at most the shown, the incoming and the next picture are kept.
 *
 * Render only: nothing here reaches the sim.
 */
import * as THREE from 'three';
import { coverCrop, type MapView } from './mapViews';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // a full-screen quad at the far plane, whatever the camera
  gl_Position = vec4(position.xy * 2.0, 1.0, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uHasA;
uniform float uHasB;
uniform float uK;
uniform vec4 uCrop;
uniform vec3 uSkyA;
uniform vec3 uGroundA;
uniform vec3 uSkyB;
uniform vec3 uGroundB;
uniform vec3 uFoot;
uniform float uScrim;
uniform float uAspect;
uniform vec3 uPlum;

vec3 pic(sampler2D t, float has, vec2 p, vec3 sky, vec3 ground) {
  // the stand-in: the spot's sky over its ground, the horizon a little above the feet
  vec3 g = mix(ground * 1.15, sky, smoothstep(0.62, 0.38, p.y));
  return has > 0.5 ? texture2D(t, p).rgb : g;
}

void main() {
  vec2 s = vUv;
  // picture coordinates from the top left (the bitmap's first row is v 0)
  vec2 p = vec2(uCrop.x + s.x * uCrop.z, uCrop.y + (1.0 - s.y) * uCrop.w);
  vec3 col = pic(uA, uHasA, p, uSkyA, uGroundA);
  if (uK > 0.001) col = mix(col, pic(uB, uHasB, p, uSkyB, uGroundB), uK);
  // contact shadow under the feet (screen uv, y up; uFoot.z = half width in screen heights)
  if (uFoot.z > 0.0) {
    vec2 e = (s - uFoot.xy) * vec2(uAspect, 1.0) / vec2(uFoot.z, uFoot.z * 0.28);
    col *= 1.0 - 0.32 * exp(-dot(e, e) * 1.6);
  }
  // readability scrim (lobby concepts, Nov 20): top bar, bottom row, left stack, right rail and PLAY
  float top = mix(0.55, 0.18, smoothstep(0.0, 0.14, 1.0 - s.y)) * (1.0 - smoothstep(0.14, 0.26, 1.0 - s.y));
  float bot = mix(0.6, 0.2, smoothstep(0.0, 0.16, s.y)) * (1.0 - smoothstep(0.16, 0.30, s.y));
  float lft = mix(0.5, 0.12, smoothstep(0.0, 0.16, s.x)) * (1.0 - smoothstep(0.16, 0.26, s.x));
  float rgt = mix(0.62, 0.3, smoothstep(0.0, 0.2, 1.0 - s.x)) * (1.0 - smoothstep(0.2, 0.36, 1.0 - s.x));
  float a = 1.0 - (1.0 - top) * (1.0 - bot) * (1.0 - lft) * (1.0 - rgt);
  col = mix(col, uPlum, a * uScrim);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface MapBackdrop {
  readonly mesh: THREE.Mesh;
  /**
   * Show spot `from` fading to `to` by `k` (0..1). Starts loading both pictures (and `next`) if they are not in yet,
   * and lets go of every other picture.
   */
  show(from: MapView, to: MapView, k: number, next: MapView | null): void;
  /** Whether a spot's picture is in (the rotation waits for it before fading). */
  ready(view: MapView): boolean;
  /** Whether a spot's picture failed to load (offline, not deployed yet). */
  failed(view: MapView): boolean;
  /** The screen's aspect (CSS width / height): the cover crop that keeps the feet on the spot. */
  setAspect(aspect: number): void;
  /** The champion's feet on screen (uv, y up) and its half width (screen heights), for the contact shadow. */
  setFoot(x: number, y: number, halfWidth: number): void;
  dispose(): void;
}

type Slot = { state: 'loading' | 'ready' | 'failed'; tex: THREE.Texture | null };

/**
 * `urlFor` names a spot's picture; `upload` sends a texture to the GPU as soon as it is in (the renderer's
 * `initTexture`), so the crossfade never pays for it.
 */
export function createMapBackdrop(urlFor: (v: MapView) => string, upload: (t: THREE.Texture) => void): MapBackdrop {
  const uniforms = {
    uA: { value: null as THREE.Texture | null },
    uB: { value: null as THREE.Texture | null },
    uHasA: { value: 0 },
    uHasB: { value: 0 },
    uK: { value: 0 },
    uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSkyA: { value: new THREE.Color('#fff3e3') },
    uGroundA: { value: new THREE.Color('#7b7792') },
    uSkyB: { value: new THREE.Color('#fff3e3') },
    uGroundB: { value: new THREE.Color('#7b7792') },
    uFoot: { value: new THREE.Vector3(0.42, 0.2, 0) },
    uScrim: { value: 1 },
    uAspect: { value: 16 / 9 },
    uPlum: { value: new THREE.Color('#12091f') },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthWrite: false, depthTest: false, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.name = 'lobby-map-backdrop';
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;
  const slots = new Map<string, Slot>();
  const bitmaps = typeof createImageBitmap === 'function';

  const load = (v: MapView): void => {
    const url = urlFor(v);
    if (slots.has(url)) return;
    const slot: Slot = { state: 'loading', tex: null };
    slots.set(url, slot);
    const done = (tex: THREE.Texture): void => {
      if (slots.get(url) !== slot) {
        free(tex);
        return;
      }
      // the bitmap's first row is the picture's top (no flip): the shader reads it that way
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      slot.tex = tex;
      slot.state = 'ready';
      try {
        upload(tex);
      } catch {
        // uploaded on first use instead
      }
    };
    const fail = (): void => {
      if (slots.get(url) === slot) slot.state = 'failed';
    };
    if (bitmaps) {
      const l = new THREE.ImageBitmapLoader();
      l.setCrossOrigin('anonymous');
      l.setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none' });
      l.load(url, (bmp) => done(new THREE.Texture(bmp as unknown as HTMLImageElement)), undefined, fail);
    } else {
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, done, undefined, fail);
    }
  };

  const free = (tex: THREE.Texture | null): void => {
    if (!tex) return;
    const img = tex.image as { close?: () => void } | null;
    tex.dispose();
    img?.close?.();
  };

  const slotOf = (v: MapView): Slot | undefined => slots.get(urlFor(v));

  return {
    mesh,
    show(from, to, k, next) {
      load(from);
      if (to !== from) load(to);
      if (next) load(next);
      const keep = new Set([urlFor(from), urlFor(to), ...(next ? [urlFor(next)] : [])]);
      for (const [url, s] of slots) {
        if (keep.has(url) || s.state === 'loading') continue;
        // failed pictures stay remembered (not asked again this session); loaded ones out of use are let go
        if (s.state === 'ready') {
          free(s.tex);
          slots.delete(url);
        }
      }
      const a = slotOf(from);
      const b = slotOf(to);
      uniforms.uA.value = a?.state === 'ready' ? a.tex : null;
      uniforms.uHasA.value = a?.state === 'ready' ? 1 : 0;
      uniforms.uB.value = b?.state === 'ready' ? b.tex : null;
      uniforms.uHasB.value = b?.state === 'ready' ? 1 : 0;
      uniforms.uK.value = to === from ? 0 : Math.max(0, Math.min(1, k));
      uniforms.uSkyA.value.set(from.sky);
      uniforms.uGroundA.value.set(from.ground);
      uniforms.uSkyB.value.set(to.sky);
      uniforms.uGroundB.value.set(to.ground);
    },
    ready(v) {
      return slotOf(v)?.state === 'ready';
    },
    failed(v) {
      return slotOf(v)?.state === 'failed';
    },
    setAspect(aspect) {
      const c = coverCrop(aspect);
      uniforms.uCrop.value.set(c.x, c.y, c.w, c.h);
      uniforms.uAspect.value = aspect;
    },
    setFoot(x, y, halfWidth) {
      uniforms.uFoot.value.set(x, y, halfWidth);
    },
    dispose() {
      for (const s of slots.values()) free(s.tex);
      slots.clear();
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
