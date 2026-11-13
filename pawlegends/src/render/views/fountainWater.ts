/**
 * Living pass (P2): the fountain's water. The basin and spout discs are their own parts of the fountain model
 * (models.ts LIFE_PART.water / .spout), and this fragment chunk, compiled into the structure life patch
 * (towerView.ts `structureLifeMaterial`), draws on them: rings spreading from where the spout falls, a slow caustic
 * shimmer, a wobbling cream foam band along the stone rim, a churn ring round the spout column and quick rings in the
 * spout's upper bowl. Everything is toon-stepped (hard bands, no gradients) and pale (water white), so a hero standing
 * in the basin and the heal ring under it stay the most readable thing there.
 *
 * Same program on every tier: Low sets the amplitude to 0 and the chunk returns the plain water colour (one uniform
 * branch). No extra draw: it is part of the fountain's own mesh. Spout droplets are emitted by towerView through the
 * shared alpha pool (`room()`, at most SPOUT.rate per second per fountain). Render only.
 */

/** Basin geometry (object space, m; models.ts fountainGeometry) and the look's knobs. */
export const WATER = Object.freeze({
  /** Where the spout column stands (object x, z). */
  spoutX: -1.2,
  spoutZ: 0,
  /** Inner edge of the rim foam (the basin water is 3.85 m). */
  foamR: 3.6,
  /** Ring spacing (per m) and speed (rings per s) out from the spout. */
  ringK: 0.9,
  ringSpeed: 0.55,
  /** How far the rings reach before they fade (m from the spout). */
  ringFade: 3.2,
  /** Peak lift toward foam white: rings, shimmer, rim foam (× uFoam), spout churn. */
  ring: 0.45,
  shimmer: 0.16,
  churn: 0.75,
  /** The foam colour (linear). */
  foam: [0.96, 0.99, 1.0] as const,
});

/** Spout droplets: per second per fountain (Med/High; scaled by the ambient density), life (s), launch (m/s). */
export const SPOUT = Object.freeze({ rate: 6, life: 0.55, up: 2.4, out: 0.9, size: 0.11, color: 0xd8f2ff });

/** The spout droplets a fountain gets this frame (≤ SPOUT.rate per s): accumulates fractional drops in `acc[0]`. */
export function spoutDrops(acc: Float32Array, dt: number, density: number): number {
  if (density <= 0) {
    acc[0] = 0;
    return 0;
  }
  acc[0] += dt * SPOUT.rate * Math.min(1, density);
  const n = Math.floor(acc[0]);
  acc[0] -= n;
  return Math.min(n, 2);
}

/**
 * The GLSL (fragment): `plWater(col, objPos, spout)` returns the lit water colour with its ripples. `uLifeW` is
 * (amplitude 0..1, time s, rim foam 0..1, unused).
 */
export const WATER_GLSL = /* glsl */ `
vec3 plWater(vec3 col, vec3 o, float spout){
  float amp = uLifeW.x;
  if (amp < 0.001) return col;
  float t = uLifeW.y;
  vec2 p = o.xz;
  float d = length(p - vec2(${WATER.spoutX.toFixed(2)}, ${WATER.spoutZ.toFixed(2)}));
  float lift = 0.0;
  if (spout < 0.5) {
    float ring = fract(d * ${WATER.ringK.toFixed(2)} - t * ${WATER.ringSpeed.toFixed(2)});
    float band = step(0.03, ring) * (1.0 - step(0.17, ring));
    lift += band * ${WATER.ring.toFixed(2)} * (1.0 - smoothstep(0.8, ${WATER.ringFade.toFixed(2)}, d));
    float c = sin(p.x * 2.3 + t * 0.9 + sin(p.y * 1.7 - t * 0.6)) * sin(p.y * 2.1 - t * 0.7 + sin(p.x * 1.3 + t * 0.5));
    lift += step(0.62, c) * ${WATER.shimmer.toFixed(2)};
    float r = length(p);
    float ang = atan(p.y, p.x);
    float edge = ${WATER.foamR.toFixed(2)} + 0.07 * sin(ang * 11.0 + t * 1.4) + 0.05 * sin(ang * 23.0 - t * 2.1);
    lift = max(lift, step(edge, r) * uLifeW.z);
    float churn = step(d, 0.48 + 0.06 * sin(t * 6.0 + atan(p.y, p.x - ${WATER.spoutX.toFixed(2)}) * 5.0));
    lift = max(lift, churn * ${WATER.churn.toFixed(2)});
  } else {
    lift += step(0.72, fract(d * 3.2 - t * 1.6)) * 0.55;
  }
  return mix(col, vec3(${WATER.foam.map((v) => v.toFixed(2)).join(', ')}), clamp(lift * amp, 0.0, 1.0));
}
`;
