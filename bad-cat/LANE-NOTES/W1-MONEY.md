# W1-MONEY handover

## Built

- `src/money/api.ts`: JSON client. 8 s timeout, `credentials: 'omit'`, never an `accesstoken` header. https base only
  (http for localhost). No base, or `env.clubUi !== true`, means offline: every call answers locally and makes zero requests.
- `src/money/core.ts`: `createMoneyCore(deps)`, which provides:
  - `status()`, cached per session; all false when offline or when the server is off.
  - The entitlement cache `{ token, entitlements }` under the store key `entitlements`, and `refreshEntitlements()`
    (`POST /badcat/entitlement {token}`).
  - `checkout()`: builds a `CheckoutRequest`. `returnBase` is origin + `/badcat` on tokentails.com, otherwise the
    standalone base. `meta` is filled with `from_in_app`, `ab_arm`, `session_index`, and `via` from the store key `via`.
    It opens Stripe in the same tab with `location.assign` and tracks `bc_checkout_start`.
  - `completeCheckout()`: polls about every 1.5 s for up to 20 s while pending, stores the token, and tracks
    `bc_checkout_complete` once per Stripe session.
  - `restore`, `verifyRestore` (tracks `bc_restore`), `portal`, `redeem`, `setClubCat`, `uploadFace` (PNG only,
    64 KB max) and `requestCreatorCode`.
  - `cameos(dayNo, {spectators})`: one `GET /badcat/cameos?day=&s=` per day per page session when `status.cameos` is on,
    otherwise an offline Pink Paw bundle. `seen()` tracks `bc_cameo_seen` once per cat per session.
  - `paywall()` and `markPaywallShown()`, which records one card per session in the store key `paywall` and tracks
    `bc_paywall_view`.
- `src/money/paywall.ts`: `decidePaywall` (pure) and the GDD 9.2 copy. A/B arm A shows the card on `post_share`, arm B on
  `perfect_crime`. During S1, even session numbers show the gift card in place of the Club card. Club members only ever
  see the gift card.
- `src/money/cameos.ts`: `fnv1a`, `shuffleFor`, plus a sanitiser for server bundles (cat-code regex, https or relative
  face URLs only) and the offline bundle.
- `src/money/screens.ts` + `money.css`: Club sheet, Thanks, Redeem, Restore, Cameo/guest star, Gift, Shop, Brand and the
  Offer card. When offline or when the server flag is off, every screen shows a "Coming soon" card.
- `src/money/index.ts`: `createMoney(deps)` returns `MoneyApiX` (`MoneyApi` plus `online`, `safariPayLink`, `needsRefresh`).
  `defaultMoneyDeps()` and the lazy `money` instance build nothing until first use.
- `src/platform/entitlements.ts`: `getEntitlements(store?, now?)` stays synchronous. It decodes the cached token payload
  without verifying it, trusts it until `expiresAt`, and otherwise returns FREE. `Entitlements` is now the `types.ts` type.
  Also added: `ownsCosmetic` and `cosmeticsForSkus`; the bundle expands to the 3 shop items.
- `src/platform/cameos.ts`: self-contained offline `loadCameos` (Pink Paw cats rotated by day) and `cameosEnabled() = false`.
- `src/platform/checkout.ts`: unchanged (`openPresale`).

## Wiring for W3-UI-SHELL / integrator

- `main.ts`: `services.money = createMoney(defaultMoneyDeps({ env: platform.env, store: platform.store, sessionId: platform.sessionId, abArm: platform.abArm, track: platform.track }))`, binding the platform methods.
- Thanks route: read `session_id` from the Stripe return URL and call `mount.thanks`. Restore route: read `?t=` and call
  `mount.restore({ token })`. Redeem route: read `?code=`. The Safari pay link is `<base>/club?sku=<sku>`, and
  `mount.club` accepts an extra `sku` prop to preselect the plan.
- `PaywallContext.serverCheckout` must be `status.checkout && env.clubUi`. Call `paywall()` only after the share sheet
  has been shared or dismissed. `mount.offerCard` already calls `markPaywallShown` (it is idempotent).
- Pass the cat name to `mount.club` in `catName`. Brand, cameo and redeem take an optional `dayLabel`.

## Deviations and gaps

- Prop extensions not yet in `types.ts` (`breaksTonight`, `onSecondary`, `todayNo` and `dayLabel` on redeem, thanks and
  brand) are handled with local adapter types. Change requests are filed in FULL-PLAN.md.
- Money imports `../platform/entitlements` directly, a file this package owns. A change request asks
  `platform/index.ts` to re-export it.
- I chose the face upload body myself, `{ token?, sessionId?, png: base64 }`, so the backend has to accept that shape.
- Weekdays are computed locally (Day #1, 2026-11-16, is a Monday) so money does not import content. Guest stars are
  Fridays only. Sponsor weeks are the Saturday boss rooms.
- Not built: the creator-code request screen (the API method exists; the Settings form is W2-META's), and the
  "Gift a cat owner" result-screen card (the shell decides with `paywall({trigger:'gift_s1'})`).
- `tsc` currently shows errors in other lanes' files (sim, audio, progress tests) and one failing analytics test in
  `platform.test.ts` (common props, W1-PLATFORM). None are in money files.
