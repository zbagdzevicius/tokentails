// Menu flow (META-UI lane): title, stage select map, pause, settings, results, the ending cutscene hand-off.
// Screens are body[data-screen] = title | select | play | pause | settings | results | cutscene; index.html CSS shows one.
// CONTRACT (meta/dev.ts + shots): save, setSave, reloadSave, setScreen, screen, play, renderSelect.
import { setVolumes } from '../audio/synth';
import { setQualityMode } from '../core/engine';
import { events } from '../core/events';
import { addFrameHook } from '../core/loop';
import { stages, stageList } from '../core/registry';
import * as session from '../core/session';
import { G, game, prefs } from '../core/state';
import { CAMPAIGN, type RunResult, type StageId } from '../core/types';
import { isUnlocked, loadSave, recordResult, writeSave, type SaveData } from '../meta/save';
import { endingActive, playEnding, skipEnding, stopEnding } from './cutscene';
import { countUp, fmtDist, fmtInt, fmtTime, resultTitle, starCount, totalStars } from './format';
import { BELL_SVG, setEndlessBest } from './hud';
import { drawPortrait, portraitCanvas, type Mood } from './portrait';
import { initSettings, openSettings } from './settings';
import { thumbCanvas } from './thumbs';
import { setTutorialEnabled } from './tutorial';
import { uiBack, uiClick, uiFanfare, uiSad, uiStar, uiTick } from './uisfx';

export type Screen = 'title' | 'select' | 'play' | 'pause' | 'settings' | 'results' | 'cutscene';
const $ = (id: string) => document.getElementById(id)!;

export let save: SaveData = loadSave();
export function setSave(s: SaveData): void {
  save = s;
  writeSave(s);
  applySettings();
  renderSelect();
}
export function reloadSave(): void {
  save = loadSave();
  applySettings();
  renderSelect();
}
let appliedQuality: string | null = null;
export function applySettings(): void {
  const st = save.settings;
  setVolumes({ master: st.master, music: st.music, sfx: st.sfx });
  // only on a real change: re-applying 'auto' would undo the engine's fps auto-downgrade
  if (st.quality !== appliedQuality) {
    appliedQuality = st.quality;
    setQualityMode(st.quality);
  }
  prefs.reducedMotion = st.reducedMotion;
  prefs.shake = st.shake;
  document.body.classList.toggle('reduced', st.reducedMotion);
}

export function setScreen(s: Screen): void {
  document.body.dataset.screen = s;
}
export const screen = () => document.body.dataset.screen as Screen;

export const STAR = '<svg class="ico star" viewBox="0 0 24 24"><path d="M12 2.2l3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.6l-6.2 3.5 1.4-6.9L2 9.4l7-.8z"/></svg>';
const starSvg = (on: boolean) => STAR.replace('class="ico star"', `class="ico star ${on ? 'on' : 'off'}"`);
const stars = (s: readonly boolean[]) => s.map(starSvg).join('');
const LOCK =
  '<svg viewBox="0 0 48 48"><rect x="9" y="21" width="30" height="22" rx="5" fill="#ffc21a" stroke="#2a1c14" stroke-width="3.5"/><path d="M15 21 V15 a9 9 0 0 1 18 0 V21" fill="none" stroke="#2a1c14" stroke-width="4.5"/><circle cx="24" cy="31" r="3.5" fill="#2a1c14"/><path d="M24 33 V37" stroke="#2a1c14" stroke-width="3.5" stroke-linecap="round"/></svg>';
const FISH = '<svg viewBox="0 0 24 24"><path d="M3 12 Q9 5 16 9 L21 6 L20 12 L21 18 L16 15 Q9 19 3 12Z" fill="#7fd0ff" stroke="#2a1c14" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="11" r="1.3" fill="#2a1c14"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff7ea" stroke="#2a1c14" stroke-width="2.4"/><path d="M12 7 V12 L15.5 14" fill="none" stroke="#2a1c14" stroke-width="2.4" stroke-linecap="round"/></svg>';
const BOLT = '<svg viewBox="0 0 24 24"><path d="M13 2 L5 13 H11 L10 22 L19 10 H13Z" fill="#ffc21a" stroke="#2a1c14" stroke-width="2" stroke-linejoin="round"/></svg>';
const HEART = '<svg viewBox="0 0 32 30"><path d="M16 28 C4 19 1 13 2.5 8 C4 3 10 1 13 4 L16 7 L19 4 C22 1 28 3 29.5 8 C31 13 28 19 16 28Z" fill="#ff2f4f" stroke="#2a1c14" stroke-width="2.8"/></svg>';

const PREV: Partial<Record<StageId, StageId>> = { gorge: 'meadow', sunset: 'gorge', endless: 'meadow' };
const fresh = new Set<StageId>();

export function renderSelect(): void {
  const list = $('stageList');
  list.innerHTML = '';
  let i = 0;
  for (const st of stageList()) {
    const open = isUnlocked(save, st.id);
    const p = save.stages[st.id];
    const endless = st.id === 'endless';
    const b = document.createElement('button');
    b.className = `stage${open ? '' : ' locked'}${endless ? ' endless' : ''}${fresh.has(st.id) && open ? ' fresh' : ''}`;
    b.dataset.id = st.id;
    b.disabled = !open;
    b.style.setProperty('--i', String(i++));
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.appendChild(thumbCanvas(st.id));
    if (!open) thumb.insertAdjacentHTML('beforeend', `<div class="lock">${LOCK}</div>`);
    const prev = PREV[st.id];
    const lockMsg = prev ? `Finish ${stages.has(prev) ? stages.get(prev).name : prev} to unlock` : 'Locked';
    if (endless) {
      b.appendChild(thumb);
      b.insertAdjacentHTML(
        'beforeend',
        `<div class="info"><b>${st.name}</b><div class="blurb">${open ? st.blurb : lockMsg}</div></div>` +
          `<div class="best">${open ? `BEST<big>${fmtInt(save.endlessBest.score)}</big>${fmtDist(save.endlessBest.distance)}` : ''}</div>`,
      );
    } else {
      b.insertAdjacentHTML('afterbegin', `<span class="num">${st.index + 1}</span>`);
      b.appendChild(thumb);
      const bodyHtml =
        `<b>${st.name}</b><div class="blurb">${open ? st.blurb : lockMsg}</div>` +
        `<div class="meta"><span class="stars">${stars(p?.stars ?? [false, false, false])}</span><span>${p && p.best > 0 ? fmtInt(p.best) : ''}</span></div>`;
      b.insertAdjacentHTML('beforeend', `<div class="body">${bodyHtml}</div>`);
    }
    b.addEventListener('click', () => {
      fresh.delete(st.id);
      play(st.id);
    });
    list.appendChild(b);
  }
  const tot = totalStars(save.stages as Record<string, { stars: boolean[] }>);
  $('selectStars').innerHTML = `${starSvg(true)} ${tot}/${CAMPAIGN.length * 3}`;
  $('titleStars').innerHTML = tot > 0 ? `${starSvg(true)} ${tot}/${CAMPAIGN.length * 3}` : '';
}

export function play(id: StageId, at = 0): void {
  stopEnding();
  setScreen('play');
  session.startStage(id, { at });
}

// ---------------------------------------------------------------- results
let lastResult: RunResult | null = null;
let pausedAt = 0;
let countRaf = 0;
let resCat: { cv: HTMLCanvasElement; mood: Mood } | null = null;

function chip(icon: string, text: string): string {
  return `<span class="chip">${icon}${text}</span>`;
}

let resultsShownAt = -1e9;
function showResults(r: RunResult, newBest: boolean, unlocked: StageId[]): void {
  resultsShownAt = performance.now();
  const st = stages.get(r.stageId);
  const endless = r.stageId === 'endless';
  const nStars = starCount(r.stars);
  $('resTitle').textContent = resultTitle(r.finished, !!st.ending, endless, nStars);
  $('resStage').textContent = endless ? `${st.name} - ${fmtDist(r.distance)}` : st.name;
  $('resBest').classList.toggle('hidden', !newBest);
  $('resBells').textContent = st.bells ? `${r.bellCount}/${st.bells} bells` : fmtDist(r.distance);
  const labels = ['Home', `${st.bells || 7} bells`, fmtInt(st.scoreTarget)];
  $('resStars').innerHTML = endless
    ? ''
    : r.stars.map((on, i) => `<div class="sl" style="--i:${i}">${starSvg(on).replace('<svg', `<svg style="--i:${i}"`)}<span>${labels[i]}</span></div>`).join('');
  const chips = [
    st.bells ? chip(BELL_SVG.replace('class="bell"', 'class="bell on"'), `${r.bellCount}/${st.bells}`) : chip(CLOCK, fmtDist(r.distance)),
    chip(FISH, `${r.fish}`),
    chip(BOLT, `x${r.maxMult}`),
    chip(CLOCK, fmtTime(r.time)),
    r.hits === 0 && r.finished ? chip(HEART, 'No hits!') : chip(HEART, `${r.hits} hit${r.hits === 1 ? '' : 's'}`),
  ];
  $('resChips').innerHTML = chips.join('');
  const newNames = unlocked.filter((id) => stages.has(id)).map((id) => stages.get(id).name);
  $('resUnlock').classList.toggle('hidden', newNames.length === 0);
  $('resUnlock').textContent = newNames.length ? `Unlocked: ${newNames.join(' + ')}!` : '';
  const i = CAMPAIGN.indexOf(r.stageId);
  const next = i >= 0 && i + 1 < CAMPAIGN.length ? CAMPAIGN[i + 1] : null;
  $('resNext').classList.toggle('hidden', !next || !isUnlocked(save, next));
  // portrait
  const mood: Mood = !r.finished && !endless ? 'ouch' : nStars >= 3 ? 'wow' : endless ? 'happy' : 'happy';
  const host = $('resCat');
  host.innerHTML = '';
  const cv = portraitCanvas(110, mood);
  cv.style.width = cv.style.height = '100%';
  host.appendChild(cv);
  resCat = { cv, mood };
  setScreen('results');
  // re-trigger the card + star animations
  const card = document.querySelector('#results .card') as HTMLElement;
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  if (r.finished || endless) uiFanfare();
  else uiSad();
  // star sounds in time with the CSS pops
  r.stars.forEach((on, k) => on && !endless && setTimeout(() => screen() === 'results' && uiStar(k), 350 + k * 350 + 120));
  // score count-up
  cancelAnimationFrame(countRaf);
  const el = $('resScore');
  const t0 = performance.now();
  const dur = Math.min(1.4, 0.5 + r.score / 40000);
  let lastTick = 0;
  const step = (now: number) => {
    const t = (now - t0) / 1000;
    el.textContent = fmtInt(countUp(r.score, t, dur));
    if (t < dur) {
      if (now - lastTick > 55) {
        lastTick = now;
        uiTick();
      }
      countRaf = requestAnimationFrame(step);
    }
  };
  if (prefs.reducedMotion) el.textContent = fmtInt(r.score);
  else countRaf = requestAnimationFrame(step);
}

function primaryResult(): void {
  if (!lastResult) return;
  const next = !$('resNext').classList.contains('hidden');
  if (next) $('resNext').click();
  else play(lastResult.stageId);
}

// ---------------------------------------------------------------- init
export function initFlow(): void {
  applySettings();
  renderSelect();
  setScreen('title');
  initSettings(() => save, (s) => setSave(s));

  // title mascot (animated portrait)
  const mascot = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  mascot.width = mascot.height = Math.round(132 * dpr);
  $('titleMascot').appendChild(mascot);
  const mctx = mascot.getContext('2d');
  $('pauseCat').appendChild(portraitCanvas(86, 'sleepy', true));
  addFrameHook((_dt, t) => {
    const sc = screen();
    if (sc === 'title' && mctx) drawPortrait(mctx, mascot.width, mascot.height, t % 6 < 3.5 ? 'happy' : 'idle', t, { bg: false });
    if (sc === 'results' && resCat && !prefs.reducedMotion) {
      const c = resCat.cv.getContext('2d');
      if (c) drawPortrait(c, resCat.cv.width, resCat.cv.height, resCat.mood, t);
    }
  });

  // buttons (pointer clicks get their sound from cat-audio's capture listener in src/audio/sfx.ts; keys use uiClick)
  $('play').addEventListener('click', () => setScreen('select'));
  $('titleSettings').addEventListener('click', () => openSettings('title'));
  $('selectBack').addEventListener('click', () => {
    uiBack();
    setScreen('title');
  });
  $('pauseBtn').addEventListener('click', () => session.pause());
  $('pauseResume').addEventListener('click', () => session.resume());
  $('pauseRetry').addEventListener('click', () => session.retry());
  $('pauseSettings').addEventListener('click', () => openSettings('pause'));
  $('pauseQuit').addEventListener('click', () => {
    session.quit();
    setScreen('select');
  });
  $('resRetry').addEventListener('click', () => lastResult && play(lastResult.stageId));
  $('resMenu').addEventListener('click', () => {
    stopEnding();
    if (game.stage) session.quit();
    setScreen('select');
  });
  $('resNext').addEventListener('click', () => {
    const i = lastResult ? CAMPAIGN.indexOf(lastResult.stageId) : -1;
    if (i >= 0 && i + 1 < CAMPAIGN.length) play(CAMPAIGN[i + 1]);
  });
  $('cutscene').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    skipEnding();
  });

  addEventListener('keydown', (e) => {
    const sc = screen();
    if (e.repeat) return;
    if (sc === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
      uiClick();
      setScreen('select');
    } else if (sc === 'select') {
      if (e.code === 'Escape') {
        uiBack();
        setScreen('title');
      } else if (e.code === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) {
        // the next stage to play: first unlocked campaign stage without a finish, else the first
        const id = CAMPAIGN.find((s) => isUnlocked(save, s) && !save.stages[s]?.finished) ?? 'meadow';
        play(id);
      }
    }
    // (the same Esc press that paused reaches this listener after core's: ignore it)
    else if (sc === 'pause' && (e.code === 'Escape' || e.code === 'KeyP') && e.timeStamp > pausedAt) session.resume();
    else if (sc === 'results') {
      // a key still held or mashed from the run (or from skipping the ending) must not skip the results
      if (performance.now() - resultsShownAt < 600) return;
      if (e.code === 'Enter') primaryResult();
      else if (e.code === 'Escape') $('resMenu').click();
      else if (e.code === 'KeyR') $('resRetry').click();
    } else if (sc === 'cutscene' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) skipEnding();
  });

  events.on('stageStart', ({ stage }) => {
    setScreen('play');
    setEndlessBest(save.endlessBest.distance);
    setTutorialEnabled(!!stage.tutorial && !save.tutorialDone);
  });
  events.on('stageLoad', () => {
    if (endingActive()) stopEnding();
  });
  events.on('pause', () => {
    pausedAt = performance.now();
    const bells = game.stage?.bells ? `${G.bells.filter(Boolean).length}/${game.stage.bells} bells` : '';
    $('pauseSub').textContent = [game.stage?.name ?? '', bells].filter(Boolean).join('  -  ');
    setScreen('pause');
  });
  events.on('resume', () => setScreen('play'));
  // a quit from anywhere (pause card, tests) lands on the title attract unless the caller picks a screen after
  events.on('quit', () => {
    const sc = screen();
    if (sc === 'play' || sc === 'pause' || sc === 'settings') setScreen('title');
  });
  events.on('stageEnd', ({ result }) => {
    lastResult = result;
    const rec = recordResult(save, result);
    const ending = !!game.stage?.ending && result.finished;
    if (ending) rec.save.endingSeen = true;
    for (const id of rec.unlocked) fresh.add(id);
    setSave(rec.save);
    if (ending) {
      setScreen('cutscene');
      playEnding(result.bellCount, () => showResults(result, rec.newBest, rec.unlocked));
    } else setTimeout(() => game.mode === 'over' && lastResult === result && showResults(result, rec.newBest, rec.unlocked), 900);
  });
  // body[data-mode] mirrors game.mode for CSS
  const mirror = () => (document.body.dataset.mode = game.mode);
  for (const k of ['stageLoad', 'stageStart', 'pause', 'resume', 'finishLine', 'stageEnd', 'quit'] as const) events.on(k, mirror);
  mirror();
}
