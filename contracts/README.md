# Token Tails Smart Contracts

Chain workspaces for Token Tails. Full documentation, including every deployed address:
[docs/CONTRACTS.md](../docs/CONTRACTS.md).

| Folder | Chain | Status |
|---|---|---|
| `shelter-split/` | Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain, Monad | ShelterSplit, DonateRouter, CappedSpender (Solidity, Foundry, MIT). `forge test`. Deployed addresses: its README. |
| `stellar/soroban-nft/` | Stellar Soroban | Production: Cat, Blessing, Pass NFTs on mainnet. `cargo test`, `stellar contract build`. |
| `stellar/stellar-fuel/` | Stellar | XLM faucet service for new player accounts. |
| `evm/` | SKALE Nebula | Cat and Blessing ERC-721 deployed on testnet and mainnet via Remix. |
| `sfuel/` | SKALE Nebula | sFUEL gas faucet service. |
| `motoko/` | Internet Computer | Archived prototype, never deployed. |
| `move/` | Aptos | Archived file, never built. |

The shelter payout contracts (ShelterSplit, DonateRouter, CappedSpender; Foundry, MIT) are in
`shelter-split/`. Their deployments are the public lists in `client/public/shelter-payouts/`
(`deployments.json`, `testnet-deployments.json`, `routers.json`); see `shelter-split/README.md`.

Links: https://tokentails.com • Google Play `com.tokentails.app` • App Store `id6745582489`.
Problems: info@tokentails.com.
