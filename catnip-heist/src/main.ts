/**
 * Catnip Heist entry point.
 *
 * URL params:
 *   ?qa=1                 install window.__heist QA hooks (always on in dev)
 *   ?seed=<n>             sim seed (default 1)
 *   ?controls=grid        arrows move along the grid instead of screen directions
 *   ?shadows=0            disable real-time shadows
 *   ?level=heist-03       level for ?replay=solution and for the first run (default heist-01)
 *   ?replay=solution|last watch the bundled solution or your last finished run
 *   ?speed=<n>            replay speed multiplier
 *   ?screen=yard|pick|levels  open straight onto a screen
 */
import { ASSET_BASE } from './types';
import { loadManifest } from './render/voxel/sheets';
import { LEVEL_IDS, getSolution } from './levels';
import { App } from './app/App';
import { installQA } from './app/qa';
import type { ControlScheme } from './app/controls';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  const q = new URLSearchParams(location.search);
  const manifest = await loadManifest(ASSET_BASE);
  const seedParam = Number(q.get('seed'));
  const levelParam = q.get('level');
  const levelId = levelParam && LEVEL_IDS.includes(levelParam) ? levelParam : LEVEL_IDS[0];
  const app = new App({
    root,
    manifest,
    base: ASSET_BASE,
    levelId,
    seed: Number.isInteger(seedParam) && seedParam > 0 ? seedParam >>> 0 : 1,
    controls: (q.get('controls') === 'grid' ? 'grid' : 'screen') as ControlScheme,
    replaySpeed: Number(q.get('speed')) || 1,
    shadows: q.get('shadows') !== '0',
  });
  if (import.meta.env.DEV || q.get('qa') === '1') installQA(app);

  const replay = q.get('replay');
  const log = replay === 'solution' ? getSolution(levelId) : replay === 'last' ? app.lastReplay() : null;
  if (log) {
    try {
      await app.startRun([log.catIds[0], log.catIds[1]], log);
      root.dataset.ready = '1';
      return;
    } catch (e) {
      console.warn('replay could not start, showing the title instead', e);
      app.toMenu(false);
      app.showTitle();
      root.dataset.ready = '1';
      return;
    }
  }
  app.showTitle();
  const screen = q.get('screen');
  if (screen === 'pick') app.ui.showCatPick();
  else if (screen === 'yard') app.openYard();
  else if (screen === 'levels') app.openLevels();
  root.dataset.ready = '1';
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#FF7AA2;position:fixed;inset:auto 16px 16px;white-space:pre-wrap">${String(e)}</pre>`);
});
