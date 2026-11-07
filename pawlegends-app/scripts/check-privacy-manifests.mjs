#!/usr/bin/env node
/**
 * After `pod install`: the app target and every pod that touches a required-reason API ship a privacy manifest
 * (Apple rejects uploads otherwise). Fails with the list of pods missing one.
 *
 *   node scripts/check-privacy-manifests.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR } from './lib/app-config.mjs';

const REQUIRED = ['Capacitor', 'CapacitorCordova'];
/** Pods without a manifest of their own: the app manifest must declare the API categories they use. */
const COVERED_BY_APP = { CapgoCapacitorUpdater: ['UserDefaults', 'FileTimestamp', 'DiskSpace'] };
const roots = {
  Capacitor: 'node_modules/@capacitor/ios/Capacitor',
  CapacitorCordova: 'node_modules/@capacitor/ios/CapacitorCordova',
  CapgoCapacitorUpdater: 'node_modules/@capgo/capacitor-updater/ios',
};

function hasManifest(dir) {
  if (!existsSync(dir)) return false;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'PrivacyInfo.xcprivacy') return true;
    if (statSync(p).isDirectory() && name !== 'node_modules' && hasManifest(p)) return true;
  }
  return false;
}

const missing = [];
if (!existsSync(join(APP_DIR, 'ios/App/App/PrivacyInfo.xcprivacy'))) missing.push('App target (ios/App/App/PrivacyInfo.xcprivacy)');
for (const pod of REQUIRED) if (!hasManifest(join(APP_DIR, roots[pod]))) missing.push(pod);
const appManifest = existsSync(join(APP_DIR, 'ios/App/App/PrivacyInfo.xcprivacy')) ? readFileSync(join(APP_DIR, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8') : '';
for (const [pod, cats] of Object.entries(COVERED_BY_APP)) {
  if (hasManifest(join(APP_DIR, roots[pod]))) continue;
  for (const c of cats) if (!appManifest.includes(`NSPrivacyAccessedAPICategory${c}`)) missing.push(`${pod} (app manifest lacks ${c})`);
}
if (missing.length) {
  console.error(`check-privacy-manifests: missing PrivacyInfo.xcprivacy for: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`check-privacy-manifests: app target and ${REQUIRED.join(', ')} ship privacy manifests; the app manifest covers ${Object.keys(COVERED_BY_APP).join(', ')}`);
