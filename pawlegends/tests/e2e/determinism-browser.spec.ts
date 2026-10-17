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
