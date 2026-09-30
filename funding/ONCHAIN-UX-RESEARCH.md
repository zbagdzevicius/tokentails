# On-chain visibility, wallets, hosting and expansion (2026-09-30)

# Token Tails: on-chain visibility, heist URL, expansion, and the build plan

## 1. Is the on-chain part strong and visible enough?

**No, not yet.** The proof is real, but players can only watch it. Today nobody can call ShelterSplit except the team or someone using a block explorer's write tab. The client has no EVM wallet library, the heist has no wallet or login, and `/shelter-payouts` only reads events. That is a real problem for Colosseum s.8(d) ("utilize blockchain to create great UX for downstream users") and for Arc's "quality of what you built".

There is a second problem the reports only touch on. After Oct 2 the only payout on the page is 1 USDC from Token Tails, through the contract, to a wallet Token Tails holds. A judge can fairly read that as money going in a circle. The disclosure, the shelter's identity and a handover date have to sit next to it.

**Minimum judge-safe version (live by Oct 6, for Arc Oct 7 and Colosseum Oct 11):**

- **A. Sponsored donation, no wallet needed (web, iOS and Android).**
  - A signed-in player taps once. The backend checks the Firebase token, then a Token Tails hot wallet calls `donate(memo)` on Arc with a small fixed amount from our budget. The memo holds a batch ID only.
  - The player then sees the explorer link and the updated total.
  - Estimate: 6-8 AI hours plus 3-4 of your hours.
  - My own design choice (not from the reports): have the win screen open a Next.js page such as `/shelter-payouts/give`, which already has Firebase auth. That avoids adding Firebase to the static Three.js bundle. `/heist` is same-origin, so this works.
  - **The server cannot verify a win.** The heist has no saves and no score path. The trigger is really "a signed-in account, once per day", so abuse control comes from the per-account cap, a global budget and a kill switch.
  - The cap and budget amounts are yours to set. I have not invented any.
  - This adds a donation write path, not a score path. Scores stay on `POST /user/catbassadors/live`.
  - It adds a new server secret (the hot wallet key). Keep only a small float in that wallet.
- **B. Donate with your own wallet (web only).**
  - viem, an injected EIP-1193 wallet, `wallet_addEthereumChain` for chain 5042, then `donate(memo)`. That is one transaction with no approve, because USDC is Arc's native coin.
  - In the apps, show "copy contract address" instead.
  - Estimate: 3-5 AI hours plus 2 of yours.
  - **Legal gate:** B lets the public send money into a wallet Token Tails controls, which may count as MiCA custody. Ship B enabled only if the shelter holds its own keys by Oct 6. If not, show B as "opens when the shelter holds its own keys" and demo with A. A only moves our own money.
- **C. Visibility additions (small):**
  - A receipt page at `/shelter-payouts/tx/<chainId>/<hash>` with its own share image.
  - A shelter profile block: name, wallet, handover status and the disclosure. Organisation data only.
  - Show the contract balance as zero to make the pass-through design visible.
- **Tempo, for Colosseum:** mainnet `disburseWithMemo` from the ops wallet, plus a passkey and sponsored-fee demo on testnet only. The public fee payer is testnet-only, and mainnet needs a hosted Fee Payer key whose price and approval process are unknown. Label it as testnet in the entry.

**What does not fit before Oct 7:** the "bigger" report schedules a Circle Modular Wallets passkey widget for Oct 2-6. I dropped that from the October plan:

- It is 20-30 AI hours plus 8-12 of yours.
- It needs a mainnet Gas Station policy (cost unknown).
- Modular Wallets are not linked to Firebase.
- Support inside the app WebView is undocumented, and the iOS WKWebView passkey requirements are unverified.

**Stronger version for November:**

- Privy embedded wallets linked to the Firebase JWT. JWT auth is on the free plan up to 499 monthly active users, then $299 a month.
- A card onramp: Circle App Kit Onramp on Arc (mainnet not confirmed), or Stripe on Arbitrum or Tempo (private preview).
- Batching approve plus `disburse` into one transaction.
- Estimate: 20-30 AI hours plus 15-25 of yours.
- **Weak spot:** an embedded wallet starts with zero balance. On Arc, gas is paid in USDC, so a new player still can't donate without the onramp, which involves KYC, unknown fees and unknown Lithuania support. Real per-player transactions depend on funding, not just on having a wallet.
- **Gate:** a Privy-in-Capacitor WebView test on both platforms. That is UNKNOWN today.

## 3. tokentails.com/heist or catnip.tokentails.com

**Keep `tokentails.com/heist/` and drop the subdomain.** Every factor in the visibility report favours the path:

- Firebase web sessions persist for one host only, and A needs login.
- Saved progress is stored per origin.
- `deployments.json` is already fetched same-origin, so the subdomain would need an absolute URL and CORS.
- The Capacitor app already ships `out/heist`, so the game works offline in the app.
- No new DNS records, and no extra hostname behind Cloudflare in front of Vercel.
- Judges only need to trust one domain.

The subdomain has no advantage that matters here.

To deprecate it cleanly:

- Change the `catnip.tokentails.com` default in `/Users/zygimantasbagdzevicius/me/tokentails-app/.github/workflows/catnip-heist-pages.yml` (line 16).
- Update the reference on line 43 of `/Users/zygimantasbagdzevicius/me/tokentails-app/CLAUDE.md` (an uncommitted edit).
- Add `/heist` → `/heist/index.html` to `redirects()` in `/Users/zygimantasbagdzevicius/me/tokentails-app/client/next.config.js`. That block only runs on web builds, so the app is unaffected.
- Don't create the DNS record. If you ever want the vanity link, make it a 301 to the path.

## 4. How to make it bigger: top 3

| # | Expansion | Effect on odds | Effort | Legal constraints | Timeline | Evidence quality |
|---|---|---|---|---|---|---|
| 1 | **ShelterSplit Rail:** an open-source donate widget and SDK, non-custodial, used first in the Heist and on /shelter-payouts, then embeddable by other apps | Colosseum s.8(d) and (e), the Public Goods award ($5k) and the Arbitrum track. Circle "peer-to-peer payments" and Team1 get an adoption metric. | 20-30 AI h + 8-12 your h, plus outreach for adopters | Every provider must leave keys with the user (MiCA custody); confirm this per provider. Hand over the shelter wallet first. | Open-source README and SDK stub by Oct 11. Working widget in November, same gate as Privy. | The adoption metric is zero today, and nobody has been asked. Modular Wallets and Privy conflict (Firebase link and WebView are both unknown). |
| 2 | **Agentic donations:** a pay-per-call API or MCP tool whose `payTo` is ShelterSplit (MPP on Tempo, x402 or Nanopayments on Arc) | Matches a named Circle grant category (agentic economic activity). Possible novelty for Tempo. | 14-20 AI h + 4-6 your h | Token Tails must never hold the funds. The API has to sell something real, or it is a donation with extra steps. | Late October, for the Circle application | The x402 volume comes from one CoinDesk article. "No x402 charity product exists" is unverified. Nanopayments minimums and whether it can pay a contract are unknown. |
| 3 | **Seasonal rescue campaign** with an on-chain goal meter read from events, plus optional soulbound receipts (never sold) and sponsor matching later | The traction engine for Arbitrum Dubai and Team1 | 6-10 AI h + 10-20 your h of promotion | The goal must not mislead. Receipts must never be sold or priced (no token sale). Public donations need the handover. | November | It depends on #1 or on Privy plus an onramp, since otherwise the public can't pay. Dubai may be postponed and its criteria are "Announcing Soon". |

**Excluded:** linking the Stellar NFTs, because it builds on the custodial Stellar keypairs. That is a known issue in `docs/BACKEND.md` (lines 105 and 330); I'm reporting it, not fixing it. Also excluded: Stripe round-ups, because the Lithuanian tax treatment is unknown.

## Combined build plan

| Date | Build | Owner | Why | Gate |
|---|---|---|---|---|
| Sep 30 - Oct 1 | Confirm Arc mainnet is live (docs conflict). Ask the shelter to create or hold its own wallet. Request Tempo mainnet Fee Payer access. Check Colosseum rules for multi-track entry, the "work done during the hackathon" wording and the start date. Set the donation budget and caps. | You | Every later row depends on these | Arc mainnet not live: Arc entry is off |
| Oct 1 | `/heist` redirect, deprecate the subdomain (workflow default, CLAUDE.md), shelter profile block | AI | Clean submission URL. Answers the custody question. | Web build passes lint and tsc |
| Oct 2 | Mainnet deploy on 4 chains, the 1 USDC payout, fill `deployments.json` | You (AI prepares) | Gives the page real data | The tx shows on /shelter-payouts from public RPC |
| Oct 2-4 | **A:** sponsored `donate` endpoint, give page, win-screen button, caps, kill switch | AI builds, you fund the wallet and review | Every player gets a real on-chain action (s.8(d)) | End-to-end on web, Android and iOS devices. Kill switch tested. |
| Oct 3-5 | **B:** injected-wallet `donate` (web). Receipt page with share image. Zero-balance display. | AI | "Use the chain", verifiable receipts | B enabled only if the shelter holds its keys |
| Oct 6 | Phone run-through, 60-second demo video, entry text (disclose custody and handover) | You | Judges can try the loop in 60 seconds | Everything works on a fresh account |
| **Oct 7** | **Submit Arc Microgrants** | You | Leaves a week of buffer before the Oct 14 close | — |
| Oct 7-10 | Tempo mainnet `disburseWithMemo`, testnet passkey and sponsored demo, open-source SDK README, pick the Colosseum track | AI, you pick the track | Tempo or Arbitrum track, s.8(e) | Fee Payer access decides mainnet or testnet |
| **Oct 11** | **Submit Colosseum** | You | A day of buffer before Oct 12 23:59 PT | — |
| Oct 13-21 | Anitya jam reuses the heist and A. The Arc decision arrives (by Oct 21 per one search summary). | AI / You | Reuse, not new scope | — |
| Oct 22-31 | Privy WebView test on both platforms. Draft the Circle grant (agentic idea #2) and the Team1 application. | AI test, you write | Decides the November build | The WebView test fails: stay on A and B |
| Nov 1-15 | Privy + Firebase wallets, onramp application, campaign goal meter | AI + you | Real per-player transactions | Handover done, onramp supports Lithuania |
| Nov 16 - Dec 6 | Arbitrum Dubai campaign, traction counted from events only | You | "Users and traction" | Confirm Dubai isn't postponed |

## Effect on win chances, honestly

I can't give percentages. No report has applicant counts, entrant counts or base rates, and the 0-5 "lift" scores in the bigger report are opinions, not probabilities. What can be counted:

- **Arc:** 20 grants × 500 USDC, 10,000 USDC in total, so the most one grant is worth is 500 USDC. Of the 4 criteria (relevance, technical credibility, quality, worth taking further), today we credibly meet about 2: relevance, and a contract deployed on mainnet. After A, B and the receipt page, quality and "worth taking further" become arguable, so all 4 are covered. The criteria come from a search summary, because the page returned 405. The bigger value is that Arc leads into the Circle grants ($5k-100k per milestone). But Circle judges "traction", which we don't have.
- **Colosseum:** 6 criteria, (a) to (f). Today (d) is weak (users only watch the chain) and (e) is partial (open-source contract). A and B turn (d) into "users use the chain", and the SDK README strengthens (e). That is 2 of 6 criteria improved; the weights are unknown.
  - Tempo: 10 × $10k. Our mainnet story there is the weakest, because sponsored gas is testnet-only.
  - Arbitrum: $25k across 5, so $5k each.
  - Public Goods: $5k.
  - Multi-track entry is unknown. If a "work done during the hackathon" rule exists (unverified), work finished before the start may count less.
- **Team1 and Arbitrum Dubai:** the October plan barely helps. Both depend on real users, which only November can produce. The Team1 criteria are unknown, and Dubai's status conflicts between sources.

**Weakest evidence to recheck:**

- Whether Arc mainnet is live.
- The Arc criteria and decision date (search summary only).
- Gitcoin's attestation wording (the page returned 502).
- The x402 figures and the "open space" claim.
- Whether Dubai is postponed.
- Whether Privy works in a Capacitor WebView, and the iOS passkey requirements.
- Onramp support for Lithuania.
- All hour figures, which are estimates.

---

## Research reports

### Wallets

# Contract interaction research: how each player can take part in ShelterSplit

**Bottom line:** today no player can touch ShelterSplit. Every player can take part if we ship two things. First, a "your win sends a sponsored micro-donation" button that needs no wallet. Second, an optional "Donate with wallet" button for people who already hold crypto. Both can be live and safe to show judges before Oct 7 and Oct 11. In November, embedded wallets linked to the Firebase login (Privy is the best fit) plus a card onramp would give each player their own wallet.

## 1. What the repo allows today (read-only)

- **Contract** (`funding/framework/tracks/a-build/shelter-split/src/ShelterSplit.sol`):
  - `donate(string memo) payable` (line 266) takes one transaction and needs no approve. On Arc the native coin is USDC, so gas and the donation are the same asset. `receive()` works the same way with an empty memo.
  - `disburse(amount, memo)` (line 239) and `disburseWithMemo(amount, bytes32)` (line 255) pull the token from the caller, so they need an `approve` first. That is two transactions unless they are batched.
  - Memos are capped by `MAX_MEMO_BYTES`.
  - Anyone can call these. The only owner-only functions are for managing shelters, the treasury and pausing.
- **Auth** (`client/context/FirebaseAuthContext.tsx`, `docs/CLIENT.md` lines 132-135):
  - Firebase is "the only login". On native, the Capacitor Firebase plugin signs in and passes the credential to the web SDK.
  - The ID token is available through `getIdToken(true)` (lines 165 and 177), which is what a JWT-based wallet provider needs.
- **Web3 today:** Stellar only. `docs/CLIENT.md` line 207: "No EVM, Solana, or WalletConnect code remains". Any EVM path is new code (viem), and per CLAUDE.md it must load through `next/dynamic` with `ssr: false`.
- **Prior research** in `funding/HEIST-INTEGRATION-DATA.json` (around lines 252-301) reaches the same conclusions on Circle, Tempo and Paymaster. I re-checked the key points below.

## 2. Options checked

| Option | Arc 5042 | Tempo 4217 | Arbitrum | Avalanche | Price | KYC | Capacitor WebView | Estimated build (AI / human) |
|---|---|---|---|---|---|---|---|---|
| **Privy** embedded wallet + Firebase JWT | Any EVM chain via `defineChain` (**yes**); sponsored gas **not listed** | Yes, sponsored gas | Yes, sponsored gas | Chain yes, sponsored gas not listed | Free up to 499 MAU; $299/mo for 500-2,499 | None for the wallet | OAuth needs universal links (we avoid it by using the Firebase JWT). Embedded wallet in a WebView is **UNKNOWN** | 6-10 / 4-8 (dashboard setup, JWKS, device tests) |
| **Circle Modular Wallets** (passkeys) + Gas Station | MSCA yes; Gas Station lists Arc Mainnet | Not listed | Yes | Yes | Gas Station "5% of the gas fee", billed to a card on mainnet | None stated | Needs passkeys (see below). **Not linked to Firebase** | 8-12 / 6-10 |
| **thirdweb** in-app wallet | Chain listed (RPC `5042.rpc.thirdweb.com`); paymaster **unknown** | Unknown | Yes | Yes | Custom JWT auth only on Scale plan, **$499/mo** | – | Unknown | 6-10 / 4-6, but blocked by price |
| **Dynamic** | Listed by Arc as an AA provider | Unknown | Yes | Yes | Free up to 1,000 MAU, but Firebase "bring your own auth" is **Enterprise only** | – | Unknown | Blocked by plan |
| **Coinbase Smart Wallet / Base Account** | Unknown (docs moved) | Unknown | Unknown | Unknown | – | – | Unknown | Not checked |
| **Injected wallet** (MetaMask, Rabby) calling `donate` | Yes (Arc docs offer "one-click setup") | Possible, but needs a TIP-20 fee token and 2 txs | Yes (2 txs) | Yes (2 txs) | Free | None | **No:** there is no injected provider in the app WebViews, and WalletConnect was removed | 3-5 / 2-3 (web only) |
| **Circle App Kit Onramp** (card to USDC) | "USDC or EURC on Arc"; mainnet **not confirmed** | No | – | – | Fees unknown | Needed for some payment methods | iframe widget; WebView **unknown** | 5-8 / 6-10 (Circle Console, server key) |
| **Stripe crypto onramp** | **No** | USDC.e, but only in the native Embedded Components SDK (private preview) | USDC, same native SDK only | No | Fees shown per quote | Stripe does KYC; the embedded web onramp is EU and US only | Web onramp supports mobile WebViews; native SDK needs app attestation | 6-10 / 8-15 (application review is "within 48 hours") |
| **Coinbase Onramp** | Unknown | Unknown | Yes | Yes | Unknown | Guest checkout is US only and ends Jun 30, 2026 | Unknown | Not pursued |
| **Tempo fee sponsorship + memos** | – | Public fee payer is **testnet only**; mainnet needs a hosted Fee Payer API key or a self-hosted relay | – | – | Unknown | Unknown | Tempo supports passkeys | 4-6 / 2-4 on testnet |

**Passkeys inside the app:**
- **Android:** passkeys work in WebView from androidx.webkit 1.12.0, but only after calling `setWebAuthenticationSupport()` and linking the app to our website through Digital Asset Links.
- **iOS:** requirements for WKWebView are **UNVERIFIED** (Apple's docs page returned 404). A fallback is to run the passkey step in the system browser through `@capacitor/browser`, which is already installed.
- **Circle Modular Wallets:** WebView support is not documented. The docs only say "Build with the Web, iOS, or Android SDK."

## 3. Recommendation for Oct 7 (Arc) and Oct 11 (Colosseum)

**A. "Your win feeds a shelter" (every player, no wallet)**
- On the Heist win screen, a signed-in player taps once.
- The backend verifies the Firebase token, then Token Tails' own wallet calls `donate(memo)` on Arc with a small fixed amount from a treasury budget.
  - The memo holds a run or batch ID only, no personal data.
  - Amounts, the per-player daily cap and the total budget are ours to set. They are not facts yet.
- The screen then shows the Arc explorer link and the updated "sent to shelters" total that is already read from the chain.
- **Why it fits:** this answers Colosseum rule s.8(d) ("utilize blockchain to create great UX for downstream users"). The player pays nothing and still gets a verifiable result on chain. It also works in the iOS and Android apps.
- **This is a new backend write path.** It records donations, not game scores, so the rule that scores are saved only through `POST /user/catbassadors/live` still holds.
- **Abuse control:** limit per Firebase account and per day, and add a kill switch. Either pausing the contract or cutting off the donating wallet works.
- **Estimated effort:** about 6-8 AI hours plus 3-4 human hours (funding the donating wallet, checking the key setup, review).

**B. "Donate with your wallet" (web only, for people who already have crypto)**
- viem with an EIP-1193 injected wallet, then `wallet_addEthereumChain` for chain 5042, then `donate(memo)`.
- It is a single transaction with no approve, because gas and the donation are both USDC.
- In the apps, show a "copy contract address" option instead.
- **Estimated effort:** 3-5 AI hours plus 2 human hours.

**For the Tempo track:** show `disburseWithMemo` done from the ops wallet on mainnet, and gasless sponsorship through the public fee payer on testnet only. Be clear in the entry that sponsorship is not on mainnet.

## 4. Stronger version for November (Arbitrum Dubai, Team1, Circle)

- **Privy linked to Firebase** (JWT-based auth is on the free plan):
  - Each player gets an embedded wallet automatically.
  - Gas is sponsored on Arbitrum and Tempo. On Arc it is not needed, because gas is paid in USDC.
  - This gives real per-player transactions for the Arbitrum traction numbers.
- **Card to USDC on Arc:** Circle App Kit Onramp. Alternatively, Stripe Embedded Components on Arbitrum or Tempo, which needs private preview access.
- **Batching:** approve plus `disburse` in one transaction. That uses Tempo's native batching, or an EIP-7702 or smart-account batch elsewhere.
- **Estimated effort:** about 20-30 AI hours plus 15-25 human hours (device tests on both platforms, provider onboarding, onramp application).

## 5. Open questions

- **Is Arc mainnet live?** The connect page lists chain 5042 and `rpc.mainnet.arc.io`. The gas-and-fees page says its parameters "reflect the current Arc Testnet configuration… may change before mainnet launch."
- Whether Privy or Alchemy sponsor gas on Arc or Avalanche mainnet.
- Whether Privy's embedded wallet works inside a Capacitor WebView.
- iOS WKWebView passkey requirements.
- Fees and supported countries (including Lithuania) for the Circle Onramp and Coinbase Onramp, and whether the Circle Onramp delivers on Arc mainnet.
- Price and approval process for Tempo's mainnet Fee Payer.
- Base Account supported chains.
- All hour figures are estimates.

## Sources

- https://docs.arc.io/arc/references/connect-to-arc
- https://docs.arc.io/arc/tools/account-abstraction
- https://docs.arc.io/app-kit/onramp.md
- https://docs.arc.io/arc/references/gas-and-fees.md
- https://www.privy.io/pricing
- https://docs.privy.io/wallets/gas-and-asset-management/gas/overview
- https://docs.privy.io/authentication/user-authentication/jwt-based-auth/overview
- https://docs.privy.io/basics/react/advanced/configuring-evm-networks.md
- https://docs.privy.io/recipes/capacitor-oauth.md
- https://docs.privy.io/recipes/tempo/send-transactions.md
- https://developers.circle.com/wallets/modular
- https://developers.circle.com/wallets/supported-blockchains
- https://developers.circle.com/wallets/gas-station
- https://thirdweb.com/arc
- https://thirdweb.com/pricing
- https://www.dynamic.xyz/pricing
- https://tempo.xyz/developers/docs/guide/payments/sponsor-user-fees
- https://tempo.xyz/blog/tempo-transactions/
- https://docs.stripe.com/crypto/onramp
- https://docs.stripe.com/crypto/onramp/embedded
- https://docs.stripe.com/crypto/onramp/embedded-components-integration-guide?platform=react-native
- https://docs.cdp.coinbase.com/onramp-&-offramp/onramp-apis/onramp-overview
- https://developer.android.com/identity/sign-in/credential-manager-webview

Repo files used:
- /Users/zygimantasbagdzevicius/me/tokentails-app/funding/framework/tracks/a-build/shelter-split/src/ShelterSplit.sol
- /Users/zygimantasbagdzevicius/me/tokentails-app/client/context/FirebaseAuthContext.tsx
- /Users/zygimantasbagdzevicius/me/tokentails-app/docs/CLIENT.md
- /Users/zygimantasbagdzevicius/me/tokentails-app/funding/HEIST-INTEGRATION-DATA.json

### Visibility and hosting

## Token Tails: how visible the proof of impact is, and whether the heist stays at /heist or moves to catnip.tokentails.com

### 1. Proof of impact

**Verdict: the proof is real but hard to see. As it stands it would score low on Colosseum s.8(d) and on Arc's "quality of what you built".**

**What exists (repo evidence)**
- `/shelter-payouts` (`client/components/shelter-payouts/ShelterPayouts.tsx`) reads both `Disbursed` and `NativeDisbursed` logs from public RPCs (`logs.ts:67-68`). It shows totals per token, a table per deployment, and explorer links for the shelter address and the tx hash (lines 82, 127, 138). The page states: "Nothing on this page comes from our servers." That is a strong claim and a good one to keep.
- `client/public/shelter-payouts/deployments.json` is still `[]`, so the page shows its empty state until Oct 2.
- After Oct 2 the page will show one 1 USDC payout, to a wallet Token Tails holds. The disclosure banner is required and says so. Judges may read this as self-dealing unless the shelter's identity and the handover plan are shown next to it.
- **Nobody can interact with the contract.** The client has no EVM wallet library (no wagmi, viem, ethers or WalletConnect). The only wallet code is `@creit.tech/stellar-wallets-kit` in `components/web3/transfer/useWeb3Transfer.tsx`, and it is Stellar only. The heist has no wallet either. So in practice `donate()` and `disburse()` can only be called from an explorer's write tab or by the team. **This is the biggest gap for s.8(d): the blockchain is something users watch, not something they use.**

**What comparable products show (evidence)**

| Product | Feature | Quote / source |
|---|---|---|
| Endaoment | Receipts per donation | "Verifiable Receipts". The homepage impact counter showed "$0.00" when fetched. https://www.endaoment.org/ |
| Endaoment | Explorer verification | Per the search summary, every transaction is "publicly verifiable via Etherscan"; Endaoment contracts are labelled on Etherscan (e.g. "Endaoment: Organization Fund Factory"). https://endaoment.org/learn (now redirects to faq.endaoment.org) |
| The Giving Block | Automatic receipt when the chain confirms | "As soon as the donation is confirmed on the blockchain, donors are automatically sent the receipt via email." https://thegivingblock.com/faqs-for-crypto-donors/ |
| GiveDirectly (crypto) | Wallet connect, then amount, then confirm, then receipt | "You'll receive a receipt from Endaoment for your records." https://www.givedirectly.org/crypto/ |
| Gitcoin | Donor badge / on-chain receipt plus share card | After donating, "you can mint an attestation that symbolizes your contribution and receive a unique image that you can share" (EAS on Arbitrum). https://www.gitcoin.co/blog/mint-attestations-capturing-your-impact (returned 502 when fetched; wording is from the search summary) |
| Glo Dollar | Live impact number | "Donating more than $2,000 per month to organizations driving real change." https://www.glodollar.org/ |
| Circle Foundation and the UN (Jan 21, 2026) | Traceability is how Circle frames aid | "deliver human-centered aid faster, with full traceability, stronger accountability." https://www.circle.com/pressroom/circle-foundation-and-united-nations-aid-agencies-partner-to-transform-global-aid-delivery-and-transparency |

**The judging criteria (verbatim)**
- Colosseum World's Fair rules s.8, taken from the official PDF (https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf):
  - "(a) Functionality: How well does this Project Submission work? What is the quality of the code?"
  - "(d) UX: How well does this Project Submission utilize blockchain to create great UX for downstream users?"
  - "(e) Open-source: ... How well does the Project Submission compose with other primitives in the crypto ecosystem?"
- Arc Microgrants: projects are judged on "relevance to Arc, technical credibility, the quality of what you built, and whether the project is worth taking further, with promise counting for more than traction." This is from the search summary; the DoraHacks page returned 405. https://dorahacks.io/hackathon/arc-microgrants
- Arc docs recommend "`wagmi` and `viem` with libraries like ConnectKit, Reown AppKit, or WalletConnect", and `viem` has `arc` built in (chain ID 5042; explorer https://explorer.arc.io). https://docs.arc.io/arc/references/connect-to-arc
- Tempo: "Users can authenticate and authorize transactions with biometrics", and "Applications or third parties can cover users' gas fees." https://tempo.xyz/blog/tempo-transactions/ This is the strongest s.8(d) story for the Tempo track: donating with a passkey, the app paying the gas, and no wallet extension.

**What to add, in priority order (sizes are rough; nothing here was measured)**

| # | Add | Why | Size |
|---|---|---|---|
| 1 | **A Donate button on /shelter-payouts and on the heist win screen**, using an injected wallet (EIP-6963) and viem. It calls `donate()` on Arc (native USDC) or `disburse()` with approve (USDC/EURC) on Arbitrum and Avalanche. | Turns "watch the chain" into "use the chain" (s.8(d)). Arc docs recommend exactly this stack. | M |
| 2 | **A receipt page per payout**: `/shelter-payouts/tx/<chainId>/<hash>` with amount, shelter, memo, block time, a "Verify on explorer" button and its own OG image for sharing. | Matches Endaoment's Verifiable Receipts and Gitcoin's share image. | S–M |
| 3 | **A shelter profile block**: name, public photo, wallet address with explorer link, handover status and date, and the disclosure. | Answers the custody concern. No personal data needed. | S |
| 4 | **Win-screen call to action**: "Chip in 1 USDC and get a receipt link", next to the existing read-only total. | Game, then donation, then receipt: the loop judges can try in 60 seconds. | S |
| 5 | **Tempo passkey plus sponsored-fee donation** (Tempo track only) | The UX story best matched to s.8(d). | L (unknown feasibility by Oct 12) |
| 6 | Optional: a donor attestation (EAS on Arbitrum), like Gitcoin's | A badge people can show. Possibly too big before the deadlines. | M–L |

Score rules: scores stay on `POST /user/catbassadors/live`. None of the items above writes game scores on-chain.

**Unknowns**
- Whether `/heist` without `index.html` resolves on production. I did not check it: no network calls from Bash.
- How judges weight a custodial shelter wallet.
- The exact Endaoment receipt contents (their docs page returned 404).
- Which wallets support Tempo TIP-20 and passkey accounts; not checked.

### 2. tokentails.com/heist or catnip.tokentails.com

**Recommendation: keep `tokentails.com/heist/` and drop catnip.tokentails.com.** If a vanity link is ever wanted, add it only as a 301 redirect to `/heist/`.

| Factor | Path `/heist/` | Subdomain `catnip.` | Evidence |
|---|---|---|---|
| SEO | Google: "Low maintenance (same host)" | Google: "Easy separation of sites" | https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites. Google publishes no official claim about authority passing between the two, so treat that as unknown. |
| Redirect cost | none | A 301 later is safe: "301 and other permanent redirects don't cause a loss in PageRank" | https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes |
| Firebase login (phase B) | Shared automatically | Separate login: "Firebase Auth web sessions are single host origin and will be persisted for a single domain only." | https://firebase.google.com/docs/auth/web/auth-state-persistence |
| Saved progress and cookies | One origin | "Each origin gets its own separate storage." Heist progress key `catnip-heist.progress.v1` (see `catnip-heist/README.md`) would be lost if the heist moved later. | https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy |
| deployments.json | Already fetched same-origin: built bundle has `HEIST_DEPLOYMENTS_URL:"/shelter-payouts/deployments.json"` | Needs an absolute URL plus a CORS header | `client/public/heist/build/index-*.js` |
| Capacitor app | Already shipped: `out/heist` (2.6M) sits in `webDir: "out"`, so it works offline inside the app | Would need a remote URL or a second build | `client/capacitor.config.ts`, `client/out/heist` |
| Build | `HEIST_BASE=/heist/` is already documented | New base and new env | `catnip-heist/README.md` |
| Vercel and Cloudflare | No new records | A CNAME per project; Vercel says: "We do not recommend using a reverse proxy in front of Vercel." Each proxied hostname adds more of that risk. | https://vercel.com/docs/domains/working-with-domains/add-a-domain, https://vercel.com/kb/guide/cloudflare-with-vercel |
| Judges | One domain; the game and the payouts page link to each other with relative links | A second domain to trust and explain | — |
| Analytics | One property | Cross-domain setup needed | No analytics library found in `client/pages` or `client/components`, so this is currently unknown or unused. |

Small follow-up: the canonical link today is `/heist/index.html` (`ShelterPayouts.tsx:13`). A clean `/heist/` redirect for the web build would read better in submissions. It would go in `next.config.js` `redirects()`, which runs on web builds only, so the app is not affected.

Every point favours the path, and the subdomain has no advantage that matters here: the heist is not a separate product, it does not need a separate server, and phase B puts it inside the app.

### Bigger thing

# Making ShelterSplit and Catnip Heist bigger: 10 expansion ideas, ranked, with a top 3 and timeline

## Main finding
Your question 1 and question 4 have the same answer. Right now nobody can pay through the contract themselves: the Heist has no wallet, and `/shelter-payouts` only reads events. The bigger version is an **open donation rail**: a drop-in widget and SDK that lets any player or app pay shelters directly from their own wallet, in the same transaction, with no gas fees for the donor. Circle Modular Wallets (passkey login, Gas Station paymaster) and Tempo (passkey accounts, fee sponsorship) now support this. The widget would never hold anyone's crypto, which keeps Token Tails away from a MiCA custody licence (CASP).

## What the programs say
- **Colosseum rules PDF, s.8 (read in full):** (a) "Functionality… quality of the code"; (b) "Potential Impact… total addressable market"; (c) "Novelty"; (d) "UX: How well does this Project Submission utilize blockchain to create great UX for downstream users?"; (e) "Open-source… How well does the Project Submission compose with other primitives"; (f) "Business Plan".
  - s.14 prizes: "(b) Public Goods Award: $5,000", "(f) Tempo track: $100,000… across 10", "(k) Arbitrum track: $25,000… across 5". Source: colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf
  - The Arbitrum track fits the planned Arbitrum deployment.
  - **Unknown:** whether one submission can compete in several tracks (s.7 allows "one (1) Project Submission"). A secondary source says entries are "checked for significant work done during the hackathon"; I did not verify that in the PDF.
- **Circle grants** (circle.com/grants): categories include "Agentic economic activity: Enable autonomous AI agents to… settle value in real time" and "Peer-to-peer payments". Criteria are "Strong platform alignment", "Exceptional teams", "Traction and path to success", "Ecosystem impact". Grants run "$5,000 to $100,000 in USDC", paid per milestone. No deadline is listed.
- **Arc Microgrants** (per a search summary of dorahacks.io/hackathon/arc-microgrants; the page itself returned 405): 20 grants of 500 USDC; "Promise counts for more than traction"; judged on "relevance to Arc, technical credibility, the quality of what you built, and whether the project is worth taking further"; testnet-only builds are ineligible; decisions by Oct 21.
- **Arc docs** (docs.arc.io/llms.txt): App Kit Send, Bridge (CCTP), and Unified Balance (Gateway); `/build/agentic-economy.md` covers ERC-8004, ERC-8183 and "Circle Nanopayments and the x402 protocol".
- **Circle Modular Wallets skill** (github.com/circlefin/skills/.../use-modular-wallets): "passkey authentication", "gasless transactions via Circle Gas Station paymaster", "end users should custody their own keys". It lists Arc, Arbitrum and Avalanche. Mainnet needs "a configured Gas Station paymaster policy in Circle Console".
- **Tempo** (tempo.xyz/developers): "Passkey Accounts", "Fee Sponsorship: Enable gasless transactions", and "Machine Payments Protocol (MPP)… charge for APIs, MCP tools". MPP pays over HTTP 402; the TypeScript SDK is `mppx`.
- **x402:** CoinDesk (2026-07-15) reports "75 million transactions totaling $24 million over the past 30 days". I found no x402 charity or donation product, so that space looks open (unverified).
- **Arbitrum Dubai** (arbitrum-dubai.hackquest.io): "ONLINE", "3 Week Buildathon", "30,000 USD". The judging criteria say "Announcing Soon". openhouse.arbitrum.io returned 403. One search result said the Dubai edition was "postponed", which conflicts with the HackQuest page (**unknown, check before planning around it**). Open House events are generally judged on "smart contract quality, product-market fit, innovation… solves a real problem" (dev.to/arbitrum).
- **Team1 Avalanche** (per search summaries): Mini Grants "up to $10K", with heavy weight on being "committed to Avalanche for the long haul". Criteria are not on build.avax.network (**unknown**).
- **MiCA** (search summary): Art. 3(1)(17) defines custody as "safekeeping… or the means of access thereto… on behalf of clients". Non-custodial wallets, where the provider does not control the keys, are not covered. Sources: cms.law, esma.europa.eu Q&A 2417.

## Legal flags that apply to every idea
1. The 1 USDC payout goes to "a shelter wallet that Token Tails holds until handover". Once public donations reach a wallet whose keys Token Tails controls, that may count as custody on behalf of a client. **Hand the wallet over (or have the shelter create its own) before opening donations to the public.**
2. The repo already creates a **custodial Stellar keypair for every user** (`docs/BACKEND.md:105`, weakly encrypted per `docs/BACKEND.md:330`). This is a known issue that exists today. It is not a reason to reuse that wallet for any new idea; all new flows should be non-custodial.
3. ShelterSplit has `Swept` and `NativeSwept` (`funding/framework/tracks/a-build/shelter-split/src/ShelterSplit.sol:42,56`). The pass-through design means the contract should normally hold nothing. Say so publicly and show the balance as zero.

## Scores
Scale is 0 to 5. The hours are my estimates, not measurements. "AI h" is agent build time and "Human h" is review, mainnet testing, outreach and legal.

| # | Idea | Win-odds lift (Arc / Colosseum / Dubai / Team1 / Circle) | New programs | AI h | Human h | Risk | Fit | **Total** |
|---|---|---|---|---|---|---|---|---|
| 1 | **ShelterSplit Rail: open SDK and `<script>` donate widget with passkey, gas-free, non-custodial wallet (Modular Wallets on Arc/Arb/Avax, Tempo passkey)**, used first in the Heist win screen and on `/shelter-payouts` | 4 / 5 (8d, 8e, Public Goods, Tempo, Arbitrum) / 4 / 4 / 5 | Circle P2P category, Gitcoin-style public-goods rounds (unverified) | 20-30 | 8-12 | Low (user signs every payment) | 5 | **4.6** |
| 2 | **Agentic donations:** a pay-per-call "rescue" API/MCP tool whose `payTo` is ShelterSplit; MPP on Tempo, x402/Nanopayments on Arc. "Every agent call feeds a cat" | 3 / 4 (Tempo novelty) / 2 / 2 / 5 (named category) | Circle agentic category, Tempo ecosystem | 14-20 | 4-6 | Low-medium (Nanopayments minimums and settlement unknown) | 3 | **3.9** |
| 3 | **Seasonal rescue campaign with a public on-chain goal meter** (e.g. a winter season in the Heist, meter read from events) | 2 / 2 / 5 (users, traction) / 3 / 3 | none new | 6-10 | 10-20 (promotion) | Low; the goal must not be misleading | 5 | **3.6** |
| 4 | **Sponsor-matched rescues:** a MatchPool contract where a brand escrows USDC, auto-matches each `donate` up to a cap, and gets unused funds back only to itself | 2 / 3 / 4 / 3 / 3 | CSR sponsors (a source of income, not a grant) | 10-14 | 15-30 (sales) | Medium: the owner must not be able to redirect sponsor funds | 4 | **3.3** |
| 5 | **Rescue receipts:** a soulbound badge minted in the same transaction as `donate`, non-transferable and never sold | 2 / 3 / 3 / 2 / 2 | none | 6-8 | 2-3 | Low; it must never be sold or given a price | 4 | **3.0** |
| 6 | **Shelter onboarding and verification registry** with public profiles (from the existing `shelters` model in `docs/DATA_MODEL.md:128`), shelter-owned wallets, attestations | 2 / 2 / 2 / 3 / 3 | Needed later to scale any idea | 12-16 | 20-40 (KYB, outreach) | Medium: organisation data only, no staff personal data | 5 | **3.0** |
| 7 | **Cross-chain donate via CCTP / Gateway** (Arc App Kit Bridge: donate from any chain, the shelter receives on its chosen chain) | 3 / 2 / 2 / 2 / 4 | none | 10-14 | 3-5 | Medium (bridge failure recovery) | 3 | **2.9** |
| 8 | **Cat Yard of real rescued cats** (the Heist already has a yard scene, `catnip-heist/perf/ref/yard.png`), each cat linked to its shelter's payouts | 1 / 2 / 3 / 1 / 1 | none | 8-12 | 10-20 (shelter content and consent) | Low-medium (image rights) | 5 | **2.6** |
| 9 | **Stripe round-up:** Token Tails converts its own share of Stripe revenue to USDC and calls `disburse`, published on-chain | 1 / 1 / 2 / 1 / 2 | none | 4-6 | 6-10 (USDC source, accounting) | Medium: charity-claim accuracy; the Lithuanian tax treatment is **unknown**; no user funds are held | 3 | **2.1** |
| 10 | **Link the existing Stellar NFTs to shelter payouts** | 0 / 1 / 0 / 0 / 0 | Stellar programs (excluded: SCF) | 8-12 | 4 | High: builds on the custodial Stellar wallets | 3 | **1.2** |

## Top 3 and timeline
**Pick 1: the ShelterSplit Rail widget.** This is the "bigger thing" and it also fixes the missing wallet interaction.
- Heist players can pay from their own wallet (question 1).
- It hits Colosseum criteria 8(d) and 8(e), the Public Goods award and the Tempo track.
- The same deployment qualifies for the Arbitrum track.
- It gives Circle, Team1 and Dubai a measurable number: how many other apps have embedded the widget.

**Pick 2: agentic donations over MPP and x402.** This is the only idea that matches a named Circle 2026 category, and I found no existing x402 donation product.

**Pick 3: a seasonal campaign with an on-chain goal meter, plus optional sponsor matching.** It is the traction engine for Dubai and Team1. The campaign can add rescue receipts (#5) at little cost.

| Dates | Work |
|---|---|
| Oct 1-2 | Mainnet deploy (already planned). Confirm the shelter-wallet handover plan. Set up the Circle Console Gas Station policy on Arc. |
| Oct 2-6 | Widget v0 on Arc: passkey wallet, sponsored gas, `donate` with USDC as native coin. Embed it on the Heist win screen and `/shelter-payouts`. **Submit to Arc on Oct 7.** |
| Oct 7-11 | Tempo passkey and fee-sponsored path with `disburseWithMemo`. MPP donate endpoint (`mppx`). Open-source the widget and SDK with docs. Arbitrum build. |
| Oct 12 | **Colosseum submission** (Tempo track, Public Goods, Arbitrum if multi-track entry is allowed). |
| Oct 13-21 | Anitya jam build uses the widget. x402/Nanopayments on Arc. Arc decision arrives by Oct 21. |
| Late Oct | Circle grant application, milestones: widget adopters, agent-donation volume, shelter handovers. Team1 Mini Grant with the Avalanche deployment. |
| Nov | Seasonal campaign and goal meter go live. Sponsor-match pilot if a sponsor signs. Dubai buildathon (confirm dates and status first). |

## Unknowns to check
- Colosseum: whether multi-track entry is allowed, and the exact "work done during the hackathon" wording.
- Arc: the Gas Station mainnet policy, its cost, and its limits.
- Circle Nanopayments: minimum amounts and whether funds can go to a contract address.
- Arbitrum Dubai: whether it is postponed, and its judging criteria.
- Team1: the official criteria.
- Tax treatment of round-ups for a Lithuanian MB.
- Whether any shelter will accept its own wallet by Oct 7.

## Scope
Your message also asked about Heist visibility and whether to use catnip.tokentails.com. This task only covered question 4, so neither is answered here. The one point that bears on the subdomain: the widget is served from the main site, and embedding it on the Heist win screen works on either host.

## Evidence
- Program pages: circle.com/grants; colosseum.com/worldsfair and the rules PDF; tempo.xyz/developers and its `machine-payments` guide; docs.arc.io/llms.txt and `/build/agentic-economy.md`; the circlefin skills `use-modular-wallets` and `use-gateway`; arbitrum-dubai.hackquest.io; build.avax.network/grants/team1-mini-grants.
- Repo files in /Users/zygimantasbagdzevicius/me/tokentails-app:
  - `funding/framework/tracks/a-build/shelter-split/src/ShelterSplit.sol`
  - `client/components/shelter-payouts/`
  - `docs/BACKEND.md`
  - `docs/DATA_MODEL.md`
  - `client/package.json`: it has Stellar Wallets Kit and Stripe but no EVM wallet library.