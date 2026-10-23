// CATS lane registration point. main.ts calls registerCats() once at boot.
import { cats } from '../core/registry';
import { CAT_DEFS } from './defs';

export function registerCats(): void {
  for (const c of CAT_DEFS) cats.add(c);
}
