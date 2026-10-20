---
title: "EIP-3009 Gasless USDC Donations: receiveWithAuthorization"
seoTitle: "EIP-3009 Gasless USDC Transfers for Donations"
description: "Gasless USDC donations with EIP-3009: why receiveWithAuthorization beats transferWithAuthorization, the typed data to sign, nonces, relays and pitfalls."
excerpt: "A donation-focused guide to EIP-3009: the signed USDC authorization, why a contract payee needs receiveWithAuthorization, how an MIT router binds the payout list into the nonce, and what trips people up."
slug: eip-3009-gasless-donations
category: build
publishedAt: "2026-10-19"
updatedAt: "2026-10-19"
author: "Token Tails team"
heroImage:
  src: "/feed/web-eip3009-flow.webp"
  alt: "Diagram: a giver signs an EIP-3009 authorization, a relay submits it, DonateRouter checks it and ShelterSplit pays the shelter in the same transaction"
  width: 1200
  height: 630
keywords:
  - EIP-3009 gasless USDC transfer
  - receiveWithAuthorization
  - transferWithAuthorization
  - gasless USDC donation
  - EIP-712 USDC authorization
intent: build
cta: payouts
faq:
  - q: "What is EIP-3009?"
    a: "A standard for transferring a fungible asset with a signed authorization instead of a transaction from the holder. USDC implements it, so a holder can sign an EIP-712 message and anyone can submit it on chain."
  - q: "What is the difference between transferWithAuthorization and receiveWithAuthorization?"
    a: "Anyone can submit a transferWithAuthorization. receiveWithAuthorization adds one rule: the caller must be the payee. When the payee is a contract, that stops a front-runner from redeeming the signature outside the contract's own logic."
  - q: "Who pays the gas in an EIP-3009 transfer?"
    a: "Whoever submits the signed authorization, usually a relay. The signer pays nothing in gas and sends no transaction."
  - q: "Can a relay change the amount or the recipient?"
    a: "No. The amount, the payee and the validity window are inside the signature. In DonateRouter the memo and the exact shelter payout list are bound into the nonce too."
sources:
  - label: "EIP-3009: Transfer With Authorization"
    url: "https://eips.ethereum.org/EIPS/eip-3009"
  - label: "DonateRouter source (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/blob/main/contracts/shelter-split/src/DonateRouter.sol"
  - label: "ShelterSplit and DonateRouter README"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split"
  - label: "Shelter Rail SDK and widget (MIT)"
    url: "https://github.com/zbagdzevicius/tokentails/tree/main/shelter-rail"
  - label: "Arc docs: connect to Arc"
    url: "https://docs.arc.io/integrate/connect-to-arc"
  - label: "Circle faucet"
    url: "https://faucet.circle.com/"
related:
  - usdc-payment-splitter-contract
  - usdc-payouts-on-arc
  - verify-crypto-donation
claims: []
---

EIP-3009 lets a USDC holder move USDC by signing one EIP-712 message instead of submitting a transaction, so a relay can submit it and cover the gas.

For donations to a contract, use `receiveWithAuthorization`, not `transferWithAuthorization`: it only lets the payee contract redeem the signature, which closes a front-running hole.

This guide walks through how we use it in DonateRouter, an MIT-licensed contract that passes a USDC gift through to a shelter's wallet in one transaction. All code is open in [contracts/shelter-split](https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split). The concepts carry over to any "sign once, a relay submits" flow.

<!-- key-takeaways -->
- The donor signs a `ReceiveWithAuthorization` typed message; no approve step and no transaction from the donor.
- `receiveWithAuthorization` requires `msg.sender == to`, so only the payee contract can use the signature.
- DonateRouter packs the memo and the exact payout list into the EIP-3009 nonce, so nobody can redirect a signed gift.
- Read `name()` and `version()` from each USDC contract: Base's USDC is "USD Coin", Arc's and Monad's are "USDC".
- On Arc, USDC is the native coin with 18 decimals, but its ERC-20 interface uses 6.

## EIP-3009 in two minutes

[EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) adds signed transfers to a fungible asset contract. Circle's USDC (the FiatToken contract) implements it. The holder signs an EIP-712 message with six fields:

| Field | Meaning |
|---|---|
| `from` | The payer (the signer) |
| `to` | The payee |
| `value` | Amount in base units (USDC: 6 decimals) |
| `validAfter` | Unix time after which it can be used |
| `validBefore` | Unix time before which it must be used |
| `nonce` | A random 32-byte value, used once |

Anyone holding the signature can submit it. The USDC contract checks the signature, checks the time window, marks the nonce as used and moves the funds. The signer never touches gas.

Unlike ERC-2612 `permit`, nonces are random rather than sequential, so a wallet can have many open authorizations at once and none blocks another. `authorizationState(authorizer, nonce)` tells you whether one has been used, and `cancelAuthorization` lets the signer kill an unused one.

## transferWithAuthorization vs receiveWithAuthorization

Both take the same signed fields. The difference is who may call them.

| | `transferWithAuthorization` | `receiveWithAuthorization` |
|---|---|---|
| Who can submit | Anyone | Only the payee (`msg.sender == to`) |
| Typed data name | `TransferWithAuthorization` | `ReceiveWithAuthorization` |
| Safe when the payee is a contract | No | Yes |

Here is the problem with the first one. Say a donor signs a `transferWithAuthorization` whose payee is your gift contract, and your relay submits the contract's `give(signature)`. A front-runner who sees the signature in the mempool can call USDC's `transferWithAuthorization` directly first. The USDC lands in your contract, the nonce is spent, the relay's `give` call reverts, and none of your contract's logic (splitting, events, memo) ran.

With `receiveWithAuthorization`, USDC only accepts the call from the payee itself, so the signature is useless to anyone but your contract. That is why DonateRouter's donor signs `ReceiveWithAuthorization` with `to` set to the router.

## The typed data we sign

The EIP-712 domain is the USDC contract's own, read from the chain:

```json
{
  "domain": {
    "name": "USDC",
    "version": "2",
    "chainId": 5042,
    "verifyingContract": "0x3600000000000000000000000000000000000000"
  },
  "primaryType": "ReceiveWithAuthorization",
  "types": {
    "ReceiveWithAuthorization": [
      { "name": "from", "type": "address" },
      { "name": "to", "type": "address" },
      { "name": "value", "type": "uint256" },
      { "name": "validAfter", "type": "uint256" },
      { "name": "validBefore", "type": "uint256" },
      { "name": "nonce", "type": "bytes32" }
    ]
  },
  "message": {
    "from": "<donor>",
    "to": "<DonateRouter>",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "<now + 300>",
    "nonce": "<router.authNonce(salt, memo, recipients)>"
  }
}
```

The values above are for USDC on Arc mainnet (chain 5042), as read on 19 October 2026. The `types` also include the standard `EIP712Domain` entry; `value` 1000000 is 1 USDC.

The interesting part is the nonce. EIP-3009 only asks for 32 random bytes, so DonateRouter derives them from what the donor means to do:

```solidity
function authNonce(bytes32 salt, string calldata memo, bytes32 recipients) public view returns (bytes32) {
    return keccak256(abi.encode(address(this), keccak256(bytes(memo)), salt, recipients));
}

function recipientsHash(uint256 amount) public view returns (bytes32) {
    (address[] memory wallets, uint256[] memory amounts,) = split.preview(amount);
    return keccak256(abi.encode(wallets, amounts));
}
```

`salt` is fresh randomness from the donor's client, which keeps every nonce unique. `recipients` is the hash of every shelter wallet and the exact amount each would receive for this gift, read from ShelterSplit's `preview`. Because the nonce is inside the signature, the memo, this router and the payout list are all signed too, without changing EIP-3009 at all.

## What the router checks before it pays

When a relay calls `donateWithAuthorization(gift, memo, signature)`, the router runs these checks in order:

1. **Guard.** The amount is not zero, the split is not paused, and `preview(amount)` sends nothing to the split's treasury.
2. **Payout list.** `recipientsHash(value)` still equals the `recipients` the donor signed. If the split owner changed a shelter wallet in between, the call reverts with `RecipientsChanged` and the USDC stays with the donor.
3. **Redeem.** It recomputes the nonce and calls USDC's `receiveWithAuthorization` with itself as `to`.
4. **Pay out.** It approves exactly the amount, calls `ShelterSplit.disburse`, and checks that the treasury balance did not move.

The router has no owner, no setters and no sweep, and it never holds a gift between transactions. A `bytes signature` overload covers FiatToken v2.2, which also accepts ERC-1271 smart and passkey wallets; `donateWithAuthorizationVRS` covers contracts that only have the v/r/s form.

## Relaying: who pays the gas?

Anyone may submit a signed gift and pay its gas: a backend relay, a bot, or the donor's own second wallet. The relay cannot change the amount, the memo or where the money goes; all it can do is submit or not submit.

Be clear about today's state: **Token Tails' public gasless relay is not switched on.** The live status endpoint, `GET https://api.tokentails.com/shelter/match/status`, reports `"relay": false`. The mechanism, the routers and the client code are public, so you can run your own relay against the deployed routers, or test the whole flow on a testnet.

On the client side, the [Shelter Rail SDK](https://github.com/zbagdzevicius/tokentails/tree/main/shelter-rail) does the signing in one call. `signAndRelay` checks that the router points at the expected split and USDC, calls `canDonate`, reads `recipientsHash` and `authNonce`, reads USDC's `name()` and `version()`, asks the wallet for one `eth_signTypedData_v4`, and POSTs the result to the relay URL you pass in.

## Nonces, time windows and replay protection

- **Single use.** USDC marks each `(from, nonce)` pair as used. A second submit reverts.
- **No cross-chain replay.** The domain includes `chainId` and the USDC address, so a signature for Base is invalid on Arc.
- **Short windows.** The SDK sets `validAfter` to 0 and `validBefore` to five minutes from now. A stale signature simply expires.
- **Cancellation.** Before it is used, the signer can cancel an authorization with `cancelAuthorization`.
- **Finding a gift someone else submitted.** The router's `RouterDonation` event indexes the nonce, so a relay can see that a gift already went through.

## Testing on Arc testnet

Arc testnet is chain `5042002`. Its USDC lives at `0x3600000000000000000000000000000000000000`, and the USDC DonateRouter we deployed there is `0xa1cf1db2042dea0f169b1acdab479d4f17852860` ([explorer](https://explorer.testnet.arc.io/address/0xa1cf1db2042dea0f169b1acdab479d4f17852860)). The full list of routers per network is in [routers.json](https://tokentails.com/shelter-payouts/routers.json).

1. Add Arc testnet to your wallet ([Arc docs](https://docs.arc.io/integrate/connect-to-arc)) and get test USDC from the [Circle faucet](https://faucet.circle.com/).
2. Call `canDonate(1000000)` on the router to confirm it would accept a 1 USDC gift.
3. Sign and submit with `signAndRelay` against your own relay, or call `donateWithAuthorization` yourself from a second account to play the relay.
4. Look for the `RouterDonation` event and the ShelterSplit payout events in the same transaction.

The Foundry suite covers the router with unit, invariant and fork tests (`test/DonateRouter*.t.sol`). Run `forge test` inside `contracts/shelter-split`.

## Pitfalls we hit

- **Do not hardcode the domain.** Read `name()` and `version()` from the USDC contract. On 19 October 2026 Base's USDC returned "USD Coin" and Arc's and Monad's returned "USDC", all with version "2". A wrong name gives a valid-looking signature that fails on chain.
- **Decimals on Arc.** USDC is Arc's native gas coin with 18 decimals, while its ERC-20 interface uses 6. EIP-3009 goes through the ERC-20 interface, so 1 USDC is `1000000`. Native `donateNative` gifts use 18-decimal units.
- **Not every stablecoin has EIP-3009.** Tempo's TIP-20 coins and USDG on Robinhood Chain do not, so those networks have a ShelterSplit but no router; gifts there use approve plus `disburse`.
- **Memo limits.** Memos are at most 256 bytes. A memo on the `flush` path is untrusted: whoever calls first sets it.
- **Recipients drift.** If the payout list changes between signing and submitting, the gift reverts. That is the point, but your UI should re-sign rather than retry.

## Where to go next

- Read the contracts and tests: [contracts/shelter-split](https://github.com/zbagdzevicius/tokentails/tree/main/contracts/shelter-split) (MIT).
- Use the SDK or drop-in widget: [shelter-rail](https://github.com/zbagdzevicius/tokentails/tree/main/shelter-rail) (MIT).
- See real payouts with their transactions: [/shelter-payouts](/shelter-payouts).
- Learn the split itself: [USDC payment splitter contract](/feed/build/usdc-payment-splitter-contract), and the network we started on: [USDC payouts on Arc](/feed/build/usdc-payouts-on-arc).
- Put a gift button on a page: [crypto donation button for any website](/feed/build/crypto-donation-button-for-website). Let an AI agent pay over HTTP: [x402 donations](/feed/build/x402-donations).
