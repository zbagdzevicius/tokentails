# ShelterSplit Rail

A non-custodial, pass-through payout rail for animal shelters. Any game, app or AI agent can add a
donate button: the payment goes from the payer's wallet into the ShelterSplit contract, which splits
it across the registered shelter wallets in the same transaction and emits one public event per payout.
The contract keeps no balance, so there is nothing to withdraw and nothing for the operator to hold.

MIT licensed. No dependencies. Works in browsers and Node 18+.

What is in the box:

| Part | File | Use it for |
|---|---|---|
| Widget | `src/widget.js` | One `<script>` tag: a donate button and a live "shelters received" total. No framework. |
| SDK | `src/sdk.mjs` | `encodeDonate`, `readTotals`, `donateWithInjected`, and the x402 client `payAndFetch`. |
| Agent example | `examples/agent-pay.mjs` | An AI agent paying for one adoptable-cat card; the money goes to shelters. |

## Showcase shelter and custody disclosure

The first shelter on the rail is **Pink Paw (Rožinė pėdutė)**.

**Disclosure:** the Pink Paw wallet was created by Token Tails and is **held by Token Tails on behalf
of the shelter until handover**. Until the shelter holds its own key, Token Tails controls the funds
that reach that wallet. The contract itself is non-custodial; the shelter wallet is not yet. Any page
that shows this shelter must show this disclosure, and it will be updated when the handover happens.

## Chains and addresses

Arc is the first chain. Native USDC on Arc has **18 decimals**, and gas is paid in USDC.

| Chain | Chain ID | RPC | Explorer |
|---|---|---|---|
| Arc | 5042 | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io/tx/<hash>` |
| Arc Testnet | 5042002 | `https://rpc.testnet.arc.io` | `https://explorer.arc.io/tx/<hash>` |

Contract addresses are **not hard-coded**. They are published in
[`client/public/shelter-payouts/deployments.json`](../client/public/shelter-payouts/deployments.json)
and served at `https://tokentails.com/shelter-payouts/deployments.json`. Each entry has at least
`chainId` and `address` (optional: `fromBlock`, `rpc`). The list is empty until the first deploy; the
widget shows "Donations open soon" until then.

Contract interface used here:

- `donate(string memo) payable`: splits `msg.value` across the shelters and emits
  `NativeDisbursed(address indexed shelter, uint256 amount, string memo)`
  (topic `0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef`) per shelter, plus one
  `NativeDisbursementBatch`.
- `disburse(uint256 amount, string memo)`: the ERC-20 path; emits `Disbursed`
  (topic `0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a`) in token units (6 decimals).

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
| `data-chain` | `5042` | Chain ID. |
| `data-split` | none | ShelterSplit address. Use this or `data-deployments`. |
| `data-deployments` | none | URL of a deployments.json; the entry for `data-chain` is used. |
| `data-amount` | `1000000000000000000` | Donation in wei (on Arc, 1e18 = 1 USDC). |
| `data-memo` | `widget` | Public memo, up to 64 characters. |
| `data-label` | "Give 1 USDC to shelters" | Button text. |
| `data-disclosure` | none | Small print under the button. Required when the shelter wallet is custodial. |
| `data-from-block` | `0` | Where the live-total log scan starts. |
| `data-target` | after the script | CSS selector of the element to mount into. |

One tap opens the visitor's wallet (it adds Arc if needed), a small burst of hearts celebrates the
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

### 3. AI agents: x402-compatible "onchain-receipt" flow

The Token Tails API sells one adoptable-cat card at `GET /shelter/agent/cat-card`, and the whole price
goes to shelters. This is an **x402-compatible flow with its own `onchain-receipt` scheme and no
facilitator**: standard x402 facilitators may not support Arc, so the server checks the transaction
receipt on the chain itself.

1. The agent calls the URL. The server answers `402` with `{x402Version: 1, accepts: [{scheme: "onchain-receipt", network: "eip155:<chainId>", maxAmountRequired, asset: "native", payTo: <ShelterSplit>, extra: {memo: "x402:<nonce>", nonce}}]}`.
2. The agent calls `donate("x402:<nonce>")` on `payTo` with at least `maxAmountRequired` wei.
3. The agent retries with `X-PAYMENT: base64(JSON {x402Version: 1, scheme: "onchain-receipt", network, payload: {txHash, nonce}})`.
4. The server checks the receipt (status ok, `NativeDisbursed` logs from the split with that memo summing
   to the price, tx hash used once, nonce issued by the server and not expired) and answers `200` with the
   card and an `X-PAYMENT-RESPONSE` header.

```js
import { payAndFetch } from "./src/sdk.mjs";

const { response, paid } = await payAndFetch("https://<api-host>/shelter/agent/cat-card", {
  maxAmountWei: 10n ** 16n,          // required spending cap
  provider: window.ethereum,         // or pay: async ({to, valueWei, data}) => minedTxHash
});
console.log(await response.json(), paid?.txHash);
```

`payAndFetch` refuses any price above `maxAmountWei`, pays at most once per call, and passes any
non-402 response (for example `503` while the endpoint is switched off) straight through.

See `examples/agent-pay.mjs` for a Node agent with `ethers`. It reads a **testnet** key from the
`AGENT_PRIVATE_KEY` environment variable, never writes it anywhere, and without `--yes` only prints the
offer. Never commit a key.

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
