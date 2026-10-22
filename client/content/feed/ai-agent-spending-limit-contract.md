---
title: "AI Agent Spending Limits On-Chain: A Capped USDC Contract"
seoTitle: "AI Agent Spending Limit Smart Contract (Solidity, MIT)"
description: "An AI agent spending limit the chain enforces: an MIT Solidity contract with per-gift and daily USDC caps fixed at deploy and one allowed destination."
excerpt: "The safest spending limit for an AI agent is one the chain enforces, not the prompt. CappedSpender is a small MIT contract that caps every gift and every day, and can only pay a shelter split."
slug: ai-agent-spending-limit-contract
category: build
publishedAt: "2026-10-20"
updatedAt: "2026-10-20"
author: "Token Tails team"
heroImage:
  src: "/feed/web-capped-spender.webp"
  alt: "Diagram: an agent hot key can only call give(amount, memo) on CappedSpender, which checks the per-gift and daily caps and pays ShelterSplit only; the owner can fund the float and withdraw only to itself"
  width: 1200
  height: 630
keywords:
  - AI agent spending limit smart contract
  - agent wallet daily cap
  - per-transaction cap solidity
  - USDC spending limit contract
  - CappedSpender
intent: build
cta: payouts
faq:
  - q: "What happens when the agent asks for more than the cap?"
    a: "The transaction reverts and nothing moves. A gift above perTxCap fails with OverTxCap, and a gift that would take the day's total above dailyCap fails with OverDailyCap. A failed gift does not use up any of the daily budget."
  - q: "Can the owner change the caps later?"
    a: "No. perTxCap, dailyCap, the agent address, the split and the mode are all immutable. Changing any of them means deploying a new contract. The owner can only fund the float, withdraw it to its own address, and hand ownership on in two steps."
  - q: "Does it work with native USDC on Arc?"
    a: "Yes. In native mode (Arc only) amounts are in 18-decimal wei and gifts go through ShelterSplit's donate(). In ERC-20 mode amounts are token units, 6 decimals for USDC, and gifts go through disburse()."
  - q: "Is the daily cap a rolling 24 hours?"
    a: "No. The day is the UTC calendar day (block.timestamp / 1 days) and resets at 00:00 UTC, so up to two days' caps can go out either side of midnight. Size dailyCap with that in mind."
sources:
  - label: "CappedSpender.sol (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/blob/main/contracts/shelter-split/src/CappedSpender.sol"
  - label: "contracts/shelter-split README, tests and deploy script"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
  - label: "Safe: AI agent with a spending limit"
    url: "https://docs.safe.global/home/ai-agent-quickstarts/agent-with-spending-limit"
  - label: "MetaMask Smart Accounts Kit: spending limit scopes"
    url: "https://docs.metamask.io/smart-accounts-kit/guides/delegation/use-delegation-scopes/spending-limit/"
  - label: "Mainnet deployment list"
    url: "https://tokentails.com/shelter-payouts/deployments.json"
related:
  - usdc-payment-splitter-contract
  - x402-donations
  - usdc-payouts-on-arc
  - eip-3009-gasless-donations
claims: []
---

The safest spending limit for an AI agent is one the blockchain enforces, not one written in its prompt: put the money in a contract that refuses any payment above a per-transaction cap or a daily cap, and give the agent a key that can only ask that contract to pay. Whatever the model is talked into, the chain reverts anything outside the limits.

CappedSpender is our small, MIT-licensed Solidity contract that does exactly this for giving to cat shelters. One agent address can give from a float only into one ShelterSplit, at most `perTxCap` per gift and `dailyCap` per day, and those caps are fixed at deploy.

<!-- key-takeaways -->
- Prompt rules can be bypassed by a confused or manipulated model. A `revert` cannot.
- The agent has one function, `give(amount, memo)`, and one destination: the ShelterSplit set at deploy.
- `perTxCap`, `dailyCap`, the agent, the split and the mode are immutable. Not even the owner can raise a cap.
- Deploy guards catch the classic units mistake: a 6-decimal number written for 18-decimal native USDC on Arc.
- It is open source with Foundry tests, not externally audited, and not deployed on any mainnet yet.

## Why the limit belongs in the contract

An agent that can sign transactions holds a hot key. If the only limit is an instruction such as "never give more than 0.05 USDC", that limit lives in the same place an attacker aims at: the model's input. A prompt injection in a web page, a bad tool result or a plain bug can produce a payment you never meant to allow.

A contract-level limit changes who decides. The agent still proposes, but the contract checks every gift before any money moves, and a failed check reverts the whole transaction. You can then reason about the worst case without trusting the model at all: at most `dailyCap` per UTC day, only to the shelters, and never more than the float you put in.

## The design

```solidity
constructor(address split_, address agent_, address owner_, uint256 perTxCap_, uint256 dailyCap_, bool native_)
```

Three roles, each with as little power as possible:

| Role | Can do | Cannot do |
|---|---|---|
| Agent (an AI-driven hot key) | Call `give(amount, memo)` within the caps | Pick a destination, make any other call, touch the float |
| Owner (whoever funds the float) | Fund the float; withdraw it only to its own address; hand ownership on in two steps | Raise the caps, change the agent, the split or the mode |
| ShelterSplit | Receive each gift and pay the shelter wallets in the same transaction | – |

There is no arbitrary target and no arbitrary call. The only place money can go is the split, and the contract also refuses a gift while the split is paused or while any part of the amount would reach the split's treasury, so the float can only end up in shelter wallets.

Two details from the source matter in practice. Native coin is accepted only from the owner, so a confused donor's native gift cannot land in the float. A contract cannot block an ERC-20 transfer, though, so a token sent there by mistake would join the float, which only the owner can withdraw. That is why the source says plainly the contract "is not a donation address and must never be shown as one". And every memo must start with `tt:agent:`, so the agent's gifts are tagged on chain and easy to tell apart from anyone else's.

## The code that matters

The whole check happens in `give`, before any money moves:

```solidity
function give(uint256 amount, string calldata memo) external onlyAgent nonReentrant returns (uint256 batchId) {
    bytes calldata m = bytes(memo);
    if (m.length < MEMO_PREFIX.length || m.length > MAX_MEMO_BYTES || bytes9(m[:9]) != MEMO_PREFIX) {
        revert BadMemo();
    }
    if (amount == 0) revert ZeroAmount();
    if (amount > perTxCap) revert OverTxCap(amount, perTxCap);

    uint256 d = today();
    uint256 spent = currentDay == d ? spentOnDay : 0;
    uint256 next = spent + amount;
    if (next > dailyCap) revert OverDailyCap(next, dailyCap);

    if (split.paused()) revert SplitPaused();
    (,, uint256 toTreasury) = split.preview(amount);
    if (toTreasury != 0) revert TreasuryShare(toTreasury);

    uint256 available = floatBalance();
    if (available < amount) revert InsufficientFloat(available, amount);
    // ... record the spend, then pay through split.donate or split.disburse
}
```

After paying, it checks that exactly `amount` left the float, and emits `AgentGift(batchId, amount, memo, spentToday)`. `today()` is `block.timestamp / 1 days`, a UTC calendar day rather than a rolling 24 hours, so up to twice `dailyCap` can go out across midnight. In ERC-20 mode the contract approves exactly the gift, calls `disburse`, and sets the approval back to zero.

Read the full file: [CappedSpender.sol](https://github.com/zbagdzevicius/tokentails/blob/main/contracts/shelter-split/src/CappedSpender.sol). It has no imports and no dependencies.

## Deploy guards: catching the units mistake

On Arc, USDC is the native coin with 18 decimals, while its ERC-20 interface and most other chains use 6 ([more on that here](/feed/build/usdc-payouts-on-arc)). Writing `50000` meaning 0.05 USDC in native mode would set a cap of 0.00000000000005 USDC; writing an 18-decimal number in ERC-20 mode would set an enormous cap. The deploy script refuses both:

- `EXPECTED_CHAIN_ID` is required, and the script reverts on any other chain.
- Native mode reverts anywhere but Arc (5042 or 5042002).
- `PerTxAboveCeiling`: a per-gift cap above 1 USDC in the mode's units, unless you override the ceiling on purpose. A daily cap above 100 times that ceiling fails too.
- `PerTxBelowFloor`: a per-gift cap below 0.001 USDC in the mode's units. This is the one that catches a 6-decimal number in native mode.

The command from the README, simulated without broadcasting:

```sh
CAPPED_SPLIT=<ShelterSplit> CAPPED_AGENT=<agent EOA> CAPPED_OWNER=<owner> CAPPED_NATIVE=1 \
CAPPED_PER_TX=50000000000000000 CAPPED_DAILY=200000000000000000 EXPECTED_CHAIN_ID=5042002 \
forge script script/DeployCappedSpender.s.sol --rpc-url <rpc>
```

The script logs both caps in micro-USDC, so the same number reads the same way in both modes. After a real deploy, read `native()`, `perTxCap()` and `dailyCap()` back before you fund it.

## Tests

`forge test` inside `contracts/shelter-split` runs the suite. For this contract, `test/CappedSpender.t.sol` covers gifts in both modes, a gift exactly at the cap, both over-cap reverts, the day rolling over, the last second of a day still counting as that day, a fuzz test that no more than `dailyCap` leaves in one day, non-agent callers, the treasury guard (including rounding dust), a paused split, a failed gift not using the daily budget, memo rules, funding and withdrawal rules, two-step ownership, and caps that cannot change after deploy.

`test/CappedSpenderMatchDesk.t.sol` runs the same refusals with the real runbook caps and walks the deploy script's whole path, guards included.

<!-- cta:payouts -->

## How this compares with other approaches

There are other good ways to limit an agent, and they solve slightly different problems:

- **Safe's allowance module.** Safe's quickstart for [an agent with a spending limit](https://docs.safe.global/home/ai-agent-quickstarts/agent-with-spending-limit) uses its allowance module to "set an allowance per token for a spender" on a Safe smart account. Good when the agent spends from an organisation's treasury to many destinations.
- **MetaMask delegation scopes.** The [Smart Accounts Kit](https://docs.metamask.io/smart-accounts-kit/guides/delegation/use-delegation-scopes/spending-limit/) lets an account delegate a spending scope, such as an ERC-20 amount per period, to another address. Good when a user's own smart account grants the limit.
- **CappedSpender.** A single-purpose contract with one destination and immutable caps, under 300 lines, no account framework needed. Good when the agent should only ever pay one kind of recipient and you want the rule to be impossible to widen later.

You can combine them: for example, an allowance that tops up a CappedSpender float.

## What we actually run

The Sponsor Match Desk is our agent design built on CappedSpender: each sponsor funds its own vault, every vault names the same agent, and the agent matches public gifts to the shelter from them, capped at 0.05 USDC per gift and 0.20 USDC per day in native mode on Arc. The two sponsors in the example configuration are Token Tails itself and Motored, the Token Tails founder's own company, so both are related parties, not outside sponsors. The runbook deploys on Arc testnet first, then Arc mainnet.

To be precise about today: no CappedSpender address is in our public [deployment list](https://tokentails.com/shelter-payouts/deployments.json), and our contracts docs list it as not deployed. None of the mainnet payouts on [/shelter-payouts](/shelter-payouts) carries a `tt:agent:` memo yet. When a CappedSpender goes live, its gifts will show there with that memo.

If you build an agent that gives money away, start with the cap in the contract and the smallest float that does the job. Then see how the same shelter can take payments from agents over HTTP in our [x402 donations](/feed/build/x402-donations) guide, and how the split behind it works in [USDC payment splitter contract](/feed/build/usdc-payment-splitter-contract).
