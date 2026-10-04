# Token Tails monorepo

Four packages, each with its own `package.json` or toolchain. Install and run inside the package,
not at the root. Documentation lives in `docs/`; start with `docs/ARCHITECTURE.md`.

| Package | Run | Check |
|---|---|---|
| `backend/` NestJS 9 + MongoDB | `npm run dev` (port 3005) | `npm run lint`, `npm run build`, `npm test` |
| `client/` Next.js 16 + Phaser 4 + Capacitor 7 | `npm run dev` (port 3000) | `npx tsc --noEmit`, `npx eslint .`, `npm test` |
| `cms/` Next.js 16 | `npm run dev` | `npm test`, `npx eslint .` |
| `contracts/stellar/soroban-nft/` Rust | `cargo test` | `stellar contract build` |
| `shelter-rail/` MIT JS SDK + donate widget, no deps (copy `src/widget.js` to `client/public/rail/`) | – | `npm test` |

## Rules that matter here

- Never read `.env*` files. Environment variable names are documented in `docs/BACKEND.md` and `docs/CLIENT.md`.
- All API calls use a lowercase `accesstoken` header. Firebase ID tokens are prefixed `fb`; any other token is rejected with 401. Roles are numeric 1 to 5 enforced by `PermissionGuard(n)`. See `docs/API.md`.
- Phaser and Stellar SDK code is browser only. Import it with `next/dynamic` and `ssr: false`.
- Enums and caps are duplicated between backend and client. When you change `GameType`, `CatAbilityType`, `Tier`, reward constants, or catnip caps, update every copy. Locations are listed in `docs/DEVELOPMENT.md`.
- The backend has one `AppModule`; new controllers and providers are registered there. Business logic currently sits in controllers.
- Game scores are saved only through `POST /user/catbassadors/live`. Do not add a second write path.
- Contract addresses and mint calls are not in this repo. Metadata endpoints are in `backend/src/cat/cat.controller.ts`.
- Known bugs and security issues are listed at the end of each doc. Do not "fix" them silently as a side effect of unrelated work; mention them.

## Funding tracker (keep this current)

Source of truth for dates, events and opportunities. Full detail: `funding/EXECUTION-PLAN.md`,
`funding/WINNING-STRATEGY.md`, `funding/framework/portfolio/opportunities.json`.

How to maintain it:
- When a date, deadline, result, decision or status changes, edit these tables in the same turn.
- Keep the format: dated rows, one line each. Status is ⏳ todo, 🟡 in progress, ✅ done, ❌ dropped or lost, ⏸ parked, 🏆 won.
- Times: write the organiser's zone and Vilnius time. Vilnius is EEST (UTC+3) until Oct 25, then EET (UTC+2).
- Rules: remote until winning (no in-person step before selection; winner-only travel such as bootcamps or ceremonies is OK); grants, prizes, bounties and equity-free accelerators only; a real chance above 10%
  (or under 1 human hour); no Telegram; excluded programs are in `funding/framework/portfolio/opportunities.json`.

### Critical path

| Date | Action | Owner | Status |
|---|---|---|---|
| Sep 30 | Anitya Weekly Challenge 2 (heist-01 world) | You | ✅ |
| Sep 30 | Commit and push everything, fast-forward `main` (69b0a2a8); Vercel deployed tokentails.com with `/shelter-payouts` and `/heist/index.html` live | Both | ✅ |
| Sep 30 | Every member registers on colosseum.com; name the Team Leader | You | ⏳ |
| Oct 1 | `catnip.tokentails.com`: dropped; use tokentails.com/heist. Run `foundryup`; set up the keystore and env; fund the wallets; test the Arc testnet `donate()` | You | ⏳ |
| Oct 1 | Ask Colosseum (Discord or hello@colosseum.com): can one entry win a track and a general prize? Any video narration rules? Multi-track: confirmed allowed by the user on Oct 3 | You | 🟡 |
| **Oct 2, by 12:00 Vilnius** | Register on HackQuest for Arbitrum Open House Singapore. The page shows "Oct 2 17:01" with no time zone (re-checked Oct 2): if it is Singapore time it closes at 12:01 Vilnius, if UTC at 20:01. Do it now | You | ⏳ |
| Oct 1–3 | Log in at hackathon.monad.xyz: confirm the year, the deadline time zone and the rules (mainnet or testnet, countries, KYC) | You | ⏳ |
| Oct 2 | Mainnet wave (Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain (pays USDG), plus EURC), Tempo campaign-memo payout, `fund a:ingest` | You | ⏳ |
| Oct 2 (after the wave) | Commit and push the three deployment lists written by `a:ingest` (`client/public/shelter-payouts/`, `client/public/heist-game/payouts/`, `catnip-heist/public/payouts/`); Vercel builds only the client, so `/shelter-payouts` and `/heist` show the real payouts after that push | You | ⏳ |
| Oct 2–4 | Turn on sponsored donations (`SHELTER_DONATE_*` env on the backend, fund the hot wallet with a small USDC float) | You | ⏳ |
| Oct 4–6 (before recording demos) | Judge demo, gasless and matched on testnet: set `SHELTER_TRY_CHAIN_ID=5042002` plus `SHELTER_TRY_ROUTER_ADDRESS`, `SHELTER_TRY_SPLIT_ADDRESS`, `SHELTER_TRY_PRIVATE_KEY` (a new testnet-only wallet with faucet USDC), `SHELTER_TRY_RELAY_ENABLED=true`, `SHELTER_TRY_MATCH_ENABLED=true` on the backend; list the Arc testnet router in `client/public/shelter-payouts/routers.json`; set `NEXT_PUBLIC_WALLET_DONATE_CHAIN=5042002` on Vercel (docs/BACKEND.md) | You | ⏳ |
| Oct 3–5 | AI fills the drafts and renders the demos; you record the Colosseum pitch | Both | ⏳ |
| Oct 5 | Crypto checkout go-live: put the public treasury address per chain in `backend/src/payments/crypto/treasury.public.ts` (5042, 8453, 42161, 43114, 4217) or `CRYPTO_PAY_TREASURY[_<chainId>]`, and the same in `wallets.public.json` `shelter-split-treasury`; set `CRYPTO_PAY_RPC_<chainId>` for each mainnet; then `CRYPTO_PAY_ENABLED=true`, `CRYPTO_PAY_NETWORK=mainnet`. Never a Pink Paw (held) wallet. Details: `docs/plans/payments-STATUS.md` | You | ⏳ |
| Oct 5 | Pick one Legendary pack price ($350 charged by both checkouts vs $400 on the pack card); then update `PacksModal.tsx` or `price-table.ts` (DEVELOPMENT.md "Pack prices") | You | ⏳ |
| Oct 5 | Shelter cats ($5): decide the shelter share (`CRYPTO_PAY_CAT_SHELTER_BPS`, unset sends nothing) and `CRYPTO_PAY_SHELTER_SHARE_ENABLED`; Stripe needs no Price object (the server sets $5 on the PaymentIntent): buy one shelter cat by card on production to check | You | ⏳ |
| Oct 5 | Confirm `STELLAR_PACKS_SUNSET_AT` (default 2026-10-11 00:00 UTC = 03:00 Vilnius) in the backend env; refund any Stellar pack order marked `FAILED_GRANT` `STELLAR_DEPRECATED` | You | ⏳ |
| Oct 6 | F-023 (Paris café): open the post on x.com and set it verified, or drop the landing sentence "We hosted a curated day at a Paris cat café" (it also blocks the Heist reel) | You | ⏳ |
| after a written founder override (decision #15) | Landing Catnip Heist section: `NEXT_PUBLIC_HEIST_LANDING_SECTION=1` (poster only until a `-v2` reel without the café) | You | ⏸ |
| Oct 1–6 | Ask Arc: is it a hard cap of 20 grants, or is every project above the bar funded? (15% vs ~50%) | You | ⏳ |
| Every Anitya weekly close | Record the final entry count (decides whether weeklies are our best odds) | AI | ⏳ |
| **Oct 4, by 10:00 Vilnius** | **Submit Arbitrum Singapore** (page shows "Oct 4 15:59" with no zone: 10:59 Vilnius if Singapore time, 18:59 if UTC; submit Oct 3 evening), reusing the Arbitrum deploy (Arbitrum Sepolia is the fallback) | You | ⏳ |
| Oct 4–6 | Founder sends the direct-donation receipts → verify F-026 crypto for the Arc and Colosseum drafts (split F-026a crypto verified / F-026b goods company-reported; also the start year, recipients, and whether hello@ answers receipt requests) | You | ⏳ |
| Oct 1 | Request a Tameion invite (tameion.thecanteenapp.com); ask Canteen whether a Tameion prize affects Arc Microgrants eligibility | You | ⏳ |
| Oct 5 | Pink Paw staff (~30 min) create Pink Paw's OWN wallet (passkey or smart wallet, Circle user-controlled wallet, or hardware/mobile wallet; Token Tails never sees the seed), write down a recovery method, open tokentails.com/shelter-payouts/onboard and sign the claim (`POST /shelter/claim`) | Pink Paw + You | ⏳ |
| Oct 4–6, by Oct 6 23:59 Vilnius (16:59 ET) | Pink Paw signs the wallet claim and the ShelterSplit owner rotates the shelter entry to a wallet Pink Paw holds (gate G2b, before Arc) | You | ⏳ |
| Oct 5 | Deploy DonateRouter on Arc testnet, Base Sepolia and Arbitrum Sepolia with `--account` (router README), then record each in `router-deployments.json` | You | ⏳ |
| Oct 5 | Deploy CappedSpender on Arc testnet (`script/DeployCappedSpender.s.sol`, `CAPPED_*` env, `EXPECTED_CHAIN_ID=5042002` required), fund a small test float from the owner address only, dry-run `treat-agent/run.mjs` with `TREAT_AGENT_TT_SENDERS` = the backend treat/match wallets (router gifts stay with `SHELTER_MATCH_ENABLED`; never also set `TREAT_AGENT_MATCH_ROUTER=1`); run one `--once` with `ANTHROPIC_API_KEY` (exit 3 = API failed, retry with `TREAT_AGENT_NO_FALLBACK=1`), then record the agent clip with `treat-agent/fork-demo.sh` | You | ⏳ |
| Oct 5–6 | Backend env, testnet first: `SHELTER_ROUTER_ADDRESS`, `SHELTER_RELAY_ENABLED`, `SHELTER_MATCH_ENABLED`; `SHELTER_HANDED_OVER=true` and `campaign.shelter.handover` only after G2b passes | You | ⏳ |
| Oct 6 (after G2b) | Rotate on each chain that lists Pink Paw: `fund.mjs shelter rotate --chain <id> --to <PinkPawWallet> --name "Pink Paw" --dry-run`, run the printed `removeShelter`/`addShelter(new, 10000, name)` yourself with `--account`, check `preview(1000000)` shows `toTreasury == 0`; then set `campaign.json` `shelter.wallet` + `handover: "handed-over"`, update the handover fact, `fund facts build` | You | ⏳ |
| Oct 6 (after G2b) | Vercel: `NEXT_PUBLIC_WALLET_DONATE=true` (redeploy, values are inlined at build); backend `SHELTER_HANDED_OVER=true` only after the rotation is confirmed on-chain | You | ⏳ |
| Oct 6 (after G2b and the wave) | Deploy DonateRouter on Arc mainnet 5042 against the mainnet split (`fund router plan --chain 5042`), record it in `router-deployments.json` and `client/public/shelter-payouts/routers.json`, send one $0.01 gasless gift and one native gift, flip facts P-002 `router_guard` and P-003 `gasless_give` to verified with those tx hashes. Never before G2b | You | ⏳ |
| Oct 6 | Record demos: Arc 10-second gasless gift + match (testnet try-it if G2b failed), Tameion agent with the on-chain over-cap refusal, Colosseum pitch | You | ⏳ |
| **Oct 7** | **Submit Arc Microgrants** (closes Oct 14 23:59 ET = Oct 15 06:59 Vilnius) | You | ⏳ |
| ~Oct 7, 14, 21 | Anitya weeklies (dates unconfirmed; watch Discord `#jam-submission`) | You | ⏳ |
| **Oct 10, by 23:00 Vilnius** | **Submit Tameion** (public repo, demo video ≤3 min, live link) if invited | You | ⏳ |
| **Oct 11** | **Submit Colosseum** (closes Oct 12 23:59 PT = Oct 13 09:59 Vilnius) | Team Leader | ⏳ |
| Oct 11–12 | x402 `exact`: open a facilitator account (Circle x402 facilitator or CDP) for mainnet; set `SHELTER_X402_EXACT_*` with `PAYTO` = Pink Paw's own wallet, then `SHELTER_X402_ENABLED=true` (needs G2b; testnet can use x402.org on Base Sepolia). Post the x402 micro-grant Oct 12–16 with the first mainnet `exact` tx | You | ⏳ |
| Oct 12 | Monad: check Monad USDC for EIP-3009 (`authorizationState`, EIP-712 name/version) before a router redeploy there; otherwise the donor beat uses approve + `disburse` | You | ⏳ |
| **Oct 13** | **Submit Monad Metropolis**, Consumer Products & Payments track (after a Monad deploy) | You | ⏳ |
| **Oct 20** | **Submit the Anitya main jam**, heist-08 world (closes Oct 21 22:59, zone not shown) | You | ⏳ |
| by Oct 21 | Arc decisions | – | ⏳ |
| Oct 22+ | Team1 Avalanche; Circle Grants only after Arc decides (Arc excludes work already funded by Circle) | Both | ⏳ |
| Oct 22+ | Late Oct: Circle grant application (agentic payments) | You | ⏳ |
| Oct 31 | Register for Arbitrum Dubai (Oct 31 – Dec 5) and re-score it on the published criteria | You | ⏳ |
| Nov 16 – Dec 4 | Build and submit Arbitrum Dubai (submissions close Dec 6 16:01, zone not shown) | Both | ⏳ |
| at handover (before Dec 5) | Pink Paw wallet handover → enable wallet donate (`NEXT_PUBLIC_WALLET_DONATE`) and x402 (`SHELTER_X402_ENABLED`) | You | ⏳ |
| by Dec 5 | Colosseum winners; hand the shelter wallet over to the shelter | You | ⏳ |
| ~Dec 13 | Arbitrum Dubai results | – | ⏳ |

### Decision points

| Gate | Date | Pass condition | If yes / if no |
|---|---|---|---|
| G0 Clean commit | Sep 30 | The commit contains only our paths | Push / redo it with an explicit path list |
| G1 Tempo toolchain | Oct 1–2 (hard stop Oct 5) | The Tempo deploy succeeds after `foundryup` | Keep the Tempo track / pitch Colosseum on Arbitrum only |
| G2 Arc native path | Oct 3 | Testnet `donate()` emits `NativeDisbursed` | Keep the native-USDC story / pitch the ERC-20 path plus EURC |
| G2b Handover | Oct 6 (23:59 Vilnius = 16:59 ET) | Pink Paw signs the claim and the owner rotates | Mainnet giving on / else Arc submits with the testnet try-it link and the disclosed gate |
| G3 Arc donate button | Oct 4 | G2 passed, a real native payout shows on the live page, and the button works end to end | Ship the button / counter only |
| G4 Deploy reality | Oct 5 | The Arc and Tempo splits and payouts are verified on-chain | Fill the drafts / fix, or drop that chain from the pitch |
| G5 Colosseum tracks | Oct 3 ✅ | Multi-track is allowed (confirmed by the user on Oct 3) | Enter Tempo + Arbitrum + Base + Robinhood Chain tracks, plus Public Goods |
| G6 Colosseum go | Oct 9 | Team Leader named, all members registered, pitch recorded, demo ≤ 3 min, pages live | Submit Oct 11 / cut scope and still submit |
| G7 Arc last call | Oct 13 | Arc is submitted | – / submit before Oct 14 23:59 ET |
| G8 Anitya main scope | Oct 18 | heist-08 is published and playable | Submit it / submit the best finished world |
| G9 Arc result | Oct 22 | The Arc decision has arrived | Funded: cite it in Team1 and skip Circle for that work / Not funded: apply to Circle |
| G10 Dubai fit | Oct 31 | The criteria allow an existing product and fit payouts | Build it / drop Dubai |
| G11 Dubai build | Nov 16 | The window is open and the Arbitrum split is live | Build and submit by Dec 4 / drop |
| G12 Handover | before Dec 5 | The shelter holds its own key | Update the disclosures / keep the "held by Token Tails" label |

### Opportunities

| Opportunity | Deadline | Chance | Prize | Status |
|---|---|---|---|---|
| Arc Microgrants | Oct 14 23:59 ET (target Oct 7) | 15% capped / ~50% if funded above a bar (q=0.7) | $500 | 🟡 draft ready |
| Colosseum World's Fair (Tempo, Arbitrum, Base, Robinhood tracks + Public Goods; general pool ~1%) | Oct 12 23:59 PT | ~10–16% any track (q=0.7, multi-track); Tempo alone 2–5% | $5k–30k | 🟡 draft ready |
| Anitya Weekly Challenge 2 | Sep 30 23:59 UTC | 13% | $50 | ✅ submitted |
| Anitya later weeklies | weekly, dates unconfirmed | ~38% per round if ~8 entries (unverified N) | ~$100 | ⏳ 7 worlds ready |
| Anitya World Jam main | Oct 21 22:59 | ~14% after payout risk (q=0.7) | $400–1,000 | ⏳ world ready |
| Team1 Avalanche | rolling (after Oct 21) | 3.8% | ≤$10k | ⏳ |
| Arbitrum Open House Dubai | Nov 16 – Dec 6 | 1–5% (q=0.7): downgraded, decide at G10 | $30k pool | ⏳ |
| Circle Developer Grants | rolling (after the Arc decision) | ~2.5% | $5k–100k | ⏳ |
| Indiepocalypse #83 anthology (itch.io) | Oct 1 16:00 (itch time) | ~13% | $20 + 5% sales | ❌ dropped: not worth the effort |
| x402 Foundation impact micro-grant | rolling | unknown (<10%) | ≤ $3k | 🟡 `exact` scheme built (payTo = shelter wallet, testnet verified against x402.org `/verify`); mainnet needs G2b; Oct 12–16: first mainnet tx + ≤2 min video, tag @coinbaseDev |
| The Pollination Project seed grant (for Pink Paw; money goes to the shelter) | Oct 31 for the October cycle | unknown | ≤ $500 | ❌ dropped (team decision 2026-09-30) |
| Arbitrum Open House Singapore (online) | Oct 4 15:59, zone not shown (SGT worst case: 10:59 Vilnius) | 0.6% (q=0.7) | $15k mid ($115k pool) | ⏳ long shot, ~1 h, app scaffolded |
| Monad Metropolis (Consumer & Payments) | Oct 13 (zone unverified) | ~1.5% (N unknown) | $10k (3 × $10k per track) | ⏳ long shot, ~2.5 h, app scaffolded, rules to verify |
| Optional, higher cost: Hedera template bounty (Oct 4), Open Agent (Oct 20), Amazon dev (Oct 23), Bezi Jam 14 (Oct 26), YouCam (Nov 2), SIM Jam (Nov 4) | see `funding/PERCENTILE-REASSESSMENT.md` | 1–8% each | $150–5k | ⏸ consider only if time frees up after Oct 11 |
| **Tameion Agents Hackathon** (Canteen × Circle × Arc), invite-only, online | Oct 10 23:59 ET (Oct 11 06:59 Vilnius) | ~9–17% (q=0.7, N 120–180 if invites shrink the field); 5% at N=252 | $650–10k (17 paid slots, $40k total) | ⏳ request an invite now; x402 agent + Arc USDC; check the Arc Microgrants "already funded by Circle/Arc" clash |
| Zoud GameLab Financial Literacy Game Jam (itch.io) | Nov 15 23:59 AoE | ~4–10% (new jam; 161 joined) | up to $140k incl. development support | ⏸ below the bar; needs a new financial-literacy game |
| 2027 European Prize for Women Innovators (EIC/EIT) | Dec 1 17:00 CET | ~4.5% (200+ applicants, 9 prizes) | €20k–100k | ⏸ only if a woman co-founder applies |
| Purina Pet Care Innovation Prize 2027 (petcareinnovation.net/prize) | Oct 6 (zone not shown) | – | $25k × up to 5, +$25k grand | ❌ not eligible: FAQ requires ≥ $100k annual revenue from the product, an established US business entity, and in-person Boot Camp (St. Louis, Feb 2027) and Global Pet Expo (Orlando), travel covered |
| Creative Europe MEDIA 2027 | Feb 10, 2027 | ~7.5% | ~€240k | ⏸ below the bar |
