/**
 * L-UI: the viewer's own two raised paws, attached to the camera (SPEC.md "Cameras": `pov` has two
 * big raised paws in the frame bottom). Fluffy cream arms with hot-pink glowing pads, bobbing on the
 * kick, pumping on a tap, shaking in a build. Procedural geometry + a tiny fake-lit fur shader.
 */
import {
  AdditiveBlending,
  MathUtils,
  BackSide,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  type PerspectiveCamera,
} from 'three';
import { PALETTE } from '../config';
import type { BeatInfo } from '../types';

const FUR_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

// Fake lighting in view space: soft key from above, green bounce from the floor, green rim from
// the moon behind, pink glow toward the paw tip (uTip > 0 only on the paw balls).
const FUR_FRAG = /* glsl */ `
uniform vec3 uFur;
uniform vec3 uRim;
uniform vec3 uPink;
uniform float uTip;
uniform float uGlow;
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float key = clamp(dot(n, normalize(vec3(0.2, 0.9, 0.4))) * 0.5 + 0.5, 0.0, 1.0);
  float bounce = clamp(-n.y, 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);
  vec3 col = uFur * (0.5 + 0.42 * key);
  col += uRim * (0.3 * bounce + 0.75 * fres);
  float tip = uTip * smoothstep(0.03, 0.1, vLocal.y);
  col = mix(col, uPink * (0.75 + 0.5 * uGlow), tip * 0.8);
  gl_FragColor = vec4(col, 1.0);
  // Linear → output: without these the low tier (no composer) shows raw linear, dark and orange.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uRim;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.6);
  gl_FragColor = vec4(uRim * fres, fres * uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface ForegroundPaws {
  readonly root: Group;
  /** 0 hidden … 1 fully in frame (eased by the director per shot). */
  setPresence(p: number): void;
  /** A tap: both paws punch up. */
  pump(strength?: number): void;
  update(dt: number, time: number, beat: BeatInfo, camera: PerspectiveCamera, reducedMotion: boolean): void;
  dispose(): void;
}

export function createForegroundPaws(): ForegroundPaws {
  const root = new Group();
  root.name = 'viewer-paws';
  root.renderOrder = 10;

  const fur = new Color(PALETTE.furCream).convertSRGBToLinear();
  const rim = new Color(PALETTE.floorGlow).convertSRGBToLinear().multiplyScalar(0.55);
  const pink = new Color(PALETTE.pawPink).convertSRGBToLinear();
  const uniforms = {
    uFur: { value: fur },
    uRim: { value: rim },
    uPink: { value: pink },
    uTip: { value: 0 },
    uGlow: { value: 0 },
  };
  // Drawn last and over everything (no depth test): the crowd's heads never hide the viewer's own
  // paws. Transparent (alpha 1) so they also sort after the haze and lasers; renderOrder per part.
  const overlay = { fog: false, transparent: true, depthTest: false, depthWrite: false } as const;
  const armMat = new ShaderMaterial({ vertexShader: FUR_VERT, fragmentShader: FUR_FRAG, uniforms: { ...uniforms, uTip: { value: 0 } }, ...overlay });
  const pawMat = new ShaderMaterial({ vertexShader: FUR_VERT, fragmentShader: FUR_FRAG, uniforms: { ...uniforms, uTip: { value: 1 }, uGlow: uniforms.uGlow }, ...overlay });
  const haloMat = new ShaderMaterial({
    vertexShader: FUR_VERT,
    fragmentShader: HALO_FRAG,
    uniforms: { uRim: { value: new Color(PALETTE.furCream).convertSRGBToLinear().multiplyScalar(0.6) }, uAlpha: { value: 0.55 } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    side: BackSide,
    fog: false,
  });
  // Pads: saturated hot pink with only a hint of white core (the crowd's padGlow), so the bloom
  // stays pink instead of white-pink.
  const padColor = pink.clone().multiplyScalar(3.2).add(new Color(1.0, 0.55, 0.75).multiplyScalar(3.2 * 0.15));
  const padMat = new MeshBasicMaterial({ color: padColor, toneMapped: true, ...overlay });

  const armGeo = new CapsuleGeometry(0.075, 0.42, 4, 10);
  const pawGeo = new SphereGeometry(0.1, 14, 10);
  const padGeo = new SphereGeometry(0.035, 8, 6);
  const beanGeo = new SphereGeometry(0.018, 6, 5);

  const makeArm = (side: -1 | 1) => {
    const g = new Group();
    const arm = new Mesh(armGeo, armMat);
    arm.position.y = -0.26;
    const armHalo = new Mesh(armGeo, haloMat);
    armHalo.position.copy(arm.position);
    armHalo.scale.setScalar(1.22);
    const paw = new Mesh(pawGeo, pawMat);
    paw.scale.set(1.05, 1.0, 0.85);
    const pawHalo = new Mesh(pawGeo, haloMat);
    pawHalo.scale.set(1.3, 1.25, 1.1);
    // Main pad on the top/front of the paw (~60% of the paw top), with four toe beans in an arc
    // above it: a real paw print, not a flat pastel mitten.
    const pad = new Mesh(padGeo, padMat);
    pad.position.set(0, 0.065, -0.05);
    pad.scale.set(1.6, 1.0, 1.25);
    arm.renderOrder = 10;
    armHalo.renderOrder = 11;
    paw.renderOrder = 12;
    pawHalo.renderOrder = 13;
    pad.renderOrder = 14;
    g.add(arm, armHalo, paw, pawHalo, pad);
    for (let i = 0; i < 4; i++) {
      const bean = new Mesh(beanGeo, padMat);
      const a = (i - 1.5) * 0.52;
      bean.position.set(Math.sin(a) * 0.072, 0.072 + Math.cos(a) * 0.03, -0.035 + Math.abs(Math.sin(a)) * 0.012);
      bean.scale.set(1.25, 1.1, 1.0);
      bean.renderOrder = 14;
      g.add(bean);
    }
    g.userData.side = side;
    return g;
  };
  const left = makeArm(-1);
  const right = makeArm(1);
  root.add(left, right);
  root.traverse((o) => {
    o.frustumCulled = false;
  });
  // The planar mirror must not draw the paws (no depth test: they would paint over the reflection).
  root.userData.noMirror = true;

  let presence = 0;
  let target = 0;
  let pumpV = 0;
  let pumpY = 0;

  return {
    root,
    setPresence(p) {
      target = Math.max(0, Math.min(1, p));
    },
    pump(strength = 1) {
      pumpV += 2.6 * strength;
    },
    update(dt, time, beat, camera, reducedMotion) {
      presence += (target - presence) * Math.min(1, dt * 4);
      root.visible = presence > 0.01;
      if (!root.visible) return;
      // Spring for the tap pump.
      pumpV += (-pumpY * 70 - pumpV * 9) * dt;
      pumpY += pumpV * dt;
      uniforms.uGlow.value = Math.min(1.5, beat.kick * beat.energy + Math.max(0, pumpY) * 3);

      // Place in the lower corners of the view at depth d, whatever the aspect.
      const d = 0.9;
      const halfH = Math.tan((camera.fov * Math.PI) / 360) * d;
      const halfW = halfH * camera.aspect;
      const big = 1 + 0.6 * MathUtils.clamp((presence - 0.75) / 0.2, 0, 1);
      const spreadX = Math.min(halfW * 0.62, MathUtils.lerp(0.36, 0.48, (big - 1) / 0.6));
      const bob = reducedMotion ? 0 : beat.kick * 0.035 * (0.4 + beat.energy);
      const shake = beat.held && !reducedMotion ? Math.sin(time * 55) * 0.012 : 0;
      const hide = (1 - presence) * halfH * 1.4;
      for (const arm of [left, right]) {
        const s = arm.userData.side as number;
        const sway = reducedMotion ? 0 : Math.sin(beat.beat * Math.PI * 0.5 + s) * 0.03 * beat.energy;
        arm.position.set(s * spreadX + sway + shake * s, -halfH * MathUtils.lerp(0.74, 0.62, (big - 1) / 0.6) + bob + pumpY * 0.25 - hide, -d);
        arm.rotation.set(-0.35, 0, -s * (0.22 + 0.05 * Math.sin(beat.beat * Math.PI)));
        // Crowd POV (presence 1): 1.6x, each paw fills a bottom corner; the hero shot (0.7) keeps
        // them small. On narrow portrait screens each paw stays within ~a third of the width.
        const sc = Math.min(MathUtils.clamp(halfH * 1.25, 0.5, 0.85) * big, (halfW * 0.34) / 0.105);
        arm.scale.setScalar(sc);
      }
    },
    dispose() {
      root.removeFromParent();
      for (const g of [armGeo, pawGeo, padGeo, beanGeo]) g.dispose();
      for (const m of [armMat, pawMat, haloMat, padMat]) m.dispose();
    },
  };
}
