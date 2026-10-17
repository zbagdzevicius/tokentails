# F-CHECKOUT notes (Moon Rave checkout, CHECKOUT-SPEC.md section 11)

Only `src/checkout/**` was touched. `npx tsc --noEmit` is clean, and `npx vitest run` passes 187/187 (60 of those tests are in this lane).
The sheet was checked in a throwaway harness on a dev server at 390×844 and 1280×800, then the harness was deleted. That check covered the build step, inline errors, the Stripe load-error state and the USDC flow with a fake wallet through to the done step. It was never run against a real Stripe key, the backend, or a chain.

## API for the integrator (hud.ts `buildAdd()` / main.ts)
```ts
import { createRaveApi } from './checkout/api';
import { mountCheckout } from './checkout/sheet';          // imports checkout.css itself
import { createArrivalsList } from './checkout/arrivals';
import { readMyOrderIds, forgetMyOrder } from './checkout/myorders';
import { shoutOutText } from './checkout/names';           // DJ canvas text (no link)
import { xLink, xProfileUrl } from './checkout/xhandle';  // cat card / HUD toast link

const raveApi = createRaveApi({ base: api });             // api = API_BY_HOST value
const status = await raveApi.status();                    // 2 s timeout, never throws; { enabled:false } → today's sheet
// in buildAdd(), when status.enabled:
const co = mountCheckout(sheetBody, {
  api: raveApi, status,
  onPaid: (o) => { orders.track(o.answer, o.status === 'paid' ? 'paid' : 'pending'); /* holograms: o.names, o.x */ },
  onOrderUpdate: (row) => {},                             // optional
  onDone: () => closeSheet(),                             // "Watch them land"
});
// on sheet close: co.destroy()  (stops the order poll, unmounts Stripe)
const arrivals = createArrivalsList({ title: 'Arriving now' }); // el → mount in HUD; arrivals.update(orders.recent(8))
createRaveOrders({ api, feed, myOrders: readMyOrderIds, onOrderGone: forgetMyOrder });
```
- `PaidOrder` = `{ orderId, cats, names (expanded, ≤1000), x, method, status: 'paid'|'pending', txHash, chainId, answer }`.
- `arrivals.update()` takes the data lane's `RaveOrderView[]` directly (structural type `ArrivalView`).
- The HUD sets `pointer-events: none` on every `#hud *`; checkout.css turns it back on under `.rvc`. If the
  sheet is mounted elsewhere, nothing else is needed.
- `hud.shout(text, {href,label})`: pass `xProfileUrl(handle)` as `href`. Its `rel` must become `noopener nofollow ugc` (integrator, hud.ts).

## Needs others
- **H-HOSTING / dev:** `names.ts` and `xhandle.ts` import `../../../shared/name` (the server's own `normalizeCatName` /
  `isBlockedCatName`, exact parity). It loaded fine in dev with the current `server.fs.allow`; if that list is ever
  narrowed, keep `../shared` in it. `usdc.ts` lazy-imports `../../../shelter-rail/src/sdk.mjs` (typed by `sdk.d.ts`,
  `@ts-ignore` on the import line).
- **H-HOSTING:** `src/checkout/_probe.ts` was my temporary probe; it is deleted (tsc is clean).
- **B-BACKEND (assumed contract):** error body `{ statusCode, code, message, fields? }`. `RAVE_NAME` comes with
  `fields: [{ index: n | 'rest', code }]`. For `RAVE_X_HANDLE`, the sub-code (`X_HANDLE_INVALID` / `X_HANDLE_BLOCKED`) can go in
  `fields[].code` or be the top-level `code`; both are read. The client sends `names` as normalised strings, with `''`
  for an empty field. `x` is sent as the bare handle (already normalised) or `''`. The usdc answer must have
  `usdc.amountUnits6 === String(cats * 1e6)`, or the sheet refuses to open the wallet.
- **Crowd / integrator:** `onPaid` is where the floor's arriving holograms start (`o.names` for labels).

## Gaps
- No jsdom in the package, so `sheet.ts` / `arrivals.ts` / `stripe.ts` DOM code has no unit tests. Pure logic is tested:
  amounts, the fee table, names, X handles, API parsing, myorders, and the USDC chain pick (also checked against the real SDK plus
  `client/public/shelter-payouts/deployments.json`).
- The Payment Element was only seen in its load-error state (fake key). A real test-mode run (`pk_test_` +
  backend) is still to do, including Apple Pay (needs the domain registered) and the 3DS test card `4000 0027 6000 3184`.
- USDC: the buyer pays gas. The approve + disburse path asks the wallet twice. There's no "switch network" UI beyond
  the SDK's `wallet_switchEthereumChain` / add.
