// The backend's generated public wallet config (backend/src/shelter/onchain/wallet.config.ts) must be
// exactly what `fund a:backend-deployments` writes from the committed records, and its default-split
// rule must be deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const A = join(HERE, '..', 'tracks', 'a-build');
const read = (f) => JSON.parse(readFileSync(join(A, f), 'utf8'));

await import('../tracks/a-build/track.mjs');
const W = await import('../tracks/a-build/wave.mjs');

test('wallet.config.ts is in sync with chains.json, deployments, routers and public wallets', () => {
  const chains = read('chains.json');
  delete chains._readme;
  const want = W.walletConfigSource(W.walletConfig({
    list: read('deployments.json'),
    chains,
    routers: read('router-deployments.json'),
    wallets: read('wallets.public.json').wallets,
  }));
  const have = readFileSync(join(HERE, '..', '..', '..', 'backend', 'src', 'shelter', 'onchain', 'wallet.config.ts'), 'utf8');
  assert.equal(have, want, 'run: node bin/fund.mjs a:backend-deployments');
});

test('default split: the router-backed primary-token instance, else the newest; never EURC', () => {
  const chains = { base: { name: 'Base', networks: { testnet: { chainId: 84532, publicRpc: 'https://r', explorer: 'https://x', usdc: '0x' + '11'.repeat(20), splitTokens: { EURC: { address: '0x' + '22'.repeat(20), decimals: 6 } } } } } };
  const a = '0x' + 'aa'.repeat(20), b = '0x' + 'bb'.repeat(20), e = '0x' + 'ee'.repeat(20);
  const dep = (address, token) => ({ contract: 'ShelterSplit', chain: 'base', network: 'testnet', chainId: 84532, address, token });
  const list = [dep(a, 'USDC'), dep(b, 'USDC'), dep(e, 'EURC')];
  let cfg = W.walletConfig({ list, chains });
  assert.equal(cfg.chains.baseTestnet.split.address, b); // newest
  assert.deepEqual(cfg.chains.baseTestnet.otherSplits.map((s) => s.address), [a, e]);
  cfg = W.walletConfig({ list, chains, routers: [{ chainId: 84532, network: 'testnet', router: '0x' + 'cc'.repeat(20), split: a, fromBlock: 7 }] });
  assert.equal(cfg.chains.baseTestnet.split.address, a); // router-backed wins
  assert.equal(cfg.chains.baseTestnet.split.routerFromBlock, 7);
  cfg = W.walletConfig({ list: [dep(e, 'EURC')], chains });
  assert.equal(cfg.chains.baseTestnet.split, null); // a second token is never the default
});

test('C4/BE-5: Tempo mainnet pays USDC.e: the generated config, the published symbol and the token lookups agree', () => {
  const chains = read('chains.json');
  const n = chains.tempo.networks.mainnet;
  assert.equal(n.usdcSymbol, 'USDC.e');
  assert.equal(W.splitToken(n).symbol, 'USDC.e');
  assert.equal(W.splitToken(n, 'USDC').alt, false, 'asking for USDC on Tempo still means its bridged USDC');
  assert.equal(W.tokenSymbolOf(n, n.usdc), 'USDC.e');
  const SPLIT = '0x' + 'aa'.repeat(20);
  const list = [{ contract: 'ShelterSplit', chain: 'tempo', network: 'mainnet', chainId: 4217, address: SPLIT, token: 'USDC.e' }];
  delete chains._readme;
  const cfg = W.walletConfig({ list, chains, routers: [], wallets: [] });
  assert.equal(cfg.chains.tempoMainnet.token.symbol, 'USDC.e');
  assert.equal(cfg.chains.tempoMainnet.split.token.symbol, 'USDC.e');
  assert.equal(W.publicDeployments(list, chains, 'mainnet')[0].symbol, 'USDC.e');
  // the backend's own label for 4217 (impact indexer units) says the same
  const logs = readFileSync(join(HERE, '..', '..', '..', 'backend', 'src', 'impact', 'shelter-logs.ts'), 'utf8');
  assert.match(logs, /4217[^\n]*USDC\.e/);
});

test('C5: Arc mainnet source verification goes to Sourcify (explorer.arc.io/api sits behind a Cloudflare challenge)', () => {
  const v = read('chains.json').arc.networks.mainnet.verifier;
  assert.equal(v.type, 'sourcify');
  assert.equal(v.url, 'https://sourcify.dev/server');
});
