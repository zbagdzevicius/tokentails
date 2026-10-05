# Answers — x402 Foundation impact micro-grant

One `### <field id>` per field. Cite every number with [F-###] (citations are stripped from the
paste sheet). Drafted 2026-10-02 for the state AFTER the Oct 12-14 build: standard x402 `exact`
scheme through a facilitator, live on mainnet. Nothing here is true yet; do not post before the
build is live and the placeholders are filled. Updated 2026-10-04: with `exact`, payTo is the shelter's own wallet (backend `x402-exact.ts`), so nothing is split and nothing reaches a treasury; mainnet is gated on `SHELTER_HANDED_OVER`. Shot 6 and the disclosure assume the handover is done: re-check before posting. Placeholders (single braces): {X402_URL} the paid
endpoint, {PAY_TX} the first agent payment on mainnet, {VIDEO_URL} the uploaded video,
{X402_CHAIN} the mainnet the facilitator settles on.

### issue_title

Grant request: ShelterSplit, x402 payments that pay animal shelters on {X402_CHAIN}

### issue_body

**What it is.** Token Tails is a cat-rescue game live on web, iOS and Android [F-015] [F-016]. We built ShelterSplit, an open MIT payout rail: one contract call splits a USDC payment across registered animal shelters and emits a public event per payout. Now any AI agent can pay it through x402.

**What x402 unlocks.** {X402_URL} sells a shelter cat card (a real cat's story and portrait) for a small USDC price, using the standard `exact` scheme through a facilitator. `payTo` is the shelter's own wallet: the agent signs one EIP-3009 transfer straight to the shelter, the facilitator submits it and pays the gas, and Token Tails never holds or relays the money. It is new demand for shelters: agents and apps that would never set up a bank donation can now pay a shelter with one request, a 402 and one paid retry. First mainnet payment: {PAY_TX}.

**Live on mainnet.** Endpoint {X402_URL}; contract and payouts listed at https://tokentails.com/shelter-payouts; source at https://github.com/zbagdzevicius/tokentails (MIT, Foundry tests).

**Disclosure.** The first shelter is Pink Paw (Rožinė pėdutė). x402 payments on mainnet open only after Pink Paw holds its own wallet key (the backend refuses a wallet Token Tails holds as `payTo`); earlier ShelterSplit payouts went to a wallet Token Tails held for the shelter, and every payout is public.

**What the grant pays for.** Onboarding the next shelters with wallets they hold themselves, a facilitator-backed x402 example in our open SDK (ShelterSplit Rail), and a public dashboard of agent payments per shelter.

**Video (2 min):** {VIDEO_URL}

### x_post

An AI agent just paid an animal shelter over x402. One request, a 402, one paid retry: USDC straight to the shelter's own wallet, public receipt. Live on {X402_CHAIN}, MIT. @coinbaseDev {VIDEO_URL}

### video_script

Shot 1, terminal: "This is an AI agent with a small USDC budget. It asks Token Tails for a shelter cat card."
Shot 2, the 402 answer: "The server answers 402 Payment Required, with a price in USDC. This is standard x402, the exact scheme, through a facilitator."
Shot 3, the agent pays: "The agent signs the payment and retries. The facilitator settles it on {X402_CHAIN}."
Shot 4, the card: "The agent gets the cat card: a real shelter cat's story and portrait."
Shot 5, the explorer: "On-chain, one USDC transfer from the agent to the shelter's own wallet. The facilitator paid the gas; Token Tails never touched the money."
Shot 6, the payouts page: "Every payout is listed on tokentails.com/shelter-payouts. The first shelter is Pink Paw, and it holds its own wallet key."
Shot 7, close: "ShelterSplit is open source under MIT. Any agent or app can pay a shelter with one request and one paid retry. That is new demand for shelters that never had a payments integration."
