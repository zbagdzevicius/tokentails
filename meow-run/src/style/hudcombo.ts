// STYLE lane HUD: the combo meter (right edge under the score), the tier stamp (a big rotated comic word, upper
// centre, separate from core callouts so the callout queue keeps its priorities), trick popups next to the meter and
// the slow-mo vignette. All are .hud children with pointer-events: none. DOM writes happen only when a shown value
// changes (no per-frame layout work).
import './style.css';
import { TIER_NAMES as TIER_LABEL } from './points';
import { hype } from '../ugc/hype';

const TIER_COLORS = ['#fff7ea', '#7ccf5a', '#4cc3ff', '#ffc21a', '#ff8a2a', '#ff4f7b', '#c77dff'];
const POPS = 3;

let root: HTMLElement | null = null;
let nEl: HTMLElement;
let tierEl: HTMLElement;
let barEl: HTMLElement;
let stampEl: HTMLElement;
let stampTxt: HTMLElement;
let stampSub: HTMLElement;
let vigEl: HTMLElement;
const pops: { el: HTMLElement; until: number }[] = [];
let nextPop = 0;

let shownN = -1;
let shownTier = -1;
let shownBar = -1;
let shownHeld = false;
let shownVisible = false;
let brokenUntil = 0;
let shownBroken = false;

function el(tag: string, cls: string, parent: HTMLElement, id?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (id) e.id = id;
  parent.appendChild(e);
  return e;
}

export function initHudCombo(): void {
  if (root) return;
  const hud = document.querySelector('.hud') as HTMLElement | null;
  if (!hud) return;
  root = el('div', 'style-combo', hud, 'style-combo');
  root.setAttribute('aria-hidden', 'true');
  const row = el('div', 'style-c-row', root);
  el('span', 'style-c-lbl', row).textContent = 'COMBO';
  nEl = el('b', 'style-c-n', row);
  tierEl = el('div', 'style-c-tier', root);
  const bar = el('div', 'style-c-bar', root);
  barEl = el('i', '', bar);
  stampEl = el('div', 'style-stamp', hud, 'style-stamp');
  stampEl.setAttribute('aria-hidden', 'true');
  stampTxt = el('span', 'style-s-txt', stampEl);
  stampSub = el('small', 'style-s-sub', stampEl);
  const popBox = el('div', 'style-pops', hud, 'style-pops');
  for (let i = 0; i < POPS; i++) pops.push({ el: el('div', 'style-pop', popBox), until: 0 });
  vigEl = el('div', 'style-vig', hud, 'style-vig');
  // a finished CSS animation leaves the element hidden again (no timers)
  stampEl.addEventListener('animationend', () => stampEl.classList.remove('on'));
  vigEl.addEventListener('animationend', () => vigEl.classList.remove('on'));
  for (const p of pops) p.el.addEventListener('animationend', () => p.el.classList.remove('on'));
}

/** restart a CSS animation on an element */
function replay(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}

/** every frame: chain length, tier, window left (0..1), held (airborne) */
export function updateHudCombo(n: number, tier: number, fraction: number, held: boolean, now: number): void {
  if (!root) return;
  const broken = now < brokenUntil;
  const visible = n >= 2 || broken;
  if (visible !== shownVisible) {
    shownVisible = visible;
    root.classList.toggle('on', visible);
  }
  if (broken !== shownBroken) {
    shownBroken = broken;
    root.classList.toggle('broken', broken);
    if (broken) {
      nEl.textContent = 'X';
      tierEl.textContent = 'COMBO BROKEN';
      shownN = -1;
      shownTier = -1;
    }
  }
  if (broken || !visible) {
    if (shownN !== -2 && !broken) {
      shownN = -2;
      hype('combo', '', 0, 0);
    }
    return;
  }
  if (n !== shownN) {
    const up = n > shownN;
    shownN = n;
    nEl.textContent = String(n);
    hype('combo', '', tier, n);
    if (up) replay(nEl, 'bump');
  }
  if (tier !== shownTier) {
    shownTier = tier;
    root.dataset.tier = String(tier);
    root.style.setProperty('--style-c', TIER_COLORS[Math.max(0, Math.min(6, tier))]);
    tierEl.textContent = tier > 0 ? TIER_LABEL[tier] : 'KEEP IT UP!';
  }
  const q = Math.round(fraction * 60);
  if (q !== shownBar) {
    shownBar = q;
    barEl.style.transform = `scaleX(${(q / 60).toFixed(3)})`;
  }
  if (held !== shownHeld) {
    shownHeld = held;
    root.classList.toggle('held', held);
  }
}


/** the combo was broken: the meter shows it for a moment */
export function showBroken(now: number): void {
  brokenUntil = now + 900;
  if (root) replay(root, 'shake');
}

/** big comic stamp: a new tier, the finish rank */
export function stamp(text: string, tier: number, sub = '', kind: 'tier' | 'rank' = 'tier', low = false): void {
  if (!root) return;
  stampEl.classList.toggle('low', low);
  stampTxt.textContent = text;
  stampSub.textContent = sub;
  stampEl.dataset.kind = kind;
  hype(kind === 'rank' ? 'rank' : 'stamp', text, tier, 0, '', sub);
  stampEl.style.setProperty('--style-c', TIER_COLORS[Math.max(0, Math.min(6, tier))]);
  stampEl.style.setProperty('--style-rot', `${tier % 2 ? -4 : -3}deg`);
  replay(stampEl, 'on');
}

/** a small line next to the meter ("DOUBLE SPIN +1,500") */
export function pop(text: string, tone: 'trick' | 'bank' | 'bad' | 'style'): void {
  if (!root) return;
  const p = pops[nextPop];
  nextPop = (nextPop + 1) % pops.length;
  p.el.textContent = text;
  p.el.dataset.tone = tone;
  hype('pop', text, 0, 0, tone);
  // the newest line sits at the top; older ones are pushed down a row
  for (let i = 0; i < pops.length; i++) {
    const age = (nextPop - 1 - i + pops.length * 2) % pops.length;
    pops[i].el.style.setProperty('--style-row', String(age));
  }
  replay(p.el, 'on');
}

/** slow-mo vignette pulse */
export function vignette(): void {
  if (vigEl) replay(vigEl, 'on');
}

/** a new run: clear everything */
export function resetHudCombo(): void {
  if (!root) return;
  brokenUntil = 0;
  shownBroken = false;
  root.classList.remove('broken', 'on', 'held', 'shake');
  shownVisible = false;
  shownHeld = false;
  shownN = shownTier = shownBar = -1;
  stampEl.classList.remove('on');
  vigEl.classList.remove('on');
  for (const p of pops) p.el.classList.remove('on');
}

/** visible rects for the overlap checks in shots */
export function hudRects(): Record<string, DOMRect | null> {
  return {
    combo: root?.classList.contains('on') ? root.getBoundingClientRect() : null,
    stamp: stampEl?.classList.contains('on') ? stampTxt.getBoundingClientRect() : null,
    pop0: pops[0]?.el.classList.contains('on') ? pops[0].el.getBoundingClientRect() : null,
    pop1: pops[1]?.el.classList.contains('on') ? pops[1].el.getBoundingClientRect() : null,
    pop2: pops[2]?.el.classList.contains('on') ? pops[2].el.getBoundingClientRect() : null,
  };
}
