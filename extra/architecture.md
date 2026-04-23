# Token Tails Settlement Rail — Technical Architecture

## Overview

Token Tails Settlement Rail (TTSR) is a Stellar-native settlement and disbursement backend shared by a family of consumer iOS apps and their companion web clients. It is implemented as a single NestJS API serving multiple bundle IDs, with a configuration-driven routing layer that resolves each bundle to its own entitlement namespace, IAP product catalog, and payout policy without per-app code branches.

The rail handles three core responsibilities: converting App Store purchases into verified entitlement state, gating user-initiated transfer intents behind that state, and executing Stellar settlements/disbursements through an orchestrated state machine with idempotency, reconciliation, and audit-grade proof export.

Client apps ship as Capacitor-wrapped React builds for iOS plus standalone companion websites. Both share the same backend contract.

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

## External Integrations

| Integration | Use |
|---|---|
| Firebase Auth | User identity; ID tokens verified via `accesstoken` header. |
| Apple App Store Server API | Subscription receipt verification + server-to-server notifications. |
| RevenueCat | Client-side subscription management + server webhooks for entitlement updates. |
| Stellar Wallets Kit | User wallet authorization + signature capture on the client. |
| Stellar Disbursement Platform (SDP) | Primary settlement + disbursement orchestration; batched recipient delivery. |
| Stellar Bridge | Corridor execution for fiat-to-Stellar settlement paths. |
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

## Bridge Integration

- KYB for Bridge corridor access is cleared.
- `bridge-adapter` handles corridor-routed settlement paths; same idempotency and reconciliation guarantees apply.
- Payout profile on the bundle config determines whether a transfer routes through Bridge or stays on the SDP path.
- Both paths emit identical evidence schema; consumers of reconciliation exports don't need to branch on corridor vs direct.

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
