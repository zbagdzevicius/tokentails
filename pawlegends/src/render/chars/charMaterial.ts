/**
 * Character materials. `charMaterial`: vertex-coloured Lambert (so the global PPK toon ramp from render/toon.js
 * applies), skinned, with a hit flash, a stealth opacity and a dark ink rim on silhouette edges: the PPK outline look
 * at no extra draw call, which is all Low gets (POC.md §10: no outlines on Low). `outlineMaterial`: PPK's
 * Outline.js idea, an inverted hull pushed out a constant number of screen pixels, drawn as one extra skinned draw
 * per hero on Med and High. Both share one program each (customProgramCacheKey), whatever the hero.
 */
import * as THREE from 'three';

export interface CharUniforms {
  uFlashK: { value: number };
  uFlash: { value: THREE.Color };
  uOpacity: { value: number };
  uRim: { value: number };
  /** Card skins (GDD §7.2), Legendary rung on Med / High: the fur foil's strength (0 = off, the default). */
  uFoil: { value: number };
  /** The foil's tint (white mixed toward the skin's element). */
  uFoilColor: { value: THREE.Color };
}

/** Seconds for the foil sheen, shared by every character material (one write per frame: `setCharTime`). */
const TIME = { uTime: { value: 0 } };
export function setCharTime(t: number): void {
  TIME.uTime.value = t % 3000;
}
/** The foil band's period (s) and the strength a Legendary skin uses. */
export const FOIL_PERIOD = 3;
export const FOIL_STRENGTH = 0.15;

/** Shared by every outline material: NDC per pixel, set once per frame by the view (`setOutlineViewport`). */
const OUTLINE = { uPx: { value: new THREE.Vector2(2 / 1280, 2 / 720) }, uWidth: { value: 1.6 } };
export function setOutlineViewport(w: number, h: number): void {
  if (w > 0 && h > 0) OUTLINE.uPx.value.set(2 / w, 2 / h);
}

let compiled = 0;
export const charCompileCount = (): number => compiled;

export type CharMaterial = THREE.MeshLambertMaterial & { userData: { u: CharUniforms } };

export function charMaterial(rim = 0.55): CharMaterial {
  const u: CharUniforms = {
    uFlashK: { value: 0 },
    uFlash: { value: new THREE.Color(0xffffff) },
    uOpacity: { value: 1 },
    uRim: { value: rim },
    uFoil: { value: 0 },
    uFoilColor: { value: new THREE.Color(0xffffff) },
  };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as CharMaterial;
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    compiled++;
    Object.assign(shader.uniforms, u, TIME);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash, uFoilColor;\nuniform float uFlashK, uOpacity, uRim, uFoil, uTime;')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          // ink rim: darken where the surface turns away from the eye (a soft PPK-style outline on every tier)
          'float plEdge = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));',
          'gl_FragColor.rgb *= 1.0 - uRim * smoothstep(0.62, 0.92, plEdge);',
          // card skin foil (Legendary): a soft diagonal sheen band sweeping across the fur every FOIL_PERIOD s;
          // uniform-coherent (uFoil is per material, 0 for everyone else)
          `if (uFoil > 0.0) { float plB = fract((vViewPosition.x + vViewPosition.y) * 0.35 - uTime / ${FOIL_PERIOD.toFixed(1)});`,
          '  gl_FragColor.rgb += uFoilColor * uFoil * smoothstep(0.0, 0.12, plB) * (1.0 - smoothstep(0.12, 0.26, plB)); }',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash, uFlashK);',
          'gl_FragColor.a *= uOpacity;',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'pl-char-v2';
  return m;
}

/** Inverted-hull outline (back faces, flat ink colour, pushed out along the screen-space normal). */
export function outlineMaterial(color = 0x2a1a22): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    compiled++;
    Object.assign(shader.uniforms, OUTLINE);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uPx;\nuniform float uWidth;')
      .replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          '{ vec3 nv = normalize(normalMatrix * objectNormal);',
          '  vec2 d = nv.xy; float l = length(d); if (l > 1e-4) d /= l;',
          '  gl_Position.xy += d * uPx * uWidth * gl_Position.w; }',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'pl-char-outline-v1';
  return m;
}
