#!/usr/bin/env node
/**
 * Lobby-map stills: shot list → stills.mjs specs. Each shot names where the champion stands (sim mm, like the map data),
 * where the camera stands relative to it (azimuth, ground distance, height) and where on screen its feet should land;
 * this solves the camera's view direction so the feet project there (Newton on yaw/pitch, three.js lookAt maths), and
 * turns the champion `rel` degrees from the camera (0 = facing the lens, +90 = screen right).
 *
 *   node tools/clips/stills-frame.mjs <shots.json> <stills.json>
 *
 * Shot: { id, map, scheme, seed?, at?, hero, lookId?, act?, actAt?, minions?,
 *         feet: [simX, simY], az (deg, camera direction from the champion: 0 = south, -90 = west), gd (m), h (m),
 *         fov (deg), rel (deg, default 55), screen: [sx, sy] (feet on screen, 0..1, default [0.46, 0.8]), size? }
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('usage: node tools/clips/stills-frame.mjs <shots.json> <stills.json>');
  process.exit(2);
}
const R = Math.PI / 180;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};
/** The orbit offset of harness/director.ts: camera = look + d x this. */
const orbitDir = (p, y) => [Math.sin(y * R) * Math.cos(p * R), Math.sin(p * R), Math.cos(y * R) * Math.cos(p * R)];

/** Screen position (0..1, y down) of world point P for a camera at C oriented by (pitch, yaw). */
function project(P, C, p, y, fov, aspect) {
  const z = orbitDir(p, y);
  const right = norm(cross([0, 1, 0], z));
  const up = cross(z, right);
  const v = sub(P, C);
  const depth = -dot(v, z);
  const t = Math.tan((fov * R) / 2);
  return [(dot(v, right) / (depth * t * aspect) + 1) / 2, (1 - dot(v, up) / (depth * t)) / 2];
}

const shots = JSON.parse(readFileSync(inFile, 'utf8'));
const out = shots.map((s) => {
  const [w, h] = s.size ?? [1920, 1080];
  const aspect = w / h;
  const F = [s.feet[0] / 1000, 0, -s.feet[1] / 1000];
  const C = [F[0] + Math.sin(s.az * R) * s.gd, s.h, F[2] + Math.cos(s.az * R) * s.gd];
  const want = s.screen ?? [0.46, 0.8];
  // start: looking straight at the feet
  let y = s.az;
  let p = (Math.atan2(s.h, s.gd) * 180) / Math.PI;
  for (let i = 0; i < 40; i++) {
    const e = sub(project(F, C, p, y, s.fov, aspect), want);
    if (Math.hypot(e[0], e[1]) < 1e-6) break;
    const d = 1e-3;
    const jy = sub(project(F, C, p, y + d, s.fov, aspect), project(F, C, p, y, s.fov, aspect)).map((v) => v / d);
    const jp = sub(project(F, C, p + d, y, s.fov, aspect), project(F, C, p, y, s.fov, aspect)).map((v) => v / d);
    const det = jy[0] * jp[1] - jp[0] * jy[1];
    y -= (e[0] * jp[1] - jp[0] * e[1]) / det;
    p -= (jy[0] * e[1] - e[0] * jy[1]) / det;
  }
  const dist = Math.hypot(...sub(F, C));
  const o = orbitDir(p, y);
  const look = C.map((v, i) => +(v - o[i] * dist).toFixed(3));
  return {
    id: s.id,
    map: s.map,
    scheme: s.scheme,
    seed: s.seed ?? 3,
    at: s.at ?? 60,
    hero: s.hero,
    lookId: s.lookId ?? null,
    pos: [+F[0].toFixed(3), +F[2].toFixed(3)],
    face: +(s.az + (s.rel ?? 55)).toFixed(1),
    look,
    cam: { dist: +dist.toFixed(3), pitch: +p.toFixed(3), yaw: +y.toFixed(3), fov: s.fov },
    ...(s.minions ? { minions: true } : {}),
    ...(s.act ? { act: s.act, actAt: s.actAt ?? 20 } : {}),
    ...(s.size ? { size: s.size } : {}),
    ...(s.empty ? { empty: true } : {}),
  };
});
writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} stills -> ${outFile}`);
