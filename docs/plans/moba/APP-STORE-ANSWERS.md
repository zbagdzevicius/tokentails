# Pawlegends iOS: App Store Connect answers

Pre-filled answers for the questionnaires only the account holder can submit in App Store Connect. They describe
the app build (`pawlegends-app/`, `com.tokentails.pawlegends`) from 1.1.0 (native compat 2, optional sign-in) as of
2026-11-11, checked against the code. Plan:
[APP-STORE.md](APP-STORE.md). Listing text, review notes and screenshots are in `pawlegends-app/fastlane/` and
upload with `fastlane ios metadata`; these answers do not upload and must be entered by hand.

Re-check this file whenever the app build adds analytics, accounts, purchases, free-text chat or new network calls.
Change it together with `pawlegends-app/ios/App/App/PrivacyInfo.xcprivacy` and `client/pages/pawlegends/privacy.tsx`.

## What the app build does (the evidence)

| Area | App build | Where |
|---|---|---|
| Account, login, Firebase | Optional sign-in from 1.1.0: Sign in with Apple (iPhone, Mac), Google (iPhone), email and password, through Firebase Authentication (JS SDK holds the session; Apple and Google run natively with `@capacitor-firebase/authentication`, `skipNativeAuth`). Everything plays without it. Online, a Firebase anonymous guest is made lazily at the first match save, party ticket or pass claim; offline nothing is made. In-app deletion: title chip or Settings → Account → Delete account (`DELETE /user/me`, Apple token revoked) | `pawlegends-app/src/host/`, `pawlegends/src/ui/account.ts`, `backend/src/user/guest/account-deletion.ts` |
| Analytics (PostHog) | Off: `VITE_PAWLEGENDS_POSTHOG_KEY=''`, so no events and no consent row in Settings | `pawlegends-app/scripts/build-web.mjs` |
| Crash reporting, ads, IDFA, ATT | None | `pawlegends-app/package.json`, `PrivacyInfo.xcprivacy` (`NSPrivacyTracking` false) |
| Purchases, crypto, donations | None. App mode hides checkout, offers and featured cats | `pawlegends/src/app/platform.ts`, `client/__test__/pawlegends-host.test.tsx` ("app builds") |
| On-device storage | Profile, settings, progress, party key `pl.party.guest`, sprite probe cache | `pawlegends/src/meta/profile.ts`, `src/app/app.ts` `partyGuestKey` |
| OTA updates | GET `manifest.json` and a bundle zip from tokentails.com; no device id, `statsUrl: ''` | `pawlegends-app/capacitor.config.ts`, `src/shell/ota.ts` |
| Party play (optional) | WebSocket to api.tokentails.com: random party key, generated name, hero, picks, inputs, quick-chat ids and pings | `pawlegends/src/party/partyClient.ts`, `src/net/socket.ts` |
| Server retention | Party doc: 3 h after last change (TTL), holds a hash of the party key and a hash of the /24 network. Room (match log, occupants' names and party key hashes, verdict): 30 days after it ends (TTL) | `backend/src/pawlegends/party/room-store.ts` lines ~270–291, `party-relay.ts` `hashKey` |
| Free-text input | None. Names are generated; chat is fixed quick-chat phrases | `pawlegends/src/party/ui/quickChat.ts`, `backend/src/pawlegends/party/party-names.ts` |
| Outbound links | Privacy link (Settings) and share links open Safari | `pawlegends/src/ui/settings.ts`, `src/share/` |

## App Privacy (App Store Connect → App Privacy)

The earlier draft said "Data Not Collected". That is not accurate: Apple counts data as collected when it leaves the
device and is kept longer than needed to answer the request in real time, and the party relay keeps finished rooms
(with a hash of the party key and the match) for 30 days. Solo play sends nothing, but the label covers the whole app.

**Do you or your third-party partners collect data from this app?** Yes.

| Data type | Collected | Use (purpose) | Linked to the user | Used for tracking |
|---|---|---|---|---|
| Contact Info → **Email Address** (optional sign-in; an Apple relay address with Hide My Email) | Yes | App Functionality | Yes | No |
| Contact Info → **Name** (the Apple or Google name when shared, and the Token Tails profile name) | Yes | App Functionality | Yes | No |
| Identifiers → **User ID** (the Firebase account or guest id; the random party key, kept only as a hash) | Yes | App Functionality | Yes | No |
| User Content → **Gameplay Content** (saved matches, Treat Track, friends and ranked if used; party: generated name, picks, inputs, result) | Yes | App Functionality | Yes | No |
| Health, Financial, Location, Sensitive Info, Contacts, other User Content (photos, audio, emails, messages), Browsing/Search History, Purchases, Diagnostics, Device ID, Product Interaction, Advertising Data | No | – | – | – |

Notes for the form:
- Gameplay Content sits under **User Content → Gameplay Content** in the form ("saved games, multiplayer matching
  or gameplay logic"). Tick only that box under User Content.
- Purpose "App Functionality" covers running the match, resuming a dropped connection, checking the result and
  limiting abuse (per-key and per-network caps). Do not tick Analytics, Developer's Advertising, Third-Party
  Advertising, Product Personalization or Other Purposes.
- **Linked to the user: Yes** for every row: a signed-in account ties email, name, account id and progress together
  (the processor is Google Firebase Authentication; Apple and Google confirm the identity).
- Sign-in is optional, but the label covers the whole app, so the account rows are declared even though most players
  never sign in.
- Tracking: No for every row. No IDFA, no data brokers, no ad networks, so no App Tracking Transparency prompt.
- Expected listing: **Data Linked to You: Contact Info, Identifiers, User Content**. **Data Used to Track You: none.**
- The privacy manifest (`PrivacyInfo.xcprivacy`) declares the same four types (EmailAddress, Name, UserID,
  GameplayContent), linked, not tracking, App Functionality. The Firebase and GoogleSignIn pods ship their own.

If analytics is ever turned on (a native release, never by OTA): add Usage Data → Product Interaction (and
Diagnostics → Crash Data if a crash SDK is added), purpose Analytics, linked as built, not tracking; update the
manifest, this file and the privacy page before that version is submitted.

**Privacy Policy URL:** https://tokentails.com/pawlegends/privacy (`client/pages/pawlegends/privacy.tsx`). It must be
deployed (merge to `main`, Vercel) before the listing is submitted. **User Privacy Choices URL:** leave empty.

## Age rating (App Store Connect → App Information → Age Ratings)

Expected result: **9+** (infrequent or mild cartoon violence). App Store Connect computes the rating from these
answers; if it shows something else, check the violence rows first.

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | Infrequent/Mild | Cartoon cats and dogs bonk each other with swords, spells and paws; heroes are knocked out and respawn. No blood, no gore |
| Realistic Violence | None | |
| Prolonged Graphic or Sadistic Realistic Violence | None | |
| Guns or Other Weapons | None / Infrequent if asked about cartoon weapons | Swords and staffs are cartoon fantasy props; no guns |
| Profanity or Crude Humor | None | Fixed quick-chat phrases only |
| Mature or Suggestive Themes | None | |
| Horror/Fear Themes | None | |
| Medical or Treatment Information | None | |
| Alcohol, Tobacco, or Drug Use or References | None | Catnip is a cat treat in Token Tails, but the app build shows no catnip economy; if the reviewer reads "catnip" in the UI as a drug reference, answer None and explain it is a cat toy |
| Sexual Content or Nudity / Graphic Sexual Content | None | |
| Simulated Gambling | None | No loot boxes, no random paid rewards |
| Contests | None | |
| Loot boxes | No | |
| Unrestricted Web Access | No | No in-app browser; links open Safari |
| User-Generated Content | No | Generated names, no uploads, no free text |
| Messaging and Chat | No | Party members can send only fixed quick-chat phrases and map pings; no free text, no DMs. If the form asks about any player-to-player communication, answer Yes with "predefined phrases only" |
| Advertising | No | |
| In-App Purchases | No | |
| Parental Controls / Age Assurance | No | |
| Made for Kids | No | Not in the Kids category |

## Export compliance

Uses encryption: **only exempt encryption** (HTTPS and WSS through Apple's system APIs, plus decryption of our own
signed update bundles for integrity, which is exempt as authentication/copy protection of our own content).
`ITSAppUsesNonExemptEncryption = false` is in `Info.plist`, so App Store Connect does not ask per build. No French
encryption declaration is needed.

## Other App Store Connect fields

| Field | Value |
|---|---|
| Name / subtitle / description / keywords / promo text | `pawlegends-app/fastlane/metadata/en-US/` (uploaded by the `metadata` lane) |
| Primary / secondary category | Games → Strategy, Action (`metadata/primary_*`) |
| Support URL | https://tokentails.com/pawlegends/support (`client/pages/pawlegends/support.tsx`, contact email on the page) |
| Marketing URL | https://tokentails.com/pawlegends |
| Copyright | 2026 Token Tails |
| Content rights | "Does your app contain, show, or access third-party content?" **No** (own art, own cats; Pink Paw shelter cat names and photos are licensed, see the founder's licence note) |
| Price | Free, all territories (decide if any territory should be excluded) |
| Review contact | First and last name and phone: **founder fills in** (deliver does not hold them). Email: info@tokentails.com (`review_information/email_address.txt`) |
| Sign-in required | No (sign-in is optional; no demo account needed: any Apple ID or email works) |
| Guideline 4.8 (login services) | Sign in with Apple is offered, first, wherever Google is (`pawlegends-app/src/host/sheet.ts`; entitlement in `App-iOS.entitlements` and the Mac `App.entitlements`) |
| Guideline 5.1.1(v) (account deletion) | In the app: title chip → Delete account, or Settings → Account → Delete account; web: https://tokentails.com/pawlegends/account. Deletes on the server at once (`DELETE /user/me`), revokes Sign in with Apple with the app's own client id |
| Review notes | `pawlegends-app/fastlane/metadata/review_information/notes.txt` |
| Version release | Manual (the `release` lane submits with `automatic_release: false`) |
| What's New | `release_notes.txt`: skipped by deliver for the first version; used from 1.0.1 on |
| Screenshots | iPhone 6.9" landscape 2868 × 1320, 5 shots in `fastlane/screenshots/en-US`. iPad 13" (2752 × 2064) are in `pawlegends-app/store/screenshots-ipad/en-US` and are not uploaded while the app is iPhone only |
| App icon | Comes from the build (`AppIcon` 1024 px, no alpha) |
| DSA trader status (EU) | Trader: Token Tails MB, with the address, phone and email the founder chooses to publish. Apple shows them on the EU listing |

## Mac App Store (macOS platform on the same app record)

The Mac version is the same app record (`com.tokentails.pawlegends`, universal purchase), so App Privacy, the age
rating, price and availability, content rights and the DSA trader status are shared: the answers above apply as they
are, with nothing to enter again. The privacy manifest ships in the Mac build too. Only these differ:

| Field | Mac value |
|---|---|
| Platform | App Store Connect → the app → Add platform → macOS (creates macOS 1.0.0) |
| Description / promo text / What's New | `pawlegends-app/fastlane/metadata_mac/en-US/` on top of `metadata/en-US/` (`mac_metadata` lane) |
| Name / subtitle / categories / privacy URL | Shared with iOS, from `metadata/` |
| Review notes | `pawlegends-app/fastlane/metadata_mac/review_information/notes.txt` (mouse and keyboard steps, sandbox) |
| Screenshots | Mac 2880 × 1800 (16:10), 5 shots in `fastlane/screenshots_mac/en-US` |
| Export compliance | Same as iOS: exempt only, `ITSAppUsesNonExemptEncryption = false` in the shared Info.plist |
| App Sandbox | On, `com.apple.security.network.client` only (Mac build only). No file, camera, microphone or location access |
| Minimum OS | macOS 12 |
| Version release | Manual (`mac_submit` uses `automatic_release: false`) |
