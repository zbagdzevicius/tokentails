# Smart Contracts and Chain Services (`contracts/`)

Five sub-workspaces at very different maturity levels. Stellar is the production chain. SKALE has
deployed contracts but partly broken source. The other two are abandoned explorations.

| Workspace | Chain | Status |
|---|---|---|
| `stellar/soroban-nft/` | Stellar (Soroban) | Production. Mainnet contract IDs, Rust tests, self-hosted RPC manifests. |
| `stellar/stellar-fuel/` | Stellar | Support service: XLM faucet for new player accounts. |
| `evm/` | SKALE Nebula | Deployed on testnet and mainnet. No build tooling, two files do not compile. |
| `sfuel/` | SKALE Nebula | Support service: sFUEL gas faucet, forked from the SKALE recipes repo. |
| `motoko/` | Internet Computer | Abandoned prototype. Unmodified Rocklabs reference NFT canister. Never deployed. |
| `move/` | Aptos | Dead file. Unmodified Aptos framework module with no manifest. Never deployed. |

The top-level `contracts/deployed-contracts.md` contains no addresses. Deployed identifiers live in
`evm/deployed-contracts.md` and `stellar/soroban-nft/README.md`, and are consolidated below.

## How the app uses the chains

- Every NFT contract points its metadata at the backend: `https://api.tokentails.com/cat/nft/{tokenId}` and `.../blessing/nft/{tokenId}`. The backend serves these from `GET /cat/nft/:tokenId` and `GET /cat/nft/metadata`.
- The contracts are designed for server-side minting: an admin registers a hot wallet as a minter, which then calls `mint` or `mintUniqueTokenTo`. That mint call site is not in this monorepo. The backend serves token metadata and verifies Stellar payments through Horizon, but nothing in `backend/`, `client/`, or `cms/` invokes a contract, and no contract address is hardcoded in application source. Minting is done from outside this repository or by hand with the CLI.
- The backend web3 module verifies Stellar payment transactions through Horizon (mainnet when `IS_PROD`, else testnet).
- Both faucet services share the backend's internal service header, `mlaccesstoken`, compared against `ML_ACCESS_TOKEN`.
- Cats store `tokenId` and a `token { stellar, sei }` reference; blessings store `token { stellar, evm }`. See [DATA_MODEL.md](DATA_MODEL.md).

## Stellar (`stellar/`)

### Soroban contracts (`stellar/soroban-nft/`)

Cargo workspace with `soroban-sdk 21.0.0` and three `cdylib` crates under `contracts/`. The
release profile is tuned for small wasm (`opt-level z`, LTO, `panic = abort`).

```bash
cargo test                                  # runs all three test suites
stellar contract build                      # wasm to target/wasm32-unknown-unknown/release/
stellar contract deploy --wasm <file>.wasm --source <identity> --network <testnet|mainnet>
stellar contract invoke --id <contract> --network <net> -- initialize --admin <G...> --minters '["<G...>"]' --base_uri https://api.tokentails.com/cat/nft/
```

All three contracts share one design: a `Roles` struct in instance storage, a `BASE_URI` string,
and one persistent map entry per token from the string `token_id` to the owner address. They
implement a bespoke minimal NFT interface, not SEP-41 and not the OpenZeppelin Soroban standard.
None of them emit events and none of them extend storage TTL.

| Contract | Crate | Entrypoints | Notes |
|---|---|---|---|
| `CatContract` | `contracts/cat` | `initialize(admin, minters, base_uri)`, `mint(invoker, to, token_id)`, `burn`, `transfer_from`, `owner_of`, `add_minter`, `remove_minter`, `set_base_uri`, `get_base_uri`, `get_token_uri`, `check` | Admin or minter may mint and burn. `set_base_uri` is admin only. 16 tests. |
| `BlessingContract` | `contracts/blessing` | Same as Cat without `burn` | 13 tests. |
| `NFTContract` | `contracts/nft` | `initialize(admin, base_uri)`, `mint(to)`, `owner_of`, `set_base_uri`, `get_base_uri`, `get_token_uri`, `check` | Pass or membership token. `mint` has no authorization and no duplicate check; the token id is the recipient address, so it is one pass per account. 5 tests. |

Errors: `Unauthorized = 1`, `MinterNotFound = 2`, `TokenExists = 3`, `TokenNotFound = 4`.
`get_token_uri` returns a two-element vector `[base_uri, token_id]` that the caller concatenates.

Deployed contract IDs (public on-chain identifiers):

| Network | Contract | ID |
|---|---|---|
| Mainnet | TokenTailsCat | `CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF` |
| Mainnet | TokenTailsBlessing | `CDY53U64IBGRTIABOQDS3ZXAIYP3S3VY42TKOX2G65E2UVBF3YLS7NJ6` |
| Mainnet | TokenTailsPass | `CBK4KAHLHNWOF4HEZFY2W57NYMSC4DLZGLGCM4HZUPAUU3PDPM3IMRS4` |
| Testnet | TokenTailsCat | `CAJRXVUUCM7GKWM4SHAZURJDCJMWQY2OZMOJ243SNOFESW5I6LYUTGFM` |

Admin and minter account: `GAVYPYRZFSSNWLOXURWWPB5T6PVPNTBL7BCEQXZP5VMVDSMUP7XF5TAN`. Explorer:
https://stellar.expert/explorer. Public dashboard: https://dune.com/token_tails/token-tails.

The README in that folder lists the mainnet Cat ID a second time as the testnet Blessing ID. The
mainnet reading is corroborated by the architecture note in `extra/`, so treat the testnet
Blessing line as a copy-paste error.

Infrastructure manifests in the same folder: `k8s-pubnet.yaml` (Helm values for a self-hosted
`stellar/soroban-rpc` 21.3.0 node in namespace `stellar-rpc`) and `k8s-cert.yaml` (cert-manager
Let's Encrypt issuer).

### XLM faucet (`stellar/stellar-fuel/`)

Express service that funds new player accounts with 2 XLM, using `createAccount` for accounts
that do not exist yet so they clear the base reserve. Skips accounts already holding more than
1.5 XLM.

| Route | Purpose |
|---|---|
| `GET /` | Health |
| `POST /claim` with `{ addresses: [] }` | Batch fund, 100 per chunk with a one second pause |
| `GET /claim/:walletAddress` | Fund one account |
| `GET /balance`, `GET /balance/:walletAddress` | Native balance |

Env: `PRIVATE_KEY`, `SOROBAN_RPC_URL`, `HORIZON_RPC_URL`, `IS_PROD`, `ML_ACCESS_TOKEN`, `PORT`
(default 8888). Copy `.env.sample` to `.env`.

`generate-wallet.js` prints a fresh keypair to stdout. `calculate-gas.js` is a standalone Soroban
resource-fee and rent calculator with no exports.

## SKALE (`evm/` and `sfuel/`)

### Solidity contracts (`evm/`)

No Hardhat or Foundry. Contracts were compiled and deployed through Remix with OpenZeppelin 4.9.3
GitHub imports, then verified on the explorer using the standard-input JSON exported from Remix
(`evm/README.md` has the `jq` one-liner). Solidity pragmas are mixed between 0.8.6 and 0.8.19.

| File | Contract | Standard | Summary |
|---|---|---|---|
| `TokenTailsCat.sol` | `TokenTailsCat` (TTCAT) | ERC-721, Ownable, ReentrancyGuard | Flagship. `mintUniqueTokenTo`, `mintToMany`, owner-managed `minter` set, `checkIn(tokenId)` emits `Checked`, `sweep`, and `distributeIfBelowFromTreasury` for on-chain sFUEL top-ups. Base URI is a `constant`. |
| `TokenTailsBlessing.sol` | `TokenTailsBlessing` (TTBLESSING) | ERC-721, AccessControlEnumerable | `MINTER_ROLE` mint, admin `setBaseURI`. `tokenURI(uint128)` overloads rather than overrides. |
| `Tails.sol` | `TokenTails` (TAILS) | ERC-20 | Fixed 100M supply minted to deployer. No mint or burn. |
| `TokenTailsRewardsBox.sol` | `TokenTailsRewardsBox` | ERC-721 | Loot box that pays TAILS on `open`. Does not compile: calls a `mint` that the ERC-20 lacks. `mintUniqueTokenTo` is unprotected. |
| `TokenTailsMysteryBox.sol` | `TokenTailsMysteryBox` | ERC-721 | Open mint, one box per address, single shared URI. |
| `TokenTailsBadge.sol` | `TokenTailsMysteryBox` | ERC-721 | Duplicate of the mystery box that was never renamed. The committed compilation artifacts were built from this file. |
| `TokenTailsInteraction.sol` | `TokenTailsInteraction` | none | Daily `interactWithCat` with a 10 percent box drop. Does not compile: references a `TokenTailsBox` type that does not exist and mixes pragmas. |

Deployed addresses (public on-chain identifiers):

| Network | Chain ID | Contract | Address |
|---|---|---|---|
| Nebula mainnet `green-giddy-denebola` | 1482601649 | TokenTailsCat | `0xd51e3c8c7A547523C3AB31483fBF2833f8f01c30` |
| Nebula mainnet | | TokenTailsBlessing | `0x5B1793d4AA54a36ad5F53d20C9ad1eEd8609410C` |
| Nebula testnet `lanky-ill-funny-testnet` | 37084624 | TokenTailsCat | `0x319830785404248ae189dC5D18cF292e1b7f9434` |
| Nebula testnet | | TokenTailsBlessing | `0xE719B1154eF93BD1ADb2A3908A23b018483D56ae` |

RPC endpoints: `https://mainnet.skalenodes.com/v1/green-giddy-denebola` and
`https://testnet.skalenodes.com/v1/lanky-ill-funny-testnet`. Gas token is sFUEL, available from
https://www.sfuelstation.com on testnet.

There are no tests for the Solidity contracts.

### sFUEL faucet (`sfuel/`)

Fork of the SKALE `recipes` API-distribution starter with Token Tails additions: the
`mlaccesstoken` middleware, batch `POST /claim`, per-address balance, and threshold logic. Sends
`0.0000005` sFUEL to addresses below 75 percent of that amount. Same route shape as the Stellar
faucet. Env: `PRIVATE_KEY`, `RPC_URL`, `ML_ACCESS_TOKEN`, `PORT`. The README says to copy
`.env.example` but the shipped file is `.env.sample`.

## Internet Computer (`motoko/`)

Two `dfx` canisters: `nft` (`src/main.mo`, actor class `NFTCat`) and `sale` (`src/sale.mo`, actor
class `NFTSale` with a primary sale module that takes DIP-20 payment and optional whitelist
canister). Both are the Rocklabs DIP-721-style reference implementation with Apache 2.0 headers,
renamed but otherwise unmodified. `test/test.mo` is an integration test flow against a local
replica. `start.sh` targets a canister name and constructor signature that no longer match. No
canister was ever deployed and nothing in the app references ICP.

## Aptos (`move/`)

`non_fungible_token.move` is the upstream Aptos `aptos_token_objects::aptos_token` module, copied
verbatim with its 34 unit tests. There is no `Move.toml`, so it cannot build, and nothing in the
app references Aptos.

## Licensing

Three license regimes overlap:

- The repository root is under `COMMERCIAL_LICENSE.md` (all rights reserved).
- `contracts/LICENSE` is a truncated MIT notice that stops mid-sentence and omits the warranty disclaimer.
- `contracts/sfuel/LICENSE` is the full upstream SKALE MIT license.
- The Motoko files carry Rocklabs Apache 2.0 headers, and the Move file is Apache 2.0 Aptos framework source with no header.

Decide which license governs `contracts/`, repair or remove the truncated file, and add a NOTICE
for the Rocklabs, Aptos, and SKALE code.

## Known issues

Stellar:

- `stellar-fuel/src/distribute-batch.js` passes `{ address }` but `Distribute` destructures `{ walletAddress }`, so batch claims fund `undefined`. Single claims work.
- The soroban-nft README embeds third-party RPC URLs that include an API key in the path. Rotate the key and redact the README before publishing.
- `NFTContract.mint` is an open, overwriting mint. If the deployed Pass contract is this code, that entrypoint is live.
- Persistent storage is never TTL-extended, so ownership entries can be archived.
- No events, no upgrade entrypoint. Fixes require redeploy and state migration.
- `cat`, `blessing`, and `nft` are near-duplicate crates. Fixes must be applied three times.
- The README's "deploy to mainnet" snippet passes `--network testnet`.

SKALE:

- `TokenTailsInteraction.sol` and `TokenTailsRewardsBox.sol` do not compile.
- `TokenTailsRewardsBox.mintUniqueTokenTo` and `TokenTailsMysteryBox.safeMint` are unprotected.
- `random()` uses `block.difficulty`, which is deprecated and predictable.
- `TokenTailsCat` base URI cannot be changed after deployment.
- Header comments claim OpenZeppelin 5 while imports pin 4.9.3.
- `distributeIfBelowFromTreasury` ignores per-recipient `call` failures.
