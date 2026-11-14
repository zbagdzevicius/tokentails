# Pawlegends iOS, Mac and Android app

The App Store build of Pawlegends: a standalone Capacitor 7 app (`com.tokentails.pawlegends`) with the game bundled
inside, landscape only, that updates its web game over the air from tokentails.com. Plan and review-risk register:
[`docs/plans/moba/APP-STORE.md`](../docs/plans/moba/APP-STORE.md). The Token Tails app in `client/`
(`com.tokentails.app`) is a separate project and is not touched by anything here.

The Mac App Store version is the same target built with Mac Catalyst ("Optimize for Mac"), under the same bundle id
and app record (universal purchase). It runs the same bundled game but takes no over-the-air updates (Mac App Store
guideline 2.4.5; `takesOtaUpdates` in `src/shell/ota.ts`): a Mac build plays the game it shipped with. Differences, all in `#if
targetEnvironment(macCatalyst)`: App Sandbox with outgoing network only (`App.entitlements`, Mac SDK only), hardened
runtime, a resizable 1440×810 window (minimum 1280×720, full screen from the green button or View menu), no title text,
no Format or Help menu, closing the window quits, the WebView asks for desktop content, and the page gets
`window.__PL_PLATFORM__ = 'mac'`: the game then keeps the keyboard and mouse controls and desktop HUD
(`pawlegends/src/app/platform.ts`), and the shell installs no haptics bridge. The app-build guards (no store links,
no purchases) are the same as on iPhone. Sign-in on the Mac: Apple and email (Google is off there).

The Google Play version is the same project's `android/` platform (`com.tokentails.pawlegends`, served from
`https://localhost`), with the same bundle and the same over-the-air updates (its own manifests). Plan, parity table,
Play Console answers and founder steps: [`docs/plans/moba/PLAY-STORE.md`](../docs/plans/moba/PLAY-STORE.md).

## Layout

| Path | What |
|---|---|
| `capacitor.config.ts` | App id, WebView settings, the updater in manual self-hosted mode, the OTA public key |
| `src/shell/` | `shell.js`, loaded before the game: OTA (`ota.ts`, `manifest.ts`), the update gate (`gate.ts`, `policy.ts`) and native haptics (`haptics.ts`) |
| `bridge/` | The compat-1 bridge bundle (`build-web.mjs --bridge`): the "Update Paw Legends" page the 1.0.x apps get as their last OTA |
| `scripts/build-web.mjs` | Builds `../pawlegends` for the app into `www/` (app build flag, production API, no analytics key) and adds `shell.js` |
| `scripts/ota-publish.mjs` | Zips, encrypts and signs `www/` into `client/public/pawlegends-app/updates/ios/<compat>/` |
| `scripts/ota-local.mjs` | Publishes into a scratch folder and serves it on `localhost:8787` for a Debug build (try an update before it ships) |
| `scripts/ota-keygen.mjs` | Makes the OTA RSA key pair (done once; public key committed in `ota/public-key.pem`) |
| `scripts/make-icons.mjs`, `scripts/screenshots.mjs` | App icon and launch logo (from `brand/pawlegends`); App Store screenshots (6.9" landscape) |
| `scripts/build-sim.mjs` | Unsigned simulator build (`--run` installs and launches it) |
| `scripts/build-mac.mjs` | Unsigned Mac Catalyst build (`--run` opens it; `--run --probe <dir>` writes a snapshot and what the page sees, then quits) |
| `ios/App/` | The Xcode project: `GameViewController.swift` (landscape, no status bar, home indicator auto-hidden), `AppDelegate.swift` (audio session, screen kept on), `Info.plist`, `PrivacyInfo.xcprivacy` |
| `fastlane/` | Lanes `check`, `bootstrap`, `build`, `beta`, `metadata`, `release`, `certs`; listing text in `metadata/`, screenshots in `screenshots/` |
| `android/` | The Android project: `MainActivity.java` (immersive, cutout and keyboard insets, WebView settings, screen on, renderer recovery), `ShellPlugin.java` (page globals, thermal), `AndroidManifest.xml` (landscape game, GLES 3), `app/build.gradle` (versions, env signing) |
| `src/shell/back.ts` | Android back button: Escape into the game, minimise on the bare title |
| `fastlane/metadata_android/` | Google Play listing (text, icon, feature graphic, phone screenshots) for the `android` lanes |
| `store/` | `app-icon-1024.png`; iPad 13" screenshots (`screenshots-ipad/`, not uploaded while iPhone only). Answers to copy into App Store Connect: `docs/plans/moba/APP-STORE-ANSWERS.md` |

## Run and check

```sh
npm ci                         # this folder (and npm ci in ../pawlegends)
npm run build                  # game for the app + shell.js → www/, cap sync ios (pod install), privacy-manifest check
npm run ios:sim -- --run       # unsigned simulator build, installed and launched
npm run mac -- --run           # unsigned Mac Catalyst build, opened on this Mac
npm run typecheck && npm test  # shell types and tests (manifest, OTA flow, zip, crypto, haptics)
npm run ios:open               # Xcode, for a run on a cabled iPhone (needs a signing team)
```

Android (JDK 21 and the Android SDK; on this Mac `export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`):

```sh
npm run build:android          # game + shell.js → www/, cap sync android
npm run android:debug          # debug APK in android/app/build/outputs/apk/debug (channel dev)
npm run android:open           # Android Studio
(cd android && ./gradlew testDebugUnitTest)
```

fastlane runs through Bundler in this folder (Ruby 3.3; on this Mac `export PATH=/opt/homebrew/opt/ruby/bin:$PATH`):

```sh
bundle config set --local path vendor/bundle && bundle install
bundle exec fastlane ios check   # secrets and API key only, changes nothing
```

## Secrets

| Secret | Where | What |
|---|---|---|
| `ASC_KEY_ID` | GitHub Actions | App Store Connect API key id |
| `ASC_ISSUER_ID` | GitHub Actions | Issuer id (same page) |
| `ASC_KEY_P8` | GitHub Actions | `base64 -i AuthKey_<id>.p8 \| tr -d '\n'` |
| `APPLE_TEAM_ID` | GitHub Actions | `BVLDTU9V83` |
| `OTA_PRIVATE_KEY` | GitHub Actions | The PEM text of `ota/.keys/private-key.pem` (`gh secret set OTA_PRIVATE_KEY < pawlegends-app/ota/.keys/private-key.pem`). Keep a copy in the password manager: losing it means a native release to ship a new public key |
| `DIST_CERT_P12`, `DIST_CERT_PASSWORD` | GitHub Actions, optional | Only if the API key cannot use Xcode cloud signing (see below) |

For local runs, the same names go in `fastlane/.secrets.local` (gitignored; template `.secrets.local.example`).

Signing: `fastlane build` uses Xcode automatic signing with the API key (`-allowProvisioningUpdates`), so Xcode
makes and keeps the distribution certificate in the cloud. That needs a key with the **Admin** role. With an App
Manager key, run `bundle exec fastlane ios certs` once on a Mac, export the certificate as `.p12`, and add
`DIST_CERT_P12` and `DIST_CERT_PASSWORD`.

## Releases

- **Native build to TestFlight:** push a tag `pawlegends-ios-v1.0.0`, or Actions → *Pawlegends iOS* → lane `beta`.
  The version comes from `package.json`, the build number from the run number.
- **Listing:** Actions → *Pawlegends iOS* → lane `metadata` (text in `fastlane/metadata/en-US`, screenshots from
  `npm run screenshots`, review notes in `fastlane/metadata/review_information`).
- **Submit for review:** lane `submit` and type `SUBMIT`. Releasing the approved build is a button in App Store
  Connect.
- **Mac App Store:** first add the macOS platform to the app record in App Store Connect (App Information → Add
  platform → macOS). Then Actions → *Pawlegends iOS* → lane `mac_beta` (signed .pkg to TestFlight macOS),
  `mac_metadata` (`fastlane/metadata` with `fastlane/metadata_mac` copied on top: Mac description, promotional text,
  release notes and review notes; Mac screenshots from `npm run screenshots -- --device mac` in
  `fastlane/screenshots_mac`), `mac_submit` (type `SUBMIT`). Locally: `bundle exec fastlane mac_beta`. If cloud
  signing cannot make the Mac Installer Distribution certificate that signs the .pkg, run
  `bundle exec fastlane mac_certs` once, export the certificate with its key as .p12 and add `MAC_INSTALLER_P12` and
  `MAC_INSTALLER_PASSWORD`. The Mac app takes no over-the-air updates (Mac App Store guideline 2.4.5): it runs the game
  bundled in its build, so Mac players get new content only through a new `mac_beta` build.
- **Over the air:** every push to `main` that changes `pawlegends/` publishes a new bundle (workflow
  *Pawlegends OTA*). It refuses when `api.tokentails.com` does not serve the game's sim: deploy the backend first.

## Sign-in

From 1.1.0 (native compat 2) the app signs in like the web game, without a Next page around it. The shell
(`shell.js`, before the game) installs a same-window channel, `window.__PL_HOST__`; the game's bridge
(`pawlegends/src/embed/bridge.ts`, `kind: 'native'`) talks to it exactly as it talks to the `/pawlegends/play` iframe
host. `host.js` (`src/host/`, a deferred script after the game) is that host: it runs the web host's own bridge
(`pawlegends-web/components/pawlegends/bridge.ts`) and its React-free modules (save queue, party tickets and saves, API ops,
champion art, `pawlegends-web/context/auth/link.ts` for the sign-in flows; no roster since 2026-11-12, NO-TOKENTAILS.md), bundled from `../pawlegends-web` by `scripts/build-web.mjs`.

- **Providers:** Sign in with Apple (iPhone and Mac, shown first), Google (iPhone and Android), email and password
  (everywhere). The Firebase JS SDK holds the session (IndexedDB); Apple and Google run natively through
  `@capacitor-firebase/authentication` with `skipNativeAuth` and hand their ID token to the JS SDK. API calls carry
  `accesstoken: fb<id token>`; no token ever reaches the game.
- **Guests:** online, the first match save, party ticket or pass claim makes a Firebase anonymous guest (the
  backend's guest document follows on the first write, 428 → `POST /user/guest/session`). Offline nothing is made and
  matches wait on the phone. Signing in links the guest (same uid); if the Apple, Google or email identity already has
  an account the app asks before merging the guest (`POST /user/guest/merge`, `x-guest-token`), then offers matches
  played with no user at all ("Add N matches played on this device to your account?").
- **Account:** the title's top-right chip and Settings → Account: Sign out, Delete account (a last confirmation, a fresh
  Apple authorization code for an Apple account, `DELETE /user/me` with `appleClientId: com.tokentails.pawlegends`).
- **Purchases stay hidden:** the game sends the in-app host only save, sign-in, account, party, pass and API messages
  (`NATIVE_HOST_TYPES`); the host answers nothing about cats for sale, offers or checkout.
- **What this build can use** comes from the native shell at document start, `window.__PL_NATIVE_AUTH__`
  (`ios/App/App/NativeAuth.swift`, `android/.../NativeAuth.java`): without the Firebase config files Google is off and
  the sheet says so; the app still starts (the shell makes a placeholder FirebaseApp, since the plugin would crash
  without one) and Apple and email work.

### Sign-in setup (founder steps)

`node scripts/firebase-config.mjs check --platform all` prints what is missing. Once:

1. **Firebase console, project news-ccd33:** add an iOS app (bundle id `com.tokentails.pawlegends`, App Store ID from
   App Store Connect) and download `GoogleService-Info.plist` to `ios/App/App/`; add an Android app (package
   `com.tokentails.pawlegends`) with the SHA-1 and SHA-256 of the Play app signing key (Play Console → Test and
   release → App integrity), the upload key and the debug key (`cd android && ./gradlew signingReport`), and download
   `google-services.json` to `android/app/`. Commit both (public config, like the Token Tails app's).
2. **Firebase Authentication → Sign-in method:** Google, Apple, Email/Password and Anonymous stay enabled (the web uses
   them). Registering the iOS app lets Firebase accept Apple tokens for this bundle id.
3. **Apple Developer:** enable Sign in with Apple on `com.tokentails.pawlegends`, grouped with the primary App ID
   `com.tokentails.app` (so the existing key revokes for both): `bundle exec fastlane ios bootstrap` does it. Profiles
   made before need regenerating (cloud signing does it).
4. **Backend env:** `APPLE_CLIENT_IDS=com.tokentails.app,com.tokentails.pawlegends`.
5. **Google Cloud → Credentials:** if the Firebase web API key is restricted by HTTP referrer, allow
   `capacitor://localhost` and `https://localhost`.
6. `npm run build` (writes the Google URL scheme into `Info.plist`) and `npm run build:android`.

Release builds refuse without the files: the Xcode phase "Firebase config (sign-in)" for iPhone Release builds, the
Gradle release tasks (`-PplAllowNoFirebase` skips it), and the fastlane `build` lanes.

## Over-the-air updates

- `www/` is zipped (reproducibly), encrypted with AES-128 under a fresh key, and the key and the SHA-256 are
  encrypted with our RSA private key: the format `@capgo/capacitor-updater` checks natively. A bundle not made with
  our private key is refused before it is unzipped. The manifest is signed with the same key.
- Channels. The native shell sets `window.__PL_CHANNEL__` before any page script (`GameViewController.swift`):
  - App Store installs read `https://tokentails.com/pawlegends-app/updates/ios/<compat>/manifest.json` (stable);
  - TestFlight installs read `manifest-beta.json` (beta): every push to `main` lands here first;
  - Debug builds read `http://localhost:8787/pawlegends-app/updates/ios/<compat>/manifest-beta.json` (dev, below).
  The hourly job in *Pawlegends OTA* promotes to stable the newest kept bundle that is 6 h old; when stable is missing or already 6 h behind beta, the newest bundle that is 2 h old (busy days on `main` no longer starve stable). `promote_now` promotes the current beta at once.
- **Force update** (`docs/plans/moba/FORCE-UPDATE.md`). Every publish, promote and rollback also writes a signed
  `updates/<platform>/<compat>/policy.json`; `GET api.tokentails.com/pawlegends/client-policy` merges it with the sims
  the backend replays. The update gate in `shell.js` (`src/shell/gate.ts`) asks at launch, on resume while on the
  title, whenever the game returns to the title, and when the game says the server refused this version. A required
  update shows **Updating Paw Legends** with progress and reloads into the new bundle: the app does not start on an
  outdated bundle. Releases are required at once (`--grace-hours <n>`, workflow input `grace_hours`, delays one).
  Offline or with the API down: the signed `policy.json`, else the last kept answer decides (play with a notice while
  the backend still accepts this sim, else a retry screen with backoff). A version that failed to boot is never retried
  automatically; any error in the gate lets the game start. The console shows `[gate] …` lines.
- Otherwise (an optional newer bundle) the app downloads in the background (at most every 30 minutes; no device id, no
  cookies) and switches only on the title screen with no party open, at the next launch or resume. Never mid-match.
  The console shows `[ota] <version>: check <result> (channel <name>)`.
- The new bundle must reach the title screen within 30 s (`notifyAppReady`), or the updater goes back to the last
  good bundle and the app never tries that version again.
- Rollback: Actions → *Pawlegends OTA* → `rollback_to` = a kept version (the last 3 plus the live stable one are kept
  in `client/public/pawlegends-app/updates/ios/<compat>/bundles/`); it points beta and stable at it, and the policy
  makes it a required update, so gated phones move to it on their next check. Locally:
  `node scripts/ota-publish.mjs --rollback <version>`. A gate that blocks by mistake: republish with `grace_hours`, or
  `node scripts/ota-publish.mjs --maintenance off`.
- Maintenance screen: `node scripts/ota-publish.mjs --maintenance "Back at 18:00 UTC" --until 2026-11-20T18:00:00Z`
  (workflow input `maintenance`; `off` ends it). It rewrites and re-signs `policy.json` only.
- The 1.0.x apps (compat 1, no sign-in) can never run a compat-2 bundle. Their last OTA is the bridge: Actions →
  *Pawlegends OTA* → `bridge` = `beta` (TestFlight 1.0.x first), then `stable` after a device check. Locally:
  `node scripts/build-web.mjs --bridge && node scripts/ota-publish.mjs --compat 1 --www www-bridge`. It publishes once
  (`--force` to publish again). Undo: `node scripts/ota-publish.mjs --compat 1 --rollback 20261111112457-ef22d35`.
- Try an update on the Mac first (simulator, Debug build, the real key in `ota/.keys/`):

  ```sh
  node scripts/build-web.mjs --seq 20260101000000 && npx cap sync ios && node scripts/build-sim.mjs --run
  node scripts/build-web.mjs --skip-game          # a newer bundle (seq = now)
  node scripts/ota-local.mjs publish              # into build/ota-local/updates, never client/public
  node scripts/ota-local.mjs serve                # http://localhost:8787; then relaunch the app twice
  xcrun simctl launch --console-pty booted com.tokentails.pawlegends   # watch the [ota] lines
  ```

  With the gate (a Debug build reads only the local `policy.json`), a relaunch after a publish shows **Updating Paw
  Legends** and swaps at once; `ota-local.mjs publish --grace-hours 1` makes it optional (the old flow: the first
  relaunch downloads, the next one swaps on the title). Offline drill: stop `serve` and relaunch (a notice chip, or the
  retry screen once the local policy's sim floor is above the installed sim). For a rollback drill, publish a bundle whose
  `www/index.html` has no game script: it never reaches the title and the updater returns to the last good bundle
  after 30 s. Checks are throttled to one per 30 minutes; reinstall the app (`xcrun simctl uninstall`) to reset.
- `NATIVE_COMPAT` (`scripts/lib/app-config.mjs`): raise it with any native change a bundle relies on (a new plugin,
  a new Info.plist key). Each shell only reads its own level's manifest, and a new App Store build drops all
  downloaded bundles (`resetWhenUpdate`).
- OTA carries HTML, JS, CSS and assets only, within the app's purpose (guideline 2.5.2). New native features,
  purchases or a new purpose ship as an App Store release.
