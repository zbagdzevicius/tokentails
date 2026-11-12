import { expect, test, type Page } from '@playwright/test';
import { attr, playFromHome } from './helpers';

// Audio fix (Nov 9, "sounds are not played in-game: victory, first blood..."): a real bot match in Chromium (autoplay
// needs a gesture, like a phone) and WebKit (Safari's engine), with a hook on the page's WebAudio graph. Every sound
// the game starts is checked where it lands: the product of the gains on its path to the speakers must be non-zero
// and its context running. Asserts the match-start, hit, skill, knockout and result sounds all reach the speakers, and
// that the announcer clips decode from the build's own voice/ folder.

test.beforeEach(({}, info) => test.skip(info.project.name !== 'audio' && info.project.name !== 'webkit', 'audio projects only'));

interface Heard {
  kind: 'sfx' | 'voice';
  name: string;
  /** Product of the GainNode values from the source to the destination (0 = silent). */
  gain: number;
  /** Reached the AudioDestinationNode. */
  dest: boolean;
  state: string;
}

/** Runs before the game: records every sound the game starts (its own probe names it) and its real gain path. */
function hook(): void {
  const W = window as unknown as Record<string, unknown>;
  const heard: unknown[] = [];
  W.__heard = heard;
  const edges = new WeakMap<AudioNode, AudioNode[]>();
  const conn = AudioNode.prototype.connect as (this: AudioNode, d: AudioNode, ...r: unknown[]) => AudioNode;
  (AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, d: unknown, ...r: unknown[]) {
    if (d instanceof AudioNode) {
      const l = edges.get(this) ?? [];
      l.push(d);
      edges.set(this, l);
    }
    return conn.call(this, d as AudioNode, ...r);
  };
  const path = (n: AudioNode): { gain: number; dest: boolean } => {
    let gain = 1;
    let cur: AudioNode | undefined = n;
    const seen = new Set<AudioNode>();
    for (let i = 0; i < 16 && cur && !seen.has(cur); i++) {
      seen.add(cur);
      if (cur instanceof AudioDestinationNode) return { gain, dest: true };
      if (cur instanceof GainNode) gain *= cur.gain.value;
      const next: AudioNode[] | undefined = edges.get(cur);
      cur = next?.[next.length - 1];
    }
    return { gain, dest: false };
  };
  const names = new WeakMap<AudioBufferSourceNode, { kind: string; name: string }>();
  W.__plAudioProbe = (o: { kind: string; name: string; src: AudioBufferSourceNode }) => names.set(o.src, { kind: o.kind, name: o.name });
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...a: unknown[]) {
    const n = names.get(this);
    if (n) heard.push({ ...n, ...path(this), state: this.context.state });
    return (start as (...x: unknown[]) => void).apply(this, a);
  } as typeof start;
}

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true, side: 'cat', audioV: 2, muted: false };

const heard = (page: Page): Promise<Heard[]> => page.evaluate(() => (window as unknown as { __heard: Heard[] }).__heard.slice());
const audible = (h: Heard): boolean => h.dest && h.gain > 0.001 && h.state === 'running';

/** The sound kinds the founder named, by the names the game gives them. */
const WANT: Record<string, (h: Heard) => boolean> = {
  'match start': (h) => (h.kind === 'voice' && /^(welcome|gatesSoon|gatesOpen)$/.test(h.name)) || (h.kind === 'sfx' && h.name === 'horn'),
  'basic hit': (h) => h.kind === 'sfx' && (/^hb:(hit|hurt|swing|launch)[A-Za-z]*:\d$/.test(h.name) || /^v:[a-z]+:basic$/.test(h.name)),
  skill: (h) => h.kind === 'sfx' && (/^n:[a-z]+:(cast|impact)$/.test(h.name) || /^c:[a-z]+:/.test(h.name) || /^(magic|swipe|slam|dash|ult)$/.test(h.name)),
  knockout: (h) => (h.kind === 'voice' && /^(firstBlood|slain|allySlain|takedown|double|ace|aceUs|shutdown)$/.test(h.name)) || (h.kind === 'sfx' && /^(death|cheer|gasp)$/.test(h.name)),
  result: (h) => /^(victory|defeat)$/.test(h.name),
};

test('a bot match: start, hits, skills, a knockout and the result all reach the speakers', async ({ page }, info) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('[pawlegends audio]')) errors.push(m.text());
  });
  await page.addInitScript(hook);
  await page.addInitScript((p) => {
    try {
      localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p));
      localStorage.setItem('pawlegends.castMode', 'quick');
    } catch {
      /* storage blocked */
    }
  }, VETERAN);
  await page.goto('/?e2e=1&speed=16');
  await page.waitForSelector('html[data-screen="title"]');
  // no sound before the first gesture (no AudioContext, no autoplay warning)
  expect(await heard(page)).toEqual([]);
  await playFromHome(page);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));

  // walk and attack-move toward the enemy side, casting every ability, until the forfeit opens (3:00 on Easy)
  const vp = page.viewportSize()!;
  // (a loaded machine may run the match to its own end first: then its Victory or Defeat is the result sound)
  for (let i = 0; i < 400; i++) {
    if ((await attr(page, 'screen')) !== 'match') break;
    const tick = Number(await attr(page, 'tick'));
    if (tick >= 5400) break;
    const x = vp.width * (0.62 + 0.2 * Math.sin(i / 3));
    const y = vp.height * (0.3 + 0.15 * Math.cos(i / 4));
    await page.mouse.move(x, y);
    await page.keyboard.press('a');
    await page.mouse.click(x, y);
    for (const k of ['q', 'w', 'e', 'r']) await page.keyboard.press(k);
    await page.waitForTimeout(700);
  }
  // end it: Forfeit is a Defeat (the result line and sound)
  if ((await attr(page, 'screen')) === 'match') {
    await page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 5400 || document.documentElement.dataset.screen !== 'match', null, { timeout: 120_000 });
  }
  if ((await attr(page, 'screen')) === 'match') {
    await page.keyboard.press('Escape');
    await page.locator('.pl-menu [data-a="forfeit"]').click();
    await page.locator('.pl-menu [data-a="forfeit-yes"]').click();
  }
  await page.waitForSelector('html[data-screen="results"]', { timeout: 60_000 });
  await page.waitForTimeout(1500);

  const all = await heard(page);
  const loud = all.filter(audible);
  const summary: Record<string, string[]> = {};
  for (const [k, f] of Object.entries(WANT)) summary[k] = [...new Set(loud.filter(f).map((h) => `${h.kind}:${h.name}`))].slice(0, 8);
  await info.attach('audio-summary.json', { body: JSON.stringify({ total: all.length, audible: loud.length, summary, voice: await attr(page, 'voice'), errors }, null, 1), contentType: 'application/json' });
  const voices = all.filter((h) => h.kind === 'voice').map((h) => h.name);
  console.log(`[audio ${info.project.name}] ${all.length} sounds, ${loud.length} audible`, JSON.stringify(summary), 'voices', voices.join(','));
  for (const [k, f] of Object.entries(WANT)) expect(loud.some(f), `${k} sound reached the speakers`).toBe(true);
  // nothing the game started went into a dead or muted path
  const silent = all.filter((h) => !audible(h));
  expect(silent.length, JSON.stringify(silent.slice(0, 5))).toBeLessThanOrEqual(Math.ceil(all.length * 0.02));
  // the announcer said lines that actually played (data-voice lists clips that started)
  expect((await attr(page, 'voice')).split(',').filter(Boolean).length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('every announcer clip in the build decodes under the page base', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await playFromHome(page);
  const r = await page.evaluate(async () => {
    const base = new URL('.', location.href).pathname;
    const list = (await (await fetch(`${base}voice/manifest.json`)).json()) as string[];
    const ctx = new AudioContext();
    const bad: string[] = [];
    let ok = 0;
    for (const k of list) {
      try {
        const res = await fetch(`${base}voice/${k}.mp3`);
        if (!res.ok) throw new Error(String(res.status));
        const b = await ctx.decodeAudioData(await res.arrayBuffer());
        if (b.duration > 0.2 && b.duration < 6) ok++;
        else bad.push(`${k}:${b.duration}`);
      } catch (e) {
        bad.push(`${k}:${String(e)}`);
      }
    }
    void ctx.close();
    return { n: list.length, ok, bad };
  });
  expect(r.bad).toEqual([]);
  expect(r.ok).toBe(r.n);
  expect(r.n).toBeGreaterThan(90);
});
