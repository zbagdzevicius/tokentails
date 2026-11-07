#!/usr/bin/env node
/**
 * Test over-the-air updates on the Mac before anything reaches players (docs/plans/moba/APP-STORE.md "OTA flow").
 *
 * A Debug build (scripts/build-sim.mjs) reads the `dev` channel: the beta manifest on http://localhost:8787, which
 * the simulator reaches as the Mac's localhost. This script publishes into a scratch folder (never into
 * client/public) and serves it there, signed with the real key (ota/.keys/private-key.pem), so the app checks the
 * same signature and checksum as in production.
 *
 *   node scripts/ota-local.mjs publish            publish www/ (build it first: node scripts/build-web.mjs)
 *   node scripts/ota-local.mjs rollback <version> point the local manifest at a kept bundle
 *   node scripts/ota-local.mjs serve              serve the folder on :8787 (Ctrl-C to stop)
 *   --dir <path>                                  the scratch folder (default build/ota-local/updates)
 *
 * Drill: build-sim --run (title up) → build-web --seq <newer> → publish → serve → background and reopen the app
 * (or relaunch) → the shell downloads, then swaps on the title. For a rollback drill publish a bundle that never
 * reaches the title (e.g. build-web, then break www/index.html): the updater reverts it after appReadyTimeout.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, resolve } from 'node:path';
import { APP_DIR, LOCAL_PORT, LOCAL_UPDATES_URL } from './lib/app-config.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const i = args.indexOf('--dir');
const dir = resolve(i >= 0 ? args[i + 1] : join(APP_DIR, 'build/ota-local/updates'));
const env = { ...process.env, OTA_UPDATES_DIR: dir, OTA_UPDATES_URL: LOCAL_UPDATES_URL };
const publish = join(APP_DIR, 'scripts/ota-publish.mjs');

if (cmd === 'publish') {
  execFileSync(process.execPath, [publish, '--keep', '5'], { env, stdio: 'inherit' });
} else if (cmd === 'rollback') {
  if (!args[1]) throw new Error('ota-local: rollback <version>');
  execFileSync(process.execPath, [publish, '--rollback', args[1]], { env, stdio: 'inherit' });
} else if (cmd === 'serve') {
  const prefix = '/pawlegends-app/updates/';
  createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = path.startsWith(prefix) ? normalize(path.slice(prefix.length)) : null;
    const file = rel && !rel.startsWith('..') ? join(dir, rel) : null;
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      console.log(`404 ${path}`);
      return;
    }
    res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/zip', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
    console.log(`200 ${path}`);
  }).listen(LOCAL_PORT, () => console.log(`ota-local: serving ${dir} at ${LOCAL_UPDATES_URL}/`));
} else {
  console.error('usage: node scripts/ota-local.mjs publish | rollback <version> | serve [--dir <path>]');
  process.exit(1);
}
