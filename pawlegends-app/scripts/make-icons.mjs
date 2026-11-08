#!/usr/bin/env node
/**
 * App icon and launch art from the PawLegends brand masters (brand/pawlegends, founder picks Nov 2026: app icon #143,
 * the crowned black cat on orange; logo #48, the yellow-and-purple wordmark with the paw fist-bump). Writes:
 *
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png   single-size iOS icon (Xcode makes every smaller
 *                                                                      size at build time), RGB, no alpha
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/mac-*.png           the Mac app's icon (Mac Catalyst), 16 to 1024 px:
 *                                                                      the brand's macOS tiles (Apple's macOS grid: an
 *                                                                      824 px rounded square with margin and shadow)
 *   ios/App/App/Assets.xcassets/LaunchLogo.imageset/logo@{1,2,3}x.png  the launch-screen logo (240 pt wide), the same
 *                                                                      art and size as the web boot splash
 *                                                                      (pawlegends/index.html #boot), so the hand-over
 *                                                                      does not jump
 *   store/app-icon-1024.png                                            the iOS icon, for the listing and press
 *
 * Usage: node scripts/make-icons.mjs   (outputs are committed; re-run only when brand/pawlegends changes)
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { APP_DIR, REPO_DIR } from './lib/app-config.mjs';

const BRAND = join(REPO_DIR, 'brand/pawlegends');
const assets = join(APP_DIR, 'ios/App/App/Assets.xcassets');
const BG = '#2b1d2e';
/** Launch logo width in points (pawlegends/index.html `#boot img` draws it at 240 CSS px). */
const LAUNCH_PT = 240;

function brand(name) {
  const p = join(BRAND, name);
  if (!existsSync(p)) throw new Error(`make-icons: missing brand master ${p}`);
  return p;
}

async function appIcon() {
  // App Store Connect rejects an icon with an alpha channel; the master is RGB already, flatten anyway
  const png = await sharp(brand('app-icon-ios-1024.png'))
    .resize(1024, 1024)
    .flatten({ background: BG })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const dir = join(assets, 'AppIcon.appiconset');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AppIcon-1024.png'), png);
  // App Store Connect takes the icon from the binary; this copy is for the listing preview and press
  writeFileSync(join(APP_DIR, 'store/app-icon-1024.png'), png);
}

/** The Mac sizes: the brand's macOS tiles, already in Apple's macOS icon grid (macOS does not mask icons). */
async function macIcons() {
  const dir = join(assets, 'AppIcon.appiconset');
  for (const f of readdirSync(dir)) if (f.startsWith('mac-')) rmSync(join(dir, f));
  const images = [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }];
  const written = new Set();
  for (const pt of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const px = pt * scale;
      const name = `mac-${px}.png`;
      if (!written.has(px)) {
        writeFileSync(join(dir, name), await sharp(brand(`app-icon-macos-${px}.png`)).resize(px, px).png({ compressionLevel: 9 }).toBuffer());
        written.add(px);
      }
      images.push({ filename: name, idiom: 'mac', scale: `${scale}x`, size: `${pt}x${pt}` });
    }
  }
  writeFileSync(join(dir, 'Contents.json'), `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`);
}

async function launchLogo() {
  const trimmed = await sharp(brand('logo.png')).trim({ threshold: 1 }).png().toBuffer();
  for (const old of ['LaunchPaw.imageset', 'LaunchLogo.imageset', 'Splash.imageset']) rmSync(join(assets, old), { recursive: true, force: true });
  const dir = join(assets, 'LaunchLogo.imageset');
  mkdirSync(dir, { recursive: true });
  const images = [];
  for (const scale of [1, 2, 3]) {
    const name = `logo@${scale}x.png`;
    writeFileSync(join(dir, name), await sharp(trimmed).resize({ width: LAUNCH_PT * scale, kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer());
    images.push({ filename: name, idiom: 'universal', scale: `${scale}x` });
  }
  writeFileSync(join(dir, 'Contents.json'), `${JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)}\n`);
}

await appIcon();
await macIcons();
await launchLogo();
console.log('make-icons: AppIcon (1024, no alpha; Mac sizes), LaunchLogo, store/app-icon-1024.png from brand/pawlegends');
