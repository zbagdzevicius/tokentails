import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';

// Theme soundtrack (audio/theme.ts): nothing before the first gesture; then the home loop; the champion-select build
// while the pick is open; the lock sting on LOCK IN; the loops fade in a match. Each source is checked where it lands
// (it reaches the speakers through the music bus). The Music slider in Settings is saved and scales the bus.

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop project only'));

interface Heard {
  kind: string;
  name: string;
  dest: boolean;
}

function hook(): void {
  const W = window as unknown as Record<string, unknown>;
  const heard: Heard[] = [];
  W.__heard = heard;
  const edges = new WeakMap<AudioNode, AudioNode[]>();
  const conn = AudioNode.prototype.connect as (this: AudioNode, d: AudioNode, ...r: unknown[]) => AudioNode;
  (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, d: unknown, ...r: unknown[]) {
    if (d instanceof AudioNode) edges.set(this, [...(edges.get(this) ?? []), d]);
    return conn.call(this, d as AudioNode, ...r);
  };
  const reaches = (n: AudioNode): boolean => {
    let cur: AudioNode | undefined = n;
    for (let i = 0; i < 16 && cur; i++) {
      if (cur instanceof AudioDestinationNode) return true;
      const next: AudioNode[] | undefined = edges.get(cur);
      cur = next?.[next.length - 1];
    }
    return false;
  };
  W.__plAudioProbe = (o: { kind: string; name: string; src: AudioBufferSourceNode }) => {
    if (o.kind === 'music') heard.push({ kind: o.kind, name: o.name, dest: reaches(o.src) });
  };
}

const music = (page: Page): Promise<Heard[]> => page.evaluate(() => (window as unknown as { __heard: Heard[] }).__heard.slice());
const played = async (page: Page, name: string): Promise<void> => {
  await expect.poll(async () => (await music(page)).some((h) => h.name === name && h.dest), { timeout: limit(20_000), message: `${name} reached the speakers` }).toBe(true);
};

test('home theme after the first tap, the select build in champion select, the lock sting on LOCK IN', async ({ page }) => {
  test.setTimeout(limit(120_000));
  await page.addInitScript(hook);
  // the files live on pawlegends.app (pawlegends-web/public/pawlegends-art/music): served here from the repo
  await page.route('https://pawlegends.app/pawlegends-art/music/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({ path: join(import.meta.dirname, '..', '..', '..', 'pawlegends-web', 'public', 'pawlegends-art', 'music', name), contentType: 'audio/mp4', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true, side: 'cat', audioV: 2, muted: false }));
    } catch {
      /* storage blocked */
    }
  });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.waitForTimeout(1200);
  expect(await music(page)).toEqual([]);
  await page.mouse.click(5, 5);
  await played(page, 'home');

  // Settings: the Music slider is saved
  await page.locator('.hm-icon[data-a="settings"]').click();
  const slider = page.locator('[data-testid="music-row"] input[type="range"]');
  await expect(slider).toBeVisible();
  await slider.evaluate((el: HTMLInputElement) => {
    el.value = '35';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => localStorage.getItem('pawlegends.music.volume'))).toBe('0.35');
  await expect(page.locator('[data-testid="music-row"] output')).toHaveText('35%');
  await page.locator('.pl-settings [data-a="close"]').click();

  await page.locator('[data-testid="home-play"]').click();
  await page.locator('[data-testid="mode-next"]').click();
  await page.locator('[data-testid="variant-bots"]').click();
  await page.locator('[data-testid="mode-go"]').click();
  await page.waitForSelector('.pl-pick .cs-lock');
  await played(page, 'select');
  await page.locator('.pl-pick .cs-lock:not([disabled])').click();
  await played(page, 'lock');
  await page.waitForSelector('html[data-screen="match"]');
});
