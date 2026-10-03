# ShelterSplit

A pass-through stablecoin payout contract for animal shelters. One call splits a payment across
registered shelter wallets by basis points, pays every active shelter in the same transaction and
emits one public event per payout. The remainder and all rounding dust go to a treasury, so the
contract holds no balance between calls.

It is the on-chain part of [Token Tails](https://tokentails.com): the payouts page at
<https://tokentails.com/shelter-payouts> reads these events straight from the chain, and the
[ShelterSplit Rail](../../../../../shelter-rail/) SDK and widget let any app or agent pay the same
shelters.

MIT licensed. Solidity 0.8.24, Foundry, no external dependencies.

## How it works

```
payer ──(USDC / EURC via disburse, native USDC on Arc via donate)──▶ ShelterSplit
                                                                       │ same transaction
                       ┌───────────────────────────┬──────────────────┤
                       ▼                           ▼                  ▼
               shelter A (bps share)      shelter B (bps share)   treasury (remainder + dust)
               event Disbursed / NativeDisbursed per shelter, one batch event per call
```

| Function | What it does |
|---|---|
| `disburse(amount, memo)` | Pulls `amount` of the ERC-20 token (approve first) and splits what actually arrived. Emits `Disbursed` per shelter and one `DisbursementBatch`. |
| `disburseWithMemo(amount, bytes32 memo)` | Tempo TIP-20 only: the same split, each payout sent with `transferWithMemo`, so the memo lands in the token's own event. |
| `donate(memo)` / `receive()` | Splits `msg.value`. On Arc the native coin is USDC, so there is no approve step. Emits `NativeDisbursed` and `NativeDisbursementBatch`, kept separate so the 18-decimal native and 6-decimal ERC-20 scales never mix. |
| `preview(amount)` | Shows the split before paying. |
| `addShelter`, `updateShelter`, `setShelterActive`, `removeShelter` | Owner-only registry. Total shares can never exceed 10,000 bps. |

Safety: reentrancy guard, pause, two-step ownership, safe transfers that handle tokens returning
nothing, caps (50 shelters, 64-byte names, 256-byte memos), and an atomic batch: if one payout fails,
the whole call reverts and nobody is paid short.

## Deployments

Source is verified on each explorer listed. Mainnet rows are added after the mainnet deploy.

| Network | Address | Proof |
|---|---|---|
| Arc testnet (5042002) | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.testnet.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [payout](https://explorer.testnet.arc.io/tx/0xa90f97134ab92efa5ade8c6f1c6eddcc9bded100a6c1bc2a5b1b91ba6da4360a) |
| Tempo testnet (42431) | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.testnet.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | [payout](https://explore.testnet.tempo.xyz/tx/0x2a8d49065e0d9bbd8ba6f1563eebf5a34a60d9203f9fc07582d84ccb7791af2d), [memo payout](https://explore.testnet.tempo.xyz/tx/0x7e9dc9e3d731e7ad579134927f0a1dd202975ee3bb6e9e55f4463621eea47fda) |

## Run the tests

```sh
forge test            # unit, fuzz (512 runs), reentrancy with a malicious token, events, TIP-20 memo path
forge build
```

## Deploy

Every input comes from the environment; nothing is hard-coded.

```sh
SHELTERSPLIT_TOKEN=<USDC address> SHELTERSPLIT_TREASURY=<treasury> \
SHELTERSPLIT_OWNER=<owner, defaults to the treasury> EXPECTED_CHAIN_ID=<chain id> \
forge script script/DeployShelterSplit.s.sol --rpc-url <rpc> --account <keystore> --broadcast
```

## Disclosures

- **Custody.** The first shelter is Pink Paw (Rožinė pėdutė). Its receiving wallet was created and
  is held by Token Tails on the shelter's behalf until handover. The chain proves that funds reached
  the registered wallet, not who controls it. At handover the shelter's own address is registered
  in the contract.
- **Prior work.** Token Tails existed before this contract: the game and app, three Soroban
  contracts on Stellar mainnet and ERC-721 contracts on SKALE. ShelterSplit itself was written from
  2026-09-25.
