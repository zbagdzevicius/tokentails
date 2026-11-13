/**
 * Living pass P1: water life (render only).
 *
 * - The river: soft flow streaks scrolling downstream, broken foam lapping along both banks, and foam piling against
 *   the edges of the bridge decks and log jams ("weirs"), on top of the existing waves and sparkle. Low contrast (pale
 *   on pale blue) so skillshots over water stay the most readable thing there. Off on Low: `uLive` 0 skips it all in a
 *   uniform branch, same program.
 * - The Hearthwood pond (the toad camp's pool): rings spreading from two slow sources and a shimmer, in the fragment
 *   of the living mesh (env/banner.ts kind 3); the lily pads bob and turn a little (kind 2).
 */
import * as THREE from 'three';
import type { Ambient } from '../../ambient';

export const WATER = Object.freeze({
  /** Flow speed of the streaks and foam (m/s at ambient speed 1). */
  flow: 0.55,
  /** Max lighten of a flow streak. */
  streak: 0.09,
  /** Max mix toward foam white (bank and weir foam). */
  foam: 0.5,
  /** Weir foam reach (m) past a deck or log-jam edge. */
  weirReach: 1.3,
  /** Slots for weirs (bridge decks and log jams) per river. */
  weirs: 6,
});

export interface RiverLifeUniforms {
  uLive: { value: number };
  uFlowT: { value: number };
  /** Each weir: x = position along the flow (m), y = half length along the flow (m; < 0 = unused slot). */
  uWeir: { value: THREE.Vector2[] };
}

export function riverLifeUniforms(weirs: readonly { at: number; half: number }[]): RiverLifeUniforms {
  const value = Array.from({ length: WATER.weirs }, (_, i) => new THREE.Vector2(weirs[i]?.at ?? 0, weirs[i] ? weirs[i].half : -1));
  return { uLive: { value: 0 }, uFlowT: { value: 0 }, uWeir: { value } };
}

/** The water-life strength for an ambient level (0 on Low, `motion` on Med/High). */
export function waterLive(a: Pick<Ambient, 'level' | 'motion'>): number {
  // reduce motion keeps the foam (it is a look, not motion) but slows it (speed); the streaks follow `motion`
  return a.level === 0 ? 0 : Math.max(0.5, a.motion);
}

/** Per-frame step (CPU: two uniform writes). */
export function stepWater(u: RiverLifeUniforms, a: Pick<Ambient, 'level' | 'motion' | 'speed'>, dt: number): void {
  u.uLive.value = waterLive(a);
  if (u.uLive.value > 0) u.uFlowT.value = (u.uFlowT.value + dt * a.speed) % 3600;
}

/**
 * The river fragment chunk. Declares the uniforms and `vec3 plRiverLife(vec3 col, float along, float across,
 * float edgeM)`: `along` (m, downstream positive), `across` (m), `edgeM` (m to the nearer bank).
 */
export const RIVER_LIFE_GLSL = /* glsl */ `
uniform float uLive, uFlowT;
uniform vec2 uWeir[${WATER.weirs}];
float plWH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float plWN(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(plWH(i), plWH(i + vec2(1.0, 0.0)), f.x), mix(plWH(i + vec2(0.0, 1.0)), plWH(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 plRiverLife(vec3 col, float along, float across, float edgeM){
  if (uLive <= 0.0) return col;
  float fl = uFlowT * ${WATER.flow.toFixed(2)};
  // flow streaks: long thin pale strands drifting downstream, a slower wide swell under them
  float s1 = smoothstep(0.68, 0.92, plWN(vec2(across * 1.6, (along - fl * 2.2) * 0.22)));
  float s2 = smoothstep(0.6, 0.9, plWN(vec2(across * 0.7 + 9.0, (along - fl * 1.4) * 0.12)));
  col += (s1 * 0.75 + s2 * 0.35) * ${WATER.streak.toFixed(3)} * uLive;
  // bank foam: lumps that come and go along the shore, reaching up to ~1 m out
  float reach = 0.35 + 0.65 * plWN(vec2((along - fl * 1.6) * 0.7, 3.0));
  float lump = smoothstep(0.42, 0.7, plWN(vec2((along - fl * 1.8) * 1.3, edgeM * 2.4 + fl * 0.6)));
  float bank = (1.0 - smoothstep(reach * 0.45, reach, edgeM)) * lump;
  // weirs: foam piles up against each deck / log-jam edge and trails off downstream and upstream
  float weir = 0.0;
  for (int i = 0; i < ${WATER.weirs}; i++) {
    if (uWeir[i].y < 0.0) continue;
    float d = abs(along - uWeir[i].x) - uWeir[i].y;
    if (d < 0.0 || d > ${WATER.weirReach.toFixed(2)}) continue;
    float n = plWN(vec2(across * 1.9, d * 3.2 - fl * 2.6));
    weir = max(weir, (1.0 - smoothstep(0.0, ${WATER.weirReach.toFixed(2)}, d)) * smoothstep(0.32, 0.62, n));
  }
  float foam = max(bank, weir) * ${WATER.foam.toFixed(2)} * uLive;
  return mix(col, vec3(0.97, 0.99, 1.0), foam);
}
`;

/** The pond fragment chunk for the living mesh: rings from two slow sources and a shimmer (kind 3). */
export const POND_GLSL = /* glsl */ `
vec3 plPond(vec3 col, vec2 p, vec2 c, float r0, float t, float amp){
  vec2 q = p - c;
  float r = length(q) / r0;
  vec2 s2 = c + vec2(cos(t * 0.21), sin(t * 0.17)) * r0 * 0.45;
  float ring1 = sin(length(q) * 11.0 - t * 2.4);
  float ring2 = sin(length(p - s2) * 13.0 - t * 3.1);
  float rings = smoothstep(0.55, 0.95, ring1) * (1.0 - smoothstep(0.2, 1.0, r)) + smoothstep(0.7, 0.98, ring2) * 0.6 * (1.0 - smoothstep(0.0, 0.7, length(p - s2) / r0));
  float shimmer = sin(p.x * 5.1 + t * 1.3) * sin(p.y * 4.3 - t * 1.1);
  return col + (rings * 0.14 + shimmer * 0.03) * amp;
}
`;
