/**
 * Sign-in native config (scripts/firebase-config.mjs): the Google URL scheme written into Info.plist from the app's
 * GoogleService-Info.plist, and the checks a store build runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLE_ID, jsonPackages, plistBundleId, reversedClientId, withUrlScheme } from '../scripts/firebase-config.mjs';

const INFO = readFileSync(join(__dirname, '../ios/App/App/Info.plist'), 'utf8');
const PLIST = `<plist><dict><key>BUNDLE_ID</key>\n<string>com.tokentails.pawlegends</string><key>REVERSED_CLIENT_ID</key>\n\t<string>com.googleusercontent.apps.123-abc</string></dict></plist>`;

describe('firebase-config', () => {
  it('reads the reversed client id and the bundle id; refuses anything else', () => {
    expect(reversedClientId(PLIST)).toBe('com.googleusercontent.apps.123-abc');
    expect(reversedClientId('<key>REVERSED_CLIENT_ID</key><string>javascript:x</string>')).toBeNull();
    expect(plistBundleId(PLIST)).toBe(BUNDLE_ID);
    expect(jsonPackages(JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: BUNDLE_ID } } }] }))).toEqual([BUNDLE_ID]);
    expect(jsonPackages('not json')).toEqual([]);
  });

  it('adds exactly one Google URL type to Info.plist, idempotently, and removes it without a plist', () => {
    const once = withUrlScheme(INFO, 'com.googleusercontent.apps.123-abc');
    expect(once).toContain('<string>com.googleusercontent.apps.123-abc</string>');
    expect(withUrlScheme(once, 'com.googleusercontent.apps.123-abc')).toBe(once);
    expect(once.match(/CFBundleURLTypes/g)).toHaveLength(1);
    expect(withUrlScheme(once, null)).toBe(INFO);
    expect(withUrlScheme(INFO, null)).toBe(INFO);
  });
});
