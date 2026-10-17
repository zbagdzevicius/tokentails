import { describe, expect, it, vi } from 'vitest';
import { deploymentsUrl, giveUsdc, pickSplit, units6ToWei18, usdcChoices, walletMessage } from './usdc';
import type { ShelterRailSdk, SdkChain } from './sdk';

const SPLIT = '0x457c89e10a6e66633eda5bf82fd086febb5db147';
const EURC_SPLIT = '0x' + '11'.repeat(20);
const deployments = [
  { contract: 'ShelterSplit', chainId: 5042, address: SPLIT, token: 'USDC' },
  { contract: 'ShelterSplit', chainId: 5042, address: EURC_SPLIT, token: 'EURC' },
  { contract: 'ShelterSplit', chainId: 8453, address: SPLIT, token: 'USDC' },
  { contract: 'DonateRouter', chainId: 42161, address: SPLIT },
  { contract: 'ShelterSplit', chainId: 4217, address: SPLIT, token: 'USDC.e' },
];
const chain = (name: string, nativeSymbol: string, coins: SdkChain['coins']): SdkChain => ({ name, rpc: '', explorer: '', nativeSymbol, nativeDecimals: 18, coins });
const CHAINS: Record<number, SdkChain> = {
  5042: chain('Arc', 'USDC', [{ symbol: 'USDC', address: '0x3600000000000000000000000000000000000000' }, { symbol: 'EURC', address: EURC_SPLIT }]),
  8453: chain('Base', 'ETH', [{ symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }]),
  42161: chain('Arbitrum One', 'ETH', [{ symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' }]),
  4217: chain('Tempo', 'USD', [{ symbol: 'USDC.e', address: '0x20C000000000000000000000b9537d11c60E8b50' }]),
};

describe('usdc chain choice', () => {
  it('never picks the EURC split', () => {
    expect(pickSplit(deployments, 5042)).toBe(SPLIT);
    expect(pickSplit([deployments[1]], 5042)).toBeNull();
    expect(pickSplit(deployments, 42161)).toBeNull();
  });
  it('offers Arc only, whatever else the status lists', () => {
    const list = usdcChoices([8453, 42161, 5042, 4217, 999, 5042], deployments, CHAINS);
    expect(list.map((c) => [c.chainId, c.native, c.coin.symbol])).toEqual([[5042, true, 'USDC']]);
    expect(usdcChoices([8453, 4217], deployments, CHAINS)).toEqual([]);
  });
  it('converts 6-decimal units to Arc wei', () => {
    expect(units6ToWei18('5000000')).toBe(5_000_000_000_000_000_000n);
  });
  it('reads deployments same-origin only on tokentails.com', () => {
    expect(deploymentsUrl({ hostname: 'tokentails.com' })).toBe('/shelter-payouts/deployments.json');
    expect(deploymentsUrl({ hostname: 'localhost' })).toBe('https://tokentails.com/shelter-payouts/deployments.json');
  });
});

describe('giveUsdc', () => {
  const sdk = () =>
    ({
      donateWithInjected: vi.fn().mockResolvedValue({ txHash: '0xa', explorerUrl: 'https://e/tx/0xa' }),
      donateTokenWithInjected: vi.fn().mockResolvedValue({ txHash: '0xb', explorerUrl: 'https://e/tx/0xb' }),
    }) as unknown as ShelterRailSdk & { donateWithInjected: ReturnType<typeof vi.fn>; donateTokenWithInjected: ReturnType<typeof vi.fn> };
  const provider = { request: vi.fn() };
  const memo = 'tt:rave:3f9a0c1b7e2d4a65';

  it('Arc: native donate with the memo and 18-decimal value', async () => {
    const s = sdk();
    const [arc] = usdcChoices([5042], deployments, CHAINS);
    await giveUsdc({ sdk: s, provider, choice: arc, memo, amountUnits6: '5000000' });
    expect(s.donateWithInjected).toHaveBeenCalledWith(provider, { chainId: 5042, split: SPLIT, amountWei: 5n * 10n ** 18n, memo });
    expect(s.donateTokenWithInjected).not.toHaveBeenCalled();
  });
  // The token path stays in giveUsdc for the SDK's other chains (the rave itself never offers them).
  const baseChoice = { chainId: 8453, name: 'Base', split: SPLIT, coin: CHAINS[8453].coins[0], native: false };
  it('token path: approve + disburse with the coin and 6-decimal amount', async () => {
    const s = sdk();
    const base = baseChoice;
    await giveUsdc({ sdk: s, provider, choice: base, memo, amountUnits6: '10000000' });
    expect(s.donateTokenWithInjected).toHaveBeenCalledWith(provider, { chainId: 8453, split: SPLIT, token: CHAINS[8453].coins[0].address, amount: 10_000_000n, memo });
  });
  it('refuses a foreign memo or a zero amount', async () => {
    const s = sdk();
    const base = baseChoice;
    await expect(giveUsdc({ sdk: s, provider, choice: base, memo: 'tt:wallet:12345678', amountUnits6: '1000000' })).rejects.toThrow();
    await expect(giveUsdc({ sdk: s, provider, choice: base, memo, amountUnits6: '0' })).rejects.toThrow();
  });
  it('maps wallet errors', () => {
    expect(walletMessage({ code: 4001 })).toMatch(/cancelled/);
    expect(walletMessage(new Error('insufficient funds for gas'))).toMatch(/Not enough/);
  });
});

describe('real shelter-rail SDK + published splits', () => {
  it('loads the SDK and finds the Arc dollar split (and nothing else) in the published list', async () => {
    const { readFileSync } = await import('node:fs');
    const { loadSdk } = await import('./usdc');
    const sdk = await loadSdk();
    const real = JSON.parse(readFileSync(new URL('../../../client/public/shelter-payouts/deployments.json', import.meta.url), 'utf8'));
    const list = usdcChoices([5042, 8453, 42161, 43114, 4217, 4663, 143], real, sdk.CHAINS);
    expect(list.map((c) => c.chainId)).toEqual([5042]);
    expect(list[0].native).toBe(true);
    expect(list[0].coin.symbol).toBe('USDC');
    expect(list.every((c) => !/^EUR/.test(c.coin.symbol))).toBe(true);
    expect(typeof sdk.donateTokenWithInjected).toBe('function');
  });
});

describe('wallet app links (no injected wallet)', async () => {
  const { walletAppLinks } = await import('./usdc');
  it('opens this page in MetaMask or Coinbase Wallet', () => {
    expect(walletAppLinks('https://tokentails.com/rave?x=1')).toEqual([
      { name: 'MetaMask', url: 'https://metamask.app.link/dapp/tokentails.com/rave?x=1' },
      { name: 'Coinbase Wallet', url: 'https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Ftokentails.com%2Frave%3Fx%3D1' },
    ]);
    expect(walletAppLinks('http://localhost:5173/')).toEqual([]);
    expect(walletAppLinks('nope')).toEqual([]);
  });
});
