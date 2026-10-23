// Results: reason, damage count-up, rank stamp, stars one by one, catnip, unlocks, then NEXT / RETRY / MAP / CATS.
import * as A from '../audio/sfx';
import { uiFanfare, uiJingle, uiStar, uiTick } from '../audio/ui-sfx';
import { evaluateStars, isLevelUnlocked, objectiveValue } from '../campaign/stars';
import { catCost, catnipForRun } from '../cats/economy';
import { RANKS, cats, events, game, levelList, levels, money, rankOf, screens, type LevelId, type RunResult } from '../core/api';
import { newlyAffordable, newStarsOf, recordRun } from '../meta/progress';
import { $, ICON, countUp, esc, onTap } from './dom';
import { progressText } from './objectives';
import { go } from './router';
import { store } from './store';

const el = $('results');
const WHY: Record<RunResult['why'], string> = { time: "TIME'S UP", wet: 'TOO WET. NAP TIME.', boss: 'BOSS DOWN!', quit: '' };
const QUIPS: Record<RunResult['why'], string[]> = {
  time: ['The city has been knocked off the table.', 'Somebody is going to have to sweep that up.', 'Not sorry.'],
  wet: ['Cats and water: a love story it is not.', 'Retreating to a sunbeam to dry off.', 'This never happened.'],
  boss: ['The vacuum menace is unplugged forever.', 'Good kitty. Terrible for property values.', 'Victory nap earned.'],
  quit: [''],
};

/** One line of advice after TOO WET: what to change before the next try. */
function wetTip(r: RunResult, s: ReturnType<typeof store.get>): string {
  const fur = s.cats[r.catId]?.upgrades.fur ?? 0;
  if (r.fish === 0) return '<b>TIP</b> Fish trucks refill patience. Follow the blue FISH arrow when you get wet.';
  if (fur < 2) return `<b>TIP</b> FUR upgrades add patience and soak less. Spend catnip in CATS.`;
  if (r.catId !== 'chonk' && !s.cats.chonk?.owned) return '<b>TIP</b> Big Biscuit has 130 patience and soaks 20% less. Find him in CATS.';
  return '<b>TIP</b> Keep moving: trucks wind up before they spray, and you can walk out of the stream.';
}

let timers: number[] = [];
let cancelCount: (() => void) | null = null;
let shownAt = 0;
let nextId: LevelId | null = null;
let mapId: LevelId | null = null; // where MAP opens: a city that just unlocked, else the one just played
let lit: { met: boolean[]; prev: boolean[]; catnip: number; total: number } = { met: [], prev: [], catnip: 0, total: 0 };

function clearTimers(): void {
  timers.forEach(clearTimeout);
  timers = [];
  cancelCount?.();
  cancelCount = null;
}
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

function show(r: RunResult): void {
  if (r.why === 'quit') return;
  clearTimers();
  const level = levels.get(r.levelId);
  const all = levelList();
  const before = store.get();
  const ev = evaluateStars(level, r);
  const fresh = newStarsOf(before, level.id, ev);
  const catnip = catnipForRun(r, level, fresh.count);
  const after = recordRun(before, r, ev, catnip);
  store.set(after);
  const prevBest = before.levels[level.id]?.best ?? 0;
  const newBest = r.damage > prevBest && (before.levels[level.id]?.plays ?? 0) > 0;
  const newCities = all.filter((l) => !isLevelUnlocked(l, before, all) && isLevelUnlocked(l, after, all));
  const newCats = newlyAffordable(before, after, catCost).filter((id) => cats.has(id));
  const next = all.find((l) => l.index === level.index + 1);
  nextId = next && isLevelUnlocked(next, after, all) ? next.id : null;
  mapId = newCities[0]?.id ?? level.id;

  const ri = rankOf(r.damage);
  const nr = RANKS[ri + 1];
  const quip = QUIPS[r.why][Math.floor(Math.random() * QUIPS[r.why].length)];
  const prevObj = before.levels[level.id]?.objectives ?? [false, false, false];
  lit = { met: ev.met, prev: prevObj, catnip, total: after.catnip };
  const rows = level.objectives
    .map((o, i) => {
      const val = o.kind === 'boss' ? (objectiveValue(o, r) >= 1 ? 'done' : 'missed') : progressText(o, r, false);
      return `<li class="${ev.met[i] ? 'met' : prevObj[i] ? 'old' : 'miss'}" data-i="${i}"><span class="rstar">${ICON.star(false)}</span><span class="rl">${esc(o.label)}</span><span class="rv">${esc(val)}</span>${fresh.fresh[i] ? '<em class="newtag">NEW</em>' : ''}</li>`;
    })
    .join('');
  const kills = Object.values(r.kills).reduce((a, b) => a + (b ?? 0), 0);
  const tip = r.why === 'wet' ? wetTip(r, after) : '';
  const unlocks = [
    ...newCities.map((l) => `<div class="unlock city txt">NEW CITY! ${esc(l.name)}</div>`),
    ...newCats.map((id) => `<div class="unlock cat txt" style="--c:${cats.get(id).color}">${esc(cats.get(id).name)} affordable!</div>`),
  ].join('');
  $('resBody').innerHTML = `
    <h2 class="rwhy txt ${r.why}">${WHY[r.why]}</h2>
    <div class="rquip">${esc(quip)}</div>
    <div class="rdmg txt" id="resDmg">$0</div>
    <div class="rrank txt" id="resRank">${esc(RANKS[ri][1])}</div>
    <div class="rnext">${newBest ? '<b>NEW BEST!</b> · ' : ''}${nr ? `Next rank: ${esc(nr[1])} at ${money(nr[0])}` : 'Top rank. The city never stood a chance.'}</div>
    <ul class="robj">${rows}</ul>
    <div class="rnip txt" id="resNip">${ICON.leaf()} +0</div>
    ${fresh.count ? `<div class="rnipx">incl. +${30 * fresh.count} for ${fresh.count} new ${fresh.count > 1 ? 'stars' : 'star'}</div>` : ''}
    ${tip ? `<div class="rtip">${tip}</div>` : ''}
    <div class="runlocks" id="resUnlocks">${unlocks}</div>
    <div class="rstats">
      <span>Buildings</span><b>${r.buildings}</b><span>Landmarks</span><b>${r.landmarks}</b>
      <span>Enemies</span><b>${kills}</b><span>Taxis punted</span><b>${r.taxis}</b>
      <span>Fish eaten</span><b>${r.fish}</b><span>City wrecked</span><b>${Math.round(r.destroyedPct)}%</b>
    </div>`;
  const nb = $('resNext');
  nb.classList.toggle('hidden', !nextId);
  nb.textContent = newCities.some((l) => l.id === nextId) ? `NEXT: ${next?.name ?? ''}` : 'NEXT CITY';
  nb.toggleAttribute('data-primary', !!nextId);
  $('resRetry').toggleAttribute('data-primary', !nextId);
  if (!store.persisted()) $('resBody').insertAdjacentHTML('beforeend', '<div class="rwarn">Progress could not be saved (storage is blocked).</div>');

  // wait for the slow-motion pull-back, then reveal step by step
  later(900, () => {
    if (game.mode !== 'over') return;
    screens.show('results');
    shownAt = performance.now();
    el.classList.remove('revealed');
    uiJingle(r.why !== 'wet');
    (el.querySelector('[data-primary]') as HTMLElement | null)?.focus({ preventScroll: true });
    const dmgEl = $('resDmg');
    dmgEl.dataset.final = money(r.damage);
    let lastTick = 0;
    cancelCount = countUp(1300, (k) => {
      dmgEl.textContent = money(r.damage * k);
      const now = performance.now();
      if (k < 1 && now - lastTick > 70) {
        lastTick = now;
        uiTick();
      }
    });
    later(1350, () => {
      const rk = $('resRank');
      rk.classList.add('on');
      rk.animate([{ transform: 'rotate(-3deg) scale(2.4)', opacity: 0 }, { transform: 'rotate(-3deg) scale(1)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,1.6,.4,1)' });
      A.thud(1.2);
    });
    let t = 1750;
    let n = 0;
    el.querySelectorAll<HTMLElement>('.robj li').forEach((li) => {
      const i = Number(li.dataset.i);
      const lit = ev.met[i] || prevObj[i];
      later(t, () => {
        li.classList.add('shown');
        if (lit) {
          (li.querySelector('.rstar') as HTMLElement).innerHTML = ICON.star(true, ev.met[i] ? '' : 'old');
          li.querySelector('.rstar')!.animate([{ transform: 'scale(2.6) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,1.6,.4,1)' });
          if (ev.met[i]) uiStar(n++);
        }
      });
      t += 420;
    });
    later(t + 100, () => {
      const nipEl = $('resNip');
      nipEl.classList.add('on');
      cancelCount = countUp(700, (k) => (nipEl.innerHTML = `${ICON.leaf()} +${Math.round(catnip * k)} <small>catnip · ${after.catnip} total</small>`));
    });
    later(t + 900, () => {
      el.classList.add('revealed');
      const u = $('resUnlocks');
      if (u.children.length) {
        u.classList.add('on');
        uiFanfare();
      }
    });
  });
}

/** Skip the reveal animation (a key press or tap while it plays). */
function skipReveal(): void {
  if (el.classList.contains('revealed')) return;
  clearTimers();
  el.classList.add('revealed');
  el.querySelectorAll<HTMLElement>('.robj li').forEach((li) => {
    const i = Number(li.dataset.i);
    li.classList.add('shown');
    if (lit.met[i] || lit.prev[i]) (li.querySelector('.rstar') as HTMLElement).innerHTML = ICON.star(true, lit.met[i] ? '' : 'old');
  });
  $('resRank').classList.add('on');
  $('resNip').classList.add('on');
  $('resNip').innerHTML = `${ICON.leaf()} +${lit.catnip} <small>catnip · ${lit.total} total</small>`;
  const r = $('resDmg');
  r.textContent = r.dataset.final ?? r.textContent;
  $('resUnlocks').classList.add('on');
}

export const resultsReady = () => screens.current() === 'results' && performance.now() - shownAt > 350;

export function initResults(): void {
  screens.register({ id: 'results', el, onHide: clearTimers });
  onTap($('resNext'), () => nextId && go.intro(nextId));
  onTap($('resRetry'), () => go.retry());
  onTap($('resMap'), () => go.map(mapId ?? game.level?.id));
  onTap($('resCats'), () => {
    go.map(mapId ?? game.level?.id);
    go.cats();
  });
  $('resBody').addEventListener('click', skipReveal);
  events.on('levelEnd', ({ result }) => show(result));
}

export { skipReveal };
