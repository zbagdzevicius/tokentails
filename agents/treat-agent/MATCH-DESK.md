# Sponsor Match Desk: build spec

Status: design, Oct 13, 2026. This file is the contract between three parallel work sets (A, B, C,
listed at the end). Where this file and the code disagree, fix the code or update this file in the same
change.

## What it is

A sponsor puts USDC into a `CappedSpender` vault on Arc. Each round, the treat agent:

1. **observes** fresh public gifts to Pink Paw's ShelterSplit, the vault's caps and float, and three
   public Token Tails read endpoints;
2. **decides**: Claude calls one tool (`match_gift`, `hold`, `flag` or `propose_refund`);
3. **checks**: code recomputes the match amount from the written policy and **rejects** any model
   decision whose amount differs. The code does not quietly correct it;
4. **acts**: it calls `CappedSpender.give(amount, memo)`. The vault pays ShelterSplit, which pays the
   Pink Paw entry at 10000 bps. By default the agent prints the command and the founder runs it. With
   `--fork` it sends to a local anvil fork. With `--send` the founder sends from their own terminal;
5. **writes a receipt** (JSON). Its sha256 goes into the on-chain memo `tt:agent:m:<sponsor>:<hash8>`;
6. **witnesses**: the next round reads the `AgentGift` event back and marks the receipt `reconciled`;
7. **publishes** a static statement page built from the receipts.

`CappedSpender.sol` and every other contract under `contracts/shelter-split/src/` stay unchanged.
The backend gets no new write path. The agent only reads the backend.

## Honest copy (every public text, the statement page and the video)

These sentences, or sentences with the same meaning, must appear wherever the match desk is described
in public. The statement generator emits them verbatim (see "Statement").

- **Sponsor.** Motored.lt is a **related-party sponsor (founder's company)**. It is never called an
  outside or independent sponsor. If no company funds the vault, the label is **self-sponsor (Token
  Tails founder)**.
- **Custody.** Pink Paw's wallet is still held by Token Tails until the handover. Matched money reaches
  that wallet. Pink Paw does not control it yet.
- **Daily cap.** The contract caps each gift and each UTC calendar day. The day resets at 00:00 UTC, so
  up to 2× the daily cap can go out across midnight.
- **Per-donor limit.** The agent's code enforces the per-donor limit. The contract does not.
- **Not a tax receipt.** The statement is not a tax receipt.
- **Circle products.** We use USDC on Arc (Arc's native coin). We do not use Circle Wallets, Paymaster
  or Gateway.
- **Who decides.** Claude proposes. Code recomputes the amount and refuses a proposal that differs.
  The contract has the last word.
- **What counts.** A match counts only once its `AgentGift` event has been read back from the chain
  (`reconciled`).

## Corrections to the working plan (fixed here)

1. **Caps are in 18 decimals in native mode.** On Arc, native USDC has 18 decimals, so
   `CAPPED_PER_TX=50000` would cap each gift at 5×10⁻¹⁴ USDC. The deploy values are
   `CAPPED_PER_TX=50000000000000000` (0.05 USDC) and `CAPPED_DAILY=200000000000000000` (0.20 USDC). Set B
   adds a floor guard to the deploy script that refuses this mistake (see B1). The runbook reads
   `perTxCap()`, `dailyCap()` and `native()` back after the testnet deploy before anything is funded.
2. **Over-cap demo.** With caps of 0.05 / 0.20, asking for 0.25 on a fresh day reverts with
   **`OverTxCap(0.25, 0.05)`**, not `OverDailyCap`. `OverTxCap` is checked first. `OverDailyCap` appears
   only when `remainingToday < perTxCap`. For example, after four 0.05 matches, a 0.05 give reverts with
   `OverDailyCap(0.25, 0.20)`. `--demo-overcap` picks the amount in code (see "Act").
3. **Explorer.** Arc's explorer is `https://explorer.arc.io` (testnet: `https://explorer.testnet.arc.io`),
   as in `client/components/shelter-payouts/chains.ts`.
4. **`GET /shelter/payouts` has no payer field.** Its events are per-shelter `Disbursed` /
   `NativeDisbursed` rows. The donor (`payer`) exists only in the ShelterSplit batch events, which
   `observe.mjs` already reads over RPC. So **RPC logs are the source of truth for eligibility and the
   per-donor limit**. The index is a cross-check and supplies timestamps.
5. **Over-cap on a live chain is a simulation unless forced.** `cast send` estimates gas first, so a
   give that would revert never gets mined. By default `--demo-overcap` on testnet or mainnet uses
   `cast call` (eth_call, no gas, nothing on the explorer). `--mined-revert` sends the transaction with
   a fixed gas limit, so a failed tx is mined and shows on the explorer (costs a little gas). The video
   must say which of the two it shows.

## Files and modes

```
agents/treat-agent/
  run.mjs observe.mjs decide.mjs act.mjs log.mjs         (A: extended, old treat-agent mode unchanged)
  lib/policy.mjs lib/checker.mjs lib/receipt.mjs         (A: new)
  lib/witness.mjs lib/backend.mjs                        (A: new)
  sponsor.example.json                                   (A: new)
  statement.mjs lib/statement-html.mjs                   (C: new)
  match-desk.sh fork-demo.sh README.md                   (B)
client/public/match-desk/index.html statement.json       (C)
```

**Mode switch.** `run.mjs --sponsor <file>` runs the match desk. Without `--sponsor`, `run.mjs` behaves
exactly as today: `give_treat` / `hold`, and every existing test stays green.

**State directory.** `MATCH_DESK_DIR`, default `agents/treat-agent/runs/match-desk/`, which `runs/`
already gitignores. Layout:

```
<MATCH_DESK_DIR>/<chainId>-<spenderLower>/
  receipts/<sha256>.json        one envelope per receipt (send, fork and dry-run modes)
  flagged.json                  { "<giftId>": { kind, at, rationale } }  gifts excluded until a human removes them
  refund-proposal.json          the latest propose_refund (overwritten)
```

## sponsor.json (policy file)

`sponsor.example.json` is committed with placeholders (`null` until the deploy). The founder copies it
to `sponsor.arc-testnet.json` / `sponsor.arc.json`, which `match-desk.sh init` creates. Those copies
contain only public addresses and may be committed after the deploy.

```json
{
  "schema": "tt.match-desk.sponsor/v1",
  "sponsor": {
    "id": "motored",
    "name": "Motored.lt",
    "relatedParty": true,
    "relation": "founder's company"
  },
  "chainId": 5042,
  "spender": { "address": null, "deployBlock": null, "owner": null, "agent": null },
  "split": "0x457c89e10a6e66633eda5bf82fd086febb5db147",
  "router": "0x937f13ce28294011567615330dbcb859a06a0bba",
  "shelter": {
    "name": "Pink Paw (Rožinė pėdutė)",
    "wallet": "0xE299299b846Ba629f5A591dBF4F562bcC07A0f37",
    "custody": "held-by-token-tails"
  },
  "policy": {
    "ratioBps": 10000,
    "perGiftMaxUsdc": "0.05",
    "perDonorDailyMaxUsdc": "0.05",
    "budgetUsdc": "1.00",
    "minGiftUsdc": "0.01",
    "maxGiftAgeHours": 48,
    "validFrom": "2026-10-14T00:00:00Z",
    "eligible": {
      "chains": [5042],
      "kinds": ["public", "router-native", "router-authorization"],
      "senders": "any",
      "matchTreats": false,
      "treatsDailyMaxUsdc": "0"
    },
    "excludedSenders": [
      "0x7b136b872bEad1dAE557d1286f125B7A8A197C9A",
      "0x8D03d8295892F7dE2B7cE57585Aa45Dd4B3C2ba0",
      "0x3333c1661B93f56DeC472eF89ACa03F56E70F9B7",
      "0xd6F37D1241dA20BbE40D1210940Bc43A1Ec56263"
    ],
    "farming": { "maxGiftsPerDonorDay": 5 },
    "pace": { "from": "2026-10-15", "to": "2026-11-15", "floatLowUsdc": "0.10" },
    "refund": { "after": "2026-11-15", "to": "owner" },
    "plannedTtlMinutes": 30
  }
}
```

The `excludedSenders` defaults are the Token Tails treasury, the treat/relay hot wallet (`donateHot`),
the x402 demo agent and the deployer. All four are public in `backend/src/shelter/onchain/wallet.config.ts`.

**Validation (`lib/policy.mjs`, `loadSponsor(file) → {sponsor, policyHash}`)**. Any failure throws, and
`run.mjs` exits 2.

| Field | Rule |
|---|---|
| `schema` | exactly `tt.match-desk.sponsor/v1` |
| `sponsor.id` | `^[a-z0-9-]{1,24}$` (it goes into the memo) |
| `sponsor.name` | non-empty, ≤ 80 chars |
| `sponsor.relatedParty` | boolean, required; when `true`, `relation` must be non-empty. Must be `true` for Motored.lt (`id` `motored` or a name containing "motored"): it is the founder's company, never a plain sponsor. The label comes from one `sponsorLabel` in `lib/policy.mjs`, which `statement.mjs` imports |
| `chainId` | 5042, 5042002, or 31337 (a local anvil only); must equal `eth_chainId` at run time |
| `spender.*` | addresses or `null`; `run.mjs` refuses `null` spender/deployBlock (`init` state only) |
| `split`, `router`, `shelter.wallet` | addresses (`router` may be `null`) |
| `shelter.custody` | `held-by-token-tails` or `held-by-shelter`; drives the custody copy |
| amounts (`*Usdc`) | decimal strings, ≤ 6 decimals, parsed to **micro-USDC bigint**, never floats |
| `ratioBps` | integer 1…10000 (10000 = 1:1; no more than 1:1) |
| `perGiftMaxUsdc` | > 0 and ≤ `budgetUsdc` |
| `perDonorDailyMaxUsdc` | > 0 |
| `minGiftUsdc` | ≥ 0.000001 |
| `maxGiftAgeHours` | integer 1…168; it is also the observe window |
| `eligible.kinds` | subset of `public`, `x402`, `router-native`, `router-authorization` (`router-flush` is never eligible: its donor is unknown) |
| `eligible.senders` | `"any"` or a non-empty address list (allowlist) |
| `excludedSenders` | address list, lowercased on load |
| `pace.from/to`, `refund.after` | `YYYY-MM-DD`, with `from < to` |
| `refund.to` | exactly `"owner"` (the contract allows nothing else) |

Code always excludes, whatever the file says: the spender, the agent, the owner, the split and the
router as a *payer*. For router gifts, the donor is the `RouterDonation.donor`, not the router.

**`policyHash`** = sha256 hex of `canonical(policy)` (the `policy` object only, with the raw strings as
written), using `canonical()` from `log.mjs`.

**Treats.** When `matchTreats: true`, a sponsored treat (a `tt:<source>:<8hex>` memo from a trusted
`TREAT_AGENT_TT_SENDERS` payer) is eligible. Treats share one donor key, `"treats"`, capped by
`treatsDailyMaxUsdc`, and the per-donor limit does not apply to them. Their statement rows read "a
player's free treat (paid by Token Tails), matched by the sponsor". The example ships with `false`.
Turning it on is a founder decision.

## Observe additions (A: `observe.mjs`, `lib/backend.mjs`)

`observe()` stays as is for the old mode. A new `observeMatchDesk({rpc, sponsor, now, fetchImpl, dir})`
reuses its helpers and returns `obs` with the old shape **plus** `obs.matchDesk`.

### RPC (truth)

- Window: the last `maxGiftAgeHours`, estimated from block times as today. Not earlier than
  `policy.validFrom`.
- ShelterSplit `DisbursementBatch` + `NativeDisbursementBatch` logs on `sponsor.split`.
  `decodeBatch` also returns `logIndex`, `toSheltersRaw` (bigint string) and `decimals`.
  **Gift id = `<txHash lowercase>:<logIndex decimal>`.**
- `RouterDonation` logs on `sponsor.router` (when not null). They map batch tx → donor and path.
- Block timestamps: `eth_getBlockByNumber` for each distinct gift block, cached per round. The index
  timestamp is used when present. **Day = UTC `YYYY-MM-DD` of the block time.**
- Spender: the existing caps, float, `remainingToday` and `agent` reads, plus `owner()` (selector
  `0x8da5cb5b`, pinned in `lib/abi.mjs`). Refuse to run (exit 2) when the on-chain `split`, `agent` or
  `owner` differs from `sponsor.json`.
- Rate limit: `MATCH_DESK_CALL_GAP_MS`, default 500 on chain 5042 and 0 elsewhere, between RPC calls
  (Arc mainnet's public RPC answers about 2 calls a second).
- Witness reads (below) run inside observe, before decide.

### HTTP (context; fail-soft; `MATCH_DESK_API`, default `https://api.tokentails.com`; `off` skips all three)

Each call has a 10 s timeout and sends no headers beyond `accept: application/json`. A failure records
`{ok:false, error}` and the round goes on, except where noted.

| Endpoint | Query | Fields used | Use |
|---|---|---|---|
| `GET /shelter/payouts` | `network=mainnet\|testnet` (5042002 → testnet), `chainId`, `address=<split>`, `limit=500` | `contracts[0].indexedThrough.{block,time}`, `contracts[0].lastRunFailed`, `events[].{txHash,logIndex,timestamp,amount18,memo,kind,shelter}` | timestamps; cross-check (`index.missing`: RPC gifts the fresh index lacks; informational); `stale` = `indexedThrough.time` older than 15 min |
| `GET /shelter/donate/status` | none | `chains[]` where `chainId` matches: `enabled`, `railState`, `splitAddress`, `treatsLeftToday` | **hard stop**: if `splitAddress` is present and ≠ `sponsor.split`, the round holds (code, no model call) |
| `GET /shelter/match/status` | `chainId` | `state` (`off\|live\|exhausted\|awaiting-handover`), `perGift`, `dailyLeft` | if `state !== 'off'` **or the call failed**, router gifts are excluded: the backend matcher may own them, so one gift is never matched twice |

### `obs.matchDesk` (what decide and the checker read)

```js
{
  sponsor: { id, name, relatedParty, label },  // label: "related-party sponsor (founder's company)" | "self-sponsor (Token Tails founder)" | "sponsor"
  policyHash,
  chainId, network,                               // 'mainnet' | 'testnet' | 'local'
  caps: { perTxMicro, dailyMicro, remainingTodayMicro, floatMicro, unitDecimals },   // bigint
  budget: { budgetMicro, committedMicro, leftMicro },  // committed = reconciled + sent + live planned (not expired/failed)
  gifts: [{ id, tx, logIndex, block, ts, day, batchId, kind, donor, giftMicro,
            status: 'eligible' | 'matched' | 'pending' | 'flagged' | 'too-old' | 'too-small'
                  | 'excluded-sender' | 'not-allowlisted' | 'router-backend' | 'kind-off' | 'tt-internal' }],
  donorUsedMicro: { "<donor>|<day>": bigint },    // from receipts (reconciled + sent + live planned)
  farmingSignals: [{ donor, day, gifts, totalMicro, reason }],  // > maxGiftsPerDonorDay gifts, or ≥ 3 gifts of exactly minGift
  pace: { from, to, daysLeft, targetPerDayMicro, matchedTodayMicro, status: 'ahead' | 'on' | 'behind' | 'n/a' },
  floatLow: boolean,                               // floatMicro < floatLowUsdc or < perGiftMax
  refundAllowed: boolean,                          // now > refund.after (UTC end of day)
  backend: { payouts: {ok, stale, missing}, donateStatus: {ok, railState, splitMatches}, match: {ok, state} },
  witness: { reconciled: [sha], failed: [sha], expired: [sha], orphans: [{memo, tx}], collisions: [sha] }
}
```

A gift is `matched` when any receipt with status `reconciled` or `sent`, or a `planned` receipt within
`plannedTtlMinutes`, lists its id. It is `pending` while that planned receipt is still live. A
`planned` receipt from a **dry run** blocks its gifts only for other dry runs: a `--fork` or `--send`
round right after a dry run is not held (the same gifts give the same memo, so a printed command the
founder ran by hand is still caught by the witness and the idempotency check).

Never matched (`excluded-sender`): `excludedSenders`, the vault, its agent and owner, the split, the
router, and `shelter.wallet` itself (Token Tails holds it until the handover, so matching it would be
circular). A batch whose memo starts with `tt:agent:` or `tt:match:` is `tt-internal` whoever paid
(it may be Token Tails' own agent money from a payer not in `TREAT_AGENT_TT_SENDERS`); a stranger who
writes such a memo only opts out of matching. The old
`tt:agent:match-<8hex>` / `tt:match:<8hex>` prefixes still count as matched (trusted payers only), so
earlier treat-agent matches are never matched again. Receipts also load from
`client/public/match-desk/statement.json` when its `contract.spender` equals this spender, so a lost
local state directory cannot reopen published matches.

**Code-only holds (no model call, no API cost):** split paused; `remainingTodayMicro == 0`;
`floatMicro == 0`; `budget.leftMicro == 0`; donate-status split mismatch; no eligible gift and
`!refundAllowed && !floatLow`. The hold rationale names the reason.

## Decide (A: `decide.mjs`)

Same Messages API call shape as today (model `claude-opus-5-5`, adaptive thinking, effort medium,
`disable_parallel_tool_use`, the fallback beta). Match-desk mode uses its own `SYSTEM_MATCH` and
`TOOLS_MATCH`. The user text keeps the framing `Observation:\n<json>\n\nDecide now: ...`, because
`lib/fake-llm.mjs` parses it.

### Facts the model sees (snake_case, decimal-string USDC)

`sponsor_label`, `ratio` ("1:1"), `per_gift_max_usdc`, `per_donor_daily_max_usdc`, `budget_left_usdc`,
`per_tx_cap_usdc`, `remaining_today_usdc`, `float_usdc`, `float_low`, `pace`, `refund_allowed`,
`eligible_gifts` (≤ 20, newest first: `gift_id`, `donor_short`, `kind`, `gift_usdc`,
`donor_room_usdc`, `match_if_alone_usdc`, `age_minutes`), `farming_signals`, and `the_rule`. The last
one is the checker formula in one sentence, so the model can compute the amount exactly.

### Tools (all `strict: true`, `additionalProperties: false`)

| Tool | Input | Meaning |
|---|---|---|
| `match_gift` | `gift_ids: string[]` (1…10, unique), `amount_usdc: string` (decimal, ≤ 6 dp), `rationale: string` | match these gifts with this exact amount |
| `hold` | `rationale` | nothing this round |
| `flag` | `kind: "farming" \| "pace" \| "float_low"`, `gift_ids: string[]` (may be empty; required non-empty for farming), `rationale` | tell the sponsor; no money moves |
| `propose_refund` | `rationale` | propose that the owner withdraw the unused float to itself |

Local validation is the same as today: exactly one tool call, an exact key set, types, and a
non-empty rationale (≤ 600 chars). A validation failure becomes a hold with `meta.rejected = true`.

### The amount checker (`lib/checker.mjs`, pure, bigint micro-USDC)

```
expectedMatch(selectedIds, md) -> { amountMicro, perGift: [{id, matchMicro}], uncappedMicro, clampedBy } | Reject
```

1. Every id is in `md.gifts` with `status === 'eligible'`. There are no duplicates and at most 10 ids.
   Otherwise `Reject('ineligible gift <id>: <status>')`.
2. Sort the selected gifts by `(block, logIndex)`. Copy `donorUsedMicro`.
3. For each gift `g`:
   `base = g.giftMicro * ratioBps / 10000` (integer floor);
   `room = (donor key "treats" ? treatsDailyMax : perDonorDailyMax) - used[donorKey|g.day]` (floor 0);
   `m_g = min(base, room)`; `used += m_g`. If `m_g == 0`, `Reject('donor limit reached for <id>')`.
4. `uncapped = Σ m_g`.
   `limit = min(perGiftMax, caps.perTxMicro, caps.remainingTodayMicro, caps.floatMicro, budget.leftMicro)`.
   `amount = min(uncapped, limit)`. `clampedBy` = the name of the binding limit
   (`perGiftMax | perTx | remainingToday | float | budget`) or `null`.
5. When clamped, the amount is allocated greedily over the sorted gifts (`matchMicro` per gift, each ≤
   its `m_g`). A gift in a receipt is matched **once**, possibly in part. Its unmatched remainder is
   never matched later.
6. `amount == 0` → `Reject('nothing to match')`.
7. Native mode: `amountRaw = amountMicro * 10^(unitDecimals-6)`. Before acting, `split.preview(amountRaw)`
   must send 0 to the treasury (existing run.mjs check).

**Decision rule:** parse the model's `amount_usdc` string exactly (no floats). If it is not equal to
`amountMicro` → **reject**. The round holds with the rationale
`Checker rejected: model proposed X USDC, policy gives Y USDC for <ids>`, the log gets
`checker: {ok:false, expectedMicro, proposedMicro}`, and nothing is sent. The old give path clamps the
amount; the match desk never does.

Other tools:

- **`flag farming`**: each id must be a currently eligible gift. They are written to `flagged.json`
  and excluded until a human deletes the entry.
- **`flag pace` / `flag float_low`**: logged and printed only.
- **`propose_refund`**: allowed only when `refundAllowed`, otherwise rejected. It writes
  `refund-proposal.json` `{at, floatUsdc, owner, command, rationale}`. The command is
  `cast send <spender> "withdraw(address)" <owner> --rpc-url <rpc> --account <sponsor-keystore>`. It is
  **never sent by the agent**, even with `--send`: `withdraw` is owner-only, and only the owner (the
  sponsor) can receive the funds.

`lib/fake-llm.mjs` gets a match-desk policy: it matches the newest eligible gift alone with
`match_if_alone_usdc`, holds when there is none, and flags farming when a signal exists. With
`TREAT_AGENT_FAKE_WRONG=1` it adds 0.000001 so tests and the fork demo can show a checker rejection.

## Receipt (A: `lib/receipt.mjs`; C reads it)

**Body** (hashed). Only strings, safe integers, booleans, `null`, arrays and objects are allowed: no
floats, no `undefined`, addresses lowercase, amounts as decimal integer strings.

```json
{
  "type": "tt.match-desk.receipt",
  "v": 1,
  "sponsor": "motored",
  "chainId": 5042,
  "spender": "0x…",
  "split": "0x457c89e10a6e66633eda5bf82fd086febb5db147",
  "policySha256": "<64 hex>",
  "ratioBps": 10000,
  "gifts": [
    { "id": "0x…:12", "tx": "0x…", "logIndex": 12, "block": 25763386, "batchId": "45",
      "kind": "public", "donor": "0x…", "day": "2026-10-15",
      "giftMicro": "20000", "matchMicro": "20000" }
  ],
  "uncappedMicro": "20000",
  "amountMicro": "20000",
  "amountRaw": "20000000000000000",
  "unitDecimals": 18,
  "clampedBy": null
}
```

- `sha256` = lowercase hex of SHA-256 over the UTF-8 bytes of `canonical(body)`. `canonical` is the
  existing `log.mjs` function: object keys sorted, `JSON.stringify` for primitives, arrays in order, no
  whitespace. The browser verifier in C re-implements exactly this.
- The body holds no timestamp, no rationale and no model output. The same gifts with the same amount
  under the same policy always give the same hash, and so the same memo. That is what makes sends
  idempotent.
- **Memo** = `tt:agent:m:<sponsor.id>:<sha256[0:8]>`, for example `tt:agent:m:motored:1a2b3c4d`, at
  most 44 bytes. It satisfies CappedSpender (`tt:agent:` prefix, ≤ 256 bytes, else `BadMemo`) and
  ShelterSplit (≤ 256 bytes, else `MemoTooLong`). `classify()` already treats it as `agent`, because the
  payer is the spender.

**Envelope**: the file `receipts/<sha256>.json`; it is not hashed.

```json
{
  "receipt": { "…": "body above" },
  "sha256": "<64 hex>",
  "memo": "tt:agent:m:motored:1a2b3c4d",
  "mode": "send | fork | dry-run",
  "status": "planned | sent | reconciled | failed | expired | skipped-duplicate | mismatch",
  "createdAt": "ISO", "updatedAt": "ISO",
  "decision": { "model": "claude-opus-5-5", "rationale": "…", "observationHash": "sha256:…",
                "checker": { "ok": true, "expectedMicro": "20000", "proposedMicro": "20000" } },
  "tx": { "hash": null, "block": null, "status": null },
  "witness": null
}
```

`witness` once reconciled: `{ "tx": "0x…", "block": n, "logIndex": n, "batchId": "…", "amountRaw": "…",
"spentTodayRaw": "…", "reconciledAt": "ISO" }`.

**Status transitions:**

- `planned`, then `sent` (tx hash known), then `reconciled` (event read back).
- `sent`, then `failed` (receipt status 0).
- `planned`, then `sent` with `tx.hash: null` and `tx.status: "unknown"` when `cast` exits non-zero
  without a receipt in `--send` mode (receipt wait timeout, Ctrl-C, keystore prompt error). It stays
  committed and blocks its gifts and budget until the witness sees its memo, or a human runs
  `--release <sha256>` after checking the agent's address on the explorer (then `failed`). Only a
  `cast` that never started, or a pre-send revert with a decoded error, is `failed` straight away.
- `planned` with `mode: send`: the process died while `cast` ran (Ctrl-C reaches node and `cast`
  together), so no outcome was recorded. It stays committed with no TTL; after `plannedTtlMinutes`
  the witness moves it to `sent` with `tx.status: "unknown"` (never `expired`). `--release` clears it
  like any unknown send.
- `failed` or `expired`, then `reconciled`: an `AgentGift` with that memo that lands late is still
  reconciled, never invisible.
- `planned` (`dry-run` or `fork`), then `expired` (older than `plannedTtlMinutes`, no event, no tx).
- `planned`, then `skipped-duplicate` (an `AgentGift` with this memo and amount already exists).
- Any status, then `mismatch` (an event with this memo but a different amount; flag and never resend).

Writes are write-ahead. The `planned` envelope is written **before** any send.

## Witness (A: `lib/witness.mjs`)

Every round, before decide:

1. `eth_getLogs` on `sponsor.spender.address`, topic `AgentGift`
   (`0x5936d115…6fd4cf`, pinned), from `spender.deployBlock` to head. The read is chunked and uses the
   existing range-halving.
   Decode it: `batchId = topics[1]`; data = `amount` (word 0), memo offset (word 1), `spentToday`
   (word 2); `memo = stringAt(data, 1)`.
2. For every envelope with status `planned | sent | expired | failed` (any mode, so a printed command
   the founder ran by hand, or a send whose outcome looked failed, reconciles too), match by `memo`:
   - same `amountRaw` → `reconciled`, and fill `witness`;
   - different amount → `mismatch` (and a `collision` in `obs.matchDesk.witness`).
3. A `sent` envelope without an event → `eth_getTransactionReceipt(tx.hash)`: status `0x0` → `failed`
   (its gifts become eligible again); not found after `plannedTtlMinutes` → leave it `sent` and print a
   warning (never re-plan those gifts). A `sent` envelope with no tx hash (unknown outcome) is reported
   as stuck after `plannedTtlMinutes` and is never released by code.
4. A `tt:agent:m:<sponsor.id>:` event with no envelope → `orphan` (reported; its gifts are unknown).
   The memo does not name the gifts, so a retry from an empty or lost state dir could match the same
   gift again under a different memo. Every unacknowledged orphan is a **code hold** in every mode (no
   model call, no receipt). Fix it by running from the state dir that made it (`MATCH_DESK_DIR`), or,
   after checking that tx, `--ack-orphan <tx hash>`, which records the acknowledgement in
   `<state dir>/orphan-acks.json`.
5. `--witness-only` runs steps 1–4, prints a table and exits 0.

## Act (A: `act.mjs`, `run.mjs`)

Three exclusive modes: dry run (default), `--fork`, `--send`.

| | Dry run | `--fork` | `--send` |
|---|---|---|---|
| RPC | any | `isLocalRpc` only (existing guard) | not local; `eth_chainId` ∈ {5042, 5042002} and equal to `sponsor.chainId` |
| signer | none; prints `cast send … --account <keystore>` | `--unlocked --from <agent>` | `cast send … --account <keystore>` run by the founder's own shell; the password prompt goes to the TTY (spawn with `stdio: ['inherit','pipe','inherit']`) |
| extra gates | none | none | `--once` required; refused when the `CLAUDECODE` env var is set (an AI session); chain 5042 requires `CONFIRM_MAINNET=yes`; `--keystore` (or `TREAT_AGENT_KEYSTORE`) required and must not be `<keystore>` |
| receipt | `mode: dry-run`, `planned` (blocks its gifts for other dry runs for `plannedTtlMinutes`; not for `--fork`/`--send`) | `mode: fork` | `mode: send`; non-zero `cast` exit with no hash → `sent`, `tx.status: unknown` (see the status transitions) |

**Idempotency, every mode that sends.** Right before the send, re-read `AgentGift` logs from
`deployBlock` for the planned memo. If one exists with the same amount, mark the receipt
`skipped-duplicate` (and reconcile it), and do not send. With a different amount it becomes
`mismatch`, and the round exits 1 without sending.

Exact command:
`cast send <spender> "give(uint256,string)" <amountRaw> <memo> --rpc-url <rpc> --account <keystore> --json`.
The printed form shows `"$TREAT_AGENT_RPC"` when the RPC URL carries a path or key (existing
`isPlainRpc`).

**`--demo-overcap [--overcap-kind auto|tx|day] [--mined-revert]`**: the model is **not** called. Code
builds the decision with the memo `tt:agent:m:<id>:demo-overcap`:

- `auto`: `day` when `remainingToday < perTx`, else `tx`;
- `tx`: `amount = 2 × perTx`, expect `OverTxCap(amount, perTx)`;
- `day`: needs `remainingToday < perTx` (else exit 2 with "spend the day first"); `amount = perTx`,
  expect `OverDailyCap(spent + perTx, daily)`.

On `--fork` it runs `cast send` as today. On a live chain with `--send` it runs `cast call <spender>
"give(uint256,string)" … --from <agent>` (a simulation; no tx, no gas), or with `--mined-revert`
`cast send … --gas-limit 300000` (a mined failed tx). `--mined-revert` is `tx` only (`auto` becomes
`tx`, `day` exits 2): a mined `day` demo is a real `give(perTx)` that only the daily cap stops, and it
would pay out if 00:00 UTC passed before it was mined. `2 × perTx` always reverts (`perTxCap` is
immutable). The dry run prints both commands. **Success =
the decoded revert is the expected error.** The log records `result.status: "refused-as-expected"`
and exit 0. Any other outcome, a successful give included, exits 4. Demo rounds write no receipt.

**Exit codes for `run.mjs --sponsor`:** 0 ok (including holds and expected refusals), 1 an unexpected
revert / failed send / mismatch, 2 usage, policy or guard refusal, 3 Messages API error, 4 the
over-cap demo did not refuse as expected.

**CLI (fixed; B's scripts and README rely on it):**

```
node run.mjs --sponsor <file> [--rpc <url>] [--once] [--interval <s>]
             [--fork | --send] [--keystore <name>]
             [--demo-overcap [--overcap-kind auto|tx|day] [--mined-revert]]
             [--witness-only] [--release <sha256 prefix>] [--ack-orphan <tx hash>]
```

`--release` runs alone (a dry-run round that only clears one unknown `sent` receipt; see the status
transitions). `--ack-orphan` runs alone too (it acknowledges one orphan the witness found this round).
A `--fork` tx is printed as "local fork tx, not on any explorer"; only `--send` prints an explorer link.

Env: the existing treat-agent variables, plus `MATCH_DESK_DIR`, `MATCH_DESK_API`,
`MATCH_DESK_CALL_GAP_MS`, `CONFIRM_MAINNET`, `TREAT_AGENT_FAKE_WRONG`.

`log.mjs`: each decisions.jsonl line gains
`matchDesk: { sponsor, policyHash, receiptSha256, memo, checker, flag, witness: {reconciled, failed, orphans} }`.
The RPC URL is still never written.

## Statement (C: `statement.mjs`, `lib/statement-html.mjs`)

```
node statement.mjs --sponsor <sponsor.json> [--receipts <dir>] [--out ../../client/public/match-desk]
                   [--now <ISO>] [--rpc <url> --verify-onchain]
```

- Input: every `receipts/*.json` envelope for this chain and spender, with `mode` in `send` or `fork`.
  A fork run writes only to a `--out` the caller names. `client/public/match-desk` takes Arc mainnet
  (5042) only: it refuses `mode: fork`, chain 31337 and Arc testnet (5042002). Each envelope's `sha256` is re-verified against `canonical(body)`;
  an envelope that fails is **excluded** and listed in `excluded[]` with its reason.
- `--verify-onchain` (read-only RPC) re-reads `AgentGift` by memo, and counts as reconciled only those
  events whose tx and amount match. `match-desk.sh statement` passes it (with `--rpc`, from
  `MATCH_DESK_RPC` or the public Arc RPC) by default on Arc mainnet; `--no-verify-onchain` opts out.
  When a statement with receipts was not re-checked, `index.html` says so.
- Output: `statement.json` and `index.html`, deterministic. Rows and keys are sorted. `generatedAt`
  comes from `--now`, else the newest `updatedAt`, else `null`. Unchanged input gives identical bytes.
- `index.html` is self-contained: inline CSS and JS, no external requests, data embedded as
  `<script type="application/json" id="statement">`. Light and dark via `prefers-color-scheme`. Readable
  at phone width. Each receipt has a "Verify hash" button that recomputes SHA-256 with
  `crypto.subtle` over the same canonical JSON. Explorer links: `<explorer>/tx/<hash>` and
  `/address/<addr>`.
- No RPC URL, no file paths and no private links in either file.

**statement.json**

```json
{
  "type": "tt.match-desk.statement", "v": 1, "generatedAt": "ISO|null",
  "chain": { "id": 5042, "name": "Arc", "explorer": "https://explorer.arc.io" },
  "sponsor": { "id": "motored", "name": "Motored.lt", "relatedParty": true,
               "label": "related-party sponsor (founder's company)" },
  "shelter": { "name": "…", "wallet": "0x…", "custody": "held-by-token-tails" },
  "contract": { "spender": "0x…|null", "split": "0x…", "owner": "0x…|null", "agent": "0x…|null" },
  "policy": { "ratio": "1:1", "perGiftMaxUsdc": "0.05", "perDonorDailyMaxUsdc": "0.05",
              "budgetUsdc": "1.00", "policySha256": "…" },
  "totals": { "reconciledUsdc": "0", "pendingUsdc": "0", "receipts": 0, "giftsMatched": 0,
              "donors": 0, "giftsMatchedUsdc": "0" },
  "days": [{ "day": "2026-10-15", "reconciledUsdc": "0.05", "receipts": 1 }],
  "receipts": [ "<envelopes, newest first; decision.observationHash kept, nothing else removed>" ],
  "excluded": [{ "sha256": "…", "reason": "hash mismatch" }],
  "disclosures": [ "…the eight honest-copy sentences, built from sponsor and custody…" ],
  "notTaxReceipt": true
}
```

The totals count only `reconciled` receipts. `sent` and live `planned` receipts count as pending.
`failed`, `expired`, `skipped-duplicate` and `mismatch` receipts are listed but never counted.

**Placeholder (committed now):** `client/public/match-desk/index.html` and `statement.json` are the
generator's output for `sponsor.example.json` with zero receipts. The page shows "Not deployed yet. No
matches." and all the disclosures, and no invented numbers. The lead sentence is in the present tense
("matches public gifts") only once at least one receipt is reconciled; before that it says the sponsor
"will match" them (once the vault is deployed and funded, when there is no vault yet). It is served at
`tokentails.com/match-desk/index.html`, like `/heist/index.html`.

## Contracts and scripts (B)

**B1. `script/DeployCappedSpender.s.sol`** (script only, `src/` untouched). Add a floor guard as a new
pure function, so the `check(...)` signature and the existing `test_DeployGuards` stay valid:

```solidity
error PerTxBelowFloor(uint256 perTx, uint256 floor);
function checkFloor(uint256 perTx, uint256 floor) public pure { if (perTx < floor) revert PerTxBelowFloor(perTx, floor); }
// run(): floor = VM.envOr("CAPPED_MIN_PER_TX", oneUsdc / 1000); checkFloor(perTx, floor);
```

It refuses `CAPPED_PER_TX=50000` in native mode (50000 < 10¹⁵). The header comment gets the runbook
values.

**B2. `test/CappedSpenderMatchDesk.t.sol`** (new; no forge-std; uses the existing `test/utils`
pattern):

- the memo `tt:agent:m:motored:1a2b3c4d` is accepted and emitted in `AgentGift`;
- `tt:agent:m:motored:demo-overcap` with `2 × perTx` → `OverTxCap`;
- after four 0.05 gives with a 0.20 daily cap, a 0.05 give → `OverDailyCap(0.25e18, 0.2e18)`;
- `checkFloor` refuses 50000 and accepts 5e16;
- `check(5042, 5042, true, 5e16, 2e17, 1e18)` passes.

Existing tests stay green: `forge test`.

**B3. `agents/treat-agent/match-desk.sh`**: the founder's runbook as subcommands. It never handles a
key itself: every signing step either prints the command or runs `forge`/`cast` with `--account`
interactively. It refuses (exit 2) when `CLAUDECODE` is set, for any subcommand that broadcasts.

| Subcommand | Does |
|---|---|
| `init <testnet\|mainnet>` | copies `sponsor.example.json` to `sponsor.arc-testnet.json` / `sponsor.arc.json`, with `chainId` and `eligible.chains` set |
| `deploy <testnet\|mainnet> --account <deployer> --owner <sponsorAddr> --agent <agentAddr>` | `forge script script/DeployCappedSpender.s.sol` with `EXPECTED_CHAIN_ID`, `CAPPED_NATIVE=1`, `CAPPED_SPLIT`, caps 5e16 / 2e17; the simulation first, then `--broadcast` after a y/N prompt; mainnet needs `CONFIRM_MAINNET=yes`; prints the address and block for `sponsor.json` |
| `check <sponsor.json>` | read-only: `native()`, `perTxCap()`, `dailyCap()`, `split()`, `agent()`, `owner()`, `floatBalance()`, `remainingToday()`; exits 1 unless native = true, caps = 5e16 / 2e17, and the addresses match the file |
| `fund <sponsor.json> --account <owner> --usdc <n>` | `cast send <spender> --value <n>ether` (native 18 dec, so `1ether` = 1 USDC) from the owner; a y/N prompt |
| `gas <sponsor.json> --account <funder> --usdc 0.05` | sends Arc gas (USDC) to the agent EOA |
| `verify <sponsor.json>` | prints the Sourcify `forge verify-contract … --verifier sourcify --constructor-args $(cast abi-encode "constructor(address,address,address,uint256,uint256,bool)" …)` command (the same flow as the routers; the command form is unverified on Arc until it is run on testnet) |
| `round <sponsor.json> [run.mjs flags]` | `node run.mjs --sponsor … --once …` |
| `statement <sponsor.json>` | `node statement.mjs --sponsor … --out ../../client/public/match-desk` |

**B4. `fork-demo.sh --match-desk [transcript]`** (the old demo stays the default). On an anvil fork
of Arc testnet, `MATCH_DESK_API=off`:

1. Deploy CappedSpender through `script/DeployCappedSpender.s.sol` (`forge script --broadcast
   --unlocked --sender <dev #0>`, the same script as `match-desk.sh deploy`), owner = dev #3 as the
   "sponsor", agent = dev #1, caps 5e16 / 2e17.
2. Fund 1 USDC from dev #3. Write `$LOG_DIR/sponsor.fork.json` (chainId from the fork,
   `excludedSenders` from `sponsor.example.json` (only skipped, never paid), `validFrom` = now − 1 h).
   `FORK_URL` and `FORK_CHAIN_ID` pick the upstream and the fork's chain id: a rehearsal on Arc
   mainnet state is `FORK_URL=https://rpc.mainnet.arc.io FORK_CHAIN_ID=5042002` (run.mjs refuses
   `--fork` with chainId 5042, and native-mode deploys need an Arc chain id, so not 31337).
3. Fan gifts: dev #2 gives 0.02, dev #4 gives 0.03, and dev #5 gives six 0.01 gifts (a farming signal).
4. Run:
   - `--fork --once` (a match plus its receipt);
   - `--witness-only` (reconciled);
   - `--fork --once` again (the next gift);
   - with `TREAT_AGENT_FAKE_WRONG=1`, a checker rejection;
   - spend to the cap, then `--fork --demo-overcap --overcap-kind day` (`OverDailyCap`), then
     `--overcap-kind tx`;
   - `statement.mjs --out $LOG_DIR/statement` (never into `client/public`);
   - print Pink Paw's balance before and after.
5. Exit non-zero if any expectation fails, so it doubles as an end-to-end test.

**B5. README sections**: `agents/treat-agent/README.md` gets a "Sponsor Match Desk" section (the
loop, the honest-copy list, the CLI, the runbook pointer to `match-desk.sh`). The
`contracts/shelter-split/README.md` CappedSpender section gets the floor guard and the 18-decimal cap
values.

## Runbook: testnet first (founder's terminal only)

AI sessions never run steps marked ✍. Nothing is sent to a public network from an AI session.

1. Keystores: a new `tt-match-agent` EOA (not the x402 agent or the treat hot wallet), plus the
   sponsor's owner keystore.
2. ✍ `./match-desk.sh init testnet`, then `./match-desk.sh deploy testnet --account <deployer> --owner
   <sponsor> --agent <tt-match-agent addr>`. Paste the address and deploy block into
   `sponsor.arc-testnet.json`.
3. `./match-desk.sh check sponsor.arc-testnet.json`. It must print native = true, perTxCap
   50000000000000000, dailyCap 200000000000000000. This settles the "native decimals" open question
   before any money moves.
4. ✍ `fund … --usdc 1` (testnet USDC from the faucet), then ✍ `gas … --usdc 0.05`.
5. A test fan gift from another testnet wallet:
   ✍ `cast send 0x457c89e1… "donate(string)" "fan gift" --value 0.02ether --account <fan>`.
6. `node run.mjs --sponsor sponsor.arc-testnet.json --once` (a dry run: it prints the command and a
   planned receipt; optional).
7. ✍ `node run.mjs --sponsor sponsor.arc-testnet.json --once --send --keystore tt-match-agent`, then
   `--witness-only` → `reconciled`. The dry-run receipt from step 6 does not hold this round. Run
   either the printed command or `--send`, not both. If `cast` exits without a tx hash, the receipt
   stays `sent` (unknown); run `--witness-only` later, and only if the agent's address shows no such
   tx on the explorer, `--release <sha256>`.
8. Spend to the cap (repeat 5–7 or use small gifts), then ✍ `--demo-overcap --send` (simulation), and
   optionally `--mined-revert`.
9. `node statement.mjs --sponsor sponsor.arc-testnet.json --out /tmp/md-test` and open the page;
   check the disclosures and the hash buttons.
10. Mainnet: repeat 2–8 with `mainnet` and `CONFIRM_MAINNET=yes`, ✍ `verify` (Sourcify), fund
    1 USDC from Motored.lt's wallet as owner, then `statement` into `client/public/match-desk/` and
    commit.

Cost: about 1 USDC of float plus 0.05 USDC of agent gas per chain. Deploy gas is read from the testnet
receipt. Unused float can only be withdrawn to the owner (the sponsor).

## Tests

- **A** (`node --test`, stubbed RPC/HTTP/LLM/exec):
  - policy validation (every row of the table);
  - checker: ratio floor, per-donor across two gifts, treats key, each `clampedBy`, greedy allocation,
    reject on ±1 micro, ineligible ids;
  - receipt: hash stability under key order, memo format and length, the same gifts give the same
    memo;
  - witness: reconcile, mismatch, failed tx, orphan, expiry;
  - backend: the three shapes, fail-soft, the split-mismatch hard stop, `match.state !== 'off'`
    excludes router gifts;
  - act: the `--send` gates (`CLAUDECODE`, `CONFIRM_MAINNET`, `--once`, chain allowlist, local RPC
    refused) and idempotent skip;
  - demo-overcap: auto/tx/day amounts, and success only on the expected error;
  - one full match-desk round writing a receipt and a log line;
  - all existing tests unchanged.
- **B**: `forge test` (all, including B2), `bash -n match-desk.sh fork-demo.sh`, `shellcheck` when
  available, and `fork-demo.sh --match-desk` run locally (anvil only).
- **C**:
  - statement from fixture envelopes: totals count only reconciled;
  - a tampered body is excluded;
  - deterministic bytes;
  - the related-party label and every disclosure are present;
  - a `fork`/31337 statement refuses the public path;
  - the HTML has no `http(s)://` except the explorer and `tokentails.com`;
  - the placeholder equals the generator's output for the example sponsor.

## Work sets and file ownership (no overlaps)

**A: agent core**

- `agents/treat-agent/run.mjs`, `observe.mjs`, `decide.mjs`, `act.mjs`, `log.mjs`, `package.json`
  (adds the scripts `"match": "node run.mjs --sponsor"` and `"statement": "node statement.mjs"`)
- `agents/treat-agent/sponsor.example.json`
- `agents/treat-agent/lib/abi.mjs`, `lib/fake-llm.mjs`, `lib/policy.mjs`, `lib/checker.mjs`,
  `lib/receipt.mjs`, `lib/witness.mjs`, `lib/backend.mjs`
- `agents/treat-agent/test-support/helpers.mjs`
- `agents/treat-agent/test/act-observe.test.mjs`, `test/decide.test.mjs` (only to stay green),
  `test/policy.test.mjs`, `test/checker.test.mjs`, `test/receipt.test.mjs`, `test/witness.test.mjs`,
  `test/backend.test.mjs`, `test/match-desk.test.mjs`, `test/send.test.mjs`
- `agents/treat-agent/test/fixtures/match-desk/**`

**B: contracts, scripts, docs**

- `contracts/shelter-split/script/DeployCappedSpender.s.sol`
- `contracts/shelter-split/test/CappedSpenderMatchDesk.t.sol` (new; existing test files untouched
  unless B1 forces it)
- `contracts/shelter-split/README.md` (CappedSpender section only)
- `agents/treat-agent/fork-demo.sh`, `agents/treat-agent/match-desk.sh` (new),
  `agents/treat-agent/README.md`

**C: statement**

- `agents/treat-agent/statement.mjs`, `agents/treat-agent/lib/statement-html.mjs`
- `agents/treat-agent/test/statement.test.mjs`, `agents/treat-agent/test/fixtures/statement/**`
- `client/public/match-desk/index.html`, `client/public/match-desk/statement.json`

**Shared, read-only for everyone:**

- this file;
- `log.mjs` `canonical()` (C imports it but never edits it);
- `contracts/shelter-split/src/**`;
- `backend/src/shelter/**`;
- `client/public/shelter-payouts/**`.

C does not import A's new libs. It re-implements the hash check with `canonical()` and
`node:crypto`, so A and C can be built in parallel. B depends only on the CLI and file names fixed
above.
