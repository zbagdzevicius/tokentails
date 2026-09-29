#!/usr/bin/env node
/**
 * Hands exported GLBs to the Anitya builder's file picker, so the only human steps are logging in,
 * placing the world and pressing Publish.
 *
 * Anitya has no public upload API (see export/anitya/SUBMISSION.md). This drives the builder page
 * the way a person would: it opens a VISIBLE Chromium with a persistent profile, waits while you
 * log in and open a world, finds the page's <input type="file"> and gives it the files. It never
 * clicks Publish, never submits anything and never types credentials.
 *
 *   node tools/export-anitya-upload.mjs                        # dry run: list what would be sent
 *   node tools/export-anitya-upload.mjs --world=heist-08 --live
 *   node tools/export-anitya-upload.mjs --world=heist-08 --kit --live   # also crate, key, cats...
 *   node tools/export-anitya-upload.mjs --url=file:///.../fixture.html --live --headless  # testing
 *
 * Flags: --world=<level id> (default heist-08), --kit adds the props and animated characters used
 * by that world, --live actually opens the browser, --url overrides the builder URL, --wait=<sec>
 * how long to wait for a file input (default 600), --headless only for local test pages.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'export/anitya');
const BUILDER = 'https://app.anitya.space/builder';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

function pickFiles(manifest) {
  const world = args.get('world') ?? 'heist-08';
  const w = manifest.files.find((f) => f.kind === 'world' && f.id === world);
  if (!w) throw new Error(`no world ${world} in manifest.json; run npm run export-glb`);
  const files = [w];
  if (args.has('kit')) {
    const want = new Set(['cat-bob-animated', 'cat-oreo-animated', `cat-${w.level.crateCat}-animated`]);
    for (const f of manifest.files) {
      if (f.kind === 'prop' || f.kind === 'dog-animated' || want.has(f.file.replace(/^.*\//, '').replace(/\.glb$/, ''))) files.push(f);
    }
  }
  return files.map((f) => ({ ...f, path: join(OUT, f.file) }));
}

function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const p = join(homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  return existsSync(p) ? p : undefined;
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
  const files = pickFiles(manifest);
  const missing = files.filter((f) => !existsSync(f.path));
  if (missing.length) throw new Error(`missing ${missing.map((f) => f.file).join(', ')}; run npm run export-glb`);
  const mb = (files.reduce((s, f) => s + f.bytes, 0) / 1024 / 1024).toFixed(2);
  console.log(`${files.length} file(s), ${mb} MB:\n  ${files.map((f) => f.file).join('\n  ')}`);
  if (!args.has('live')) {
    console.log('\nDry run. Add --live to open the builder and hand these files to its file picker.');
    return;
  }

  const url = args.get('url') ?? BUILDER;
  const headless = args.has('headless');
  if (headless && url.startsWith('https://')) throw new Error('--headless is for local test pages only; log in to Anitya in a visible window');
  const profile = join(OUT, '.pw-profile');
  mkdirSync(profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, { headless, executablePath: chromiumPath(), viewport: null });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(url);
  console.log(`\nOpened ${url}.\nLog in if asked, open (or create) the world, then open the Assets panel's import/upload.\nWaiting for a file input...`);

  const deadline = Date.now() + Number(args.get('wait') ?? 600) * 1000;
  let input = null;
  while (Date.now() < deadline && !input) {
    for (const frame of page.frames()) {
      const found = frame.locator('input[type=file]');
      if ((await found.count().catch(() => 0)) > 0) {
        input = found.first();
        break;
      }
    }
    if (!input) await page.waitForTimeout(1000);
  }
  if (!input) {
    console.error('No file input appeared. Drag the files from export/anitya/ onto the builder instead.');
    await ctx.close();
    process.exit(2);
  }
  const multiple = await input.evaluate((el) => el.multiple).catch(() => false);
  const paths = files.map((f) => f.path);
  if (multiple) await input.setInputFiles(paths);
  else for (const p of paths) await input.setInputFiles(p);
  console.log(`Handed ${paths.length} file(s) to the page. Place the world at the origin, then press Publish yourself.`);
  if (headless) await ctx.close();
  else console.log('The browser stays open; close it when done.');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
