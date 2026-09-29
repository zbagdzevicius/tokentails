# Fast execution: one deploy wave, seven applications

> **Correction (2026-09-28):** `STRATEGY-PROOF.md` re-scored these programs against their live criteria and past winners. Only Arc Microgrants (15%) clears the 10% bar. Colosseum is ~2%, Dubai and Team1 ~5%, Circle ~2.5%, Mezo ~5%, and **Arbitrum DDA Gaming is closed**. Run the wave for Arc first; add the other chains only as optional, low-odds entries.

**Strategy:** do the one expensive human thing once, and let it feed everything. That thing is
deploying ShelterSplit to every chain that unlocks money, plus one real payout to one real shelter.
After that, each application is AI drafting plus a human submit click.

Seven applications depend on the deploy. By expected value (portfolio success × capital):

| Chain | Programs it unlocks | EV unlocked | Earliest deadline |
|---|---|---|---|
| Arbitrum | Colosseum World's Fair, Arbitrum DDA Gaming, Arbitrum Dubai buildathon | ~$11,600 | **Oct 12** (Colosseum) |
| Arc | Arc Microgrants, Circle Developer Grants | ~$1,775 (Circle rises to ~$10k at 20%) | **Oct 14** (Arc) |
| Avalanche | Team1 Avalanche | ~$1,250 | rolling |
| Mezo (MUSD) | Mezo Buildathon | ~$104 (45% chance) | **Oct 15** pre-registration |

Tempo (the other Colosseum chain) and Robinhood are skipped: Arbitrum covers both programs, Tempo
needs a Tempo-aware Foundry, and Robinhood has no USDC listed. Base unlocks nothing that pays today.

## The human part (~2 hours total, once)

| # | Step | Time | Unblocks |
|---|---|---|---|
| 1 | Make `funding/framework/tracks/a-build/shelter-split` a **public GitHub repo** and put its URL in `repo:` in each app's `call.md` | 15 min | Every Track A `ready` gate |
| 2 | `cast wallet import tokentails --interactive`, then `export FUND_KEYSTORE=tokentails` | 5 min | Signing |
| 3 | Fund the deployer with gas: ETH on Arbitrum, USDC on Arc (its gas token), AVAX on Avalanche, BTC on Mezo. A few dollars per chain. Add 1–5 USDC on each chain for the proof payout, and MUSD on Mezo. | 30 min | Deploys |
| 4 | Set a treasury address (a Safe is best) and export the RPC URLs (`RPC_ARBITRUM_MAINNET`, `RPC_ARC_MAINNET`, `RPC_AVALANCHE_MAINNET`, `RPC_MEZO_MAINNET`). Use your shell only, never a file. | 10 min | Deploys |
| 5 | **Create the shelter wallet** (the shelter consented; Token Tails holds it and hands it over later) and export `PROOF_SHELTER`, `PROOF_SHELTER_NAME`, `PROOF_AMOUNT=1000000`. Every submission must say "wallet held by Token Tails on behalf of <shelter>, to be handed over". | 30 min | The on-chain proof every reviewer asked for |
| 6 | Copy the MUSD address from explorer.mezo.org into `chains.json` (`mezo.networks.mainnet.splitToken.address`) | 5 min | Mezo |
| 7 | `DRY_RUN=1 tracks/a-build/wave/deploy-mainnet.sh`, then run it for real | 15 min | All seven |
| 7b | Optional, after step 7 has finished its ingest: `DRY_RUN=1 tracks/a-build/wave/deploy-mainnet-eurc.sh`, then for real. It deploys a second, EURC-paying instance on Arc and Avalanche (Arbitrum and Tempo have no Circle EURC and are skipped). | 10 min | EURC story for Arc |
| 8 | Pre-register on AKINDO (Mezo) | 5 min | Mezo |

Step 7 prints each chain's result. Afterwards it runs `fund a:ingest`, which records and verifies
every deployment and payout and re-renders each submission that is now unblocked.

## The AI part (runs while you do the above)

```sh
cd funding/framework
node bin/fund.mjs a:wave                     # regenerate the script after steps 4-6 (it shows what is still MISSING)
node bin/fund.mjs go                         # draft, check, review and revise every app in parallel (orc sessions)
node bin/fund.mjs queue                      # the human steps left, sorted by deadline
```

`fund go` needs each app's call text in `source.md`. The source step fetches it automatically
through an orc session. For AKINDO (a JavaScript page) paste it from the browser, or use the public
API JSON: `api.akindo.io/public/wave-hacks/OVOO0gdrVU8379D10`.

## Calendar

| Date | Action | Who |
|---|---|---|
| Sep 29 – Oct 3 | Steps 1–6; `fund go` drafts all 7 apps | human + AI |
| **Oct 4** | Run the wave (step 7). Arbitrum Singapore closes this day, and the wave makes it possible (5%, below the bar, so optional). | human |
| Oct 5–10 | `fund loop <slug>` until each draft scores; human-read of each | AI + human |
| **Oct 12** | Submit Colosseum (it pays individuals only, so a team member submits) | human |
| **Oct 14** | Submit Arc Microgrants | human |
| **Oct 15** | AKINDO pre-registration closes | human |
| Oct 16–26 | Mezo Wave 1: submit the MUSD deployment plus the payout | AI + human |
| After the wave | Submit Team1 Avalanche, Arbitrum DDA and Circle Developer Grants (rolling) | human |
| Nov 2–15 | Mezo Wave 2 (extend the integration) | AI |
| Nov 16 – Dec 6 | Arbitrum Dubai buildathon (extend ShelterSplit) | AI + human |

## Rules that keep this fast and safe

- **The framework never signs.** The wave script is generated, and a person reads it and runs it
  with their own keystore.
- **Dry run first.** `DRY_RUN=1` simulates every chain with the real RPCs and broadcasts nothing.
- **A chain that fails preflight is skipped, not guessed.** Preflight fails on a wrong chain ID, a
  missing RPC or an unknown token. The skipped chains are listed at the end.
- **Commit before you build.** Build evidence from uncommitted source blocks `ready`. Commit
  `shelter-split/`, then run `fund a:build --all`.
- **Hand ownership to a Safe** after the proof payout, using `transferOwnership` and then
  `acceptOwnership` from the Safe.
- **Keep balances minimal.** The contract holds nothing between disbursements, and the treasury
  receives any dust.

## What is already done

- `fund a:wave` and `fund a:ingest` (in `tracks/a-build/wave.mjs`): ranking, script generation,
  and ingest from the broadcast files, with 4 hermetic tests.
- `script/ProofDisburse.s.sol`: the proof payout in one forge script.
- Tested end to end on a local anvil chain: deploy, then payout (the shelter received 1 USDC), then
  ingest and on-chain verification.
- The Mezo chain and program profile are added. The MUSD address is still to be filled in.
- Seven Track A applications are scaffolded from the Colosseum draft, with fresh build evidence
  (41/41 contract tests).
- 2026-09-29, for Arc and Tempo: ShelterSplit gained `donate(memo)` / `receive()` (splits native
  value; on Arc that is USDC with 18 decimals, emitted as separate `NativeDisbursed` events so the
  18- and 6-decimal views are never added together), `disburseWithMemo(amount, bytes32)` (Tempo
  TIP-20 `transferWithMemo` on every payout) and `sweepNative`. EURC is a second payout token
  (`chains.json` `splitTokens`, `fund a:wave --token EURC`). 73/73 contract tests. The build
  evidence in the applications still says 41/41: commit, then re-run `fund a:build --all`.
- `tracks/a-build/wave/deploy-mainnet.sh` and `deploy-mainnet-eurc.sh` (arc, tempo, arbitrum,
  avalanche) and `deploy-testnet.sh` / `deploy-testnet-eurc.sh` (arc) are generated. Re-run `fund a:wave` after setting the env
  vars so its MISSING column clears.
