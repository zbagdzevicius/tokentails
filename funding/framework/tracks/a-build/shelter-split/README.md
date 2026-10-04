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

## DonateRouter: give straight to the shelter, gas-free

`src/DonateRouter.sol` sits in front of a deployed ShelterSplit (which it does not change). It is
the public way in: anyone can give, the donor signs exactly who gets paid, and a gift given through
it can never reach the treasury.

```
donor ──(one EIP-712 signature over amount, memo and the payout list; no gas, no approve)
      ──▶ relayer submits ──▶ DonateRouter
                              │ guard: paused? any treasury share? payout list still the one signed?
                              ▼ same transaction
                   ShelterSplit.disburse ──▶ shelter wallet(s)
```

| Function | What it does |
|---|---|
| `donateWithAuthorization(gift, memo, signature)` | `gift = (from, value, validAfter, validBefore, salt, recipients)`. Redeems the donor's EIP-3009 `ReceiveWithAuthorization` (USDC's own gasless transfer) and pays the shelters. The `bytes` form also accepts ERC-1271 smart and passkey wallets. |
| `donateWithAuthorizationVRS(gift, memo, v, r, s)` | The same through USDC's v/r/s overload. |
| `donateNative(memo, expectedRecipients)` | Splits `msg.value` through `ShelterSplit.donate`, and reverts `RecipientsChanged` unless `recipientsHash(msg.value)` matches (`bytes32(0)` skips the check). On Arc the native coin is USDC (18 decimals). |
| `donateNative(memo)` | The unchecked form: pays the current list. |
| `flush(memo)` | Anyone may forward USDC sent to the router by plain transfer to the shelters, under the same guard. The memo is untrusted (whoever calls first sets it) and is never shown or attributed. |
| `canDonate(amount)` | `(ok, toTreasury)` pre-check for clients and relays. |
| `recipientsHash(amount)` | `keccak256(abi.encode(wallets, amounts))` of `ShelterSplit.preview(amount)`: who a gift of `amount` pays, and how much each. |
| `authNonce(salt, memo, recipients)` | The EIP-3009 nonce the donor signs: `keccak256(abi.encode(router, keccak256(memo), salt, recipients))`. |

Every gift emits `RouterDonation(donor, amount, batchId, path, memo, nonce)` next to ShelterSplit's
own `DisbursementBatch` (payer = the router). `path` is 0 (signature), 1 (native) or 2 (flush).
`donor`, `batchId` and `nonce` are indexed; `nonce` is the signed EIP-3009 nonce (zero on the native
and flush paths), so a relay whose own transaction reverted because someone else submitted the same
signature first can find that gift and mark it paid instead of failed (the backend does this before
it fails any relay).

What the chain enforces:

- **No owner.** No admin functions, setters or sweep. Two immutables: the split and USDC.
- **No balance between calls.** Every path pulls and pays out in one call. Plain native sends revert.
- **The donor signs who gets paid.** `recipients` is part of the nonce. If the split owner re-points a
  shelter (remove, then add), changes a share or deactivates one between signing and submitting, the
  router reverts `RecipientsChanged` and the USDC stays with the donor. Native gifts get the same
  check through `expectedRecipients`.
- **Treasury guard.** Before paying, the router reverts `SplitPaused` while the split is paused and
  `TreasuryShare(t)` if `preview(amount)` would send `t > 0` to the treasury (an unallocated share,
  an inactive shelter, or rounding dust). After paying, it reverts if the treasury balance moved
  (tested on its own with a split whose `preview` lies). With Pink Paw at 10,000 bps there is no dust
  today.
- **The signature fixes the gift.** The nonce binds the memo, this router and the payout list, and
  USDC's `receiveWithAuthorization` only pays `to == msg.sender`. A relayer, or anyone who sees the
  signature, can submit it but cannot change the amount, the memo or where the money goes.
- **Disclosed limits.** The split owner can still change the list for gifts signed after the change
  (a public event on the split); `flush` and the unchecked `donateNative(memo)` pay the current list.
- **Custody, today.** The only registered shelter wallet is held by Token Tails until the handover
  below. Until then router gifts would land in a wallet Token Tails controls, so the public paths
  (`NEXT_PUBLIC_WALLET_DONATE`, mainnet relay) stay off and any mention of the router must say
  "the shelter wallet is held by Token Tails until handover" (fact `router_guard`, P-002).

Chains: the signed path needs Circle's EIP-3009 on the chain's USDC. `fund router plan` runs a
read-only `authorizationState` preflight and refuses Tempo outright: its stablecoins are TIP-20
tokens without EIP-3009, so a router there would only support `flush`. The Robinhood testnet token is
a mock; run the preflight before relying on it.

Verified on Arc:

- `forge test` runs 40 DonateRouter unit tests (mock FiatToken with the real EIP-712 domain
  `{name: "USDC", version: "2"}`; replay, memo and amount tampering, another router, expiry, every
  guard case, a shelter re-pointed or re-weighted between signing and submit on the signed, v/r/s and
  native paths, a front-run submit, a lying split caught by the post-payout check, a shelter wallet
  that tries to re-enter, flush, native, ERC-1271 wallets, a 512-run fuzz).
- `FORK_ARC=1 forge test --match-contract DonateRouterFork` runs against the live Arc testnet split
  (5 tests, including the checked native gift). Finding (2026-10-04): Arc's FiatToken at `0x3600…`
  accepts both `receiveWithAuthorization` overloads and checks the signature, then moves the balance
  through Arc's native-coin precompile (`0x1800…0000`) and checks its blocklist precompile
  (`0x1800…0001`). A local fork cannot run those (StackUnderflow), so the fork test etches stand-ins
  that move native balances the same way.
- `../router/simulate-arc-testnet.sh` closes that gap with no stand-ins: it runs a full gift on the
  real Arc testnet node as an `eth_call` with state overrides (nothing deployed or sent; its signing
  key is public and must never be funded). Result on 2026-10-04: the bytes and v/r/s overloads both
  pay out (next batch id), a tampered memo reverts with `FiatTokenV2: invalid signature`, a stale
  payout list reverts with `RecipientsChanged`, and `canDonate(1 USDC)` returns `true, 0`.

The ABI is in `abi/DonateRouter.json` (regenerate: `forge inspect src/DonateRouter.sol:DonateRouter abi --json > abi/DonateRouter.json`).

### Deploy the router (manual founder step)

`node funding/framework/bin/fund.mjs router plan --chain <id>` prints these with the right addresses:

```sh
# preflight, read-only: a FiatToken answers false; a revert means no EIP-3009, so do not deploy
cast call <USDC> "authorizationState(address,bytes32)(bool)" 0x…01 0x…00 --rpc-url <rpc>
# simulate, no key
SPLIT=<ShelterSplit> USDC=<its token()> EXPECTED_CHAIN_ID=<id> \
  forge script script/DeployDonateRouter.s.sol --rpc-url <rpc>
# broadcast: the founder, with their own keystore
SPLIT=<ShelterSplit> USDC=<its token()> EXPECTED_CHAIN_ID=<id> \
  forge script script/DeployDonateRouter.s.sol --rpc-url <rpc> --account <keystore> --broadcast
```

Then record `{chainId, network, router, split, usdc, deployTx, deployedAt}` in
`../router-deployments.json`. Set the `router_guard` fact verified only after the handover.

### Shelter handover

`node funding/framework/bin/fund.mjs shelter rotate --chain <id> --to <shelter wallet> --name "<registered name>" --dry-run`
prints the owner calls that move the Pink Paw entry from the wallet Token Tails holds to the
shelter's own: `pause`, `removeShelter(old)`, `addShelter(new, 10000, name)`, `unpause`, then
`preview(1 USDC)` must show `toTreasury == 0`. `--name` has no default: read the registered one with
`cast call <split> "getShelter(address)((address,uint16,bool,string))" <old>` (the plan prints it).
Removing first keeps total bps at or under 10,000; the pause means no gift lands in the gap, and any
gift signed before the handover reverts `RecipientsChanged` instead of following the new wallet.
It only prints; the owner sends.

## Run the tests

```sh
forge test            # unit, fuzz (512 runs), reentrancy with a malicious token, events, TIP-20 memo path, DonateRouter
forge build
FORK_ARC=1 forge test --match-contract DonateRouterFork   # optional: against the live Arc testnet split
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
