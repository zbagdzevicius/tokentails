// In-play HUD: money pops, banners, flash, bars, edge arrows. FROZEN.
// The DOM ids it uses (dmgv, combo, cbar, zap, timer, pat, ult, banner, flash, pops, wet, tbUltra, wantedArrow,
// fishArrow) live in index.html (owned by meta-ui) and must be kept. Extra HUD widgets go in src/ui/.
import * as THREE from 'three';
import { fishTrucks } from '../world/fish';
import { camera } from './engine';
import { money } from './scoring';
import { C, COMBO_T, G, game, P, W } from './state';
import { city } from './world';

const $ = (id: string) => document.getElementById(id)!;
const dmgEl = $('dmgv');
const comboEl = $('combo');
// combo text = a text node + a <b> for the multiplier (no innerHTML per frame)
const comboTxt = document.createTextNode('');
const comboB = document.createElement('b');
comboEl.replaceChildren(comboTxt, comboB);
const timerEl = $('timer');
const patBar = $('pat').firstElementChild as HTMLElement;
const ultBar = $('ult').firstElementChild as HTMLElement;
const ultWrap = $('ult');
const banner = $('banner');
const flashEl = $('flash');
const pops = $('pops');
const tbUltra = $('tbUltra');
const comboBar = $('cbar').firstElementChild as HTMLElement;
const comboWrap = $('cbar');
const zapEl = $('zap');
const wetEl = $('wet');
const patWrap = $('pat');
const wantedArrow = $('wantedArrow');
const fishArrow = $('fishArrow');

export { money };

interface Pop {
  el: HTMLDivElement;
  p: THREE.Vector3;
  age: number;
  ox: number;
  oy: number;
  key: string;
  val: number;
  w: number; // half width in px (0 = not measured yet)
}
const popList: Pop[] = [];
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

/** Floating text at a world position. Returns the pop so callers can add a class. */
export function pop(text: string, p: THREE.Vector3, color = '#fff6e6', size = 22, key = '', val = 0): { el: HTMLDivElement } {
  const el = document.createElement('div');
  el.className = 'pop txt';
  el.textContent = text;
  el.style.color = color;
  el.style.fontSize = `${innerWidth < 600 ? Math.min(size, 30) : size}px`;
  pops.appendChild(el);
  const pp = { el, p: p.clone(), age: 0, ox: (Math.random() - 0.5) * 120, oy: (Math.random() - 0.5) * 50, key, val, w: 0 };
  popList.push(pp);
  if (popList.length > 8) popList.shift()!.el.remove();
  return pp;
}

/** Money pop: hits with the same label inside 0.35 s merge into one growing number. */
export function popMoney(label: string, v: number, at: THREE.Vector3): void {
  const big = v > 8;
  const key = `m:${label}`;
  const same = popList.find((q) => q.key === key && q.age < 0.35);
  if (same) {
    same.val += v;
    same.el.textContent = `${label}+${money(same.val)}`;
    same.el.style.fontSize = `${Math.min(innerWidth < 600 ? 30 : 46, 18 + same.val * 1.2)}px`;
    same.w = 0;
    if (same.val > 8) same.el.style.color = '#ffd24a';
    return;
  }
  pop(`${label}+${money(v)}`, at, big ? '#ffd24a' : '#fff6e6', Math.min(44, 18 + v * 1.2), key, v);
}

let bannerLock = 0; // performance.now() until which only banners of >= bannerPrio may replace the current one
let bannerPrio = 0;
/**
 * Big centre banner. prio 2 = boss moments (spawn, phase, kill): routine banners (prio 0) cannot cover them for 2 s.
 * While a boss bar is up, the banner sits below it (CSS: body.bossup).
 */
export function showBanner(text: string, color = '#ffd24a', prio = 0): void {
  const now = performance.now();
  if (now < bannerLock && prio < bannerPrio) return;
  bannerPrio = prio;
  bannerLock = prio > 0 ? now + 2000 : 0;
  banner.textContent = text;
  banner.style.color = color;
  banner.animate(
    [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(2.2) rotate(-8deg)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(-3deg)', offset: 0.15 },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.05) rotate(-3deg)', offset: 0.75 },
      { opacity: 0, transform: 'translate(-50%,-60%) scale(0.9) rotate(-3deg)' },
    ],
    { duration: 1400, easing: 'ease-out' },
  );
}

export function flash(o = 0.6): void {
  flashEl.animate([{ opacity: o }, { opacity: 0 }], { duration: 260 });
}

export function clearPops(): void {
  resetHudCache();
  for (const p of popList) p.el.remove();
  popList.length = 0;
}

/** Hide transient HUD bits when a level ends. */
export function hudLevelEnd(): void {
  timerEl.textContent = '0';
  comboWrap.style.opacity = '0';
  wantedArrow.style.display = 'none';
  fishArrow.style.display = 'none';
}

let wetLevel = 0;
export function updateHud(dt: number): void {
  for (let i = popList.length - 1; i >= 0; i--) {
    const p = popList[i];
    p.age += dt;
    v1.copy(p.p);
    v1.y += p.age * 20;
    v1.project(camera);
    if (p.w === 0) {
      // measured once per text change; a pop wider than a phone screen shrinks to fit instead of running off both edges
      let w = p.el.offsetWidth;
      const max = innerWidth - 24;
      if (w > max) {
        p.el.style.fontSize = `${Math.floor((parseFloat(p.el.style.fontSize) * max) / w)}px`;
        w = max;
      }
      p.w = w * 0.5 + 8;
    }
    const hw = Math.min(innerWidth * 0.5, p.w);
    const x = Math.max(hw, Math.min(innerWidth - hw, (v1.x * 0.5 + 0.5) * innerWidth + p.ox));
    // keep pops off the HUD block at the top (damage, timer, bars, objectives)
    const y = Math.max(innerWidth < 600 ? 330 : 170, Math.min(innerHeight - 40, (-v1.y * 0.5 + 0.5) * innerHeight + p.oy));
    p.el.style.transform = `translate(-50%,-50%) translate(${x}px, ${y}px) scale(${1 + Math.max(0, 0.3 - p.age) * 2})`;
    p.el.style.opacity = String(p.age < 0.7 ? 1 : Math.max(0, 1 - (p.age - 0.7) / 0.5));
    if (p.age > 1.2 || v1.z > 1) {
      p.el.remove();
      popList.splice(i, 1);
    }
  }
  wetLevel += ((C.wet ? 1 : 0) - wetLevel) * Math.min(1, dt * 6);
  wetEl.style.opacity = String(wetLevel);
  if (game.mode !== 'play') {
    if (game.mode !== 'paused') {
      wantedArrow.style.display = fishArrow.style.display = 'none';
      zapEl.style.opacity = '0';
    }
    return;
  }
  // DOM writes only when the shown value changes (no per-frame strings or style invalidation)
  if (G.damage !== last.dmg) {
    last.dmg = G.damage;
    const m = money(G.damage);
    if (m !== last.dmgS) dmgEl.textContent = last.dmgS = m;
  }
  const mlt = (1 + Math.min(4, Math.floor(G.combo / 8))) * (G.frenzy ? 2 : 1);
  if (G.combo !== last.combo || mlt !== last.mlt) {
    last.combo = G.combo;
    last.mlt = mlt;
    comboTxt.data = G.combo > 1 ? `${G.combo} HITS ` : '';
    comboB.textContent = G.combo > 1 && mlt > 1 ? `×${mlt}` : '';
    comboWrap.style.opacity = G.combo > 1 ? '1' : '0';
  }
  const big = G.comboT > COMBO_T - 0.15;
  if (big !== last.big) {
    last.big = big;
    comboEl.style.transform = big ? 'scale(1.15)' : 'scale(1)';
  }
  if (G.combo > 1 || last.cbar !== 0) {
    const cb = Math.round((Math.max(0, G.comboT) / COMBO_T) * 100) / 100;
    if (cb !== last.cbar) {
      last.cbar = cb;
      comboBar.style.transform = `scaleX(${cb})`;
    }
  }
  if (G.zap !== last.zap) {
    if ((G.zap > 0) !== (last.zap > 0)) zapEl.style.opacity = G.zap > 0 ? '1' : '0';
    last.zap = G.zap;
    if (G.zap > 0) zapEl.textContent = `${game.ability?.tallyLabel ?? 'ZAP'} +${money(G.zap)}`;
  }
  const sec = Math.max(0, Math.ceil(G.time));
  if (sec !== last.sec) {
    last.sec = sec;
    timerEl.textContent = String(sec);
    timerEl.classList.toggle('hurry', G.time < game.level.frenzyAt);
  }
  const pf = Math.round((Math.max(0, G.patience) / P.patienceMax) * 200) / 200;
  if (pf !== last.pat) {
    last.pat = pf;
    patBar.style.transform = `scaleX(${pf})`;
    patWrap.classList.toggle('low', pf < 0.3);
  }
  // screen-edge arrows: the WANTED landmark, and the nearest fish truck when thirsty for patience
  edgeArrow(wantedArrow, W.bi >= 0 ? v1.set(city.buildings[W.bi].x, city.standing(city.buildings[W.bi]) + 10, city.buildings[W.bi].z) : null, true);
  let fish: THREE.Vector3 | null = null;
  if (G.patience < P.patienceMax * 0.75) {
    let bd = 1e9;
    for (const f of fishTrucks) {
      const d = f.g.visible ? f.g.position.distanceTo(C.pos) : 1e9;
      if (d < bd) {
        bd = d;
        fish = v2.copy(f.g.position).setY(60);
      }
    }
  }
  edgeArrow(fishArrow, fish, false);
  const thirsty = !!fish && G.patience < P.patienceMax * 0.4;
  if (thirsty !== last.thirsty) {
    last.thirsty = thirsty;
    fishArrow.classList.toggle('pulse', thirsty);
  }
  const uf = Math.round((G.ultraT > 0 ? G.ultraT / P.ultraTime : G.ultra / 100) * 200) / 200;
  if (uf !== last.ult) {
    last.ult = uf;
    ultBar.style.transform = `scaleX(${uf})`;
  }
  const full = G.ultra >= 100;
  if (full !== last.full) {
    last.full = full;
    ultWrap.classList.toggle('full', full);
    tbUltra.classList.toggle('ready', full);
  }
}

/** Last values written to the DOM (reset on level start so the first frame always writes). */
const last = { dmg: -1, dmgS: '', combo: -1, mlt: -1, big: false, cbar: -1, zap: -1, sec: -1, pat: -1, ult: -1, full: false, thirsty: false };
export function resetHudCache(): void {
  last.dmg = last.combo = last.mlt = last.cbar = last.zap = last.sec = last.pat = last.ult = -1;
  last.dmgS = '';
  last.big = last.full = false;
  ultWrap.classList.remove('full');
  tbUltra.classList.remove('ready');
}

const arrowV = new THREE.Vector3();
/** Point an arrow at a world position: a tag over it when on screen (if `tag`), else clamped to the screen edge. */
export function edgeArrow(el: HTMLElement, p: THREE.Vector3 | null, tag: boolean): void {
  if (!p) {
    el.style.display = 'none';
    return;
  }
  arrowV.copy(p).project(camera);
  let x = arrowV.x;
  let y = arrowV.y;
  const behind = arrowV.z > 1;
  if (behind) {
    x = -x;
    y = -y;
  }
  const on = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85;
  if (on && !tag) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  let ang = Math.PI; // pointing down at the target
  if (!on) {
    ang = Math.atan2(-y, x) + Math.PI / 2;
    const k = 0.86 / Math.max(Math.abs(x), Math.abs(y) / 0.9, 1e-3);
    x *= k;
    y *= k;
    if (behind && Math.abs(y) < 0.3) y = -0.86;
  }
  const W = innerWidth;
  const H = innerHeight;
  const sx = Math.max(44, Math.min(W - 44, (x * 0.5 + 0.5) * W));
  let sy = (-y * 0.5 + 0.5) * H;
  if (!on) {
    // safe rect: below the top HUD (damage, objectives, boss bar), above the key hint / touch buttons
    const phone = W < 600;
    const top = phone ? 340 : 230;
    const touch = document.body.classList.contains('touch');
    sy = Math.max(top, Math.min(H - (touch ? 70 : 90), sy));
    if (touch && sx > W - 250 && sy > H - 280) sy = H - 280; // the SWAT / POUNCE / ULTRA cluster
    if (touch && sx < W * 0.3 && sy > H - 120) sy = H - 120;
  }
  el.style.transform = `translate(${sx}px, ${sy}px)`;
  (el.firstElementChild as HTMLElement).style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
  // the label stays inside the screen: hug the arrow from the inside near the left / right edge
  const side = sx < 110 ? 'l' : sx > W - 110 ? 'r' : 'c';
  if (el.dataset.side !== side) {
    el.dataset.side = side;
    (el.lastElementChild as HTMLElement).style.transform = side === 'l' ? 'translate(-24px, -64px)' : side === 'r' ? 'translate(calc(-100% + 24px), -64px)' : '';
  }
}
