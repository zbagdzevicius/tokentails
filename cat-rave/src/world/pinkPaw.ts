/**
 * Pink Paw in the world, always on: the rave raises money for the Pink Paw (Rožinė pėdutė) cat shelter, so its
 * logo hangs on stage as a lit sign: the round logo on its own white disc, a pink neon rim, a soft pink glow
 * that breathes with the kick, and a small caption plate under it ("ALL PROCEEDS → / PINK PAW SHELTER").
 * Layout and the occlusion maths live in pinkPawLayout.ts.
 *
 * The logo is the shelter's own file (copied unmodified to public/brand/, see SOURCE.md there): sRGB,
 * premultiplied on upload, hidden until it arrives. If it fails, the disc, rim and glow stay hidden and only the
 * caption shows. The caption is drawn on a canvas (Lilita One once the page font is ready); without a
 * DOM (tests) it is skipped. On phones the sign is fitted to the hero camera (`follow`), like the Token Tails
 * sign; landscape keeps one pose.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  CustomBlending,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  RingGeometry,
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
import { PP_CAPTION, PP_LANDSCAPE, PP_LOGO_FILE, PP_PARTS, pinkPawPortraitPose, ppGlowLevel, type PinkPawPose } from './pinkPawLayout';
import { hudTopNdc } from './ttLogoLayout';

export interface PinkPawSign {
  group: Group;
  readonly loaded: boolean;
  readonly portrait: boolean;
  setPortrait(portrait: boolean): void;
  /** Phones: fit the sign to the hero camera (eased; held still on shots that aren't a front view). */
  follow(camera: PerspectiveCamera, dt: number): void;
  setQuality(profile: QualityProfile): void;
  update(beat: BeatInfo, drop: number, reduced: boolean): void;
  dispose(): void;
}

const ANISO = { high: 8, mid: 4, low: 2 } as const;
const PINK = new Color(1.0, 0.24, 0.6);

/** Soft round pink glow behind the disc (additive, fades to nothing well inside its quad). */
function glowMaterial() {
  return new ShaderMaterial({
    name: 'rave-pinkpaw-glow',
    uniforms: { uLevel: { value: 1 }, uColor: { value: PINK.clone() } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLevel;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        // Disc edge at d ~ 0.53 (radius 0.5 of a 1.9-wide quad); the halo starts just inside it.
        float halo = (1.0 - smoothstep(0.24, 1.0, d));
        float a = halo * halo * 0.55 * uLevel;
        gl_FragColor = vec4(uColor * a, 1.0);
        ${OUTPUT}
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  });
}

/** Caption plate: a rounded dark plum pill with a pink edge and two lines of text. Null without a DOM. */
function drawCaption(canvas: HTMLCanvasElement, font: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const r = h * 0.28;
  const pad = 6;
  ctx.beginPath();
  ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.fillStyle = 'rgba(28, 6, 26, 0.9)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ff5fa8';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fit = (text: string, px: number, maxW: number) => {
    let size = px;
    ctx.font = `${size}px ${font}`;
    while (size > 10 && ctx.measureText(text).width > maxW) {
      size -= 2;
      ctx.font = `${size}px ${font}`;
    }
  };
  fit(PP_CAPTION[0], h * 0.27, w * 0.82);
  ctx.fillStyle = '#ffe3f1';
  ctx.fillText(PP_CAPTION[0], w / 2, h * 0.34);
  fit(PP_CAPTION[1], h * 0.33, w * 0.86);
  ctx.fillStyle = '#ff6fb3';
  ctx.fillText(PP_CAPTION[1], w / 2, h * 0.68);
  return true;
}

export function createPinkPawSign(
  renderer: WebGLRenderer | null,
  profile: QualityProfile,
  loader: TextureLoader = new TextureLoader(),
): PinkPawSign {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(o: T): T => (disposables.push(o), o);
  let pending = 1;
  let portrait = false;
  const maxAniso = () => Math.max(1, renderer?.capabilities.getMaxAnisotropy?.() ?? 1);
  const textures: Texture[] = [];

  const group = new Group();
  group.name = 'pinkpaw-sign';
  group.userData.noMirror = true; // floats over the stage; its reflection would only smear behind the booth

  // ------------------------------------------------------------------ glow, rim, disc
  const glowMat = keep(glowMaterial());
  const glow = new Mesh(keep(new PlaneGeometry(PP_PARTS.glow, PP_PARTS.glow)), glowMat);
  glow.name = 'pinkpaw-glow';
  glow.position.z = -0.03;
  glow.renderOrder = 1;
  glow.visible = false; // only with the logo: a halo round nothing reads as a stray pink blob

  const rimMat = keep(new MeshBasicMaterial({ name: 'rave-pinkpaw-rim', color: PINK.clone().multiplyScalar(1.6), toneMapped: true, transparent: true, opacity: 0 }));
  const rim = new Mesh(keep(new RingGeometry(0.49, PP_PARTS.rim, 64)), rimMat);
  rim.name = 'pinkpaw-rim';
  rim.position.z = -0.01;
  rim.renderOrder = 2;

  // Premultiplied texels → ONE / ONE_MINUS_SRC_ALPHA (three's `premultipliedAlpha` would multiply again).
  const discMat = keep(
    new MeshBasicMaterial({
      name: 'rave-pinkpaw-logo',
      transparent: true,
      opacity: 0,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      alphaTest: 0.1,
      depthWrite: true,
      toneMapped: true,
      fog: false,
      color: new Color(1, 1, 1),
    }),
  );
  const tex = loader.load(
    brandUrl(PP_LOGO_FILE),
    () => {
      tex.needsUpdate = true;
      discMat.opacity = 1;
      rimMat.opacity = 1;
      glow.visible = true;
      pending -= 1;
    },
    undefined,
    () => {
      pending -= 1; // settle `loaded`; the disc, rim and glow stay hidden, the caption still says it
      console.warn(`[rave] Pink Paw logo failed to load: ${PP_LOGO_FILE}`);
    },
  );
  tex.colorSpace = SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = Math.min(maxAniso(), ANISO[profile.quality]);
  textures.push(keep(tex));
  discMat.map = tex;
  const disc = new Mesh(keep(new CircleGeometry(0.5, 64)), discMat);
  disc.name = 'pinkpaw-logo';
  disc.renderOrder = 3;
  group.add(glow, rim, disc);

  // ------------------------------------------------------------------ caption plate
  const c = PP_PARTS.caption;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas && canvas.getContext('2d')) {
    canvas.width = 512;
    canvas.height = Math.round((512 * c.h) / c.w);
    drawCaption(canvas, 'system-ui, sans-serif');
    const capTex = keep(new CanvasTexture(canvas));
    capTex.colorSpace = SRGBColorSpace;
    capTex.premultiplyAlpha = true;
    capTex.minFilter = LinearMipmapLinearFilter;
    capTex.magFilter = LinearFilter;
    capTex.anisotropy = tex.anisotropy;
    textures.push(capTex);
    const capMat = keep(
      new MeshBasicMaterial({
        name: 'rave-pinkpaw-caption',
        map: capTex,
        transparent: true,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        depthWrite: false,
        toneMapped: true,
        fog: false,
      }),
    );
    const cap = new Mesh(keep(new PlaneGeometry(c.w, c.h)), capMat);
    cap.name = 'pinkpaw-caption';
    cap.position.y = c.y;
    cap.renderOrder = 3;
    group.add(cap);
    // Redraw in the page's display font once it is ready (the HUD loads it).
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts
      ?.load('40px "Lilita One"')
      .then((faces) => {
        if (!faces.length || !canvas) return;
        drawCaption(canvas, '"Lilita One", system-ui, sans-serif');
        capTex.needsUpdate = true;
      })
      .catch(() => {});
  }

  // ------------------------------------------------------------------ pose
  const cur: PinkPawPose = { ...PP_LANDSCAPE };
  let snap = true;
  const apply = () => {
    group.position.set(cur.x, cur.y, cur.z);
    group.scale.setScalar(cur.s);
  };
  const place = () => {
    Object.assign(cur, PP_LANDSCAPE);
    snap = true;
    apply();
  };
  place();
  const dir = new Vector3();
  let topNdc = hudTopNdc(844);
  let hudAge = Infinity;
  const measureHud = () => {
    if (typeof document === 'undefined') return;
    const el = renderer?.domElement;
    const box = el?.getBoundingClientRect?.();
    const h = box && box.height > 0 ? box.height : window.innerHeight;
    const counter = document.querySelector('.rv-counter')?.getBoundingClientRect();
    topNdc = counter && counter.height > 0 ? hudTopNdc(h, counter.bottom - (box?.top ?? 0)) : hudTopNdc(h, 0);
  };

  const level = { v: 1 };
  return {
    group,
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
      // Same rule as the Token Tails sign: only a front view of the stage refits; other shots hold the last fit.
      const front = dir.z < -0.95 && Math.abs(pos.x) < 2.5 && pos.z > 5 && pos.z < 24 && pos.y < 6;
      if (!front) return;
      hudAge += dt;
      if (hudAge > 0.5) {
        hudAge = 0;
        measureHud();
      }
      const t = pinkPawPortraitPose(
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
      const k = snap ? 1 : 1 - Math.exp(-Math.max(0, dt) * 2);
      snap = false;
      cur.x += (t.x - cur.x) * k;
      cur.y += (t.y - cur.y) * k;
      cur.s += (t.s - cur.s) * k;
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
      level.v = ppGlowLevel(beat.kick, beat.energy, drop, reduced);
      glowMat.uniforms.uLevel.value = level.v;
      rimMat.color.copy(PINK).multiplyScalar(1.4 * level.v);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}
