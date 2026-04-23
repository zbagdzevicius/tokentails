# Token Tails Settlement Rail — Technical Architecture

## Overview

Token Tails Settlement Rail (TTSR) is a Stellar-native settlement and disbursement backend shared by a family of consumer iOS apps and their companion web clients. It is implemented as a single NestJS API serving multiple bundle IDs, with a configuration-driven routing layer that resolves each bundle to its own entitlement namespace, IAP product catalog, and payout policy without per-app code branches.

The rail handles three core responsibilities: converting App Store purchases into verified entitlement state, gating user-initiated transfer intents behind that state, and executing Stellar settlements/disbursements through an orchestrated state machine with idempotency, reconciliation, and audit-grade proof export.

Client apps ship as Capacitor-wrapped React builds for iOS plus standalone companion websites. Both share the same backend contract.

## Stellar Integration Plan

TTSR is an **Integration Track** project. Every settlement and disbursement handled by the rail is executed on Stellar; no off-Stellar settlement paths exist for this scope. This section is the consolidated view of how TTSR integrates with the Stellar network and its ecosystem building blocks.

### Stellar Building Blocks in Use

| Building Block | Role | Integration Point |
|---|---|---|
| Stellar Wallets Kit | Client-side wallet authorization and transaction signing | React client (iOS via Capacitor + companion web) through `@creit.tech/stellar-wallets-kit` |
| Stellar Disbursement Platform (SDP) | Server-side orchestration of recipient-side disbursements (batched, managed, anchored) | `sdp-adapter` module on backend; HTTP API + webhook callbacks |
| Bridge | Regulated fiat-on/off-ramp corridor activation for partner recipients | `bridge-adapter` module on backend; API access, KYB already cleared |
| Horizon API | Canonical source for transaction status and account state | Read-through adapter called by `ledger-reconciliation` and `sdp-adapter` for status confirmation |
| Existing Stellar mainnet account | Historical on-chain footprint: contract `CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF` with `1,216,594` cumulative tx | Read-only reference for prior traction; new settlement flows do not modify this contract |
| stellarchain.io / stellar.expert | Reviewer-facing transaction verification | Referenced in evidence bundles; every tx hash links to the explorer |

### Network Selection

- **Testnet phase** (development, T1 deliverables, T2 rehearsal): Horizon URL `https://horizon-testnet.stellar.org`, passphrase `Test SDF Network ; September 2015`. Test accounts funded via Friendbot.
- **Mainnet phase** (T2 dual-mode rehearsal with small-value ≤ `$1` settlements, T3 production launch): Horizon URL `https://horizon.stellar.org`, passphrase `Public Global Stellar Network ; September 2015`.
- Network selection is driven by the `STELLAR_NETWORK` environment variable (`testnet` | `mainnet`). Passphrase, Horizon URL, and SDP tenant URL are all derived from this single switch. No `if (testnet) { ... }` branches exist in business logic.

### Settlement Asset Strategy

- **Primary settlement asset**: USDC issued on Stellar by Circle (issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`).
- **Fee and reserve asset**: XLM (native) — required for Stellar operation fees and base account reserves.
- **Trustline handling**: recipient Stellar accounts must hold a USDC trustline before first disbursement. Partner-activation flow prompts trustline creation via Wallets Kit before the partner's first payout; missing-trustline detection blocks disbursement and surfaces a specific error to the partner admin.
- **No custom-issued Token Tails asset** is introduced. Settlement uses direct Stellar payment operations over USDC; this keeps the rail compatible with existing anchor and off-ramp infrastructure.

### Stellar Wallets Kit Integration

- SDK: `@creit.tech/stellar-wallets-kit`, client-side only, integrated into both the Capacitor-wrapped iOS client and the companion web client.
- Supported wallets at launch: Freighter, Albedo, xBull, Lobstr, Rabet. Hana Wallet (Passkey-based) added for iOS where native extension wallets are unavailable.
- Client signing flow:
  1. User initiates a support action; client calls `POST /v1/transfers` with `idempotency_key` + product context.
  2. Backend builds the transaction XDR (see Transaction Construction below) and returns it to the client as part of the transfer intent response.
  3. `wallet-adapter` on the client initializes Wallets Kit using the active `STELLAR_NETWORK`.
  4. Wallet selection UI renders; selection is remembered per device in local storage.
  5. User approves in the selected wallet; Wallets Kit returns the signed XDR.
  6. Client posts signed XDR back to the backend; `sdp-adapter` submits to Horizon / SDP.
- **Non-custodial guarantee**: seed material and signing keys never leave the user's device. Backend has no access to user keypairs at any point.

### Stellar Disbursement Platform (SDP) Integration

- Token Tails operates the **Anchor/Tenant side** of the SDP deployment; SDP hosts the disbursement orchestration for recipient flows.
- Asset configured in SDP: USDC on Stellar (issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`).
- Recipient registration: shelters and partners are registered as SDP recipients via the admin API during the `compliance_review` → `approved` stage transition (see Partner Lifecycle). Recipient verification uses email + wallet-address confirmation.
- Disbursement creation flow:
  1. Backend posts `POST /disbursements` to SDP with recipient list, asset, and amount.
  2. SDP returns a `disbursement_id`; backend binds this to the originating `transfer_intent` row.
  3. Batching: multiple recipient disbursements can be grouped under a single SDP disbursement for fee efficiency.
  4. SDP webhook callbacks drive status transitions: `pending_signature` → `signed` → `pending_anchor` → `paid` → `complete`.
- **Independent Horizon cross-check**: `ledger-reconciliation` queries Horizon directly for final tx confirmation on each SDP disbursement. This detects webhook loss or delayed delivery, and it binds every settled disbursement to a canonical `tx_hash` on chain regardless of SDP delivery semantics.

### Bridge Integration

- Purpose: regulated fiat on/off-ramp corridor for partner recipients who require payout in local fiat rather than on-chain USDC.
- **KYB status: already cleared** as of submission date. Corridor activation is a scheduled implementation task (`T3-D2`), not a compliance or onboarding dependency.
- Integration path: Bridge provides an API for creating fiat payout requests tied to Stellar USDC inflows. `bridge-adapter` submits USDC payments via SDP to a Bridge-owned Stellar address; Bridge executes the fiat leg and confirms delivery.
- **Routing decision**: each bundle's `payoutProfile` in `IAP_BUNDLE_CONFIG` determines whether a partner's transfer routes through Bridge (fiat off-ramp) or stays on the SDP-direct USDC path. Both paths emit an identical evidence schema, so downstream consumers of reconciliation exports do not branch on corridor vs direct.
- Settlement semantics: from the rail's perspective, a Bridge-routed transfer is a standard SDP USDC disbursement — the corridor logic is entirely within Bridge's hosted stack.
- Reconciliation: Bridge webhooks confirm the fiat leg; `ledger-reconciliation` binds this confirmation to the originating `transfer_intent` ID and the Stellar `tx_hash` of the USDC inflow.
- Failure handling: if Bridge rejects a corridor payment (compliance hold, recipient data mismatch), `bridge-adapter` reverses the upstream USDC disbursement via SDP, the intent state machine transitions to `rejected_corridor`, and a specific error is surfaced to the partner admin surface.

### Transaction Construction and Submission

- Transactions are built server-side using `@stellar/stellar-sdk`:
  1. Fetch recipient account via Horizon `GET /accounts/{id}`; detect missing trustline, inactive account, and insufficient reserve.
  2. Build `TransactionBuilder` with the correct network passphrase and an **adaptive base fee** sourced from Horizon `GET /fee_stats` (uses 90th-percentile fee with a configurable minimum floor).
  3. Add `Payment` or `PathPaymentStrictReceive` operation(s) depending on asset match; disbursement batches pack up to `100` operations per transaction (Stellar protocol limit).
  4. Set `timeBounds` to `[now, now + 300s]` to prevent replay if submission is delayed.
  5. Serialize to XDR and sign via Wallets Kit (user-signed operations) or the Anchor keypair (server-signed operations for the SDP tenant side).
- Submission: signed XDR is submitted via SDP, which forwards to Horizon. Parallel Horizon read-through verification reduces reliance on webhook delivery semantics.

### Stellar-Specific Failure Modes and Handling

| Failure | Detection | Handling |
|---|---|---|
| Recipient missing USDC trustline | Horizon `GET /accounts/{id}` before tx build | Pause disbursement, surface trustline-required error to partner admin, prompt trustline creation via Wallets Kit on next partner session. |
| Insufficient source balance for operation + base reserve | Horizon account balance check | Alert ops; intent parks in `authorization_obtained` state until fund-up; no silent failure. |
| Sequence number collision (`tx_bad_seq`) | Horizon submission error code | Refresh sequence number, rebuild transaction, retry once; second collision triggers reconciliation review. |
| Horizon rate limiting (HTTP `429`) | Response status | Exponential backoff with jitter; fallback to a secondary Horizon endpoint when configured (`HORIZON_URL_FALLBACK`). |
| Transaction `timeBounds` expired (`tx_too_late`) | Horizon submission error code | Mark intent failed, return specific error to client for explicit user retry with fresh XDR. |
| Operation limit exceeded | Pre-submission validation (max `100` ops/tx) | Split disbursement across multiple transactions while preserving a single SDP `disbursement_id` for reconciliation. |
| Asset path unavailable for path payment (`op_too_few_offers`) | Horizon submission error code | Fall back to direct `Payment` operation with USDC; surface conversion error to admin if alternate path also fails. |
| Network passphrase mismatch | Pre-submission XDR inspection | Reject immediately; log as a deployment configuration error (should never occur in correctly deployed envs). |

### On-chain Observability (Reviewer-Accessible)

- Every settled settlement/disbursement writes its `tx_hash` and `network` to the `settlements` / `disbursements` collections.
- Evidence bundles include a `tx-hashes.csv` file where each row is a direct explorer link (`https://stellarchain.io/transactions/{tx_hash}` or `https://stellar.expert/explorer/public/tx/{tx_hash}`) for reviewer one-click verification.
- The existing Token Tails mainnet contract (`CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF`) and public on-chain dashboard (`https://dune.com/token_tails/token-tails`) serve as historical reference; TTSR does not modify or redeploy this contract.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | NestJS 10 on Node.js |
| Backend port (dev/prod) | `3006` |
| Database | MongoDB 7 (Docker Compose, port `27017`) |
| Object storage | S3-compatible (DigitalOcean Spaces via `DO_SPACES_*` env vars) |
| Auth | Firebase (header: `accesstoken`, not `Bearer`) |
| Web client | Vite + React 19, dev port `5173`, preview port `4173` |
| State management | Zustand |
| IAP (client) | RevenueCat |
| IAP verification (server) | Apple App Store Server API |
| iOS wrapper | Capacitor 7 |
| Stellar SDK | Stellar Wallets Kit (client), SDP + Bridge SDKs (server) |
| Testing | Vitest (app), Jest/contract tests (backend) |
| Lint | ESLint — `0` warnings enforced |

## High-Level Topology

```
iOS app (Capacitor + React)                  Companion website (Vite + React)
        │                                                │
        ├──── accesstoken ─────────┬────────────────────┤
                                   │
                                   ▼
                    NestJS API  (port 3006)
                    ┌──────────────────────────┐
                    │ auth, apps, iap,         │
                    │ entitlements, events,    │
                    │ user, ledger             │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼───────────────────────┐
              ▼                  ▼                       ▼
         MongoDB 7        External services       Object storage
         (canonical     (Apple Server API,        (DigitalOcean
          state)         Firebase Auth,            Spaces — logs,
                         Stellar SDP,              exports, proof
                         Stellar Bridge,           bundles)
                         RevenueCat webhooks)
```

## Clients

### iOS app (5 products)

- Bundle IDs: `com.tokentails.catwatch.app`, `...cathealth.app`, `...catfood.app`, `...catmeds.app`, `...catfind.app`.
- Built from the same React codebase wrapped with Capacitor 7. Per-app configuration lives in `<app>/config/app-store.config.cjs`.
- Subscriptions handled via StoreKit + RevenueCat SDK. Receipt verification happens server-side.
- Wallet interactions use Stellar Wallets Kit for authorization and signature capture. Keys never leave the user's device.

### Web client

- Landing domains already live: `catwatch.tokentails.com`, `cathealth.tokentails.com`, `catfood.tokentails.com`, `catmeds.tokentails.com`, `catfind.tokentails.com`.
- Thin React client over the same backend as the iOS app. Routes include `/` (onboarding), `/home`, `/paywall`, `/screenshots`, `/reference-screens`.
- Screenshot-automation scenes addressable via `/?screen=<scene_name>` for App Store asset generation.

## Backend

### NestJS bootstrap

- Port `3006`, CORS enabled, Helmet on.
- Body size limit: `10MB` with `rawBody` preserved for Apple receipt signature verification.
- Global `ValidationPipe` with `transform: true` and `whitelist: true`.
- Rate limit: `60 requests / 60 seconds` per client (Nest ThrottlerModule).

### Modules

| Module | Responsibility |
|---|---|
| `auth` | Firebase ID token verification via `accesstoken` header; session context injection. |
| `apps` | Static app catalog + bundle-to-app resolution; IAP product mapping. |
| `iap` | Apple receipt verification, StoreKit notification ingestion, normalized IAP events. |
| `entitlements` | Canonical entitlement state per user/product; refresh endpoints; cached low-latency reads. |
| `events` | Analytics event intake + normalization for downstream tracking. |
| `user` | Profile, onboarding state, preference management. |
| `ledger` | Double-entry value-flow journal; settlement/disbursement ledger writes; reconciliation joins. |

### IAP bundle routing (source of truth)

Configuration lives in `backend/src/apps/iap-bundle-config.ts`, not environment variables. The `IAP_BUNDLE_CONFIG` map binds each bundle ID to:

- `appId` (internal app identifier),
- `products[]` (allowed IAP product IDs for that bundle),
- `verifier` (`'mock'` for local/dev, `'apple'` for production),
- Apple credential set (issuer ID, key ID, signing key).

Unknown bundle IDs are rejected at the gateway. This eliminates per-app code branches.

## Data Model (MongoDB collections)

| Collection | Purpose |
|---|---|
| `users` | Identity (Firebase UID), profile fields, preferences. |
| `accounts` | Product-level account context per `(user, app)` pair. |
| `entitlements` | Active/grace/expired entitlement facts, source receipt references, verification status. |
| `iap_events` | Raw App Store notifications + normalized event records. |
| `transfer_intents` | User-initiated transfer intent with idempotency key and product context. |
| `orchestrator_runs` | State machine run history: initial state, transitions, final state, audit trail. |
| `settlements` | SDP/Bridge execution metadata, external tx references, status. |
| `disbursements` | Recipient-side outcome + tx hash linkage. |
| `ledger_entries` | Double-entry accounting records (debit/credit) for every value movement. |
| `reconciliation_runs` | Scheduled reconciliation run metadata. |
| `reconciliation_issues` | Unmatched ledger/external pairs, delta value, resolution status. |
| `proof_exports` | Immutable evidence bundles with hash + version metadata. |

Indexes: compound on `(user_id, app_id)` for entitlements, on `idempotency_key` for transfer intents, on `(network, tx_hash)` for settlements/disbursements, on `(run_id, status)` for reconciliation issues.

## External Integrations (non-Stellar)

Stellar-side integrations are fully detailed in the **Stellar Integration Plan** above. This table covers the non-Stellar external systems the rail depends on.

| Integration | Use |
|---|---|
| Firebase Auth | User identity; ID tokens verified via `accesstoken` header. |
| Apple App Store Server API | Subscription receipt verification + server-to-server notifications. |
| Apple App Store Server Notifications | Webhook delivery for subscription lifecycle events. |
| RevenueCat | Client-side subscription management + server webhooks for entitlement updates. |
| DigitalOcean Spaces | S3-compatible object storage for evidence bundles, logs, and artifacts. |
| Dune Analytics | Public on-chain metrics dashboard (read-only reviewer reference). |

## Request and Event Flows

### Flow A — Subscription Entitlement Ingestion

1. iOS client completes StoreKit purchase; RevenueCat mirrors the state.
2. Apple sends App Store Server Notification to the `iap` module.
3. `iap` verifies the notification signature (raw body preserved by `rawBody: true`).
4. Event is normalized and written to `iap_events`.
5. `entitlements` module updates canonical state (`active`, `in_grace_period`, `expired`, `revoked`).
6. Entitlement cache/index is refreshed for subsequent low-latency checks.

### Flow B — User Action to Settlement

1. Client sends `POST /v1/transfers` with an `idempotency_key`, product context, and payload.
2. Gateway validates JWT, bundle policy from `IAP_BUNDLE_CONFIG`, and DTO schema.
3. `capital-orchestrator` checks entitlement; rejects if invalid.
4. `wallet-adapter` drives Wallets Kit to collect authorization/signature on the client.
5. `sdp-adapter` submits the settlement to SDP (Bridge corridor added when the payout profile requires it).
6. Worker consumes status updates, persists external references to `settlements` / `disbursements`, and writes `ledger_entries`.
7. Client polls `GET /v1/transfers/{id}` or receives push updates.

### Flow C — Reconciliation

1. `reconciliation-run` job executes on a schedule (hourly) and on-demand via `POST /v1/reconciliation/run`.
2. Joins internal `ledger_entries` with external SDP/Bridge tx status sources.
3. Mismatches produce `reconciliation_issues` records; alerts fire on threshold breach.
4. Resolved runs publish reviewer-ready summaries to object storage.

## API Surface

All endpoints return JSON. Errors follow RFC 7807 problem detail format.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/entitlements/refresh` | Force refresh for `(account, product)`. |
| `GET` | `/v1/entitlements/status` | Current entitlement for the active session. |
| `POST` | `/v1/transfers` | Create transfer intent; run orchestration. |
| `GET` | `/v1/transfers/{id}` | Transfer lifecycle status + external references. |
| `POST` | `/v1/reconciliation/run` | Trigger reconciliation run. |
| `GET` | `/v1/reconciliation/{runId}` | Run summary + mismatch counts. |
| `GET` | `/v1/proofs/{tranche}` | Evidence bundle for a given release snapshot. |
| `POST` | `/v1/webhooks/apple` | Apple App Store Server Notifications (signature-verified, raw body). |
| `POST` | `/v1/webhooks/revenuecat` | RevenueCat subscription event webhook. |

## Capital Orchestrator State Machine

```
intent_created
      │
      ▼
entitlement_verified ──[fail]──► rejected
      │
      ▼
authorization_obtained
      │
      ▼
settlement_submitted
      │
      ▼
settlement_confirmed
      │
      ▼
disbursement_confirmed ──[delta]──► reconciliation_pending
      │
      ▼
reconciled
      │
      ▼
proof_published
```

Invariants:

- No transition to `authorization_obtained` is allowed without successful `entitlement_verified`.
- Every outbound external operation carries an idempotency key derived from the intent.
- Failed transitions are retryable with exponential backoff (capped); all retries log to `orchestrator_runs`.

## Idempotency + Reliability

- **Idempotency keys**: every money-movement endpoint requires an `Idempotency-Key` header or embedded key in the request body. Duplicate submissions return the original response without re-executing.
- **Replay protection**: callback handlers verify request signatures; timestamps outside a `5-minute` skew window are rejected.
- **Retry semantics**: workers use exponential backoff (`2^n` seconds, capped at `5 minutes`) with a maximum of `6` attempts; exhausted retries route to a dead-letter queue.
- **Circuit breaker**: SDP/Bridge adapter failures over `5%` error rate in a `2-minute` window trip the circuit; settlement intents queue instead of failing.
- **Deployment**: roll-forward strategy; fast rollback via container image tag revert; no in-flight transfer state is tied to a specific pod.

## Security Controls

| Area | Control |
|---|---|
| Custody | Non-custodial. User keys live on-device via Wallets Kit. Backend never holds seed material. |
| Auth | Firebase ID token verification on every authenticated route via `accesstoken` header. |
| Request validation | NestJS `ValidationPipe` with `whitelist: true` strips unknown fields. |
| Callback signing | Apple App Store notifications verified against Apple's signing key; RevenueCat webhooks verified via HMAC shared secret. |
| Secrets | Never committed; scoped per environment. CI policy (`tools/ci/verify-repo-policy.js`) scans for `sk-*`, `AIza*`, `ghp_*`, `AKIA*`, PEM blocks. |
| Absolute paths | CI rejects absolute paths in committed files; repo-relative only. Bypass marker: `codex:allow-absolute-path`. |
| Rate limiting | `60 req / 60 s` per client via NestJS ThrottlerModule. |
| CORS | Enabled; origin allow-list per environment. |
| Security headers | Helmet default set. |
| PII in logs | Redaction layer scrubs email, wallet addresses, device IDs before log persistence. |

## Observability

- **Structured logs**: JSON format, correlation ID per request, redacted PII. Log drains to DigitalOcean log sink.
- **Metrics**: Prometheus-compatible exporters for request rate, latency (p50/p95/p99), orchestrator state counts, reconciliation delta counts.
- **Alerting**: error-budget alerts on API success rate; reconciliation delta alerts on unmatched count and value drift.
- **Tracing**: request correlation IDs propagate through orchestrator and adapter layers.

## Reliability SLOs

| SLO | Target |
|---|---|
| Capital API success rate | `≥ 99.5%` |
| Disbursement success rate (launch) | `≥ 98%` |
| Disbursement success rate (30-day rolling, post-launch) | `≥ 99%` |
| Incident acknowledgment (active coverage) | `< 30 minutes` |
| Reconciliation delta resolution (active coverage) | `< 4 hours` |
| P95 API latency | `< 500 ms` (excluding external tx confirmation wait) |

## Testing

- **Unit tests**: Vitest for shared utilities, React components, and pure backend logic.
- **Contract tests**: NestJS controller-level tests against generated OpenAPI schema.
- **Integration tests**: adapters tested against sandboxed Apple/SDP/Bridge environments.
- **End-to-end tests**: headless Chromium smoke tests via `tools/factory-cli/runtime-proof.js` exercising onboarding → paywall → entitlement → transfer.
- **Idempotency tests**: fuzzed duplicate submission with varied timing to confirm single-execution guarantee.
- **Reconciliation tests**: synthetic mismatch scenarios drive the reconciliation module to confirm mismatch detection + alerting.
- **Release gate**: `npm run release-check` runs `lint` + `typecheck` + `build` with `0` warnings as a hard gate.

## Configuration and Environments

Three `.env.example` files seed configuration:

- **Root**: Playwright config, UI harvest settings, `GEMINI_API_KEY`, `CLAIMS_POLICY`.
- **Backend**: `MONGODB_URI`, `FIREBASE_SERVICE_ACCOUNT_JSON` (or Application Default Credentials), `DO_SPACES_*` (S3/CDN), rate-limit tuning.
- **App**: `APP_*` vars for bundle ID, API URL, analytics (PostHog), IAP product IDs, App Store Connect credentials.

Environments are separated by namespace (dev / staging / mainnet); secrets rotate on a fixed schedule.

## CI and Release

- CI gates: `npm run lint` (0 warnings), `npm run typecheck`, `npm run build`, `npm run test` on every PR.
- Repo policy checks: `npm run policy` at root rejects absolute paths and secret patterns.
- Docker compose: `backend/docker-compose.yml` provisions MongoDB 7 + API container; used for local dev parity.
- iOS release lanes: preflight → beta → prod, driven by `./factory release` commands; App Store Connect credentials are environment-scoped.
- Web release: static build via Vite; deploy to domain subdomains per app.

## Audit + Evidence Export

The `proof-service` produces immutable evidence bundles on demand:

- Bundle files: `tranche-index.json`, `kpi-snapshot.json`, `tx-hashes.csv`, `reconciliation-summary.csv`, `api-log-index.json`, `recordings-index.json`, `SHA256SUMS.txt`.
- Partner lifecycle files: `partners/pipeline.csv` plus stage-specific snapshots (`approved.csv`, `active.csv`).
- Checksums: generated with `shasum -a 256 <file> ... > SHA256SUMS.txt`; verifiable with `shasum -a 256 -c SHA256SUMS.txt`.
- Release tag format: `scf43-t{n}-{YYYYMMDD}` for public GitHub release tags.
- Storage: object storage for raw artifacts; public GitHub release tags for reviewer-facing bundles.

## Partner Lifecycle (as implemented)

Partners (shelters and recipients) are tracked through a fixed 5-stage vocabulary with stable IDs (`PT-0001`, `PT-0002`, ...):

1. `discovery`
2. `qualified`
3. `compliance_review`
4. `approved`
5. `active_disbursement`

Transitions are append-only; every row carries `stage_updated_at_utc`, `owner`, and `evidence_ref`. Reaching `approved` requires compliance review closure. This vocabulary is mirrored in every exported `partners/pipeline.csv`.

## Repository Layout (top-level)

```
app/                   Companion website + app landing pages
cat-scanner-app/       React + Vite + Capacitor iOS client
backend/               NestJS API server
agents/                Build/growth/QA agent pipeline (internal tooling)
tools/                 Factory CLI, CI policy scripts, runtime proof
docs/proposal/         SCF43 submission materials
factory.config.json    App registry (QA ports, scenes, endpoints)
```
