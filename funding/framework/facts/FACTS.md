# Fact base

**The only numbers an application may use.** Every draft sentence containing a metric must cite an
ID here as `[F-###]`; `fund check` rejects anything else.

Status: `verified` (checked at the source, safe to use) · `unverified` (self-reported, verify
before a panel sees it) · `sei-era` (true, but from the SEI chain — say so in the sentence) ·
`retired` (never use; kept so old drafts fail loudly).

Never add secrets, keys, bank details or personal data here — this file is pasted into AI prompts.

| ID | Fact | Value | Source | Date | Status |
|---|---|---|---|---|---|
| F-001 | Registered users, all time (includes legacy accounts from the retired Telegram Mini App) | 542,000 | extra/traction.md | 2026-04 | unverified |
| F-002 | Peak monthly web visitors (GA4) | 307,600 (246,900 new in one month) | extra/traction.md | 2025 | unverified |
| F-003 | Peak monthly active on-chain users | 324,000 | dune.com/token_tails/sei | 2025–26 | sei-era |
| F-004 | Peak weekly on-chain transactions | 659,000 | dune.com/token_tails/sei | 2025–26 | sei-era |
| F-005 | Last recorded weekly on-chain transactions, week of 2026-02-23 (SEI dashboard; SEI activity stopped in early March 2026, not current) | 154,161 | dune.com/token_tails/sei | 2026-09-25 | sei-era |
| F-006 | Last recorded weekly active wallets, week of 2026-03-02 (SEI dashboard; not current) | 39,652 | dune.com/token_tails/sei | 2026-09-25 | sei-era |
| F-007 | Stellar Cat contract invocations since 2025-01-12 | 1,218,693 | stellar.expert/explorer/public/contract/CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF | 2026-09-23 | verified |
| F-008 | Stellar Blessing / Pass contract invocations | 3 / 5 | stellar.expert | 2026-09-23 | verified |
| F-009 | Stellar mainnet contracts (Cat, Blessing, Pass) | CBHOJOPZ…6QVF, CDY53U64…7NJ6, CBK4KAHL…MRS4 | docs/CONTRACTS.md | 2026-09 | verified |
| F-010 | SKALE Nebula ERC-721 contracts deployed on testnet and mainnet | Cat and Blessing | docs/HISTORY.md | 2024 | verified |
| F-011 | X followers | 186,000 | extra/traction.md | 2026-04 | unverified |
| F-012 | Instagram followers | 4,700 | extra/traction.md | 2026-04 | unverified |
| F-013 | Influencer cats onboarded | 40 cats across 23 IG/TikTok profiles | extra/traction.md | 2026-04 | unverified |
| F-014 | Blockchain for Good Alliance recognition | 1st place Blockchain Impact Forum; top 2025 incubation project | investing.com / prnewswire.com release, 2026-02-25 | 2026-02 | verified |
| F-015 | iOS app live | App Store id6745582489, seller "Token Tails, MB" | apps.apple.com | 2026-09 | verified |
| F-016 | Android app live | com.tokentails.app, 1K+ downloads | play.google.com | 2026-09 | verified |
| F-017 | Telegram Mini App (retired 2026-09-29; the product no longer runs on Telegram) | — | team decision 2026-09-29 | 2026-09-29 | retired |
| F-018 | Game modes | 5, incl. an 80-level platformer and a 30-level match-3 with leaderboards | docs/GAMES.md, README.md | 2026-09 | verified |
| F-019 | AI pipeline | OpenAI classifies and writes each cat's story; Gemini paints avatars and 4K portraits | README.md | 2026-09 | verified |
| F-020 | Payment rails | Stripe (Checkout, Payment Elements), iOS/Android IAP, XLM and USDC on Stellar | README.md, docs/BACKEND.md | 2026-09 | verified |
| F-021 | Legal entity | MB (small partnership), Lithuania, registered 2024-10-14, NACE 58.21 | Registrų centras (via lursoft/rekvizitai) | 2026-09 | verified |
| F-022 | Filed FY2025 sales revenue of the applicant entity | €105 | rekvizitai.vz.lt (mirror of Registrų centras) | 2026-09 | unverified |
| F-023 | IRL cat shelter event, Paris | Co-hosted with Bybit / ChainforGood | extra/traction.md | 2026 | unverified |
| F-024 | Cats helped (homepage claim) | 800+ strays saved | client homepage (hardcoded) | 2026 | unverified |
| F-025 | Production chain | Stellar (Soroban NFTs, custodial Stellar wallet per user) | docs/ARCHITECTURE.md | 2026-09 | verified |
