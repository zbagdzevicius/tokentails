/** items-ai lane entry: the sim plugins (AI drivers + item system) for one SimWorld. */
import type { SimPlugins } from '../core/sim/plugins';
import { createAIDriver } from './ai/driver';
import { registerDefaultItems } from './items/defs';
import { createItemSystem } from './items/system';

export function createSimPlugins(): SimPlugins {
  registerDefaultItems();
  return { ai: createAIDriver(), items: createItemSystem() };
}

export { buildField, kartLookFor } from './ai/roster';
