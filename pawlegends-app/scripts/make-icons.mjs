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
 * Android (android/app/src/main/res, docs/plans/moba/PLAY-STORE.md), from the same iOS icon master:
 *
 *   mipmap-<density>/ic_launcher.png, ic_launcher_round.png            legacy launcher icons (48 dp; square and round)
 *   mipmap-<density>/ic_launcher_foreground.png                        the adaptive icon (108 dp): the art at 80 dp
 *                                                                      on its own ray colour, so every launcher mask
 *                                                                      (circle, squircle) keeps the crown and the face
 *   drawable-<density>/splash_icon.png                                 the Android 12+ splash icon (288 dp, the art
 *                                                                      inside the 192 dp circle the system shows)
 *   fastlane/metadata_android/en-US/images/icon.png                    the Play listing icon (512 px, 32-bit PNG)
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

const ANDROID_RES = join(APP_DIR, 'android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
/** The ray colour at the master's edge: fills the adaptive canvas beyond the art (seen only in launcher motion). */
const ADAPTIVE_BG = '#f4623f';

const circleMask = (px) => Buffer.from(`<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`);

async function androidIcons() {
  if (!existsSync(ANDROID_RES)) {
    console.log('make-icons: no android/ project, Android icons skipped');
    return;
  }
  const master = await sharp(brand('app-icon-ios-1024.png')).resize(1024, 1024).flatten({ background: BG }).removeAlpha().png().toBuffer();
  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = join(ANDROID_RES, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const legacy = Math.round(48 * scale);
    writeFileSync(join(dir, 'ic_launcher.png'), await sharp(master).resize(legacy, legacy, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer());
    writeFileSync(
      join(dir, 'ic_launcher_round.png'),
      await sharp(master).resize(legacy, legacy, { kernel: 'lanczos3' }).composite([{ input: circleMask(legacy), blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer(),
    );
    const canvas = Math.round(108 * scale);
    const art = Math.round(80 * scale);
    const off = Math.round((canvas - art) / 2);
    writeFileSync(
      join(dir, 'ic_launcher_foreground.png'),
      await sharp({ create: { width: canvas, height: canvas, channels: 4, background: ADAPTIVE_BG } })
        .composite([{ input: await sharp(master).resize(art, art, { kernel: 'lanczos3' }).toBuffer(), left: off, top: off }])
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
    const splashDir = join(ANDROID_RES, `drawable-${density}`);
    mkdirSync(splashDir, { recursive: true });
    const sc = Math.round(288 * scale);
    const circle = Math.round(192 * scale);
    const so = Math.round((sc - circle) / 2);
    const disc = await sharp(master).resize(circle, circle, { kernel: 'lanczos3' }).composite([{ input: circleMask(circle), blend: 'dest-in' }]).png().toBuffer();
    writeFileSync(
      join(splashDir, 'splash_icon.png'),
      await sharp({ create: { width: sc, height: sc, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: disc, left: so, top: so }])
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
  }
  const play = join(APP_DIR, 'fastlane/metadata_android/en-US/images');
  mkdirSync(play, { recursive: true });
  // Play wants a 32-bit PNG (with alpha channel), 512 px, up to 1 MB
  writeFileSync(join(play, 'icon.png'), await sharp(master).resize(512, 512, { kernel: 'lanczos3' }).ensureAlpha().png({ compressionLevel: 9 }).toBuffer());
}

await appIcon();
await macIcons();
await launchLogo();
await androidIcons();
console.log('make-icons: AppIcon (1024, no alpha; Mac sizes), LaunchLogo, store/app-icon-1024.png, Android launcher + splash icons from brand/pawlegends');
