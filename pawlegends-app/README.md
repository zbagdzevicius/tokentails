# Pawlegends iOS app

The App Store build of Pawlegends: a standalone Capacitor 7 app (`com.tokentails.pawlegends`) with the game bundled
inside, landscape only, that updates its web game over the air from tokentails.com. Plan and review-risk register:
[`docs/plans/moba/APP-STORE.md`](../docs/plans/moba/APP-STORE.md). The Token Tails app in `client/`
(`com.tokentails.app`) is a separate project and is not touched by anything here.

## Layout

| Path | What |
|---|---|
| `capacitor.config.ts` | App id, WebView settings, the updater in manual self-hosted mode, the OTA public key |
| `src/shell/` | `shell.js`, loaded before the game: OTA (`ota.ts`, `manifest.ts`) and native haptics (`haptics.ts`) |
| `scripts/build-web.mjs` | Builds `../pawlegends` for the app into `www/` (app build flag, production API, no analytics key) and adds `shell.js` |
| `scripts/ota-publish.mjs` | Zips, encrypts and signs `www/` into `client/public/pawlegends-app/updates/ios/<compat>/` |
| `scripts/ota-keygen.mjs` | Makes the OTA RSA key pair (done once; public key committed in `ota/public-key.pem`) |
| `scripts/make-icons.mjs`, `scripts/screenshots.mjs` | App icon and launch paw; App Store screenshots (6.9" landscape) |
| `scripts/build-sim.mjs` | Unsigned simulator build (`--run` installs and launches it) |
| `ios/App/` | The Xcode project: `GameViewController.swift` (landscape, no status bar, home indicator auto-hidden), `AppDelegate.swift` (audio session, screen kept on), `Info.plist`, `PrivacyInfo.xcprivacy` |
| `fastlane/` | Lanes `check`, `bootstrap`, `build`, `beta`, `metadata`, `release`, `certs`; listing text in `metadata/`, screenshots in `screenshots/` |
| `store/` | Answers to copy into App Store Connect: `age-rating.md`, `privacy-label.md` |

## Run and check

```sh
npm ci                         # this folder (and npm ci in ../pawlegends)
npm run build                  # game for the app + shell.js → www/, cap sync ios (pod install), privacy-manifest check
npm run ios:sim -- --run       # unsigned simulator build, installed and launched
npm run typecheck && npm test  # shell types and tests (manifest, OTA flow, zip, crypto, haptics)
npm run ios:open               # Xcode, for a run on a cabled iPhone (needs a signing team)
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
- **Over the air:** every push to `main` that changes `pawlegends/` publishes a new bundle (workflow
  *Pawlegends OTA*). It refuses when `api.tokentails.com` does not serve the game's sim: deploy the backend first.

## Over-the-air updates

- `www/` is zipped (reproducibly), encrypted with AES-128 under a fresh key, and the key and the SHA-256 are
  encrypted with our RSA private key: the format `@capgo/capacitor-updater` checks natively. A bundle not made with
  our private key is refused before it is unzipped. The manifest is signed with the same key.
- The app reads `https://tokentails.com/pawlegends-app/updates/ios/<compat>/manifest.json` on launch and on resume
  (at most every 30 minutes; no device id, no cookies), downloads a newer bundle in the background, and switches to
  it only on the title screen with no party open: at the next launch or resume. Never mid-match.
- The new bundle must reach the title screen within 15 s (`notifyAppReady`), or the updater goes back to the last
  good bundle and the app never tries that version again.
- Rollback: Actions → *Pawlegends OTA* → `rollback_to` = a kept version (the last 3 are kept in
  `client/public/pawlegends-app/updates/ios/1/bundles/`), or locally `node scripts/ota-publish.mjs --rollback <version>`.
- `NATIVE_COMPAT` (`scripts/lib/app-config.mjs`): raise it with any native change a bundle relies on (a new plugin,
  a new Info.plist key). Each shell only reads its own level's manifest, and a new App Store build drops all
  downloaded bundles (`resetWhenUpdate`).
- OTA carries HTML, JS, CSS and assets only, within the app's purpose (guideline 2.5.2). New native features,
  purchases or a new purpose ship as an App Store release.
