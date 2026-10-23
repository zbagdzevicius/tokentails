// Per-frame city behaviour for the campaign lane (registered once from registerCampaign()):
//  - breakable props: swats, pounce landings, body contact and any nearby damage break them; anchored props break
//    the moment the floor under them goes, so nothing floats; radar dishes and lighthouse beams spin.
//  - water: wading into the harbour or a back-yard pool soaks the cat (cats hate it) and slows it down.
//  - trampling: in the non-downtown cities the cat flattens anything two floors or lower by walking into it
//    (core collisions ignore buildings that low, so without this the cat would clip through houses and bunkers).
//  - neon flicker in Nekotown.
// No per-frame allocations: module-level temps only.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { addFrameHook, burst, C, chunks, city, distB, events, fire, FLOOR, G, game, markTouched, P, pop, score, shake, soak, slow, St, tug, valMul, water } from '../core/api';
import type { PropGroup } from '../world/props';
import { waterClock } from '../world/props';

const v1 = new THREE.Vector3();
const qy = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();
const flickCol = new THREE.Color();
const DARK = new THREE.Color(0x1a1420);

let installed = false;
let breaking = false; // guards the damage listener against props scoring themselves
let wading = false;
let wadePopT = 0;
let flickT = 0;
let flickI = -1;

/** Break a prop: every part flies with (vx, vy, vz) plus a spread away from (ox, oz); scores, juice. */
function breakProp(g: PropGroup, vx: number, vy: number, vz: number, ox: number, oz: number, spread: number): void {
  if (g.broken) return;
  g.broken = true;
  const props = city.props;
  for (let p = g.p0; p < g.p0 + g.pn; p++) {
    const set = props.sets[props.partSet[p]];
    const i = props.partIdx[p];
    if (set.state[i] !== St.Static) continue;
    const px = set.pos[i * 3];
    const pz = set.pos[i * 3 + 2];
    const dx = px - ox;
    const dz = pz - oz;
    const d = Math.hypot(dx, dz) || 1;
    set.launch(i, vx + (dx / d) * spread * (0.6 + Math.random() * 0.8), vy + Math.random() * 14, vz + (dz / d) * spread * (0.6 + Math.random() * 0.8), 7);
  }
  const y = Math.min(60, g.top * 0.7 + 4);
  if (g.kind === 'splash') {
    for (let i = 0; i < 46; i++) water.spawn(g.x, y, g.z, (Math.random() - 0.5) * 70, 10 + Math.random() * 40, (Math.random() - 0.5) * 70, 1.4, 2.2, 0x6fd0ff, -60, 0.4);
    if (Math.hypot(g.x - C.pos.x, g.z - C.pos.z) < 45 && game.mode === 'play') {
      soak(10, 'splash');
      pop('SPLASH! HISSS', v1.set(C.pos.x, 60, C.pos.z), '#6fd0ff', 34);
      A.hiss();
    }
  } else if (g.kind === 'fire') {
    for (let i = 0; i < 26; i++) fire.spawn(g.x, 4 + Math.random() * 6, g.z, (Math.random() - 0.5) * 40, 14 + Math.random() * 26, (Math.random() - 0.5) * 40, 0.9, 2.6, Math.random() < 0.5 ? 0xffb040 : 0xff5a2a, 10, 0.6);
    A.boom();
    shake(0.25);
  } else if (g.kind === 'spark') {
    for (let i = 0; i < 12; i++) chunks.spawn(g.x, y, g.z, (Math.random() - 0.5) * 50, 10 + Math.random() * 25, (Math.random() - 0.5) * 50, 1.1, 0.9, Math.random() < 0.5 ? 0xffffff : 0x9ff4ff, -50, 0);
  }
  if (!g.trample) A.crash(Math.min(2, 0.5 + g.value * 0.3));
  if (g.value > 0 && game.mode === 'play') {
    breaking = true;
    score(g.value * (1 + G.elapsed / 45), v1.set(g.x, y, g.z), g.label);
    breaking = false;
  }
}

/** Break ground props within r of (x, z) whose top is above `y0` (anchored props only go with their floor). */
function hitProps(x: number, z: number, r: number, y0: number, power: number, fx: number, fz: number): void {
  const groups = city.props.groups;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.broken || g.anchor >= 0 || g.top < y0) continue;
    const d = Math.hypot(g.x - x, g.z - z);
    if (d > g.r + r) continue;
    breakProp(g, fx * power, 18 * power, fz * power, x, z, 30 * power);
  }
}

function spinProps(t: number): void {
  const props = city.props;
  const sp = props.spinners;
  for (let s = 0; s < sp.length; s++) {
    const g = sp[s];
    if (g.broken) continue;
    const ang = t * g.spin;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    qy.setFromAxisAngle(AXIS_Y, ang);
    for (let p = g.p0; p < g.p0 + g.pn; p++) {
      const set = props.sets[props.partSet[p]];
      const i = props.partIdx[p];
      if (set.state[i] !== St.Static) continue;
      const lx = props.partLx[p];
      const lz = props.partLz[p];
      set.pos[i * 3] = g.x + lx * c + lz * sn;
      set.pos[i * 3 + 2] = g.z - lx * sn + lz * c;
      qb.fromArray(props.partQ, p * 4).premultiply(qy);
      qb.toArray(set.rot, i * 4);
      set.write(i);
    }
  }
}

function updateProps(dt: number, t: number): void {
  const props = city.props;
  spinProps(t);
  const groups = props.groups;
  const segs = city.segs;
  const play = game.mode === 'play';
  const moving = C.speed > 3 || C.air;
  const zoom = C.speed > P.walk + 5;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.broken) continue;
    if (g.anchor >= 0) {
      if (segs.state[g.anchor] !== St.Static) {
        const a = g.anchor * 3;
        breakProp(g, segs.vel[a] * 0.9, segs.vel[a + 1] * 0.9 + 6, segs.vel[a + 2] * 0.9, g.x, g.z, 8);
      }
      continue;
    }
    if (!play || !moving || C.y > g.top) continue;
    const d = Math.hypot(g.x - C.pos.x, g.z - C.pos.z);
    if (d < g.r + P.radius * 0.8) breakProp(g, C.fwd.x * (zoom ? 70 : 45), 22, C.fwd.z * (zoom ? 70 : 45), C.pos.x, C.pos.z, 18);
  }
  for (let s = 0; s < props.sets.length; s++) props.sets[s].step(dt);
}

function inRects(list: { x0: number; z0: number; x1: number; z1: number }[], x: number, z: number, m: number): boolean {
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true;
  }
  return false;
}

function rectAt(list: { x0: number; z0: number; x1: number; z1: number }[], x: number, z: number): { x0: number; z0: number; x1: number; z1: number } | null {
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (x > r.x0 - 2 && x < r.x1 + 2 && z > r.z0 - 2 && z < r.z1 + 2) return r;
  }
  return null;
}

function updateWater(dt: number): void {
  const ter = city.terrain;
  if (game.mode !== 'play' || !ter.water.length || C.air) {
    wading = false;
    return;
  }
  const x = C.pos.x;
  const z = C.pos.z;
  const wet = inRects(ter.water, x, z, 2) && !inRects(ter.dry, x, z, -P.radius * 0.5);
  if (!wet) {
    wading = false;
    return;
  }
  soak(7 * dt, 'water');
  slow(0.7);
  // the cat scrambles back toward the nearest dry edge of the water it is in
  const r = rectAt(ter.water, x, z);
  if (r) {
    const dl = x - r.x0;
    const dr = r.x1 - x;
    const dn = z - r.z0;
    const df = r.z1 - z;
    const m = Math.min(dl, dr, dn, df);
    if (m === dl) tug(-14, 0);
    else if (m === dr) tug(14, 0);
    else if (m === dn) tug(0, -14);
    else tug(0, 14);
  }
  if (!wading) {
    A.hiss();
    for (let i = 0; i < 18; i++) water.spawn(x + (Math.random() - 0.5) * 20, 2, z + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30, 20 + Math.random() * 25, (Math.random() - 0.5) * 30, 1, 1.8, 0x7fd8ff, -60, 0);
  }
  wading = true;
  wadePopT -= dt;
  if (wadePopT <= 0) {
    wadePopT = 2.4;
    pop(ter.waterName, v1.set(x, 62, z), '#7fd8ff', 34);
  }
  if (C.speed > 4 && Math.random() < 0.5) water.spawn(x + (Math.random() - 0.5) * 22, 1.5, z + (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 16, 12 + Math.random() * 12, (Math.random() - 0.5) * 16, 0.7, 1.4, 0x9fe4ff, -60, 0);
}

/** Walk over anything two floors or lower and it crunches. */
function updateTrample(): void {
  if (game.mode !== 'play' || C.air || city.layout === 'downtown') return;
  const R = P.radius * 0.9;
  const bs = city.buildings;
  const segs = city.segs;
  for (let bi = 0; bi < bs.length; bi++) {
    const b = bs[bi];
    if (distB(b, C.pos.x, C.pos.z) > R) continue;
    if (segs.state[b.first] !== St.Static) continue;
    const h = city.standing(b);
    // core blocks (and bonks) anything taller than two floors; below that the cat just stomps through
    if (h === 0 || h > FLOOR * 2) continue;
    const n = city.knock(b.first, C.fwd.x * 40 + (Math.random() - 0.5) * 20, 16, C.fwd.z * 40 + (Math.random() - 0.5) * 20);
    if (!n) continue;
    markTouched(bi);
    burst(b.x, 3, b.z, 3, 0xd6d0c6);
    A.crash(0.5);
    score(n * b.value * valMul(bi), v1.set(b.x, 12, b.z), 'STOMP ');
  }
}

function updateFlicker(dt: number): void {
  if (city.layout !== 'neon') return;
  flickT -= dt;
  if (flickT > 0) return;
  flickT = 0.06 + Math.random() * 0.1;
  const glow = city.props.sets[1];
  if (flickI >= 0 && flickI < glow.n) glow.mesh.setColorAt(flickI, flickCol);
  flickI = -1;
  if (glow.n && Math.random() < 0.7) {
    const i = Math.floor(Math.random() * glow.n);
    if (glow.state[i] === St.Static) {
      glow.mesh.getColorAt(i, flickCol);
      glow.mesh.setColorAt(i, col.copy(flickCol).lerp(DARK, 0.75));
      flickI = i;
    }
  }
  if (glow.mesh.instanceColor) glow.mesh.instanceColor.needsUpdate = true;
}

export function installCampaignRuntime(): void {
  if (installed) return;
  installed = true;
  events.on('levelLoad', () => {
    wading = false;
    flickI = -1;
  });
  events.on('swat', (e) => {
    hitProps(e.x, e.z, P.swatRadius, C.y, 1, C.fwd.x * 60, C.fwd.z * 60);
  });
  events.on('pounceLand', (e) => {
    hitProps(e.x, e.z, P.pounceR, 0, 1.3, 0, 0);
  });
  events.on('damage', (e) => {
    if (breaking) return;
    hitProps(e.x, e.z, 14, e.y - 25, 0.9, 0, 0);
  });
  addFrameHook((dt, t) => {
    waterClock.value = t;
    if (dt === 0) return; // paused
    updateWater(dt);
    updateTrample();
    updateProps(dt, t);
    updateFlicker(dt);
  });
}
