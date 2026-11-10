# Pawlegends on Google Play

The Android build of the Pawlegends app (`com.tokentails.pawlegends`, appName Pawlegends), published under the
organisation account **TOKEN TAILS, MB** (which already publishes `com.tokentails.app`). The same Capacitor 7 project
as the iOS app (`pawlegends-app/`), the same bundled game and the same over-the-air updates. iOS plan:
[`APP-STORE.md`](APP-STORE.md); privacy and age answers shared with iOS: [`APP-STORE-ANSWERS.md`](APP-STORE-ANSWERS.md).

## Status (2026-11-10, branch `feat/pawlegends-android`)

Built and checked locally on this Mac (Android command-line tools in `/opt/homebrew/share/android-commandlinetools`):

- `./gradlew assembleDebug bundleRelease` pass; the release `.aab` (10 MB) is signed with the upload key; JVM unit
  tests pass; `bundle exec fastlane android build` passes.
- Emulator (Android 16 / API 36, arm64, Chromium WebView 133): the app starts in landscape, full screen, renders the
  title and a bot match (WebGL 2), the shell reads channel `dev` (the document-start script works), and the Back key in
  a match opens the pause menu instead of quitting. Requests leave with `Origin: https://localhost`; production refused
  them (CORS) until the backend change in this branch is deployed.
- Not verified yet (needs a real phone): haptics feel, a display cutout, a tablet, battery saver and thermal events,
  an OTA download and swap, party play against the deployed backend.

## What was built

| Piece | Where |
|---|---|
| Android project (`cap add android`, then edited) | `pawlegends-app/android/` |
| Game window: immersive full screen, cutout padding, no zoom or overscroll, textZoom 100, keep screen on, media volume keys, back-gesture exclusion at the lower side edges | `android/app/src/main/java/com/tokentails/pawlegends/MainActivity.java` |
| Page globals at document start (`__PL_CHANNEL__`, `__PL_PLATFORM__ = 'android'`, `__PL_THERMAL__` + `pl-thermal`, `__PL_DEVICE__`), renderer-crash recovery | `.../ShellPlugin.java` |
| Back button and gesture | `pawlegends-app/src/shell/back.ts` (Escape into the game; minimise only on the bare title) |
| Haptics through `@capacitor/haptics` (replaces the WebView's own too-short vibrate) | `src/shell/haptics.ts` (`force`) |
| Per-platform OTA manifests | `src/shell/manifest.ts`, `scripts/ota-publish.mjs`, `.github/workflows/pawlegends-ota.yml` |
| Backend origin `https://localhost` (REST CORS and the party relay share one list) | `backend/src/shared/cors-origins.ts` |
| Game: `shellPlatform()` knows `'android'`; a budget device starts a fresh install on Low | `pawlegends/src/app/platform.ts`, `render/perf/device.ts`, `render/quality.ts` |
| Icons: legacy, round, adaptive, splash, Play 512, feature graphic 1024×500 | `scripts/make-icons.mjs` |
| Phone screenshots 1920×1080 (16:9) | `scripts/screenshots.mjs --device android` |
| fastlane lanes `android check/build/internal/metadata/promote`; listing | `pawlegends-app/fastlane/Fastfile`, `fastlane/metadata_android/en-US/` |
| CI | `.github/workflows/android-play.yml` (*Pawlegends Android*, by hand only) |

## iOS parity

| iOS (GameViewController.swift / AppDelegate.swift) | Android |
|---|---|
| Landscape only | `screenOrientation="sensorLandscape"`; `appCategory="game"` so Android 16 (targetSdk 36) keeps the lock on screens ≥ 600 dp |
| Status bar hidden, home indicator auto-hidden | Immersive: system bars hidden, a swipe shows them for a moment; re-applied on focus and resume |
| `contentInset never`, safe areas | Window draws into the cutout (`SHORT_EDGES`); the WebView's parent is padded by the cutout insets, so `env(safe-area-inset-*)` reads 0 harmlessly |
| Edge gestures deferred | Gesture exclusion: lower 200 dp of both side edges (Android's cap), where the joystick and the abilities are |
| No back/forward swipe | `backButton` listener (Android 16 sends no `KEYCODE_BACK` with predictive back): Escape, or minimise on the title |
| No zoom, no bounce, no link preview | Zoom off, `textZoom` 100, `OVER_SCROLL_NEVER`, no scrollbars, long press consumed |
| Background `#2b1d2e` | Theme window background, splash background, WebView and its parent |
| Launch screen | Android 12+ SplashScreen API: the app icon on `#2b1d2e` |
| Audio session `.playback` + mix | Nothing needed: WebAudio plays on the media stream, ignores the ringer, takes no audio focus; volume keys set to media |
| Screen kept on | `FLAG_KEEP_SCREEN_ON` (only while the window is visible) |
| Thermal state + Low Power Mode | `PowerManager` thermal status (Android 10+: none → nominal, light → fair, moderate → serious, severe and above → critical) and battery saver |
| Channel: Debug dev, TestFlight beta, else stable | Debug builds `dev`, release `stable` (`-PplOtaChannel=beta` makes a tester build; Play cannot tell internal testing from production) |

## Decisions

- **Origin `https://localhost`** (Capacitor's default, pinned in `capacitor.config.ts`). Never change `androidScheme`
  or `hostname` after the first release: the origin changes and every player loses localStorage (settings, quality,
  OTA state, party key). The backend must be deployed with `https://localhost` **before** testers install, or party
  play and REST calls fail CORS (bots offline still work).
- **targetSdk / compileSdk 36** (Play requirement since Aug 31 2026), **minSdk 26**, AGP 8.9.1 (the first that supports
  36), Gradle 8.11.1, JDK 21. Capacitor stays on 7.6 like iOS.
- **Device filter:** OpenGL ES 3.0 (WebGL 2) and a touchscreen are required; `minWebViewVersion` 110.
- **Backup off** (`allowBackup=false`, data extraction rules exclude everything): OTA state must match the installed bundle.
- **No shrinking** (`minifyEnabled false`): a WebView shell; R8 would need keep rules for every plugin.
- **Permissions:** INTERNET; the plugins add VIBRATE (haptics) and, from the updater's WorkManager, WAKE_LOCK,
  ACCESS_NETWORK_STATE, RECEIVE_BOOT_COMPLETED and FOREGROUND_SERVICE (no typed foreground-service permission, so no
  Play foreground-service declaration).
- **Low-end start:** a fresh install starts on Low when `ActivityManager.isLowRamDevice()` or RAM < 4.5 GB (or a
  Chromium `deviceMemory` ≤ 2); otherwise phone Medium with the first-match probe, as on iPhone.
- **Renderer killed for memory:** the activity restarts instead of the app crashing.

## OTA

One publish serves both platforms. The encrypted zip stays in `client/public/pawlegends-app/updates/ios/<compat>/bundles/`
(the installed iOS binaries accept only that path); each platform has its own signed manifests
`updates/<ios|android>/<compat>/manifest(-beta).json` with its own `minNative` (Android: `versionName`) and
rollback state. `--min-native` sets both; `--min-native-ios` / `--min-native-android` set one (the OTA workflow has a
`min_native_android` input). Promote and rollback act on both. `NATIVE_COMPAT` stays shared: bump it for both when
either shell changes in a way old bundles cannot handle. The Android manifests appear with the first publish after
this branch reaches `main`; until then an Android install reports `no-manifest` and plays its built-in bundle.

Google Play allows this: its Device and Network Abuse policy exempts code that runs in a WebView. Purchase links stay
hidden in the app build (`VITE_PAWLEGENDS_APP=1`), as Play's payments policy needs.

Local drill: `npm run android:debug`, install it, `adb reverse tcp:8787 tcp:8787`, then `scripts/ota-local.mjs`
publish and serve as on iOS (debug builds allow cleartext to localhost only).

## Versions

- `versionName` = `pawlegends-app/package.json` `version` (the same as iOS).
- `versionCode`: CI passes `100000 + run number` (`PL_VERSION_CODE`); a local build without it gets the version as a
  number (1.0.1 → 10001), always lower than any CI upload. Play rejects a code it has seen.

## Release

```sh
cd pawlegends-app
npm run build:android                       # game + shell → www/, cap sync android
npm run android:debug                       # debug APK (channel dev)
export PATH=/opt/homebrew/opt/ruby/bin:$PATH ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
set -a; . ~/.tokentails-keys/pawlegends-android-upload.env; set +a
PL_VERSION_CODE=100001 bundle exec fastlane android build     # signed .aab in android/app/build/outputs/bundle/release/
```

CI: Actions → *Pawlegends Android* → lane `build` (artifact only), `upload` (track, default internal; status
`draft` while the app is a draft in Play Console), `metadata`, `promote` (internal → production as a draft; type
PROMOTE). Production rollout is pressed by a person in Play Console (staged 20% → 100%).

## Secrets

The upload keystore was generated on the founder's Mac: `~/.tokentails-keys/pawlegends-android-upload.jks` (PKCS12,
RSA 4096, alias `upload`, valid 10,000 days) and its passwords in `~/.tokentails-keys/pawlegends-android-upload.env`
(both mode 600, outside the repo). **Back both files up** (password manager or an encrypted drive). Losing them means
an upload-key reset through Play Console support (days).

Add the GitHub secrets from that Mac (values never printed):

```sh
cd ~/me/tokentails-app
base64 -i ~/.tokentails-keys/pawlegends-android-upload.jks | tr -d '\n' | gh secret set ANDROID_UPLOAD_KEYSTORE_B64
( set -a; . ~/.tokentails-keys/pawlegends-android-upload.env
  printf %s "$ANDROID_UPLOAD_KEYSTORE_PASSWORD" | gh secret set ANDROID_UPLOAD_KEYSTORE_PASSWORD
  printf %s "$ANDROID_UPLOAD_KEY_ALIAS" | gh secret set ANDROID_UPLOAD_KEY_ALIAS
  printf %s "$ANDROID_UPLOAD_KEY_PASSWORD" | gh secret set ANDROID_UPLOAD_KEY_PASSWORD )
gh secret set GOOGLE_PLAY_JSON_KEY < /path/to/play-service-account.json   # then delete the downloaded file
```

## Founder steps in Play Console

1. **Create the app** (TOKEN TAILS, MB → Create app): name *Pawlegends*, default language English (US), **Game**,
   **Free**; accept the declarations. Check the home page for the developer-verification / package-registration banner
   (mandatory since Sep 30 2026; usually automatic).
2. **Service account:** Play Console → Users and permissions → invite the existing Token Tails service account (the
   one `client/android` uses) or a new one with the Google Play Android Developer API enabled; give it app access to
   Pawlegends with *Release to testing tracks*, *Release to production* (for promote drafts) and *Manage store
   presence*. Add its JSON key as `GOOGLE_PLAY_JSON_KEY`.
3. **First bundle by hand** (the API cannot upload to an app that has never had one): run *Pawlegends Android* with
   lane `build`, download the `.aab` artifact, then Testing → Internal testing → Create release → upload it. Play App
   Signing is enrolled automatically (Google keeps the app signing key, our key is the upload key). Add tester emails.
   Later uploads: lane `upload` (`release_status: draft` until the app leaves draft state).
4. **App content** (Policy → App content):
   - Privacy policy: `https://tokentails.com/pawlegends/privacy` (deploy `main` first; the page now names Android).
   - Ads: **No**. App access: **All functionality available without special access** (no login).
   - Target audience: **13+** (13–15, 16–17, 18+), so the Families policy does not apply; not designed for children.
   - Content rating (IARC): answers below.
   - Data safety: answers below.
   - Government, financial, health, news, COVID: not applicable.
5. **Store listing:** run lane `metadata` (title, short and full description, icon, feature graphic, five phone
   screenshots), or paste from `fastlane/metadata_android/en-US/`. Category **Games → Strategy**; contact email
   info@tokentails.com; website https://tokentails.com/pawlegends.
6. **12 testers / 14 days:** Play requires it only for personal accounts created after Nov 13 2023. If the Console still
   asks for a closed test on this organisation account, run one (12 testers, 14 days) before production access.
7. **Test on real phones** from the internal track: a mid-range phone, one with a punch-hole camera, a tablet; check a
   bot match, a party match, Back in a match, haptics, and the pre-launch report. Then `promote` and roll out.

## Data safety answers

Same facts as the iOS privacy label (`APP-STORE-ANSWERS.md`, `PrivacyInfo.xcprivacy`, the privacy page). Solo play
sends nothing; party play sends a random party key and the match.

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | **Yes** |
| Is all data encrypted in transit? | **Yes** (HTTPS and WSS) |
| Do you provide a way for users to request that their data is deleted? | **No**: there are no accounts, and the data deletes itself (parties 3 h after their last change, finished rooms after 30 days), as the privacy policy says |
| **Device or other IDs** (the random party key; the server keeps its hash) | Collected, **not shared**, **optional** (party play only), processed ephemerally: No; purposes **App functionality**, **Fraud prevention, security, and compliance** (per-key and per-network caps) |
| **App activity → Other user-generated content / Other actions** (generated player name, hero picks, match inputs, quick-chat phrases, result) | Collected, not shared, optional; purposes App functionality |
| Location, personal info, financial, health, messages, photos, audio, files, calendar, contacts, web history, app info and performance, crash logs | **Not collected** |
| Shared with third parties | **No** |

Quick-chat is fixed phrases only, so it is not "Messages". If analytics or a crash SDK is ever added (a native
release, never by OTA), update this form, the iOS label and the privacy page before that version ships.

## Content rating answers (IARC questionnaire)

Category **Game**. Expected: PEGI 7, ESRB E10+, USK 6.

| Question | Answer |
|---|---|
| Violence | Yes: cartoon or fantasy violence against cartoon animals (non-realistic, no blood or gore; heroes are knocked out and respawn) |
| Fear, sexuality, nudity, language, drugs, alcohol, tobacco, crude humour, discrimination | No |
| Gambling, simulated gambling, loot boxes | No |
| Interaction between users | Yes, limited: players in a party can send only predefined quick-chat phrases and map pings; no free text, no voice |
| Shares user location | No |
| Digital purchases | No |
| Unrestricted internet / web browser | No |

## Store listing

Text in `pawlegends-app/fastlane/metadata_android/en-US/`: `title.txt` "Pawlegends: Cats vs Dogs" (24/30),
`short_description.txt` (78/80), `full_description.txt` (rewritten from the iOS copy for 3v3 Quick and 5v5 Classic,
no iPhone wording), `changelogs/default.txt`. Images: `icon.png` 512, `featureGraphic.png` 1024×500 (the brand's
social card), `phoneScreenshots/` five 1920×1080 gameplay captures. `tests/android.test.ts` checks Play's limits.

## Review-risk register

| Risk | Mitigation |
|---|---|
| Backend not deployed with `https://localhost` | Deploy `main` (DigitalOcean, and the GCP relay image if live) before inviting testers |
| WebView cutout insets / gesture nav vary by device | Native cutout padding; gesture exclusion; check on a punch-hole phone |
| Budget GPUs (Mali-G5x, low Adreno) | Low start on low-RAM devices, the probe and the thermal governor; GLES 3 required |
| Metadata accuracy (3v3 vs 5v5) | Listing names both modes and no hero count |
| OTA policy | WebView code only (allowed); no purchase links in the app build |
| 16 KB page size (updates blocked from Feb 1 2027) | No native `.so` in Capacitor or the plugins; recheck with `bundletool dump config` if a plugin with native code is added |
| Upload key loss | Backed-up keystore; Play upload-key reset as the fallback |
