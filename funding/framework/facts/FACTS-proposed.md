# Proposed fact changes (facts-verify pass, 2026-09-27)

**Proposals only.** `facts/FACTS.md` is unchanged. A person applies the rows they accept to
FACTS.md by hand, then runs `fund check` on each app that cites the fact.

Method: every fact in FACTS.md with status `unverified` or `sei-era` was checked against a public
source with WebFetch or WebSearch on 2026-09-27. Pages were read through the fetch tool's
summariser. The "Quote" column holds the text or data row that tool returned. Before a panel sees a
number, open the URL once and confirm the quote.

## Verification table

| ID | Current value | Proposed value | Proposed status | Source | Quote |
|---|---|---|---|---|---|
| F-001 | 542,000 registered users (2026-04) | 542,000, worded as "540K+ registered players (company-reported)" | still unverified (the only public source is our own homepage, which rounds it to 540K+) | https://tokentails.com/ | "540K+" "Registered players" |
| F-002 | 307,600 peak monthly web visitors (246,900 new) | no change | still unverified (GA4 is private; no public source) | extra/traction.md (screenshot `traction-assets/asset-01.png`) | n/a (no public source) |
| F-003 | 324,000 "peak monthly active on-chain users" | **324,422 peak weekly unique active wallets, week of 2025-11-17** (relabel: the dashboard has no monthly series) | wrong label. Value verified as a weekly figure; keep `sei-era` | https://dune.com/token_tails/sei (dashboard "SEI", id 198114, uaw widget) | row "2025-11-17 &#124; 324,422" (maximum of the uaw series; fetch note: "monthly active user figures are not presented in the available widgets") |
| F-004 | 659,000 peak weekly on-chain transactions | **875,907 weekly transactions, week of 2025-11-17** (659,159 is the week of 2026-01-12, the second-highest week) | wrong. Correct the value; keep `sei-era` | https://dune.com/token_tails/sei (tx_count widget) | rows "2025-11-17 &#124; 875,907" and "2026-01-12 &#124; 659,159" |
| F-005 | 154,161 latest weekly tx, dated 2026-09-25 | 154,161 weekly transactions, **week of 2026-02-23** (the last tx row on the dashboard) | wrong date. Value verified; keep `sei-era`. SEI activity stops in early March 2026, so the figure is not current | https://dune.com/token_tails/sei (tx_count widget) | row "2026-02-23 &#124; 154,161" ("Most Recent: 154,161 transactions (2026-02-23)") |
| F-006 | 39,652 latest weekly active wallets, dated 2026-09-25 | 39,652 weekly active wallets, **week of 2026-03-02** (the last uaw row) | wrong date. Value verified; keep `sei-era` | https://dune.com/token_tails/sei (uaw widget) | rows "2026-02-23 &#124; 39,797", "2026-03-02 &#124; 39,652" |
| F-011 | 186,000 X followers (2026-04) | **181,010 X followers (2026-09-27)** (the homepage still says "186K") | verified at the new value; 186,000 is now wrong | https://api.fxtwitter.com/tokentails (public profile JSON mirror of x.com/tokentails; x.com itself returned HTTP 402) | "followers": 181010, "screen_name": "tokentails", joined "Mon Mar 18 15:18:47 +0000 2024" |
| F-012 | 4,700 Instagram followers (2026-04) | **4,847 Instagram followers (search snippet, date unknown, seen 2026-09-27)** | still unverified (instagram.com returned no count; the figure is only in a search index snippet) | https://www.instagram.com/tokentails/ (via WebSearch snippet) | "4,847 followers on Instagram with 1,473 following and 42 posts" |
| F-013 | 40 cats across 23 IG/TikTok profiles | "40 influencer cats onboarded" (drop "23 profiles" unless the team can list them) | partly verified: the homepage makes the 40 claim, but it is self-reported; nothing public supports the 23 profiles | https://tokentails.com/ | "40" "Influencer cats onboarded" |
| F-014 | BGA: 1st place Blockchain Impact Forum; top 2025 incubation project | "Named Blockchain for Good Alliance's top 2025 incubation project, selected at BGAwards 2025 (Copenhagen, Blockchain Impact Forum); Ascend Incubation track" | verified, but **reword**: the release never says "1st place". Note: BGA is excluded as a funder (user decision), but citing the recognition is fine | https://www.prnewswire.com/news-releases/blockchain-for-good-alliance-names-token-tails-top-2025-incubation-project-for-scalable-stray-cat-rescue-infrastructure-302697229.html (DUBAI, Feb. 25, 2026) | "Token Tails was selected during BGAwards 2025 in Copenhagen, at the Blockchain Impact Forum, as part of the BGA Incubation Showcase." |
| F-022 | €105 filed FY2025 sales revenue | no change | still unverified: rekvizitai.vz.lt is blocked from this environment, imones.lt shows no financials, and Lursoft keeps financials behind a paywall | https://www.lursoft.lv/en/companies/lt/company/mb-token-tails/307008757 ; https://www.imones.lt/token-tails-mb | Lursoft: "Small Partnership", "Registered, 14.10.2024", "Publishing of video games (58.21, version 2.1)"; financials paywalled. (These confirm F-021 again.) |
| F-023 | IRL cat shelter event, Paris, co-hosted with Bybit / ChainforGood (2026) | "IRL cat-shelter event at Le Chat-Rivari Café, Paris (a shelter-cat adoption café), 2026-04-17, with @ChainforGood and @BybitEU, during Paris Blockchain Week 2026" | verified | https://api.fxtwitter.com/tokentails/status/2046611480263467341 (mirror of https://x.com/tokentails/status/2046611480263467341, posted 2026-04-21); PR Newswire release above; https://www.sortiraparis.com/en/where-to-eat-in-paris/brunch-cafe-tea-time/articles/331596-cat-rivari-cafe-vegan-cozy-adopt-cat-paris-13 (confirms the café is in Paris 13e) | Tweet: "Spent the loveliest afternoon at Le Chat-Rivari Café with all of you on April 17. … @ChainforGood @BybitEU". Release: "During Paris Blockchain Week 2026, Token Tails is scheduled to co-host a side event with Bybit and BGA, featuring supported rescue cats." |
| F-024 | 800+ strays saved (homepage claim) | "800+ cats saved (company-reported; repeated in the Feb 2026 BGA press release)" | claim verified as published; the underlying count is still self-reported. Keep it marked as a claim, or verify it against shelter receipts | https://tokentails.com/ ; PR Newswire release above | Homepage: "800+ strays saved". Release: "To date, Token Tails reports it has saved more than 800 cats, funding food, medical treatment, and urgent care across multiple shelters." |

### Knock-on effects in applications (not edited, list only)

- F-011 (186,000 → 181,010) is cited in `creative-europe-2027`.
- F-001, F-002, F-013, F-023 and F-024 are cited in `creative-europe-2027`. F-001 is also cited in
  `arc-microgrants` and `colosseum-worlds-fair`.
- F-022 is cited in `lt-travel-subsidy-2027`.
- F-003 to F-006 are not cited in any application today. Any future draft must say "weekly" and
  "on SEI", and use the 2025-11 and 2026-02/03 dates.
- The homepage (`client/`) still says "186K Followers on X". It is now out of date (181,010). This
  is a separate website fix and was not changed here.

## Only the team can verify these (exact export to pull)

| ID | What to pull | Then set |
|---|---|---|
| F-001 | A MongoDB count of user documents: `db.users.countDocuments({})`. Give the total and the date, plus the count of Firebase accounts (users with an email); label the rest as legacy accounts from the retired Telegram Mini App, which can no longer sign in, never as a live channel. Save a screenshot or CSV next to `extra/traction-assets/asset-02.png` | the value and date; status `verified (internal DB export, <date>)` |
| F-002 | GA4 → Reports → Acquisition → User acquisition, property for tokentails.com. Choose the peak month and export CSV/PDF with "Active users" and "New users" for that month | the value, month and property name |
| F-012 | Instagram app → Professional dashboard → Followers, screenshot with the date (or Meta Business Suite → Insights → Audience export) | 4,847 or the current count, with the date |
| F-013 | A list of the 23 IG/TikTok profile handles and the 40 cat names, with one post link per profile (the 14 post links in `extra/traction.md` are a start). Keep it out of FACTS.md if the handles belong to private individuals | "40 cats / 23 profiles", status verified |
| F-022 | The filed FY2025 annual financial statements (Registrų centras JAR, "finansinės ataskaitos"), or a screenshot of the rekvizitai.vz.lt/en/company/token_tails/ turnover tab taken from a normal browser | €105, or the correct figure, with the filing date |
| F-024 | A shelter donation ledger: Stripe payout/transfer export plus shelter receipts or confirmations adding up to the number of cats funded | "800+ cats", status verified, source "donation ledger <date>" |
| F-003–F-006 | Optional: a Dune CSV export of both dashboard queries (tx_count, uaw) to freeze the numbers above | the rows as proposed |
