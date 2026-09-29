#!/usr/bin/env node
/**
 * Exports Catnip Heist to GLB for Anitya (app.anitya.space) with no manual editor work.
 *
 * Starts a local Vite dev server (127.0.0.1 only), opens tools/export-glb.html in headless Chromium
 * through Playwright, and asks the page (tools/export-glb-page.ts) to build the real game views and
 * run three's GLTFExporter. Writes to export/anitya/:
 *   worlds/catnip-heist-<level>.glb   one complete world per heist (terrain, props, crew, guards,
 *                                     the shelter-cat crate, glTF punctual light hints)
 *   characters/cat-<id>.glb           every voxel cat, static pose
 *   characters/dog-<id>.glb           every guard dog, static pose
 *   characters/*-animated.glb         flipbook walk/idle animations (dogs, crew and shelter cats)
 *   props/prop-<id>.glb               crate, key, doors, plate, portal, coin, checkpoint
 *   previews/<world>.png              screenshot of each world, rendered from the reloaded GLB
 *   manifest.json                     sizes, triangle counts and the limits checked (committed)
 *
 *   node tools/export-glb.mjs                       # everything
 *   node tools/export-glb.mjs --levels=heist-01,heist-08 --no-characters
 *   npm run export-glb
 *
 * Exits 1 if a file breaks the Anitya limits in LIMITS (see export/anitya/SUBMISSION.md).
 *
 * Output is staged in export/anitya/.staging-<pid>/ and moved into place only once every job has
 * finished, manifest.json last, so readers (tools/export-glb.test.ts, the upload script) never see
 * new GLBs next to an old manifest. export/anitya/.export-running holds the exporter's pid for the
 * whole run; a second export refuses to start while it is held and the load-back test skips.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'export/anitya');
const STAGE = join(OUT, `.staging-${process.pid}`);
const LOCK = join(OUT, '.export-running');

/** True while another live process holds the export lock (a stale lock from a killed run is not). */
function lockHeld() {
  if (!existsSync(LOCK)) return false;
  const pid = Number(readFileSync(LOCK, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** Writes via a temp file and rename, so a reader sees the old or the new bytes, never a partial file. */
function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

/**
 * Anitya numbers (sources in SUBMISSION.md): free plan storage 250 MB; "Files over 20MB will have
 * longer load times"; "Scenes with up to approximately 500k total polygons and 20 active lights run
 * well". No hard per-file cap is published, so the soft guidance is enforced as a hard limit here,
 * with a smaller budget per character and prop so a world plus its kit stays light.
 */
export const LIMITS = {
  storageBytes: 250 * 1024 * 1024,
  worldBytes: 20 * 1024 * 1024,
  worldTriangles: 500_000,
  worldLights: 20,
  assetBytes: 5 * 1024 * 1024,
  assetTriangles: 100_000,
};

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const listArg = (k) => (args.get(k) && args.get(k) !== 'all' ? args.get(k).split(',') : null);

function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const candidates = [
    join(cache, 'chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    join(cache, 'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  ];
  return candidates.find((p) => existsSync(p));
}

const fmt = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`);

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (lockHeld()) throw new Error(`another export is running (pid ${readFileSync(LOCK, 'utf8').trim()}, ${relative(root, LOCK)})`);
  writeFileSync(LOCK, `${process.pid}\n`);
  rmSync(STAGE, { recursive: true, force: true });
  try {
    await exportAll();
  } finally {
    rmSync(STAGE, { recursive: true, force: true });
    if (existsSync(LOCK) && readFileSync(LOCK, 'utf8').trim() === String(process.pid)) rmSync(LOCK, { force: true });
  }
}

async function exportAll() {
  const server = await createServer({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 5188, strictPort: false, hmr: false },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const entries = [];
  const problems = [];
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver Message')) console.warn(`  [page] ${m.text()}`);
    });
    page.on('pageerror', (e) => console.error(`  [page error] ${e.message}`));
    await page.goto(`${url}tools/export-glb.html`);
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60_000 });
    const info = await page.evaluate(() => window.__export.list());
    const worldScale = await page.evaluate(() => window.__export.WORLD_SCALE);

    const levels = listArg('levels') ?? info.levels;
    const jobs = [];
    for (const id of levels) jobs.push({ kind: 'world', id, dir: 'worlds', call: ['exportLevel', id] });
    if (args.get('characters') !== 'false' && !args.has('no-characters')) {
      const cats = listArg('cats') ?? info.cats;
      const dogs = listArg('dogs') ?? info.dogs;
      for (const id of cats) jobs.push({ kind: 'cat', id, dir: 'characters', call: ['exportCharacter', 'cat', id, false] });
      for (const id of dogs) jobs.push({ kind: 'dog', id, dir: 'characters', call: ['exportCharacter', 'dog', id, false] });
      if (!args.has('no-anim')) {
        const animCats = [...new Set(['bob', 'oreo', ...levels.map((l) => info.crateCats[l])])].filter((c) => cats.includes(c));
        for (const id of animCats) jobs.push({ kind: 'cat-animated', id, dir: 'characters', call: ['exportCharacter', 'cat', id, true] });
        for (const id of dogs) jobs.push({ kind: 'dog-animated', id, dir: 'characters', call: ['exportCharacter', 'dog', id, true] });
      }
    }
    if (!args.has('no-props')) for (const id of info.props) jobs.push({ kind: 'prop', id, dir: 'props', call: ['exportProp', id] });

    for (const job of jobs) {
      const res = await page.evaluate(([fn, ...a]) => window.__export[fn](...a), job.call);
      const buf = Buffer.from(res.base64, 'base64');
      mkdirSync(join(STAGE, job.dir), { recursive: true });
      const file = join(STAGE, job.dir, `${res.name}.glb`);
      writeFileSync(file, buf);
      const world = job.kind === 'world';
      const entry = { file: relative(STAGE, file), kind: job.kind, id: job.id, bytes: buf.length, ...res.stats };
      if (world) entry.level = await page.evaluate((id) => window.__export.levelInfo(id), job.id);
      const maxBytes = world ? LIMITS.worldBytes : LIMITS.assetBytes;
      const maxTris = world ? LIMITS.worldTriangles : LIMITS.assetTriangles;
      if (buf.length > maxBytes) problems.push(`${entry.file}: ${fmt(buf.length)} > ${fmt(maxBytes)}`);
      if (res.stats.triangles > maxTris) problems.push(`${entry.file}: ${res.stats.triangles} triangles > ${maxTris}`);
      if (world && res.stats.lights > LIMITS.worldLights) problems.push(`${entry.file}: ${res.stats.lights} lights > ${LIMITS.worldLights}`);
      // Round trip: the page loads the file back through GLTFLoader (worlds also get a screenshot).
      const shot = world || args.has('previews');
      const back = await page.evaluate(([b64, w, r]) => window.__export.preview(b64, w ? {} : { width: 640, height: 640, pitch: 0.35, zoom: 1.05, render: r }), [res.base64, world, shot]);
      if (back.triangles !== res.stats.triangles || back.meshes !== res.stats.meshes) problems.push(`${entry.file}: reloaded ${back.meshes} meshes / ${back.triangles} tris, exported ${res.stats.meshes} / ${res.stats.triangles}`);
      if (shot) {
        mkdirSync(join(STAGE, 'previews'), { recursive: true });
        const png = join(STAGE, 'previews', `${res.name}.png`);
        writeFileSync(png, Buffer.from(back.png, 'base64'));
        entry.preview = relative(STAGE, png);
        if (world) {
          const hero = await page.evaluate((b64) => window.__export.preview(b64, { focus: 'centrepiece', pitch: 0.6 }), res.base64);
          const heroPng = join(STAGE, 'previews', `${res.name}-crate.png`);
          writeFileSync(heroPng, Buffer.from(hero.png, 'base64'));
          entry.previewCentrepiece = relative(STAGE, heroPng);
        }
      }
      entries.push(entry);
      console.log(`${entry.file.padEnd(44)} ${fmt(buf.length).padStart(10)}  ${String(res.stats.triangles).padStart(7)} tris  ${res.stats.meshes} meshes${res.stats.animations ? `  ${res.stats.animations} anims` : ''}`);
    }

    const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);
    if (totalBytes > LIMITS.storageBytes) problems.push(`total ${fmt(totalBytes)} > free-plan storage ${fmt(LIMITS.storageBytes)}`);
    const manifest = {
      generator: 'tools/export-glb.mjs',
      units: 'metres, y up, +z front; every file centred on x/z with y = 0 on the floor',
      metresPerTile: worldScale,
      limits: LIMITS,
      totalBytes,
      files: entries,
    };
    // Publish: move every staged file into place, then the manifest that describes them.
    for (const e of entries) {
      for (const rel of [e.file, e.preview, e.previewCentrepiece].filter(Boolean)) {
        mkdirSync(dirname(join(OUT, rel)), { recursive: true });
        renameSync(join(STAGE, rel), join(OUT, rel));
      }
    }
    writeAtomic(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\n${entries.length} files, ${fmt(totalBytes)} total -> ${relative(root, OUT)}/`);
  } finally {
    await browser.close();
    await server.close();
  }
  if (problems.length) {
    console.error(`\nOver the Anitya limits:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
