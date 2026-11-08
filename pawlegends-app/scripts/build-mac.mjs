#!/usr/bin/env node
/**
 * Build the Mac app (Mac Catalyst of the iOS target) without signing, and optionally run it on this Mac.
 *
 *   node scripts/build-mac.mjs                     Debug build (run `npm run build` first so ios/App/App/public is current)
 *   node scripts/build-mac.mjs --release           Release build
 *   node scripts/build-mac.mjs --run               build, then open the app
 *   node scripts/build-mac.mjs --run --probe DIR   Debug: after 15 s write DIR/probe.png (the game, from the WebView)
 *                                                  and DIR/probe.json (platform, pointer, size the page sees), then quit
 *
 * The build lands in build/MacDerivedData. Unsigned means no App Sandbox at run time; the signed build (fastlane
 * mac_beta) has it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { APP_DIR } from './lib/app-config.mjs';

const args = process.argv.slice(2);
const run = args.includes('--run');
const config = args.includes('--release') ? 'Release' : 'Debug';
const probeAt = args.indexOf('--probe');
const probe = probeAt >= 0 ? resolve(args[probeAt + 1] ?? '') : '';
if (probeAt >= 0 && (!args[probeAt + 1] || config !== 'Debug')) throw new Error('build-mac: --probe <dir> needs a Debug build');

const iosDir = join(APP_DIR, 'ios/App');
const derived = join(APP_DIR, 'build/MacDerivedData');

execFileSync(
  'xcodebuild',
  [
    '-workspace', 'App.xcworkspace',
    '-scheme', 'App',
    '-configuration', config,
    '-destination', 'platform=macOS,variant=Mac Catalyst',
    '-derivedDataPath', derived,
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ],
  { cwd: iosDir, stdio: 'inherit' },
);
const appPath = join(derived, `Build/Products/${config}-maccatalyst/App.app`);
console.log(`build-mac: built ${appPath}`);

if (run) {
  const bin = join(appPath, 'Contents/MacOS/App');
  const child = spawn(bin, [], { stdio: 'ignore', detached: !probe, env: { ...process.env, ...(probe ? { PL_PROBE: probe } : {}) } });
  if (probe) {
    child.on('exit', (code) => console.log(`build-mac: probe written to ${probe} (exit ${code})`));
  } else {
    child.unref();
    console.log('build-mac: launched (quit it with ⌘Q)');
  }
}
