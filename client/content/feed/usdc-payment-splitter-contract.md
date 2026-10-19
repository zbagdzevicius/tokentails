---
title: "USDC Payment Splitter Contract: How ShelterSplit Works"
seoTitle: "USDC Payment Splitter in Solidity: Open Source, MIT"
description: "An MIT, dependency-free USDC payment splitter in Solidity that pays every recipient in one transaction and holds nothing. Design, code and Foundry deploy."
excerpt: "ShelterSplit is a pass-through USDC splitter used in production to pay a cat shelter. Here is the design, the code that matters, and how to deploy your own."
slug: usdc-payment-splitter-contract
category: build
publishedAt: "2026-10-19"
updatedAt: "2026-10-19"
author: "Token Tails team"
heroImage:
  src: "/feed/web-splitter-flow.webp"
  alt: "Diagram: a payer calls disburse on ShelterSplit, which pays two shelters by basis points and the remainder to a treasury in one transaction"
  width: 1200
  height: 630
keywords:
  - USDC payment splitter contract
  - payment splitter solidity
  - split payments smart contract
  - donation splitter contract
  - ShelterSplit
intent: build
cta: payouts
faq:
  - q: "Is there a maintained alternative to OpenZeppelin's PaymentSplitter?"
    a: "OpenZeppelin removed PaymentSplitter in Contracts v5. ShelterSplit is a different design: it pays every recipient in the same call instead of holding funds for them to pull. It is MIT licensed and has no dependencies."
  - q: "Does ShelterSplit hold funds?"
    a: "Not between calls. disburse() pulls the payment and pays every active shelter and the treasury in the same transaction. Only coins sent to it by plain transfer can sit there, and the owner can recover them with a public Swept event."
  - q: "Can I use it for something other than shelters?"
    a: "Yes. The registry is a list of wallets with basis-point shares. Any split of a stablecoin payment across a fixed set of recipients works the same way."
  - q: "Has it been audited?"
    a: "No external audit. The repo has unit, fuzz, invariant and reentrancy tests that you can run with forge test, and the deployed source is verified on each network's explorer."
sources:
  - label: "contracts/shelter-split (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
  - label: "shelter-rail SDK and widget (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/shelter-rail"
  - label: "Live payouts indexed from the contract events"
    url: "https://tokentails.com/shelter-payouts"
  - label: "Mainnet deployment list"
    url: "https://tokentails.com/shelter-payouts/deployments.json"
related:
  - eip-3009-gasless-donations
  - usdc-payouts-on-arc
  - how-token-tails-works
---

A USDC payment splitter contract takes one payment and divides it between several wallets by fixed shares. ShelterSplit does that in a single transaction and holds no balance afterwards; it is MIT licensed, has no external dependencies, and is deployed on seven mainnets, where it pays a real cat shelter (almost all of it on Arc so far).

The source is in [contracts/shelter-split on GitHub](https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split). This article walks through the design choices and the code that matters.

<!-- key-takeaways -->
- Pass-through: `disburse()` pulls the payment and pays every active recipient in the same call.
- Shares are basis points (10,000 = 100%); the remainder and rounding dust go to a treasury.
- One event per payout, so an indexer can rebuild a full public ledger from logs alone.
- DonateRouter adds a front door with no owner, where a gift can never reach the treasury.
- Solidity 0.8.24, Foundry, no `lib/` folder, no submodules.

## Why pass-through instead of pull payments

OpenZeppelin's `PaymentSplitter` (removed in Contracts v5) used the pull pattern: the contract held the funds and each payee called `release()` later. That is safe, but the money sits in the contract, and someone has to remember to claim it.

ShelterSplit pushes instead. One call pulls the stablecoin from the payer, pays every active shelter its share, sends the remainder to a treasury, and ends with the same balance it started with. Nothing waits to be claimed, so there is nothing to forget and no growing pot to protect.

The trade-off: if one transfer fails, the whole batch reverts. Nobody is ever paid short, but a recipient that rejects transfers blocks the split until the owner fixes the registry.

## Shares in basis points and the shelter registry

Each recipient is a wallet with a share in basis points and an active flag. The owner manages the list; the sum of all shares can never exceed 10,000.

```solidity
function addShelter(address wallet, uint16 bps, string calldata name) external onlyOwner {
    if (wallet == address(0)) revert ZeroAddress();
    if (bps == 0) revert ZeroBps();
    if (bytes(name).length > MAX_NAME_BYTES) revert NameTooLong();
    if (_indexPlusOne[wallet] != 0) revert ShelterExists(wallet);
    if (_shelters.length >= MAX_SHELTERS) revert TooManyShelters();
    uint256 next = totalBps + bps;
    if (next > BPS_DENOMINATOR) revert BpsCapExceeded(next);
    totalBps = next;
    _shelters.push(Shelter({wallet: wallet, bps: bps, active: true, name: name}));
    _indexPlusOne[wallet] = _shelters.length;
    emit ShelterAdded(wallet, bps, name);
}
```

An inactive shelter keeps its slot and its share, but its share goes to the treasury until it is reactivated. Counting inactive shares in `totalBps` means reactivating one can never push the total past 100%.

Changing a recipient's wallet is a `removeShelter` followed by an `addShelter`, and both emit public events. That is how, on 16 October 2026, every mainnet split was rotated from a wallet Token Tails held for the shelter to Pink Paw's own wallet. (Token Tails created that wallet and keeps a recovery backup; the shelter's staff hold the recovery phrase.)

## The split loop

All three payout paths (ERC-20 `disburse`, Tempo's memo transfer `disburseWithMemo`, and native `donate` on Arc, where the native coin is USDC) share one loop:

```solidity
function _split(uint256 received, string memory memo, bytes32 memo32, uint8 mode)
    private
    returns (uint256 batchId)
{
    batchId = ++batchCount;
    uint256 paid;
    uint256 count;
    uint256 n = _shelters.length;
    for (uint256 i; i < n; ++i) {
        Shelter storage s = _shelters[i];
        if (!s.active) continue;
        uint256 share = (received * s.bps) / BPS_DENOMINATOR;
        if (share == 0) continue;
        paid += share;
        ++count;
        _pay(s.wallet, share, memo32, mode);
        if (mode == PAY_NATIVE) emit NativeDisbursed(s.wallet, share, memo);
        else emit Disbursed(s.wallet, share, memo);
    }
    uint256 rest = received - paid;
    if (rest != 0) _pay(treasury, rest, memo32, mode);
    if (mode == PAY_NATIVE) emit NativeDisbursementBatch(batchId, msg.sender, received, paid, rest, count, memo);
    else emit DisbursementBatch(batchId, msg.sender, received, paid, rest, count, memo);
}
```

Three details are worth copying:

- **It splits what arrived, not what was asked.** `disburse()` measures its balance before and after the pull, so a fee-on-transfer coin cannot make it overpay.
- **Rounding goes to one place.** Each share is floored, and the dust lands with the treasury in the same transaction.
- **Native and ERC-20 units never mix.** On Arc, native USDC has 18 decimals while the ERC-20 view has 6. Native payouts emit separate `Native*` events so an indexer cannot add the two scales together.

## One event per payout is a public ledger

Every shelter payment emits `Disbursed(shelter, amount, memo)` (or `NativeDisbursed`), and every call emits one batch event with the totals. Memos carry context, such as an order or campaign id, up to 256 bytes.

That is enough to build a ledger without a database of your own. [tokentails.com/shelter-payouts](/shelter-payouts) indexes these events on every network and links each amount to its transaction. Totals are kept per coin and never added across coins.

<!-- cta:payouts -->

## DonateRouter: a front door with no owner

ShelterSplit has an owner, who could in theory set an unassigned share that flows to the treasury. For public gifts that is not good enough, so DonateRouter sits in front of the split:

- **No owner, no setters, no sweep.** Nothing about it can change after deploy; its configuration is two immutables, the split and the stablecoin.
- **Treasury guard.** It reverts while the split is paused, if `preview(amount)` would send anything to the treasury, and if the treasury balance moved after paying.
- **The donor signs who gets paid.** A gift is one EIP-3009 `receiveWithAuthorization` signature whose nonce binds the memo, the router and a hash of the exact payout list. If the list changes between signing and submitting, the gift reverts with `RecipientsChanged` and the USDC stays with the donor.

A relayer can submit the signature and pay the gas, but it cannot change the amount, the memo or the destination. The signature format is covered in [EIP-3009 gasless USDC transfers](/feed/build/eip-3009-gasless-donations).

## CappedSpender: limits fixed at deploy

CappedSpender holds a small float that one agent address can give into one split, with a per-gift cap and a per-UTC-day cap. The caps, the agent, the split and the mode are immutable: the owner can fund the float and withdraw it, but cannot raise the limits. Gifts only go through while the split would send nothing to the treasury.

## Deploying with Foundry

Every input comes from the environment; nothing is hard-coded. Without `--broadcast`, the script only simulates.

```sh
cd contracts/shelter-split
forge build
forge test   # unit, fuzz, invariants, reentrancy, Tempo memo path, DonateRouter

SHELTERSPLIT_TOKEN=<USDC address> SHELTERSPLIT_TREASURY=<treasury> \
SHELTERSPLIT_OWNER=<owner, use a multisig> EXPECTED_CHAIN_ID=<chain id> \
forge script script/DeployShelterSplit.s.sol --rpc-url <rpc> --account <keystore> --broadcast
```

`EXPECTED_CHAIN_ID` refuses to run on any other chain. Compiler settings are pinned in `foundry.toml` (solc 0.8.24, optimizer 200 runs, EVM `paris`), so the deployed bytecode can be source-verified on each explorer.

**Why the same address shows up on many chains.** A contract address follows from the deployer and its nonce. Deploy from one key with the same nonce on each chain and the split gets the same address everywhere, which is why ShelterSplit is at `0x457c89e10a6e66633Eda5Bf82fD086FEbB5DB147` on several mainnets. The flip side: the same address can mean a different contract on another chain, so always read an address together with its chain id. The [deployment list](https://tokentails.com/shelter-payouts/deployments.json) is the source of truth.

Check a live deployment before trusting it:

```sh
cast call <split> "preview(uint256)" 1000000 --rpc-url <rpc>   # who 1 USDC would pay
cast call <router> "canDonate(uint256)(bool,uint256)" 1000000 --rpc-url <rpc>   # (true, 0) = nothing to the treasury
```

## Using it from an app: the Shelter Rail SDK and widget

For just a donate button, there is no need to write contract calls. [shelter-rail](https://github.com/zbagdzevicius/tokentails/tree/main/shelter-rail) (MIT, no dependencies, browsers and Node 18+) has:

- **A widget.** One `<script>` tag adds a donate button and a live, on-chain "shelters received" total.
- **An SDK.** `encodeDonate`, `readTotals`, injected-wallet helpers and a gasless `signAndRelay` for the router path.

Gasless mode needs a relay that pays the gas. The relay only submits the donor's signature; it never holds the gift. Token Tails' public relay is off today (`relay: false`).

## Where to go next

- Read the source and run the tests: [contracts/shelter-split](https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split).
- See the contract in production: [/shelter-payouts](/shelter-payouts) lists every payout to Pink Paw, a cat shelter in Kaunas, with explorer links.
- The plain-language version for non-developers: [How Token Tails gets money to a real cat shelter](/feed/giving/how-token-tails-works).
