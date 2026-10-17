# F-DATA notes (Moon Rave checkout, CHECKOUT-SPEC.md section 11)

## Done (only `src/data/**` touched)
- `src/data/index.ts`: `sourceOf('tt:rave:…') → 'rave'`; `stripMemo` / `normalizeEvent` keep only `raveOrderId`
  (`rv_<16 hex>`, parsed from `tt:rave:<16 hex>`, Tempo trailing NULs tolerated). New exports: `DataPayoutSource`,
  `RavePayout`, `raveOrderIdFromMemo`, `cleanRaveOrderId`, `raveOrderIdOf(payout)`. `SOURCE_LABEL.rave = 'Moon Rave ticket'`.
  The count rule is unchanged (floor of total USD; duplicate events deduped by chain:tx:logIndex).
- `src/data/rave-orders.ts`: `createRaveOrders({ api, feed, myOrders?, onOrderGone?, fetch?, now?, visibility? })`.
- `src/data/rave-orders.test.ts` (17 tests).

## API for the integrator (main.ts / hud / crowd)
```ts
const orders = createRaveOrders({ api, feed, myOrders: () => readMyOrderIds(), onOrderGone: (id) => forgetMyOrder(id) });
await feed.load(); await orders.load(); feed.startPolling(); orders.startPolling();
orders.namesForCat(cat)  // { orderId, position, name | null, x | null, xUrl | null } or null (not a rave cat / demo)
orders.arriving()        // { count, orders: RaveOrderView[] }: holograms; NEVER add count to the counter
orders.arrivingNames(64) // CatName[] for hologram labels
orders.recent(20)        // arrivals list: arriving + landed this session (phase, delayed, payoutUrl, xUrl, previewNames)
orders.onLanded(e => …)  // NameShoutout { order, cats, names, x, xUrl, text: "Shout-out to Mochi, Pixel and 3 more! Shout-out to @someone!" }
orders.subscribe(() => …) // any change (re-render arrivals / ghosts)
orders.track(checkoutAnswer, 'paid' | 'pending') // right after confirmPayment / usdc-tx; also fast-polls 5 s for 2 min
orders.boost()
```
- `xUrl` is built here from a re-checked handle (`^[A-Za-z0-9_]{1,15}$`); render `<a href=xUrl target=_blank rel="noopener nofollow ugc">@handle</a>` with `textContent`. Names are text only.
- Shout-outs fire once per order, only for payouts that land after our first look (no shout for history), and only
  when the block is < 15 min old, the order is the viewer's, or it was seen arriving against a live feed.
- When an order turns `onchain` but the feed lacks it, `feed.refresh()` runs at 30 s and 150 s.
- Own orders: `GET /rave/orders/:id` (≤ 4 per poll) is authoritative; 404 / canceled / refunded / expired → `onOrderGone`.
- `/rave/cats` read: full at load and every 10 min (`limit=500`, `before` paging), newest page on other polls; 60 s
  cadence with back-off; paused when the tab is hidden. A 404 (backend without the route) just leaves nothing named.

## Needs others
- **Spec owner / integrator (crash risk):** add `'rave'` to `PayoutSource` in `src/types.ts` and a `rave` entry to
  `SOURCE_LABEL` in `src/ui/format.ts` (e.g. 'a Moon Rave ticket'). format.ts:152 calls `.replace` on the label, so a
  live rave payout throws there until it has one. `normalizeEvent` casts `'rave'` to `PayoutSource` meanwhile.
- **`scripts/snapshot.mjs`** (spec gives it to F-DATA, but this run was limited to `src/data/**`): add
  `if (m.startsWith('tt:rave:')) return 'rave';` and write `raveOrderId` (same regex) so the bundle keeps the order id.
  Until then bundled rave payouts read as 'gift'; names still resolve through `payoutTx` once `/rave/cats` answers.
- **F-CHECKOUT:** pass `myorders.ts` ids via `myOrders`, call `orders.track(answer)` after payment succeeds.
- **Crowd:** `setNextCat` draws one forming cat; ghosts for `arriving().count` need a crowd API change.
- **B-BACKEND:** contract assumed exactly as spec section 4 (`orders[]`, `nextBefore`, statuses `pending|paid|onchain`,
  own GET may also return `created|review|canceled|refunded|disputed|expired`).
