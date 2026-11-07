# Pawlegends iOS: App Store Connect answers

Pre-filled answers for the questionnaires only the account holder can submit in App Store Connect. They describe
the v1 app build (`pawlegends-app/`, `com.tokentails.pawlegends`) as of 2026-11-07, checked against the code. Plan:
[APP-STORE.md](APP-STORE.md). Listing text, review notes and screenshots are in `pawlegends-app/fastlane/` and
upload with `fastlane ios metadata`; these answers do not upload and must be entered by hand.

Re-check this file whenever the app build adds analytics, accounts, purchases, free-text chat or new network calls.
Change it together with `pawlegends-app/ios/App/App/PrivacyInfo.xcprivacy` and `client/pages/pawlegends/privacy.tsx`.

## What the app build does (the evidence)

| Area | App build | Where |
|---|---|---|
| Account, login, Firebase | None. The app build never signs in; there is no Firebase SDK in the app. | `pawlegends/src/app/platform.ts` (`APP_ENV`), `pawlegends-app/package.json` |
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
| Identifiers → **User ID** (the random party key the app makes; the server keeps only its hash) | Yes | App Functionality | Yes (see note) | No |
| Usage Data / Other Data → **Gameplay Content** (generated player name, hero picks, match inputs, result) | Yes | App Functionality | Yes (see note) | No |
| Contact Info, Health, Financial, Location, Sensitive Info, Contacts, User Content (photos, audio, emails, messages), Browsing/Search History, Purchases, Diagnostics, Device ID, Product Interaction, Advertising Data | No | – | – | – |

Notes for the form:
- Gameplay Content sits under **User Content → Gameplay Content** in the form ("saved games, multiplayer matching
  or gameplay logic"). Tick only that box under User Content.
- Purpose "App Functionality" covers running the match, resuming a dropped connection, checking the result and
  limiting abuse (per-key and per-network caps). Do not tick Analytics, Developer's Advertising, Third-Party
  Advertising, Product Personalization or Other Purposes.
- **Linked to the user: Yes** is the conservative answer: the match is stored with a hash of a persistent per-install
  key. It is not tied to a name, email or Apple ID. "Not linked" would need the relay to drop the key hash from
  stored rooms; if that is ever done, switch both rows to "Not linked" and update `PrivacyInfo.xcprivacy`.
- Tracking: No for every row. No IDFA, no data brokers, no ad networks, so no App Tracking Transparency prompt.
- Expected listing: **Data Linked to You: Identifiers, User Content**. **Data Used to Track You: none.**
- The privacy manifest (`PrivacyInfo.xcprivacy`) declares the same two types (UserID, GameplayContent), linked,
  not tracking, App Functionality.

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
| Sign-in required | No (no demo account) |
| Review notes | `pawlegends-app/fastlane/metadata/review_information/notes.txt` |
| Version release | Manual (the `release` lane submits with `automatic_release: false`) |
| What's New | `release_notes.txt`: skipped by deliver for the first version; used from 1.0.1 on |
| Screenshots | iPhone 6.9" landscape 2868 × 1320, 5 shots in `fastlane/screenshots/en-US`. iPad 13" (2752 × 2064) are in `pawlegends-app/store/screenshots-ipad/en-US` and are not uploaded while the app is iPhone only |
| App icon | Comes from the build (`AppIcon` 1024 px, no alpha) |
| DSA trader status (EU) | Trader: Token Tails MB, with the address, phone and email the founder chooses to publish. Apple shows them on the EU listing |
