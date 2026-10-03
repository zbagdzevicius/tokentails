# Win-readiness review (2026-10-02)

## SC-1 [high, submissions] Drafts say ShelterSplit is MIT, but the public repo on main still shows only the all-rights-reserved commercial licence

- File: funding/framework/tracks/a-build/shelter-split/LICENSE
- Evidence: Confirmed. COMMERCIAL_LICENSE.md says "All rights reserved. No license is granted to use, copy, modify..." for "this software" with no exceptions. On main and in commit 9734bed0 (the commit every submission cites), shelter-split/ has no LICENSE file (git ls-files lists none). The working-tree fix is in place but untracked: shelter-split/LICENSE is MIT (untracked), shelter-split/README.md is untracked, and README.md:86-87 now says shelter-split/ and shelter-rail/ are MIT (modified, not committed). Colosseum criterion C5 is open source.
- Impact: Until this is pushed, a judge who opens github.com/.../tree/main/.../shelter-split finds no MIT licence and a repo-wide licence that grants nothing. That costs points on Colosseum C5 (Oct 11) and undercuts the open-source and public-goods claims for Arc (Oct 7), Arbitrum (Oct 4), Monad and Tameion.
- Fix: Commit and push shelter-split/LICENSE, shelter-split/README.md and the README.md License change to main before the first deadline (Arbitrum, Oct 4). Also add a carve-out sentence to COMMERCIAL_LICENSE.md, for example: "Excluded: funding/framework/tracks/a-build/shelter-split/ and shelter-rail/, which are MIT licensed (see the LICENSE in each folder)." That clause currently reads as covering the whole repo. The owner should confirm the MIT choice. If the commit cited in the drafts (9734bed09985) changes, regenerate the drafts so they cite the commit that contains the LICENSE.

## SC-2 [medium, tooling] Mainnet deploy script was stale: no gas multiplier for Tempo and no cast proof path for Arc (fixed by regenerating, verified)

- File: funding/framework/tracks/a-build/wave/deploy-mainnet.sh:98
- Evidence: Verified in the current file. Line 43 sets CAST_PROOF_CHAINS='5042 4217', proof_cast() is defined at line 79, the Tempo deploy at line 98 passes --gas-estimate-multiplier (proof_cast strips it for cast), and `bash -n` passes. wave/ is gitignored (.gitignore:1), so the regenerated script exists only on this machine, which is where it runs.
- Impact: Running the old script would have produced no proof payout on Arc mainnet (the Arc and Tameion 'working on mainnet' requirement) and an out-of-gas Tempo deploy for Colosseum, both close to the deadlines.
- Fix: Done: regenerated deploy-mainnet.sh and deploy-mainnet-eurc.sh with `node bin/fund.mjs a:wave --network mainnet` (plus `--token EURC`). Because wave/ is gitignored, always regenerate the scripts on the machine that runs the deploy, rather than copying old ones.

## SC-3 [medium, tooling] Proof payout was signed by the deployer even when SHELTERSPLIT_OWNER was a different address, so the onlyOwner addShelter call reverts (fixed, verified)

- File: funding/framework/tracks/a-build/wave.mjs:178
- Evidence: Verified. The generated deploy-mainnet.sh:59-61 now compares OWNER and DEPLOYER case-insensitively. When they differ it prints 'proof skipped: owner ... is not the deployer' instead of calling addShelter, which ShelterSplit.sol makes onlyOwner. Framework tests pass 399/399 (node --test test/*.test.mjs).
- Impact: Following the multisig-owner advice in DeployShelterSplit.s.sol would have made every mainnet proof fail with an unclear error.
- Fix: Done in wave.mjs. Operational follow-up: if a Safe is the owner, run addShelter and the proof disburse from the Safe, then record the transaction hash in deployments.json, because the submissions need a mainnet proof payout.

## SC-4 [low, submissions] "Creation bytecode sha256" was the hash of the hex text, not of the bytecode bytes (fixed)

- File: funding/framework/tracks/a-build/track.mjs:176
- Evidence: Confirmed. I recomputed both hashes from shelter-split/out/ShelterSplit.sol/ShelterSplit.json. Hashing the bytes gives 6a1faf73...f72c; hashing the hex string gives 9c81b1ed...83bc, which is the value all 5 target submissions and build-evidence files had. The same bug was in track.mjs:281 (the on-chain codeSha256 written to deployments.json).
- Impact: A reviewer who checks the hash the standard way (sha256 of the bytecode bytes) gets a different value, so the reproducibility claim looks false.
- Fix: Applied. track.mjs:176 and :281 now hash Buffer.from(hex, 'hex'). In applications/{arc-microgrants,colosseum-worlds-fair,tameion,arbitrum-singapore,monad-metropolis}/submission.md and build-evidence.md I replaced the old hash with 6a1faf73bad02285dd3d1198bd8c31e25f6e2283258e024dfb7d68e4595bf72c; no copies of the old hash remain. Framework tests pass 399/399. The codeSha256 values already in deployments.json are refreshed on the next `a:verify`; no submission quotes them.

## SH-1 [high, backend] x402 verification undercounted payment when shelters hold < 10000 bps (treasury share emits no NativeDisbursed)

- File: /Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-x402.service.ts:202
- Evidence: ShelterSplit._split (funding/framework/tracks/a-build/shelter-split/src/ShelterSplit.sol L307-326) emits NativeDisbursed only for each active shelter's share. The treasury remainder is paid with no per-recipient event. Only NativeDisbursementBatch(batchId, payer, received, paid, rest, count, memo) carries the full msg.value. The current verifyReceipt (L202-246) now matches both NATIVE_DISBURSED_TOPIC and NATIVE_BATCH_TOPIC on the split address and the memo, and uses max(batch sum, shares sum). The ABI string in shelter-chain.ts:19 matches the Solidity event signature exactly (uint256 indexed, address indexed, uint256 x4, string). The shelter/onchain jest suites pass (65) and tsc is clean.
- Impact: Before the fix, an agent that paid exactly maxAmountRequired got a 402 'below price' and lost its USDC whenever the split had a treasury cut, an inactive shelter, or a rounding remainder. That would break the live x402 demo (Arc, Colosseum, Monad) as soon as a second shelter or a fee was configured.
- Fix: Already fixed in the working tree and verified. Remaining work: redeploy the backend before any demo that uses a split under 10000 bps. After the redeploy, relax the 10000-bps hard gate in funding/e2e/e2e.mjs:202-203, or keep it until the redeploy is confirmed. The fix is uncommitted, so it must be committed with the shelter changes.

## SH-2 [medium, backend] Testnet receipts linked to the mainnet Arc explorer

- File: /Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-onchain.config.ts:89
- Evidence: explorerTxUrl(txHash, chainId) now maps 5042 to https://explorer.arc.io and 5042002 to https://explorer.testnet.arc.io (L83-91). donate() passes config.chainId (shelter-donate.service.ts:303) and me() passes row.chainId (L233). The schema field exists (shelter-onchain.schema.ts:56), and a spec covers both chains (shelter-donate.service.spec.ts:352-355). The backend is Arc-only (SHELTER_CHAIN_ID defaults to Arc), so falling back to mainnet for an unknown chain is acceptable.
- Impact: Before the fix, every testnet POST /shelter/donate and GET /shelter/donate/me response gave judges an explorer link that did not resolve the transaction.
- Fix: Already fixed and verified. Remove the now-stale known-issues note at funding/e2e/README.md:186-188 so judges and reviewers don't read it as an open bug. Commit the fix and redeploy.

## SH-3 [low, backend] Hot-wallet nonce serialisation is per process only

- File: /Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-chain.ts:91
- Evidence: sendQueue is an instance field (L37), chained at L91. The nonce comes from the node's pending count, so nothing coordinates sends across processes.
- Impact: With more than one backend replica, two gifts sent at the same moment can sign the same nonce. One is dropped and later reconciled as 'timeout', and the user sees a failed treat. No funds are lost. It is safe with a single instance, which is the current demo setup.
- Fix: No code change needed before the deadlines. Run the donate path on a single replica during the demos. Later, allocate nonces through a Mongo counter or a lease.

## client-eurc-mislabelled [high, client] EURC ShelterSplit payouts were shown as USDC and counted toward the USDC campaign meter

- File: client/components/shelter-payouts/rpc.ts:50
- Evidence: Checked. rpc.ts:34-50 has deploymentToken() and resolveChain uses d.symbol || deploymentToken(d) || known.symbol. campaign.ts:78-92 takes a per-entry symbol and skips anything that is not USDC. receipt.ts:91-92 sets tokenSymbol, and ShelterReceipt.tsx:103 and :154 use it. client jest shelter-* tests: 52 pass, 0 fail.
- Impact: Without the fix, EURC payouts on Arc from the Oct 2 wave would be labelled USDC and added to the 90 USDC campaign meter. A judge comparing the page with the explorer would find a false figure.
- Fix: Already fixed in the working tree (not committed). Commit client/components/shelter-payouts/{rpc,campaign,receipt}.ts, ShelterReceipt.tsx, ShelterPayouts.tsx, and the tests client/__test__/shelter-deployment-token.test.ts and shelter-campaign.test.ts, then deploy before Oct 7.

## heist-eurc-summed-as-usdc [high, client] Heist win-screen total adds EURC payouts into its USDC figure. Fixed in source but not in the served build.

- File: catnip-heist/src/ui/payouts.ts:41
- Evidence: The source has deploymentUnits() at payouts.ts:41-43 and a 143 entry at :37, and catnip-heist vitest passes 72 of 72. The committed bundle client/public/heist-game/build/index-CvoLmf5T.js has no EURC/token handling and no 143 entry (grep for EURC, deploymentUnits and 143:{ finds nothing). tokentails.com/heist serves that bundle.
- Impact: The live line "X USDC sent to real shelters so far, on-chain" would still add EURC into USDC, and would skip Monad, until the bundle is rebuilt.
- Fix: In catnip-heist, run `npm run build:client` to regenerate client/public/heist-game/build. Check the new bundle with `grep -l EURC client/public/heist-game/build/*.js`, then commit the source and the build together. The rebuild also bakes in the other uncommitted catnip-heist edits, so review those first.

## give-signin-for-closed-jar [high, client] Give page asked a signed-out judge to sign up even when no treat could be sent (backend 404 or rail paused)

- File: client/components/shelter-payouts/GiveTreat.tsx:86
- Evidence: Checked. GiveTreat.tsx:86 has `const closed = status !== undefined && !available`. Line 115 is `disabled={send.status === "sending" || closed}`, and lines 121-123 show the normal label when closed, not "Sign in to send a treat".
- Impact: Without the fix, the main Arc, Colosseum and Tameion flow (Heist -> Send Pink Paw a rescue treat) forces account creation and then shows the raw "Cannot POST /shelter/donate" error.
- Fix: Already fixed in the working tree. Commit and deploy it. The real fix is still making /shelter/donate/status and POST /shelter/donate live in production (WHAT-WE-ARE-MISSING item 4).

## monad-chain-missing [medium, client] Monad (chain 143) was missing from the payouts and Heist chain tables

- File: client/components/shelter-payouts/chains.ts:35
- Evidence: Now present at chains.ts:35 (rpc.monad.xyz, monadvision.com, MON) and catnip-heist/src/ui/payouts.ts:37. It is not in the served heist bundle.
- Impact: Once a Monad deploy is ingested for the Oct 13 entry, the /shelter-payouts Monad card would throw "no public RPC known for chain 143" and the Heist total would skip it.
- Fix: The source is fixed. Confirm the RPC URL during the Monad deploy (chains.json has verify:true), and ship it with the heist rebuild from heist-eurc-summed-as-usdc.

## getlogs-range-fallback [medium, client] getLogs fallback uses fixed 10k-block windows capped at 50, so it fails on RPCs with smaller caps or once a deployment is past 500k blocks

- File: client/components/shelter-payouts/rpc.ts:31
- Evidence: rpc.ts:31-32 sets WINDOW=10_000 and MAX_WINDOWS=50. Lines 101-110: when the full-range query fails, it throws if the range is over 500k blocks, and if the provider rejects 10k ranges, every window throws. catnip-heist payouts.ts:114-123 makes one query from fromBlock (default 0) and silently drops the chain on error. Provider limits are not verified (no network calls allowed).
- Impact: On fast chains (Arc), a card could turn into a red error within days of the Oct 2 deploy, before the Oct 7-13 submissions, and the Heist total could quietly omit that chain.
- Fix: Set `fromBlock` (the deploy block) on every entry in client/public/shelter-payouts/deployments.json when ingesting (wave.mjs:307-309 should copy the deploy receipt's blockNumber). Then make the fallback adaptive: on a range error, halve the window down to 2048 and drop the MAX_WINDOWS throw in favour of a bounded loop. Load /shelter-payouts for each chain before submitting.

## testnet-receipts-unlisted [low, client] Production receipts for testnet transactions show the red "not a listed ShelterSplit contract" warning and no share card

- File: client/components/shelter-payouts/receipt.ts:90
- Evidence: client/public/shelter-payouts/deployments.json is `[]`, and a:ingest publishes only mainnet entries, so receipt.ts marks every testnet payout as unlisted.
- Impact: If a submission links a testnet receipt on tokentails.com (for example Tameion x402 on Arc testnet), the judge sees a security-style warning. Mainnet receipts look the same until the ingest is committed.
- Fix: In submission drafts, link only mainnet receipts, or explorer URLs for testnet. Or publish testnet entries with `network: "testnet"`, and have ShelterPayouts, campaignProgress and the Heist total skip network === "testnet" while the receipt still lists them.

## A1 [blocker, tooling] The gitignored mainnet wave scripts were stale: no Tempo gas multiplier and no cast proof path (now regenerated)

- File: funding/framework/tracks/a-build/wave/deploy-mainnet.sh:102
- Evidence: Checked: wave/ is gitignored (.gitignore:1). The current deploy-mainnet.sh has CAST_PROOF_CHAINS='5042 4217' at line 43, and line 102 is `deploy tempo 4217 ... '--tempo.fee-token' '0x20c0...0000' '--gas-estimate-multiplier' '500'`. The rows are only arbitrum, arc, tempo and avalanche. deploy-mainnet-eurc.sh has CAST_PROOF_CHAINS='5042' and rows for arc and avalanche only. Both pass `/bin/bash -n`.
- Impact: With the old script, the Tempo mainnet deploy ran out of gas, so the Colosseum Tempo track was lost. The Arc proof payout also failed in forge simulation, so there was no {ARC_TX} for Arc Microgrants or Tameion.
- Fix: Already applied: `fund a:wave --network mainnet --chains arbitrum,arc,tempo,avalanche` and `fund a:wave --token EURC --chains arc,avalanche`. Because wave/ is gitignored, regenerate these scripts after any later chains.json or wave.mjs change, before running the wave.

## A2 [blocker, tooling] proof_cast aborted the whole wave under macOS bash 3.2 when the extra-args array was empty (Arc)

- File: funding/framework/tracks/a-build/wave.mjs:218
- Evidence: Checked: lines 218, 220 and 221 now use `${fa[@]+"${fa[@]}"}`. Under /bin/bash 3.2 with `set -u`, the guarded form prints `x y` then `after`, while the unguarded `"${fa[@]}"` fails with `unbound variable`. Arc has no forgeArgs, so fa is empty there.
- Impact: Before the fix, Arc deployed and then the script exited. There was no proof payout, Tempo and Avalanche were never deployed, and ingest and publish never ran. This affects Arc Microgrants, Tameion and Colosseum.
- Fix: Already applied: guarded expansion `${fa[@]+"${fa[@]}"}` at all three cast send calls, carried into the regenerated wave/*.sh.

## A4 [high, tooling] a:ingest recorded deploys whose forge broadcast failed or had no receipt

- File: funding/framework/tracks/a-build/wave.mjs:256
- Evidence: Checked: mined(run, t) at lines 256-262 returns 'ok', 'pending' or 'failed' from the receipts array. A file with no receipts key (the cast-written proof file) counts as 'ok'. cmdIngest (lines 299-303) records only entries with mined === 'ok' and prints why the others were not recorded, with an a:record hint. The out-of-gas Tempo testnet run (receipts: []) shows the case. The framework test suite passes 402/402.
- Impact: Before the fix, a failed Tempo deploy could be written to deployments.json and published to /shelter-payouts and the Heist pages. That would unblock submissions whose {SPLIT_ADDRESS} has no code behind it, and the next wave would skip that chain.
- Fix: Already applied, with a regression test for the failed-receipt and no-receipt cases.

## A5 [high, tooling] Re-running the wave after a partial failure redeployed every chain that had already succeeded

- File: funding/framework/tracks/a-build/wave.mjs:185
- Evidence: Checked: deploy() now skips a chain when broadcast/DeployShelterSplit.s.sol/<id>/run-latest.json is newer than $SELF and holds a ShelterSplit CREATE for the same token with a 0x1 receipt. FORCE_REDEPLOY=1 overrides the skip. SELF is resolved before `cd "$PROJECT"` (line 151). The guard is limited: if the script is regenerated before ingest runs, the broadcast is older than the script and the guard does not fire. a:wave only drops chains that are already in deployments.json.
- Impact: Duplicate mainnet instances on arbitrum, arc and avalanche cost gas and leave two entries per chain, so there is no clear {SPLIT_ADDRESS} in the drafts.
- Fix: Already applied. Operational rule: after a partial run, run `fund a:ingest --network mainnet` before regenerating the script with a:wave.

## A3 [medium, tooling] PROOF_SHELTER set without PROOF_AMOUNT aborted the script under set -u after the first cast-proof chain had deployed

- File: funding/framework/tracks/a-build/wave.mjs:165
- Evidence: Checked: the preflight at lines 165-169 validates PROOF_SHELTER (0x address), PROOF_AMOUNT (positive integer) and PROOF_BPS (1..10000). Line 163 checks SHELTERSPLIT_TREASURY. Smoke run of wave/deploy-mainnet.sh under /bin/bash 3.2 with stub cast and forge, PROOF_SHELTER set and PROOF_AMOUNT unset: it prints the PROOF_AMOUNT message and exits before any deploy.
- Impact: This needs an operator mistake to trigger. When it did, Arc was deployed but not recorded, the later chains were skipped, and there was no ingest.
- Fix: Already applied. Severity lowered from high to medium because it only happens on an operator error.

## A6 [medium, tooling] The published deployment list gave no symbol or decimals for EURC instances, so EURC payouts were labelled USDC

- File: funding/framework/tracks/a-build/wave.mjs:338
- Evidence: Checked: publish now adds `symbol` and `decimals` from splitToken(ni, token) for a non-default token. client/components/shelter-payouts/rpc.ts:50 reads `d.symbol || deploymentToken(d) || known?.symbol`, so the new field is used. The table in catnip-heist/src/ui/payouts.ts still lists 'USDC' for 5042 and 43114, so its deployment-level override (being fixed in another session) must read d.symbol.
- Impact: The EURC proof payout would show as USDC in front of the Arc and Circle judges.
- Fix: Already applied on the publish side. Before the Heist redeploy, confirm that catnip-heist/src/ui/payouts.ts prefers the deployment's symbol and decimals over the chain table.

## A8 [medium, ops] Monad mainnet has no USDC address and no verifier, so neither a Monad deploy nor source verification can happen before Oct 13

- File: funding/framework/tracks/a-build/chains.json:349
- Evidence: Checked: monad.networks.mainnet has `usdc: null`, `verify: true` and no verifier key. The notes give a candidate 0x7547...b603 from a summarised Circle page that must be checked digit by digit. WHAT-WE-ARE-MISSING row 5 already says 'Decide on Monad: chain 143 isn't in the wave'.
- Impact: The Monad Metropolis entry (Oct 13) has no deployed {MONAD_SPLIT} and no verified source.
- Fix: A human checks the USDC address on developers.circle.com and docs.monad.xyz, and the verifier endpoint (likely a monadvision or Sourcify verifier). Then set usdc and verifier in chains.json and run `fund a:wave --network mainnet --chains monad`. Do this only after the Monad rules confirm whether the entry needs mainnet or testnet.

## A7 [low, tooling] The cast calls whose output source verification parses did not suppress the nightly warning

- File: funding/framework/tracks/a-build/wave.mjs:402
- Evidence: Checked: QUIET_ENV() (line 402) is now passed to the `cast call` reads in constructorArgs and to `cast abi-encode` in verifySource.
- Impact: A nightly banner on stdout could make source verification fail with 'constructor arguments unknown' when run from a shell without the export.
- Fix: Already applied.

## A9 [low, ops] The Arc mainnet blockscout verifier URL is assumed, not confirmed

- File: funding/framework/tracks/a-build/chains.json:29
- Evidence: Checked: arc.mainnet.verifier = {type: blockscout, url: https://explorer.arc.io/api/, note: 'mainnet endpoint assumed by analogy'}.
- Impact: If the URL is wrong, ingest reports the source as not verified and exits 1. The deploy and publish are unaffected. Unverified source on Arc costs credibility with the Arc Microgrants judges.
- Fix: Before the wave, check the Arc mainnet explorer's API path. If verification fails, correct verifier.url and run `fund a:verify-source arc mainnet`.

## S1 [blocker, ops] The live API that every crypto entry links to returns 404

- File: funding/framework/applications/tameion/draft.md:30
- Evidence: I re-checked with WebFetch on 2026-10-02: https://api.tokentails.com/shelter/agent/cat-card returns HTTP 404. The Tameion Summary and 'What the agent does' (lines 26-30) give this URL as the live endpoint. Arc, Arbitrum, Monad and Colosseum describe the treat flow in the present tense. The deployed backend does not include 9734bed0 (WHAT-WE-ARE-MISSING item 4).
- Impact: A judge who clicks the link gets a 404 on the only user flow and the only agent flow. That fails Arc's 'deployed and working' gate and costs functionality points in every entry.
- Fix: This needs the DO console. Repoint the DigitalOcean app at GitHub main with source_dir backend and redeploy. Then confirm that GET /shelter/donate/status and GET /shelter/agent/cat-card return 200 (402 is the expected answer for cat-card) before any submit. If it is still down on Oct 3 evening, change the Arbitrum treat sentence to 'built; switching on' before you submit.

## S2 [blocker, submissions] No Arbitrum deployment and no Arc mainnet deployment exist

- File: funding/framework/tracks/a-build/deployments.json:1
- Evidence: deployments.json still holds only tempo testnet (0x9978…598d) and arc testnet (0x457c…b147). The Arbitrum rules say 'must be deployed on an Arbitrum chain'. The Arc call excludes testnet-only builds. The drafts now use the {ARB_NETWORK} and {ARB_SPLIT} placeholders.
- Impact: The Arbitrum entry (Oct 4) is void without a deploy. Arc (Oct 7) cannot be submitted without the mainnet wave.
- Fix: Run the mainnet wave and record the deploys with `fund a:record`. If Arbitrum One slips, deploy to Arbitrum Sepolia by Oct 3, because the page accepts testnet. Fill {ARB_NETWORK}, {ARB_SPLIT}, {SPLIT_ADDRESS} and {ARC_TX}, then regenerate submission.md. arbitrum-singapore/call.md 'next' still says 'a:record arbitrum mainnet' and does not list {ARB_NETWORK}; record Sepolia there if that is the network used.

## S3 [medium, submissions] The Arbitrum deadline still read '15:59 UTC' in the program table

- File: CLAUDE.md:104
- Evidence: The tracker row at line 54 and the program's 'verify' list already use the SGT worst case (submit by Oct 4 10:00 Vilnius). The program table at line 104 still said 'Oct 4 15:59 UTC'.
- Impact: Two times in the same tracker could lead someone to plan the submit for 18:59 Vilnius, which is 8 hours after the SGT close.
- Fix: FIXED: line 104 now reads 'Oct 4 15:59, zone not shown (SGT worst case: 10:59 Vilnius)'. Submit on Oct 3 evening.

## S6 [medium, submissions] Monad has no USDC address set, and the draft falsely called moving the treat to Monad 'a config change'

- File: funding/framework/applications/monad-metropolis/draft.md:49
- Evidence: chains.json monad.mainnet and testnet still have "usdc": null. Chain 143 is now in client/components/shelter-payouts/chains.ts, so that part is already fixed. The backend treat flow pays native coin through donate() and has hard-coded Arc RPC and explorer links (shelter-onchain.config.ts lines 3-9 and 84-90). On Monad the native coin is MON, so moving the treat there is not a config change. Circle's address page lists Monad USDC as 0x7547…b603 (mainnet) and 0x534b…43A3 (testnet).
- Impact: The wave cannot deploy the Monad instance without a token address. The 'config change' claim is false, and a judge can check it in the repo.
- Fix: FIXED the wording in draft.md and submission.md: 'on Monad the native coin is MON, so moving the treat to Monad needs the backend to use the USDC disburse path, which is not built yet.' I recorded the Circle-listed candidate addresses in the chains.json notes. I left usdc null because the summarising fetch may have garbled the digits. Before the Monad wave, check the digits on developers.circle.com and set usdc.

## S15 [medium, submissions] No demo video exists, and the demo field is empty or missing in every call.md

- File: funding/framework/applications/arc-microgrants/call.md:14
- Evidence: arc-microgrants/call.md has demo: "". Tameion, Colosseum, Monad and Arbitrum call.md have no demo: key. The {DEMO_URL} placeholder is now unified across the drafts. Tameion (3 min or less), Colosseum (demo plus pitch, so {PITCH_VIDEO_URL} too) and Monad require a video.
- Impact: A required field is missing, so the entry can be rejected or score lower.
- Fix: Record the demo of 3 minutes or less after the API is live (S1), plus the Colosseum pitch. Set demo: in each call.md, fill {DEMO_URL} and {PITCH_VIDEO_URL}, and regenerate the submissions.

## S14 [medium, submissions] No entry names any team member (Colosseum judges the team)

- File: funding/framework/applications/colosseum-worlds-fair/draft.md:52
- Evidence: The Team section at line 52 names nobody, and FACTS.md has no founder facts. Colosseum rules s.8(f) score team execution.
- Impact: This loses points on the Colosseum team criterion.
- Fix: This needs facts from the founders. Add each founder's name, role and a one-line background to FACTS.md, then add them to the Colosseum Team section, and to Tameion and Monad if there is room.

## S16 [low, submissions] The ShelterSplit README and LICENSE exist locally but are untracked, so the linked repo folder still shows neither

- File: funding/framework/tracks/a-build/shelter-split/README.md:1
- Evidence: git status lists shelter-split/LICENSE and shelter-split/README.md as untracked (??). Every entry says 'MIT, at github.com/zbagdzevicius/tokentails' and links that folder.
- Impact: Until these are pushed, judges land on bare code with no README or license, which costs open-source and credibility points.
- Fix: The user should commit and push both files before the Oct 3 Arbitrum submit (I did not run git writes). After the deploy wave, add the mainnet addresses and explorer links to the README.

## OPS-1 [blocker, ops] Arbitrum Singapore registration and submission times assumed UTC, but the page shows no time zone

- File: CLAUDE.md:46
- Evidence: The tracker rows (CLAUDE.md:46 and :55) now say 'Oct 2, by 12:00 Vilnius' and 'Oct 4, by 10:00 Vilnius', and spell out both the Singapore-time and UTC readings. arbitrum-singapore/call.md:6 now reads deadline: "2026-10-04T15:59:00+08:00". The page shows only 'Oct 2 17:01' and 'Oct 4 15:59'.
- Impact: If the times are Singapore time, registration closes Oct 2 at 12:01 Vilnius and the submission closes Oct 4 at 10:59 Vilnius. The earlier tracker said 20:01 and 18:59. Missing either one ends the entry.
- Fix: FIXED in CLAUDE.md and arbitrum-singapore/call.md (verified). NEEDS USER: register on HackQuest right away, before 12:00 Vilnius on Oct 2, and submit on the evening of Oct 3.

## OPS-6 [blocker, ops] The live backend runs an old build from GitLab, so the live gift and agent endpoints the submissions cite return 404

- File: funding/WHAT-WE-ARE-MISSING.md:16
- Evidence: WHAT-WE-ARE-MISSING.md:7 and :16 record that the DigitalOcean app deploys from GitLab tokentails-be (build from Jul 28) and that /shelter/donate/status and /shelter/agent/cat-card return 404. backend/src/app.module.ts:130 sets private_key from (process.env.FB_PRIVATE_KEY || ''); with an empty key, firebase-admin cert() fails to parse it and boot fails. No DigitalOcean app spec is tracked in the repo. I did not re-check the live URLs because network calls were not allowed.
- Impact: The only live user flow in the Arc, Colosseum, Tameion, Arbitrum and Monad entries fails for judges. Arc requires the product to work on mainnet at submission.
- Fix: NEEDS USER: first diff the GitLab repo against GitHub for hotfixes. Then point the DigitalOcean app at GitHub zbagdzevicius/tokentails, branch main, source_dir backend. Set FB_PRIVATE_KEY, TRUST_PROXY=1, SHELTER_*, STELLAR_* and SENDGRID_FROM_EMAIL as encrypted env vars, and deploy committed main. Confirm /shelter/donate/status returns 200 and that X-PAYMENT-RESPONSE is in the CORS exposed headers. Before 2026-10-08 23:00Z, run backend/scripts/skip-codex-cycle.js --period 2026-10 --apply.

## OPS-7 [blocker, ops] No mainnet deployment exists, and Arc, Colosseum and Arbitrum need one

- File: funding/framework/tracks/a-build/deployments.json:1
- Evidence: deployments.json lists only Tempo testnet (42431) and Arc testnet (5042002). shelter-split/broadcast/*/5042 and */42161 hold only dry-run/. client/public/shelter-payouts/deployments.json is []. Every submission still contains {SPLIT_ADDRESS} and {ARC_TX}.
- Impact: Arc excludes testnet-only builds. Colosseum's mainnet_required gate fails. The Arbitrum draft's 'live on Arbitrum One' is untrue, and the payouts page is empty.
- Fix: NEEDS USER: fund the deployer wallets and run the mainnet wave plus forge verify-contract. Then run fund a:ingest and fund a:submission, commit the deployment lists and push so Vercel redeploys. If Arbitrum mainnet is not live by Oct 3, deploy on Arbitrum Sepolia and change 'live on Arbitrum One' in the Arbitrum draft.

## OPS-2 [high, tooling] `fund check` missed single-brace placeholders such as {SPLIT_ADDRESS} and {DEMO_URL}

- File: funding/framework/lib/core.mjs:190
- Evidence: core.mjs:190 PLACEHOLDER now also matches \{[A-Z][A-Z0-9_]*\}. Every draft uses single-brace placeholders, for example tameion/draft.md:57 with {SPLIT_ADDRESS} and {ARC_TX}.
- Impact: Without the fix, a submission with literal placeholders would pass the pre-submit check.
- Fix: FIXED (regex verified in core.mjs:190). Run fund check --strict on every entry before pasting it.

## OPS-3 [high, submissions] The repo link in every submission pointed at a folder with no README or LICENSE

- File: funding/framework/tracks/a-build/shelter-split/README.md
- Evidence: shelter-split/ now contains README.md (4.2K) and LICENSE. Root README.md:37 and :86-87 now list ShelterSplit and its MIT license. These files are uncommitted, and the submissions link to tree/main.
- Impact: Judges who open the repo link see a bare folder until this is pushed to main.
- Fix: FIXED locally. NEEDS USER: commit and push to main before the first submission (Arbitrum, Oct 3), and add the mainnet addresses to the README after a:ingest.

## OPS-4 [high, submissions] The Tameion entry did not disclose prior ShelterSplit work or the parallel Arc entry

- File: funding/framework/applications/tameion/draft.md:57
- Evidence: tameion/draft.md:57 and submission.md:56 now say 'ShelterSplit's ERC-20 split core, written from 2026-09-25, two days before the window opened. We also entered this work in Arc Microgrants.'
- Impact: Leaving out prior work risks disqualification under Tameion's build-window rule.
- Fix: FIXED (verified in both draft.md and submission.md).

## OPS-5 [high, submissions] The generated submission.md files were stale: Arc still claimed written consent and Colosseum listed several tracks

- File: funding/framework/applications/arc-microgrants/submission.md:29
- Evidence: All five submission.md files were regenerated Oct 2 at 11:28:59, after their drafts (11:27-11:28). Arc has 0 'consented in writing' hits, and colosseum submission.md:15 shows 'Tempo track' only.
- Impact: Pasting a stale file would submit an unverified consent claim to Arc and an unconfirmed multi-track entry to Colosseum.
- Fix: FIXED. Re-run fund a:submission after every draft edit. Add the consent claim back only after the signed Pink Paw letter is filed.

## OPS-8 [high, ops] Whether a Tameion prize makes the Arc grant ineligible is still unanswered

- File: funding/framework/applications/arc-microgrants/call.md
- Evidence: The Arc call excludes work already funded by a Circle or Arc program, and Tameion is run by Canteen with Circle and Arc. Tracker row CLAUDE.md:56 ('ask Canteen whether a Tameion prize affects Arc Microgrants eligibility') is still open.
- Impact: A Tameion payout before Arc decides (by Oct 21) could cost the $500 Arc grant.
- Fix: NEEDS USER: ask Arc and Canteen today and keep the written answers. Submit Arc on Oct 7. If a Tameion prize would disqualify the Arc grant, defer or decline the Tameion prize.

## OPS-9 [high, ops] Registrations needed to submit are still open: Colosseum members and Team Leader, the Tameion invite, the Monad login

- File: CLAUDE.md:43
- Evidence: CLAUDE.md:43, :47 and :56 are still open. monad-metropolis/call.md:6 is deadline: 2026-10-13, with no time or zone.
- Impact: Colosseum disqualifies unregistered members, and its prize goes only to the Team Leader's own Solana wallet. Tameion cannot be entered without an invite. The Monad deadline could be missed.
- Fix: NEEDS USER: register every Colosseum member and name the Team Leader, who needs a Solana wallet in their own name. Request the Tameion invite. Log in to Monad and write the exact deadline and time zone into monad-metropolis/call.md and the tracker.

## OPS-14 [medium, ops] Required videos don't exist yet, and every demo: field is empty

- File: funding/WHAT-WE-ARE-MISSING.md:337
- Evidence: demo: "" at line 14 of the call.md for arc-microgrants, colosseum-worlds-fair, tameion, monad-metropolis and arbitrum-singapore. Colosseum asks for a 2-3 minute pitch and a demo of 3 minutes or less (call.md:44). Monad requires a demo video (call.md:44).
- Impact: The Tameion and Monad entries are incomplete without a video, and Colosseum scores drop without the pitch.
- Fix: NEEDS USER: record and upload the videos (Arbitrum's by Oct 3 if the form asks for one, the rest by Oct 5). Set demo: in each call.md, then re-run fund a:submission and fund check.

## OPS-10 [medium, submissions] Monad is not set up: no USDC address, no deploy and no payouts-page entry

- File: funding/framework/tracks/a-build/chains.json:358
- Evidence: chains.json:358 is "usdc": null for Monad mainnet (143), and line 362 marks it UNVERIFIED. The testnet entry (10143) is also null. No a-build script or client/components/shelter-payouts/chains.ts mentions monad or 143.
- Impact: The Monad entry (Oct 13) would have no deployment and nothing to show on the payouts page.
- Fix: NEEDS USER decision by Oct 3: either verify the Monad USDC address on docs.monad.xyz, fill chains.json, and add Monad to the deploy wave and chains.ts; or deploy on testnet 10143 if the rules allow it; or drop the Monad entry.

## OPS-11 [medium, submissions] The Arbitrum entry listed Robinhood Chain with nothing deployed there

- File: funding/framework/applications/arbitrum-singapore/call.md:11
- Evidence: call.md:11 is now chain: arbitrum, and arbitrum-singapore/*.md has no Robinhood mention.
- Impact: Judges could read it as a false claim to the Robinhood prize.
- Fix: FIXED (verified).

## OPS-13 [medium, ops] The funding/.secrets/ ignore rule is uncommitted, and public main exposes grant strategy files

- File: .gitignore:9
- Evidence: In the working tree, .gitignore:9 is funding/.secrets/, but HEAD's .gitignore has 0 'secrets' matches. Tracked files include client/.env.production, client/.env.app, cms/.env.development and cms/.env.production (not read). funding/ is tracked on public main.
- Impact: A fresh clone or worktree would not ignore .secrets, so a secret could be committed by mistake. Judges who browse the repo would also see the odds math and win reviews.
- Fix: NEEDS USER: commit .gitignore now. Confirm the tracked client/cms .env files hold only public values. Consider moving the strategy docs in funding/ off public main.

## Fix reports

FINDINGS REPORT (backend)

SH-1 (high), x402 payment undercounted when shelters hold < 10000 bps: **fixed** (the fix was already in the working tree; I checked it and added tests)
- I checked the code against the contract source. `ShelterSplit._split` emits `NativeDisbursed` only for each active shelter's share and sends the treasury remainder without its own event. `NativeDisbursementBatch.amount` is the full `msg.value`. The ABI string in `/Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-chain.ts` matches the Solidity event field for field.
- `verifyReceipt` in `/Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-x402.service.ts` only counts logs from the split address with memo `x402:<nonce>`. It then uses the larger of the batch total and the summed shares. The existing spec already covered the 8000-bps treasury case.
- Test added in `/Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-x402.service.spec.ts`: `ignores a NativeDisbursementBatch that %s` (2 cases). A batch event with another memo, or one not emitted by the split contract, must not count toward the price. The service then answers 402 "below" and records no used tx. This stops a forged batch log from passing as payment.

SH-2 (medium), testnet receipts linked to the mainnet Arc explorer: **fixed** (already in the working tree; checked, no code change needed)
- `explorerTxUrl(txHash, chainId)` in `/Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-onchain.config.ts` maps chain 5042 to `explorer.arc.io` and 5042002 to `explorer.testnet.arc.io`. An unknown chain falls back to mainnet.
- An existing spec covers both chains, so I added no new test (`/Users/zygimantasbagdzevicius/me/tokentails-app/backend/src/shelter/onchain/shelter-donate.service.spec.ts` L352-355).
- I did not change `funding/e2e/README.md`. The note at L186-188 still describes this as an open bug and needs removing, but that file is outside the backend area I was allowed to edit.

CHECKS
- Backend `npm test`: 82 suites passed, 5 skipped; 1280 tests passed, 45 skipped, 0 failed.
- `npx jest src/shelter`: 5 suites, 107 tests, all passed.
- `npx eslint src/shelter`: clean, after `--fix` applied a Prettier wrap to the new test.
- `npx tsc --noEmit`: no errors.
- I did not run the full `npm run lint`.

NEEDS THE USER (not done)
1. Commit the uncommitted SH-1 and SH-2 fixes together with the other shelter changes. Then redeploy the backend before any Arc, Colosseum or Monad demo that uses a split under 10000 bps or the testnet explorer links. Until then the live backend still has both bugs.
2. After the redeploy is confirmed, relax the 10000-bps hard gate in `funding/e2e/e2e.mjs` L202-203. Keep it until then.
3. Remove the stale known-issues note at `funding/e2e/README.md` L186-188.

---

One of the five findings needed new code, and I fixed it (getlogs-range-fallback). Three were already fixed in the working tree, and I added a test for one of them. The fifth, the Heist rebuild, is still open because it needs you. None of this is committed or deployed. Checks:
- **Client jest:** 1793 passed, 0 failed (shelter tests: 61).
- **`tsc --noEmit` and eslint:** no errors on the changed files.
- **catnip-heist `payouts.test.ts` (vitest):** 8 of 8 pass.

**Findings**

- **client-eurc-mislabelled: already fixed in source, not committed.** I re-checked `rpc.ts` (`deploymentToken`, `resolveChain`). Its tests (`client/__test__/shelter-deployment-token.test.ts`, `shelter-campaign.test.ts`) pass. I made no further edits. It needs a commit and a deploy before Oct 7.

- **heist-eurc-summed-as-usdc: skipped, needs you.** The source (`catnip-heist/src/ui/payouts.ts`) is fixed and its tests pass. The served bundle `client/public/heist-game/build/index-CvoLmf5T.js` still has 0 matches for "EURC". I did not run `npm run build:client`, because the rebuild would put about 50 uncommitted catnip-heist files from other sessions into the served bundle (levels, render, sim, ui). Review those, rebuild, check with `grep -l EURC client/public/heist-game/build/*.js`, then commit the source and the build together.

- **give-signin-for-closed-jar: already fixed, and I added a test.** The code is unchanged. The new test is `client/__test__/shelter-give-closed.test.tsx`. It covers a signed-out visitor in three closed cases: backend unreachable, rail paused, and today's budget spent. In each, the button is disabled, it does not say "sign in", and clicking it opens no sign-in. A fourth case confirms the sign-in label still shows when a treat can be sent. Still needs you:
  - Commit and deploy the fix.
  - Make `/shelter/donate/status` and `POST /shelter/donate` live in production (WHAT-WE-ARE-MISSING item 4).

- **monad-chain-missing: partially fixed.** Chain 143 is in both source tables (`client/components/shelter-payouts/chains.ts`, `catnip-heist/src/ui/payouts.ts`). For the Heist it only goes live with the rebuild above. Confirm the Monad RPC URL (rpc.monad.xyz) during the Monad deploy.

- **getlogs-range-fallback: fixed in the client; the data side and the Heist side are open.**
  - **What changed:** when the full-range query fails, `client/components/shelter-payouts/rpc.ts` now calls a new `getLogsWindowed()`.
    - It starts with 10,000-block windows (`LOG_WINDOW`) and halves the window after each rejected request, down to 2,048 (`MIN_LOG_WINDOW`).
    - The old 500k-block limit is gone. The loop stops after 400 requests (`MAX_LOG_REQUESTS`) with an error saying to set "fromBlock".
  - **New test:** `client/__test__/shelter-getlogs-window.test.ts` covers the default window, halving with every block covered exactly once, the error at the minimum window, a 1M-block range, and the request-cap error.
  - **Not done, outside the client area:**
    - `wave.mjs` (around lines 307-309) should copy the deploy receipt's `blockNumber` into `fromBlock`.
    - `client/public/shelter-payouts/deployments.json` is currently `[]`.
  - **Not done in the Heist:** `catnip-heist/src/ui/payouts.ts` (around lines 114-123) still makes one `eth_getLogs` call and silently leaves the chain out if it fails. Setting `fromBlock` on every deployment is the practical fix there.
  - **Before submitting:** load /shelter-payouts for each chain.

There is also a stray untracked file named `client/public/heist-game/}` in git status that `ls` could not open. Check it and remove it before committing.

**Files I changed or added:**
- `/Users/zygimantasbagdzevicius/me/tokentails-app/client/components/shelter-payouts/rpc.ts`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/client/__test__/shelter-getlogs-window.test.ts`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/client/__test__/shelter-give-closed.test.tsx`

---

All nine findings are fixed. Seven were already in place and I confirmed them in the current files. I extended two (A5 and OPS-2), and in A5's case that was because the fix still left a defect that could cost a mainnet proof payout. The framework suite passes 404/404 (it was 402), and both regenerated mainnet scripts pass `bash -n` under the macOS `/bin/bash` 3.2.57.

**New defect in A5 (fixed):** the re-run guard did stop duplicate deploys, but a chain it skipped never retried its proof payout. A typical case: Arc deploys, its proof payout fails, and the operator re-runs the script. Arc is now skipped as "already deployed" and still has no proof payout, so there is no {ARC_TX} for Arc Microgrants or Tameion. Separately, when every chain was skipped, the final `a:ingest` never ran.
- **Change in `wave.mjs`:** a skipped chain is recorded as "deployed by an earlier run". The proof is retried when no successful disburse was recorded after the script was generated. The new `proof_done()` decides this: it accepts a forge broadcast whose disburse receipt is `0x1`, or the cast-written file. The owner-vs-deployer check now lives in one `maybe_proof()` helper used on both paths. Ingest runs if at least one chain was deployed in this run or an earlier one.
- **Smoke tests:** I ran a copy of the script against a scratch project with stub cast and forge.
  - When a proof was missing, Arc retried it with cast and Arbitrum and Avalanche retried with forge.
  - Tempo's completed proof was not repeated, and a forge proof with receipt `0x1` was not repeated.
  - A forge proof with receipt `0x0` was retried.
  - Ingest ran when every chain was skipped.

| ID | Status | What I checked |
|---|---|---|
| SC-2 | fixed | Regenerating `deploy-mainnet.sh` and `deploy-mainnet-eurc.sh` from `wave.mjs` gave files identical to the ones on disk. A dry run with stubs showed Tempo getting `--tempo.fee-token … --gas-estimate-multiplier 500`. I regenerated both again after my A5 change. |
| SC-3 | fixed | With `SHELTERSPLIT_OWNER` set to a different address, each chain printed "proof skipped" and made no `addShelter` call. |
| A1 | fixed | Same as SC-2. Rows are arbitrum, arc, tempo and avalanche (Arc and Avalanche only for EURC). `CAST_PROOF_CHAINS` is `'5042 4217'` (`'5042'` for EURC). |
| A2 | fixed | A broadcast run on the macOS bash 3.2 (default `/bin/bash`) showed Arc's three cast sends running with no extra arguments, and Tempo's with the gas multiplier stripped. The script carried on to Tempo and Avalanche. |
| A3 | fixed | The preflight checks are present in the script. |
| A4 | fixed | Ingest records only mined deploys. The existing regression test passes. |
| A5 | fixed, extended | See above. New test at the end of `test/track-a-wave.test.mjs`. |
| A6 | fixed (publish side) | Publish writes `symbol` and `decimals` for EURC instances, and the test passes. |
| OPS-2 | fixed, test added | The regex was already fixed but had no test. The new test in `test/core.test.mjs` checks that `{SPLIT_ADDRESS}` and `{ARC_TX}` are errors on a `ready` entry, and that JSON braces and lowercase `{shelter}` are not. |

**Left for you:**
1. **Owner key for the proof:** if a Safe is set as `SHELTERSPLIT_OWNER`, the proof payout (`addShelter` plus disburse) has to be done from the Safe. Then add the transaction hash to `proofTxs` in `deployments.json`.
2. **Script regeneration:** `wave/` is gitignored. After any change to `chains.json` or `wave.mjs`, regenerate the scripts on the machine that runs the deploy. After a partial run, run `fund a:ingest --network mainnet` before running `a:wave` again.
3. **Placeholder warnings:** `fund check` now shows placeholder warnings for arbitrum-singapore, arc-microgrants, colosseum-worlds-fair, monad-metropolis and tameion. They need mainnet addresses and transaction hashes. Run `fund check --strict` on each before pasting it. I found no Anitya application folder.
4. **Heist labels (A6 follow-up, another session's area, not edited):** `deploymentUnits()` in `catnip-heist/src/ui/payouts.ts` reads `d.token` rather than `d.symbol`/`d.decimals`. EURC still shows as EURC because ingest records `token: "EURC"` and EURC also uses 6 decimals.
5. **Testnet scripts:** `deploy-testnet.sh` and `deploy-testnet-eurc.sh` are still stale (no A2 fix). I left them because the testnet end-to-end runs already pass. Regenerate them before any further testnet run.

I made no git writes or network calls and read no `.env` or secrets files. The smoke tests used stubbed cast and forge against a scratch project.

Files changed:
- /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/wave.mjs
- /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/test/track-a-wave.test.mjs
- /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/test/core.test.mjs
- /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/wave/deploy-mainnet.sh (regenerated, gitignored)
- /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/wave/deploy-mainnet-eurc.sh (regenerated, gitignored)

---

SC-1 is partly fixed and S2 is partly fixed. The other nine findings were either already fixed in the working tree or need the user. I changed only docs, no code, so I added no tests. The framework `npm test` passes (402 of 402) and `fund check arbitrum-singapore` passes (1/1). It warns that the deadline is 2 days away, that F-003 is an unverified fact, and that the draft still has its placeholders, which is expected.

**SC-1: partly fixed.** I added an "Excluded Folders" section to `/Users/zygimantasbagdzevicius/me/tokentails-app/COMMERCIAL_LICENSE.md`. It says the commercial licence does not cover `funding/framework/tracks/a-build/shelter-split/` or `shelter-rail/`, and that both are MIT (see the `LICENSE` in each folder). I named only those two folders. I did not write a general "any folder with its own LICENSE" rule, because `contracts/` has its own licensing question still open (docs/CONTRACTS.md#licensing) and that rule would decide it.
- NEEDS USER: confirm MIT for ShelterSplit. `shelter-rail/LICENSE` is already committed as MIT.
- NEEDS USER: commit and push `shelter-split/LICENSE`, `shelter-split/README.md`, `README.md` and `COMMERCIAL_LICENSE.md` to main before Oct 3. Then point the drafts at the new commit instead of 9734bed0 and regenerate the submissions.

**S2: partly fixed.** In `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/applications/arbitrum-singapore/call.md`:
- `next` now gives Arbitrum Sepolia by Oct 3 as the fallback. It uses the correct command form, `fund a:record arbitrum mainnet|testnet <address> --tx <hash>`. It lists `{ARB_NETWORK}` and drops the `{REPO_URL}` placeholder, which the draft no longer uses. It says to submit on the evening of Oct 3, with the Singapore-time worst case at 07:59 UTC (10:59 Vilnius).
- The eligibility gate line said "15:59 UTC". It now says the zone is not shown and to plan for Singapore time, as in S3.
- NEEDS USER: do the deploy wave (Arbitrum, plus Arc mainnet), record it with `fund a:record`, fill `{ARB_NETWORK}`, `{ARB_SPLIT}`, `{SPLIT_ADDRESS}` and `{ARC_TX}`, then run `fund a:submission`.

**Already fixed; I checked the current files:**
- **S3:** the CLAUDE.md row now shows the deadline with the SGT worst case.
- **S6:**
  - The "MON / USDC disburse path not built yet" wording is in both the Monad `draft.md` and `submission.md`.
  - The candidate Circle addresses are in the `chains.json` notes.
  - `usdc` stays null on purpose. NEEDS USER: check the address digits on developers.circle.com before the Monad wave.
- **OPS-3:** `shelter-split/README.md` and `LICENSE` exist. Pushing them is covered under SC-1.
- **OPS-4:** the Tameion draft and submission disclose the earlier ShelterSplit work and the parallel Arc entry.
- **OPS-5:** `fund check` reports the Arbitrum `submission.md` as up to date.
- **OPS-11:** the Arbitrum call now says `chain: arbitrum`, and Robinhood is not mentioned.

**Skipped, needs the user:**
- **S15:** record a demo video of 3 minutes or less and the Colosseum pitch. All five call.md files now have a `demo: ""` key, so only the URLs are missing. Then fill `{DEMO_URL}` and `{PITCH_VIDEO_URL}` and regenerate the submissions.
- **S14:** each founder's name, role and a one-line background need to go into FACTS.md, then into the Colosseum Team section (and Tameion and Monad if there is room).
- **OPS-10:** decide on Monad: verify the USDC address and add Monad to the deploy wave, deploy on testnet 10143 if the rules allow, or drop the entry. Chain 143 is already in `client/components/shelter-payouts/chains.ts`.

## Final check

All 14 checks pass: 0 failures, and the fixed code produced no regressions. Since nothing failed, no failure is attributable to other sessions' uncommitted work. Every count below was measured against the current working tree, which includes that work, so those changes neither break nor pass on their own.

| Check | Result |
|---|---|
| `forge test` (shelter-split) | PASS. 5 suites, 73 passed, 0 failed, 0 skipped |
| backend `npm run lint` | PASS (exit 0, no warnings shown) |
| backend `npm run build` | PASS (exit 0) |
| backend `npm test` | PASS. 82 suites passed, 5 skipped; 1280 tests passed, 45 skipped, 0 failed |
| client `npx tsc --noEmit` | PASS (exit 0, no output) |
| client `npm test` | PASS. 115 of 115 suites; 1793 of 1793 tests |
| catnip-heist `npm test` | PASS. 28 of 28 files; 472 of 472 tests |
| catnip-heist `npm run build` | PASS. Output went to `catnip-heist/dist`; the served `client/public/heist-game` bundle was not touched |
| funding/framework `npm test` | PASS. 404 of 404 |
| shelter-rail `node --test` | PASS. 17 of 17 |
| `fund check arbitrum-singapore` | 1/1 passing. Warnings: 2.0 days to the deadline, F-003 unverified, placeholders in Summary, Solution, How it works and On-chain proof |
| `fund check arc-microgrants` | 1/1 passing. Warnings: placeholders in On-chain proof and Team; mainnet is required but no Arc mainnet deployment is recorded |
| `fund check colosseum-worlds-fair` | 1/1 passing. Warnings: F-003 and F-004 unverified; placeholders in On-chain proof and Team; mainnet is required but no Tempo or Arbitrum mainnet deployment is recorded |
| `fund check monad-metropolis` | 1/1 passing. Warnings: F-003 unverified; placeholders in How it works and On-chain proof |
| `fund check tameion` | 1/1 passing. Warnings: F-003 unverified; placeholders in What the agent does, How it works, Traction and On-chain proof |

I found nothing that needed a new fix, and I made no edits, git writes or network calls.

- **Deadlines:** the deadlines in the `call.md` files match the Funding tracker in CLAUDE.md. Arc closes Oct 14 23:59 ET with a target submit date of Oct 7. Colosseum closes Oct 12 23:59 PT with a target of Oct 11. The "days left" counts in `fund check` are measured to those close dates.
- **Missing mainnet deployments:** "1/1 passing" does not mean the entries are ready. The missing mainnet deployments for Arc and Colosseum still block those two submissions. Run `fund check --strict` on each entry after the deploy wave.
- **Heist bundle not committed:** the whole served Heist bundle under `client/public/heist-game/` is untracked, including `build/index-CvoLmf5T.js`, `index.html`, fonts, cat images and `payouts/deployments.json`. If the site deploys from git, none of it ships until it is committed. That bundle is still the old build: rebuild it with `npm run build:client` before committing.
- **Stray file gone:** the stray `client/public/heist-game/}` file the client report mentioned no longer shows in git status.
- **Payouts list empty:** `client/public/shelter-payouts/deployments.json` is still `[]`, so the /shelter-payouts page shows no deployments.
- **Uncommitted changes:** git status lists 805 changed or untracked entries in total. That covers both our fixes and other sessions' work, and none of it is committed or deployed.

The "needs you" items in the four fix reports still apply: commit and redeploy, run the mainnet deploy wave and record it, record the demo and pitch videos, add the team details, confirm the MIT licence, and decide on Monad.