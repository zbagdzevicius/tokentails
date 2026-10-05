# What we are missing to win (2026-10-02)

> **Status (2026-10-05), checked against the code; the audit below is unchanged.** Backend env for
> gifts is now only `SHELTER_CHAIN_ID` and `SHELTER_DONATE_PRIVATE_KEY`: the split, router and
> treasury come from the generated `backend/src/shelter/onchain/wallet.config.ts`, and treats and
> x402 are on by default (a848d790). That resolves the x402 policy conflict: the x402 card is on on
> testnets, and on a mainnet it, the relay and the match open only after the shelter's own wallet
> is claimed on that chain. Monad (143 and 10143) is in the client's `chains.ts`. `campaign.json`
> now has a 50,000 USDC goal and the Pink Paw wallet (cb10e83a). The contract runs on seven chains,
> not four. Live-site items (backend env on DigitalOcean, endpoint status) were not re-checked.

# What we are missing to win (merged from the Judge, Ops and Legal audits, Oct 1 evening)

The hours below are estimates, and the score lifts are the judge's opinion. None of them are measured.

**About the webhook:** the backend does deploy automatically, but only from GitLab `zbagdzevicius/tokentails-be`. DigitalOcean app `tokentails-be` watches that GitLab repo, and its live build is from Jul 28 (commit `6443190083c6`). Pushes to the GitHub monorepo never reach it. That is why 9734bed0 isn't live and `/shelter/donate/status` returns 404. Item 4 covers the fix.

## Blocking (fix these, or an entry fails)

| # | What | Why (entry and criterion) | Owner | Time | Do by |
|---|---|---|---|---|---|
| 1 | Register on HackQuest. The page gives "17:01" with no time zone, so assume Singapore time | Arbitrum Singapore: you can't submit without registering | You | 0.2h | **Oct 2, 12:00 Vilnius** |
| 2 | **Pink Paw custody and consent.** Best option: Pink Paw creates its own self-custody key today, and that address goes into the Oct 2 deploy and `campaign.json`. Fallback: reword every disclosure to say "Token Tails' own money, set aside for Pink Paw", hand over by Oct 9, and re-register the address in ShelterSplit at handover. Also get a signed letter (email is fine) covering the names, logo, cat photos and AI versions, custody and the handover date. Until it arrives, Arc's "consented in writing" must be changed or held back | All crypto entries. A false claim can disqualify Arc. Holding the wallet looks like MiCA custody (Legal R2, R3) | You (AI drafts the letter and the fallback wording) | 1–3h | Key: Oct 2, before the deploy. Letter: Oct 3 |
| 3 | **Wallets and funding.** First commit `.gitignore` so `funding/.secrets/` is ignored. Then create these wallets: `SHELTERSPLIT_TREASURY` (the deploy scripts need it), a hot wallet for `SHELTER_DONATE_PRIVATE_KEY` (never the deployer), an agent wallet, a wallet to receive the Arc grant, and a Solana wallet for the Colosseum Team Leader. Fund every chain using the Ops table. Get Tempo pathUSD, or test USDC.e as the fee token. Get Arc testnet faucet funds for G2 | The deploy can't run without these. Both current wallets have 0 balance on every chain | You | 2–3h | Oct 2 |
| 4 | **Get the backend live.** Diff GitLab `tokentails-be` against monorepo `backend/`. Point the DO app at GitHub `tokentails`, branch `main`, `source_dir backend` (or push the subtree to GitLab). Add `FB_PRIVATE_KEY` (without it the app crashes on boot), `TRUST_PROXY` (without it everyone shares one 300 requests/min bucket and gets 429s), `SHELTER_*`, `STELLAR_*` and `SENDGRID_FROM_EMAIL` as encrypted env values. Deploy only committed main, without the roughly 700 uncommitted changes. Check that `/shelter/donate/status` and `/shelter/agent/cat-card` return 200 and the CORS headers include `X-PAYMENT-RESPONSE`. Then run `skip-codex-cycle.js --period 2026-10 --apply` | The gift flow and the agent endpoint are the only live flows in Arc, Colosseum, Tameion, Arbitrum and Monad. A judge who clicks gets a 404 now. It costs about +2 on quality or functionality, and the G3 gate is Oct 4 | You (DO console, env). AI (diff, checks) | You 1–1.5h, AI 0.5–1h | Oct 2–3. **Codex script before Oct 8 23:00Z, or rewards are paid twice** |
| 5 | **Deploy, verify, publish.** Run `fund a:build --all` under forge 1.6.0. Then the mainnet wave, the Tempo memo payout and `forge verify-contract` on the Arc and Tempo explorers. Run `a:ingest`, commit `deployments.json` and `campaign.json`, and redeploy on Vercel (live it still says goal 500, wallet null). Phone-check that the counter matches the explorer. Fix the "© 2025" footer. Decide on Monad: chain 143 isn't in the wave or in `chains.ts` | The Arc gate is "live on mainnet when you submit". Unverified source costs about -1 technical credibility | AI (build, verify script, ingest). You (sign and run) | AI 2h, you 1h | Oct 2–3 |
| 6 | **Registrations and questions.** Every Colosseum member registers and gives consent, and you name the Team Leader. Request Tameion on Luma. Log in to Monad and read the rules. Join the Anitya Discord and check you can see `#jam-submission`. Send the questions: Arc (cap), Colosseum (multi-track, video, CASH payout for a Lithuanian), Canteen (Arc conflict, payout method), Monad (rules) | Without registration Colosseum can't be submitted. The Canteen answer decides whether Tameion puts Arc at risk | You (AI drafts every message) | 1h | Send questions Oct 2. Colosseum registration Oct 3 (hard stop Oct 12 23:59 PT) |
| 7 | **Truth pass on every draft.** No present-tense claims until the routes return 200. Decide x402 for Tameion: on after the handover, or on Arc testnet. Fix the Monad wording that lists the endpoint without saying it's off. Remove the Arbitrum and Public Goods tracks from Colosseum until G5 answers. Remove Robinhood from the Arbitrum `chain:` field. Use one placeholder style (`{DEMO_URL}`, `{ARB_SPLIT}`, `{MONAD_SPLIT}` against `{DEMO_VIDEO_URL}`). Keep the prior-work disclosure in every entry. Add "every link returns 2xx" to `fund check` | Untrue statements risk disqualification. Judges open links | AI. You make the x402 decision | AI 1.5h, you 0.3h | Oct 3, before the Arbitrum submission |
| 8 | **Anitya goes through Discord.** Change the Oct 20 plan row from "itch.io" to Discord `#jam-submission` plus itch. Close is Oct 21 22:59:59 UTC, which is Oct 22 01:59 Vilnius | An itch page alone isn't an entry | AI (plan edit). You (posting) | 0.2h | Plan fix now; post by Oct 20 |

## High-lift (big score gain per hour)

| # | What | Why | Owner | Time | Do by |
|---|---|---|---|---|---|
| 9 | Clean public repo `shelter-split`: contracts, tests, `shelter-rail/`, and a README with architecture, addresses, explorer links, how to run the tests, prior-work and custody disclosures, and a GIF. Point every `repo:` field at it. Confirm the tracked `client/.env.production`, `client/.env.app` and `cms/.env.*` hold only public values (AI must not read them). Removing `funding/` from public `main` is your call | Now judges land on a folder with no README, next to win reviews and €105 revenue. About +1–2 on Arc technical credibility and Colosseum functionality and open source | AI. You approve and check the env files | AI 2–3h, you 0.5h | Oct 3 |
| 10 | Videos: Arc 60–90 s (Heist win → tap → receipt → explorer). Tameion under 3 min, showing the agent deciding. Colosseum demo up to 3 min, plus a **2–3 min pitch in your own voice**. Leave user `/portrait` photos out | Colosseum judges review the pitch first (about +1–2 across criteria). Tameion requires a demo. Arc +1 | AI (scripts, renders). You (record, upload) | AI 4h, you 3h | Oct 5 (Arc's by Oct 6) |
| 11 | Tempo sponsored gift: send the Heist gift through `disburseWithMemo` on Tempo with a sponsored fee payer, then run it Oct 4–11 for real in-window counts. Stretch: MPP agent endpoint (AI 8–12h), only if G1 passes by Oct 3 | Today Tempo has one manual transaction, and the real flows run on Arc. UX +2, functionality +1 | AI. You (fund pathUSD and USDC.e, set env) | AI 5–8h, you 1h | Live Oct 4 |
| 12 | Tameion agent that decides: a Claude tool-use loop with a daily budget. It reads payouts, the campaign meter and shelter goals, chooses the shelter and amount, buys through the 402 endpoint, and posts its reasoning per receipt. The cap and refusal logic stay in code. Add a Circle developer-controlled wallet. Add Paymaster if Arc supports it (unverified). Offer the next shelter a Circle wallet. Go ahead only if Canteen's answer doesn't threaten Arc | Weighted score about 2.4 → 5.3 (agentic 30%, Circle tools 20%) | AI. You (Circle console; the API key goes into `.secrets`, never into chat) | AI 13–20h, you 2h | Oct 9 (close Oct 10 23:59 ET) |
| 13 | Team, business case and Arc focus. You add founder names, roles and one line of background to FACTS.md, and AI rewrites the Team sections. Pitch ShelterSplit Rail as B2B verifiable cause-marketing payouts, with Token Tails as customer zero and one sourced market figure. Make the Arc text Arc-only: USDC as gas, fast finality for the receipt, EURC for EU shelters | Colosseum business plan and team +2. Arc relevance +1 | You (facts). AI (rewrite) | You 1h, AI 2h | Oct 4 |
| 14 | Anitya HQ gameplay: key unlocks the vault, five patrolling dogs that reset the player, catnip counter, win message at Clover's crate, music and alarm. Spawn facing the façade, add the sign, and use a dramatic thumbnail. Apply Weekly Challenge 2 feedback | Immersive 60% (+3), Creative and Inviting (+2–3). About +2.4 weighted | AI (prompts, MCP edits). You (builder session, play-test) | AI 4–5h, you 2h | Oct 18 |

## Nice-to-have

| # | What | Why | Owner | Time | Do by |
|---|---|---|---|---|---|
| 15 | Social proof and counts: X post of the deploy as the Arc builder profile, a Pink Paw public post, Colosseum weekly clips on Oct 5 and Oct 11, a real-counts write-up (`tt:` memos, distinct players, agent calls) whatever the numbers are, and outreach to a second shelter that holds its own key | Arc builder profile (+0.5). Colosseum traction and execution (+1). Viability in every crypto entry (+1–2 for a second shelter) | You (posts, outreach). AI (copy, counts) | You 2–3h, AI 1h | X post Oct 3. Counts Oct 11 |

**Outside the 15 but not optional before payout:**
- Book one hour with an accountant by Oct 9: whether the MB or a person receives each prize, Colosseum class B income, and VAT on Arbitrum's milestone prizes.
- Read the Arbitrum T&C PDF on Oct 3.
- Each team member checks their employer's side-project and IP terms (Colosseum s.3(c)).
- The Arc submission should mention the Tameion entry.

## Your wallet JSON

A JSON file is fine if it stays local, and the setup below keeps it safe:

1. Commit the `.gitignore` change first (`funding/.secrets/` isn't ignored on `origin` yet). Then create `funding/.secrets/wallets.json` and run `chmod 600` on it.
2. Add one entry per wallet with these fields: `label`, `address` (the public key as an address), `publicKey` (optional; `cast wallet public-key`), `privateKey`, `mnemonic` (the seed phrase), `keystoreName`, `keystorePassword`, `chains`, `role`, `createdAt`, `notes`. Keep the seed phrase and the keystore password as separate fields, since both get called "passphrase".
3. Check each entry in your own shell with `cast wallet address --private-key …`.
4. Better: encrypt the file (`age -p wallets.json > wallets.json.age`, then delete the plain copy) and keep the main copy in a password manager. Never paste it into a Claude session.
5. For addresses only, add a tracked `funding/framework/tracks/a-build/wallets.public.json` with label, address, chains, custody status and handover date. Every draft points to that file.
6. **Pink Paw:** if the shelter creates its own key (item 2), there is no Pink Paw entry with secrets at all. That is the point of the handover. If the current Pink Paw wallet stays in use for now, never hand over its JSON entry. At handover, Pink Paw makes a new key and the shelter address is re-registered on-chain.

## What AI can start right now, without you

1. Draft the questions to Arc, Colosseum, Canteen and Monad, the Pink Paw consent letter, and the fallback disclosure wording.
2. Write the empty `wallets.json` template, the `wallets.public.json` skeleton, and the age encryption commands.
3. Run `fund a:build --all` under forge 1.6.0 and write the `forge verify-contract` script for Arc and Tempo. Do a DRY_RUN to size gas for Monad.
4. Assemble the `shelter-split` repo locally with the README, leaving address and explorer slots for after the deploy.
5. Do the truth pass on all drafts. That covers the placeholders, Robinhood, the Colosseum tracks, the Monad x402 wording, the Arc-only rewrite and the Anitya Discord row. Add the link-2xx check to `fund check`. Fix the "© 2025" footer.
6. Write the deploy checklist: the DO repoint, the env names, the 200 and CORS checks, and the codex-skip command. Prepare the GitLab-vs-`backend/` diff (this needs read access to GitLab).
7. Build the Tempo `disburseWithMemo` gift path with fee sponsorship, behind a flag, with tests.
8. Scaffold the Tameion decision agent on Arc testnet.
9. Write the video and pitch scripts and storyboards.
10. Write the business case with one sourced cause-marketing figure (via WebFetch).
11. Write the Anitya HQ logic prompts, spawn layout and thumbnail plan.
12. Add Monad 143 to `chains.ts` on a branch, to merge once you decide on Monad.

Everything that needs a signature, money, an account, a recording or outreach stays with you: items 1–4, the registrations, the videos, the posts and the letter.

The audits are in the repo: `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/EXECUTION-PLAN.md` and `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/applications/{arc-microgrants,colosseum-worlds-fair,tameion,arbitrum-singapore,monad-metropolis}/`.

---

## Judge simulation

# Judge simulator: Arc Microgrants, Colosseum (Tempo), Tameion and the Anitya main jam (checked Oct 1, evening)

Scores are my judgment on a 1–10 scale. They assume the Oct 2 deploy works as planned. None of them are measured data.

## Fix these first: they break all four entries

1. **The backend didn't deploy.** `api.tokentails.com/shelter/donate/status` returns 404, and so does `/shelter/agent/cat-card`. That means the "Send a rescue treat" button on `/shelter-payouts/give` currently leads to a 404. This is the only real user flow in the Arc, Colosseum and Tameion entries, and a judge who clicks it will see it fail.
   - **Fix:** the webhook either didn't build 9734bed0 or the build crashed on boot. Open your host's deploy log for that commit (paste it with secrets removed), fix it, and redeploy. Then check that both routes answer.
   - **Hours:** you 0.5–1, AI 0.5.
   - **Lift:** roughly +2 on "quality" or "functionality" in all three crypto entries. Without it, the "working" gate is at risk.

2. **The public repo works against us.**
   - The repo link in all three submissions points to `funding/framework/tracks/a-build/shelter-split`. That folder has no README.
   - The public `main` has 260 files under `funding/`. They include the win reviews ("would win nothing"), WINNING-STRATEGY.md with our odds math, and the hostile-judge prompts. Facts in that folder also include revenue of €105. A judge who browses the repo sees a grant-hunting pipeline, not a product.
   - **Fix:** create a clean public repo (`shelter-split`) containing the contracts, the tests, `shelter-rail/` and a README. The README needs the architecture, the addresses, explorer links, how to run the tests, the prior-work and custody disclosures, and a short GIF. Point every `repo:` field at the new repo.
   - Taking `funding/` off public `main` is your decision. History will still contain it, so the new repo is the real fix.
   - **Hours:** AI 2–3, you 0.5.
   - **Lift:** +1–2 on Arc technical credibility and on Colosseum open-source and functionality.

3. **Contracts aren't verified on the explorers.** After deploying, verify the source on the Arc and Tempo explorers. Otherwise judges see bytecode only.
   - **Hours:** AI 1 (scripted `forge verify-contract`), you 0.3.
   - **Lift:** +1 technical credibility.

4. **Pages don't show proof yet.** Server-side, `/shelter-payouts` shows no data and `deployments.json` is `[]`, which is expected before the deploy. After `a:ingest` and the redeploy, check on a phone that the counter matches the explorer. The footer also still says "© 2025".
   - **Hours:** AI 0.5.

5. **There is no proof from the shelter itself.** All four drafts lean on "Pink Paw consented". Judges can't check consent.
   - **Fix:** get a public post or a short signed letter from Pink Paw, and link it. A second shelter that controls its own wallet is the biggest single credibility gain.
   - **Hours:** you 1–3 (outreach).
   - **Lift:** +1–2 on viability and impact in every crypto entry.

6. **The team is anonymous.** The Team sections in all drafts name no people. Colosseum's FAQ lists founder-market fit first.
   - **Fix:** you add each founder's name, role and one line of background to FACTS.md. AI then rewrites the Team sections without inventing anything.
   - **Hours:** you 0.5, AI 0.5.
   - **Lift:** +2 on Colosseum business plan and team. Arc allows pseudonymous builders, so this matters less there.

## 1. Arc Microgrants

The call page was re-checked today. The criteria are "Relevance to Arc, technical credibility, the quality of what you built, and whether the project is worth taking further." Promise counts for more than traction. There are 20 grants of $500 each, decided in batches.

| Criterion | Planned | After fixes | Why |
|---|---|---|---|
| Gate: live on mainnet, repo, profile | pass if Oct 2 works | pass | The live link must work when submitted, so fix #1 |
| Relevance to Arc | 6 | 8 | `donate()` with native USDC as gas is a real Arc fit. Weak: the same contract runs on four chains, so it reads as "multi-chain, Arc is one of them" |
| Technical credibility | 6 | 8 | 73 tests and fuzzing are good. Weak: no README, unverified source, the owner is an EOA, and the repo sits inside `funding/` |
| Quality of what you built | 4 | 7 | The gift flow is a 404 today. There is no demo video. The EURC instance is still a placeholder |
| Worth taking further | 5 | 7 | There is one shelter, held by us, and no letter. "A fixed share of purchases" is unconvincing without numbers |

Gaps and fixes:
- **Arc reads as one of many chains.** Remove every mention of other chains from the Arc text. Lead with three Arc reasons: "USDC is the gas, so the shelter needs nothing else", fast finality lets the in-game receipt show a settled payout, and the EURC instance serves EU shelters (already in the draft). AI 0.5h, +1.
- **No demo video.** The `{DEMO_VIDEO_URL}` placeholder is still empty, and `demo:` in `call.md` is blank. Make a 60–90 s screen recording of the real flow: Heist win → tap → receipt page → explorer event. AI 2h to render, you 0.5h to check and upload, +1.
- **Fixes #1–#5 above.** Together about +2.
- **Builder profile.** Post the deploy, with its explorer link, from the Token Tails X account and link that post as the builder profile. You 0.2h, +0.5.
- **Submit early.** Reviews are rolling and batched, so earlier entries face less competition for the 20 grants. Keep the Oct 7 date, and also send the cap question to Arc.

## 2. Colosseum World's Fair (Tempo track)

The FAQ was re-checked today. The pitch video is "one of the first resources judges review". Judges look at "founder-market fit, unique insights, execution quality, market opportunity, communication clarity, business viability, and demonstrated traction". Only in-window work is judged. The `/worldsfair/tempo` page returns 404, so there are no Tempo-specific criteria beyond rules §14(f): the product must "integrate with the Tempo blockchain".

| Criterion | Planned | After fixes | Why |
|---|---|---|---|
| Functionality and code | 5 | 7 | Same issues as Arc: the 404 backend, no README, unverified source |
| Potential impact and TAM | 3 | 5 | No market size. A charity split isn't venture-scale |
| Novelty | 3 | 5 | Split contracts are common (0xSplits, Endaoment) |
| UX via blockchain | 3 | 6 | **The only real user flow (the sponsored gift) and the agent flow run on Arc, not Tempo.** Tempo carries one manual memo payout |
| Open source and composability | 5 | 7 | The SDK and widget are good. The repo hygiene isn't |
| Business plan and team | 2 | 5 | No names, a cost-centre model, and due diligence will see €105 revenue |

Gaps and fixes:
- **Tempo shows only one manual transaction.** Route the Heist sponsored gift to the Tempo instance through `disburseWithMemo`, with the gift's memo, and pay the fee with a sponsored fee payer so players never touch a fee token. Then the live user flow is on Tempo too.
  - **Hours:** AI 5–8 (backend chain config, fee sponsorship, tests), you 1 (fund pathUSD and USDC.e, set env).
  - **Lift:** UX +2, functionality +1. This is the biggest lift for the Tempo track.
- **Weak Tempo-native novelty.** Expose the agent endpoint over Tempo's machine-payments flow (MPP), alongside the Arc x402 scheme. Then "an agent pays a shelter on Tempo" is in the demo.
  - **Hours:** AI 8–12. **Lift:** novelty +2.
  - Do it only if G1 (Tempo toolchain) passes by Oct 3.
- **No pitch video.** Judges review it first. Record a 2–3 minute pitch: founder story (why cats and shelters), problem, a live clip, the ask.
  - **Hours:** AI 1 (script), you 2 (record and re-take).
  - **Lift:** about +1–2 across all criteria. Without it, judges stop reading.
- **No business case.**
  - **Fix:** pitch ShelterSplit Rail as B2B "verifiable cause-marketing payouts" for any app or brand that promises "X% goes to charity". Token Tails is customer zero.
  - **Market size:** cite one sourced cause-marketing figure. Don't invent one.
  - **Hours:** AI 1.5, you 0.5. **Lift:** +2 on business plan, +1 on impact.
- **Unnamed team.** Fix #6 above, +2 on business plan and team.
- **No in-window traction.** Run the Tempo gift from Oct 4 to Oct 11 and report the real count of `tt:` memo payouts and distinct players, whatever the number is. You 0.5h posting, AI 0.5h writing it up, +1.
- **No weekly-update videos.** They're optional 1-minute progress clips. Post one on Oct 5 and one on Oct 11 (AI 0.5h, you 0.5h). This adds a small "execution" signal.
- **Registration.** Register all members, name the Team Leader and send the multi-track question. Without registration the entry can't be submitted at all.

## 3. Tameion (Canteen x Circle x Arc)

The page was re-checked today. Weights: Agentic sophistication 30% ("How much does the AI actually decide versus just automate?"), Traction 30%, Circle tool usage 20%, Innovation 20%. Entry is invite-only through Luma; the page shows a priority passphrase. An existing project must show progress in the window on **both product features and user onboarding**. Named tools: Wallets, Paymaster, CCTP, Gateway, USYC, Contracts, x402-compatible payments, Nanopayments, USDC and EURC.

| Criterion (weight) | Planned | After fixes | Why |
|---|---|---|---|
| Agentic sophistication (30%) | 2 | 6 | `payAndFetch` is a fixed script with a cap. No AI makes a decision |
| Traction (30%) | 1 | 3 | One shelter, held by us. x402 is off and the endpoint returns 404. No outside agent has used it |
| Circle tools (20%) | 3 | 7 | Only USDC and EURC. The draft admits no Wallets, Paymaster, CCTP or Gateway |
| Innovation (20%) | 5 | 6 | "The seller's revenue is the donation" is a good angle |
| **Weighted /10** | **~2.4** | **~5.3** | |

Gaps and fixes:
- **No AI decides anything.** Build a real decision-making agent: a Claude tool-use loop with a daily budget. It reads on-chain payouts, the campaign meter and each shelter's goal. It chooses which shelter to fund and how much, buys cards through the 402 endpoint, and writes a short public rationale linked to each receipt. The cap and the refusal logic stay in code.
  - **Hours:** AI 8–12, you 1.
  - **Lift:** +4 on a 30% criterion, about +1.2 weighted.
- **No Circle tools beyond the stablecoins.**
  - Give the agent a Circle developer-controlled wallet.
  - Pay its gas through the Circle Paymaster, where Arc supports it. Unverified: check the Circle docs.
  - Offer the next shelter a Circle wallet so it holds its own key without a seed phrase. This is also the handover path for Pink Paw.
  - **Hours:** AI 5–8, you 1 (Circle console account; the API key goes into `funding/.secrets`, never into chat).
  - **Lift:** +4 on a 20% criterion, about +0.8 weighted.
- **Almost no traction.**
  - Switch x402 on against the Arc mainnet instance for the window. That conflicts with the "off until handover" MiCA caution, so the team has to decide. A Circle-wallet shelter would remove the conflict.
  - Announce the endpoint in Canteen's channels and invite builders to point an agent at it.
  - Report real in-window counts of players, gifts and agent calls.
  - **Hours:** you 2, AI 1. **Lift:** +2 on a 30% criterion, about +0.6 weighted.
- **Not invited yet.** Register on Luma today. Also ask Canteen whether a Tameion prize affects Arc Microgrants eligibility, since Arc excludes work already funded by Circle or Arc. Arc's decision comes by Oct 21, so submitting Arc on Oct 7 first reduces the risk.
- **Demo video.** It must be under 3 minutes and show the agent deciding, not only paying. AI 2h, you 0.5h.

## 4. Anitya World Jam, main jam

The page was re-checked today. Weights: Immersive 60% ("Would I genuinely want to play again?"), Creative 20% ("Are you creatively using Anitya's features?"), Inviting 20%. The close is Oct 21, 22:59:59 **UTC**, which is Oct 22, 01:59 Vilnius. The page showed 1 submission and 63 participants. **Entries go through the Anitya Discord, not itch.io alone.**

| Criterion | Planned | After fixes | Why |
|---|---|---|---|
| Immersive (60%) | 4 | 7 | heist-08 as planned is a static GLB with every door open. The guard dogs don't move, and there is no goal and no sound. You can walk around it, but there's nothing to play |
| Creative (20%) | 2 | 6 | It uses none of Anitya's own features. The logic prompts exist only for Weekly Challenge 2 |
| Inviting (20%) | 5 | 7 | Good title and theme fit. The spawn view and thumbnail aren't designed |

Gaps and fixes:
- **No gameplay.** Write HQ-specific logic prompts:
  - picking up the key unlocks the vault;
  - the five guard dogs patrol, using the animated flipbook dogs from the kit, and catching the player sends them back to the start;
  - a catnip counter;
  - reaching Clover's crate shows a win message;
  - ambient music and an alarm sound.
  - Apply them through the Anitya MCP connector or Magic Box.
  - **Hours:** AI 3–4 (prompts and connector edits), you 1.5 (builder session and play-test).
  - **Lift:** Immersive +3, Creative +3, about +2.4 weighted.
- **The first view doesn't invite.** Spawn the player facing the HQ façade, add a sign ("Kibble Corp HQ: no cats beyond this point"), and use a dramatic overview shot as the feed thumbnail. AI 1h, you 0.5h, +2 on Inviting.
- **The plan submits on itch only.** The Oct 20 row in EXECUTION-PLAN.md says "submit on itch.io". The jam page says the entry must be posted in Discord `#jam-submission`, and an itch page alone doesn't count. Post in Discord and on itch both. 0.2h. This fixes a disqualification risk.
- **Use the Weekly Challenge 2 result.** Read any judge feedback on heist-01 before Oct 18 (G8) and apply it to heist-08. AI 0.5h.

## Missing pieces in priority order

| # | Fix | Hours (AI / you) | Who gains |
|---|---|---|---|
| 1 | Get the backend deploy running (both routes 404 now) | 0.5 / 1 | Arc, Colosseum, Tameion |
| 2 | Clean ShelterSplit repo with a README; repo links point to it | 2.5 / 0.5 | All three crypto entries |
| 3 | Demo videos, plus your Colosseum pitch | 4 / 3 | All four |
| 4 | Tempo gift with memo and fee sponsorship | 6 / 1 | Colosseum |
| 5 | Agent that decides, plus Circle Wallets | 15 / 2 | Tameion, and later the Circle grant |
| 6 | Anitya HQ logic and spawn | 4 / 2 | Anitya main |
| 7 | Named founders; Pink Paw public post or letter; a second shelter | 1 / 3+ | All |
| 8 | Verified source, X post of the deploy, in-window counts | 1.5 / 1 | All |
| 9 | Send the questions (Arc cap, Colosseum tracks and video, Canteen conflict, Monad rules) and finish Colosseum registration and the Tameion Luma request | 0 / 1 | Gates |

## Your wallet file

`funding/.secrets/` is gitignored (I checked with `git check-ignore`) and is not in `origin/main`. I didn't open it.
- Keep one file there, for example `funding/.secrets/wallets.json`, and run `chmod 600` on it.
- One entry per wallet: `label` ("deployer" or "pink-paw-custody"), `address`, `keystoreName`, `privateKey`, `passphrase`, `createdAt`, `notes`.
- Before you save, check that each private key derives its address: `cast wallet address --private-key …` (run it in your own shell).
- Storing the passphrase next to the private key makes the Foundry keystore pointless. A password manager is safer, so treat the file as a backup.
- Never paste the file's contents into a Claude session, and never stage `funding/.secrets`.
- At the Pink Paw handover the shelter makes its own key and the funds move by a public transaction. Don't hand over this JSON entry.

The files I read are in `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/applications/{arc-microgrants,colosseum-worlds-fair,tameion}/` and `/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist/export/anitya/SUBMISSION.md`.

## Operations audit

# Token Tails readiness audit, Oct 2–13 (as of Oct 1 evening, Vilnius)

The biggest finding is the backend. Pushing to GitHub has never redeployed it, so the "stale build" is really a wiring problem. If it isn't fixed by Oct 3–4, the one-tap gift isn't live, the G3 donate-button gate fails, and the Arc, Colosseum, Tameion, Arbitrum and Monad drafts all describe something that isn't running.

## 1. Backend deploy (blocks the gift, the x402 endpoint and every draft that mentions them)

**What is live, checked read-only with `doctl` and `curl`:**
- `api.tokentails.com` is DigitalOcean App Platform app `tokentails-be`.
- Its source is **GitLab `zbagdzevicius/tokentails-be`, branch `main`, `source_dir /`**. Auto-deploy on push is on, but only for that GitLab repo.
- The live deployment dates from 2026-07-28 ("maintenance") and runs commit `6443190083c6`. That commit does not exist in the GitHub monorepo.
- Pushes to GitHub `tokentails` main never reach it. The webhook you mentioned is GitLab's, not GitHub's.
- A second check agrees: the live CORS headers lack `Retry-After`, which 69b0a2a8 added, and `X-PAYMENT-RESPONSE`, which 9734bed0 added. So neither of the Sep 30 commits is live.

**Will the committed code build?**
- Every relative import in 9734bed0 `backend/src` resolves within the commit.
- `npx tsc --noEmit` passes with TypeScript 4.8.3 and `skipLibCheck`.
- `ethers` 6.17.0 is in both `package.json` and the lockfile.
- I expect it to build. I could not run a real build from a clean export (that command was denied).

**What will break at boot or in use once it does deploy:**
- **`FB_PRIVATE_KEY` is missing from the DO env.** The monorepo reads it from env; the old repo apparently hard-coded it. With it empty, `admin.credential.cert` throws while the module loads, so the app won't start. This is the critical one.
- **`TRUST_PROXY` is missing.** The app sits behind Cloudflare and the DO router. Without it, every user shares one global bucket of 300 requests a minute, and the whole app returns 429s once that fills. The hop count is unverified: check `req.ip` after deploy.
- **`SHELTER_*` names are missing:** `SHELTER_DONATE_ENABLED`, `SHELTER_SPLIT_ADDRESS`, `SHELTER_DONATE_PRIVATE_KEY`, amount, budget, and optionally `SHELTER_CHAIN_ID` and `SHELTER_ARC_RPC_URL`. The defaults are 5042 and `rpc.mainnet.arc.io`, and I confirmed that chain ID over RPC.
- **Also read by the code but missing in DO:** `STELLAR_USDC_ISSUER`, `STELLAR_TREASURY_ADDRESS`, `SENDGRID_FROM_EMAIL`. Check their fallbacks.
- **Build and run commands differ.** DO runs `npx @nestjs/cli build` and `npm start` on port 8080. That works with the monorepo `package.json` if `source_dir` is `backend`. The `postinstall` step (`npm install sharp`) runs during the build.
- **Codex double payout.** The live old code's `0 0 1 * *` cron already fired at 00:00 on Oct 1, server time. Once the new code is deployed, you must run `backend/scripts/skip-codex-cycle.js --period 2026-10 --apply` before **2026-10-08 23:00Z**. Otherwise the codex rewards (sum of codex × 300 $TAILS) are paid twice and the Oct 1–8 counters are wiped. The script is on main.

**Before you switch:** diff GitLab `tokentails-be` main against monorepo `backend/`, because GitLab may have hotfixes made after the Apr 22 move. Also, only committed main deploys; about 700 other-session changes are uncommitted and must stay out of the deploy commit.

**How to check what is live:**
- `doctl apps list-deployments 2d200c50-57b8-4709-b5e6-f8fcc71dcdce`, then `doctl apps get-deployment <app> <dep> -o json | jq '.[0].services[].source_commit_hash'`.
- `curl -sI https://api.tokentails.com/` should list `X-PAYMENT-RESPONSE` in `access-control-expose-headers`.
- `curl https://api.tokentails.com/shelter/donate/status` should return 200, not 404.

## 2. Wallets and funding

Both wallets have a balance of 0 on Arc mainnet, Arc testnet, Arbitrum, Avalanche and Monad (checked by RPC). Chain IDs confirmed by RPC: Arc 5042, Arc testnet 5042002, Tempo 4217, Arbitrum 42161, Avalanche 43114, Monad 143.

| Chain | Gas (your estimate; gas price I observed) | Proof and extras | Suggested hold (my buffer) |
|---|---|---|---|
| Arc testnet | faucet.circle.com | 0.1 USDC native `donate()` test (G2) | faucet amount; **not done yet** |
| Arc mainnet | ~0.13 USDC per deploy wave (~20 gwei floor). The EURC wave is a second deploy | 1–5 USDC proof, 1 USDC native `donate`, 1–5 EURC for the EURC proof | about 8 USDC and 5 EURC on the deployer |
| Arc hot wallet (gifts) | 20 gwei × gas per gift; measure on the first one | default budget 1 USDC a day (100 × 0.01) | days live × daily budget |
| Tempo | ~$0.004 (unverified), paid in pathUSD because the script passes `--tempo.fee-token pathUSD` | 1–5 USDC.e proof, plus 1 USDC.e for the memo payout (`1000000`) | 1 pathUSD and 6 USDC.e |
| Arbitrum One | ~0.00017 ETH (0.02 gwei) | 1–5 USDC | 0.001 ETH and 5 USDC |
| Avalanche | ~0.037 AVAX (~5 gwei) | 1–5 USDC, 1–5 EURC | 0.06 AVAX and 5 USDC |
| **Monad (missing from the plan)** | not in the wave; gas price 102 gwei | USDC (address unverified in `chains.json`) | MON and USDC: size it from a DRY_RUN |

**Getting the tokens:**
- **Tempo USDC.e:** bridge with Stargate (stargate.finance) from Ethereum, Arbitrum, Base, Optimism, Polygon or Avalanche. Only Ethereum → Tempo has a 0 bps fee; quote the other routes first.
- **Tempo pathUSD:** the docs don't say how to get it on mainnet. Calls to a non-TIP-20 contract default to pathUSD as the fee token. Two ways out:
  - set `--tempo.fee-token 0x20C000000000000000000000b9537d11c60E8b50` (USDC.e) in place of pathUSD. That works only if the Fee AMM has USDC.e liquidity (unverified; test it at G1);
  - or swap some USDC.e for pathUSD on Tempo's stablecoin DEX (unverified).
- **Arc mainnet USDC:** CCTP or Circle Bridge Kit from another chain (docs.arc.io/integrate/exchanges/cctp-bridging), or an exchange or on-ramp listed at docs.arc.io/integrate/exchanges and /on-off-ramps (I did not check which ones). Allow time for CCTP to settle.
- **Arbitrum and Avalanche:** withdraw USDC, ETH or AVAX directly from an exchange.

**Addresses no draft has yet:**
- `SHELTERSPLIT_TREASURY` is required and must be set before the deploy scripts will run.
- A team wallet that receives the Arc grant (not the treasury, not Pink Paw).
- A Solana wallet for the Colosseum Team Leader (prizes are paid in Phantom CASH).
- A separate hot wallet for `SHELTER_DONATE_PRIVATE_KEY`. Don't use the deployer: it owns the contract, so a server breach would hand over the shelter registry.
- An agent wallet for the Tameion x402 demo call.

**Your wallet JSON question:** a JSON file per account is fine. Keep it in `funding/.secrets/`, which is gitignored, but that `.gitignore` line isn't committed yet, so commit it first. Then `chmod 600` the file, keep a copy in a password manager, and never commit it or show it to the AI. Put only the public addresses in tracked files. Two keystores already exist in `~/.foundry/keystores`.

**Toolchain:** `build-evidence.md` records forge 0.3.0 (2024), but you now have 1.6.0-nightly. solc is pinned to 0.8.24, so the bytecode should match, but run `fund a:build --all` again under 1.6.0 before deploying.

## 3. Registrations and accounts

- **Colosseum:** every member registers on colosseum.com by **Oct 12 23:59 PT** and gives consent (rules s.6). The Team Leader adds members at submission, and each person can be in only one submission.
- **HackQuest (Arbitrum Singapore):** registration closes "Oct 2, 2026 17:01" and the page shows **no time zone**. If that is Singapore time, it closes at **12:01 Vilnius, not 20:01**.
- **Tameion:** it isn't a personal invite. Registration is on Luma, and the passphrase is printed on the public page.
- **Monad:** log in at hackathon.monad.xyz. The rules, countries, KYC, deadline zone and mainnet-or-testnet question are all behind the login.
- **Anitya:** join the Discord and confirm you can see `#jam-submission`. Questions on the close time zone and dual entry are still due.
- **Arc:** DoraHacks account and a public builder profile (GitHub, X or Farcaster). The submission still has a `{ARC_VENUE}` placeholder.

## 4. How each prize is paid

| Entry | Paid as | Conditions |
|---|---|---|
| Arc | 500 USDC on Arc, to a wallet you give | Private verification only if selected (sanctions and jurisdiction screening); pseudonymous entry is allowed |
| Colosseum | Phantom CASH, **to the Team Leader** as an individual, non-transferable (s.15b) | Prize Acceptance Documents and due diligence (s.13); tax is the winner's under local law (s.15d). The rules define the IRS; no form is named, so a W-8BEN is likely but unverified |
| Tameion | "cash or equivalent" | Method and KYC not stated; ask |
| Arbitrum Singapore | Amounts listed in USDC, all "subject to development-tied milestones" | The T&C PDF returned 403 to me; read it yourself |
| Monad | Unknown | Behind the login |
| Anitya | Wise, PayPal, Payoneer or USDC | Lithuania confirmed eligible |

- **Tax:** a Colosseum prize lands on a person, not the MB. Ask your accountant how a personal crypto prize is taxed in Lithuania, and how grants to the MB are booked.

## 5. Video limits

| Entry | Limit |
|---|---|
| Colosseum | demo ≤ 3 min; pitch 2–3 min (FAQ) |
| Tameion | demo "under 3 minutes" |
| x402 micro-grant | ≤ 2 min |
| Arc | none required (`demo:` is optional) |
| Arbitrum Singapore | not on the public page; check the HackQuest form |
| Monad | demo required; length not public |

## 6. Mismatches between the pages and the drafts

1. **Gift flow:** Arc, Colosseum, Tameion, Arbitrum and Monad all describe the sponsored gift in the present tense, but the endpoint returns 404. Fix the backend, or reword by Oct 4 (G3).
2. **x402 policy conflict:** the plan and `docs/BACKEND.md` keep `SHELTER_X402_ENABLED` off until the Pink Paw handover (before Dec 5). Tameion (Oct 10) requires it on plus one paid agent call, and the Monad draft lists the endpoint as a feature without saying it's off. Decide: turn it on early for Tameion, or drop Tameion and reword Monad.
3. **Live `campaign.json`** says goal 500 and wallet `null`. The local copy says goal 90 and the Pink Paw address. The local copy is uncommitted, so it needs a commit and a Vercel redeploy. Live `deployments.json` is `[]`.
4. **Monad (143) isn't in `client/components/shelter-payouts/chains.ts`.** The payouts page can't show a Monad payout.
5. **Pink Paw consent:** Arc says Pink Paw "consented in writing" and Colosseum says "consented to be named". Make sure the written consent exists and is filed before you submit.
6. **Placeholders aren't consistent.** Tameion, Arbitrum and Monad use `{DEMO_URL}`, `{ARB_SPLIT}` and `{MONAD_SPLIT}`, while the plan's fill-map uses `{DEMO_VIDEO_URL}`. The grep catches both, but the fill-map misses the first set.
7. **The repo link has no README.** `tree/main/funding/framework/tracks/a-build/shelter-split` has none, and that's the page Arc and Colosseum judges land on.
8. **The public repo tracks `client/.env.production`, `client/.env.app` and `cms/.env.*`.** I didn't read them. Confirm they hold only public values.
9. **Colosseum `submission.md` already lists the Arbitrum track and Public Goods**, before G5 answers the multi-track question.
10. **Tameion's deadline in the tracker** is "Oct 10 by 23:00 Vilnius"; the real close is Oct 10 23:59 ET (Oct 11 06:59 Vilnius). The tracker is safely early.
11. **Smaller items:**
    - The site footer says "© 2025".
    - `/heist/` goes through 308 → 307 to `/heist/index.html`; it works but is a two-hop redirect chain.
    - The Arbitrum draft lists Robinhood in `chain:`, but nothing is deployed there.

## 7. Checklist

| # | Item | Owner | Date |
|---|---|---|---|
| 1 | Register on HackQuest; assume Singapore time, finish by 12:00 Vilnius | You | **Oct 2 morning** |
| 2 | Diff GitLab `tokentails-be` main against monorepo `backend/` | You | Oct 2 |
| 3 | Point the DO app at GitHub `zbagdzevicius/tokentails`, `main`, `source_dir backend` (or push the subtree to GitLab) | You | Oct 2 |
| 4 | Add `FB_PRIVATE_KEY`, `TRUST_PROXY`, `SHELTER_*`, `STELLAR_*` and `SENDGRID_FROM_EMAIL` to the DO env as encrypted values | You | Oct 2 |
| 5 | Check the deploy: commit hash, CORS header, 200 on `/shelter/donate/status`, `req.ip` | You + AI | Oct 2–3 |
| 6 | Run `skip-codex-cycle.js --period 2026-10 --apply` after the deploy | You | **before Oct 8 23:00Z** |
| 7 | Create the treasury, Arc-grant, hot and agent wallets and a Solana Team Leader wallet; commit `.gitignore`; keep the secrets JSON local only | You | Oct 2 |
| 8 | Arc testnet faucet; testnet deploy and `donate()` | You | Oct 2 (G2 is Oct 3) |
| 9 | Fund all chains per section 2; bridge to Tempo; get pathUSD or test the USDC.e fee token | You | Oct 2 |
| 10 | `fund a:build --all` under forge 1.6.0 | AI | Oct 2, before the deploy |
| 11 | Mainnet wave, Tempo memo payout, `a:ingest`, commit the deployment lists and `campaign.json` | You | Oct 2 |
| 12 | Decide Monad: add it to the wave and to `chains.ts`, or deploy on testnet if the rules allow | You + AI | Oct 3 |
| 13 | Decide x402 for Tameion; fix the Monad wording | You + AI | Oct 3 |
| 14 | Send the questions to Colosseum (tracks, video, CASH payout for a Lithuanian), Arc (cap), Canteen (Arc conflict, payout method) and Monad (rules) | You | **Oct 2** |
| 15 | Every Colosseum member registers; name the Team Leader | You | Oct 3 (hard stop Oct 12 PT) |
| 16 | Register for Tameion on Luma | You | Oct 2 |
| 17 | File Pink Paw's written consent | You | Oct 3 |
| 18 | README for `shelter-split`; check the tracked `.env*` files | AI + You | Oct 3 |
| 19 | Demo videos (≤ 3 min) and the Colosseum pitch (2–3 min); upload them | AI + You | Oct 3–5 |
| 20 | Submit Arbitrum Singapore (assume Singapore time: by 10:00 Vilnius on Oct 4; Sepolia is the fallback) | You | Oct 3 evening |
| 21 | Read the Arbitrum T&C PDF for KYC and milestone terms | You | Oct 3 |
| 22 | Ask the accountant about prize and grant tax | You | Oct 9 |
| 23 | Submit Arc, Tameion, Colosseum, Monad | You / Team Leader | Oct 7, 10, 11, 13 |

Script I used for the import check: `/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/6ce18730-9621-4243-a62c-e0ea84e163f7/scratchpad/imports.mjs`

## Compliance audit

# Compliance and risk audit: Token Tails MB funding push (as of Oct 2, 2026)

**Overall:** nothing here stops the plan, but four items are high severity and need action before the Oct 2 deploy or the first submission:
1. Pink Paw's own key should be registered before any money arrives.
2. Secret keys must not go into a plain JSON file.
3. The Arc draft says Pink Paw "consented in writing". That must be true before it is submitted.
4. The live API returns 404 on endpoints the drafts describe as live.

None of this is legal or tax advice. Every tax and MiCA line ends with "ask an accountant" or "ask a lawyer".

## Pre-checks (facts I confirmed)
- `api.tokentails.com/` returns 200. `/shelter/donate/status` and `/shelter/agent/cat-card` both return 404, so the deployed backend predates commit 9734bed0.
- `tokentails.com/shelter-payouts` and `/give` return 200. They are rendered by JavaScript, so I could not read the disclosure text from the live page. The source text, in `client/components/shelter-payouts/ShelterProfile.tsx:9-14`, reads: "Token Tails created this wallet and holds it on the shelter's behalf until handover. Donations are split to it on-chain, and every payout is public."
- `/heist/` redirects (308) to `/heist`.
- `client/public/shelter-payouts/campaign.json` already contains the Pink Paw wallet, a 90 USDC goal and `handover: held-by-token-tails`.
- `client/tokentails-keystore` and `client/certificates` are gitignored (`client/.gitignore` lines 41 and 43). I did not read them.

## Risks, worst first

**R1. HIGH: storing passphrases and private keys in a JSON file (your request)**
- A plain JSON file holding the seed phrase, private key and address for both wallets is the most likely way to lose funds or leak keys. It can get committed, synced, picked up by a backup, or read by an AI session. That last one would also break the Nortal rule on secrets.
- It also undercuts the custody story. If Token Tails keeps Pink Paw's seed phrase, Token Tails keeps control even after the "handover".
- Mitigation:
  - Commit only a public file, for example `funding/framework/tracks/a-build/wallets.public.json`, holding a label, the address, the chain list, the custody status and the handover date.
  - Keep the deployer key only in the Foundry encrypted keystore (`cast wallet import`, used with `--account tokentails`). Put its seed phrase in a password manager, or in an encrypted file outside the repo (age or gpg).
  - For Pink Paw, do not keep a passphrase at all (see R2).
  - Never paste keys into an AI session.

**R2. HIGH: holding Pink Paw's wallet may count as crypto custody under MiCA (Token Tails is not an authorised provider)**
- Holding USDC "on behalf of" a third party is close to MiCA's definition of custody and administration of crypto-assets on behalf of clients (Art. 3(1)(17)). Under Art. 59 only an authorised crypto-asset service provider may provide such a service.
- Caveat: EUR-Lex returned an empty body to both fetch attempts, so this is from memory and not quoted. Verify it with a lawyer.
- The disclosure wording "holds it on the shelter's behalf" describes exactly that custody arrangement.
- Exposure today is low: only team money flows in, and wallet donations and x402 are off. It rises with any third-party money or a public campaign meter. ESMA confirms the MiCA transitional period ended on Jul 1, 2026, so there is no grace period left.
- Mitigation, best option: hand over before the deploy. The wallet is unfunded and no contract exists yet. Have Pink Paw create its own key today (any self-custody wallet, with its own seed phrase that Token Tails never sees) and register that address in the Oct 2 wave and in `campaign.json`. The custody risk then disappears, and the gated features (`NEXT_PUBLIC_WALLET_DONATE`, `SHELTER_X402_ENABLED`) can stay on the same schedule or come sooner.
- If that is not possible by Oct 2:
  - Reword every disclosure to say Token Tails owns the funds: "This wallet belongs to Token Tails MB. Funds in it are Token Tails' own money, set aside for Pink Paw, and become the shelter's only when transferred on [date]."
  - Keep third-party payments off until the handover.
  - Set a firm handover date. Dec 5 is too far away; target Oct 9, before the Colosseum and Tameion submissions.
  - At handover, re-register the shelter address in ShelterSplit. A funds transfer alone is not enough, because future payouts still go to the registered address.
- Tameion conflict: `tameion/draft.md:16-19` wants x402 switched on against Arc mainnet for the demo. Do that only after the handover, or run the demo on Arc testnet as that note already allows.
- Severity: High (low probability now, high impact).

**R3. HIGH: the Arc draft claims written consent that may not exist yet**
- `arc-microgrants/draft.md:42` and `submission.md:29` say "Pink Paw, which consented in writing". The plan still lists "confirm Pink Paw's consent" as an open step (EXECUTION-PLAN.md lines 12 and 208). Submitting an untrue statement can disqualify the entry.
- Colosseum rules s.12(b)(ii) and (iv) require that content does not infringe privacy or publicity rights, and that you have permission from every person shown. Anitya says "You must own or have the rights to anything you bring in."
- Mitigation: get one signed letter (email is enough) from the shelter's authorised representative covering:
  - use of the names "Pink Paw" and "Rožinė pėdutė" and the logo;
  - use of the shelter's cat photos and their AI-generated derivatives (stories and avatars made by the OpenAI and Gemini pipeline) in public pages, videos and hackathon submissions, worldwide, including organiser publicity;
  - the custody arrangement and the handover date;
  - confirmation that no identifiable volunteer or adopter appears in the media.
- Remove any user-uploaded `/portrait` photos from the demo videos.
- Until the letter is in hand, change the line to "consent being finalised" or hold the submission.

**R4. HIGH: the live backend is stale, but the drafts describe endpoints as live**
- The Tameion draft names `GET https://api.tokentails.com/shelter/agent/cat-card` as the live API. It returns 404. A judge who opens it sees a broken claim.
- Mitigation: check the webhook deploy log, redeploy, and re-test both routes. Add "every link in submission.md returns 2xx" to `fund check` before each submit.
- Severity: High, because judges open links.

**R5. MEDIUM-HIGH: a Tameion prize could make the Arc entry ineligible**
- Arc lists as not eligible "work already funded by a Circle or Arc program". Tameion is run by Canteen with Circle and Arc.
- Arc also says "no exclusivity", and Tameion's page has no clause on other hackathons or grants.
- The risk is timing: if Tameion pays out before Arc decides (by Oct 21), Arc may treat the same ShelterSplit work as already funded.
- Mitigation:
  - Submit Arc on Oct 7, before Tameion closes on Oct 10.
  - Disclose the Tameion entry in the Arc submission.
  - Send the planned questions to Canteen and Arc. Keep the written answers.
  - Apply to Circle Grants only after the Arc decision, as already planned.

**R6. MEDIUM: who receives prizes, and the tax that follows (general guidance only; ask an accountant)**
- **Colosseum:** entrants are "Individuals" (s.3) and "All prizes… will be provided to the Team Leader" (s.15(b)). The prize is personal income of the Team Leader, not MB revenue.
  - VMI KM1024: a prize from a foreign entity is class B income, and the resident pays the tax themselves by May 1 of the following year.
  - VMI KM1022: the tax point is the date the prize is actually received. Prizes in kind are valued at market price (KM1021).
  - The 200 EUR exemption VMI lists applies to sports competitions only, so do not assume it covers hackathons.
  - Phantom CASH is a stablecoin. Converting it later can be a separate taxable event.
  - Prizes are "non-transferable" (s.15(c)). Moving the money from the Team Leader into the MB needs a structure an accountant has approved.
- **Arc, Tameion, Arbitrum, Monad and Anitya:** decide now whether the MB or a named person receives each payout. Use the same party for the payout wallet and the identity verification.
  - Money received by the MB counts toward its profit tax. Ask an accountant about the MB regime.
- **VAT:** a prize with no service in return is normally outside VAT scope.
  - Arbitrum says "All prizes are subject to development-tied milestones". Milestone grants with deliverables could be treated as payment for services, which raises VAT place-of-supply and registration-threshold questions for the MB. Ask an accountant before accepting milestone terms.
  - CARF/DAC8 reporting of crypto users by service providers now applies, per VMI's FINTECH section. Expect exchanges to report what you cash out.
- Mitigation: one hour with a Lithuanian accountant before Oct 11 to settle the recipient (MB or person) for each program, the class B declaration, and VAT on milestone grants. Keep the prize notices, tx hashes and EUR value at receipt.

**R7. MEDIUM: accounting for sponsored donations paid from the MB's hot wallet (ask an accountant)**
- Until the handover, a "donation" moves USDC from one MB wallet to another MB-held wallet. For accounting purposes nothing has been donated yet.
- After the handover the treatment depends on two things:
  - Whether Pink Paw holds support-recipient status (*paramos gavėjo statusas*, Law on Charity and Sponsorship). Only then can the transfer be booked as support (*parama*), with its deduction limits and documents.
  - Whether the gifts are really marketing, since they are tied to game engagement. Then they are an advertising expense.
- Crypto valuation and revaluation applies to the USDC float.
- Operational risk: the hot-wallet key sits in backend env. Keep the float at a minimum, rely on the daily cap, and use a separate key from the deployer.
- Mitigation:
  - Check Pink Paw's status in the Registrų centras register.
  - Ask the accountant whether this is support or advertising expense.
  - Keep a monthly ledger export: tx hash, EUR value at payout, memo.
  - Keep the public campaign meter (goal 90 USDC) clearly team-funded so it does not read as public fundraising. Lithuanian rules on public charity collection apply if third parties give; ask a lawyer before enabling public giving.

**R8. MEDIUM: identity checks (KYC) and due diligence**
- **Colosseum:** sanctions exclusions (s.3(b)). Every member must register before Oct 12, 23:59 PT, or be disqualified (s.6(a)). One team per entrant (s.7). Winning depends on "Prize Acceptance Documents… and passing of the due diligence" (s.13). The FAQ targets "new startups that haven't raised significant outside capital". Expect identity checks for the Team Leader.
- **Arc:** "Verification happens only after conditional selection, and only for whoever receives the microgrant."
- **HackQuest/Arbitrum:** prize and KYC terms are in their Terms and Conditions. The `/terms` fetch came back empty, so this is unverified. Milestone-tied prizes suggest identity or business checks of the MB at payout.
- **Monad:** the rules are behind a login. KYC and country rules are unverified.
- **Anitya:** "16+ to receive a prize". There is no KYC rule. The payout methods in the plan (Wise, PayPal, Payoneer, USDC) will run their own checks.
- Mitigation:
  - Register all Colosseum members today. Name the Team Leader, who must hold ID and a wallet in their own name.
  - Read the HackQuest terms and the Monad rules after logging in, before submitting.
  - Never put ID data in the repo.

**R9. MEDIUM: an employer's permission (Colosseum s.3(c))**
- Entrants warrant that taking part "will not violate… policies or procedures of an employer or contractual obligations". The same issue applies to IP ownership for every program ("The work must be yours, or you must have the right to submit it", Arc).
- Mitigation: every team member with a day job checks their side-project and IP clauses, or gets written permission.

**R10. MEDIUM: rules on work built before each hackathon**

| Program | Rule | Status |
|---|---|---|
| Colosseum | FAQ: "Teams may begin development before the hackathon, but products are judged only on the work completed between the competition's start and end dates." Window Sep 14 – Oct 12 PT. | The draft discloses the prior work. OK. |
| Tameion | "work that already existed when you started doesn't [count]". Window Sep 27 – Oct 10. | The ShelterSplit ERC-20 core dates from Sep 25, two days early. The draft note says to disclose it, so keep that sentence in submission.md. |
| Monad | "what you show on 13 Oct should have been built during the six weeks". Window Sep 1 – Oct 13. | Fine, if only the work since Sep 25 is presented. |
| Arbitrum Singapore | No new-work rule found. Submissions Sep 13 – Oct 4. | Disclose prior work anyway. |
| Arc | "Hackathon projects are eligible." Must be working on mainnet at the moment you submit. | OK, once deployed. |
| Anitya | "Build it during the jam. Worlds published before 9 September are not eligible." | Use a different world each round. Do not use heist-08 for a weekly until dual entry is confirmed. |

Mitigation: keep the git log or a commit range as evidence for each window. Keep the disclosure paragraph in every submission.md.

**R11. LOW-MEDIUM: AI content rules**
- **Anitya:** no AI clause; only the "own or have the rights" rule. The plan's line that "the organiser allows" AI assets is not on the jam page, so keep the source of that statement.
- **Colosseum:** I found no AI clause in the rules PDF or the FAQ. Content must be in English (s.12(a)(i)) and must not infringe anyone's rights.
  - `call.md`'s "recorded by a human" requirement is not in the FAQ I fetched, so it is self-imposed.
  - A human-voiced pitch still serves the "team execution" criterion better.
- **Tameion:** no AI clause on the page.
- AI output from the OpenAI and Gemini pipeline may have weak copyright protection, but you hold usage rights under those providers' terms. The risk is low.
- Mitigation: record the pitch in your own voice. Label the AI-assisted parts in the asset note, as `SUBMISSION.md` §4 already does.

**R12. LOW: entering several hackathons with one project (Colosseum vs Monad, Arbitrum Singapore vs Dubai)**
- Colosseum has no exclusivity clause. Its limits are one team per entrant and one submission per team (s.7).
- Monad's public page has none, but the official rules are not verified.
- Arbitrum's Singapore and Dubai terms are not verified.
- Mitigation: list the other entries openly in each submission. Re-check after logging in to Monad.

## Compliance blockers still open before you can win
1. Pink Paw creates its own key (best before today's deploy), or the disclosures are reworded to say the money is Token Tails' own.
2. Signed Pink Paw consent letter.
3. Backend redeployed, with every claimed endpoint returning 200.
4. All Colosseum members registered and the Team Leader named.
5. The questions sent to Arc (cap), Colosseum (multiple tracks and video), Canteen (Arc conflict) and Monad (rules), with answers saved.
6. Monad and HackQuest rules read after logging in.
7. Accountant call on prize recipients, VAT on milestone grants, and donation accounting.
8. Secrets moved to the keystore and password manager, with only a public address file in the repo.

## Sources
- Colosseum Official Rules PDF: https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf (local extract `scratchpad/rules.txt`, sections 3, 6, 7, 12, 13, 14, 15)
- Colosseum FAQ: https://colosseum.com/hackathon (fetched)
- Arc Microgrants: https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq (from `applications/arc-microgrants/source.md`)
- Tameion: https://tameion.thecanteenapp.com/ (fetched)
- Arbitrum Singapore: https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon (fetched). https://www.hackquest.io/terms came back empty.
- Monad Metropolis: https://monad.xyz/developers/hackathons/metropolis (fetched)
- Anitya jam: https://itch.io/jam/anitya-world-jam-2700-in-prizes (fetched)
- VMI on prizes: https://www.vmi.lt/evmi/prizai3 (KM1020, KM1021, KM1022, KM1024; GPMĮ art. 8, 17(1)(37), (39) and (40), and 22)
- ESMA MiCA page: https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica (transitional period ended Jul 1, 2026)
- MiCA Regulation (EU) 2023/1114, Art. 3(1)(17) and Art. 59: EUR-Lex returned an empty body, so these are not quoted. Verify them.
- Repo files:
  - `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/EXECUTION-PLAN.md`
  - `/Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/applications/{arc-microgrants,colosseum-worlds-fair,tameion,arbitrum-singapore,monad-metropolis}/{call,source,draft,submission}.md`
  - `/Users/zygimantasbagdzevicius/me/tokentails-app/client/components/shelter-payouts/ShelterProfile.tsx`
  - `/Users/zygimantasbagdzevicius/me/tokentails-app/client/public/shelter-payouts/campaign.json`
