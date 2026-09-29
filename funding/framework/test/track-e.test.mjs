import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const tmp = mkdtempSync(join(tmpdir(), 'fund-e-'));
process.env.FUND_APPS_DIR = join(tmp, 'apps');
process.env.FUND_E_WATCHLIST = join(tmp, 'watchlist.json');
process.env.FUND_E_STATE = join(tmp, 'state.json');
process.env.FUND_E_CHANGES = join(tmp, 'E-CHANGES.md');
process.env.FUND_TRACKER = join(tmp, 'TRACKER.md');
process.env.FUND_PORTFOLIO = join(tmp, 'opportunities.json');
process.env.FUND_E_TRIAGE = join(tmp, 'E-TRIAGE.md');
process.env.FUND_NOW = '2026-09-26T12:00:00Z';
mkdirSync(process.env.FUND_APPS_DIR, { recursive: true });

const { CORE } = await import('../lib/core.mjs');
const { extract, diff, rssItems, scan, formatItem } = await import('../tracks/e-monitor/scanner.mjs');
const track = (await import('../tracks/e-monitor/track.mjs')).default;
const { main } = await import('../bin/fund.mjs');

// ---------- local fixture server ----------
const fixtures = {
  '/api.json': { type: 'application/json', body: JSON.stringify([{ title: 'Alpha', rewardAmount: 100, token: 'USDC' }, { title: 'Beta', rewardAmount: 50, token: 'USDG' }]) },
  '/page.html': { type: 'text/html', body: '<html><script>var x=1</script><body><h2>Call A</h2><p>Deadline soon</p></body></html>' },
  '/feed.xml': { type: 'application/rss+xml', body: '<rss><channel><item><title>New grant program</title></item><item><title><![CDATA[Weekly call & notes]]></title></item></channel></rss>' },
  '/wp.json': { type: 'application/json', body: JSON.stringify([{ id: 839, modified: '2025-09-25T15:08:35' }, { id: 1, modified: 'x' }]) },
  '/boom': { status: 500, type: 'text/plain', body: 'error' },
  '/slow': { delay: 3000, type: 'text/plain', body: 'late' },
};
let server; let base;
before(async () => {
  server = createServer((req, res) => {
    const f = fixtures[req.url];
    if (!f) { res.writeHead(404); res.end('nope'); return; }
    const send = () => { res.writeHead(f.status || 200, { 'content-type': f.type }); res.end(f.body); };
    if (f.delay) setTimeout(send, f.delay); else send();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); server.close(); });

function watchlist() {
  return [
    { id: 'api', url: `${base}/api.json`, kind: 'json', item: '{title} — {rewardAmount} {token}', feeds_track: 'new' },
    { id: 'page', url: `${base}/page.html`, kind: 'html', feeds_track: 'C' },
    { id: 'feed', url: `${base}/feed.xml`, kind: 'rss', feeds_track: 'A' },
    { id: 'wp', url: `${base}/wp.json`, kind: 'wp-modified', extract: '839', feeds_track: 'C' },
    { id: 'gone', url: `${base}/missing`, kind: 'status', feeds_track: 'C' },
    { id: 'boom', url: `${base}/boom`, kind: 'html', feeds_track: 'new' },
  ];
}

// ---------- pure functions ----------
test('extract: json list with item template, html hash ignores scripts, rss titles with CDATA, wp modified, status', () => {
  assert.deepEqual(extract({ kind: 'json', item: '{title} ({token})' }, { status: 200, text: fixtures['/api.json'].body }).items, ['Alpha (USDC)', 'Beta (USDG)']);
  const h1 = extract({ kind: 'html' }, { status: 200, text: '<script>var a=1</script><p>Hello</p>' });
  const h2 = extract({ kind: 'html' }, { status: 200, text: '<script>var a=2</script><p>Hello</p>' });
  assert.equal(h1.hash, h2.hash, 'script changes must not change the hash');
  assert.deepEqual(rssItems(fixtures['/feed.xml'].body), ['New grant program', 'Weekly call & notes']);
  assert.equal(extract({ kind: 'wp-modified', extract: '839' }, { status: 200, text: fixtures['/wp.json'].body }).value, '2025-09-25T15:08:35');
  assert.equal(extract({ kind: 'status' }, { status: 404, text: '' }).value, '404');
  assert.throws(() => extract({ kind: 'html' }, { status: 500, text: '' }), /HTTP 500/);
  assert.throws(() => extract({ kind: 'wp-modified', extract: '7' }, { status: 200, text: '[]' }), /not found/);
});

test('extract: html regex captures and keyword filtering', () => {
  const r = extract({ kind: 'html', extract: 'kvietimai/([a-z-]+)', keywords: ['startuol'] }, { status: 200, text: 'x kvietimai/startuoliu-kvietimas y kvietimai/vandens-tiekimas z kvietimai/startuoliu-kvietimas' });
  assert.deepEqual(r.items, ['startuoliu-kvietimas']);
});

test('diff: NEW, UNCHANGED, CHANGED with added/removed, scalar and hash changes', () => {
  const a = { type: 'list', items: ['x', 'y'] };
  assert.equal(diff(undefined, a).status, 'NEW');
  assert.equal(diff(a, { type: 'list', items: ['y', 'x'] }).status, 'UNCHANGED');
  assert.deepEqual(diff(a, { type: 'list', items: ['y', 'z'] }), { status: 'CHANGED', added: ['z'], removed: ['x'] });
  assert.deepEqual(diff({ type: 'scalar', value: '404' }, { type: 'scalar', value: '200' }), { status: 'CHANGED', from: '404', to: '200' });
  assert.equal(diff({ type: 'hash', hash: 'a' }, { type: 'hash', hash: 'b' }).status, 'CHANGED');
});

test('formatItem falls back to title/name/id and tolerates missing keys', () => {
  assert.equal(formatItem({ name: 'N' }), 'N');
  assert.equal(formatItem({ title: 'T' }, '{title} — {missing}'), 'T —');
});

// ---------- scan over HTTP ----------
test('scan: first run NEW, second UNCHANGED, mutated fixture CHANGED; a 500 is an ERROR and does not stop others', async () => {
  const list = watchlist();
  const first = await scan(list, {}, { timeoutMs: 2000 });
  const by = (rs) => Object.fromEntries(rs.map((r) => [r.src.id, r]));
  const f = by(first.results);
  assert.equal(f.api.status, 'NEW');
  assert.equal(f.feed.status, 'NEW');
  assert.equal(f.wp.status, 'NEW');
  assert.equal(f.gone.status, 'NEW');
  assert.equal(f.gone.cur.value, '404');
  assert.equal(f.boom.status, 'ERROR');

  const second = by((await scan(list, first.state, { timeoutMs: 2000 })).results);
  for (const id of ['api', 'page', 'feed', 'wp', 'gone']) assert.equal(second[id].status, 'UNCHANGED', id);

  const saved = fixtures['/api.json'].body;
  fixtures['/api.json'].body = JSON.stringify([{ title: 'Beta', rewardAmount: 50, token: 'USDG' }, { title: 'Gamma', rewardAmount: 900, token: 'USDC' }]);
  fixtures['/wp.json'].body = JSON.stringify([{ id: 839, modified: '2026-10-01T09:00:00' }]);
  const third = by((await scan(list, first.state, { timeoutMs: 2000 })).results);
  assert.deepEqual(third.api.added, ['Gamma — 900 USDC']);
  assert.deepEqual(third.api.removed, ['Alpha — 100 USDC']);
  assert.equal(third.wp.to, '2026-10-01T09:00:00');
  fixtures['/api.json'].body = saved;
});

test('scan: a slow source times out as ERROR', async () => {
  const { results } = await scan([{ id: 'slow', url: `${base}/slow`, kind: 'html' }], {}, { timeoutMs: 300 });
  assert.equal(results[0].status, 'ERROR');
  assert.match(results[0].error, /timeout/);
});

test('scan: offline fixtures directory', async () => {
  const dir = join(tmp, 'fx');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'feed.xml'), '<rss><item><title>Offline item</title></item></rss>');
  const { results } = await scan([{ id: 'feed', url: 'https://example.invalid/x', kind: 'rss' }], {}, { offlineDir: dir });
  assert.deepEqual(results[0].cur.items, ['Offline item']);
});

// ---------- commands through the real CLI ----------
test('e:add validates and appends; e:scan writes state and E-CHANGES.md; unknown --only fails', async () => {
  writeFileSync(process.env.FUND_E_WATCHLIST, JSON.stringify(watchlist()));
  assert.equal(await main(['e:add', 'extra', `${base}/feed.xml`, '--kind', 'rss', '--feeds', 'A']), 0);
  assert.equal(await main(['e:add', 'extra', `${base}/feed.xml`, '--kind', 'rss']), 1, 'duplicate id');
  assert.equal(await main(['e:add', 'bad', 'ftp://x', '--kind', 'rss']), 1, 'bad url');
  assert.equal(await main(['e:add', 'bad2', `${base}/x`, '--kind', 'nope']), 1, 'bad kind');
  const list = JSON.parse(readFileSync(process.env.FUND_E_WATCHLIST, 'utf8'));
  assert.ok(list.some((s) => s.id === 'extra'));

  assert.equal(await main(['e:scan', '--timeout', '2000']), 0, 'errors in one source must not fail the scan');
  assert.ok(existsSync(process.env.FUND_E_STATE));
  const md = readFileSync(process.env.FUND_E_CHANGES, 'utf8');
  assert.match(md, /\| NEW \| \[api\]/);
  assert.match(md, /\| ERROR \| \[boom\]/);
  assert.equal(await main(['e:scan', '--only', 'nope']), 2);
});

test('e:triage renders a prompt with the changes and no leftover placeholders', async () => {
  const out = join(tmp, 'triage.txt');
  assert.equal(await main(['e:triage', '--out', out]), 0);
  const text = readFileSync(out, 'utf8');
  assert.match(text, /Watchlist changes/);
  assert.match(text, /BGA/);
  assert.doesNotMatch(text, /\{\{[A-Z]+\}\}/);
});

// ---------- application checks ----------
function makeApp(slug, fm) {
  const dir = join(process.env.FUND_APPS_DIR, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'call.md'), CORE.stringifyFrontmatter({ program: slug, track: 'E', status: 'parked', deadline: 'rolling', ...fm }) + '| C1 | T | — | "q" |\n');
  writeFileSync(join(dir, 'draft.md'), '---\nversion: 1\n---\n## Trigger <!-- criterion: C1 -->\nWhen the call reopens.\n');
}
const lvl = (results, name) => results.find((r) => r.name === name)?.level;

test('checks: unknown watch ids error, past revisit warns, bad revisit errors, good app passes', async () => {
  makeApp('e-good', { watch: ['api', 'feed'], revisit: '2099-01-01' });
  makeApp('e-unknown', { watch: ['api', 'ghost'], revisit: '2099-01-01' });
  makeApp('e-past', { watch: ['api'], revisit: '2020-01-01' });
  makeApp('e-bad', { watch: ['api'], revisit: 'someday' });
  const good = await CORE.runChecks('e-good');
  assert.equal(good.ok, true, JSON.stringify(good.results.filter((r) => r.level === 'error')));
  assert.equal(lvl((await CORE.runChecks('e-unknown')).results, 'E:watch'), 'error');
  assert.equal(lvl((await CORE.runChecks('e-past')).results, 'E:revisit'), 'warn');
  assert.equal(lvl((await CORE.runChecks('e-bad')).results, 'E:revisit'), 'error');
});

test('e:remind lists only Track E apps whose revisit has arrived', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (m) => logs.push(String(m));
  try { await track.commands['e:remind'].run({ flags: { now: '2026-09-26' }, core: CORE }); } finally { console.log = orig; }
  const out = logs.join('\n');
  assert.match(out, /e-past/);
  assert.doesNotMatch(out, /e-good/);
});

test('fund new --track E scaffolds a parked monitoring app', async () => {
  assert.equal(await main(['new', 'e-fresh', '--track', 'E', '--program', 'Fresh watch']), 0);
  const { fm } = CORE.parseFrontmatter(readFileSync(join(process.env.FUND_APPS_DIR, 'e-fresh', 'call.md'), 'utf8'));
  assert.equal(fm.track, 'E');
  assert.equal(fm.status, 'parked');
});

// ---------- e:triage --run --apply (stub AI answer with a fenced json block) ----------
const STUB = join(import.meta.dirname, 'fixtures', 'portfolio-ai-stub.mjs');

test('triage prompt requires a fenced json array with the agreed keys', () => {
  const text = readFileSync(join(import.meta.dirname, '..', 'tracks', 'e-monitor', 'prompts', 'triage.md'), 'utf8');
  assert.match(text, /```json/);
  for (const k of ['source', 'opportunity', 'track', 'program', 'url', 'deadline', 'reason']) assert.match(text, new RegExp(`"${k}"`));
});

test('e:triage --apply needs --run or --from', async () => {
  assert.equal(await main(['e:triage', '--apply']), 2);
});

test('e:triage --run --apply scaffolds new YES rows, dedupes, applies exclusions, adds COND portfolio entries', async () => {
  writeFileSync(process.env.FUND_PORTFOLIO, JSON.stringify({ version: 1, opportunities: [
    { id: 7, program: 'Seed Program', track: 'B', slug: 'seed-program', url: 'https://seed.example', deadline: 'rolling', capital_mid_usd: 1000, success: 0.1, framework_hours: 1, verdict: 'DO', condition: '', frame: '', notes: '' },
  ] }));
  const hdir = join(process.env.FUND_APPS_DIR, 'hack-app');
  mkdirSync(hdir, { recursive: true });
  writeFileSync(join(hdir, 'call.md'), CORE.stringifyFrontmatter({ program: 'Some hackathon', track: 'A', status: 'drafting', deadline: 'rolling', url: 'https://existing.example/hack' }));
  process.env.FUND_AI_CMD = `node "${STUB}"`;
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  let code;
  try { code = await main(['e:triage', '--run', '--apply']); } finally { console.log = orig; }
  const out = logs.join('\n');
  assert.equal(code, 0, out);
  assert.ok(existsSync(process.env.FUND_E_TRIAGE), 'raw answer saved for --from');
  assert.match(out, /ADDED\s+gamma-builders-grant/);
  assert.match(out, /DUPLICATE\s+gamma-builders-grant/);
  assert.match(out, /DUPLICATE\s+existing-hackathon/);
  assert.match(out, /EXCLUDED\s+bga-ascend-2027\s+excluded program/);
  assert.match(out, /EXCLUDED\s+mantle-ecofund/);
  assert.match(out, /EXCLUDED\s+desert-residency\s+not remote/);
  assert.match(out, /EXCLUDED\s+cloudy-startups\s+not a grant/);
  assert.match(out, /SKIPPED\s+old-round\s+deadline 2020-01-01 passed/);
  assert.match(out, /2 added · 2 duplicate · 4 excluded/);
  assert.match(out, /next: confirm each new COND entry.*node bin\/fund.mjs go$/m);

  const apps = CORE.listApps();
  assert.ok(apps.includes('gamma-builders-grant'));
  assert.ok(apps.includes('delta-prize'));
  for (const s of ['bga-ascend-2027', 'mantle-ecofund', 'desert-residency', 'cloudy-startups', 'old-round', 'existing-hackathon']) assert.ok(!apps.includes(s), s);
  const gamma = CORE.loadApp('gamma-builders-grant').call.fm;
  assert.equal(gamma.track, 'B');
  assert.equal(gamma.url, 'https://gamma.example/grants');
  assert.equal(CORE.loadApp('delta-prize').call.fm.track, 'B', 'unknown track letter falls back to B');

  const doc = JSON.parse(readFileSync(process.env.FUND_PORTFOLIO, 'utf8'));
  assert.equal(doc.opportunities.length, 3);
  const g = doc.opportunities.find((o) => o.slug === 'gamma-builders-grant');
  assert.equal(g.verdict, 'COND');
  assert.equal(g.condition_met, false);
  assert.equal(g.id, 8);
  assert.match(g.notes, /e:triage --apply on 2026-09-26 from source api/);

  // re-applying the saved answer adds nothing new
  const logs2 = [];
  console.log = (...a) => logs2.push(a.join(' '));
  try { assert.equal(await main(['e:triage', '--apply', '--from', process.env.FUND_E_TRIAGE]), 0); } finally { console.log = orig; }
  assert.match(logs2.join('\n'), /0 added · 4 duplicate/);
  assert.equal(JSON.parse(readFileSync(process.env.FUND_PORTFOLIO, 'utf8')).opportunities.length, 3);
});

test('e:triage --apply --dry writes nothing; unparseable answers fail with a hint', async () => {
  const f = join(tmp, 'answer.md');
  writeFileSync(f, '```json\n[{"source":"x","opportunity":"YES","track":"C","program":"Omega Fund Grant","url":"https://omega.example","deadline":"rolling","reason":"remote grant"}]\n```\n');
  const before = readFileSync(process.env.FUND_PORTFOLIO, 'utf8');
  assert.equal(await main(['e:triage', '--apply', '--from', f, '--dry']), 0);
  assert.equal(readFileSync(process.env.FUND_PORTFOLIO, 'utf8'), before);
  assert.ok(!CORE.listApps().includes('omega-fund-grant'));
  writeFileSync(f, 'no json here');
  assert.equal(await main(['e:triage', '--apply', '--from', f]), 1);
});

test('regression: an invoke that throws mid-batch keeps earlier scaffolds in the portfolio and reports FAILED', async () => {
  const { applyTriage } = await import('../tracks/e-monitor/track.mjs');
  writeFileSync(process.env.FUND_PORTFOLIO, JSON.stringify({ version: 1, opportunities: [] }));
  const rows = [
    { source: 's1', opportunity: 'YES', track: 'B', program: 'Kappa Grant', url: 'https://kappa.example', deadline: 'rolling', reason: 'remote grant' },
    { source: 's2', opportunity: 'YES', track: 'B', program: 'Lambda Grant', url: 'https://lambda.example', deadline: 'rolling', reason: 'remote grant' },
    { source: 's3', opportunity: 'YES', track: 'C', program: 'Mu Grant', url: 'https://mu.example', deadline: 'rolling', reason: 'remote grant' },
  ];
  const invoke = async (argv) => {
    if (argv[1] === 'lambda-grant') throw new Error('disk full');
    if (argv[1] === 'mu-grant') { await main(argv); return 3; } // created, but exited non-zero
    return main(argv);
  };
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  let res;
  try { res = await applyTriage(rows, { core: CORE, invoke, now: new Date('2026-09-26T12:00:00Z') }); } finally { console.log = orig; }
  assert.equal(logs.length, 0, `fund new chatter is captured: ${logs.join('\n')}`);
  const by = Object.fromEntries(res.results.map((r) => [r.slug, r]));
  assert.equal(by['kappa-grant'].action, 'ADDED');
  assert.equal(by['lambda-grant'].action, 'FAILED');
  assert.match(by['lambda-grant'].detail, /disk full/);
  assert.equal(by['mu-grant'].action, 'FAILED');
  assert.match(by['mu-grant'].detail, /created the application; added to the portfolio/);
  assert.equal(res.failed, 2);
  const slugs = JSON.parse(readFileSync(process.env.FUND_PORTFOLIO, 'utf8')).opportunities.map((o) => o.slug);
  assert.deepEqual(slugs, ['kappa-grant', 'mu-grant'], 'every created app has a portfolio entry; the failed one has neither');
  assert.ok(!CORE.listApps().includes('lambda-grant'));
});

test('regression: the e:triage summary counts past-deadline rows separately from NO/CHECK', async () => {
  const f = join(tmp, 'answer-past.md');
  writeFileSync(f, '```json\n[{"source":"a","opportunity":"YES","track":"B","program":"Past Prize","url":"https://past.example","deadline":"2020-01-01","reason":"remote prize"},{"source":"b","opportunity":"NO","program":"n"}]\n```\n');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try { assert.equal(await main(['e:triage', '--apply', '--from', f]), 0); } finally { console.log = orig; }
  assert.match(logs.join('\n'), /0 added · 0 duplicate · 0 excluded · 1 not YES · 1 past deadline/);
});
