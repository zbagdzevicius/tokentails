# Budget — {{PROGRAM}}

One row per line item. Currency is ETH or USD (USDC counts as USD). `d:export` converts with
`eth_usd` from call.md and prints both totals; `fund check` fails if the total leaves
`min_budget`..`max_budget`. Do not add a Total row — it is computed.

| Item | Amount | Currency |
|---|---|---|
