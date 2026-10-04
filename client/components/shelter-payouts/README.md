# Shelter payouts page (`/shelter-payouts`)

Read-only transparency page. It lists every `Disbursed(address indexed shelter, uint256 amount, string memo)`
event from each ShelterSplit deployment, read in the browser with plain `eth_getLogs` calls to the
chain's public RPC. No backend, no wallet, no new dependency.

## Data source

`client/public/shelter-payouts/deployments.json` is the list of deployments. It ships as `[]`, and the
page shows an empty state until it has entries.

After a deploy wave, `fund a:ingest` (run from `funding/framework`) writes the real deployments to
`funding/framework/tracks/a-build/deployments.json`. Copy that file here:

```sh
cp funding/framework/tracks/a-build/deployments.json client/public/shelter-payouts/deployments.json
```

Only `chainId` and `address` are required per entry. The page also uses:

| Field | Use |
|---|---|
| `tx` | Deploy tx. Its receipt gives the block where the log scan starts. |
| `fromBlock` | Scan start block. Set it by hand if the RPC rejects the range. |
| `rpc`, `explorer` | Override the built-in public RPC and explorer in `chains.ts` (needed for chains not listed there, such as Robinhood Chain). |
| `decimals`, `symbol` | Override the payout token display (defaults: USDC, 6; MUSD, 18 on Mezo). |

## Showcase shelter and campaign

`client/public/shelter-payouts/campaign.json` names the showcase shelter, Pink Paw (Rožinė pėdutė),
and its campaign goal. It is generated from fact C-001 (`funding/framework/facts/facts.json`, then
`fund facts build`); never edit it by hand. The goal (50,000 USDC by 30 Sep 2027) counts the USDC
that comes in to the campaign wallets (`wallets`, each inside its block range). `useCampaignGoal`
(`goal.ts`) reads the backend's count (`GET /shelter/goal/C-001`, summed from the chain's Transfer
logs: spending never lowers it, a handover sweep counts once) every minute and after a gift on the
page (`GOAL_REFRESH_EVENT`). Without the backend it falls back to the wallet's balance growth only
while that is exact (one wallet, nonce 0); otherwise the meter says it cannot read the count, never
"0". `CampaignMeter` says "at least" while the backend is still catching up, and its sources line
names only what can reach the open wallet today (`progress.sources`, the backend's `liveSources`):
sponsored treats while Token Tails holds the wallet. While `shelter.wallet` is `null`, the meter
shows the goal and counts nothing.

Shared sections: `payoutSections.tsx` holds the payouts reads (`usePayouts`, `useTreatJar`), the
feed, "How it works" and the give call to action; `/shelter-payouts` and the `/impact` embed
(`ShelterPayoutsEmbed.tsx`) both render them. `PinkPawGallery.tsx` lists every real Pink Paw cat as
card art + shelter photo with a "Meet" link, from `GET /shelter/rozine-pedute/gallery` (every cat,
uncapped) through `shared/pink-paw.ts`, the same list the Heist's payouts modal reads
(`catnip-heist/src/ui/pink-paw.ts`). If that endpoint does not answer it falls back to the
storefront (`GET /cat/sale`, the newest 200 cats per shelter) and then never shows its counts as
the shelter's totals ("of the newest"). It opens on the first tab that has cats.

Token Tails created the Pink Paw wallet and holds it on the shelter's behalf until handover. The
profile block, the give page and the receipt page all say so. Set `shelter.handover` to
`"handed-over"` only after the shelter controls its own keys.

Each deployment card also shows the contract's native balance (`eth_getBalance`). ShelterSplit
forwards donations in the same transaction, so it should read 0.

## Other routes

Query params, not dynamic segments, because the app build is a static export.

| Route | What it does |
|---|---|
| `/shelter-payouts/give?from=heist&cat=<name>` | Signed-in one-tap treat: `POST /shelter/donate` (backend pays from its hot wallet). Handles signed-out, 429 (once per UTC day), 503 (disabled or budget spent). |
| `/shelter-payouts?embed=1` | Same page without the site header and footer, for a modal iframe (e.g. inside Catnip Heist). The Heist link is hidden and other links open with `target="_top"`. |
| `/shelter-payouts/receipt?chain=<id>&tx=<hash>` | Reads the receipt over the public RPC, decodes NativeDisbursed/Disbursed, flags logs not from a listed contract, and draws a PNG share card in the browser. |

## Wallet giving

`WalletDonate` gives through a DonateRouter listed in `routers.json`, gated by `walletGiveMode`
(`giveMode.ts`): real money only after the handover, a testnet "Try it live" block for
`NEXT_PUBLIC_WALLET_DONATE_CHAIN`, and "Opens when Pink Paw holds its own key" otherwise. Full flow,
env and fork E2E: `docs/CLIENT.md`, "Wallet giving". `/shelter-payouts/onboard` is the shelter's
handover page (claim message in `claim.ts`).

## Disclosure

The page always shows: "Shelter wallet held by Token Tails on behalf of the shelter until handover".
Remove it only after the shelter controls its own wallet.

## Tests

`client/__test__/shelter-payouts-logs.test.ts` covers log decoding and amount formatting;
`shelter-calldata`, `shelter-campaign`, `shelter-receipt` and `shelter-api` cover calldata (checked
against keccak and ethers output), the wallet flow with a mocked provider, the goal sum, receipt
decoding and the API status mapping.
