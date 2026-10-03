// fund fill — hermetic: temp application folders, deployments, fill map, values and campaign.
// Nothing is signed or sent; a:submission is stubbed through invoke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'fund-fill-'));
const ARC = '0x' + 'ab'.repeat(20);
const ARB_T = '0x' + 'cd'.repeat(20);
const PROOF = '0x' + 'ef'.repeat(32);
const TREAT = '0x' + '12'.repeat(32);
const WALLET = '0x' + '34'.repeat(20);

Object.assign(process.env, {
  FUND_FILL_MAP: join(tmp, 'map.json'),
  FUND_FILL_VALUES: join(tmp, 'values.json'),
  FUND_CAMPAIGN: join(tmp, 'campaign.json'),
  FUND_A_DEPLOYMENTS: join(tmp, 'deployments.json'),
});

writeFileSync(join(tmp, 'map.json'), JSON.stringify({
  '*': {
    DEMO_URL: { from: 'value' },
    SHELTER_WALLET: { from: 'campaign', path: 'shelter.wallet' },
    ARC_TX: { from: 'value', how: 'tap the treat' },
  },
  arc: {
    SPLIT_ADDRESS: { from: 'deploy', chain: 'arc', networks: ['mainnet'], token: 'USDC', field: 'address' },
    ARC_PROOF_TX: { from: 'deploy', chain: 'arc', networks: ['mainnet'], token: 'USDC', field: 'proof' },
    EURC_SPLIT_ADDRESS: { from: 'deploy', chain: 'arc', networks: ['mainnet'], token: 'EURC', field: 'address' },
  },
  arb: {
    ARB_SPLIT: { from: 'deploy', chain: 'arbitrum', networks: ['mainnet', 'testnet'], field: 'address' },
    ARB_NETWORK: { from: 'network-label', chain: 'arbitrum', networks: ['mainnet', 'testnet'], labels: { mainnet: 'Arbitrum One', testnet: 'Arbitrum Sepolia' } },
    _fallbacks: [{ when_missing: ['ARC_TX'], find: 'First treat: {ARC_TX}.', replace: 'Treats switch on soon.' }],
  },
}));
writeFileSync(join(tmp, 'campaign.json'), JSON.stringify({ shelter: { wallet: WALLET } }));
writeFileSync(join(tmp, 'deployments.json'), JSON.stringify([
  { chain: 'arc', network: 'mainnet', address: ARC, token: 'USDC', proofTxs: [PROOF] },
  { chain: 'arc', network: 'testnet', address: '0x' + '99'.repeat(20) },
  { chain: 'arbitrum', network: 'testnet', address: ARB_T },
]));
const values = (v) => writeFileSync(join(tmp, 'values.json'), JSON.stringify(v));
values({ DEMO_URL: '' });

function makeApp(slug, draft, fm = {}) {
  const dir = join(tmp, 'apps', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), `---\nstatus: ${fm.status || 'drafting'}\ndemo: ""\n---\n`);
  writeFileSync(join(dir, 'draft.md'), draft);
  return dir;
}
const apps = {
  arc: makeApp('arc', '---\nprogram: x\n---\n<!-- keep {SPLIT_ADDRESS} here -->\n## Proof\nAt {SPLIT_ADDRESS}, payout {ARC_PROOF_TX}, wallet {SHELTER_WALLET}, EURC {EURC_SPLIT_ADDRESS}. Demo: {DEMO_URL}.\n'),
  arb: makeApp('arb', '## Proof\n{ARB_NETWORK} at {ARB_SPLIT}. First treat: {ARC_TX}.\n'),
  done: makeApp('done', '## Proof\nAt {SHELTER_WALLET}.\n', { status: 'submitted' }),
};

const frontmatter = {};
const core = {
  listApps: () => Object.keys(apps),
  appDir: (s) => apps[s],
  loadApp: (s) => {
    const fm = Object.fromEntries(readFileSync(join(apps[s], 'call.md'), 'utf8').split('\n').filter((l) => l.includes(': ')).map((l) => l.split(': ')).map(([k, v]) => [k, v.replace(/^"|"$/g, '')]));
    return { slug: s, dir: apps[s], call: { fm: { ...fm, ...(frontmatter[s] || {}) } } };
  },
  updateFrontmatter: (path, patch) => { const s = Object.keys(apps).find((k) => path.startsWith(apps[k])); frontmatter[s] = { ...(frontmatter[s] || {}), ...patch }; },
};

const F = await import('../lib/commands/fill.mjs');
const cmd = F.default;
const quiet = async (fn) => { const log = console.log; const lines = []; console.log = (...a) => lines.push(a.join(' ')); try { return { code: await fn(), out: lines.join('\n') }; } finally { console.log = log; } };

test('validate: shapes by placeholder name', () => {
  assert.equal(F.validate('ARC_TX', PROOF), '');
  assert.match(F.validate('ARC_TX', '0x12'), /tx hash/);
  assert.match(F.validate('SPLIT_ADDRESS', 'nope'), /address/);
  assert.match(F.validate('DEMO_URL', 'http://x'), /https/);
  assert.equal(F.validate('ARB_NETWORK', 'Arbitrum One'), '');
});

test('placeholdersIn ignores HTML comments', () => {
  assert.deepEqual(F.placeholdersIn('<!-- {A_B} -->\nx {C_D} y'), ['C_D']);
});

test('dry run writes nothing and lists what is owed', async () => {
  const before = readFileSync(join(apps.arc, 'draft.md'), 'utf8');
  const calls = [];
  const { code, out } = await quiet(() => cmd.run({ args: [], flags: {}, core, invoke: async (a) => { calls.push(a); return 0; } }));
  assert.equal(code, 0);
  assert.equal(readFileSync(join(apps.arc, 'draft.md'), 'utf8'), before);
  assert.deepEqual(calls, []);
  assert.match(out, /\{EURC_SPLIT_ADDRESS\} still open/);
  assert.match(out, /\{DEMO_URL\}\s+arc/);
  assert.match(out, /done {2}\(submitted: skipped/);
});

test('--write fills from deployments, campaign and values; comments and closed apps stay; demo set; submission re-rendered', async () => {
  values({ DEMO_URL: 'https://youtu.be/abc', arc: { EURC_SPLIT_ADDRESS: '0x' + '56'.repeat(20) } });
  const calls = [];
  const { code } = await quiet(() => cmd.run({ args: [], flags: { write: true }, core, invoke: async (a) => { calls.push(a.join(' ')); return 0; } }));
  assert.equal(code, 0);
  const arc = readFileSync(join(apps.arc, 'draft.md'), 'utf8');
  assert.match(arc, /<!-- keep \{SPLIT_ADDRESS\} here -->/);
  assert.ok(arc.includes(`At ${ARC}, payout ${PROOF}, wallet ${WALLET}, EURC 0x${'56'.repeat(20)}. Demo: https://youtu.be/abc.`));
  const arb = readFileSync(join(apps.arb, 'draft.md'), 'utf8');
  assert.ok(arb.includes(`Arbitrum Sepolia at ${ARB_T}. First treat: {ARC_TX}.`), 'testnet fallback chosen in order, ARC_TX left open');
  assert.equal(readFileSync(join(apps.done, 'draft.md'), 'utf8'), '## Proof\nAt {SHELTER_WALLET}.\n');
  assert.equal(frontmatter.arc.demo, 'https://youtu.be/abc');
  assert.ok(calls.includes('a:submission arc') && calls.includes('a:submission arb') && !calls.includes('a:submission done'));
});

test('--fallbacks swaps the sentence that needs a missing value', async () => {
  const { code } = await quiet(() => cmd.run({ args: ['arb'], flags: { write: true, fallbacks: true }, core, invoke: async () => 0 }));
  assert.equal(code, 0);
  assert.ok(readFileSync(join(apps.arb, 'draft.md'), 'utf8').includes('Treats switch on soon.'));
});

test('an invalid pasted value blocks the write and exits 1', async () => {
  makeApp('arb', '## Proof\nFirst treat: {ARC_TX}.\n');
  values({ ARC_TX: '0xnothash' });
  const { code, out } = await quiet(() => cmd.run({ args: ['arb'], flags: { write: true }, core, invoke: async () => 0 }));
  assert.equal(code, 1);
  assert.match(out, /must be a 0x-prefixed 32-byte tx hash/);
  assert.equal(readFileSync(join(apps.arb, 'draft.md'), 'utf8'), '## Proof\nFirst treat: {ARC_TX}.\n');
});

test('a pasted value under the slug wins over the global one', () => {
  const ctx = { map: JSON.parse(readFileSync(join(tmp, 'map.json'), 'utf8')), values: { ARC_TX: PROOF, arb: { ARC_TX: TREAT } }, deployments: [], campaign: {} };
  assert.equal(F.resolve('ARC_TX', 'arb', ctx).value, TREAT);
  assert.equal(F.resolve('ARC_TX', 'arc', ctx).value, PROOF);
});

test('unknown slug exits 2', async () => {
  const { code } = await quiet(() => cmd.run({ args: ['nope'], flags: {}, core, invoke: async () => 0 }));
  assert.equal(code, 2);
});

test('track B: fills answers.md (not the generated draft.md) and re-renders with b:fill', async () => {
  const dir = join(tmp, 'apps-b', 'tb');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), '---\nstatus: drafting\ntrack: B\n---\n');
  writeFileSync(join(dir, 'answers.md'), '### issue_body\n\nEndpoint {X402_URL}, payment {PAY_TX}.\n');
  writeFileSync(join(dir, 'draft.md'), '---\ngenerated: "b:fill"\n---\nEndpoint {X402_URL}, payment {PAY_TX}.\n');
  const bcore = {
    listApps: () => ['tb'],
    appDir: () => dir,
    loadApp: () => ({ slug: 'tb', dir, call: { fm: { status: 'drafting', track: 'B' } } }),
    updateFrontmatter: () => {},
  };
  const map = { tb: { X402_URL: { from: 'value' }, PAY_TX: { from: 'value' } } };
  const plans = F.planFill({ core: bcore, slugs: ['tb'], map, values: { tb: { X402_URL: 'https://api.example.com/x', PAY_TX: TREAT } }, deployments: [], campaign: {} });
  assert.equal(plans.length, 1);
  assert.equal(plans[0].trackB, true);
  assert.equal(plans[0].draftPath, join(dir, 'answers.md'));
  assert.deepEqual(plans[0].filled.map((f) => f.key).sort(), ['PAY_TX', 'X402_URL']);
  assert.match(plans[0].next, /Endpoint https:\/\/api\.example\.com\/x, payment 0x12/);
});
