/**
 * Token Tails in the world, always on (no flag, independent of Arc week): the official lockup as the venue's
 * backlit hero sign above and behind the DJ booth, and the cat mark on dark plates on the booth's two side
 * faces. Layout and the occlusion maths live in ttLogoLayout.ts.
 *
 * The logo files are the official ones from client/public/logo (copied unmodified to public/brand/, see
 * SOURCE.md there). They are shown as textured cut-out planes: sRGB, premultiplied on upload (no dark or light
 * fringe when mipmapped down on phones), anisotropic per quality tier. The sign writes depth past a small alpha
 * cut, so haze sheets and beams behind it can't wash over it; things in front still blend over it.
 * On phones the sign is fitted to the hero camera (`follow`, portraitSignPose); landscape keeps one pose.
 * The sign's brightness breathes with the kick (and lifts in a drop) so it catches the bloom without
 * blowing out; reduced motion keeps the pulse small.
 */
import {
  Color,
  CustomBlending,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  TextureLoader,
  Vector3,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { brandUrl } from '../arc/arcweek';
import type { BeatInfo, QualityProfile } from '../types';
import { OUTPUT } from './glsl';
import {
  TT_CAT_ASPECT,
  TT_CAT_FILE,
  TT_LOGO_ASPECT,
  TT_LOGO_FILE,
  TT_SIDE_MARK_H,
  TT_SIDE_PLATE,
  hudTopNdc,
  portraitSignPose,
  signLevel,
  ttSignPose,
} from './ttLogoLayout';

export interface TokenTailsLogo {
  /** Hero sign (reposition with setPortrait). */
  sign: Group;
  /** Booth-side cat marks (children of the booth's space: booth centre at the origin). */
  sides: Group;
  readonly loaded: boolean;
  readonly portrait: boolean;
  setPortrait(portrait: boolean): void;
  /** Phones: fit the sign to the hero camera (eased; held still on shots that aren't a front view). */
  follow(camera: PerspectiveCamera, dt: number): void;
  setQuality(profile: QualityProfile): void;
  update(beat: BeatInfo, drop: number, reduced: boolean): void;
  dispose(): void;
}

/** Anisotropic filtering per tier (the sign is seen nearly face-on; the side marks at grazing angles). */
const ANISO = { high: 8, mid: 4, low: 2 } as const;

/** Soft backing behind the cut-out: a dark rounded glow that lifts the lockup off the bright moon. */
function backingMaterial() {
  return new ShaderMaterial({
    name: 'rave-tt-sign-backing',
    uniforms: {
      uLevel: { value: 1 },
      uWarm: { value: new Color(1.0, 0.55, 0.12) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLevel;
      uniform vec3 uWarm;
      varying vec2 vUv;
      void main() {
        // Soft elliptical shade that fades to nothing well inside the quad (no visible panel edge): a dark
        // plum (the logo's own outline colour) behind the cut-out, with a faint warm backlight in the middle.
        vec2 q = (vUv - 0.5) * 2.0;
        float d = length(q * vec2(0.92, 1.0));
        // Dense enough in the middle that the lockup still reads when it sits on the pale moon (phones).
        float shade = 1.0 - smoothstep(0.4, 0.98, d);
        float back = (1.0 - smoothstep(0.0, 0.7, d)) * 0.1 * uLevel;
        gl_FragColor = vec4(vec3(0.045, 0.012, 0.055) + uWarm * back, shade * shade * 0.78);
        ${OUTPUT}
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    fog: false,
  });
}

export function createTokenTailsLogo(
  booth: { w: number; h: number; d: number },
  renderer: WebGLRenderer | null,
  profile: QualityProfile,
  loader: TextureLoader = new TextureLoader(),
): TokenTailsLogo {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(o: T): T => (disposables.push(o), o);
  let pending = 2;
  let portrait = false;
  const maxAniso = () => Math.max(1, renderer?.capabilities.getMaxAnisotropy?.() ?? 1);

  const textures: Texture[] = [];
  const loadTex = (file: string, mat: MeshBasicMaterial) => {
    const t = loader.load(
      brandUrl(file),
      () => {
        t.needsUpdate = true;
        mat.opacity = 1;
        pending -= 1;
      },
      undefined,
      () => {
        pending -= 1; // settle `loaded`; the plane just stays hidden (opacity 0)
        console.warn(`[rave] Token Tails logo failed to load: ${file}`);
      },
    );
    t.colorSpace = SRGBColorSpace;
    t.premultiplyAlpha = true;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.anisotropy = Math.min(maxAniso(), ANISO[profile.quality]);
    textures.push(keep(t));
    // The map is set from the start (the shader is compiled with it at boot); the plane stays invisible
    // (opacity 0) until the image arrives.
    mat.map = t;
    return t;
  };

  // ------------------------------------------------------------------ hero sign
  const sign = new Group();
  sign.name = 'tt-sign';
  sign.userData.noMirror = true; // far above the floor; the mirror pass would only add a smear at the horizon
  const signGeo = keep(new PlaneGeometry(TT_LOGO_ASPECT, 1));
  // Premultiplied texels → ONE / ONE_MINUS_SRC_ALPHA blending (three's `premultipliedAlpha` would multiply again).
  const premultiplied = {
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  } as const;
  const signMat = keep(
    new MeshBasicMaterial({
      name: 'rave-tt-sign',
      transparent: true,
      opacity: 0,
      ...premultiplied,
      alphaTest: 0.1,
      depthWrite: true,
      toneMapped: true,
      fog: false,
      color: new Color(1, 1, 1),
    }),
  );
  loadTex(TT_LOGO_FILE, signMat);
  const signMesh = new Mesh(signGeo, signMat);
  signMesh.name = 'tt-sign-logo';
  signMesh.renderOrder = 2;
  const backingGeo = keep(new PlaneGeometry(TT_LOGO_ASPECT * 1.3, 1.45));
  const backingMat = keep(backingMaterial());
  const backing = new Mesh(backingGeo, backingMat);
  backing.name = 'tt-sign-backing';
  backing.position.z = -0.05;
  backing.renderOrder = 1;
  sign.add(backing, signMesh);

  /** Live pose (eased on phones). */
  const cur = { y: 0, h: 1, z: 0 };
  let snap = true;
  const apply = () => {
    sign.position.set(0, cur.y, cur.z);
    sign.scale.set(cur.h, cur.h, 1);
  };
  const place = () => {
    const p = ttSignPose(portrait);
    cur.y = p.y;
    cur.h = p.h;
    cur.z = p.z;
    snap = true;
    apply();
  };
  place();
  const dir = new Vector3();
  /** Phone HUD limit (NDC), re-measured twice a second from the real HUD (it changes height in demo mode). */
  let topNdc = hudTopNdc(844);
  let hudAge = Infinity;
  const measureHud = () => {
    if (typeof document === 'undefined') return;
    const canvas = renderer?.domElement;
    const box = canvas?.getBoundingClientRect?.();
    const h = box && box.height > 0 ? box.height : window.innerHeight;
    const counter = document.querySelector('.rv-counter')?.getBoundingClientRect();
    topNdc = counter && counter.height > 0 ? hudTopNdc(h, counter.bottom - (box?.top ?? 0)) : hudTopNdc(h, 0);
  };

  // ------------------------------------------------------------------ booth sides
  const sides = new Group();
  sides.name = 'tt-booth-sides';
  const rimGeo = keep(new PlaneGeometry(TT_SIDE_PLATE.w + 0.04, TT_SIDE_PLATE.h + 0.04));
  const rimMat = keep(
    new MeshBasicMaterial({
      name: 'rave-tt-side-rim',
      color: new Color(1.4, 0.75, 0.2),
      toneMapped: true,
    }),
  );
  const plateGeo = keep(new PlaneGeometry(TT_SIDE_PLATE.w, TT_SIDE_PLATE.h));
  const plateMat = keep(
    new MeshBasicMaterial({
      name: 'rave-tt-side-plate',
      color: new Color(0x170a1c),
      toneMapped: true,
    }),
  );
  const markGeo = keep(new PlaneGeometry(TT_SIDE_MARK_H * TT_CAT_ASPECT, TT_SIDE_MARK_H));
  const markMat = keep(
    new MeshBasicMaterial({
      name: 'rave-tt-side-mark',
      transparent: true,
      opacity: 0,
      ...premultiplied,
      alphaTest: 0.1,
      depthWrite: false,
      toneMapped: true,
      color: new Color(1, 1, 1),
    }),
  );
  loadTex(TT_CAT_FILE, markMat);
  for (const sx of [-1, 1]) {
    const face = new Group();
    face.name = `tt-booth-side-${sx < 0 ? 'left' : 'right'}`;
    face.position.set(sx * (booth.w / 2 + 0.006), TT_SIDE_PLATE.y, 0);
    face.rotation.y = (sx * Math.PI) / 2;
    const rim = new Mesh(rimGeo, rimMat);
    const plate = new Mesh(plateGeo, plateMat);
    plate.position.z = 0.002;
    const mark = new Mesh(markGeo, markMat);
    mark.position.z = 0.004;
    face.add(rim, plate, mark);
    sides.add(face);
  }

  const glow = new Color();
  const warm = new Color(1.0, 0.55, 0.12);
  return {
    sign,
    sides,
    get loaded() {
      return pending <= 0;
    },
    get portrait() {
      return portrait;
    },
    setPortrait(p) {
      if (p === portrait) return;
      portrait = p;
      place();
    },
    follow(camera, dt) {
      if (!portrait) return;
      camera.getWorldDirection(dir);
      const pos = camera.position;
      // Only a front view of the stage (hero, crowd POV) refits the sign; orbit, top-down, the DJ close-up and
      // sweeps hold the last fit, so the sign never slides around while the camera flies.
      const front = dir.z < -0.95 && Math.abs(pos.x) < 2.5 && pos.z > 5 && pos.z < 24 && pos.y < 6;
      if (!front) return;
      hudAge += dt;
      if (hudAge > 0.5) {
        hudAge = 0;
        measureHud();
      }
      const t = portraitSignPose(
        {
          x: pos.x,
          y: pos.y,
          z: pos.z,
          pitch: (Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI,
          fov: camera.fov,
          aspect: camera.aspect,
        },
        topNdc,
      );
      // Eased over ~0.5 s: smooths camera blends between hero framings and the director's kick punch on fov.
      const k = snap ? 1 : 1 - Math.exp(-Math.max(0, dt) * 2);
      snap = false;
      cur.y += (t.y - cur.y) * k;
      cur.h += (t.h - cur.h) * k;
      cur.z = t.z;
      apply();
    },
    setQuality(p) {
      const a = Math.min(maxAniso(), ANISO[p.quality]);
      for (const t of textures) {
        if (t.anisotropy !== a) {
          t.anisotropy = a;
          if (t.image) t.needsUpdate = true;
        }
      }
    },
    update(beat, drop, reduced) {
      const level = signLevel(beat.kick, beat.energy, drop, reduced);
      signMat.color.setScalar(level);
      backingMat.uniforms.uLevel.value = level;
      // Side rims breathe with the booth's light box.
      rimMat.color.copy(glow.copy(warm).multiplyScalar(1.1 + 0.35 * beat.kick * beat.energy * (reduced ? 0.4 : 1)));
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
