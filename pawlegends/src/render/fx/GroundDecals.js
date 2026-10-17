// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/GroundDecals.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/GroundDecals.js  (owner: fx) — research/CONTROLS_SPEC.md §3, §5.4, §7.3, §7.4, §8.2, §10.3 ground indicators
// for the iso controls, restyled by WARM_ADVENTURE_SPEC §3 (one visual language: hue + shape + motion), all in ONE
// instanced draw (PERF §8.4 "≤ 2 draws" with the telegraph batch):
//   her       the hero / aim ring (pink #FF8FB1 α 0.55, 0.08 m wide, a notch along the aim), the heart arc at her feet
//             (WA §3.5a: one segment per heart, shown 2.5 s after an HP change and while HP ≤ 1), the Stand fan (cream,
//             3 Grit notches, gold through the parry window, warm grey through the whiff lockout), the charge reach,
//             the gold parry spark ring, the landing ring + Pounce dive circle while airborne, the Riposte arrow, the
//             Golden Hour gleam lanes, the slash smear;
//   threats   strike wedges under every melee wind-up (rim α 0.6 through 70 % of the wind-up, thicker + glyph pop at
//             parry-window open, a white strike flash) with the kind's GLYPH at the tip (WA §3.4: shield / 8-point
//             star / double chevron / paw-hand), the shrinking parry ring, the red dodge chevron, bolt ground dots,
//             coral aggro rings; plus the glyphs Telegraphs queues for its discs, lanes and aim lines (`glyph()`);
//   friends   companions get a sky dashed ring (WA3), interactables a pulsing mint ring (WA2, ≤ 6 within 8 m);
//   targets   the selection ring (gold, rotating; red during its wind-up), hover rings (cream enemy / mint
//             interactable / white NPC + `characters.setHighlight` on the actor);
//   orders    the tap ripple (pink ring, cream paw, 4 collapsing ticks), gold attack rings, the warm-grey ✕ paw when
//             unreachable, queued waypoints, 3 dots along the next segment while RMB is held, pink paws every 1.2 m
//             along the path with `settings.pathPreview` ('auto' = touch on the prologue / Chapter 1 meadow), the goal;
//   overlays  the companion ability indicator, the ranges overlay while the peek hold (Z / MMB) is down, the tutorial ghost-paw spot;
//   guide     TOKENTAILS-PLAN §10.2 the Pink Paw trail (GuideTrail below): ≤ 14 Token Tails paw prints (ivory pad,
//             love-pink beans, maroon rim) along the nav path to ui's guide target, in this same draw.
// Contact blobs moved to BlobShadows.js (PERF §7.2): this pool draws no blobs.
//
// Every mark gets the WA §3.2 rule-4 "ink sandwich": a 0.03 m cocoa #4A2A1F outer edge at α 0.35, drawn by the same
// instance (the fragment shader evaluates the shape twice: as drawn, and grown by the ink width), so it reads on cream
// path and on grass alike at 0 extra instances. Her own indicators are pulled 0.45 m toward the lens in view space
// (`aExtra.w`): they read over grass and ground bumps but still tuck behind her body and real occluders.
import * as THREE from 'three';
import { E } from '../ppk/core/events.js';
import { PLAYER, ATTACKS, TELEGRAPH, AIM, CAMERA, CLASS_MARKS } from '../ppk/core/config.js';
import { setHighlight } from '../ppk/stubs/characters/Readability.js';
import { FX_COLORS } from '../ppk/fx/palette.js';
import { fxShaderMaterial } from '../ppk/fx/shaders.js';
import { findPath } from '../ppk/stubs/physics/Pathfind.js';

const MAX = 160;
/** decal shapes (aParams.x) */
export const DECAL = Object.freeze({ RING: 0, DISC: 1, FAN: 2, CROSS: 3, DASH: 4, RECT: 5, PAW: 6, STAR: 7, CHEVRON: 8, ARROW: 9, LANE: 10, FAN_RED: 11, TICKS: 12,
  SHIELD: 13, DOTS6: 14, CROWFOOT: 15, CHEV2: 16, ARROWHEAD: 17 });
/** WA §3.4: the telegraph glyph name (config `TELEGRAPH.glyph[kind]`) → its decal shape. */
export const GLYPH_SHAPE = Object.freeze({ shield: DECAL.SHIELD, star8: DECAL.STAR, chevron2: DECAL.CHEV2, dots6: DECAL.DOTS6, paw: DECAL.PAW,
  crowfoot: DECAL.CROWFOOT, arrow: DECAL.ARROWHEAD });
/** Decal shape of a glyph name (or of a telegraph kind through `TELEGRAPH.glyph`); -1 when unknown (pure). */
export function glyphShape(nameOrKind) {
  const g = GLYPH_SHAPE[nameOrKind] ?? GLYPH_SHAPE[TELEGRAPH.glyph?.[nameOrKind]];
  return Number.isFinite(g) ? g : -1;
}

/**
 * WA §3 palette. Roles (for the colour-language lint): pink is hers alone, hue 0–30° with S > 0.6 is enemy danger
 * only (red / aggro), mint = "you can use this", sky = friends, everything else is neutral cream / gold / warm grey.
 */
export const DECAL_COLORS = Object.freeze({
  hero: CLASS_MARKS.hero.color, move: CLASS_MARKS.hero.color, heart: CLASS_MARKS.heroHearts.full, heartEmpty: CLASS_MARKS.heroHearts.empty,
  silver: '#FFF1DC', gold: '#FFD34D', red: TELEGRAPH.colors.aoe, aggro: TELEGRAPH.colors.red, white: '#FFF6E8', cream: '#FFF1D0',
  grey: FX_COLORS.stone, green: CLASS_MARKS.interact.color, mint: CLASS_MARKS.interact.color, sky: CLASS_MARKS.companion.color,
  blob: FX_COLORS.blob, purple: TELEGRAPH.colors.grab ?? '#9B5CFF', ink: FX_COLORS.ink,
});
/** Role of each DECAL_COLORS key (tests/unit/colorLanguage.test.js). */
export const DECAL_ROLES = Object.freeze({
  hero: 'hero', move: 'hero', heart: 'hero', heartEmpty: 'ink', silver: 'neutral', gold: 'neutral', red: 'danger', aggro: 'danger',
  white: 'neutral', cream: 'neutral', grey: 'neutral', green: 'interact', mint: 'interact', sky: 'friend', blob: 'shadow', purple: 'danger', ink: 'ink',
});
/**
 * Her ring's opacity. WA §3.2 rule 1 (pink is hers alone and always reads pink) beats the spec's α 0.55: at 0.55 the
 * pink #FF8FB1 blended over green grass (its complement) composites to tan / brown (forest, bog, twilight shots), so
 * the 0.08 m band is drawn near-opaque. It is unfogged and unlit (fog: false, noHeightFog), so the ring is
 * CLASS_MARKS.hero.color under every Env preset. Unit-tested: the composite over every preset's ground stays pink.
 */
export const HERO_RING_ALPHA = 0.92;
/** The hero ring's draw style (pure; unit-tested): the class-mark colour, near-opaque, never fogged. */
export const heroRingStyle = () => ({ color: CLASS_MARKS.hero.color, alpha: HERO_RING_ALPHA, fog: false });
/** Tunables (CONTROLS_SPEC §7.3, §8.2, §10.3; WA §3; metres / seconds). */
export const DECAL_CFG = Object.freeze({
  heroR: CLASS_MARKS.hero.r, heroAlpha: HERO_RING_ALPHA, heroW: CLASS_MARKS.hero.width, heroNotch: 0.25, heroNotchLen: 0.3, pull: 0.45, fanR: 1.05,
  parryRing: { r0: 2.2, lead: 0.6, range: 6 }, freezeLead: 0.15, wedgeMax: 8, rimMin: 0.12,
  // WA §3.4 wedge timing: rim α through 70 % of the wind-up, the glyph pop at parry-window open, the strike flash
  wedge: { rimA: 0.6, rimLate: 0.85, rimOpen: 0.95, fillA: 0.16, fillRed: 0.35, pop: 1.3, popT: 0.08, strikeA: 0.8, strikeHold: 0.05, strikeFade: 0.12 },
  marker: { grow: 0.12, move: 0.6, other: 0.7, paw: 0.3, ripple: 1.15, ticks: { r0: 1.0, r1: 0.55, collapse: 0.3, inner: 0.6, hw: 0.11 }, goal: 0.4 }, queueDot: 0.07, dashEvery: 0.6,
  rmbDots: 3, previewEvery: 1.2, previewMax: 24, previewSide: 0.08, previewSpeed: 12, previewA: 0.35, riposte: 0.8, gleam: { l: 8, w: 1.2, dur: 0.2 },
  smear: { dur: 0.15, alpha: 0.25 }, fadeIn: 0.3, dive: 0.9,
  bolt: { r: 0.15, max: 12 }, aaReach: 1.9,
  reachEdge: { margin: 0.6, arc: 3.6, dots: 9, dot: 0.11 },
  ghost: { r: 0.42, hz: 1.2 },
  heartFlash: 0.12, heartShrink: 0.25, heartPop: 0.2,
});
const LIFT = 0.05;
/** Telegraph glyphs queued per frame at most (8 rim-glyphed telegraphs × 4 + lanes; the batch holds MAX = 160). */
const GLYPH_MAX = 48;
/** WA §3.2 rule 4: the ink sandwich (width m, alpha) from config. */
const INK = Object.freeze({ w: TELEGRAPH.ink?.width ?? 0.03, a: TELEGRAPH.ink?.alpha ?? 0.35 });
/** Glyph ink alpha: telegraph glyphs need a strong cocoa outline to read on bright grass (config 0.35 is for rings). */
export const GLYPH_INK = Math.max(0.85, INK.a);

const VERT = /* glsl */`
attribute vec4 aColor;
attribute vec4 aParams;
attribute vec4 aExtra;
attribute vec2 aInk;      // x: ink width relative to the quad radius (the quad is grown by it), y: ink alpha
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;
varying vec4 vExtra;
varying vec2 vInk;
void main() {
  vUv = ( uv * 2.0 - 1.0 ) * ( 1.0 + aInk.x );
  vColor = aColor; vParams = aParams; vExtra = aExtra; vInk = aInk;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  // her indicators: pulled toward the lens (along the view ray: same pixel, nearer depth) so grass / ground bumps
  // never cut them, while her body and real occluders still do
  if ( aExtra.w > 0.0 ) mv.xyz -= normalize( mv.xyz ) * aExtra.w;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vParams;   // x shape, y inner radius (0..1), z aa width, w notch / half-angle (rad)
varying vec4 vExtra;    // x dashes / notches / rect half-w, y rotation / rect half-l, z fill alpha, w depth pull
varying vec2 vInk;
uniform float uTime;
uniform vec3 uInk;
uniform vec3 uTTPad;
uniform vec3 uTTRim;
const float PI = 3.14159265;
float band( float r, float a, float b, float w ) { return smoothstep( a - w, a + w, r ) * ( 1.0 - smoothstep( b - w, b + w, r ) ); }
float sdEll( vec2 p, vec2 c, vec2 r ) { return ( length( ( p - c ) / r ) - 1.0 ) * min( r.x, r.y ); }
float sdCap( vec2 p, vec2 a, vec2 b, float r ) { vec2 pa = p - a, ba = b - a; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * h ) - r; }
float sdTri( vec2 p, vec2 p0, vec2 p1, vec2 p2 ) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2, v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp( dot( v0, e0 ) / dot( e0, e0 ), 0.0, 1.0 );
  vec2 q1 = v1 - e1 * clamp( dot( v1, e1 ) / dot( e1, e1 ), 0.0, 1.0 );
  vec2 q2 = v2 - e2 * clamp( dot( v2, e2 ) / dot( e2, e2 ), 0.0, 1.0 );
  float s = sign( e0.x * e2.y - e0.y * e2.x );
  vec2 d = min( min( vec2( dot( q0, q0 ), s * ( v0.x * e0.y - v0.y * e0.x ) ), vec2( dot( q1, q1 ), s * ( v1.x * e1.y - v1.y * e1.x ) ) ),
                vec2( dot( q2, q2 ), s * ( v2.x * e2.y - v2.y * e2.x ) ) );
  return -sqrt( d.x ) * sign( d.y );
}
float fxStar( vec2 p, float r, float n, float m ) {
  float an = PI / n, en = PI / m;
  vec2 acs = vec2( cos( an ), sin( an ) ), ecs = vec2( cos( en ), sin( en ) );
  float bn = mod( atan( p.x, p.y ), 2.0 * an ) - an;
  p = length( p ) * vec2( cos( bn ), abs( sin( bn ) ) );
  p -= r * acs;
  p += ecs * clamp( - dot( p, ecs ), 0.0, r * acs.y / ecs.y );
  return length( p ) * sign( p.x );
}
float chevrons( vec2 q, float aa ) {         // two nested chevrons pointing forward (q.y up); coverage
  vec2 p = vec2( abs( q.x ), q.y );
  float c1 = abs( p.y - 0.42 + p.x * 0.9 ) - 0.13;
  float c2 = abs( p.y + 0.22 + p.x * 0.9 ) - 0.13;
  return ( 1.0 - smoothstep( -aa, aa, min( c1, c2 ) ) ) * ( 1.0 - smoothstep( 0.76, 0.84, p.x ) );
}
// coverage (x) and white mix (y) of the shape at uv (forward = -uv.y, i.e. local +Z)
vec2 shapeCov( vec2 uv ) {
  float r = length( uv );
  float ang = atan( uv.x, -uv.y );            // 0 = local forward, counter-clockwise positive
  int s = int( vParams.x + 0.5 );
  float inner = vParams.y, aa = max( 0.004, vParams.z );
  vec2 p = vec2( uv.x, -uv.y );               // glyph space: +y forward
  float a = 0.0, w = 0.0;
  if ( s == 0 ) {                             // ring (+ optional notch: a solid arrow tick pointing along the aim)
    if ( r > 1.6 ) return vec2( 0.0 );
    float outer = vExtra.x > 0.0 ? vExtra.x : 1.0;
    a = band( r, inner, outer, aa );
    if ( vParams.w > 0.0 ) {
      float tipLen = vExtra.y > 0.0 ? vExtra.y : ( outer - inner ) * 2.6;
      float f = -uv.y, sx = abs( uv.x ), f1 = outer + tipLen;
      float hw = outer * sin( vParams.w * 0.5 ) * ( f1 - f ) / tipLen;
      float tri = ( 1.0 - smoothstep( -aa, aa, sx - hw ) ) * smoothstep( inner - aa, inner + aa, f ) * ( 1.0 - smoothstep( f1 - aa, f1, f ) );
      a = max( a, tri * 1.25 );
      w = 0.2 * tri;
    }
    a = max( a, vExtra.z * ( 1.0 - smoothstep( inner - aa, inner, r ) ) );
  } else if ( s == 12 ) {                     // ticks: 4 solid triangles pointing at the centre (the order marker)
    float an = mod( ang + PI * 0.25, PI * 0.5 ) - PI * 0.25;
    vec2 q = r * vec2( cos( an ), sin( an ) );
    float hw = vParams.w * clamp( ( q.x - inner ) / max( 0.01, 1.0 - inner ), 0.0, 1.0 );
    a = ( 1.0 - smoothstep( -aa, aa, abs( q.y ) - hw ) ) * smoothstep( inner - aa, inner + aa, q.x ) * ( 1.0 - smoothstep( 1.0 - aa * 2.0, 1.0, q.x ) );
    if ( vExtra.z > 0.0 ) a = max( a, 1.0 - smoothstep( vExtra.z - aa, vExtra.z + aa, r ) );
  } else if ( s == 1 ) {                      // soft disc
    a = 1.0 - smoothstep( inner, 1.0, r );
  } else if ( s == 2 || s == 11 ) {           // fan: a rim arc ±w plus a fill (FAN_RED: jagged rim)
    if ( r > 1.5 ) return vec2( 0.0 );
    float rr = s == 11 ? r * ( 1.0 + 0.035 * sin( ang * 22.0 ) ) : r;
    float inside = 1.0 - smoothstep( vParams.w - 0.03, vParams.w + 0.03, abs( ang ) );
    float rim = band( rr, inner, 1.0, aa );
    if ( vParams.w < PI - 0.05 ) rim = max( rim, ( 1.0 - smoothstep( 0.0, ( 1.0 - inner ) * 0.9, abs( abs( ang ) - vParams.w ) * max( r, 0.2 ) ) ) * step( r, 1.0 ) * step( abs( ang ), vParams.w + 0.03 ) );
    a = inside * max( rim, vExtra.z * ( 1.0 - smoothstep( 1.0 - aa, 1.0, rr ) ) );
    if ( vExtra.x > 0.5 ) {                   // Grit notches
      float k = fract( ( ang + vParams.w ) / ( 2.0 * vParams.w ) * vExtra.x );
      a *= 0.55 + 0.45 * step( 0.08, k );
    }
  } else if ( s == 3 ) {                      // cross
    vec2 q = abs( mat2( 0.7071, -0.7071, 0.7071, 0.7071 ) * uv );
    float bar = min( q.x, q.y );
    a = ( 1.0 - smoothstep( 0.16, 0.16 + aa * 4.0, bar ) ) * ( 1.0 - smoothstep( 0.85, 0.95, max( q.x, q.y ) ) );
  } else if ( s == 4 ) {                      // dashed rotating ring
    if ( r > 1.5 ) return vec2( 0.0 );
    float k = fract( ( ang + vExtra.y ) / ( 2.0 * PI ) * vExtra.x );
    a = band( r, inner, 1.0, aa ) * smoothstep( 0.0, 0.08, k ) * ( 1.0 - smoothstep( 0.55, 0.63, k ) );
  } else if ( s == 5 ) {                      // rect outline (x: half width in uv, y half length): ability wall
    vec2 q = abs( uv );
    float edge = max( q.x / vExtra.x, q.y / vExtra.y );
    a = band( edge, 0.86, 1.0, 0.02 ) + 0.25 * ( 1.0 - step( 1.0, edge ) );
  } else if ( s == 6 ) {                      // paw print (forward = toes): main pad + 4 beans
    float d = sdEll( p, vec2( 0.0, -0.28 ), vec2( 0.44, 0.36 ) );
    d = min( d, sdEll( p, vec2( -0.56, 0.18 ), vec2( 0.17, 0.21 ) ) );
    d = min( d, sdEll( p, vec2( -0.21, 0.52 ), vec2( 0.17, 0.22 ) ) );
    d = min( d, sdEll( p, vec2( 0.21, 0.52 ), vec2( 0.17, 0.22 ) ) );
    d = min( d, sdEll( p, vec2( 0.56, 0.18 ), vec2( 0.17, 0.21 ) ) );
    a = 1.0 - smoothstep( -aa, aa, d );
    if ( vExtra.z > 0.0 ) a = max( a * 0.55, band( r, 0.86, 1.0, aa ) * vExtra.z );   // ripple ring
  } else if ( s == 7 ) {                      // 8-point star (gold glyph)
    a = 1.0 - smoothstep( -aa, aa, fxStar( uv, 0.95, 8.0, 3.2 ) );
    w = 1.0 - smoothstep( 0.0, 0.5, r );
  } else if ( s == 8 ) {                      // pulsing dodge chevron "!!"
    a = chevrons( p, aa ) * ( 0.7 + 0.3 * sin( uTime * 18.0 ) );
  } else if ( s == 9 ) {                      // arrow along forward (non-uniform quad: shaft + head)
    float head = step( 0.35, p.y ) * ( 1.0 - smoothstep( ( 1.0 - p.y ) * 1.4 - aa * 6.0, ( 1.0 - p.y ) * 1.4, abs( p.x ) ) );
    float shaft = step( p.y, 0.4 ) * step( -1.0, p.y ) * ( 1.0 - smoothstep( 0.28, 0.36, abs( p.x ) ) );
    a = max( head, shaft * ( 0.45 + 0.55 * smoothstep( -1.0, 0.3, p.y ) ) );
  } else if ( s == 10 ) {                     // lane: filled rect + rim (holy wave preview, Golden Hour gleam)
    vec2 q = abs( uv );
    float edge = max( q.x, q.y );
    a = max( vExtra.z, band( edge, 0.9, 1.0, 0.012 ) ) * ( 1.0 - step( 1.0, edge ) );
  } else if ( s == 13 ) {                     // glyph: heater shield (parry) + a pale centre stripe
    float d = max( max( length( p - vec2( -0.55, 0.36 ) ) - 1.15, length( p - vec2( 0.55, 0.36 ) ) - 1.15 ), p.y - 0.62 );
    a = 1.0 - smoothstep( -aa, aa, d );
    w = 0.35 * ( 1.0 - smoothstep( 0.05, 0.09, abs( p.x ) ) ) * step( d, -0.12 );
  } else if ( s == 14 ) {                     // glyph: 6-dot burst (aoe)
    float sec = 2.0 * PI / 6.0;
    float an = mod( atan( p.x, p.y ) + sec * 0.5, sec ) - sec * 0.5;
    vec2 q = r * vec2( sin( an ), cos( an ) );
    float d = min( length( q - vec2( 0.0, 0.64 ) ) - 0.21, r - 0.2 );
    a = 1.0 - smoothstep( -aa, aa, d );
  } else if ( s == 15 ) {                     // glyph: crow foot (the crow's dive shadow)
    vec2 o = vec2( 0.0, -0.12 );
    float d = sdCap( p, o, vec2( 0.0, 0.86 ), 0.12 );
    d = min( d, sdCap( p, o, vec2( -0.56, 0.6 ), 0.12 ) );
    d = min( d, sdCap( p, o, vec2( 0.56, 0.6 ), 0.12 ) );
    d = min( d, sdCap( p, o, vec2( 0.0, -0.8 ), 0.12 ) );
    a = 1.0 - smoothstep( -aa, aa, d );
  } else if ( s == 16 ) {                     // glyph: double chevron along the lunge (red)
    a = chevrons( p, aa );
  } else if ( s == 17 ) {                     // glyph: arrowhead (aim)
    float d = max( sdTri( p, vec2( 0.0, 0.9 ), vec2( -0.72, -0.62 ), vec2( 0.72, -0.62 ) ), -sdTri( p, vec2( 0.0, -0.18 ), vec2( -0.9, -0.8 ), vec2( 0.9, -0.8 ) ) );
    a = 1.0 - smoothstep( -aa, aa, d );
  }
  return vec2( clamp( a, 0.0, 1.0 ), w );
}
float pawSd( vec2 p ) {                      // the paw print's distance (main pad + 4 beans; forward = +y)
  float d = sdEll( p, vec2( 0.0, -0.28 ), vec2( 0.44, 0.36 ) );
  d = min( d, sdEll( p, vec2( -0.56, 0.18 ), vec2( 0.17, 0.21 ) ) );
  d = min( d, sdEll( p, vec2( -0.21, 0.52 ), vec2( 0.17, 0.22 ) ) );
  d = min( d, sdEll( p, vec2( 0.21, 0.52 ), vec2( 0.17, 0.22 ) ) );
  return min( d, sdEll( p, vec2( 0.56, 0.18 ), vec2( 0.17, 0.21 ) ) );
}
void main() {
  if ( vExtra.y > 0.5 && int( vParams.x + 0.5 ) == 6 ) {
    // TOKENTAILS-PLAN §10.2 Token Tails print: ivory pads, love-pink beans (vColor), a maroon rim around the outside
    vec2 p = vec2( vUv.x, -vUv.y );
    float d = pawSd( p ), aa = max( 0.004, vParams.z );
    float cov = 1.0 - smoothstep( 0.12 - aa, 0.12 + aa, d );
    float pad = 1.0 - smoothstep( -aa, aa, d );
    float bean = 1.0 - smoothstep( -0.08 - aa, -0.08 + aa, d );
    float ta = cov * vColor.a;
    if ( ta < 0.003 ) discard;
    gl_FragColor = vec4( mix( uTTRim, mix( uTTPad, vColor.rgb, bean ), pad ), ta );
    #include <colorspace_fragment>
    return;
  }
  vec2 s0 = shapeCov( vUv );
  float a = s0.x * vColor.a;
  vec3 col = mix( vColor.rgb, vec3( 1.0 ), s0.y );
  float ink = 0.0;
  if ( vInk.y > 0.0 ) ink = max( 0.0, shapeCov( vUv / ( 1.0 + vInk.x ) ).x - s0.x ) * vInk.y;
  float outA = a + ink * ( 1.0 - a );
  if ( outA < 0.003 ) discard;
  gl_FragColor = vec4( ( col * a + uInk * ink * ( 1.0 - a ) ) / outA, outA );
  #include <colorspace_fragment>
}`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _s = new THREE.Vector3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * §8.2.1 strike-wedge state at `now` for a ThreatBook entry (pure; unit-tested): `{ left, prog, frozen, open, flash }`.
 * `frozen` 0.15 s before `activeAt`; `open` from the parry window's start (activeAt − window) to just after the
 * strike; `flash` 1 → 0 over the first 0.12 s of the open window (the rim's "ting").
 */
export function wedgeState(activeAt, windup, now, window = PLAYER.guard.parryWindow, freezeLead = DECAL_CFG.freezeLead) {
  const left = activeAt - now;
  const prog = windup > 0 ? clamp01(1 - left / windup) : 1;
  const open = left <= window && left >= -0.05;
  const flash = open ? clamp01(1 - (window - left) / 0.12) : 0;
  return { left, prog, frozen: left <= freezeLead, open, flash };
}

/**
 * WA §3.4 wedge look at a wedge state (pure; unit-tested): rim alpha (0.6 through 70 % of the wind-up, rising after),
 * the glyph scale (pops ×1.3 → 1.0 over 0.08 s when the parry window opens) and the strike flash alpha (white 0.8 for
 * 0.05 s after the strike, then fading over 0.12 s).
 */
export function wedgeLook(st, window = PLAYER.guard.parryWindow, W = DECAL_CFG.wedge) {
  const rimA = st.open ? W.rimOpen : st.prog <= 0.7 ? W.rimA : W.rimA + (W.rimLate - W.rimA) * clamp01((st.prog - 0.7) / 0.3);
  const since = Math.max(0, window - st.left);           // seconds since the window opened
  const glyph = st.open && since >= 0 && since < W.popT ? W.pop - (W.pop - 1) * (since / W.popT) : 1;
  const after = -st.left;                                // seconds since the strike
  const strike = after < 0 ? 0 : after <= W.strikeHold ? W.strikeA : after <= W.strikeHold + W.strikeFade ? W.strikeA * (1 - (after - W.strikeHold) / W.strikeFade) : 0;
  return { rimA, glyph, strike };
}

/**
 * §8.2.2 parry ring radius at `left` seconds before the strike (pure; unit-tested): r0 at `lead` s before (or the
 * wind-up start if later), shrinking linearly to her radius `r1` exactly at the strike. null outside [−0.05, lead].
 */
export function parryRingRadius(left, r1 = 0.45, r0 = DECAL_CFG.parryRing.r0, lead = DECAL_CFG.parryRing.lead) {
  if (!(left <= lead) || left < -0.05) return null;
  const k = clamp01(left / lead);
  return r1 + (r0 - r1) * k;
}

/** Is the parry ring on for this setting / device / difficulty? (§8.2.2; pure) */
export function parryRingOn(setting, device, difficulty) {
  return setting === 'on' || ((setting ?? 'auto') === 'auto' && (device === 'touch' || difficulty === 'kitten'));
}

/**
 * WA §3.6 `settings.pathPreview`: 'on' / true → always, 'off' / false / unset → never, 'auto' → touch on the prologue
 * and Chapter 1 (both play on the meadow). Pure; unit-tested.
 */
export function pathPreviewOn(setting, device, levelId) {
  if (setting === true || setting === 'on') return true;
  if (setting === 'auto') return device === 'touch' && levelId === 'meadow';
  return false;
}

/**
 * WA §3.5a heart arc (pure; unit-tested). `hp` / `max` in hearts (the player's HP is in half-hearts: pass hp / 2).
 * → { segments (≤ 6; one per heart, or 6 sharing the hearts when there are more), per (hearts a segment stands for),
 * full (whole segments full), half (a part-filled segment follows, 0..1) }.
 */
export function heartArc(hp, max, cap = 6) {
  const m = Math.max(0, Math.ceil(max - 1e-6));
  const segments = Math.min(cap, m), per = segments > 0 ? m / segments : 1;
  const v = Math.max(0, Math.min(m, hp)) / per;
  const full = Math.floor(v + 1e-6);
  return { segments, per, full, half: full < segments ? clamp01(v - full) : 0 };
}

/** WA §3.5a: the arc shows for `show` s after any HP change and always while HP ≤ 1 heart (pure; unit-tested). */
export function heartArcVisible(sinceChange, hpHearts, show = CLASS_MARKS.heroHearts.show) {
  return (hpHearts > 0 && hpHearts <= 1) || sinceChange < show;
}

/**
 * Points every `step` m along a polyline (from `from`, through `pts[start..]`), at most `max` (pure; unit-tested).
 * With a `pool` array, the {x, z, yaw} objects are reused from it (no per-frame allocation).
 */
export function pointsAlong(from, pts, step, max, out = [], start = 0, pool = null) {
  let n = 0, px = from.x, pz = from.z, carry = step;
  for (let i = start; i < pts.length && n < max; i++) {
    const w = pts[i], dx = w.x - px, dz = w.z - pz, d = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    let s = carry;
    while (s <= d && n < max) {
      const t = s / d, q = pool ? (pool[n] ??= { x: 0, z: 0, yaw: 0 }) : { x: 0, z: 0, yaw: 0 };
      q.x = px + dx * t; q.z = pz + dz * t; q.yaw = yaw;
      out[n++] = q;
      s += step;
    }
    carry = s - d;
    px = w.x; pz = w.z;
  }
  out.length = n;
  return out;
}


/**
 * TOKENTAILS-PLAN §10.2 the Pink Paw guide trail (package G1). Numbers in metres / seconds. The print look is the
 * Token Tails `logo/paw.webp` paw (a generic paw, not Pink Paw's logo): ivory pad, love-pink beans, maroon rim.
 */
export const GUIDE_TRAIL = Object.freeze({
  max: 14,              // prints at most (one pool, the decal batch's single draw)
  gap: 1.2,             // m between prints along the path
  side: 0.17,           // m left / right of the path (alternating paws)
  r: 0.34,              // print radius (m; the quad is 2r wide)
  touchMul: 1.3,        // prints are drawn 1.3× on touch (≥ 18 px at 844×390)
  rehz: 2,              // path recomputes per second at most
  step: 0.12,           // s between prints lighting up, from her outward
  cycle: 2.5,           // s per light-up cycle while she is idle / not closing in
  dark: 0.35,           // s at the end of each cycle with the prints dimmed before they relight from her outward
  ahead: 3,             // prints kept lit just ahead of her while she closes in
  closeV: 0.6,          // m/s of closing speed that counts as "walking the right way"
  fadeIn: 0.25, fadeOut: 0.4,   // s (fade-out inside arriveR stays under the 0.5 s budget)
  arriveR: 2.2,         // m: default arrival radius (the target's own `arriveR` wins)
  dim: 0.35,            // alpha multiplier during an ordinary fight
  unlitA: 0.45, litA: 1, litAt: 0.7,   // print alpha unlit / lit; "lit" for tests = alpha ≥ litAt
  endGap: 0.9,          // m: no print this close to the target (the badge stands there)
  behind: 0.45,         // m: prints she has passed (path remainder) hide
  pull: 0.3,            // m toward the lens (grass never cuts a print)
  pad: '#F3EEE6', bean: '#FF7AA2', rim: '#4A1D08',
  // fix round 2 (§10.10 #3): ring mode for an in-place lesson (the target carries `ring: { x, z, r }`): `ringN` lit prints
  // round the lesson's object, toes in, the one on her side last. On once she has arrived (inside the target's arriveR),
  // where the path trail fades: "you are here, act on this" instead of nothing.
  ringN: 4, ringNear: 1.5,
});

/**
 * Ring-mode prints (pure; unit-tested): `cfg.ringN` prints on a circle of `ring.r` m round (ring.x, ring.z), toes toward
 * the centre, from the far side round to the print on her side (`from`), which comes last. Writes into `out`.
 * @param {{x:number, z:number}} from @param {{x:number, z:number, r:number}} ring
 */
export function ringPrints(from, ring, cfg = GUIDE_TRAIL, out = []) {
  const n = Math.max(3, cfg.ringN | 0), r = Math.max(0.3, ring.r ?? 1);
  let a0 = Math.atan2(from.x - ring.x, from.z - ring.z);
  if (!Number.isFinite(a0)) a0 = 0;
  for (let i = 0; i < n; i++) {
    // evenly spaced; i = 0 opposite her, then alternating round both sides, the last one on her side (offset 0)
    const j = Math.ceil((n - 1 - i) / 2) * (i % 2 ? 1 : -1), a = a0 + (2 * Math.PI * j) / n;
    const o = (out[i] ??= { x: 0, z: 0, yaw: 0, rem: 0 });
    o.x = ring.x + Math.sin(a) * r; o.z = ring.z + Math.cos(a) * r;
    o.yaw = Math.atan2(ring.x - o.x, ring.z - o.z); o.rem = 0;
  }
  out.length = n;
  return out;
}

/**
 * Is the trail in ring mode (pure)? `g` = ui's spec, `her` = her position: a ring target and she is within
 * arriveR + `ringNear` m of it (a path that short draws no prints; the ring's print on her side is the spot to step to).
 */
export function ringWanted(g, her, cfg = GUIDE_TRAIL) {
  const R = g?.ring;
  if (!R || !her || !g.on || g.trail === false) return false;
  return Math.hypot(her.x - g.x, her.z - g.z) <= (g.arriveR ?? cfg.arriveR) + cfg.ringNear;
}

/** Has she arrived at a ring target (pure)? (ui's snapshot reports the ring only then: "you are here, act on it".) */
export function ringArrived(g, her) {
  return !!g?.ring && !!her && Math.hypot(her.x - g.x, her.z - g.z) <= (g.arriveR ?? GUIDE_TRAIL.arriveR);
}

/**
 * The prints along a path (pure; unit-tested): `from` → `pts` (path points, the goal last), one every `cfg.gap` m,
 * alternating `cfg.side` m left / right, toes along the path, none within `cfg.endGap` of the goal, at most `cfg.max`.
 * Each print carries `rem`, the path length still to go from it to the goal. Writes into `out` (pooled entries).
 * @param {{x:number, z:number}} from @param {{x:number, z:number}[]} pts
 * @param {typeof GUIDE_TRAIL} [cfg] @param {{x:number, z:number, yaw:number, rem:number}[]} [out]
 */
export function trailPrints(from, pts, cfg = GUIDE_TRAIL, out = []) {
  let L = 0, px = from.x, pz = from.z;
  for (const w of pts) { L += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z; }
  const raw = pointsAlong(from, pts, cfg.gap, cfg.max + 1, trailPrints._tmp, 0, trailPrints._pool);
  let n = 0;
  for (let i = 0; i < raw.length && n < cfg.max; i++) {
    const q = raw[i], rem = L - (i + 1) * cfg.gap;
    if (rem < cfg.endGap) break;
    const side = (i & 1 ? 1 : -1) * cfg.side;
    const o = (out[n] ??= { x: 0, z: 0, yaw: 0, rem: 0 });
    o.x = q.x + Math.cos(q.yaw) * side; o.z = q.z - Math.sin(q.yaw) * side; o.yaw = q.yaw; o.rem = rem;
    n++;
  }
  out.length = n;
  return out;
}
trailPrints._tmp = [];
trailPrints._pool = [];

/**
 * Is the k-th print ahead of her lit (pure; unit-tested)? Reduced motion: all lit. Closing in: the first `ahead`.
 * Otherwise the light-up wave: print k lights at k·step into the cycle and stays lit until the last `dark` s of it.
 * @param {number} k @param {number} c seconds into the cycle @param {boolean} closing @param {boolean} reduced
 */
export function printLit(k, c, closing, reduced, cfg = GUIDE_TRAIL) {
  if (reduced) return true;
  if (closing) return k < cfg.ahead;
  return c >= k * cfg.step && c < cfg.cycle - cfg.dark;
}

/**
 * Should the trail show (pure; unit-tested)? `g` = ui's guide spec ({ on, hard, x, z, arriveR, trail }) and her
 * distance to the target. Off when there is no target, the setting is off, she has arrived, or ui hid it.
 */
export function trailWanted(g, dist) {
  if (!g || !g.on || g.trail === false) return false;
  return !(dist <= (g.arriveR ?? GUIDE_TRAIL.arriveR));
}

/**
 * The Pink Paw trail's state: the path (re-routed ≤ GUIDE_TRAIL.rehz a second, read-only on physics' NavGrid so it
 * goes round fences and through gates), the prints, the light-up clock and the fade. ui (beacon.js) feeds it with
 * `set()` every frame; GroundDecals draws it inside its own batch. No allocation per frame once warmed.
 */
export class GuideTrail {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    /** ui's latest spec: { on, hard, dim, reduced, touch, trail, x, y, z, arriveR, id } (null = no target) */
    this.g = null;
    this.prints = [];
    this.vis = 0;
    this.cycleT = 0;
    this.closing = false;
    this.herRem = Infinity;
    this._rate = 0;
    this._reT = 0;
    this._key = '';
    this._tx = NaN; this._tz = NaN;
    this._alpha = new Float32Array(GUIDE_TRAIL.max);
    /** the prints drawn last frame (pooled): { x, y, z, yaw, r, a, lit } (debug / __GAME__.guide()) */
    this.drawn = [];
    this._drawnPool = [];
    /** fix round 2: ring mode (an in-place lesson) is on; `ringHere`: she has arrived (inside arriveR) */
    this.ringOn = false; this.ringHere = false;
  }

  /** ui's guide spec for this frame (null / { on: false } hides the trail; `hard` hides it at once). */
  set(g) { this.g = g; }

  /** Drop the path (level unload / target gone). */
  clear() { this.prints.length = 0; this.vis = 0; this.drawn.length = 0; this._key = ''; this.herRem = Infinity; }

  _route(her, g) {
    const nav = this.ctx.physics?.nav;
    let pts = null;
    if (nav) {
      try { const r = findPath(nav, her, g, {}); if (r?.points?.length) pts = r.points; } catch { pts = null; }
    }
    if (!pts) { (this._line ??= [{ x: 0, z: 0 }]); this._line[0].x = g.x; this._line[0].z = g.z; pts = this._line; }
    trailPrints(her, pts, GUIDE_TRAIL, this.prints);
    this._alpha.fill(0);
  }

  /**
   * Advance (visual dt). `her` = her position, `live` = the decals draw this frame (play, her on the field).
   * @param {number} dt @param {{x:number, y:number, z:number}|null} her @param {boolean} live
   */
  update(dt, her, live) {
    const C = GUIDE_TRAIL, g = this.g;
    const dist = g && her ? Math.hypot(g.x - her.x, g.z - her.z) : Infinity;
    const ring = live && ringWanted(g, her);
    if (ring !== this.ringOn) { this.ringOn = ring; this._key = ''; this.vis = ring ? this.vis : 0; }
    this.ringHere = ring && ringArrived(g, her);
    if (ring) {
      // in place: the ring round the lesson's object, all lit (no path, no light-up wave)
      this.vis = Math.min(1, this.vis + dt / C.fadeIn);
      ringPrints(her, g.ring, C, this.prints);
      this.herRem = Infinity; this.closing = false; this.cycleT = 0;
      return;
    }
    const want = live && !!her && trailWanted(g, dist);
    if (!want && (g?.hard || !live)) this.vis = 0;
    else this.vis = want ? Math.min(1, this.vis + dt / C.fadeIn) : Math.max(0, this.vis - dt / C.fadeOut);
    if (!g || !her || !g.on) { if (this.vis <= 0) this.clear(); return; }
    // a new target (id, or it moved > 1.5 m): re-route now and restart the light-up from her
    const key = String(g.id ?? '');
    const moved = !(Math.hypot(g.x - this._tx, g.z - this._tz) < 1.5);
    if (key !== this._key || moved) { this._key = key; this._reT = 0; this.cycleT = 0; this._rate = 0; this.herRem = Infinity; }
    if (want && (this._reT -= dt) <= 0) {
      this._reT = 1 / C.rehz;
      this._tx = g.x; this._tz = g.z;
      this._route(her, g);
    }
    // how much path she still has: the best print remainder + her distance to that print
    // (fix round 2: the straight-line distance is no path remainder: round a fence it is shorter than every print's
    // remainder, so the prints nearest her read as "passed" and hid; the barn-chest trail drew none on screen)
    let rem = this.prints.length ? Infinity : dist;
    for (const q of this.prints) { const d = q.rem + Math.hypot(q.x - her.x, q.z - her.z); if (d < rem) rem = d; }
    if (Number.isFinite(this.herRem) && dt > 0) {
      const v = (this.herRem - rem) / dt, k = Math.min(1, dt / 0.3);
      this._rate += (Math.max(-8, Math.min(8, v)) - this._rate) * k;
    }
    this.herRem = rem;
    const closing = !g.reduced && this._rate > C.closeV;
    if (closing) this.cycleT = 0;
    else if (!g.reduced) { this.cycleT += dt; if (this.cycleT >= C.cycle) this.cycleT -= C.cycle; }
    this.closing = closing;
  }

  /**
   * Draw the prints into the decal batch (`decals._add`) at alpha × vis × dim. Fills `drawn`.
   * @param {GroundDecals} decals @param {number} dt @param {number} herY
   */
  draw(decals, dt, herY) {
    const C = GUIDE_TRAIL, g = this.g;
    this.drawn.length = 0;
    if (!g || this.vis <= 0.003 || !this.prints.length) return 0;
    const r = C.r * (g.touch ? C.touchMul : 1), dim = g.dim ? C.dim : 1, ka = dt > 0 ? Math.min(1, dt / C.step) : 1;
    let k = 0;
    for (let i = 0; i < this.prints.length; i++) {
      const q = this.prints[i];
      if (q.rem > this.herRem - C.behind) continue;                    // she has passed it
      const lit = this.ringOn || printLit(k, this.cycleT, this.closing, !!g.reduced, C);
      const want = lit ? C.litA : C.unlitA;
      const a = this._alpha[k] = this._alpha[k] > 0 ? this._alpha[k] + (want - this._alpha[k]) * ka : want;
      const y = decals._gy(q.x, q.z, herY);
      const alpha = a * this.vis * dim;
      decals._add(DECAL.PAW, q.x, y, q.z, r * (0.9 + 0.1 * a), q.yaw, C.bean, alpha, 0, 0.02, 0, 0, 1, 0, 1, 1, C.pull, 0);
      const d = (this._drawnPool[k] ??= { x: 0, y: 0, z: 0, yaw: 0, r: 0, a: 0, lit: false });
      d.x = q.x; d.y = y; d.z = q.z; d.yaw = q.yaw; d.r = r; d.a = alpha; d.lit = a >= C.litAt && alpha > 0.05;
      this.drawn.push(d);
      k++;
    }
    return k;
  }
}

export class GroundDecals {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = null;
    this.n = 0;
    /** transient markers: { kind, x, y, z, t, dur, actor, yaw, delay, half, r, l, w } */
    this.markers = [];
    this.enabled = ctx?.params?.cam !== 'classic';
    this._offs = [];
    this._parryFlashT = 0;
    /** §6.3 pad right-stick ground reticle: smoothed point and the 1.0 s linger after release */
    this._padRet = { x: 0, z: 0, t: 0, on: false };
    this._blockFlashT = 0;
    this._time = 0;
    this._frozen = new Map();
    this._hl = { actor: null, color: null };
    this._pts = [];
    /** per-frame counts (smoke / debug): what was drawn this frame */
    this.counts = {};
    /** the wedges drawn this frame: [{ kind, activeAt, frozen, open, range, half, yaw }] (smoke) */
    this.wedgeList = [];
    this.parryRingR = null;
    /** her decals' visibility (0 outside play → 1 over the last 0.3 s of the hand-back blend) */
    this._vis = 1;
    this._mul = 1;
    this._fadeSt = { hidden: false, back: 0, settled: 0, ox: NaN, oy: NaN, oz: NaN };
    this._ptPool = [];
    /** glyphs queued by Telegraphs this frame (pooled records) */
    this._glyphs = []; this._glyphN = 0;
    /** WA §3.5a heart-arc state: seconds since the last HP change, the lost / healed segment and their clocks */
    this.hearts = { since: Infinity, lost: -1, lostT: 0, healed: -1, healT: 0, shown: false };
    /** the tutorial ghost-paw ground spot (ui's ghost paw; `setGhostPaw`) */
    this.ghost = { on: false, x: 0, y: 0, z: 0, t: 0 };
    this._orderT = Infinity;          // seconds since the last move order (path paws draw outward at 12 m/s)
    /** TOKENTAILS-PLAN §10.2 the Pink Paw guide trail (ui's beacon feeds it through setGuide) */
    this.guide = new GuideTrail(ctx);
    this._near = [];                  // scratch: nearest interactables
    this._nearD = [];
  }

  init(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = fxShaderMaterial({
      name: 'fx.groundDecals', vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false,
      uniforms: { uTime: { value: 0 }, uInk: { value: new THREE.Color(DECAL_COLORS.ink) }, uTTPad: { value: new THREE.Color(GUIDE_TRAIL.pad) }, uTTRim: { value: new THREE.Color(GUIDE_TRAIL.rim) } },
    });
    mat.userData.noHeightFog = true;
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.params = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.extra = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.inks = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aColor', this.colors);
    geo.setAttribute('aParams', this.params);
    geo.setAttribute('aExtra', this.extra);
    geo.setAttribute('aInk', this.inks);
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'fx:groundDecals';
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    const bus = this.ctx.bus;
    if (!bus) return;
    this._offs.push(
      bus.on(E.PLAYER_ORDER, (p) => this._onOrder(p)),
      bus.on(E.PLAYER_PARRY, () => { this._parryFlashT = 0.35; }),
      bus.on(E.PLAYER_SWING, (p) => this._onSwing(p)),
      bus.on(E.PLAYER_DAMAGED, (p) => this._onHp(p, -1)),
      bus.on(E.PLAYER_HEALED, (p) => this._onHp(p, +1)),
      bus.on(E.LEVEL_UNLOAD, () => { this.markers.length = 0; this._frozen.clear(); this._unhighlight(); this.ghost.on = false; this.hearts.since = Infinity; this.guide.clear(); }),
    );
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._unhighlight();
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh?.material.dispose();
  }

  /** Smoke / debug summary of the last frame. */
  stats() {
    return { n: this.n, counts: { ...this.counts }, wedges: this.wedgeList.map((w) => ({ ...w })), parryRing: this.parryRingR, fanHalf: this.fanHalf,
      markers: this.markers.map((m) => m.kind), highlight: this._hl.actor ? (this._hl.actor.id ?? true) : null, hearts: this.hearts.shown };
  }

  /** §8.2.8 her feedback on the ground: 'block' = a white spark ring (the parry's gold ring rides player:parry). */
  flash(kind) { if (kind === 'block') this._blockFlashT = 0.3; else if (kind === 'parry') this._parryFlashT = 0.35; }

  /**
   * WA §3.4: a telegraph glyph for this frame (Telegraphs queues 3–4 on each disc rim, rows along lane edges, one at
   * an aim-line end). `glyph` = a GLYPH_SHAPE name or a telegraph kind; `size` = glyph diameter (m; default the config
   * size, touch bigger); `inkA` = the cocoa ink alpha (0 = GLYPH_INK). At most GLYPH_MAX a frame.
   */
  glyph(glyph, x, y, z, yaw = 0, alpha = 1, size = 0, color = DECAL_COLORS.white, inkA = 0) {
    const shape = glyphShape(glyph);
    if (shape < 0 || !(alpha > 0.01) || this._glyphN >= GLYPH_MAX) return;
    const g = (this._glyphs[this._glyphN] ??= { shape: 0, x: 0, y: 0, z: 0, yaw: 0, alpha: 0, size: 0, color: '', ink: 1 });
    this._glyphN++;
    g.shape = shape; g.x = x; g.y = y; g.z = z; g.yaw = yaw; g.alpha = alpha; g.size = size; g.color = color;
    g.ink = (inkA > 0 ? inkA : GLYPH_INK) / Math.max(0.01, INK.a);
  }

  /** The tutorial ghost-paw ground spot (ui's ghost paw points here); `null` hides it. */
  setGhostPaw(pos) {
    const G = this.ghost;
    if (!pos) { G.on = false; return; }
    G.on = true; G.x = pos.x; G.y = pos.y ?? 0; G.z = pos.z; G.t = 0;
  }

  /**
   * TOKENTAILS-PLAN §10.2: ui's guide spec for this frame (beacon.js): `{ on, hard, dim, reduced, touch, trail, id,
   * x, y, z, arriveR }`, or null for no target. The trail routes, lights and fades itself (GuideTrail).
   */
  setGuide(g) { this.guide.set(g); }

  /** The prints drawn last frame ({ x, y, z, yaw, r, a, lit }; read-only, pooled). */
  guidePrints() { return this.guide.drawn; }

  /** fix round 2: the ring centre (world {x, z}) while the trail is in ring mode and drawn, else null (ui's snapshot). */
  guideRing() { const t = this.guide; return t.ringOn && t.ringHere && t.drawn.length && t.g?.ring ? t.g.ring : null; }

  _count(k) { this.counts[k] = (this.counts[k] ?? 0) + 1; }

  _onHp(p, sign) {
    const H = this.hearts, pl = this.ctx.player;
    if (!p) return;
    const hp = Number.isFinite(p.hp) ? p.hp : pl?.hp;
    const maxHp = Number.isFinite(p.maxHp) ? p.maxHp : pl?.maxHp ?? PLAYER.hpMax;
    H.since = 0;
    if (!Number.isFinite(hp)) return;
    const arc = heartArc(hp / 2, maxHp / 2);
    if (sign < 0) { H.lost = Math.min(arc.segments - 1, arc.full + (arc.half > 0 ? 1 : 0)); H.lostT = 0; }
    else { H.healed = Math.max(0, arc.full - (arc.half > 0 ? 0 : 1)); H.healT = 0; }
  }

  _onOrder(p) {
    if (!p) return;
    const pt = p.point, t = p.target;
    let kind = p.kind;
    if (p.valid === false || p.partial) kind = 'bad';
    if (kind === 'stop' || (!pt && !t?.pos)) return;
    const at = pt ?? t.pos, pl = this.ctx.player?.pos;
    if (this.markers.length > 16) this.markers.shift();
    const yaw = pl ? Math.atan2(at.x - pl.x, at.z - pl.z) : 0;
    const M = DECAL_CFG.marker;
    this.markers.push({ kind, x: at.x, y: at.y ?? 0, z: at.z, t: 0, dur: kind === 'move' || kind === 'follow' ? M.move : M.other,
      actor: t?.object3d ? t : null, queued: !!p.queued, yaw, delay: 0, double: !!p.double && kind === 'move' });
    if (kind === 'move' || kind === 'attackMove') this._orderT = 0;
  }

  /** Golden Hour gleam lanes and the slash smear (§7.3) ride her swings. */
  _onSwing(p) {
    const pl = this.ctx.player;
    if (!pl || !p?.attackId || !this.enabled) return;
    const def = ATTACKS[p.attackId];
    const pos = pl.object3d?.position ?? pl.pos, yaw = pl.facing ?? 0;
    const slash = /^slash|^bright$|^riposte$/.test(p.attackId);
    if (slash && def?.arc) {
      const half = Math.min(Math.PI, Math.abs(def.arc.from - def.arc.to) / 2);
      this.markers.push({ kind: 'smear', x: pos.x, y: pos.y, z: pos.z, t: 0, dur: DECAL_CFG.smear.dur, yaw, half, r: def.arc.range, delay: def.active?.[0] ?? 0, follow: true });
    }
    if (slash && pl.golden) {
      const G = DECAL_CFG.gleam;
      this.markers.push({ kind: 'gleam', x: pos.x, y: pos.y, z: pos.z, t: 0, dur: G.dur, yaw, l: G.l, w: G.w, delay: def?.active?.[0] ?? 0 });
    }
  }

  /**
   * Add one decal: shape, centre (x, y, z), radius (m), yaw (rad, local forward), colour, alpha, params; `sx`, `sz`
   * stretch the quad (lanes, arrows), `pull` lifts it toward the lens (her indicators), `ink` (0 / 1 / alpha
   * multiplier) draws the cocoa ink sandwich around it.
   */
  _add(shape, x, y, z, radius, yaw, color, alpha, inner, aa, w = 0, ex = 0, ey = 0, ez = 0, sx = 1, sz = 1, pull = 0, ink = 1) {
    alpha *= this._mul;
    if (this.n >= MAX || !(alpha > 0.003)) return;
    const i = this.n++;
    // ink: grow the quad by the ink width (relative to the shape's smaller half-extent) so the outer edge fits
    const k = ink > 0 ? Math.min(0.6, INK.w / Math.max(0.05, radius * Math.min(sx, sz))) : 0;
    const ia = ink > 0 ? INK.a * ink * clamp01(alpha / 0.5) : 0;
    // tilt to the ground normal (terrain) so the quad hugs slopes
    const ph = this.ctx.physics;
    if (ph?.normalAt && radius * Math.max(sx, sz) < 4) ph.normalAt(x, z, _n); else _n.copy(_UP);
    if (!(_n.y >= 0.5)) _n.copy(_UP);
    _q.setFromUnitVectors(_UP, _n);
    _qy.setFromAxisAngle(_UP, yaw);
    _q.multiply(_qy);
    _p.set(x, y + LIFT, z);
    _s.set(radius * 2 * sx * (1 + k), 1, radius * 2 * sz * (1 + k));
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    _c.set(color);
    this.colors.setXYZW(i, _c.r, _c.g, _c.b, Math.min(1, alpha));
    this.params.setXYZW(i, shape, inner, aa, w);
    this.extra.setXYZW(i, ex, ey, ez, pull);
    this.inks.setXY(i, k, ia);
  }

  /** Ground height under (x, z) near `y` (top surfaces, then the terrain). */
  _gy(x, z, y) {
    const ph = this.ctx.physics;
    const v = ph?.groundAt?.(x, z, y + 0.6) ?? ph?.topAt?.(x, z) ?? ph?.heightAt?.(x, z);
    return Number.isFinite(v) ? v : y;
  }

  /** Per rendered frame (visual dt). */
  render(dt) {
    if (!this.mesh) return;
    this.n = 0;
    for (const k in this.counts) this.counts[k] = 0;
    this.wedgeList.length = 0;
    this.parryRingR = null; this.reachEdgeAt = null;
    this.fanHalf = null;
    this._time += dt;
    this._orderT += dt;
    this.hearts.since += dt; this.hearts.lostT += dt; this.hearts.healT += dt;
    this.mesh.material.uniforms.uTime.value = this._time;
    const ctx = this.ctx, p = ctx.player, cam = ctx.cam, mode = ctx.game?.mode;
    const play = this.enabled && !!cam?.isIso && mode === 'play' && cam.modeName !== 'preset' && cam.modeName !== 'meme' && cam.modeName !== 'cutscene';
    this._fade(play, cam, dt);
    const heroOn = play && p && p.alive !== false && !p.scripted && this._vis > 0;
    this._mul = this._vis;
    if (heroOn) { this._hero(p, dt); this._hearts(p); }
    if (play) {
      this._wedges();
      if (heroOn) { this._parryRing(p); this._riposte(p); this._ranges(p); }
      this._selection(cam);
      this._hover(cam);
      this._aggro(p);
      this._companions();
      if (heroOn) this._interactables(p, cam);
      this._bolts();
      if (heroOn) { this._path(p); this._queue(p); }
      // the guide trail is world wayfinding, not her indicator: it skips the hand-back fade (on from the first frame of
      // play, e.g. while the camera still glides from the title)
      const gpos = p?.object3d?.position ?? p?.pos ?? null, guideOn = play && !!gpos && p.alive !== false && !p.scripted;
      this.guide.update(dt, gpos, guideOn);
      if (guideOn) { const m = this._mul; this._mul = 1; const n = this.guide.draw(this, dt, gpos.y); this._mul = m; if (n) this.counts.guide = n; }
      this._ability();
      this._ghost(dt);
    } else { this._unhighlight(); this.guide.update(dt, null, false); this.guide.drawn.length = 0; }
    this._mul = 1;
    this._glyphQueue();
    this._markers(dt, play);
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true; this.params.needsUpdate = true; this.extra.needsUpdate = true; this.inks.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  /**
   * Her gameplay decals (hero / aim ring, selection) hide outside play — letterboxed dialogue, cutscenes, Meme Cam —
   * and fade back in over the last 0.3 s of the camera's hand-back blend (`cam.blendLeft` when camera exposes it;
   * otherwise the default iso hand-back time since play resumed).
   */
  _fade(play, cam, dt) {
    const F = DECAL_CFG.fadeIn, V = this._fadeSt;
    if (!play) { this._vis = 0; V.hidden = true; V.back = 0; V.settled = 0; V.ox = NaN; return; }
    if (!V.hidden) { this._vis = 1; return; }
    V.back += dt;
    let left = cam?.blendLeft, settled = false;
    if (!Number.isFinite(left)) {
      // no public blend clock: the default hand-back time, cut short once the lens holds still relative to her
      left = Math.max(0, (CAMERA.iso?.cut?.handback ?? 1) - V.back);
      const c = this.ctx.camera?.position, pp = this.ctx.player?.pos;
      if (c && pp) {
        const ox = c.x - pp.x, oy = c.y - pp.y, oz = c.z - pp.z;
        V.settled = Math.hypot(ox - V.ox, oy - V.oy, oz - V.oz) < 0.004 ? V.settled + 1 : 0;   // NaN start: not still
        V.ox = ox; V.oy = oy; V.oz = oz;
        settled = V.settled >= 3;
      }
    }
    this._vis = settled ? Math.min(1, this._vis + (dt > 0 ? dt / F : 0)) : Math.max(this._vis, clamp01(1 - left / F));
    if (this._vis >= 1) V.hidden = false;
  }

  /**
   * CONTROLS_SPEC §6.3 pad aim: the right stick (past the 0.25 dead zone) puts a ground reticle up to 6 m from her
   * (distance ∝ deflection, eased λ 12); it lingers 1.0 s after release.
   */
  _padReticle(pos, gy, dt) {
    const input = this.ctx.input, R = this._padRet;
    if (input?.device !== 'pad' || this.ctx.cam?.isIso === false) { R.t = 0; R.on = false; return; }
    const as = input.aimStick, m = Math.min(1, Math.hypot(as?.x ?? 0, as?.y ?? 0));
    if (m > 0.02) {                                   // Input already applied the 0.25 dead zone
      const yaw = this.ctx.cam?.stickYaw ?? this.ctx.cam?.yaw ?? Math.PI;
      const dx = -Math.sin(yaw) * as.y + Math.cos(yaw) * as.x, dz = -Math.cos(yaw) * as.y - Math.sin(yaw) * as.x, l = Math.hypot(dx, dz) || 1;
      const d = Math.max(0.8, m * (AIM.padAimMax ?? 6));
      const tx = pos.x + (dx / l) * d, tz = pos.z + (dz / l) * d;
      if (!R.on) { R.x = tx; R.z = tz; }
      const k = dt > 0 ? 1 - Math.exp(-12 * dt) : 1;
      R.x += (tx - R.x) * k; R.z += (tz - R.z) * k;
      R.t = 1.0; R.on = true;
    } else if (R.t > 0) R.t -= dt;
    if (R.t <= 0) { R.on = false; return; }
    const a = Math.min(1, R.t / 0.3), y = this._gy(R.x, R.z, gy);
    this._add(DECAL.RING, R.x, y, R.z, 0.42, 0, DECAL_COLORS.white, 0.8 * a, 0.78, 0.012, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
    this._add(DECAL.CROSS, R.x, y, R.z, 0.22, Math.PI / 4, DECAL_COLORS.white, 0.7 * a, 0, 0.012);
    this._count('reticle');
  }

  /** The hero / aim ring, the Stand fan, the charge reach, the landing ring and the Pounce dive circle. */
  _hero(p, dt) {
    const C = DECAL_CFG, pull = C.pull;
    const pos = p.object3d?.position ?? p.pos;
    const gy = p.onGround ? pos.y : this._gy(pos.x, pos.z, pos.y);
    // the notch follows the live aim (player.aim is refreshed every step) for a deliberate source, else her facing
    const aimSrc = aim => aim && aim.dir && (aim.source === 'cursor' || aim.source === 'explicit' || ((aim.source === 'auto' || aim.source === 'selected') && aim.active));
    const aim = p.aim, yaw = aimSrc(aim) && (p.state !== 'move' || aim.active) ? Math.atan2(aim.dir.x, aim.dir.z) : p.facing;
    const ringYaw = this._cursorYaw(p) ?? yaw;
    // WA §3.2 hero ring: pink #FF8FB1 (near-opaque: HERO_RING_ALPHA), 0.08 m wide, r 0.75, a solid tick (0.3 m, 0.25 rad) along the aim, inked
    const Rq = C.heroR + C.heroNotchLen + 0.04, O = C.heroR / Rq, inner = (C.heroR - C.heroW) / Rq;
    this._add(DECAL.RING, pos.x, gy, pos.z, Rq, ringYaw, DECAL_COLORS.hero, C.heroAlpha, inner, 0.012 * O, C.heroNotch, O, C.heroNotchLen / Rq, 0, 1, 1, pull);
    this._count('hero');
    this._padReticle(pos, gy, dt);
    // Stand fan (±70°, touch ±90°): cream, flashes gold through the parry window, warm grey through the whiff lockout
    if (p.state === 'guard') {
      const touch = this.ctx.input?.device === 'touch';
      const gs = p.guardState ?? {};
      // §8.1 the guard arc: ±90° on touch, ±70° on KBM / pad (Guard's own `arc` is only refreshed on an incoming hit)
      const half = touch ? (PLAYER.guard.touchArc ?? Math.PI / 2) : PLAYER.guard.arc;
      this.fanHalf = half;
      const win = gs.parryWindow ?? (PLAYER.guard.parryWindow + (touch ? PLAYER.guard.touchParryBonus ?? 0 : 0));
      const since = Math.max(gs.guardT ?? 0, gs.parryT ?? 0);
      const lockout = (gs.lockoutT ?? 0) > 0;
      const parryWin = !lockout && since <= win;
      const broke = (p.grit ?? 1) <= 0;
      const col = lockout ? DECAL_COLORS.grey : this._parryFlashT > 0 || parryWin ? DECAL_COLORS.gold : broke ? DECAL_COLORS.grey : DECAL_COLORS.silver;
      const a = parryWin ? 0.9 : broke ? 0.35 : 0.6;
      this._add(broke ? DECAL.FAN_RED : DECAL.FAN, pos.x, gy, pos.z, C.fanR, p.facing, col, a, 0.78, 0.015, half, p.gritMax ?? 3, 0, 0.12, 1, 1, pull);
      this._count('fan');
    }
    if (this._parryFlashT > 0) {
      this._parryFlashT -= dt;
      const k = Math.max(0, this._parryFlashT / 0.35);
      this._add(DECAL.RING, pos.x, gy, pos.z, C.heroR + (1 - k) * 1.2, 0, DECAL_COLORS.gold, 0.85 * k, 0.88, 0.02, 0, 0, 0, 0, 1, 1, pull);
      this._count('parrySpark');
    }
    if (this._blockFlashT > 0) {
      this._blockFlashT -= dt;
      const k = Math.max(0, this._blockFlashT / 0.3);
      this._add(DECAL.RING, pos.x, gy, pos.z, C.heroR + (1 - k) * 0.7, p.facing, DECAL_COLORS.white, 0.7 * k, 0.9, 0.02, 0, 0, 0, 0, 1, 1, pull);
      this._count('blockSpark');
    }
    // charge reach: slash3 2.3 m ±97° → Bright 2.6 m (cream) → Holy 3.6 m circle (gold) + the holyWave lane (Shard 2)
    if (p.state === 'charge' && (p.chargeT ?? 0) > PLAYER.charge.start) {
      const tier = p.chargeTier ?? 0;
      const def = tier >= 2 ? ATTACKS.holy : tier >= 1 ? ATTACKS.bright : ATTACKS.slash3;
      const half = tier >= 2 ? Math.PI : Math.abs(def.arc.from - def.arc.to) / 2;
      const shards = p.shards ?? 0;
      const holyOk = shards >= (ATTACKS.holy.minShards ?? 1) && (p.valor ?? 0) >= (PLAYER.charge.holyMinValor ?? 0) && !p.chargeFizzled;
      const col = tier >= 2 ? (holyOk ? DECAL_COLORS.gold : DECAL_COLORS.grey) : DECAL_COLORS.silver;
      if (tier >= 2) {
        this._add(DECAL.RING, pos.x, gy, pos.z, def.arc.range, 0, col, 0.55, 0.95, 0.006, 0, 0, 0, 0.1, 1, 1, pull);
        if (holyOk && shards >= (ATTACKS.holy.projectileMinShards ?? 2)) {
          const W = ATTACKS.holyWave, f = p.facing;
          this._add(DECAL.LANE, pos.x + Math.sin(f) * W.range / 2, gy, pos.z + Math.cos(f) * W.range / 2, 1, f, col, 0.5, 0, 0.01, 0, 0, 0, 0.14, W.width / 2, W.range / 2, pull);
          this._count('holyLane');
        }
      } else this._add(DECAL.FAN, pos.x, gy, pos.z, def.arc.range, p.facing, col, 0.5, 0.94, 0.006, half, 0, 0, 0.1, 1, 1, pull);
      this._count('charge');
    }
    // airborne: the landing ring under her (above 0.4 m); the soft plum landing disc is her blob (BlobShadows.js);
    // with Pounce ready, the dive circle at the predicted point
    const h = pos.y - gy;
    if (!p.onGround && h > 0.4) {
      const k = Math.min(1, h / 2);
      this._add(DECAL.RING, pos.x, gy, pos.z, 0.45 + 0.25 * (1 - k), 0, DECAL_COLORS.white, 0.5, 0.8, 0.02, 0, 0, 0, 0, 1, 1, pull);
      this._count('landing');
      if (p.pounceReady && p.state !== 'pounce') {
        // the player's own dive point when it has one (player.diveAt: the cursor ≤ 3.5 m / the magnetised crow), else a guess
        let x, z;
        const da = p.diveAt;
        if (da?.valid && Number.isFinite(da.x)) { x = da.x; z = da.z; }
        else {
          const d = p.aim?.dir, f = p.facing ?? 0, dx = d && aim.source === 'cursor' ? d.x : Math.sin(f), dz = d && aim.source === 'cursor' ? d.z : Math.cos(f);
          const off = Math.min(1.5, (ATTACKS.pounce.hang ?? 0.12) * 2 + (h / (ATTACKS.pounce.diveSpeed ?? 14)) * 2);
          x = pos.x + dx * off; z = pos.z + dz * off;
        }
        this._add(DECAL.DASH, x, this._gy(x, z, gy), z, C.dive, 0, DECAL_COLORS.white, 0.7, 0.86, 0.015, 0, 10, this._time * 2, 0, 1, 1, pull);
        this._count('dive');
      }
    }
  }

  /**
   * WA §3.5a her hearts at her feet: one FAN segment per heart on an arc of r 0.82–0.92 m centred behind her (away from
   * the lens), 120° total with 4° gaps. Full pink α 0.75, empty cocoa α 0.18; the segment just lost flashes white
   * 0.12 s then shrinks to empty over 0.25 s; a healed one pops 1.0 → 1.25 → 1.0 in 0.2 s; at HP ≤ 1 the last segment
   * pulses 1.4 Hz. Shown 2.5 s after an HP change and always while HP ≤ 1. ≤ 6 instances (+1 for a half heart).
   */
  _hearts(p) {
    const H = this.hearts, HM = CLASS_MARKS.heroHearts, C = DECAL_CFG;
    const hp = p.hp, maxHp = p.maxHp ?? p.hpMax ?? PLAYER.hpMax;
    H.shown = false;
    if (!Number.isFinite(hp) || !(maxHp > 0) || !heartArcVisible(H.since, hp / 2, HM.show)) return;
    const arc = heartArc(hp / 2, maxHp / 2);
    if (!arc.segments) return;
    H.shown = true;
    const pos = p.object3d?.position ?? p.pos, gy = p.onGround ? pos.y : this._gy(pos.x, pos.z, pos.y);
    const cp = this.ctx.camera?.position;
    const back = cp ? Math.atan2(pos.x - cp.x, pos.z - cp.z) : (p.facing ?? 0) + Math.PI;
    const spread = HM.spreadDeg * Math.PI / 180, gap = HM.gapDeg * Math.PI / 180, n = arc.segments;
    const seg = (spread - gap * (n - 1)) / n, half = seg / 2, R = HM.r1, inner = HM.r0 / HM.r1;
    const fade = H.since < HM.show ? clamp01((HM.show - H.since) / 0.3) : 1;
    const low = hp / 2 <= 1;
    for (let i = 0; i < n; i++) {
      // segment 0 on her left of the arc (seen from the lens), filling toward the right
      const yaw = back + spread / 2 - half - i * (seg + gap);
      let full = i < arc.full, a = HM.fullA * fade, col = DECAL_COLORS.heart, r = R, w = half;
      if (i === H.lost && H.lostT < C.heartFlash + C.heartShrink) {
        if (H.lostT < C.heartFlash) { col = '#FFFFFF'; full = true; }
        else { full = true; r = R * (1 - 0.25 * ((H.lostT - C.heartFlash) / C.heartShrink)); a *= 1 - (H.lostT - C.heartFlash) / C.heartShrink; }
      }
      if (full && i === H.healed && H.healT < C.heartPop) r = R * (1 + 0.25 * Math.sin((H.healT / C.heartPop) * Math.PI));
      if (low && full && i === arc.full - 1) a = (0.55 + 0.35 * (0.5 + 0.5 * Math.sin(this._time * HM.lowHz * Math.PI * 2))) * fade;
      if (!full) this._add(DECAL.FAN, pos.x, gy, pos.z, R, yaw, DECAL_COLORS.heartEmpty, HM.emptyA * fade, inner, 0.01, w, 0, 0, 0, 1, 1, DECAL_CFG.pull, 0);
      else this._add(DECAL.FAN, pos.x, gy, pos.z, r, yaw, col, a, HM.r0 / r, 0.01, w, 0, 0, 0, 1, 1, DECAL_CFG.pull);
      if (i === arc.full && arc.half > 0.01) {      // a part-filled heart: its filled share, from the segment's start
        const hw = half * arc.half;
        this._add(DECAL.FAN, pos.x, gy, pos.z, R, yaw + half - hw, DECAL_COLORS.heart, HM.fullA * fade, inner, 0.01, hw, 0, 0, 0, 1, 1, DECAL_CFG.pull);
      }
    }
    this._count('hearts');
  }

  /** KBM: the ring's notch follows the cursor (the direction LMB swings). */
  _cursorYaw(p) {
    const cam = this.ctx.cam, input = this.ctx.input;
    if (input?.device !== 'kbm' || !cam?.cursorValid || (input.pointerIdle?.() ?? 99) > AIM.cursorIdle) return null;
    const c = cam.cursorGround;
    if (!c || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 0.3) return null;
    return Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
  }

  /**
   * §8.2.1 strike wedges: every live melee wind-up (white parry / gold / red / purple grab) draws its attack's own arc
   * from the attacker: a rim plus a fill sweeping outward over the wind-up, and its kind's glyph at the tip (WA §3.4).
   * It tracks the attacker's facing until 0.15 s before the strike, then freezes (a fair dodge read); at parry-window
   * open the rim thickens and the glyph pops; the strike flashes the wedge white.
   */
  _wedges() {
    const ctx = this.ctx, book = ctx.combat?.threats, now = ctx.game?.time ?? 0;
    if (!book?.live?.size) { this._frozen.clear(); return; }
    const touch = ctx.input?.device === 'touch';
    const win = (ctx.state?.difficultyCfg?.parry ?? PLAYER.guard.parryWindow) + (touch ? PLAYER.guard.touchParryBonus ?? 0 : 0);
    const rimMin = touch ? (TELEGRAPH.rimMinTouch ?? 0.14) : DECAL_CFG.rimMin, W = DECAL_CFG.wedge;
    const gSize = (touch ? TELEGRAPH.glyphSizeTouch ?? 0.55 : TELEGRAPH.glyphSize ?? 0.45);
    let n = 0;
    for (const e of book.live.values()) {
      if (n >= DECAL_CFG.wedgeMax) break;
      const a = e.actor, pay = e.payload, arc = pay?.arc;
      if (!a?.pos || a.alive === false || !arc) continue;
      const st = wedgeState(e.activeAt, e.windup, now, win);
      const look = wedgeLook(st, win);
      if (st.left < -0.05 && look.strike <= 0) continue;
      const range = Math.max(0.6, arc.range ?? pay?.range ?? 1.5);
      const half = Math.max(0.25, Math.min(Math.PI, Math.abs((arc.from ?? 0.5) - (arc.to ?? -0.5)) / 2 + 0.12));
      // freeze the facing 0.15 s before the strike
      let yaw = a.facing ?? 0;
      if (st.frozen) { if (!this._frozen.has(e.id)) this._frozen.set(e.id, yaw); yaw = this._frozen.get(e.id); } else this._frozen.delete(e.id);
      const k = e.kind;
      const col = k === 'gold' ? DECAL_COLORS.gold : k === 'red' ? TELEGRAPH.colors.red : k === 'grab' ? DECAL_COLORS.purple : DECAL_COLORS.white;
      const pos = a.object3d?.position ?? a.pos, R = range + (a.radius ?? 0.3);
      if (st.left < -0.05) {             // the strike: the wedge flashes white, then fades (WA §3.4)
        this._add(DECAL.FAN, pos.x, pos.y, pos.z, R, yaw, DECAL_COLORS.white, look.strike, 0, 0.02, half, 0, 0, 0.9, 1, 1, 0, 0);
        this._count('strike');
        continue;
      }
      // rim: ≥ 0.12 m wide (touch 0.14), twice as wide at the parry window; red = filled ("don't be here"), jagged rim
      const rimIn = Math.min(1 - rimMin / R, 0.93), rimOpen = Math.min(1 - (rimMin * 2) / R, 0.86);
      const shape = k === 'red' ? DECAL.FAN_RED : DECAL.FAN;
      const rimCol = st.flash > 0 ? _c.set(col).lerp(_white, st.flash * 0.5).getStyle() : col;
      this._add(shape, pos.x, pos.y, pos.z, R, yaw, rimCol, look.rimA, st.open ? rimOpen : rimIn, 0.01, half, 0, 0, k === 'red' ? 0.38 : 0.08);
      if (st.prog > 0.02) this._add(DECAL.FAN, pos.x, pos.y, pos.z, Math.max(0.2, R * st.prog), yaw, col, k === 'red' ? W.fillRed : W.fillA, 0, 0.02, half, 0, 0, 0.9, 1, 1, 0, 0);
      if (look.strike > 0) this._add(DECAL.FAN, pos.x, pos.y, pos.z, R, yaw, DECAL_COLORS.white, look.strike, 0, 0.02, half, 0, 0, 0.9, 1, 1, 0, 0);
      // the glyph at the tip (gold: the 8-point star turning slowly)
      const gx = pos.x + Math.sin(yaw) * (R - gSize * 0.5), gz = pos.z + Math.cos(yaw) * (R - gSize * 0.5);
      const gShape = glyphShape(k);
      if (gShape >= 0) {
        const gr = (gSize / 2 / 0.9) * look.glyph;
        this._add(gShape, gx, this._gy(gx, gz, pos.y), gz, gr, k === 'gold' ? this._time * 1.5 : yaw, k === 'gold' ? DECAL_COLORS.gold : DECAL_COLORS.white, 0.95, 0, 0.05, 0, 0, 0, 0, 1, 1, 0, GLYPH_INK / Math.max(0.01, INK.a));
        this._count('glyph');
      }
      this.wedgeList.push({ id: e.id, kind: k, activeAt: e.activeAt, frozen: st.frozen, open: st.open, range: R, half, yaw });
      this._count('wedge');
      n++;
    }
    if (this._frozen.size > 32) this._frozen.clear();
  }

  /** Glyphs Telegraphs queued for this frame (WA §3.4: disc / ring rims, lane edges, aim-line ends). */
  _glyphQueue() {
    const touch = this.ctx.input?.device === 'touch';
    const base = touch ? TELEGRAPH.glyphSizeTouch ?? 0.55 : TELEGRAPH.glyphSize ?? 0.45;
    for (let i = 0; i < this._glyphN; i++) {
      const g = this._glyphs[i];
      const size = g.size > 0 ? g.size : base;
      this._add(g.shape, g.x, g.y, g.z, size / 2 / 0.9, g.shape === DECAL.STAR ? this._time * 1.5 : g.yaw, g.color, g.alpha, 0, 0.05, 0, 0, 0, 0, 1, 1, 0, g.ink);
      this._count('glyph');
    }
    this._glyphN = 0;
  }

  /**
   * §8.2.2 the parry ring (settings.parryRing: auto = touch and Kitten difficulty): for the single most imminent
   * parryable attack on her, a ring shrinking from 2.2 m to her radius exactly at the strike, the parry window drawn
   * as a brighter band, a tick toward the attacker; gold for gold kinds. Red attacks: a pulsing dodge chevron instead.
   */
  _parryRing(p) {
    const ctx = this.ctx, st = ctx.state;
    if (!parryRingOn(st?.settings?.parryRing, ctx.input?.device, st?.difficulty)) return;
    const pos = p.object3d?.position ?? p.pos, now = ctx.game?.time ?? 0, r1 = p.radius ?? 0.45;
    const nx = ctx.combat?.nextParryable?.(p, DECAL_CFG.parryRing.range);
    if (nx) {
      const left = nx.activeAt - now, r = parryRingRadius(left, r1);
      if (r != null) {
        const win = nx.window ?? PLAYER.guard.parryWindow, inWin = left <= win;
        const col = nx.kind === 'gold' ? DECAL_COLORS.gold : DECAL_COLORS.white;
        const att = nx.attacker?.pos ?? nx.projectile?.pos;
        const yaw = att ? Math.atan2(att.x - pos.x, att.z - pos.z) : 0;
        this._add(DECAL.RING, pos.x, pos.y, pos.z, Math.max(r, r1 + 0.02), yaw, col, inWin ? 0.8 : 0.6, inWin ? 0.82 : 0.9, 0.015, att ? 0.35 : 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
        // the target band: where the ring must be when she raises the Stand (brighter through the window)
        this._add(DECAL.RING, pos.x, pos.y, pos.z, r1 + 0.18, 0, col, inWin ? 0.5 : 0.25, 0.72, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
        this.parryRingR = r;
        this._count('parryRing');
      }
    }
    // red (unblockable) wind-ups on her: a pulsing chevron pointing away from the attacker (dodge!)
    const book = ctx.combat?.threats;
    if (!book?.live?.size) return;
    let best = null, bestLeft = Infinity;
    for (const e of book.live.values()) {
      if (e.kind !== 'red' || e.targetsPlayer === false || !e.actor?.pos || e.actor.alive === false) continue;
      const left = e.activeAt - now;
      if (left > DECAL_CFG.parryRing.lead || left < -0.05 || left >= bestLeft) continue;
      if (Math.hypot(e.actor.pos.x - pos.x, e.actor.pos.z - pos.z) > DECAL_CFG.parryRing.range) continue;
      best = e; bestLeft = left;
    }
    if (best) {
      const yaw = Math.atan2(pos.x - best.actor.pos.x, pos.z - best.actor.pos.z);
      const x = pos.x + Math.sin(yaw) * 0.9, z = pos.z + Math.cos(yaw) * 0.9;
      this._add(DECAL.CHEVRON, x, pos.y, z, 0.55, yaw, TELEGRAPH.colors.red, 1, 0, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
      this._count('chevron');
    }
  }

  /** §7.3 Riposte ready: a gold arrow from her to the parried enemy (0.8 s). */
  _riposte(p) {
    const t = p.riposteTarget;
    if (!t?.pos || !(p.riposteT > 0) || t.alive === false) return;
    const a = p.object3d?.position ?? p.pos, b = t.object3d?.position ?? t.pos;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.9) return;
    const r0 = 0.8, r1 = Math.max(r0 + 0.3, d - (t.radius ?? 0.4) - 0.1), L = r1 - r0, yaw = Math.atan2(dx, dz);
    const mx = a.x + (dx / d) * (r0 + L / 2), mz = a.z + (dz / d) * (r0 + L / 2);
    const k = Math.min(1, p.riposteT / 0.2);
    this._add(DECAL.ARROW, mx, a.y, mz, 1, yaw, DECAL_COLORS.gold, 0.85 * k, 0, 0.01, 0, 0, 0, 0, 0.32, L / 2, DECAL_CFG.pull);
    this._count('riposte');
  }

  /** §7.3 the ranges overlay while `ranges` is held (Z / MMB / L3 held, one hold with the peek; TT3 dropped Ctrl): AA reach, the Stand fan, the kitten's ability range. */
  _ranges(p) {
    const input = this.ctx.input;
    if (!input?.down?.('ranges')) return;
    const pos = p.object3d?.position ?? p.pos, pull = DECAL_CFG.pull;
    this._add(DECAL.DASH, pos.x, pos.y, pos.z, DECAL_CFG.aaReach, 0, DECAL_COLORS.white, 0.6, 0.94, 0.01, 0, 24, 0, 0, 1, 1, pull);
    if (p.state !== 'guard') this._add(DECAL.FAN, pos.x, pos.y, pos.z, DECAL_CFG.fanR, p.facing, DECAL_COLORS.silver, 0.35, 0.86, 0.015, p.guardState?.arc ?? PLAYER.guard.arc, 0, 0, 0.05, 1, 1, pull);
    const sh = this.ctx.companions?.abilityShape?.();
    const R = sh ? (sh.shape === 'self' ? sh.width / 2 : sh.range) : 0;
    if (R > 0.5) this._add(DECAL.DASH, pos.x, pos.y, pos.z, R, 0, sh.shape === 'self' ? DECAL_COLORS.mint : DECAL_COLORS.gold, 0.45, 1 - 0.06 / Math.max(1, R / 2), 0.004, 0, Math.round(R * 6), 0);
    this._count('ranges');
  }

  /** §7.4 the selection: a gold dashed ring rotating 0.5 rev/s, red during its wind-up. */
  _selection(cam) {
    const t = cam.lockTarget;
    if (!t?.pos || t.alive === false) return;
    const pos = t.object3d?.position ?? t.pos;
    const windup = t.stateName === 'windup' || t.telegraph != null;
    const r = Math.max(0.6, (t.radius ?? 0.4) * 1.2 + 0.25);
    this._add(DECAL.DASH, pos.x, pos.y, pos.z, r, 0, windup ? TELEGRAPH.colors.red : DECAL_COLORS.gold, 0.85, 0.86, 0.012, 0, 12, this._time * Math.PI);
    this._count('selection');
  }

  /** §7.4 hover (desktop): a thin ring under what the cursor is over + the actor's rim highlight. */
  _hover(cam) {
    const h = cam.hover, input = this.ctx.input;
    // (a pointer that left the canvas keeps the camera's last pick: no hover then)
    if (!h || input?.device !== 'kbm' || h.kind === 'ground' || h.actor?.alive === false || input.pointer?.inside === false) { this._unhighlight(); return; }
    let pos = null, r = 0.6, col = DECAL_COLORS.white, rim = DECAL_COLORS.white;
    if (h.actor?.pos) { pos = h.actor.object3d?.position ?? h.actor.pos; r = Math.max(0.5, (h.actor.radius ?? 0.4) + 0.25); }
    else if (h.interact?.pos) { pos = h.interact.pos; r = Math.min(1.4, Math.max(0.6, (h.interact.r ?? 1.2) * 0.5)); }
    if (!pos) { this._unhighlight(); return; }
    // WA §3.6: an enemy gets its rim highlight (the danger hue lives on the enemy, not on the ground: cream ring);
    // interactables / pickups go mint (WA2); NPCs white
    if (h.kind === 'enemy') { col = DECAL_COLORS.cream; rim = DECAL_COLORS.red; }
    else if (h.kind === 'interact' || h.kind === 'breakable' || h.kind === 'pickup') { col = DECAL_COLORS.mint; rim = DECAL_COLORS.mint; }
    this._highlight(h.actor ?? h.interact?.object3d ?? null, rim);
    if (h.actor && h.actor === cam.lockTarget) return;
    this._add(DECAL.RING, pos.x, pos.y ?? 0, pos.z, r, 0, col, h.kind === 'interact' ? CLASS_MARKS.interact.alpha + 0.25 : 0.75, 0.9, 0.012);
    this._count('hover');
  }

  _highlight(target, color) {
    const H = this._hl;
    if (H.actor === target && H.color === color) return;
    this._unhighlight();
    if (!target || target === this.ctx.player) return;
    try { if (setHighlight(target, color, 1)) { H.actor = target; H.color = color; } } catch { /* no model yet */ }
  }

  _unhighlight() {
    const H = this._hl;
    if (!H.actor) return;
    try { setHighlight(H.actor, null); } catch { /* disposed */ }
    H.actor = null; H.color = null;
  }

  /** §8.2.6 / WA §3.2 thin coral rings under alerted enemies near her. */
  _aggro(p) {
    if (!p) return;
    const list = this.ctx.enemies?.list;
    if (!list) return;
    let n = 0;
    for (const e of list) {
      if (n >= 10) break;
      if (!e?.alerted || e.alive === false || e.hidden || e === this.ctx.cam?.lockTarget) continue;
      if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 16) continue;
      const pos = e.object3d?.position ?? e.pos, R = Math.max(0.45, (e.radius ?? 0.4) + 0.15);
      this._add(DECAL.RING, pos.x, pos.y, pos.z, R, 0, DECAL_COLORS.aggro, 0.4, 1 - 0.08 / R, 0.01);
      n++;
    }
    if (n) this.counts.aggro = n;
  }

  /** WA §3.2 / WA3: each companion stands on a sky-blue dashed ring (8 dashes, r 0.5, α 0.35). */
  _companions() {
    const list = this.ctx.companions?.active, C = CLASS_MARKS.companion;
    if (!list?.length) return;
    let n = 0;
    for (const c of list) {
      if (!c?.pos || c.alive === false || c.hidden || c.object3d?.visible === false || c.napping) continue;
      const pos = c.object3d?.position ?? c.pos;
      this._add(DECAL.DASH, pos.x, pos.y, pos.z, C.r, 0, DECAL_COLORS.sky, C.alpha, 0.8, 0.012, 0, C.dashes ?? 8, this._time * 0.6);
      n++;
    }
    if (n) this.counts.companions = n;
  }

  /**
   * WA2: interactables in reach of her eye get a mint ring (α 0.30, 0.8 Hz, ±6 % radius pulse; α 0.55 when hovered),
   * the nearest ≤ 6 within 8 m. FX twinkles them every 2.5 s (Twinkles.js).
   */
  _interactables(p, cam) {
    const list = this.ctx.levels?.current?.interactables, I = CLASS_MARKS.interact;
    if (!list?.length) return;
    const near = this._near, nd = this._nearD, max = I.maxZones ?? 6, range = I.range ?? 8;
    let k = 0;
    for (const it of list) {
      if (!it?.pos || (it.enabled && !it.enabled()) || it.ring === false) continue;
      const d = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z);
      if (d > range || Math.abs((it.pos.y ?? p.pos.y) - p.pos.y) > 3) continue;
      // insertion into the ≤ max nearest
      let j = Math.min(k, max - 1);
      if (k >= max && d >= nd[max - 1]) continue;
      while (j > 0 && nd[j - 1] > d) { near[j] = near[j - 1]; nd[j] = nd[j - 1]; j--; }
      near[j] = it; nd[j] = d;
      if (k < max) k++;
    }
    const hov = cam?.hover, hid = hov && (hov.kind === 'interact') ? (hov.id ?? hov.interact?.id ?? null) : null;
    const pulse = 1 + (I.pulse ?? 0.06) * Math.sin(this._time * (I.hz ?? 0.8) * Math.PI * 2);
    for (let i = 0; i < k; i++) {
      const it = near[i], r = Math.min(1.2, Math.max(0.5, (it.r ?? 1.2) * 0.5)) * pulse;
      const a = it.id != null && it.id === hid ? I.alpha + 0.25 : I.alpha;
      this._add(DECAL.RING, it.pos.x, this._gy(it.pos.x, it.pos.z, it.pos.y ?? p.pos.y), it.pos.z, r, 0, DECAL_COLORS.mint, a, 1 - 0.1 / r, 0.01);
      near[i] = null;
    }
    this.interactCount = k;
    if (k) this.counts.interact = k;
  }

  /** §8.2.4 bolts get a 0.15 m ground shadow dot (plum); reflected ones a gold one. */
  _bolts() {
    const list = this.ctx.combat?.projectiles?.list;
    if (!list?.length) return;
    let n = 0;
    for (const q of list) {
      if (n >= DECAL_CFG.bolt.max) break;
      if (!q?.alive || q.wave || !q.pos) continue;
      const gy = this._gy(q.pos.x, q.pos.z, q.pos.y);
      if (q.pos.y - gy > 6) continue;
      this._add(DECAL.DISC, q.pos.x, gy, q.pos.z, DECAL_CFG.bolt.r, 0, q.reflected ? DECAL_COLORS.gold : DECAL_COLORS.blob, q.reflected ? 0.8 : 0.5, 0.3, 0.02, 0, 0, 0, 0, 1, 1, 0, 0);
      n++;
    }
    if (n) this.counts.bolts = n;
  }

  /**
   * §10.3 / WA §3.6 the path she is walking: 3 dots along the next segment while the move button is held; with
   * `settings.pathPreview` (pathPreviewOn), pink paws every 1.2 m along the whole path, alternating ±0.08 m and drawn
   * outward at 12 m/s from the order; always a small goal on a move / attack-move.
   */
  _path(p) {
    const o = p?.orders;
    if (!o?.kind || !o.path?.length || o.engaged || o.wp >= o.path.length) return;
    const input = this.ctx.input, from = p.object3d?.position ?? p.pos, C = DECAL_CFG;
    const rmb = !!input?.down?.('move');
    const preview = pathPreviewOn(this.ctx.state?.settings?.pathPreview, input?.device, this.ctx.levels?.current?.id);
    if (preview) {
      const pts = pointsAlong(from, o.path, C.previewEvery, C.previewMax, this._pts, o.wp, this._ptPool);
      const shown = Number.isFinite(this._orderT) ? Math.floor((this._orderT * C.previewSpeed) / C.previewEvery) + 1 : pts.length;
      let k = 0;
      for (const q of pts) {
        if (k >= shown) break;
        const side = (k & 1 ? 1 : -1) * C.previewSide, sx = Math.cos(q.yaw) * side, sz = -Math.sin(q.yaw) * side;
        const x = q.x + sx, z = q.z + sz;
        this._add(DECAL.PAW, x, this._gy(x, z, from.y), z, 0.16, q.yaw, DECAL_COLORS.move, C.previewA, 0, 0.03, 0, 0, 0, 0, 1, 1, 0, 0.6);
        k++;
      }
      if (k) this.counts.path = k;
    } else if (rmb) {
      const w = o.path[o.wp], d = Math.hypot(w.x - from.x, w.z - from.z);
      const step = Math.max(0.35, Math.min(1.2, d / (C.rmbDots + 1)));
      const pts = pointsAlong(from, o.path, step, C.rmbDots, this._pts, o.wp, this._ptPool);
      for (const q of pts) this._add(DECAL.DISC, q.x, this._gy(q.x, q.z, from.y), q.z, 0.09, 0, DECAL_COLORS.cream, 0.6, 0.3, 0.02, 0, 0, 0, 0, 1, 1, 0, 0);
      if (pts.length) this.counts.path = pts.length;
    }
    if (o.kind === 'move' || o.kind === 'attackMove') {
      const g = o.path[o.path.length - 1], T = C.marker.ticks;
      if (o.kind === 'attackMove') this._add(DECAL.RING, g.x, g.y, g.z, 0.3, 0, DECAL_COLORS.gold, 0.45, 0.7, 0.02);
      else this._add(DECAL.TICKS, g.x, g.y, g.z, C.marker.goal, Math.PI / 4, DECAL_COLORS.cream, 0.75, T.inner, 0.03, T.hw, 0, 0, 0.1);
      this._count('goal');
    }
  }

  /** §10.3 queued waypoints (Shift + RMB, `moba` only): small dots joined by dotted lines from the current goal. */
  _queue(p) {
    const o = p?.orders, Q = o?.queue;
    if (!Q?.length) return;
    const last = o.path?.length ? o.path[o.path.length - 1] : p.pos;
    let px = last.x, pz = last.z, n = 0;
    for (const q of Q) {
      const dx = q.x - px, dz = q.z - pz, d = Math.hypot(dx, dz);
      const steps = Math.min(16, Math.floor(d / DECAL_CFG.dashEvery));
      for (let k = 1; k < steps; k++) {
        const t = k / steps, x = px + dx * t, z = pz + dz * t;
        this._add(DECAL.DISC, x, this._gy(x, z, q.y ?? p.pos.y), z, DECAL_CFG.queueDot, 0, DECAL_COLORS.cream, 0.45, 0.3, 0.02, 0, 0, 0, 0, 1, 1, 0, 0);
      }
      this._add(DECAL.TICKS, q.x, q.y ?? this._gy(q.x, q.z, p.pos.y), q.z, 0.24, Math.PI / 4, DECAL_COLORS.cream, 0.75, DECAL_CFG.marker.ticks.inner, 0.03, DECAL_CFG.marker.ticks.hw, 0, 0, 0.12);
      px = q.x; pz = q.z; n++;
    }
    this.counts.queued = n;
  }

  /** Companion ability indicator (§7.5) from ctx.companions.aim. */
  _ability() {
    const fx = this.ctx.fx, aim = this.ctx.companions?.aim;
    if (fx) fx.drawsAbilityAim = this.enabled && !!this.ctx.cam?.isIso;
    if (!aim?.active || !aim.plan) return;
    const pl = aim.plan, col = aim.valid === false ? DECAL_COLORS.grey : aim.shape === 'self' ? DECAL_COLORS.mint : DECAL_COLORS.white;
    if (aim.shape === 'rect' && pl.center) {
      const L = Math.max(pl.width ?? 3, pl.length ?? 0.4), W = Math.min(pl.width ?? 3, pl.length ?? 0.4);
      const R = L / 2 + 0.1;
      this._add(DECAL.RECT, pl.center.x, pl.center.y ?? this.ctx.player.pos.y, pl.center.z, R, (pl.yaw ?? 0) + Math.PI / 2, col, 0.75, 0, 0.01, 0, (L / 2) / R, (W / 2 + 0.05) / R);
    } else if (aim.shape === 'targets') {
      const o = pl.origin ?? this.ctx.player.pos;
      const oy = o.y ?? this.ctx.player.pos.y, range = pl.range ?? 14, none = !(pl.targets?.length);
      this._add(DECAL.RING, o.x, oy, o.z, range, 0, col, 0.45, 0.985, 0.002);
      this._reachEdge(o, oy, range, pl);
      for (const t of pl.targets ?? []) if (t?.pos) this._add(DECAL.RING, t.pos.x, t.pos.y, t.pos.z, 0.55, 0, DECAL_COLORS.gold, 0.85, 0.75, 0.02);
      // the aim point chip (cursor / drag / stick): white over a hit, warm grey ring + cross = "no target here"
      if (pl.aimed && pl.point) {
        let px = pl.point.x, pz = pl.point.z;
        const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz);
        if (d > range) { px = o.x + dx / d * range; pz = o.z + dz / d * range; }
        const py = this._gy(px, pz, pl.point.y ?? oy), c2 = none ? DECAL_COLORS.grey : DECAL_COLORS.white;
        this._add(DECAL.RING, px, py, pz, 0.5, 0, c2, 0.85, 0.8, 0.02, 0, 0, 0, none ? 0.12 : 0, 1, 1, DECAL_CFG.pull);
        if (none) this._add(DECAL.CROSS, px, py, pz, 0.3, 0, DECAL_COLORS.grey, 0.9, 0, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull);
        this._count('abilityChip');
      }
    } else if (aim.shape === 'self') {
      const o = this.ctx.player.pos;
      this._add(DECAL.RING, o.x, o.y, o.z, pl.radius ?? 2, 0, col, 0.6, 0.9, 0.01, 0, 0, 0, 0.12);
    }
    this._count('ability');
  }

  /**
   * A reach ring wider than the view (Volley's 14 m vs ±7.7 m of iso frame) is never seen: where the ring leaves the
   * screen along the aim, a dotted arc of it is drawn just inside the frame edge, with a chevron pointing on out
   * ("reach continues"). Nothing extra when the ring point itself is on screen.
   */
  _reachEdge(o, oy, range, pl) {
    const cam = this.ctx.cam, R = DECAL_CFG.reachEdge;
    if (!cam?.onScreen) return;
    let dx = 0, dz = 0;
    if (pl.aimed && pl.dir) { dx = pl.dir.x; dz = pl.dir.z; }
    else if (pl.targets?.[0]?.pos) { dx = pl.targets[0].pos.x - o.x; dz = pl.targets[0].pos.z - o.z; }
    else { const f = this.ctx.player?.facing ?? 0; dx = Math.sin(f); dz = Math.cos(f); }
    const l = Math.hypot(dx, dz);
    if (!(l > 1e-4)) return;
    dx /= l; dz /= l;
    const P = _p, on = (d) => cam.onScreen(P.set(o.x + dx * d, this._gy(o.x + dx * d, o.z + dz * d, oy), o.z + dz * d), R.margin);
    if (on(range)) return;
    let lo = 0.5, hi = range;
    if (!on(lo)) return;
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (on(m)) lo = m; else hi = m; }
    // the reach mark stays white (the reach is real either way; the aim chip carries "no target"), inked
    const d = lo, yaw0 = Math.atan2(dx, dz), half = Math.min(0.6, R.arc / 2 / d), n = R.dots, c = DECAL_COLORS.white;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1, a = yaw0 + u * half, x = o.x + Math.sin(a) * d, z = o.z + Math.cos(a) * d, y = this._gy(x, z, oy);
      if (i !== (n - 1) / 2 && !cam.onScreen(P.set(x, y, z), 0.15)) continue;   // the arc may run off a frame corner
      const f = 1 - 0.55 * Math.abs(u);
      this._add(DECAL.DISC, x, y, z, R.dot, 0, c, 0.95 * f, 0.55, 0.02, 0, 0, 0, 0, 1, 1, DECAL_CFG.pull, 1.4);
    }
    const cx = o.x + dx * (d - 0.5), cz = o.z + dz * (d - 0.5), cy = this._gy(cx, cz, oy);
    this._add(DECAL.ARROW, cx, cy, cz, 0.32, yaw0, c, 0.9, 0, 0.02, 0, 0, 0, 0, 0.7, 1, DECAL_CFG.pull, 1.4);
    this.reachEdgeAt = d;
    this._count('reachEdge');
  }

  /** The tutorial ghost-paw ground spot: a cream paw breathing at 1.2 Hz inside a soft ring. */
  _ghost(dt) {
    const G = this.ghost, C = DECAL_CFG.ghost;
    if (!G.on) return;
    G.t += dt;
    const k = 0.5 + 0.5 * Math.sin(G.t * C.hz * Math.PI * 2), a = Math.min(1, G.t / 0.25);
    this._add(DECAL.PAW, G.x, this._gy(G.x, G.z, G.y), G.z, C.r * (0.92 + 0.08 * k), 0, DECAL_COLORS.cream, (0.55 + 0.3 * k) * a, 0, 0.03);
    this._add(DECAL.RING, G.x, this._gy(G.x, G.z, G.y), G.z, C.r * (1.5 + 0.25 * k), 0, DECAL_COLORS.cream, 0.45 * (1 - k) * a, 0.86, 0.02);
    this._count('ghost');
  }

  /**
   * Order markers: the tap ripple (WA §3.6: a pink ring 0 → 1.15 → 1.0 in 0.12 s around a cream paw, + 4 collapsing
   * ticks; gone in 0.6 s; `double` → two paws side by side), gold attack / use rings, a warm-grey ✕ paw (unreachable); plus the slash smear and the
   * Golden Hour gleam lanes.
   */
  _markers(dt, play) {
    const M = DECAL_CFG.marker, pl = this.ctx.player;
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      if (m.delay > 0) { m.delay -= dt; if (play) continue; }
      m.t += dt;
      if (m.t >= m.dur || !play) { this.markers.splice(i, 1); continue; }
      const k = m.t / m.dur, grow = Math.min(1, m.t / M.grow), fade = 1 - k;
      if (m.actor?.pos) { const ap = m.actor.object3d?.position ?? m.actor.pos; m.x = ap.x; m.y = ap.y; m.z = ap.z; }
      switch (m.kind) {
        case 'move': case 'follow': {
          const T = M.ticks, c = 1 - Math.min(1, m.t / T.collapse);
          // the ripple: 0 → 1.15 over the grow time, settling to 1.0 by twice it
          const rip = grow < 1 ? grow * M.ripple : 1 + (M.ripple - 1) * Math.max(0, 1 - (m.t - M.grow) / M.grow);
          this._add(DECAL.RING, m.x, m.y, m.z, M.paw * 1.9 * rip, 0, DECAL_COLORS.move, 0.9 * fade, 0.8, 0.03);
          if (m.double) {
            // WA §3.6 double tap on the same spot: two paws side by side (left one a step behind), no extra draw
            const s = M.paw * Math.min(1, rip), ox = Math.cos(m.yaw) * M.paw * 0.55, oz = -Math.sin(m.yaw) * M.paw * 0.55;
            const bx = Math.sin(m.yaw) * M.paw * 0.3, bz = Math.cos(m.yaw) * M.paw * 0.3;
            this._add(DECAL.PAW, m.x - ox - bx, m.y, m.z - oz - bz, s * 0.9, m.yaw, DECAL_COLORS.cream, 0.95 * fade, 0, 0.03);
            this._add(DECAL.PAW, m.x + ox + bx, m.y, m.z + oz + bz, s * 0.9, m.yaw, DECAL_COLORS.cream, 0.95 * fade, 0, 0.03);
          } else this._add(DECAL.PAW, m.x, m.y, m.z, M.paw * Math.min(1, rip), m.yaw, DECAL_COLORS.cream, 0.95 * fade, 0, 0.03);
          this._add(DECAL.TICKS, m.x, m.y, m.z, T.r1 + (T.r0 - T.r1) * c * c, Math.PI / 4, DECAL_COLORS.cream, 0.95 * Math.min(1, fade * 1.6), T.inner, 0.025, T.hw, 0, 0, 0);
          break;
        }
        case 'attackMove':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.25 + 0.5 * grow, 0, DECAL_COLORS.gold, 0.9 * fade, 0.78, 0.02);
          this._add(DECAL.CROSS, m.x, m.y, m.z, 0.22 * grow, 0, DECAL_COLORS.gold, 0.8 * fade, 0, 0.02);
          break;
        case 'attack':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.9 - 0.3 * grow, 0, DECAL_COLORS.gold, 0.95 * fade, 0.82, 0.02);
          break;
        case 'use':
          this._add(DECAL.RING, m.x, m.y, m.z, 0.9 - 0.3 * grow, 0, DECAL_COLORS.mint, 0.95 * fade, 0.82, 0.02);
          break;
        case 'smear': {
          if (m.follow && pl) { const pp = pl.object3d?.position ?? pl.pos; m.x = pp.x; m.y = pp.y; m.z = pp.z; }
          this._add(DECAL.FAN, m.x, m.y, m.z, m.r, m.yaw, DECAL_COLORS.white, DECAL_CFG.smear.alpha * fade, 0.55, 0.03, m.half, 0, 0, 0.5, 1, 1, 0, 0);
          this._count('smear');
          break;
        }
        case 'gleam': {
          const x = m.x + Math.sin(m.yaw) * m.l / 2, z = m.z + Math.cos(m.yaw) * m.l / 2;
          this._add(DECAL.LANE, x, m.y, z, 1, m.yaw, DECAL_COLORS.gold, 0.8 * fade, 0, 0.01, 0, 0, 0, 0.3, m.w / 2, m.l / 2, DECAL_CFG.pull);
          this._count('gleam');
          break;
        }
        default:
          this._add(DECAL.PAW, m.x, m.y, m.z, 0.4, m.yaw, DECAL_COLORS.grey, 0.75 * fade, 0, 0.03);
          this._add(DECAL.CROSS, m.x, m.y, m.z, 0.42, 0, DECAL_COLORS.grey, 0.95 * fade, 0, 0.02);
      }
      if (m.kind !== 'smear' && m.kind !== 'gleam') this._count('marker');
    }
  }
}

const _white = new THREE.Color('#FFFFFF');
