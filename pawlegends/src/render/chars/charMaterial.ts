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
}

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
  };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as CharMaterial;
  m.userData.u = u;
  m.onBeforeCompile = (shader) => {
    compiled++;
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash;\nuniform float uFlashK, uOpacity, uRim;')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          // ink rim: darken where the surface turns away from the eye (a soft PPK-style outline on every tier)
          'float plEdge = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));',
          'gl_FragColor.rgb *= 1.0 - uRim * smoothstep(0.62, 0.92, plEdge);',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash, uFlashK);',
          'gl_FragColor.a *= uOpacity;',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'pl-char-v1';
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
