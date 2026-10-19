/**
 * Lane "modes" install (iteration 2; ITERATION-2.md section 2). Owns src/modes/**, content/cups.ts and its strings.
 *
 * Extension points it uses (all frozen by Stabilise):
 * - `registerScreen('title' | 'menu' | 'select' | 'class' | 'cup' | 'standings' | 'podium' | 'tt' | 'battle', …)`
 *   (core/app/screens.ts); `shell.startRace(req)` chains races and resolves when the player leaves the results;
 *   `shell.quitToMenu()`, `shell.setCameraMode()`, `shell.hudExtras()`.
 * - `registerModeRules('battle' | 'tt', cfg => ModeRules)` (core/sim/mode-registry.ts) for rules inside the sim.
 * - `registerResultSection(order, render)` (core/hud/results.ts) for standings between GP races.
 * - its save slot: `save.slot('modes', defaults, migrate)` (core/app/save.ts).
 *
 * Stabilise ships it empty: the game still boots straight onto the grid (v1 behaviour, deep links unchanged).
 */
import type { Shell } from '../core/app/shell';
import { registerStrings } from '../ui/i18n';
import { MODES_EN } from '../ui/strings/modes.en';

export function installModes(shell: Shell): void {
  registerStrings('en', MODES_EN);
  void shell;
}
