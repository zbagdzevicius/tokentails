/**
 * Lane "audio-ui" install (iteration 2). Owns juice/audio/**, juice/index.ts, core/hud/**, src/ui/** (kit look via
 * tokens.css, strings, a11y content) and review/**.
 *
 * Extension points: `Hud.say` / `HudModel` (core/hud/hud.ts), the UI kit API (src/ui/kit), `registerScreen('settings'
 * | 'howto', …)`, `t()` / `registerStrings` (src/ui/i18n.ts, `?lang=xx` pseudo-locale), `setA11y` / `TIER_COLOURS`.
 */
import type { Shell } from '../core/app/shell';
import { registerStrings } from './i18n';
import { CORE_EN } from './strings/core.en';

export function installAudioUi(shell: Shell): void {
  registerStrings('en', CORE_EN);
  void shell;
}
