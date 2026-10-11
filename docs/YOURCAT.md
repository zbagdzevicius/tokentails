# `/yourcat`: your cat is the hero (bet #3)

A visitor uploads one photo of their cat and gets a playable pixel cat in Token Tails, a pixel
portrait and a share card. Free, no sign-up. The full spec, with the decisions behind it, is
[plans/yourcat-v2.md](plans/yourcat-v2.md). This page describes what ships in the client.

Related docs: [CLIENT.md](CLIENT.md) (client in general), [BACKEND.md](BACKEND.md) (the `/yourcat`
routes, the AI budget and every environment variable name), [API.md](API.md) (route table).

## Files

| Path | What |
|---|---|
| `client/pages/yourcat.tsx` | The route: `FirebaseAuthProvider authMode="guest"`, `SeoHead` (`/yourcat`, default OG image), header and night footer. No `getServerSideProps` or API routes (the page also ships in the app export) |
| `client/components/yourcat/YourCatPage.tsx` | Picks the screen; keeps the profile in step with the record (§4.4); focus management |
| `client/components/yourcat/useYourcat.ts` | State machine: status, record, upload, pixel portrait poll, paid poll, visibility |
| `UploadStep.tsx`, `WorkingStep.tsx`, `RevealStep.tsx`, `RevealFrame.tsx`, `ManualPick.tsx`, `PortraitUpsell.tsx`, `PaidState.tsx`, `PrivacyPanel.tsx`, `AppOnlyNotice.tsx` | Screens S1, S2, S3 (S4 merged in), the reveal frame, the no-AI pick (§1.5), S5, S6, S1-P and the app-build notice |
| `copy.ts` | Every string, the four portrait styles, `PRIVACY_NOTICE_VERSION`, `DURATION_MEASURED` |
| `prepareUpload.ts` | Type check, downscale to a ≤ 1600 px JPEG (drops EXIF), 10 MB rule on the file sent |
| `pixelateReveal.ts` | The pixelate steps of the reveal |
| `cardLayout.ts` (pure), `shareCard.ts` (canvas), `useShareCards.ts` | Share card layout, drawing, pre-rendering of every variant |
| `share.ts` | Web Share with the file, download fallback, copy link, in-app browser detection |
| `pinkPawPick.ts` | The Pink Paw cat on the card |
| `utm.ts` | Share URL and incoming UTM |
| `client/api/yourcat-api.ts` | API client (`status`, `upload`, `manual`, `me`, `get`, `rename`, `remove`, `portraitCheckout`) |
| `client/models/yourcat.ts` | Hand copy of `backend/src/yourcat/yourcat.contracts.ts` (pinned by `yourcat-contract.test.ts`) |
| `client/analytics/growth-events.ts` | The five growth events (client-only catalog) |
| `client/public/yourcat/pink-paw/*-card.webp` | Byte copies of the four licensed Pink Paw card images from `public/heist-game/assets/images/pink-paw/` |

## Flow

1. **States before upload** (from `GET /yourcat/status`, fetched again whenever the page becomes
   visible): loading ("Getting ready…", button disabled), paused (`enabled: false`, no upload control),
   budget spent (`uploadsOpen: false`, offers "Pick your cat's look yourself"). In the app build
   (`isApp`): no upload, no prices, a "works in your browser" notice with "Copy link". A visitor with a
   record (`GET /yourcat/me`) lands on S3 with no reveal animation.
2. **On mount** the page makes sure the guest document exists (`ensureGuestSession`) and prefetches one
   limited-use App Check token (`getLimitedUseAppCheckToken`), so the tap only sends the upload. A
   prefetched token older than 4 minutes, or used, is replaced at the tap.
3. **S1**: "Choose a photo" is a real button and the drop zone. The file input has no `capture`. The
   photo is prepared in the browser (type, downscale, size) before any request.
4. **S2**: the photo with a scan line, a two-step checklist in a polite live region (step 1 is done when
   the request body has left the browser; the upload uses XMLHttpRequest for that), and the name field.
   Errors map from `body.code` to the §1 table; a 429 without a code is the burst copy with "Try again"
   enabled after 10 s.
5. **S3** as soon as `POST /yourcat` answers 201: the reveal (pixelate 32 → 16 → 8 px, cross-fade,
   landing), the playable cat (GIF for 5 s, then the still frame; a tap plays it again), the card with
   format and Pink Paw choices, and Share / Download / Copy link / Play. The pixel portrait is polled at
   1.5, 1.5, 1.5, 1.5, 2.5 s, then every 4 s, and the poll stops on `ready`, `failed`, or 60 s after the
   record was made; nothing is polled while the tab is hidden. A name typed during the wait is saved
   with `PATCH /yourcat/:id`; edits on S3 re-render the card (debounced 300 ms) and save on blur or Enter.
   "Delete my photo" opens a dialog whose first focus is "Keep"; after "Delete" the page stays on S3 (the
   cat stays in the game, as the dialog says): the card falls back to the game look, the delete link and
   S5 go, focus moves to the heading, and a paid portrait still painting keeps its block (it is no
   longer polled, since the server stops serving the deleted record; the email delivers it).
6. **S5** (web only, `portrait.enabled`, the photo still stored): below the share block after a gap and
   a divider, never next to Share or the Pink Paw panel. The price comes from the status
   (`Intl.NumberFormat("en-IE")`); the client has no price number. Checkout is
   `POST /yourcat/:id/portrait-checkout` then `window.location.assign`.
7. **S6** (`/yourcat?yc=<id>&paid=1`): polls every 4 s for up to 10 minutes: confirming, painting (a
   drawn pixel paw pulses), ready (download), late.

Every animation uses `transform` and `opacity` (the pixelate step draws on a canvas) and has a
`prefers-reduced-motion` fallback (no movement, at most a 120 ms fade, GIF replaced by its still).

## Share card

Drawn on a `<canvas>` in the browser (Web Share with files needs the PNG ready inside the tap; the
brand faces exist only in the client). Story 1080 × 1920 and post 1080 × 1350, each with and without the
Pink Paw panel, all rendered when S3 mounts and again when the portrait arrives or the name changes.
Remote images load with `crossOrigin = "anonymous"` and a `cors=1` query. If the canvas cannot export,
Share and Download are hidden, Copy link stays, and `reportAppError("yourcat-card", …)` is sent.

The Pink Paw cat comes from the live gallery (`GET /shelter/rozine-pedute/gallery`): only Judas,
Raudvis, Zare or Simas, still at the shelter (WAITING or RECOVERING), picked by
`fnv1a(recordId) % candidates`. Any failure means no panel; there is never a bundled fallback. The panel
says only "MEETS {cat} FROM PINK PAW": no status line, nothing about money.

Share text: "Meet {Name}, now a pixel cat in Token Tails. Make yours free: {shareUrl}" ("my cat" when
the cat has no name). The shared URL is
`https://tokentails.com/yourcat?utm_source=share&utm_medium={card|link}&utm_campaign=yourcat&utm_content={story|post|link}`,
with no user or record id. Incoming `utm_source`, `utm_medium` and `utm_content` (slugs only) are kept in
`sessionStorage` key `tt.yourcat.utm` for `upload_started`.

In in-app browsers (Instagram, Facebook, TikTok) there is no Share or Download: the card shows large at
once with "Press and hold the card to save it." and the open-in-browser hint. `card_shared` with
`method: "long-press"` is sent once, on the card's `contextmenu` or a 500 ms touch hold (a save itself
cannot be detected).

Share and Download wait while the name field differs from the card (the 300 ms debounce, or a save in
flight), and the Web Share text names the cat exactly as the card it goes with. A name typed during the
wait fills the S3 field when its save lands, unless the visitor has already edited that field.

## Privacy

The S1-P panel text (version `PRIVACY_NOTICE_VERSION` = `2026-10-11`, sent with the upload as
`noticeVersion`; bump it whenever this text changes):

**How we handle your photo**

- Who is responsible: {Controller}, tokentails.com. Contact: info@tokentails.com.
- What we do with it: we make your pixel cat, its pixel portrait and your share card. If you buy the HD
  portrait, we also paint that from the same photo.
- Who processes it for us: OpenAI (to check the photo shows a cat and match it to a pixel family),
  Google Gemini (to draw the pixel portrait and, if you buy it, the HD portrait), DigitalOcean in
  Frankfurt (storage) and Stripe (payments).
- Transfers outside the EU: OpenAI and Google process the photo in the United States, under the EU
  Standard Contractual Clauses (and the EU–US Data Privacy Framework where the provider is certified).
  They may keep what we send for up to 30 days to detect abuse, then delete it. Neither uses it to
  train its models.
- How long we keep it: our copy of the original photo is stored privately and deleted after 30 days
  (or once a portrait you bought is delivered, if that is later). The pixel portrait stays with your
  cat until you delete it; after you delete it, copies cached by our image network can still load for
  up to an hour. We strip location and camera data from the photo.
- Why we may do this: to give you the service you asked for (GDPR Art. 6(1)(b)).
- Your rights: you can ask to see your data, have it deleted, or object to its use. Use “Delete my
  photo” below your cat, or write to info@tokentails.com. You can also complain to the Lithuanian data
  protection authority (VDAI, vdai.lrv.lt).
- Please only upload photos of your own cat, and no people. Photos with people are refused.

`{Controller}` (the operator's legal name and address) is a launch condition: it is the `CONTROLLER`
constant in `copy.ts`. "Neither uses it to train its models" is true only on billed API plans, so a
billed Gemini key is a launch condition too (spec §10).

## Analytics

Five client-only events in `client/analytics/growth-events.ts` (PostHog, consent-gated; not in
`shared/analytics-core.ts`, so `catnip-heist/` needs no sync). `AnalyticsEvent` in
`client/analytics/events.ts` is the union of the core events and these.

| Event | Fires | Properties |
|---|---|---|
| `upload_started` | right before `POST /yourcat` or `/yourcat/manual` | `source`, `fileType`, `sizeBucket`, `resized`, incoming UTM |
| `upload_done` | when that request answers | `outcome`, `errorCode`, `family`, `avatarStatus`, `seconds` |
| `card_shared` | after a Web Share or download, a copied link, or opening the long-press view (not on a cancelled share) | `format`, `method`, `withShelterCat`, `avatarStatus`, `secondsToReveal` |
| `portrait_checkout_started` | when the checkout session is created, before the redirect (also GTM `begin_checkout`) | `style`, `priceCents`, `currency` |
| `portrait_paid` | the first time S6 sees `painting` or `ready` (dedupe per browser in `localStorage` `tt.yourcat.paid.<id>`, else `sessionStorage`; also GTM `purchase`) | `priceCents`, `currency`, `status` |

No property carries a name, photo or avatar URL, record id, user id or email. `secondsToReveal` is the
time from the file selection to the S3 reveal, rounded; it is `null` when this page view did not
measure one (a returning visitor, a manual cat), so the p75 behind the "about 30 seconds" copy rule must
count only non-null values. That sentence stays off (`DURATION_MEASURED = false`) until the measured p75
is at or below 30 s. The reliable counts are the server's daily counters (`GET /yourcat/stats`, BACKEND.md).

## Environment

The client reads one new variable, `NEXT_PUBLIC_YOURCAT_ENTRY` (default off): `1`, `true` or `on`
shows the way in from the landing and the onboarding ceremony (`YourcatEntryLink`), and only while
`GET /yourcat/status` says the feature is on and uploads are open. It is inlined at build time, so a
change needs a client redeploy (launch checklist step 6). The App Check site key (`NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`)
and every server switch (`YOURCAT_ENABLED`, `YOURCAT_PORTRAIT_ENABLED`, the AI budget and caps) are
listed in [BACKEND.md](BACKEND.md) and [CLIENT.md](CLIENT.md).

## Tests

Jest in `client/__test__/`: `yourcat-contract`, `yourcat-prepare-upload`, `yourcat-card-layout`,
`yourcat-share`, `yourcat-utm`, `yourcat-pinkpaw`, `yourcat-analytics`, `yourcat-api`, `yourcat-flow`,
`yourcat-lobby-hero`, `yourcat-copy` (honesty rules), plus the `/yourcat` cases in
`auth-api-wrapper.test.ts`. Playwright: `client/e2e/yourcat.spec.ts` (one `@ci-desktop` test).

## Launch checklist

Work through it in order; a step starts only when the one before it is checked. "You" is the founder.
The backend switches and their defaults are in [BACKEND.md](BACKEND.md) ("Production checklist for the
flags"); the decisions behind them are in [plans/yourcat-v2.md](plans/yourcat-v2.md) §10.

0. [ ] **Before d83685b1 (v2) is pushed to `main`.** Owner: You.
   - Set `PORTRAIT_USD_PRICE_CHANGED_AT` to the deploy day, `YYYY-MM-DDT00:00:00Z`, on the backend
     before the new code starts. The code floor is `2026-10-12T00:00:00Z`; a later deploy without it
     ends the 48 h grace too early and refuses $6 payments the old backend created.
   - Decide the `/portrait` preview caps, which apply on merge even with every `/yourcat` flag off:
     `AI_PREVIEW_IP_DAILY_UNVERIFIED` (default 1 a day per address until App Check is on),
     `AI_PREVIEW_UNTRUSTED_DAILY` (default 5 a day site-wide for unproven addresses) and
     `AI_BUDGET_PREVIEW_EUR_PER_DAY` (default €3).
   - Do step 1 (`CF_ORIGIN_SECRET` and the Transform Rule) before the merge, not after: without it every
     visitor shares one untrusted bucket and the live `/portrait` free preview stops at 5 a day site-wide.
     If step 1 cannot be done first, raise `AI_PREVIEW_UNTRUSTED_DAILY` for that window.
   - Verify: the backend env shows all three decisions (or a written "defaults"), the date and the secret.
   - S6 "failed" copy promises the portrait or a full refund within 2 working days: whoever watches the
     `portraitsFailed` alert repaints by hand (`backend/scripts/memorial-portrait.js`) or refunds in Stripe.
1. [ ] **Provable client address: `CF_ORIGIN_SECRET` plus the Cloudflare Transform Rule.** Owner: You.
   Generate a long random secret, set it as `CF_ORIGIN_SECRET` on the backend, and add a Cloudflare
   Transform Rule (Modify Request Header) on the API hostname that sets `x-tt-origin-auth` to the same
   value on every request. Prefer this to `TRUST_PROXY` during the hackathon: `TRUST_PROXY` also
   changes how the guest treat route keys `/heist` visitors, which would change live treat limits
   mid-judging. Verify: after a deploy, `POST /yourcat` from a browser no longer answers 503
   `YOURCAT_NO_CLIENT_IP`, and `/yourcat/stats` shows `refusedNoClientIp` stop growing.
2. [ ] **App Check on.** Owner: You.
   - Google Cloud console, Security, reCAPTCHA: create a reCAPTCHA Enterprise key (website, score
     based) with the domains `tokentails.com` and `www.tokentails.com`.
   - Firebase console, App Check, Apps: register the web app with the reCAPTCHA Enterprise provider
     and that key; leave the token time to live at the default.
   - Vercel: set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` to the site key (production) and redeploy
     (the value is inlined at build time).
   - Backend: `AI_UPLOAD_APPCHECK_ENFORCE=true` and `AI_UPLOAD_IP_DAILY_UNVERIFIED=0`. The gate
     consumes each limited-use token, which is the replay protection.
   - Verify: on tokentails.com the `POST /yourcat` request carries `x-firebase-appcheck`; the same
     request replayed with curl answers 401 `YOURCAT_APP_CHECK_INVALID`.
3. [ ] **Billed Gemini key.** Owner: You. The production `GOOGLE_AI_API_KEY` must belong to a Google
   Cloud project with billing on, so the privacy notice's "Neither uses it to train its models" is true.
   Verify: in Google AI Studio, API keys, the key's project shows a paid tier (not "Free"); in the Cloud
   console, Billing, the project is linked to an active billing account.
4. [ ] **Controller named.** Owner: You (legal name and address), AI (the edit). Fill `CONTROLLER` in
   `client/components/yourcat/copy.ts` with the operator's legal name and address and bump
   `PRIVACY_NOTICE_VERSION` (any change to the notice text needs a new version). Verify: the S1-P panel
   on production shows no `{Controller}`, and `npx jest yourcat-copy` passes in `client/`.
5. [ ] **Secrets and alerts.** Owner: You. Set `AI_UPLOAD_IP_SALT` (or keep `INVALIDATE_CACHE_SECRET`
   set), `AI_ALERT_EMAIL_TO`, `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` (a verified sender in
   SendGrid). Without SendGrid, paid portraits are painted but not emailed and alerts are only logged.
   Verify: the variables are set on every backend instance, and the backend log shows no
   `alert not sent (AI_ALERT_EMAIL_TO or SENDGRID_API_KEY unset)` line after the first alert.
6. [ ] **Free path on.** Owner: You. `YOURCAT_ENABLED=true`, then one upload on production with a photo
   of your own cat: the reveal plays, the pixel portrait arrives, the cat is in the lobby, "Delete my
   photo" works. Then remove `'/yourcat'` from `exclude` in `client/next-sitemap.config.js` (it is
   kept out of the sitemap while paused) and deploy the client. Verify:
   `GET /yourcat/status` shows `enabled: true`, `/yourcat/stats` counts one `yourcatAdmitted` and one
   `yourcatDone`, and the built `sitemap-0.xml` contains `/yourcat`.
   - Entry link: on Vercel set `NEXT_PUBLIC_YOURCAT_ENTRY=1` (production) and redeploy the client; the
     value is inlined at build time, so setting it without a redeploy changes nothing. Verify: the
     landing hero and the onboarding ceremony show "Turn your cat's photo into your game cat", linking
     to `/yourcat`; with `YOURCAT_ENABLED` off or the budget spent the link disappears again.
7. [ ] **HD portrait upsell on.** Owner: You.
   - Add a portrait section to the terms of service (digital, made to order, the withdrawal
     acknowledgement, one redo by support) and put the terms URL in the Stripe live-mode settings
     (Settings, Public details), which `consent_collection.terms_of_service` requires.
   - Confirm Adaptive Pricing is off for these Checkout sessions (Stripe Dashboard, Settings,
     Payments, Adaptive Pricing), so buyers pay the shown €14.
   - `PORTRAIT_CHECKOUT_TOS_CONSENT=true` (the legacy `/portrait` digital checkout then asks for the same
     checkbox), then `YOURCAT_PORTRAIT_ENABLED=true`.
   - Buy one HD portrait by card on production and receive it by email.
   - Verify: the order is `COMPLETE`, `/yourcat/stats` counts `yourcatPortraitsPaid` and
     `portraitsDelivered`, and the email arrived.
8. [ ] **Daily check, from launch day.** Owner: You (or an AI digest). Open the cms `/yourcat` page
   (admins only), or call the route with an admin Firebase ID token:
   `curl -H "accesstoken: fb<ID token>" "https://<backend>/yourcat/stats?days=14"`. Look at spend
   against the cap, `yourcatFailed`, the refusal counters (`refusedNoClientIp`, `refusedAppCheck`,
   `refusedIpCap`, `refusedUserCap`, `refusedFailureCap`, `refusedBudget`),
   `portraitsDeliveryFailed` and `portraitsEmailFailed` (the last cms column, red above 0: a paid
   portrait whose email SendGrid did not accept; the alert email names the order). Turn `DURATION_MEASURED` on only after the p75 of non-null
   `secondsToReveal` is measured at or below 30 s (Analytics above).

## Known issues

- Fixed (KI-19, 2026-10-11): the consent banner did not name Google Tag Manager and never showed in a
  build with a GTM id but no PostHog key, so GTM could never get consent. It now opens when either
  PostHog or GTM is configured and names what "Accept" turns on in that build
  (`AnalyticsConsentBanner.tsx`, `consentCopy`). Its PostHog sentence names the five events above:
  "the steps of ... making your cat and buying a portrait, with the link that brought you here. No
  photo, name or email is sent" (CR2-04, 2026-10-11: it had named game starts and finishes only).
  Funnel events are still zero for visitors who do not
  accept; the server counters (`GET /yourcat/stats`) stay the reliable count.
- Open: the native app privacy labels omit PostHog, the guest id and App Check (`docs/MOBILE.md`);
  `/yourcat` keeps upload web-only, so it adds nothing there.
- Fixed (2026-10-11): `utils.shareURL` ignored its `text` argument and the `ShareModal` toast
  said "coppied". `shareURL(url, text)` now opens the system share sheet with the text where the
  browser has one and copies the link otherwise (`client/context/auth/shareLink.ts`); the toast says
  "Link copied". `/yourcat` uses neither.
- Open (decision #8): a guest who later signs in to an existing account loses the photo cat; creating
  a new account keeps it. The S3 guest note says so.
- Fixed (2026-10-11): `portrait_paid` deduped per tab (`sessionStorage`), so a second tab or a
  reload of the paid return could report it again. It now dedupes per browser in `localStorage`
  (`tt.yourcat.paid.<id>`), falling back to `sessionStorage`, then to the page, when storage is blocked.
