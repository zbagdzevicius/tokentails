# Treat agent

An AI agent that decides small gifts from **Token Tails' own** treat float to an animal shelter, with
the limits enforced by a smart contract instead of by the prompt.

- **Claude decides** whether to give and how much: match a fresh public gift 1:1, or keep the campaign
  on pace, or hold. It explains every decision in plain words.
- **CappedSpender enforces** the limits on-chain
  (`../../contracts/shelter-split/src/CappedSpender.sol`). Whatever the model proposes, the contract refuses
  anything over the per-gift cap, over the per-day cap, to anyone but ShelterSplit, while the split is
  paused, or when any part would reach the split's treasury.
- **Token Tails gives.** The float is Token Tails' own money. The contract is not a donation address:
  native coin is accepted only from the owner, and its address is never shown as a place to give
  (ERC-20 transfers cannot be blocked, so a mistaken token transfer would join the float). Public
  donations go donor → ShelterSplit → the shelter wallets registered on the split, or donor → shelter
  wallet. Until the Pink Paw handover, Token Tails still holds the shelter wallet's key, and every
  public page says so.

```
            observe.mjs                   decide.mjs                  act.mjs               chain
 ShelterSplit logs (24 h) ─┐                                                                       
 DonateRouter logs (opt.) ─┤   observation   Claude Messages API    give(amount, memo)    CappedSpender
 CappedSpender caps/float ─┼──────────────▶  tools: give_treat |  ──────────────────▶  ├ OverTxCap
 campaign.json goal        ┤   (JSON)        hold, strict schema   cast send            ├ OverDailyCap
 needs.example.json (demo) ┘                 + local validation    (dry run by default) ├ TreasuryShare
                                                                                        ├ SplitPaused
                                                  log.mjs: runs/decisions.jsonl         └ split.donate / disburse
                                                  (obs hash, decision, why, tx | revert)    → shelter wallet
```

Not the x402 path. The backend sells a cat card to any paying agent at `GET /shelter/agent/cat-card`
(x402, on by default; `SHELTER_X402_ENABLED=false` turns it off). On a mainnet it opens per chain only
after the shelter's signed wallet claim and the on-chain rotation to that wallet. The `agent` wallet in `backend/src/shelter/onchain/wallet.config.ts`
is that x402 demo payer, topped up by `fund a:distribute`; it is not the CappedSpender agent here.

## The contract-level limit

`CappedSpender(split, agent, owner, perTxCap, dailyCap, native)`:

| Rule | Where | Revert |
|---|---|---|
| only the agent address may give | `give` | `NotAgent` |
| at most `perTxCap` per gift | `give` | `OverTxCap(amount, cap)` |
| at most `dailyCap` per UTC calendar day (`block.timestamp / 1 days`; resets 00:00 UTC, so up to 2 × `dailyCap` can go out across midnight; not a rolling 24 h) | `give` | `OverDailyCap(spentToday + amount, cap)` |
| every unit reaches a shelter (`split.preview(amount)` sends 0 to the treasury) | `give` | `TreasuryShare(toTreasury)` |
| not while the split is paused | `give` | `SplitPaused` |
| memo starts with `tt:agent:` (at most 256 bytes) | `give` | `BadMemo` |
| the float covers the gift | `give` | `InsufficientFloat` |
| the money can only go to ShelterSplit | no other call path exists | – |
| native float only from the owner | `receive` | `NotOwner` / `NativeOnly` (ERC-20 mode) |

The float can only be withdrawn by its owner (Token Tails), to the owner's own address. That is an
access rule, not a safety property: ownership can be handed on in two steps, and a new owner withdraws
to itself. **The owner cannot raise the caps, change the agent, change the split or change the mode**:
all are `immutable`; changing any of them needs a new deployment. Native mode (Arc, where the native
coin is USDC with 18 decimals) gives through `split.donate`; ERC-20 mode approves exactly the amount,
calls `split.disburse` and resets the allowance to 0. Every gift emits
`AgentGift(batchId, amount, memo, spentToday)` next to ShelterSplit's own batch event.

Known limits (documented, not bugs): tokens other than the mode's asset have no sweep and stay stuck;
a shelter wallet that is a contract and sends coin back to the spender during a payout makes every
`give` revert (the exact-balance check fails), so the split owner registers only wallets it trusts;
rounding dust on a multi-shelter split triggers `TreasuryShare`, which `run.mjs` pre-checks with
`split.preview(amount)` and turns into a hold.

Forge suite: `../../contracts/shelter-split/test/CappedSpender.t.sol` (26 tests: both modes, caps, the day
rollover, a fuzzed "never more than the daily cap", non-agent, treasury guard including rounding dust
and an inactive shelter, pause, memo rules, native funding only from the owner, withdraw only to the
owner, two-step ownership, and the deploy script's guards).

## The agent

| File | Does |
|---|---|
| `observe.mjs` | JSON-RPC reads only: spender caps, today's remaining budget and float; ShelterSplit `DisbursementBatch` + `NativeDisbursementBatch` logs for the last 24 h (block range halves automatically when a provider limits it); `RouterDonation` logs when `TREAT_AGENT_ROUTER` is set; the campaign goal from `client/public/shelter-payouts/campaign.json` (read-only) and its end date from the facts registry; the needs list. Memos sort the money: `tt:agent:` / `tt:match:` / other `tt:` are Token Tails' own **only when the payer is trusted** (the spender, or an address in `TREAT_AGENT_TT_SENDERS`); a `tt:` memo from anyone else is public money, and so are `x402:<nonce>` memos (agents paying for a cat card). A public gift counts as matched once a trusted payer's `tt:agent:match-<8 hex>` or `tt:match:<8 hex>` memo names its tx. **DonateRouter gifts are left to the backend's `ShelterMatchService`** (`SHELTER_MATCH_ENABLED`); `TREAT_AGENT_MATCH_ROUTER=1` lets the agent match them instead. Run only one matcher for router gifts, or one gift is matched twice. Native mode is refused off Arc (5042, 5042002) and plain local anvil (31337): elsewhere the native coin is not USDC. |
| `decide.mjs` | One Messages API call (`claude-opus-5-5`, adaptive thinking, effort medium, server-side refusal fallback `fallbacks: "default"`), two strict tools: `give_treat {amount_usdc, memo_suffix, rationale}` and `hold {rationale}`. Then strict local validation: exactly one tool call, exact key set, types, memo suffix `[a-z0-9-]{1,40}`, non-empty rationale. Over-cap amounts are **clamped** to min(remaining today, per-gift cap, float), except in `--demo-overcap` (bounded to 10 per-gift caps). A non-2xx API response is an API error, not a decision: `run.mjs --once` exits 3. `TREAT_AGENT_NO_FALLBACK=1` drops the fallback beta and field. |
| `act.mjs` | Builds `cast send <spender> "give(uint256,string)" <raw> tt:agent:<suffix> --rpc-url <rpc> --account <keystore>`. Default: **print only** (dry run). `--fork`: sends to a local anvil fork with `--unlocked --from <agent>`; it refuses any non-localhost RPC. Reverts are decoded to the contract's error names. |
| `log.mjs` | Appends one JSON line per round to `runs/decisions.jsonl` (gitignored; `TREAT_AGENT_LOG_DIR` overrides): sha256 of the observation, decision, rationale, tx hash or revert. The RPC URL is never written. |
| `run.mjs` | CLI: `node run.mjs --rpc <url> --spender <addr> [--fork] [--demo-overcap] [--once] [--interval <s>] [--keystore <name>] [--router <addr>]`. Before a give it calls `split.preview(amount)` and holds if any dust would reach the treasury. Refusals print in USDC (`OverTxCap(0.1, 0.05) USDC`). |
| `lib/fake-llm.mjs` | `TREAT_AGENT_FAKE_LLM=1`: an offline stub that answers in the Messages API's tool-call shape, so the whole validate path still runs. For tests and the fork demo without an API key. |
| `needs.example.json` | A **demo** needs list (`"demo": true`). It is not Pink Paw's real list and is never presented as such; replace it only with a list the shelter confirmed (`TREAT_AGENT_NEEDS`). |

Env: `ANTHROPIC_API_KEY`, `TREAT_AGENT_RPC` (instead of `--rpc`; printed commands then show
`"$TREAT_AGENT_RPC"`), `TREAT_AGENT_KEYSTORE`, `TREAT_AGENT_ROUTER`, `TREAT_AGENT_NEEDS`,
`TREAT_AGENT_LOG_DIR`, `TREAT_AGENT_LOG_CHUNK`, `TREAT_AGENT_MODEL`, `TREAT_AGENT_CAMPAIGN_END`,
`TREAT_AGENT_TT_SENDERS` (comma-separated backend treat and match hot wallets whose `tt:` memos are
trusted), `TREAT_AGENT_MATCH_ROUTER=1` (the agent matches router gifts; turn the backend matcher off
first), `TREAT_AGENT_NO_FALLBACK=1`. When `--rpc` carries a path or key, printed commands show
`"$TREAT_AGENT_RPC"`: export it before running them.

## Demo: the over-cap refusal (local, no real money)

```bash
./fork-demo.sh /tmp/agent-demo.txt     # needs Foundry; uses Claude if ANTHROPIC_API_KEY is set
```

It forks Arc testnet on `127.0.0.1:8548`, deploys CappedSpender with anvil's public dev accounts
(split = the live testnet ShelterSplit, agent = dev #1, caps 0.05 / 0.10 test USDC), funds 1 test USDC,
lets dev #2 give a 0.02 "fan gift", then:

1. `run.mjs --fork --once`: the agent matches the fan's gift 1:1, Pink Paw's balance rises.
2. `run.mjs --fork --demo-overcap`: the agent is told to propose twice the per-gift cap; validation
   lets it through on purpose, the contract reverts and the screen shows `OverTxCap(0.1, 0.05) USDC`, the balance
   does not move, the log records the revert.
3. a dry run prints the exact command the founder would sign with `--account`.

The demo caps are fork parameters for the video, not a public claim.

## Going live (founder only)

0. Before recording with Claude: one `node run.mjs --spender <addr> --once` with a real
   `ANTHROPIC_API_KEY` on the fork; check the log's `meta.model` and a `tool_use` decision. Exit code
   3 means the API call failed (try `TREAT_AGENT_NO_FALLBACK=1`).
1. Deploy: `cd ../../contracts/shelter-split && CAPPED_SPLIT=… CAPPED_AGENT=… CAPPED_OWNER=… CAPPED_PER_TX=… CAPPED_DAILY=… CAPPED_NATIVE=1 EXPECTED_CHAIN_ID=5042002 forge script script/DeployCappedSpender.s.sol --rpc-url "$RPC_ARC_TESTNET" --broadcast --account <keystore>`.
   `EXPECTED_CHAIN_ID` is required; native mode reverts off Arc; a per-gift cap above 1 USDC in the
   mode's units (`CAPPED_MAX_PER_TX` overrides) reverts, which catches an 18-decimal number in
   ERC-20 mode; the script logs both caps in micro-USDC before broadcasting.
2. Fund the float from the owner address (plain transfer in native mode; other senders are refused).
3. Run `node run.mjs --spender <addr> --once` with `TREAT_AGENT_RPC` set: it prints the `cast send`
   command; the founder runs it with the agent's keystore. Nothing here holds or reads a key.
4. On a mainnet the agent only gives to the shelter's own wallet: the split must list a wallet the
   shelter holds (Pink Paw handover) before this is described as live.

## Tests

`npm test` (node --test, no dependencies): decide with a stubbed fetch (valid give, hold, malformed
output rejected, two calls / refusal / max_tokens, over-cap clamped unless demo), act dry-run command
shape and fork guards, revert decoding, observe against a stubbed RPC (memo classes, matching,
window, range halving), and one full round writing the JSONL log.
