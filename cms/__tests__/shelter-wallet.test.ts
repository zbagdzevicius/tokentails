import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decodePayoutData,
  fetchWalletBalances,
  formatUnits,
  hexToBigInt,
  totalIn
} from '@/lib/shelter-wallet/balances';
import { WALLET_CHAINS } from '@/lib/shelter-wallet/chains';
import { defaultShelterWallet } from '@/components/shelters/shelter-wallet';

const W = '0x3c833562e682dB66C2415b34961595df135f4771';

describe('chains match backend wallet.config.ts', () => {
  const src = readFileSync(
    join(__dirname, '../../backend/src/shelter/onchain/wallet.config.ts'),
    'utf8'
  );
  const block = (key: string) => {
    const start = src.indexOf(`    ${key}: {`);
    const end = src.indexOf('\n    },', start);
    return src.slice(start, end);
  };
  const field = (b: string, name: string) =>
    b.match(new RegExp(`\\b${name}: '?([^',\\n]+)'?,`))?.[1];

  it('covers every mainnet', () => {
    const keys = src.match(/^    \w+(?=: \{$)/gm)!.map((k) => k.trim());
    const mainnets = keys.filter((k) => block(k).includes("network: 'mainnet'"));
    expect(WALLET_CHAINS.map((c) => c.key).sort()).toEqual(mainnets.sort());
  });

  it.each(WALLET_CHAINS.map((c) => [c.key, c] as const))('%s', (key, c) => {
    const b = block(key);
    expect(Number(field(b, 'chainId'))).toBe(c.chainId);
    expect(field(b, 'rpc')).toBe(c.rpc);
    expect(field(b, 'explorer')).toBe(c.explorer);
    for (const t of c.tokens) {
      const i = b.indexOf(`address: '${t.address}'`);
      expect(i).toBeGreaterThan(0);
      const tok = b.slice(b.lastIndexOf('symbol:', i), i);
      expect(field(tok, 'symbol')).toBe(t.symbol);
      expect(Number(field(tok, 'decimals'))).toBe(t.decimals);
    }
  });
});

describe('pure helpers', () => {
  it('decodes hex', () => {
    expect(hexToBigInt('0x')).toBe(BigInt(0));
    expect(hexToBigInt('0x0186a0')).toBe(BigInt(100000));
    expect(() => hexToBigInt('nope')).toThrow();
  });

  it('formats units', () => {
    expect(formatUnits(BigInt(100000), 6)).toBe('0.1');
    expect(formatUnits(BigInt('668000000000000000'), 18, 4)).toBe('0.668');
    expect(formatUnits(BigInt(0), 6)).toBe('0');
    expect(formatUnits(BigInt(12345678), 6, 2)).toBe('12.34');
  });

  it('decodes NativeDisbursed data', () => {
    const memo = Buffer.from('treat').toString('hex').padEnd(64, '0');
    const data =
      '0x' +
      BigInt(10).toString(16).padStart(64, '0') +
      (64).toString(16).padStart(64, '0') +
      (5).toString(16).padStart(64, '0') +
      memo;
    expect(decodePayoutData(data)).toEqual({ amount: BigInt(10), memo: 'treat' });
  });

  it('picks the default wallet', () => {
    expect(defaultShelterWallet({ publicWallet: W.toLowerCase() })).toBe(W.toLowerCase());
    expect(defaultShelterWallet({ name: 'Pink Paw' })).toBe(W);
    expect(defaultShelterWallet({ slug: 'pink-paw' })).toBe(W);
    expect(defaultShelterWallet({ name: 'Other' })).toBe('');
  });
});

describe('fetchWalletBalances (mocked fetch)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('reads every chain, totals USD, keeps EUR apart, isolates a failing RPC', async () => {
    global.fetch = jest.fn(async (url: string, init: { body: string }) => {
      if (url.includes('base')) throw new Error('down');
      const { method, params, id } = JSON.parse(init.body);
      let result = '0x' + BigInt(100000).toString(16); // 0.10 of a 6-decimal token
      if (method === 'eth_getBalance') {
        result = url.includes('arc') ? '0x' + BigInt('668000000000000000').toString(16) : '0x0';
      }
      if (method === 'eth_call') expect(params[0].data.slice(0, 10)).toBe('0x70a08231');
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id, result }) };
    }) as unknown as typeof fetch;

    const rows = await fetchWalletBalances(W);
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.chain.name === 'Base')!.error).toBe('down');
    expect(rows.find((r) => r.chain.name === 'Tempo')!.native).toBeNull();
    // Arc 0.668 native USDC + 5 chains x 0.10; Base failed.
    expect(totalIn(rows, 'USD')).toBeCloseTo(1.168, 6);
    expect(totalIn(rows, 'EUR')).toBeCloseTo(0.1, 6);
  });
});
