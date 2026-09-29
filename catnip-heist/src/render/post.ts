/**
 * Post-processing chain shared by the heist renderer, the title diorama and the Cat Yard.
 *
 *   RenderPass (HDR half-float target, MSAA)  ->  UnrealBloomPass (half res, threshold ~1)
 *   ->  FinalPass: exposure, split-tone colour grade, saturation/contrast, vignette, screen flash,
 *       linear -> sRGB.
 *
 * Bloom is "selective" by threshold: lit diffuse surfaces stay under ~1.0 in linear HDR, while
 * emissive things (portal, coins, plates, cone rims, signs, lamps) use colours > 1 (see `hdr()`),
 * so only they glow. On the low tier the chain is skipped entirely (see quality.ts).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** An emissive colour boosted above 1 so it passes the bloom threshold (HDR target only). */
export function hdr(hex: THREE.ColorRepresentation, intensity = 2.5): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(intensity);
}

export interface GradeOptions {
  exposure?: number;
  /** Tint added to the shadows (linear RGB, small values). */
  shadowTint?: [number, number, number];
  /** Multiplier for the highlights. */
  highlightTint?: [number, number, number];
  saturation?: number;
  contrast?: number;
  /** 0..1 corner darkening. */
  vignette?: number;
  /** Vignette colour (linear). */
  vignetteColor?: [number, number, number];
}

export interface PostOptions extends GradeOptions {
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  /** MSAA samples of the scene target (0 = off). */
  samples?: number;
}

const FinalShader = {
  name: 'CatnipFinal',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1 },
    uShadowTint: { value: new THREE.Vector3(0.012, 0.0, 0.03) },
    uHighTint: { value: new THREE.Vector3(1.04, 1.0, 0.94) },
    uSat: { value: 1.08 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.42 },
    uVigColor: { value: new THREE.Vector3(0.02, 0.004, 0.03) },
    uFlash: { value: new THREE.Vector4(1, 0.1, 0.05, 0) },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure, uSat, uContrast, uVignette, uAspect;
    uniform vec3 uShadowTint, uHighTint, uVigColor;
    uniform vec4 uFlash;
    varying vec2 vUv;
    vec3 toSRGB(vec3 c) {
      c = max(c, 0.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Split tone: plum lift in the shadows, warm highlights.
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.35, l));
      c *= mix(vec3(1.0), uHighTint, smoothstep(0.25, 1.0, l));
      // Soft shoulder so HDR emissives roll off instead of clipping flat.
      c = c / (1.0 + max(vec3(0.0), c - 0.85) * 0.55);
      vec3 s = toSRGB(c);
      float g = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(g), s, uSat);
      s = (s - 0.5) * uContrast + 0.5;
      // Vignette (aspect-aware ellipse).
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) / max(1.0, uAspect * 0.62);
      float v = smoothstep(0.35, 1.05, length(p) * 1.25);
      s = mix(s, toSRGB(uVigColor), v * uVignette);
      // Screen flash (spotted / win), stronger at the edges.
      float edge = mix(0.35, 1.0, smoothstep(0.1, 0.9, length(vUv - 0.5) * 1.6));
      s = mix(s, uFlash.rgb, clamp(uFlash.a * edge, 0.0, 1.0));
      gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
    }`,
};

export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private readonly final: ShaderPass;
  private readonly renderPass: RenderPass;
  private readonly renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, o: PostOptions = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples: o.samples ?? 4,
    });
    rt.texture.name = 'catnip.scene';
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), o.bloomStrength ?? 0.85, o.bloomRadius ?? 0.55, o.bloomThreshold ?? 1.0);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.final);
    this.setGrade(o);
  }

  setGrade(o: GradeOptions): void {
    const u = this.final.uniforms;
    if (o.exposure !== undefined) u.uExposure.value = o.exposure;
    if (o.shadowTint) (u.uShadowTint.value as THREE.Vector3).set(...o.shadowTint);
    if (o.highlightTint) (u.uHighTint.value as THREE.Vector3).set(...o.highlightTint);
    if (o.saturation !== undefined) u.uSat.value = o.saturation;
    if (o.contrast !== undefined) u.uContrast.value = o.contrast;
    if (o.vignette !== undefined) u.uVignette.value = o.vignette;
    if (o.vignetteColor) (u.uVigColor.value as THREE.Vector3).set(...o.vignetteColor);
  }

  /** Full-screen flash: colour (sRGB hex) and amount 0..1. */
  setFlash(color: THREE.ColorRepresentation, amount: number): void {
    const c = new THREE.Color(color);
    (this.final.uniforms.uFlash.value as THREE.Vector4).set(c.r, c.g, c.b, Math.max(0, Math.min(1, amount)));
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
  }

  /** CSS size in pixels; the pixel ratio is read from the renderer. */
  setSize(width: number, height: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.final.uniforms.uAspect.value = width / Math.max(1, height);
  }

  render(dt?: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose();
    this.final.dispose?.();
    this.composer.dispose?.();
  }
}
