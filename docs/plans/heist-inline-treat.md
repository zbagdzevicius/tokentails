# Catnip Heist: send the treat in place

Founder request (2026-10-15): "It should be allowed to send a treat from that modal itself without navigating away.
Same thing for Catnip Heist as well, as that navigation will clear in-game progress and is bad UX."

Branch `feat/heist-inline-treat` (from `origin/main`). Package H owns every file this plan lists. No push.

## Today

The results screen and the payouts modal show `giveButton(catName)` (`catnip-heist/src/ui/ui.ts:201-208`), an
`<a target=_blank>` to `/shelter-payouts/give`. In iOS home-screen apps, in-app browsers and WebViews this replaces
the game view. The player loses the results screen, a live run (the modal also opens from the pause menu), and any
save still in flight. The Heist bridge (`shared/heist-bridge.ts`) has no treat message, and `shared/**` is off limits.

## Design

1. **Panel** (`catnip-heist/src/ui/treat.ts`, new). `createTreatPanel({ send, rail, web, catName, onClick })` returns
   `div.ch-treat[data-testid=treat-panel][data-state]` with a `<button class="ch-give" data-testid="give-treat">`.
   It replaces `giveButton` in the results screen and in `giveCta`. One send state is shared by both places.
   Fixed row height so phone landscape does not jump.

   | State | Copy | Control |
   |---|---|---|
   | checking | "Checking today's shelter treats…" | disabled |
   | ready | "Send Pink Paw a rescue treat 🐾" | button |
   | sending | "Sending your treat…" (`aria-busy`) | disabled |
   | sent | "Treat sent! Token Tails sent Pink Paw a free {treat}." + "See receipt ›" (new tab, https only, web only) | none |
   | already | "Today's treat already went out. Back at 00:00 UTC." | none |
   | used-up | "Today's treats are gone, back at 00:00 UTC." | none |
   | paused | "Treats are paused right now." | none |
   | soon | existing "Opens soon" chip | none |
   | failed | "The treat did not go through. Try again." | Retry |
   | unavailable | "Play on tokentails.com/heist to send a treat." | Copy link (never a same-tab anchor) |

   Every state except `soon` shows "Held by Token Tails for the shelter until handover." App builds (`!web`) keep
   today's rule exactly (button only when `copy.showGive`), with no receipt link and no chain or coin words.
   The modal shows the button only when the rail is live.
2. **Sender** (`catnip-heist/src/embed/treat-bridge.ts`, new). `{ status(), send(chainId?) }`.
   - Embedded: own channel `'tt-heist-treat'` v1 (`treat-hello`, `treat-send`, `treat-me` up;
     `treat-ready`, `treat-result`, `treat-me-result` down). Same-origin and `event.source` checks; `reqId` and `cat`
     at most 64 chars, `chainId` a positive integer. No answer in 20 s gives `failed` with retry; never a direct POST
     after a bridge send.
   - Standalone, or no `treat-ready` within 1.5 s: `POST ${apiUrl}/shelter/donate/guest` with
     `{source:'heist', chainId?}`, JSON headers, `credentials:'omit'`, 15 s abort; `GET ${apiUrl}/shelter/donate/guest/me`.
     Mapping: 200 sent (receipt), 429 `DONATE_ALREADY_TODAY` already, bare 429 failed, `DONATE_BUDGET_SPENT` used-up,
     other 409 or 503 paused, 424 failed, TypeError failed then unavailable on the second, empty `apiUrl` unavailable.
   - Wired in `src/main.ts` / `src/app/App.ts` as `UIOptions.treat`; without it the panel is `unavailable`.
3. **Host** (`client/components/heist/treatBridge.ts`, new; `HeistHost.tsx` second effect). Answers `treat-ready`,
   calls `sendTreat({ chainId, source: 'heist' })` (signed-in account first, then guest) and `fetchDonateMe()`, maps
   the result, one send at a time, cached per `reqId`. Tracks `treat_sent` like `ImpactTab`. Never navigates, never
   opens sign-in.
4. **`client/components/codex/impact/treat.ts`**, additive: optional `source` (default `'page'`) and an optional
   `receipt` on `sent` parsed from the 200 body. `ImpactTab` unchanged.

## Ownership (package H)

`catnip-heist/src/ui/treat.ts`, `catnip-heist/src/ui/ui.ts`, `catnip-heist/src/ui/shelter-payouts.ts`,
`catnip-heist/src/ui/styles.ts`, `catnip-heist/src/embed/treat-bridge.ts`, `catnip-heist/src/main.ts`,
`catnip-heist/src/app/App.ts`, their tests, `catnip-heist/e2e/give.spec.ts`, `client/components/heist/treatBridge.ts`,
`client/components/heist/HeistHost.tsx`, `client/components/codex/impact/treat.ts`, new client tests, and the rebuilt
`client/public/heist-game/**`. Not touched: `shared/**`, `backend/src/shelter/**`, `client/components/shelter-payouts/**`,
`contracts/**/src`. Requests to other owners go in `requests/<pkg>.md`.

## Acceptance

- `catnip-heist`: `npx tsc --noEmit`, `npx vitest run` (new `treat-bridge.test.ts`, `treat-panel.test.ts`; updated
  `shelter-payouts.test.ts`), `HEIST_E2E_PORT=55xx npx playwright test e2e/give.spec.ts` with the POST mocked by
  `page.route` (sending, sent with receipt, already, used up, failed then retry, Opens soon; `page.url()` unchanged,
  results and score still on screen; `give-treat` is a button with no `href`). `location.href` and `window.open` never
  touched in unit tests. A fake fetch is asserted as the only fetch called.
- `npm run build:client` regenerates `client/public/heist-game`, committed.
- `client`: `npx tsc --noEmit`, `npx eslint` on changed files, `npx jest` (new `heist-treat-host.test.ts`,
  `heist-treat-parity.test.ts`, `sendTreat` source and receipt tests).
- Screenshots of the results screen and the modal at 390x844, 844x390, 667x375 (touch), 1024x768, 1280x720,
  1920x1080 with the POST mocked, under the scratchpad `inline-treats/heist/`, every image read.
- Never a real POST to api.tokentails.com. Ports 54xx/55xx only (never 4391 default, 5173, 5180, 3000, 3005).
  `node_modules` symlinked from tokentails-app for `catnip-heist` and `client`, removed before commit. Commit locally
  on `feat/heist-inline-treat`, never `client/.vitest/` or `client/next-env.d.ts`.

## Mention, not fix

- `www.tokentails.com` has no rail (not in `DEFAULT_API_BY_HOST` or CORS); standalone there shows `unavailable`.
- A treat from the modal before any rescue carries no cat name; harmless.
- Standalone sends use the guest route even for signed-in players; only the embedded `/heist` uses the account.
