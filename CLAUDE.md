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
- Rules: remote only; grants, prizes, bounties and equity-free accelerators only; a real chance above 10%
  (or under 1 human hour); no Telegram; excluded programs are in `funding/framework/portfolio/opportunities.json`.

### Critical path

| Date | Action | Owner | Status |
|---|---|---|---|
| Sep 30 | Anitya Weekly Challenge 2 (heist-01 world) | You | ✅ |
| Sep 30 | Commit and push everything, fast-forward `main` (69b0a2a8); Vercel deployed tokentails.com with `/shelter-payouts` and `/heist/index.html` live | Both | ✅ |
| Sep 30 | Every member registers on colosseum.com; name the Team Leader | You | ⏳ |
| Oct 1 | `catnip.tokentails.com`: dropped; use tokentails.com/heist. Run `foundryup`; set up the keystore and env; fund the wallets; test the Arc testnet `donate()` | You | ⏳ |
| Oct 1 | Ask Colosseum (Discord or hello@colosseum.com): can one entry win a track and a general prize? Any video narration rules? | You | ⏳ |
| Oct 2 | Mainnet wave (Arc, Tempo, Arbitrum, Avalanche, plus EURC), Tempo campaign-memo payout, `fund a:ingest` | You | ⏳ |
| Oct 2 (after the wave) | Commit and push the deployment lists written by `a:ingest` (client and catnip-heist); Vercel redeploys both, so the pages show the real payouts | You | ⏳ |
| Oct 2–4 | Turn on sponsored donations (`SHELTER_DONATE_*` env on the backend, fund the hot wallet with a small USDC float) | You | ⏳ |
| Oct 3–5 | AI fills the drafts and renders the demos; you record the Colosseum pitch | Both | ⏳ |
| **Oct 7** | **Submit Arc Microgrants** (closes Oct 14 23:59 ET = Oct 15 06:59 Vilnius) | You | ⏳ |
| ~Oct 7, 14, 21 | Anitya weeklies (dates unconfirmed; watch Discord `#jam-submission`) | You | ⏳ |
| **Oct 11** | **Submit Colosseum** (closes Oct 12 23:59 PT = Oct 13 09:59 Vilnius) | Team Leader | ⏳ |
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
| G3 Arc donate button | Oct 4 | G2 passed, a real native payout shows on the live page, and the button works end to end | Ship the button / counter only |
| G4 Deploy reality | Oct 5 | The Arc and Tempo splits and payouts are verified on-chain | Fill the drafts / fix, or drop that chain from the pitch |
| G5 Colosseum tracks | Oct 8 | Colosseum answered the multi-track question | Pitch the tracks they allow / Tempo first |
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
| Arc Microgrants | Oct 14 23:59 ET (target Oct 7) | 19% | $500 | 🟡 draft ready |
| Colosseum World's Fair (Tempo track and general pool) | Oct 12 23:59 PT | ~8% | $10k–30k | 🟡 draft ready |
| Anitya Weekly Challenge 2 | Sep 30 23:59 UTC | 13% | $50 | ✅ submitted |
| Anitya later weeklies | weekly, dates unconfirmed | 15% | ~$100 | ⏳ 7 worlds ready |
| Anitya World Jam main | Oct 21 22:59 | 8% | $400–1,000 | ⏳ world ready |
| Team1 Avalanche | rolling (after Oct 21) | 3.8% | ≤$10k | ⏳ |
| Arbitrum Open House Dubai | Nov 16 – Dec 6 | ~6% | $30k pool | ⏳ |
| Circle Developer Grants | rolling (after the Arc decision) | ~2.5% | $5k–100k | ⏳ |
| Creative Europe MEDIA 2027 | Feb 10, 2027 | ~7.5% | ~€240k | ⏸ below the bar |
