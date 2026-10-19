/**
 * Rivalry ledger (GDD 8.2): dare wins and losses per opponent name, on this device only. Shown on the result screen
 * as "You 3 · Mochi 2". Pure update + a guarded storage wrapper.
 */
import { load, save } from '../../core/app/storage';

export type Ledger = Record<string, { me: number; them: number }>;

const KEY = 'rivalry';
const MAX = 40;

export function recordDuel(l: Ledger, name: string, iWon: boolean): Ledger {
  const key = name.slice(0, 24) || 'A cat';
  const row = l[key] ?? { me: 0, them: 0 };
  if (iWon) row.me++;
  else row.them++;
  // most recent opponent last (insertion order), capped
  delete l[key];
  l[key] = row;
  const keys = Object.keys(l);
  while (keys.length > MAX) delete l[keys.shift()!];
  return l;
}

export function ledgerLine(l: Ledger, name: string): string | null {
  const row = l[name.slice(0, 24) || 'A cat'];
  return row ? `Rivalry: You ${row.me} · ${name} ${row.them}` : null;
}

export const loadLedger = (): Ledger => load<Ledger>(KEY, {});
export const saveLedger = (l: Ledger): void => save(KEY, l);
