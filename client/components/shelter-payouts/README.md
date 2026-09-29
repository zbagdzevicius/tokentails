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

## Disclosure

The page always shows: "Shelter wallet held by Token Tails on behalf of the shelter until handover".
Remove it only after the shelter controls its own wallet.

## Tests

`client/__test__/shelter-payouts-logs.test.ts` covers log decoding and amount formatting.
