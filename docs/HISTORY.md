# Project History

Reconstructed from git history, migration filenames, the client work log, and the traction notes.
Dates are commit or migration dates.

## Timeline

| When | What |
|---|---|
| 2024-04 | First SKALE (then "u2u") integration in the contracts folder. |
| 2024-06 | Original cat collection seeded. NFT giveaway winner and early-bird batches. |
| 2024-06 to 2024-07 | Soroban contracts written against Protocol 21; self-hosted Soroban RPC on Kubernetes. |
| 2024-08 | EVM wallets generated for users. Cats given a price. |
| 2024-09 | Legacy `score` converted to `catpoints`. Stellar wallets generated alongside EVM. |
| 2024-11 to 2024-12 | Bulk user import, starter cat "Cleocatra" for everyone, Christmas cat batches, cat supply set. |
| 2025 | Peak traction: 542k registered users, 307k monthly web visitors, 324k monthly active on-chain users, 659k weekly transactions across app, web, and Telegram game. Blockchain for Good Alliance names Token Tails top 2025 incubation project. |
| 2025-04 | Weekly counters start (hardcoded start date in the repositories). |
| 2025-06 | Codex monthly phases anchored to the 9th of June. |
| 2025-08 | Loot-drop buyer eligibility window opens. |
| 2025-10 | Legacy fields dropped from cats and users. `catpoints` converted to `tails` on a bracket ladder. Random `tokenId` assigned to every cat. |
| 2025-12 | `blessings[]` collapsed to a single `blessing` per cat. |
| 2026-01 | Ability types renamed: STORM to ELECTRIC, NATURE to GRASS, LEGENDARY and TAILS to FAIRY, AIR to WIND. |
| 2026-02 | Client work: cat tiers and generation progress, portrait variants, A/B test preparation, landing refactor, spinning wheel, gift flow, bookshelf and cats modals, pricing changes, watermark. |
| 2026-03-05 | Paw Match (Match 3) shipped with per-level leaderboards, catnip and score split, landscape HUD, procedural audio. |
| 2026-03-06 | Solana support removed. Game version bumped. |
| 2026-03-30 | Android keystore removed from tracking. |
| 2026-04-22 | Backend and CMS moved into the monorepo. |
| 2026-04-23 | Commercial license added, README and traction notes, settlement rail architecture proposal. |
| 2026-04-24 | Landing page refresh ("Forever Feline"). |
| 2026-05-17 | A/B test. |
| 2026-07-24 | Traction and weekly transaction figures updated. |
| 2026-09-16 | Gaming landing becomes the homepage at `/`; the "Forever Feline" app-family landing is removed and `/gaming` redirects to `/`. |
| 2026-09-17 | Rescue Mission Hub reduced to the sample card and portrait video; proof-section media switched to the deck originals hosted on the pitch site. |
| 2026-09-16 | Homepage proof section added between the Rescue Mission Hub and the globe: Paris cat café event video (Bybit, ChainforGood) and a marquee of 15 creator reels, served from `public/landing/proof/`; videos load and play only while on screen and never under reduced motion. |

## Lineage

Several traces show the client and backend descend from an earlier news or lifestyle product:
the Firebase project name, an external image resizer host referenced in content utilities, a
Lithuanian publication language in the sitemap config, and article, category, and feed modules
that predate the game. The blog features are that inheritance.

## Chain history

1. SKALE Nebula: ERC-721 Cat and Blessing deployed on testnet and mainnet, gas-free play via the sFUEL faucet. Cat documents still carry `token.sei` from a SEI-branded event chapter.
2. Stellar: became the production chain. Soroban Cat, Blessing, and Pass contracts on mainnet; custodial Stellar wallets generated for every user; XLM and USDC payments verified through Horizon.
3. Solana: briefly supported on the client, removed March 2026.
4. Internet Computer and Aptos: prototypes only, never deployed.

## Roadmap signals in the code

- App family: CatWatch, CatHealth, CatFood, CatMeds, CatFind, described in `extra/architecture.md` as Capacitor iOS apps sharing a Stellar settlement backend. No longer marketed on the landing page since 2026-09-16.
- Token generation event countdown in the codex set to 2026-11-19.
- Pack store in the invite modal gated behind a countdown that has already passed (2026-01-15).
- Empty game folders for Purragotchi, RoguePaws, and HyperTails.
- `PrintifyService` in the backend for print-on-demand fulfilment of portraits, not yet wired.
- Settlement rail proposal: Stellar Disbursement Platform and Bridge for shelter payouts, App Store receipt verification, ledger and reconciliation.
