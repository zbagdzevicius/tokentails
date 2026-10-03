// Every chain the client payouts page knows is also known to the Heist modal, with the same units.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAYOUT_CHAINS } from '../payouts';
import { PAYOUT_CHAIN_META } from '../shelter-payouts-chains';

const clientChains = readFileSync(join(__dirname, '../../../../client/components/shelter-payouts/chains.ts'), 'utf8');
const rows = [...clientChains.matchAll(/^\s*(\d+): \{ name: "([^"]+)".*?decimals: (\d+), symbol: "([^"]+)"/gm)];
// Mezo is in the client table but in no deploy wave, so the Heist does not read it.
const NOT_IN_HEIST = new Set([31612, 31611]);
// Tempo's USDC.e is bridged USDC: the Heist headline adds it to the USDC total on purpose.
const SYMBOL_ALIAS: Record<number, string> = { 4217: 'USDC' };

describe('Heist payout chains match the client table', () => {
  it('reads the client table', () => expect(rows.length).toBeGreaterThan(10));
  for (const [, id, name, decimals, symbol] of rows.filter((r) => !NOT_IN_HEIST.has(Number(r[1])))) {
    it(`${name} (${id})`, () => {
      const chain = PAYOUT_CHAINS[Number(id)];
      expect(chain, `PAYOUT_CHAINS has ${id}`).toBeDefined();
      expect(chain.decimals).toBe(Number(decimals));
      expect(chain.symbol).toBe(SYMBOL_ALIAS[Number(id)] ?? symbol);
      expect(PAYOUT_CHAIN_META[Number(id)]?.name, `PAYOUT_CHAIN_META has ${id}`).toBe(name);
    });
  }
});
