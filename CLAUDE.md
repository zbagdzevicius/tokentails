# Token Tails monorepo

Four packages, each with its own `package.json` or toolchain. Install and run inside the package,
not at the root. Documentation lives in `docs/`; start with `docs/ARCHITECTURE.md`.

| Package | Run | Check |
|---|---|---|
| `backend/` NestJS 9 + MongoDB | `npm run dev` (port 3005) | `npm run lint`, `npm run build` |
| `client/` Next.js 16 + Phaser 4 + Capacitor 7 | `npm run dev` (port 3000) | `npx tsc --noEmit`, `npx eslint .`, `npm test` |
| `cms/` Next.js 16 | `npm run dev` | `npm test`, `npx eslint .` |
| `contracts/stellar/soroban-nft/` Rust | `cargo test` | `stellar contract build` |

## Rules that matter here

- Never read `.env*` files. Environment variable names are documented in `docs/BACKEND.md` and `docs/CLIENT.md`.
- All API calls use a lowercase `accesstoken` header. Firebase tokens are prefixed `fb`; anything else is Telegram init data. Roles are numeric 1 to 5 enforced by `PermissionGuard(n)`. See `docs/API.md`.
- Phaser and Stellar SDK code is browser only. Import it with `next/dynamic` and `ssr: false`.
- Enums and caps are duplicated between backend and client. When you change `GameType`, `CatAbilityType`, `Tier`, reward constants, or catnip caps, update every copy. Locations are listed in `docs/DEVELOPMENT.md`.
- The backend has one `AppModule`; new controllers and providers are registered there. Business logic currently sits in controllers.
- Game scores are saved only through `POST /user/catbassadors/live`. Do not add a second write path.
- Contract addresses and mint calls are not in this repo. Metadata endpoints are in `backend/src/cat/cat.controller.ts`.
- Known bugs and security issues are listed at the end of each doc. Do not "fix" them silently as a side effect of unrelated work; mention them.
