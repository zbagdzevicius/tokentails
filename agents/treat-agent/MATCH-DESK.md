# Match Desk: build spec

Status: multi-sponsor desk, Oct 13, 2026 (the single-sponsor design of the same day is section
"v1 sponsor.json" below). This file is the contract between three parallel work sets (A, B, C, listed at
the end). Where this file and the code disagree, fix the code or update this file in the same change.

## What it is

Several companies each put USDC into **their own** `CappedSpender` vault on Arc (the existing,
Sourcify-verified contract, unchanged). Every vault names the **same agent** address. So one AI agent
holds spending power over a treasury pooled from several companies and pays it out to the shelter,
capped on-chain per vault, with a receipt for every payout. Each vault's owner is that company's own
keystore: only the owner can fund it (`receive()` accepts only the owner) and only the owner can take the
unspent float back, to itself (`withdraw`). The agent can only `give()`, and `give()` only pays
ShelterSplit, which pays the Pink Paw entry at 10000 bps.

Initial sponsors (`desk.example.json`):

| id | name | relatedParty | relation | label | owner keystore |
|---|---|---|---|---|---|
| `motored` | Motored.lt | true | founder's company | related-party sponsor (founder's company) | `motored` (the "motored-sponsor" wallet `0xFe7D5aA030d14213Bf1684d4c28FE7f32A4Dbc8d`; Token Tails created it for Motored.lt, the founder's company, and every submission says so) |
| `tokentails` | Token Tails | true | operator (Token Tails' own money) | operator's own money | `tt-sponsor-owner` (founder decides the address; the treasury `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A` is an option, never the hot, treat or agent wallets) |

Each vault: about 1 USDC, `perTxCap` 0.05, `dailyCap` 0.20 (18-decimal native values, see correction 1).

**Shelter wallet.** The example files set `shelter.wallet` to Pink Paw's wallet
`0x3c833562e682dB66C2415b34961595df135f4771` (custody `pink-paw-wallet`), because every mainnet ShelterSplit
pays it since 2026-10-16. Token Tails created it, gave the recovery phrase to Pink Paw staff, and keeps a
recovery backup. Before 2026-10-16 the split paid `0xE299299b846Ba629f5A591dBF4F562bcC07A0f37`, a wallet
Token Tails held for the shelter; it is now only the Token Tails grant receiver, so it is in
`policy.excludedSenders`. The Arc testnet splits still pay `0xE299…0f37` (custody `held-by-token-tails`).

Each round, the agent:

1. **observes** fresh public gifts to Pink Paw's ShelterSplit, every vault's caps, float, owner and
   agent, and three public Token Tails read endpoints;
2. **decides**: Claude calls one tool (`match_gift`, `hold`, `flag` or `propose_refund`);
3. **allocates and checks**: code picks the paying vault (the allocation rule below), recomputes the
   match amount from the written policy and **rejects** any model decision whose amount differs or that
   names another sponsor. The code does not quietly correct it;
4. **acts**: it calls `give(amount, memo)` on the chosen vault. The vault pays ShelterSplit, which pays
   the Pink Paw entry at 10000 bps. By default the agent prints the command and the founder runs it.
   With `--fork` it sends to a local anvil fork. With `--send` the founder sends from their own terminal;
5. **writes a receipt** (JSON: sponsor id, vault, policy hash). Its sha256 goes into the on-chain memo
   `tt:agent:m:<sponsor>:<hash8>`;
6. **witnesses**: the next round reads every vault's `AgentGift` events back and marks the receipts
   `reconciled`;
7. **publishes** a static statement page built from the receipts: one section per company and a desk
   total paid to the shelter wallet.

### The allocation rule (code, not the model)

For each eligible gift (or a selection of gifts), the paying sponsor is the first one in **allocation
order** (highest `priority`, then lowest `id`) that:

- is not `paused` in the desk file and is valid now (`validFrom` ≤ now, and every selected gift is no
  older than that sponsor's `validFrom`);
- has budget left ≥ the amount, vault float ≥ the amount and `remainingToday` ≥ the amount.

The amount is computed with that sponsor's ratio and `perGiftMaxUsdc` and the vault's `perTxCap`; it is
**never** clamped to what a vault has left. One gift is matched by exactly one vault (no splitting
across vaults). No sponsor can pay → the round holds (a code hold when no eligible gift fits any vault).
Claude still decides `match_gift` / `hold` / `flag` / `propose_refund` and gives its reason; if it names
a sponsor (`sponsor_id`), the checker refuses unless it is the code's pick. The per-donor daily limit,
the farming rules and "a gift is matched once" are **desk-wide**, across all sponsors.

**Deviation from the v1 checker (deliberate):** the v1 checker clamped a match to `remainingToday`,
float and budget. With several vaults that would split a gift's match by accident of order; the desk
instead moves the gift to the next vault, or holds. A one-sponsor desk therefore holds a gift its vault
cannot pay in full (v1 matched part of it).

`CappedSpender.sol` and every other contract under `contracts/shelter-split/src/` stay unchanged.
The backend gets no new write path. The agent only reads the backend.

## Honest copy (every public text, the statement page and the video)

These sentences, or sentences with the same meaning, must appear wherever the match desk is described
in public. The statement generator emits them verbatim (see "Statement").

- **Sponsor.** Motored.lt is a **related-party sponsor (founder's company)**. It is never called an
  outside or independent sponsor. Token Tails' vault is the **operator's own money**
  (`LABEL_OPERATOR`); it is never called a sponsor in the outside sense either. If the founder funds a
  vault personally, the label is **self-sponsor (Token Tails founder)**. One line per sponsor.
- **Pooled, capped.** (desks with several sponsors) Each company's money sits in its own capped vault,
  and only that company can fund it or take back what is left. One AI agent can spend from every vault,
  only through ShelterSplit to the shelter wallet. Code picks which vault pays each match; one match is
  paid by one vault.
- **Custody.** Matched money goes to Pink Paw's wallet (since 2026-10-16; Token Tails keeps a recovery
  backup). On a desk with custody `held-by-token-tails` the statement says the wallet is held by Token Tails.
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
  desk.example.json                                      (A: the desk, two sponsors)
  sponsor.example.json                                   (A: v1, one sponsor; still read)
  statement.mjs lib/statement-html.mjs                   (C: new)
  match-desk.sh fork-demo.sh README.md                   (B)
client/public/match-desk/index.html statement.json       (C)
```

**Mode switch.** `run.mjs --sponsor <file>` (alias `--desk`) runs the match desk on a desk.json (v2)
or a sponsor.json (v1). Without it, `run.mjs` behaves exactly as before: `give_treat` / `hold`, and every
existing test stays green.

**State directory.** `MATCH_DESK_DIR`, default `agents/treat-agent/runs/match-desk/`, which `runs/`
already gitignores. One directory per desk, keyed by the chain and the first 12 hex of sha256 over the
sorted, lowercase vault addresses joined by `,` (`deskKey`, `deskStateDir` in `lib/receipt.mjs`):

```
<MATCH_DESK_DIR>/<chainId>-desk-<key>/
  receipts/<sha256>.json        one envelope per receipt, every vault (send, fork and dry-run modes)
  flagged.json                  { "<giftId>": { kind, at, rationale } }  gifts excluded until a human removes them
  orphan-acks.json              { "<tx>": { memo, at } }  written by --ack-orphan
  refund-proposal.json          the latest propose_refund (overwritten; names the sponsor)
```

**Migration from v1 (and from a smaller desk).** The v1 directory was `<chainId>-<spenderLower>/`.
Every round also reads the sibling directories on the same chain (`<chainId>-<vault>/` for each vault
of the desk, and every other `<chainId>-desk-*/`): their receipts for one of this desk's vaults, their
`flagged.json` and `orphan-acks.json` (this desk's own files win). A receipt read that way is copied into
the desk directory the first time it is saved again (witness, status change); old directories are never
deleted or written. So adding a second sponsor (which changes the key) never reopens a gift matched by
the first vault. The statement reads the same set of directories.

## desk.json (policy file, `tt.match-desk.desk/v2`)

`desk.example.json` is committed with placeholders (`null` until the deploys). `match-desk.sh init
testnet|mainnet` copies it to `desk.arc-testnet.json` / `desk.arc.json`; `match-desk.sh deploy <desk>
--sponsor <id>` writes each vault (and the agent) into it. Those copies contain only public addresses and
may be committed after the deploy.

```json
{
  "schema": "tt.match-desk.desk/v2",
  "chainId": 5042,
  "split": "0x457c89e10a6e66633eda5bf82fd086febb5db147",
  "router": "0x937f13ce28294011567615330dbcb859a06a0bba",
  "shelter": { "name": "Pink Paw (Rožinė pėdutė)", "wallet": "0x3c83…4771", "custody": "pink-paw-wallet" },
  "agent": null,
  "policy": {
    "perDonorDailyMaxUsdc": "0.05", "minGiftUsdc": "0.01", "maxGiftAgeHours": 48,
    "eligible": { "chains": [5042], "kinds": ["public", "router-native", "router-authorization"],
                  "senders": "any", "matchTreats": false, "treatsDailyMaxUsdc": "0" },
    "excludedSenders": ["…the four Token Tails wallets, as in v1…"],
    "farming": { "maxGiftsPerDonorDay": 5 },
    "plannedTtlMinutes": 30
  },
  "sponsors": [
    { "id": "motored", "name": "Motored.lt", "relatedParty": true, "relation": "founder's company",
      "spender": { "address": null, "deployBlock": null, "owner": "0xFe7D5aA030d14213Bf1684d4c28FE7f32A4Dbc8d" },
      "priority": 20, "ratioBps": 10000, "perGiftMaxUsdc": "0.05", "budgetUsdc": "1.00",
      "validFrom": "2026-10-14T00:00:00Z",
      "pace": { "from": "2026-10-15", "to": "2026-11-15", "floatLowUsdc": "0.10" },
      "refund": { "after": "2026-11-15", "to": "owner" } },
    { "id": "tokentails", "name": "Token Tails", "relatedParty": true, "relation": "operator (Token Tails' own money)",
      "spender": { "address": null, "deployBlock": null, "owner": null },
      "priority": 10, "…": "same terms" }
  ]
}
```

**Shared (desk-wide):** `chainId`, `split`, `router`, `shelter`, `agent` (one address for every vault;
`null` until the first deploy), and `policy` = `perDonorDailyMaxUsdc`, `minGiftUsdc`, `maxGiftAgeHours`,
`eligible`, `excludedSenders`, `farming`, `plannedTtlMinutes`. **Per sponsor:** `id`, `name`,
`relatedParty`, `relation`, `spender {address, deployBlock, owner}`, `priority`, `ratioBps`,
`perGiftMaxUsdc`, `budgetUsdc`, `validFrom`, `pace`, `refund`, optional `paused`.

**Validation (`lib/policy.mjs`, `loadDesk(file) → {desk}`, `validateDesk(raw)`)**: each sponsor's view
(shared fields + its entry) must pass every v1 row below (the v1 validator runs on it; errors name
`sponsors[i] (id)`). Plus: 1…8 sponsors; unique ids; one vault per sponsor (no address twice); a
per-sponsor key in the shared `policy` is refused; `spender.agent` per sponsor is refused (the agent is
desk-wide); the agent is never a vault owner or a vault; `priority` integer 0…1000; `paused` boolean.
Token Tails (`id` `tokentails` or a name containing "Token Tails") must have `relatedParty: true`, like
Motored.lt. The normalised desk lists sponsors in allocation order; each has the v1 sponsor shape (so the
per-vault code paths are unchanged) plus `priority`, `paused` and `policyHash`.

Code always excludes, as senders: every vault, every vault owner, the agent, the split, the router (as a
payer) and the shelter wallet, whatever the file says.

**Policy hash (per sponsor)** = sha256 hex of `canonical({ policy: <shared policy object>, sponsor:
<that sponsor's entry without "paused"> })`, both exactly as written (`deskPolicyHashOf`; `paused` is an
operational switch, not policy). Another sponsor's entry never
changes it; the shared policy and the sponsor's own entry (including its vault address) do. It is the
`policySha256` in that sponsor's receipts and on the statement.

**v1 normalisation.** A `tt.match-desk.sponsor/v1` file is read as a desk with one sponsor (priority 0,
not paused, `agent` = `spender.agent`). Its policy hash stays `policyHashOf(policy)`, so receipts and
memos written before the desk keep their hashes. Every v1 fixture and test still runs.

## v1 sponsor.json (one sponsor, still read)

`sponsor.example.json` is the v1 one-sponsor file. New deployments use `desk.example.json`.

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
  "spender": { "address": null, "deployBlock": null, "owner": "0xFe7D5aA030d14213Bf1684d4c28FE7f32A4Dbc8d", "agent": null },
  "split": "0x457c89e10a6e66633eda5bf82fd086febb5db147",
  "router": "0x937f13ce28294011567615330dbcb859a06a0bba",
  "shelter": {
    "name": "Pink Paw (Rožinė pėdutė)",
    "wallet": "0x3c833562e682dB66C2415b34961595df135f4771",
    "custody": "pink-paw-wallet"
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
| `shelter.custody` | `pink-paw-wallet` (Pink Paw's wallet, since 2026-10-16), `held-by-token-tails` or `held-by-shelter` (old desk files); drives the custody copy |
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

`observe()` stays as is for the old mode. `observeMatchDesk({rpc, desk, now, fetchImpl, dir})` (or the
old `{sponsor, policyHash}`, normalised to a one-sponsor desk) reuses its helpers and returns `obs` with
the old shape **plus** `obs.matchDesk`. It reads **every vault** each round.

### RPC (truth)

- Window: the last `maxGiftAgeHours`, estimated from block times as today. Not earlier than
  `policy.validFrom`.
- ShelterSplit `DisbursementBatch` + `NativeDisbursementBatch` logs on `sponsor.split`.
  `decodeBatch` also returns `logIndex`, `toSheltersRaw` (bigint string) and `decimals`.
  **Gift id = `<txHash lowercase>:<logIndex decimal>`.**
- `RouterDonation` logs on `sponsor.router` (when not null). They map batch tx → donor and path.
- Block timestamps: `eth_getBlockByNumber` for each distinct gift block, cached per round. The index
  timestamp is used when present. **Day = UTC `YYYY-MM-DD` of the block time.**
- Every vault: the existing caps, float, `remainingToday` and `agent` reads, plus `owner()` (selector
  `0x8da5cb5b`, pinned in `lib/abi.mjs`). Refuse to run (exit 2) when a vault's on-chain `split`,
  `agent` or `owner` differs from the desk file, when the vaults do not all report **the same agent**,
  or when they mix native and ERC-20 units.
- Every vault, from its `deployBlock`: `AgentGift` (witness, idempotency), and `Funded` / `Withdrawn`
  (topics `0x5af8184b…a524` / `0x7084f547…05d5`, pinned) for the funded and withdrawn totals.
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
  desk: { schema, vaults, agent },
  sponsors: [{                                     // allocation order (priority desc, id asc)
    id, name, relatedParty, relation, label, priority, paused, policyHash,
    spender: { address, owner, agent, deployBlock },
    caps, capsRaw, budget, pace, floatLow, refundAllowed,   // per vault / per sponsor, shapes as below
    policy: { ratioBps, perGiftMaxMicro, validFromMs },
    flows: { fundedMicro, withdrawnMicro, givenMicro },
    unavailable: null | 'paused in desk.json' | 'not valid before …' | "today's on-chain cap is used up …"
               | 'the vault float is empty' | "the sponsor's budget is used up",
  }],
  // The first sponsor in allocation order, in the v1 fields (a one-sponsor desk reads exactly as v1):
  sponsor: { id, name, relatedParty, label },  // label: "related-party sponsor (founder's company)" | "operator's own money" | "self-sponsor (Token Tails founder)" | "sponsor"
  policyHash,
  chainId, network,                               // 'mainnet' | 'testnet' | 'local'
  caps: { perTxMicro, dailyMicro, remainingTodayMicro, floatMicro, unitDecimals },   // bigint
  budget: { budgetMicro, committedMicro, leftMicro },  // committed = reconciled + sent + live planned (not expired/failed)
  gifts: [{ id, tx, logIndex, block, ts, day, batchId, kind, donor, giftMicro,
            status: 'eligible' | 'matched' | 'pending' | 'flagged' | 'too-old' | 'too-small'
                  | 'excluded-sender' | 'not-allowlisted' | 'router-backend' | 'kind-off' | 'tt-internal' }],
  donorUsedMicro: { "<donor>|<day>": bigint },    // from every vault's receipts (reconciled + sent + live planned): desk-wide
  farmingSignals: [{ donor, day, gifts, totalMicro, reason }],  // > maxGiftsPerDonorDay gifts, or ≥ 3 gifts of exactly minGift
  pace: { from, to, daysLeft, targetPerDayMicro, matchedTodayMicro, status: 'ahead' | 'on' | 'behind' | 'n/a' },
  floatLow: boolean,                               // any sponsor: floatMicro < floatLowUsdc or < perGiftMax
  refundAllowed: boolean,                          // any sponsor: now > refund.after (UTC end of day)
  backend: { payouts: {ok, stale, missing}, donateStatus: {ok, railState, splitMatches}, match: {ok, state} },
  witness: { reconciled: [sha], failed: [sha], expired: [sha], orphans: [{memo, tx, sponsor, spender, acked}], collisions: [sha], imported }
}
```

Budget (`committedMicro`) is per sponsor (its own vault's receipts); gift status and the per-donor room
are desk-wide (every vault's receipts): a gift matched by any vault is `matched` for all of them.

A gift is `matched` when any receipt with status `reconciled` or `sent`, or a `planned` receipt within
`plannedTtlMinutes`, lists its id. It is `pending` while that planned receipt is still live. A
`planned` receipt from a **dry run** blocks its gifts only for other dry runs: a `--fork` or `--send`
round right after a dry run is not held (the same gifts give the same memo, so a printed command the
founder ran by hand is still caught by the witness and the idempotency check).

Never matched (`excluded-sender`): `excludedSenders`, every vault, the agent, every vault owner, the
split, the router, and `shelter.wallet` itself (matching the shelter's own outgoing money would be
circular). A batch whose memo starts with `tt:agent:` or `tt:match:` is `tt-internal` whoever paid
(it may be Token Tails' own agent money from a payer not in `TREAT_AGENT_TT_SENDERS`); a stranger who
writes such a memo only opts out of matching. The old
`tt:agent:match-<8hex>` / `tt:match:<8hex>` prefixes still count as matched (trusted payers only), so
earlier treat-agent matches are never matched again. Receipts also load from
`client/public/match-desk/statement.json` for any of the desk's vaults (v1 `contract.spender` or desk
`sponsors[].vault.spender`), so a lost local state directory cannot reopen published matches.

**Code-only holds (no model call, no API cost):** split paused; donate-status split mismatch; an
unacknowledged orphan; **every** sponsor unavailable (each one's reason is named; a one-sponsor desk
gives the v1 sentence, e.g. "the sponsor's budget is used up"); no eligible gift and
`!refundAllowed && !floatLow`; eligible gifts but none that any vault can pay in full (and no farming
signal, refund or low float to flag). The hold rationale names the reason.

## Decide (A: `decide.mjs`)

Same Messages API call shape as today (model `claude-opus-5-5`, adaptive thinking, effort medium,
`disable_parallel_tool_use`, the fallback beta). Match-desk mode uses its own `SYSTEM_MATCH` and
`TOOLS_MATCH`. The user text keeps the framing `Observation:\n<json>\n\nDecide now: ...`, because
`lib/fake-llm.mjs` parses it.

### Facts the model sees (snake_case, decimal-string USDC)

`sponsor_label` (every sponsor with its label), `per_donor_daily_max_usdc`, `float_low`,
`refund_allowed`, `sponsors` (allocation order: `sponsor_id`, `label`, `priority`, `available`,
`unavailable_because`, `ratio`, `per_gift_max_usdc`, `budget_left_usdc`, `per_tx_cap_usdc`,
`remaining_today_usdc`, `float_usdc`, `float_low`, `pace`, `refund_allowed`), `eligible_gifts` (≤ 20,
newest first: `gift_id`, `donor_short`, `kind`, `gift_usdc`, `donor_room_usdc`, `sponsor_id` (the code's
pick for this gift alone, or null), `match_if_alone_usdc`, `age_minutes`), `farming_signals`, and
`the_rule`. The last one is the allocation rule and the checker formula in one paragraph, so the model
can name the sponsor and compute the amount exactly. A one-sponsor desk also gets the v1 flat fields
(`ratio`, `per_gift_max_usdc`, `budget_left_usdc`, `per_tx_cap_usdc`, `remaining_today_usdc`,
`float_usdc`, `pace`).

### Tools (all `strict: true`, `additionalProperties: false`)

| Tool | Input | Meaning |
|---|---|---|
| `match_gift` | `gift_ids: string[]` (1…10, unique), `amount_usdc: string` (decimal, ≤ 6 dp), `sponsor_id: string` (the shown `sponsor_id`, or `""` to let code pick; a stub or older caller may omit it), `rationale: string` | match these gifts with this exact amount from that sponsor's vault |
| `hold` | `rationale` | nothing this round |
| `flag` | `kind: "farming" \| "pace" \| "float_low"`, `gift_ids: string[]` (may be empty; required non-empty for farming), `rationale` | tell the sponsor; no money moves |
| `propose_refund` | `sponsor_id` (`""` = the first sponsor whose refund is allowed), `rationale` | propose that that vault's owner withdraw its unused float to itself |

Local validation is the same as today: exactly one tool call, an exact key set, types, and a
non-empty rationale (≤ 600 chars). A validation failure becomes a hold with `meta.rejected = true`.

### The amount checker (`lib/checker.mjs`, pure, bigint micro-USDC)

```
allocate(selectedIds, md)   -> { sponsorId, amountMicro, perGift: [{id, matchMicro}], uncappedMicro, clampedBy, skipped } | Reject
expectedMatch(selectedIds, view, { fit }) -> { amountMicro, perGift, uncappedMicro, clampedBy } | Reject
```

`allocate` walks `md.sponsors` in allocation order, skips unavailable sponsors, and runs
`expectedMatch` on that sponsor's view (its ratio, per-gift max, vault caps and budget) with
`fit: true`; the first that fits pays (see "The allocation rule"). A sponsor-independent refusal
(ineligible id, duplicate, donor limit) is returned at once. With `fit: true`, step 4 below clamps only
by `perGiftMax` and `perTx`; then `remainingToday`, `float` and `budget` must each be ≥ the amount,
else that sponsor is skipped (`unfit`). Without `md.sponsors` (a bare view, the checker unit tests) it is
the v1 `expectedMatch`.

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

**Decision rule:** if the model named a `sponsor_id` other than the code's pick → **reject**:
`Checker rejected: model named sponsor X, the allocation rule picks Y for <ids>`, the log gets
`checker: {ok:false, reason:'sponsor mismatch', expectedSponsor, proposedSponsor, expectedMicro,
proposedMicro}`. Then parse the model's `amount_usdc` string exactly (no floats). If it is not equal to
`amountMicro` → **reject**. The round holds with the rationale
`Checker rejected: model proposed X USDC, policy gives Y USDC for <ids>`, the log gets
`checker: {ok:false, expectedMicro, proposedMicro}`, and nothing is sent. The old give path clamps the
amount; the match desk never does.

Other tools:

- **`flag farming`**: each id must be a currently eligible gift. They are written to `flagged.json`
  and excluded until a human deletes the entry.
- **`flag pace` / `flag float_low`**: logged and printed only.
- **`propose_refund`**: allowed only for a sponsor whose `refundAllowed` is true, otherwise rejected. It
  writes `refund-proposal.json` `{at, sponsor, vault, floatUsdc, owner, command, rationale}`. The command is
  `cast send <spender> "withdraw(address)" <owner> --rpc-url <rpc> --account <sponsor-keystore>`. It is
  **never sent by the agent**, even with `--send`: `withdraw` is owner-only, and only the owner (the
  sponsor) can receive the funds.

`lib/fake-llm.mjs` gets a match-desk policy: it matches the newest eligible gift alone with
`match_if_alone_usdc` and the shown `sponsor_id`, holds when there is none, and flags farming when a signal exists. With
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

- `sponsor` is the paying sponsor's id, `spender` its vault, `policySha256` that sponsor's policy hash
  (desk: `deskPolicyHashOf(shared policy, its entry)`; v1: `policyHashOf(policy)`), `ratioBps` its ratio.
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

Every round, before decide, **for every vault** (its own receipts, its own events, its sponsor id):

1. `eth_getLogs` on the vault address, topic `AgentGift`
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
4. A `tt:agent:m:<sponsor.id>:` event on that sponsor's vault with no envelope → `orphan` (reported
   with its sponsor and vault; its gifts are unknown).
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
| RPC | any | `isLocalRpc` only (existing guard) | not local; `eth_chainId` ∈ {5042, 5042002} and equal to the desk's `chainId` |
| signer | none; prints `cast send … --account <keystore>` | `--unlocked --from <agent>` | `cast send … --account <keystore>` run by the founder's own shell; the password prompt goes to the TTY (spawn with `stdio: ['inherit','pipe','inherit']`) |
| extra gates | none | none | `--once` required; refused when the `CLAUDECODE` env var is set (an AI session) and with the offline stub (`TREAT_AGENT_FAKE_LLM=1` or `TREAT_AGENT_FAKE_WRONG=1`); chain 5042 requires `CONFIRM_MAINNET=yes`; `--keystore` (or `TREAT_AGENT_KEYSTORE`) required and must not be `<keystore>` |
| receipt | `mode: dry-run`, `planned` (blocks its gifts for other dry runs for `plannedTtlMinutes`; not for `--fork`/`--send`) | `mode: fork` | `mode: send`; non-zero `cast` exit with no hash → `sent`, `tx.status: unknown` (see the status transitions) |

`give()` runs on the vault the allocation rule picked; the agent key is the same for every vault.

**Idempotency, every mode that sends.** Right before the send, re-read the chosen vault's `AgentGift`
logs from its `deployBlock` for the planned memo. (Across vaults, a gift is never re-planned at all:
every vault's receipts mark it `matched`.) If one exists with the same amount, mark the receipt
`skipped-duplicate` (and reconcile it), and do not send. With a different amount it becomes
`mismatch`, and the round exits 1 without sending.

Exact command:
`cast send <spender> "give(uint256,string)" <amountRaw> <memo> --rpc-url <rpc> --account <keystore> --json`.
The printed form shows `"$TREAT_AGENT_RPC"` when the RPC URL carries a path or key (existing
`isPlainRpc`).

**`--demo-overcap [--vault <sponsorId>] [--overcap-kind auto|tx|day] [--mined-revert]`**: the model is
**not** called. It targets one vault (`--vault`, default the first in allocation order; an unknown id
exits 2; `--vault` without `--demo-overcap` exits 2). Code builds the decision with the memo
`tt:agent:m:<id>:demo-overcap` from that vault's caps:

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
node run.mjs --sponsor <desk.json|sponsor.json> [--rpc <url>] [--once] [--interval <s>]
             [--fork | --send] [--keystore <name>]
             [--demo-overcap [--vault <sponsorId>] [--overcap-kind auto|tx|day] [--mined-revert]]
             [--witness-only] [--release <sha256 prefix>] [--ack-orphan <tx hash>]
```

`--desk <file>` is an alias of `--sponsor <file>`.

`--release` runs alone (a dry-run round that only clears one unknown `sent` receipt; see the status
transitions). `--ack-orphan` runs alone too (it acknowledges one orphan the witness found this round).
A `--fork` tx is printed as "local fork tx, not on any explorer"; only `--send` prints an explorer link.

Env: the existing treat-agent variables, plus `MATCH_DESK_DIR`, `MATCH_DESK_API`,
`MATCH_DESK_CALL_GAP_MS`, `CONFIRM_MAINNET`, `TREAT_AGENT_FAKE_WRONG`.

`log.mjs`: each decisions.jsonl line gains
`matchDesk: { sponsor, vault, policyHash, receiptSha256, memo, checker, flag, witness: {reconciled, failed, orphans} }`
(`sponsor`, `vault` and `policyHash` are the paying sponsor's for a match or a demo, else the first sponsor's).
The RPC URL is still never written.

## Statement (C: `statement.mjs`, `lib/statement-html.mjs`)

```
node statement.mjs --sponsor <desk.json|sponsor.json> [--receipts <dir>] [--out ../../client/public/match-desk]
                   [--now <ISO>] [--rpc <url> --verify-onchain]
```

- Input: every `receipts/*.json` envelope for this chain and **any of the desk's vaults**, with `mode`
  in `send` or `fork` (a dry-run receipt only once reconciled). Without `--receipts`, it reads the desk
  directory and every earlier layout of the same vaults (see "State directory"). A receipt whose
  `sponsor` is not the sponsor of its `spender` vault is excluded (`sponsor mismatch`).
  A fork run writes only to a `--out` the caller names. `client/public/match-desk` takes Arc mainnet
  (5042) only: it refuses `mode: fork`, chain 31337 and Arc testnet (5042002). Each envelope's `sha256` is re-verified against `canonical(body)`;
  an envelope that fails is **excluded** and listed in `excluded[]` with its reason.
- `--verify-onchain` (read-only RPC) re-reads every vault's `AgentGift` by memo, and counts as
  reconciled only those events whose vault, tx and amount match. It also reads each vault's `Funded` and
  `Withdrawn` logs and `floatBalance()`, which give the "funded" and "float left" figures; without it
  they are `null` and the page shows "–". `match-desk.sh statement` passes it (with `--rpc`, from
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
  "type": "tt.match-desk.statement", "v": 2, "generatedAt": "ISO|null",
  "chain": { "id": 5042, "name": "Arc", "explorer": "https://explorer.arc.io" },
  "sponsors": [{                                   // allocation order
    "id": "motored", "name": "Motored.lt", "relatedParty": true, "priority": 20,
    "label": "related-party sponsor (founder's company)",
    "vault": { "spender": "0x…|null", "owner": "0x…|null", "deployBlock": 0 },
    "policy": { "ratio": "1:1", "perGiftMaxUsdc": "0.05", "budgetUsdc": "1.00", "policySha256": "…" },
    "totals": { "reconciledUsdc": "0", "pendingUsdc": "0", "receipts": 0, "giftsMatched": 0, "donors": 0, "giftsMatchedUsdc": "0" },
    "onchain": null | { "fundedUsdc": "1", "withdrawnUsdc": "0", "givenUsdc": "0.03", "floatLeftUsdc": "0.97" }
  }],
  "shelter": { "name": "…", "wallet": "0x…", "custody": "held-by-token-tails" },
  "contract": { "split": "0x…", "agent": "0x…|null" },
  "policy": { "perDonorDailyMaxUsdc": "0.05", "allocation": "highest priority first, then lowest id; one vault per match" },
  "totals": { "reconciledUsdc": "0", "paidToShelterUsdc": "0", "pendingUsdc": "0", "receipts": 0, "giftsMatched": 0,
              "donors": 0, "giftsMatchedUsdc": "0", "fundedUsdc": "…|null", "floatLeftUsdc": "…|null" },
  "days": [{ "day": "2026-10-15", "reconciledUsdc": "0.05", "receipts": 1 }],
  "receipts": [ "<envelopes, newest first; decision.observationHash kept, nothing else removed>" ],
  "excluded": [{ "sha256": "…", "reason": "hash mismatch" }],
  "verifiedOnchain": false,
  "disclosures": [ "…one sponsor line per sponsor, then the honest-copy sentences…" ],
  "notTaxReceipt": true
}
```

The totals count only `reconciled` receipts. `sent` and live `planned` receipts count as pending.
`failed`, `expired`, `skipped-duplicate` and `mismatch` receipts are listed but never counted.
`paidToShelterUsdc` is the desk's reconciled total: every match goes through ShelterSplit to the shelter
wallet. `fundedUsdc` / `floatLeftUsdc` are summed over the vaults only when every deployed vault was read
on-chain. A v1 sponsor.json gives the same shape with one sponsor (and the eight v1 disclosures).

The page: the desk lead sentence, "Read this first" (every disclosure), the desk total ("Paid to the
shelter wallet (reconciled matches)", funded, float left, pending, receipts, gifts, donors), one card per
sponsor (label, funded by the company, matched, float left, pending, its vault and owner links, ratio,
per-match max, budget, priority, policy hash; "Not deployed yet" while it has no vault), shared rules and
wallets (per-donor limit across all sponsors, the agent, ShelterSplit, the shelter wallet and its
custody), by day, receipts (each says which company's vault paid), excluded.

**Placeholder (committed now):** `client/public/match-desk/index.html` and `statement.json` are the
generator's output for `desk.example.json` with zero receipts. The page shows "Not deployed yet. No
matches." until a vault address exists, all the disclosures, and no invented numbers. The lead sentence
is in the present tense ("match public gifts") only once at least one receipt is reconciled; before that
it says the sponsors "will match" them (once their match vaults are deployed and funded, when there is
no vault yet). It is served at `tokentails.com/match-desk/index.html`; `/match-desk` and `/match-desk/` redirect there (`client/next.config.js`).

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
Every subcommand takes a desk.json (or a v1 sponsor.json, where `--sponsor` is optional).

| Subcommand | Does |
|---|---|
| `init <testnet\|mainnet>` | copies `desk.example.json` to `desk.arc-testnet.json` / `desk.arc.json`, with `chainId`, `router` and `eligible.chains` set |
| `deploy <desk.json> --sponsor <id> --account <deployer> [--owner <companyAddr>] [--agent <agentAddr>]` | `forge script script/DeployCappedSpender.s.sol` with `EXPECTED_CHAIN_ID`, `CAPPED_NATIVE=1`, `CAPPED_SPLIT`, caps 5e16 / 2e17 (the script's decimals floor guard applies); the simulation first, then `--broadcast` after a y/N prompt; mainnet needs `CONFIRM_MAINNET=yes`. `--owner` defaults to that sponsor's `spender.owner`, `--agent` to the desk's `agent`; a different `--agent` than the desk's is refused (one agent for every vault), and a sponsor that already has a vault needs `--force`. Writes the vault address, block and owner into that sponsor and the agent into the desk. The old `deploy <testnet\|mainnet> --owner … --agent …` form still prints the JSON for a v1 file |
| `check <desk.json> [--sponsor <id>]` | read-only, every vault (or one): `native()`, `perTxCap()`, `dailyCap()`, `split()`, `agent()`, `owner()`, `floatBalance()`, `remainingToday()`; exits 1 unless native = true, caps = 5e16 / 2e17, the addresses match the file, and (desk) every vault reports the same agent and no vault is listed twice |
| `fund <desk.json> --sponsor <id> --account <that company's owner keystore> --usdc <n>` | `cast send <vault> --value <n>ether` (native 18 dec, so `1ether` = 1 USDC) from the owner; a y/N prompt; `--sponsor` is required on a desk with several sponsors |
| `gas <desk.json> --account <funder> --usdc 0.05` | sends Arc gas (USDC) to the desk's agent EOA |
| `verify <desk.json> [--sponsor <id>]` | prints one Sourcify `forge verify-contract … --verifier sourcify --constructor-args $(cast abi-encode "constructor(address,address,address,uint256,uint256,bool)" …)` command per vault (the same flow as the routers; the command form is unverified on Arc until it is run on testnet) |
| `round <desk.json> [run.mjs flags]` | `node run.mjs --sponsor … --once …` (pass `--demo-overcap --vault <id>` through) |
| `statement <desk.json>` | `node statement.mjs --sponsor … --out ../../client/public/match-desk` (Arc mainnet: `--verify-onchain` by default) |

**B4. `fork-demo.sh --match-desk [transcript]`** (the old demo stays the default). On an anvil fork,
`MATCH_DESK_API=off`:

1. Deploy **two** CappedSpenders through `script/DeployCappedSpender.s.sol` (`forge script --broadcast
   --unlocked --sender <dev #0>`, the same script as `match-desk.sh deploy`): vault A owned by Motored.lt's real
   owner `0xFe7D5aA030d14213Bf1684d4c28FE7f32A4Dbc8d` (impersonated on the fork with `anvil_impersonateAccount`, no key; override with
   `MOTORED_OWNER`), vault B owned by dev #4 (Token Tails), the **same agent** dev #1, caps 5e16 / 2e17.
2. Each owner funds its vault with 1 USDC. Write `$LOG_DIR/desk.fork.json` (chainId from the fork,
   `excludedSenders` from `desk.example.json` (only skipped, never paid), `validFrom` = now − 1 h;
   Motored.lt priority 20 with a 0.03 budget and per-gift max, Token Tails priority 10 with 1.00).
   `FORK_URL` and `FORK_CHAIN_ID` pick the upstream and the fork's chain id: a rehearsal on Arc
   mainnet state is `FORK_URL=https://rpc.mainnet.arc.io FORK_CHAIN_ID=5042002` (run.mjs refuses
   `--fork` with chainId 5042, and native-mode deploys need an Arc chain id, so not 31337).
3. `match-desk.sh check` over both vaults (one agent). Fan gifts: dev #2 gives 0.02, then dev #6 gives
   0.03; later dev #5 gives six 0.01 gifts (a farming signal).
4. Run:
   - `--fork --once`: the 0.03 gift is matched from **Motored.lt's** vault (receipt, log names the vault);
   - `--witness-only` (reconciled);
   - with `TREAT_AGENT_FAKE_WRONG=1`, a checker rejection (no receipt);
   - `--fork --once`: Motored.lt's budget is used up, so the 0.02 gift is matched from **Token Tails'**
     vault; `--witness-only` (one receipt reconciled per vault);
   - an idempotent rerun: `--fork --once` holds, still two receipts (no gift matched twice);
   - the farming flag (`flagged.json`, no receipt);
   - Token Tails' day spent to the cap, then `--demo-overcap --vault tokentails --overcap-kind day`
     (`OverDailyCap(0.25, 0.2)`), then `--demo-overcap --vault motored --overcap-kind tx`
     (`OverTxCap(0.1, 0.05)`);
   - `statement.mjs --out $LOG_DIR/statement --rpc <fork> --verify-onchain` (never into
     `client/public`): 0.05 paid to the shelter wallet, 0.03 from Motored.lt and 0.02 from Token Tails,
     each vault funded 1 and its float read back;
   - Pink Paw's balance before and after (fans + matches + fill).
5. Exit non-zero if any expectation fails, so it doubles as an end-to-end test.

**B5. README sections**: `agents/treat-agent/README.md` gets a "Sponsor Match Desk" section (the
loop, the honest-copy list, the CLI, the runbook pointer to `match-desk.sh`). The
`contracts/shelter-split/README.md` CappedSpender section gets the floor guard and the 18-decimal cap
values.

## Runbook: testnet first (founder's terminal only)

AI sessions never run steps marked ✍. Nothing is sent to a public network from an AI session.

1. Keystores: a new `tt-match-agent` EOA (not the x402 agent or the treat hot wallet), plus one owner
   keystore per company: `motored` (Motored.lt's wallet `0xFe7D5aA030d14213Bf1684d4c28FE7f32A4Dbc8d`, created by Token Tails for
   the founder's company) and `tt-sponsor-owner` (the Token
   Tails address the founder picks; the treasury `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A` is an
   option; never the hot, treat or agent wallets).
2. ✍ `./match-desk.sh init testnet`, then deploy vault A and vault B with the same agent:
   `./match-desk.sh deploy desk.arc-testnet.json --sponsor motored --account <deployer> --owner <motored
   addr, already in the example> --agent <tt-match-agent addr>` and `... --sponsor tokentails --owner <tt-sponsor-owner addr>` (the
   agent is now in the file). Each deploy writes its vault into the desk file.
3. `./match-desk.sh check desk.arc-testnet.json`. Every vault must print native = true, perTxCap
   50000000000000000, dailyCap 200000000000000000, and the desk line "one agent". This settles the
   "native decimals" open question before any money moves.
4. ✍ `fund … --sponsor motored --account motored --usdc 1` and `fund … --sponsor tokentails
   --account tt-sponsor-owner --usdc 1` (testnet USDC from the faucet), then ✍ `gas … --usdc 0.05`.
5. A test fan gift from another testnet wallet:
   ✍ `cast send 0x457c89e1… "donate(string)" "fan gift" --value 0.02ether --account <fan>`.
6. `node run.mjs --sponsor desk.arc-testnet.json --once` (a dry run: it prints the command, the vault
   code picked, and a planned receipt; optional).
7. ✍ `unset TREAT_AGENT_FAKE_LLM TREAT_AGENT_FAKE_WRONG`, then `node run.mjs --sponsor desk.arc-testnet.json
   --once --send --keystore tt-match-agent`, then `--witness-only` → `reconciled`. To get one round per
   vault, give a second gift after Motored.lt's vault is unavailable for it (or set
   `"paused": true` on motored for one round). Run either the printed command or `--send`, not both.
   If `cast` exits without a tx hash, the receipt stays `sent` (unknown); run `--witness-only` later, and
   only if the agent's address shows no such tx on the explorer, `--release <sha256>`.
8. ✍ `--demo-overcap --vault <id> --send` (simulation), and optionally `--mined-revert`.
9. `node statement.mjs --sponsor desk.arc-testnet.json --out /tmp/md-test --rpc https://rpc.testnet.arc.io
   --verify-onchain` and open the page; check both sponsor sections, the disclosures and the hash buttons.
10. Mainnet: repeat 2–8 with `mainnet` and `CONFIRM_MAINNET=yes`, ✍ `verify` (Sourcify, one command per
    vault), each company funds its own vault, then `statement` into `client/public/match-desk/` and
    commit.

Cost: about 1 USDC of float per vault plus 0.05 USDC of agent gas per chain. Deploy gas is read from the
testnet receipt. Unused float can only be withdrawn by each vault's owner, to itself.

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
  - desk (`test/desk.test.mjs`): v1 normalisation, desk validation and policy hashes, allocation
    (priority, budget / float / daily cap exhausted → next sponsor, paused, validFrom, none available →
    hold), the sponsor-mismatch refusal, cross-vault idempotency (including a v1 state dir), the
    per-donor limit across sponsors, different agents refused, `--vault`, `propose_refund` per sponsor,
    the statement per sponsor;
  - all existing tests unchanged (except the state-dir path and the orphan fields they assert).
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
- `agents/treat-agent/sponsor.example.json`, `agents/treat-agent/desk.example.json`
- `agents/treat-agent/lib/abi.mjs`, `lib/fake-llm.mjs`, `lib/policy.mjs`, `lib/checker.mjs`,
  `lib/receipt.mjs`, `lib/witness.mjs`, `lib/backend.mjs`
- `agents/treat-agent/test-support/helpers.mjs`
- `agents/treat-agent/test/act-observe.test.mjs`, `test/decide.test.mjs` (only to stay green),
  `test/policy.test.mjs`, `test/checker.test.mjs`, `test/receipt.test.mjs`, `test/witness.test.mjs`,
  `test/backend.test.mjs`, `test/match-desk.test.mjs`, `test/send.test.mjs`, `test/desk.test.mjs`
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

C re-implements the receipt hash check with `canonical()` and `node:crypto` (a statement can be
checked without the agent's receipt code). Since the multi-sponsor desk, C imports only pure helpers
from A: the labels and `deskPolicyHashOf` from `lib/policy.mjs`, and `deskStateDir` / `siblingDirs`
from `lib/receipt.mjs`, so the agent and the page agree on labels, policy hashes and where receipts
live. B depends only on the CLI and file names fixed above.
