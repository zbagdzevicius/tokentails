# Chain decision — Colosseum Crypto World's Fair

_Written 2026-09-27. Sources are linked inline. Nothing here has been signed or broadcast._

## Decision

`chain: [tempo, arbitrum]` in call.md and in `tracks/a-build/programs/colosseum-worlds-fair.json`.

1. **Tempo mainnet first.** It has the larger track pool: "$100,000 will be awarded across 10 of the
   best products that integrate with the Tempo blockchain" (rules §14(f)). Colosseum's Tempo resources
   are grouped under "Payment applications", "Stablecoins and exchange" and "Data and machine
   payments" ([manifest](https://github.com/ColosseumOrg/hackathon-resources/blob/main/manifest.json)).
   A USDC shelter-payout rail belongs in the first group.
2. **Arbitrum One second.** "$25,000 … across 5 of the best products that integrate with the Arbitrum
   blockchain" (rules §14(k)). The same deployment also serves the Arbitrum Singapore and Dubai
   buildathons (only if they accept remote teams: the team is remote-only) and the Arbitrum DDA grant.
3. **Base and Robinhood are dropped.** They pay $25k across 5 teams each (§14(j), §14(l)).
   Robinhood Chain also has no official USDC address (see chains.json).

Either chain's mainnet deployment satisfies `mainnet_required` (the chain list is "any of").

## What the rules say

Sources: [Official rules PDF](https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf),
the [event page](https://colosseum.com/worldsfair) and the [hackathon FAQ](https://colosseum.com/hackathon).

- **Main prize plus track prize: yes, allowed.** The event page says: "Track prizes are awarded in
  addition to the awards above." The rules list the main prizes (§14(a)–(d): Grand Champion $30k,
  Public Goods $5k, University $5k, 20 × $15k) and the track prizes (§14(e)–(l)) as separate lines.
  Nothing in the rules forbids winning both.
- **More than one ecosystem track: not answered.** §7 says "A Team may only submit one (1) Project
  Submission at a time." Neither the rules nor the FAQ say whether one submission can be tagged with
  several tracks. **Ask in the Colosseum Discord** before you submit. If only one track is allowed,
  enter Tempo.
- **What the Tempo track requires:** only that the product "integrate[s] with the Tempo blockchain"
  (§14(f)). Nothing says whether mainnet is required, and no Tempo-specific judging criteria exist
  beyond the general ones in §8.
- **Judging (§8):** Functionality, Potential Impact, Novelty, UX, Open-source, Business Plan. The
  profile now quotes these word for word.
- **Pre-existing code (FAQ):** "Teams may begin development before the hackathon, but products are
  judged only on the work completed between the competition's start and end dates." Earlier work must
  be disclosed.
- **Videos (FAQ):** "a two-to-three-minute presentation video" and "a product-demo video of no more
  than three minutes".
- **Timing (§5):** from 6:00am PT on 2026-09-14 to 11:59pm PT on 2026-10-12. Winners are announced
  by 2026-12-05.
- **Prize payment (§14, §15(b)):** prizes are paid in Phantom CASH stablecoin to the Team Leader's
  wallet, after Prize Acceptance Documents are signed and due diligence is passed (§13).

## Tempo facts (verified 2026-09-27)

| Item | Value | Source |
|---|---|---|
| Mainnet | chain 4217, explorer https://explore.tempo.xyz, live since March 18, 2026 | [connection details](https://tempo.xyz/developers/docs/quickstart/connection-details), [FAQ](https://tempo.xyz/faq/) |
| Testnet (Moderato) | chain 42431, explorer https://explore.testnet.tempo.xyz | connection details |
| Public RPC (no key) | mainnet `https://rpc.tempo.xyz`, testnet `https://rpc.moderato.tempo.xyz` | connection details |
| Mainnet USDC | **USDC.e** (Bridged USDC, Stargate) `0x20C000000000000000000000b9537d11c60E8b50`. There is no native Circle USDC on Tempo. | [LayerZero bridge guide](https://tempo.xyz/developers/docs/guide/bridge-layerzero) |
| pathUSD | `0x20c0000000000000000000000000000000000000` (mainnet, issued by Bridge; also on testnet) | [FAQ](https://tempo.xyz/faq/), [faucet](https://tempo.xyz/developers/docs/quickstart/faucet) |
| Testnet tokens | pathUSD `…0000`, AlphaUSD `…0001`, BetaUSD `…0002`, ThetaUSD `…0003`, from the faucet API | faucet |
| Decimals | "Always returns 6 for TIP-20 tokens" | [TIP-20 spec](https://tempo.xyz/developers/docs/protocol/tip20/spec) |
| Gas | no native gas token; `BALANCE` and `CALLVALUE` always return 0; fees are paid in a TIP-20 stablecoin, with pathUSD as the fallback | [EVM differences](https://tempo.xyz/developers/docs/quickstart/evm-compatibility) |
| State cost | storage slot 250,000 gas, contract code 1,000 gas per byte, 30M gas cap per transaction | EVM differences |
| Foundry | upstream `foundryup`; `--tempo.fee-token <addr>` works on forge script/create; verifier `https://contracts.tempo.xyz` | [Foundry for Tempo](https://tempo.xyz/developers/docs/sdk/foundry) |

Anything still unconfirmed is marked `"verify": true` in `tracks/a-build/chains.json`:

- the explorer `/tx/` path (only `/address/` was seen);
- the testnet "usdc" slot, which holds pathUSD because no test USDC was found.

## TIP-20 compared with ERC-20, as ShelterSplit uses it

ShelterSplit calls `transferFrom`, `transfer` and `balanceOf`, and checks `code.length`.

| Behaviour | Effect on ShelterSplit | Source |
|---|---|---|
| `transfer`/`transferFrom` return `bool` | None. `_call` accepts `true`. | [tempo-std ITIP20.sol](https://github.com/tempoxyz/tempo-std/blob/master/src/interfaces/ITIP20.sol) |
| Tokens are precompiles at `0x20c0…`, but the node sets code at the token address ("must ensure the account is not empty, by setting some code") | The constructor's `NotAContract` check passes. | [tempo tip20/mod.rs](https://github.com/tempoxyz/tempo/blob/main/crates/precompiles/src/tip20/mod.rs) |
| Memos are optional (`transferWithMemo` is a separate function) | None. The memo stays in ShelterSplit's own events. | TIP-20 spec |
| TIP-403 transfer policy checks sender **and** recipient and reverts `PolicyForbids` | The whole `disburse` reverts, with no partial payout. The owner deactivates the blocked shelter and payouts resume. | [TIP-403 spec](https://tempo.xyz/developers/docs/protocol/tip403/spec) |
| Paused token reverts `ContractPaused` | `disburse` reverts. | TIP-20 spec |
| A recipient that is zero or a `0x20c0…` token address reverts `InvalidRecipient` | A shelter wallet mistakenly set to a token address blocks every payout until it is removed. | TIP-20 spec |
| **T6 receive policies:** a receiver can block senders or tokens. The call **does not revert**: it returns `true` and the funds go to ReceivePolicyGuard `0xB10C000000000000000000000000000000000000` with a claim receipt. | **Silent gap.** ShelterSplit emits `Disbursed(shelter, share)`, but the shelter wallet receives nothing. The recovery authority may be the "originator", which could mean ShelterSplit itself, and ShelterSplit has no claim function. | [receive policies](https://tempo.xyz/developers/docs/protocol/tip403/receive-policies), [T6 post](https://tempo.xyz/developers/blog/t6) |

### Test result

`tracks/a-build/shelter-split/test/Tip20Compat.t.sol` is new. It etches a mock TIP-20 at the real
USDC.e address and runs 8 tests: exact split, fuzzed conservation, no memo required, a policy-blocked
shelter, a policy-blocked payer, pause, a token-address shelter, and the receive-policy redirect.
`forge test`: **41 passed, 0 failed** (33 existing + 8 new). The receive-policy test pins the current
behaviour and passes.

A stricter version of the test, run in a scratch copy and not committed, asserts that a shelter with
a `Disbursed` event holds its share. It fails:

```
[FAIL: revert: shelter with Disbursed event must hold its share: 0 != 250000] test_Strict_DisbursedMeansShelterReceived()
```

### Proposed contract fix (not applied)

`src/ShelterSplit.sol` is shared with every Track A application. arc-microgrants is being processed
right now, so the source was left unchanged. The fix, for a person to decide on:

- In `disburse()`, read `token.balanceOf(s.wallet)` before and after each `_safeTransfer`, and revert
  with a new `NotDelivered(wallet)` error if the increase is less than `share`.
- Do the same for the treasury.

This turns a silent redirect into an atomic revert, which matches how transfer-policy blocks already
behave. The cost is 2 extra `balanceOf` calls per shelter. If you apply it, promote the strict test
above into `Tip20Compat.t.sol`, replace the known-limitation test, re-run `fund a:build --slug
colosseum-worlds-fair`, and re-run the AI security review before mainnet.

**Operational mitigation without the fix:** before `addShelter` on Tempo, confirm the shelter wallet
has no receive policy (the default is none, meaning accept everything). Re-check before each demo,
and watch for `Transfer(…, to: 0xB10C…)` from ShelterSplit.

## Deploy commands (a person runs, signs and broadcasts these)

Before mainnet: run the tests, the AI security review and a human review. The chains.json entries
carry `"verify": true`, so `a:deploy` will warn.

```bash
cd funding/framework
export PATH="$HOME/.foundry/bin:$PATH"
foundryup                      # local forge is 0.3.0 (2024-12); Tempo flags need a current release

# 1. Tempo testnet (Moderato) first
fund a:deploy tempo testnet    # prints env + the forge command; add --simulate once RPC_TEMPO_TESTNET is set
export RPC_TEMPO_TESTNET=https://rpc.moderato.tempo.xyz
# fund the deployer with testnet pathUSD from the faucet (tempo.xyz/developers/docs/quickstart/faucet)
cd tracks/a-build/shelter-split
SHELTERSPLIT_TOKEN=0x20c0000000000000000000000000000000000000 \
SHELTERSPLIT_TREASURY=<treasury address> SHELTERSPLIT_OWNER=<owner, ideally a multisig> \
EXPECTED_CHAIN_ID=42431 \
forge script script/DeployShelterSplit.s.sol:DeployShelterSplit --rpc-url "$RPC_TEMPO_TESTNET" \
  --tempo.fee-token 0x20c0000000000000000000000000000000000000 --account <keystore-name> --broadcast
cd ../../..
fund a:record tempo testnet <address> --tx <hash>
fund a:verify tempo testnet

# 2. Tempo mainnet (the deployer needs pathUSD or USDC.e for fees)
export RPC_TEMPO_MAINNET=https://rpc.tempo.xyz
fund a:deploy tempo mainnet
cd tracks/a-build/shelter-split
SHELTERSPLIT_TOKEN=0x20C000000000000000000000b9537d11c60E8b50 \
SHELTERSPLIT_TREASURY=<treasury> SHELTERSPLIT_OWNER=<multisig> EXPECTED_CHAIN_ID=4217 \
forge script script/DeployShelterSplit.s.sol:DeployShelterSplit --rpc-url "$RPC_TEMPO_MAINNET" \
  --tempo.fee-token 0x20C000000000000000000000b9537d11c60E8b50 --account <keystore-name> --broadcast
# optional source verification: add --verify --verifier-url https://contracts.tempo.xyz
cd ../../..
fund a:record tempo mainnet <address> --tx <hash>
fund a:verify tempo mainnet
fund done colosseum-worlds-fair deploy

# 3. Arbitrum One (second track, plus the Arbitrum buildathons and DDA)
fund a:deploy arbitrum mainnet
fund a:record arbitrum mainnet <address> --tx <hash>

fund a:submission colosseum-worlds-fair && fund check colosseum-worlds-fair
```

The deploy script's `EXPECTED_CHAIN_ID` guard refuses to run on any other chain. The ShelterSplit
runtime is 8,768 bytes, so code storage alone is about 8.8M gas at Tempo's 1,000 gas per byte. That
is under the 30M cap per transaction, but expect a larger fee than on an L2.

## Still open (for a person)

- Ask in the Colosseum Discord whether one submission can enter both the Tempo and Arbitrum tracks.
- Ask whether the Tempo track requires a mainnet deployment.
- call.md `next:` and its "Mandatory annexes" line still mention Base or Robinhood Chain. This
  assignment owned only the `chain` field there, so update that text by hand. The program profile's
  `next` is already updated.
- The draft's "Why Tempo" says a blocked shelter wallet stops the whole payout. That holds for TIP-403 transfer policies but not for T6 receive policies (silent redirect, see above). Either apply the contract fix or check every shelter wallet before registering it, before this claim goes to judges.
- `build-evidence.md` still says 33/33. Re-run `fund a:build --slug colosseum-worlds-fair` so it picks
  up the 8 TIP-20 tests, after committing `shelter-split/`.
