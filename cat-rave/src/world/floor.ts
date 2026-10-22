/**
 * L-WORLD: the glossy green dance floor. Pool-like caustic light webs, a glow pool and ring around
 * the booth, spotlight pools, a fake reflection of the moon and sky (all tiers) and, on the high
 * tier, a real planar mirror pass rendered at reduced resolution.
 */
import {
  CircleGeometry,
  Color,
  HalfFloatType,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { FOG, NOISE, OUTPUT, SHARED_DECL, type SharedUniforms } from './glsl';

export const MAX_SPOTS = 6;

export interface FloorOptions {
  radius: number;
  floorColor: number;
  glowColor: number;
  boothColor: number;
  /** Half extents of the booth footprint (glow pool under it). */
  boothHalf: { x: number; z: number };
  causticIters: number;
}

export function createFloor(shared: SharedUniforms, opts: FloorOptions) {
  const spots = Array.from({ length: MAX_SPOTS }, () => new Vector4(0, 0, 1, 0));
  const spotColors = Array.from({ length: MAX_SPOTS }, () => new Color(0, 0, 0));
  const textureMatrix = new Matrix4();
  const uniforms = {
    ...shared,
    uFloor: { value: new Color(opts.floorColor) },
    uGlow: { value: new Color(opts.glowColor) },
    uBooth: { value: new Color(opts.boothColor) },
    /** The booth light pool's key colour (theme; green by default). */
    uBoothPool: { value: new Color(0.212, 1.0, 0.254) },
    uBoothHalf: { value: new Vector3(opts.boothHalf.x, 0, opts.boothHalf.z) },
    uSpots: { value: spots },
    uSpotColors: { value: spotColors },
    uMirror: { value: null as WebGLRenderTarget['texture'] | null },
    uMirrorStrength: { value: 0 },
    uTextureMatrix: { value: textureMatrix },
    /** Pulse ring radius expanding from the booth on drops (−1 = none). */
    uRing: { value: -1 },
  };

  const material = new ShaderMaterial({
    name: 'rave-floor',
    defines: { CAUSTIC_ITERS: opts.causticIters, MAX_SPOTS, USE_MIRROR: 0 },
    uniforms,
    vertexShader: /* glsl */ `
      uniform mat4 uTextureMatrix;
      varying vec3 vWorld;
      varying vec4 vMirrorUv;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vMirrorUv = uTextureMatrix * wp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      uniform vec3 uFloor;
      uniform vec3 uGlow;
      uniform vec3 uBooth;
      uniform vec3 uBoothPool;
      uniform vec3 uBoothHalf;
      uniform vec4 uSpots[MAX_SPOTS];
      uniform vec3 uSpotColors[MAX_SPOTS];
      uniform sampler2D uMirror;
      uniform float uMirrorStrength;
      uniform float uRing;
      varying vec3 vWorld;
      varying vec4 vMirrorUv;
      ${NOISE}
      ${FOG}
      // Tileable water caustic (period 1 in uv).
      float caustic(vec2 uv, float t) {
        vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
        vec2 i = p;
        float c = 1.0;
        float inten = 0.005;
        for (int n = 0; n < CAUSTIC_ITERS; n++) {
          float tt = t * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          float sx = sin(i.x + tt);
          float cy = cos(i.y + tt);
          sx = sign(sx) * max(abs(sx), 1e-4) + (sx == 0.0 ? 1e-4 : 0.0);
          cy = sign(cy) * max(abs(cy), 1e-4) + (cy == 0.0 ? 1e-4 : 0.0);
          c += 1.0 / max(length(vec2(p.x / (sx / inten), p.y / (cy / inten))), 1e-4);
        }
        c /= float(CAUSTIC_ITERS);
        c = 1.17 - pow(c, 1.4);
        return clamp(pow(abs(c), 8.0), 0.0, 2.0);
      }
      void main() {
        vec2 xz = vWorld.xz;
        float r = length(xz);
        float t = uTime * (0.35 + 0.65 * uMotion);
        vec3 toCam = cameraPosition - vWorld;
        float dist = max(length(toCam), 1e-4);
        vec3 V = toCam / dist;

        // Ripple normal (cheap analytic waves); stronger on the beat.
        vec2 rp = xz * 0.85;
        vec2 g = vec2(
          sin(rp.x * 1.7 + t * 1.3) + sin(rp.y * 2.3 - t * 0.9 + rp.x * 0.5),
          cos(rp.y * 1.9 + t * 1.1) + cos(rp.x * 2.1 - t * 1.4 - rp.y * 0.4));
        float rippleAmp = 0.03 + 0.025 * uKick * uEnergy;
        vec3 N = normalize(vec3(g.x * rippleAmp, 1.0, g.y * rippleAmp));

        // Caustic webs; fade them out with distance to avoid shimmer at grazing angles.
        float lod = 1.0 - smoothstep(25.0, 70.0, dist);
        float c = 0.0;
        if (lod > 0.0) {
          c = caustic(xz / 7.5 + g * 0.01, t * 0.4) * 0.75 + caustic(xz / 3.3 + 3.1, t * 0.55) * 0.45;
          c *= lod;
        }
        // Glossy bright green (#28d24a) that glows on its own (~0.6), darker towards the horizon.
        float mottled = fbm(xz * 0.12 + 4.0);
        float near = exp(-r / 26.0);
        vec3 col = uFloor * 0.6 * (0.62 + 0.38 * mottled) * (0.3 + 0.7 * near);
        col += uGlow * c * (0.4 + 0.4 * near) * (0.8 + 0.6 * uKick * uEnergy);
        col += uGlow * 0.04 * (1.0 - lod);

        // Booth light: a bright #7dff8a pool (radius ~4) under the booth, the footprint glow and a
        // ring that kicks.
        vec2 q = abs(xz) - uBoothHalf.xz;
        float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        col += uBooth * exp(-max(box, 0.0) * 1.6) * 0.9;
        col += uBoothPool * exp(-r * r / 16.0) * 0.75;
        // A filled soft glow pool (no hard ring: the drop pulse below is the only ring).
        col += uGlow * exp(-r / 2.2) * 0.8 * (0.8 + 0.5 * uKick * (0.4 + 0.6 * uEnergy));
        if (uRing > 0.0) {
          float wave = exp(-pow((r - uRing) / 0.9, 2.0)) * exp(-uRing / 30.0);
          col += uGlow * wave * 1.4;
        }

        // Spotlight pools with a soft, slightly noisy edge.
        for (int k = 0; k < MAX_SPOTS; k++) {
          vec4 s = uSpots[k];
          if (s.w <= 0.0) continue;
          vec2 d = xz - s.xy;
          float e = length(d) / s.z;
          float pool = (1.0 - smoothstep(0.6, 1.0, e)) * (0.75 + 0.25 * vnoise(d * 3.0 + t));
          col += uSpotColors[k] * s.w * (pool * 0.45 + exp(-e * e * 2.0) * 0.12);
        }

        // Reflections. Fresnel on a glossy dielectric.
        vec3 R = reflect(-V, N);
        float ndv = max(dot(N, V), 0.0);
        float fres = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
        vec3 refl = vec3(0.0);
        #if USE_MIRROR
          vec4 muv = vMirrorUv;
          muv.xy += N.xz * 0.9 * muv.w;
          refl = texture2DProj(uMirror, muv).rgb * uMirrorStrength;
        #endif
        // Fake: the moon (a disc plus its glow), smeared into a column by the ripples.
        vec3 md = uMoonCenter - vWorld;
        float mdl = max(length(md), 1e-3);
        md /= mdl;
        float cosR = cos(asin(clamp(uMoonRadius / mdl, 0.0, 1.0)));
        float mdot = dot(R, md);
        float moonRef = smoothstep(cosR - 0.012, cosR + 0.004, mdot) * (0.08 + 0.9 * c) + pow(max(mdot, 0.0), 40.0) * 0.12;
        float horizon = exp(-max(R.y, 0.0) * 10.0) * 0.18;
        vec3 fake = uMoonColor * moonRef + uMoonGlow * horizon;
        #if USE_MIRROR
          fake *= 0.35;
        #endif
        col += (refl + fake) * (0.2 + 0.8 * fres);

        col += uFlash * (0.22 + 0.25 * near);
        col = applyFog(col, dist);
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        ${OUTPUT}
      }
    `,
    fog: false,
  });

  const geometry = new CircleGeometry(opts.radius, 96);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'floor';
  mesh.renderOrder = -50;

  // ---------------------------------------------------------------- planar mirror (high tier)
  let target: WebGLRenderTarget | null = null;
  let scale = 0.5;
  const virtualCamera = new PerspectiveCamera();
  const normal = new Vector3(0, 1, 0);
  const plane = new Plane();
  const clipPlane = new Vector4();
  const view = new Vector3();
  const lookAt = new Vector3();
  const camPos = new Vector3();
  const rot = new Matrix4();
  const tgt = new Vector3();
  const q = new Vector4();
  const origin = new Vector3();

  function setMirror(on: boolean, resolutionScale = 0.5) {
    scale = resolutionScale;
    if (on && !target) {
      target = new WebGLRenderTarget(2, 2, { type: HalfFloatType, depthBuffer: true });
      target.texture.name = 'rave-floor-mirror';
    } else if (!on && target) {
      target.dispose();
      target = null;
    }
    uniforms.uMirror.value = target ? target.texture : null;
    uniforms.uMirrorStrength.value = target ? 0.55 : 0;
    const want = target ? 1 : 0;
    if (material.defines.USE_MIRROR !== want) {
      material.defines.USE_MIRROR = want;
      material.needsUpdate = true;
    }
  }

  function resizeMirror(width: number, height: number) {
    if (target) target.setSize(Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale)));
  }

  /** Render the reflection for `camera`. `hide` objects are invisible during the mirror pass. */
  function renderMirror(renderer: WebGLRenderer, scene: Scene, camera: Camera, hide: readonly Object3D[]) {
    if (!target || !(camera instanceof PerspectiveCamera)) return;
    camPos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= 0.02) return; // under the floor: nothing to reflect
    view.subVectors(origin, camPos).reflect(normal).negate().add(origin);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    tgt.subVectors(origin, lookAt).reflect(normal).negate().add(origin);

    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    virtualCamera.lookAt(tgt);
    virtualCamera.far = camera.far;
    virtualCamera.near = camera.near;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    virtualCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse);

    plane.setFromNormalAndCoplanarPoint(normal, origin).applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = virtualCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
    pm.elements[2] = clipPlane.x;
    pm.elements[6] = clipPlane.y;
    pm.elements[10] = clipPlane.z + 1.0;
    pm.elements[14] = clipPlane.w;

    const visible = hide.map((o) => o.visible);
    mesh.visible = false;
    hide.forEach((o) => (o.visible = false));
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, virtualCamera);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    mesh.visible = true;
    hide.forEach((o, i) => (o.visible = visible[i]));
  }

  return {
    mesh,
    material,
    uniforms,
    spots,
    spotColors,
    setMirror,
    resizeMirror,
    renderMirror,
    get mirrorOn() {
      return target !== null;
    },
    setCausticIters(n: number) {
      if (material.defines.CAUSTIC_ITERS !== n) {
        material.defines.CAUSTIC_ITERS = n;
        material.needsUpdate = true;
      }
    },
    dispose() {
      target?.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
