# App Privacy answers (App Store Connect → App Privacy)

**Data collection: "No, we do not collect data from this app."** Result on the listing: **Data Not Collected**.

Why this is true for the v1 app build (`pawlegends-app/scripts/build-web.mjs`):

- No account and no login. The player profile (settings, progress) lives in the app's local storage on the device.
- No analytics: the app build has no PostHog key, so the game sends no events and shows no consent prompt.
- No crash reporting SDK, no ad SDK, no IDFA, no App Tracking Transparency prompt. `PrivacyInfo.xcprivacy`:
  `NSPrivacyTracking = false`, no tracking domains, no collected data types.
- Over-the-air updates: the app GETs a static `manifest.json` and the bundle zip from tokentails.com. No device id,
  no cookie, no stats (`statsUrl: ""` in capacitor.config.ts).
- Party play (optional): the backend gets a random guest ticket and the generated player name for the match only.
  Apple counts data as "collected" when it leaves the device and is kept longer than needed to serve the request in
  real time; a party session is not linked to an identity and is not kept after the party. If that changes (saved
  match history, accounts), switch to: Identifiers (User ID) and Gameplay Content, "App Functionality", not linked
  for tracking.

If analytics is ever turned on (a native release, never by OTA): Usage Data → Product Interaction and Diagnostics →
Crash Data, purpose "Analytics", **not** used for tracking, linked to the user = No. Update this label before that
release is submitted.

Privacy policy URL: https://docs.tokentails.com/community-and-social-impact/privacy-policy

## Export compliance

`ITSAppUsesNonExemptEncryption = false` in Info.plist: the app uses only Apple's HTTPS and WSS (exempt). App Store
Connect does not ask again for each build.
