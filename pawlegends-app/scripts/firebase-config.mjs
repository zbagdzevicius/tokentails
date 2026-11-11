#!/usr/bin/env node
/**
 * Native Firebase config for sign-in (docs/plans/moba/APP-STORE.md "Sign-in", pawlegends-app/README.md "Sign-in setup").
 *
 * The app signs in with the Firebase JS SDK; Google and Apple run natively through @capacitor-firebase/authentication.
 * Google needs the Firebase app files of THIS app (bundle/package com.tokentails.pawlegends, Firebase project
 * news-ccd33): `ios/App/App/GoogleService-Info.plist` and `android/app/google-services.json`. They are public config
 * (they ship inside every build), committed like the Token Tails app's. Without them the app still builds and runs:
 * Google sign-in is off (the sheet says so), Apple (iOS, Mac) and email work.
 *
 *   node scripts/firebase-config.mjs sync
 *     iOS: writes the Google URL scheme (the plist's REVERSED_CLIENT_ID) into Info.plist CFBundleURLTypes, or removes
 *     it when there is no plist. GoogleSignIn throws (a crash) without it, so the shell turns Google on only when the
 *     scheme is there (NativeAuth.swift).
 *   node scripts/firebase-config.mjs check [--platform ios|android|all] [--release]
 *     Says what is missing, with the founder steps. `--release` (fastlane lanes, Gradle release tasks): exit 1, so a
 *     store build never ships without Google sign-in.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(here, '..');
export const IOS_PLIST = join(APP_DIR, 'ios/App/App/GoogleService-Info.plist');
export const INFO_PLIST = join(APP_DIR, 'ios/App/App/Info.plist');
export const ANDROID_JSON = join(APP_DIR, 'android/app/google-services.json');
export const BUNDLE_ID = 'com.tokentails.pawlegends';
export const URL_NAME = 'google-sign-in';

export const FOUNDER_STEPS = {
  ios: [
    'Firebase console (project news-ccd33) → Project settings → Your apps → Add app → iOS.',
    `  Bundle ID: ${BUNDLE_ID}; App Store ID: from App Store Connect (App Information → Apple ID).`,
    '  Download GoogleService-Info.plist to pawlegends-app/ios/App/App/GoogleService-Info.plist and commit it.',
    'Then: cd pawlegends-app && npm run build (writes the Google URL scheme into Info.plist).',
  ],
  android: [
    'Firebase console (project news-ccd33) → Project settings → Your apps → Add app → Android.',
    `  Package name: ${BUNDLE_ID}.`,
    '  Add the SHA-1 and SHA-256 of: the Play app signing key (Play Console → Test and release → App integrity),',
    '  the upload key (keytool -list -v -keystore <upload.jks>) and the debug key (cd android && ./gradlew signingReport).',
    '  Download google-services.json to pawlegends-app/android/app/google-services.json and commit it.',
  ],
};

/** The plist's REVERSED_CLIENT_ID, or null. */
export function reversedClientId(plistText) {
  const m = /<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(plistText ?? '');
  const v = m?.[1]?.trim();
  return v && /^com\.googleusercontent\.apps\.[A-Za-z0-9.-]+$/.test(v) ? v : null;
}

/** The bundle id a GoogleService-Info.plist was made for, or null. */
export function plistBundleId(plistText) {
  return /<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(plistText ?? '')?.[1]?.trim() ?? null;
}

/** The package names a google-services.json has clients for. */
export function jsonPackages(jsonText) {
  try {
    const j = JSON.parse(jsonText);
    return (j.client ?? []).map((c) => c?.client_info?.android_client_info?.package_name).filter(Boolean);
  } catch {
    return [];
  }
}

const URL_TYPES = /\n?\t<key>CFBundleURLTypes<\/key>\n\t<array>[\s\S]*?\n\t<\/array>/;

/** Info.plist with exactly one Google URL type for `scheme` (or none when `scheme` is null). Pure. */
export function withUrlScheme(infoText, scheme) {
  let out = infoText.replace(URL_TYPES, '');
  if (!scheme) return out;
  const block = `\n\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleTypeRole</key>\n\t\t\t<string>Editor</string>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>${URL_NAME}</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${scheme}</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>`;
  const anchor = '\n\t<key>CFBundleVersion</key>';
  if (!out.includes(anchor)) throw new Error('firebase-config: Info.plist has no CFBundleVersion key to anchor CFBundleURLTypes');
  out = out.replace(anchor, `${block}${anchor}`);
  return out;
}

/** What is missing or wrong, per platform. */
export function problems(platform) {
  const out = [];
  if (platform === 'ios' || platform === 'all') {
    if (!existsSync(IOS_PLIST)) out.push({ platform: 'ios', text: 'ios/App/App/GoogleService-Info.plist is missing' });
    else {
      const text = readFileSync(IOS_PLIST, 'utf8');
      const id = plistBundleId(text);
      if (id && id !== BUNDLE_ID) out.push({ platform: 'ios', text: `GoogleService-Info.plist is for ${id}, not ${BUNDLE_ID}` });
      if (!reversedClientId(text)) out.push({ platform: 'ios', text: 'GoogleService-Info.plist has no REVERSED_CLIENT_ID (enable Google sign-in, then download it again)' });
      else if (!readFileSync(INFO_PLIST, 'utf8').includes(reversedClientId(text))) out.push({ platform: 'ios', text: 'Info.plist lacks the Google URL scheme: run `npm run build` (or node scripts/firebase-config.mjs sync)' });
    }
  }
  if (platform === 'android' || platform === 'all') {
    if (!existsSync(ANDROID_JSON)) out.push({ platform: 'android', text: 'android/app/google-services.json is missing' });
    else if (!jsonPackages(readFileSync(ANDROID_JSON, 'utf8')).includes(BUNDLE_ID)) out.push({ platform: 'android', text: `google-services.json has no client for ${BUNDLE_ID}` });
  }
  return out;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (cmd === 'sync') {
    const scheme = existsSync(IOS_PLIST) ? reversedClientId(readFileSync(IOS_PLIST, 'utf8')) : null;
    const before = readFileSync(INFO_PLIST, 'utf8');
    const after = withUrlScheme(before, scheme);
    if (after !== before) writeFileSync(INFO_PLIST, after);
    console.log(scheme ? 'firebase-config: Google URL scheme set in Info.plist' : 'firebase-config: no GoogleService-Info.plist, so no Google URL scheme (Google sign-in off in this build)');
    return 0;
  }
  if (cmd === 'check') {
    const platform = opt('--platform') ?? 'all';
    if (!['ios', 'android', 'all'].includes(platform)) throw new Error(`firebase-config: --platform ios|android|all, not ${platform}`);
    const release = rest.includes('--release');
    const found = problems(platform);
    if (!found.length) {
      console.log(`firebase-config: ${platform} sign-in config is complete`);
      return 0;
    }
    const say = release ? console.error : console.warn;
    say(`firebase-config: ${release ? 'a store build needs' : 'Google sign-in is off in this build until you add'} the native Firebase config:`);
    for (const p of found) say(`  - ${p.platform}: ${p.text}`);
    for (const p of [...new Set(found.map((f) => f.platform))]) {
      say(`\nFounder steps (${p}):`);
      for (const line of FOUNDER_STEPS[p]) say(`  ${line}`);
    }
    return release ? 1 : 0;
  }
  console.error('usage: node scripts/firebase-config.mjs sync | check [--platform ios|android|all] [--release]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
