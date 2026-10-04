# Direct donations: status (2026-10-04)

Branch `feat/funding-winning-strategy`, uncommitted, nothing deployed or pushed. No `.env*` read, no
real key used (anvil dev keys only), `deployments.json` and `router-deployments.json` untouched.

## Why this portfolio

We compared direct giving through the contract against streaming (Superfluid), quadratic funding,
soulbound receipts, cosmetics for donations, fiat on-ramp and CCTP, and proof-of-spend anchoring.
Direct giving wins on custody safety, build risk before Oct 7, and lift across the most submissions:
- **Arc:** "USDC is both the gas and the gift".
- **Colosseum:** 8(d) UX and 8(e) composability, plus the Base and Arbitrum tracks and Public Goods.
- **x402 grant:** the standard `exact` scheme.
- **Tameion:** contract-level spending limits.
- **Monad and Dubai:** reuse.

The other ideas were dropped or deferred: they don't work on Arc or Tempo (streaming), mean nothing
with one shelter (quadratic funding), carry legal risk (cosmetics), or can't be built before the
deadlines.

Custody rule for every path: public money moves donor → DonateRouter → ShelterSplit → shelter wallet,
or donor → shelter wallet. Until Pink Paw holds its own key, every mainnet public path stays off:
- the client checks `campaign.shelter.handover`;
- the backend checks `SHELTER_HANDED_OVER`;
- the backend refuses any wallet in `TOKEN_TAILS_HELD_WALLETS` / `SHELTER_HELD_WALLETS`.

## Features

| ID | What a user sees | Main files |
|---|---|---|
| F1 | DonateRouter: no owner. The donor's EIP-3009 signature binds router, memo, salt and the payout list. Reverts `RecipientsChanged` / `TreasuryShare`. Native path on Arc, `flush` for stray transfers | `funding/framework/tracks/a-build/shelter-split/src/DonateRouter.sol`, `script/DeployDonateRouter.s.sol`, `test/DonateRouter*.t.sol`, `router/lib.mjs`, `fund router plan`, `fund shelter rotate`, facts P-002, P-003, C-008, L-match |
| F2 | Gasless relay (`POST /shelter/relay`), Token Tails 1:1 on-chain match from its own money (`GET /shelter/match/status`), shelter wallet claim (`POST/GET /shelter/claim`), and per-source attribution in the impact ledger | `backend/src/shelter/onchain/shelter-relay.service.ts`, `shelter-match.service.ts`, `shelter-claim.service.ts`, `donate-router.ts`, `impact/shelter-logs.ts` |
| F3 | Wallet giving gated on the handover (one signature, or Arc native). A testnet "try it live" block labelled "test USDC, no real money", with a network picker. Onboarding page `/shelter-payouts/onboard`. The receipt pairs a gift with its match ("1 became 2") | `client/components/shelter-payouts/WalletDonate.tsx`, `giveMode.ts`, `wallet.ts`, `calldata.ts`, `routers.ts`, `ShelterOnboard.tsx`, `pages/shelter-payouts/onboard.tsx`, `client/e2e/wallet-donate.spec.ts` |
| F4 | Standard x402 `exact` with `payTo` = the shelter's own wallet; the facilitator pays the gas. The shelter-rail SDK and widget gain gasless giving | `backend/src/shelter/onchain/x402-exact.ts`, `shelter-x402.service.ts`, `shelter-rail/src/sdk.mjs`, `shelter-rail/src/widget.js` (copy in `client/public/rail/`), `client/public/rail/demo.html` |
| F5 | Treat agent: Claude decides, and CappedSpender caps each gift and each UTC day on-chain. The over-cap refusal is shown on-chain. Submission notes per program | `shelter-split/src/CappedSpender.sol`, `tracks/a-build/treat-agent/`, `applications/*/notes/donate-rail-2026-10-04.md` |

## E2E (local Arc testnet fork, `tracks/a-build/e2e-donate/stack.sh all`)

All 13 flows pass:
- payouts page;
- gasless gift;
- match;
- native gift;
- shelter claim;
- direct gift after a simulated handover;
- sponsored treat (a second treat the same day gets 429);
- x402 on-chain receipt;
- x402 `exact`;
- third-party widget;
- treat agent, including the on-chain over-cap refusal;
- chain-read payout feed;
- impact ledger.

The run found one bug, now fixed: two hot-wallet sends close together reused a nonce. The fix is
`cacheTimeout: -1` in `shelter-chain.ts`.

Screenshots: `/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/5b2edd56-881c-4754-b42e-7d5561832e7b/scratchpad/donate/e2e/`.

## Checks (2026-10-04, final run)

| Check | Result |
|---|---|
| `forge test` | 149 passed |
| funding framework | 421 passed; router lib 10; treat-agent 29; `fund facts gate` ok |
| shelter-rail | 42 passed |
| backend | lint clean, build ok, 1483 passed / 47 skipped |
| client | tsc clean, eslint on changed files clean, 2408 passed, `npm run build` ok |
| catnip-heist | tsc clean, 531 passed |
| copy-lint | 0 findings in 747 files; its own tests 83 passed |

`fund check --all`: 15 of 16 pass. Arbitrum Singapore fails only on "deadline passed".

## Open issues

1. `flush()` forwards the router's whole balance. A three-way split with rounding dust makes every
   flush revert. Add `flush(memo, amount)` before the first router deploy.
2. The campaign meter does not refresh after a wallet gift until the page reloads.
3. Treat-agent gifts count under "Other payouts" on the impact page.
4. Only one gift per transaction is matched (errs low).
5. The rail README says ShelterSplit "keeps no balance, nothing to withdraw", but the owner has
   `sweep` and `sweepNative` for stray transfers.
6. `fund router plan` step 4 says to set `router_guard` verified after a testnet deploy. The fact's
   note says to verify it only after the handover; follow the fact note.

## Founder steps

The dated steps are in the CLAUDE.md funding tracker, rows from Oct 5 to Oct 13, including gate G2b.
