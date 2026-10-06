# Token Tails funding push: execution plan, 2026-09-30 to 2026-12-13

## Update 2026-10-05: what is current (read this before the dated rows below)

The rows below are the Sep 30 plan. Several of its assumptions changed:
- **Seven chains, not four:** Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain (USDG) and Monad.
  All seven have testnet ShelterSplits recorded in `framework/tracks/a-build/deployments.json`
  (EURC instances on Arc and Avalanche testnet; Robinhood testnet pays a test mUSDC). DonateRouters
  are recorded on the Arc, Base, Arbitrum, Avalanche and Monad testnets (plus EURC routers on Arc and
  Avalanche) in `router-deployments.json`. No mainnet contract is recorded yet.
- **The mainnet wave is one wallet and one command.** Send the per-chain amounts in
  `framework/tracks/a-build/funding-plan.json` (minimal profile, about $7.25; table in
  `USER-TODAY.md` §4) to the deployer. Then, from `funding/framework`, in your own terminal:
  `node bin/fund.mjs a:mainnet-plan --network mainnet`, then
  `CONFIRM_MAINNET=yes DRY_RUN=1 ./tracks/a-build/wave/mainnet-all.sh`, then the same without
  `DRY_RUN`. It checks balances, deploys the splits (EURC on Arc only) and the routers (Arc, Arbitrum,
  Avalanche, Base, Monad; EURC router on Arc), sends one 0.1-token proof payout per instance
  (`PROOF_AMOUNT=100000`), runs `a:ingest`, verifies, tops up the hot wallet and agent
  (`a:distribute`) and fills the drafts. It refuses to run inside an AI session. The mainnet treasury
  is `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A`. A one-week top-up later: `PLAN=topup node bin/fund.mjs
  a:distribute --network mainnet`. This replaces the per-script Oct 1–2 rows and the "1–5 USDC per
  chain" balances in section 4.
- **Public config is generated:** `backend/src/shelter/onchain/wallet.config.ts` is written by
  `fund a:ingest` (or `fund a:backend-deployments`). The backend needs only `SHELTER_CHAIN_ID` and
  `SHELTER_DONATE_PRIVATE_KEY` (see `docs/BACKEND.md`).
- **Treats and x402 are on by default**, on every chain with a recorded split of the main chain's
  network class. On a mainnet, x402, relay and match open only after the shelter's own wallet is
  claimed on that chain (the v2 claim message can name several chains). Emergency off switches:
  `SHELTER_DONATE_ENABLED=false`, `SHELTER_X402_ENABLED=false`, `SHELTER_HANDED_OVER=false`,
  `SHELTER_AUTO_CHAINS=off`. Wallet giving on mainnet still needs `NEXT_PUBLIC_WALLET_DONATE=true`
  and a handed-over shelter; the testnet "try it" block covers all seven testnets.
- **Also built since Sep 30:** crypto checkout (including Robinhood USDG and Monad USDC), a chain
  picker for sponsored treats, a multi-chain impact indexer, the Catnip Heist in-game payouts modal
  with the testnet proof, a multi-chain rail SDK and widget, submission images in
  `submission-images/`, and the run page `FUNDING-RUN.html`.
- **Foundry tests:** 149 pass (73 ShelterSplit, 50 DonateRouter, 26 CappedSpender), not 73.

## Update 2026-09-30 (superseded where the Oct 5 update above differs)

Built that day, all off or empty until the Oct 2 deploy. Nothing below was live yet.
- **Showcase shelter:** Pink Paw (Rožinė pėdutė). Token Tails holds its wallet until handover, and every page, README and draft says so. The wallet address is `null` in config until the deploy.
- **Sponsored one-tap gift:** `POST /shelter/donate` (once per player per UTC day, capped daily budget) behind `SHELTER_DONATE_ENABLED`. It is reached from the Catnip Heist win screen and `/shelter-payouts/give`. To turn it on (Oct 2–4): set the `SHELTER_*` names from `docs/BACKEND.md` and fund the hot wallet with a small USDC float.
- **Receipts and share cards:** `/shelter-payouts/receipt?chain=<id>&tx=<hash>`. The payouts page also has the Pink Paw profile, a campaign meter (`client/public/shelter-payouts/campaign.json`) and a balance line.
- **Off until the Pink Paw handover:** wallet donate (`NEXT_PUBLIC_WALLET_DONATE`) and the x402-compatible agent endpoint (`SHELTER_X402_ENABLED`, our own `onchain-receipt` scheme, no facilitator). The reason is the MiCA custody caution: public payments wait until the shelter holds its own keys.
- **ShelterSplit Rail:** `shelter-rail/`, an MIT SDK and a one-tag widget (`client/public/rail/widget.js`).
- **Heist domain:** `catnip.tokentails.com` is dropped. Use tokentails.com/heist; the Pages workflow's `domain` now defaults to empty.
- **Drafts:** the Arc and Colosseum drafts describe these pieces; the address and tx placeholders stay. Before submitting, run `fund a:submission <slug>` and confirm Pink Paw's consent to be named.
- **New rows in the `CLAUDE.md` tracker:** Oct 2–4 turn on sponsored donations; Pink Paw wallet handover → enable wallet donate and x402; Late Oct Circle grant application (agentic payments).

**Read this first.** No plan can guarantee a win, and this one does not claim to. The repo's own estimate (`funding/WINNING-STRATEGY.md`) puts the chance of at least one cash win at about **45% (range 30–55%)**, and a single win of $500 or more at about **28%**. What this plan does guarantee is **100% completion**:

- Every entry that passes its gate is submitted on time, complete and with no placeholders left.
- Every step has a check you can see.
- Every risk has a switch you decide in advance, so nothing fails silently.

Winning chances are listed for each entry in section 6.

**Roles**
- **You:** anything that signs, broadcasts, commits, pushes, submits or posts. You also run any command that needs the env variables from section 4, because those exist only in your shell.
- **AI:** a Claude Code (ultracode) session that reads, writes, tests and fills drafts.

**Time zones.** All times are Vilnius time unless marked.
- Vilnius is EEST (UTC+3) until Oct 25, then EET (UTC+2).
- US Pacific is UTC−7 until Nov 1. US Eastern is UTC−4 until Nov 1.
- Anitya and HackQuest show **no time zone**. Their times below are marked [ZONE?], and we plan a day early.

**Unverified items are marked [UNVERIFIED].** Everything else is quoted from a live page, from the Colosseum rules PDF (`scratchpad/rules.txt`) or from the repo.

**Checked just now (read-only):**
- The heist and payouts work is **still uncommitted**. `git log` HEAD is `18bbc425`. The branch tracks `origin/feat/funding-winning-strategy`.
- **Other sessions already have 6 paths staged in the index** (under `backend/` and `client/`). A plain `git commit` would take them along. The Sep 30 commit therefore names its paths explicitly (see below).
- `catnip-heist/perf/`, `catnip-heist/promo/*` and `catnip-heist/promo/PROMPT.md` are changed, but it is unclear who owns them. **Keep them out of the commit.**
- The Colosseum rules have **no** clause on AI content, human narration, prior work or commits made inside the contest window. Content rules (s.12): "All Content must be in English". You must also own the rights to the content, and you need permission from every person who appears in it.

---

## 1. Critical path

1. **Sep 30:** commit and PR (you).
2. **Oct 1:** merge to main, turn on Pages, set up the keystore and env, run the testnet native check.
3. **Oct 2:** mainnet wave, Tempo memo payout, `a:ingest`.
4. **Oct 3:** site live and drafts filled.
5. **Oct 3–5:** videos.
6. **Oct 4:** gate on the Arc donate button.
7. **Oct 7:** submit Arc.
8. **Oct 9:** Colosseum gate.
9. **Oct 11:** submit Colosseum.
10. **Oct 20:** submit Anitya main.
11. **Oct 22 onward:** Team1, then Circle only after Arc decides.
12. **Oct 31:** register for Dubai.
13. **Nov 16–Dec 3:** Dubai build.
14. **Dec 4:** submit Dubai.

---

## 2. Day-by-day table

All commands start from the repo root `/Users/zygimantasbagdzevicius/me/tokentails-app` unless they `cd` first.

| Date | Owner | Action (exact command or click) | Verify | Switch (if X then Y) |
|---|---|---|---|---|
| **Wed Sep 30** | AI | `(cd catnip-heist && npm test && npm run typecheck)`; `(cd client && npx jest __test__/shelter-payouts-logs.test.ts)`; `(cd funding/framework && npm test)`; `(cd funding/framework/tracks/a-build/shelter-split && forge test)` | All green. `forge test` reports 73 passed (32 + 23 + 17 + 1 test functions) | If anything is red, the AI fixes it before you commit. The commit waits for green |
| Sep 30 | You | First run `git diff --cached --name-only` and note the 6 paths other sessions staged. **Do not unstage them.** Then run `git add client/components/shelter-payouts client/__test__/shelter-payouts-logs.test.ts client/public/heist catnip-heist/src/types.ts catnip-heist/src/ui/ui.ts catnip-heist/src/ui/styles.ts catnip-heist/src/ui/payouts.ts catnip-heist/src/ui/__tests__/payouts.test.ts catnip-heist/public/payouts catnip-heist/vite.config.ts catnip-heist/package.json catnip-heist/README.md catnip-heist/e2e/heist.spec.ts funding/framework/tracks/a-build/wave.mjs funding/framework/test/track-a-wave.test.mjs funding/HEIST-INTEGRATION-DATA.json` | `git diff --cached --stat -- <the same paths>` shows the heist and payouts files | **Never `git add -A`** |
| Sep 30 | You | `git commit -m "feat(heist): NativeDisbursed decoder, on-chain win-screen total, client/public/heist, a:ingest publish" -- <the same path list>`. The `--` pathspec commits only these paths and leaves the other sessions' staged entries staged. Then `git push` and `gh pr create --base main --head feat/funding-winning-strategy --title "Funding: ShelterSplit, Catnip Heist, payouts page"` | `git show --stat HEAD` lists only these paths. `git status -sb` shows you level with origin. The PR URL is printed | If a foreign path got into the commit, run `git reset --soft HEAD~1` and commit again with the pathspec. If the push is rejected, run `git pull --rebase` and push again. If a PR already exists for the branch, `gh pr view` shows it |
| Sep 30 | You | GitHub: confirm the repo is **public**. Then set Settings > Pages > Source: **GitHub Actions** | The Pages settings page shows "GitHub Actions" | If an org policy blocks Pages, use the F6 fallback: serve `/heist/` from tokentails.com |
| Sep 30 | You | Every team member registers on colosseum.com. Name the **Team Leader**, who receives any prize | Each member sees their profile. The Team Leader's name is written in a note under `funding/framework/applications/colosseum-worlds-fair/notes/` | Hard stop Oct 12 23:59 PT. Registration is checked again at G6 |
| Sep 30 | You | Weekly Challenge 2 is already submitted (world `heist-01-kibble-corp-warehouse`). Screenshot the Discord post and save its link | The screenshot is saved | none |
| **Thu Oct 1** | You | Merge the PR into main | `git ls-tree -r --name-only origin/main -- .github/workflows` lists `catnip-heist-pages.yml` (today only the branch has it) | If CI is red, the AI fixes it on the branch and you merge again |
| Oct 1 | You | `gh workflow run catnip-heist-pages.yml --ref main -f payouts_url=https://tokentails.com/shelter-payouts` | The run is green. `https://zbagdzevicius.github.io/tokentails/heist/` loads | If it fails at `configure-pages`, the Pages source is not set: fix it and run again. If it fails at `npm test` or `npm run build`, see F14 |
| Oct 1 | You | `foundryup`, then `forge --version` | The version is at or above what Tempo's docs name [UNVERIFIED: exact version] | If Tempo still fails after the upgrade, see G1 |
| Oct 1 | You | `cast wallet import tokentails --interactive`, then `export FUND_KEYSTORE=tokentails`, plus the other names from section 4, **in your shell only**. Leave `SHELTERSPLIT_OWNER` unset: the proof payout calls `addShelter`, which is `onlyOwner`, so the deployer must be the owner | `cast wallet list` shows `tokentails` | If the passphrase is lost, create a new keystore and fund it. That is safe because nothing has been deployed from the old one |
| Oct 1 | You | Fund the deployer: Arc USDC (also the gas token); Tempo USDC.e plus pathUSD for fees; Arbitrum ETH; Avalanche AVAX; 1–5 USDC per chain for the proof payout; EURC on Arc and Avalanche | `cast balance <deployer> --rpc-url $RPC_…` is non-zero on every chain | If one chain has no funds, that chain is skipped. Only Arc and Tempo are critical |
| Oct 1 | You (in your env shell) | `cd funding/framework && node bin/fund.mjs a:wave && node bin/fund.mjs a:wave --token EURC && node bin/fund.mjs a:wave --network testnet`. Each call rewrites its script in `tracks/a-build/wave/`. The AI's shell cannot see your exports | Every row ends in `ready`, with no `MISSING …` | If a row shows `MISSING $RPC_…`, export that name and run again. Paste the output to the AI |
| Oct 1 | You | `cd funding/framework/tracks/a-build/wave && DRY_RUN=1 ./deploy-testnet.sh && ./deploy-testnet.sh`. The script only deploys and runs the ERC-20 proof payout on Arc testnet, then runs `a:ingest --network testnet`. **Test the native path by hand:** `cast send <testnet split> "donate(string)" "native test" --value 0.1ether --rpc-url $RPC_ARC_TESTNET --account tokentails` | The testnet deploy and proof payout succeed. The donate tx emits `NativeDisbursed` on explorer.testnet.arc.io | If the native path fails, that is G2 (decided by Oct 3) |
| Oct 1 | You | Email hello@colosseum.com and post in the Colosseum Discord with three questions: (a) Can one entry win both a track (Tempo) and a general prize? (b) Are there any rules for pitch or demo video narration? (c) Does the Phantom CASH or USDC payout work for a Lithuanian Team Leader? | Message sent, screenshot saved | The answers are due at G5 (Oct 8) |
| Oct 1 | You | Open the Arc submission venue. The call page `community.arc.io/public/events/arc-microgrants-f8tijfjhyq` links to `dorahacks.io/hackathon/arc-microgrants` [UNVERIFIED: DoraHacks returned HTTP 405]. Screenshot every form field | Screenshots in hand | If the form differs from the draft, the AI rewrites the draft to the real fields the same day (F13) |
| **Fri Oct 2** | You | `cd funding/framework/tracks/a-build/wave && DRY_RUN=1 ./deploy-mainnet.sh` | It prints "DRY RUN: simulating only", then a `deployer balance` line for each chain, then `deployed: arbitrum arc tempo avalanche` with no `skipped:` lines. Check Tempo first | If Tempo errors on the transaction type or fee, see G1. A `skipped: <chain>: wrong RPC` line means the RPC variable points at the wrong chain |
| Oct 2 | You | `./deploy-mainnet.sh` (same folder) | The script deploys, runs the proof payout on each chain (only when `PROOF_SHELTER` is set), then runs `fund a:ingest --network mainnet` | If one chain fails, the others continue. Only Arc and Tempo are critical |
| Oct 2 | You | Only after the USDC wave is done: `DRY_RUN=1 ./deploy-mainnet-eurc.sh && ./deploy-mainnet-eurc.sh` | The EURC splits appear on the Arc and Avalanche explorers | If the deployer has no EURC, drop EURC from the Arc draft (about −1 point) |
| Oct 2 | You | Tempo campaign-memo payout (not scripted). Set `TEMPO_SPLIT` from `funding/framework/tracks/a-build/deployments.json`, then run `cast send 0x20C000000000000000000000b9537d11c60E8b50 "approve(address,uint256)" $TEMPO_SPLIT 1000000 --rpc-url $RPC_TEMPO_MAINNET --account tokentails` and `cast send $TEMPO_SPLIT "disburseWithMemo(uint256,bytes32)" 1000000 $(cast format-bytes32-string "Catnip Heist campaign") --rpc-url $RPC_TEMPO_MAINNET --account tokentails`. The token address is the Tempo USDC.e that `deploy-mainnet.sh` and `chains.json` use. It works only after the proof payout has registered the shelter | `cast receipt <tx> --rpc-url $RPC_TEMPO_MAINNET` shows `status 1`. Paste the hash to the AI as `{TEMPO_TX}` | If the fee fails, hold pathUSD or set the fee token, then retry. The amount is team-funded and not tied to wins, so there is no second score write path |
| Oct 2 | You (optional) | `cast send $ARC_SPLIT "donate(string)" "Token Tails native payout" --value 1ether --rpc-url $RPC_ARC_MAINNET --account tokentails`. `1ether` is 1 USDC, because Arc's native USDC has 18 decimals (contract comment and `chains.json`). The contract's `receive()` splits the same way. 20 gwei fee floor [UNVERIFIED on mainnet] | The explorer amount equals 1 USDC, not off by 10^12 | If the amount is wrong, the native path is no-go (G2) |
| Oct 2 | You | On each chain where a Safe exists: `cast send $SPLIT "transferOwnership(address)" $SAFE --rpc-url … --account tokentails`, then `acceptOwnership()` from the Safe (the transfer takes two steps) | `cast call $SPLIT "owner()(address)"` returns the Safe | If there is no Safe on Arc or Tempo [UNVERIFIED], keep the deployer as owner and disclose it in every draft |
| Oct 2 | AI | `cd funding/framework`, then: `node bin/fund.mjs a:ingest --network mainnet` (only if the script did not run it); `a:build --all` and `a:matrix`. You run `node bin/fund.mjs a:verify arc mainnet` and `a:verify tempo mainnet` in your env shell, because they read the RPC URLs from env | The 3 `deployments.json` copies are non-empty. `a:verify` passes. `a:build` shows 73 tests passed and a clean tree | If `a:verify` needs network the AI session does not have, you run it and paste the output |
| Oct 2 | AI | Fix the 4 wrong draft claims (section 5 notes). Fill every placeholder. Then run `node bin/fund.mjs a:submission arc-microgrants`, `a:submission colosseum-worlds-fair`, `check arc-microgrants` and `check colosseum-worlds-fair` | `grep -n '{[A-Z_]*}' funding/framework/applications/*/draft.md funding/framework/applications/*/submission.md` prints only the URLs still pending the Oct 3 go-live and the video uploads | If a value is missing, the AI lists exactly which one you owe |
| Oct 2 | You | `git add funding/framework/tracks/a-build/deployments.json client/public/shelter-payouts/deployments.json catnip-heist/public/payouts/deployments.json funding/framework/applications/{arc-microgrants,colosseum-worlds-fair}`, then `git commit -m "chore(funding): record mainnet deployments and proof payouts" -- <the same paths>`, `git push` and `gh pr create` | The PR is open. `git show --stat HEAD` shows only these paths | If `a:build` evidence needs a clean tree, commit first and run `a:build --all` again |
| **Sat Oct 3** | You | Merge the PR. Then `gh workflow run catnip-heist-pages.yml --ref main -f payouts_url=https://tokentails.com/shelter-payouts` | The Pages run is green | See F14 |
| Oct 3 | You | Deploy the client from a **clean worktree**: `git worktree add ../tt-deploy origin/main`, then **copy your `client/.env.production` into `../tt-deploy/client/` yourself** (it is gitignored, `build:prod` needs it, and the AI never reads it). Then `cd ../tt-deploy/client && npm ci && npm run build:prod` and deploy as usual [UNVERIFIED: deploy target; `docs/DEPLOYMENT.md` says "any Node host"]. `postbuild` (next-sitemap) needs the backend reachable | `https://tokentails.com/shelter-payouts` and `/heist/` load | If the client deploy is blocked, there is **no Pages-hosted payouts page** (`catnip-heist/public/payouts/` holds only `deployments.json`). Run the Pages workflow again with `payouts_url` set to the Arc explorer page for the split address (F4) |
| Oct 3 | AI | Open both URLs in a private window at phone width | The counter is non-zero and matches the explorer. There are no CORS or 429 errors in the console | If RPC or CORS fails, use a second RPC. As a last resort, show a labelled "snapshot as of" list with explorer links (F4) |
| Oct 3 | Both | **G2**: go or no-go on the native path | See section 3 | — |
| Oct 3–5 | AI | `node funding/media/make-demo.mjs --payouts-url <live url> --var SHELTER_NAME="…" --var SPLIT_ADDRESS=0x… --var ARC_TX=0x… --var TEMPO_TX=0x… --only arc,colosseum` | `funding/media/out/demo-arc.mp4` and `demo-colosseum.mp4` exist, each 3 minutes or less | If muxing fails after recording, run again with `--reuse`, which skips re-recording |
| Oct 3–5 | You | Record the 2–3 minute on-camera Colosseum pitch **in your own voice**. The rules do not require this; it is our safety choice. Upload all videos and paste the URLs into `demo:` in both `call.md` files (`arc-microgrants`, `colosseum-worlds-fair`) | You have the `{DEMO_VIDEO_URL}` and `{PITCH_VIDEO_URL}` links | If the pitch is not recorded by Oct 9, skip Colosseum (G6) |
| **Sun Oct 4** | Both | **G3**: Arc donate button | See section 3 | — |
| Oct 4 | AI | Build the button only on go. Then run `(cd catnip-heist && npm test && npm run typecheck && npm run e2e)` and `(cd client && npx tsc --noEmit && npm test)` | The button pays end to end on mainnet, and the counter updates | On no-go, ship without it. A half-built button costs about 2 points |
| **Mon Oct 5** | Both | **G4**: deploy reality check | See section 3 | — |
| Oct 5 | AI | `cd funding/framework && node bin/fund.mjs loop arc-microgrants --rounds 3`, then `node bin/fund.mjs prompt review arc-microgrants --run` and `node bin/fund.mjs verify arc-microgrants`. Re-read the Arc rules for AI and "original" wording | Verify passes. The held-wallet disclosure is present | If the disclosure is missing, the entry does not ship (F11) |
| **Tue Oct 6** | You | Read the draft against the live form. Then `node bin/fund.mjs status arc-microgrants ready`. Open the Colosseum form and screenshot every field | The status shows ready. Note: `check` needs `repo:` filled in before `ready` | Fix and submit Oct 7 before noon |
| **Wed Oct 7** | You | **SUBMIT Arc Microgrants** on the venue confirmed Oct 1. Include the Arc mainnet link, the repo, the builder profile, a wallet that can receive USDC on Arc, and the disclosure "wallet held by Token Tails on behalf of {SHELTER_NAME}, to be handed over by <date>". Then `node bin/fund.mjs status arc-microgrants submitted` | Confirmation screenshot and entry URL | If blocked, the hard close is **Oct 14 23:59 ET (Oct 15 06:59 Vilnius)**. Retry daily, and use G7 as the last safe day |
| Oct 7–8 | You | Check Discord `#jam-submission` and the itch community tab for Weekly Challenge 3 [UNVERIFIED: expected around Oct 7] | The theme and close time are recorded | If there is no new weekly, check again each Wed/Thu |
| Oct 7–10 | AI + You | On a new weekly, the AI runs `cd catnip-heist && npm run export-glb` and picks a world from the table in `catnip-heist/export/anitya/SUBMISSION.md` §4. **Do not use heist-08**, which is kept for the main jam, or heist-01, which was used in WC2. You then run `node tools/export-anitya-upload.mjs --world=heist-0N --live`, which opens a visible browser where you log in. It never clicks Publish | The GLB exists in `catnip-heist/export/anitya/worlds/` and the post text is filled | — |
| Weekly | You | At app.anitya.space: import the GLB, then **Publish to the public feed**. In Discord `#jam-submission`: Submit, pick the round, paste the post with `<world link>` and `<SHELTER NAME>` filled in | The world is visible in the feed, the Discord post is live, and the screenshot is saved | If a weekly closes before you can publish, skip that round. It does not affect the main jam |
| **Thu Oct 8** | Both | **G5**: Colosseum multi-track answer | See section 3 | — |
| Oct 8–10 | AI | `node bin/fund.mjs loop colosseum-worlds-fair` and the hostile-judge review (`prompt review colosseum-worlds-fair --run`). Re-read the Colosseum rules and form (English only) | `check colosseum-worlds-fair` passes. The grep for placeholders prints nothing | — |
| **Fri Oct 9** | Both | **G6**: Colosseum go or no-go | See section 3 | — |
| Oct 10 | AI | `cd catnip-heist && npm test && npm run build:client && npm run e2e`. `build:client` rewrites `client/public/heist`. If the diff is non-empty, you commit it and redeploy | Green. The live `/heist/` win screen shows the on-chain total | If it breaks, keep the last green deploy live and submit that URL (F14) |
| **Sun Oct 11** | You (Team Leader) | **SUBMIT Colosseum**: the Tempo track, plus Arbitrum or the general pool only if G5 allows it. Include the Tempo address, `{TEMPO_TX}`, the repo, the demo (3 minutes or less), the pitch (2–3 minutes), the prior-work disclosure and the held-wallet disclosure. Then `node bin/fund.mjs status colosseum-worlds-fair submitted` | Confirmation screenshot. All members show as registered | The hard deadline is **Oct 12 23:59 PT, which is Tue Oct 13 09:59 Vilnius** |
| Oct 12–13 | You | Only if Oct 11 failed: submit by **Oct 13 08:00 Vilnius** | Confirmation | After that, the entry is lost. Log it and move on |
| Tue Oct 13 | You | **G7**: last safe day for Arc if it was not submitted Oct 7 | Confirmation | If it is still not submitted by Oct 14 18:00 Vilnius (our own cutoff; the real close is Oct 15 06:59 Vilnius), Arc is dead |
| Oct 13–17 | AI | Main jam: `catnip-heist/export/anitya/worlds/heist-08-kibble-corp-hq.glb`, titled "Catnip Heist: Shelter Break-in". Fill the post text. On Oct 15, screenshot the live itch and Anitya submission form (F13) | The GLB loads in the Anitya preview | — |
| Oct 13–17 | You | Ask in the Anitya Discord: (a) What time zone is the Oct 21 22:59:59 close? (b) Can a world entered in a weekly also enter the main jam? | Answers saved | If there is no answer, keep the Oct 20 target and keep heist-08 out of the weeklies |
| Oct 14 | — | **Arc hard close 23:59 ET (Oct 15 06:59 Vilnius)** | — | — |
| Oct 14–15 | You/AI | Weekly Challenge 4, same weekly rows as above [UNVERIFIED: date] | — | — |
| **Sun Oct 18** | Both | **G8**: main-jam scope | See section 3 | — |
| Oct 19 | AI | `cd catnip-heist && npm test && npm run e2e`, then re-read the AI-asset rule | Green | See F14 |
| **Tue Oct 20** | You | **SUBMIT the Anitya main jam** by 18:00 Vilnius. Publish heist-08 to the public feed, then submit on itch.io/jam/anitya-world-jam-2700-in-prizes | The itch entry page is live, screenshot saved | If blocked, retry Oct 21 by 12:00 Vilnius. The close is 22:59:59 [ZONE?], which is Oct 22 01:59 Vilnius if UTC |
| Wed Oct 21 | — | Arc decisions are due ("every decision is issued by October 21") | Arc email or DoraHacks status | Feeds G9 |
| Oct 21–22 | You/AI | Weekly Challenge 5, if one is posted [UNVERIFIED] | — | — |
| **Thu Oct 22** | Both | **G9**: Arc result | See section 3 | — |
| Oct 22–24 | AI | `applications/team1-avalanche` **already exists**, so `a:init` would refuse. Run `cd funding/framework && node bin/fund.mjs run team1-avalanche`, then `node bin/fund.mjs loop team1-avalanche`. Bring over the Arc wording by editing the draft, not with `a:init --force`, which overwrites the existing draft. Cite the Avalanche deploy and its explorer link. Include the held-wallet disclosure | `check team1-avalanche` passes | If Avalanche was never deployed, you run `node bin/fund.mjs a:wave --chains avalanche` and the generated `deploy-mainnet.sh`, or you skip Team1 |
| Sun Oct 25 | — | Vilnius switches to EET (UTC+2) | — | — |
| Tue Oct 27 | You | **SUBMIT Team1** at `https://go.team1.network/mini-grants` (rolling, no deadline). Then `node bin/fund.mjs status team1-avalanche submitted` | Confirmation email or screen | If the form requires something we do not have (region, KYC), stop and log it |
| Oct 27 | You/AI | Circle Developer Grants: **only if G9 said Arc did not fund us**. The AI drafts `applications/circle-developer-grants` and you submit at circle.com/grants | Application tracker visible | If Arc funded the work, apply to Circle only for new work Arc did not fund, or skip Circle |
| Oct 28–30 | — | Buffer: finish any open weekly and fix any live-page errors | Counter re-checked on phone | — |
| **Sat Oct 31** | You | Register on hackquest.io/hackathons/Arbitrum-Open-House-Dubai-Online-Buildathon (opens 16:01 [ZONE?]). **Ignore the stale `/Arbitrum-Open-House-Dubai` slug** | Registration confirmed | If registration is not open yet, retry Nov 1 |
| Oct 31 | AI | Fetch the criteria and prize split again (WebFetch), and re-score | The criteria are recorded | **G10** |
| Sun Nov 1 | — | US switches to PST (UTC−8) | — | — |
| Nov 1–15 | AI | Draft the Dubai build spec: an in-window revenue-to-disburse job, registered in `AppModule`, behind `PermissionGuard`, never touching `POST /user/catbassadors/live`. Passkey wallet: decide at G11 | You approve the spec | — |
| **Mon Nov 16** | Both | **G11**: start the Dubai build (the submission window opens 16:01 [ZONE?]) | See section 3 | — |
| Nov 16–Dec 1 | AI | Build on a branch. `cd backend && npm run lint && npm run build && npm test` | Green. The job shows as disbursed on Arbitrum One | If it is not green by Dec 1, submit the live Arbitrum ShelterSplit plus the payouts page only |
| Nov 16–Dec 1 | You | Review, merge, and deploy the backend from a clean worktree. You send every mainnet tx | You can see the tx | — |
| Dec 2–3 | AI | Draft the Dubai submission (`applications/arbitrum-dubai`), fill placeholders, run `check arbitrum-dubai` and the grep | No placeholders left | — |
| **Fri Dec 4** | You | **SUBMIT Dubai** on HackQuest | Confirmation screenshot | The hard close is Dec 6 16:01 [ZONE?]. Dec 5 is the fallback |
| **Before Sat Dec 5** | You | **G12**: shelter wallet handover. The shelter creates its **own** key, and the funds move by a public tx. Never hand over a seed phrase | The handover tx is on the explorer. The AI updates the custody label on the payouts page | If the handover slips, update the "custody: team until <date>" label with the new date |
| Sat Dec 5 | — | Colosseum winners are "announced by December 5". If we win, the Team Leader signs the acceptance documents, passes due diligence and sets up a wallet. Dubai registration also closes, at 16:01 [ZONE?] | Winner email | — |
| Sun Dec 6 | — | Dubai hard close, 16:01 [ZONE?] | — | — |
| Sun Dec 13 | — | Dubai rewards, 17:01 [ZONE?]. Log the results with `fund status` | — | End of plan |

---

## 3. Gates

| Gate | Date | Criterion | GO | NO-GO |
|---|---|---|---|---|
| **G0** Clean commit | Sep 30 | `git show --stat HEAD` shows only heist and payouts paths, the other sessions' 6 staged paths are still staged and not committed, and tests are green | Push, open the PR, merge Oct 1 | `git reset --soft HEAD~1`, then commit again with the `-- <paths>` pathspec |
| **G1** Tempo toolchain | Oct 1–2 (hard Oct 5) | The Tempo line of the mainnet DRY_RUN passes after `foundryup` | Deploy Tempo, send the memo payout, and enter the Colosseum Tempo track (about 8%) | Use Tempo's documented tooling or fee-token flag. If Tempo is still down on Oct 5, Colosseum goes to the general pool with the Arc proof only (about 4–5%), and the heist drops the Tempo memo |
| **G2** Arc native path | Oct 3 | The testnet `donate()` emitted `NativeDisbursed`, and the mainnet explorer amount equals the intended amount (no 10^12 error) | Keep the native claim in the Arc draft | Drop the native claim and ship ERC-20 USDC plus EURC. Arc goes to about 15% |
| **G3** Arc donate button | Oct 4 | All three hold: a real `NativeDisbursed` shows on the live page, `donate()` has worked on mainnet, and the button works end to end today | The AI ships the button and you deploy | No button. Arc shows the proof payout only |
| **G4** Deploy reality | Oct 5 | The Arc and Tempo mainnet splits exist and are in `deployments.json` | Proceed | Run `node bin/fund.mjs a:wave --chains arc,tempo` and deploy only those chains. Drop EURC, Arbitrum and Avalanche. Dubai and Team1 are deferred to their own dates. **If Arc mainnet is not deployed and working at the moment you submit (last safe moment Oct 14 18:00 Vilnius), the Arc entry does not exist**, because the rules require "already deployed and working on Arc mainnet" |
| **G5** Colosseum tracks | Oct 8 | Colosseum answers the multi-track question | If allowed: Tempo, Arbitrum and the general pool | If there is no answer, or only one track is allowed: Tempo only, which has the best odds. Multi-track is worth about 2–3 points |
| **G6** Colosseum go | Oct 9 | The Team Leader is named, every listed member is registered, the pitch video is recorded, the demo is 3 minutes or less, and the live pages work | Submit Oct 11 | Submit as a smaller team with only registered members. If there is no pitch or no working pages, **skip Colosseum**, because a weak entry is worse than none |
| **G7** Arc last call | Oct 13 | Arc is submitted | Nothing to do | Submit by Oct 14 18:00 Vilnius, otherwise Arc is dead |
| **G8** Main-jam scope | Sun Oct 18 | heist-08 is published and playable, and you have used 45 or fewer human hours | Submit Oct 20 | Cut Bezi and extras. Submit the working GLB as is |
| **G9** Arc result | Oct 22 | Arc's decision has arrived | Funded: cite it in Team1. Circle only for new, separately scoped work | Not funded or no answer: Team1 as planned, and Circle may be drafted |
| **G10** Dubai fit | Oct 31 | The criteria allow existing products and fit payments or charity | Build Nov 16–Dec 3, submit Dec 4 | Drop Dubai. Nothing else changes |
| **G11** Dubai build | Mon Nov 16 | The window is open, the Arbitrum split is live, and you have capacity | Build the job. The passkey wallet may be added here | Submit only the existing Arbitrum deploy and page, or skip |
| **G12** Handover | Before Sat Dec 5 | The shelter holds its own key | Public handover tx, label updated | A new date is published on the page. The disclosure stays in every entry |

---

## 4. Environment and setup checklist (names only)

**Shell only. Never write these to a file.**
- Required: `FUND_KEYSTORE` (set it to `tokentails`, a name in `~/.foundry/keystores` or a path) and `SHELTERSPLIT_TREASURY`.
- Per chain: `RPC_ARC_MAINNET`, `RPC_TEMPO_MAINNET`, `RPC_ARBITRUM_MAINNET`, `RPC_AVALANCHE_MAINNET` and `RPC_ARC_TESTNET`.
- Proof payout: `PROOF_SHELTER` and `PROOF_AMOUNT` (required once `PROOF_SHELTER` is set; `1000000` is 1 USDC at 6 decimals), plus `PROOF_SHELTER_NAME` (defaults to "shelter" if unset, so always set it).
- Optional:
  - `PROOF_BPS` (default 10000).
  - `PROOF_MEMO` (default "Token Tails first payout").
  - `FUND_KEYSTORE_PASSWORD_FILE`.
  - `DRY_RUN`.
  - `SHELTERSPLIT_OWNER`. Leave it unset for the wave, because the proof payout needs the deployer as owner. Move ownership to a Safe afterwards.
- Set by the scripts themselves (do not set these): `SHELTERSPLIT_TOKEN`, `EXPECTED_CHAIN_ID` and `PROOF_SPLIT`.
- Manual step variables: `TEMPO_SPLIT`, `ARC_SPLIT`, `SPLIT` and `SAFE`.

**Tools:**
- `foundryup` (`forge` and `cast`).
- `gh auth status`.
- Node 20 or later for `funding/framework`.
- The catnip-heist and client dependencies.
- The Playwright browsers for `npm run e2e`.
- macOS `say` and `ffmpeg` for `make-demo.mjs`.

**Accounts:**
- A colosseum.com account for every member.
- A DoraHacks account for Arc [UNVERIFIED venue].
- The Team1 form.
- A HackQuest account.
- An itch.io account.
- An app.anitya.space account.
- Discord, on the Anitya and Colosseum servers.
- A video host for the demo and pitch links.

**Balances:**
- Arc: USDC (gas) and EURC.
- Tempo: USDC.e and pathUSD.
- Arbitrum: ETH.
- Avalanche: AVAX and EURC.
- Every chain: 1–5 USDC for the proof payout.

**Repo settings:** the repo is public, and the Pages source is set to GitHub Actions.

**Local only:** `client/.env.production` copied by you into the deploy worktree. The AI never reads it.

**Documents:** the shelter's written consent, and the handover date written into the disclosure.

---

## 5. Placeholder fill-map

**Update 2026-10-02:** one command now does this whole table: `node bin/fund.mjs fill --ingest --write` (from `funding/framework`). Its rules are in `tracks/a-build/fill-map.json`, and the values only you have go in `fill-values.json`. Without `--write` it is a dry run. `--fallbacks` swaps sentences that depend on a missing treat tx or demo for wording that is true without them. The steps are in `funding/USER-TODAY.md`.

| Placeholder | Source | Command |
|---|---|---|
| `repo:` and `{REPO_URL}` | The public repo URL after the Oct 1 merge | `gh repo view --json url -q .url`, then add `/tree/main/contracts/shelter-split` |
| `demo:` and `{DEMO_VIDEO_URL}` | Uploads of `funding/media/out/demo-arc.mp4` and `demo-colosseum.mp4` | You paste the URLs, then the AI runs `a:submission` again |
| `{PITCH_VIDEO_URL}` | Upload of your on-camera pitch | You paste the URL |
| `{SPLIT_ADDRESS}` | The Arc USDC instance (Arc draft) and the Tempo instance (Colosseum draft) | `cat funding/framework/tracks/a-build/deployments.json` after `a:ingest` (the AI reads the field names from the file) |
| `{EURC_SPLIT_ADDRESS}` | The EURC wave | Same file, after the EURC `a:ingest` |
| `{ARC_TX}` | `proofTxs` for Arc | Same file |
| `{TEMPO_TX}` | The manual `disburseWithMemo` hash | Copy it from the `cast send` output and check it with `cast receipt <tx> --rpc-url $RPC_TEMPO_MAINNET`. `a:ingest` records only `ProofDisburse` broadcasts, so it does **not** record this one |
| `{SHELTER_NAME}` and `<SHELTER NAME>` | The consenting shelter | Must match `PROOF_SHELTER_NAME` exactly |
| `{SHELTER_WALLET}` | The team-held wallet | Same value as `PROOF_SHELTER` |
| `{PAYOUTS_URL}` | `https://tokentails.com/shelter-payouts`. The fallback is the Arc explorer page for the split; there is no Pages-hosted payouts page | Live only after Oct 3 |
| `{HEIST_URL}` | `https://zbagdzevicius.github.io/tokentails/heist/` or `https://tokentails.com/heist/` | Live only after the Pages run or the client deploy |
| `<world link>` | The Anitya world URL after Publish | You paste it into `catnip-heist/export/anitya/SUBMISSION.md` |
| **Final check before every submit** | — | `grep -n '{[A-Z_]*}' funding/framework/applications/*/draft.md funding/framework/applications/*/submission.md` must print nothing. `fund check` flags only `{{…}}`, TODO, TBD, XXX and FIXME, not single braces |

**Wrong claims the AI fixes on Oct 2, before running `a:submission`:**
1. Colosseum: only `disburseWithMemo(uint256,bytes32)` uses `transferWithMemo`. Plain `disburse()` does not.
2. Arc: the payouts page reads `Disbursed` **and** `NativeDisbursed`.
3. The build evidence says 41/41, built from "uncommitted" source. It should say **73/73**, built from committed source, after `a:build --all`.
4. Arc venue: set it to the one confirmed on the call page on Oct 1.
5. Ignore `funding/FAST-EXECUTION.md`, which is superseded.

**Standing rules for all drafts:**
- Never use the 542k users figure as a current or headline number.
- Label the SEI numbers as historical SEI data (ended March 2026).
- Put the held-wallet disclosure on every entry and on the payouts page.

---

## 6. Per-entry submission checklists

**Arc Microgrants: 19% nominal.** About 15% if the native path is no-go. The pre-mortem puts it at about 13–15% with a team-held wallet.
- Deadline: target Oct 7. Hard close Oct 14 23:59 ET (Oct 15 06:59 Vilnius). Decisions by Oct 21. 500 USDC per grant.
- [ ] Arc **mainnet** split deployed and working. Testnet-only entries are ineligible.
- [ ] The work has no Circle or Arc funding.
- [ ] `{ARC_TX}` is on the explorer. The payouts page is live and the counter is non-zero.
- [ ] Native claim only if G2 is go. Donate button only if G3 is go.
- [ ] Repo link, builder profile, and a wallet that can receive USDC on Arc.
- [ ] Held-wallet disclosure, and a note if the deployer is still the owner (no Safe).
- [ ] The grep prints nothing, `check arc-microgrants` passes, the status is set to submitted, and you have a screenshot.

**Colosseum World's Fair (Tempo track, plus others if allowed): about 8%.** About 4–5% if Tempo fails.
- Deadline: target Oct 11. Hard close Oct 12 23:59 PT (Oct 13 09:59 Vilnius). Winners by Dec 5.
- [ ] Every member is registered before the deadline. Each person is on one team only. One submission per team, made by the Team Leader.
- [ ] Tempo address and `{TEMPO_TX}` (the campaign memo).
- [ ] A demo video of 3 minutes or less, and a 2–3 minute pitch in your voice.
- [ ] Everything in English. You own the rights to all content, and you have permission from every person shown.
- [ ] Track tags set according to G5.
- [ ] Prior-work disclosure naming what was built Sep 14–Oct 12. The rules have no in-window clause, so this is voluntary honesty.
- [ ] Held-wallet disclosure. The payee is the **Team Leader**, never the shelter wallet.
- [ ] The Team Leader is ready for the acceptance documents and due diligence.
- [ ] Read-only counter only. No passkey wallet.
- [ ] Status set to submitted, and you have a screenshot.

**Anitya main jam: 8%.** Prizes $1,000 / $700 / $400.
- Deadline: target Oct 20 18:00 Vilnius. Close Oct 21 22:59:59 [ZONE?].
- [ ] The heist-08 GLB (`catnip-heist/export/anitya/worlds/heist-08-kibble-corp-hq.glb`) is published to the **public feed**.
- [ ] The itch entry is titled "Catnip Heist: Shelter Break-in".
- [ ] AI assets are ones we have the rights to (the organiser allows this).
- [ ] Payout method set: Wise, PayPal, Payoneer or USDC. The organiser confirmed Lithuania is fine.
- [ ] Shelter name in the post, and a screenshot.

**Anitya weeklies: 15% combined.** $100 each (the WC2 prize was split as 2 × $50).
- WC1 and WC2 are done (WC2 was submitted with heist-01). Expect about 3 more, around Oct 7, 14 and 21 [UNVERIFIED].
- [ ] A different world each round. Never heist-08 until the organiser confirms that dual entry is allowed. heist-01 is already used.
- [ ] Published to the public feed, then Discord `#jam-submission` > Submit > the right round.
- [ ] Post text filled, and a screenshot.

**Team1 Avalanche Mini Grants: 3.8%.** Up to $10,000.
- Rolling, with no published deadline. Submit Oct 27, after the Arc decision.
- [ ] Avalanche deploy linked.
- [ ] The Arc outcome cited (per G9).
- [ ] Held-wallet disclosure.
- [ ] Nothing claimed about region, mainnet or review-time rules, because none are published.
- [ ] Confirmation saved.

**Arbitrum Open House Dubai (online): about 6%.** $30,000 pool, split "Coming soon".
- Register Oct 31–Dec 5 16:01 [ZONE?]. Submit Nov 16–Dec 6 16:01 [ZONE?]. Target Dec 4. Rewards Dec 13.
- [ ] Registered on the correct slug.
- [ ] G10 passed.
- [ ] Deployed on Arbitrum One or Orbit (Solidity).
- [ ] An in-window revenue-to-disburse job behind `PermissionGuard`, with no second score path.
- [ ] Commits dated inside the window.
- [ ] Disclosure included, and a screenshot.

**Circle Developer Grants: not counted in the odds.** Rolling, $5,000–$100,000.
- [ ] Only after G9.
- [ ] Never before Arc decides.

---

## 7. What the AI does after each of your steps

| After you… | The AI automatically… |
|---|---|
| Commit and push (Sep 30) | Checks that `git show --stat HEAD` holds only heist and payouts paths, and that `git status` still shows the other sessions' work, including their 6 staged paths, untouched |
| Merge and run Pages (Oct 1, Oct 3) | Opens `/heist/` and checks that the win-screen link points to the payouts URL |
| Run `a:wave` in your env shell (Oct 1) | Reads the pasted output and lists any `MISSING` names |
| Run the testnet deploy and the testnet `donate()` (Oct 1) | Reads the broadcast and the explorer and reports the G2 evidence on the native path |
| Run the mainnet wave (Oct 2) | Runs `a:ingest` (if the script did not), `a:build --all` and `a:matrix`. It reads your pasted `a:verify` output, fixes the 4 draft claims, fills every placeholder it can, runs `a:submission` and `check` for Arc and Colosseum, and prints the grep result and the list of values you still owe |
| Paste `{TEMPO_TX}` | Writes it into the Colosseum draft and `funding/media/scripts/colosseum.md`, runs `a:submission` again, and reminds you that `a:ingest` does not track it |
| Deploy the client (Oct 3) | Checks both live URLs at phone width, compares the counter with the explorer, and applies the F4 fallbacks if RPC or CORS errors appear |
| Upload the videos | Writes `demo:` and the video URLs, runs `a:submission` and `check` again, and confirms the grep is clean |
| Decide G3 (Oct 4) | On go, builds the donate button and runs tests and `npm run e2e`. On no-go, removes any mention of the button from the drafts |
| Submit an entry | Runs `fund status <entry> submitted` if you have not, archives the confirmation link in the application folder, and moves to the next entry's hardening loop |
| Receive a weekly theme | Exports the GLB, picks a world that is neither heist-08 nor heist-01, fills the post text, and prints the `export-anitya-upload.mjs --live` command for you to run |
| Receive the Arc decision (Oct 21–22) | Hardens the existing `team1-avalanche` application with `fund run` and `fund loop`, and drafts Circle only if G9 allows |
| Register for Dubai (Oct 31) | Fetches the criteria again, re-scores, and writes the G10 recommendation and the build spec |
| Complete the shelter handover (Dec 5) | Updates the custody label and disclosures, and records the handover tx in the drafts |

**Files referenced:**
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/wave/` (generated by `a:wave`; this folder is gitignored)
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/chains.json`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/shelter-split/`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/applications/`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/media/make-demo.mjs`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/export/anitya/SUBMISSION.md`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/tools/export-anitya-upload.mjs`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/.github/workflows/catnip-heist-pages.yml`
- `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/WINNING-STRATEGY.md`
- `/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/6ce18730-9621-4243-a62c-e0ea84e163f7/scratchpad/rules.txt`

---

## Verification log

**Git and commit**
1. **Sep 30 commit:** other sessions already have 6 paths staged (`git diff --cached --name-only`). The plan's `git add` followed by `git diff --cached --stat` would have shown them, and a plain commit would have included them. The commit now uses `git commit -- <paths>`, and the verify step and G0 were changed to match.
2. **Sep 30 tests:** the listed commands never run forge, so "73/73" could not be seen. I added `forge test` in `shelter-split`. There are 73 test functions: 32 + 23 + 17 + 1. I also wrapped each `cd` in a subshell so the commands run from the repo root.

**Scripts, env and commands**

3. **Env-dependent commands:** `a:wave`, the deploy scripts and `a:verify` read the RPC and keystore variables from env, and the AI's shell never sees your exports. Their owner is changed to You (in your env shell) in section 2 and section 7.
4. **Deploy script paths:** `tracks/a-build/wave/deploy-*.sh` were run without the right working directory. They now start with `cd funding/framework/tracks/a-build/wave && ./…`.
5. **Mainnet DRY_RUN check:** the script never prints "ready"; only `a:wave` does. The check now matches the script's real output: "DRY RUN: simulating only", a `deployer balance` line per chain, then `deployed:` and `skipped:`.
6. **Testnet native check:** `deploy-testnet.sh` contains no `donate` or native call. I added a manual `cast send … donate(string)` on Arc testnet as the G2 evidence.
7. **`SHELTERSPLIT_OWNER`:** `ProofDisburse` calls `addShelter`, which is `onlyOwner`. If you set this variable to a Safe, the proof payout breaks. It must be left unset during the wave.
8. **Tempo token address:** `0x20C0…8b50` matches the Tempo USDC.e in `deploy-mainnet.sh` and `chains.json`, so I removed [UNVERIFIED]. I also noted that `disburseWithMemo` works only after the proof payout has registered the shelter.
9. **Team1:** `a:init team1-avalanche --from arc-microgrants` would fail, because the application already exists and `scaffold` throws unless you pass `--force`, which overwrites the draft. It is replaced with `fund run team1-avalanche` and `fund loop team1-avalanche`.
10. **Client deploy:** `build:prod` runs `env-cmd -f .env.production`, and a clean worktree does not have that gitignored file. I added a step where you copy it in; the AI never reads it. I also noted that `postbuild` needs the backend reachable (`docs/DEPLOYMENT.md`).
11. **Payouts fallback:** "Pages-hosted `catnip-heist/public/payouts/` page" does not exist; that folder holds only `deployments.json`. The fallback is now the Arc explorer page for the split. This was fixed in the Oct 3 row and in `{PAYOUTS_URL}`.
12. **e2e test:** the command is now `npm run e2e` (the catnip-heist script is `playwright test`). The Oct 4 checks are split between catnip-heist and client.
13. **Oct 10 build:** `npm run build:client` rewrites `client/public/heist`. I noted that a non-empty diff needs your commit and a redeploy.
14. **Colosseum Team Leader note:** `call.md` has no "notes" field. The note now goes under `applications/colosseum-worlds-fair/notes/`, which exists.
15. **Main-jam GLB path:** corrected to `catnip-heist/export/anitya/worlds/heist-08-kibble-corp-hq.glb`.
16. **Weekly worlds:** heist-01 was used for WC2 (per `SUBMISSION.md`), so it is excluded from later weeklies. `export-anitya-upload.mjs --live` opens a visible browser for your login, so its owner is You.
17. **Oct 1 merge check:** the workflow file is on HEAD but not yet on `main`. The verify step now uses `git ls-tree origin/main`.

**Rules text**

18. **Colosseum content rule:** "the one content rule is English" is incomplete. Rules s.12 also requires that you own the rights to the content and have permission from anyone who appears in it. The Colosseum checklist now includes this.

**Dates**

19. **Weekdays:** Oct 18 is Sunday (was "Sat"), Nov 16 is Monday (was "Sun"), Dec 4 is Friday (was "Thu") and Dec 5 is Saturday (was "Fri").
20. **G4:** the Arc mainnet cutoff said "by Oct 12". The Arc deadline is Oct 14 23:59 ET, so G4 now uses the submission moment, with the same Oct 14 18:00 Vilnius cutoff as G7.
21. **Dec 5:** added that Dubai registration also closes then.
22. **Dates checked and correct:** Arc (Oct 15 06:59 Vilnius), Colosseum (Oct 13 09:59 Vilnius), Anitya (Oct 22 01:59 Vilnius if the close is UTC), the Vilnius clock change on Oct 25 and the US change on Nov 1.

**Verified as correct**
- Every `fund` subcommand and flag used: `a:wave --network/--chains/--token`, `a:ingest --network`, `a:verify <chain> <network>`, `a:build --all`, `a:matrix`, `a:submission`, `check`, `loop --rounds`, `prompt review --run`, `verify`, `status ready/submitted` and `run`.
- The workflow name and its `payouts_url` input.
- The `make-demo.mjs` flags and output files.
- Every committed path exists.
- The contract functions and events: `disburseWithMemo`, `donate`, `receive`, two-step ownership and `NativeDisbursed`.
- Arc native USDC has 18 decimals.
- `fund check` flags only `{{…}}` and TODO-style markers.
- The 45% (range 30–55%) and 28% figures match `WINNING-STRATEGY.md`.
- `PermissionGuard` and `POST /user/catbassadors/live` exist in the backend.
- All env names match `wave.mjs`, the `.sh` scripts and the `.sol` scripts.