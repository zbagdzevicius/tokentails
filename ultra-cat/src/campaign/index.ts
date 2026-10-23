// CAMPAIGN lane registration point. main.ts calls registerCampaign() once at boot.
import { levels } from '../core/registry';
import { LEVELS } from './levels';
import { installCampaignRuntime } from './runtime';

export function registerCampaign(): void {
  for (const l of LEVELS) levels.add(l);
  installCampaignRuntime(); // props, water, trampling, neon flicker (frame hook + event listeners)
}
