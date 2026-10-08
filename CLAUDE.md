# Token Tails monorepo

The packages below each have their own `package.json` or toolchain. Install and run inside the package,
not at the root. Documentation lives in `docs/`; start with `docs/ARCHITECTURE.md`.

| Package | Run | Check |
|---|---|---|
| `backend/` NestJS 9 + MongoDB | `npm run dev` (port 3005) | `npm run lint`, `npm run build`, `npm test` |
| `client/` Next.js 16 + Phaser 4 + Capacitor 7 | `npm run dev` (port 3000) | `npx tsc --noEmit`, `npx eslint .`, `npm test` |
| `cms/` Next.js 16 | `npm run dev` | `npm test`, `npx eslint .` |
| `catnip-heist/` three.js + Vite | `npm run dev` (port 5173) | `npx tsc --noEmit`, `npx vitest run`, `npm run build:client` (commit `client/public/heist-game`) |
| `contracts/stellar/soroban-nft/` Rust | `cargo test` | `stellar contract build` |
| `shelter-rail/` MIT JS SDK + donate widget, no deps (copy `src/widget.js` to `client/public/rail/`) | – | `npm test` |
| `contracts/shelter-split/` ShelterSplit + DonateRouter + CappedSpender (Solidity, Foundry, MIT) | – | `forge build`, `forge test` |

## Rules that matter here

- Never read `.env*` files. Environment variable names are documented in `docs/BACKEND.md` and `docs/CLIENT.md`.
- All API calls use a lowercase `accesstoken` header. Firebase ID tokens are prefixed `fb`; any other token is rejected with 401. Roles are numeric 1 to 5 enforced by `PermissionGuard(n)`. See `docs/API.md`.
- Phaser and Stellar SDK code is browser only. Import it with `next/dynamic` and `ssr: false`.
- Enums and caps are duplicated between backend and client. When you change `GameType`, `CatAbilityType`, `Tier`, reward constants, or catnip caps, update every copy. Locations are listed in `docs/DEVELOPMENT.md`.
- The backend has one `AppModule`; new controllers and providers are registered there. Business logic currently sits in controllers.
- Game scores are saved only through `POST /user/catbassadors/live`. Do not add a second write path.
- NFT contract addresses and mint calls are not in this repo. Metadata endpoints are in `backend/src/cat/cat.controller.ts`. ShelterSplit and DonateRouter addresses are public and generated: `backend/src/shelter/onchain/wallet.config.ts` (from `fund a:ingest`; never edit it by hand).
- `funding/` is private (repo `zbagdzevicius/tokentails-funding`, see `docs/DEVELOPMENT.md`). Public code, tests, CI and docs must work without it; never add a hard dependency on it or link to it from public pages or submissions. Link judges to `contracts/shelter-split/`.
- Known bugs and security issues are listed at the end of each doc. Do not "fix" them silently as a side effect of unrelated work; mention them.

## Funding tracker

The funding tracker lives in `CLAUDE.local.md` (gitignored, loaded automatically) and in the private
repo as `funding/FUNDING-TRACKER.md`. Keep it current there, never in this file.
