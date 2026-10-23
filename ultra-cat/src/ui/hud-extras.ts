// In-play HUD extras: objectives tracker (4 Hz), boss bar (events only), pause button, ULTRA labels.
import { uiStar } from '../audio/ui-sfx';
import { G, P, addFrameHook, events, game, isTouch, runResult, showBanner, type LevelDef } from '../core/api';
import { $, ICON, esc } from './dom';
import { liveMet, progressFrac, progressText, shortLabel } from './objectives';
import { go } from './router';
import { store } from './store';

const track = $('objTrack');
const boss = $('bossBar');
const bossName = $('bossName');
const bossPhase = $('bossPhase');
const bossFill = $('bossFill');
const bossLag = $('bossLag');
const tbUltra = $('tbUltra');
const hint = $('hint');

let rows: { el: HTMLElement; txt: HTMLElement; bar: HTMLElement; met: boolean }[] = [];
let acc = 0;
let bossHideT = 0;
let hintT = 0;
let fishHinted = false;

function buildTracker(level: LevelDef): void {
  track.innerHTML = level.objectives
    .map((o) => `<div class="orow"><span class="ostar">${ICON.star(false)}</span><span class="olab">${esc(shortLabel(o))}</span><span class="oval"></span><i><u></u></i></div>`)
    .join('');
  rows = [...track.querySelectorAll<HTMLElement>('.orow')].map((el) => ({ el, txt: el.querySelector('.oval') as HTMLElement, bar: el.querySelector('u') as HTMLElement, met: false }));
}

function updateTracker(): void {
  const level = game.level;
  if (!level || rows.length !== level.objectives.length) return;
  const r = runResult('time');
  level.objectives.forEach((o, i) => {
    const row = rows[i];
    row.txt.textContent = progressText(o, r);
    row.bar.style.transform = `scaleX(${progressFrac(o, r).toFixed(3)})`;
    const met = liveMet(o, r);
    if (met !== row.met) {
      row.met = met;
      row.el.classList.toggle('met', met);
      (row.el.querySelector('.ostar') as HTMLElement).innerHTML = ICON.star(met);
      // banked objectives ding once; patience is only "holding" until the end
      if (met && o.kind !== 'patience') {
        uiStar(i);
        row.el.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2,1.6,.4,1)' });
      }
    }
  });
}

function hideBoss(delay = 0): void {
  if (!delay) document.body.classList.remove('bossup');
  if (delay)
    bossHideT = window.setTimeout(() => {
      boss.classList.add('hidden');
      document.body.classList.remove('bossup');
    }, delay);
  else {
    clearTimeout(bossHideT);
    boss.classList.add('hidden');
  }
}

function labels(): void {
  const c = game.cat;
  if (!c) return;
  tbUltra.textContent = c.ultraName;
  hint.textContent = `WASD move · J / click swat · SPACE pounce · SHIFT zoomies · E ${c.ultraName} when full · ESC pause`;
}

export function initHudExtras(): void {
  events.on('levelLoad', ({ level }) => {
    buildTracker(level);
    hideBoss();
    boss.classList.remove('dead');
    labels();
  });
  events.on('levelStart', () => {
    updateTracker();
    labels();
    // the key hint is for learning: once the tutorial is done it fades after 15 s of each run
    clearTimeout(hintT);
    fishHinted = false;
    hint.classList.remove('faded');
    if (store.get().tutorialDone) hintT = window.setTimeout(() => hint.classList.add('faded'), 15000);
  });
  events.on('bossSpawn', ({ name, maxHp }) => {
    clearTimeout(bossHideT);
    bossName.textContent = name;
    bossPhase.textContent = '';
    bossFill.style.transform = bossLag.style.transform = 'scaleX(1)';
    boss.dataset.max = String(maxHp);
    boss.classList.remove('hidden', 'dead');
    document.body.classList.add('bossup');
    boss.animate([{ transform: 'translateX(-50%) scale(1.6)', opacity: 0 }, { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(.2,1.5,.4,1)' });
  });
  events.on('bossHp', ({ hp, maxHp }) => {
    const k = Math.max(0, Math.min(1, hp / (maxHp || 1)));
    bossFill.style.transform = `scaleX(${k.toFixed(3)})`;
    bossLag.style.transform = `scaleX(${k.toFixed(3)})`; // CSS transition delays the lag bar
    boss.classList.remove('hit');
    void boss.offsetWidth;
    boss.classList.add('hit');
  });
  events.on('bossPhase', ({ phase, name }) => {
    bossPhase.textContent = `PHASE ${phase}${name ? `: ${name}` : ''}`;
    bossPhase.animate([{ transform: 'scale(1.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 350 });
  });
  events.on('bossDefeated', () => {
    bossFill.style.transform = bossLag.style.transform = 'scaleX(0)';
    bossPhase.textContent = 'DEFEATED!';
    boss.classList.add('dead');
    hideBoss(1800);
  });
  events.on('levelEnd', () => hideBoss());
  // the tracker runs at 4 Hz; refresh it on pause so it matches the pause card
  events.on('pause', updateTracker);

  const pb = $('pauseBtn');
  pb.innerHTML = ICON.pause();
  pb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    go.pause();
  });
  if (isTouch) document.body.classList.add('touch');

  addFrameHook((dt) => {
    if (game.mode !== 'play') return;
    if (!fishHinted && G.patience < P.patienceMax * 0.5 && G.fish === 0) {
      fishHinted = true;
      showBanner(innerWidth < 600 ? 'GRAB A FISH!' : 'SOGGY! GRAB A FISH TRUCK!', '#4cc3ff');
    }
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    updateTracker();
  });
}
