// HUD view (META-UI lane). Reads G / hud / P every frame and draws the DOM built in index.html, like the reference:
// pause, hearts, 7 bell slots "n/7", a progress bar with checkpoint ticks + kitten knob + home icon, a big score with
// xN, the PUFF meter with its key, contextual key prompts, comic callouts, score popups at pickups, the kitten
// portrait reactions, hit / wet vignettes and the touch ability button.
import * as THREE from 'three';
import { camera, isTouch } from '../core/engine';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { press } from '../core/input';
import { addFrameHook } from '../core/loop';
import { P } from '../core/player';
import { G, game } from '../core/state';
import { BELLS, MAX_HEARTS, type Action } from '../core/types';
import { fmtDist, fmtInt } from './format';
import { drawPortrait, type Mood } from './portrait';
import { CalloutQueue, CALLOUT_MS } from './calloutq';

const $ = (id: string) => document.getElementById(id)!;

const KEY: Record<Action, [string, string]> = {
  jump: ['SPACE', 'SWIPE UP'],
  slide: ['S', 'SWIPE DOWN'],
  ability: ['E', 'TAP'],
  pause: ['ESC', 'PAUSE'],
};
const GESTURE: Record<Action, string> = {
  jump: '<svg class="g" viewBox="0 0 26 26"><path d="M13 22 V6 M6 12 L13 5 L20 12" fill="none" stroke="#fff7ea" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  slide: '<svg class="g" viewBox="0 0 26 26"><path d="M13 4 V20 M6 14 L13 21 L20 14" fill="none" stroke="#fff7ea" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ability: '<svg class="g" viewBox="0 0 26 26"><circle cx="13" cy="13" r="8" fill="#fff7ea" stroke="#2a1c14" stroke-width="2.5"/><circle cx="13" cy="13" r="3" fill="#2a1c14"/></svg>',
  pause: '',
};

export const HEART_SVG =
  '<svg class="heart" viewBox="0 0 32 30"><path class="f" d="M16 28 C4 19 1 13 2.5 8 C4 3 10 1 13 4 L16 7 L19 4 C22 1 28 3 29.5 8 C31 13 28 19 16 28Z" stroke="#2a1c14" stroke-width="2.8" stroke-linejoin="round"/><ellipse class="hl" cx="9" cy="9" rx="3.2" ry="2.2" transform="rotate(-30 9 9)"/></svg>';
export const BELL_SVG =
  '<svg class="bell" viewBox="0 0 26 26"><circle class="slot" cx="13" cy="13" r="11"/><path class="b" d="M13 5.5 C9.5 5.5 8 8 8 11 V14.5 L6.5 17 H19.5 L18 14.5 V11 C18 8 16.5 5.5 13 5.5Z M11 18.5 A2 2 0 0 0 15 18.5Z" stroke="#2a1c14" stroke-width="1.3" stroke-linejoin="round"/></svg>';

// ---- score popups (pooled, positioned at the pickup in screen space) ----
const POOL = 16;
interface Pop {
  el: HTMLDivElement;
  t: number;
  x: number;
  y: number;
  live: boolean;
}
const pops: Pop[] = [];
let popNext = 0;
const v3 = new THREE.Vector3();

function spawnPop(text: string, cls: string, wx: number, wy: number, wz: number, side = 0): Pop | null {
  v3.set(wx, wy + 0.9, wz).project(camera);
  if (v3.z > 1 || v3.z < -1) return null;
  const p = pops[popNext];
  popNext = (popNext + 1) % POOL;
  // side: drift beside the kitten (not over her)
  p.x = ((v3.x + 1) / 2) * innerWidth + side * Math.min(110, innerWidth * 0.12);
  p.y = ((1 - v3.y) / 2) * innerHeight - (side ? 20 : 0);
  p.t = 0;
  p.live = true;
  p.el.className = `pp ${cls}`;
  p.el.textContent = text;
  return p;
}
/** consecutive fish within 0.5 s merge into one counting popup */
const fishCombo = { pop: null as Pop | null, total: 0, n: 0, at: -1e9, side: 1 };

let endlessBest = 0;
let bestLabel = 'BEST';
/** meta-ui flow passes the saved endless best (for the distance pill); the Daily Run passes today's best */
export function setEndlessBest(d: number, label = 'BEST'): void {
  endlessBest = d;
  bestLabel = label;
}

export function initHud(): void {
  const hearts = $('hearts');
  hearts.innerHTML = HEART_SVG.repeat(MAX_HEARTS);
  const bells = $('bells');
  bells.innerHTML = BELL_SVG.repeat(BELLS) + '<span id="bellCount">0/7</span>';
  const heartEls = [...hearts.children] as SVGElement[];
  const bellEls = [...bells.querySelectorAll('.bell')] as SVGElement[];
  const score = $('score');
  const mult = $('mult');
  const fill = $('progFill');
  const knob = $('progKnob');
  const ticks = $('progTicks');
  const meter = $('meter');
  const meterFill = $('meterFill');
  const meterLabel = $('meterLabel');
  const promptEl = $('prompt');
  const bellCount = $('bellCount');
  const vignette = $('vignette');
  const flash = $('flash');
  const distVal = $('distVal');
  const distBest = $('distBest');
  const portraitEl = $('portrait');
  const callouts = $('callouts');
  const abilityBtn = $('abilityBtn');
  const body = document.body;
  if (isTouch) meter.querySelector('kbd')?.remove();

  const popLayer = $('popups');
  for (let i = 0; i < POOL; i++) {
    const el = document.createElement('div');
    el.className = 'pp';
    popLayer.appendChild(el);
    pops.push({ el, t: 0, x: 0, y: 0, live: false });
  }

  // portrait canvas (redrawn only while it is showing)
  const pc = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  pc.width = pc.height = Math.round(92 * dpr);
  portraitEl.appendChild(pc);
  const pctx = pc.getContext('2d');
  let mood: Mood = 'happy';
  let moodT = 99;

  let lastTicks = '';
  let lastCp = -1;
  let lastScore = -1;
  let lastMult = -1;
  let lastPrompt = '';
  let lastHearts = MAX_HEARTS;
  let lastMeterPct = -1;
  let lastProg = '';
  let lastDist = -1;
  const restart = (el: Element, cls: string) => {
    el.classList.remove(cls);
    void (el as HTMLElement).getBoundingClientRect();
    el.classList.add(cls);
  };

  const cq = new CalloutQueue();
  let chaseOn = false;
  events.on('chase', (e) => (chaseOn = e.on));
  events.on('callout', ({ text, tone }) => {
    // one on screen at a time, by priority (calloutq.ts)
    if (!cq.offer(text, performance.now(), chaseOn)) return;
    while (callouts.firstElementChild) callouts.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `callout ${tone}`;
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
    callouts.appendChild(el);
    setTimeout(() => el.remove(), CALLOUT_MS);
  });
  events.on('react', (e) => {
    mood = e.mood;
    moodT = 0;
    restart(portraitEl, 'show');
  });
  events.on('pickup', (e) => {
    if (e.points <= 0 && e.kind !== 'yarn') return;
    const now = performance.now();
    if (e.kind === 'fish') {
      const c = fishCombo;
      if (c.pop && c.pop.live && now - c.at < 500) {
        c.total += e.points;
        c.n++;
        c.at = now;
        c.pop.el.textContent = `+${fmtInt(c.total)} x${c.n}`;
        c.pop.t = Math.min(c.pop.t, 0.2); // keep it up while the line goes on
        return;
      }
      c.side = P.x > 0.5 ? -1 : 1; // the open side of the screen
      c.pop = spawnPop(`+${fmtInt(e.points)}`, 'fish', P.world.pos.x, P.world.pos.y + 0.4, P.world.pos.z, c.side);
      c.total = e.points;
      c.n = 1;
      c.at = now;
      return;
    }
    const label = e.points > 0 ? `+${fmtInt(e.points)}` : '+PUFF';
    spawnPop(label, e.kind, e.x, e.y, e.z, e.kind === 'bell' ? 0 : -fishCombo.side);
  });
  events.on('nearMiss', (e) => spawnPop(`+${fmtInt(e.points)}`, 'near', P.world.pos.x, P.world.pos.y + 0.6, P.world.pos.z, -1));
  events.on('bell', (e) => {
    const el = bellEls[e.index];
    if (el) restart(el, 'got');
  });
  events.on('mult', () => restart(mult, 'bump'));
  events.on('hit', () => {
    vignette.classList.remove('wet');
    restart(vignette, 'hit');
  });
  events.on('wet', () => {
    vignette.classList.remove('hit');
    restart(vignette, 'wet');
  });
  events.on('respawn', () => restart(flash, 'on'));
  // giant yarn incoming: flash the rear-view arrow on its lane for the warning time
  const incoming = $('incoming');
  let incT = 0;
  events.on('setPiece', (e) => {
    if (e.id !== 'yarn' || !e.phase.startsWith('incoming')) return;
    // lane +1 = the runner's right = the right of the screen
    incoming.classList.toggle('r', e.phase === 'incoming-right');
    incoming.classList.toggle('l', e.phase === 'incoming-left');
    incoming.classList.add('on');
    clearTimeout(incT);
    incT = window.setTimeout(() => incoming.classList.remove('on'), 1250);
  });
  events.on('lifeLost', (e) => e.penalty > 0 && spawnPop(`-${fmtInt(e.penalty)}`, 'bad', P.world.pos.x, P.world.pos.y + 1.2, P.world.pos.z));
  events.on('checkpoint', ({ index }) => {
    const t = ticks.children[index - 1];
    if (t) restart(t, 'flash');
  });
  const syncMode = () => {
    body.classList.toggle('endless', G.endless);
    // stages without bells (a player trail) hide the 0/7 bell row
    body.classList.toggle('nobells', !G.endless && !game.stage?.bells);
    lastTicks = '';
    lastCp = -1;
    lastHearts = -1; // force a redraw: a new run starts with full hearts after a run that lost some
    cq.reset();
    chaseOn = false;
  };
  events.on('stageLoad', syncMode);
  events.on('stageStart', syncMode);
  abilityBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press('ability');
  });

  addFrameHook((dt, t) => {
    // popups animate even on the results card fade-out
    for (let i = 0; i < POOL; i++) {
      const p = pops[i];
      if (!p.live) continue;
      p.t += dt;
      const k = p.t / 0.95;
      if (k >= 1) {
        p.live = false;
        p.el.style.opacity = '0';
        continue;
      }
      const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.6);
      p.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
      p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - k * 70).toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
    }
    if (game.mode === 'title') return;

    // portrait animation
    if (moodT < 1.7 && pctx) {
      moodT += dt;
      drawPortrait(pctx, pc.width, pc.height, mood, t);
    }

    // hearts
    if (G.hearts !== lastHearts) {
      for (let i = 0; i < heartEls.length; i++) {
        heartEls[i].classList.toggle('off', i >= G.hearts);
        if (i === G.hearts && G.hearts < lastHearts) restart(heartEls[i], 'lost');
      }
      body.classList.toggle('lastlife', G.hearts === 1);
      lastHearts = G.hearts;
    }
    // bells
    let n = 0;
    for (let i = 0; i < bellEls.length; i++) {
      bellEls[i].classList.toggle('on', G.bells[i]);
      if (G.bells[i]) n++;
    }
    bellCount.textContent = `${n}/${BELLS}`;
    // score + multiplier
    const sc = Math.round(G.score);
    if (sc !== lastScore) {
      if (sc - lastScore >= 45 && lastScore >= 0) restart(score, 'bump');
      score.textContent = fmtInt((lastScore = sc));
    }
    if (G.mult !== lastMult) {
      mult.textContent = `x${(lastMult = G.mult)}`;
      mult.classList.toggle('hot', G.mult >= 10);
    }
    // progress or endless distance
    if (G.endless) {
      const d = Math.round(G.distance);
      if (d !== lastDist) {
        lastDist = d;
        distVal.textContent = fmtDist(d);
        distBest.textContent = endlessBest > 0 ? (d > endlessBest ? 'NEW BEST!' : `${bestLabel} ${fmtDist(endlessBest)}`) : '';
      }
    } else {
      const pct = `${(G.progress * 100).toFixed(2)}%`;
      if (pct !== lastProg) {
        lastProg = pct;
        fill.style.width = pct;
        knob.style.left = pct;
      }
      const tk = hud.ticks.join(',');
      if (tk !== lastTicks) {
        lastTicks = tk;
        lastCp = -1;
        ticks.innerHTML = hud.ticks.map((f) => `<i style="left:${(f * 100).toFixed(2)}%"></i>`).join('');
      }
      if (G.cpIndex !== lastCp) {
        lastCp = G.cpIndex;
        for (let i = 0; i < ticks.children.length; i++) ticks.children[i].classList.toggle('past', i < G.cpIndex);
      }
    }
    // meter
    const mp = Math.round(G.meter * 100);
    if (mp !== lastMeterPct) {
      lastMeterPct = mp;
      meterFill.style.width = `${mp}%`;
      meter.classList.toggle('full', mp >= 99);
    }
    if (meterLabel.textContent !== hud.meterLabel) meterLabel.textContent = hud.meterLabel;
    // contextual prompt
    const pr = hud.prompt && game.mode === 'play' ? `${hud.prompt.action}|${hud.prompt.text}` : '';
    if (pr !== lastPrompt) {
      lastPrompt = pr;
      promptEl.classList.toggle('hidden', !pr);
      const ab = !!hud.prompt && hud.prompt.action === 'ability' && !!pr;
      body.classList.toggle('can-ability', ab);
      if (pr && hud.prompt) {
        const a = hud.prompt.action;
        const k = KEY[a][isTouch ? 1 : 0];
        promptEl.innerHTML = `${isTouch ? GESTURE[a] : ''}<kbd>${k}</kbd><span>- ${escapeHtml(hud.prompt.text)}</span>`;
        promptEl.classList.toggle('ability', a === 'ability');
        restart(promptEl, 'in');
        $('abilityTxt').textContent = hud.prompt.text.replace(/!$/, '').split(' ').slice(-1)[0] || 'TAP';
      }
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
