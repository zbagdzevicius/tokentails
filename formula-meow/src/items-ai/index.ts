/**
 * The sim plugins for one SimWorld: AI drivers + item system (items-ai lane), plus the track's hazards (tracks lane,
 * src/tracks/hazards/registry.ts) and the mode's rules (modes lane, `registerModeRules`) when the config has them.
 * Without a config (tests, ghosts of v1 races) it is the v1 set.
 */
import type { RaceConfig } from '../types';
import type { SimPlugins } from '../core/sim/plugins';
import { modeRulesFor } from '../core/sim/mode-registry';
import { createHazardSystem } from '../tracks/hazards/registry';
import { createAIDriver } from './ai/driver';
import { registerDefaultItems } from './items/defs';
import { createItemSystem } from './items/system';

export function createSimPlugins(cfg?: RaceConfig): SimPlugins {
  registerDefaultItems();
  const p: SimPlugins = { ai: createAIDriver(), items: createItemSystem() };
  if (cfg) {
    const hazards = createHazardSystem(cfg.track);
    if (hazards) p.hazards = hazards;
    const mode = modeRulesFor(cfg);
    if (mode) p.mode = mode;
  }
  return p;
}

export { buildField, kartLookFor } from './ai/roster';
