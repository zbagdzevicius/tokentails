# ShelterSplit and DonateRouter

Shelter payout contracts for [Token Tails](https://tokentails.com). MIT licensed, Solidity 0.8.24,
Foundry, no external dependencies (no `lib/`, no submodules).

- **ShelterSplit** is a pass-through stablecoin payout contract. One call splits a payment across
  registered shelter wallets by basis points, pays every active shelter in the same transaction and
  emits one public event per payout. The remainder and all rounding dust go to a treasury, so the
  contract holds no balance between calls.
- **DonateRouter** sits in front of a deployed ShelterSplit. It is the public way in: the donor signs
  one EIP-712 message (USDC's EIP-3009 `receiveWithAuthorization`) that fixes the amount, the memo
  and the exact payout list. It has no owner, and a gift given through it can never reach the
  treasury.
- **CappedSpender** holds Token Tails' own small float, which one agent address can give to the
  shelters on a split, within per-gift and per-day caps fixed at deploy (the owner cannot raise them).

The payouts page at <https://tokentails.com/shelter-payouts> lists these contracts' payouts, indexed
from their public on-chain events; every amount links to its transaction on the chain's explorer, so
anyone can check it. The [ShelterSplit Rail](../../shelter-rail/) SDK and widget let any app or agent pay
the same shelters.

## How it works

```
payer ──(USDC / EURC via disburse, native USDC on Arc via donate)──▶ ShelterSplit
                                                                       │ same transaction
                       ┌───────────────────────────┬──────────────────┤
                       ▼                           ▼                  ▼
               shelter A (bps share)      shelter B (bps share)   treasury (remainder + dust)
               event Disbursed / NativeDisbursed per shelter, one batch event per call

donor ──(one EIP-712 signature: amount, memo, payout list; no gas, no approve)
      ──▶ relayer submits ──▶ DonateRouter
                              │ guard: paused? any treasury share? payout list still the one signed?
                              ▼ same transaction
                   ShelterSplit.disburse ──▶ shelter wallet(s)
```

### ShelterSplit

| Function | What it does |
|---|---|
| `disburse(amount, memo)` | Pulls `amount` of the ERC-20 token (approve first) and splits what actually arrived. Emits `Disbursed` per shelter and one `DisbursementBatch`. |
| `disburseWithMemo(amount, bytes32 memo)` | Tempo TIP-20 only: the same split, each payout sent with `transferWithMemo`, so the memo lands in the token's own event. |
| `donate(memo)` / `receive()` | Splits `msg.value`. On Arc the native coin is USDC, so there is no approve step. Emits `NativeDisbursed` and `NativeDisbursementBatch`. |
| `preview(amount)` | Shows the split before paying. |
| `addShelter`, `updateShelter`, `setShelterActive`, `removeShelter` | Owner-only registry. Total shares can never exceed 10,000 bps. |

Safety: reentrancy guard, pause, two-step ownership, safe transfers that handle tokens returning
nothing, caps (50 shelters, 64-byte names, 256-byte memos), and an atomic batch: if one payout fails,
the whole call reverts and nobody is paid short.

### DonateRouter

| Function | What it does |
|---|---|
| `donateWithAuthorization(gift, memo, signature)` | Redeems the donor's EIP-3009 `ReceiveWithAuthorization` and pays the shelters. The `bytes` form also accepts ERC-1271 smart and passkey wallets. |
| `donateWithAuthorizationVRS(gift, memo, v, r, s)` | The same through USDC's v/r/s overload. |
| `donateNative(memo, expectedRecipients)` | Splits `msg.value` through `ShelterSplit.donate`; reverts `RecipientsChanged` unless the payout list matches. |
| `flush(memo)` | Forwards USDC sent to the router by plain transfer to the shelters, under the same guard. |
| `canDonate(amount)` | `(ok, toTreasury)` pre-check for clients and relays. |
| `recipientsHash(amount)` | `keccak256(abi.encode(wallets, amounts))` of `ShelterSplit.preview(amount)`. |
| `authNonce(salt, memo, recipients)` | The EIP-3009 nonce the donor signs; it binds this router, the memo and the payout list. |

What the chain enforces:

- **No owner.** No admin functions, setters or sweep. Two immutables: the split and the token.
- **No balance between calls.** Every path pulls and pays out in one call.
- **The donor signs who gets paid.** If the split owner changes the payout list between signing and
  submitting, the router reverts `RecipientsChanged` and the USDC stays with the donor.
- **Treasury guard.** The router reverts while the split is paused, if `preview(amount)` would send
  anything to the treasury, and if the treasury balance moved after paying.
- **The signature fixes the gift.** A relayer can submit it but cannot change the amount, the memo or
  where the money goes.

The ABI is in `abi/DonateRouter.json`
(`forge inspect src/DonateRouter.sol:DonateRouter abi --json > abi/DonateRouter.json`).

## Deployments

The public deployment lists are the source of truth. They are generated from the deploy records and
are what the live payouts page reads:

| List | In this repo | Live |
|---|---|---|
| Mainnet splits | [`client/public/shelter-payouts/deployments.json`](../../client/public/shelter-payouts/deployments.json) | <https://tokentails.com/shelter-payouts/deployments.json> |
| Testnet splits | [`client/public/shelter-payouts/testnet-deployments.json`](../../client/public/shelter-payouts/testnet-deployments.json) | <https://tokentails.com/shelter-payouts/testnet-deployments.json> |
| DonateRouters | [`client/public/shelter-payouts/routers.json`](../../client/public/shelter-payouts/routers.json) | <https://tokentails.com/shelter-payouts/routers.json> |
| Backend config (all of the above, plus wallets) | [`backend/src/shelter/onchain/wallet.config.ts`](../../backend/src/shelter/onchain/wallet.config.ts) | – |

Chains: Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain and Monad. Tempo's TIP-20 tokens and
Robinhood's USDG have no EIP-3009, so those chains have a split but no router. Testnet instances
at the time of writing (the lists above win if they differ):

| Network | Token | ShelterSplit | DonateRouter |
|---|---|---|---|
| Arc testnet (5042002) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.testnet.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xa1cf1db2042dea0f169b1acdab479d4f17852860`](https://explorer.testnet.arc.io/address/0xa1cf1db2042dea0f169b1acdab479d4f17852860) |
| Arc testnet (5042002) | EURC | [`0x937f13ce28294011567615330dbcb859a06a0bba`](https://explorer.testnet.arc.io/address/0x937f13ce28294011567615330dbcb859a06a0bba) | [`0x47ed389d2af5f4cd3e884208b72d609e78f6c5df`](https://explorer.testnet.arc.io/address/0x47ed389d2af5f4cd3e884208b72d609e78f6c5df) |
| Tempo testnet (42431) | pathUSD | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.testnet.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | – (no EIP-3009) |
| Arbitrum Sepolia (421614) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xe271131be71e29f83084fd34aa6c70d50a2aea71`](https://sepolia.arbiscan.io/address/0xe271131be71e29f83084fd34aa6c70d50a2aea71) |
| Avalanche Fuji (43113) | USDC | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://subnets-test.avax.network/c-chain/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [`0x4b25318bf32f2740c086350f802452ef2095cb6f`](https://subnets-test.avax.network/c-chain/address/0x4b25318bf32f2740c086350f802452ef2095cb6f) |
| Avalanche Fuji (43113) | EURC | [`0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022`](https://subnets-test.avax.network/c-chain/address/0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022) | [`0xa1cf1db2042dea0f169b1acdab479d4f17852860`](https://subnets-test.avax.network/c-chain/address/0xa1cf1db2042dea0f169b1acdab479d4f17852860) |
| Base Sepolia (84532) | USDC | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://sepolia.basescan.org/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [`0x683d66d89eaa7460d3a12337cdf8185fae37dfbd`](https://sepolia.basescan.org/address/0x683d66d89eaa7460d3a12337cdf8185fae37dfbd) |
| Robinhood Chain testnet (46630) | mUSDC (mock; the testnet has no stablecoin) | [`0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777`](https://explorer.testnet.chain.robinhood.com/address/0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777) | – (no EIP-3009) |
| Monad testnet (10143) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://testnet.monadvision.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xe271131be71e29f83084fd34aa6c70d50a2aea71`](https://testnet.monadvision.com/address/0xe271131be71e29f83084fd34aa6c70d50a2aea71) |

Mainnet instances, deployed and source-verified on 2026-10-07 (the lists above win if they differ):

| Network | Token | ShelterSplit | DonateRouter | Proof payout |
|---|---|---|---|---|
| Arc (5042) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0x937f13ce28294011567615330dbcb859a06a0bba`](https://explorer.arc.io/address/0x937f13ce28294011567615330dbcb859a06a0bba) | [payout](https://explorer.arc.io/tx/0xd26f6e938afe5e6b8204c816a91927b19f73e0837ff376f06bb05659b260d68d) |
| Base (8453) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://basescan.org/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xb3adf1220d7d3835c2af1c194ff745d0d33bd052`](https://basescan.org/address/0xb3adf1220d7d3835c2af1c194ff745d0d33bd052) | [payout](https://basescan.org/tx/0x130fdcc6987ddefb95d787c1bd2da3d210ee844cdbc339c7b59e0949a401da3d) |
| Arbitrum One (42161) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xb3adf1220d7d3835c2af1c194ff745d0d33bd052`](https://arbiscan.io/address/0xb3adf1220d7d3835c2af1c194ff745d0d33bd052) | [payout](https://arbiscan.io/tx/0x74f1eaf7fe3494608f1e80d92afc27c1035b8eaf34e3bd190695f1da46929216) |
| Robinhood Chain (4663) | USDG | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://robinhoodchain.blockscout.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | – (no EIP-3009) | [payout](https://robinhoodchain.blockscout.com/tx/0x4902093822e89d56b49b1168f7c0bf702f0a2cf9b578fe54eb8efdb3a49ad377) |
| Avalanche C-Chain (43114) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://subnets.avax.network/c-chain/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xb3adf1220d7d3835c2af1c194ff745d0d33bd052`](https://subnets.avax.network/c-chain/address/0xb3adf1220d7d3835c2af1c194ff745d0d33bd052) | [payout](https://subnets.avax.network/c-chain/tx/0x624cea2121311397c688384535ac700cabbd8f36d0523f2134edb133756b17b7) |
| Monad (143) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://monadvision.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xb3adf1220d7d3835c2af1c194ff745d0d33bd052`](https://monadvision.com/address/0xb3adf1220d7d3835c2af1c194ff745d0d33bd052) | [payout](https://monadvision.com/tx/0xd5502f608d776bd2286da096d666f4073d2b5872dcffc575bde95e3b537999f5) |
| Arc (5042) | EURC | [`0xb3adf1220d7d3835c2af1c194ff745d0d33bd052`](https://explorer.arc.io/address/0xb3adf1220d7d3835c2af1c194ff745d0d33bd052) | [`0x683d66d89eaa7460d3a12337cdf8185fae37dfbd`](https://explorer.arc.io/address/0x683d66d89eaa7460d3a12337cdf8185fae37dfbd) | [payout](https://explorer.arc.io/tx/0x56d7f37ba0608f7c610d45e4c1bca9d961218aa49f99fbcd095f635b9c62481f) |
| Tempo (4217) | USDC.e | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | – (no EIP-3009) | [payout](https://explore.tempo.xyz/tx/0xdc25ffea4a1f97b25c5d3cb5827919bd998f37c676867dd262bcf0158e7d3d33) |

On Tempo a second payout, [0xcd33…b8b5](https://explore.tempo.xyz/tx/0xcd33906ebff5f978faaf6406e6b5bbf5506159a170ea964a9feec49a2d91b8b5),
is a `disburseWithMemo` call: Pink Paw's share arrives through TIP-20 `transferWithMemo` with the memo
"Catnip Heist campaign". Every mainnet payout so far is Token Tails'
own money, paid to the wallet it holds for Pink Paw until handover (see Disclosures).

## How to verify

1. **Build and test the source.**

   ```sh
   cd contracts/shelter-split
   forge build
   forge test        # unit, fuzz (512 runs), invariants, reentrancy, TIP-20 memo path, DonateRouter
   FORK_ARC=1 forge test --match-contract DonateRouterFork   # optional: against the live Arc testnet split
   ```

2. **Check that the deployed code is this source.** Each listed address has verified source on its
   explorer (Blockscout, Etherscan or Sourcify). Compiler settings are in `foundry.toml`
   (solc 0.8.24, optimizer 200 runs, EVM `paris`).

3. **Read the state with `cast`** (any address from the lists above, with that chain's RPC):

   ```sh
   cast call <split>  "preview(uint256)" 1000000 --rpc-url <rpc>          # who 1 USDC would pay
   cast call <split>  "token()(address)" --rpc-url <rpc>
   cast call <router> "canDonate(uint256)(bool,uint256)" 1000000 --rpc-url <rpc>   # (true, 0): nothing to the treasury
   ```

4. **Follow the money.** Every payout is a `Disbursed` / `NativeDisbursed` event on the split and a
   token transfer to the shelter wallet. <https://tokentails.com/shelter-payouts> lists them, each
   linking to its explorer transaction.

## Deploy

Every input comes from the environment; nothing is hard-coded. A person broadcasts with their own
keystore.

```sh
SHELTERSPLIT_TOKEN=<USDC address> SHELTERSPLIT_TREASURY=<treasury> \
SHELTERSPLIT_OWNER=<owner, defaults to the treasury> EXPECTED_CHAIN_ID=<chain id> \
forge script script/DeployShelterSplit.s.sol --rpc-url <rpc> --account <keystore> --broadcast

SPLIT=<ShelterSplit> USDC=<its token()> EXPECTED_CHAIN_ID=<chain id> \
forge script script/DeployDonateRouter.s.sol --rpc-url <rpc> --account <keystore> --broadcast
```

Without `--broadcast` both scripts only simulate.

## Disclosures

- **Custody.** The first shelter is Pink Paw (Rožinė pėdutė). Its receiving wallet was created and
  is held by Token Tails on the shelter's behalf until handover. The chain proves that funds reached
  the registered wallet, not who controls it. At handover the shelter's own address is registered in
  the contract, and the public gift paths stay off until then.
- **Prior work.** Token Tails existed before these contracts: the game and app, three Soroban
  contracts on Stellar mainnet and ERC-721 contracts on SKALE. ShelterSplit itself was written from
  2026-09-25.
