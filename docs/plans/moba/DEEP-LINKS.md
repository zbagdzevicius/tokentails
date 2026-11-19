# Party links into the app (DEEP-LINKS)

Founder ask (Nov 19 2026): "for QR codes, implement deeplinks to get into instantly from phone to in-game party
in-app if app exists, if not - web".

## The link

`https://pawlegends.app/p/<CODE>` (the 6-character party code, e.g. `https://pawlegends.app/p/K7QX2M`). The lobby's
QR, Share and Copy carry it (`pawlegends/src/share/partyLink.ts` `inviteUrl`). 31 characters, so the QR is version 3
(29 modules) and scans from across a table. Older links keep working: `/?party=K7QX2M` and `/legends?party=` go on
to `/play?party=` (next.config.js), and the game still reads `?party=`.

## What happens

| Where the link is opened | Result |
|---|---|
| iPhone with the app (camera QR scan, Messages, Mail, any other app) | The app opens (Universal Links) and joins the party |
| Android with the app (camera / Lens QR scan, any app) | The app opens (App Links, once `assetlinks.json` is published) and joins the party |
| Phone without the app, or any desktop | `pawlegends.app/p/<CODE>`: "Join the party" (one tap) opens the web game in the party; "Get the app" links to both stores |
| iPhone with the app, link opened inside Safari | Safari stays on the page (Apple never leaves Safari for a link on the same site); Safari's Smart App Banner offers "Open", which opens the app into the party |
| Broken code | The page (or the app) says the link is broken and offers "Start your own party" |
| Party already over | The game's party screen: "No party with that code" / "This party has ended", with Play now and Start your own party |

In the app the link is joined at once on the title or in a lobby (leaving the old lobby, like accepting an invite).
During a match it waits and joins when the match ends (at most 30 minutes). Signed-out players join as guests, as
any party link does.

## How it works

- **Web** (`pawlegends-web/`): `pages/p/[code].tsx` (server-rendered, cached by the CDN for a day: it depends on the
  URL only). `app-links.json` is the one source of the association files; `node scripts/app-links.mjs` writes
  `public/.well-known/apple-app-site-association`, `public/apple-app-site-association` and (once a fingerprint is
  set) `public/.well-known/assetlinks.json`. `npm run build` runs `--check` first (prebuild) and fails when a
  fingerprint is malformed or a committed file differs. `next.config.js` serves them as `application/json` and keeps
  them out of the www redirect.
- **iOS** (`pawlegends-app/ios`): `App-iOS.entitlements` has `com.apple.developer.associated-domains` =
  `applinks:pawlegends.app`, `applinks:www.pawlegends.app` (www has no DNS today; harmless). AppDelegate already
  forwards `continue userActivity` to Capacitor. The App ID needs the Associated Domains capability: the fastlane
  `build` lane (and `bootstrap`) turns it on before signing. AASA app ID: `BVLDTU9V83.com.tokentails.pawlegends`.
  Not on the Mac app.
- **Android** (`pawlegends-app/android`): an `autoVerify` intent filter for `https://pawlegends.app/p/*` on the
  singleTask `MainActivity`. Apex only: before Android 12 one host that cannot be verified (www) fails them all.
- **Shell** (`pawlegends-app/src/shell/links.ts`): `@capacitor/app` `getLaunchUrl()` (cold start) and `appUrlOpen`
  (warm start) push the URL onto `window.__PL_LINKS__` and fire `pl:link`. URLs already handed over in this process
  are remembered in sessionStorage, so an OTA reload does not rejoin the launch link.
- **Game** (`pawlegends/src/app/links.ts`): drains the queue once the title is up, parses the link
  (`partyFromLink`), and joins (`LinkRouter`).

No custom URL scheme: Universal Links / App Links are the only way in.

## Founder steps

1. **Android fingerprint (required for Android).** Play Console → Paw Legends → Test and release → App integrity →
   App signing. Copy the SHA-256 of the **App signing key certificate** (and of the **Upload key certificate**, for
   internal sideloads) into `pawlegends-web/app-links.json` `android.sha256` (format `AA:BB:…`, 32 bytes), run
   `node scripts/app-links.mjs` in `pawlegends-web`, commit and push. Until then no `assetlinks.json` is published and
   Android opens party links in the browser (the web join still works).
2. **Store builds.** Links open the app only in a native build made after this change (the entitlement and the
   intent filter are native; OTA cannot add them). The pending 1.2.0 build picks them up if it is built from `main`
   after this commit; nothing was bumped. Until then links open the web game on every phone.
3. **Check on a device.** iPhone: scan a lobby QR with the Camera app; the banner says "Open in Pawlegends". Android:
   `adb shell pm get-app-links com.tokentails.pawlegends` must list `pawlegends.app: verified`
   (`adb shell pm verify-app-links --re-verify com.tokentails.pawlegends` re-runs it after the fingerprint ships).
