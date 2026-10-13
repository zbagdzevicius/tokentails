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

## Sponsor Match Desk

A sponsor puts USDC into a `CappedSpender` vault on Arc, and the agent matches fresh public gifts to
Pink Paw's ShelterSplit from it, under a written policy. Full spec: [`MATCH-DESK.md`](MATCH-DESK.md).
`run.mjs --sponsor <file>` runs the match desk; without `--sponsor`, the treat agent above runs
unchanged.

Each round:

1. **observe**: fresh public gifts on ShelterSplit (its batch events over RPC are the truth: the donor
   exists only there), the vault's caps and float, and three public read endpoints
   (`/shelter/payouts`, `/shelter/donate/status`, `/shelter/match/status`; fail-soft,
   `MATCH_DESK_API=off` skips them). Simple holds (split paused, nothing left today, no float, no
   budget) skip the model call.
2. **decide**: Claude calls one tool: `match_gift`, `hold`, `flag` (farming, pace, float low) or
   `propose_refund`.
3. **check**: code recomputes the match from `sponsor.json` (ratio, per-gift and per-donor-day limits,
   on-chain caps, float, budget; integer micro-USDC) and **rejects** a proposal that differs by even
   0.000001 USDC. It never quietly corrects it.
4. **act**: `CappedSpender.give(amount, memo)` with the memo `tt:agent:m:<sponsor>:<hash8>`. A dry run
   prints the command, `--fork` sends to a local anvil fork, `--send` runs `cast send --account` from
   the founder's own terminal.
5. **receipt**: a JSON receipt is written before the send. Its sha256 is in the memo, so the same gifts
   always give the same memo and a repeated send is skipped.
6. **witness**: the next round reads the `AgentGift` event back and marks the receipt `reconciled`.
7. **statement**: `statement.mjs` builds `statement.json` and a self-contained `index.html` (with a
   "Verify hash" button per receipt) from the reconciled receipts.

### What every public text says

- Motored.lt is a **related-party sponsor (founder's company)**, never an outside or independent
  sponsor. If no company funds the vault, the label is "self-sponsor (Token Tails founder)".
- Pink Paw's wallet is still held by Token Tails until the handover. Matched money reaches that
  wallet; Pink Paw does not control it yet.
- The contract caps each gift and each UTC calendar day. The day resets at 00:00 UTC, so up to 2× the
  daily cap can go out across midnight.
- The agent's code enforces the per-donor limit. The contract does not.
- The statement is not a tax receipt.
- We use USDC on Arc (Arc's native coin). We do not use Circle Wallets, Paymaster or Gateway.
- Claude proposes. Code recomputes the amount and refuses a proposal that differs. The contract has
  the last word.
- A match counts only once its `AgentGift` event has been read back from the chain (`reconciled`).

### CLI

```
node run.mjs --sponsor <file> [--rpc <url>] [--once] [--interval <s>]
             [--fork | --send] [--keystore <name>]
             [--demo-overcap [--overcap-kind auto|tx|day] [--mined-revert]]
             [--witness-only] [--release <sha256 prefix>] [--ack-orphan <tx hash>]
node statement.mjs --sponsor <file> [--receipts <dir>] [--out <dir>] [--now <ISO>] [--rpc <url> --verify-onchain]
```

`--send` works only on Arc (5042 or 5042002) with `--once` and a named keystore, refuses inside an AI
session (`CLAUDECODE` set), and needs `CONFIRM_MAINNET=yes` on 5042. `--demo-overcap` never calls the
model: on a fresh day it asks for 2 × the per-gift cap and expects `OverTxCap`; once less than one
gift's cap is left today it asks for one cap and expects `OverDailyCap`. On a live chain it is a
`cast call` simulation unless `--mined-revert` sends a failing transaction (`--gas-limit 300000`) that
shows on the explorer. Exit codes: 0 ok (holds and expected refusals included), 1 unexpected revert or
mismatch, 2 usage, policy or guard refusal, 3 Messages API error, 4 the over-cap demo did not refuse
as expected. `--mined-revert` is `tx` only (a mined `day` demo would be a real give that only the
daily cap stops). A dry-run receipt holds its gifts only for other dry runs, so `--send` right after a
dry run is not held. If `cast` exits without a tx hash in `--send` mode, the receipt stays `sent`
(outcome unknown) and blocks its gifts until the witness sees its memo; after checking the agent's
address on the explorer, `--release <sha256>` clears it. A `--send` receipt left `planned` (the process
was killed while `cast` ran) is treated the same way. An `AgentGift` with this sponsor's memo and no
local receipt (an orphan: state dir lost, or a round run from another checkout) holds every match until
you run from the right `MATCH_DESK_DIR` or acknowledge it with `--ack-orphan <tx hash>`. A `--fork` tx is
printed without an explorer link: it exists only on the local anvil. Gifts from `shelter.wallet` and any batch
with a `tt:agent:`/`tt:match:` memo are never matched. Env: `MATCH_DESK_DIR` (state, default `runs/match-desk/`), `MATCH_DESK_API`,
`MATCH_DESK_CALL_GAP_MS`, `CONFIRM_MAINNET`, `TREAT_AGENT_FAKE_WRONG`.

### Runbook: `match-desk.sh` (testnet first, founder's terminal)

| Step | Command |
|---|---|
| policy file | `./match-desk.sh init testnet` (writes `sponsor.arc-testnet.json`; `mainnet` writes `sponsor.arc.json`) |
| deploy | `./match-desk.sh deploy testnet --account <deployer> --owner <sponsor> --agent <tt-match-agent>`: simulation, a y/N prompt, then `--broadcast`; prints the address and block to paste into the file |
| read back | `./match-desk.sh check sponsor.arc-testnet.json`: read-only; fails unless `native()` is true, `perTxCap()` is 50000000000000000 (0.05 USDC), `dailyCap()` is 200000000000000000 (0.20 USDC) and split, agent and owner match the file. Run it before any money moves. |
| float | `./match-desk.sh fund sponsor.arc-testnet.json --account <owner> --usdc 1` (only the owner can fund) |
| agent gas | `./match-desk.sh gas sponsor.arc-testnet.json --account <funder> --usdc 0.05` |
| source | `./match-desk.sh verify sponsor.arc-testnet.json` prints the Sourcify command (not yet tried on Arc for CappedSpender) |
| a round | `./match-desk.sh round sponsor.arc-testnet.json` (dry run, optional), then `... round sponsor.arc-testnet.json --send --keystore tt-match-agent` (the dry-run receipt does not hold it; run the printed command or `--send`, not both), then `... --witness-only` |
| statement | `./match-desk.sh statement sponsor.arc.json` writes `client/public/match-desk/`, re-checking every receipt against Arc mainnet by default (`--verify-onchain`, read-only; `--no-verify-onchain` opts out and the page then says the totals were not re-checked); `statement.mjs` refuses any chain but Arc mainnet (5042) there, so a testnet statement needs `node statement.mjs --sponsor sponsor.arc-testnet.json --out <dir>` |

Native USDC on Arc has 18 decimals, so the caps are 18-decimal numbers. `CAPPED_PER_TX=50000` would be
5×10⁻¹⁴ USDC; the deploy script refuses it (`PerTxBelowFloor`). The script never reads or prints a
key: every signing step is `forge`/`cast` with `--account`, and `deploy`, `fund`, `gas` and
`round --send` refuse inside an AI session and need `CONFIRM_MAINNET=yes` on Arc mainnet. Cost: about
1 USDC of float plus 0.05 USDC of agent gas per chain; unused float can only be withdrawn to the owner
(the sponsor), by the owner.

### Demo: the match desk on a local fork

```bash
./fork-demo.sh --match-desk /tmp/match-desk-demo.txt
```

On an anvil fork of Arc testnet (`MATCH_DESK_API=off`; anvil's public dev accounts, owner = dev #3 as
the sponsor, agent = dev #1, caps 0.05 / 0.20 test USDC, 1 test USDC float): two fan gifts, a match
and its receipt, the witness reconciling it, a checker rejection (`TREAT_AGENT_FAKE_WRONG=1`), the
next match, a farming flag on six 0.01 gifts, the day spent to the cap, then both over-cap refusals
(`OverDailyCap(0.25, 0.2)` and `OverTxCap(0.1, 0.05)`), a statement into the demo folder (never
`client/public`) and Pink Paw's balance before and after. Every step is checked; the script exits 1 if
any expectation fails, so it doubles as an end-to-end test. It deploys through
`script/DeployCappedSpender.s.sol` (the same script as `match-desk.sh deploy`), so a broken deploy
script fails the demo too, and its sponsor file keeps the example's `excludedSenders`.

Rehearsal on Arc mainnet state (still a local anvil; nothing is sent to a public network):

```bash
FORK_URL=https://rpc.mainnet.arc.io FORK_CHAIN_ID=5042002 ./fork-demo.sh --match-desk /tmp/md-mainnet-state.txt
```

`run.mjs` refuses `--fork` with a chainId 5042 sponsor file, and a native-mode deploy needs an Arc
chain id (not 31337), so the fork runs mainnet state under the Arc testnet id 5042002. The transcript,
explorer links and statement then say "Arc Testnet"; that label is the fork's chain id, not where the
state came from.

## Tests

`npm test` (node --test, no dependencies): decide with a stubbed fetch (valid give, hold, malformed
output rejected, two calls / refusal / max_tokens, over-cap clamped unless demo), act dry-run command
shape and fork guards, revert decoding, observe against a stubbed RPC (memo classes, matching,
window, range halving), and one full round writing the JSONL log. The match desk adds policy,
checker, receipt, witness, backend, send-gate and statement tests (fixtures, no network), and
`test/match-desk-sh.test.mjs` checks the runbook's offline paths (syntax, `init`, `verify`, the
AI-session and mainnet refusals). Contracts: `forge test` in `../../contracts/shelter-split`
(including `CappedSpenderMatchDesk.t.sol`). End to end: `./fork-demo.sh --match-desk`.
