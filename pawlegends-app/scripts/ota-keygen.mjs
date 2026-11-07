#!/usr/bin/env node
/**
 * Make the OTA signing key pair (RSA-2048, the format the updater checks). Run once.
 *
 *   node scripts/ota-keygen.mjs            writes ota/.keys/private-key.pem (gitignored) and ota/public-key.pem
 *   node scripts/ota-keygen.mjs --force    replaces an existing pair (every installed app then rejects new bundles
 *                                          until a native release ships the new public key: only for a leaked key)
 *
 * Then put the private key in the GitHub secret OTA_PRIVATE_KEY (the whole PEM text), e.g.
 *   gh secret set OTA_PRIVATE_KEY < pawlegends-app/ota/.keys/private-key.pem
 * and keep a copy in the password manager. Commit ota/public-key.pem.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateKeys } from './lib/capgo-crypto.mjs';
import { LOCAL_PRIVATE_KEY_PATH, PUBLIC_KEY_PATH } from './lib/app-config.mjs';

const force = process.argv.includes('--force');
if (existsSync(LOCAL_PRIVATE_KEY_PATH) && !force) {
  console.error(`ota-keygen: ${LOCAL_PRIVATE_KEY_PATH} exists (use --force to replace it)`);
  process.exit(1);
}
const { privatePem, publicPem } = generateKeys();
mkdirSync(dirname(LOCAL_PRIVATE_KEY_PATH), { recursive: true });
writeFileSync(LOCAL_PRIVATE_KEY_PATH, privatePem, { mode: 0o600 });
chmodSync(LOCAL_PRIVATE_KEY_PATH, 0o600);
writeFileSync(PUBLIC_KEY_PATH, publicPem);
console.log(`ota-keygen: private key -> ${LOCAL_PRIVATE_KEY_PATH} (never commit)\nota-keygen: public key  -> ${PUBLIC_KEY_PATH} (commit)`);
