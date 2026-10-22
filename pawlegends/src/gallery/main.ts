/**
 * DEV ONLY: the animation gallery (ANIM-SPEC §11, "animlab"). `npm run dev` → /gallery.html?hero=clem
 * Never part of `build` / `build:client` (vite builds index.html only).
 *
 * One hero next to a training dummy on the real map, in the real GameView (renderer, rig, director, FX kit,
 * telegraphs, effects, juice). A synthetic sim stream (scenarios.ts) goes through a real SnapBuffer, so every clip
 * binds through the same director code as a match. A fixed 60 Hz step clock; a sim-tick ruler under the viewport
 * shows the anchor ticks, the clip's markers as they fire and a red flash on the frame a sim event fires.
 *
 * Query: hero, vs (dummy hero), set=hero|demo (hero, the default: the hero's own file; demo: the template demo set),
 * tier=low|med|high, reduced=1, cam=close|game, scenario=<name>, capture=1 (no UI, no rAF; driven by __animlab),
 * w, h (viewport px), branch=1 (the level-6 branch flag on the hero), buffs=<BuffFlag bits on the dummy>,
 * shield=<dummy shield hp>. Scenarios: the sim-driven moves, then `clip:<id>` for every shared clip and every clip in
 * the hero's own move set (idle, fidgets, victory, emote, level-up, branch, recasts, holds, ends, extras).
 * window.__animlab: { ready, scenarios(), start(name), step(n), done(), stats(), tick() } for tools/anim/capture.mjs.
 */
import { HERO_IDS } from '../data/heroes';
import type { HeroId } from '../data/heroes/types';
import type { SimEvent, TrickId } from '../sim/api';
import { createRenderer } from '../render/renderer';
import { GameView } from '../render/gameView';
import { SnapBuffer } from '../render/interp';
import { movesFor, setHeroAnim } from '../render/anim/registry';
import { COMMON } from '../render/anim/common';
import { newAnchors, type ClipDef, type MoveSet } from '../render/anim/types';
import type { QualityTier } from '../render/quality';
import { toX, toZ } from '../render/coords';
import { demoMoves } from './demo';
import { DUMMY_BUFFS, makeScenario, scenarioNames, T0, type Scenario } from './scenarios';

const q = new URLSearchParams(location.search);
const hero = (HERO_IDS.includes(q.get('hero') as HeroId) ? q.get('hero') : 'clem') as HeroId;
const vs = (HERO_IDS.includes(q.get('vs') as HeroId) ? q.get('vs') : 'brutus') as HeroId;
const tier = (['low', 'med', 'high'].includes(q.get('tier') ?? '') ? q.get('tier') : 'high') as QualityTier;
const capture = q.get('capture') === '1';
const set = q.get('set') === 'demo' ? 'demo' : 'hero';
DUMMY_BUFFS.branch = q.get('branch') === '1';
DUMMY_BUFFS.bits = Number(q.get('buffs') ?? 0) | 0;
DUMMY_BUFFS.shield = Number(q.get('shield') ?? 0) | 0;
const camMode = q.get('cam') === 'game' ? 'game' : 'close';
const W = Number(q.get('w') ?? 960);
const H = Number(q.get('h') ?? 540);
const RULER = 70;
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
const TRICKS: TrickId[] = ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'];
view.setTeam(0, 0, TRICKS);
view.juice.shakeScale = q.get('shake') === '0' ? 0 : 1;
const buffer = new SnapBuffer();
view.peek = (h, out) => buffer.peekEvents(h, out);

// the ruler under the viewport
const ruler = document.createElement('canvas');
ruler.width = W;
ruler.height = RULER;
ruler.style.cssText = `position:absolute;left:0;top:${H}px;width:${W}px;height:${RULER}px;background:#1d1420`;
app.parentElement?.appendChild(ruler);
if (app.parentElement) app.parentElement.style.cssText = `position:relative;width:${W}px;height:${H + RULER}px`;
const rc = ruler.getContext('2d') as CanvasRenderingContext2D;

let sc: Scenario | null = null;
let frameNo = 0;
let pushed = -1;
let firedAt = -99;
const firedTicks: number[] = [];
const markerLog: { tick: number; name: string }[] = [];
const events: SimEvent[] = [];
const stats = { scenario: '', clip: '', contactTick: NaN, eventTick: NaN, deltaFrames: NaN as number | null, maxUp: 0, maxFwd: 0, legacy: false };
let lastClipT = -1;
let lastClipId = '';

function rig() {
  return view.heroes.rigOf(0);
}

/** Close 3/4 camera on the hero (the game iso follows with cam=game). */
gr.place =
  camMode === 'close'
    ? (cam) => {
        const r = rig();
        const x = r ? r.pos.x : toX(36000);
        const z = r ? r.pos.z : toZ(30000);
        cam.position.set(x + 0.9, 6.4, z + 12.5);
        cam.lookAt(x + 0.9, 1.3, z);
      }
    : null;

function start(name: string): void {
  const clip = name.startsWith('clip:') ? name.slice(5) : '';
  sc = makeScenario(clip ? 'idle' : name, hero, vs);
  buffer.reset();
  view.director.reset();
  frameNo = 0;
  pushed = -1;
  firedTicks.length = 0;
  firedAt = -99;
  markerLog.length = 0;
  lastClipT = -1;
  lastClipId = '';
  stats.scenario = name;
  stats.clip = '';
  stats.contactTick = sc.key;
  stats.eventTick = NaN;
  stats.deltaFrames = null;
  stats.maxUp = 0;
  stats.maxFwd = 0;
  stats.legacy = false;
  pendingClip = clip;
}
let pendingClip = '';

function stepOne(): void {
  if (!sc) return;
  const target = Math.floor(frameNo / 2) + 2;
  while (pushed < target) {
    pushed++;
    const s = sc.at(pushed);
    buffer.push(s);
    buffer.pushEvents(s.events);
  }
  const scale = view.juice.timeScale(FRAME);
  const frame = buffer.advance(FRAME, scale);
  events.length = 0;
  for (const ev of buffer.takeEvents(events)) {
    view.effects.handle(ev);
    firedAt = frameNo;
    firedTicks.push(ev.tick);
    if (ev.tick === sc.key && stats.eventTick !== stats.eventTick) stats.eventTick = ev.tick;
  }
  const r = rig();
  if (pendingClip && frame && frame.tick >= T0 && r) {
    const c = (Object.values(COMMON) as ClipDef[]).find((x) => x.id === pendingClip) ?? heroClips().find((x) => x.id === pendingClip);
    if (c) {
      const a = newAnchors();
      // a clip bound to the sim plays with its anchors on "now" (the cast / contact on this frame)
      a.fill(frame.tick / 30);
      r.ch.anim.stack.play(c, { anchors: a });
    }
    pendingClip = '';
  }
  view.update(frame, FRAME);
  // stats: the contact marker vs the sim anchor, root extremes
  if (r && frame) {
    const st = r.ch.anim.stack;
    const pl = st.current();
    const m = r.ch.mover;
    const feet = m.position.y + r.ch.inner.position.y * m.scale.y;
    stats.maxUp = Math.max(stats.maxUp, feet);
    stats.maxFwd = Math.max(stats.maxFwd, Math.abs(m.position.x), Math.abs(m.position.z));
    if (pl?.bin) {
      const b = pl.bin;
      if (b.id !== lastClipId) {
        lastClipId = b.id;
        lastClipT = -1;
        // the move under test, not the idle loop that runs while the hero waits for it
        if (!stats.clip && b.prio > 1) stats.clip = b.id;
      }
      for (let i = 0; i < b.markerNames.length; i++) {
        const mt = b.markerTimes[i];
        if (mt > lastClipT && mt <= pl.t) {
          markerLog.push({ tick: frame.tick, name: `${b.markerNames[i]}` });
          if (b.markerNames[i] === 'contact' && stats.deltaFrames === null && b.id === stats.clip) stats.deltaFrames = Math.round((frame.tick - sc.key) * 2);
        }
      }
      lastClipT = pl.t;
    } else if (!stats.clip) stats.legacy = true;
  }
  drawRuler(frame?.tick ?? 0);
  frameNo++;
}

function drawRuler(now: number): void {
  if (!sc) return;
  const x0 = 8;
  const span = Math.max(10, sc.end);
  const X = (t: number): number => x0 + ((W - 16) * t) / span;
  rc.fillStyle = frameNo - firedAt <= 1 ? '#5a1820' : '#1d1420';
  rc.fillRect(0, 0, W, RULER);
  rc.strokeStyle = '#6b5a70';
  rc.fillStyle = '#c9b8d0';
  rc.font = '10px system-ui';
  for (let t = 0; t <= span; t++) {
    const big = t % 10 === 0;
    rc.beginPath();
    rc.moveTo(X(t), RULER - (big ? 14 : 7));
    rc.lineTo(X(t), RULER);
    rc.stroke();
    if (big) rc.fillText(String(t), X(t) + 2, RULER - 4);
  }
  // sim anchors
  for (const [k, t] of Object.entries(sc.anchors)) {
    rc.strokeStyle = k === 'contact' || k === 'cast' ? '#ff4d5e' : '#ffd34d';
    rc.beginPath();
    rc.moveTo(X(t), 0);
    rc.lineTo(X(t), RULER - 16);
    rc.stroke();
    rc.fillStyle = rc.strokeStyle;
    rc.fillText(k, X(t) + 2, 10);
  }
  // events fired (red ticks) and the clip markers as they fired
  rc.fillStyle = '#ff4d5e';
  for (const t of firedTicks) rc.fillRect(X(t) - 1, 14, 3, 8);
  rc.fillStyle = '#9be3c4';
  for (const m of markerLog) {
    rc.fillRect(X(m.tick) - 1, 26, 3, 10);
    rc.fillText(m.name, X(m.tick) + 3, 36);
  }
  rc.strokeStyle = '#ffffff';
  rc.beginPath();
  rc.moveTo(X(now), 0);
  rc.lineTo(X(now), RULER);
  rc.stroke();
  rc.fillStyle = '#ffffff';
  rc.fillText(`${hero} · ${stats.scenario} · ${stats.clip || (stats.legacy ? 'legacy' : '')} · tick ${now.toFixed(1)} · Δcontact ${stats.deltaFrames ?? '–'} fr`, 8, 50);
}

/** Every clip in the hero's own move set (none for a stub), each once. */
function heroClips(): ClipDef[] {
  const m: MoveSet = movesFor(hero);
  if (m.stub) return [];
  const out: ClipDef[] = [];
  const add = (c: ClipDef | undefined | null): void => {
    if (c && !out.includes(c)) out.push(c);
  };
  for (const c of m.basic) add(c);
  for (const sm of Object.values(m.slots)) {
    add(sm.cast);
    for (const c of sm.recasts ?? []) add(c);
    add(sm.branch);
    add(sm.hold);
    add(sm.end);
    add(sm.branchHold);
    add(sm.branchEnd);
    add(sm.onHit);
  }
  add(m.idle);
  for (const [c] of m.fidgets) add(c);
  add(m.victory);
  add(m.emote);
  add(m.death);
  add(m.respawn);
  add(m.levelUp);
  return out;
}

function scenarios(): string[] {
  const own = heroClips().map((c) => `clip:${c.id}`);
  return [...scenarioNames(hero), ...own, ...Object.values(COMMON).map((c) => `clip:${c.id}`).filter((n) => !own.includes(n))];
}

async function boot(): Promise<void> {
  await view.loadAnim([hero, vs]);
  if (set === 'demo') setHeroAnim(hero, demoMoves(hero));
  const first = q.get('scenario') ?? 'basic';
  start(first);
  // settle a frame so the heroes exist
  stepOne();
  const api = {
    ready: true,
    scenarios,
    start: (n: string) => {
      start(n);
      stepOne();
    },
    step: (n = 1) => {
      for (let i = 0; i < n; i++) stepOne();
    },
    done: () => !!sc && buffer.renderTick >= sc.end,
    stats: () => ({ ...stats, deltaFrames: stats.deltaFrames }),
    tick: () => buffer.renderTick,
  };
  (window as unknown as { __animlab: typeof api }).__animlab = api;
  // debug: the hero's playing clip and its warp, per frame
  (window as unknown as { __dbg: () => unknown }).__dbg = () => {
    const pl = rig()?.ch.anim.stack.current();
    const w = pl?.warp;
    return { tick: +buffer.renderTick.toFixed(2), clip: pl?.bin?.id, t: pl ? +pl.t.toFixed(4) : null, rt0: w ? +(w.rt[0] * 30).toFixed(2) : null, n: w?.n, debt: w ? +(w.debt * 30).toFixed(2) : null, freeze: w ? +(w.freezeLeft * 30).toFixed(2) : null, start: w ? +(w.startRt * 30).toFixed(2) : null, rate: w ? +w.preRate.toFixed(3) : null };
  };
  if (capture) return;
  // interactive UI
  const panel = document.createElement('div');
  panel.style.cssText = `position:absolute;left:${W + 12}px;top:8px;width:220px;font:13px system-ui;color:#fff3dc`;
  document.body.appendChild(panel);
  let playing = true;
  let rate = 1;
  const btn = (label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'display:block;width:100%;margin:2px 0;text-align:left';
    b.onclick = fn;
    panel.appendChild(b);
  };
  panel.insertAdjacentHTML('beforeend', `<b>${hero}</b> (${set}) vs ${vs} · ${tier}<br/>`);
  for (const n of scenarios()) btn(n, () => api.start(n));
  btn('⏯ play / pause', () => (playing = !playing));
  btn('→ 1 frame', () => api.step(1));
  btn('→ 1 tick', () => api.step(2));
  btn('rate 1× / 0.25×', () => (rate = rate === 1 ? 0.25 : 1));
  let acc = 0;
  let last = performance.now();
  const loop = (t: number): void => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (playing) {
      acc += dt * rate;
      while (acc >= FRAME) {
        acc -= FRAME;
        stepOne();
        if (api.done()) start(stats.scenario);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();
