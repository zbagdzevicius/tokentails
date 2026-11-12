#!/usr/bin/env node
/**
 * Party play multi-client live check (docs/plans/moba/MULTIPLAYER.md §12.4): 3 browser contexts against a running game
 * server and relay harness. A desktop leader (1440x900) creates a party; two phones (844x390 and 667x375, touch) join
 * by link; the leader starts; everyone locks a hero; they play together (moves on desktop and joystick on phones); the
 * hash trails of all three are compared; one phone drops for 10 s and comes back (resume + catch-up). Screenshots go
 * to SHOTS. Exit 1 on a failed check.
 *
 *   GAME=http://127.0.0.1:5400 SHOTS=/tmp/mp node tests/e2e/mp/party-live.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const GAME = process.env.GAME ?? 'http://127.0.0.1:5400';
const SHOTS = process.env.SHOTS ?? '/tmp/mp-shots';
const PLAY_S = Number(process.env.PLAY_S ?? 25);
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log('[mp]', ...a);
const fail = (msg) => {
  console.error(`[mp] FAIL: ${msg}`);
  process.exitCode = 1;
};

// the whole script is slow on a shared, busy machine (swiftshader WebGL in three pages): long timeouts
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mk = async (name, viewport, touch) => {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  // a returning player: PLAY opens Mode Select (the first visit plays the guided match)
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage' }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') log(`${name} console: ${m.text().slice(0, 200)}`);
  });
  return { name, ctx, page, touch };
};
const shot = async (c, label) => {
  const file = `${SHOTS}/${label}-${c.name}.png`;
  await c.page.screenshot({ path: file, timeout: 90000 });
  log(`shot ${file}`);
};
const attr = (page, n) => page.evaluate((k) => document.documentElement.dataset[k] ?? '', n);

const A = await mk('desktop-1440x900', { width: 1440, height: 900 }, false);
const B = await mk('phone-844x390', { width: 844, height: 390 }, true);
const C = await mk('phone-667x375', { width: 667, height: 375 }, true);

// 1. the leader creates a party from the title
await A.page.goto(`${GAME}/?e2e=1`, { waitUntil: 'commit', timeout: 90000 });
await A.page.waitForSelector('html[data-screen="title"]', { timeout: 90000 });
// the one play path: PLAY → Skirmish → With Friends → Open party (a returning profile; a first visit plays the guided match)
await A.page.locator('[data-testid="home-play"]').click();
await A.page.locator('[data-testid="mode-skirmish"]').click();
await A.page.locator('[data-testid="mode-next"]').click();
await A.page.locator('[data-testid="variant-friends"]').click();
await A.page.locator('[data-testid="mode-go"]').click();
const codeEl = A.page.locator('[data-testid="party-code"]');
await codeEl.waitFor({ timeout: 15000 });
const code = (await codeEl.textContent()).replace(/\s/g, '');
log(`party code ${code}`);
await shot(A, '01-lobby-leader');

// 2. two phones join by link
for (const c of [B, C]) {
  await c.page.goto(`${GAME}/?e2e=1&party=${code}`, { waitUntil: 'commit', timeout: 90000 });
  await c.page.locator('[data-testid="party-code"]').waitFor({ timeout: 90000 });
}
await A.page.waitForFunction(() => document.querySelectorAll('.pp-seat:not(.empty)').length === 3, null, { timeout: 10000 });
for (const c of [A, B, C]) await shot(c, '02-lobby-3');

// 3. start → shared pick → lock in
await A.page.locator('[data-testid="party-start"]').click();
for (const c of [A, B, C]) await c.page.locator('[data-testid="party-lock"]').waitFor({ timeout: 10000 });
await shot(A, '03-pick');
await shot(B, '03-pick');
for (const c of [A, B, C]) {
  // a free hero of the leader's side, then lock
  const free = c.page.locator('.pp-heroes [data-p="hero"]:not([disabled])');
  if (c !== A) await free.nth(1).click();
  await c.page.locator('[data-testid="party-lock"]').click();
  await c.page.waitForTimeout(300);
}
// 4. the match starts on every client
for (const c of [A, B, C]) {
  await c.page.waitForSelector('html[data-match="live"]', { timeout: 60000 });
  await c.page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 30000 });
}
log('match live on all three');
for (const c of [A, B, C]) await shot(c, '04-match-start');

// 5. play: the desktop right-clicks to move, the phones drag the joystick
const touchDrag = async (page, x0, y0, x1, y1, hold) => {
  const cdp = await page.context().newCDPSession(page);
  const tp = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8) });
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const t0 = Date.now();
let k = 0;
while (Date.now() - t0 < PLAY_S * 1000) {
  k++;
  await A.page.mouse.click(720 + ((k * 97) % 400) - 200, 450 + ((k * 53) % 200) - 100, { button: 'right' });
  await touchDrag(B.page, 120, 270, 200, 250 - (k % 3) * 20, 700);
  await touchDrag(C.page, 110, 260, 180, 240 + (k % 2) * 30, 700);
  if (k === 6) for (const c of [A, B, C]) await shot(c, '05-playing');
}
const me = async (c) => (await attr(c.page, 'me')).split(',').slice(0, 2).map(Number);
log(`positions A ${await me(A)} B ${await me(B)} C ${await me(C)}`);

// 6. the three hash trails agree on every common tick
const trails = await Promise.all([A, B, C].map(async (c) => new Map((await attr(c.page, 'mpTrail')).split(' ').filter(Boolean).map((p) => p.split(':')))));
const common = [...trails[0].keys()].filter((t) => trails[1].has(t) && trails[2].has(t));
const diff = common.filter((t) => trails[0].get(t) !== trails[1].get(t) || trails[0].get(t) !== trails[2].get(t));
log(`hash trails: ${common.length} common ticks, ${diff.length} differ (last tick ${common[common.length - 1]})`);
if (common.length < 5) fail('too few common trail ticks');
if (diff.length) fail(`trails differ at ${diff.join(',')}`);
const turns = await Promise.all([A, B, C].map((c) => attr(c.page, 'mpTurn')));
log(`applied turns ${turns.join(' / ')}, buffers ${(await Promise.all([A, B, C].map((c) => attr(c.page, 'mpBuffer')))).join(' / ')}`);

// 7. phone B drops for 10 s, then reloads: the others see the takeover, B resumes and catches up
await B.page.close();
await A.page.waitForTimeout(1200);
await shot(A, '06-teammate-dropped');
await A.page.waitForTimeout(6300);
const mask = Number(await attr(A.page, 'mpMask'));
log(`mode mask after the drop: ${mask.toString(2)}`);
if (!(mask & 2)) fail('slot 1 not piloted after the drop');
await A.page.waitForTimeout(2500);
B.page = await B.ctx.newPage();
B.page.on('pageerror', (e) => log(`B pageerror: ${e.message}`));
B.page.on('console', (m) => log(`B console ${m.type()}: ${m.text().slice(0, 200)}`));
const back0 = Date.now();
await B.page.goto(`${GAME}/?e2e=1&party=${code}`, { waitUntil: 'commit', timeout: 120000 });
await B.page.waitForSelector('html[data-match="live"]', { timeout: 150000 }).catch(async (e) => {
  await shot(B, '07-rejoin-stuck').catch(() => undefined);
  log('B dataset', JSON.stringify(await B.page.evaluate(() => ({ ...document.documentElement.dataset }))));
  throw e;
});
await B.page.waitForFunction(() => Number(document.documentElement.dataset.mpTurn ?? -1) > 100, null, { timeout: 120000 });
log(`B resumed and caught up in ${Date.now() - back0} ms (turn ${await attr(B.page, 'mpTurn')})`);
await shot(B, '07-rejoined');
await touchDrag(B.page, 120, 270, 220, 250, 1500);
await A.page.waitForFunction(() => (Number(document.documentElement.dataset.mpMask ?? 0) & 2) === 0, null, { timeout: 15000 }).then(
  () => log('slot 1 is human again'),
  () => fail('slot 1 never reclaimed'),
);
await shot(A, '08-teammate-back');
await A.page.waitForTimeout(3000);
const t2 = await Promise.all([A, B, C].map(async (c) => new Map((await attr(c.page, 'mpTrail')).split(' ').filter(Boolean).map((p) => p.split(':')))));
const common2 = [...t2[0].keys()].filter((t) => t2[1].has(t) && t2[2].has(t));
const diff2 = common2.filter((t) => t2[0].get(t) !== t2[1].get(t) || t2[0].get(t) !== t2[2].get(t));
log(`after rejoin: ${common2.length} common ticks, ${diff2.length} differ`);
if (diff2.length) fail(`trails differ after rejoin at ${diff2.join(',')}`);
if (common2.length < 2) fail('too few common ticks after rejoin');
for (const c of [A, B, C]) await shot(c, '09-final');
await browser.close();
log(process.exitCode ? 'FAILED' : 'OK');
