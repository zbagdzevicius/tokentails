/**
 * L-CROWD GLSL. Every dance move runs here (SPEC.md "Performance"): uniforms carry the music
 * (`uBeat`, `uKick`, `uEnergy`, `uBuild`, `uDrop`), the taps (`uJump`, `uPulse`) and the formation
 * (`uVortex`, `uVortexT`); per-instance attributes carry the slot and the cat's seed. No per-frame
 * matrix uploads.
 *
 * `catPose()` must stay in step with `catAxis()` in slots.ts (vortex angle, facing, pitch, lift).
 */
import { LAYOUT } from '../config';
import { CAT_SHAPE } from './catGeometry';
import { CAT_CENTER_Y, DROP_IN_SECONDS, VORTEX_AREA, VORTEX_FALLOFF, VORTEX_INNER, VORTEX_LIFT, VORTEX_PITCH, VORTEX_SPEED } from './slots';

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const S = CAT_SHAPE;

export const POSE_GLSL = /* glsl */ `
uniform float uTime;
uniform float uBeat;
uniform float uKick;
uniform float uEnergy;
uniform float uBuild;
uniform float uDrop;
uniform float uPulse;
uniform float uVortex;
uniform float uVortexT;
uniform vec4 uJump;
// 0..1: hops roll out from the booth as a ripple (later loops)
uniform float uWave;
// POV clearing: xy camera xz, zw forward xz; uConeAmt 0..1.
uniform vec4 uCone;
uniform float uConeAmt;

// x, z: slot on the floor; z: height scale; w: fur (0 cream .. 1 ginger)
attribute vec4 aSlot;
// x: seed; y: drop-in start (uTime seconds); z: highlight 0/1
attribute vec4 aData;

varying float vSeed;
varying float vFur;
varying float vHi;
varying float vGlow;

const float PI = 3.14159265;
const float VORTEX_SPEED = ${f(VORTEX_SPEED)};
const float VORTEX_FALLOFF = ${f(VORTEX_FALLOFF)};
const float VORTEX_LIFT = ${f(VORTEX_LIFT)};
const float VORTEX_PITCH = ${f(VORTEX_PITCH)};
const float VORTEX_INNER = ${f(VORTEX_INNER)};
const float VORTEX_AREA = ${f(VORTEX_AREA)};
const float CENTER_Y = ${f(CAT_CENTER_Y)};
const float DROP_DUR = ${f(DROP_IN_SECONDS)};
const float DROP_H = ${f(LAYOUT.dropInHeight)};

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

struct Pose {
  vec3 pos;      // feet on the floor (plus hop / lift / fall)
  float yaw;
  float pitch;
  float roll;
  float sy;
  float sxz;
  float scale;
  float shake;
  float armL;
  float armR;
  float armFwd;
  float nod;
  float tilt;
  float tail;
  float glow;
};

Pose catPose() {
  Pose P;
  float seed = aData.x;
  float e = uEnergy;

  // Formation: in the vortex every cat moves to an even golden-angle (sunflower) spiral slot by its
  // index (no gaps or clumps, inner ring at VORTEX_INNER), then the swirl shears it into arms.
  // Mirrors vortexSlot() / catAxis() in slots.ts.
  vec2 s = aSlot.xy;
  if (uVortex > 0.0) {
    float vi = aData.w;
    float vr = sqrt(VORTEX_INNER * VORTEX_INNER + vi * VORTEX_AREA);
    float va = fract(vi * 0.38196601) * 2.0 * PI;
    s = mix(s, vec2(cos(va), sin(va)) * vr, uVortex);
  }
  float r = length(s);
  float a = atan(s.y, s.x) + uVortexT * VORTEX_SPEED / (r + VORTEX_FALLOFF);
  vec2 p = vec2(cos(a), sin(a)) * r;
  // Crowd POV: cats inside a 3 m cone in front of the camera step aside.
  if (uConeAmt > 0.001) {
    vec2 rel = p - uCone.xy;
    float ahead = dot(rel, uCone.zw);
    // From just behind the camera to 3 m ahead; at least 1.3 m off the axis, so no cat stands
    // inside the 1 m near cull (a cut-open cat shows its hollow inside).
    if (ahead > -1.2 && ahead < 3.0) {
      vec2 side = rel - uCone.zw * ahead;
      float sl = length(side);
      float halfW = 1.3 + max(ahead, 0.0) * 0.35;
      if (sl < halfW) {
        vec2 sd = sl > 1e-3 ? side / sl : vec2(uCone.w, -uCone.z);
        p += sd * (halfW - sl) * uConeAmt * smoothstep(3.0, 2.2, ahead);
      }
    }
  }
  vec2 toBooth = -p / max(r, 1e-3);
  vec2 tang = vec2(-sin(a), cos(a));
  vec2 fwd = mix(toBooth, tang, uVortex);
  fwd = fwd / max(length(fwd), 1e-4);

  // Dance: loose in the groove, locked together on the drop. The wave move delays each cat by its
  // distance from the booth, so the hops roll outwards through the crowd like a stadium wave.
  float b = uBeat + (seed - 0.5) * 0.22 * (1.0 - uDrop) * (1.0 - uWave) - uWave * r * 0.075;
  float ph = fract(b);
  float land = exp(-ph * 9.0);
  float hopAmp = (mix(0.035, 0.11, e) + 0.15 * uDrop + 0.06 * uWave) * (1.0 - 0.65 * uBuild);
  float hop = hopAmp * pow(max(sin(PI * ph), 0.0), 1.5);
  hop += uBuild * 0.045 * abs(sin(PI * 2.0 * b));          // 8th-note jitter in the build
  P.sy = 1.0 - (0.05 + 0.08 * e) * land - 0.17 * uBuild;   // squash on the kick, crouch in the build
  P.sxz = 1.0 + (0.035 + 0.05 * e) * land + 0.07 * uBuild;
  P.roll = sin(PI * 0.5 * b + seed * 6.2831) * mix(0.13, 0.06, e) * (1.0 - uVortex);
  P.shake = sin(uTime * 47.0 + seed * 31.0) * 0.03 * uBuild;

  // Tap: a hop that ripples out from the tap point.
  float d = length(p - uJump.xy);
  float jt = (uTime - uJump.z - d * 0.045) / 0.55;
  float jump = (jt > 0.0 && jt < 1.0) ? uJump.w * 0.85 * 4.0 * jt * (1.0 - jt) : 0.0;

  // Paws (angle > 0 swings a forearm in towards the head): alternate waves in the groove, a wide V
  // that pumps on the drop (never the crossed X), shake in the build, fling out on a tap hop.
  float pump = 0.5 + 0.5 * sin(2.0 * PI * b);
  float alt = sin(PI * b + seed * 3.0);
  float amp = 0.1 + 0.12 * e;
  float buzz = 0.18 * uBuild * sin(uTime * 31.0 + seed * 9.0);
  float vee = -0.1 - 0.12 * pump;
  P.armL = mix(amp * alt, vee, uDrop) + buzz - 0.2 * jump;
  P.armR = mix(-amp * alt, vee, uDrop) - buzz - 0.2 * jump;
  P.armFwd = (0.18 * land * (0.3 + e) - 0.08) * (1.0 - uVortex) + 0.7 * uVortex;
  P.nod = (0.2 * land * (0.4 + e) - 0.05) * (1.0 - 0.5 * uVortex) + 0.25 * uBuild * sin(uTime * 24.0 + seed);
  P.tilt = (seed - 0.5) * 0.35 + P.roll * 0.8;
  P.tail = sin(uTime * 3.1 + seed * 12.0) * (0.35 + 0.3 * e);

  // Vortex: lift off and fly face-down around the booth.
  float lift = uVortex * (VORTEX_LIFT + 0.15 * sin(uTime * 1.7 + seed * 6.2831));
  P.pitch = uVortex * (VORTEX_PITCH + 0.12 * sin(uTime * 2.3 + seed * 9.0));
  P.roll += uVortex * 0.25 * sin(uTime * 1.3 + seed * 5.0);

  // Drop-in from the sky: hidden before its start, falls spinning, squashes on landing.
  float y = hop + jump + lift;
  float vis = 1.0;
  P.glow = 0.0;
  float yawSpin = 0.0;
  float t = (uTime - aData.y) / DROP_DUR;
  if (t < 0.0) {
    vis = 0.0;
  } else if (t < 1.0) {
    // Fast from the sky, then a soft parachute-like ease into the slot: the last ~5 m take ~0.4 s,
    // so the landing shot sees the cat come down (an accelerating fall was off-screen until the
    // last few frames).
    float fall = clamp(t / 0.72, 0.0, 1.0);
    y += DROP_H * pow(1.0 - fall, 2.4);
    yawSpin = (1.0 - fall) * (1.0 - fall) * 14.0;
    float sq = t > 0.72 ? sin(PI * (t - 0.72) / 0.28) : 0.0;
    P.sy *= 1.0 - 0.4 * sq;
    P.sxz *= 1.0 + 0.3 * sq;
    P.armL += 0.6 * (1.0 - fall);
    P.armR += 0.6 * (1.0 - fall);
    P.glow = 1.0 - t;
  }

  P.yaw = atan(fwd.x, fwd.y) + yawSpin;
  P.scale = aSlot.z * (1.0 + 0.1 * aData.z) * vis;
  P.pos = vec3(p.x, y, p.y);

  vSeed = seed;
  vFur = aSlot.w;
  vHi = aData.z;
  vGlow = P.glow;
  return P;
}

vec3 placeLocal(Pose P, vec3 q) {
  q.y *= P.sy;
  q.xz *= P.sxz;
  q.x += P.shake * q.y;
  q = rotZ(P.roll) * q;
  vec3 c = vec3(0.0, CENTER_Y, 0.0);
  q = rotX(P.pitch) * (q - c) + c;
  q *= P.scale;
  q = rotY(P.yaw) * q;
  return q + P.pos;
}

vec3 placeNormal(Pose P, vec3 n) {
  return rotY(P.yaw) * (rotX(P.pitch) * (rotZ(P.roll) * n));
}
`;

export const COLOR_GLSL = /* glsl */ `
uniform vec3 uCream;
uniform vec3 uMid;
uniform vec3 uGinger;
uniform vec3 uPink;
uniform vec3 uGreen;
uniform vec3 uFill;
uniform vec3 uInnerEar;
uniform float uTime;
uniform float uKick;
uniform float uEnergy;
uniform float uPulse;

/** 0 warm peach cream (PALETTE.furCream) .. 0.5 tan .. 1 ginger (PALETTE.furGinger). */
vec3 furColor(float fur) {
  return fur < 0.5 ? mix(uCream, uMid, fur * 2.0) : mix(uMid, uGinger, fur * 2.0 - 1.0);
}

/** Hot-pink pad emission (saturated magenta-pink after ACES; kick, tap and drop-in pump it). */
vec3 padGlow(float glow, float hi) {
  float g = 2.6 + 1.0 * uKick * (0.35 + uEnergy) + 1.8 * uPulse + 2.2 * glow + 0.8 * hi;
  // Only a hint of white core: brighter than this, ACES pushes the green channel up and the pads
  // read white-pink instead of hot pink (round-3 review). The pink spill round the pad is the glow.
  return uPink * g + vec3(1.0, 0.55, 0.75) * g * 0.05;
}

/**
 * Night fur lighting: dim key from above and behind (moon and booth side, so the backs the hero
 * camera sees stay mid-tone), low ambient, an upward green fill from the glowing floor (#3dff6a)
 * and a green fresnel rim.
 */
vec3 litFur(vec3 col, vec3 N, vec3 V) {
  vec3 L = normalize(vec3(0.25, 0.9, -0.35));
  float diff = max(dot(N, L), 0.0);
  float hemi = N.y * 0.5 + 0.5;
  vec3 ambient = mix(vec3(0.05, 0.06, 0.055), vec3(0.3, 0.28, 0.3), hemi);
  float under = clamp(-N.y * 0.75 + 0.3, 0.0, 1.0);
  float front = max(dot(N, normalize(vec3(0.0, 0.2, 1.0))), 0.0);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 c = col * (ambient + diff * vec3(1.0, 0.92, 0.82) * 0.85 + front * vec3(0.34, 0.32, 0.3));
  c += col * uFill * under * 0.25;
  c += rim * (uFill * 0.2 + col * 0.15);
  return c;
}
`;

/**
 * Fog for crowd cats: three's FogExp2, faded out within ~15 m so the near crowd keeps its cream
 * (round-2 review: near cats read brown through the dark green fog).
 */
const CROWD_FOG = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  fogFactor *= smoothstep(8.0, 20.0, vFogDepth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

export const NEAR_VERTEX = /* glsl */ `
${POSE_GLSL}
attribute float aPart;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vLocalN;
varying float vPart;
#include <fog_pars_vertex>

void main() {
  Pose P = catPose();
  vec3 q = position;
  vec3 n = normal;
  float side = q.x >= 0.0 ? 1.0 : -1.0;
  if (aPart > 2.5 && aPart < 4.5) {
    // Arm + paw: around the shoulder.
    vec3 S = vec3(side * ${f(S.shoulder.x)}, ${f(S.shoulder.y)}, ${f(S.shoulder.z)});
    float a = side > 0.0 ? P.armR : P.armL;
    mat3 R = rotX(P.armFwd) * rotZ(side * a);
    q = R * (q - S) + S;
    n = R * n;
  } else if (aPart > 0.5 && aPart < 2.5) {
    if (aPart > 1.5) {
      // Ear tilt from the seed, flick on the kick.
      vec3 E = vec3(side * ${f(S.ear.x)}, ${f(S.ear.y - 0.06)}, 0.0);
      mat3 Re = rotZ(side * ((aData.x - 0.5) * 0.5 - 0.18 * uKick * uEnergy));
      q = Re * (q - E) + E;
      n = Re * n;
    }
    vec3 H = vec3(0.0, ${f(S.neckY)}, 0.0);
    mat3 R = rotZ(P.tilt) * rotX(P.nod);
    q = R * (q - H) + H;
    n = R * n;
  } else if (aPart > 5.5) {
    vec3 T = vec3(0.0, 0.14, -0.12);
    mat3 R = rotY(P.tail) * rotZ(P.tail * 0.4);
    q = R * (q - T) + T;
    n = R * n;
  }
  vLocal = position;
  vLocalN = normal;
  vPart = aPart;
  vec4 world = modelMatrix * vec4(placeLocal(P, q), 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * placeNormal(P, n));
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const NEAR_FRAGMENT = /* glsl */ `
${COLOR_GLSL}
varying float vSeed;
varying float vFur;
varying float vHi;
varying float vGlow;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vLocalN;
varying float vPart;
#include <fog_pars_fragment>

void main() {
  // Cats within 1 m of the camera are culled (hard cut, no screen-door dither) so the crowd POV
  // never fills the frame with one faceted ear.
  float camD = length(cameraPosition - vWorld);
  if (camD < 1.0) discard;
  vec3 N = normalize(vNormalW + vec3(0.0, 1e-5, 0.0));
  vec3 V = normalize(cameraPosition - vWorld + vec3(0.0, 1e-5, 0.0));
  vec3 col = furColor(vFur);
  vec3 cream = mix(uCream, vec3(1.0, 0.93, 0.85), 0.35);
  // Soft fur grain.
  float grain = 0.96 + 0.04 * sin(vLocal.y * 70.0 + sin(vLocal.x * 31.0 + vSeed * 20.0) * 1.5);
  vec3 emiss = vec3(0.0);
  float pad = 0.0;

  if (vPart < 0.5) {
    // Body: pale belly, faint tabby stripes on the back of gingery cats.
    float belly = smoothstep(0.15, 0.75, vLocalN.z);
    col = mix(col, cream, belly * 0.65);
    float stripes = smoothstep(0.35, 0.95, sin(vLocal.y * 40.0 + vSeed * 6.0)) * smoothstep(0.1, -0.6, vLocalN.z);
    col *= 1.0 - 0.08 * stripes * vFur;
  } else if (vPart < 1.5) {
    vec2 fc = vLocal.xy - vec2(0.0, ${f(S.head.y)});
    if (vLocal.z > 0.05) {
      // Face: small blue-grey kitten eyes with a catch-light, pink nose, pale muzzle.
      float m = 1.0 - smoothstep(0.035, 0.1, length(vec2(fc.x * 0.8, fc.y + 0.065)));
      col = mix(col, cream, m * 0.7);
      vec2 e = vec2(abs(fc.x) - 0.1, fc.y - 0.012);
      if (length(e * vec2(1.0, 0.82)) < 0.032) {
        col = vec3(0.12, 0.16, 0.2);
        if (length(e - vec2(-0.01, 0.012)) < 0.011) col = vec3(1.6);
      }
      if (length(vec2(fc.x * 1.5, fc.y + 0.038)) < 0.022) col = uInnerEar;
    } else {
      float st = smoothstep(0.4, 0.95, sin(fc.y * 60.0 + 1.0)) * smoothstep(0.0, 0.07, vLocal.y - ${f(S.head.y)});
      col *= 1.0 - 0.18 * st * vFur;
    }
  } else if (vPart < 2.5) {
    col = mix(col, uInnerEar, smoothstep(0.1, 0.6, vLocalN.z));
  } else if (vPart < 3.5) {
    col = mix(col, cream, 0.12);
  } else if (vPart < 4.5) {
    // Mitten: a glowing paw print (a big main pad and four toe beans) on the top of the raised
    // paw, so it is hot pink seen from behind, above and the front alike (not a pink cap), fur
    // round the bottom with a soft pink spill.
    vec3 pn = normalize(vLocalN + vec3(0.0, 1e-5, 0.0));
    vec3 A = normalize(vec3(0.0, 1.0, 0.35));
    float up = dot(pn, A);
    vec2 pq = vec2(dot(pn, vec3(1.0, 0.0, 0.0)), dot(pn, normalize(cross(A, vec3(1.0, 0.0, 0.0)))));
    float dp = length((pq - vec2(0.0, -0.2)) / vec2(0.36, 0.3)) - 1.0;
    for (int k = 0; k < 4; k++) {
      float a = (float(k) - 1.5) * 0.62;
      vec2 c = vec2(sin(a) * 0.5, 0.2 + cos(a) * 0.22);
      dp = min(dp, length((pq - c) / vec2(0.15, 0.17)) - 1.0);
    }
    pad = (1.0 - smoothstep(-0.12, 0.08, dp)) * smoothstep(-0.25, 0.1, up);
    emiss = uPink * 0.45 * smoothstep(-0.45, 0.2, up);
    col = mix(col, cream, 0.25);
  } else if (vPart < 5.5) {
    col = mix(col, cream, 0.4);
  }

  vec3 c = litFur(col, N, V) * grain + emiss;
  // The pad glow does not depend on the view angle: hot pink from any side.
  if (pad > 0.0) c = mix(c, padGlow(vGlow, vHi), pad);
  // Highlight (find my cat / hover): pulsing green-white outline glow.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  c += vHi * (0.35 + 0.2 * sin(uTime * 7.0)) * fres * vec3(0.4, 1.0, 0.55);
  c += vHi * vGlow * vec3(0.5, 1.4, 0.7) * 0.35;

  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${CROWD_FOG}
}
`;

/** Far cats: one camera-facing quad each, the silhouette drawn as an SDF (pads glow too). */
export const IMPOSTOR_VERTEX = /* glsl */ `
${POSE_GLSL}
varying vec2 vCat;
varying vec2 vArm;
varying float vFacing;
#include <fog_pars_vertex>

void main() {
  Pose P = catPose();
  vec3 up = rotY(P.yaw) * (rotX(P.pitch) * (rotZ(P.roll) * vec3(0.0, 1.0, 0.0)));
  vec3 C = placeLocal(P, vec3(0.0, CENTER_Y, 0.0));
  vec3 Vd = normalize(cameraPosition - C);
  vec3 u = up - dot(up, Vd) * Vd;
  // Foreshortening: seen from above, a standing cat's height shrinks on screen and it widens into
  // a round blob (the top-down vortex reads as chubby heads and pink paws, not stick figures).
  float ul = clamp(length(u), 0.0, 1.0);
  float fore = clamp(ul, 0.55, 1.0);
  float wide = 1.0 + 0.6 * (1.0 - ul);
  if (length(u) < 0.08) {
    vec3 fw = rotY(P.yaw) * vec3(0.0, 0.0, 1.0);
    u = fw - dot(fw, Vd) * Vd;
  }
  u = normalize(u);
  vec3 rt = normalize(cross(u, Vd));
  vec2 q = position.xy;  // cat units: x -0.68..0.68, y -0.06..1.36 (raised paws fit)
  vec2 o = vec2(q.x * P.sxz * wide, (q.y - CENTER_Y) * P.sy * fore) * P.scale;
  vec4 world = modelMatrix * vec4(C + rt * o.x + u * o.y, 1.0);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  vCat = q;
  vec3 fw = rotY(P.yaw) * vec3(0.0, 0.0, 1.0);
  vFacing = dot(fw, Vd);
  // Seen from behind the cat's right arm is on screen right too (symmetric enough).
  vArm = vec2(P.armL, P.armR);
  #include <fog_vertex>
}
`;

export const IMPOSTOR_FRAGMENT = /* glsl */ `
${COLOR_GLSL}
varying float vSeed;
varying float vFur;
varying float vHi;
varying float vGlow;
varying vec2 vCat;
varying vec2 vArm;
varying float vFacing;
#include <fog_pars_fragment>

float sdEll(vec2 p, vec2 c, vec2 r) { return (length((p - c) / r) - 1.0) * min(r.x, r.y); }
float sdCap(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

void main() {
  vec2 p = vCat;
  vec2 sh = vec2(${f(S.shoulder.x)}, ${f(S.shoulder.y)});
  vec2 arm = vec2(${f(S.paw.x - S.shoulder.x)}, ${f(S.paw.y - S.shoulder.y)});
  // Seen from behind, screen right is the cat's right: rotZ(+a) swings it in towards the head.
  vec2 pawR = sh + rot2(arm, vArm.y);
  vec2 pawL = vec2(-sh.x, sh.y) + rot2(arm * vec2(-1.0, 1.0), -vArm.x);
  float d = sdEll(p, vec2(0.0, ${f(S.body.y)}), vec2(${f(S.body.r[0])}, ${f(S.body.r[1])}));
  d = min(d, sdEll(p, vec2(0.0, ${f(S.head.y)}), vec2(${f(S.head.r[0])}, ${f(S.head.r[1])})));
  d = min(d, sdCap(p, vec2(${f(S.ear.x - 0.025)}, ${f(S.ear.y - 0.06)}), vec2(${f(S.ear.x + 0.03)}, ${f(S.ear.y + 0.07)}), 0.045));
  d = min(d, sdCap(p, vec2(${f(-(S.ear.x - 0.025))}, ${f(S.ear.y - 0.06)}), vec2(${f(-(S.ear.x + 0.03))}, ${f(S.ear.y + 0.07)}), 0.045));
  d = min(d, sdEll(p, vec2(0.085, 0.045), vec2(0.08, 0.05)));
  d = min(d, sdEll(p, vec2(-0.085, 0.045), vec2(0.08, 0.05)));
  // Chubby forearms (the quad SDF reads thinner than the mesh at distance, so it is drawn fatter).
  d = min(d, sdCap(p, sh, pawR, ${f(+(S.armR * 1.15).toFixed(3))}));
  d = min(d, sdCap(p, vec2(-sh.x, sh.y), pawL, ${f(+(S.armR * 1.15).toFixed(3))}));
  float dp = min(length(p - pawR), length(p - pawL)) - ${f(S.paw.r)};
  if (min(d, dp - 0.05) > 0.0) discard;

  vec3 col = furColor(vFur);
  vec3 cream = mix(uCream, vec3(1.0, 0.93, 0.85), 0.35);
  // Fake roundness with night contrast: dark core edges, green floor fill low, green rim, and a
  // brighter top so far cats still read as cats (not moire) in a 10k crowd.
  float edge = smoothstep(-0.06, 0.0, d);
  float shade = 0.35 + 0.55 * smoothstep(0.0, 1.0, p.y);
  vec3 c = col * (vec3(0.05, 0.07, 0.06) + shade * vec3(0.62, 0.56, 0.5));
  c += col * uFill * (1.0 - smoothstep(0.0, 0.45, p.y)) * 0.18;
  c *= 1.0 - 0.35 * edge;
  c += edge * uFill * 0.14;
  if (vFacing > 0.15) {
    float belly = 1.0 - smoothstep(0.05, 0.14, length((p - vec2(0.0, ${f(S.body.y + 0.05)})) / vec2(1.0, 2.0)));
    c = mix(c, cream * 0.6, belly * 0.5);
  }
  if (dp < 0.0) c = padGlow(vGlow, vHi);
  else c += uPink * 1.8 * exp(-max(dp, 0.0) * 30.0);
  c += vHi * (0.6 + 0.4 * sin(uTime * 7.0)) * edge * vec3(0.45, 1.3, 0.6);
  c += vHi * vGlow * vec3(0.5, 1.4, 0.7) * 0.35;

  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${CROWD_FOG}
}
`;

/** The next, half-formed cat: a hologram filling bottom-up to the progress of the next dollar. */
export const HOLO_VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vV;
#include <fog_pars_vertex>
void main() {
  vLocal = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

/** HOLO_VERTEX for the instanced arriving holograms: per-instance placement plus a gentle bob. */
export const ARRIVING_VERTEX = /* glsl */ `
uniform float uTime;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vV;
#include <fog_pars_vertex>
void main() {
  vLocal = position;
  vec4 p = instanceMatrix * vec4(position, 1.0);
  p.y += 0.05 + 0.04 * sin(uTime * 2.4 + instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3);
  vec4 mvPosition = modelViewMatrix * p;
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const HOLO_FRAGMENT = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform float uKick;
uniform vec3 uCream;
uniform vec3 uPink;
uniform vec3 uGreen;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vV;
#include <fog_pars_fragment>
void main() {
  float fillY = uProgress * 1.17;
  float y = vLocal.y;
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float scan = 0.5 + 0.5 * sin(y * 150.0 - uTime * 7.0);
  vec3 col;
  float a;
  if (y < fillY) {
    col = uCream * 0.6 + uGreen * (0.25 * scan + 0.9 * fres);
    a = 0.82;
  } else {
    col = uGreen * (0.5 * scan + 1.6 * fres) * (0.8 + 0.4 * uKick);
    a = 0.12 + 0.18 * scan + 0.5 * fres;
  }
  float band = 1.0 - smoothstep(0.0, 0.03, abs(y - fillY));
  col += uPink * 3.5 * band;
  a = max(a, band);
  a *= 0.82 + 0.18 * sin(uTime * 37.0 + y * 9.0);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Ghost paw prints on the next empty slots, plus the drop-in shockwave rings. */
export const DECAL_VERTEX = /* glsl */ `
attribute vec4 aDecal; // x: fade, y: kind (0 paw, 1 ring), z: start time (ring), w: seed
varying vec2 vUv;
varying vec4 vDecal;
#include <fog_pars_vertex>
void main() {
  vUv = uv - 0.5;
  vDecal = aDecal;
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const DECAL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uKick;
uniform vec3 uPink;
uniform vec3 uGreen;
varying vec2 vUv;
varying vec4 vDecal;
#include <fog_pars_fragment>
float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r) - 1.0; }
void main() {
  vec2 p = vUv;
  vec3 col;
  float a;
  if (vDecal.y < 0.5) {
    // Paw print: main pad + four toe beans, glowing softly, pulsing on the kick.
    float d = ell(p, vec2(0.0, -0.1), vec2(0.17, 0.14));
    d = min(d, ell(p, vec2(-0.2, 0.1), vec2(0.065, 0.08)));
    d = min(d, ell(p, vec2(-0.075, 0.2), vec2(0.065, 0.08)));
    d = min(d, ell(p, vec2(0.075, 0.2), vec2(0.065, 0.08)));
    d = min(d, ell(p, vec2(0.2, 0.1), vec2(0.065, 0.08)));
    float core = 1.0 - smoothstep(-0.05, 0.05, d);
    float halo = exp(-max(d, 0.0) * 4.0) * 0.35;
    float breathe = 0.65 + 0.35 * sin(uTime * 2.0 + vDecal.w * 6.2831) + 0.5 * uKick;
    col = mix(uGreen, uPink, core) * (core * 1.6 + halo) * breathe;
    a = 1.0;
  } else {
    // Landing shockwave.
    float t = clamp((uTime - vDecal.z) / 0.9, 0.0, 1.0);
    float r = length(p) * 2.0;
    float ring = 1.0 - smoothstep(0.0, 0.08, abs(r - t * 0.95));
    col = (uPink * 2.5 + uGreen) * ring * (1.0 - t) * step(0.0, uTime - vDecal.z);
    a = 1.0;
  }
  col *= vDecal.x;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}
`;

/** Find-my-cat beacon: a vertical beam of light fading upward. */
export const BEAM_VERTEX = /* glsl */ `
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  vH = uv.y;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const BEAM_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  float side = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
  float fade = pow(1.0 - vH, 1.6);
  float flow = 0.75 + 0.25 * sin(vH * 30.0 - uTime * 8.0);
  gl_FragColor = vec4(uColor * side * fade * flow * uOpacity, 1.0);
}
`;
