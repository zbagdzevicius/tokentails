/**
 * Cat fur material: flat-shaded Lambert with the coat pattern computed in the shader from procedural
 * masks in cat space (GDD 11.1). Every fur vertex carries `aCat` (its rest-pose position in cat
 * space, so stripes stay glued to a moving leg or tail) and `aFur` (1 = fur, 0 = keep the vertex
 * colour: inner ears, nose, collar, hats). All 7 patterns (solid, tabby, tuxedo, bicolor, calico, colorpoint,
 * tortie) are masks from `actors/patterns.ts` (the GLSL there mirrors the tested CPU version).
 *
 * The cat rig is one rigidly skinned mesh (GDD 11.2: "one skinned material"), so this material also runs with
 * USE_SKINNING. `createInstancedCatMaterial` is the spectator variant: colours and pattern per instance
 * (instanced attributes iBase, iSec, iTer, iPat) so 15 cameo cats draw in one call.
 *
 * Cat space: metres, origin on the ground under the body centre, +z toward the head, y up.
 */
import { Color, MeshLambertMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import type { CatSpec } from '../types';
import { PATTERN_INDEX, catColors } from './palette';
import { PATTERN_GLSL } from './actors/patterns';

export interface CatMaterial extends MeshLambertMaterial {
  userData: {
    uniforms: {
      uBase: { value: Color };
      uSec: { value: Color };
      uTer: { value: Color };
      uPattern: { value: number };
    };
  };
}

const VERT_HEAD = /* glsl */ `
attribute vec3 aCat;
attribute float aFur;
varying vec3 vCat;
varying float vFur;
`;

const VERT_HEAD_INST = /* glsl */ `
attribute vec3 aCat;
attribute float aFur;
attribute vec3 iBase;
attribute vec3 iSec;
attribute vec3 iTer;
attribute float iPat;
varying vec3 vCat;
varying float vFur;
varying vec3 vBase;
varying vec3 vSec;
varying vec3 vTer;
varying float vPat;
`;

const FRAG_HEAD = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uSec;
uniform vec3 uTer;
uniform int uPattern;
varying vec3 vCat;
varying float vFur;
int bcPat() { return uPattern; }
${PATTERN_GLSL}
`;

const FRAG_HEAD_INST = /* glsl */ `
varying vec3 vCat;
varying float vFur;
varying vec3 vBase;
varying vec3 vSec;
varying vec3 vTer;
varying float vPat;
#define uBase vBase
#define uSec vSec
#define uTer vTer
int bcPat() { return int(vPat + 0.5); }
${PATTERN_GLSL}
`;

const FRAG_MIX = '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, bcFur(), vFur);';

/** One fur material per cat (uniforms carry its colours and pattern). */
export function createCatMaterial(spec: CatSpec): CatMaterial {
  const mat = new MeshLambertMaterial({ flatShading: true, vertexColors: true }) as CatMaterial;
  const cc = catColors(spec);
  const uniforms = {
    uBase: { value: new Color(cc.base) },
    uSec: { value: new Color(cc.secondary) },
    uTer: { value: new Color(cc.tertiary) },
    uPattern: { value: PATTERN_INDEX[spec.pattern] ?? 0 },
  };
  mat.userData = { uniforms };
  mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCat = aCat; vFur = aFur;');
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', FRAG_MIX);
  };
  mat.customProgramCacheKey = () => 'bc-cat-fur';
  return mat;
}

/** Spectator cats: per-instance coat (iBase/iSec/iTer linear RGB, iPat pattern index). */
export function createInstancedCatMaterial(): MeshLambertMaterial {
  const mat = new MeshLambertMaterial({ flatShading: true, vertexColors: true });
  mat.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.vertexShader =
      VERT_HEAD_INST +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCat = aCat; vFur = aFur; vBase = iBase; vSec = iSec; vTer = iTer; vPat = iPat;');
    sh.fragmentShader = FRAG_HEAD_INST + sh.fragmentShader.replace('#include <color_fragment>', FRAG_MIX);
  };
  mat.customProgramCacheKey = () => 'bc-cat-fur-inst';
  return mat;
}

/** Re-colour an existing cat material in place (cat maker live preview). */
export function updateCatMaterial(mat: CatMaterial, spec: CatSpec): void {
  const cc = catColors(spec);
  const u = mat.userData.uniforms;
  u.uBase.value.setHex(cc.base);
  u.uSec.value.setHex(cc.secondary);
  u.uTer.value.setHex(cc.tertiary);
  u.uPattern.value = PATTERN_INDEX[spec.pattern] ?? 0;
}
