import { describe, expect, it, vi } from 'vitest';
import { createAdsApi, parseAdOrder, parseAdUsdcPay, parseAdsStatus } from './api';
import { ARC_TREASURY, TRANSFER_SELECTOR, checkAdPay, encodeTransfer, formatUnits6, sendAdUsdc, shortAddress } from './usdc';
import type { SdkChain } from '../checkout/sdk';

const USDC = '0x3600000000000000000000000000000000000000';
const chain = (name: string, explorer: string): SdkChain => ({ name, rpc: '', explorer, nativeSymbol: 'USDC', nativeDecimals: 18, coins: [{ symbol: 'USDC', address: USDC }, { symbol: 'EURC', address: '0x' + '22'.repeat(20) }] });
const CHAINS: Record<number, SdkChain> = { 5042: chain('Arc', 'https://explorer.arc.io'), 5042002: chain('Arc Testnet', 'https://explorer.testnet.arc.io') };
const PAY = { chainId: 5042, token: USDC, decimals: 6, recipient: ARC_TREASURY, amount: '100004321' };
const TX = '0x' + 'ab'.repeat(32);

describe('ads status: Card | Crypto', () => {
  const base = { enabled: true, publishableKey: 'pk_live_abc', card: true, usdc: { enabled: true, chains: [5042] }, priceCents: 10000, slots: [] };
  it('both open', () => {
    const st = parseAdsStatus(base);
    expect(st).toMatchObject({ enabled: true, card: true, publishableKey: 'pk_live_abc', usdc: { enabled: true, chains: [5042] }, reasons: { card: null, usdc: null } });
  });
  it('crypto alone opens the sheet without a publishable key', () => {
    const st = parseAdsStatus({ ...base, card: false, publishableKey: undefined, reasons: { card: 'stripe' } });
    expect(st).toMatchObject({ enabled: true, card: false, publishableKey: null, reasons: { card: 'stripe', usdc: null } });
  });
  it('an old server (no usdc field) still opens card', () => {
    const st = parseAdsStatus({ enabled: true, publishableKey: 'pk_test_abc', priceCents: 10000 });
    expect(st).toMatchObject({ enabled: true, card: true, usdc: { enabled: false, chains: [] } });
  });
  it('crypto is Arc only; nothing open → closed', () => {
    expect(parseAdsStatus({ ...base, usdc: { enabled: true, chains: [8453, 5042002] } })).toMatchObject({ usdc: { enabled: true, chains: [5042002] } });
    expect(parseAdsStatus({ ...base, usdc: { enabled: true, chains: [8453] } })).toMatchObject({ usdc: { enabled: false }, reasons: { usdc: 'chain' } });
    expect(parseAdsStatus({ ...base, publishableKey: 'sk_live_x', usdc: { enabled: false } })).toEqual({ enabled: false, reason: 'stripe' });
  });
});

describe('ad crypto answer', () => {
  it('keeps a well-formed Arc pay instruction only', () => {
    expect(parseAdUsdcPay(PAY)).toEqual(PAY);
    expect(parseAdUsdcPay({ ...PAY, amount: 100004321 })).toEqual(PAY);
    expect(parseAdUsdcPay({ ...PAY, chainId: 8453 })).toBeNull();
    expect(parseAdUsdcPay({ ...PAY, decimals: 18 })).toBeNull();
    expect(parseAdUsdcPay({ ...PAY, amount: '0' })).toBeNull();
    expect(parseAdUsdcPay({ ...PAY, amount: '1.5' })).toBeNull();
    expect(parseAdUsdcPay({ ...PAY, recipient: '0x' + '0'.repeat(40) })).toBeNull();
    expect(parseAdUsdcPay({ ...PAY, token: 'nope' })).toBeNull();
  });
  it('order rows carry method, usdc and payTx', () => {
    const o = parseAdOrder({ adId: 'ad_0123456789abcdef', slotId: 'screen-2', status: 'held', method: 'usdc', usdc: PAY, payTx: 'bad' });
    expect(o).toMatchObject({ method: 'usdc', usdc: PAY, payTx: null });
    expect(parseAdOrder({ adId: 'ad_0123456789abcdef', slotId: 'screen-2', status: 'held' })).not.toHaveProperty('usdc');
  });
  it('checkout posts method usdc without a fee; usdc-tx posts the hash', async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/checkout')) {
        const form = init.body as FormData;
        expect(form.get('method')).toBe('usdc');
        expect(form.get('coverFee')).toBe('false');
        return new Response(JSON.stringify({ adId: 'ad_0123456789abcdef', slotId: 'screen-1', status: 'held', method: 'usdc', usdc: PAY, priceCents: 10000, amountCents: 10000 }), { status: 201 });
      }
      expect(url).toBe('https://api.example.com/rave/ads/ad_0123456789abcdef/usdc-tx');
      expect(JSON.parse(String(init.body))).toEqual({ txHash: TX });
      return new Response(JSON.stringify({ adId: 'ad_0123456789abcdef', slotId: 'screen-1', status: 'review', payTx: TX }), { status: 200 });
    });
    const api = createAdsApi({ base: 'https://api.example.com', fetchFn: fetchFn as unknown as typeof fetch });
    const o = await api.checkout({ slotId: 'screen-1', name: 'Purr', url: 'https://a.com/', x: '', coverFee: true, clientKey: 'k-12345678', image: new Blob(['x']), method: 'usdc' });
    expect(o.usdc).toEqual(PAY);
    expect(await api.usdcTx('ad_0123456789abcdef', TX)).toMatchObject({ status: 'review', payTx: TX });
    await expect(api.usdcTx('ad_0123456789abcdef', '0x12')).rejects.toMatchObject({ code: 'BAD_INPUT' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('ad USDC transfer', () => {
  it('encodes transfer(address,uint256)', () => {
    const data = encodeTransfer(ARC_TREASURY, 100_004_321n);
    expect(data.slice(0, 10)).toBe(TRANSFER_SELECTOR);
    expect(data).toHaveLength(10 + 128);
    expect(data.slice(10, 74)).toBe(ARC_TREASURY.slice(2).toLowerCase().padStart(64, '0'));
    expect(BigInt('0x' + data.slice(74))).toBe(100_004_321n);
    expect(() => encodeTransfer('0x12', 1n)).toThrow();
    expect(() => encodeTransfer(ARC_TREASURY, 0n)).toThrow();
  });
  it('formats 6-decimal amounts and short addresses', () => {
    expect(formatUnits6('100004321')).toBe('100.004321');
    expect(formatUnits6('100000000')).toBe('100');
    expect(formatUnits6('100000100')).toBe('100.0001');
    expect(shortAddress(ARC_TREASURY)).toBe('0x7b13…7C9A');
  });
  it('trusts only Arc USDC to the published treasury on mainnet', () => {
    expect(checkAdPay(PAY, CHAINS)).toBeNull();
    expect(checkAdPay({ ...PAY, token: '0x' + '22'.repeat(20) }, CHAINS)).toBe('token');
    expect(checkAdPay({ ...PAY, recipient: '0x' + '33'.repeat(20) }, CHAINS)).toBe('recipient');
    expect(checkAdPay({ ...PAY, chainId: 5042002, recipient: '0x' + '33'.repeat(20) }, CHAINS)).toBeNull();
    expect(checkAdPay({ ...PAY, chainId: 8453 }, CHAINS)).toBe('chain');
  });
  it('switches (adding Arc when unknown) and sends one transfer to the token', async () => {
    let chain = '0x1';
    const calls: { method: string; params?: unknown }[] = [];
    const provider = {
      request: vi.fn(async (a: { method: string; params?: unknown }) => {
        calls.push(a);
        if (a.method === 'eth_requestAccounts') return ['0x' + '44'.repeat(20)];
        if (a.method === 'eth_chainId') return chain;
        if (a.method === 'wallet_switchEthereumChain') throw Object.assign(new Error('unknown chain'), { code: 4902 });
        if (a.method === 'wallet_addEthereumChain') {
          chain = '0x13b2';
          return null;
        }
        if (a.method === 'eth_sendTransaction') return TX;
        throw new Error(a.method);
      }),
    };
    const addParams = vi.fn(() => ({ chainId: '0x13b2' }));
    const r = await sendAdUsdc({ provider, pay: PAY, addParams, sdkChains: CHAINS });
    expect(r).toEqual({ txHash: TX, from: '0x' + '44'.repeat(20), explorerUrl: `https://explorer.arc.io/tx/${TX}` });
    expect(addParams).toHaveBeenCalledWith(5042);
    const send = calls.find((c) => c.method === 'eth_sendTransaction')!.params as [{ to: string; data: string; value: string }];
    expect(send[0]).toMatchObject({ to: USDC, value: '0x0', data: encodeTransfer(ARC_TREASURY, 100_004_321n) });
  });
  it('refuses to send when the wallet did not really switch to Arc', async () => {
    const provider = {
      request: vi.fn(async (a: { method: string }) => {
        if (a.method === 'eth_requestAccounts') return ['0x' + '44'.repeat(20)];
        if (a.method === 'eth_chainId') return '0x1';
        if (a.method === 'wallet_switchEthereumChain') return null;
        throw new Error(a.method);
      }),
    };
    await expect(sendAdUsdc({ provider, pay: PAY, addParams: () => null, sdkChains: CHAINS })).rejects.toMatchObject({ code: 'WRONG_CHAIN' });
    expect(provider.request.mock.calls.some(([a]) => (a as { method: string }).method === 'eth_sendTransaction')).toBe(false);
  });
  it('caps the amount at the ad price plus about 2 cents', () => {
    expect(checkAdPay({ ...PAY, amount: '100010001' }, CHAINS, 10000)).toBeNull();
    expect(checkAdPay({ ...PAY, amount: '100019999' }, CHAINS, 10000)).toBeNull();
    expect(checkAdPay({ ...PAY, amount: '100020000' }, CHAINS, 10000)).toBe('amount');
    expect(checkAdPay({ ...PAY, amount: '99999999' }, CHAINS, 10000)).toBe('amount');
    expect(checkAdPay({ ...PAY, amount: '1000000000' }, CHAINS, 10000)).toBe('amount');
  });
  it('never opens the wallet for an untrusted instruction', async () => {
    const provider = { request: vi.fn() };
    await expect(sendAdUsdc({ provider, pay: { ...PAY, recipient: '0x' + '33'.repeat(20) }, addParams: () => null, sdkChains: CHAINS })).rejects.toThrow(/bad pay instruction/);
    expect(provider.request).not.toHaveBeenCalled();
  });
  it('the real SDK knows Arc USDC and how to add Arc', async () => {
    const { loadSdk } = await import('../checkout/usdc');
    const sdk = await loadSdk();
    expect(checkAdPay(PAY, sdk.CHAINS)).toBeNull();
    expect(sdk.addChainParams(5042)).toMatchObject({ chainId: '0x13b2', nativeCurrency: { symbol: 'USDC' } });
  });
});
