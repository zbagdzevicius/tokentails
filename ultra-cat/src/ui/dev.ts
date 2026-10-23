// Tester shortcuts, exposed as window.__ultra.dev (see main.ts). Not reachable from the UI.
//   __ultra.dev.unlockAll()          every city 3 stars, every cat owned, catnip topped up, tutorial done
//   __ultra.dev.jump('base', 'chonk') straight into any city with any cat (owned or not), current upgrades
//   __ultra.dev.boss()               jump the clock of the current run to just before its boss arrives
//   __ultra.dev.reset()              wipe the save back to a first-run state
import { CAT_ORDER, G, LEVEL_ORDER, cats, game, levels, screens, startLevel, type CatId, type LevelId, type SaveData } from '../core/api';
import { defaultSave } from '../meta/save';
import { go, run } from './router';
import { loadoutStats, selectedCat, store } from './store';
import { closeModal, modalOpen } from './dom';

function unlockAll(catnip = 50_000): SaveData {
  const s = store.get();
  const next: SaveData = {
    ...s,
    catnip: Math.max(s.catnip, catnip),
    tutorialDone: true,
    cats: { ...s.cats },
    levels: { ...s.levels },
  };
  for (const id of CAT_ORDER) next.cats[id] = { ...next.cats[id], owned: true };
  for (const id of LEVEL_ORDER) {
    const prev = next.levels[id];
    next.levels[id] = { stars: 3, objectives: [true, true, true], best: prev?.best ?? 0, plays: prev?.plays ?? 0 };
  }
  store.set(next);
  if (screens.current() === 'map' || screens.current() === 'title') go.map();
  return next;
}

function jump(levelId: LevelId = 'meowhattan', catId?: CatId): void {
  if (!levels.has(levelId)) throw new Error(`unknown level ${levelId}; one of ${LEVEL_ORDER.join(', ')}`);
  const cat = catId && cats.has(catId) ? catId : selectedCat();
  while (modalOpen()) closeModal();
  screens.hideAll();
  run.levelId = levelId;
  run.catId = cat;
  startLevel(levelId, cat, loadoutStats(cat));
}

/** Fast-forward the running level to 2 s before its boss (no-op without one). */
function boss(): void {
  const b = game.level?.boss;
  if (!b || game.mode !== 'play') return;
  const skip = Math.max(0, b.at - 2 - G.elapsed);
  G.elapsed += skip;
  G.time = Math.max(G.time - skip, game.level.frenzyAt + 5);
}

function reset(): void {
  store.set({ ...defaultSave(), settings: store.get().settings });
  go.title();
}

export const dev = { unlockAll, jump, boss, reset, save: () => store.get() };
