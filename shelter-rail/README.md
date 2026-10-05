# ShelterSplit Rail

**Any game can add a shelter button.** One script tag gives your players a "Give to <shelter>" button
and a live, on-chain "shelters received" meter. No account, no gas for the giver, no SDK install. Gasless
mode needs a relay, which pays the gas but never holds the gift; the contracts pass it on in the same
transaction and keep none of it (the
showcase shelter's wallet has its own disclosure below).

```html
<script src="https://tokentails.com/rail/widget.js"
  data-mode="gasless" data-chain="5042" data-split="0xShelterSplit"
  data-router="0xDonateRouter" data-usdc="0xUSDC" data-relay="https://<relay>/shelter/relay"
  data-shelter="Pink Paw" data-amount="1000000"></script>
```

A non-custodial, pass-through payout rail for animal shelters. Any game, app or AI agent can add a
donate button: the payment goes from the payer's wallet into the ShelterSplit contract, which splits
it across the registered shelter wallets in the same transaction and emits one public event per payout.
The contract keeps no balance between calls: every payment is paid out in the same transaction. The
only exception is a token sent to it by plain transfer (or native coin forced in without a call),
which the owner can recover with `sweep` or `sweepNative` (each emits a public event).

MIT licensed. No dependencies. Works in browsers and Node 18+.

What is in the box:

| Part | File | Use it for |
|---|---|---|
| Widget | `src/widget.js` | One `<script>` tag: a donate button (native, token or gasless) and a live "shelters received" total, on seven chains. No framework. |
| SDK | `src/sdk.mjs` | `CHAINS`, `encodeDonate`, `readTotals`, `donateWithInjected`, `donateTokenWithInjected` (approve + disburse), gasless `signAndRelay`, and the x402 client `payAndFetch` (`exact` and multi-chain `onchain-receipt`). |
| Agent example | `examples/agent-pay.mjs` | An AI agent paying for one adoptable-cat card on any offered testnet; the money goes to shelters. |
| Demo page | `client/public/rail/demo.html` | The widget against the seven testnet splits (a chain picker), served at `tokentails.com/rail/demo.html`. |

## Custody statement

Every path moves money donor → ShelterSplit → shelter wallet, or donor → shelter wallet. None of
them passes through a wallet the integrator or Token Tails controls.

- **ShelterSplit** splits each gift across the registered shelter wallets in the same transaction and
  keeps no balance.
- **DonateRouter** (gasless mode) has **no owner, no admin functions and no balance** between
  transactions. It pulls the donor's signed USDC and pays it through ShelterSplit in one call, and it
  **reverts if any wei would reach the split's treasury**. The relay that pays the gas only submits
  the donor's signature; it never holds the gift, and it cannot change the amount, the memo or the
  destination (the EIP-3009 nonce is `keccak256(abi.encode(router, keccak256(memo), salt, recipients))`,
  where `recipients` is `router.recipientsHash(amount)`: if the shelter list changes after signing, the
  gift reverts). USDC sent to the router by plain transfer waits there until anyone calls `flush`,
  which can only pay it on to the shelters.
- **x402 `exact`** pays the **shelter's own wallet** (`payTo`) directly with a USDC
  `transferWithAuthorization`; the facilitator settles it and pays the gas.

## Showcase shelter and custody disclosure

The first shelter on the rail is **Pink Paw (Rožinė pėdutė)**.

**Disclosure:** the Pink Paw wallet was created by Token Tails and is **held by Token Tails on behalf
of the shelter until handover**. Until the shelter holds its own key, Token Tails controls the funds
that reach that wallet. The contract itself is non-custodial; the shelter wallet is not yet. Any page
that shows this shelter must show this disclosure, and it will be updated when the handover happens.

## Chains and addresses

Seven chains, each with a mainnet and a testnet. `CHAINS` in `src/sdk.mjs` (and the same table in
`src/widget.js`, pinned equal by a test) holds the public RPC, explorer, gas coin and payout coins.
Arc is the only chain whose native coin is USDC (**18 decimals**, and gas is paid in USDC), so only Arc
takes a native `donate()` gift; everywhere else a gift is the chain's USD coin (6 decimals).

| Chain | Mainnet / testnet ID | Payout coin (mainnet / testnet) | EIP-3009 | Gas |
|---|---|---|---|---|
| Arc | 5042 / 5042002 | USDC (native, 18 decimals; ERC-20 view 6) / same (EURC too) | yes | USDC |
| Tempo | 4217 / 42431 | USDC.e / pathUSD (TIP-20) | no | none: fees in a USD stablecoin |
| Arbitrum | 42161 / 421614 | USDC | yes | ETH |
| Avalanche C-Chain | 43114 / 43113 | USDC (EURC too) | yes | AVAX |
| Base | 8453 / 84532 | USDC (EURC too) | yes | ETH |
| Robinhood Chain | 4663 / 46630 | USDG / mUSDC (a test MockUSDC) | no | ETH |
| Monad | 143 / 10143 | USDC (Circle) | yes | MON |

USDC, USDC.e, USDG, pathUSD, mUSDC and EURC are different coins: `readTotals` keeps them apart
(`byCoin`). Monad's public RPC answers `eth_getLogs` over at most 100 blocks, so log scans use a
separate keyless log RPC (`logRpc`: `rpc1.monad.xyz` on mainnet, 100,000-block windows; OnFinality on
testnet, 10,000-block windows). Not in the table (no address recorded in this repo yet): EURC on Arbitrum, Tempo, Robinhood and
Monad.

Contract addresses are **not hard-coded**. They are published in
[`client/public/shelter-payouts/deployments.json`](../client/public/shelter-payouts/deployments.json)
and served at `https://tokentails.com/shelter-payouts/deployments.json`. Each entry has at least
`chainId` and `address` (optional: `fromBlock`, `tx` (the deploy transaction; its block is the scan
start when `fromBlock` is absent), `rpc`, `symbol`/`token`, `decimals`). The mainnet list is empty until the
mainnet wave; the widget shows "Donations open soon" until then. The testnet splits on all seven chains
are in `testnet-deployments.json` next to it, and the DonateRouters in `routers.json`.

Contract interface used here:

- `donate(string memo) payable`: splits `msg.value` across the shelters and emits
  `NativeDisbursed(address indexed shelter, uint256 amount, string memo)`
  (topic `0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef`) per shelter, plus one
  `NativeDisbursementBatch`.
- `disburse(uint256 amount, string memo)`: the ERC-20 path (the giver approves the split first); emits
  `Disbursed` (topic `0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a`) in token
  units (6 decimals), plus one `DisbursementBatch`.
- `disburseWithMemo(uint256 amount, bytes32 memo)`: Tempo's TIP-20 path; each payout carries the memo in
  the token's `TransferWithMemo`, and the split's events carry it as a `0x`-prefixed hex string.

Memos are public and permanent. Keep them short and never put personal data in them.

## Quick start

### 1. Drop-in button

```html
<script src="https://tokentails.com/rail/widget.js"
  data-chain="5042"
  data-deployments="https://tokentails.com/shelter-payouts/deployments.json"
  data-amount="1000000000000000000"
  data-memo="mygame"
  data-disclosure="Pink Paw (Rožinė pėdutė): wallet held by Token Tails on behalf of the shelter until handover."></script>
```

| Attribute | Default | Meaning |
|---|---|---|
| `data-chain` | `5042` | Chain ID: any of the fourteen in the table above. |
| `data-mode` | `auto` | `native` (Arc only), `token` (approve + disburse), `gasless` (below), or `auto`: gasless when router, USDC and relay are set, else native on Arc, else token. |
| `data-coin` | the chain's coin | Coin symbol, when the split pays another coin (`EURC`). |
| `data-split` | none | ShelterSplit address. Use this or `data-deployments`. |
| `data-deployments` | none | URL of a deployments.json; the entry for `data-chain` is used. |
| `data-amount` | `1000000000000000000` (native), `1000000` (token, gasless) | Native mode: wei (on Arc, 1e18 = 1 USDC). Token and gasless modes: base units, 6 decimals. |
| `data-memo` | `widget` | Public memo, up to 64 characters. |
| `data-label` | "Give 1 USDC to shelters" | Button text. |
| `data-disclosure` | none | Small print under the button. Required when the shelter wallet is custodial. |
| `data-from-block` | `0` | Where the live-total log scan starts. |
| `data-target` | after the script | CSS selector of the element to mount into. |

Gasless mode adds:

| Attribute | Default | Meaning |
|---|---|---|
| `data-mode` | `auto` | `gasless`: the visitor signs one USDC authorization and pays no gas. Not for coins without EIP-3009 (Tempo, USDG, mUSDC). |
| `data-router` | none | DonateRouter address (ownerless; reverts on any treasury share). |
| `data-usdc` | none | USDC address on that chain (its EIP-712 name and version are read on-chain). |
| `data-relay` | none | Relay URL that submits the signature and pays the gas. |
| `data-amount` | `1000000` | USDC base units, 6 decimals (1000000 = 1 USDC). |
| `data-shelter` | "shelters" | Shelter name for the button: "Give 1 USDC to Pink Paw". |
| `data-testnet` | known testnets: `true` | `true` shows a "Test USDC, no real money" chip ("Test coins" for other coins). |
| `data-theme` | visitor's | `light` or `dark`. |
| `data-rpc`, `data-explorer`, `data-chain-name` | the seven built in | For any other EVM chain. |

Until all of `data-router`, `data-usdc` and `data-relay` are set, the gasless button reads "Gasless
giving opens soon" and only the live total shows. Before the visitor signs, the widget asks the router
`canDonate(amount)`: if the split is paused or part of the gift would not reach the shelters, nothing is
signed.

Token mode asks the wallet twice: an approval for exactly the gift (skipped when the allowance already
covers it), then `disburse` (`disburseWithMemo` on Tempo). Before that it reads `split.token()` and
refuses a split that pays another coin than the one shown.

One tap opens the visitor's wallet (it adds the chain if needed), a small burst of hearts celebrates the
gift, and the message links to the transaction on the explorer. Styles live in a shadow root, follow
the visitor's light or dark mode, and respect reduced motion.

### 2. SDK

```js
import { readTotals, donateWithInjected, formatUnits } from "./src/sdk.mjs";

const totals = await readTotals("https://tokentails.com/shelter-payouts/deployments.json");
console.log(formatUnits(totals.nativeWei, 18), "USDC reached shelters");

const { txHash, explorerUrl } = await donateWithInjected(window.ethereum, {
  chainId: 5042,
  split: "0x...", // from deployments.json
  amountWei: 10n ** 18n,
  memo: "mygame:level-3",
});
```

`readTotals` keeps native (18-decimal) and token (6-decimal) totals apart so the scales never mix.

Gasless gift through a DonateRouter (the donor needs no gas token and sends no transaction):

```js
import { signAndRelay } from "./src/sdk.mjs";

const { txHash, memo } = await signAndRelay({
  provider: window.ethereum,
  chainId: 5042,
  router: "0x...",              // DonateRouter
  usdc: "0x...",                // USDC on that chain
  amount: 1_000_000n,           // 1 USDC (6 decimals)
  relayUrl: "https://<relay>/shelter/relay",
});
```

Before anything is signed it checks the router: `router.split()` must be the split you pass as `split`
(the widget uses the split it shows, and keeps the button off otherwise) and `router.usdc()` must be the
USDC you pass, since the signature gives the router pull rights for the amount. It then picks a random
32-byte salt and a `tt:wallet:<8 hex>` memo, reads `router.authNonce(salt, memo)` with
`eth_call` (and checks it against its own computation), reads USDC `name()`/`version()` for the EIP-712
domain, asks for one `eth_signTypedData_v4` of `ReceiveWithAuthorization` (payee: the router), and POSTs
`{chainId, from, value, validAfter, validBefore, salt, memo, signature}` to the relay. `hashTypedData`
and `keccak256` are exported too (no dependencies), so you can show or check the exact digest the
wallet signs.

### 3. AI agents: standard x402 `exact`, straight to the shelter wallet

When the server offers it, the cat card also takes the **standard x402 `exact` scheme** (x402 v1,
EIP-3009 USDC). Then `accepts` holds only the `exact` requirement, because standard clients
(x402-fetch, x402-axios) schema-parse every entry and throw on a custom one; the `onchain-receipt` offer
moves to a top-level `onchainReceipt` field, which `pickOffer` reads:

```json
{ "x402Version": 1, "error": "payment required",
  "accepts": [{ "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "10000",
    "payTo": "<the shelter's own wallet>", "asset": "<USDC>", "maxTimeoutSeconds": 120,
    "extra": { "name": "USDC", "version": "2" }, "...": "resource, description, mimeType" }],
  "onchainReceipt": { "scheme": "onchain-receipt", "...": "see section 4" } }
```

`network` is always an x402 v1 network name (the `x402` package's list: base, base-sepolia, avalanche,
avalanche-fuji, polygon, polygon-amoy, sei, iotex and a few more). The public x402.org facilitator settles
v1 `exact` on base-sepolia only; other networks need a facilitator that supports them. Names outside the
v1 list need a custom facilitator, and off-the-shelf clients reject them; this SDK pays them with
`chainIds: { "<name>": <chainId> }`.

The agent signs one `TransferWithAuthorization` from its wallet to `payTo` and retries with
`X-PAYMENT`. The server's facilitator verifies and settles it and pays the gas; the server re-reads the
`Transfer` log (only payments read back from the chain count in the public totals) and answers `200`
with the card and an `X-PAYMENT-RESPONSE` (`transaction`, `network`, `payer`).

Interoperability, as tested: the off-the-shelf `x402-fetch` 1.2.0 client parses the `402`, signs, and
its `X-PAYMENT` passes this server's checks and the public x402.org facilitator's `/verify` on
base-sepolia. A full settlement through that facilitator has not been run yet. With this SDK:

```js
const { response, paid } = await payAndFetch(url, {
  maxAmountBase: 10_000n,            // 0.01 USDC cap (6 decimals)
  provider: window.ethereum,         // or signTypedData: async (typedData) => sig, account: "0x..."
});
```

`paid` is `null` (and `error` holds the server's reason) when the server refuses the authorization.
On mainnet the server offers `exact` only once the shelter holds its own wallet key.

### 4. AI agents: x402-compatible "onchain-receipt" flow, on several chains

The Token Tails API sells one adoptable-cat card at `GET /shelter/agent/cat-card`, and the whole price
goes to shelters. This is an **x402-compatible flow with its own `onchain-receipt` scheme and no
facilitator**: standard x402 facilitators may not support these chains, so the server checks the
transaction receipt on the chain itself.

1. The agent calls the URL. The server answers `402` with one `onchain-receipt` offer per chain it takes
   payment on, all with the same nonce:
   `{scheme: "onchain-receipt", network: "eip155:<chainId>", maxAmountRequired, asset, payTo: <ShelterSplit>, extra: {memo: "x402:<nonce>", nonce, decimals, coin, method, memo32?}}`.
   `asset` is `"native"` with `method: "donate"` where the native coin is the payment (Arc: USDC,
   18 decimals), else the token address with `method: "disburse"`, or `"disburseWithMemo"` on Tempo with
   `memo32 = keccak256("x402:<nonce>")` (the memo does not fit 32 bytes). `maxAmountRequired` is in the
   asset's own units. The offers are in `accepts`, or, when the standard `exact` scheme is offered too, in
   the top-level `onchainReceipts` (and `onchainReceipt`, the first one) so standard clients can parse
   `accepts`.
2. The agent pays on **one** chain: `donate("x402:<nonce>")` on `payTo` with the price as value, or
   `approve(payTo, price)` on the token then `disburse(price, "x402:<nonce>")` (`disburseWithMemo(price, memo32)`).
3. The agent retries with `X-PAYMENT: base64(JSON {x402Version: 1, scheme: "onchain-receipt", network, payload: {txHash, nonce}})`,
   where `network` names the chain it paid on.
4. The server checks the receipt on that chain (status ok, payout events from the split with that memo
   summing to the price, tx hash used once, nonce issued by the server, not expired and used once) and
   answers `200` with the card and an `X-PAYMENT-RESPONSE` header.

Testnets are always offered. A mainnet chain is offered only once the split there pays nothing but
shelter wallets that signed their claim and were rotated in on-chain (until the Pink Paw handover, no
mainnet offer appears).

```js
import { payAndFetch } from "./src/sdk.mjs";

const { response, paid } = await payAndFetch("https://<api-host>/shelter/agent/cat-card", {
  chainId: 84532,                    // optional: pay on this chain; default the first offer you capped
  maxAmountWei: 10n ** 16n,          // cap for native offers (Arc, 18 decimals)
  maxAmountBase: 10000n,             // cap for token offers and `exact` (6 decimals)
  provider: window.ethereum,         // or pay: async ({chainId, calls, ...}) => minedTxHash
});
console.log(await response.json(), paid?.txHash);
```

At least one cap is required, and an offer whose unit has no cap is never paid. `payAndFetch` refuses
any price above its cap, pays at most once per call, and passes any non-402 response (for example `409`
while the endpoint is switched off) straight through.

With a `pay` callback, the SDK hands over `{chainId, to, valueWei, data, memo, asset, token, amount,
decimals, coin, method, memo32, calls}`: `calls` is `encodeOfferCalls(offer)`, the transactions to send
in order (`donate`, or `approve` then `disburse`), each `{step, to, data, value}`. Send them, waiting for
each to be mined (the approve may be skipped when the allowance already covers `amount`), and return
the last hash. `to`, `valueWei` and `data` describe that last call. Helpers: `findOnchainReceiptOffers`,
`listOnchainReceiptOffers`, `parseOnchainReceiptOffer`, `pickOffer(body, {chainId})`.

`examples/agent-pay.mjs` is a Node agent with `ethers` v6 (`npm i ethers@6` in your project; inside
the Token Tails monorepo it falls back to `backend/node_modules/ethers`). It reads a **testnet** key from
the `AGENT_PRIVATE_KEY` environment variable, never writes it anywhere, refuses any chain that is not a
known testnet, and without `--yes` only prints the offers:

```sh
export CAT_CARD_URL=http://localhost:3105/shelter/agent/cat-card
node shelter-rail/examples/agent-pay.mjs                          # list the offers, pay nothing
AGENT_CHAIN_ID=84532 node shelter-rail/examples/agent-pay.mjs --yes  # pay on Base Sepolia
```

Optional: `AGENT_RPC_URL` (default: the chain's public RPC), `MAX_PRICE_WEI` (native cap, default
0.01 USDC), `MAX_PRICE_BASE` (token cap, default 0.01), `EXACT_MAX_BASE` (allow `exact`). Never commit a key.

## Tests

```sh
cd shelter-rail
npm test
```

The tests use a mocked `fetch` and a mocked wallet provider. Nothing signs or broadcasts.

`client/public/rail/widget.js` is a copy of `src/widget.js` served by tokentails.com. After editing the
widget, copy it again (`cp shelter-rail/src/widget.js client/public/rail/widget.js`); a test fails if
the two differ.

## License

MIT. See [LICENSE](./LICENSE). The rest of the Token Tails monorepo has its own license.
