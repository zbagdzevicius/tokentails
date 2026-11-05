import { expect, test } from '@playwright/test';

/**
 * POC.md §15 item 2: 20 seeds give the same final hash (and the same hash trail, folded) in Node and in a browser
 * Worker, in Chromium (project `desktop`) and WebKit (project `webkit`). The sim is bundled once by Vite
 * (tools/lib/sim-bundle.mjs, the bundler the game's own Worker build uses) with the fuzz driver of
 * tools/lib/fuzz-entry.ts (random human command streams; bots play the other slots). Node runs it here; the page
 * runs the same module in a module Worker.
 */
const SEEDS = 20;

type Row = { seed: number; finalHash: string; trail: string; ticks: number };

test('20 seeds: Node and the browser Worker give the same final hashes', async ({ page }, info) => {
  test.skip(info.project.name === 'landscape', 'one run per engine (desktop = Chromium, webkit = WebKit)');
  test.setTimeout(900_000);
  const { bundleSim, importSim } = await import('../../tools/lib/sim-bundle.mjs');
  const { code } = await bundleSim('tools/lib/fuzz-entry.ts');
  const fz = (await importSim('tools/lib/fuzz-entry.ts')) as {
    fuzzSeed(i: number): number;
    fuzzFinal(seed: number): Row;
  };
  const seeds = Array.from({ length: SEEDS }, (_, i) => fz.fuzzSeed(i));
  const node = seeds.map((s) => fz.fuzzFinal(s));

  await page.goto('/?e2e=1');
  const browser = (await page.evaluate(
    async ({ code, seeds }) => {
      const lib = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const src = `import { fuzzFinal } from '${lib}';\nself.onmessage = (e) => { self.postMessage(e.data.map((s) => fuzzFinal(s))); };\n`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const worker = new Worker(url, { type: 'module' });
      const out = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message || 'worker failed'));
        worker.postMessage(seeds);
      });
      worker.terminate();
      return out;
    },
    { code, seeds },
  )) as Row[];

  console.log(`determinism-browser (${info.project.name}): ${SEEDS} seeds, final hashes ${browser.map((r) => r.finalHash).join(' ')}`);
  expect(browser).toEqual(node);
  expect(new Set(node.map((r) => r.finalHash)).size).toBe(SEEDS);
});

/**
 * Party play N0 (docs/plans/moba/MULTIPLAYER.md §1.5): the mode-flip fuzz (humans [0, 1, 2], pilot <-> human flips
 * at random turns) gives the same final hashes and trails in Node, in a module Worker and inline on the page's main
 * thread (the no-Worker path), on Chromium and WebKit, against the production preview build.
 */
const PARTY_SEEDS = 10;
type PartyRow = { seed: number; finalHash: string; trail: string; ticks: number; flips: number };

test('party mode-flip fuzz: Node, Worker and inline give the same hashes', async ({ page }, info) => {
  test.skip(info.project.name === 'landscape', 'one run per engine (desktop = Chromium, webkit = WebKit)');
  test.setTimeout(900_000);
  const { bundleSim, importSim } = await import('../../tools/lib/sim-bundle.mjs');
  const { code } = await bundleSim('tools/lib/fuzz-entry.ts');
  const fz = (await importSim('tools/lib/fuzz-entry.ts')) as { fuzzSeed(i: number): number; fuzzPartyFinal(seed: number): PartyRow };
  const seeds = Array.from({ length: PARTY_SEEDS }, (_, i) => fz.fuzzSeed(i));
  const node = seeds.map((s) => fz.fuzzPartyFinal(s));

  await page.goto('/?e2e=1');
  const out = (await page.evaluate(
    async ({ code, seeds }) => {
      const lib = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const src = `import { fuzzPartyFinal } from '${lib}';\nself.onmessage = (e) => { self.postMessage(e.data.map((s) => fuzzPartyFinal(s))); };\n`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const worker = new Worker(url, { type: 'module' });
      const inWorker = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message || 'worker failed'));
        worker.postMessage(seeds.slice(0, 5));
      });
      worker.terminate();
      const mod = (await import(/* @vite-ignore */ lib)) as { fuzzPartyFinal(seed: number): unknown };
      const inline = seeds.slice(5).map((s) => mod.fuzzPartyFinal(s));
      return { inWorker, inline };
    },
    { code, seeds },
  )) as { inWorker: PartyRow[]; inline: PartyRow[] };

  console.log(`determinism-browser party (${info.project.name}): ${node.map((r) => r.finalHash).join(' ')}`);
  expect([...out.inWorker, ...out.inline]).toEqual(node);
  expect(node.every((r) => r.flips > 0)).toBe(true);
});
