/**
 * Lane "progression" install (iteration 2). Owns src/progression/** (fish economy, unlocks, achievements, stats,
 * garage, rival picker, daily challenges), content/cosmetics.ts and share/pinkpaw/unlocks.ts.
 *
 * Extension points: `appBus.on('raceEnd' | 'cupEnd' | …)` (core/app/app-bus.ts), `RaceResult.stats` (RaceStats, built
 * from the event log), `registerResultSection` (fish earned, next goal, achievements), `registerScreen('garage' |
 * 'achievements' | 'stats' | 'rewards', …)`, and its save slot `save.slot('progression', …)` that migrates the v1
 * progress kept in the `core` slot.
 */
import type { Shell } from '../core/app/shell';
import { registerStrings } from '../ui/i18n';
import { PROGRESSION_EN } from '../ui/strings/progression.en';

export function installProgression(shell: Shell): void {
  registerStrings('en', PROGRESSION_EN);
  void shell;
}
