# Paw Legends: PostHog privacy, consent and store answers

Founder ask (2026-11-19, verbatim): "ok, take care and implement every gap, that's okey if we'll need to have consent,
privacy policy updated. implement that. ultracode. do full-on integration".

This file covers the privacy and store side of the PostHog integration: the privacy notice, the consent copy, the App
Store and Google Play answers, and the PostHog settings only the founder can change. The code gaps (app sends
nothing, first-session events lost, no server-side events, replay/heatmaps/surveys) are built in their own packages;
the rules they must keep for this notice to stay true are in "Rules for the code" below.

## What changed

| Where | Change |
|---|---|
| `pawlegends-web/pages/privacy.tsx` | New `#play-stats` section: what PostHog gets (game events, device and app details, diagnostics, server-side match / Yarn / web purchase events, session recordings and heatmaps with masked inputs, survey answers), the pseudonymous code, legal basis (consent), retention (events 12 months, recordings 30 days), withdrawal, processor and transfer. Processor list (DigitalOcean, Vercel, Cloudflare, Firebase, PostHog, Google Analytics, Stripe), SCC / DPF transfer note, 13+ audience and the under-16 parent note, rights incl. withdrawal. The old "no analytics in the app" line is gone. Updated 2026-11-19 |
| `pawlegends-web/components/pawlegends/PawlegendsConsent.tsx` | The bar names Google Analytics **and** PostHog (it said "Google Analytics cookies" while it also gated PostHog), mentions masked recordings, no ads, never sold |
| `pawlegends/src/ui/consentPrompt.ts` | "Share anonymous play stats" was not accurate (signed-in players get a hash of the account id: pseudonymous, still personal data). Now: "Share play stats ... No name, no email, no ads. Privacy" with a link to `#play-stats` |
| `pawlegends/src/ui/settings.ts` | Row "Share play stats"; the fine print says what is sent and that Off stops it |
| `pawlegends-app/ios/App/App/PrivacyInfo.xcprivacy` | Adds DeviceID, ProductInteraction, CrashData, PerformanceData, OtherDiagnosticData, OtherUserContent; Analytics purpose on UserID, GameplayContent. Linked, not tracking. Ships with the next native build |
| `docs/plans/moba/APP-STORE-ANSWERS.md` | App Privacy rows for analytics (below) |
| `docs/plans/moba/PLAY-STORE.md` | Data safety rows for analytics (below) |
| Hosted pages | `https://storage.googleapis.com/pawlegends-pages/android/index.html` (Data safety updated), `https://storage.googleapis.com/pawlegends-pages/privacy/index.html` (Apple App Privacy, PostHog setup, legal checks) |

## Rules for the code (so the notice stays true)

1. **Consent first, everywhere.** App and standalone game: nothing leaves the device before Allow; a denial drops the
   queue (a first-session queue may be kept on the device, never sent, and is deleted on No thanks). Website: the bar
   (`analytics/gtm.ts` `asksForConsent`): Europe asks first, elsewhere on unless the visitor says no.
2. **Server-side events only for players who allowed it.** The backend must know the choice (store `granted` /
   `denied` with the profile when the client reports it) and send match / Yarn / purchase events only for `granted`.
   Same distinct id as the client (`pl_` + SHA-256 of the Firebase uid). Never the uid, email, name, IP or Stripe ids.
3. **No IP, no location.** Every event sets `$geoip_disable: true`; server events never forward the player's IP;
   the project setting "Discard client IP data" is on (founder step 2).
4. **Person profiles only for identified players** (`$process_person_profile: false` for anonymous events, or
   posthog-js `person_profiles: 'identified_only'`), so a deletion request can delete the person and its events.
5. **Replay masking:** `maskAllInputs: true`, mask any element showing the email or account name, no console logs, no
   network request/response bodies or headers. Replay, heatmaps and surveys load only after consent and stay out of
   first-load JS.
6. **Withdrawal:** Settings "Share play stats" Off stops sending at once, clears the random code and stops replay; the
   website button reopens the bar. Account deletion: we delete the PostHog person on request (founder step 9).
7. **No ads, no ad id, no third-party tracking, no data sale.** If any of this changes, update this file, the privacy
   page and both store forms first.

## App Store Connect: App Privacy (enter before analytics ships in the app)

App Store Connect → Pawlegends → App Privacy → Edit. Keep every existing row; add or change these. Tracking: **No** on
every row. Linked to the user: **Yes** on every row.

| Data type | Purposes |
|---|---|
| Identifiers → User ID | App Functionality, **Analytics** |
| Identifiers → **Device ID** (random install code, not IDFA/IDFV) | Analytics |
| User Content → Gameplay Content | App Functionality, **Analytics** |
| User Content → Other User Content (match chat; survey answers) | App Functionality, **Analytics** |
| Usage Data → **Product Interaction** | Analytics |
| Diagnostics → **Crash Data** | App Functionality, Analytics |
| Diagnostics → **Performance Data** | Analytics |
| Diagnostics → **Other Diagnostic Data** | App Functionality, Analytics |

Unchanged: Email Address, Name (App Functionality), Coarse Location (App Functionality). Not collected: Purchases (the
app sells nothing), Advertising Data, Browsing History, Health, Financial, Contacts, Sensitive Info. ATT: not needed
(no IDFA, no data combined with other companies' data for ads; PostHog is our processor).

## Google Play Console: Data safety (enter before analytics ships in the app)

Play Console → Pawlegends → Policy and programs → App content → Data safety → Manage. Not shared on every row (PostHog
and Firebase are service providers). Processed ephemerally: No. Optional = the user can choose.

| Data type | Collected | Optional | Purposes |
|---|---|---|---|
| Personal info → User IDs | Yes | No (guest id) | App functionality, Account management, **Analytics** |
| Device or other IDs | Yes | Yes | App functionality, Fraud prevention / security, **Analytics** |
| App activity → **App interactions** | Yes | Yes | Analytics |
| App activity → Other user-generated content, Other actions | Yes | No | App functionality, **Analytics** |
| App info and performance → **Crash logs** | Yes | Yes | Analytics, App functionality |
| App info and performance → **Diagnostics** | Yes | Yes | Analytics |

Unchanged: Email address, Name, Approximate location, Other in-app messages. Encrypted in transit: Yes. Deletion: Yes.

## PostHog settings (founder; no personal API key here, so by hand)

PostHog → the Token Tails project (US Cloud). Menu names can move between PostHog releases; search the Settings page
for the bold words.

1. **Authorized URLs** (Settings → Project → Toolbar / Web analytics → **Authorized URLs**): add
   `https://pawlegends.app`, `https://www.pawlegends.app`, `https://tokentails.com`, `https://www.tokentails.com`.
   The apps run at `capacitor://localhost` (iOS) and `https://localhost` (Android) (`pawlegends-app/capacitor.config.ts`,
   androidScheme https, no hostname): add `https://localhost` too; PostHog may refuse `capacitor://localhost` (it
   wants http/https), which is fine because this list only drives the toolbar and heatmap overlay.
2. **IP:** Settings → Project → **IP data capture** → turn on **Discard client IP data**. The privacy page says
   PostHog does not store the network address; this makes it true.
3. **Session replay:** Settings → Project → Session replay → **Record user sessions** On. **Authorized domains for
   replay**: leave empty, or list the URLs of step 1 plus `https://localhost` and `capacitor://localhost` (an unlisted
   origin is not recorded, so the app would record nothing). **Capture console logs** Off. **Capture network
   performance** Off (no headers or bodies). Canvas capture Off. Minimum duration 5 s; sampling 100% at launch, lower
   it if the bill grows.
4. **Replay retention:** Settings → Session replay → retention **30 days** (the privacy page says 30 days).
5. **Event retention:** the privacy page says 12 months. On the free plan PostHog keeps events 1 year, which matches.
   If you move to a paid plan (longer default), ask PostHog support to keep 12 months, or tell Claude to change the
   page to the plan's period.
6. **Heatmaps:** Settings → Project → Autocapture & heatmaps → **Enable heatmaps** On. Autocapture can stay Off (the
   game sends named events).
7. **Surveys:** Surveys → **Enable surveys** (popover surveys On). Keep questions free of personal data; no free-text
   question that asks for an email.
8. **DPA:** Settings → Organization → **Data processing agreement**, or https://posthog.com/dpa: fill it in for Token
   Tails MB and sign. Keep the PDF with the Stripe and Google DPAs.
9. **Deletion requests:** Persons → search the code (`pl_…`; the player gets it from Settings if the client shows it,
   or we compute it from their account) → **Delete person** with "also delete events". Answer within 30 days.
10. **Warehouse wizard** (interactive, run it yourself in your own terminal from the repo root, on a throwaway branch;
    review its diff before merging, it may add packages or code we already have): `npx -y @posthog/wizard@latest`.
    For Data warehouse sources (Stripe, MongoDB) use PostHog → Data pipeline → Sources → **New source**, with a
    read-only restricted Stripe key. Any new source holding personal data must be added to the privacy page first.

## Legally uncertain (check before relying on it)

- **Transfer basis:** the page says the EU–US Data Privacy Framework where the company is certified, otherwise the
  SCCs in its data processing terms. Check PostHog, Inc. on https://www.dataprivacyframework.gov/list and that the
  signed DPA includes the SCCs.
- **Children:** the audience is 13+, but GDPR Art. 8 lets countries set the consent age between 13 and 16 (Lithuania
  14, Germany and the Netherlands 16). The page asks under-16s to involve a parent; that is the minimum reading. A
  stricter option is to not show the prompt to accounts known to be under 16 (the 16+ chat gate already has the age).
- **Server-side events under consent:** if the backend ever sends a player event without a stored `granted`, that is
  outside this notice.
- **Purchase events:** item, price and currency tied to the pseudonymous code are personal data; covered by consent
  on the page. Stripe stays the payment processor under its own terms.
- **ePrivacy for the app:** storing the random code on the device needs consent; it is made only after Allow.
