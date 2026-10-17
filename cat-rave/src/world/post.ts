/**
 * L-WORLD: post-processing via `postprocessing`: HDR render → mipmap bloom → vignette → ACES tone
 * mapping, in one effect pass. Only built for tiers with `bloom: true`.
 */
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { HalfFloatType, type Camera, type Scene, type WebGLRenderer } from 'three';
import type { QualityProfile } from '../types';

/** Largest HDR value the bloom pass ever sees (one bright laser emitter must not blow out a frame). */
export const HDR_MAX = 16;
/** Scene exposure (night: the cream crowd must not read as daylight). Applied before bloom. */
export const EXPOSURE = 0.85;

/** Composer pixel-ratio cap: bloom hides the softness; DPR 2 bloom cost 21–25 ms GPU on an M3 Pro. */
export const POST_DPR_CAP = 1.5;

const SANITIZE_GLSL = (v: string) => /* glsl */ `
  if (any(isnan(${v}.rgb)) || any(isinf(${v}.rgb))) ${v}.rgb = vec3(0.0);
  ${v}.rgb = min(max(${v}.rgb * ${EXPOSURE.toFixed(3)}, vec3(0.0)), vec3(${HDR_MAX.toFixed(1)}));`;

/**
 * Sanitize: replaces NaN/Inf with black and clamps HDR to 0..HDR_MAX (after exposure). The mipmap
 * blur spreads one NaN pixel across the whole screen (the desktop drop used to go fully black for a
 * few frames when an MSAA sample extrapolated a laser varying past its range).
 *
 * Runs first inside the one EffectPass (no extra full-screen pass); the bloom's own input is
 * sanitized by `sanitizeBloomInput` because the bloom reads the raw scene buffer.
 */
export class SanitizeEffect extends Effect {
  constructor() {
    super(
      'SanitizeEffect',
      /* glsl */ `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec4 c = inputColor;
        ${SANITIZE_GLSL('c')}
        outputColor = vec4(c.rgb, 1.0);
      }`,
      { blendFunction: BlendFunction.SRC },
    );
  }
}

/** Patches the bloom's luminance (threshold) shader to read sanitized, exposed HDR. */
export function sanitizeBloomInput(bloom: BloomEffect) {
  const m = bloom.luminanceMaterial;
  const read = 'vec4 texel=texture2D(inputBuffer,vUv);';
  if (!m.fragmentShader.includes(read)) throw new Error('postprocessing luminance shader changed');
  m.fragmentShader = m.fragmentShader.replace(read, `${read}${SANITIZE_GLSL('texel')}`);
  m.needsUpdate = true;
}

export function bloomSettings(profile: QualityProfile) {
  const q = profile.quality;
  return {
    intensity: 0.75,
    luminanceThreshold: 0.85,
    luminanceSmoothing: 0.28,
    radius: 0.45,
    levels: q === 'low' ? 4 : 6,
    /** Bloom hides edges; MSAA on a half-float DPR-2 target was most of the desktop GPU time. */
    multisampling: 0,
    /** Luminance (bloom source) resolution; the mip chain starts from it. */
    resolutionScale: q === 'high' ? 1 : 0.5,
  };
}

export function createPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, profile: QualityProfile) {
  const s = bloomSettings(profile);
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: s.multisampling });
  const renderPass = new RenderPass(scene, camera);
  const bloom = new BloomEffect({
    mipmapBlur: true,
    intensity: s.intensity,
    luminanceThreshold: s.luminanceThreshold,
    luminanceSmoothing: s.luminanceSmoothing,
    radius: s.radius,
    levels: s.levels,
  });
  bloom.luminancePass.resolution.scale = s.resolutionScale;
  sanitizeBloomInput(bloom);
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  // One full-screen pass: sanitize (SRC) → bloom (add) → vignette → ACES.
  const effects = new EffectPass(camera, new SanitizeEffect(), bloom, vignette, tone);
  composer.addPass(renderPass);
  composer.addPass(effects);
  let current: Camera = camera;

  return {
    composer,
    bloom,
    render(cam: Camera, dt: number) {
      if (cam !== current) {
        composer.setMainCamera(cam);
        current = cam;
      }
      composer.render(dt);
    },
    setSize(width: number, height: number) {
      composer.setSize(width, height, false);
    },
    /** Bloom pump: a little extra glow on the kick in drops. */
    setPump(extra: number) {
      bloom.intensity = s.intensity * (1 + extra);
    },
    dispose() {
      composer.dispose();
    },
  };
}
