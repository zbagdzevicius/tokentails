/**
 * Lane "feel" install (iteration 2). Owns core/sim/{kart,contact,autopilot}.ts, core/render/**, core/camera/**,
 * juice/vfx/**, juice/{feel,time}.ts, juice/perf/**, items-ai/**, tuning.ts and the numbers in content/karts.ts.
 *
 * Extension points: `ChaseCamera.setMode` (flyover, finishOrbit, podium, attract), `KartView` animation, the
 * `driftTierColors()` / `reducedMotion()` a11y reads (src/ui/a11y.ts), and JuiceBus listeners.
 */
import type { Shell } from '../app/shell';
import { registerStrings } from '../../ui/i18n';
import { FEEL_EN } from '../../ui/strings/feel.en';

export function installFeel(shell: Shell): void {
  registerStrings('en', FEEL_EN);
  void shell;
}
