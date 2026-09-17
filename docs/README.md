# Token Tails Documentation

Start with [ARCHITECTURE.md](ARCHITECTURE.md) for the big picture, then the doc for the part you
are working on.

| Document | Covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System context, components, domain, auth, request flows, environments |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local setup for every package, conventions, secrets hygiene |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Hostnames, build and run per component, CDN sync, store releases |
| [BACKEND.md](BACKEND.md) | NestJS service: bootstrap, modules, auth, economy, payments, AI, cron, env vars, migrations, known issues |
| [API.md](API.md) | Every REST endpoint with method, path, purpose, and required permission |
| [DATA_MODEL.md](DATA_MODEL.md) | MongoDB collections, fields, references, indexes |
| [CLIENT.md](CLIENT.md) | Next.js app: routes, features, auth, API layer, state, web3, SEO, testing |
| [GAMES.md](GAMES.md) | Phaser game modes, shared plumbing, save flow, caps, level authoring |
| [MOBILE.md](MOBILE.md) | Capacitor configuration, Android and iOS projects, store release automation |
| [CMS.md](CMS.md) | Admin console: routes, features, auth, endpoints used, testing |
| [CONTRACTS.md](CONTRACTS.md) | Soroban, SKALE, faucets, archived prototypes, deployed addresses, licensing |
| [HISTORY.md](HISTORY.md) | Timeline, lineage, chain history, roadmap signals |

Other material in the repo:

- `extra/traction.md` and `extra/traction-assets/`: audience and on-chain traction figures.
- `extra/architecture.md`: the Stellar settlement rail proposal for the upcoming app family. A roadmap document, not the current system.
- `client/docs/`: Android Play automation and the original Paw Match execution plan.
- `contracts/stellar/soroban-nft/README.md` and `contracts/evm/deployed-contracts.md`: chain-specific deploy notes.

## Conventions used in these docs

- Paths are relative to the repository root unless a section says otherwise.
- "Auth" means the `accesstoken` header. "Perm(n)" means a minimum permission level. See API.md.
- Known issues are listed at the end of each document. They are observations from reading the code, not a prioritised backlog.
- Secrets are never reproduced. Where a credential is hardcoded in source, the doc says so generically.
