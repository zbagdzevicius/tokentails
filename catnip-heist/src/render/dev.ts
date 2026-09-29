/**
 * Render dev harness: a hard-coded mini level driven by a scripted fake sim, so the renderer can be
 * iterated on (and screenshotted) without the real sim.
 *
 * Open http://127.0.0.1:5173/src/render/dev.html  (npm run dev)
 * URL params:
 *   t=<tick>        start tick (default 0)          freeze      do not advance time
 *   speed=<x>       time scale (default 1)          zoom=<z>    camera zoom factor
 *   cats=a,b        playable breeds                 active=0|1  force the active cat
 *   mode=PATROL|SNIFF|INVESTIGATE|ALERT             force all guard modes
 *   rescued=1  won=1  keyTaken=0|1  plate=0 (door closed)  hud=0
 * Real sim: level=heist-01 (plays the recorded solution; play=1 for keyboard control).
 * window.__renderDev exposes { stats(), state(), setTick(n), renderer }.
 */
import { NO_INPUT, SUBTILE, TICK_HZ, type CatState, type Input, type GuardMode, type GuardState, type LevelDef, type SimEvent, type SimState, type Vec2i } from '../types';
import { createRenderer } from './GameRenderer';

const TILES = [
  '                        ',
  ' ###################### ',
  ' #....#.......b.......# ',
  ' #.rr.#.......b..bb...# ',
  ' #.rr.....###.........# ',
  ' #....#...#.#...rrrr..# ',
  ' #....#...#.#...rrrr..# ',
  ' ##.###...#.#.........# ',
  ' #........#.###...bb..# ',
  ' #..bb................# ',
  ' #..bb.....b.....##...# ',
  ' #.........b..........# ',
  ' ###################### ',
  '                        ',
];

const T = (x: number, y: number): Vec2i => ({ x, y });

export const DEV_LEVEL: LevelDef = {
  id: 'dev-mini',
  tiles: TILES,
  catSpawns: [T(3, 4), T(3, 5)],
  guards: [
    { id: 'g1', sprite: 'base', waypoints: [T(12, 11), T(20, 11)], speed: 1, sniffTicks: 30, visionTiles: 4 },
    { id: 'g2', sprite: 'brown', waypoints: [T(7, 2), T(7, 8)], speed: 1, sniffTicks: 30, visionTiles: 4 },
    { id: 'g3', sprite: 'black', waypoints: [T(13, 2), T(13, 7)], speed: 1, sniffTicks: 45, visionTiles: 3 },
  ],
  coins: [
    [7, 2], [9, 2], [11, 2], [8, 6], [11, 9], [15, 9], [17, 11], [20, 7], [2, 11], [5, 11], [19, 4], [14, 5],
  ].map(([x, y], i) => ({ id: `c${i}`, tile: T(x, y) })),
  key: { id: 'key', tile: T(20, 2) },
  doors: [
    { id: 'd1', tile: T(6, 4), kind: 'PLATE' },
    { id: 'vault', tile: T(11, 8), kind: 'VAULT' },
  ],
  plates: [{ id: 'p1', tile: T(3, 6), doors: ['d1'] }],
  crate: { id: 'crate', tile: T(11, 5), catId: 'pinkie', catName: 'Pinkie' },
  exit: { id: 'exit', tiles: [T(19, 10), T(20, 10)] },
  checkpoints: [
    { id: 'cp1', tile: T(8, 9) },
    { id: 'cp2', tile: T(15, 2) },
  ],
  meta: { title: 'Dev mini', parTicks: 3600, meowRadiusTiles: 5, investigateTicks: 60 },
};

const CAT_PATH: Vec2i[] = [T(3, 4), T(8, 4), T(8, 9), T(15, 9), T(15, 7), T(20, 7), T(20, 2), T(15, 2), T(20, 2), T(20, 7), T(15, 7), T(15, 9), T(8, 9), T(8, 4)];

function onLoop(wps: Vec2i[], speed: number, tick: number, pause = 0): { pos: Vec2i; dir: Vec2i; moving: boolean } {
  const pts = wps.map((w) => ({ x: w.x * SUBTILE + 8, y: w.y * SUBTILE + 8 }));
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    segs.push(l);
    total += l / speed + pause;
  }
  let t = tick % total;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dur = segs[i] / speed;
    const dir = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    if (t < pause) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const pd = { x: Math.sign(a.x - prev.x), y: Math.sign(a.y - prev.y) };
      return { pos: { ...a }, dir: pd.x || pd.y ? pd : dir, moving: false };
    }
    t -= pause;
    if (t < dur) {
      const d = Math.round(t * speed);
      return { pos: { x: a.x + dir.x * d, y: a.y + dir.y * d }, dir, moving: true };
    }
    t -= dur;
  }
  return { pos: { ...pts[0] }, dir: { x: 1, y: 0 }, moving: false };
}

interface DevOpts {
  catIds: [string, string];
  active?: 0 | 1;
  mode?: GuardMode;
  rescued?: boolean;
  won?: boolean;
  keyTaken?: boolean;
  /** Parked cat off the plate: plate up, door closed. */
  plateOff?: boolean;
}

/** Pure scripted state at `tick` (events are those of that tick). */
export function devState(level: LevelDef, tick: number, o: DevOpts, prevCoins?: boolean[]): SimState {
  const events: SimEvent[] = [];
  const c0 = onLoop(CAT_PATH, 1.5, tick, 0);
  const faceX = (d: Vec2i, last: 1 | -1): 1 | -1 => (d.x > 0 ? 1 : d.x < 0 ? -1 : last);
  const period = 240;
  const active: 0 | 1 = o.active ?? ((Math.floor(tick / period) % 2) as 0 | 1);
  if (o.active === undefined && tick > 0 && tick % period === 0) events.push({ type: 'SWAP', cat: active });
  const spotted = tick % 420 >= 330 && tick % 420 < 345;
  if (tick % 420 === 330) events.push({ type: 'SPOTTED', cat: 0 });
  const cat0: CatState = {
    id: o.catIds[0],
    pos: c0.pos,
    facing: c0.dir,
    faceX: faceX(c0.dir, 1),
    moving: c0.moving && !spotted,
    checkpoint: tick > 200 ? T(8, 9) : level.catSpawns[0],
    stunTicks: spotted ? 345 - (tick % 420) : 0,
    pose: spotted ? 'HIT' : c0.moving ? 'WALK' : 'IDLE',
  };
  const meow = tick % 150 >= 140;
  if (tick % 150 === 140) events.push({ type: 'MEOW', cat: 1, tile: level.plates[0].tile });
  const cat1: CatState = {
    id: o.catIds[1],
    pos: o.plateOff ? { x: 4 * SUBTILE + 8, y: 6 * SUBTILE + 8 } : { x: level.plates[0].tile.x * SUBTILE + 8, y: level.plates[0].tile.y * SUBTILE + 8 },
    facing: { x: 1, y: 0 },
    faceX: 1,
    moving: false,
    checkpoint: level.catSpawns[1],
    stunTicks: 0,
    pose: meow ? 'MEOW' : 'IDLE',
  };
  const guards: GuardState[] = level.guards.map((g, i) => {
    const l = onLoop(g.waypoints, g.speed, tick + i * 37, g.sniffTicks);
    let mode: GuardMode = l.moving ? 'PATROL' : 'SNIFF';
    if (i === 1) {
      const ph = tick % 300;
      mode = ph < 120 ? mode : ph < 200 ? 'INVESTIGATE' : ph < 260 ? 'ALERT' : 'SNIFF';
      if (ph === 120) events.push({ type: 'INVESTIGATE', id: g.id });
    }
    if (o.mode) mode = o.mode;
    return {
      id: g.id,
      sprite: g.sprite,
      pos: l.pos,
      facing: l.dir,
      faceX: faceX(l.dir, 1),
      mode,
      modeTicks: 0,
      waypointIndex: 0,
      target: null,
      visionTiles: g.visionTiles,
      moving: l.moving && mode !== 'SNIFF',
    };
  });
  const coins = level.coins.map((c, i) => {
    const near = Math.abs(c.tile.x * SUBTILE + 8 - c0.pos.x) < 8 && Math.abs(c.tile.y * SUBTILE + 8 - c0.pos.y) < 8;
    const taken = (prevCoins?.[i] ?? false) || near;
    if (taken && !(prevCoins?.[i] ?? false)) events.push({ type: 'COIN', cat: 0, id: c.id, tile: c.tile });
    return { id: c.id, tile: c.tile, taken };
  });
  const keyTaken = o.keyTaken ?? tick >= 330;
  if (tick === 330 && o.keyTaken === undefined) events.push({ type: 'KEY', cat: 0, tile: level.key!.tile });
  const rescued = o.rescued ?? tick >= 600;
  if (tick === 600 && o.rescued === undefined) events.push({ type: 'RESCUE', cat: 0 });
  const won = o.won ?? tick >= 1100;
  if (tick === 1100 && o.won === undefined) events.push({ type: 'WIN' });
  const collected = coins.filter((c) => c.taken).length;
  return {
    levelId: level.id,
    tick,
    rng: 1,
    pendingInteract: false,
    cats: [cat0, cat1],
    activeIndex: active,
    guards,
    coins,
    coinsCollected: collected,
    hasKey: keyTaken && !rescued,
    keyTaken,
    doorsOpen: [!o.plateOff, keyTaken],
    platesDown: [!o.plateOff],
    rescued,
    won,
    spottedCount: 0,
    score: collected * 10 + (rescued ? 50 : 0),
    hash: tick,
    events,
  };
}

/**
 * Real-sim mode (?level=heist-01): runs the actual sim on the real level. By default it plays the
 * recorded solution; with &play=1 the keyboard drives it (WASD/arrows, Q/Tab swap, E interact,
 * Space meow). Imported lazily so the fake harness works even while the sim is in progress.
 */
async function runReal(q: URLSearchParams): Promise<void> {
  const el = document.getElementById('app')!;
  const hud = document.getElementById('hud')!;
  if (q.get('hud') === '0') hud.style.display = 'none';
  const [sim, levels] = await Promise.all([import('../sim'), import('../levels')]);
  const level = levels.getLevel(q.get('level')!);
  const log = levels.HEIST_01_SOLUTION;
  const catIds = (q.get('cats')?.split(',') ?? log.catIds) as [string, string];
  const inputs = sim.decodeInputs(log.runs);
  const r = createRenderer({ assetBase: 'assets/' });
  r.mount(el);
  r.setLevel(level);
  r.setCats(catIds);
  if (q.has('zoom')) r.setZoom(Number(q.get('zoom')));
  const play = q.get('play') === '1';
  const frozen = q.has('freeze');
  let cur = sim.Sim.init(level, log.seed, catIds);
  let prev = cur;
  const startTick = Number(q.get('t') ?? 0);
  while (cur.tick < startTick && !cur.won) {
    prev = cur;
    cur = sim.Sim.step(cur, inputs[cur.tick] ?? NO_INPUT);
  }
  const keys = new Set<string>();
  const edges = new Set<string>();
  addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) edges.add(e.code);
    keys.add(e.code);
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  const readInput = (): Input => {
    const ax = (a: string[], b: string[]) => ((a.some((k) => keys.has(k)) ? 1 : 0) - (b.some((k) => keys.has(k)) ? 1 : 0)) as -1 | 0 | 1;
    const i: Input = {
      dx: ax(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
      dy: ax(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
      swap: edges.has('KeyQ') || edges.has('Tab'),
      interact: edges.has('KeyE'),
      meow: edges.has('Space'),
    };
    edges.clear();
    return i;
  };
  let ready = false;
  r.ready().then(() => (ready = true));
  let acc = 0;
  let last = performance.now();
  const speed = Number(q.get('speed') ?? 1);
  const frame = () => {
    const now = performance.now();
    acc += Math.min(0.1, (now - last) / 1000) * speed;
    last = now;
    while (!frozen && acc >= 1 / TICK_HZ) {
      acc -= 1 / TICK_HZ;
      if (cur.won && !play) break;
      prev = cur;
      cur = sim.Sim.step(cur, play ? readInput() : (inputs[cur.tick] ?? NO_INPUT));
      r.observe(cur);
    }
    r.update(prev, cur, frozen ? 1 : Math.min(1, acc * TICK_HZ));
    const s = r.stats();
    hud.textContent = `${level.id} tick ${cur.tick}  active ${cur.activeIndex}  coins ${cur.coinsCollected}  spotted ${cur.spottedCount}${cur.won ? '  WON' : ''}\n${s.calls} calls  ${s.triangles} tris${ready ? '' : '  loading...'}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __renderDev: unknown }).__renderDev = { renderer: r, stats: () => r.stats(), state: () => cur, isReady: () => ready };
}

function main(): void {
  const q = new URLSearchParams(location.search);
  if (q.get('level')) {
    runReal(q).catch((e) => {
      console.error(e);
      document.body.insertAdjacentHTML('beforeend', `<pre style="color:#FF7AA2;position:fixed;bottom:0">${String(e)}</pre>`);
    });
    return;
  }
  const el = document.getElementById('app')!;
  const hud = document.getElementById('hud')!;
  if (q.get('hud') === '0') hud.style.display = 'none';
  const catIds = (q.get('cats') ?? 'bob,oreo').split(',') as [string, string];
  const opts: DevOpts = {
    catIds,
    active: q.has('active') ? (Number(q.get('active')) as 0 | 1) : undefined,
    mode: (q.get('mode') as GuardMode | null) ?? undefined,
    rescued: q.has('rescued') ? q.get('rescued') === '1' : undefined,
    won: q.has('won') ? q.get('won') === '1' : undefined,
    keyTaken: q.has('keyTaken') ? q.get('keyTaken') === '1' : undefined,
    plateOff: q.get('plate') === '0',
  };
  const r = createRenderer({ assetBase: 'assets/' });
  r.mount(el);
  r.setLevel(DEV_LEVEL);
  r.setCats(catIds);
  if (q.has('zoom')) r.setZoom(Number(q.get('zoom')));

  let tick = Number(q.get('t') ?? 0);
  const speed = Number(q.get('speed') ?? 1);
  const frozen = q.has('freeze');
  // Replay coin pickups up to the start tick so taken coins stay taken.
  let coinsTaken: boolean[] | undefined;
  for (let t = 0; t <= tick; t++) coinsTaken = devState(DEV_LEVEL, t, opts, coinsTaken).coins.map((c) => c.taken);
  let prev = devState(DEV_LEVEL, Math.max(0, tick - 1), opts, coinsTaken);
  let cur = devState(DEV_LEVEL, tick, opts, coinsTaken);
  let acc = 0;
  let last = performance.now();
  let ready = false;
  r.ready().then(() => {
    ready = true;
  });

  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000) * speed;
    last = now;
    if (!frozen) {
      acc += dt;
      while (acc >= 1 / TICK_HZ) {
        acc -= 1 / TICK_HZ;
        tick++;
        prev = cur;
        cur = devState(DEV_LEVEL, tick, opts, prev.coins.map((c) => c.taken));
      }
    }
    r.update(prev, cur, frozen ? 1 : acc * TICK_HZ);
    const s = r.stats();
    hud.textContent = `tick ${cur.tick}  active ${cur.activeIndex}  coins ${cur.coinsCollected}\n${s.calls} calls  ${s.triangles} tris${ready ? '' : '  loading...'}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  (window as unknown as { __renderDev: unknown }).__renderDev = {
    renderer: r,
    stats: () => r.stats(),
    state: () => cur,
    isReady: () => ready,
    setTick: (n: number) => {
      tick = n;
      prev = devState(DEV_LEVEL, Math.max(0, n - 1), opts);
      cur = devState(DEV_LEVEL, n, opts);
    },
    input: NO_INPUT,
  };
}

main();
