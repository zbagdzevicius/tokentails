import { expect, test } from '@playwright/test';
import { mockHost, openHost, received } from './host';

/*
 * Live ops (docs/plans/moba/LIVEOPS.md): a returning player opens Events on Home and sees the community goal's shared
 * bar, Winter Nap's dates and the fan vote; a vote goes through the host as `api-request{op: 'liveops.vote'}` and the
 * card turns into the shares, the popover staying open. A reached goal is claimed with one tap. The popover fits the
 * screen (desktop and a landscape phone).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const day = 86_400_000;
const iso = (t: number): string => new Date(t).toISOString();
const now = Date.now();

const config = (progress: number) => ({
  v: 1,
  now: iso(now),
  events: [],
  featuredMode: { id: 'skirmish', endsAt: iso(now + 3 * day) },
  featuredQuests: [],
  goal: {
    id: 'g1-paws-together',
    label: 'Play 2,000 matches together',
    metric: 'matches',
    target: 2000,
    progress,
    reached: progress >= 2000,
    rewardItem: 'coat.clem.loop.honey',
    rewardName: 'Honey coat for Clem',
    startsAt: iso(now - 7 * day),
    endsAt: iso(now + 20 * day),
  },
  vote: {
    id: 'v1-winter-coat',
    question: 'Which coat should we make next?',
    options: [
      { id: 'a', name: 'Aurora Frost', hero: 'sage', colors: ['#8fc8ff', '#eef6ff', '#9be3c4'] },
      { id: 'b', name: 'Candy Cane', hero: 'brutus', colors: ['#ff3d7f', '#fff3e3', '#c8102e'] },
    ],
    open: true,
    tallies: { a: 12, b: 8 },
    startsAt: iso(now - 7 * day),
    endsAt: iso(now + 20 * day),
  },
  nap: {
    id: 'nap-2026',
    name: 'Winter Nap',
    startsAt: iso(now + 30 * day),
    endsAt: iso(now + 51 * day),
    open: false,
    today: iso(now).slice(0, 10),
    gifts: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, item: i === 6 ? 'coat.cacklejaw.frost' : 'coat.sage.loop.slate', name: `Gift ${i + 1}` })),
  },
});

const me = (claimed: boolean, choice: 'a' | 'b' | null) => ({
  goal: { id: 'g1-paws-together', claimed },
  nap: { days: 0, earned: 0, claimed: 0, playedToday: false },
  vote: { id: 'v1-winter-coat', choice },
  items: claimed ? ['coat.clem.loop.honey'] : [],
});

const profile = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };

async function openEvents(game: import('@playwright/test').Frame) {
  const summary = game.locator('.hm-events > summary');
  await expect(summary).toBeVisible({ timeout: 60_000 });
  await summary.click();
  const pop = game.locator('.hm-events .hm-evlist');
  await expect(pop).toBeVisible();
  return pop;
}

test('Events: the community goal bar, Winter Nap dates and a fan vote through the host', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile,
    api: {
      'liveops.config': { status: 200, body: config(1500) },
      'liveops.me': { status: 200, body: me(false, null) },
      'liveops.vote': { status: 200, body: { ...me(false, 'b'), counted: true, tallies: { a: 12, b: 9 } } },
      'social.pulse': { status: 204 },
    },
  });
  const game = await openHost(page);
  const pop = await openEvents(game);
  const goal = pop.locator('[data-testid="lo-goal"]');
  await expect(goal).toBeVisible();
  await expect(goal).toContainText('Play 2,000 matches together');
  await expect(goal.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '1500');
  await expect(goal).toContainText('1,500 / 2,000');
  await expect(pop.locator('[data-testid="lo-nap"]')).toContainText('Winter Nap');
  // the featured mode's row
  // the server's featured mode replaces the baked one (Home redraws its modes, the popover stays open)
  await expect(pop.locator('.ev.ev-feat')).toContainText('Skirmish');
  await expect(pop.locator('.ev.ev-feat')).toContainText('Featured');
  // the whole popover is on screen
  const box = (await pop.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  // vote: the popover stays open and turns into the shares
  await pop.locator('[data-testid="lo-vote-b"]').click();
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'liveops.vote' && m.args?.option === 'b')).toBe(true);
  await expect(pop).toBeVisible();
  await expect(pop.locator('[data-testid="lo-vote"]')).toContainText('43%');
  await expect(pop.locator('[data-testid="lo-vote"]')).toContainText('You voted');
  await expect(pop.locator('[data-testid="lo-vote-a"]')).toHaveCount(0);
  for (const r of (await received(page)).filter((m: any) => m.type === 'api-request') as any[]) {
    // op and args only: the request id is random and can contain "fb" + letters (a false token hit, QA flaky-qa)
    expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
  }
});

test('Events: a reached goal is claimed with one tap and the coat is kept', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile,
    api: {
      'liveops.config': { status: 200, body: config(2000) },
      'liveops.me': { status: 200, body: me(false, 'a') },
      'liveops.claim': { status: 200, body: { ...me(true, 'a'), granted: ['coat.clem.loop.honey'] } },
      'social.pulse': { status: 204 },
    },
  });
  const game = await openHost(page);
  // a claimable reward lights the Events button
  await expect(game.locator('.hm-events > summary .hm-dot')).toBeVisible({ timeout: 60_000 });
  const pop = await openEvents(game);
  await pop.locator('[data-testid="lo-claim"]').click();
  await expect(pop.locator('[data-testid="lo-goal"]')).toContainText('Claimed');
  await expect(pop.locator('.lo-toast')).toContainText('unlocked');
  const unlocks = await game.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}').unlocks ?? []);
  expect(unlocks).toContain('coat.clem.loop.honey');
});
