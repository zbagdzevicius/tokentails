---
title: "x402 Donations: Let an AI Agent Pay a Shelter Over HTTP"
description: "x402 donations explained: how an AI agent pays a charity over HTTP 402 with a signed USDC authorization, why payTo is the shelter's wallet, with open code."
excerpt: "x402 turns HTTP 402 Payment Required into a payment step an AI agent can complete on its own. Here is how we point it at a cat shelter's wallet, with open code and an honest status."
slug: x402-donations
category: build
publishedAt: "2026-10-20"
updatedAt: "2026-10-20"
author: "Token Tails team"
heroImage:
  src: "/feed/web-x402-flow.webp"
  alt: "Diagram: an agent requests a resource, the server answers 402 with payTo set to the shelter wallet, the agent signs an EIP-3009 authorization and retries, a facilitator settles it, and the server answers 200"
  width: 1200
  height: 630
keywords:
  - x402 donations
  - x402 exact scheme example
  - x402 payTo
  - HTTP 402 payment USDC
  - AI agent payments charity
intent: build
cta: payouts
faq:
  - q: "Who pays the gas in an x402 payment?"
    a: "With the standard exact scheme, the facilitator submits the signed USDC authorization and pays the gas. The agent only signs. With our custom onchain-receipt scheme, the agent sends its own transaction and pays its own gas."
  - q: "Can the agent or the facilitator change payTo?"
    a: "No. payTo, the amount and the validity window are inside the EIP-3009 signature. Changing any of them makes the signature invalid. The server, not the agent, chooses payTo, and ours only offers the wallet the chain's split pays."
  - q: "Does x402 need a facilitator?"
    a: "The standard exact scheme uses one to verify and settle the payment. It is not required by HTTP 402 itself: our onchain-receipt scheme has no facilitator, because the server reads the transaction receipt from the chain directly."
  - q: "Has Token Tails received an x402 payment on mainnet?"
    a: "Not yet. The exact scheme passed the public x402.org facilitator's verify step on Base Sepolia, a testnet. No mainnet x402 payment of either scheme has happened so far."
sources:
  - label: "x402 (official site)"
    url: "https://www.x402.org/"
  - label: "Coinbase Developer Platform: how x402 works"
    url: "https://docs.cdp.coinbase.com/x402/how-it-works"
  - label: "x402 reference implementation (GitHub)"
    url: "https://github.com/coinbase/x402"
  - label: "x402: migrating from v1 to v2"
    url: "https://docs.x402.org/guides/migration-v1-to-v2"
  - label: "x402 exact scheme on EVM (spec)"
    url: "https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md"
  - label: "EIP-3009: Transfer With Authorization"
    url: "https://eips.ethereum.org/EIPS/eip-3009"
  - label: "Shelter Rail SDK with payAndFetch (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/shelter-rail"
  - label: "Live payouts"
    url: "https://tokentails.com/shelter-payouts"
related:
  - eip-3009-gasless-donations
  - crypto-donation-button-for-website
  - ai-agent-spending-limit-contract
  - usdc-payment-splitter-contract
claims: []
---

x402 donations use the HTTP 402 Payment Required status to let a program, such as an AI agent, pay over plain HTTP: the server answers 402 with what it wants, the agent signs a USDC authorization and retries with it in a header, and the server answers 200. For a donation, the server can set `payTo` to the charity's own wallet, so the money goes straight from the agent to the shelter and never touches the app in between.

This guide explains the flow, shows how we built it for a cat shelter with two payment schemes, and says plainly what has and has not run on mainnet.

<!-- key-takeaways -->
- x402 is an open standard: a 402 response lists the payment requirements, and the client retries with a signed payment in a header (`X-PAYMENT` in x402 v1, `PAYMENT-SIGNATURE` in v2).
- For USDC on EVM chains, the standard `exact` scheme uses an EIP-3009 `transferWithAuthorization`; a facilitator verifies it, settles it and pays the gas.
- For gifts, set `payTo` to the shelter's own wallet, not to a splitter contract.
- Our second scheme, `onchain-receipt`, needs no facilitator: the agent pays the split itself and the server checks the receipt.
- Status: `exact` passed the x402.org facilitator's verify step on a testnet. No mainnet x402 payment has happened yet.

## How x402 works in four steps

[x402](https://www.x402.org/) describes itself as "an open, neutral standard for internet-native payments": when a request arrives without payment, "the server responds with HTTP 402, prompting the client to pay and retry." [Coinbase's developer docs](https://docs.cdp.coinbase.com/x402/how-it-works) break the handshake into nine steps; for a donation they come down to four:

1. **Request.** The agent calls a URL, for example `GET /shelter/agent/cat-card`.
2. **402 with requirements.** The server answers 402 with a JSON body. Each entry in `accepts` names a `scheme`, a `network`, a `maxAmountRequired` in the asset's base units, the `asset` (the USDC contract), the `payTo` address and a `maxTimeoutSeconds`.
3. **Signed payment.** The agent signs a payment that fits one entry and retries the same request with a base64 `X-PAYMENT` header.
4. **Verify and settle.** The server asks a facilitator to verify the payment, does its work, asks the facilitator to settle, and answers 200 with the resource and an `X-PAYMENT-RESPONSE` header that carries the transaction.

Those are the x402 v1 names, which the examples below use. [Version 2](https://docs.x402.org/guides/migration-v1-to-v2) renames the headers (`X-PAYMENT` becomes `PAYMENT-SIGNATURE`, `X-PAYMENT-RESPONSE` becomes `PAYMENT-RESPONSE`), sends the requirements in a `PAYMENT-REQUIRED` header, and names networks in CAIP-2 form, such as `eip155:84532` instead of `base-sepolia`. Our endpoint answers in both versions and reads either payment header.

Nothing here needs an account, an API key or a card form, which is why x402 suits agents: a program can read a price, decide, and pay within a cap you give it.

## The exact scheme for gifts: payTo is the shelter's wallet

For tokens that support it, such as USDC, `exact` on EVM chains uses [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) (the [v2 scheme spec](https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md) also allows Permit2 for other ERC-20 tokens). The agent signs a `TransferWithAuthorization` from its wallet to `payTo` for the exact amount, with a random nonce and a short validity window. The facilitator submits it to the USDC contract and pays the gas. The signer never sends a transaction.

Our v1 402 body for `exact` on a testnet looks like this (shape from the [Shelter Rail README](https://github.com/zbagdzevicius/tokentails/tree/main/shelter-rail)):

```json
{ "x402Version": 1, "error": "payment required",
  "accepts": [{ "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "10000",
    "payTo": "<the shelter's own wallet>", "asset": "<USDC>", "maxTimeoutSeconds": 120,
    "extra": { "name": "USDC", "version": "2" } }] }
```

`10000` is 0.01 USDC, because USDC's ERC-20 interface uses 6 decimals.

**Why not pay the ShelterSplit contract?** Our [USDC payment splitter](/feed/build/usdc-payment-splitter-contract) pays every shelter in one transaction, but only when someone calls `donate` or `disburse` on it. `transferWithAuthorization` is a plain transfer: USDC would land in the contract without any split logic running, and it would sit there until the owner swept it. Anyone can also submit a `transferWithAuthorization`, so you cannot make a contract's own code run as part of it. (DonateRouter solves this for gasless gifts with `receiveWithAuthorization`; see our [EIP-3009 gasless donations](/feed/build/eip-3009-gasless-donations) guide.) Sending to the shelter's wallet directly keeps the standard flow standard, and the money moves in one hop.

On a mainnet, our server only offers `exact` while `payTo` is the one wallet that chain's split pays, read from the chain. Since 16 October 2026 that is Pink Paw's wallet. Pink Paw (Rožinė pėdutė) is a cat shelter in Kaunas, Lithuania; Token Tails created the wallet, shelter staff hold the recovery phrase, and Token Tails keeps a recovery backup.

## Our two schemes on one endpoint

The Token Tails API sells one small card at `GET /shelter/agent/cat-card`: a shelter cat's name, photo and shelter. The whole price goes to shelters.

| | `exact` (standard) | `onchain-receipt` (custom) |
|---|---|---|
| What the agent does | Signs an EIP-3009 authorization | Sends its own transaction to ShelterSplit with the memo `x402:<nonce>` |
| `payTo` | The shelter's wallet | The ShelterSplit contract |
| Facilitator | Yes; it settles and pays the gas | None; the server reads the receipt over RPC |
| Chains | Networks a facilitator supports | Every chain with a split, including Arc and Tempo |
| Splits across several shelters | No | Yes |

`onchain-receipt` exists because standard facilitators may not support every chain we use. The agent pays the split (`donate` on Arc, approve plus `disburse` elsewhere, `disburseWithMemo` on Tempo), then retries with `X-PAYMENT` holding the transaction hash and the nonce. The server checks that the receipt succeeded and that the split emitted payout events with that memo adding up to the price.

When both are offered, `accepts` holds only the `exact` entry, because off-the-shelf clients such as `x402-fetch` parse every entry and throw on an unknown scheme. The custom offers move to a top-level `onchainReceipts` field.

## Client code with payAndFetch

The Shelter Rail SDK (MIT, no dependencies) has an x402 client that handles both schemes:

```js
import { payAndFetch } from "./src/sdk.mjs";

const { response, paid } = await payAndFetch("https://<api-host>/shelter/agent/cat-card", {
  maxAmountBase: 10_000n,            // cap: 0.01 USDC (6 decimals) for exact and token offers
  provider: window.ethereum,         // or signTypedData: async (typedData) => sig, account: "0x..."
});
console.log(await response.json(), paid?.txHash);
```

At least one cap is required: `maxAmountBase` for 6-decimal offers and `maxAmountWei` for native USDC on Arc (18 decimals). `payAndFetch` refuses any price above its cap, pays at most once per call, and passes any non-402 response straight through. For an agent that runs without a person watching, the cap in code is useful, but a cap the chain enforces is stronger; that is the idea behind our [CappedSpender contract](/feed/build/ai-agent-spending-limit-contract).

The repo also has `examples/agent-pay.mjs`, a Node agent that refuses any chain that is not a known testnet and, without `--yes`, only prints the offers.

## Replay and abuse protection

Payments that can be retried need to be counted exactly once. What the server does:

- **Nonces expire and are spent once.** An `onchain-receipt` nonce must be one the server issued, unused, and less than 600 seconds old.
- **A transaction pays for one card.** Every accepted transaction hash is stored under a unique index; a second use gets a 402 that says so.
- **The authorization is claimed first.** For `exact`, the server records the signer and the EIP-3009 nonce before it calls the facilitator, so two identical requests in parallel cannot both settle.
- **Read back from the chain.** After settlement, the server re-reads the USDC `Transfer` log. A payment it cannot confirm on chain is stored but left out of the public totals.
- **Prices are per chain**, in that chain's units, and every refusal is a fresh 402 whose `error` says why.

<!-- cta:payouts -->

## Status, stated honestly

- The `exact` flow was tested on Base Sepolia, a testnet: the off-the-shelf `x402-fetch` client parsed our 402, signed, and its payment passed our server's checks and the public x402.org facilitator's `/verify`. A full settlement through that facilitator has not been run yet.
- No x402 payment of either scheme has happened on any mainnet. You can check: x402 payments carry an `x402:` memo, and [/shelter-payouts](/shelter-payouts) lists every mainnet payout with its memo.
- On mainnet, `exact` is not offered yet: it still needs a facilitator account and the server settings for it. A mainnet chain gets any x402 offer only after the shelter's wallet check passes there.

We would rather publish this as working, open code with a testnet result than claim traffic that does not exist.

## When x402 fits a nonprofit, and when a button is better

x402 fits when the payer is a program: an AI agent with a budget, a paid API whose fee goes to a cause, or a "pay a cent to unlock this" step in a tool. It is machine-readable, needs no account, and with `payTo` set to the charity's wallet the app never holds the money.

For people, a [crypto donation button](/feed/build/crypto-donation-button-for-website) is usually better: a person wants to choose an amount, see their wallet prompt and get a thank-you, not handle a 402. Many nonprofits will want both: the button for supporters, and an x402 endpoint for agents.

Whichever you choose, publish who holds the receiving wallet and let anyone check the payouts on chain.
