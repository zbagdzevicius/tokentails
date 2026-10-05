# Your list, from Oct 2 evening (Vilnius)

Written 2026-10-02 at 22:40 Vilnius. Ordered by deadline. Each item says how long it takes. Every
message below is ready to paste. Anything in `{BRACES}` is a value only you have. Nothing here has
been sent. AI does not send, post, sign or submit.

**Live check at 22:40.** `api.tokentails.com/shelter/donate/status` returns 200
(`enabled:false`, `chainId:5042`, `splitAddress:null`), so the new backend is up. The treat stays off
until the Arc mainnet split exists and `SHELTER_DONATE_*` is set. `/shelter/agent/cat-card` returns
**504** (it should give 402 once x402 is on). `tokentails.com/shelter-payouts` returns 200.
Since Oct 4 (a848d790) treats and the x402 card are on by default: the backend needs only
`SHELTER_CHAIN_ID` and `SHELTER_DONATE_PRIVATE_KEY`, and Arc mainnet treats start once the deployed
`wallet.config.ts` lists the Arc mainnet split and the hot wallet holds USDC. No flag to flip.

---

## 1. Tonight: Arbitrum Singapore registration (5 min). It may already be closed

HackQuest showed "Oct 2 17:01" with no time zone. If that is Singapore time, it closed at 12:01
Vilnius. If it is UTC, it closed at 20:01. Open the page now:
- **Already registered:** go on to item 2.
- **The Register button still works:** register now.
- **Closed and you never registered:** Arbitrum Singapore is out. Mark it ❌ in the CLAUDE.md
  tracker and skip item 6 (the Arbitrum submit). The Arbitrum deploy in item 4 is then optional.

## 2. Tonight: send the questions (25 min in total, 5 min each)

The answers decide Arc vs Tameion, the Colosseum tracks and the Anitya timing. Send all five
tonight so the replies arrive while you deploy.

### 2a. Arc: grant cap, and whether Tameion clashes (Arc community page or Discord; 5 min)

> Hi Arc team, we're building ShelterSplit on Arc. It's a USDC payout rail for animal shelters: native USDC splits when it arrives, and every payout gets a public receipt. We plan to submit to Arc Microgrants around Oct 7. Two quick questions:
> 1. Is there a fixed number of microgrants this round (for example 20), or is every project above the bar funded?
> 2. We're also entering the same work in the Tameion Agents Hackathon (Canteen x Circle x Arc), which closes Oct 10. If we won a Tameion prize, would the Arc Microgrant count it as "work already funded by a Circle or Arc program"? Would that matter if the prize came after the microgrant decision?
> Thanks!

### 2b. Canteen / Tameion: invite, Arc clash, payout (Luma page or the contact on tameion.thecanteenapp.com; 5 min)

> Hi Canteen team, we'd like to join the Tameion Agents Hackathon. Token Tails is a cat-rescue game, and we've built ShelterSplit on Arc. It's a USDC split rail for animal shelters with an x402-style agent endpoint. Could you send us an invite?
> Two questions before we commit:
> 1. We're also applying to Arc Microgrants with the same contract. Would a Tameion prize make the Arc grant ineligible as "already funded by a Circle or Arc program"? Or are the two programs independent?
> 2. How are prizes paid (USDC on which chain, or fiat), and is KYC needed for a team based in Lithuania?
> Thank you!

### 2c. Colosseum: tracks, video, payout (hello@colosseum.com or Discord #support; 5 min)

> Hi Colosseum team, a few questions about the Crypto World's Fair:
> 1. Can one project be considered for a sponsor track (we're entering the Tempo track) and for the general prizes at the same time? Can it be tagged for more than one track?
> 2. Are there rules on the demo video, such as a synthetic voice-over, or does the pitch have to be in a team member's own voice? Is 3 minutes the hard maximum?
> 3. Our Team Leader is in Lithuania. Are prizes paid only in USDC on Solana, and what documents does the Team Leader provide at payout?
> Thanks!

### 2d. Anitya: time zone and weekly dates (Discord, the jam channel or a DM to an organiser; 5 min)

> Hi! Quick questions about the World Jam:
> 1. What time zone are the main jam close (Oct 21, 22:59) and the weekly challenge closes in? Is it UTC?
> 2. When do the next weekly challenges open and close (around Oct 7, 14 and 21)?
> 3. Can a world that we submit to the main jam also be entered in a weekly challenge, or does each world count once?
> Thanks!

### 2e. Monad Metropolis: rules (log in at hackathon.monad.xyz first; 5 min, plus 5 min to read the rules)

Read the rules after you log in. Paste the deadline, the time zone and the mainnet/testnet rule
into `funding/framework/applications/monad-metropolis/call.md` (or into chat, and AI will write
them in). Ask only if the rules don't say:

Already done (Oct 4): ShelterSplit runs on Monad testnet (10143) at
`0x457c89e10a6e66633eda5bf82fd086febb5db147` (source verified on Sourcify), with a 1 USDC proof payout,
a 0.01 MON native gift and a one-signature 0.1 USDC DonateRouter gift, all paid to Pink Paw. If the
rules accept testnet, the entry can go in as is; if they need mainnet, Monad is in the mainnet wave.

> Hi Monad team, for Metropolis (Consumer Products & Payments): is a Monad testnet deployment enough, or does the entry have to be on mainnet? What time zone is the Oct 13 deadline in? Is work started before the hackathon allowed if we disclose it?

## 3. Tonight or Oct 3 morning: Pink Paw consent and custody (15 min to send, the shelter replies)

Send this to your Pink Paw contact. It is in English; translate it if you need to. Until a reply
comes back in writing, the drafts claim no consent. They say only that the wallet is held by Token
Tails until handover.

> Hi {NAME}, as discussed, Token Tails wants to name Pink Paw (Rožinė pėdutė) as the first shelter on ShelterSplit, our public payout system. Every gift sent to the shelter is recorded on a public blockchain, and anyone can check it. Could you reply "yes" to confirm:
> 1. We can use the shelter's name, logo and cat photos (including AI-styled versions) on tokentails.com and in our grant and hackathon entries.
> 2. Until the handover, Token Tails holds the wallet that receives Pink Paw's gifts. We'll pass every payout on to the shelter, and we'll hand the wallet over (or switch to a wallet the shelter creates) by {HANDOVER_DATE}.
> 3. Optional, and better for the shelter: if someone at Pink Paw can create its own wallet now (we'll walk you through it in 10 minutes), we'll register that address straight away instead.
> Thank you!

If they create their own wallet before the wave, put that address in `PROOF_SHELTER` and in
`client/public/shelter-payouts/campaign.json` `shelter.wallet`. `fund fill` reads it from there.

## 4. Mainnet: fund ONE wallet, run ONE command, commit (you about 30 min; AI 0 min)

**a. Send everything to the deployer** `0xd6F37D1241dA20BbE40D1210940Bc43A1Ec56263` (keystore
`tokentails`), on each chain, the total of `deployer + donatehot + agent` in
`funding/framework/tracks/a-build/funding-plan.json` (each line has its reason). This is the
minimal plan (Oct 5): every contract the submissions reference, one 0.1-token proof payout per
instance, the 0.1 USDC.e Tempo memo, a 10-treat float on the hot wallet and a 0.1 USDC Arc agent.
Gas has a 1.5x buffer. These are exactly the amounts the first balance check in `mainnet-all.sh` asks for:

| Chain | Send to the deployer | ≈ USD |
|---|---|---|
| Arc | 0.7 USDC (the gas coin) + 0.1 EURC | $0.81 |
| Tempo | 0.3 USDC.e + 0.15 pathUSD | $0.45 |
| Arbitrum One | 0.0004 ETH + 0.2 USDC | $1.29 |
| Avalanche | 0.075 AVAX + 0.2 USDC | $1.03 |
| Base | 0.0007 ETH + 0.2 USDC | $2.11 |
| Robinhood Chain | 0.0004 ETH + 0.2 USDG | $1.29 |
| Monad | 2 MON + 0.2 USDC | $0.27 |
| **Total** | USDC 1.5 · USDC.e 0.3 · pathUSD 0.15 · EURC 0.1 · USDG 0.2 · ETH 0.0015 (Arb 0.0004, Base 0.0007, RH 0.0004) · AVAX 0.075 · MON 2 | **≈ $7.25** |

Prices: CoinGecko, Oct 5 08:11 UTC. Do not fund donatehot or the agent yourself: the script does it.
Top up later (optional, one week of treats plus the Base x402 agent):
`PLAN=topup node bin/fund.mjs a:distribute --network mainnet` writes `wave/distribute-mainnet-topup.sh`.
Its `CHECK_ONLY=1` run prints what to send the deployer first (about Arc 13.6 USDC, Tempo 7 USDC.e + 0.42 pathUSD,
Arbitrum 0.0061 ETH + 7 USDC, Avalanche 1.5 AVAX + 7 USDC, Base 0.0021 ETH + 7.5 USDC, Robinhood
0.0061 ETH + 7 USDG, Monad 60 MON + 7 USDC; about $114).

**b. Run one command** from `funding/framework`, in your own terminal (the scripts refuse to run
inside an AI agent session and without `CONFIRM_MAINNET=yes`):

```bash
node bin/fund.mjs a:mainnet-plan --network mainnet    # writes wave/mainnet-all.sh + wave/distribute-mainnet.sh
CONFIRM_MAINNET=yes DRY_RUN=1 ./tracks/a-build/wave/mainnet-all.sh   # dry run: balance table, simulated deploys, printed transfers
CONFIRM_MAINNET=yes ./tracks/a-build/wave/mainnet-all.sh             # for real (cast asks for the keystore password)
```

In order, per chain: balance check (it prints a per-chain shortfall table: send what it says is
SHORT and rerun) → ShelterSplit USDC (`deploy-mainnet.sh`, proof payout 0.1 token: `PROOF_AMOUNT=100000`) → ShelterSplit EURC on Arc
(`deploy-mainnet-eurc.sh`; Avalanche EURC later) → DonateRouters (on Arc, Arbitrum, Avalanche, Base and Monad, plus the EURC router on Arc) → `a:ingest` (writes `wallet.config.ts` and the client and
Heist lists) → `a:verify` + `a:verify-source` → `distribute-mainnet.sh` (tops up donatehot's treat
float and gas, and the agent's x402 amount, only up to the plan's targets) → `fund fill --ingest
--write`. A chain that fails a step is left out of the later steps; the others go on. Rerunning
the same command is safe: finished deploys are skipped and recipients already at target get nothing.
Options: `CHAINS=arc,base` limits the run, `FUND_KEYSTORE_PASSWORD_FILE=<path>` skips the password
prompt, `RPC_<CHAIN>_MAINNET` overrides the public RPCs, `PROOF_SHELTER=` turns the proof payout off.

On Tempo the hot wallet pays its fees in pathUSD (the plan sends it 0.1 pathUSD), so no FeeManager
`setUserToken` call is needed. Arc is funded natively (USDC is the gas coin, one balance).

**c. Commit the files it prints** at the end (deployments, router deployments, `wallet.config.ts`,
the client and Heist lists, the filled drafts), push, and Vercel redeploys. Then run the two
Tempo campaign-memo `cast send` commands it prints and paste the hash as `TEMPO_TX` below.

If Arbitrum One slips: `node bin/fund.mjs a:mainnet-plan --network testnet`, then
`CHAINS=arbitrum ./tracks/a-build/wave/testnet-all.sh` (the Singapore rules accept Arbitrum Sepolia),
then `node bin/fund.mjs fill --ingest --network testnet --write`. `{ARB_NETWORK}` becomes "Arbitrum
Sepolia" on its own.

No EURC: the balance check marks Arc short (its reserve includes 0.1 EURC). Either
send 0.1 EURC there, or delete `arc` from `eurcChains` and `eurcRouterChains` and the
`EURC` reserve line in `funding-plan.json` (mainnet), rerun `a:mainnet-plan`, and remove the EURC
sentences from `applications/arc-microgrants/draft.md` (about −1 point), or `{EURC_SPLIT_ADDRESS}` stays open.

**Values only you have.** Paste them into `funding/framework/fill-values.json`, then run
`node bin/fund.mjs fill --write` again (2 min per value):
- `TEMPO_TX`: the manual `disburseWithMemo` hash. `a:ingest` does not record it.
- `ARC_TX`: the first sponsored treat on Arc. Once the Arc mainnet split is deployed and the hot wallet is funded (step 4), tap "Send Pink Paw a rescue treat" and copy the tx from the receipt URL.
- `DEMO_URL`: one per entry if they differ, e.g. `"arc-microgrants": { "DEMO_URL": "https://..." }`.
- `PITCH_VIDEO_URL`: Colosseum only.

## 5. Oct 3, before the Arbitrum submit: commit the licence (5 min)

Judges open the linked `shelter-split` folder. `shelter-split/LICENSE` (MIT) and `README.md` are
still untracked, so commit and push them with the deploy lists (WIN-READINESS-REVIEW SC-1, S16). The
carve-out sentence for `COMMERCIAL_LICENSE.md` is in SC-1. Confirm MIT is the licence you want.

## 6. Oct 3 evening: submit Arbitrum Singapore (20 min). It closes Oct 4 15:59 [zone?], 10:59 Vilnius worst case

1. `node bin/fund.mjs fill arbitrum-singapore` should show `{ARB_SPLIT}` and `{ARB_NETWORK}` filled.
2. If no treat has been paid yet (`ARC_TX` empty), run
   `node bin/fund.mjs fill arbitrum-singapore --write --fallbacks`. This swaps the three
   present-tense treat sentences for "built, switching on" wording, and drops "Demo:" if there is no
   video, so nothing in the entry is false.
3. `node bin/fund.mjs check arbitrum-singapore` must print no placeholder warning.
4. Paste `applications/arbitrum-singapore/submission.md` into HackQuest. Screenshot the confirmation,
   then run `node bin/fund.mjs status arbitrum-singapore submitted`.

## 7. Oct 3–5: videos (you 1–3 h)

Both demos were re-rendered tonight, offline, with the unconfirmed "agreed in writing" line
removed: `funding/media/out/demo-arc.mp4` (2:14) and `demo-colosseum.mp4` (2:10). Their title cards
still show `{SPLIT_ADDRESS}`. After the wave, run the re-render command that `fund fill` prints
(about 3 min, no human input), then upload both as unlisted videos and paste the URLs into
`fill-values.json`. The Colosseum pitch (2–3 min) has to be your own voice and camera.

## 8. Oct 5–7: Arc Microgrants (15 min). Target Oct 7, close Oct 14 23:59 ET (Oct 15 06:59 Vilnius)

Gate: Arc **mainnet** split live (testnet-only is excluded), and the 2a answer does not rule out
Tameion. `fund fill` covers the addresses. Then `check arc-microgrants`, paste `submission.md`
into the DoraBacks form linked from the Arc call page, take a screenshot and set the status.

## 9. Oct 10 and Oct 11: Tameion (if invited) and Colosseum

Tameion closes Oct 10 23:59 ET (Oct 11 06:59 Vilnius) and uses the x402 agent card. It is on by
default on testnets; on mainnet it opens only after Pink Paw claims its own wallet on that chain. Colosseum closes Oct 12 23:59 PT (Oct 13 09:59 Vilnius), and the Team Leader submits.
Every member must register on colosseum.com first (5 min each).

## 10. Oct 12–16: x402 Foundation micro-grant (you 45 min, after the build)

The texts are drafted in `funding/framework/applications/x402-microgrant/answers.md`: the GitHub
issue, the X post tagging @coinbaseDev and a 2-minute video script. They describe the state after
the Oct 12–14 build (standard `exact` scheme through a facilitator, on mainnet). Do not post them
before that build is live. It also needs your x402 go decision, because the endpoint stays off until
the Pink Paw handover. After the build, paste `X402_URL`, `PAY_TX`, `VIDEO_URL` and `X402_CHAIN`
under `"x402-microgrant"` in `fill-values.json` and run `node bin/fund.mjs fill x402-microgrant --write`:
it fills `answers.md` and re-renders the paste sheet `fill.md` for you.
