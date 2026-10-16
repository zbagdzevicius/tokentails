# Bet #3 "Your cat is the hero": `/yourcat` (v2 spec)

Status: implementation spec, written 2026-10-11 on branch `v2`, revised the same day after a second
verification pass (preview sub-cap, EUR order audit, route order), and revised again after three reviews
(code truth, security and cost, UX and honesty; see the Review log at the end). Owner of this file: the
architect pass. Three workstreams (A backend, B client `/yourcat`, C portrait trust and prices) build from
it in parallel.

**Branch rule.** All work lands on `v2` only. Hackathon submissions live on other branches and on
production. Nobody in this bet touches `/heist`, `/shelter-payouts`, `catnip-heist/`, `shelter-rail/`,
`contracts/`, `client/public/heist-game/` (read-only source for four images, see §5), payout code
(`backend/src/shelter/**`, `client/components/shelter-payouts/**`), or any `shared/**` file (several of
them, such as `enums.ts`, `errors.ts`, `analytics-core.ts`, `caps.ts`, `heist-bridge.ts`, `copy.ts`,
`pink-paw.ts`, `shelter-goal.ts` and `home-yard.ts`, sync into `catnip-heist/`). CI runs only on PRs and
on `main` (`.github/workflows/ci.yml:22-25`), so every stream runs its checks locally (§9).

Facts checked in code or live for this spec (2026-10-11):

- The CDN family sheet `assets/<FAMILY>/base.png` exists (HTTP 200) for 21 of the 22 `CatOriginType`
  families, with `base/GROOMING.gif`. `PEACHES` has neither (403). Every sheet probed is 720x480, the same
  48 px grid as `client/public/cats/*/sprites/*.png` and `STARTER_ART` (`backend/src/user/guest/starter.ts:52`).
- Both DigitalOcean CDNs send `access-control-allow-origin: *` (`tokentails-nfts...` for sprites,
  `tokentails...` for uploads and Pink Paw art). A client canvas can draw them without tainting, if the
  image is loaded with `crossOrigin = "anonymous"` (§5).
- The live gallery `GET /shelter/rozine-pedute/gallery` lists Judas, Raudvis, Zare and Simas in
  `atShelter` with status `WAITING`.
- The web build is a Node server; only `npm run build:app` sets `output: "export"`
  (`client/next.config.js:3,41`). `/yourcat` still ships in the app export, so it must not use
  `getServerSideProps` or API routes.
- `generateCat` picks a random edition and emote and casts the family unchecked
  (`backend/src/shared/utils/ai.utils.ts:148-243`). Its prompt begins "You will be shown an image of a
  cat" and always returns a family, so on its own it never says "no cat". `generateAvatarFromImage` makes
  painterly art, not pixel art, with up to 3 Gemini calls (`ai-avatar.ts:360-446`).
- `CAT_ORIGINS` (`shared/enums.ts:66`) syncs into `catnip-heist/`, so this bet adds no origin value.
- Re-checked in a second pass the same day: `assets/BLACK/base.png` and `assets/MAINE/base/GROOMING.gif`
  answer 200 with `access-control-allow-origin: *`; `assets/PEACHES/base.png` answers 403; the live gallery
  lists Judas, Raudvis, Simas and Zare in `atShelter` (all `WAITING`) and none of them in `adopted`.
- `getPortraitPriceCents` has four server callers: `StripePaymentService.portraitCheckoutAmountCents`
  (Checkout Session), the two PaymentIntent paths (`stripe-payment.service.ts:139,239`), the webhook check
  (`:299`) and `web3/order-catalogue.ts:35` (used by `POST /web3/confirm` through `web3.service.ts:96`, and
  by the offline audit `web3/order-audit.ts` + `backend/scripts/audit-orders.js`). The crypto checkout
  (`src/payments/crypto`) sells no portraits.
- `client/components/game/GameSelect.tsx:306` draws a starter that has a `starterBreed` with
  `starterLook(starterBreed)` (the Meet-your-cat art), not with its `catImg`. The only backend readers of
  `starterBreed` are `cat-name.service.ts` (lines 119, 313, 334, 384; 334 has a fallback name) and
  projections.
- Production runs without `TRUST_PROXY` (`docs/BACKEND.md` "Route and logic bugs"), so the global
  `AppThrottlerGuard` (keyed on `req.ips[0] || req.ip`) and every `@Throttle` limit are one bucket for
  the whole site.
- The backend has `firebase-admin` 11.4.1, whose `appCheck().verifyToken` has no `consume` option
  (replay protection needs a newer 11.x, §3.1).
- `POST /image/search` has no guard and pages through every `Image` with `url` and `aiUrl`
  (`image.controller.ts:145-150`). No client or CMS code calls it (only `search-params.spec.ts`).
- `pages/portrait.tsx` and `pages/portraits.tsx` have no `FirebaseAuthProvider` at all. App Check sends no
  token unless `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` is set (`client/context/auth/appCheck.ts:29`).
- There is no global exception filter: an `HttpException` body is exactly the object passed to it.

---

## 1. User flow, screen by screen

One page, `client/pages/yourcat.tsx`, wrapped in `FirebaseAuthProvider authMode="guest"`, so a first-time
visitor gets a silent anonymous identity. `MainLayout` comes from `_app.tsx`, so the consent banner and GTM
are present. Night sky: add `/yourcat` to `NIGHT_ROUTES`. Copy below is exact. `{Name}` is the record's
name when `named` is true (§2.1), otherwise "your cat" (sentence case at the start: "Your cat").

The fast path is **three taps**: "Choose a photo", pick the photo in the OS picker, "Share".

On page mount (not on the tap) the page calls `getAuthBridge().ensureGuestSession?.()` and fetches one
App Check limited-use token (§3.1), so the tap only sends the upload. A prefetched token older than
4 minutes, or already used, is replaced by a fresh one at the tap.

All motion uses `transform` and `opacity` (canvas drawing for the pixelate step in S3). Every animation has
a `prefers-reduced-motion: reduce` fallback: no movement, at most a 120 ms opacity fade, and GIFs replaced
by a still frame. Accessibility rules for all screens are in §1.6.

### 1.0 States before upload (from `GET /yourcat/status`, §2)

- Loading the status: show S1 with the upload button disabled and the label "Getting ready…".
- `enabled: false`: headline as S1, body "Making cats from photos is paused right now. Please come back
  later.", no upload control.
- `uploadsOpen: false` (budget spent): "We have made all the AI cats we can for today." plus the no-AI
  fallback (§1.5): "Pick your cat's look yourself" opens the family picker.
- The status is fetched again whenever the page becomes visible (`visibilitychange`), so a 30 s cached
  "open" never hides a spent budget for long; a stale "open" still ends at the server's 503 copy.
- App build (`isApp` from `@/models/app`): no upload and no prices (store rules, `docs/CLIENT.md:273-277`;
  App Check has no native token; the app privacy labels do not cover photo upload,
  `docs/MOBILE.md:182`). Body: "Making your cat from a photo works in your browser. Open
  tokentails.com/yourcat on your phone or computer." Plus a "Copy link" button.
- A returning visitor with a record (`GET /yourcat/me` returns one): go straight to S3 for that record
  (no reveal animation), with a secondary "Start over with a new photo" link. This also recovers a tab
  the phone killed during the wait: the server finishes the upload and `GET /yourcat/me` returns it.

### S1. Hero and upload

- Eyebrow (hud role): "TOKEN TAILS"
- H1 (title role): "Your cat, in the game."
- Body: "Upload one photo of your cat. You get a pixel cat you can play, a pixel portrait and a card to
  share. Free, no sign-up." Add "In about 30 seconds" only after the measured p75 of `secondsToReveal`
  (§7.1) is at or below 30 s; until then the copy names no duration.
- No name field here (the name is asked during the wait and on the reveal, S2 and S3).
- Upload control: a real `<button>` "Choose a photo" plus a drop zone (pattern of
  `client/features/portrait/components/UploadZone.tsx`, re-implemented in `components/yourcat/`, not
  imported). `<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif">`,
  **no `capture` attribute** (the native apps have no camera permission). Drop hint (desktop only):
  "or drop it here".
- Confirmation line directly under the button (caption role): "By choosing a photo you confirm it is your
  cat and you may use it." No checkbox: the legal basis is the service the visitor asks for (Art. 6(1)(b)),
  not consent. The client always sends `consent=true`; the server records `consentAt` and
  `privacyNoticeVersion` (§2.5).
- Privacy line under it (caption role, links to S1-P): "We use your photo only to make your cat. We keep
  it privately for 30 days, then delete it. How we handle photos"
- Client-side preparation before any request:
  1. Type: accepted when `file.type` is in the list above, **or** when `file.type` is empty and the name
     ends in `.heic`/`.heif` (Android and Windows often report HEIC that way; the server's byte check
     decides). Otherwise: "Please use a JPEG, PNG, WebP or HEIC photo."
  2. Shrink: when the browser can decode the file (`createImageBitmap(file, { imageOrientation: 'from-image' })`
     succeeds; Safari also decodes HEIC), draw it on a canvas at most 1600 px on the long edge and send
     `canvas.toBlob('image/jpeg', 0.88)` as `photo.jpg`. This cuts upload time on 4G and drops EXIF
     before upload; the server still strips it (§2.6). When decoding fails, send the original file.
  3. Size: the file actually sent must be ≤ 10 MB, else "That photo is over 10 MB. Please choose a
     smaller one." A file over 40 MB is refused before decoding with the same message.
- Motion: the H1 and body fade up 8 px over 240 ms ease-out, 60 ms stagger. Reduced motion: no
  movement.

### S1-P. "How we handle photos" (inline expandable panel, also the content of `docs/YOURCAT.md` §Privacy)

Title: "How we handle your photo". `privacyNoticeVersion` = `"2026-10-11"` (a constant in
`components/yourcat/copy.ts`, sent with the upload; bump it whenever this text changes).

- "Who is responsible: {Controller}, tokentails.com. Contact: info@tokentails.com." (`{Controller}` is
  the operator's legal name and address; a launch condition, §10.)
- "What we do with it: we make your pixel cat, its pixel portrait and your share card. If you buy the
  HD portrait, we also paint that from the same photo."
- "Who processes it for us: OpenAI (to check the photo shows a cat and match it to a pixel family),
  Google Gemini (to draw the pixel portrait and, if you buy it, the HD portrait), DigitalOcean in
  Frankfurt (storage) and Stripe (payments)."
- "Transfers outside the EU: OpenAI and Google process the photo in the United States, under the EU
  Standard Contractual Clauses (and the EU–US Data Privacy Framework where the provider is certified).
  They may keep what we send for up to 30 days to detect abuse, then delete it. Neither uses it to
  train its models."
- "How long we keep it: our copy of the original photo is stored privately and deleted after 30 days
  (or once a portrait you bought is delivered, if that is later). The pixel portrait stays with your
  cat until you delete it; after you delete it, copies cached by our image network can still load for
  up to an hour. We strip location and camera data from the photo."
- "Why we may do this: to give you the service you asked for (GDPR Art. 6(1)(b))."
- "Your rights: you can ask to see your data, have it deleted, or object to its use. Use “Delete my
  photo” below your cat, or write to info@tokentails.com. You can also complain to the Lithuanian data
  protection authority (VDAI, vdai.lrv.lt)."
- "Please only upload photos of your own cat, and no people. Photos with people are refused."

The sentence "Neither uses it to train its models" is true only on billed API plans; a billed Gemini key
is therefore a launch condition (§10), not a copy option.

### S2. Working (after a valid file is chosen)

Left (or top on phones): the visitor's own photo (the object URL already in memory) in a frame, with a
slow scan line (a 2 px `GOLD[400]` line moving top to bottom over 1600 ms, repeating, `transform` only).
Reduced motion: the photo, no line.

Checklist (an `aria-live="polite"` region; each step with a state dot):

1. "Uploading your photo…" → done when the request body is sent.
2. "Matching {Name} to a pixel cat family…" → done when `POST /yourcat` returns (about 5–10 s).

When `POST /yourcat` returns 201, go to S3 at once. The pixel portrait is drawn after that (S3).

Name field during the wait (the visitor has nothing else to do): label "What is your cat's name?",
placeholder "Mochi", max 20 characters, optional. The value is kept on the client; when the record exists
the client sends it with `PATCH /yourcat/:id` (§2.2). A name the server refuses shows its message under
the field on S3.

Sub-line: "You can leave and come back; your cat will be here." While the tab is hidden nothing is
polled; on `visibilitychange` to visible the page resumes (a pending `POST` keeps running in the browser;
if the tab was killed, the next load recovers the record from `GET /yourcat/me`, §1.0).

Motion: each step dot fills over 200 ms. Reduced motion: dots switch state with no transition.

Errors on this screen (map from the `code` in the error body, §2.1; every error is rendered in a
`role="alert"` element):

| Code | Copy | Action |
|---|---|---|
| `YOURCAT_IP_DAILY_CAP`, `YOURCAT_USER_DAILY_CAP`, `YOURCAT_FAILURE_DAILY_CAP` | "You have made all your AI cats for today." | "Pick your cat's look yourself" (§1.5) |
| `YOURCAT_BUDGET_EXHAUSTED` | "We have made all the AI cats we can for today." | "Pick your cat's look yourself" (§1.5) |
| `YOURCAT_DISABLED` | "Making cats from photos is paused right now. Please come back later." | none |
| `YOURCAT_NO_CAT` | "We could not see a cat in that photo. Try one where your cat fills most of the picture." | "Try another photo" (this attempt does not count), "Pick your cat's look yourself" |
| `YOURCAT_PERSON_VISIBLE` | "We only use photos of cats with no people in them. Please choose a photo of just your cat." | "Try another photo" (does not count) |
| `YOURCAT_CLASSIFY_FAILED` | "We could not read that photo just now. Please try again." | "Try again" (does not count), "Pick your cat's look yourself" |
| `YOURCAT_FILE_TOO_LARGE` / `_FILE_TYPE` / `_NOT_DECODABLE` / `_FILE_REQUIRED` | the S1 file messages; for not decodable: "We could not open that photo. Please try another one." | back to S1 |
| `YOURCAT_APP_CHECK_REQUIRED` / `_INVALID` | "We could not check your browser. Please reload the page and try again." | "Reload" |
| `YOURCAT_CONSENT_REQUIRED` | "Please reload the page and try again." (the client always sends it; this means an old page) | "Reload" |
| `YOURCAT_NO_CLIENT_IP` | "Making cats from photos is paused right now. Please come back later." | none |
| HTTP 429 with no `code` (a burst limit) | "Too many tries at once. Please wait a moment and try again." | "Try again" (enabled after 10 s) |
| network / 5xx | "Something went wrong on our side. Please try again." | "Try again" |

### S3. Reveal and share (one screen)

- H1: "Meet {Name}." (receives focus when the screen appears, §1.6)
- **Reveal** (first time only, not for a returning visitor): the visitor's photo is pixelated in steps on a
  canvas (block size 32 → 16 → 8 px, about 200 ms each, nearest-neighbour), then cross-fades over 200 ms
  into the pixel portrait if it is ready, else into the playable sprite (frame 0 of `cat.spriteImg` at 8x);
  then the result lands in its gold frame with scale 0.96 → 1.0 → 1 (ease-out back, overshoot ≤ 1.04,
  240 ms). Reduced motion: the photo cross-fades to the result in 120 ms, nothing moves.
- **Pixel portrait still drawing** (`avatar.status: "pending"`): a caption under the frame, in the
  `aria-live` region: "Drawing {Name}'s pixel portrait…". Poll `GET /yourcat/:id` at 1.5 s, 1.5 s, 1.5 s,
  1.5 s, then 2.5 s, then every 4 s; stop as soon as `avatar.status` is `ready` or `failed`, or at
  `createdAt + 60 s` (the server reads a record still pending then as `failed`, §2.3). Polling pauses
  while the tab is hidden and resumes on `visibilitychange`. When the portrait arrives: it replaces the
  sprite in the frame with its own small reveal (the same pixelate-in from 16 px over 300 ms; reduced
  motion: 120 ms fade), and the share card is re-rendered (§5.3). When it fails: the caption becomes
  "The pixel portrait did not work this time. Your card uses {Name}'s game look." and nothing else
  changes.
- **Playable cat**: the `cat.catImg` GIF (`.../assets/<FAMILY>/base/GROOMING.gif`) at 4x,
  `image-rendering: pixelated`, beside the frame. It plays for 5 s, then shows the still frame (frame 0 of
  `cat.spriteImg` as a CSS `background-image` of the sheet, `background-size: 1440px 960px` for 2x,
  `background-position: 0 0`, pixelated); tapping the cat plays it for 5 s again (WCAG 2.2.2). Reduced
  motion: the still frame only.
- Line: "We matched {Name} to our {Family} cat family. {Name} is now your cat in Token Tails."
  (`{Family}` is `familyLabel` from the API, §2.)
- Name field "Name for the card", prefilled with the name (empty when `named` is false), max 20. Edits
  re-render the card on the client (debounced 300 ms) and are saved with `PATCH /yourcat/:id` on blur or
  Enter. A refused name shows the server message under the field (linked by `aria-describedby`) and the
  card keeps the last accepted name.
- **Card preview** (§5) as a real `<img>` of the current PNG blob (object URL), scaled to fit, with alt
  text "Share card: {Name}, a {Family} pixel cat, tokentails.com/yourcat".
  - Format: a radio group "Story 9:16" (default on phones) / "Post 4:5" (default on desktop).
  - Shelter: a switch (`role="switch"`, `aria-checked`) "With {ShelterCat} from Pink Paw", on by default,
    shown only when the selection rule (§5.4) returns a cat. When no cat qualifies the switch is absent and
    the card has no panel.
- **Buttons**, in this order:
  - Primary "Share" (shown when `navigator.canShare({ files: [file] })` is true for the current file): Web
    Share with the PNG file.
  - "Download" (always, except in in-app browsers, §5.6): saves `tokentails-{slug(name)}-{story|post}.png`.
    Toast: "Card saved."
  - "Copy link": copies the share text (§5.5). Toast: "Link copied."
  - Secondary "Play as {Name}" → `/game` (onboarding is already done server-side, so Meet your cat does
    not open; §4).
  - While the current variant's blob is not ready, "Share" and "Download" are disabled and read
    "Preparing card…".
- In an in-app browser (§5.6): no "Share"/"Download"; the card `<img>` is shown large with "Press and hold
  the card to save it." and the hint "For more ways to share, open this page in your browser."
- Share text (Web Share `text`, and the clipboard text): "Meet {Name}, now a pixel cat in Token Tails.
  Make yours free: {shareUrl}"
- Guest note (only when the profile is a guest), caption role: "{Name} lives on this browser for now.
  Create an account to keep {Name} for good. Signing in to an account you already had does not bring
  {Name} along yet." Link "Create an account" → the AuthSheet (`requireAccount("save-progress")`).
- Small link: "Delete my photo" → confirm dialog (focus trapped, focus returns to the link afterwards):
  "Delete the photo and the pixel portrait? {Name} stays in the game with the {Family} look." When a paid
  portrait is still being painted, add: "Your HD portrait is still being painted. We delete the photo as
  soon as it is delivered." Buttons "Delete" / "Keep". On success toast: "Deleted."
- Motion: switching format cross-fades the preview over 180 ms. Reduced motion: instant swap.

### S4. (merged into S3)

The former separate share screen is part of S3, so sharing needs no extra tap.

### S5. HD portrait upsell (web only; hidden when `portrait.enabled` is false, `isApp`, or `photo.stored` is false)

Placed **below** the S3 block, after a visible gap (at least 96 px and a divider) and below the first
viewport on phones (the S3 block has `min-height: 100svh`). Never above or beside the Share button, and
**never** in the same block as the Pink Paw panel or any shelter word.

- H2: "Want a painted HD portrait of {Name}?"
- Body: "A 4K painted portrait made from the same photo, in the style you pick. {price}, paid once. We
  paint it after you pay; the pictures below show each style. You see it on this page when it is ready,
  and we email it to you. If it does not look like {Name}, reply to the email and we will redo it once."
- Style picker: B's own list of the four styles in `components/yourcat/copy.ts` (`highness`, `monarch`,
  `aristocrat`, `commander`, typed with the `PortraitStyle` enum from `StylePickerDrawer`), each with its
  existing example image `/portrait/{style}-1.webp` (all four exist). A radio group.
- Button: "Get the HD portrait for {price}". `{price}` comes from `GET /yourcat/status` `portrait.priceCents`
  and `currency`, formatted with `Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: 0 })`
  → "€14". Never hard-code the number in the client.
- Fine print: "Card payment by Stripe. Digital download, no shipping. Because we start painting right
  after you pay, you will be asked to agree that the 14-day right of withdrawal ends once the portrait is
  delivered." VAT is not mentioned (§10).
- After the tap: `POST /yourcat/:id/portrait-checkout` → `window.location.assign(checkoutUrl)`. Button
  shows "Opening checkout…" while waiting. Stripe Checkout asks for the withdrawal acknowledgement (§6.5).
- Error `YOURCAT_PHOTO_EXPIRED`: "Your original photo was deleted after 30 days. Upload it again to
  order a portrait."
- Error `YOURCAT_PORTRAIT_EXISTS`: "You already bought this portrait." and the S6 state of that order.
- Return with `?checkout=cancelled`: no message, S3 and S5 as before.

### S6. Paid return (`/yourcat?yc=<id>&paid=1`)

Poll `GET /yourcat/:id` every 4 s (paused while hidden), up to 10 min.

- `portrait.status: "pending_payment"`: "Confirming your payment…"
- `"painting"`: H2 "Payment received. We are painting {Name}." Body "This takes 1 to 2 minutes. We also
  email the portrait to you." Motion: a drawn pixel paw (not an emoji) pulses scale 1 → 1.08 → 1 over
  1200 ms. Reduced motion: none.
- `"ready"`: H2 "Here is {Name}." The portrait image, a "Download" button (direct link to
  `portrait.url`, `download` attribute) and "Back to {Name}'s card".
- `"failed"`, or still painting after 10 min: "This is taking longer than usual. We will email the
  portrait to you as soon as it is ready, at the latest within 2 working days."

### 1.5 No-AI fallback: "Pick your cat's look yourself"

Offered on the daily caps, the spent budget, `NO_CAT` and `CLASSIFY_FAILED`. A grid of the families from
`GET /yourcat/status` `families` (frame 0 of each `spriteImg` at 2x, the label under it; a radio group),
the name field, and "Make my cat". Calls `POST /yourcat/manual { family, name? }` (§2.2): no photo, no AI,
no cost. The result is S3 with the sprite in the frame (`avatar.status: "none"`, no reveal from a photo,
no S5). The card works the same way.

### 1.6 Accessibility (all screens)

- Focus moves to each new screen's heading (`tabIndex={-1}`) when the screen changes.
- Errors: `role="alert"`; a field error is linked to its field with `aria-describedby`.
- Progress and late portrait status: one `aria-live="polite"` region. Toasts render in a polite live region.
- The delete dialog traps focus and returns it to "Delete my photo" when closed.
- No looping animation runs for more than 5 s without a way to stop it (the GIF rule in S3; the paw pulse
  on S6 stops when the status changes and is absent under reduced motion).
- Format and family pickers are radio groups; the shelter toggle is a switch with `aria-checked`.
- Every tap target is at least 44 × 44 px; the drop zone is a real `<button>`.
- `INK.lilac` caption text on `NIGHT[800]` and `NIGHT[900]` is checked with `node scripts/check-palette.mjs`;
  if it fails AA, captions use `INK.cream`.

### Honesty rules for every string above (enforced by a test, §9 B)

- No copy says or implies a share of sales, a donation, "you donated", "every purchase feeds/helps",
  "% goes to", "supports the shelter" or "proceeds". The Pink Paw panel says only that the visitor's cat
  meets a named cat from Pink Paw; the cat is picked from live data when the card is drawn, and the card
  carries no status line that could go stale.
- No counts of users, cats, portraits, ratings or reviews.
- No countdowns, no strike-through prices, no "limited time".
- The duration "about 30 seconds" appears only after it is measured (S1).
- Copy passes `node tools/copy-lint/bin/copy-lint.mjs` (R1–R12, `docs/CLAIMS.md:206-272`).

---

## 2. API contract

All new routes live in a new `YourcatController` (`@Controller('yourcat')`), registered in the single
`AppModule` with its schemas and providers (§8 A). All auth uses `AppAuthGuard` (the lowercase `accesstoken`
header, `fb`-prefixed Firebase tokens). A guest-callable route carries `@AllowGuest()` **and** a matching
`GUEST_ALLOW_LIST` entry (`guard-migration.spec.ts` enforces parity).

### 2.1 Shared contract types

Backend file `backend/src/yourcat/yourcat.contracts.ts`; the client copy is `client/models/yourcat.ts`
(B writes it by hand from this block; both must stay equal; pinned by a client test that reads the backend
file, the same way `pack-prices.test.tsx` reads `price-table.ts`).

```ts
export type YourcatAvatarStatus = 'pending' | 'ready' | 'failed' | 'none'; // 'none': manual cat, no photo
export type YourcatPortraitStatus = 'none' | 'pending_payment' | 'painting' | 'ready' | 'failed';
export type YourcatPortraitStyle = 'highness' | 'monarch' | 'aristocrat' | 'commander'; // = ImageStyle values

export interface YourcatFamilyOption { family: string; label: string; spriteImg: string }

export interface YourcatStatusView {
    enabled: boolean;                 // YOURCAT_ENABLED
    uploadsOpen: boolean;             // enabled && today's budget has room for one upload estimate
    appCheckEnforced: boolean;        // AI_UPLOAD_APPCHECK_ENFORCE
    limits: { maxBytes: number; types: string[] }; // 10485760; ['image/jpeg','image/png','image/webp','image/heic','image/heif']
    families: YourcatFamilyOption[];  // the 21 PLAYABLE_FAMILIES (§4.2), for the manual picker
    portrait: {
        enabled: boolean;             // YOURCAT_PORTRAIT_ENABLED
        priceCents: number;           // getPortraitCheckoutPrice('digital').cents (1400)
        currency: 'EUR';
        styles: YourcatPortraitStyle[];
    };
}

export interface YourcatCatView {
    _id: string;
    name: string;
    type: string;          // CatAbilityType value
    spriteImg: string;     // https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/<FAMILY>/base.png
    catImg: string;        // .../assets/<FAMILY>/base/GROOMING.gif
}

export interface YourcatView {
    id: string;
    name: string;          // "My cat" when the visitor gave none
    named: boolean;        // false while the visitor has not named the cat; the client then says "your cat"
    family: string;        // CatOriginType key, never PEACHES
    familyLabel: string;   // e.g. 'Ginger' (§4.2)
    cat: YourcatCatView;
    avatar: { status: YourcatAvatarStatus; url: string | null }; // public CDN PNG, 768x768
    photo: { stored: boolean; deleteAfter: string | null };      // ISO date; never a URL
    portrait: { status: YourcatPortraitStatus; style: YourcatPortraitStyle | null; url: string | null };
    createdAt: string;
}

export interface YourcatCheckoutView { checkoutUrl: string; orderId: string }
export interface YourcatDeleteView { success: true; photoKeptUntilDelivery: boolean }

export const YOURCAT_ERROR_CODES = [
    'YOURCAT_DISABLED', 'YOURCAT_CONSENT_REQUIRED', 'YOURCAT_FILE_REQUIRED', 'YOURCAT_FILE_TOO_LARGE',
    'YOURCAT_FILE_TYPE', 'YOURCAT_NOT_DECODABLE', 'YOURCAT_NAME_INVALID', 'YOURCAT_IP_DAILY_CAP',
    'YOURCAT_USER_DAILY_CAP', 'YOURCAT_FAILURE_DAILY_CAP', 'YOURCAT_BUDGET_EXHAUSTED',
    'YOURCAT_APP_CHECK_REQUIRED', 'YOURCAT_APP_CHECK_INVALID', 'YOURCAT_NO_CLIENT_IP',
    'YOURCAT_NO_CAT', 'YOURCAT_PERSON_VISIBLE', 'YOURCAT_CLASSIFY_FAILED', 'YOURCAT_FAMILY_INVALID',
    'YOURCAT_NOT_FOUND', 'YOURCAT_PHOTO_EXPIRED', 'YOURCAT_PORTRAIT_DISABLED', 'YOURCAT_PORTRAIT_EXISTS',
] as const;
export type YourcatErrorCode = typeof YOURCAT_ERROR_CODES[number];
```

These codes are local to `/yourcat` and `/image/portrait` on purpose: `shared/errors.ts` syncs into
`catnip-heist/`. Error bodies are `{ statusCode, code, message }`, thrown as
`new HttpException({ statusCode: status, code, message }, status)` (there is no global exception filter,
so `statusCode` must be in the object). The client reads `body.code` itself (the shared `errorCodeOf`
only knows the shared vocabulary). A 429 from a throttler guard has no `code`; the client maps it to the
burst copy (S2).

### 2.2 New endpoints

Throttling on every `/yourcat` route and on `POST /image/portrait` + regenerate: `@SkipThrottle()` for
the global `AppThrottlerGuard` (its bucket is site-wide without `TRUST_PROXY`), replaced by two per-caller
guards: `UserThrottlerGuard` (existing, per user, after `AppAuthGuard`) and a new `ClientIpThrottlerGuard`
(`backend/src/shared/guards/client-ip-throttler.guard.ts`, A: the `UserThrottlerGuard` pattern keyed on
`clientIp(req).key`, §3.1, with its own `@ClientIpThrottle({ limit, ttl })` metadata; no usable IP → the
bucket `'unknown'`, which the gate then refuses in production). Limits below are per minute.

| Method and path | Auth / guards | Per IP / per user | Body / query | Success | Errors |
|---|---|---|---|---|---|
| `GET /yourcat/status` | public; per-IP limit in the handler (`ClientIpThrottlerGuard.consume`, see the note below the table) | 30 / – | – | 200 `YourcatStatusView`; `Cache-Control: public, max-age=30` | – |
| `POST /yourcat` | `AppAuthGuard`, `@AllowGuest()`, both throttlers; `@UseFilters(PhotoUploadExceptionFilter)` | 10 / 5 | multipart: `file` (1 file), `consent` = `"true"`, `noticeVersion` (≤ 16 chars), `name?` (≤ 20, optional; the page sends none); headers `accesstoken`, `x-firebase-appcheck?` | 201 `YourcatView` (avatar usually `pending`) | 400 `CONSENT_REQUIRED` (also for a missing, empty or over-long `noticeVersion`), `FILE_REQUIRED`, `FILE_TYPE`, `NOT_DECODABLE`, `NAME_INVALID`; 413 `FILE_TOO_LARGE`; 401 `APP_CHECK_REQUIRED`/`_INVALID`; 422 `NO_CAT`, `PERSON_VISIBLE`; 429 `IP_DAILY_CAP`, `USER_DAILY_CAP`, `FAILURE_DAILY_CAP`; 503 `DISABLED`, `BUDGET_EXHAUSTED`, `NO_CLIENT_IP`; 502 `CLASSIFY_FAILED`; 428 `GUEST_SESSION_REQUIRED` (transient guest) |
| `POST /yourcat/manual` | `AppAuthGuard`, `@AllowGuest()`, both throttlers | 10 / 5 | JSON `{ family, name? }` | 201 `YourcatView` (`avatar.status: 'none'`, `photo.stored: false`) | 400 `FAMILY_INVALID`, `NAME_INVALID`; 429 `USER_DAILY_CAP` (`AI_MANUAL_USER_DAILY`, default 5); 503 `DISABLED` |
| `GET /yourcat/me` | `AppAuthGuard`, `@AllowGuest({ transient: true })`, both throttlers | 60 / 30 | – | 200 `{ item: YourcatView \| null }` (latest non-deleted record of the caller; transient guest → `null`) | – |
| `GET /yourcat/:id` | `AppAuthGuard`, `@AllowGuest()`, both throttlers | 120 / 60 | – | 200 `YourcatView` | 404 `NOT_FOUND` (also for another user's id) |
| `PATCH /yourcat/:id` | `AppAuthGuard`, `@AllowGuest()`, both throttlers | 20 / 10 | JSON `{ name }` | 200 `YourcatView` (sets `name`, `named: true`, and writes the game cat's name after `CatNameService.validName`, like `makePlayable`) | 400 `NAME_INVALID` (also after the naming window: "Rename your cat in the game."); 404 `NOT_FOUND` |
| `DELETE /yourcat/:id` | `AppAuthGuard`, `@AllowGuest()`, both throttlers | 10 / 10 | – | 200 `YourcatDeleteView` | 404 `NOT_FOUND` |
| `POST /yourcat/:id/portrait-checkout` | `AppAuthGuard`, `@AllowGuest()`, both throttlers; plus 10 a day per user, counted in the handler in MongoDB | 5 / 5 | JSON `{ style: YourcatPortraitStyle }` | 201 `YourcatCheckoutView` | 400 `STYLE_INVALID`; 404 `NOT_FOUND`; 410 `PHOTO_EXPIRED`; 409 `PORTRAIT_EXISTS` (a paid order already exists for this record); 503 `PORTRAIT_DISABLED` |
| `GET /yourcat/stats?days=14` | `AppAuthGuard`, `PermissionGuard(PERMISSION_LEVEL.ADMIN)` (5) | global throttle | `days` 1..60 | 200 `{ days: AiBudgetDayView[] }` (§3.3) | 403 |

As built (2026-10-11, reconciled with the code):

- `noticeVersion` is trimmed and must be 1 to 16 characters. A missing, empty or longer value answers
  400 `CONSENT_REQUIRED`, the same as a missing `consent`, because both mean the visitor did not confirm
  the notice that is on screen. The trimmed value is stored as `privacyNoticeVersion`.
- An unknown `style` on the portrait checkout answers 400 `YOURCAT_STYLE_INVALID` ("Pick one of the
  portrait styles."), a new code in `YOURCAT_ERROR_CODES` and in the client copy `client/models/yourcat.ts`
  (the S5 buttons only send the four styles, so the client shows its generic error for it).
- Two limits run in the handler, not as guards. `GET /yourcat/status` has no caller, and
  `guard-migration.spec.ts` requires every guard list to start with `AppAuthGuard`, so its per-IP limit
  is `ClientIpThrottlerGuard.consume(...)` called first thing in the handler. The checkout's per-user
  daily limit needs the caller that `AppAuthGuard` resolves and a second window that `@UserThrottle`
  cannot hold, so the handler claims it after the guards ran (`claimDailyCheckout`: an `aiquotas`
  counter per user and UTC day, 429 with `Retry-After` to UTC midnight); its 5-a-minute window is the
  ordinary `@UserThrottle`. Any new route-level limit that needs the user must also run after
  `AppAuthGuard`.
- In production `ClientIpThrottlerGuard` puts every address that is not proven (no origin secret, no
  trusted proxy) into one shared `untrusted` bucket per route, with 10 times the route limit (or the
  route's `untrustedLimit`), so forged `cf-connecting-ip` values cannot spread a burst limit.

`GUEST_ALLOW_LIST` additions (`backend/src/common/guards/guest-allow-list.ts`), each with a comment. The
file header (decision #9, "no … buy") also gets one line: "Exceptions: the portrait checkouts of bet #3
(`POST /yourcat/:id/portrait-checkout`), a card purchase of a digital portrait of the guest's own cat;
the founder decides it in docs/plans/yourcat-v2.md §10."

```ts
// Bet #3 /yourcat: a guest turns one photo into its own cat (capped per IP, per user and by the AI budget).
'POST /yourcat': {},
'POST /yourcat/manual': {},
'GET /yourcat/me': { transient: true },
'GET /yourcat/:id': {},
'PATCH /yourcat/:id': {},
'DELETE /yourcat/:id': {},
// Exception to decision #9 (no buying as a guest): a card purchase of the HD portrait of the guest's own
// cat. Stripe collects the email; see the file header and yourcat-v2.md §10.
'POST /yourcat/:id/portrait-checkout': {},
// The portrait preview is a paid generation: guests allowed, under the same caps (bet #3).
'POST /image/portrait': {},
// Regenerate: guests only for images they own (the handler checks `owner`), same caps.
'PUT /image/portrait/:id/regenerate': {},
```

Check the exact key spelling `guard-migration.spec.ts` derives for `@Post()` on `@Controller('yourcat')`
(expected `POST /yourcat`) before committing.

Route declaration order inside `YourcatController`: `@Get('status')`, `@Get('me')`, `@Get('stats')` and
`@Post('manual')` are declared **before** the `:id` routes, otherwise Express matches `me`, `status`,
`stats` and `manual` as an id. `:id` is validated with `Types.ObjectId.isValid` (invalid → 404
`NOT_FOUND`, never a cast error 500).

### 2.3 `POST /yourcat` processing order

1. `YOURCAT_ENABLED` false → 503 `DISABLED`.
2. Multer (`FileInterceptor('file', PHOTO_MULTER_OPTIONS)`): `limits: { fileSize: 10 MiB, files: 1, fields: 5, fieldSize: 1024 }`,
   `fileFilter` accepts the five MIME types above plus `application/octet-stream` and `''` (some browsers
   send HEIC that way; the byte sniff in step 5 decides) and otherwise calls back with a `PhotoTypeError`.
   Multer errors are thrown in the interceptor, before the handler runs, so the method-level
   `PhotoUploadExceptionFilter` (`backend/src/shared/photo-upload.filter.ts`, A) maps them:
   `PayloadTooLargeException` / `LIMIT_FILE_SIZE` → 413 `FILE_TOO_LARGE`; `PhotoTypeError` → 400
   `FILE_TYPE`; `LIMIT_FILE_COUNT` / `LIMIT_UNEXPECTED_FILE` / `LIMIT_FIELD_*` → 400 `FILE_REQUIRED`
   (message "Send exactly one photo."). Every other exception passes through unchanged. The same filter is
   applied to `POST /image/portrait`.
3. `consent !== 'true'` → 400 `CONSENT_REQUIRED`. Name: `CatNameService.validName(name)` when
   non-empty (→ `named: true`); when empty, store `"My cat"` with `named: false`. Name errors → 400
   `NAME_INVALID` with the name service message.
4. Gate admission (§3): client IP, App Check, per-IP and per-user daily quota, per-IP failure cap, budget
   reservation. Any refusal returns before the photo is processed; a refusal by a later layer releases
   what the earlier layers claimed (§3.2).
5. `sanitizePhoto(buffer)` (§2.6). Failures → 400 `FILE_TYPE` / `NOT_DECODABLE` or 413
   `FILE_TOO_LARGE`: the attempt quota is released, a failure is counted (§3.2), the reservation is
   cancelled (no AI was called).
6. Classify **in memory, before anything is stored**: `generateCat(name, dataUrl, { screen: true, onUsage, signal })`
   where `dataUrl` is `data:image/webp;base64,...` of the sanitized 1024 px image (OpenAI accepts data
   URLs; no public URL is needed), with a 20 s timeout through an `AbortController` (the request is
   aborted, not just ignored). Take only `screen`, `.origin` and `.type`; discard its `spriteImg`,
   `catImg`, edition, emote and story.
   - `screen.personVisible` → 422 `PERSON_VISIBLE`; `!screen.isCat` → 422 `NO_CAT`.
   - Null result, timeout, unparsable answer or `normaliseFamily(origin)` null → 502 `CLASSIFY_FAILED`.
   - In all these cases: the attempt quota is released, a failure is counted, and the ticket is
     **settled** with the measured cost (or the flat text fallback on a timeout or missing usage; §3.3),
     not cancelled. Nothing is stored.
7. Store the sanitized original **privately** (§2.7) at `yourcat/originals/<uuid>.webp`.
8. Make the cat playable (§4) and create the `YourCat` record (`avatarStatus: 'pending'`, `consentAt: now`,
   `privacyNoticeVersion: noticeVersion`).
9. Respond 201 with the view.
10. In the background (not awaited, own try/catch): `generatePixelAvatar(sanitizedBuffer, 'image/webp', { onUsage, signal })`
    (§4.3) with a 45 s `AbortController` timeout. A Gemini safety block, an empty result or a result
    without image data → `'failed'`; nothing is uploaded. Otherwise pixelate, upload the public PNG
    `yourcat/avatars/<uuid>.png` with `CacheControl: 'public, max-age=3600'`, set `avatarUrl`,
    `avatarStatus: 'ready'`. On error or timeout → `'failed'`. Then settle the budget ticket with the
    measured cost (the flat image fallback on a timeout, since the provider still bills; §3.3) against the
    ticket's own `day`, and run the cost alert check. If the process dies mid-way, `GET /yourcat/:id`
    reports `failed` for a record still `pending` 60 s after `createdAt`.

`POST /yourcat/manual` order: kill switch; `family` must be one of `PLAYABLE_FAMILIES` (else 400
`FAMILY_INVALID`); name as step 3; per-user quota of kind `manual` (no IP layer, no App Check, no budget);
`makePlayable` with a random `CatAbilityType`; record with `source: 'manual'`, `originalKey: null`,
`avatarStatus: 'none'`; 201.

`PATCH /yourcat/:id` is the card naming step, so it skips the game's rename cooldown
(`CatNameService.rename`, `CAT_RENAME_COOLDOWN_DAYS`) only inside a naming window: 24 h after the record's
`createdAt`, and only for the record's own cat. It does not set `nameChangedAt`. After the window it
answers 400 `NAME_INVALID` ("Rename your cat in the game."), and renames go through `PUT /cat/:id/name`
with its cooldown.

### 2.4 Changed endpoints (stream A unless marked C)

| Endpoint | Change |
|---|---|
| `POST /image/portrait` | Add `@UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)`, `@SkipThrottle()`, `@AllowGuest()` (+ allow-list entry), `@UseFilters(PhotoUploadExceptionFilter)`; per IP 10/min, per user 5/min. `FileInterceptor('file', PHOTO_MULTER_OPTIONS)`. `PORTRAIT_PREVIEW_ENABLED` false → 503 `YOURCAT_PORTRAIT_DISABLED`. Gate admission with kind `portrait-preview` (§3). Replace `uploadFileImage(file.buffer, getSlug(generateRandomNumber()))` with `sanitizePhoto` + `uploadFile('<uuid>.webp', …)` (public, as today, so the `/portrait` flow keeps working; the name is no longer guessable). Set `Image.owner = caller`, `Image.source = 'portrait'`. Pass `{ onUsage, signal }` to `generatePortraitForImage` and settle the ticket. Response shape unchanged (it still contains `aiUrl`; known issue, §10). |
| `PUT /image/portrait/:id/regenerate` | Guests allowed (allow-list entry + `@AllowGuest()`), same throttlers and gate (kind `portrait-preview`, per-user and per-IP quota, budget). If `image.owner` is set and is not the caller → 404. A guest may regenerate **only** images it owns; an image without `owner` (all legacy ones) is refused for guests (403 `GUEST_FORBIDDEN`, as today) and keeps today's behaviour for registered users; `docs/BACKEND.md:893` is updated to say so. Refuse `source: 'yourcat'` images (404): their portrait is generated only after payment. Refuse any image that has a `COMPLETE` order (409 `YOURCAT_PORTRAIT_EXISTS`): it is a delivered product and regenerating would replace it and spend €0.30 (noted under the existing known issue). |
| `GET /image/:id` | Filter `source: { $ne: 'yourcat' }`, so the private original marker and unpaid records never leak. |
| `POST /image/search` | Guard with `AppAuthGuard` + `PermissionGuard(PERMISSION_LEVEL.EDITOR)` (it listed every image, including preview photos and paid 4K portraits, to anyone), keep the `source` filter, and record it as a fixed known issue in `docs/BACKEND.md`. No client calls it; `search-params.spec.ts` renames its "(public)" case. |
| `POST /image` and `PUT /image/:id` | Strip `owner` and `source` from the body before writing (both routes), and `aiUrl` on `POST /image` (its `url` is already set by the upload). `PUT /image/:id` is editor-only and keeps `url`/`aiUrl` editable; `loadImageBytes` refuses private URLs on images that are not `source: 'yourcat'` (§2.7), so an edited URL cannot reach a private original. |
| `POST /image/create-checkout-session` and `-signed` | Session creation moves into a new provider `PortraitCheckoutService` (`backend/src/image/portrait-checkout.service.ts`, registered in `AppModule`) with `create({ productType, image, userId, email?, successUrl, cancelUrl, metadata })`, used by both image routes and by `POST /yourcat/:id/portrait-checkout`. Charge `getPortraitCheckoutPrice(productType)` (C, §6): `currency: 'eur'` on the line item **and** the shipping rate; `adaptive_pricing: { enabled: false }` (so the session stays in EUR); for `digital`, `consent_collection: { terms_of_service: 'required' }` with `custom_text.terms_of_service_acceptance.message` = "I want my portrait painted and delivered right away, and I understand that I lose my 14-day right of withdrawal once it is delivered." (§6.5); `expires_at` = now + 2 h. The order stores `price` (euros), `currencyType: CurrencyType.EUR`, `priceUsd: portraitPriceUsdForStats(cents)`. Both image routes refuse `source: 'yourcat'` images (404): those are bought only through `/yourcat`, because their delivery paints from the private original. `-signed` also refuses an image whose `owner` is set and is not the caller (404). The unsigned route cannot identify a caller and keeps accepting an arbitrary `userId`/`email` (known bug, §10). |
| `POST /image/webhook` | Populate `image` with `select: 'url aiUrl source name style'` (today `'url aiUrl'`, so a `source` branch could never fire). `checkPaidCheckoutSession(session, order)` (C) checks the order's own currency and stored price (§6.4). For an order whose image has `source: 'yourcat'`: skip `createBlessingWithCat` (the player already has their cat), call `PortraitDeliveryService.deliverInBackground(orderId)` (§6.5), and email after the portrait exists. Email recipient: the order user's email, else `session.customer_details.email`. Increment the day counters `portraitsPaid` (all IMAGE orders) and `yourcatPortraitsPaid`. Other orders: unchanged. |
| `sendOrderConfirmationEmail` | Moves from a module function in `image.controller.ts:49` to an exported module `backend/src/image/order-email.ts` (A): `sendOrderConfirmationEmail(email, aiUrl, options?: { subject?: string })`, default subject unchanged; `image.controller.ts` imports it. |
| `POST /web3/confirm`, PaymentIntent confirm (C, prices only) | New USD intents and orders are priced at 1600; payments created before the change still verify (§6.3, `PORTRAIT_USD_PRICE_CHANGED_AT`); no change in `web3.controller.ts` or `web3.service.ts`. |

### 2.5 Schemas (stream A)

`YourCat` (`backend/src/yourcat/yourcat.schema.ts`, collection `yourcats`):

```ts
{
  owner: ObjectId (ref User, indexed),
  source: 'photo' | 'manual',
  name: string,
  named: boolean,
  family: string,               // CatOriginType key
  cat: ObjectId (ref Cat),
  consentAt: Date | null,       // photo uploads: when the visitor confirmed the S1 statement
  privacyNoticeVersion: string | null, // S1-P version shown at upload
  originalKey: string | null,   // 'yourcat/originals/<uuid>.webp' (private); null once deleted
  originalSha256: string | null, // cleared when the original is deleted
  originalDeleteAfter: Date | null, // createdAt + 30 days (extended by §2.8 and §6.5)
  deleteOriginalAfterDelivery: boolean, // set by DELETE while a paid portrait is undelivered (§2.8)
  avatarKey: string | null,     // 'yourcat/avatars/<uuid>.png' (public)
  avatarUrl: string | null,
  avatarStatus: 'pending' | 'ready' | 'failed' | 'none',
  costMicroEur: number,         // measured, classifier + avatar
  portraitImage: ObjectId | null (ref Image), // ONE Image per record, reused by every checkout (§6.5)
  portraitAttempts: number,     // delivery attempts (§6.5)
  deletedAt: Date | null,
  createdAt, updatedAt
}
indexes: { owner: 1, createdAt: -1 }, { originalDeleteAfter: 1 }, { avatarStatus: 1, createdAt: 1 }
```

No IP, no IP hash and no photo URL on this record. There is no `portraitOrder` field: the portrait status
is resolved from the orders on `portraitImage` (§6.5), so a later checkout can never hide an earlier paid
one.

`Image` (`backend/src/image/image.schema.ts`), two optional fields: `owner?: ObjectId` (ref User, indexed)
and `source?: 'portrait' | 'yourcat'`. Existing documents keep neither.

`Cat`: no schema change. (§4 explains why no new `CAT_ORIGINS` value is added.)

`AiBudgetDay` and `AiQuota`: §3.

### 2.6 EXIF strip, size and type limits: `sanitizePhoto`

New `backend/src/shared/utils/photo-upload.ts`, modelled on `backend/src/impact/outcome-image.ts`
(do not import from `impact/`; copy the pattern):

```ts
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 1024;
export const PHOTO_MAX_INPUT_PIXELS = 40_000_000;
export const PHOTO_MULTER_OPTIONS: MulterOptions;
export class PhotoTypeError extends Error {}
export class PhotoError extends Error { constructor(readonly code: 'FILE_REQUIRED' | 'FILE_TOO_LARGE' | 'FILE_TYPE' | 'NOT_DECODABLE') }
export async function sanitizePhoto(input: Buffer): Promise<{ data: Buffer; width: number; height: number; sha256: string }>;
```

1. Empty → `FILE_REQUIRED`; over `PHOTO_MAX_BYTES` → `FILE_TOO_LARGE`.
2. HEIC/HEIF by magic bytes: read the image size from the `ispe` box (a small parser in this file; no
   `ispe` box → `NOT_DECODABLE`); `width * height > PHOTO_MAX_INPUT_PIXELS` → `FILE_TOO_LARGE`, **before**
   any conversion. Then `convertHeicToJpg` (export `isHeicImage` and `convertHeicToJpg` from
   `backend/src/shared/utils/image.utils.ts`; no behaviour change there) inside a 15 s `Promise.race`;
   its `BadRequestException`, any other error or the timeout → `NOT_DECODABLE`. (`heic-convert` is pure JS
   and blocks the event loop while it runs; the pixel check is what bounds that work, and the per-IP
   failure cap, §3.2, bounds how often.)
3. `sharp(buf, { limitInputPixels: PHOTO_MAX_INPUT_PIXELS, failOn: 'error' }).metadata()`: format must be
   `jpeg`, `png` or `webp`, `pages` must be 1 (no animations) → else `FILE_TYPE`; decode errors →
   `NOT_DECODABLE`. `metadata()` does not enforce `limitInputPixels`, so check
   `width * height > PHOTO_MAX_INPUT_PIXELS` explicitly → `FILE_TOO_LARGE`.
4. `.rotate()` (applies EXIF orientation), `.resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })`,
   `.webp({ quality: 85 })`. No `withMetadata`: the output has no EXIF, GPS, XMP or ICC name. A sharp
   error here → `NOT_DECODABLE`.
5. Return the bytes and `sha256`.

The controller maps `PhotoError.code` to the `YOURCAT_*` code and status of §2.2.

`uploadFileImage` itself is not changed (other callers rely on it). Its missing `.rotate()` stays a known
issue for the other upload paths (§10).

### 2.7 Storage

Extend `backend/src/shared/utils/aws.utils.ts` (A):

- `uploadPrivateObject(key, buffer, contentType)`: same client and bucket, `ACL: 'private'`.
- `getPrivateObject(key): Promise<{ data: Buffer; mimeType: string }>` (`GetObjectCommand`; `mimeType` from
  the object's `ContentType`).
- `deleteObject(key)` (`DeleteObjectCommand`).
- `PRIVATE_URL_PREFIX = 's3private://'`, `YOURCAT_ORIGINALS_PREFIX = 'yourcat/originals/'` and
  `loadImageBytes(url, options: { allowPrivate: boolean }): Promise<{ data: Buffer; mimeType: string }>`:
  an `s3private://<key>` URL is read through `getPrivateObject` only when `allowPrivate` is true **and**
  the key starts with `yourcat/originals/` (else it throws); any other URL through `fetch`, with
  `mimeType` from the response `content-type`. `generatePortraitForImage` switches from
  `fetch(image.url)` to `loadImageBytes(image.url, { allowPrivate: image.source === 'yourcat' })` and
  passes the returned `mimeType` to Gemini (no change for public URLs).

| Object | Key | ACL | Who reads it |
|---|---|---|---|
| Sanitized original | `yourcat/originals/<uuid>.webp` | private | the backend only (avatar as inline bytes, paid portrait via `loadImageBytes`; the classifier gets an in-memory data URL before it is stored) |
| Pixel avatar | `yourcat/avatars/<uuid>.png` | public-read, `max-age=3600` | the page, the share card, the game |
| Paid HD portrait | `<uuid>.webp` (as today, via `generatePortraitForImage`) | public-read | the buyer (page and email) |
| `/image/portrait` preview upload | `<uuid>.webp` | public-read (unchanged behaviour, new name) | `/portrait` |

### 2.8 Retention and deletion

- Original photo: deleted 30 days after upload (`originalDeleteAfter`). Creating a checkout sets
  `originalDeleteAfter = max(current, now + 3 days)` (sessions expire after 2 h, §2.4), so a session can
  never be paid after its photo is gone. A paid portrait not yet delivered keeps the original until
  delivery; delivery sets `originalDeleteAfter = now + 30 days` (the "redo once" window). A checkout started
  after deletion gets 410 `PHOTO_EXPIRED`.
- `DELETE /yourcat/:id`:
  - expires every open Checkout Session of the record's `portraitImage` (`stripe.checkout.sessions.expire`;
    a session that turns out to be complete is treated as a paid order below);
  - deletes the avatar object at once, sets `deletedAt`, clears `avatarKey`, `avatarUrl`;
  - deletes the original at once and clears `originalKey`, `originalSha256` — **unless** a `COMPLETE`
    order on the record is not yet delivered: then it sets `deleteOriginalAfterDelivery: true`, answers
    `photoKeptUntilDelivery: true`, and `PortraitDeliveryService` deletes the original right after the
    delivery (or after the third failed attempt). The dialog copy says so (S3).
  The game cat keeps the family sprite (a shared CDN sheet, not personal data) and its name.
- After `DELETE`, the record is no longer readable by design: `GET /yourcat/:id` answers 404
  `NOT_FOUND` and `GET /yourcat/me` skips it, also for its owner. A paid portrait still painting is
  delivered by email only; the client keeps showing its block without polling (YOURCAT.md, Flow 5).
- The avatar URL can stay in CDN caches for up to its `max-age` after deletion: 300 s since
  2026-10-11 (was 1 h). S1-P still says "up to an hour", which stays true.
- Owner gone (guest erased by `DELETE /user/guest`, the 30-day idle cleanup, or account deletion): the
  daily job deletes both objects and the record within 24 h (an undelivered paid portrait is delivered
  first, as above).
- Paid HD portrait: kept (it is the product). Deletion on request through info@tokentails.com.
- `AiQuota` docs: TTL 48 h. `AiBudgetDay` docs: kept 400 days (aggregate counts, no personal data).
- Logs: never the IP, the HMAC key or a photo URL; log the record id.

Job: `YourcatRetentionJob` (`@Cron('15 3 * * *')`, UTC), guarded by `backend/src/shared/jobs/lease.ts`
so one replica runs it.

---

## 3. Abuse and cost controls

### 3.1 Layers, in the order the gate checks them

`AiUploadGate.admit(req, user, kind)` in `backend/src/ai-budget/ai-upload-gate.ts`, used by
`POST /yourcat` (kind `yourcat`) and by `POST /image/portrait` and `PUT /image/portrait/:id/regenerate`
(kind `portrait-preview`). It returns a ticket `{ kind, day, reservationMicroEur, quotaKeys, failureKey }`
or throws. `POST /yourcat/manual` uses only the per-user quota (kind `manual`).

1. **Identity.** `AppAuthGuard`: a registered user, or a guest whose document exists (the client calls
   the guest session first, §1). Transient guests get 428 and never reach the AI.
2. **Client IP.** New `backend/src/shared/client-ip.ts` `clientIp(req, env): { ip: string; key: string; trusted: boolean } | null`.
   `cf-connecting-ip` is used **only when the request provably came through Cloudflare**:
   - (a) `CF_ORIGIN_SECRET` is set and the request carries a matching `x-tt-origin-auth` header (compared
     in constant time; a Cloudflare Transform Rule adds it to every proxied request), or
   - (b) `TRUST_PROXY` is set and `req.ip` (the hop in front of the DigitalOcean balancer) is inside
     Cloudflare's published ranges (`backend/src/shared/cloudflare-ips.ts`, the IPv4 and IPv6 lists from
     cloudflare.com/ips, with the date they were copied).
   Then `trusted: true`. Otherwise the address is `req.ip` (under `TRUST_PROXY`) with `trusted: true` only
   when `TRUST_PROXY` is set; the raw `cf-connecting-ip` without proof may still be used as the quota key
   with `trusted: false`. Each candidate is checked with `isUsableClientIp` (copy the logic of
   `guestTreatIp`, `shelter-onchain.controller.ts:321-345`, and `isUsableClientIp`
   (`backend/src/user/guest/ip-throttle.ts`); do not import from or edit the shelter module). No usable IP
   in production (`NODE_ENV === 'production'`) → 503 `NO_CLIENT_IP`; outside production `'dev'`.
   - Kind `yourcat`: an untrusted address in production → 503 `NO_CLIENT_IP` (a forged header would give
     unlimited per-IP quota). So (a) or (b) is a launch condition (§10).
   - Kind `portrait-preview`: an untrusted address is accepted and gets the unverified caps (today the
     route has no limit at all; the €3 preview sub-cap is the backstop). See "Your call".
3. **Captcha-equivalent: Firebase App Check with replay protection.** The client sends a **limited-use**
   token in `x-firebase-appcheck` (new `getLimitedUseAppCheckToken(app)` in
   `client/context/auth/appCheck.ts`, C, using `getLimitedUseToken`; reCAPTCHA Enterprise behind it). The
   gate verifies it with `verifyToken(token, { consume: true })` and refuses a token whose
   `alreadyConsumed` is true, so one real token cannot be replayed by a script. This needs a
   `firebase-admin` 11.x release that supports `consume` (11.4.1 today; A bumps it within `^11` and checks
   the changelog). Extract the verification into `backend/src/user/guest/app-check.ts`
   `verifyAppCheckToken(firebase, token, { enforce, consume })` returning
   `'verified' | 'missing' | 'invalid' | 'replayed'`, add a consuming variant to the identity adapter in
   `firebase-identity.ts`, and make `UserController.verifyAppCheck` call the helper with `consume: false`
   (behaviour of `POST /user/guest/session` unchanged).
   - `AI_UPLOAD_APPCHECK_ENFORCE=true` (yourcat) / `AI_PREVIEW_APPCHECK_ENFORCE=true` (previews): `missing`
     → 401 `APP_CHECK_REQUIRED`, `invalid` or `replayed` → 401 `APP_CHECK_INVALID`.
   - Otherwise: `verified` gets the normal per-IP cap; `missing`, `invalid` or `replayed` gets the lower
     "unverified" cap (default 0 for `yourcat`, 1 for previews).
   - For `yourcat`, `AI_UPLOAD_APPCHECK_ENFORCE=true` is a launch condition (§10).
   Why not Turnstile: no new vendor or script, the client already loads App Check, and the server already
   verifies it. See "Your call" (§10).
4. **Per-IP daily quota** (Mongo, survives restarts and replicas). Key
   `HMAC-SHA256(AI_UPLOAD_IP_SALT, "<UTC day>|<ip>")`, first 32 hex chars, as in `treat-guest-key.ts`
   (no raw IP stored). Salt fallback: `INVALIDATE_CACHE_SECRET`; neither set in production → 503
   `NO_CLIENT_IP` (misconfigured, refuse rather than run uncapped).
5. **Per-IP failure cap** (read only here): when today's failure count for the IP key is at
   `AI_UPLOAD_IP_FAILURES_DAILY` (default 5) → 429 `FAILURE_DAILY_CAP`. Failures are counted in §3.2 and
   never released.
6. **Per-user daily quota**, keyed on the user id.
7. **Global daily budget** reservation (§3.3).

If any layer throws after an earlier layer claimed a quota slot, `admit` releases every slot it claimed
in this call before rethrowing, so an honest visitor never loses an attempt to a later refusal.

Defaults (env names in §3.5):

| Kind | Per IP, App Check verified | Per IP, unverified | Failures per IP | Per user | Budget reservation |
|---|---|---|---|---|---|
| `yourcat` | 3 / UTC day | 0 | 5 | 3 / UTC day | €0.08 |
| `portrait-preview` (POST and regenerate share it) | 3 | 1 | 5 | 3 | €0.30 |
| `manual` (no AI) | – | – | – | 5 | – |
| `portrait-checkout` (no AI; Stripe spam) | – | – | – | 10 (`@UserThrottle`) | – |

Paid deliveries (§6.5) are not gated: the customer has paid. Their spend is recorded.

Burst limits are the per-user and per-client-IP throttler guards of §2.2 (in memory, per replica). The
Mongo quotas are the real daily limits; the budget is the backstop.

### 3.2 Quota store

`AiQuota` (`backend/src/ai-budget/ai-budget.schema.ts`, collection `aiquotas`):
`{ _id: '<kind>:<ip|user|fail>:<key>:<day>', day, count, expiresAt }`, TTL index on `expiresAt` (48 h).

Claim, atomic (the `claimSlot` pattern of `backend/src/shelter/onchain/shelter-donate.service.ts:690-707`,
copied, not imported):

```ts
findOneAndUpdate({ _id, count: { $not: { $gte: limit } } }, { $inc: { count: 1 }, $setOnInsert: { day, expiresAt } }, { upsert: true, new: true })
// E11000: either the doc exists with count >= limit (over the cap), or two first claims raced.
// Retry the same call once; a second E11000 means over the cap.
```

A limit of 0 is checked in code before the call (refuse without writing).

- `release(ticket)` decrements each claimed attempt key once (`$inc: -1` with `count: { $gt: 0 }`), used
  for `FILE_TYPE`, `NOT_DECODABLE`, `FILE_TOO_LARGE` (from `sanitizePhoto`), `NO_CAT`, `PERSON_VISIBLE` and
  `CLASSIFY_FAILED`, so a visitor is not charged an attempt for a photo we could not use.
- `recordFailure(ticket)` increments the IP failure key (`fail`) by one with no limit check; it is never
  released. Called for the same outcomes. This stops one IP from sending endless non-cat photos (a paid
  OpenAI call each) or decompression bombs.

### 3.3 Global daily budget and cost accounting

`AiBudgetDay` (collection `aibudgetdays`, unique index on `day`, UTC `YYYY-MM-DD`):

```ts
{
  day: string,
  capMicroEur: number,                 // AI_BUDGET_EUR_PER_DAY * 1e6 at first write of the day
  committedMicroEur: number,           // reservations + settled differences
  previewCommittedMicroEur: number,    // the portrait-preview part of committedMicroEur (sub-cap)
  spentMicroEur: number,               // measured
  counts: {
    yourcatAdmitted, yourcatDone, yourcatFailed, yourcatRefusedNoCat, yourcatRefusedPerson,
    manualCats, avatarsReady, avatarsFailed, previewsAdmitted, previewsDone, portraitCheckouts,
    portraitsPaid, yourcatPortraitsPaid, portraitsDelivered, portraitsDeliveryFailed, costAlerts
  },
  alerts: { perUploadSentAt?: Date, perPreviewSentAt?: Date, budget80SentAt?: Date, budget100SentAt?: Date, deliveryFailedSentAt?: Date }
}
```

Counter map per kind (one constant, `KIND_COUNTERS` in `ai-budget.service.ts`, no string building):

| Kind | admitted | done | failed |
|---|---|---|---|
| `yourcat` | `yourcatAdmitted` | `yourcatDone` | `yourcatFailed` |
| `portrait-preview` | `previewsAdmitted` | `previewsDone` | – |
| `manual` | `manualCats` | – | – |

- **Check in code first**: `est > cap` (or, for previews, `est > previewCap`) → 503 `BUDGET_EXHAUSTED`
  without writing. On the first request of a day there is no document, so the filter below cannot apply;
  this check makes a cap of 0 (or below one estimate) refuse anyway.
- **Reserve** (in `admit`): `findOneAndUpdate({ day, committedMicroEur: { $not: { $gt: cap - est } } }, { $inc: { committedMicroEur: est, [KIND_COUNTERS[kind].admitted]: 1 }, $setOnInsert: { capMicroEur: cap } }, { upsert: true })`.
  `$not: { $gt }` (the `lease.ts` pattern) also matches a document where the field is missing, so a day
  document created by another kind, a paid delivery or an alert update never blocks a reservation.
  E11000 → retry once (two first-of-day upserts can race); a second E11000 → 503 `BUDGET_EXHAUSTED`.
- **Preview sub-cap.** 4K previews (€0.30 each) could eat the whole day before any `/yourcat` upload.
  For kind `portrait-preview` the same filter also has `previewCommittedMicroEur: { $not: { $gt: previewCap - est } }`
  and the same update `$inc`s it, where `previewCap` = `AI_BUDGET_PREVIEW_EUR_PER_DAY` (default 3, never
  above the global cap). So at least €2 a day stays for `/yourcat`. Settle and cancel adjust both fields
  for previews.
- **Settle** (after the AI calls, also after a classify failure or timeout): `$inc: { committedMicroEur: actual - est, spentMicroEur: actual }`
  on the ticket's own `day` (an avatar that finishes after 00:00 UTC settles the day it was reserved on).
- **Cancel** (refused before any AI call): `$inc: { committedMicroEur: -est }` on the ticket's `day`.
- **Paid delivery**: `$inc` both fields by the actual cost with no cap check.

Cost measurement, `backend/src/ai-budget/ai-cost.ts` (A) owns the one usage type:

```ts
export interface AiUsage {
  provider: 'openai' | 'gemini';
  model: string;
  inputTokens: number;
  outputTokens: number;          // text output tokens
  images: number;                // generated images (0 for the classifier)
  imageSize: '1K' | '2K' | '4K' | null;
}
export type OnAiUsage = (usage: AiUsage) => void;
export interface AiCallOptions { onUsage?: OnAiUsage; signal?: AbortSignal }
export function costMicroEur(usage: AiUsage): number;
export function fallbackCostMicroEur(kind: 'text' | 'image', imageSize?: AiUsage['imageSize']): number;
```

- `generateCat(name, url, options?: AiCallOptions & { screen?: boolean })` (`ai.utils.ts`, A): a new
  optional third parameter. `onUsage` reads `response.usage` (`prompt_tokens`, `completion_tokens`);
  `signal` is passed to the OpenAI request options. With `screen: true` the prompt starts with a check
  step and the answer format becomes `Person: [yes|no]. Cat type: [type|NONE]. Story: [story].` ("If no
  real cat is clearly visible, answer Cat type: NONE. If any person, face or body part of a person is
  visible, answer Person: yes."), and the result carries `screen: { isCat: boolean; personVisible: boolean }`
  (with `NONE` it returns the screen result only). An answer that does not parse fails closed (null).
  Existing callers pass nothing; prompt and behaviour unchanged for them.
- `generatePixelAvatar(image: Buffer, mimeType: string, options?: AiCallOptions)` (§4.3) and
  `generatePortraitForImage(imageId, repo, style, options?: AiCallOptions)`: read `result.usageMetadata`
  (`promptTokenCount`, `candidatesTokenCount`) and count the returned images with their size; pass
  `signal` as the request's `abortSignal`.
- `costMicroEur(usage)`: text tokens × the token rates, plus `images ×` the per-image price for the size
  (`AI_COST_GEMINI_IMAGE_EUR_1K`, `_2K`, `_4K`; Google prices image output per image by resolution, so
  one output token rate would under-count). Rates are env-overridable constants; the implementer fills the
  defaults from the official OpenAI and Google pricing pages on the day of the build and writes that date
  in a comment. When a response has no usage data, or the call timed out or was aborted (the provider
  still bills), charge the flat fallback (`AI_COST_FALLBACK_IMAGE_EUR` default 0.08 for 1K, ×4 for 4K;
  `AI_COST_FALLBACK_TEXT_EUR` default 0.01).

Alerts, `backend/src/ai-budget/ai-alert.ts`, SendGrid (the client and env key that
`image.controller.ts:49-114` already uses), to `AI_ALERT_EMAIL_TO`; skipped with a log line when unset:

- Per kind: a `yourcat` upload whose measured cost > `AI_ALERT_COST_PER_UPLOAD_EUR` (default 0.10), or a
  preview whose cost > `AI_ALERT_COST_PER_PREVIEW_EUR` (default 0.40, since previews are reserved at
  €0.30): increment `counts.costAlerts`; email at most once per UTC day per kind (`alerts.perUploadSentAt`
  / `perPreviewSentAt`, set with a conditional update), with the day's count and the average cost.
- Committed spend crosses 80 % and 100 % of the cap: one email each per day.
- A paid portrait fails delivery 3 times (§6.5): one email per order.

### 3.4 Admin view

`GET /yourcat/stats` returns `AiBudgetDayView = { day, capEur, spentEur, committedEur, counts }` for the
last `days` days. This is also the reliable server-side funnel (§7). No route writes anything else.

### 3.5 Environment variable names (names only; document them in `docs/BACKEND.md`)

| Name | Default | Purpose |
|---|---|---|
| `YOURCAT_ENABLED` | `false` | Kill switch for `POST /yourcat` and `/yourcat/manual` (status shows paused) |
| `YOURCAT_PORTRAIT_ENABLED` | `false` | Kill switch for the HD upsell checkout |
| `PORTRAIT_PREVIEW_ENABLED` | `true` | Kill switch for `POST /image/portrait` and regenerate |
| `AI_BUDGET_EUR_PER_DAY` | `5` | Global daily AI budget, all kinds |
| `AI_BUDGET_PREVIEW_EUR_PER_DAY` | `3` | Part of the global budget that `/image/portrait` previews may use |
| `AI_UPLOAD_IP_DAILY`, `AI_UPLOAD_IP_DAILY_UNVERIFIED`, `AI_UPLOAD_USER_DAILY` | 3, 0, 3 | `yourcat` caps |
| `AI_PREVIEW_IP_DAILY`, `AI_PREVIEW_IP_DAILY_UNVERIFIED`, `AI_PREVIEW_USER_DAILY` | 3, 1, 3 | `portrait-preview` caps |
| `AI_UPLOAD_IP_FAILURES_DAILY` | 5 | Failed uploads per IP per day (never refunded), both kinds |
| `AI_MANUAL_USER_DAILY` | 5 | Manual (no-AI) cats per user per day |
| `AI_UPLOAD_APPCHECK_ENFORCE`, `AI_PREVIEW_APPCHECK_ENFORCE` | `false`, `false` | Require a valid, unused App Check token (`yourcat`: launch condition) |
| `CF_ORIGIN_SECRET` | unset | Shared secret that a Cloudflare Transform Rule sends as `x-tt-origin-auth`; proves `cf-connecting-ip` |
| `AI_UPLOAD_IP_SALT` | falls back to `INVALIDATE_CACHE_SECRET` | HMAC salt for the per-IP day key |
| `AI_ALERT_EMAIL_TO` | unset | Alert recipient |
| `AI_ALERT_COST_PER_UPLOAD_EUR`, `AI_ALERT_COST_PER_PREVIEW_EUR` | `0.10`, `0.40` | Per-call cost alert thresholds |
| `AI_COST_OPENAI_INPUT_EUR_PER_MTOK`, `AI_COST_OPENAI_OUTPUT_EUR_PER_MTOK`, `AI_COST_GEMINI_INPUT_EUR_PER_MTOK`, `AI_COST_GEMINI_OUTPUT_EUR_PER_MTOK`, `AI_COST_GEMINI_IMAGE_EUR_1K`, `AI_COST_GEMINI_IMAGE_EUR_2K`, `AI_COST_GEMINI_IMAGE_EUR_4K`, `AI_COST_FALLBACK_IMAGE_EUR`, `AI_COST_FALLBACK_TEXT_EUR` | see §3.3 | Cost rates |

Existing, unchanged: `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `DO_SPACES_*`, `MAIN_FE_DOMAIN`, the SendGrid key,
`APP_CHECK_ENFORCE` (guest session only), `TRUST_PROXY`.

### 3.6 Cost per upload

A `/yourcat` upload is one `gpt-4o-mini` vision call plus **one** Gemini image call at the default size (no
white-border retries; §4.3). Refused photos (no cat, a person) cost the vision call only. The reservation is
€0.08; the alert fires above €0.10. If the measured average is above €0.10 in the first days, the alert
email says so and the founder lowers the caps or turns the avatar off; the cat and card still work with the
sprite only.

Capacity at the defaults: while reservations are open, €5 / €0.08 ≈ 62 uploads a day; once settled at a
measured cost of roughly €0.04–0.06 (one default-size Gemini image plus one small vision call; confirm
on the first days of `GET /yourcat/stats`), about 80–120 uploads a day, minus whatever previews spend.
When the budget is spent, `GET /yourcat/status` reports `uploadsOpen: false` and the page offers the
no-AI fallback (§1.5); nothing else breaks.

---

## 4. How the uploaded cat becomes the player's playable cat

The playable cat is `user.cat`; `/user/catbassadors/live` copies it into every Game row on the server
(`backend/src/user/user.controller.ts:1437`). So the upload only has to (a) give a cat the family look,
(b) put it in `user.cats`, (c) point `user.cat` at it. No score code changes, no Game rows, no
`lastPlayedAt` (`backend/src/one-writer.spec.ts` must keep passing).

### 4.1 Guest (the main case): restyle the guest's own starter in place

Why: a guest owns exactly one cat, its starter (`isStarter: true`, `isGuestStarter: true`; unique index
`starter_per_owner`). Restyling it keeps that invariant, keeps it out of public lists (`isGuestStarter`),
keeps promotion working (`user.service.ts:448` unsets `isGuestStarter` on the starter) and needs no new
`CAT_ORIGINS` value (which would sync into `catnip-heist/`).

`YourcatService.makePlayable(user, { name, family, type })`, guest branch:

1. `ensureStarterCat(cats, users, ownerId, { guest: true })` (`backend/src/user/guest/starter.ts:128`) so
   the starter exists.
2. One update (pipeline form, so an earlier lock time is kept):
   ```ts
   cats.findOneAndUpdate({ owner, isStarter: true }, [{ $set: {
     name, type,
     spriteImg: `${SPRITE_CDN}/assets/${family}/base.png`,
     catImg: `${SPRITE_CDN}/assets/${family}/base/GROOMING.gif`,
     resqueStory: 'Made from a photo on tokentails.com/yourcat.',   // manual: 'Made on tokentails.com/yourcat.'
     starterBreed: '$$REMOVE',
     starterLockedAt: { $ifNull: ['$starterLockedAt', now] },
   } }], { new: true })
   ```
   `starterBreed` is removed because `GameSelect.tsx:306` draws a starter with a `starterBreed` using the
   Meet-your-cat art, not `catImg`, so the lobby hero would not be the uploaded cat. The backend readers
   (`cat-name.service.ts` 119, 313, 334, 384) handle a starter without it (334 falls back to
   `FALLBACK_STARTER_NAME`). `origin: 'starter'` stays. `SPRITE_CDN` =
   `https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com` (same host as `STARTER_ART`).
3. `users.updateOne({ _id: owner }, [{ $set: { cat: starterId, onboarding: { state: 'done', version: ONBOARDING_VERSION, skipped: false, starterChosenAt: { $ifNull: ['$onboarding.starterChosenAt', now] } } } }])`.
   With onboarding done, Meet your cat does not open on `/game` (`client/components/game/Game.tsx:68-75`), so
   the uploaded cat stays the hero. `POST /user/starter` then answers `STARTER_LOCKED`, as for any committed starter.
4. A second upload (or a manual pick, or a `PATCH` rename) by the same guest updates the same starter
   (no new cat).

Consequence to state in copy and docs: a guest who later signs in to an **existing** account loses this
cat (decision #8, `guest-lifecycle.ts:345-357`). Creating a new account (promotion in place) keeps it.
Changing decision #8 is out of scope (§10).

### 4.2 Registered user: one photo cat per account

`makePlayable`, registered branch:

1. If the caller's latest `YourCat` record has a `cat` that the caller still owns, update that cat's
   `name`, `type`, `spriteImg`, `catImg`, `resqueStory` (same values as 4.1).
2. Otherwise create a cat: `{ owner, name, type, tier: Tier.COMMON, status: { EAT: 0 }, spriteImg, catImg,
   resqueStory, isBlueprint: false, createdAt: now, tokenId: generateRandomNumber() }`. No `origin` (the
   setter keeps only `CAT_ORIGINS`), no `blessing`, no `shelter`, no `isStarter`, no `starterBreed`. Then
   `CatService.addCatToTheOwner(cat, user)` (`cat.service.ts:248`).
3. `userRepository.update(userId, { cat: catId })`, the same write as `GET /cat/:_id/activate`
   (`cat.controller.ts:166-179`).
4. Onboarding: when the account's `onboarding.state` is `pending` (a registered account that never met
   its starter), set it to done with the same pipeline as 4.1 step 3, so Meet your cat does not open on
   `/game` (it opens for every pending account, `Game.tsx:68`) and the uploaded cat stays the hero.
   Any other state is not touched.

The free path never calls `createBlessingWithCat`: that grants a RARE cat, a portrait-kind blessing and a
painted-portrait classification, which belong to the paid path only.

Family rules, `backend/src/yourcat/family.ts`:

```ts
export const PLAYABLE_FAMILIES = [/* the 21 CatOriginType keys except PEACHES */];
export function normaliseFamily(raw: unknown): string | null;
// Upper-case, keep A–Z only per word, first word that is a CatOriginType key wins
// ('Black.' → BLACK, 'yellow cat' → YELLOW). PEACHES → RASCAL (white with ginger patches →
// ginger with white patches, the nearest family with art). NONE or anything else → null.
export const FAMILY_LABELS: Record<string, string> = {
  BLACK: 'Black', GREY: 'Grey', PINKIE: 'Pinkie', SIAMESE: 'Siamese', YELLOW: 'Ginger', WHITE: 'White',
  MAINE: 'Maine', OREO: 'Oreo', MIST: 'Mist', FOLD: 'Fold', OBSIDIAN: 'Obsidian', SAVANHAN: 'Savannah',
  BALINESE: 'Balinese', OBI: 'Obi', OLIVE: 'Olive', PICKLES: 'Pickles', RASCAL: 'Rascal', SABLE: 'Sable',
  FICUS: 'Ficus', MERLOT: 'Merlot', TROUFAS: 'Troufas',
};
export function familySprites(family: string): { spriteImg: string; catImg: string };
export function familyOptions(): YourcatFamilyOption[]; // for GET /yourcat/status
```

The edition is always `base` and the emote `GROOMING`, both verified on the CDN for all 21 families on
2026-10-11. The ability `type` from `generateCat` (or a random `CatAbilityType` on the manual path) only
sets game stats and the copy never mentions it.

### 4.3 Pixel avatar

New export in `backend/src/shared/utils/ai-avatar.ts` (the existing `generateAvatarFromImage` is not
changed):

```ts
export async function generatePixelAvatar(image: Buffer, mimeType: string, options?: AiCallOptions): Promise<Buffer | null>
// null: safety block, empty candidates or no inline image data (the caller marks the avatar failed)
```

- One `genAI.models.generateContent` call, model `gemini-3.1-flash-image-preview`, `imageConfig: { aspectRatio: '1:1' }`
  (default size, reported to `onUsage` as `imageSize: '1K'`), no retries, `temperature 0.2`,
  `abortSignal: options.signal`.
- Prompt: "Redraw this exact cat as 16-bit pixel art for a video game. Keep its real fur colours,
  markings, eye colour and ear shape. Head and shoulders, facing the viewer, centred. Thick dark outline,
  limited palette, flat colour areas, no gradients, no text, no frame, no people, no other animals. Plain
  solid deep violet background (#120d1f)."
- Post-process in the yourcat service with sharp (`backend/src/yourcat/pixelate.ts`):
  `resize(96, 96, { fit: 'cover', kernel: 'nearest' })` → `resize(768, 768, { kernel: 'nearest' })` →
  `png({ palette: true, colours: 48 })`. This makes a real pixel grid whatever the model returns.

### 4.4 Client side after `POST /yourcat`

`setProfileUpdate({ cat: view.cat, cats: [view.cat, ...without(view.cat._id)] , onboarding: { state: 'done' } })`
(the pattern of `client/components/home/useSelectHomeCat.ts:20-38`; `/yourcat` has no Phaser scene, so no
`CAT_SPAWN`). The profile cat carries no `starterBreed` (the server removed it), so the lobby draws
`catImg`. "Play as {Name}" navigates to `/game`, which reloads the profile anyway. Phaser loads
`cat.spriteImg` through `playerCatTexture.ts` (48 px frames, any https URL). The same update runs after
`POST /yourcat/manual` and after a `PATCH` rename (name only).

---

## 5. Share card rendering

### 5.1 Where: in the browser, not the backend

Decision: the card is drawn on a client `<canvas>` (`client/components/yourcat/shareCard.ts`). Reasons:

- The static app export only rules out Next API routes; client canvas code runs fine there (and the app
  build hides the upload anyway).
- Web Share with files needs the PNG ready inside the tap's user activation (iOS). A card rendered in the
  browser before the tap meets that; a backend render adds a network round trip inside the gesture.
- The brand fonts (`ttCanvasFont`, `loadGameFonts`) exist only in the client. A sharp/SVG render on the
  server would need the font files installed on the DigitalOcean image (fontconfig), which is unverified.
- CORS is solved: both CDNs answer `access-control-allow-origin: *` (checked 2026-10-11). Load every
  remote image with `img.crossOrigin = "anonymous"` and a cache-busting query `?cors=1`, so Safari never
  reuses a copy cached without CORS (which would taint the canvas). Pink Paw art is same-origin (§5.4).
- No new dependency in either package.

Fallback: if `toBlob` throws (tainted canvas, very old browser), hide "Share" and "Download", keep "Copy
link", and call `reportAppError('yourcat-card', error, { format })` (the first argument is the code).

Structure (so the layout is unit-testable without a canvas):

```ts
// client/components/yourcat/cardLayout.ts (pure)
export type CardFormat = 'story' | 'post';
export interface CardInput { format: CardFormat; name: string; familyLabel: string; hasShelterCat: boolean; shelterName?: string }
export interface Rect { x: number; y: number; w: number; h: number }
export interface CardLayout { width: number; height: number; safe: Rect; wordmark: Rect; avatar: Rect; sprite: Rect; name: Rect & { size: number }; subline: Rect; panel: Rect | null; panelImage: Rect | null; link: Rect }
export function cardLayout(input: CardInput, measure: (text: string, size: number) => number): CardLayout;
// client/components/yourcat/shareCard.ts (canvas)
export async function renderShareCard(input: CardInput & { avatarUrl: string | null; spriteImg: string; shelterImage?: string; seed: string }): Promise<Blob>;
```

Mirror the conventions of `client/components/shelter-payouts/shareCard.ts` (read it; never edit it):
`// copy-lint: web-only` is **not** needed (no wallet words); fonts only through `ttCanvasFont(role, size)`
after `await loadGameFonts()`; colours only from `@/design/tokens` (`NIGHT`, `GOLD`, `INK`); the paw is
drawn (copy `drawPaw` into the new file), not an emoji; warm fonts and images while S2 runs.

### 5.2 Layout

Common: background vertical gradient `NIGHT[900]` → `NIGHT[700]`; 40 small star dots (2–4 px,
`INK.cream` at 20–50 % alpha) placed by a seeded PRNG from the record id (same card every render); gold
pixel frame `GOLD[500]` 8 px around the avatar; `ctx.imageSmoothingEnabled = false` for the avatar and
sprite. Name: `title` role, `GOLD[400]`, centred, start size as below and shrink by 4 px until it fits
the width, never below 64 px (story) / 56 px (post); then ellipsis. While the name field is empty (`named`
false), the name line shows the family label and "cat" ("Ginger cat"), never "My cat". Avatar not available (`pending`, `failed` or `none`): draw
the sprite frame 0 at 12x inside the frame instead and no corner sprite.

**Story 1080 × 1920.** Safe area x 60–1020, y 220–1680 (stories cover the top and bottom).

| Element | Rect / style |
|---|---|
| Wordmark "TOKEN TAILS" | `hud` 40, `INK.lilac`, centred, baseline y 270 |
| Avatar | 760 × 760 at (160, 320) |
| Corner sprite | sheet frame (0, 0, 48, 48) at 4x = 192 × 192, at (790, 900), overlapping the frame corner |
| Name | `title` start 112, baseline y 1190, max width 920 |
| Subline "Now a pixel cat in Token Tails" | `caption` 40, `INK.cream`, centred, baseline y 1250 |
| Pink Paw panel (optional) | 920 × 260 at (80, 1310), fill `NIGHT[800]`, 4 px `GOLD[500]` border; image 220 × 220 at (100, 1330); text x 350: `hud` 32 `INK.lilac` "MEETS" baseline 1395; `title` 64 `GOLD[400]` "{ShelterCat}" baseline 1475; `hud` 32 `INK.lilac` "FROM PINK PAW" baseline 1530 |
| Link | paw icon + "tokentails.com/yourcat", `hud` 44, `GOLD[400]`, centred, baseline y 1650 |

Without the panel, move the subline to baseline 1290 and leave the link at 1650.

**Post 1080 × 1350.** Safe area x 60–1020, y 60–1290.

| Element | Rect / style |
|---|---|
| Wordmark | `hud` 36, baseline y 90 |
| Avatar | 600 × 600 at (240, 120) |
| Corner sprite | 3x = 144 × 144 at (760, 600) |
| Name | `title` start 96, baseline y 820 |
| Subline | `caption` 36, baseline y 878 |
| Pink Paw panel | 920 × 220 at (80, 920); image 180 × 180 at (100, 940); text x 310: `hud` 28 "MEETS" baseline 985, `title` 56 baseline 1050, `hud` 28 "FROM PINK PAW" baseline 1100 |
| Link | `hud` 40, baseline y 1250 |

The panel has no status line ("Waiting for a home" would stay on a saved PNG after the cat is adopted or
dies). It never says "rescued" or anything about money.

Watermark: the link line and the drawn paw are the watermark; nothing else is overlaid on the avatar.
The printed text is the bare `tokentails.com/yourcat` (people type it, so it stays short); the UTM
parameters travel in the shared link (§5.5), which is in the Web Share `text` and the copied text.

### 5.3 Exported file and pre-rendering

`canvas.toBlob(cb, 'image/png')` → `new File([blob], 'tokentails-{slug}-{format}.png', { type: 'image/png' })`.

Every variant is rendered **before** any tap can need it: story and post, each with and without the Pink
Paw panel (four variants; two when no shelter cat qualifies), starting when S3 mounts. They are re-rendered
(all of them) when the avatar arrives or the name changes. Toggling format or shelter only swaps to an
already rendered file. While the current variant is not ready, "Share" and "Download" are disabled
("Preparing card…"). `canShare({ files: [file] })` is evaluated on that real file.

### 5.4 Pink Paw cat selection rule (`client/components/yourcat/pinkPawPick.ts`)

1. Fetch `apiUrl + pinkPawGalleryPath()` with `credentials: 'omit'`, parse with `parsePinkPawGalleryBody`
   (`@/shared-contracts/pink-paw`, which already drops HEAVEN cats). Never import from
   `client/components/shelter-payouts/`.
2. Candidates: cats in **`atShelter`** only, whose name is one of `Judas`, `Raudvis`, `Zare`, `Simas`
   (the four with a licence), and whose `status` is `WAITING` or `RECOVERING`. Cats in `adopted`, with
   status `ADOPTED`, `HEAVEN` or `null`, are never shown.
3. Pick `candidates[fnv1a(yourcatId) % candidates.length]` (stable per upload).
4. Image: same-origin copy `client/public/yourcat/pink-paw/{judas|raudvis|zare|simas}-card.webp`, copied
   byte for byte from `client/public/heist-game/assets/images/pink-paw/` (read, never modify the source).
5. Fetch failure, timeout (3 s), parse failure or no candidate → `null`: no panel, no switch. **Never** fall
   back to a bundled list (it cannot screen out a cat that has died or been adopted).
6. Run the pick while S2 runs and again when S3 mounts for a returning visitor (the gallery is cached 45 s
   server-side).

### 5.5 Share URL and UTM

`buildShareUrl(medium, content)` in `client/components/yourcat/utm.ts`:

`https://tokentails.com/yourcat?utm_source=share&utm_medium={card|link}&utm_campaign=yourcat&utm_content={story|post|link}`

- `card` + `story`/`post`: Web Share, Download and the in-app long-press view. `link` + `link`: "Copy link".
- The origin comes from `siteOrigin` in `client/components/seo/site.ts`.
- No user id, record id or `ref` in the URL.
- On `/yourcat` load, read `utm_source`, `utm_medium`, `utm_content`; keep values matching
  `^[a-z0-9_-]{1,32}$`, store them in `sessionStorage` key `tt.yourcat.utm` (try/catch), attach to
  `upload_started` (§7). Nothing else reads them.

### 5.6 Web Share helper (`client/components/yourcat/share.ts`)

```ts
export type ShareOutcome = 'web-share' | 'download' | 'copy-link' | 'long-press' | 'cancelled' | 'failed';
export function isInAppBrowser(userAgent: string): boolean; // /Instagram|FBAN|FBAV|musical_ly|TikTok|BytedanceWebview/i
export function shareCardFile(file: File, text: string): Promise<ShareOutcome>;
```

- The tap handler calls `shareCardFile` synchronously with the already rendered `File`; inside it,
  `navigator.share(...)` is the first call, with **no `await` before it** (iOS drops the user activation
  after an await).
- `navigator.canShare?.({ files: [file] })` true → `navigator.share({ files: [file], title: 'Token Tails', text })`.
  Do **not** pass `url` together with `files` (several share targets then drop the file); the URL is in `text`.
  `AbortError` → `'cancelled'` (no `card_shared` event).
- Otherwise: download with an object URL and a temporary `<a download>`, then revoke the URL after 1 s.
- In-app browsers (`isInAppBrowser(navigator.userAgent)`): Web Share with files is missing and `<a download>`
  is blocked or opens a dead tab, so S3 shows the long-press view instead (§S3). Opening that view (the
  "Save the card" button) reports `card_shared` with method `long-press` (an intent; a long-press save
  cannot be detected).
  **Accepted deviation (2026-10-11):** `RevealStep` has no "Save the card" button. In an in-app browser
  the card shows large at once, and `card_shared` with `long-press` is sent once per view, on the card's
  `contextmenu` (where the webview fires it) or after a 500 ms touch hold. That is closer to a real save
  attempt than opening a view, costs the visitor one tap less, and keeps the event an intent.
- "Copy link": `navigator.clipboard.writeText(text)` in try/catch; on failure select the text in a
  read-only field and show "Press Ctrl+C or long-press to copy."

---

## 6. Portrait upsell and price changes

### 6.1 Prices (one number per tier)

| Product | Surface and rail | Old | New |
|---|---|---|---|
| Digital HD portrait | Stripe Checkout Session (card): `/portrait`, `/portraits`, `/yourcat` | $6 | **€14** |
| Print | Stripe Checkout Session | $49 | **€49** |
| Canvas | Stripe Checkout Session | $69 | **€69** |
| Digital HD portrait | USD rails: codex Immortalize PaymentIntent and `POST /web3/confirm` (crypto) | $6 | **$16** |

The $6 tier is retired everywhere. EUR is used only on the card Checkout Session, which is IMAGE-only;
packs, shelter cats and the PaymentIntent verifier's other branches stay in USD and are not touched
(hackathon safety). Print and canvas are not offered on the USD rails (the codex flow forces `digital`);
their USD table values stay 4900 and 6900 and are shown nowhere.

### 6.2 `backend/src/payments/price-table.ts` (C) exports, exact names

```ts
/** USD rails (codex PaymentIntent, POST /web3/confirm). Digital only is sold there. */
export const PORTRAIT_PRICES_CENTS: Readonly<Record<ProductType, number>> = { digital: 1600, print: 4900, canvas: 6900 };
/** The retired $6 digital price. Accepted only for payments created before the change (below) and by the audit. */
export const PORTRAIT_LEGACY_DIGITAL_USD_CENTS = 600;
/** When the USD digital price moved from $6 to $16. C sets it to the day v2 is deployed (00:00 UTC). */
export const PORTRAIT_USD_PRICE_CHANGED_AT: Date;
/** How long after the change a legacy-priced payment is still accepted (in-flight intents, stale tabs). */
export const PORTRAIT_LEGACY_GRACE_MS = 48 * 60 * 60 * 1000;
/** The price new USD payments are created at: always the current table. */
export function getPortraitPriceCents(p: ProductType): number;
/** The lowest catalogue price a USD portrait payment created at `at` may verify against. */
export function portraitUsdFloorCents(p: ProductType, at: Date): number; // legacy 600 for digital when at < CHANGED_AT + grace
/** Card checkout (Stripe Checkout Session) for portraits: euros. Client copy: client/models/portrait-prices.ts. */
export const PORTRAIT_CHECKOUT_CURRENCY = 'eur' as const;
export const PORTRAIT_CHECKOUT_PRICES_CENTS: Readonly<Record<ProductType, number>> = { digital: 1400, print: 4900, canvas: 6900 };
export function getPortraitCheckoutPrice(p: ProductType): { cents: number; currency: 'eur' };
/** Stats only (user `spent`, order `priceUsd`); never charged or shown. Not a currencyRate entry. */
export const PORTRAIT_STATS_USD_PER_EUR = 1.15;
export function portraitPriceUsdForStats(eurCents: number): number; // rounded to cents
```

Plus `CurrencyType.EUR = 'EUR'` in `backend/src/shared/interfaces/currency.interface.ts` (C) **without** a
`currencyRate` entry: `currencyRate` feeds `GET /cat/rates` (`cat.controller.ts:104`) and the web3 rate
table (`web3.service.ts:217`), and EUR must not appear there. The USD-per-EUR number lives only in
`price-table.ts`. C checks every `IsEnum(CurrencyType)` validator and every `switch` on `CurrencyType`
(`git grep CurrencyType backend/src`) and confirms each rail still refuses `'EUR'` (Stellar: no asset;
crypto checkout: its own table).

### 6.3 Every copy to change

| Copy | Owner | Change |
|---|---|---|
| `backend/src/payments/price-table.ts:14-18` and its comment (line 7) | C | §6.2 |
| `backend/src/payments/stripe-payment.service.ts` `checkPaidCheckoutSession` | C | §6.4 |
| `backend/src/payments/stripe-payment.service.ts` `portraitCheckoutAmountCents` (`:82-87`, the amount `image.controller.ts:308` charges) | C | return `getPortraitCheckoutPrice(productType).cents` (EUR cents); JSDoc says so |
| `backend/src/payments/stripe-payment.service.ts` PaymentIntent create (`:139`) | C | `getPortraitPriceCents` (1600) |
| `backend/src/payments/stripe-payment.service.ts` `verifySucceededPaymentIntent` IMAGE branch (`:225-265`) | C | `baseCents = portraitUsdFloorCents(productType, createdAt)` with `createdAt` from `intent.created` (as packs do). Intents created after the change carry `expectedAmount: 1600`, so `max(expectedAmount, …)` still holds them at $16; a $6 intent created before the change (paid around the deploy) verifies against 600 |
| `backend/src/web3/order-catalogue.ts` `getOrderCatalogueCents` (`:35`) | C | IMAGE: `portraitUsdFloorCents(productType, order.createdAt ?? new Date())`. A Stellar order is created by `POST /web3/confirm` right after the client paid, so an in-flight $6 payment confirmed within the grace still verifies; the audit reads stored `createdAt`, so history stays clean. The cost: for 48 h after the change a Stellar buyer could still pay $6 on purpose (a stale client shows $6 anyway) |
| `backend/src/web3/order-audit.ts` `auditStripeOrder` and `auditStellarOrder` (offline audit, `backend/scripts/audit-orders.js`) | C | IMAGE orders with `currencyType: 'EUR'` are compared on `order.price` against `PORTRAIT_CHECKOUT_PRICES_CENTS`; USD IMAGE orders (Stripe and Stellar) go through `getOrderCatalogueCents` with their `createdAt`, so legacy $6 orders get no `BELOW_CATALOGUE` finding. No grant path changes |
| `backend/src/payments/stripe-payment.service.spec.ts:54-55` | C | pin €14/€49/€69, $16, and the legacy floor |
| `backend/src/web3/order-audit.spec.ts:144` (`price: 6`) | C | update if it asserts the table |
| `backend/src/shared/interfaces/currency.interface.ts` | C | add `EUR` to the enum only |
| `backend/src/image/image.controller.ts` session `currency: 'usd'` (line item and shipping), order `price`/`priceUsd`/`currencyType` | A | moves into `PortraitCheckoutService`; uses C's exports |
| `backend/src/image/image.controller.spec.ts:108` (`price: 6`) | A | update fixture |
| `client/models/portrait-prices.ts` (new) | C | `PORTRAIT_CHECKOUT_PRICES = { digital: 14, print: 49, canvas: 69 }`, `PORTRAIT_CHECKOUT_CURRENCY = 'EUR'`, `CODEX_DIGITAL_PORTRAIT_USD = 16`, `formatPortraitPrice(amount, currency)` |
| `client/features/portrait/components/PreviewPage.tsx:47-97` `purchaseOptions` prices, `originalPrice`, the `$` signs, GTM `currency: "USD"` (173, 237) | C | read `portrait-prices.ts`; `EUR` |
| `client/pages/portrait.tsx`: "Portraits from $6." (837), "Start from $6…" (1766), plan cards and CTAs rendering `purchaseOptions[n].price` with `$` (1031, 1580, 1661-1664, 1777, 1819), GTM `currency: "USD"` (420, 637, 745) | C | "Portraits from €14." / "From €14…", formatted prices, `EUR` |
| `client/pages/portraits.tsx`: "Free Preview · From $6 to purchase" (700), GTM currency (148, 329) | C | "Free preview · from €14" , `EUR` |
| `client/components/codex/ImmortalizePetFlow.tsx:21` `DIGITAL_PORTRAIT_PRICE = 6` (used at 235, 294, 393, 516, 527) | C | `CODEX_DIGITAL_PORTRAIT_USD` (16), copy "Full portrait: $16", GTM stays `USD` |
| `/yourcat` upsell | B | reads `GET /yourcat/status`, no constant |
| `docs/CLIENT.md:231-233` | C | new prices |
| `docs/API.md:527` | A | "(€14, €49, €69 by card; a sent `amount` is ignored)". The one price string outside C, because A owns `docs/API.md` for the routes; the text is fixed here, so A copies it verbatim |
| `docs/DEVELOPMENT.md` hand-kept copies table | C | add a "Portrait prices" row: client `portrait-prices.ts` ↔ `PORTRAIT_CHECKOUT_PRICES_CENTS` and `PORTRAIT_PRICES_CENTS.digital`, pinned by `client/__test__/portrait-prices.test.tsx` |
| `client/models/cats.ts:6`, `cms/models/cats.ts:19` `generatedCat: 5` | – | unused, not a portrait price; leave (mention only) |
| `docs/plans/*.md` historical mentions of $6 | – | leave (history) |

### 6.4 Price parity rule

- **Displayed == charged.** Every surface shows the exact amount and currency its rail charges. Client
  prices come from `client/models/portrait-prices.ts` (C) or, on `/yourcat`, from `GET /yourcat/status` (B).
  No strike-through, no "was" price, no timer.
- `checkPaidCheckoutSession(session, order)` (C):
  - the paid currency and amount are `session.currency_conversion.source_currency` /
    `.amount_total` when `currency_conversion` is present (Stripe Adaptive Pricing; new portrait sessions
    disable it, older ones may not), else `session.currency` / `session.amount_total`;
  - expected currency = `order.currencyType === EUR ? 'eur' : 'usd'`; any other currency → refuse;
  - expected cents = `Math.round(order.price * 100)` when `order.price > 0` (the server wrote it when the
    session was created), else the table for that currency; paid amount < expected → refuse.
  This also lets USD $6 sessions created before the deploy complete correctly afterwards.
- The `client/__test__/portrait-prices.test.tsx` test reads `backend/src/payments/price-table.ts` and
  fails if any client copy differs.

### 6.5 Prefill and delivery flow for `/yourcat`

1. `POST /yourcat/:id/portrait-checkout { style }` (A), through `PortraitCheckoutService`:
   - check owner, `YOURCAT_PORTRAIT_ENABLED`, record is `source: 'photo'` and has `originalKey` (else 410);
   - any `COMPLETE` order on the record's `portraitImage` → 409 `PORTRAIT_EXISTS`;
   - reuse the record's one `Image` (create it on the first checkout:
     `Image { url: 's3private://' + originalKey, name: record.name, owner, source: 'yourcat', style, isTemporary: false }`;
     later checkouts update its `style`);
   - an open session for that image (a `PENDING` order whose Stripe session is `open`): if the style is
     unchanged, return its URL; otherwise `stripe.checkout.sessions.expire` it first (if Stripe says it is
     already complete → 409 `PORTRAIT_EXISTS`); that order stays `PENDING` but can never complete; then
     create a new one. So at most
     one payable session exists per record;
   - session: `productType: 'digital'`, price `getPortraitCheckoutPrice('digital')`,
     `success_url: ${MAIN_FE_DOMAIN}/yourcat?yc=<id>&paid=1`,
     `cancel_url: ${MAIN_FE_DOMAIN}/yourcat?yc=<id>&checkout=cancelled`, `expires_at` now + 2 h,
     `adaptive_pricing: { enabled: false }`, the withdrawal acknowledgement (`consent_collection` +
     `custom_text`, §2.4), `customer_email` only when the user has a verified email (otherwise Checkout
     collects it), metadata `{ userId, source: 'yourcat', yourcatId }`;
   - set `originalDeleteAfter = max(current, now + 3 days)`; increment `counts.portraitCheckouts`.
   **No portrait is generated before payment**, so nothing paid is exposed for free on this path.
2. Webhook completes the order (§2.4) and calls `PortraitDeliveryService.deliverInBackground(orderId)`.
3. `PortraitDeliveryService` (`backend/src/yourcat/portrait-delivery.service.ts`): lease
   `portrait-delivery:<orderId>`; `generatePortraitForImage(imageId, repo, style, { onUsage })`; record the
   spend (no cap); email the buyer with `sendOrderConfirmationEmail(email, aiUrl, { subject: "Your portrait of {Name} is ready" })`
   from `order-email.ts`; `counts.portraitsDelivered++`; `originalDeleteAfter = now + 30 days`, or, when
   `deleteOriginalAfterDelivery` is set, delete the original now. Failure → `portraitAttempts++`.
4. Sweeper `@Cron('*/10 * * * *')`: COMPLETE IMAGE orders from the last 7 days whose image has
   `source: 'yourcat'`, no `aiUrl` and `portraitAttempts < 3` → deliver again. At 3 failures:
   `counts.portraitsDeliveryFailed++`, an alert email, and the original is deleted if
   `deleteOriginalAfterDelivery` is set; the page shows the "failed" copy (S6).
5. `GET /yourcat/:id` `portrait.status`, resolved from the orders on `portraitImage` (not from a single
   stored order id): any `COMPLETE` order → `painting` (or `failed` at 3 attempts) until the image has an
   `aiUrl`, then `ready` with `url`; else a `PENDING` order with an open session → `pending_payment`; else
   `none`. An older tab that was paid is therefore always seen.
6. The promised "redo once" is manual: support regenerates through the internal CLI; no route.

### 6.6 Removal list: fabricated proof (C)

| File | Lines (2026-10-11) | Remove |
|---|---|---|
| `client/features/portrait/components/TrustpilotReviews.tsx` | whole file (invented reviews 4-26, "Based on 167 reviews" 67, Trustpilot brand 72) | delete the file |
| `client/features/portrait/components/Testimonials.tsx` | whole file (stock faces 9-40, team members posing as buyers) | delete the file |
| `client/features/portrait/components/AsSeenOn.tsx` | whole file ("As Seen In" Forbes, NYT, ELLE, VOGUE) | delete the file |
| `client/features/portrait/hooks/useCountdown.ts` | whole file (15-min timer that restarts on load) | delete the file |
| `client/features/portrait/components/PreviewPage.tsx` | imports 5, 6, 10; `originalPrice` field and values 36, 52, 64, 83; `useCountdown(15)` 136; strike-through and "Expires in"/"Discount expired" 606-632; post-expiry price swap 700-705 and its checkout value 245; "Free Shipping ($20 value)" 679 → "Free shipping"; `<TrustpilotReviews />` 719-720; `<Testimonials />` 722-723 | remove or replace as stated |
| `client/pages/portrait.tsx` | `AsSeenOn` import 20 and use 1179-1181 with "Trusted by cat parents worldwide"; `STATS` 64-71 ("50K+ Portraits generated", "4.9/5 Happy cat parents", "< 2 min") and its section; `TESTIMONIALS` 157-190 and the "Real people, real cats" / "People are obsessed" section 1478-1486; "30-day money-back support window" 1671 (contradicts the non-refundable digital policy in `PoliciesModal.tsx`) | remove the blocks; the money-back line becomes "Digital portraits are delivered instantly. Prints ship in 3 to 12 business days." |
| `client/pages/portraits.tsx` | `AsSeenOn` 12 and 896-898; Trustpilot badge with stars 821-866; "#1 in Pet Portraits" 870 | remove |

Line numbers drift; C finds each by its string. Keep the honest parts (the upload flow, the style picker,
the real example images, the policies). `PoliciesModal.tsx` (C): name Google Gemini as the processor
that paints portraits and DigitalOcean (Frankfurt) as storage; state the truth about preview uploads,
which stay public-read with no automatic deletion: "Photos uploaded for a preview are stored on our
image server. Write to info@tokentails.com and we will delete them."; lawful basis Art. 6(1)(b); contact
info@tokentails.com; and, for digital portraits, that the 14-day withdrawal right ends once delivery
starts with the buyer's agreement (the checkout asks for it).

C also makes the locked `POST /image/portrait` work for its callers:

- `client/api/image-api.ts` `uploadImage` and `regeneratePortrait` first call
  `getAuthBridge().ensureGuestSession?.()`, then send `accesstoken: currentAccessToken()` and
  `x-firebase-appcheck: await getLimitedUseAppCheckToken(getApp())` (`getApp` from `firebase/app`, the
  default app that `FirebaseAuthContext` initialises). Regenerate handles 401 (signed out, as today) and
  403 `GUEST_FORBIDDEN` (a guest regenerating a legacy image without owner) with the same
  `SignInRequiredError`.
- `client/pages/portrait.tsx` and `client/pages/portraits.tsx` have **no** `FirebaseAuthProvider` today; C
  wraps their content in `FirebaseAuthProvider authMode="guest"` (`MainLayout` already supplies
  `ProfileProvider`). The codex `ImmortalizePetFlow` runs inside `/game` (already `guest`).
- `PreviewPage.tsx:251`: with a guest identity, `profile._id` is now set, and the signed route
  (`create-checkout-session-signed`, registered-only) would answer 403 `GUEST_FORBIDDEN` and open the
  AuthSheet. C uses the signed path only when `profile._id && !profile.isGuest && !emailValue`; a guest
  keeps the email path, as an anonymous visitor does today.
- Map the new `YOURCAT_*` cap and budget codes to plain messages there too ("You have made all your
  previews for today. Please come back tomorrow.").
- Until `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` is set on Vercel, the client sends no App Check token,
  so every `/portrait` visitor is "unverified": 1 preview per IP per day, shared with regenerate. See
  "Your call" (§10).

---

## 7. Analytics events

### 7.1 Client events (PostHog, consent-gated)

To keep `catnip-heist/` untouched, the five events are a **client-only** catalog extension, not entries
in `shared/analytics-core.ts`. New file `client/analytics/growth-events.ts` (B):

```ts
export const GROWTH_EVENTS = {
  UPLOAD_STARTED: 'upload_started', UPLOAD_DONE: 'upload_done', CARD_SHARED: 'card_shared',
  PORTRAIT_CHECKOUT_STARTED: 'portrait_checkout_started', PORTRAIT_PAID: 'portrait_paid',
} as const;
export type GrowthEventName = typeof GROWTH_EVENTS[keyof typeof GROWTH_EVENTS];
type AvatarStatusAtEvent = 'ready' | 'pending' | 'failed' | 'none';
export interface GrowthEventProperties {
  upload_started: { surface: 'yourcat'; source: 'picker' | 'drop' | 'manual'; fileType: 'jpeg' | 'png' | 'webp' | 'heic' | 'other' | 'none'; sizeBucket: 'lt1mb' | '1to5mb' | '5to10mb' | 'none'; resized: boolean; utmSource?: string; utmMedium?: string; utmContent?: string };
  upload_done: { surface: 'yourcat'; outcome: 'ready' | 'error'; errorCode?: YourcatErrorCode | 'NETWORK' | 'RATE_LIMITED'; family?: string; avatarStatus?: AvatarStatusAtEvent; seconds: number };
  card_shared: { surface: 'yourcat'; format: 'story' | 'post' | 'none'; method: 'web-share' | 'download' | 'copy-link' | 'long-press'; withShelterCat: boolean; avatarStatus: AvatarStatusAtEvent; secondsToReveal: number };
  portrait_checkout_started: { surface: 'yourcat'; style: YourcatPortraitStyle; priceCents: number; currency: 'EUR' };
  portrait_paid: { surface: 'yourcat'; priceCents: number; currency: 'EUR'; status: 'painting' | 'ready' };
}
export function buildGrowthEvent<K extends GrowthEventName>(name: K, properties: GrowthEventProperties[K]): { name: K; properties: GrowthEventProperties[K] };
```

`client/analytics/events.ts` (B): widen `AnalyticsEvent` to `CoreAnalyticsEvent | GrowthEvent` so
`analytics.track` accepts both; nothing else changes. `client/__test__/analytics.test.ts` keeps passing
(it checks `ANALYTICS_EVENTS` only). No property carries PII: no cat name, photo or avatar URL, record id,
user id or email (`client/analytics/events.ts:4-7`). `family` is a breed bucket, not personal data.
`secondsToReveal` is the time from the tap on "Choose a photo"'s file selection to the S3 reveal, rounded
to whole seconds (the number behind the "about 30 seconds" copy rule, S1).

Where each fires (B, all in `client/components/yourcat/`):

| Event | Fires | Notes |
|---|---|---|
| `upload_started` | right before `POST /yourcat` (or `/yourcat/manual`) is sent | |
| `upload_done` | when that request resolves (`outcome: 'ready'`) or fails (`'error'` with the code); `avatarStatus` = the status at that moment | `seconds` rounded |
| `card_shared` | after `shareCardFile` returns `web-share` or `download`, after a successful copy, or (as built, accepted deviation, §5.6) on the first `contextmenu` or 500 ms touch hold on the card in an in-app browser | not on `cancelled`; `avatarStatus` is the status of the shared card |
| `portrait_checkout_started` | when `POST /yourcat/:id/portrait-checkout` succeeds, before redirect | also GTM `trackEvent('begin_checkout', { currency: 'EUR', value: priceCents / 100, ... })` with `priceCents` from `GET /yourcat/status` |
| `portrait_paid` | first time S6 sees `painting` or `ready` for an order; dedupe in `sessionStorage` key `tt.yourcat.paid.<yourcatId>` | also GTM `purchase` with `EUR` and `value: priceCents / 100` |

### 7.2 Server counters (reliable, consent-free, aggregate)

Client analytics are consent-gated and dropped without a key (`client/analytics/client.ts:36-41`), so
the numbers that matter are also counted server-side in `AiBudgetDay.counts` (§3.3): `yourcatAdmitted`
(≈ upload started, server side), `yourcatDone`, `yourcatFailed`, `yourcatRefusedNoCat`,
`yourcatRefusedPerson`, `manualCats`, `avatarsReady`, `portraitCheckouts`, `yourcatPortraitsPaid`,
`portraitsDelivered`. These are anonymous daily totals, readable through `GET /yourcat/stats`.
`card_shared` exists only client-side (sharing happens in the browser).

None of this touches `POST /user/catbassadors/live`, Game rows or any score field.

---

## 8. Work breakdown: three parallel workstreams

Each stream works on its own branch cut from `v2` (`v2-yourcat-a`, `-b`, `-c`, or worktrees) and merges
back into `v2` only. Merge order: **C first** (small backend price exports that A compiles against, and
`getLimitedUseAppCheckToken` that B imports), then **A**, then **B**. B builds and tests against the
contract in §2.1 with mocked responses, so it does not wait for A's code. No file appears in two lists.

### A. Backend

New files:

- `backend/src/yourcat/yourcat.controller.ts`
- `backend/src/yourcat/yourcat.service.ts` (`makePlayable`, upload and manual pipelines, rename, views)
- `backend/src/yourcat/yourcat.schema.ts`, `backend/src/yourcat/yourcat.repository.ts`
- `backend/src/yourcat/yourcat.contracts.ts` (§2.1)
- `backend/src/yourcat/family.ts`
- `backend/src/yourcat/pixelate.ts`
- `backend/src/yourcat/portrait-delivery.service.ts`
- `backend/src/yourcat/yourcat-retention.job.ts`
- `backend/src/image/portrait-checkout.service.ts` (`PortraitCheckoutService`)
- `backend/src/image/order-email.ts` (`sendOrderConfirmationEmail`, moved)
- `backend/src/ai-budget/ai-budget.schema.ts` (`AiBudgetDay`, `AiQuota`)
- `backend/src/ai-budget/ai-budget.service.ts`
- `backend/src/ai-budget/ai-upload-gate.ts`
- `backend/src/ai-budget/ai-cost.ts` (`AiUsage`, `AiCallOptions`, costs)
- `backend/src/ai-budget/ai-alert.ts`
- `backend/src/shared/client-ip.ts`, `backend/src/shared/cloudflare-ips.ts`
- `backend/src/shared/guards/client-ip-throttler.guard.ts`
- `backend/src/shared/photo-upload.filter.ts` (`PhotoUploadExceptionFilter`)
- `backend/src/shared/utils/photo-upload.ts`
- `backend/src/user/guest/app-check.ts`
- all A spec files in §9

Modified files:

- `backend/src/app.module.ts` (schemas, `YourcatController`, services incl. `PortraitCheckoutService`,
  `ClientIpThrottlerGuard`, jobs)
- `backend/package.json`, `backend/package-lock.json` (`firebase-admin` within `^11` to a version with
  `verifyToken(token, { consume })`)
- `backend/src/common/guards/guest-allow-list.ts` (entries and the header exception line)
- `backend/src/common/search-params.spec.ts` (the `/image/search` case is no longer "public")
- `backend/src/image/image.controller.ts`, `backend/src/image/image.schema.ts`
- `backend/src/image/image.controller.spec.ts`, `backend/src/image/image.public-routes.spec.ts`
- `backend/src/shared/utils/ai.utils.ts` (`generateCat` options: `onUsage`, `signal`, `screen`)
- `backend/src/shared/utils/ai-avatar.ts` (new `generatePixelAvatar` only)
- `backend/src/shared/utils/ai-portrait.ts` (`AiCallOptions`, `loadImageBytes`)
- `backend/src/shared/utils/aws.utils.ts`
- `backend/src/shared/utils/image.utils.ts` (export two existing helpers)
- `backend/src/user/guest/firebase-identity.ts` (a consuming App Check verify)
- `backend/src/user/user.controller.ts` (`verifyAppCheck` calls the extracted helper; same behaviour)
- `docs/BACKEND.md` (routes, env names, launch conditions, Known issues entries in §10), `docs/API.md`
  (routes table, portrait price text)

Must not touch: `backend/src/shelter/**`, `backend/src/payments/**` (C), `backend/src/web3/**`,
`shared/**`, `backend/src/shared-contracts/**`, `backend/src/blessing/**`, `backend/src/cat/cat.service.ts`,
`cat.controller.ts` and `cat-name.service.ts` (call them, do not edit),
`backend/src/shared/guards/app-throttler.guard.ts` and `user-throttler.guard.ts` (use them).

### B. Client `/yourcat`, share card, analytics

New files:

- `client/pages/yourcat.tsx` (`SeoHead` with `path="/yourcat"`, title "Turn your cat into a pixel cat | Token Tails",
  description "Upload one photo of your cat and play as it in Token Tails. Free pixel portrait and share card.",
  default OG image)
- `client/components/yourcat/YourCatPage.tsx`, `UploadStep.tsx`, `WorkingStep.tsx`, `RevealStep.tsx`
  (reveal + share), `ManualPick.tsx`, `PortraitUpsell.tsx`, `PaidState.tsx`, `PrivacyPanel.tsx`,
  `AppOnlyNotice.tsx`, `copy.ts` (every string of §1, the four-style list, `privacyNoticeVersion`),
  `prepareUpload.ts` (type check, downscale), `pixelateReveal.ts`, `cardLayout.ts`, `shareCard.ts`,
  `share.ts`, `pinkPawPick.ts`, `utm.ts`, `useYourcat.ts` (state machine, polling, visibility)
- `client/api/yourcat-api.ts` (`status`, `upload`, `manual`, `me`, `get`, `rename`, `remove`,
  `portraitCheckout`; lowercase `accesstoken` via `currentAccessToken()`; `x-firebase-appcheck` via
  `getLimitedUseAppCheckToken(getApp())`; `getAuthBridge().ensureGuestSession?.()` on mount and before
  `upload`; JSON calls through `apiFetch`)
- `client/models/yourcat.ts` (§2.1 copy)
- `client/analytics/growth-events.ts`
- `client/public/yourcat/pink-paw/judas-card.webp`, `raudvis-card.webp`, `zare-card.webp`, `simas-card.webp`
- `docs/YOURCAT.md` (feature doc: flow, privacy text of S1-P, events, env names pointer to BACKEND.md)
- all B test files in §9

Modified files:

- `client/analytics/events.ts` (union only)
- `client/api/api.ts` (`GUEST_WRITE_PATHS` += `/^\/yourcat(\/manual|\/[^/]+(\/portrait-checkout)?)?$/`)
- `client/__test__/auth-api-wrapper.test.ts` (covers `interceptOptions` for the new paths)
- `client/components/shared/skyScope.ts` (`NIGHT_ROUTES` += `/yourcat`)
- `client/scripts/check-meta.mjs` (`PAGES` += `/yourcat`)

Read-only imports allowed (examples, not a closed list; any module outside C's list and the "must not
touch" list may be imported without editing it): `@/api/api`, `@/analytics`, `@/components/seo/site`,
`@/components/seo/SeoHead`, `@/context/ProfileContext`, `@/context/FirebaseAuthContext`,
`@/context/ToastContext`, `firebase/app`, `@/shared-contracts/pink-paw`, `@/design/tokens`,
`@/components/typography/*`, `@/features/portrait/components/StylePickerDrawer` (the `PortraitStyle` enum
only; its `styles` array is not exported), `@/context/auth/appCheck` (after C merges),
`@/components/GoogleTagManager` (`trackEvent`), `@/models/app`.

Must not touch: anything in C's list, `client/components/game/**` (including `GameSelect.tsx`; §4.1
makes the lobby right from the server side), `client/components/shelter-payouts/**`,
`client/public/heist-game/**`, `client/pages/heist.tsx`, `client/pages/shelter-payouts*`, `shared/**`,
`client/shared-contracts/**`.

### C. Portrait trust cleanup and prices (owns every price copy)

Backend:

- `backend/src/payments/price-table.ts`
- `backend/src/payments/stripe-payment.service.ts`, `backend/src/payments/stripe-payment.service.spec.ts`
- `backend/src/shared/interfaces/currency.interface.ts`
- `backend/src/web3/order-catalogue.ts` (IMAGE floor by creation time; §6.3)
- `backend/src/web3/order-audit.ts`, `backend/src/web3/order-audit.spec.ts` (EUR orders, legacy $6; §6.3)

Client:

- `client/models/portrait-prices.ts` (new)
- `client/context/auth/appCheck.ts` (new export `getLimitedUseAppCheckToken`; `getAppCheckToken` unchanged)
- `client/features/portrait/components/PreviewPage.tsx`, `PoliciesModal.tsx`
- `client/features/portrait/components/TrustpilotReviews.tsx`, `Testimonials.tsx`, `AsSeenOn.tsx` (delete)
- `client/features/portrait/hooks/useCountdown.ts` (delete)
- `client/pages/portrait.tsx`, `client/pages/portraits.tsx`
- `client/components/codex/ImmortalizePetFlow.tsx`
- `client/api/image-api.ts`
- `client/__test__/image-api-regenerate.test.ts` (update)
- new tests in §9
- `docs/CLIENT.md` (prices; one line linking `docs/YOURCAT.md`; portrait known-issue notes), `docs/DEVELOPMENT.md` (copies row)

Must not touch: `backend/src/image/**` (A), `backend/src/web3/web3.controller.ts`,
`backend/src/web3/web3.service.ts`, `client/components/web3/**`, `client/api/stripe-api.ts`, anything in
B's list.

### Shared contracts summary (so streams never need each other's code)

| Contract | Defined in | Producer | Consumer |
|---|---|---|---|
| `YourcatView`, `YourcatStatusView`, `YourcatCheckoutView`, `YourcatDeleteView`, error codes | §2.1 | A | B |
| Endpoints, status codes, headers | §2.2–2.4 | A | B, C (`/image/portrait`, regenerate) |
| `getPortraitCheckoutPrice`, `PORTRAIT_CHECKOUT_*`, `PORTRAIT_STATS_USD_PER_EUR`, `portraitPriceUsdForStats`, `CurrencyType.EUR`, `checkPaidCheckoutSession` semantics | §6.2, §6.4 | C | A |
| `getLimitedUseAppCheckToken(app): Promise<string \| null>` | §3.1 | C | B |
| `AiUsage`, `AiCallOptions` | §3.3 | A | A |
| Growth events | §7.1 | B | – |
| `/image/portrait` caps error codes | §2.1 | A | C |

---

## 9. Tests and checks

### A (backend Jest, `backend/src/**/*.spec.ts`)

- `shared/utils/photo-upload.spec.ts`: empty → `FILE_REQUIRED`, > 10 MB → `FILE_TOO_LARGE`; rejects GIF,
  SVG, TIFF, animated WebP; a 50 MP image → `FILE_TOO_LARGE` from the explicit pixel check (not a sharp
  error); a HEIC whose `ispe` box says 50 MP is refused **before** `heic-convert` is called; a HEIC without
  `ispe` and a `convertHeicToJpg` rejection → `NOT_DECODABLE`; accepts JPEG, PNG, WebP and HEIC (mock
  `heic-convert`); a JPEG written with `withMetadata({ orientation: 6 })` comes out rotated (width and
  height swapped); output metadata has no `exif`, `xmp` or `icc`; long edge ≤ 1024; `sha256` stable for the
  same input.
- `shared/photo-upload.filter.spec.ts`: `PayloadTooLargeException` → 413 `YOURCAT_FILE_TOO_LARGE` with
  `statusCode`; `PhotoTypeError` → 400 `YOURCAT_FILE_TYPE`; `LIMIT_FILE_COUNT` → 400 `YOURCAT_FILE_REQUIRED`;
  other exceptions pass through.
- `shared/client-ip.spec.ts`: `cf-connecting-ip` is trusted only with a matching `x-tt-origin-auth`
  (constant-time compare) or, under `TRUST_PROXY`, when `req.ip` is in a Cloudflare range; a forged header
  sent straight to the origin is `trusted: false`; private or loopback addresses are skipped; production
  with no usable IP → null; non-production → `'dev'`.
- `shared/guards/client-ip-throttler.guard.spec.ts`: two different client IPs behind the same `req.ip` get
  separate buckets; the limit from `@ClientIpThrottle` applies.
- `ai-budget/ai-budget.service.spec.ts` (unit, with an in-memory fake collection that models
  `$not: { $gt }`, missing fields, upsert and E11000): a day document created by a `yourcat` reservation, a
  paid delivery or an alert update still admits a preview (the missing `previewCommittedMicroEur` case);
  the code-side check refuses `est > cap` on a day with no document (cap 0); previews stop at the
  sub-cap while `/yourcat` reservations still pass; an E11000 on the first upsert is retried once and then
  succeeds; settle and cancel adjust both fields on the ticket's day even after 00:00 UTC; each alert is
  sent at most once a day per kind; the counter map gives `previewsAdmitted` for previews.
- `ai-budget/ai-budget.mongo.spec.ts` (**opt-in**, real Mongo, skipped unless `MONGO_IT_URI` is set, like
  `shared/jobs/lease-mongo.spec.ts`; it does not run in `npm test` by default): 100 parallel reservations
  never push `committedMicroEur` above the cap; two parallel first claims on one `AiQuota` `_id` both
  succeed under a limit of 2. Run it locally before merging A.
- `ai-budget/ai-upload-gate.spec.ts`: verified vs unverified per-IP caps (unverified 0 for `yourcat`
  refuses); enforce mode → 401; a replayed (`alreadyConsumed`) token → `APP_CHECK_INVALID` in enforce mode
  and the unverified cap otherwise; an untrusted IP in production refuses `yourcat` and gives previews the
  unverified cap; per-user cap; the failure cap refuses at 5 and `release` never lowers it; when the
  budget refuses after the IP and user slots were claimed, both are released (no lost attempt); `release`
  gives the attempt back once only; the HMAC key never contains the IP; missing salt in production → 503.
- `ai-budget/ai-cost.spec.ts`: usage → micro-euros, images priced per size; fallback when usage is missing
  or the call timed out; per-kind alert thresholds (a €0.30 preview does not trigger the upload alert).
- `shared/utils/ai.utils.spec.ts` (new or extended): with `screen: true`, `Person: yes` → `personVisible`,
  `Cat type: NONE` → `isCat: false`, an unparsable answer → null; without options the prompt is unchanged
  (string snapshot).
- `yourcat/family.spec.ts`: all 21 families map to themselves, `PEACHES` → `RASCAL`, `'Black.'` and
  `'yellow cat'` normalise, `NONE` and unknown → null; `familySprites` uses `base.png` and
  `base/GROOMING.gif`; `familyOptions` has 21 entries.
- `yourcat/yourcat.controller.spec.ts` (mocks for `generateCat`, `generatePixelAvatar`, S3, repos):
  kill switch 503; consent missing 400; a dog photo (`screen.isCat: false`) → 422 `NO_CAT` and a photo
  with a person → 422 `PERSON_VISIBLE`, in both cases nothing uploaded to S3, the attempt released, a
  failure counted and the cost settled; the classifier is called before any S3 write; a classifier
  timeout aborts the request and settles the fallback cost; guest happy path restyles the starter,
  **removes `starterBreed`**, sets `user.cat` and `onboarding.state: 'done'`, keeps an existing
  `starterLockedAt`; a second guest upload restyles the same cat; registered path creates one cat, then
  reuses it, and sets a `pending` onboarding to done but leaves `done` untouched; `PATCH` renames record
  and cat and sets `named`; `POST /yourcat/manual` creates a playable cat with no S3 call and no budget
  write; the response never contains `originalKey`, `s3private` or an IP; another user's id → 404;
  `DELETE` deletes both objects and clears `originalSha256`; `DELETE` with a paid undelivered order keeps
  the original and answers `photoKeptUntilDelivery: true`; `DELETE` expires an open session; a record
  `pending` 60 s after creation reads as `failed`; a Gemini safety block marks the avatar failed and
  uploads nothing; no `createBlessingWithCat` call.
- `yourcat/portrait-checkout.spec.ts`: a second checkout with the same style returns the open session; a
  different style expires the old one first; an old session already complete → 409; the session has
  `adaptive_pricing.enabled: false`, `consent_collection.terms_of_service: 'required'`, `expires_at`, and
  `originalDeleteAfter` moves to at least now + 3 days.
- `yourcat/portrait-delivery.service.spec.ts`: lease prevents double work; 3 failures → alert and
  `failed`; success emails once (custom subject) and extends `originalDeleteAfter`;
  `deleteOriginalAfterDelivery` deletes the original after delivery.
- `yourcat/yourcat-retention.job.spec.ts`: originals after 30 days deleted; undelivered paid orders kept;
  orphaned owners swept.
- `image/image.public-routes.spec.ts` (update): `POST /image/portrait` has `AppAuthGuard`, `@AllowGuest()`,
  the throttler guards and `@SkipThrottle()`, multer limits and the photo filter set, the gate called with
  `portrait-preview`; regenerate is guest-allowed, refuses another owner's image, a guest on an owner-less
  image (403), `source: 'yourcat'` images and images with a `COMPLETE` order; `GET /image/:id` excludes
  `source: 'yourcat'`; `POST /image/search` has `AppAuthGuard` + `PermissionGuard(EDITOR)`; `POST /image`
  and `PUT /image/:id` drop `owner` and `source` from the body; both legacy checkout routes refuse a
  `source: 'yourcat'` image with 404, and `-signed` refuses another owner's image.
- `shared/utils/ai-portrait.spec.ts`: `loadImageBytes` refuses `s3private://` when `allowPrivate` is false
  and for keys outside `yourcat/originals/`; returns the S3 `ContentType` as `mimeType`.
- `image/image.webhook-yourcat.spec.ts`: the populate select includes `source`; EUR session completes an
  EUR order; a session with `currency_conversion` (Adaptive Pricing) is judged on `source_currency` and its
  amount; a USD $6 order created before the change still grants; a yourcat order skips
  `createBlessingWithCat`, starts delivery and uses `customer_details.email` when the user has none;
  counters incremented.
- Existing guards that must stay green: `guard-migration.spec.ts` (allow-list parity),
  `one-writer.spec.ts` (no second score writer), `earn-tails.ast.spec.ts`.

Commands (in `backend/`): `npm run lint`, `npm run build`, `npm test`; with a local Mongo also
`MONGO_IT_URI=… npx jest ai-budget.mongo`.

### B (client Jest in `client/__test__/`, Playwright in `client/e2e/`)

- `yourcat-contract.test.ts`: `client/models/yourcat.ts` matches `backend/src/yourcat/yourcat.contracts.ts`
  (error code list and status unions, read as text). Skipped with a clear message until A merges.
- `yourcat-prepare-upload.test.ts`: an empty `file.type` with a `.heic`/`.HEIF` name is accepted; a `.txt`
  with an empty type is refused; a decodable image is resized to ≤ 1600 px JPEG; an undecodable one is sent
  as is; the 10 MB check applies to the file actually sent.
- `yourcat-card-layout.test.ts`: every rect of both formats, with and without the panel, sits inside the
  safe area; long names shrink and never go under the minimum; panel absent → no panel rects.
- `yourcat-share.test.ts` (jsdom): `canShare` true → `share` called with `files` and `text` and **no**
  `url`, and called synchronously in the tap handler (no awaited promise before it); `AbortError` →
  `'cancelled'` and no event; no `canShare` → download path; clipboard failure path; `isInAppBrowser` true
  for Instagram, FBAN/FBAV and TikTok user agents and false for mobile Safari and Chrome.
- `yourcat-utm.test.ts`: the exact URL format; bad values dropped; no ids in the URL.
- `yourcat-pinkpaw.test.ts`: only `atShelter` cats named Judas/Raudvis/Zare/Simas with WAITING or
  RECOVERING are picked; HEAVEN, ADOPTED, `null` status and adopted-list cats never; fetch failure and
  empty lists → `null`, never a bundled fallback; the pick is stable per id.
- `yourcat-analytics.test.ts`: event names exact; no property key among `name`, `catName`, `url`,
  `photo`, `avatar`, `id`, `userId`, `email` (the avatar state is `avatarStatus`); events dropped without
  consent (use `createAnalytics` with a fake loader, as `analytics.test.ts` does); `portrait_paid` fires
  once per record; `begin_checkout` value equals `priceCents / 100` from a mocked status (no literal 14).
- `yourcat-api.test.ts`: lowercase `accesstoken`, `x-firebase-appcheck` sent; `ensureGuestSession` called
  before `upload`; error bodies mapped to the §1 messages; a plain 429 with no `code` maps to the burst
  copy, not the network copy.
- `yourcat-flow.test.tsx` (jsdom, mocked API): S3 shows as soon as `POST /yourcat` returns while the avatar
  is `pending`; polling follows the 1.5/2.5/4 s schedule, stops on `failed` at once and at
  `createdAt + 60 s`; polling pauses while hidden and resumes on `visibilitychange`; a fresh load with a
  record from `GET /yourcat/me` lands on S3; "Share"/"Download" are disabled until the variant blob exists;
  S5 is rendered after the share block and not inside it; focus moves to each new heading; the GIF is
  replaced by the still frame after 5 s.
- `yourcat-lobby-hero.test.tsx`: renders `GameSelect` (read-only) with a profile whose cat is
  `{ isStarter: true, catImg: '<family GIF>' }` and **no** `starterBreed`, and asserts the hero image is the
  GIF. If `GameSelect` cannot render in jsdom, assert the same through the smallest exported piece that
  computes `image`, or fall back to A's backend assertion plus a source-text pin on `GameSelect.tsx:306`.
- `auth-api-wrapper.test.ts` (update): `interceptOptions` gives `guestSession: true` for every new
  `/yourcat` write path and `requireAccount: false` for them.
- `yourcat-copy.test.tsx` (jsdom): rendered copy — the whole page with S5 **and** the Pink Paw switch
  visible together, and the card text strings — contains none of `donat`, `feeds`, `every purchase`,
  `proceeds`, `% to`, `goes to`, `supports the shelter`, `rescued`, `waiting for a home`, `reviews`,
  `rated`; no duration ("30 seconds") unless the measured flag is set; with `isApp` true the page shows the
  app notice and no price or upload input.
- `e2e/yourcat.spec.ts` (BackendMock fixtures; one test tagged `@ci-desktop`): upload → working → reveal
  with card → download on desktop; error copy for 429 (with and without a code); an in-app user agent
  (`Instagram`) shows the long-press view and no download button; `copy-scan` fixture passes;
  `authHeaderViolations` empty.

Commands (in `client/`): `npx tsc --noEmit`, `npx tsc -p e2e`, `npx eslint .`, `npm test`,
`node scripts/check-palette.mjs`, `node scripts/check-meta.mjs`; from the repo root
`node tools/copy-lint/bin/copy-lint.mjs` and `node scripts/sync-contracts.mjs --check` (must show no
change: B edits no `shared/` file). Optional before merge: `npm run build:app` and
`node scripts/check-app-export.mjs`.

### C

- `backend/src/payments/stripe-payment.service.spec.ts` (update): EUR card table 1400/4900/6900; USD
  digital 1600; `checkPaidCheckoutSession` accepts `eur` for EUR orders and `usd` for USD orders, refuses
  the other, honours the stored order price, refuses an underpayment, uses `currency_conversion` when
  present; `portraitCheckoutAmountCents('digital')` is 1400 while the PaymentIntent price for `digital` is
  1600; a $6 IMAGE intent created before `PORTRAIT_USD_PRICE_CHANGED_AT` verifies, one created after the
  grace does not, and an intent created after the change with `expectedAmount: 1600` is not accepted at 600.
- `backend/src/web3/order-catalogue.spec.ts` (new): IMAGE digital floor is 600 for an order created before
  the change plus grace and 1600 after; packs unchanged.
- `backend/src/web3/order-audit.spec.ts` (update): an EUR €14 FIAT IMAGE order has no finding; an EUR €10
  one is `BELOW_CATALOGUE`; a USD $6 digital order (legacy, Stripe and Stellar) has no finding; USD $16 has
  none.
- `client/__test__/portrait-prices.test.tsx`: reads `backend/src/payments/price-table.ts` and asserts
  `client/models/portrait-prices.ts` equals it (both currencies); `PreviewPage` renders €14/€49/€69 with
  no strike-through and no timer; the codex flow shows $16 (`ImmortalizePetFlow` copy).
- `client/__test__/portrait-no-fabricated-proof.test.ts`: scans `client/pages`, `client/features/portrait`,
  `client/components/codex` text for `Trustpilot`, `167 reviews`, `As Seen In`, `Forbes`,
  `New York Times`, `VOGUE`, `ELLE`, `#1 in Pet Portraits`, `50K+`, `4.9/5`, `useCountdown`,
  `originalPrice`, `Discount expired`, `Expires in`, `money-back`, `$20 value`, `@catmom_sarah`,
  `unsplash.com`, and the regex `/\$6(?!\d)/` (so `$60` and `$69` do not match) → none found (copy-lint
  cannot catch these, R1 counts only players and cats).
- `client/__test__/image-api-auth.test.ts`: `uploadImage` calls `ensureGuestSession`, sends `accesstoken`
  and `x-firebase-appcheck` from `getLimitedUseAppCheckToken`; regenerate maps 401 and 403
  `GUEST_FORBIDDEN` to `SignInRequiredError`.
- `client/__test__/preview-checkout-path.test.tsx`: a guest profile (`isGuest: true`) uses the email
  checkout path, a registered profile the signed one.
- `client/__test__/image-api-regenerate.test.ts` (update): headers and the 403 case.

Commands: backend `npm run lint`, `npm run build`, `npm test`; client `npx tsc --noEmit`, `npx eslint .`,
`npm test`; root `node tools/copy-lint/bin/copy-lint.mjs`.

---

## 10. Out of scope, deferred, launch conditions, decisions and known bugs

### Out of scope / deferred

- An entry point to `/yourcat` from the landing page or `/game` (share links are the entry for now).
- A custom 1200x630 OG image for `/yourcat` (uses the default `logo/og-v2-1200x630.jpg`).
- Moving the growth events and `YOURCAT_*` codes into `shared/` (needs a `catnip-heist/` sync; after the
  hackathon hold).
- Carrying a guest's photo cat through a merge into an existing account (changes decision #8).
- Withholding `aiUrl` on the `/portrait` preview flow (needs a watermarked low-res preview and a change to
  the `GET /image/:id` contract that `/portrait` polls).
- Camera capture in the native apps (needs `NSCameraUsageDescription` and the Android `CAMERA` permission).
- Upload from the native apps at all, and their privacy labels.
- Stripe Tax / VAT handling on the EUR price (the displayed price is the total charged; no "incl. VAT"
  line until that is true).
- Any shelter share of portrait sales: not advertised until the first payment exists and a fact backs it
  (`docs/CLAIMS.md`; no such fact is in the public `facts.json`).
- A job queue for AI work (the avatar runs in-process after the response; delivery has a sweeper).
- Purging the CDN cache on delete (the avatar has `max-age=3600` and the notice says so).
- Running `heic-convert` in a worker thread (the pixel check before conversion bounds the work).

### Launch conditions

`YOURCAT_ENABLED=true` only when all of these hold (A lists them in `docs/BACKEND.md`):

1. The client IP is provable: `CF_ORIGIN_SECRET` set with the Cloudflare Transform Rule in place, or
   `TRUST_PROXY` set to the right hop count (§3.1). Otherwise every upload answers `NO_CLIENT_IP`.
2. App Check is real: `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` set on Vercel, replay protection on, and
   `AI_UPLOAD_APPCHECK_ENFORCE=true` with `AI_UPLOAD_IP_DAILY_UNVERIFIED=0`.
3. The production Gemini key is on a billed plan (`docs/plans/revenue-kickstart.md:204`), so the S1-P
   "no training" sentence is true; OpenAI API data is not used for training by default.
4. The controller's legal name and address are filled into S1-P (`{Controller}`).
5. One test upload passes on production.

`YOURCAT_PORTRAIT_ENABLED=true` only when, in addition: the Stripe account has a terms of service URL set
(required by `consent_collection.terms_of_service`), Adaptive Pricing is confirmed off for these sessions,
and one real card purchase is delivered end to end.

### Your call (defaults apply if no answer)

| Decision | Default |
|---|---|
| Turn `/yourcat` on | `YOURCAT_ENABLED=false` until the launch conditions hold; then `true` |
| Turn the HD upsell on | `YOURCAT_PORTRAIT_ENABLED=false` until its launch conditions hold |
| Card currency | EUR on Stripe Checkout (€14 / €49 / €69); USD rails $16 digital |
| Captcha | Firebase App Check with limited-use tokens and replay protection; enforced for `/yourcat` from launch |
| `/portrait` before the App Check site key is set | Every visitor is "unverified": 1 preview per IP per day, shared with regenerate. This may cut `/portrait` conversion; the alternative is raising `AI_PREVIEW_IP_DAILY_UNVERIFIED` to 2–3 (the €3 preview sub-cap still bounds spend). Default: 1, and set the site key soon |
| `/portrait` without a provable client IP | **Current behaviour (since 2026-10-11):** in production a preview from an address that is not proven (no `CF_ORIGIN_SECRET` header, no trusted proxy) is not keyed on the raw `cf-connecting-ip`; every such request shares one site-wide `untrusted` bucket with its own caps, `AI_PREVIEW_UNTRUSTED_DAILY` (default 5 a day) and `AI_PREVIEW_UNTRUSTED_FAILURES_DAILY` (default 20), inside the €3 preview sub-cap; the per-minute throttler shares one bucket the same way. So until `CF_ORIGIN_SECRET` and the Transform Rule are live, all `/portrait` visitors together get 5 previews a day. **Still open for the founder:** keep 5, raise it, or set `CF_ORIGIN_SECRET` before v2 reaches `main` (YOURCAT.md launch checklist, step 0–1). Default: keep 5 and set the secret before the push |
| Guest purchase of the HD portrait (exception to decision #9) | Allowed for `/yourcat` only, by card, email collected by Stripe; the guest note still invites an account |
| Guest regenerate on `/portrait` | Allowed for images the guest owns, under the preview caps |
| Delete while a paid portrait is undelivered | The photo is kept until delivery, then deleted; the dialog says so |
| Withdrawal acknowledgement | A required Stripe Checkout terms checkbox with the §2.4 text on digital portraits (all surfaces) |
| Style example images in S5 | The existing `/portrait/{style}-1.webp`, described only as showing each style (their origin is not claimed) |
| Training sentence in the privacy text | Stated as "Neither uses it to train its models", which is why the billed key is a launch condition |
| The `/portrait` preview `aiUrl` leak | Fixed 2026-10-11 (KI-08): the 4K output stays private until paid and the routes answer a watermarked preview; images made before the fix keep their public file |
| "Redo once" promise on the HD portrait | Yes, handled manually by support |
| Guest merge drops the photo cat | Keep decision #8; the reveal copy warns |
| Analytics placement | Client-only growth catalog (no `catnip-heist/` diff) |
| Daily AI budget | €5 per UTC day shared by uploads and previews, previews capped at €3 of it; paid deliveries outside it |
| `PORTRAIT_USD_PRICE_CHANGED_AT` | The day v2 is deployed, 00:00 UTC, with a 48 h grace for $6 USD payments created before it |

### Known bugs to mention (in `docs/BACKEND.md` / `docs/CLIENT.md` Known issues; not fixed silently)

Owner in brackets writes the docs entry.

- `POST /image/portrait` returns the full 4K `aiUrl` before payment, and `GET /image/:id` exposes it
  publicly, so the paid digital portrait on `/portrait` and `/portraits` can be downloaded free. New entry.
  `/yourcat` avoids it by generating only after payment. [A]
- `POST /image/search` listed every image (preview photos and paid 4K portraits) to anyone; this bet puts
  it behind `PermissionGuard(EDITOR)`. Record it as found and fixed. [A]
- `POST /image/create-checkout-session` accepts an arbitrary `body.userId`, so an order and its cat can be
  attributed to any user (`image.controller.ts:312-323`); it now refuses `source: 'yourcat'` images, the
  rest stays. [A]
- `PUT /image/portrait/:id/regenerate`: images without an owner can still be regenerated by any signed-in
  registered user (`docs/BACKEND.md:893`); images created after this change carry `owner` and are checked,
  guests are limited to their own images, and images with a `COMPLETE` order are refused. [A]
- `POST /image` (`PermissionGuard(0)`) copies the request body into the record; `owner`, `source` and
  `aiUrl` are now stripped, other fields are still caller-controlled. [A]
- `POST /blessing` permission check is inverted (`blessing.controller.ts:161`) and its projection omits
  `shelter`. [A]
- `hasWhiteBorders` indexes pixels as RGBA but sharp `.raw()` on an RGB image gives 3 channels
  (`ai-avatar.ts:283,291`). [A]
- `generateCat` picks a random edition: 123 of 1606 family × edition sheets are 403 on the CDN (all of
  `PEACHES`, many vampire, pumpkin-head and lighting), and the list includes `cigarette`, `hat-*-cigarette`
  and `jesus`. Without `screen` it never answers "no cat". This still affects `POST /blessing` and paid
  portrait cats; `/yourcat` forces `base` and screens. [A]
- `createBlessingWithCat` classifies the painted portrait, not the original photo (`cat.service.ts:400-466`). [A]
- `uploadFileImage` does not apply EXIF orientation (no `.rotate()`); other upload paths still lose it. [A]
- `isTemporary` is stored but never read; `/image/portrait` uploads are public-read with no cleanup. [A]
- Resolved: `generateCatAvatar` was an unimplemented stub; it is no longer in the code (checked 2026-10-11), and BACKEND.md's dead-code list says so. [A]
- The SendGrid subject "Your order is on its way!" is used for digital orders (`image.controller.ts:66`);
  `/yourcat` deliveries pass their own subject. [A]
- Global throttler buckets are shared while `TRUST_PROXY` is unset (the `/yourcat` and `/image/portrait`
  routes now use per-user and per-client-IP throttlers instead); `cf-connecting-ip` can be forged by a
  request straight to the origin (`docs/BACKEND.md:737-742,843-849,941`), which the guest treat route still
  trusts; the 50 MB global JSON limit (`docs/BACKEND.md:61`). [A]
- App Check tokens on `POST /user/guest/session` are verified without replay protection (reusable for
  their lifetime). [A]
- The consent banner does not name GTM and never shows with a GTM id but no PostHog key
  (`docs/CLIENT.md:586`); funnel events are zero without consent. [B, in `docs/YOURCAT.md`]
- The native app privacy labels omit PostHog, the guest id and App Check (`docs/MOBILE.md:182`); `/yourcat`
  keeps upload web-only so it adds nothing there. [B, in `docs/YOURCAT.md`; `docs/MOBILE.md` is not edited]
- `utils.shareURL` ignores its `text` argument; `ShareModal` toast typo "coppied" (lines 55 and 66). [B, in
  `docs/YOURCAT.md`]
- The client `OrderStatus` lacks `LOCKED` and `FAILED_GRANT`; the client `CurrencyType` lacks `USD` and
  `EUR`. [C]
- `client/models/cats.ts` and `cms/models/cats.ts` `Prices.generatedCat: 5` is unused. [C]
- The client `engines` field says Node 24 while CI uses Node 22. [C]
- CI does not run on pushes to `v2` (`.github/workflows/ci.yml:22-25`); run the §9 commands locally. [all]

---

## Review log (2026-10-11, third pass)

Every point of the three reviews was checked against the code. Accepted points are folded into the
sections named; points accepted in a changed form or rejected have a one-line note.

**Code truth.** 1 §4.1 (`starterBreed: '$$REMOVE'`) and §9 B lobby test; `GameSelect.tsx` stays unowned
and untouched. 2 §3.2–3.3 (`$not: { $gt }`, retry once on E11000). 3 §6.6. 4 §2.2, §2.4, §6.6: guests may
regenerate, but only images they own (owner-less legacy images stay registered-only, so C handles 403 too).
5 §2.4, §8 A (`PortraitCheckoutService`, `order-email.ts`, populate `source`). 6 §6.2–6.3
(`PORTRAIT_USD_PRICE_CHANGED_AT` + 48 h grace through `portraitUsdFloorCents`; `order-catalogue.ts` to C).
7 §2.2 (per-user and per-client-IP throttlers, `@SkipThrottle`), §S3 (polling schedule), §S2 (plain
429). 8 §2.1, §2.3 (`PhotoUploadExceptionFilter`, `statusCode` in the body). 9 §7.1. 10 §S5, §8 B.
11 §6.6, §10 "Your call". 12 §3.3 (`AiUsage`, one signature, `KIND_COUNTERS`). 13 §9 A (opt-in Mongo spec
plus a fake-collection unit test). 14 §2.7. 15 §2.6. 16 §2.5, §2.8, §6.5 (photo kept until delivery; the
impossible "failed with no cat" rule removed; one `Image` per record and status from its orders). 17
§2.1 `named`. 18 §4.2 step 4 (pending registered accounts are set to done). 19 §2.2, §10. 20 §8 B. 21 §9 C
(`codex-copy.test.tsx` dropped from C's list; the $16 check is in `portrait-prices.test.tsx`). 22 §6.2.
23 header, facts, §3.2, §5.1.

**Security and cost.** 1 §3.1, §10 launch conditions. Changed form for (a): the TCP peer in production is
the DigitalOcean balancer, not Cloudflare, so the proof is a Cloudflare-added origin secret header or, under
`TRUST_PROXY`, a Cloudflare range check on `req.ip`. (b) needs a `firebase-admin` bump (11.4.1 has no
`consume`). 2 §2.2 (per-client-IP throttler instead of making `TRUST_PROXY` a hard condition; either proof
of §3.1 is required for `/yourcat`). 3 §2.4. 4 §2.4: `source: 'yourcat'` refused on both legacy routes
and owner checked on `-signed`; changed form for the unsigned route, which has no caller identity to compare
(its owner-set preview images already leak their `aiUrl`, a documented issue). 5 §2.3 steps 6–7, §3.3
`screen`, §4.3 (null on a safety block). 6 §3.1 layer 5, §3.2, §2.6; changed form for the HEIC timeout: a
`Promise.race` cannot interrupt `heic-convert`'s synchronous work, so the `ispe` pixel check before
conversion is the real bound. 7 §2.3, §3.3, §3.5. 8 §3.1 (last paragraph). 9 §2.8, §6.5. 10 §6.5. 11 §2.4,
§6.4. 12 §S1-P, §2.5, §10; changed form for (d): a 1 h cache lifetime stated in the notice instead of a
purge API (no new DigitalOcean API token). 13 §2.7; changed form for (b): `PUT /image/:id` is editor-only
and keeps `url`/`aiUrl` editable, which `loadImageBytes` now neutralises; `owner` and `source` are stripped
on both routes, `aiUrl` on `POST /image`. 14 §2.4.

**UX and honesty.** 1 §1, §S1, §S3 (three taps; the server still requires the `consent` field as a
confirmation flag and stores `consentAt`). 2 §S2, §S3, §S1, §7.1. 3 §2.3, §3.3 (`screen` option on the
existing `generateCat`, as the bet asks to keep that classifier). 4 §5.6, §S3, §9 B; `long-press` records
that the save view opened, since a save cannot be detected. 5 §5.3, §5.6. 6 §S2, §S3. 7 §S5, §7.1, §2.4;
changed form for the examples line: "real portraits from other cats" is not verified for the existing
images, so the copy says only that they show each style. 8 §5.2 (no status line). 9 §1.5, §1.0, §2.2
(`POST /yourcat/manual`). 10 §1.6. 11 §S1. 12 §S2, §1.0. 13 §S2, §S3, §2.2 (`PATCH /yourcat/:id`). 14 §7.1.
The extra copy test (S5 and the Pink Paw panel together) is in §9 B `yourcat-copy.test.tsx`.

No point was rejected outright. One rule was added while folding them in: `PATCH /yourcat/:id` (UX 13)
would bypass the game's rename cooldown, so it works only inside a 24 h naming window (§2.3).
