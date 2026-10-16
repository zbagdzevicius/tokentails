# `/yourcat`: your cat is the hero (bet #3)

A visitor uploads one photo of their cat and gets a playable pixel cat in Token Tails, a pixel
portrait and a share card. Free, no sign-up. The full spec, with the decisions behind it, is
[plans/yourcat-v2.md](plans/yourcat-v2.md). This page describes what ships in the client.

Related docs: [CLIENT.md](CLIENT.md) (client in general), [BACKEND.md](BACKEND.md) (the `/yourcat`
routes, the AI budget and every environment variable name), [API.md](API.md) (route table).

## Files

| Path | What |
|---|---|
| `client/pages/yourcat.tsx` | The route: `FirebaseAuthProvider authMode="guest"`, `SeoHead` (title "Turn your cat into a pixel cat - Token Tails", OG `public/yourcat/og.jpg` 1200 × 630 with alt), the page's own `YourcatHeader` (not the shared `layouts/Header.tsx`), the night footer. The wrapper is `min-h-[100svh] flex flex-col` and the page is `flex-1`, so the footer starts below the fold. No `getServerSideProps` or API routes (the page also ships in the app export) |
| `client/components/yourcat/YourCatPage.tsx` | The studio (polish §3): one persistent `<Stage>` with one `<Frame>` and one `<TransformFrame>` across the friend view, upload, working, reveal, manual pick and paid return; picks the screen; keeps the profile in step with the record (§4.4); focus management |
| `studio.tsx` | The slots the screens portal into (frame effects, companion, cat, overlay, panel, extras), the stage config, the reveal clock's cue listener and replay, the fixed-height heading block |
| `useYourcat.ts` | State machine: status, record, upload (with the scan-pass hold and S2's wait for the pixel portrait), pixel portrait poll, paid poll, visibility, the friend view (`?cat=`), the visitor's own daily cap remembered for the tab |
| `UploadStep.tsx`, `WorkingStep.tsx`, `RevealStep.tsx` | S1 and S0 (friend view), S2 (with the three-segment `Meter`), S3 (clock beats, meeting, card, share bar, More sheet, rename) |
| `ManualPick.tsx`, `PortraitUpsell.tsx`, `PaidState.tsx`, `PrivacyPanel.tsx`, `AppOnlyNotice.tsx` | The no-AI pick (§1.5; on the page its H1 is `ManualPickHeading` in the heading block, column 2 row 1 on md+, and the panel drops its H2 and sits straight under it, so "Make my cat" and the name field stay inside 1440 × 900), S5, S6 (`PaidFrameContent` fills the stage frame; its `renderCat` puts the visitor's cat in the stage's cat slot), S1-P and the app-build notice |
| `brand.tsx`, `motion.ts`, `spriteSheet.ts`, `Frame.tsx`, `Stage.tsx`, `PetCat.tsx`, `YourcatHeader.tsx` | The landing brand kit (headline, chip, pills, `PrimaryAction` = `PixelButton`), the easings, the cue clock and the flight, the 720 × 480 sheet table, the gilt frame, the painted stage, the pettable cat (`blink`: the sit row holds frame 0 and blinks every 4 s; under reduced motion a new `mode` cross-fades frame 0 in 120 ms), the header with the canonical lockup |
| `TransformFrame.tsx`, `Burst.tsx`, `pixelateReveal.ts` | Everything inside the frame (scan, motes, quantise, the 1,450 ms clock, pending label, reduced-motion photo badge), the gold pixel burst, the pixelate steps |
| `copy.ts` | Every string (headlines as `TitleParts`), the four portrait styles, `cardText()`, `PRIVACY_NOTICE_VERSION`, `DURATION_MEASURED` |
| `ui.tsx` | The text field, the alert, the two link styles and the pixel paw (the `/yourcat`-only button and title styles are gone) |
| `prepareUpload.ts` | Type check, downscale to a ≤ 1600 px JPEG (drops EXIF), 10 MB rule on the file sent |
| `cardLayout.ts` (pure), `shareCard.ts` (canvas), `useShareCards.ts` | Share card layout, drawing, pre-rendering of every variant |
| `share.ts` | Web Share with the file, download fallback, copy link, in-app browser detection |
| `pinkPawPick.ts` | The Pink Paw cat on the stage and the card |
| `utm.ts` | Per-cat share URL (`buildShareUrl`, `readShareId`) and incoming UTM |
| `client/api/yourcat-api.ts` | API client (`status`, `upload`, `manual`, `me`, `get`, `publicCat`, `rename`, `remove`, `portraitCheckout`) |
| `client/models/yourcat.ts` | Hand copy of `backend/src/yourcat/yourcat.contracts.ts` (pinned by `yourcat-contract.test.ts`) |
| `client/analytics/growth-events.ts` | The five growth events (client-only catalog) |
| `client/public/yourcat/` | `pink-paw/*-card.webp` (byte copies of the four licensed Pink Paw card images), `altar-strip.webp`, `logo-text-320.webp`, `og.jpg` |

## Flow

The page is one studio (docs/plans/yourcat-polish.md §3): on phones the heading block (a 28 px kicker
slot and a two-line H1 slot), then the stage, then the screen's panel; from `xl` (1280 px) a two-column
grid, `grid-cols-[minmax(0,1fr)_420px]`, with the stage in column 1 and the heading and the sticky panel
in column 2. Between 768 and 1279 px the column stacks with the stage capped at 680 px wide. The stage
and its frame never move or resize between screens; only their contents change. Every motion has a
calm twin under `prefers-reduced-motion` (opacity only, the cat can still be petted, sound still plays
after a gesture).

1. **States before upload** (from `GET /yourcat/status`, fetched again whenever the page becomes
   visible): loading ("Getting ready…", button disabled), paused (`enabled: false`, no chip, "Play Token
   Tails"), budget spent (`uploadsOpen: false`, no chip, "Pick your cat's look yourself"). In the app
   build (`isApp`): no stage, no upload, no prices, a "works in your browser" notice. A visitor with a
   record (`GET /yourcat/me`) lands on S3 with no clock.
2. **On mount** the page makes sure the guest document exists and prefetches one limited-use App Check
   token, so the tap only sends the upload.
3. **S0, the friend view** (`/yourcat?cat=<shareId>`): `GET /yourcat/public/:shareId` (public, no
   `accesstoken`). The frame holds the friend's pixel portrait (or sprite), the friend's cat walks onto
   the altar and can be petted, and a small empty frame says "Your cat here". H1 "Mochi says hi." (or
   "A pixel cat says hi."), one primary "Choose a photo", and "See your cat" when the visitor already has
   one. A 404, a network error or a malformed id drops `cat` from the address (Next router shallow
   replace, the UTM parameters stay) and shows S1 with no message.
4. **S1, the empty frame**: chip "One photo · Free · No sign-up", H1 "Your cat, in the game.", the
   empty frame with the dashed silhouette, the example cat (Ginger starter, labelled "Example"), one
   `PrimaryAction` "Choose a photo", one line of body, the two captions. 70 ms entrance rhythm. The whole
   stage is a drop zone. The tap unlocks the meow and purr (`primeHomeSounds`), the button presses, the
   photo flies into the frame (`flyTo`). The file input has no `capture`; the photo is prepared in the
   browser before any request. The H1 is capped at `text-h4` (no `xl:text-h3`), so on md+ it reads
   "YOUR CAT, / IN THE GAME." on two lines; a headline's glow words (up to 16 characters) never break
   inside (`whitespace-nowrap`). When this tab met the visitor's own daily cap today (below), S1 shows the
   spent state before the next photo: no chip, no upload input, the own-cap line and "Pick your cat's
   look yourself".
5. **S2, the paint is drying**: the photo in the same frame with the scan line (1,800 ms a pass, 1,200 ms
   once sent), the honest meter in the kicker slot (Photo fills when the body has left, Coat when
   `POST /yourcat` answers, Portrait when the pixel portrait is ready; no percentages or timers), and
   the only name field of the flow ("While you wait: what's their name?"). Beat B: motes, the example
   cat sits and faces the frame. Beat C (6 s): push-in, breathing glow, a 1/16 quantised overlay. H1
   "Turning your cat into pixels" (glow "your cat"). When `POST /yourcat` answers with the pixel
   portrait still `pending`, S2 stays (client only): the Coat segment fills, the Portrait one is active,
   the H1 becomes "Almost there", the meter reads "Painting your pixel portrait…", beat C keeps running
   and the name field stays. `GET /yourcat/:id` is polled every 1.5 s (`PORTRAIT_POLL_MS`; not while the
   tab is hidden). S3 starts once the portrait is `ready` and its image has loaded and decoded
   (`decodeRevealImage`, at most 2 s; the clock's own load is then a cache hit), at once on `failed`, or
   after `PORTRAIT_WAIT_MS` (25 s) on the pending path below. When the answer (or the portrait) arrives
   the screen holds until the scan pass ends (at most 400 ms, `scanRemainingMs`), scrolls back to the
   top if the stage left the viewport, then S3 starts in the same frame. A failure
   desaturates the photo, turns the meter's segment rust ("Stopped"), and shows one alert with the
   actions (the first one is the `PrimaryAction`) inside the first 390 × 844 viewport. A 429 without a
   code shows the burst copy with "Try again" enabled after 10 s. The visitor's own daily cap
   (`YOURCAT_IP_DAILY_CAP`, `_USER_`, `_FAILURE_`) has its own H1 "That's today's AI cats" and the line
   "You have made all your AI cats for today. Your cat can still join the game with a look you pick."
   with "Pick your cat's look yourself"; no countdown or reset time (the server counts a UTC day). The
   meter keeps the rust Coat segment and leaves Photo unfilled. The cap is remembered in
   `sessionStorage` key `tt-yourcat-own-cap` (the UTC day; every read and write in try/catch), so S1
   shows the spent state until the server's day ends; blocked storage just means the server answers
   with the cap again.
6. **S3, it steps out**: the 1,450 ms clock in the frame (crack, gather, step out). At the step-out the
   frame settles (and moves 40 px left on phones), the cat jumps out onto the stone with the level-up
   flare, a 28-pixel burst, a meow and a short buzz; the purr follows 600 ms later; "Meet Mochi." lands
   on the title cue; "Watch again" replays the clock from the photo still in memory (fresh uploads
   only). A portrait still being drawn after S2's 25 s wait gathers into the photo quantised to 32 cells
   across with the gold tint (`pendingTarget`), shows "Painting your pixel portrait…" in the frame and fills the
   meter's last segment when it lands (8-pixel burst, no sound); then the kicker becomes the chip "In
   the game". 400 ms after the clock, a real Pink Paw cat's cream frame slides onto the altar, the cat
   sits facing it and one heart rises (no sound). With no gallery or no qualifying cat there is no frame,
   no meeting heading, no switch and the card is solo. The pencil after the heading renames the cat
   (Enter or blur saves; the card follows the accepted name). The card preview is sized to its format
   (story on phones, post on md+), prints in once and cross-fades on changes; "Put Zare on my card" sits
   under it. Phones get a sticky bar (Share, or Download without Web Share files; "Play as Mochi";
   "More" opens a focus-trapped sheet with Story/Post, Download and Copy link); larger screens get the
   actions row and the Story/Post pills in the panel. Under the stage: the meeting block (the coat line,
   the meeting heading and body), one footer line "Delete my photo · Start over" and the guest note.
   On that pending path S3 polls the pixel portrait at 1.5, 1.5, 1.5, 1.5, 2.5 s, then every 4 s, and the
   poll stops on `ready`, `failed`, or 60 s after the record was made; nothing is polled while the tab
   is hidden.
   "Delete my photo" opens a dialog whose first focus is "Keep"; after "Delete" the page stays on S3.
7. **S5** (web only, `portrait.enabled`, the photo still stored): after the footer line with `mt-24`,
   never next to Share or the meeting block. The price comes from the status (`formatPrice`); the
   client has no price number.
8. **S6** (`/yourcat?yc=<id>&paid=1`): the stage returns with a 2:3 frame (`PaidFrameContent`); the
   panel (with its H1) takes column 2, row 1 on md+ and polls every 4 s for up to 10 minutes:
   confirming, painting, ready (download), late. The visitor's cat sits beside the frame (same slot and
   scale as S3, still pettable) and blinks every 4 s. When the poll says ready, the veil wipes away
   (900 ms); at the end of the wipe the cat stands (idle row) facing the frame, with one purr and a
   12-pixel burst. A page that opens ready shows the portrait and the standing cat at once, with no
   burst or purr. Reduced motion: the veil fades in 300 ms, then sit frame 0 cross-fades to idle frame 0
   in 120 ms with the purr, no burst and no blink.

## Share card

Drawn on a `<canvas>` in the browser (Web Share with files needs the PNG ready inside the tap; the
brand faces exist only in the client). Story 1080 × 1920 and post 1080 × 1350, each with and without the
Pink Paw panel, all rendered when S3 mounts and again when the portrait arrives or the name changes.
Remote images load with `crossOrigin = "anonymous"` and a `cors=1` query. If the canvas cannot export,
Share and Download are hidden, Copy link stays, and `reportAppError("yourcat-card", …)` is sent.

The Pink Paw cat comes from the live gallery (`GET /shelter/rozine-pedute/gallery`): only Judas,
Raudvis, Zare or Simas, still at the shelter (WAITING or RECOVERING), picked by
`fnv1a(recordId) % candidates`. Any failure (or its art failing to load) means no shelter frame, no
meeting and no panel; there is never a bundled fallback. The card's strings come from `cardText()` in
`copy.ts`: "Mochi & Zare", "Mochi met Zare, a real cat from Pink Paw", and the panel's "NEW FRIEND",
"Zare", "A REAL CAT AT PINK PAW". No status line, location or money words, and "waiting for a home"
stays banned (`yourcat-copy.test.tsx`).

**Share link (per cat).** Every record has a random public `shareId` (12 base64url characters). The
shared URL is
`https://tokentails.com/yourcat?cat={shareId}&utm_source=share&utm_medium={card|link}&utm_campaign=yourcat&utm_content={story|post|link}`
(`buildShareUrl`), with no user or record id. A friend who opens it sees the cat's name (only when
named), family and pixel look, never the photo (S0 above).

Share text (§4.5): "Mochi is a pixel cat now, and just met Zare, a real cat from Pink Paw. Turn your cat
into one: {url}" with the panel on, "Mochi is a pixel cat now. Turn your cat into one: {url}" without
it, "My cat is a pixel cat now…" when the cat has no name. Incoming `utm_source`, `utm_medium` and
`utm_content` (slugs only) are kept in `sessionStorage` key `tt.yourcat.utm` for `upload_started`.

In in-app browsers (Instagram, Facebook, TikTok) there is no Share or Download: the card shows large at
once with "Press and hold the card to save it." and the open-in-browser hint. `card_shared` with
`method: "long-press"` is sent once, on the card's `contextmenu` or a 500 ms touch hold (a save itself
cannot be detected).

Share and Download wait while the name field differs from the card (the 300 ms debounce, or a save in
flight), and the Web Share text names the cat exactly as the card it goes with. A name typed during the
wait fills the S3 field when its save lands, unless the visitor has already edited that field.

## Privacy

The S1-P panel text (version `PRIVACY_NOTICE_VERSION` = `2026-10-12`, sent with the upload as
`noticeVersion`; bump it whenever this text changes):

**How we handle your photo**

- Who is responsible: {Controller}, tokentails.com. Contact: info@tokentails.com.
- What we do with it: we make your pixel cat, its pixel portrait and your share card. If you buy the HD
  portrait, we also paint that from the same photo.
- If you share your cat's link, anyone who opens it sees your cat's name and pixel look, never your
  photo.
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

Five client-only events in `client/analytics/growth-events.ts` (PostHog, scrubbed, every visitor; not in
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
`yourcat-share`, `yourcat-utm`, `yourcat-pinkpaw`, `yourcat-analytics`, `yourcat-api`, `yourcat-flow`
(one persistent stage, the scan hold, the meter, the clock and replay, the meeting and its null rule,
pet to purr, the pencil rename, the per-cat share text, the friend view and its fallback),
`yourcat-lobby-hero`, `yourcat-copy` (honesty rules, the shelter beat, the share and card text, the
grep for framer-motion, Phaser and the deleted styles), `yourcat-stage`, `yourcat-sprite-sheet`,
`yourcat-motion`, `yourcat-reveal-clock`, `yourcat-share-card`, `yourcat-screens`, plus the `/yourcat`
cases in `auth-api-wrapper.test.ts`. Playwright: `client/e2e/yourcat.spec.ts` (route mocks only; the
flows, the More sheet, the friend view and its 404 fallback, reduced motion, CLS < 0.05 from S1 to S3,
the card at most 560 px from the top and the primary share action on screen at 390 × 844, card, switch
and primary inside 900 px at 1440 × 900, no horizontal overflow at 360, 390 and 1440).

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

- Open (polish §15, report only): the shared `layouts/Header.tsx` uses the invalid Tailwind class
  `bg-[rgba(45, 30, 107, 1)]`, so `bg-blue-300` shows instead on `/cats`, `/marketing`, `/stats` and the
  payout pages. `/yourcat` uses its own `YourcatHeader` and is not affected.
- Open (phone-r3, cosmetic): on phones, in the first ~0.5 s of the S3 meeting walk, the cat's tail
  crosses the portrait frame's lower-left edge by about 5 to 8 px. Settled, sat and heart states are
  clean. Fix: start the walk a few px further left (start x = portrait left minus tail width) in the
  `Stage`/`PetCat` meeting keyframes.
- Open (polish §15): every family sheet must follow the `Catbassador.ts` row order (sleep, dig, groom,
  hit, idle, jump, loaf, run, sit, walk). `yourcat-sprite-sheet.test.ts` checks the starters and the
  base colours available locally; the CDN families are assumed to match and are only spot-checked by
  the e2e mocks. A family with another order would loaf or sit on the wrong row.
- Open (polish build D): the two-column studio starts at `xl` (1280 px), not `md`. At `md` the 384 px
  frame, the 4x cat and the shelter frame do not fit the `minmax(0,1fr)` column next to the 420 px panel
  (the cat overlapped the panel and took its clicks); between 768 and 1279 px the page stacks with the
  stage capped at 680 px.
- Open (polish build D): on phones the coat line sits in the meeting block (under the switch), not
  between the stage and the card, so the card's top stays within 560 px at 390 × 844 (§14.1; measured
  536 px at 390 and 501 px at 360 in phone-r3). The card preview prints in on the first card only
  after the step-out show ends, and the sticky bar appears with it, so a phone recording of the show
  stays clean.

- Superseded (KI-19, 2026-10-16): the analytics consent banner and the `/yourcat` compact chip were
  removed. The five events above are sent for every visitor (no photo, name or email). The server
  counters (`GET /yourcat/stats`) stay the reliable count.
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
