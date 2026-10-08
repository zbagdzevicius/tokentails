# Shelter payouts page (`/shelter-payouts`)

Transparency page. It lists every `Disbursed(address indexed shelter, uint256 amount, string memo)`
event from each ShelterSplit deployment. It reads the backend's index of those public events first
(`payoutIndex.ts`, `GET /shelter/payouts`, docs/API.md) and then only the blocks after the index's
`indexedThrough` with plain `eth_getLogs` calls to the chain's public RPC (`rpc.ts`). Without a backend,
or for a contract the index has not read within 15 minutes, it reads the whole range from the RPC, so
the feed still works with no backend; it needs no wallet and adds no dependency. Every payout links
to its transaction on the chain's explorer.

Chains (`chains.ts`), mainnet and testnet: Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain
and Monad (Mezo is listed too). Robinhood Chain pays USDG (its testnet a test mUSDC), Tempo USDC.e
(its testnet pathUSD), the others USDC. Totals group by symbol, so USDG never adds into a USDC sum.

## Data source

Two lists, kept apart so test money never sums with real payouts:

- `client/public/shelter-payouts/deployments.json`: the mainnet ShelterSplits. It ships as `[]`
  until the mainnet wave, and the page shows an empty state until it has entries.
- `client/public/shelter-payouts/testnet-deployments.json`: the testnet ShelterSplits, shown in the
  separate "Testnet proof" section ("Already live on N testnets"). A testnet entry found in the
  mainnet list moves to that section too.

Do not copy files by hand. `fund a:ingest` (run from `funding/framework`) records a wave in
`funding/framework/tracks/a-build/deployments.json` and writes the public copies: both lists here,
the Catnip Heist's copies (`catnip-heist/public/payouts/`), the built Heist's mainnet list
(`client/public/heist-game/payouts/deployments.json`) and the backend's
`backend/src/shelter/onchain/wallet.config.ts`. Commit them after the run.

Only `chainId` and `address` are required per entry. The page also uses:

| Field | Use |
|---|---|
| `tx` | Deploy tx. Its receipt gives the block where the log scan starts. |
| `fromBlock` | Scan start block. Set it by hand if the RPC rejects the range. |
| `rpc`, `explorer` | Override the built-in public RPC and explorer in `chains.ts` (needed only for a chain not listed there). |
| `decimals`, `symbol` | Override the payout token display (defaults per chain in `chains.ts`: USDC, 6; USDG on Robinhood Chain; USDC.e on Tempo; MUSD, 18 on Mezo). |

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
| `/shelter-payouts/give?from=heist&cat=<name>[&chain=<id>]` | Signed-in one-tap treat: `POST /shelter/donate` (backend pays from its hot wallet). Web builds show network chips (`treatChains.ts`: Arc, Arbitrum, Base, Avalanche, Robinhood, Tempo, Monad, each with its coin: USDC, USDG on Robinhood, USDC.e on Tempo); only chains the backend's `GET /shelter/donate/status` `chains` lists as live can be picked (the rest are greyed out with a short reason), and `?chain=<id>` preselects one when it is open (else the backend's main chain, else the first open chip). The chosen chain goes to the backend as `chainId`. App builds always use the main chain. Handles signed-out, 429 (once per UTC day, across all chains), 409 (disabled or budget spent). |
| `/shelter-payouts?embed=1` | Same page without the site header and footer, for a modal iframe (e.g. inside Catnip Heist). The Heist link is hidden and other links open with `target="_top"`. |
| `/shelter-payouts/receipt?chain=<id>&tx=<hash>` | Reads the receipt over the public RPC, decodes NativeDisbursed/Disbursed, flags logs not from a listed contract, and draws a PNG share card in the browser. |

## Wallet giving

`WalletDonate` gives on any of the seven chains (`giveRails.ts`): through a DonateRouter listed in
`routers.json` (one signature), or, on a chain without a router or whose token has no EIP-3009
(Tempo, Robinhood), straight into the listed ShelterSplit (approve, then `disburse`). It is gated by
`walletGiveMode` (`giveMode.ts`): real money only with `NEXT_PUBLIC_WALLET_DONATE=true` and after the
handover, a testnet "Try it live" block for `NEXT_PUBLIC_WALLET_DONATE_CHAIN` with a picker over the
seven testnets, and "Opens when Pink Paw holds its own key" otherwise. Full flow,
env and fork E2E: `docs/CLIENT.md`, "Wallet giving". `/shelter-payouts/onboard` is the shelter's
handover page (claim message in `claim.ts`).

## Disclosure

The page always shows: "Shelter wallet held by Token Tails on behalf of the shelter until handover".
Remove it only after the shelter controls its own wallet.

## Tests

`client/__test__/shelter-payouts-logs.test.ts` covers log decoding and amount formatting;
`shelter-calldata`, `shelter-campaign`, `shelter-receipt` and `shelter-api` cover calldata (checked
against keccak and ethers output), the wallet flow with a mocked provider, the goal sum, receipt
decoding and the API status mapping. `shelter-give-rails`, `shelter-give-mode`,
`shelter-give-networks`, `shelter-chain-picker` and `shelter-wallet-give` cover the per-chain give
paths, the gate, the treat chips, the wallet chain picker and the router gift flow.
