// Pause menu: RESUME, RESTART, SETTINGS, QUIT TO MAP, with live objective progress. Owned by the META-UI lane.
import { game, runResult, screens } from '../core/api';
import { $, ICON, esc, onTap } from './dom';
import { liveMet, progressText } from './objectives';
import { go } from './router';

const el = $('pause');
const NAPS = ['The cat is pretending this was intentional.', 'Grooming break. Do not disturb.', 'Staring at a wall. Back soon.', 'Loafing. Professionally.'];

function render(): void {
  const l = game.level;
  if (!l) return;
  const r = runResult('time');
  $('pauseObj').innerHTML = l.objectives
    .map((o) => {
      const m = liveMet(o, r);
      return `<li class="${m ? 'met' : ''}">${ICON.star(m)}<span>${esc(o.label)}</span><b>${esc(progressText(o, r))}</b></li>`;
    })
    .join('');
  $('pauseSub').textContent = `${l.name} · ${Math.ceil(Math.max(0, game.mode === 'paused' ? r.elapsed : 0))} s in · ${NAPS[Math.floor(Math.random() * NAPS.length)]}`;
}

export function initPause(): void {
  screens.register({
    id: 'pause',
    el,
    onShow: () => {
      render();
      $('pauseResume').focus({ preventScroll: true });
    },
  });
  onTap($('pauseResume'), () => go.resume());
  onTap($('pauseRestart'), () => go.retry());
  onTap($('pauseSettings'), () => go.settings());
  onTap($('pauseQuit'), () => go.quitToMap());
}
