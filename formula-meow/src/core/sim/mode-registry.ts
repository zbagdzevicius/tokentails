/**
 * Mode rules registry (iteration 2 contract): the modes lane registers a `ModeRules` factory per race mode (battle,
 * time trial) from its install file; `createSimPlugins(cfg)` asks here. A mode with no rules races normally.
 */
import type { RaceConfig, RaceMode } from '../../types';
import type { ModeRules } from './plugins';

const factories = new Map<RaceMode, (cfg: RaceConfig) => ModeRules | null>();

export function registerModeRules(mode: RaceMode, make: (cfg: RaceConfig) => ModeRules | null): void {
  factories.set(mode, make);
}

export function modeRulesFor(cfg: RaceConfig): ModeRules | null {
  const make = factories.get(cfg.mode ?? 'race');
  return make ? make(cfg) : null;
}
