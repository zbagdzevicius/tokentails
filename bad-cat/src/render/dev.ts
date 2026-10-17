/**
 * Render dev page (not shipped): open http://localhost:5174/src/render/dev.html on the running dev server.
 * Plays a room with the real sim. Keys: WASD/arrows move, Shift sneak, J swat, Space jump, K grab.
 *
 * Query params
 *   ?day=<n>            daily room n (content)            ?shell=<i>|boss|boss-napper  first daily with that shell / fixture
 *   ?theme=<id>         RoomTheme override                ?napper=1   the Napper as the (second) human
 *   ?cats=<pattern>     player cat preset (solid, tabby, tuxedo, bicolor, calico, colorpoint, tortie, orange)
 *   ?collar=&hat=&trail=  cosmetics on the player's cat    ?ghosts=<0..2>  autopilot ghosts with name labels
 *   ?cameos=<n>         n spectator cameos + the fridge wall (40)      ?accomplice=1[&granted=1][&badge=guest_star]
 *   ?human=busy|telegraph|look|fakeout|event|nap|caught   force the drawn state (render only, after ?ticks)
 *   ?layout=streamer    16:9 stage    ?editor=1  Room Maker overlay (hover follows the pointer)
 *   ?inbox=<prop>       the cat sits in that prop (box), ears only    ?scoop=<t>  freeze the cuddle t ticks in
 *   ?gallery=cats|humans   every pattern + cosmetic / every persona in a row
 *   ?portrait=plinth|mugshot   renderCatPortrait    ?still=room  renderRoomStill
 *   ?auto=1 autopilot, ?ticks=<n> fast-forward, ?pause=1, ?clip=<frame>[&frames=180&size=720x640], ?quality=, ?preview=1
 */
import {
  BTN_GRAB,
  BTN_JUMP,
  BTN_SWAT,
  CatAct,
  DEFAULT_CAT,
  HumanSt,
  PATTERNS,
  rgb565,
  type CameoEntry,
  type CatSpec,
  type ClipPlan,
  type Dir8,
  type Pattern,
  type PlayableRoom,
  type RoomTheme,
  type SimEvent,
  type SimState,
  type TickInput,
} from '../types';
import { sim } from '../sim';
import { content, SHELLS, ROUTINES } from '../content';
import { encodeCat } from '../codec';
import { DirectionalLight, HemisphereLight, MeshLambertMaterial, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, Color } from 'three';
import { GameRenderer } from './Renderer';
import { renderFrames } from './clip-pass';
import { visRng } from './shards';
import { createCatPreview } from './cat-preview';
import { bossFixture, fixturePlay } from './test-fixtures';
import { buildCatRig, poseCat } from './cat-rig';
import { HumanView } from './human-rig';
import { PERSONA_IDS } from './actors/personas';
import { renderCatPortrait, renderRoomStill } from './actors/stills';
import { PAL } from './palette';

const q = new URLSearchParams(location.search);
const stage = document.getElementById('stage')!;
const hud = document.getElementById('hud')!;

const COATS: Record<string, Partial<CatSpec>> = {
  solid: { pattern: 'solid', base: rgb565(0x3a3a42), eyes: 1 },
  tabby: { pattern: 'tabby' },
  tuxedo: { pattern: 'tuxedo', base: rgb565(0x2a2a30), tertiary: rgb565(0xffffff), eyes: 1 },
  bicolor: { pattern: 'bicolor', base: rgb565(0xc8783a), tertiary: rgb565(0xfaf6ee), eyes: 3 },
  calico: { pattern: 'calico', base: rgb565(0xe08a3c), secondary: rgb565(0x2b2626), tertiary: rgb565(0xfbf7ef), eyes: 1 },
  colorpoint: { pattern: 'colorpoint', base: rgb565(0xf1e4cf), secondary: rgb565(0x5a3e33), eyes: 2 },
  tortie: { pattern: 'tortie', base: rgb565(0x2d2422), secondary: rgb565(0xd27a35), eyes: 0 },
  orange: { pattern: 'tabby', base: rgb565(0xf0a050), secondary: rgb565(0xc06a28), name: 'Mochi' },
};
function coat(name: string | null, extra: Partial<CatSpec> = {}): CatSpec {
  return { ...DEFAULT_CAT, ...(COATS[name ?? ''] ?? {}), ...extra };
}

function pickPlay(): PlayableRoom {
  const sh = q.get('shell');
  const napper = q.get('napper') === '1';
  let play: PlayableRoom;
  if (sh === 'boss' || sh === 'boss-napper') play = bossFixture({ napper: napper || sh === 'boss-napper' });
  else if (sh === 'fixture') play = fixturePlay();
  else if (sh !== null && Number.isFinite(Number(sh))) {
    const want = Number(sh);
    let room = content.dailyRoom(Number(q.get('day') ?? 1));
    for (let d = 1; d < 200 && room.shell !== want; d++) room = content.dailyRoom(d);
    play = content.resolve(room, 'practice');
    if (play.shell.id !== want && SHELLS[want]) play = { ...play, shell: SHELLS[want] };
  } else play = content.resolve(content.dailyRoom(Number(q.get('day') ?? 1)), 'practice');
  if (napper && sh !== 'boss' && sh !== 'boss-napper') {
    const nap = ROUTINES.find((r) => r.persona === 'napper' || r.kind === 'napper');
    if (nap) play = { ...play, routine: nap };
  }
  const theme = q.get('theme') as RoomTheme | null;
  if (theme) play = { ...play, room: { ...play.room, theme } };
  return play;
}

const keys = new Set<string>();
let latched = 0;
let sneak = false;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyJ') latched |= BTN_SWAT;
  if (e.code === 'Space') latched |= BTN_JUMP;
  if (e.code === 'KeyK') latched |= BTN_GRAB;
  if (e.code === 'ShiftLeft') sneak = !sneak;
});
addEventListener('keyup', (e) => keys.delete(e.code));

const DIRS: Record<string, Dir8> = { '0,-1': 1, '1,-1': 2, '1,0': 3, '1,1': 4, '0,1': 5, '-1,1': 6, '-1,0': 7, '-1,-1': 8 };
function autoPilot(seed: number): (tick: number) => TickInput {
  const rnd = visRng(seed);
  let dir: Dir8 = 3;
  return (tick) => {
    if (tick % 24 === 0) dir = (1 + Math.floor(rnd() * 8)) as Dir8;
    const b = tick % 9 === 0 ? BTN_SWAT : tick % 31 === 0 ? BTN_JUMP : 0;
    return { dir: tick % 60 > 50 ? 0 : dir, speed: tick % 120 < 60 ? 2 : 1, buttons: b };
  };
}
function keyInput(): TickInput {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const dir = (DIRS[`${x},${z}`] ?? 0) as Dir8;
  const b = latched;
  latched = 0;
  return { dir, speed: dir ? (sneak ? 1 : 2) : 0, buttons: b };
}

const FORCE: Record<string, number> = { busy: HumanSt.BUSY, telegraph: HumanSt.TELEGRAPH, look: HumanSt.LOOK, fakeout: HumanSt.FAKEOUT, event: HumanSt.EVENT, nap: HumanSt.NAP };

/** Render-only copy of the state with the forced human state (the sim never sees it). */
function forced(s: SimState, startTick: number): SimState {
  const f = q.get('human');
  const box = q.get('inbox');
  if (!f && box === null) return s;
  const c = structuredClone(s);
  // ?inbox=<prop index>: the cat sits in that prop (render only)
  if (box !== null) c.inBox = Number(box);
  if (!f) return c;
  const el = Math.max(0, s.tick - startTick);
  if (f === 'caught') {
    c.cat.act = CatAct.CUDDLED;
    // ?scoop=<t> freezes the cuddle at t ticks after the catch
    c.caughtTick = q.get('scoop') ? c.tick - Number(q.get('scoop')) : startTick;
    return c;
  }
  const st = FORCE[f];
  if (st === undefined) return c;
  for (const h of c.humans) {
    h.state = st as SimState['humans'][number]['state'];
    h.stateTicks = st === HumanSt.LOOK ? 90 : st === HumanSt.EVENT ? 180 : 60;
    h.timer = Math.max(1, h.stateTicks - (el % h.stateTicks));
    if (st === HumanSt.LOOK) h.facing = h.lookFacing;
  }
  if (st === HumanSt.LOOK && q.get('seen') === '1') c.seen = 1;
  if (q.get('noise')) c.noise = Number(q.get('noise')) * 1000;
  return c;
}

function cameoBundle(n: number): { spectators: CameoEntry[]; fridge: CameoEntry[] } {
  const names = ['Mila', 'Oreo', 'Luna', 'Mochi', 'Tofu', 'Biscuit', 'Pickle', 'Nori', 'Ziggy', 'Pumpkin', 'Socks', 'Bean', 'Olive', 'Pepper', 'Waffles'];
  const mk = (i: number): CameoEntry => {
    const keys = Object.keys(COATS);
    const spec = coat(keys[i % keys.length], { name: names[i % names.length], body: i % 5 === 0 ? 'chonk' : i % 7 === 0 ? 'slim' : 'normal' });
    return { id: `dev${i}`, name: spec.name, catCode: encodeCat(spec), kind: i % 3 ? 'club' : 'paid', club: i % 3 !== 0 };
  };
  return { spectators: Array.from({ length: n }, (_, i) => mk(i)), fridge: Array.from({ length: 40 }, (_, i) => mk(i + 3)) };
}

/** Faces for some cameos (procedural, drawn on a canvas so the atlas takes the image path). */
function devFaces(list: CameoEntry[]): Map<string, HTMLCanvasElement> {
  const m = new Map<string, HTMLCanvasElement>();
  list.slice(0, 6).forEach((e, i) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = ['#f4a259', '#2b2d42', '#e9c46a', '#d9d9d9', '#8d5a3b', '#f2efe9'][i];
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#2a1f2b';
    g.beginPath();
    g.arc(22, 28, 6, 0, 7);
    g.arc(42, 28, 6, 0, 7);
    g.fill();
    g.fillStyle = '#f08a9a';
    g.beginPath();
    g.arc(32, 40, 4, 0, 7);
    g.fill();
    m.set(e.id, c);
  });
  return m;
}

/** ?gallery=cats|humans: a lineup in its own small scene (shows every pattern + cosmetic, every persona). */
function gallery(kind: string): void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  stage.appendChild(canvas);
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(PAL.bg);
  scene.add(new HemisphereLight(0xfff0dc, 0x8a6a6e, 2));
  const sun = new DirectionalLight(0xffe0b0, 2);
  sun.position.set(1, 3, 2);
  scene.add(sun);
  const cam = new PerspectiveCamera(30, 1, 0.05, 50);
  const tick: ((T: number) => void)[] = [];
  if (kind === 'humans') {
    const play = fixturePlay();
    PERSONA_IDS.forEach((id, i) => {
      const hv = new HumanView({ ...play, routine: { ...play.routine, persona: id, busyFacing: 5, lookFacings: [5] } }, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      scene.add(hv.rig.root);
      const x = (i - (PERSONA_IDS.length - 1) / 2) * 0.85;
      const st = q.get('human') ?? 'busy';
      tick.push((T) => {
        hv.update(
          { x: 5, z: 2, facing: 5, state: (FORCE[st] ?? HumanSt.BUSY) as never, timer: 90 - (T % 90), stateTicks: 90, telegraph: 20, fakeOut: 0, lookFacing: 5, eventDone: 0, turns: 0, lookStartTick: -1 },
          { T, alpha: 0, dtTicks: 1, seen: false, scooping: st === 'caught', caughtOther: false, caughtTicks: T % 75, catWorld: new Vector3(0, 0, 0.6), w: 12, d: 10 },
        );
        hv.rig.root.position.x += x - hv.rig.root.position.x;
        hv.rig.root.position.z = 0;
      });
    });
    cam.position.set(0, 1.6, 6.2);
    cam.lookAt(0, 0.9, 0);
  } else {
    // 7 patterns, each with collar i+1 and hat i+1 (all 7 collars and 7 hats on screen)
    PATTERNS.forEach((p: Pattern, i) => {
      const spec = coat(p, { collar: i + 1, hat: i + 1, body: i === 4 ? 'chonk' : i === 2 ? 'slim' : 'normal', tail: i === 3 ? 'fluffy' : i === 6 ? 'bob' : 'normal', ears: i === 5 ? 'fold' : 'normal' });
      const rig = buildCatRig(spec, null);
      rig.root.position.set((i - 3) * 0.62, 0, 0);
      rig.root.rotation.y = 0.35;
      scene.add(rig.root);
      tick.push((T) => poseCat(rig, { T, act: 0, actP: 0, moving: 0, phase: 0, blink: Math.floor(T + i * 13) % 90 < 5, loaf: 0, sit: q.get('sit') === '1' ? 1 : 0, lid: q.get('lid') === 'half' ? 'half' : undefined }));
    });
    cam.position.set(0, 0.85, 4.3);
    cam.lookAt(0, 0.25, 0);
  }
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    gl.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const T = (now / 1000) * 30;
    for (const f of tick) f(q.get('pause') === '1' ? 30 : T);
    gl.render(scene, cam);
    hud.textContent = `gallery ${kind}  calls ${gl.info.render.calls}`;
  };
  requestAnimationFrame(loop);
}

async function main(): Promise<void> {
  const cat = coat(q.get('cats') ?? q.get('cat'), {
    collar: Number(q.get('collar') ?? 0),
    hat: Number(q.get('hat') ?? 0),
    name: q.get('name') ?? 'Tofu',
  });
  const g = q.get('gallery');
  if (g) return gallery(g);
  const portrait = q.get('portrait');
  if (portrait === 'plinth' || portrait === 'mugshot') {
    const c = await renderCatPortrait(cat, null, { w: 600, h: 800, pose: portrait });
    if (c) {
      c.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-height:96vh';
      stage.appendChild(c);
    }
    hud.textContent = c ? `portrait ${portrait}` : 'portrait: null';
    return;
  }
  const play = pickPlay();
  if (q.get('still') === 'room') {
    const b = await renderRoomStill(play, { w: 1200, h: 630 });
    if (b) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(b);
      img.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-width:98vw';
      stage.appendChild(img);
    }
    hud.textContent = b ? `room still ${b.size} bytes` : 'room still: null';
    return;
  }
  const r = new GameRenderer(stage, { quality: (q.get('quality') as 'low' | 'mid' | 'high') ?? undefined });
  (window as unknown as Record<string, unknown>).__r = r;
  if (q.get('preview') === '1') {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
    stage.appendChild(c);
    r.dispose();
    const pv = createCatPreview(c, cat);
    if (q.get('pattern')) pv.update({ ...cat, pattern: q.get('pattern') as never, ears: 'fold', tail: 'fluffy', body: 'chonk', collar: 1 });
    hud.textContent = 'preview';
    return;
  }
  const nGhosts = Math.max(0, Math.min(2, Number(q.get('ghosts') ?? 0)));
  const ghostSpecs = [coat('orange', { name: 'Mochi' }), coat('tuxedo', { name: 'Oreo' })].slice(0, nGhosts);
  await r.load(play, [cat, ...ghostSpecs]);
  if (q.get('layout') === 'streamer') r.setLayout('streamer');
  if (q.get('trail')) r.setTrail(Number(q.get('trail')));
  const nCameos = Number(q.get('cameos') ?? 0);
  if (nCameos > 0) {
    const b = cameoBundle(Math.min(15, nCameos));
    r.setCameos({ dayNo: 1, shuffle: 0, spectators: b.spectators, fridge: b.fridge, guestStars: [], source: 'offline' }, devFaces([...b.spectators, ...b.fridge]));
  }
  if (q.get('accomplice') === '1') {
    const a = play.room.accomplice;
    const spot = a && a.x !== undefined ? { x: a.x, z: a.z ?? 0, level: a.level ?? 0 } : (play.shell.accompliceSpot ?? { x: 11, z: 0, level: 3 });
    r.setAccomplice({
      spec: coat('calico', { name: 'Mila' }),
      name: 'Mila',
      x: spot.x,
      z: spot.z,
      level: spot.level,
      wishProp: a?.wishPropIndex ?? 0,
      granted: q.get('granted') === '1',
      badge: (q.get('badge') as 'accomplice' | 'guest_star' | 'alumni' | null) ?? 'accomplice',
    });
  }
  const auto = q.get('auto') === '1';
  const pilot = autoPilot(7);
  const inputs: TickInput[] = [];
  const s = sim.initSim(play, cat);
  const ghosts = ghostSpecs.map((gs, i) => ({ s: sim.initSim(play, gs), pilot: autoPilot(31 + i * 17) }));
  const ff = Number(q.get('ticks') ?? 0);
  for (let i = 0; i < ff && !s.ended; i++) {
    const inp = pilot(s.tick);
    inputs.push(inp);
    sim.stepSim(s, play, inp, []);
    for (const gh of ghosts) if (!gh.s.ended) sim.stepSim(gh.s, play, gh.pilot(gh.s.tick), []);
  }
  if (ghosts.length) r.setGhosts(ghosts.map((gh) => gh.s));
  const clipF = q.get('clip');
  if (clipF !== null) {
    const size = q.get('size')?.split('x').map(Number);
    const plan: ClipPlan = {
      matchCutTick: Math.max(60, ff - 120),
      crime: { prop: 0, fromTick: Math.max(60, ff - 120), breakTick: ff, toTick: ff + 45 },
      slowMo: { fromTick: ff - 10, toTick: ff + 20, speed: 0.35 },
      pick: 'default',
      hook: '',
      urlLine: '',
      frames: q.get('frames') ? Number(q.get('frames')) : undefined,
      size: size && size.length === 2 ? { w: size[0], h: size[1] } : undefined,
      format: q.get('format') === 'roomba' ? 'roomba' : undefined,
    };
    const want = Number(clipF);
    await renderFrames(r, play, cat, inputs, plan, async (c, i) => {
      if (i === want) {
        const url = c.toDataURL('image/png');
        (window as unknown as Record<string, unknown>).__clipFrame = url;
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-height:96vh;z-index:5';
        document.body.appendChild(img);
        throw new Error('done');
      }
    }).catch(() => undefined);
    hud.textContent = 'clip frame ' + want;
    return;
  }
  if (q.get('editor') === '1') {
    let hover: { x: number; z: number } | null = null;
    const apply = () =>
      r.setEditorOverlay({
        grid: true,
        hover,
        bad: [play.shell.width * 3 + 2, play.shell.width * 3 + 3],
        targets: play.room.props.map((p, i) => (p.target ? i : -1)).filter((i) => i >= 0),
        spawn: play.room.spawn,
      });
    apply();
    stage.addEventListener('pointermove', (e) => {
      const c = r.pickCell(e.clientX, e.clientY);
      hover = c ? { x: c.x, z: c.z } : null;
      apply();
    });
  }
  stage.addEventListener('pointermove', (e) => {
    const sp = r.spectatorAt(e.clientX, e.clientY);
    stage.title = sp ? sp.name : '';
  });
  let acc = 0;
  let last = performance.now();
  let fpsN = 0;
  let fpsT = 0;
  let fps = 0;
  let evs: SimEvent[] = [];
  const startTick = s.tick;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt;
    fpsN++;
    fpsT += dt;
    if (fpsT > 0.5) {
      fps = fpsN / fpsT;
      fpsN = 0;
      fpsT = 0;
    }
    while (acc >= 1 / 30) {
      acc -= 1 / 30;
      if (!s.ended && q.get('pause') !== '1') {
        sim.stepSim(s, play, auto ? pilot(s.tick) : keyInput(), evs);
        for (const gh of ghosts) if (!gh.s.ended) sim.stepSim(gh.s, play, gh.pilot(gh.s.tick), []);
      } else if (q.get('pause') === '1') s.tick++; // paused: the sim stands still, the visuals keep animating
    }
    r.frame(forced(s, startTick), acc * 30, evs);
    evs = [];
    const st = r.stats();
    hud.textContent = `fps ${fps.toFixed(0)}  calls ${st.calls}  tris ${st.triangles}  dpr ${st.dpr}  ${st.tier}\n${play.shell.name} · ${play.routine.name}${play.routine2 ? ' + ' + play.routine2.name : ''}\ntick ${s.tick}  human ${s.humans.map((h) => h.state).join('/')}  susp ${(s.suspicion / 1000) | 0}  noise ${((s.noise ?? 0) / 1000) | 0}  score ${s.score}`;
  };
  requestAnimationFrame(loop);
}
main();
