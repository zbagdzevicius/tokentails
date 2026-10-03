# Fact base

**The only numbers an application may use.** Every draft sentence containing a metric must cite an
ID here as `[F-###]`; `fund check` rejects anything else.

Status: `verified` (checked at the source, safe to use) · `unverified` (self-reported, verify
before a panel sees it) · `sei-era` (true, but from the SEI chain — say so in the sentence) ·
`retired` (never use; kept so old drafts fail loudly).

Never add secrets, keys, bank details or personal data here — this file is pasted into AI prompts.

Generated from `facts/facts.json` by `fund facts build`: edit that file, not this one. A
`company-reported` fact is listed here as `unverified` (an application still has to say it is the
company's own figure). `fund refresh --write` edits rows here; `fund facts absorb` moves those edits
into facts.json.

| ID | Fact | Value | Source | Date | Status |
|---|---|---|---|---|---|
| F-001 | Registered users, all time (includes legacy accounts from the retired Telegram Mini App) | 542,000 | extra/traction.md | 2026-04 | unverified |
| F-002 | Peak monthly web visitors (GA4) | 307,600 (246,900 new in one month) | extra/traction.md | 2025 | unverified |
| F-003 | Peak weekly unique active wallets, week of 2025-11-17 (SEI dashboard; it has no monthly series; SEI activity stopped in early March 2026, not current) | 324,422 | dune.com/token_tails/sei | 2026-09-27 | sei-era |
| F-004 | Peak weekly on-chain transactions, week of 2025-11-17 (SEI dashboard; the week of 2026-01-12 is the second-highest; SEI activity stopped in early March 2026, not current) | 875,907 | dune.com/token_tails/sei | 2026-09-27 | sei-era |
| F-005 | Last recorded weekly on-chain transactions, week of 2026-02-23 (SEI dashboard; SEI activity stopped in early March 2026, not current) | 154,161 | dune.com/token_tails/sei | 2026-09-25 | sei-era |
| F-006 | Last recorded weekly active wallets, week of 2026-03-02 (SEI dashboard; not current) | 39,652 | dune.com/token_tails/sei | 2026-09-25 | sei-era |
| F-007 | Stellar Cat contract invocations since 2025-01-12 | 1,218,693 | stellar.expert/explorer/public/contract/CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF | 2026-09-23 | verified |
| F-008 | Stellar Blessing / Pass contract invocations | 3 / 5 | stellar.expert | 2026-09-23 | verified |
| F-009 | Stellar mainnet contracts (Cat, Blessing, Pass) | CBHOJOPZ…6QVF, CDY53U64…7NJ6, CBK4KAHL…MRS4 | docs/CONTRACTS.md | 2026-09 | verified |
| F-010 | SKALE Nebula ERC-721 contracts deployed on testnet and mainnet | Cat and Blessing | docs/HISTORY.md | 2024 | verified |
| F-011 | X followers | 181,010 | https://api.fxtwitter.com/tokentails (public profile mirror of x.com/tokentails) | 2026-09-27 | verified |
| F-012 | Instagram followers | 4,700 | extra/traction.md | 2026-04 | unverified |
| F-013 | Influencer cats onboarded | 40 cats across 23 IG/TikTok profiles | extra/traction.md | 2026-04 | unverified |
| F-014 | Blockchain for Good Alliance recognition | Named Blockchain for Good Alliance's top 2025 incubation project, selected at BGAwards 2025 (Copenhagen, Blockchain Impact Forum); Ascend Incubation track | https://www.prnewswire.com/news-releases/blockchain-for-good-alliance-names-token-tails-top-2025-incubation-project-for-scalable-stray-cat-rescue-infrastructure-302697229.html (2026-02-25) | 2026-09-27 | verified |
| F-015 | iOS app live | App Store id6745582489, seller "Token Tails, MB" | apps.apple.com | 2026-09 | verified |
| F-016 | Android app live | com.tokentails.app, 1K+ downloads | play.google.com | 2026-09 | verified |
| F-017 | Telegram Mini App (retired 2026-09-29; the product no longer runs on Telegram) | — | team decision 2026-09-29 | 2026-09-29 | retired |
| F-018 | Game modes | 5, incl. an 80-level platformer and a 30-level match-3 with leaderboards | docs/GAMES.md, README.md | 2026-09 | verified |
| F-019 | AI pipeline | OpenAI classifies and writes each cat's story; Gemini paints avatars and 4K portraits | README.md | 2026-09 | verified |
| F-020 | Payment rails | Stripe (Checkout, Payment Elements), iOS/Android IAP, XLM and USDC on Stellar | README.md, docs/BACKEND.md | 2026-09 | verified |
| F-021 | Legal entity | MB (small partnership), Lithuania, registered 2024-10-14, NACE 58.21 | Registrų centras (via lursoft/rekvizitai) | 2026-09 | verified |
| F-022 | Filed FY2025 sales revenue of the applicant entity | €105 | rekvizitai.vz.lt (mirror of Registrų centras) | 2026-09 | unverified |
| F-023 | IRL cat-shelter event at Le Chat-Rivari Café, Paris (a shelter-cat adoption café), 2026-04-17, with ChainforGood and Bybit EU, during Paris Blockchain Week 2026 | Co-hosted with Bybit / ChainforGood | https://x.com/tokentails/status/2046611480263467341 (read through the api.fxtwitter.com mirror); PR Newswire release 2026-02-25 | 2026-09-27 | unverified |
| F-024 | Cats helped (homepage claim): 800+ cats saved (company-reported; repeated in the Feb 2026 BGA press release) | 800+ strays saved | client homepage (hardcoded); PR Newswire release 2026-02-25 | 2026-09-27 | unverified |
| F-025 | Production chain | Stellar (Soroban NFTs, custodial Stellar wallet per user) | docs/ARCHITECTURE.md | 2026-09 | verified |
| F-026 | Total Token Tails reports donating directly, in crypto and in goods, all time to 2026-10-03; not counted in L-disbursed or L-treats | 40,000 | founder statement 2026-10-03 (landing polish request); receipts and transfer records held by Token Tails | 2026-10-03 | unverified |

<!-- fund facts build: rows sha256:64eea4002cf1692c -->
