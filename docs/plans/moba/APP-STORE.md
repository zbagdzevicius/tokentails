# Pawlegends on the App Store

Status (2026-11-07, `feat/pawlegends-ios`, not merged, 59 commits behind `main`): `pawlegends-app/` builds for the
simulator (Debug and Release, no signing) and reaches the title in landscape. The OTA path is tested end to end in the
simulator against a local server: download, verified checksum, swap on the title at the next launch, and automatic
rollback of a bundle that never reaches the title. Updates go to TestFlight (beta) first and to App Store installs
(stable) 24 h later. fastlane, both workflows, listing, icon and screenshots are in place. Waiting for the founder
steps under "Only you can do this", starting with the trademark search. How to run it:
[`pawlegends-app/README.md`](../../../pawlegends-app/README.md).

Checked 2026-11-07: shell typecheck and 33 tests; game typecheck and the publish gate's unit run (1,823 passed, 5
skipped); Debug and Release simulator builds; the live backend accepts `capacitor://localhost` (CORS and party
WebSocket) and sims 10 to 14 (the build ships 14). Not checked: a real iPhone (load time, haptics), a bot match with
the network off, `actionlint` on the workflows. The `/pawlegends/privacy` and `/pawlegends/support` pages 404 until
this branch is merged and Vercel deploys.

## Implementation notes (2026-11-07)

Where the build differs from the plan below, the build wins:

- No storyboards. The window and `GameViewController` are made in `AppDelegate`; the launch screen is the
  Info.plist `UILaunchScreen` (game background colour and the boot paw from the asset catalog). This avoids `ibtool`
  in CI and matches the web boot splash.
- iPhone only (`TARGETED_DEVICE_FAMILY = 1`) as planned; the iPad landscape keys and `UIRequiresFullScreen` are set
  too, so adding iPad later is one build setting plus iPad screenshots.
- OTA: our own encryption and signing code (`pawlegends-app/scripts/lib/capgo-crypto.mjs`) in the format the
  updater checks natively, instead of the Capgo CLI. Secret name `OTA_PRIVATE_KEY` (not `CAPGO_PRIVATE_KEY`). Files
  at `client/public/pawlegends-app/updates/ios/<compat>/` (`manifest.json`, `manifest-beta.json`,
  `bundles/<version>.zip`). Both manifests are signed. `appReadyTimeout` is 30 s (raised from 15 s: a slow first
  start on an old iPhone would otherwise roll a good update back for good on that phone). The update applies on the
  title screen at the next launch or resume.
- OTA channels: the native shell tells the page its channel (`window.__PL_CHANNEL__`, set in
  `GameViewController.webView(with:configuration:)`). App Store installs read `manifest.json` (stable), TestFlight
  installs (sandbox receipt) read `manifest-beta.json` (beta), and Debug builds read the beta manifest from
  `http://localhost:8787` (`scripts/ota-local.mjs`), so updates can be tried on the Mac with the real key. A push to
  `main` publishes to beta only; an hourly job promotes it to stable when it is 24 h old (`promote_now` skips the
  wait). A rollback points both channels at the kept version.
- Haptics: the shell gives WKWebView a `navigator.vibrate` backed by `@capacitor/haptics`, so the game needed no
  change for it.
- Workflows: `.github/workflows/ios-testflight.yml` (lanes beta, metadata, submit) and
  `.github/workflows/pawlegends-ota.yml` (checks on pull requests, publish on `main`, manual rollback).
- Signing: Xcode cloud signing with the API key needs the key's role to be **Admin**. With an App Manager key, run
  `fastlane ios certs` once and add `DIST_CERT_P12` and `DIST_CERT_PASSWORD`.
- Associated Domains (invite links opening the app) is not in v1: it needs a capability on the App ID and an
  `apple-app-site-association` change shared with `com.tokentails.app`. Invite links open the web game.
- Backend: no change. `capacitor://localhost` is already allowed for CORS and the party relay.

## Goal

Ship Pawlegends to the Apple App Store as its own iPhone app.

- The game is bundled inside the binary. It plays offline against bots on first launch.
- Landscape only. iPhone only in v1.
- The web game updates itself over the air from tokentails.com. We host the updates. No paid service.
- The founder only does what needs an Apple account holder. Everything else is scripted.
- The existing Token Tails app (`client/`, `com.tokentails.app`) is not touched.

## Architecture

### Project

- New standalone Capacitor 7 project at `pawlegends-app/` (repo root), with its own `package.json`.
- appId `com.tokentails.pawlegends`. Checked: the repo only uses `com.tokentails.app`, so there is no collision.
- Display name "Pawlegends". Team ID `BVLDTU9V83` (from `client/ios`).
- `webDir` points to a copy of `pawlegends/dist`, built with base `./` and `VITE_PAWLEGENDS_APP=1`.
- iOS deployment target 15.0. Module Workers and WebGL2 need it.
- `TARGETED_DEVICE_FAMILY = 1` (iPhone). This avoids the iPadOS 26 orientation rules and iPad screenshots.
- Plugins: `@capacitor/app`, `@capacitor/haptics`, `@capgo/capacitor-updater@lts-v7`. Nothing else.
- No `server.url`, no `server.hostname`, no `iosScheme`. The app serves from `capacitor://localhost`. The backend already allows that origin for CORS and the WebSocket relay, so no backend change.

### Native shell

- `GameViewController` subclasses `CAPBridgeViewController`:
  - status bar hidden, home indicator auto-hidden;
  - `preferredScreenEdgesDeferringSystemGestures = .all`;
  - `supportedInterfaceOrientations = .landscape`.
- Info.plist: Landscape Left and Right only; `UIStatusBarHidden = true`; `ITSAppUsesNonExemptEncryption = false`.
- At launch: `AVAudioSession` category `.ambient`; `isIdleTimerDisabled = true` while in the foreground.
- Capacitor `ios` config: `scrollEnabled: false`, `allowsLinkPreview: false`, `contentInset: 'never'`, `backgroundColor: '#2b1d2e'`.
- `PrivacyInfo.xcprivacy` in the app target (see Privacy).
- Associated Domains `applinks:tokentails.com`, plus `client/public/.well-known/apple-app-site-association` for `/pawlegends?party=*`. Invite links then open the app.

### Game changes for the app build (`pawlegends/`)

- `VITE_PAWLEGENDS_APP=1`, or `Capacitor.isNativePlatform()`, calls `setAppBuild(true)` and sets `Entitlements.isApp = true` at boot. This closes the gap where the "Collect cards on Token Tails" link would show (3.1.3 steering).
- Dare and share links use `https://tokentails.com/pawlegends`, never `location.href`.
- `VITE_PAWLEGENDS_API=https://api.tokentails.com` so party play works.
- `ui/haptics.ts` calls `Capacitor.Plugins.Haptics` when present.
- A small `src/app/ota.ts` runs only in the native app (see OTA flow).
- All of this is a no-op on the web build.

### OTA flow

We use Capgo in manual mode: `autoUpdate: false`, `statsUrl: ""`, `resetWhenUpdate: true`, `autoDeletePrevious: true`, `appReadyTimeout: 10000`, plus a `publicKey`.

1. The release job builds the app web bundle, zips it and encrypts it with our private key. It gets the checksum and `session_key`.
2. It writes the zip and a manifest to `client/public/pawlegends-app/ios/<compat>/`:
   `manifest.json = { version, url, checksum, session_key, simVersion, minNative }`.
   Vercel serves it as static files.
3. On launch and on resume, `ota.ts` GETs the manifest for its own `<compat>`. No device id is sent.
4. If `version` is newer, it calls `CapacitorUpdater.download(...)`, then `next()`. The new bundle applies on the next background or launch. The player is never interrupted in a match.
5. The new bundle calls `notifyAppReady()` once the title screen renders. If it does not within 10 s, Capgo reverts to the last good bundle or the built-in one, and deletes the failed one.

Rules:

- `<compat>` is the native compat version, for example `1`. It changes only when the native shell changes (new plugin, new Info.plist key). A bundle is only offered to shells with the same compat. A new native build drops old OTA bundles (`resetWhenUpdate`).
- OTA carries JS, HTML, CSS and assets only. It never adds a native plugin, purchases, a storefront or a new purpose. Big features ship as a native release so App Review sees them.
- Rollback: re-point `manifest.json` at an older version folder and push. Devices with a broken bundle revert by themselves through the watchdog.
- The encryption key pair is made once with `npx @capgo/cli key create`. The public key is in the app config. The private key lives only in the `CAPGO_PRIVATE_KEY` GitHub secret.

### Sim compatibility

- The relay refuses an unknown `SIM_VERSION` with `update_required`. Live today: sim 14, accepted 10 to 14.
- The OTA publish job runs `npm run vendor-sim:check-remote` and fails if the backend does not accept the bundle's sim.
- Order of release: deploy the backend with the new sim first, then publish OTA, and drop the old sim from the backend only after OTA has been out for 14 days.
- On `update_required` the app asks for an OTA check and shows "Updating…". Offline bot play always works whatever the sim.

## Review-risk register

| Guideline | Risk | Our mitigation |
|---|---|---|
| 2.5.2 / DPLA 3.3.1(B) downloaded code | OTA seen as changing the app | Interpreted code in WKWebView only; same purpose; no native change by OTA; big features go through review |
| 4.2 / 4.2.2 minimum functionality, web clip | "Repackaged website" | All assets bundled; offline bots on first launch; no remote start URL; native landscape shell, haptics, no browser chrome |
| 4.7 mini apps | Misread as a host of HTML5 games | Pawlegends is the app itself, not third-party content. No UGC: player names are generated, no free text |
| 3.1.1 / 3.1.3 purchases and steering | Link to tokentails.com, where cats are sold by card and crypto | Game sells nothing; checkout bridge is off standalone; app build forces `isApp`, which hides the Token Tails link; only `starter` and `redeem` cards |
| 3.1.1 crypto | Wallets or crypto mentioned | No crypto or wallet code in `pawlegends/src`; none in metadata |
| 3.2.1(vi) / 3.2.2(iv) donations | Shelter giving in app or listing | No donate button in the game; no donation calls to action or links in the listing |
| 5.1.1 privacy, 5.1.1(v) account deletion, 4.8 Sign in with Apple | Missing policy or account rules | No login, so deletion and Sign in with Apple do not apply; privacy link in Settings and listing. If sign-in is added later, both become mandatory |
| 5.1.2 / ATT | Tracking | No IDFA, no SDKs, no cookies; PostHog only with consent; no ATT prompt needed |
| 2.1 completeness | Reviewer cannot test multiplayer | Bots work offline; review notes explain party play with a code |
| 2.3 metadata | Screenshots not from the app | Real gameplay, captured from the app's web bundle (the same files the app ships) in a headless browser at the device sizes (`scripts/screenshots.mjs`, Playwright), not from the simulator. Retake them from TestFlight on a real iPhone before submitting if you want zero doubt |
| 3.1.3 steering in app copy | Empty card slot named Token Tails with no way to sign in | App build says "No cat cards yet" and never names Token Tails or links out (`ui/deck/empty.ts`, `lobbyScreen.ts`) |
| 5.2.1 / trademark | "Pawlegends" not cleared; the listing makes the name public and reserves it | The web landing stays `noindex` until the trademark search passes (POC.md §11.4, LAUNCH-READY.md U8). Do not create the app record or upload metadata before that search passes |
| Privacy manifest | Upload warning or rejection | `PrivacyInfo.xcprivacy` in the target; check pods ship their own |
| Age rating | Missing answers block submit | Pre-filled answers file (`docs/plans/moba/APP-STORE-ANSWERS.md`) |
| iPadOS orientation | Landscape-only warnings | iPhone only in v1 |

## IAP, crypto and donations on iOS

- The app sells nothing. No StoreKit in v1.
- The "Meet ‹cat›" checkout needs a host page. In the app there is no host, so it never opens.
- The app build sets `isApp = true`. That hides every tokentails.com link that leads to purchases. Only `starter` and `redeem` cards appear (Apple 3.1.3(b)).
- No wallet, NFT or crypto words in the binary UI or the listing.
- No donation buttons or links. The shelter story may appear in the description as plain fact, with no call to action and no link.
- Unit test: in app mode, `canBuy`, `buy` and `catCheckout` return false, and the deck screen has no `TT_URL` link.
- If we ever sell in the app, it is IAP only, shipped in a native release.

## Privacy and tracking

- No login. The profile lives in localStorage on the device. It survives OTA updates (same origin).
- No App Tracking Transparency prompt. No IDFA.
- v1 ships without the PostHog key. Nutrition label (corrected 2026-11-07, see APP-STORE-ANSWERS.md): no analytics, no tracking; optional party play collects a random party key (User ID) and Gameplay Content for App Functionality, because the relay keeps finished rooms 30 days.
- If PostHog is turned on later (a native release): Usage Data (Product Interaction) and Diagnostics (crashes), not linked to identity, not used for tracking. Update the label first.
- `PrivacyInfo.xcprivacy`: `NSPrivacyTracking = false`, no tracking domains, no collected data in v1, `NSPrivacyAccessedAPICategoryUserDefaults` reason `CA92.1`. Add others only if our code uses them.
- After `pod install`, CI checks that Capacitor, CapacitorCordova and CapgoCapacitorUpdater ship their own privacy manifests.
- Encryption: HTTPS and WSS through OS APIs only. `ITSAppUsesNonExemptEncryption = false`.
- Privacy policy: https://docs.tokentails.com/community-and-social-impact/privacy-policy.

## Release pipeline

### Tooling

- fastlane through a `pawlegends-app/Gemfile` and Bundler (`vendor/bundle`), not global. Ruby 3.3 (Homebrew locally, `ruby/setup-ruby` in CI).
- No `match`. Signing uses the App Store Connect API key:
  - `app_store_connect_api_key` lane action reads the key id, issuer id and `.p8` content;
  - `cert` and `sigh` create a distribution certificate and an App Store profile on a temporary keychain, or Xcode automatic signing with `-allowProvisioningUpdates` and the API key;
  - `produce` registers the bundle id `com.tokentails.pawlegends` if it does not exist.
- Lanes: `bootstrap` (register id, Associated Domains capability), `beta` (build and upload to TestFlight), `metadata` (upload listing and screenshots with `deliver`, no binary), `release` (submit for review, needs a manual go).

### Secrets

GitHub Actions secrets, or `pawlegends-app/fastlane/.secrets.local` (gitignored) for local runs:

1. `ASC_KEY_ID`
2. `ASC_ISSUER_ID`
3. `ASC_KEY_P8` (the `.p8` content, base64)
4. `APPLE_TEAM_ID` (`BVLDTU9V83`)

Plus `CAPGO_PRIVATE_KEY`, which we create ourselves.

### Workflows

- `.github/workflows/pawlegends-ios.yml` (macOS runner, manual and on tags `pawlegends-ios-v*`):
  build the game with app env → `npx cap sync ios` → `pod install` → privacy-manifest check → `bundle exec fastlane beta`. Build number = run number. Skips with a clear message if the secrets are missing.
- `.github/workflows/pawlegends-ota.yml` (on pawlegends changes in `main`, hourly, and manual):
  game typecheck and unit tests (with `tools/copy-lint` installed; wall-clock perf budgets skipped on shared runners) → shell tests → `vendor-sim:check-remote` → build app bundle → zip and encrypt → write `manifest-beta.json` and the bundle in `client/public/pawlegends-app/updates/ios/<compat>/` → commit to `main`. Vercel deploys it. The hourly `promote` job copies beta to stable once it is 24 h old.
  The bundle version is `<UTC yyyymmddHHMMSS>-<short sha>` (seconds, so two pushes in one minute do not collide).
- Build numbers: the larger of the latest TestFlight build + 1 and the CI run number, so local and CI uploads can mix.
- `ci.yml` gets a cheap job: build the app bundle and check the Capacitor config (no signing).

## Store listing

Files in `pawlegends-app/fastlane/metadata/en-US/`, uploaded by `deliver`:

- Name: "Pawlegends" (30 max).
- Subtitle: "Cats vs Dogs Arena Battles" (30 max).
- Category: Games. Subcategories Strategy and Action.
- Description, keywords (100 bytes), promotional text, What's New: drafted by us, no donate or crypto words.
- Support URL: https://tokentails.com/pawlegends. Privacy: https://docs.tokentails.com/community-and-social-impact/privacy-policy. Terms: https://tokentails.com/pawlegends/terms.
- Price: free. No in-app purchases.
- Screenshots: 6.9" landscape (2868×1320), 5 to 8 shots, captured by a Playwright or simulator script from the app build. No alpha.
- Icon: 1024×1024 PNG, no alpha, from the existing Pawlegends art.
- App preview video: optional, later.
- Review notes: "Plays offline against bots. Party play: tap Party, share the code. No login, no purchases."
- Pre-filled answers: `docs/plans/moba/APP-STORE-ANSWERS.md` (age rating, expected 9+: mild cartoon violence, no UGC, no browsing, no gambling, no purchases; App Privacy; export compliance; other App Store Connect fields).

## Milestones

| Date | Milestone | Owner |
|---|---|---|
| 2026-11-09 | `pawlegends-app/` scaffold builds in the simulator: landscape, bundled game, offline bots, native shell | AI |
| 2026-11-10 | App-mode game changes (`isApp`, links, haptics, API) with tests; privacy manifest; Info.plist | AI |
| 2026-11-11 | OTA: Capgo manual mode, manifest, watchdog, publish script; tested with a local server and a forced bad bundle | AI |
| 2026-11-12 | fastlane lanes, both workflows, listing files, screenshots, icon, answer files | AI |
| 2026-11-12 | Founder: enrollment check, 4 secrets added, agreements accepted | Founder |
| 2026-11-13 | `fastlane bootstrap` registers the id; app record created; first TestFlight build | AI + Founder |
| 2026-11-14 – 11-18 | TestFlight on real iPhones; first OTA pushed and checked on device; rollback drill | Both |
| 2026-11-19 | Metadata uploaded; age rating and privacy answers entered; Submit for Review | Founder |
| ~2026-11-21 | Review result. Fix and resubmit within one day if rejected | Both |
| 2026-11-24 | Release. OTA from every pawlegends release from then on | AI |

## Only you can do this

Everything else is automated by us. In order:

1. **Trademark search for "Pawlegends" (LAUNCH-READY.md U8, LAUNCH.md §a.1).** The App Store listing makes the name
   public and reserves it, so do this first. If the name is not clear, stop and pick a new name before step 6; the
   name lives in `capacitor.config.ts` (`appName`), `fastlane/metadata/en-US/name.txt` and the web pages.
2. Check the Apple Developer Program membership is active as an Organization (Token Tails MB). If it is not, enroll;
   an Organization needs a D-U-N-S number.
3. In App Store Connect, accept the latest agreements, and fill tax and banking (needed even for a free app's
   agreement status).
4. Create an App Store Connect API key (Users and Access → Integrations, role **Admin**, so CI can sign). Download
   the `.p8` once. With an App Manager key instead, also run `bundle exec fastlane ios certs` once and add
   `DIST_CERT_P12` and `DIST_CERT_PASSWORD`.
5. Add the GitHub Actions secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the `.p8` content, base64),
   `APPLE_TEAM_ID` (`BVLDTU9V83`), and `OTA_PRIVATE_KEY`
   (`gh secret set OTA_PRIVATE_KEY < pawlegends-app/ota/.keys/private-key.pem`; keep a copy in the password manager:
   losing it means a native release to ship a new key). For local runs, the same names go in
   `pawlegends-app/fastlane/.secrets.local` (gitignored, see `.secrets.local.example`).
6. Merge `feat/pawlegends-ios` into `main` (or tell us to): Vercel then serves `/pawlegends/privacy`,
   `/pawlegends/support` and the update folder. Then run Actions → *Pawlegends iOS TestFlight* (lane `beta`). It
   registers `com.tokentails.pawlegends`; create the app record "Pawlegends" with that bundle id if the run asks.
7. Install the TestFlight build on your iPhone. Play one bot match with flight mode on, and one party match. A push to
   `main` that changes the game reaches this TestFlight install within the hour (beta channel) and App Store players
   a day later; if a beta update looks wrong, run *Pawlegends OTA* with `rollback_to` before the day is up.
8. Answer the age rating and App Privacy questionnaires, copying from `docs/plans/moba/APP-STORE-ANSWERS.md`.
   Confirm the export compliance answer.
9. Run the `metadata` lane (listing and screenshots), then press Submit for Review, and later Release.
