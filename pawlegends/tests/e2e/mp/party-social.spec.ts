import { expect, test } from '@playwright/test';
import { closeAll, mpNames, partyMatch, player, pushed, shot, tap } from './party.helpers';

test.afterEach(closeAll);

/*
 * Party play M1-M3 (MULTIPLAYER.md §7): teammate identity on plates, scoreboard, strip and minimap; a social ping from
 * slot 1 reaches the leader as a marker and a rail note; quick chat; the chat button clears the ability bar at
 * 667x375; a muted friend reads "Teammate 2" and their notes stop.
 */
test('identity, social pings, quick chat and mute between a desktop, an 844x390 and a 667x375 phone', async ({ browser }) => {
  test.setTimeout(420_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const c = await player(browser, 'phone-small');
  await partyMatch([a, b, c], ['sage', 'lambo', 'clem']);
  // M1: friends' party names on the leader's view, the viewer keeps its own
  const names = await mpNames(a);
  const bName = names[1];
  expect(bName).toMatch(/^[A-Z][a-z]+ [A-Z]/);
  expect(names[2]).toMatch(/^[A-Z][a-z]+ [A-Z]/);
  await a.page.waitForTimeout(4000);
  for (const p of [a, b, c]) await shot(p, 'lane-M', '01-identity');

  // M3: the chat button never overlaps the ability bar on the smallest phone
  const box = async (sel: string) => c.page.locator(sel).first().boundingBox();
  const chat = await box('.pl-chatbtn');
  expect(chat).not.toBeNull();
  const abilities = await c.page.locator('.pl-tbtn, .pl-tcluster').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
  );
  for (const r of abilities) {
    const overlap = chat!.x < r.x + r.w && chat!.x + chat!.width > r.x && chat!.y < r.y + r.h && chat!.y + chat!.height > r.y;
    expect(overlap, `chat button over an ability button at ${JSON.stringify(r)}`).toBe(false);
  }
  expect(chat!.y + chat!.height).toBeLessThanOrEqual(375);

  // M2: B pings from the paw wheel (slot 1: a social marker); A sees the marker and the rail note
  // A stamps the moment the marker lands (wall clock; both pages share the host's clock)
  await a.page.evaluate(() => {
    new MutationObserver(() => {
      const d = document.documentElement.dataset;
      if (d.mpPingAt && !d.mpPingSeen) d.mpPingSeen = String(Date.now());
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mp-ping-at'] });
  });
  await tap(b, b.page.locator('.pl-pingbtn'));
  const sentAt = await b.page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.pl-pingwheel .slice[data-kind="group"]')!;
    const t = Date.now();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return t;
  });
  await a.page.waitForFunction(() => !!document.documentElement.dataset.mpPingSeen, null, { timeout: 5000 });
  const seenAt = Number(await a.page.evaluate(() => document.documentElement.dataset.mpPingSeen));
  // a local relay: well inside the spec's 300 ms on top of the network latency (the pages render in software here)
  expect(seenAt - sentAt).toBeLessThan(600);
  await expect.poll(() => pushed(a), { timeout: 5000 }).toContain(`${bName.slice(0, 12)}`);
  expect(await pushed(a)).toContain('Group on me');
  await shot(a, 'lane-M', '02-ping-from-friend');

  // M3: quick chat from the phone: "On my way" on the leader's rail, the wheel on the phone
  await b.page.waitForTimeout(2100);
  await tap(b, b.page.locator('.pl-chatbtn'));
  await expect(b.page.locator('.pl-chatwheel.on')).toBeVisible();
  await shot(b, 'lane-M', '03-chat-wheel');
  await tap(b, b.page.locator('.pl-chatwheel .cw[data-kind="chat"][data-id="1"]'));
  await expect.poll(() => pushed(a), { timeout: 5000 }).toContain('On my way');
  await expect.poll(() => pushed(c), { timeout: 5000 }).toContain('On my way');
  await shot(c, 'lane-M', '04-chat-on-rail');
  // an emote from the small phone shows over its hero for the others
  await c.page.waitForTimeout(2100);
  await tap(c, c.page.locator('.pl-chatbtn'));
  await tap(c, c.page.locator('.pl-chatwheel .cw[data-kind="emote"][data-id="0"]'));
  await expect.poll(() => a.page.evaluate(() => Number(document.documentElement.dataset.emotes ?? 0)), { timeout: 5000 }).toBeGreaterThan(0);

  // M3 mute: A opens the scoreboard (Esc → Scores) and taps B's name: "Teammate 2", and B's chat stops
  await a.page.keyboard.press('Escape');
  await a.page.locator('.pl-menu [data-a="scores"]').click();
  // the board redraws every frame (Playwright never sees it "stable"): a real pointerdown on the name, as a tap does
  await a.page.locator('.pl-scoreboard [data-mute="1"]').waitFor();
  await a.page.evaluate(() => document.querySelector('.pl-scoreboard [data-mute="1"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await expect.poll(async () => (await mpNames(a))[1]).toBe('Teammate 2');
  await expect(a.page.locator('.pl-scoreboard .sb-muted')).toHaveCount(1);
  await shot(a, 'lane-M', '05-scoreboard-muted');
  await a.page.evaluate(() => document.querySelector('.pl-scoreboard')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await a.page.keyboard.press('Escape');
  await b.page.waitForTimeout(2100);
  await tap(b, b.page.locator('.pl-chatbtn'));
  await tap(b, b.page.locator('.pl-chatwheel .cw[data-kind="chat"][data-id="7"]'));
  await expect.poll(() => pushed(c), { timeout: 5000 }).toContain(': GG');
  expect(await pushed(a)).not.toContain(': GG');
});
