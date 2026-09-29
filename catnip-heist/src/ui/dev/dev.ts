/**
 * UI / audio / yard dev bench (dev server only):
 *   /src/ui/dev/index.html?view=title|pick|hud|pause|results|yard|loading[&touch=1][&zoom=2]
 * Exposes window.__uidev for Playwright.
 */
import type { LevelDef, SimState } from '../../types';
import { loadManifest } from '../../render/voxel/sheets';
import { createUI, createInput } from '../index';
import { createAudio } from '../../audio';
import { createYard, type YardAPI } from '../../yard';

const BASE = '/assets/';
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'title';

const level: LevelDef = {
  id: 'heist-01',
  tiles: ['#####', '#...#', '#####'],
  catSpawns: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
  guards: [],
  coins: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, tile: { x: 1, y: 1 } })),
  key: { id: 'k', tile: { x: 3, y: 1 } },
  doors: [{ id: 'vault', tile: { x: 3, y: 1 }, kind: 'VAULT' }],
  plates: [],
  crate: { id: 'crate', tile: { x: 3, y: 1 }, catId: 'mist', catName: 'Mochi' },
  exit: { id: 'exit', tiles: [{ x: 1, y: 1 }] },
  checkpoints: [],
  meta: {
    title: 'Kibble Corp Warehouse',
    parTicks: 30 * 180,
    meowRadiusTiles: 6,
    investigateTicks: 90,
    hints: [{ x0: 0, y0: 0, x1: 10, y1: 10, text: 'Stand on the pressure plate to hold the door, then press Q to swap cats.' }],
  },
};

function fakeState(tick: number, over: Partial<SimState> = {}): SimState {
  const cat = (id: string, x: number) => ({ id, pos: { x: x * 16 + 8, y: 24 }, facing: { x: 1, y: 0 }, faceX: 1 as const, moving: false, checkpoint: { x, y: 1 }, stunTicks: 0, pose: 'IDLE' as const });
  return {
    levelId: 'heist-01', tick, rng: 1, cats: [cat('bob', 1), cat('oreo', 2)], activeIndex: 0, guards: [],
    coins: [], coinsCollected: 7, hasKey: true, keyTaken: true, doorsOpen: [false], platesDown: [], rescued: false,
    won: false, pendingInteract: false, spottedCount: 1, score: 0, hash: 0xdeadbeef, events: [], ...over,
  };
}

async function main() {
  const manifest = await loadManifest(BASE);
  const app = document.getElementById('app')!;
  const input = createInput();
  const audio = createAudio({ persist: false });
  let yard: YardAPI | null = null;
  const openYard = () => {
    document.getElementById('fake')?.remove();
    yard?.dispose();
    yard = createYard(app, manifest, { base: BASE, onChoose: (id) => ui.toast(`${id} joins the crew`, 'good') });
    ui.showYard(manifest.cats.length);
    const z = Number(q.get('zoom'));
    if (z) yard.setZoom(z);
    if (q.get('select')) yard.ready.then(() => yard!.focus(q.get('select')!));
  };
  const ui = createUI(app, {
    manifest,
    base: BASE,
    input,
    touch: q.get('touch') === '1' ? true : q.get('touch') === '0' ? false : undefined,
    muted: audio.isMuted(),
    handlers: {
      onStart: (ids) => {
        ui.showHUD(level, ids);
        audio.startMusic();
      },
      onYard: openYard,
      onYardBack: () => {
        yard?.dispose();
        yard = null;
      },
      onPause: () => ui.showPause(),
      onResume: () => ui.hidePause(),
      onRetry: () => ui.showHUD(level, ui.getPickedCats()),
      onMenu: () => audio.stopMusic(),
      onMuteChange: (m) => audio.setMuted(m),
      onUserGesture: () => audio.unlock(),
      onClick: () => audio.play('click'),
    },
  });
  input.onPause = () => (ui.paused ? ui.hidePause() : ui.showPause());

  let tick = 0;
  const hudLoop = () => {
    if (ui.screen === 'hud' && !ui.paused) {
      const inp = input.sample();
      tick++;
      const events = [] as SimState['events'];
      if (inp.meow) events.push({ type: 'MEOW' });
      if (inp.swap) events.push({ type: 'SWAP' });
      if (inp.interact) events.push({ type: 'COIN' });
      const s = fakeState(tick, { events, activeIndex: (Math.floor(tick / 90) % 2) as 0 | 1 });
      audio.playEvents(events);
      ui.handleEvents(events, s);
      ui.updateHUD(s);
    }
  };
  setInterval(hudLoop, 1000 / 30);

  switch (view) {
    case 'pick':
      ui.showCatPick();
      break;
    case 'hud':
    case 'pause':
      ui.showHUD(level, ['bob', 'oreo']);
      ui.updateHUD(fakeState(30 * 83));
      tick = 30 * 83;
      if (view === 'pause') ui.showPause();
      break;
    case 'results':
      ui.showHUD(level, ['bob', 'oreo']);
      ui.showResults({ levelId: 'heist-01', catIds: ['bob', 'oreo'], seed: 1234, ticks: 30 * 152, coins: 17, rescued: true, rescuedName: 'Mochi', spottedCount: 1, score: 205, hash: 0x1a2b3c4d }, level);
      break;
    case 'yard':
      ui.hideAll();
      openYard();
      break;
    case 'loading':
      ui.showTitle();
      ui.setLoading('Voxelizing cats');
      break;
    default:
      ui.showTitle();
  }
  (window as unknown as Record<string, unknown>).__uidev = { ui, input, audio, get yard() { return yard; }, fakeState, level };
}

main().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#ff7aa2">${String(e?.stack ?? e)}</pre>`);
});
