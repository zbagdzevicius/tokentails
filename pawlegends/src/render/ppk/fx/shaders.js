// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/shaders.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/shaders.js  (owner: fx) — GLSL snippets shared by the fx materials (particles, telegraph marks, decals,
// mist, horde, trails). Every custom fx material:
//   - is built with `fxShaderMaterial(params)` (or patched with `withFxFog(mat)` after a clone). With `fog: true` it
//     gets world's height / focus fog (CONTROLS_SPEC §4.1, contract C4: `vFogW` + `HFOG_GLSL` + the shared HFOG
//     uniforms), so in the iso camera fx fog is measured from her exactly like the level geometry (the stage is clear,
//     the screen edges misty); additive materials fade to black in fog instead of tinting toward the fog colour;
//   - ends with <tonemapping_fragment> + <colorspace_fragment> so the Low preset (no composer) matches Med/High;
//   - clamps every pow() base and guards every normalize() (requests/characters.md: one NaN pixel + MSAA + bloom).
import * as THREE from 'three';
import { HFOG, HFOG_GLSL, patchFogVarying } from '../world/HeightFog.js';
import { UberGroup } from '../core/uber.js';

/** Uniform set for a fogged ShaderMaterial (merge with your own). */
export const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/**
 * CONTROLS_SPEC §4.1 / C4: give a fogged fx ShaderMaterial the world's fog maths (vFogW + HFOG_GLSL + the SHARED
 * HFOG uniform objects). Idempotent. Call it again after `material.clone()`: a clone deep-copies its uniforms, which
 * would detach the shared focus / clear / mode values. Env's scene patcher skips the material afterwards (`userData.hfog`).
 * @template {THREE.ShaderMaterial} M @param {M} mat @returns {M}
 */
export function withFxFog(mat) {
  if (mat?.isUberMaterial) { Object.assign(mat.uniforms, HFOG); mat.userData.hfog = true; return mat; }   // linked: patched once in FX_UBER
  if (!mat?.fog || typeof mat.fragmentShader !== 'string') return mat;
  if (!mat.fragmentShader.includes('varying vec3 vFogW')) {
    // patchFogVarying treats any source that mentions `hfogFactor` as already patched, and FOG_FACTOR calls it:
    // hide the calls while it patches, then put them back
    mat.fragmentShader = mat.fragmentShader.replace(/\bhfog(Factor|Color)\b/g, '__fxHfog$1');
    patchFogVarying(mat);
    mat.fragmentShader = mat.fragmentShader.replace(/__fxHfog(Factor|Color)/g, 'hfog$1');
  }
  mat.uniforms ??= {};
  Object.assign(mat.uniforms, HFOG);
  mat.userData.hfog = true;
  return mat;
}


/**
 * Fragment helpers: the fog factor 0..1 and the fog colour at this fragment, the same values the level geometry gets
 * here (lens fog in cutscenes / Meme Cam / `?cam=classic`, focus fog in the iso play camera). Needs
 * <fog_pars_fragment> and <fog_vertex>, patched by `withFxFog` (`hfogFactor` / `hfogColor` are world's HFOG_GLSL).
 */
export const FOG_FACTOR = /* glsl */`
float fxFog() {
#ifdef USE_FOG
  return hfogFactor( vFogW, vFogDepth );
#else
  return 0.0;
#endif
}
vec3 fxFogColor() {
#ifdef USE_FOG
  return hfogColor( vFogW );
#else
  return vec3( 0.0 );
#endif
}`;

/** Shared 2D shape library (uv in [-1, 1]). Returns vec2(coverage, shade). Shape ids: see SHAPE in Particles.js. */
export const SHAPES = /* glsl */`
float fxDot2( vec2 v ) { return dot( v, v ); }
// iq: n-point star, m in [2, n] controls the point sharpness
float fxStar( vec2 p, float r, float n, float m ) {
  float an = 3.141593 / n, en = 3.141593 / m;
  vec2 acs = vec2( cos( an ), sin( an ) ), ecs = vec2( cos( en ), sin( en ) );
  float bn = mod( atan( p.x, p.y ), 2.0 * an ) - an;
  p = length( p ) * vec2( cos( bn ), abs( sin( bn ) ) );
  p -= r * acs;
  p += ecs * clamp( - dot( p, ecs ), 0.0, r * acs.y / ecs.y );
  return length( p ) * sign( p.x );
}
// iq: heart (p.y from 0 at the tip to ~1 at the lobes)
float fxHeart( vec2 p ) {
  p.x = abs( p.x );
  if ( p.y + p.x > 1.0 ) return sqrt( fxDot2( p - vec2( 0.25, 0.75 ) ) ) - 0.3535534;
  return sqrt( min( fxDot2( p - vec2( 0.0, 1.0 ) ), fxDot2( p - 0.5 * max( p.x + p.y, 0.0 ) ) ) ) * sign( p.x - p.y );
}
float fxAA( float d, float w ) { return 1.0 - smoothstep( -w, w, d ); }

vec2 fxShape( float shape, vec2 uv ) {
  float d = length( uv );
  int s = int( shape + 0.5 );
  if ( s == 0 ) {                                   // SOFT: round glow
    float g = exp( -d * d * 4.5 ) * ( 1.0 - smoothstep( 0.8, 1.0, d ) );
    return vec2( g, 1.0 );
  } else if ( s == 1 ) {                            // PUFF: cotton ball, lit from the upper left
    float a = 1.0 - smoothstep( 0.72, 1.0, d );
    vec3 n = vec3( uv, sqrt( max( 1.0 - d * d, 0.0 ) ) );
    float l = clamp( dot( n, normalize( vec3( -0.45, 0.75, 0.55 ) ) ), 0.0, 1.0 );
    return vec2( a, 0.7 + 0.38 * l );
  } else if ( s == 2 ) {                            // STAR4: twinkle (art.md §8)
    vec2 c = uv * 0.5;
    float core = pow( max( 1.0 - smoothstep( 0.0, 0.5, d * 0.5 ), 0.0 ), 3.0 );
    float star = max( 0.0, 1.0 - abs( c.x ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.y ) ) )
               + max( 0.0, 1.0 - abs( c.y ) * 16.0 ) * ( 1.0 - smoothstep( 0.0, 0.5, abs( c.x ) ) );
    return vec2( clamp( core + star * 0.8, 0.0, 1.0 ), 1.0 );
  } else if ( s == 3 ) {                            // STAR5: chunky cartoon hit-star
    float sd = fxStar( uv, 0.9, 5.0, 2.6 );
    float a = fxAA( sd, 0.06 );
    return vec2( a, 1.0 - 0.25 * smoothstep( -0.35, 0.0, sd ) );
  } else if ( s == 4 ) {                            // RING
    float a = 1.0 - smoothstep( 0.06, 0.16, abs( d - 0.82 ) );
    return vec2( a, 1.0 );
  } else if ( s == 5 ) {                            // SPARK: tapered streak along uv.y
    float w = 1.0 - smoothstep( 0.0, 1.0, abs( uv.x ) * ( 1.6 + 1.4 * abs( uv.y ) ) );
    float a = w * ( 1.0 - smoothstep( 0.55, 1.0, abs( uv.y ) ) );
    return vec2( a, 1.0 );
  } else if ( s == 6 ) {                            // HEART
    float sd = fxHeart( uv * vec2( 0.62, 0.62 ) + vec2( 0.0, 0.48 ) );
    return vec2( fxAA( sd, 0.03 ), 1.0 - 0.2 * smoothstep( -0.2, 0.0, sd ) );
  } else if ( s == 7 ) {                            // FEATHER: leaf with a spine
    float e = fxDot2( vec2( uv.x * 2.6, uv.y ) );
    float a = 1.0 - smoothstep( 0.75, 1.0, e );
    float spine = 1.0 - smoothstep( 0.0, 0.08, abs( uv.x ) );
    return vec2( a, 0.85 + 0.25 * spine - 0.15 * uv.y );
  } else if ( s == 8 ) {                            // DROPLET: teardrop pointing up
    vec2 p = uv; p.y += 0.25;
    float r = 0.62 - 0.38 * clamp( p.y, 0.0, 1.0 );
    float a = 1.0 - smoothstep( r - 0.08, r, length( vec2( p.x, max( p.y, 0.0 ) * 0.55 + min( p.y, 0.0 ) ) ) );
    vec3 n = vec3( uv, sqrt( max( 1.0 - d * d, 0.0 ) ) );
    return vec2( a, 0.75 + 0.5 * clamp( dot( n, vec3( -0.5, 0.6, 0.6 ) ), 0.0, 1.0 ) );
  } else if ( s == 9 ) {                            // SHARD: kite / chip
    float sd = abs( uv.x ) * 1.7 + abs( uv.y ) - 0.9;
    return vec2( fxAA( sd, 0.05 ), 0.8 + 0.3 * step( 0.0, uv.x ) );
  } else if ( s == 10 ) {                           // STAR8: thin 8-point star with a soft core
    float sd = fxStar( uv, 0.95, 8.0, 5.5 );
    float a = max( fxAA( sd, 0.05 ), exp( -d * d * 10.0 ) );
    return vec2( a, 1.0 );
  } else if ( s == 11 ) {                           // FISH (silhouette)
    float body = fxDot2( vec2( uv.x * 1.6 + 0.15, uv.y * 3.2 ) ) - 1.0;
    vec2 t = vec2( uv.x - 0.62, abs( uv.y ) );
    float tail = max( t.y - 0.05 - t.x * 1.2, -t.x ) ;
    float a = max( fxAA( body, 0.12 ), fxAA( max( tail, t.x - 0.32 ), 0.04 ) );
    return vec2( a, 0.85 + 0.25 * step( uv.y, 0.0 ) );
  } else if ( s == 12 ) {                           // CONFETTI: rounded paper rect (the flip squashes the quad's width)
    vec2 q = abs( uv ) - vec2( 0.5, 0.82 );
    float sd = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - 0.14;
    return vec2( fxAA( sd, 0.06 ), 0.82 + 0.3 * step( 0.0, uv.x * uv.y ) );
  } else if ( s == 13 ) {                           // PLUS: chunky rounded heal cross (ART §8.6), lit top-left
    vec2 a = abs( uv );
    vec2 q1 = a - vec2( 0.78, 0.28 ), q2 = a - vec2( 0.28, 0.78 );
    float b1 = length( max( q1, 0.0 ) ) + min( max( q1.x, q1.y ), 0.0 );
    float b2 = length( max( q2, 0.0 ) ) + min( max( q2.x, q2.y ), 0.0 );
    return vec2( fxAA( min( b1, b2 ) - 0.1, 0.06 ), 0.9 + 0.2 * step( uv.y, uv.x ) );
  }
  return vec2( 0.0, 1.0 );
}`;

/** Value noise + 2-octave fbm (mist cards, cloud). */
export const NOISE = /* glsl */`
float fxHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float fxNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( fxHash( i ), fxHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fxHash( i + vec2( 0.0, 1.0 ) ), fxHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float fxFbm2( vec2 p ) { return fxNoise( p ) * 0.65 + fxNoise( p * 2.13 + 17.1 ) * 0.35; }`;

/** Close a fragment shader: tone mapping + output colour space (no-ops inside the composer's linear RT). */
export const OUTPUT = /* glsl */`
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

/**
 * PERF_SPEC §1.2 / §3.5: every fx ShaderMaterial is a *module* of ONE linked uber program (core/uber.js), so the ~25
 * fx effects (particles, marks, telegraphs, decals, mist, trails, rays, holy, webs, horde, butterflies...) cost one
 * program (+ its instanced variant) instead of one each. The module keeps its own GLSL; `fxMode` picks it per material.
 * Exported so other areas' effect shaders can join the same program through `fxShaderMaterial` (characters' aura /
 * streak / sparkles, world's sky, combat's projectiles).
 */
export const FX_UBER = new UberGroup('fx', {
  libs: [{ match: HFOG_GLSL, emit: `#ifdef USE_FOG\n${HFOG_GLSL}\n#endif` }, FOG_FACTOR, SHAPES, NOISE],
  shared: [...Object.keys(HFOG), 'fogColor', 'fogDensity', 'fogNear', 'fogFar'],
  sharedVaryings: { vFogW: '#ifdef USE_FOG\nvarying vec3 vFogW;\n#endif' },
});

/**
 * Register an fx shader module at import time (so it is linked into the one program before anything compiles).
 * Same arguments as the material it will be used with (vertexShader, fragmentShader, side, fog, name).
 * @param {THREE.ShaderMaterialParameters & {instanced?: boolean}} params @returns {object} module record
 */
export function fxModule(params) {
  const src = patchFogVarying({ vertexShader: params.vertexShader, fragmentShader: params.fragmentShader, uniforms: {} });
  return FX_UBER.module({ vertexShader: src.vertexShader, fragmentShader: src.fragmentShader, side: params.side, fog: params.fog !== false, instanced: params.instanced, name: params.name });
}

/**
 * An fx ShaderMaterial (every fx shader material is built through this): a material of the linked `FX_UBER` program
 * running `params`' own shaders, with world's height / focus fog (C4). Always DoubleSide + single pass (a Front /
 * Back module discards the other face); `params.side` / `params.fog` keep their meaning per module.
 * @param {THREE.ShaderMaterialParameters & {instanced?: boolean}} params @returns {THREE.ShaderMaterial}
 */
export function fxShaderMaterial(params) {
  const { instanced, ...p } = params;
  const m = FX_UBER.material(fxModule(params), p);
  return withFxFog(m);
}

// ------------------------------------------------------------------ unlit "basic" module (PERF §1.2)

const BASIC_VERT = /* glsl */`
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = vec4( position, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const BASIC_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity, uUseMap;
uniform sampler2D uMap;
varying vec2 vUv;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  vec4 c = vec4( uColor, uOpacity );
  if ( uUseMap > 0.5 ) c *= texture2D( uMap, vUv );
  gl_FragColor = vec4( mix( c.rgb, fxFogColor(), fxFog() ), c.a );
  ${OUTPUT}
}`;
/** The basic module per (fog, side): registered at import so they are linked before anything compiles. */
const BASIC_MODS = new Map();
for (const fog of [true, false]) {
  for (const side of [THREE.FrontSide, THREE.DoubleSide, THREE.BackSide]) {
    BASIC_MODS.set(`${fog}|${side}`, fxModule({ name: `fx.basic${fog ? '' : '.nofog'}${side === THREE.FrontSide ? '' : side === THREE.DoubleSide ? '.double' : '.back'}`,
      vertexShader: BASIC_VERT, fragmentShader: BASIC_FRAG, fog, side, instanced: 'both' }));
  }
}

/** `color` / `fxMap` / `opacity` on a basic fx material read and write its uniforms (MeshBasicMaterial-like). */
function installBasic(m) {
  const u = m.uniforms;
  Object.defineProperty(m, 'color', { get: () => u.uColor.value, set: (v) => u.uColor.value.copy(v), configurable: true });
  // `fxMap`, never `map`: three keys USE_MAP into the program from `material.map` (a second program for textured ones)
  Object.defineProperty(m, 'fxMap', { get: () => u.uMap.value, set: (t) => { u.uMap.value = t ?? null; u.uUseMap.value = t ? 1 : 0; }, configurable: true });
  Object.defineProperty(m, 'opacity', { get: () => u.uOpacity.value, set: (v) => { u.uOpacity.value = v; }, configurable: true });
}

/**
 * An unlit material in the one fx program (PERF §1.2): the drop-in for a `MeshBasicMaterial` / `LineBasicMaterial`
 * with a colour, an optional map and opacity (eyes, contact blobs, whiskers, glints, glow cards, far silhouettes).
 * Works on plain, instanced and line meshes. `material.color` / `.fxMap` / `.opacity` stay live (they write uniforms).
 * Fog is world's height / focus fog (`fog: false` to skip it); everything else (blending, depth, polygon offset,
 * transparent, name) passes through.
 * @param {{ color?: THREE.ColorRepresentation, map?: THREE.Texture|null, opacity?: number, fog?: boolean,
 *           side?: THREE.Side } & THREE.MaterialParameters} [o]
 * @returns {THREE.ShaderMaterial}
 */
export function fxBasicMaterial(o = {}) {
  const { color = '#ffffff', map = null, opacity = 1, fog = true, side = THREE.FrontSide, ...rest } = o;
  const mod = BASIC_MODS.get(`${fog !== false}|${side}`) ?? BASIC_MODS.get('true|0');
  const uniforms = { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uMap: { value: map }, uUseMap: { value: map ? 1 : 0 } };
  const m = FX_UBER.material(mod, { ...rest, uniforms });
  m.userData.uber.install = installBasic;
  installBasic(m);
  m.userData.fxBasic = true;
  if (fog === false) m.userData.noHeightFog = true;
  return withFxFog(m);
}

/**
 * Does `m`'s shader apply fog? Linked fx materials always carry `fog: true` (one program); their module decides.
 * @param {THREE.Material} m @returns {boolean}
 */
export function fxFogged(m) { return m?.userData?.uber ? m.userData.uber.mod.fog !== false : !!m?.fog; }
