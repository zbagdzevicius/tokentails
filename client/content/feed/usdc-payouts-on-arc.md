---
title: "USDC Payouts on Arc: Field Notes From a Live Shelter Split"
seoTitle: "Arc Network USDC: Field Notes From Live Payouts"
description: "Field notes from paying a cat shelter in USDC on Arc mainnet: native 18-decimal USDC vs the 6-decimal ERC-20 interface, Foundry deploys, indexing and fees."
excerpt: "What we learned running real shelter payouts on Arc: USDC as gas, the decimals trap, deploying with Foundry, indexing payouts for a public page, and what a treat costs."
slug: usdc-payouts-on-arc
category: build
publishedAt: "2026-10-19"
updatedAt: "2026-10-19"
author: "Token Tails team"
heroImage:
  src: "/feed/web-arc-networks.webp"
  alt: "The Give from your wallet panel on /shelter-payouts: Arc gives USDC with the fee in USDC, next to Arc EURC, Tempo, Arbitrum One, Avalanche and Base"
  width: 1152
  height: 648
keywords:
  - Arc network USDC
  - Arc USDC gas
  - build on Arc
  - Arc network tutorial
  - native USDC 18 decimals
intent: build
cta: payouts
faq:
  - q: "What do you pay gas with on Arc?"
    a: "USDC. Arc charges all transaction fees in USDC, so a wallet needs only USDC to send transactions."
  - q: "How many decimals does USDC have on Arc?"
    a: "Both 18 and 6. Native USDC uses 18 decimals for gas and value; the ERC-20 interface uses the usual 6. They share one balance, so 1 USDC is 10^18 in native units and 10^6 through the ERC-20 interface."
  - q: "What is Arc's chain id?"
    a: "Arc mainnet is chain 5042; Arc testnet is 5042002."
  - q: "How fast is finality on Arc?"
    a: "Arc's documentation says transactions are final in under one second."
sources:
  - label: "Arc docs: gas and fees"
    url: "https://docs.arc.io/arc/references/gas-and-fees"
  - label: "ShelterSplit source, deploy scripts and addresses (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
  - label: "Shelter payouts API (mainnet)"
    url: "https://api.tokentails.com/shelter/payouts?network=mainnet"
  - label: "ShelterSplit on Arc (explorer)"
    url: "https://explorer.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147"
related:
  - usdc-payment-splitter-contract
  - eip-3009-gasless-donations
  - verify-crypto-donation
---

Arc is Circle's Layer 1 network where gas is paid in USDC, and it is a good fit for small, frequent stablecoin payouts. We have run real payouts to Pink Paw, a cat shelter in Kaunas, Lithuania, on Arc mainnet (chain 5042) since 7 October 2026; these are our field notes.

Everything here is checkable: the contract is open source, the addresses are public, and every payout is listed on [/shelter-payouts](/shelter-payouts).

<!-- key-takeaways -->
- On Arc, USDC pays for gas, and native USDC has **18 decimals**; the ERC-20 interface has **6**. Same balance, two scales.
- Most unit bugs come from mixing those scales: guard every amount at deploy time and at the API edge.
- ShelterSplit takes native USDC through `donate(memo)` (no approve step) and ERC-20 USDC or EURC through `disburse`.
- Index `Disbursed` and `NativeDisbursed` events, normalise to 18 decimals, and never add different coins together.
- A 0.01 USDC treat cost about 0.001 USDC in gas in the transaction we checked.

## What Arc is

Arc is a Layer 1 blockchain from Circle, the company behind USDC. It is EVM-compatible, so Solidity contracts, Foundry and the usual JSON-RPC tooling work as they do elsewhere.

Two things set it apart for payouts. First, according to the [Arc docs](https://docs.arc.io/arc/references/gas-and-fees), all transaction fees on Arc are paid in USDC, the native gas coin, so a payout wallet needs only one coin. Second, the docs say transactions are final in under one second. Our backend treats one confirmation as final on Arc.

## Native vs ERC-20 USDC: the decimals trap

On Arc, USDC exists in two views of the same balance:

| View | Decimals | 1 USDC in base units | How you move it |
|---|---|---|---|
| Native (gas and `msg.value`) | 18 | `1000000000000000000` | a plain value transfer or a payable call |
| ERC-20 interface (`0x3600…0000`) | 6 | `1000000` | `transfer`, `approve`, `transferFrom` |

The Arc docs stress that these are not two separate assets: they share one balance. The trap is that both views are called USDC, and nothing in a raw number tells you which scale it uses.

Here is how a 6-decimal number goes wrong in native mode: `50000` means 0.05 USDC through the ERC-20 interface, but as native value it is 5×10⁻¹⁴ USDC. In the other direction, 18-decimal amounts passed to an ERC-20 call ask for a trillion times too much.

What we did about it:

- **Deploy-time floors and ceilings.** Our capped-spender deploy script refuses a per-gift cap below 0.001 USDC or above 1 USDC in the chosen mode's units, which catches a 6-decimal number entered for native mode.
- **One normalised field in the API.** Every payout event our API returns carries its raw `amount` and `decimals`, plus an `amount18` field normalised to 18 decimals, so totals never mix scales.
- **Label the kind.** Each event says whether it was a `native` payout (18 decimals) or an ERC-20 payout (6 decimals). Our Arc split has both kinds on the same contract.

## Deploying the split with Foundry

ShelterSplit is a small Solidity 0.8.24 contract with no external dependencies. It pays every active shelter in the same transaction, emits one public event per payout, and sends any remainder and rounding dust to a treasury, so it holds no balance between calls.

On Arc it has two entry points:

- `donate(string memo)`: payable. It splits `msg.value`, which on Arc is native USDC, so there is no approve step. It emits `NativeDisbursed` per shelter and one batch event.
- `disburse(uint256 amount, string memo)`: pulls an ERC-20 amount (USDC through the interface, or EURC on a second split) and emits `Disbursed` per shelter.

Every deploy input comes from the environment, and a person broadcasts with their own keystore:

```sh
SHELTERSPLIT_TOKEN=<USDC ERC-20 address> SHELTERSPLIT_TREASURY=<treasury> \
SHELTERSPLIT_OWNER=<owner> EXPECTED_CHAIN_ID=5042 \
forge script script/DeployShelterSplit.s.sol --rpc-url <arc rpc> --account <keystore> --broadcast
```

Leave out `--broadcast` to simulate. `EXPECTED_CHAIN_ID` makes the script refuse to run on the wrong network. We compile with `evm_version = "paris"` (no `PUSH0`) so the same bytecode settings work across every chain we deploy to, and verify source on the explorer through Sourcify. Our Arc contracts were deployed and source-verified on 7 October 2026.

Before you send money, read back what a payout would do:

```sh
cast call <split> "preview(uint256)" 1000000000000000000 --rpc-url <arc rpc>
```

On our Arc split today, that call returns one recipient (Pink Paw's wallet) receiving the full amount, with nothing left for the treasury.

One more habit: always read an address together with its chain id. In our deployments the same address plays different roles on different networks, so a bare address in a config file is a bug waiting to happen.

<!-- cta:payouts -->

## Indexing payouts for a public page

A payout page is only trustworthy if anyone can rebuild it from the chain. Ours works like this:

1. For each split, start at its deploy block and read `Disbursed` and `NativeDisbursed` logs in block ranges.
2. Store each event with chain id, contract, transaction hash, log index, block, timestamp, recipient, raw amount, decimals, `amount18` and memo.
3. Track `indexedThrough` per chain, so the page can say how fresh it is.
4. Total by coin symbol only. USDC, EURC, USDC.e and USDG are listed separately and never summed.

The result is public as JSON at [`/shelter/payouts?network=mainnet`](https://api.tokentails.com/shelter/payouts?network=mainnet) (paginated with `cursor`) and as a page at [/shelter-payouts](/shelter-payouts), where each amount links to its transaction on [explorer.arc.io](https://explorer.arc.io/address/0x457c89e10a6e66633eda5bf82fd086febb5db147).

Memos make the feed readable. Each payout carries a short memo naming its source, so a reader can tell a free treat from a Moon Rave gift without trusting our labels: the memo is in the event itself.

## Treats: a 0.01 USDC payout with a daily cap

Our smallest payout is a treat. When a player wins in [Catnip Heist](/heist) and taps, Token Tails sends Pink Paw a 0.01 USDC treat through `donate`. Token Tails budgets 1 USDC of treats a day, which is up to 100 treats, and the budget resets at 00:00 UTC. The live state is public at [`/shelter/donate/status`](https://api.tokentails.com/shelter/donate/status).

What does one cost? We read the receipt of one native treat transaction on 19 October 2026 ([0xc1b6…5e0a](https://explorer.arc.io/tx/0xc1b6da1f8e979b2c57aa2c2ebc90df6b6823535e7449bbf4633a3ed818215e0a)): it used 53,351 gas at about 20 gwei, roughly 0.001 USDC in fees. That is about a tenth of the treat itself. Small, but worth knowing if you design micro-payouts: on Arc the fee is in the same coin as the gift, so it is easy to budget.

## Lessons

- **Name the scale in every variable.** `amountNative18` and `amountErc20_6` read clumsily and save hours.
- **Prefer native `donate` for tiny payouts.** One call, no approve, one fee in USDC.
- **Guard deploys with the chain id.** A script that refuses the wrong network is cheap insurance.
- **Publish the index, not just the total.** A list of events with transaction links lets anyone check you.
- **Be plain about custody.** The chain proves money reached an address, not who holds the key. Since 16 October 2026 our splits pay Pink Paw's own wallet; Token Tails created it, the staff hold the recovery phrase, and Token Tails keeps a recovery backup.

The full source, tests and every deployed address are in [contracts/shelter-split](https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split) (MIT). For the contract design in depth, read [the USDC payment splitter guide](/feed/build/usdc-payment-splitter-contract).
