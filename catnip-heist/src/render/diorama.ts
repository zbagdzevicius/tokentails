/**
 * Title-screen diorama: a small, scripted slice of the Kibble Corp warehouse (two cats sneaking,
 * a guard dog sweeping its cone, a plate holding a door open, a live exit portal) rendered live
 * behind the logo with the real GameRenderer. No sim: states are generated from a looping script.
 *
 *   const d = createDiorama(el, { catIds: ['bob', 'oreo'] });
 *   d.start(); d.stop(); d.dispose();
 */
import { SUBTILE, TICK_HZ, type CatState, type GuardMode, type GuardState, type LevelDef, type SimState, type Vec2i } from '../types';
import { GameRenderer } from './GameRenderer';

const T = (x: number, y: number): Vec2i => ({ x, y });

export const DIORAMA_LEVEL: LevelDef = {
  id: 'title-diorama',
  tiles: [
    '################',
    '#......#.......#',
    '#.bb...#..bbb..#',
    '#.bb...........#',
    '#......#.......#',
    '###.####..rr...#',
    '#......#..rr...#',
    '#.b....#.......#',
    '#.b.......bbbb.#',
    '#......#.......#',
    '################',
  ],
  catSpawns: [T(1, 1), T(4, 4)],
  guards: [
    { id: 'd1', sprite: 'base', waypoints: [T(9, 4), T(14, 4)], speed: 1, sniffTicks: 40, visionTiles: 3 },
    { id: 'd2', sprite: 'brown', waypoints: [T(8, 9), T(14, 9)], speed: 1, sniffTicks: 50, visionTiles: 3 },
  ],
  coins: [T(3, 1), T(5, 1), T(6, 2), T(9, 3), T(11, 3), T(12, 1), T(4, 7), T(5, 9), T(9, 6)].map((t, i) => ({ id: `c${i}`, tile: t })),
  key: { id: 'k', tile: T(14, 1) },
  doors: [{ id: 'door', tile: T(7, 3), kind: 'PLATE', axis: 'v' }],
  plates: [{ id: 'p', tile: T(4, 4), doors: ['door'] }],
  crate: { id: 'crate', tile: T(5, 7), catId: 'siamese', catName: 'Mochi' },
  exit: { id: 'exit', tiles: [T(12, 6), T(13, 6), T(12, 7), T(13, 7)] },
  checkpoints: [{ id: 'cp', tile: T(3, 6) }],
  meta: { title: 'Diorama', parTicks: 9999, meowRadiusTiles: 4, investigateTicks: 40 },
};

const CAT_PATH = [T(1, 1), T(6, 1), T(6, 3), T(12, 3), T(12, 1), T(12, 3), T(6, 3), T(6, 1)];

function onLoop(wps: Vec2i[], speed: number, tick: number, pause = 0): { pos: Vec2i; dir: Vec2i; moving: boolean } {
  const pts = wps.map((w) => ({ x: w.x * SUBTILE + 8, y: w.y * SUBTILE + 8 }));
  let total = 0;
  const segs = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const l = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    total += l / speed + pause;
    return l;
  });
  let t = tick % total;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dir = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    if (t < pause) return { pos: { ...a }, dir: dir.x || dir.y ? dir : { x: 1, y: 0 }, moving: false };
    t -= pause;
    const dur = segs[i] / speed;
    if (t < dur) {
      const d = Math.round(t * speed);
      return { pos: { x: a.x + dir.x * d, y: a.y + dir.y * d }, dir, moving: true };
    }
    t -= dur;
  }
  return { pos: { ...pts[0] }, dir: { x: 1, y: 0 }, moving: false };
}

/** Scripted state at `tick`. Coins re-appear every loop so the scene never runs dry. */
export function dioramaState(tick: number, catIds: [string, string], lastTaken?: boolean[]): SimState {
  const lv = DIORAMA_LEVEL;
  const speed = 1.4;
  const c0 = onLoop(CAT_PATH, speed, tick, 18);
  const faceX = (d: Vec2i): 1 | -1 => (d.x < 0 ? -1 : 1);
  const cat0: CatState = {
    id: catIds[0],
    pos: c0.pos,
    facing: c0.dir,
    faceX: faceX(c0.dir),
    moving: c0.moving,
    checkpoint: lv.catSpawns[0],
    stunTicks: 0,
    pose: c0.moving ? 'WALK' : 'IDLE',
    vel: c0.moving ? { x: Math.round(c0.dir.x * speed), y: Math.round(c0.dir.y * speed) } : { x: 0, y: 0 },
  } as CatState;
  const meow = tick % 200 >= 186;
  const cat1: CatState = {
    id: catIds[1],
    pos: { x: lv.plates[0].tile.x * SUBTILE + 8, y: lv.plates[0].tile.y * SUBTILE + 8 },
    facing: { x: 1, y: 0 },
    faceX: 1,
    moving: false,
    checkpoint: lv.catSpawns[1],
    stunTicks: 0,
    pose: meow ? 'MEOW' : 'IDLE',
  };
  const guards: GuardState[] = lv.guards.map((g, i) => {
    const l = onLoop(g.waypoints, g.speed, tick + i * 53, g.sniffTicks);
    let mode: GuardMode = l.moving ? 'PATROL' : 'SNIFF';
    const ph = (tick + i * 170) % 420;
    if (i === 1 && ph > 300 && ph < 360) mode = 'INVESTIGATE';
    return {
      id: g.id,
      sprite: g.sprite,
      pos: l.pos,
      facing: l.dir,
      faceX: faceX(l.dir),
      mode,
      modeTicks: 0,
      waypointIndex: 0,
      target: null,
      visionTiles: g.visionTiles,
      moving: l.moving,
    };
  });
  const loopTick = tick % 720;
  const coins = lv.coins.map((c, i) => {
    const near = Math.abs(c.tile.x * SUBTILE + 8 - c0.pos.x) < 8 && Math.abs(c.tile.y * SUBTILE + 8 - c0.pos.y) < 8;
    const taken = loopTick < 5 ? false : (lastTaken?.[i] ?? false) || near;
    return { id: c.id, tile: c.tile, taken };
  });
  const events = coins.filter((c, i) => c.taken && !(lastTaken?.[i] ?? false)).map((c) => ({ type: 'COIN' as const, cat: 0, id: c.id, tile: c.tile }));
  const collected = coins.filter((c) => c.taken).length;
  return {
    levelId: lv.id,
    tick,
    rng: 1,
    cats: [cat0, cat1],
    activeIndex: 0,
    guards,
    coins,
    coinsCollected: collected,
    hasKey: false,
    keyTaken: false,
    doorsOpen: [true],
    platesDown: [true],
    rescued: true,
    won: false,
    pendingInteract: false,
    spottedCount: 0,
    score: 0,
    hash: tick,
    events,
  };
}

export interface Diorama {
  readonly renderer: GameRenderer;
  start(): void;
  stop(): void;
  readonly running: boolean;
  dispose(): void;
}

export function createDiorama(el: HTMLElement, opts: { catIds?: [string, string]; base?: string } = {}): Diorama {
  const catIds = opts.catIds ?? ['bob', 'oreo'];
  // The light title scene would always look like headroom: only the heist may step the tier up.
  const r = new GameRenderer({ assetBase: opts.base, interactiveZoom: false, logStats: false, maxPixelRatio: 1.5, qualityStepUp: false });
  r.mount(el);
  r.setLevel(DIORAMA_LEVEL);
  r.setCats(catIds);
  const cx = 8, cz = 5.5;
  r.lockCamera({ x: cx, z: cz });
  const narrow = () => el.clientWidth < el.clientHeight;
  r.setZoom(narrow() ? 0.8 : 1.05);
  let tick = 0;
  let prev = dioramaState(0, catIds);
  let cur = prev;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let t = 0;
  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    t += dt;
    acc += dt;
    while (acc >= 1 / TICK_HZ) {
      acc -= 1 / TICK_HZ;
      tick++;
      prev = cur;
      cur = dioramaState(tick, catIds, prev.coins.map((c) => c.taken));
    }
    r.lockCamera({ x: cx + Math.sin(t * 0.13) * 0.8, z: cz + Math.cos(t * 0.11) * 0.5 });
    r.update(prev, cur, acc * TICK_HZ);
  };
  return {
    renderer: r,
    get running() {
      return running;
    },
    start() {
      if (running) return;
      running = true;
      last = 0;
      r.setZoom(narrow() ? 0.8 : 1.05);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      r.dispose();
    },
  };
}
