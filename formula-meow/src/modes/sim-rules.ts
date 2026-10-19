/**
 * The modes lane's rules inside the sim (registered once from install.ts, and by the tests): time trial and balloon
 * battle. Races of every other mode run without mode rules, so their replays are unchanged.
 */
import { registerModeRules } from '../core/sim/mode-registry';
import { createBattleRules } from './battle/rules';
import { createTtRules } from './tt/rules';

let done = false;

export function registerModesRules(): void {
  if (done) return;
  done = true;
  registerModeRules('tt', () => createTtRules());
  registerModeRules('battle', () => createBattleRules());
}
