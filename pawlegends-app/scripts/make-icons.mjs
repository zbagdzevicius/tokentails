#!/usr/bin/env node
/**
 * App icon and launch art from the existing Pawlegends art (Clem's hero portrait on the landing, and the boot
 * splash paw from pawlegends/index.html), in the game's palette. Writes:
 *
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   single-size icon (Xcode makes every
 *                                                                      smaller size at build time), no alpha
 *   ios/App/App/Assets.xcassets/LaunchPaw.imageset/paw@{1,2,3}x.png    the launch-screen paw (64 pt)
 *   store/app-icon-1024.png                                            the same icon, for the listing and press
 *
 * Usage: node scripts/make-icons.mjs   (outputs are committed; re-run only when the art changes)
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { APP_DIR, REPO_DIR } from './lib/app-config.mjs';

const BG = '#2b1d2e';
const BG_LIGHT = '#4a3050';
const ROSE = '#ff6f91';
const BUTTER = '#ffd27a';

const landing = join(REPO_DIR, 'client/public/pawlegends/landing');
const portrait = readdirSync(landing).find((f) => /^portrait-clem\.[0-9a-f]+\.webp$/.test(f));
if (!portrait) throw new Error('make-icons: no portrait-clem.<hash>.webp in client/public/pawlegends/landing');

const assets = join(APP_DIR, 'ios/App/App/Assets.xcassets');

async function appIcon() {
  const S = 1024;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <defs>
      <radialGradient id="g" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${BG_LIGHT}"/><stop offset="1" stop-color="${BG}"/></radialGradient>
      <radialGradient id="ring" cx="50%" cy="50%" r="50%"><stop offset="0.62" stop-color="${ROSE}" stop-opacity="0"/><stop offset="0.8" stop-color="${ROSE}" stop-opacity="0.55"/><stop offset="1" stop-color="${ROSE}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#g)"/>
    <ellipse cx="512" cy="900" rx="430" ry="120" fill="url(#ring)"/>
    <circle cx="512" cy="470" r="360" fill="${BUTTER}" fill-opacity="0.10"/>
  </svg>`);
  // the hero, cropped to head and body, as big as the icon allows
  const hero = await sharp(join(landing, portrait))
    .extract({ left: 60, top: 80, width: 360, height: 360 })
    .resize(940, 940, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const png = await sharp(bg)
    .composite([{ input: hero, left: 30, top: 84 }])
    .flatten({ background: BG })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const dir = join(assets, 'AppIcon.appiconset');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AppIcon-1024.png'), png);
  writeFileSync(
    join(dir, 'Contents.json'),
    `${JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
  );
  // App Store Connect takes the icon from the binary; this copy is for the listing preview and press
  writeFileSync(join(APP_DIR, 'store/app-icon-1024.png'), png);
}

async function launchPaw() {
  // the boot splash paw (pawlegends/index.html #boot svg), so the native launch screen hands over to it seamlessly
  const svg = (px) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${px}" height="${px}"><g fill="${ROSE}"><ellipse cx="24" cy="31" rx="10" ry="8"/><circle cx="12" cy="20" r="4.5"/><circle cx="20" cy="13" r="4.5"/><circle cx="28" cy="13" r="4.5"/><circle cx="36" cy="20" r="4.5"/></g></svg>`);
  const dir = join(assets, 'LaunchPaw.imageset');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const images = [];
  for (const scale of [1, 2, 3]) {
    const name = `paw@${scale}x.png`;
    writeFileSync(join(dir, name), await sharp(svg(64 * scale)).png().toBuffer());
    images.push({ filename: name, idiom: 'universal', scale: `${scale}x` });
  }
  writeFileSync(join(dir, 'Contents.json'), `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`);
  // the Capacitor template's splash image is not used by our launch screen
  rmSync(join(assets, 'Splash.imageset'), { recursive: true, force: true });
}

await appIcon();
await launchPaw();
console.log('make-icons: AppIcon (1024, no alpha), LaunchPaw, store/app-icon-1024.png');
