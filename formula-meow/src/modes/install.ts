/**
 * Lane "modes" install (iteration 2; ITERATION-2.md section 2): title, main menu, racer / class / cup / track
 * pickers, Grand Prix (standings, podium), Time Trial (ghosts, splits, medals), Balloon Battle (sim rules and
 * free-roam AI), How to play, Pink Paw, and fallbacks for screens no other lane installed (settings).
 *
 * Extension points it uses (all frozen by Stabilise, plus the marked `[modes lane]` shell additions):
 * - `registerScreen` (lazy chunks), `shell.startRace` (`actions` = the mode's result buttons, `attract`),
 *   `shell.startFilter` (a plain visit's boot race becomes the attract race behind the title), `shell.quitGuard`
 *   (quitting a Grand Prix race asks first), `shell.leaveRace` (the showroom and podium own the canvas),
 *   `shell.hudExtras`, `registerResultSection`, `registerModeRules('tt' | 'battle')`, the `modes` save slot.
 * - The share hooks (public API): the modes lane keeps each finished race's replay (time-trial ghosts) and, in its own
 *   modes, keeps only the share actions that make sense there (the clip and Pink Paw; a dare, the Daily Cup or the
 *   cat maker would start a different race in the middle of a cup).
 *
 * Boot: a plain visit after the first race opens on the title (the FTUE race on Kitchen 50cc is the first visit);
 * deep links go straight to their race or editor and offer "Menu" on the results.
 */
import type { Shell } from '../core/app/shell';
import { hasScreen, registerScreen, screens } from '../core/app/screens';
import { registerResultSection } from '../core/hud/results';
import { setShareHooks, shareHooks } from '../share/hooks';
import { registerStrings } from '../ui/i18n';
import { MODES_EN } from '../ui/strings/modes.en';
import { ModesFlow, MODES_SCREENS } from './flow';
import { defaultUnlocks, setUnlockProvider } from './hooks';
import { registerModesRules } from './sim-rules';
import { isPlainVisit } from './boot';
import { TtGhostView } from './tt/ghost-view';
import { ModeHud } from './hud/mode-hud';
import { modesResultSection } from './results';
import './modes.css';

/** Share actions kept on the results of a Grand Prix, time trial or battle race. */
const KEEP_ACTIONS = new Set(['clip', 'pinkpaw']);

export function installModes(shell: Shell): ModesFlow {
  registerStrings('en', MODES_EN);
  registerModesRules();
  setUnlockProvider(defaultUnlocks(() => shell.progress));
  const flow = new ModesFlow(shell);

  const ghost = new TtGhostView(shell);
  flow.ttGhost = ghost;
  shell.bus.add(ghost);
  shell.bus.add(new ModeHud(shell));

  registerScreen('title', () => import('./screens/title'));
  registerScreen('menu', () => import('./screens/menu'));
  registerScreen('select', () => import('./screens/select'));
  registerScreen('class', () => import('./screens/class'));
  registerScreen('cup', () => import('./screens/cup'));
  registerScreen('tt', () => import('./screens/tt'));
  registerScreen('battle', () => import('./screens/battle'));
  registerScreen('race', () => import('./screens/race')); // [integrator] single race
  registerScreen('standings', () => import('./screens/standings'));
  registerScreen('podium', () => import('./screens/podium'));
  // shared screens nobody else installed (another lane's own version wins: it installs first)
  if (!hasScreen('howto')) registerScreen('howto', () => import('./screens/howto'));
  if (!hasScreen('pinkpaw')) registerScreen('pinkpaw', () => import('./screens/pinkpaw'));
  if (!hasScreen('settings')) registerScreen('settings', () => import('./screens/settings'));

  // the share hooks: keep the replay, and trim the share actions in the modes' own races
  const prev = shareHooks().onResult;
  setShareHooks({
    onResult(ctx) {
      flow.noteReplay(ctx.replay);
      const extras = prev?.(ctx) ?? undefined;
      const mode = ctx.cfg.mode ?? 'race';
      if (!extras || (mode !== 'gp' && mode !== 'tt' && mode !== 'battle')) return extras;
      return { ...extras, actions: (extras.actions ?? []).filter((a) => KEEP_ACTIONS.has(a.id)) };
    },
  });

  registerResultSection(15, (ctx) => modesResultSection(ctx));
  shell.quitGuard = () => (flow.inCupRace() ? flow.quitCupAsk() : Promise.resolve(true));

  // menu chrome: the race corner buttons (☰, 🏁 Tracks) hide while a modes screen is up
  screens.onChange((top) => shell.host.classList.toggle('fm-in-menu', !!top && (MODES_SCREENS.includes(top) || shell.attract || !shell.world)));

  // boot: a returning player's plain visit opens on the title over the attract race; the first visit is the FTUE race
  if (isPlainVisit(location) && shell.progress.races > 0) {
    shell.startFilter = () => flow.attractRequest();
    void screens.push('title');
  }
  (window as unknown as { __fmModes?: ModesFlow }).__fmModes = flow;
  return flow;
}
