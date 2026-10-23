// The game flow: title -> city map -> (cat select) -> intro card -> play -> results, plus pause and settings.
// Owned by the META-UI lane. Entry: initFlow() from registerMetaUi(); it leaves a level prepared.
import { initAudio } from '../audio/synth';
import { initMusic } from '../audio/music';
import { uiBack } from '../audio/ui-sfx';
import { totalStars } from '../campaign/stars';
import { beginPlay, game, levelList, levels, pause, prepareLevel, quitLevel, resume, screens, startLevel, type LevelId } from '../core/api';
import { initCats } from './cats';
import { $, ICON, closeModal, focusables, modalOpen, moveFocus, navScope, onTap } from './dom';
import { initHudExtras } from './hud-extras';
import { initIntro } from './intro';
import { initMap } from './map';
import { initPause } from './pause';
import { initResults, resultsReady, skipReveal } from './results';
import { go, run } from './router';
import { applySettings, initSettings, openSettings } from './settings';
import { loadoutStats, selectedCat, store } from './store';
import { initThreatArrow } from './threat-arrow';
import { initTutorial, skipTutorial, tutorialActive } from './tutorial';

function renderTitle(): void {
  const s = store.get();
  const all = levelList();
  $('titleMeta').innerHTML = s.totals.runs
    ? `<span aria-label="stars">${ICON.star(true)} ${totalStars(s)} / ${all.length * 3}</span><span aria-label="catnip">${ICON.leaf()} ${s.catnip} catnip</span><span>${s.totals.runs} rampage${s.totals.runs === 1 ? '' : 's'}</span>`
    : '<span>Five cities. Ninety seconds each. Zero remorse.</span>';
  $('play').textContent = s.totals.runs ? 'PLAY' : 'RAMPAGE';
}

/** A calm backdrop for the menus: the given city in title mode with the selected cat strolling. */
function attract(levelId: LevelId): void {
  const id = levels.has(levelId) ? levelId : 'meowhattan';
  const cat = selectedCat();
  prepareLevel(id, cat, loadoutStats(cat));
}

function wire(): void {
  go.title = () => {
    if (game.mode !== 'title') attract('meowhattan');
    renderTitle();
    screens.show('title');
  };
  go.map = (focus) => {
    if (game.mode !== 'title') attract(game.level?.id ?? 'meowhattan');
    screens.show('map', focus);
  };
  go.cats = () => {
    if (game.mode !== 'title') attract(game.level?.id ?? 'meowhattan');
    screens.show('cats');
  };
  go.intro = (id) => screens.show('intro', id);
  go.play = () => {
    if (game.mode !== 'title') return;
    // the intro card prepared the level with this loadout; re-prepare if the cat changed meanwhile
    if (game.level?.id !== run.levelId || game.cat?.id !== run.catId) prepareLevel(run.levelId, run.catId, loadoutStats(run.catId));
    screens.hideAll();
    beginPlay();
  };
  go.retry = () => {
    if (modalOpen()) closeModal();
    screens.hideAll();
    run.catId = store.get().cats[run.catId]?.owned ? run.catId : selectedCat();
    startLevel(run.levelId, run.catId, loadoutStats(run.catId), { keepCamera: true });
  };
  go.pause = () => {
    if (game.mode !== 'play') return;
    pause();
    screens.show('pause');
  };
  go.resume = () => {
    if (game.mode !== 'paused') return;
    while (modalOpen()) closeModal();
    screens.hideAll();
    resume();
  };
  go.quitToMap = () => {
    while (modalOpen()) closeModal();
    const id = game.level?.id ?? 'meowhattan';
    quitLevel();
    attract(id);
    screens.show('map', id);
  };
  go.settings = () => openSettings();
}

/** Esc / back on each screen. */
function back(): void {
  const cur = screens.current();
  if (cur === 'map') go.title();
  else if (cur === 'cats') screens.back();
  else if (cur === 'intro') go.map(run.levelId);
  else if (cur === 'results') go.map(game.level?.id);
  else return;
  uiBack();
}

function onKey(e: KeyboardEvent): void {
  const code = e.code;
  const arrow = code.startsWith('Arrow');
  if (e.repeat && !arrow) return;
  document.body.classList.add('kbd');
  if (game.mode === 'play') {
    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      go.pause();
    } else if (code === 'Enter' && tutorialActive()) skipTutorial();
    return;
  }
  if (modalOpen()) {
    if (code === 'Escape') {
      e.preventDefault();
      closeModal();
      uiBack();
      return;
    }
  } else if (game.mode === 'paused') {
    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      go.resume();
      return;
    }
  } else if (code === 'Escape') {
    e.preventDefault();
    back();
    return;
  }
  if (game.mode === 'over' && screens.current() === 'results') {
    if (!resultsReady()) return;
    if (!document.getElementById('results')!.classList.contains('revealed') && (code === 'Enter' || code === 'Space')) {
      e.preventDefault();
      skipReveal();
      return;
    }
    if (code === 'KeyR') return go.retry();
  }
  const active = document.activeElement as HTMLElement | null;
  if (arrow) {
    // sliders keep left/right for themselves
    if (active instanceof HTMLInputElement && active.type === 'range' && (code === 'ArrowLeft' || code === 'ArrowRight')) return;
    e.preventDefault();
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[code as 'ArrowUp'] ?? [0, 0];
    moveFocus(d[0], d[1]);
    return;
  }
  if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
    const scope = navScope();
    if (!scope) return;
    const focused = active && scope.contains(active) && focusables(scope).includes(active) ? active : null;
    if (focused && code === 'Enter' && focused instanceof HTMLButtonElement) return; // native Enter clicks it
    e.preventDefault();
    const target = focused ?? scope.querySelector<HTMLElement>('[data-primary]:not(.hidden)') ?? focusables(scope)[0];
    if (target && !(target instanceof HTMLInputElement)) target.click();
  }
}

export function initFlow(): void {
  applySettings(store.get().settings); // before audio exists: setVolumes keeps the values for later
  initMusic();
  screens.register({ id: 'title', el: $('title'), onShow: () => $('play').focus({ preventScroll: true }) });
  wire();
  initMap();
  initCats();
  initIntro();
  initPause();
  initResults();
  initSettings();
  initHudExtras();
  initTutorial();
  initThreatArrow();

  $('titleCog').innerHTML = $('mapCog').innerHTML = ICON.cog();
  $('mapBack').innerHTML = $('catsBack').innerHTML = ICON.back();
  onTap($('play'), () => go.map());
  onTap($('titleCog'), () => go.settings());
  onTap($('mapCog'), () => go.settings());

  addEventListener('keydown', onKey);
  addEventListener('pointerdown', () => {
    document.body.classList.remove('kbd');
    initAudio();
  }, { capture: true });
  // phones: leaving the tab pauses the run
  document.addEventListener('visibilitychange', () => document.hidden && go.pause());
  addEventListener('blur', () => go.pause());

  // the attract city behind the title (a level must be prepared before the first frame)
  attract('meowhattan');
  renderTitle();
  screens.show('title');
}
