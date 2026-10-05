# Direct donations: status (2026-10-04, updated 2026-10-05)

Branch `feat/funding-winning-strategy`, uncommitted, nothing deployed or pushed. No `.env*` read, no
real key used (anvil dev keys only), `deployments.json` and `router-deployments.json` untouched.

## Update 2026-10-05

What changed since the snapshot below (it is kept as written on 2026-10-04):
- The work is committed on the branch. Testnet ShelterSplits are deployed and verified on all seven
  chains (Arc, Tempo, Arbitrum, Avalanche, Base, Robinhood Chain, Monad), plus EURC splits on Arc and
  Avalanche, and seven testnet DonateRouters (none on Tempo or Robinhood Chain: no EIP-3009). Records:
  `funding/framework/tracks/a-build/deployments.json` and `router-deployments.json`.
- `fund a:ingest` / `fund a:backend-deployments` generate the backend's public config
  `backend/src/shelter/onchain/wallet.config.ts`. The backend needs only `SHELTER_CHAIN_ID` and
  `SHELTER_DONATE_PRIVATE_KEY`; treats and x402 are on by default.
- The backend's mainnet gate is now per chain: relay, match and the x402 `onchain-receipt` offer open
  on a mainnet chain only when every wallet its split pays has signed the shelter claim (the v2 message
  can name several chains) and was rotated in on-chain. `SHELTER_HANDED_OVER=false` is the kill switch
  that closes them everywhere; x402 `exact` on mainnet still needs `SHELTER_HANDED_OVER=true`. The
  client still checks `campaign.shelter.handover`.
- Mainnet: nothing deployed yet. One wallet funds the wave (`funding-plan.json`, minimal profile, about
  $7.25; `PLAN=topup` for one week of float later). `fund a:distribute` and `fund a:mainnet-plan` write
  `wave/mainnet-all.sh`, which a person runs with `CONFIRM_MAINNET=yes` (it refuses in AI sessions).
  Routers deploy by default; proof payouts are 0.1 token; EURC is on Arc only; the treasury is
  `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A`.
- Open issue 1 (`flush` and rounding dust) is still open; it now applies to the mainnet router deploy.
  Open issue 5 is fixed (docs, 2026-10-05).
- Checks on 2026-10-05: `forge test` 149 passed; shelter-rail 62 passed; treat-agent 28 of 29 (the
  observe test expects a 90 USDC goal, while `campaign.json` now holds 50,000).

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

## E2E: checkout on two chains and the goal meter (`tracks/a-build/e2e-pay-goal/stack.sh all`)

Two local anvil chains (31337, and an empty chain started with the Arc testnet id 5042002), test tokens,
throwaway Mongo; `E2E_UI=1` adds 7 client flows with screens at 1440x900 and 390x844. All 24 API flows
and 7 UI flows pass (2026-10-04):
- packs in USDC and EURC on both chains, each granted once (5 parallel replays, 4 parallel first
  confirms, a hash claimed on the other chain);
- a $5 shelter cat before the handover (treasury, keeper share 2.50 to the held wallet, custodial) and
  after it (approve + disburse into the split, 5 to the shelter's own wallet, shelter-held);
- the handover: split rotated, held wallet swept; the goal recounts both wallets and counts the sweep once;
- goal after every move: shop shares and gifts count, packs and spending do not;
- receipts, `orders` rows (one per tx) and `shelterpayoutevents` rows (one per share and gift).

The run found one bug, now fixed: a share sent to the held wallet just before the handover and settled
after it was labelled `onchain-shelter-held` (the keeper now reads the paid wallet from the receipt).
Not reproducible on anvil: Arc's native USDC and its `0xff…fe` system log, so treats are not counted
there (unit-tested in `shelter-goal.spec.ts`). Screens:
`/private/tmp/claude-501/-Users-zygimantasbagdzevicius-me-tokentails-app/5b2edd56-881c-4754-b42e-7d5561832e7b/scratchpad/pay/e2e/`.

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
2. ~~The campaign meter does not refresh after a wallet gift until the page reloads.~~ Fixed 2026-10-04: the meter reads the count live, every minute and on `GOAL_REFRESH_EVENT` after a gift.
7. ~~The goal meter read the held wallet's balance, so it would never count gifts after the handover (new wallet) and would fall when Pink Paw spends.~~ Fixed 2026-10-04 (review): `GET /shelter/goal/C-001` sums the USDC Transfer logs into `campaign.wallets` (each in its block range, wallet-to-wallet sweeps skipped), and the meter and the Heist read it. The copy names only `liveSources` (today: sponsored treats). The handover is a facts edit (`campaign.rotation`), no Heist rebuild. The cursor (`sheltergoalcursors`) rescans from the start when the wallet set changes: a few hundred RPC windows, paced, a few minutes.
8. ~~The gallery counted the storefront's newest 200 Pink Paw cats as the shelter's totals (local data: 102 at the shelter, 95 adopted).~~ Fixed 2026-10-04: `GET /shelter/rozine-pedute/gallery` is uncapped (local data: 104 at the shelter, 352 adopted); the web gallery and the Heist read it, and the storefront fallback says "of the newest".
9. The goal's "Token Tails adds at most 374 USDC" uses the code-default treat and match caps. If production raises `SHELTER_DONATE_DAILY_BUDGET_WEI` or the match pool, update C-001 (`goal.tokenTails`) and CLAIMS.md.
10. Flagged, not changed (another session's edit): `WalletDonate.tsx`'s custody guard no longer checks `c.chainId === chainId`; it still re-reads the payout list on the chain in use. The owner should confirm this is intended.
3. Treat-agent gifts count under "Other payouts" on the impact page.
4. Only one gift per transaction is matched (errs low).
5. ~~The rail README says ShelterSplit "keeps no balance, nothing to withdraw", but the owner has
   `sweep` and `sweepNative` for stray transfers.~~ Fixed 2026-10-05 (docs): the README now names
   `sweep` and `sweepNative`.
6. `fund router plan` step 4 says to set `router_guard` verified after a testnet deploy. The fact's
   note says to verify it only after the handover; follow the fact note.

## Founder steps

The dated steps are in the CLAUDE.md funding tracker, rows from Oct 5 to Oct 13, including gate G2b.
