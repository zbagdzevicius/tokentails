# Your list, from Oct 2 evening (Vilnius)

Written 2026-10-02 at 22:40 Vilnius. Ordered by deadline. Each item says how long it takes. Every
message below is ready to paste. Anything in `{BRACES}` is a value only you have. Nothing here has
been sent. AI does not send, post, sign or submit.

**Live check at 22:40.** `api.tokentails.com/shelter/donate/status` returns 200
(`enabled:false`, `chainId:5042`, `splitAddress:null`), so the new backend is up. The treat stays off
until the Arc mainnet split exists and `SHELTER_DONATE_*` is set. `/shelter/agent/cat-card` returns
**504** (it should give 402 once x402 is on). `tokentails.com/shelter-payouts` returns 200.

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

## 4. Oct 3: the mainnet wave, then ONE command fills every draft (you about 1 h; AI 0 min)

In your env shell (keystore, RPC URLs, treasury), from `funding/framework`:

```bash
node bin/fund.mjs a:wave --network mainnet   # regenerates wave/deploy-mainnet.sh with today's chains
DRY_RUN=1 ./tracks/a-build/wave/deploy-mainnet.sh   # simulate first
./tracks/a-build/wave/deploy-mainnet.sh             # sign + broadcast (you); runs a:ingest itself at the end
DRY_RUN=1 ./tracks/a-build/wave/deploy-mainnet-eurc.sh   # only after the USDC run above has finished
./tracks/a-build/wave/deploy-mainnet-eurc.sh             # EURC instances on Arc and Avalanche (needs a little EURC)
node bin/fund.mjs fill --ingest --write             # a:ingest + source verify + fill every draft + re-render submissions
```

`fill --ingest --write` records and verifies the deployments, publishes the mainnet list to the
payouts page and Heist, and writes `{SPLIT_ADDRESS}`, `{EURC_SPLIT_ADDRESS}`, `{ARC_PROOF_TX}`,
`{ARB_SPLIT}`, `{ARB_NETWORK}`, `{ARC_NETWORK}` and `{SHELTER_WALLET}` into every draft. It skips
text inside comments and any entry already marked submitted. Then it runs `a:submission` for each
entry and prints what is still owed, plus the exact command to re-render both demo videos with the
real addresses. Run `node bin/fund.mjs fill` without `--write` first if you want a preview.

If Arbitrum One slips: run `node bin/fund.mjs a:wave --network testnet --chains arbitrum`, then
`./tracks/a-build/wave/deploy-testnet.sh` (the Singapore rules accept Arbitrum Sepolia), then
`node bin/fund.mjs fill --ingest --network testnet --write`. `{ARB_NETWORK}` becomes "Arbitrum
Sepolia" on its own.

No EURC in the deployer: skip the two EURC lines and remove the EURC sentences from
`applications/arc-microgrants/draft.md` (about −1 point), or `{EURC_SPLIT_ADDRESS}` stays open.

Then commit and push the deployment lists so Vercel redeploys (the tracker's "after the wave" row).

**Values only you have.** Paste them into `funding/framework/fill-values.json`, then run
`node bin/fund.mjs fill --write` again (2 min per value):
- `TEMPO_TX`: the manual `disburseWithMemo` hash. `a:ingest` does not record it.
- `ARC_TX`: the first sponsored treat on Arc. Once `SHELTER_DONATE_*` is on, tap "Send Pink Paw a rescue treat" and copy the tx from the receipt URL.
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

Tameion closes Oct 10 23:59 ET (Oct 11 06:59 Vilnius) and needs the x402 decision (on now, or after
the handover). Colosseum closes Oct 12 23:59 PT (Oct 13 09:59 Vilnius), and the Team Leader submits.
Every member must register on colosseum.com first (5 min each).

## 10. Oct 12–16: x402 Foundation micro-grant (you 45 min, after the build)

The texts are drafted in `funding/framework/applications/x402-microgrant/answers.md`: the GitHub
issue, the X post tagging @coinbaseDev and a 2-minute video script. They describe the state after
the Oct 12–14 build (standard `exact` scheme through a facilitator, on mainnet). Do not post them
before that build is live. It also needs your x402 go decision, because the endpoint stays off until
the Pink Paw handover. After the build, paste `X402_URL`, `PAY_TX`, `VIDEO_URL` and `X402_CHAIN`
under `"x402-microgrant"` in `fill-values.json` and run `node bin/fund.mjs fill x402-microgrant --write`:
it fills `answers.md` and re-renders the paste sheet `fill.md` for you.
