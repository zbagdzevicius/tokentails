#!/usr/bin/env node
/**
 * Build the app for the iOS Simulator without signing (no Apple account needed), and optionally run it.
 *
 *   node scripts/build-sim.mjs          build (run `npm run build` first so ios/App/App/public is current)
 *   node scripts/build-sim.mjs --run    build, boot an iPhone simulator, install and launch com.tokentails.pawlegends
 *
 * The build lands in build/DerivedData. Xcode needs the iOS platform of its SDK installed
 * (`xcodebuild -downloadPlatform iOS` once, if it says "iOS <x> is not installed").
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { APP_DIR, APP_ID } from './lib/app-config.mjs';

const run = process.argv.includes('--run');
const iosDir = join(APP_DIR, 'ios/App');
const derived = join(APP_DIR, 'build/DerivedData');

/** The newest available iPhone simulator: { udid, name, runtime }. */
function pickSimulator() {
  const json = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' }));
  const runtimes = Object.keys(json.devices)
    .filter((r) => r.includes('SimRuntime.iOS'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const r of runtimes) {
    const phone = json.devices[r].find((d) => d.name.startsWith('iPhone') && d.isAvailable !== false);
    if (phone) return { udid: phone.udid, name: phone.name, runtime: r };
  }
  throw new Error('build-sim: no available iPhone simulator (Xcode → Settings → Components)');
}

const sim = pickSimulator();
console.log(`build-sim: ${sim.name} (${sim.runtime.split('.').pop()})`);
execFileSync(
  'xcodebuild',
  [
    '-workspace', 'App.xcworkspace',
    '-scheme', 'App',
    '-configuration', 'Debug',
    '-sdk', 'iphonesimulator',
    '-destination', `id=${sim.udid}`,
    '-derivedDataPath', derived,
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ],
  { cwd: iosDir, stdio: 'inherit' },
);
const appPath = join(derived, 'Build/Products/Debug-iphonesimulator/App.app');
console.log(`build-sim: built ${appPath}`);

if (run) {
  try {
    execFileSync('xcrun', ['simctl', 'boot', sim.udid], { stdio: 'ignore' });
  } catch {
    /* already booted */
  }
  execFileSync('open', ['-a', 'Simulator']);
  execFileSync('xcrun', ['simctl', 'install', sim.udid, appPath], { stdio: 'inherit' });
  execFileSync('xcrun', ['simctl', 'launch', sim.udid, APP_ID], { stdio: 'inherit' });
  console.log(`build-sim: launched ${APP_ID} on ${sim.name}`);
}
