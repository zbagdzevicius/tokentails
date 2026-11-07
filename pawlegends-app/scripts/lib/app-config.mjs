/**
 * Constants shared by the app's build and release scripts (docs/plans/moba/APP-STORE.md). capacitor.config.ts and
 * src/shell read the same values through the build (esbuild defines), so they are named once here.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(here, '../..');
export const REPO_DIR = resolve(APP_DIR, '..');

export const APP_ID = 'com.tokentails.pawlegends';

/**
 * Native compat level. Raise it (and ship a native release) whenever the native shell changes in a way an older
 * bundle or an older binary cannot handle: a new plugin, a new Info.plist key the web code relies on. Bundles are
 * published per level, and each shell only reads its own level's manifest.
 */
export const NATIVE_COMPAT = 1;

/** Where tokentails.com serves the updates (client/public is the Vercel site root). */
export const UPDATES_URL = 'https://tokentails.com/pawlegends-app/updates';
export const MANIFEST_URL = `${UPDATES_URL}/ios/${NATIVE_COMPAT}/manifest.json`;
/** OTA_UPDATES_DIR overrides it (a dry run into a scratch folder). */
export const UPDATES_DIR = process.env.OTA_UPDATES_DIR ? resolve(process.env.OTA_UPDATES_DIR) : resolve(REPO_DIR, 'client/public/pawlegends-app/updates');

/** The committed OTA public key (PKCS#1 PEM). The private key never enters git. */
export const PUBLIC_KEY_PATH = resolve(APP_DIR, 'ota/public-key.pem');
/** Default local private key (gitignored). CI passes OTA_PRIVATE_KEY (the PEM) or OTA_PRIVATE_KEY_PATH. */
export const LOCAL_PRIVATE_KEY_PATH = resolve(APP_DIR, 'ota/.keys/private-key.pem');

export const API_ORIGIN = 'https://api.tokentails.com';
