---
title: "eth_getLogs Block Range Limits: Index Payouts Safely"
description: "Why eth_getLogs fails over too many blocks, the limits we measured on Arc, Monad and Avalanche RPCs, and a cursor-based indexer that never double counts."
excerpt: "Public RPCs refuse eth_getLogs ranges above their limit instead of trimming them. Field notes from the indexer behind a live, seven-chain donation ledger: windows, cursors, dedupe and honest totals."
slug: eth-getlogs-block-range-limit
category: build
publishedAt: "2026-10-20"
updatedAt: "2026-10-20"
author: "Token Tails team"
heroImage:
  src: "/feed/web-payout-feed.webp"
  alt: "The Token Tails payouts feed: a list of USDC payouts to Pink Paw on Arc mainnet, each labelled with its memo, a Motored-sponsored tag and a transaction link"
  width: 1152
  height: 648
keywords:
  - eth_getLogs block range limit
  - eth_getLogs pagination
  - index smart contract events
  - getLogs 10000 block limit
  - build a donation ledger from events
intent: build
cta: payouts
faq:
  - q: "How do I find the block range my RPC allows?"
    a: "Test it. Ask for a small range, then larger ones, and read the error. Many providers name the limit in the message, for example 'limited to a 100 range'. Limits change, so also handle the error at run time instead of trusting a number you found once."
  - q: "Should I use a subgraph or write my own indexer?"
    a: "A hosted indexer is faster to start if it supports your chains. A small hand-rolled indexer makes sense when you watch a few contracts on chains that indexers do not cover yet, which is why we wrote one for seven chains including Arc, Tempo and Robinhood Chain."
  - q: "How does the indexer handle chain reorganisations?"
    a: "Each run rescans the last 12 blocks before its cursor. Rows are upserted by chain, transaction hash and log index, so a rescan adds nothing, and a stored row is deleted only when the chain's canonical block hash at its height has changed."
  - q: "Does eth_getLogs return partial results when the range is too big?"
    a: "The public RPCs we tested return an error instead, so nothing is silently cut. Treat any error as 'this window was not read' and keep the cursor where it was."
sources:
  - label: "SQD: eth_getLogs limits"
    url: "https://sqd.dev/learn/eth-getlogs-limits/"
  - label: "Ethereum JSON-RPC API (ethereum.org)"
    url: "https://ethereum.org/en/developers/docs/apis/json-rpc/"
  - label: "Payout indexer source (payout-index.service.ts)"
    url: "https://github.com/zbagdzevicius/tokentails/blob/main/backend/src/shelter/onchain/payout-index.service.ts"
  - label: "Live payout API"
    url: "https://api.tokentails.com/shelter/payouts?network=mainnet&limit=5"
  - label: "Live payouts page"
    url: "https://tokentails.com/shelter-payouts"
related:
  - usdc-payouts-on-arc
  - usdc-payment-splitter-contract
  - verify-crypto-donation
  - crypto-donation-button-for-website
claims: []
---

Most public RPC endpoints cap how many blocks one `eth_getLogs` call may cover, and when you ask for more they return an error rather than a shorter answer. The fix is to scan in windows that fit each endpoint's limit, store a cursor so you can resume, shrink the window when a range is refused, and make every write idempotent so a rescan never counts an event twice.

These are field notes from the indexer behind [/shelter-payouts](/shelter-payouts), which reads ShelterSplit payout events on seven mainnets and serves them as a paginated API. The code is open, and every number below says when and how we measured it.

<!-- key-takeaways -->
- Range limits differ by endpoint and change over time. On 20 October 2026 Arc's public RPC took 10,000 blocks per call, while Monad's main public RPC and Avalanche's took only about 100.
- Read the limit from the error when the provider names it; otherwise halve the window. Never treat a rate limit as a range limit.
- Keep one cursor per chain and contract, rescan a few blocks behind it, and dedupe on (chainId, txHash, logIndex).
- Find the start block for a date with a binary search over block timestamps.
- Publish how far each chain has been read, and say "at least" until the scan reaches the head.

## Why the limits exist, and the error you get

`eth_getLogs` asks a node to search every block in a range for matching events. A wide range on a busy chain is expensive, so providers cap it, either by block count or by the number of results. [SQD's overview](https://sqd.dev/learn/eth-getlogs-limits/) lists caps from 50 blocks per query to 10,000 results per query, and concludes that code which must work across providers "discovers the limit from the error and halves the range until the query fits".

We tested the public endpoints our chains use on 20 October 2026, asking for the logs of our ShelterSplit contract over growing ranges:

| Endpoint | Accepted | Refused with |
|---|---|---|
| `rpc.mainnet.arc.io` (Arc) | toBlock − fromBlock = 9,999 (10,000 blocks) | −32012 "requested range too large" at 10,000 |
| `rpc.monad.xyz` (Monad) | toBlock − fromBlock = 100 | −32614 "eth_getLogs is limited to a 100 range" |
| `rpc2.monad.xyz` (Monad) | toBlock − fromBlock = 10,000 | not reached in our test |
| `api.avax.network/ext/bc/C/rpc` (Avalanche) | 100 blocks | −32602 "exceeds the maximum of 100 blocks" at 101 |
| `mainnet.base.org` (Base) | not measured: every call that day got −32011 "request limit reached" | our code notes "limited to a 500 range" (checked 8 Oct 2026) |

Two lessons are in that table. First, "range" can mean the difference `toBlock − fromBlock` or the inclusive block count, so test the edge on each endpoint. Second, limits move: our code recorded 2,048 blocks for Avalanche's public RPC earlier in October, and on 20 October it allowed 100. Hard-code a starting window, but handle the refusal anyway.

## Our per-chain windows

The indexer starts each scan with a default window of 10,000 blocks, then takes the smaller of that and the endpoint's known cap. For example, the code caps Base's public RPC at 500 (its limit when we checked on 8 October) and Monad's main RPC at 100, so Monad logs are read from `rpc2.monad.xyz`, which takes 10,000. On Arc, which makes blocks quickly and answers only about two calls a second, calls are spaced 500 ms apart.

When a call is refused anyway, the indexer decides whether the error is about the range:

```ts
export const isRangeError = (error: unknown) =>
    /range|too many blocks|block count|exceed|query returned more than|10,?000 results|limit/i.test(errorText(error)) &&
    !/rate|429|too many requests/i.test(errorText(error));
```

If it is, it parses the cap the provider names ("limited to a 500 range", "maximum of 100 blocks") and uses that; if no number is given, it halves the window, never below 50 blocks. A rate limit is not a range error: the run stops, keeps its cursor and tries again in two minutes. Shrinking the window on a 429 would only make more calls.

Each run is bounded too: at most 60 `eth_getLogs` calls per contract and a 90-second budget, on a two-minute schedule with a lease so two servers never run it at once. A long backfill on one chain cannot starve the others.

## Cursor design: resume, rescan, dedupe

One cursor per chain and contract, keyed `chainId:contract`, stores `fromBlock` (the deploy block), `lastScannedBlock` and the time of the last block read. Each run:

1. Starts at `lastScannedBlock − 12 + 1`, a 12-block overlap for reorganisations, or at the deploy block on the first run.
2. Reads windows up to the current head.
3. Upserts each payout by `(chainId, txHash, logIndex)`. A rescan of the same window adds nothing.
4. Moves the cursor forward only after the window's rows are written, and never backwards, because a lagging RPC can report a lower head.

For the overlap, a stored row from a rescanned window is deleted only when the chain's canonical block hash at that height differs from the one stored with it. An empty answer from a lagging node is not treated as a reorg.

If a run fails halfway, the rows it wrote above the cursor are ignored by readers, which only read up to each contract's `indexedThrough` block. The next run reads that window again, and the upsert makes that harmless.

## Finding the start block for a date

Sometimes you need "every transfer since 2 October" rather than "since the deploy". Block numbers are not evenly spaced in time, so the goal counter finds the first block at or after a timestamp with a binary search over `eth_getBlockByNumber`:

```ts
let lo = 0;
let hi = head;
while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await stamp(mid)) >= time) hi = mid;
    else lo = mid + 1;
}
return lo;
```

That is about 25 reads once per chain; the answer is stored in the cursor.

## Arc specifics

Arc is unusual: USDC is the native gas coin with 18 decimals, while its ERC-20 interface at `0x3600…` uses 6. To count every USDC move into a wallet, native or ERC-20, our campaign counter reads Arc's system `Transfer` log, emitted from `0xff…fe` with 18-decimal amounts. Payout rows keep their own decimals plus an `amount18` field so amounts can be compared without mixing scales. The background is in [USDC payouts on Arc](/feed/build/usdc-payouts-on-arc).

<!-- cta:payouts -->

## Serving it: a paginated API that never sums coins

`GET https://api.tokentails.com/shelter/payouts?network=mainnet` serves the index. Abridged, from a live read on 20 October 2026 (amounts left out; the live figures are on the payouts page):

```json
{
  "network": "mainnet",
  "generatedAt": "2026-10-20T19:48:53.817Z",
  "source": "index",
  "contracts": [{
    "chainId": 5042, "contract": "0x457c…b147", "symbol": "USDC",
    "fromBlock": 24760869, "head": 26995165,
    "indexedThrough": { "block": 26995165, "time": 1792525679, "at": "2026-10-20T19:48:01.276Z" },
    "lastRunFailed": false,
    "totals": [
      { "symbol": "USDC", "kind": "native", "decimals": 18, "amount": "…", "amount18": "…" },
      { "symbol": "USDC", "kind": "token", "decimals": 6, "amount": "…", "amount18": "…" }
    ]
  }],
  "totals": [{ "symbol": "EURC", "amount18": "…" }, { "symbol": "USDC", "amount18": "…" }],
  "events": [{
    "chainId": 5042, "txHash": "0x4b09…41bf3", "logIndex": 233, "blockNumber": 26994738,
    "timestamp": 1792525463, "shelter": "0x3c83…4771", "kind": "native",
    "amount": "170000000000000000", "decimals": 18, "symbol": "USDC", "memo": "motored:user-123"
  }],
  "nextCursor": "001792525463:000000005042:00000026994738:00000233"
}
```

A few design choices worth copying:

- **Totals per coin.** USDC, USDC.e, USDG and EURC are different coins and are never added together, in the API or on the page.
- **A sort key as the cursor.** Events are ordered by `timestamp:chainId:block:logIndex`, zero-padded so string order is time order. `nextCursor` is the last key on the page; pass it back as `&cursor=` for the next, older page. The default page is 500 events, the maximum 2,000.
- **Freshness on every contract.** `indexedThrough` says which block was read and when, and `lastRunFailed` says whether the latest run broke.
- **Short caching.** Answers are cached for 30 seconds, matching the `Cache-Control` header.

The memo in that sample is a real case of why labels matter: `motored:` gifts are sponsor money from Motored, the Token Tails founder's own company (a related party), whatever follows the prefix. The payouts page labels them as sponsor money rather than counting them as separate givers.

## Saying "at least" while the scan is behind

An indexer that is behind the chain head knows a lower bound, not a total. Our rule: while a scan has not reached the chain head, the campaign meter on [/shelter-payouts](/shelter-payouts) and [/impact](/impact) shows "at least" before the figure.

This is not theoretical. In our 20 October read, six of the eight mainnet contracts had been read up to their chain head within the previous two minutes, while the Base contract had been read only through a block from 8 October and the Avalanche contract through one from 15 October, both with `lastRunFailed: true`. Because the API publishes `indexedThrough` and `lastRunFailed` per contract, anyone can see that instead of mistaking a stale total for a complete one. If you only take one idea from this article, take that one: publish how far you have read.

To check any single payout by hand, follow our guide to [verifying a crypto donation](/feed/giving/verify-crypto-donation). For the contract that emits these events, see [USDC payment splitter contract](/feed/build/usdc-payment-splitter-contract), and for totals with their evidence labels, see [/impact](/impact).
