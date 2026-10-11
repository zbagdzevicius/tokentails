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
| `portrait_paid` | the first time S6 sees `painting` or `ready` (dedupe `sessionStorage` `tt.yourcat.paid.<id>`; also GTM `purchase`) | `priceCents`, `currency`, `status` |

No property carries a name, photo or avatar URL, record id, user id or email. `secondsToReveal` is the
time from the file selection to the S3 reveal, rounded; it is `null` when this page view did not
measure one (a returning visitor, a manual cat), so the p75 behind the "about 30 seconds" copy rule must
count only non-null values. That sentence stays off (`DURATION_MEASURED = false`) until the measured p75
is at or below 30 s. The reliable counts are the server's daily counters (`GET /yourcat/stats`, BACKEND.md).

## Environment

The client reads no new variables. The App Check site key (`NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`)
and every server switch (`YOURCAT_ENABLED`, `YOURCAT_PORTRAIT_ENABLED`, the AI budget and caps) are
listed in [BACKEND.md](BACKEND.md) and [CLIENT.md](CLIENT.md).

## Tests

Jest in `client/__test__/`: `yourcat-contract`, `yourcat-prepare-upload`, `yourcat-card-layout`,
`yourcat-share`, `yourcat-utm`, `yourcat-pinkpaw`, `yourcat-analytics`, `yourcat-api`, `yourcat-flow`,
`yourcat-lobby-hero`, `yourcat-copy` (honesty rules), plus the `/yourcat` cases in
`auth-api-wrapper.test.ts`. Playwright: `client/e2e/yourcat.spec.ts` (one `@ci-desktop` test).

## Known issues

- The consent banner does not name GTM and never shows with a GTM id but no PostHog key
  (`docs/CLIENT.md`, consent section); funnel events are zero without consent. Use the server counters.
- The native app privacy labels omit PostHog, the guest id and App Check (`docs/MOBILE.md`); `/yourcat`
  keeps upload web-only, so it adds nothing there.
- `utils.shareURL` ignores its `text` argument, and the `ShareModal` toast says "coppied"
  (`client/components/shared/ShareModal.tsx` lines 55 and 66). `/yourcat` does not use either.
- A guest who later signs in to an existing account loses the photo cat (decision #8); creating a new
  account keeps it. The S3 guest note says so.
- `portrait_paid` dedupes per tab (`sessionStorage`): opening the paid return in a second tab can report
  it again.
