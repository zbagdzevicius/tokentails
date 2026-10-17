/**
 * World preview (dev only, not shipped): http://localhost:5174/src/render/world/preview.html
 * A scripted v5 timeline on a synthetic room, drawn with the real RoomView, PropsView, Shards and WorldDynamics
 * (no actors), to check every world animation at phone size.
 *   ?shell=living|bath-bed|boss|kitchen   ?theme=<RoomTheme>   ?t=<tick> freeze at a tick   ?speed=<x>
 * Timeline: Roomba drives from tick 0; puddle 30; book stack falls 60; plate stack breaks 90; ad break 100-200;
 * cable yank 120; tree topples 150; balloon pops 170; cloth pulled 200 and dropped 240; the cat sits in the box
 * 260-330; framed 300; flour bag spills 320.
 */
import { AmbientLight, Color, DirectionalLight, HemisphereLight, MeshLambertMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { PropSt, propKind, type PropPlacement, type RoomTheme, type SimEvent, type SimState } from '../../types';
import { PAL } from '../palette';
import { PropsView, puddleColor, shardColors } from '../props-view';
import { buildRoom } from '../room-view';
import { Shards } from '../shards';
import { createWorldDynamics } from '../world-dynamics';
import { countDrawCalls, countTriangles } from './budget';
import { fixturePlayFor, fixtureShell, fixtureStateFor, type FixtureShell } from './fixtures';

const q = new URLSearchParams(location.search);
const shellName = (q.get('shell') ?? 'living') as FixtureShell;
const theme = (q.get('theme') ?? 'xmas') as RoomTheme;
const freeze = q.get('t') !== null ? Number(q.get('t')) : null;
const speed = Number(q.get('speed') ?? 1);
const shell = fixtureShell(shellName);
const W = shell.width;
const D = shell.depth;

// a hand-placed set that shows every animation; levels come from the shell
const lv = (x: number, z: number) => shell.levels[z * W + x] as 0 | 1 | 2 | 3;
const raised: { x: number; z: number }[] = [];
for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (lv(x, z) >= 1 && lv(x, z) <= 2) raised.push({ x, z });
const floorFree = (x: number, z: number) => lv(x, z) === 0 && !(shell.roombaLoop ?? []).some((c) => c.x === x && c.z === z);
const props: PropPlacement[] = [];
const put = (kind: number, at: { x: number; z: number } | undefined, extra: Partial<PropPlacement> = {}) => {
  if (!at) return -1;
  props.push({ kind, x: at.x, z: at.z, level: lv(at.x, at.z), rot: 0, ...extra });
  return props.length - 1;
};
const loop = shell.roombaLoop ?? [];
const iRoomba = loop.length ? put(20, loop[0]) : -1;
const iBooks = put(15, raised[2], { target: true });
const iPlates = put(3, raised[5]);
const lampAt = raised.find((c) => c.z + 1 < D && floorFree(c.x, c.z + 1));
const iLamp = put(9, lampAt, lampAt ? { cable: { x: lampAt.x, z: lampAt.z + 1 } } : {});
const iTree = put(17, { x: 1, z: D - 1 });
const iBalloon = put(28, raised[8]);
const table = shell.furniture.find((f) => f.type === 'table' || f.type === 'party-table' || f.type === 'coffee-table') ?? shell.furniture[0];
const iCloth = put(14, { x: table.x, z: table.z }, { w: Math.min(2, table.w), d: Math.min(2, table.d) });
const iCake = put(6, { x: table.x + Math.min(1, table.w - 1), z: table.z });
const iBox = put(54, { x: W - 3, z: D - 2 });
const iFlour = put(37, raised[11]);
put(63, raised[14], {});
put(22, raised[17]);
put(55, raised[20]);
put(24, { x: 4, z: D - 1 });
const play = fixturePlayFor(shell, theme, props, { event: 3, sponsor: { propIndex: props.length - 3, label: 'Purrfect Snacks' } });

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new Scene();
scene.background = new Color(PAL.bg);
scene.add(new HemisphereLight(0xfff4e4, 0x6e4a3a, 1.6), new AmbientLight(0xffffff, 0.25));
const sun = new DirectionalLight(0xfff1dc, 1.6);
sun.position.set(-2, 5, 3);
scene.add(sun);
const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
const room = buildRoom(play, mat);
const view = new PropsView(play, mat);
const dyn = createWorldDynamics(play, mat);
const shards = new Shards();
shards.setBounds((W * 0.4) / 2, (D * 0.4) / 2);
scene.add(room.group, view.group, dyn.group, shards.mesh, shards.puddles);

const camera = new PerspectiveCamera(46, innerWidth / innerHeight, 0.05, 100);
const fit = () => {
  camera.aspect = innerWidth / innerHeight;
  const halfW = (W * 0.4) / 2 + 0.3;
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const dist = halfW / Math.tan(hfov / 2) + 0.6;
  const pitch = (52 * Math.PI) / 180;
  camera.position.set(0, Math.sin(pitch) * dist + 0.4, Math.cos(pitch) * dist + 0.2);
  camera.lookAt(new Vector3(0, 0.55, 0.15));
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
};
fit();
addEventListener('resize', fit);

const base = fixtureStateFor(play);
const hud = document.getElementById('hud')!;

/** Deterministic state at tick T (rebuilt from scratch every frame: render only reads it). */
function stateAt(T: number, out: SimEvent[]): SimState {
  const s = structuredClone(base);
  s.tick = T;
  s.grid.puddle = new Uint8Array(W * D);
  const ev = (tick: number, e: SimEvent) => {
    if (tick === T) out.push(e);
  };
  // Roomba
  if (s.roomba && loop.length) {
    const step = Math.floor(T / 24);
    const a = loop[step % loop.length];
    const b = loop[(step + 1) % loop.length];
    Object.assign(s.roomba, { fromX: a.x, fromZ: a.z, x: b.x, z: b.z, stepProgress: T % 24, pause: step % 6 === 5 ? 12 : 0, facing: 3 });
    if (T % 24 === 0) ev(T, { t: 'roomba', tick: T, x: b.x, z: b.z });
  }
  // puddles from tick 30 (a slip patch and soil)
  if (T >= 30 && loop.length) {
    const c = loop[3];
    for (const [dx, dz, k] of [
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ])
      if (c.x + dx < W && c.z + dz < D && lv(c.x + dx, c.z + dz) === 0) s.grid.puddle[(c.z + dz) * W + c.x + dx] = k;
    ev(30, { t: 'puddle', tick: 30, x: c.x, z: c.z, kind: 1 });
  }
  const fall = (i: number, t0: number, dir: 5 | 3 | 7, end: PropSt, ticks = 13) => {
    if (i < 0 || T < t0) return;
    const p = s.props[i];
    const pl = props[i];
    const dx = dir === 3 ? 1 : dir === 7 ? -1 : 0;
    const dz = dir === 5 ? 1 : 0;
    let x = pl.x + dx;
    let z = pl.z + dz;
    while (x >= 0 && z >= 0 && x < W && z < D && lv(x, z) > 0) {
      x += dx;
      z += dz;
    }
    x = Math.max(0, Math.min(W - 1, x));
    z = Math.max(0, Math.min(D - 1, z));
    Object.assign(p, { fromX: pl.x, fromZ: pl.z, fromLevel: pl.level, x, z, level: lv(x, z), dir, fallTicks: ticks });
    if (T < t0 + ticks) Object.assign(p, { state: PropSt.FALLING, fallTimer: t0 + ticks - T });
    else Object.assign(p, { state: end, fallTimer: 0, restTick: t0 + ticks });
    ev(t0, { t: 'fall', tick: t0, prop: i, from: pl.level, dir });
  };
  fall(iBooks, 60, 5, PropSt.LANDED);
  fall(iPlates, 90, 5, PropSt.BROKEN);
  s.eventActive = T >= 100 && T < 200 ? 1 : 0;
  ev(120, { t: 'pull', tick: 120, prop: iLamp, dir: 5, kind: 'cable', moved: 1 });
  fall(iLamp, 124, 5, PropSt.BROKEN);
  if (iTree >= 0) {
    const p = s.props[iTree];
    if (T >= 140 && T < 150) Object.assign(p, { state: PropSt.WOBBLE, sway: 2 });
    if (T >= 150) {
      Object.assign(p, { fromX: 1, fromZ: D - 1, fromLevel: 3, x: 5, z: D - 1, level: 0, dir: 3, fallTicks: 18 });
      if (T < 168) Object.assign(p, { state: PropSt.FALLING, fallTimer: 168 - T });
      else Object.assign(p, { state: PropSt.LANDED, fallTimer: 0, restTick: 168 });
    }
    ev(150, { t: 'topple', tick: 150, prop: iTree, cells: 4, dir: 3 });
  }
  fall(iBalloon, 170, 5, PropSt.BROKEN, 9);
  if (iCloth >= 0) {
    const p = s.props[iCloth];
    if (T >= 200) {
      p.z = props[iCloth].z + 1;
      if (iCake >= 0 && s.props[iCake].state === PropSt.REST) s.props[iCake].z = props[iCake].z + 1;
    }
    if (T >= 240) Object.assign(p, { state: PropSt.LANDED, restTick: 240, fromX: p.x, fromZ: p.z });
    ev(200, { t: 'pull', tick: 200, prop: iCloth, dir: 5, kind: 'cloth', moved: 1 });
  }
  s.inBox = T >= 260 && T < 330 ? iBox : -1;
  ev(300, { t: 'framed', tick: 300, prop: iRoomba });
  fall(iFlour, 320, 5, PropSt.SPILLED);
  return s;
}

let last = performance.now();
let T = 0;
let prevTick = -1;
const events: SimEvent[] = [];
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  T = freeze !== null ? freeze : (T + dt * 30 * speed) % 420;
  const tick = Math.floor(T);
  const alpha = T - tick;
  events.length = 0;
  if (tick !== prevTick) {
    // replay the ticks we skipped so one-shot events still fire
    if (freeze !== null && prevTick < 0) for (let t = 0; t < tick; t++) stateAt(t, events);
    if (tick < prevTick) shards.reset();
    for (let t = Math.max(0, prevTick + 1); t <= tick; t++) if (t !== tick) stateAt(t, events);
  }
  const s = stateAt(tick, tick !== prevTick ? events : []);
  const fx = view.update(s, T, alpha, null, true);
  for (const f of fx) {
    const def = propKind(f.propKind);
    if (f.kind === 'break') {
      shards.burst(f.pos, f.pos.y, { count: def?.material === 'glass' ? 40 : 28, colors: shardColors(f.propKind), seed: f.seed, dirX: f.dirX, dirZ: f.dirZ, speed: 2.2, up: 2.2, hero: 3 });
      const pc = puddleColor(f.propKind);
      if (pc) shards.puddle(f.pos, pc, 0.16, f.seed);
    } else if (f.kind === 'spill') {
      shards.puddle(f.pos, puddleColor(f.propKind) || (def?.color ?? 0xffffff), 0.34, f.seed);
      shards.burst(f.pos, f.pos.y, { count: 14, colors: shardColors(f.propKind), seed: f.seed, speed: 1.2, up: 1.4, dirX: f.dirX, dirZ: f.dirZ });
    }
  }
  dyn.update(s, alpha, events);
  shards.update(freeze !== null ? 1 / 30 : dt * speed);
  prevTick = tick;
  renderer.render(scene, camera);
  hud.textContent = `${shellName} · ${theme} · tick ${tick}\ncalls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\nworld calls ${countDrawCalls(room.group) + countDrawCalls(view.group) + countDrawCalls(dyn.group)}  world tris ${countTriangles(room.group) + countTriangles(view.group) + countTriangles(dyn.group)}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as Record<string, unknown>).__world = { play, view, dyn, room };
