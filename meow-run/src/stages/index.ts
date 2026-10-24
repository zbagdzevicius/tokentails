// Stage registry entry (SETPIECES lane). Called once by main.ts.
import { stages } from '../core/registry';
import { endless } from './endless';
import { gorge } from './gorge';
import { meadow } from './meadow';
import { sunset } from './sunset';

export function registerStages(): void {
  for (const st of [meadow, gorge, sunset, endless]) stages.add(st);
}
