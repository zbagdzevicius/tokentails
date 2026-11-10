/**
 * DEV ONLY: the tower lab (V21-FUN §4). `npm run dev` → /tower-lab.html?band=2&side=cat&tier=med
 * Never part of `build` / `build:client` (vite builds index.html only).
 *
 * A row of towers in the real GameView (renderer, rig shader cracks, the pooled fire, the fall and its smouldering
 * rubble), one per damage band: 0 clean (100%), 1 cracked (60%), 2 burning (28%), 3 blazing (10%), 4 destroyed (it
 * falls on the first frames, then its rubble smoulders), 5 a burning core (25%). The camera frames one band, or the
 * whole row with band=all. A synthetic frame per step; a fixed 60 Hz step clock.
 *
 * Query: band=0..5|all, side=cat|dog, tier=low|med|high, reduced=1, w, h, capture=1 (no rAF; driven by __towerlab).
 * window.__towerlab: { ready, set(band), advance(seconds), stats() } for tools/tower-lab-shots.mjs.
 */
import type { EntitySnap, Snapshot, TrickId } from '../sim/api';
import { createRenderer } from '../render/renderer';
import { GameView } from '../render/gameView';
import type { ViewEntity, ViewFrame } from '../render/interp';
import type { QualityTier } from '../render/quality';
import { toX, toZ } from '../render/coords';

const q = new URLSearchParams(location.search);
const tier = (['low', 'med', 'high'].includes(q.get('tier') ?? '') ? q.get('tier') : 'med') as QualityTier;
const capture = q.get('capture') === '1';
const team = (q.get('side') === 'dog' ? 1 : 0) as 0 | 1;
const W = Number(q.get('w') ?? 960);
const H = Number(q.get('h') ?? 540);
const FRAME = 1 / 60;

if (q.get('reduced') === '1') {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = ((s: string) => (s.includes('reduce') ? ({ matches: true, media: s, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : mm(s))) as typeof window.matchMedia;
}

const app = document.getElementById('app') as HTMLElement;
app.style.width = `${W}px`;
app.style.height = `${H}px`;
const ui = document.createElement('div');
ui.style.cssText = 'position:absolute;inset:0;pointer-events:none';
app.appendChild(ui);
const gr = createRenderer(app, tier);
gr.resize();
const view = new GameView(gr, ui);
const TRICKS: TrickId[] = ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'];
// the viewer on the other side: these are the enemy's towers (no "Our tower is burning!" rail note over the shots)
view.setTeam(0, (1 - team) as 0 | 1, TRICKS);
view.juice.shakeScale = 0;

/** Per band: HP fraction and kind. */
const BANDS = [
  { hp: 1, kind: 'tower' },
  { hp: 0.6, kind: 'tower' },
  { hp: 0.28, kind: 'tower' },
  { hp: 0.1, kind: 'tower' },
  { hp: 0, kind: 'tower' },
  { hp: 0.25, kind: 'core' },
] as const;
const ROW = Object.freeze({ x: 24000, y: 30000, gap: 10000 });
const MAX_HP = 2000;

const ents: ViewEntity[] = BANDS.map((b, i) => {
  const x = ROW.x + i * ROW.gap;
  const e: EntitySnap = {
    id: 40 + i,
    kind: b.kind,
    team,
    slot: i,
    variant: b.kind === 'tower' ? 'outer' : undefined,
    lane: 'sunny',
    x,
    y: ROW.y,
    hp: Math.max(1, Math.round(b.hp * MAX_HP)),
    maxHp: b.kind === 'core' ? 3000 : MAX_HP,
    shield: 0,
    state: 'idle',
    facing: 0,
    buffs: 0,
  };
  if (b.kind === 'core') e.hp = Math.round(b.hp * e.maxHp);
  return { ...e, fx: x, fy: ROW.y, yaw: 0, speed: 0 };
});
const latest = {
  team: 0,
  clock: { tick: 0, seconds: 0, phase: 'play', nextPhaseIn: 0 },
  score: { kills: [0, 0], towers: [0, 0] },
  entities: [],
  projectiles: [],
  zones: [],
  events: [],
} as unknown as Snapshot;
const frame: ViewFrame = { tick: 0, latest, entities: [], byId: new Map(), projectiles: [], zones: [] };

let band: number | 'all' = q.get('band') === 'all' ? 'all' : Math.max(0, Math.min(BANDS.length - 1, Number(q.get('band') ?? 2) | 0));
let frames = 0;
let updMs = 0;
let maxMs = 0;

/** Close 3/4 framing on one band, or the whole row. */
gr.place = (cam) => {
  if (band === 'all') {
    const cx = toX(ROW.x + ((BANDS.length - 1) * ROW.gap) / 2);
    const cz = toZ(ROW.y);
    cam.position.set(cx, 26, cz + 40);
    cam.lookAt(cx, 2, cz);
    return;
  }
  const x = toX(ROW.x + band * ROW.gap);
  const z = toZ(ROW.y);
  const core = BANDS[band].kind === 'core';
  cam.position.set(x + 1.2, core ? 9 : 10, z + (core ? 15 : 14));
  cam.lookAt(x, core ? 2 : 3.6, z);
};

function step(): void {
  frame.tick += 0.5;
  frame.entities.length = 0;
  frame.byId.clear();
  for (let i = 0; i < ents.length; i++) {
    // band 4 is destroyed: in the first frames, then gone (its fall, then the smouldering rubble)
    if (BANDS[i].hp === 0 && frames > 3) continue;
    frame.entities.push(ents[i]);
    frame.byId.set(ents[i].id, ents[i]);
  }
  const t0 = performance.now();
  view.update(frame, FRAME);
  const ms = performance.now() - t0;
  frames++;
  if (frames > 10) {
    updMs += ms;
    maxMs = Math.max(maxMs, ms);
  }
}

const api = {
  ready: Promise.resolve(true),
  /** The GameView (dev tools: particle pools, structures). */
  view,
  set(b: number | 'all'): void {
    band = b;
  },
  advance(seconds: number): void {
    const n = Math.round(seconds / FRAME);
    for (let i = 0; i < n; i++) step();
  },
  stats() {
    const n = Math.max(1, frames - 10);
    return { frames, avgMs: updMs / n, maxMs, particles: view.particles.live, fire: { ...view.towerFire.count }, stages: ents.map((e) => view.structures.stageOf(e.id)), tier: gr.settings.tier, vfxTier: gr.settings.vfxTier };
  },
  /** Reset the timing (after a warm-up). */
  resetStats(): void {
    updMs = 0;
    maxMs = 0;
    frames = 11;
  },
};
(window as unknown as { __towerlab: typeof api }).__towerlab = api;

const bar = document.getElementById('bar') as HTMLElement;
const out = document.getElementById('stats') as HTMLElement;
for (const b of ['all', 0, 1, 2, 3, 4, 5] as const) {
  const el = document.createElement('button');
  el.textContent = b === 'all' ? 'all' : ['clean', 'cracked', 'burning', 'blazing', 'destroyed', 'core'][b];
  el.onclick = () => api.set(b);
  bar.appendChild(el);
}
if (!capture) {
  const loop = (): void => {
    step();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setInterval(() => {
    const s = api.stats();
    out.textContent = `frames ${s.frames} · update avg ${s.avgMs.toFixed(2)} ms · max ${s.maxMs.toFixed(1)} ms · particles ${s.particles} · stages ${s.stages.join(',')} · ${s.tier}/${s.vfxTier}`;
  }, 500);
} else step();
