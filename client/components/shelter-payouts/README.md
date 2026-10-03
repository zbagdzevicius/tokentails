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
and its campaign. `goalUsdc`, `startDate` and `fromBlock` are placeholders the team edits.
`shelter.wallet` is `null` until the ShelterSplit deploy; set it to the shelter's address then. While
it is `null`, the goal meter shows the goal and counts nothing. The meter sums USDC payouts (native
18-decimal and ERC-20 6-decimal) to that wallet on `chainId`, from `fromBlock` on.

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

## Wallet donate

`WalletDonate` is hidden unless `NEXT_PUBLIC_WALLET_DONATE === "true"`. It uses raw EIP-1193
(`eth_requestAccounts`, `wallet_switchEthereumChain` or `wallet_addEthereumChain`, then
`eth_sendTransaction`) with `donate("tt:wallet")` calldata encoded in `calldata.ts`. It needs a
deployment on the campaign's chain in `deployments.json`.

## Disclosure

The page always shows: "Shelter wallet held by Token Tails on behalf of the shelter until handover".
Remove it only after the shelter controls its own wallet.

## Tests

`client/__test__/shelter-payouts-logs.test.ts` covers log decoding and amount formatting;
`shelter-calldata`, `shelter-campaign`, `shelter-receipt` and `shelter-api` cover calldata (checked
against keccak and ethers output), the wallet flow with a mocked provider, the goal sum, receipt
decoding and the API status mapping.
