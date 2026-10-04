# Track A — Build once, submit many

One Solidity contract, **ShelterSplit**, built and tested once, deployed to several EVM chains, feeds
many hackathon and grant submissions: Colosseum World's Fair (Oct 12), Arc Microgrants (Oct 14,
needs Arc **mainnet**), Arbitrum Singapore (Oct 4) and Dubai (Nov 16 – Dec 6) buildathons, Circle
Developer Grants, Base Builder Grants, Arbitrum DDA gaming, Team1 Avalanche. Default frame:
`payout-rail`.

ShelterSplit is an owner-managed registry of shelter wallets with basis-point shares (total at most
10000; the rest, and all rounding dust, goes to a treasury). `disburse(amount, memo)` pulls USDC
from the caller and pays every active shelter in the same transaction, emitting one
`Disbursed(shelter, amount, memo)` per shelter and one `DisbursementBatch`. It has a reentrancy
guard, pause, two-step ownership, safe transfers for tokens that return no bool, and it splits what
actually arrived (fee-on-transfer safe). No dependencies: the tests use a local cheatcode interface
(`shelter-split/test/utils/Vm.sol`) instead of forge-std.

### Payout paths (added 2026-09-29 for Arc and Tempo)

| Call | Pays out | Events | Units |
|---|---|---|---|
| `disburse(amount, memo)` | the ERC-20 `token` (pull, then push) | `Disbursed`, `DisbursementBatch` | token units (USDC/EURC: 6) |
| `disburseWithMemo(amount, bytes32 memo)` | the same, each payout via TIP-20 `transferWithMemo` | the same, memo as a 0x-hex string; the token emits `TransferWithMemo` | 6 |
| `donate(memo)` / plain send (`receive`) | `msg.value` in the native coin | `NativeDisbursed`, `NativeDisbursementBatch` | native (Arc: USDC, 18) |

All three share the registry, the bps math, one `batchCount`, `nonReentrant` and `pause`.
`sweepNative` recovers native value forced in without a split.

Evidence, fetched 2026-09-29:

- Arc ([EVM differences](https://docs.arc.io/arc/references/evm-compatibility)): "USDC on Arc has
  two interfaces that share one balance: a native interface (18 decimals) and an ERC-20 interface
  (6 decimals)"; "Don't mix `msg.value` with `USDC.balanceOf()` in pool or LTV math: they use
  different decimals (18 vs 6) and raw values are off by 10¹²"; "A zero `balanceOf` doesn't mean the
  native balance is zero"; "Sending native value to a contract isn't guaranteed to succeed"; value
  transfers to `0x0`, blocklisted addresses, precompiles and destructed accounts revert.
  So the native path is safe only if it never mixes the two views. It splits `msg.value` and
  nothing else: it never reads `balanceOf` or `address(this).balance`, and it has its own events so
  an indexer never adds 18- and 6-decimal amounts together. `disburse()` measures the ERC-20 delta
  inside one locked call, and `receive` is locked too, so no native deposit can land in between.
  `test/ShelterSplitNative.t.sol` models the shared balance (`MockArcUSDC`) and proves nothing is
  counted twice. Any failed native send (shelter contract that rejects it, blocklist) reverts the
  whole batch; deactivate that shelter to resume. `receive` needs more gas than the 2300 stipend of
  `transfer()`, so value sent that way bounces back.
- Tempo ([tempo-std ITIP20.sol](https://github.com/tempoxyz/tempo-std/blob/master/src/interfaces/ITIP20.sol),
  [TIP-20 spec](https://tempo.xyz/developers/docs/protocol/tip20/spec)):
  `function transferWithMemo(address to, uint256 amount, bytes32 memo) external;` (no return value;
  `transferFromWithMemo` returns bool). "The memo is always a fixed 32-byte field."
  `disburseWithMemo` checks that the contract balance is back to where it started, so a token whose
  fallback swallows the call cannot strand funds. Receive policies (T6) still silently redirect a
  blocked shelter's share, as with `disburse` (see `test/Tip20Compat.t.sol`).
- EURC ([Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses),
  [Circle EURC addresses](https://developers.circle.com/stablecoins/eurc-contract-addresses)):
  Arc mainnet `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`, Arc testnet
  `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` (both pages agree, 6 decimals). Circle also lists
  Avalanche and Base; it lists nothing for Arbitrum or Tempo, so those are `null` with `verify: true`.

### DonateRouter: no mainnet deploy before the handover (added 2026-10-04, F2 review H2)

The DonateRouter is ownerless and public. Once it exists on a mainnet, anyone can call
`donateNative` or submit a signed gift themselves, and that money reaches the shelter wallet the split
pays, which Token Tails still holds until Pink Paw's key rotation. The backend gates
(`SHELTER_HANDED_OVER` plus the on-chain recipient check in `ShelterClaimService.publicGivingVerified`)
only stop Token Tails' own relay, match and flush. So: deploy DonateRouter on testnets only until the
split's recipient is rotated to a shelter-held wallet confirmed through a separate channel.

## What is here

| Path | What |
|---|---|
| `shelter-split/` | Foundry project: `src/ShelterSplit.sol`, `test/`, `script/DeployShelterSplit.s.sol` |
| `chains.json` | Target chains: chain IDs, explorer URL patterns, USDC addresses, the **env var name** for each RPC |
| `deployments.json` | Registry of real deployments, written only by `fund a:record` / `fund a:verify` |
| `programs/<key>.json` | One profile per program: chain, mainnet gate, build window, criteria, submission fields and limits |
| `submission/master.md` | Master submission template every program renders through |
| `templates/` | Track A `call.md` (extra fields) and hackathon `draft.md` skeleton, copied by `fund new` / `a:init` |
| `shelter-split/src/DonateRouter.sol` | Ownerless router: one-signature EIP-3009 gifts (`donateWithAuthorization(Gift, memo, sig)`), native gifts on Arc (`donateNative`), `flush` for stray transfers; reverts `TreasuryShare` / `RecipientsChanged`. Deploy: `script/DeployDonateRouter.s.sol` (founder, `--account`) |
| `shelter-split/src/CappedSpender.sol` | The treat agent's wallet: immutable per-gift and per-UTC-day caps, pays only ShelterSplit. Deploy: `script/DeployCappedSpender.s.sol` |
| `router/` | Router helpers (`lib.mjs`: recipients hash, nonce, typed data) and `simulate-arc-testnet.sh` (read-only check against the live Arc testnet split) |
| `router-deployments.json` | DonateRouter deployments, recorded by hand after a founder deploy (empty until then). Separate from `deployments.json` |
| `treat-agent/` | Claude decides treats, CappedSpender limits them on-chain; `fork-demo.sh` records the demo on a local Arc testnet fork |
| `e2e-donate/` | `stack.sh all`: the 13 donation flows end to end on a local fork with anvil dev keys only |

### Donate rail commands (added 2026-10-04)

```bash
node bin/fund.mjs router plan --chain 5042002          # print the DonateRouter deploy commands; a founder broadcasts
node bin/fund.mjs shelter rotate --chain 5042002 --to <PinkPawWallet> --name "Pink Paw" --dry-run
                                                       # print removeShelter/addShelter for the handover
cd tracks/a-build/e2e-donate && ./stack.sh all         # local fork E2E, 13 flows
```

Custody rule for every path: public money moves donor → DonateRouter → ShelterSplit → shelter wallet,
or donor → shelter wallet (x402 `exact`). Mainnet public paths stay off until Pink Paw holds its own
key (`campaign.shelter.handover` on the client, `SHELTER_HANDED_OVER` on the backend). Full status:
`docs/plans/donations-STATUS.md`.

## The fast loop

Run from `funding/framework`. Every command prints the next one.

```sh
node bin/fund.mjs a:init arc-microgrants              # 1. application from its program profile
#    (or: a:init arc-microgrants --from colosseum-worlds-fair  to reuse a sibling's draft; skip step 3)
#    (`fund new arc-microgrants --track A` does the same as a:init when the slug is a profile key)
#    paste the official call text into applications/arc-microgrants/source.md, then:
node bin/fund.mjs prompt extract arc-microgrants --run --out applications/arc-microgrants/call.md  # 2. criteria table
node bin/fund.mjs prompt draft arc-microgrants --run --out applications/arc-microgrants/draft.md   # 3. draft
node bin/fund.mjs check arc-microgrants               # 4. fix citations / limits / criterion ids until it passes
node bin/fund.mjs a:build --slug arc-microgrants      # 5. forge build + test -> build-evidence.md (or --all)
node bin/fund.mjs a:deploy arc mainnet                # 6. prints env + exact forge command; a HUMAN broadcasts
node bin/fund.mjs a:record arc mainnet 0xADDR --tx 0xHASH   # 7. add the real deployment to deployments.json
node bin/fund.mjs a:verify arc mainnet                # 8. read-only RPC check (RPC URL from $RPC_ARC_MAINNET)
node bin/fund.mjs a:matrix                            # 9. which programs are now unblocked, best next deploy
node bin/fund.mjs a:submission arc-microgrants        # 10. submission.md: profile sections + deployments + build
node bin/fund.mjs check arc-microgrants               # 11. core checks + Track A gates
node bin/fund.mjs prompt review arc-microgrants --run # 12. hostile review, then revise and repeat 10-11
node bin/fund.mjs status arc-microgrants ready        # 13. strict gates on; submit by hand; then `status ... submitted`
```

Before the final `a:build`, commit and push `shelter-split/`: evidence built from uncommitted source
prints a "commit and re-run" warning in `submission.md` instead of a commit hash, and fails `check`
at `ready`. `prompt ... --out` overwrites the file, so review the AI output (`git diff`) before
moving on. Keep the draft section titles (Summary, Problem, …): profiles map form fields to them.

One build feeds every program: `a:build --all` refreshes the evidence in every open Track A
application, and one `a:record` can unblock several programs at once (`a:matrix` names the deploy
with the most leverage).

## Deploy wave: every chain in one run

`a:deploy` → `a:record` → `a:verify` per chain works, but a wave does all the chains at once.

```sh
node bin/fund.mjs a:wave                       # rank chains by the EV they unlock (portfolio success x capital),
                                               #   write tracks/a-build/wave/deploy-mainnet.sh (gitignored)
DRY_RUN=1 tracks/a-build/wave/deploy-mainnet.sh   # a HUMAN runs it: simulate every chain first
tracks/a-build/wave/deploy-mainnet.sh             # then for real: deploy, optional proof payout, then a:ingest
node bin/fund.mjs a:ingest                     # (run by the script) record + verify deploys and payouts from
                                               #   shelter-split/broadcast/, re-render unblocked submissions
```

- **Signer:** a Foundry keystore (`cast wallet import tokentails --interactive`, then
  `export FUND_KEYSTORE=tokentails`, or a path to a keystore file). No key is ever written to a file.
- **Preflight for each chain:** the RPC env var must be set, the RPC must answer with the expected
  chain ID, and the token address must be known. The deployer balance is printed. A chain that fails
  preflight is skipped and listed at the end; nothing is guessed.
- **Owner:** defaults to the deployer, so the same key can register the proof shelter. Hand ownership
  to a Safe later with `transferOwnership` + `acceptOwnership`. Set `SHELTERSPLIT_OWNER` to use a
  different owner from the start.
- **Proof payout (optional):** set `PROOF_SHELTER` (the shelter's own wallet), `PROOF_SHELTER_NAME`
  and `PROOF_AMOUNT` (raw units; 1000000 = 1 USDC). After each deploy the script then runs
  `script/ProofDisburse.s.sol`, which calls `addShelter`, `approve` and `disburse`. That gives one
  real payout to one real shelter. `a:ingest` records the tx in `proofTxs`, and every submission's
  deployment table links it.
- **Payout token:** `splitToken` in `chains.json` overrides USDC for a network. Mezo pays in MUSD;
  fill in its address from explorer.mezo.org first.
- **Second token (EURC):** `splitTokens.EURC` in `chains.json` lists it per network.
  `a:wave --token EURC` writes `wave/deploy-<network>-eurc.sh`, which deploys a separate instance
  with the same script (`SHELTERSPLIT_TOKEN` = the EURC address). Chains with no entry are left out.
  `a:ingest` records each instance's token (from the constructor argument), and a chain counts as
  deployed per token. Run it after the USDC wave has finished: Foundry keeps one `run-latest.json`
  per chain.
- `--chains a,b` limits the wave. Chains that already have a recorded deployment are left out
  unless you pass `--redeploy`.

Tested end to end on a local anvil chain: deploy, then a proof payout (the shelter received 1 USDC),
then ingest and on-chain verification.

### Source verification (automatic)

Judges open the contract on the explorer, and unverified bytecode can disqualify an entry. After each
deploy, `fund a:ingest` submits the ShelterSplit source with `forge verify-contract --watch` and marks
`sourceVerified` in `deployments.json`. `fund check` warns while any deployment is unverified and
fails at `ready`. To run it by hand: `fund a:verify-source [chain] [network] [--force]`.

| Chain | Verifier (`verifier` in chains.json) |
|---|---|
| Arc | Blockscout `explorer.testnet.arc.io/api/`; mainnet `explorer.arc.io/api/` (assumed, check on the first mainnet run) |
| Tempo | Sourcify-compatible `contracts.tempo.xyz` (mainnet and testnet) |
| Arbitrum, Base | Blockscout (keyless) |
| Avalanche | Routescan Etherscan-compatible API (keyless, `apiKey: verifyContract`) |

Constructor arguments come from the deploy broadcast; without it they are read back from the
contract (`token`, `treasury`, `owner`), which no longer matches once ownership moves to a Safe.
Verified on 2026-10-02: Arc testnet (Blockscout `is_verified: true`) and Tempo testnet (Sourcify `exact_match`).

## Track A gates in `fund check`

| Check | Drafting | in-review | ready |
|---|---|---|---|
| `mainnet` — `mainnet_required: true` needs a recorded mainnet deployment on one of the app's `chain`s | warn | error | error |
| `build-evidence` — exists, tests passed, under 7 days old | warn | warn | error |
| `build-evidence` — built from committed source (clean tree) | | warn | error |
| `mainnet_required` is a boolean (`true`/`false`, `yes`/`no`); anything else | error | error | error |
| `repo` — public https repo URL in `call.md` | warn | warn | error |
| `chain` — every `chain` is a key in `chains.json` | error if unknown | error | error |
| `build-window` — start before end; warns before it opens or after it closes | | | |
| `submission` — `submission.md` newer than draft, deployments and evidence | warn | error | error |

## Add a new program in under 5 minutes

1. Copy the closest profile: `cp programs/arc-microgrants.json programs/<new-key>.json`.
2. Edit `program`, `url`, `deadline` (ISO with timezone, or `rolling`), `chain` (a key or a list of
   keys from `chains.json`), `mainnet_required`, optional `build_window_start` / `build_window_end`,
   and `criteria` (`[["C1", "Name", "weight", "quote"], …]`) if you already know them.
3. Under `submission.sections`, list the form fields in order. Each has a `title`, `from` (a draft
   section title: Summary, Problem, Solution, How it works, On-chain proof, Traction, Team, Roadmap
   and business plan), an optional `limit` in characters, and optional `auto`: `deployments` or
   `build`. Add `fields` (static rows) and a `checklist`.
4. `node bin/fund.mjs a:init <new-key> --from colosseum-worlds-fair` and you are in the loop above:
   the sibling's draft is copied with the program name swapped and any criterion id the new call.md
   does not have dropped (`fund check` then lists the criteria left unmapped). If the new call.md
   has no criteria table yet, the ids are kept: re-map them after the extract prompt.

A new chain is one entry in `chains.json` (chain ID and explorer from the official docs; set
`"verify": true` until a human has checked them). A one-off tweak for a single application goes in
`applications/<slug>/submission.json`, which overrides the profile.

## Safety

- Nothing in this track signs or broadcasts. `a:deploy` prints the command; `--simulate` runs
  `forge script` without `--broadcast`. `a:verify` uses only `eth_chainId`, `eth_getCode` and
  `eth_getTransactionReceipt`.
- RPC URLs and signing keys live only in env vars (`RPC_<CHAIN>_<NETWORK>`, and a Foundry keystore
  via `--account`). Never write them to a file here.
- Mainnet only after the tests, an AI security review and a human review. Keep balances minimal:
  `disburse()` leaves nothing in the contract.
- `deployments.json` holds only real deployments. Tests redirect it with `FUND_A_DEPLOYMENTS`.

## Env overrides

`FUND_A_DEPLOYMENTS`, `FUND_A_CHAINS`, `FUND_A_PROGRAMS`, `FUND_A_PROJECT` (paths), `FORGE_BIN`
(defaults to `~/.foundry/bin/forge`), `FUND_A_RPC_TIMEOUT_MS` (a:verify, default 15000). `a:verify`
never prints the RPC URL (it often embeds an API key); a failed RPC call leaves the record unchanged. Tests use all of them to stay hermetic.
