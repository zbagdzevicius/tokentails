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

Source is verified for every split and router listed (Blockscout, Etherscan or Sourcify). The
records are `../deployments.json` (splits) and `../router-deployments.json` (routers); `fund a:ingest`
writes them and the public config `backend/src/shelter/onchain/wallet.config.ts`. Mainnet rows are
added after the mainnet wave. Testnets, the split each chain defaults to plus the EURC instances:

| Network | Token | ShelterSplit | DonateRouter | Proof |
|---|---|---|---|---|
| Arc testnet (5042002) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://explorer.testnet.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xa1cf1db2042dea0f169b1acdab479d4f17852860`](https://explorer.testnet.arc.io/address/0xa1cf1db2042dea0f169b1acdab479d4f17852860) | [payout](https://explorer.testnet.arc.io/tx/0xa90f97134ab92efa5ade8c6f1c6eddcc9bded100a6c1bc2a5b1b91ba6da4360a) |
| Arc testnet (5042002) | EURC | [`0x937f13ce28294011567615330dbcb859a06a0bba`](https://explorer.testnet.arc.io/address/0x937f13ce28294011567615330dbcb859a06a0bba) | [`0x47ed389d2af5f4cd3e884208b72d609e78f6c5df`](https://explorer.testnet.arc.io/address/0x47ed389d2af5f4cd3e884208b72d609e78f6c5df) | [payout](https://explorer.testnet.arc.io/tx/0xc68ceb5a3633b78cd1681c81dde1ff310ca04f1f378003497acc906eb88f387b) |
| Tempo testnet (42431) | pathUSD | [`0x9978e60da2352a8de02852788d34bd95849a598d`](https://explore.testnet.tempo.xyz/address/0x9978e60da2352a8de02852788d34bd95849a598d) | – (no EIP-3009) | [payout](https://explore.testnet.tempo.xyz/tx/0x2a8d49065e0d9bbd8ba6f1563eebf5a34a60d9203f9fc07582d84ccb7791af2d), [memo payout](https://explore.testnet.tempo.xyz/tx/0x7e9dc9e3d731e7ad579134927f0a1dd202975ee3bb6e9e55f4463621eea47fda) |
| Arbitrum Sepolia (421614) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://sepolia.arbiscan.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xe271131be71e29f83084fd34aa6c70d50a2aea71`](https://sepolia.arbiscan.io/address/0xe271131be71e29f83084fd34aa6c70d50a2aea71) | [payout](https://sepolia.arbiscan.io/tx/0x73cdfdb403067706ce0760fd38feed6e2a1e93bbc8d1f6cd1c9e75af7134184d) |
| Avalanche Fuji (43113) | USDC | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://subnets-test.avax.network/c-chain/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [`0x4b25318bf32f2740c086350f802452ef2095cb6f`](https://subnets-test.avax.network/c-chain/address/0x4b25318bf32f2740c086350f802452ef2095cb6f) | [payout](https://subnets-test.avax.network/c-chain/tx/0x4170387155b296e140924ed6a9289688dc4801dbab6372d8117ee42f9c256f02) |
| Avalanche Fuji (43113) | EURC | [`0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022`](https://subnets-test.avax.network/c-chain/address/0x6f0a33ec63cb79dcc13eff6f31795cd11b38a022) | [`0xa1cf1db2042dea0f169b1acdab479d4f17852860`](https://subnets-test.avax.network/c-chain/address/0xa1cf1db2042dea0f169b1acdab479d4f17852860) | [payout](https://subnets-test.avax.network/c-chain/tx/0xa0a985544ae6c97ec63c7581f404ff97962a3a14a1113e6de7459a80ea806efa) |
| Base Sepolia (84532) | USDC | [`0x8bf026d3816cb2344d14aa6301fccde3b289878c`](https://sepolia.basescan.org/address/0x8bf026d3816cb2344d14aa6301fccde3b289878c) | [`0x683d66d89eaa7460d3a12337cdf8185fae37dfbd`](https://sepolia.basescan.org/address/0x683d66d89eaa7460d3a12337cdf8185fae37dfbd) | [payout](https://sepolia.basescan.org/tx/0x26a7b0135627bd743046a56fdd69a93b1a830472702f241d48bd7790efacc5fb) |
| Robinhood Chain testnet (46630) | mUSDC (mock: the testnet has no stablecoin) | [`0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777`](https://explorer.testnet.chain.robinhood.com/address/0x2d42d01a00d75ade8c4f9503a7a6cee8a5f34777) | – (no EIP-3009) | [payout](https://explorer.testnet.chain.robinhood.com/tx/0x276c904ce4b5862e8cd72b3e561ea9ea2bfc26428844c5035817726c5a84aa23) |
| Monad testnet (10143) | USDC | [`0x457c89e10a6e66633eda5bf82fd086febb5db147`](https://testnet.monadvision.com/address/0x457c89e10a6e66633eda5bf82fd086febb5db147) | [`0xe271131be71e29f83084fd34aa6c70d50a2aea71`](https://testnet.monadvision.com/address/0xe271131be71e29f83084fd34aa6c70d50a2aea71) | [payout](https://testnet.monadvision.com/tx/0x6f360be3884051af5e2ae367bf7d66ae095808110756b3fa740a203ef474a556) |

Base Sepolia and Avalanche Fuji also have an older USDC split at `0x457c…db147` (no router). It stays
in the records and in `wallet.config.ts` under `otherSplits`.

Mainnet plan (`../funding-plan.json`, `deploy`): a USDC split on all seven chains (Arc, Tempo,
Arbitrum, Avalanche, Base, Robinhood Chain, Monad), with Robinhood paying USDG and Tempo pathUSD; an
EURC split on Arc only; DonateRouters on Arc, Arbitrum, Avalanche, Base and Monad, plus the Arc EURC
router. Tempo's TIP-20 tokens and Robinhood's USDG have no EIP-3009, so those chains get no router.
The mainnet treasury is `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A`.

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
  "the shelter wallet is held by Token Tails until handover" (fact `router_guard`, P-002). The
  backend enforces this per chain: mainnet relay, match and x402 open on a chain only once every
  wallet the split pays carries the shelter's signed claim (the v2 claim message can name several
  chains) and has been rotated in on-chain, and `preview` sends nothing to the treasury. `SHELTER_HANDED_OVER=false` closes them on every chain.

Chains: the signed path needs Circle's EIP-3009 on the chain's USDC. `fund router plan` runs a
read-only `authorizationState` preflight and refuses Tempo outright: its stablecoins are TIP-20
tokens without EIP-3009, so a router there would only support `flush`. Robinhood Chain has no router
either: mainnet pays USDG (no EIP-3009) and the testnet token is a mock.

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

### Deploy the router

Routers deploy by default: the wave wrappers (`../wave/testnet-all.sh`, `../wave/mainnet-all.sh`)
deploy one on every `routerChains` / `eurcRouterChains` entry of `../funding-plan.json` that has none
recorded, and record it right away with `fund router record`. To deploy one by hand,
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

Then `fund router record --chain <id> --token <USDC|EURC> --split <ShelterSplit>` reads the Foundry
broadcast and appends `{chainId, network, router, split, usdc, deployTx, deployedAt, …}` to
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

### The mainnet wave (a person runs it)

One wallet funds everything. `fund a:distribute --network mainnet` and
`fund a:mainnet-plan --network mainnet` write `../wave/distribute-mainnet.sh` and
`../wave/mainnet-all.sh` from `../funding-plan.json` (the minimal profile, about $7.25 in all; send
each chain's total to the deployer first). Then:

```sh
cd funding/framework/tracks/a-build/wave
DRY_RUN=1 CONFIRM_MAINNET=yes ./mainnet-all.sh   # simulate: nothing is broadcast or recorded
CONFIRM_MAINNET=yes ./mainnet-all.sh             # balance check, splits, EURC split (Arc), routers,
                                                 # proofs, ingest, verify, distribute, fill
```

It refuses without `CONFIRM_MAINNET=yes` and refuses inside an AI agent session. The wave deploys
with the deployer as owner and the treasury `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A`, and sends
one proof payout of 0.1 token (`PROOF_AMOUNT=100000`) per instance to Pink Paw. It is rerun-safe:
recorded splits and routers are skipped. `PLAN=topup fund a:distribute --network mainnet` writes
`../wave/distribute-mainnet-topup.sh`, which later raises the hot wallet to the one-week amounts.

## Disclosures

- **Custody.** The first shelter is Pink Paw (Rožinė pėdutė). Its receiving wallet was created and
  is held by Token Tails on the shelter's behalf until handover. The chain proves that funds reached
  the registered wallet, not who controls it. At handover the shelter's own address is registered
  in the contract.
- **Prior work.** Token Tails existed before this contract: the game and app, three Soroban
  contracts on Stellar mainnet and ERC-721 contracts on SKALE. ShelterSplit itself was written from
  2026-09-25.
