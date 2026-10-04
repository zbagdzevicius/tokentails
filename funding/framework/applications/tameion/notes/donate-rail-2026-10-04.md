# Donate rail, 2026-10-04: what changed for Tameion

Additive note. `draft.md` was corrected today (two stale statements, see below); `submission.md`
belongs to another session and still has the old text: regenerate it with `fund a:submission tameion`
after review. Deadline Oct 10 23:59 ET (Oct 11 06:59 Vilnius); invite still unconfirmed.

## New mechanics, mapped to the criteria

| Criterion (weight) | What is new |
|---|---|
| C1 Agentic sophistication (30%) | A treat agent where **an LLM decides and a contract limits**. Each round it observes ShelterSplit payouts of the last 24 h (public gifts vs Token Tails' own), its own remaining daily budget and float, the campaign goal [C-001] and a needs list; Claude (`claude-opus-5-5`, strict tools `give_treat` / `hold`) proposes an amount and a reason; the code validates strictly; **CappedSpender** enforces per-gift and per-UTC-day caps on-chain, pays only the shelter wallets registered on ShelterSplit (held by Token Tails until handover), refuses while the split is paused or when any share would reach the treasury. Matches are tagged `tt:agent:match-<tx>` (trusted only from the spender and listed backend wallets, so a stranger's memo cannot block a match); router gifts are left to the backend matcher, so a gift is never matched twice. Every round is logged with an observation hash and the tx hash or revert. This answers the "contract-level limits" rule directly. |
| C2 Traction (30%) | Unchanged and honest: one shelter, Pink Paw, wallet held by Token Tails until handover. Value moved is live only ([L-disbursed], [L-treats]). |
| C3 Circle tool usage (20%) | USDC on Arc as gas and gift; EIP-3009 one-signature giving through the DonateRouter ([P-003], unverified); the standard `exact` scheme, built to the x402 spec and facilitator-agnostic, with `payTo` = the shelter's own wallet (built, off on mainnet until handover). Pointing it at Circle's x402 facilitator (Circle docs list Arc, Base and Polygon PoS) is the next step: today the code defaults to the x402.org facilitator and lists `arc-testnet` only. Do not say we use Circle's facilitator. |
| C4 Innovation (20%) | The agent's "wallet" is a contract that cannot overspend: the model can be wrong, the money cannot. Its money is Token Tails' own; it refuses native coin from anyone but its owner and is never shown as a donation address. |

## Corrections made in draft.md (2026-10-04)

- "the spending decision is a fixed cap in code, not a model" and "standard facilitators may not
  support Arc" → now: Claude decides, CappedSpender limits on-chain (shown on a local Arc testnet
  fork; testnet deploy pending); the standard exact scheme is facilitator-agnostic and pays the
  shelter's wallet, off on mainnet until handover. Section at 1495/1500 characters.
- Review fixes (2026-10-04): "pays only the shelter" → "pays only the shelter wallets on the split
  (ours until handover)"; removed the unverified "Circle's facilitator since 16 Sep 2026" date and
  the implication that our exact scheme uses Circle's facilitator.
- Circle tools list: x402 + EIP-3009 line (facilitator-agnostic; Circle's facilitator is the next
  step); the gap line names Circle Wallets, Paymaster, CCTP and Gateway. Section at 888/900.
- Innovation: "works on a chain facilitators do not cover yet" → "works on any EVM chain, including
  ones no facilitator covers yet".

## 3-beat demo (≤ 3 min video; this part ≈ 60 s)

Recorded from `treat-agent/fork-demo.sh` (local fork of Arc testnet, anvil dev accounts, test USDC);
transcript in the session scratchpad `donate/agent-demo.txt`.

1. **Decide.** A fan gives 0.02 test USDC. `node run.mjs --fork --once`: the agent shows its
   observation, decides "GIVE 0.02, memo tt:agent:match-<tx>", says why, and Pink Paw's balance rises.
2. **Refuse.** `--demo-overcap`: the agent is told to propose twice the per-gift cap. The contract
   reverts and the screen shows `OverTxCap(0.1, 0.05) USDC`; the balance does not move; the log records
   the revert.
3. **Prove.** The decision log line (observation hash, rationale, tx hash) next to the explorer event
   `AgentGift` + ShelterSplit's batch event.

With `ANTHROPIC_API_KEY` set the same script uses Claude instead of the offline stub; record that run.
Before recording, run one `--once` with the real key and check the log's `meta.model` and a
`tool_use` decision: exit code 3 means the API call failed (retry with `TREAT_AGENT_NO_FALLBACK=1`).

## Live, testnet, pending

| Item | State on 2026-10-04 |
|---|---|
| CappedSpender + agent | built, 26 forge tests + 29 Node tests; shown on a local Arc testnet fork only; not deployed |
| CappedSpender on Arc testnet | founder step (tracker row Oct 5); then cite its address |
| ShelterSplit Arc testnet | live 0x457c89e10a6e66633eda5bf82fd086febb5db147 |
| Arc mainnet split | being deployed by another session; check deployments.json |
| x402 `exact` to the shelter wallet, router, wallet giving | built; mainnet off until the Pink Paw handover |
| Real Claude call | not run in this session (no API key here); the request shape is unit-tested |

## Numbers and their keys

- [C-001] goal; [C-004] treat size; [C-005] daily treat budget; [C-006] x402 cat-card price (0.01).
- [P-003] one-signature giving, [C-008] match: unverified, say "built".
- The fork caps (0.05 / 0.10 test USDC) are demo parameters: show them on screen as such, never as
  a production budget. The production agent caps are set at deploy and must be stated from the
  deployed contract (`perTxCap()`, `dailyCap()`).

Facilitator networks (Arc, Base, Polygon PoS; EIP-3009 settlement): Circle docs, https://developers.circle.com/x402-facilitators/x402.
No launch date on a Circle source yet (only news sites): do not cite a date until Circle's own docs
or changelog give one.
