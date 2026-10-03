# Answers — x402 Foundation impact micro-grant

One `### <field id>` per field. Cite every number with [F-###] (citations are stripped from the
paste sheet). Drafted 2026-10-02 for the state AFTER the Oct 12-14 build: standard x402 `exact`
scheme through a facilitator, live on mainnet. Nothing here is true yet; do not post before the
build is live and the placeholders are filled. Placeholders (single braces): {X402_URL} the paid
endpoint, {PAY_TX} the first agent payment on mainnet, {VIDEO_URL} the uploaded video,
{X402_CHAIN} the mainnet the facilitator settles on.

### issue_title

Grant request: ShelterSplit, x402 payments that pay animal shelters on {X402_CHAIN}

### issue_body

**What it is.** Token Tails is a cat-rescue game live on web, iOS and Android [F-015] [F-016]. We built ShelterSplit, an open MIT payout rail: one contract call splits a USDC payment across registered animal shelters and emits a public event per payout. Now any AI agent can pay it through x402.

**What x402 unlocks.** {X402_URL} sells a shelter cat card (a real cat's story and portrait) for a small USDC price, using the standard `exact` scheme through a facilitator. The payment is split on-chain between the shelter and the treasury. It is new demand for shelters: agents and apps that would never set up a bank donation can now pay a shelter in one HTTP request. First mainnet payment: {PAY_TX}.

**Live on mainnet.** Endpoint {X402_URL}; contract and payouts listed at https://tokentails.com/shelter-payouts; source at https://github.com/zbagdzevicius/tokentails (MIT, Foundry tests).

**Disclosure.** The first shelter is Pink Paw (Rožinė pėdutė). Its receiving wallet is held by Token Tails on behalf of the shelter until handover; every payout into it is public.

**What the grant pays for.** Onboarding the next shelters with wallets they hold themselves, a facilitator-backed x402 example in our open SDK (ShelterSplit Rail), and a public dashboard of agent payments per shelter.

**Video (2 min):** {VIDEO_URL}

### x_post

An AI agent just paid an animal shelter over x402. One HTTP request, USDC split on-chain by ShelterSplit, public receipt. Live on {X402_CHAIN}, MIT. @coinbaseDev {VIDEO_URL}

### video_script

Shot 1, terminal: "This is an AI agent with a small USDC budget. It asks Token Tails for a shelter cat card."
Shot 2, the 402 answer: "The server answers 402 Payment Required, with a price in USDC. This is standard x402, the exact scheme, through a facilitator."
Shot 3, the agent pays: "The agent signs the payment and retries. The facilitator settles it on {X402_CHAIN}."
Shot 4, the card: "The agent gets the cat card: a real shelter cat's story and portrait."
Shot 5, the explorer: "On-chain, ShelterSplit split that payment. The shelter's share went straight to its registered wallet, with a public event."
Shot 6, the payouts page: "Every payout is listed on tokentails.com/shelter-payouts. The first shelter is Pink Paw; Token Tails holds its wallet until handover, and says so on the page."
Shot 7, close: "ShelterSplit is open source under MIT. Any agent or app can pay a shelter in one request. That is new demand for shelters that never had a payments integration."
