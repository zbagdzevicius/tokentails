#!/usr/bin/env bash
# Local end-to-end stack for every donation flow. Local only: an anvil fork of Arc testnet, a throwaway
# backend on a throwaway Mongo database, and a second Next dev server. No real key, no real network
# write, no .env file is read (the backend runs from a scratch directory, so dotenv finds none).
#
#   ./stack.sh up       # fork + contracts + backend (:3015, jobs :3016) + client (:3017)
#   ./stack.sh test     # Playwright: client/e2e/donate-stack.spec.ts (screenshots to $E2E_SHOTS)
#   ./stack.sh down     # stops everything it started and drops the throwaway database
#   ./stack.sh all      # up, test, down
#
# Ports and paths (override with env): FORK_PORT=8571 BE_PORT=3015 JOBS_PORT=3016 FE_PORT=3017 FAC_PORT=3018
#   E2E_STATE=${TMPDIR}/tt-donate-e2e   E2E_SHOTS=$E2E_STATE/shots   E2E_CHROMIUM_PATH=<chrome binary>
#
# Keys: only anvil's public, well-known dev keys (mnemonic "test test ... junk"), worthless anywhere
# else. The backend hot wallet is dev #1; every other account signs through anvil's unlocked accounts.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
FORK_PORT="${FORK_PORT:-8571}"
BE_PORT="${BE_PORT:-3015}"
JOBS_PORT="${JOBS_PORT:-3016}"
FE_PORT="${FE_PORT:-3017}"
FAC_PORT="${FAC_PORT:-3018}"
STATE="${E2E_STATE:-${TMPDIR:-/tmp}/tt-donate-e2e}"
STATE="${STATE%/}"
SHOTS="${E2E_SHOTS:-$STATE/shots}"
RPC="http://127.0.0.1:$FORK_PORT"
DB="mongodb://127.0.0.1:27017/tt_e2e_donate"
UPSTREAM="${FORK_URL:-https://rpc.testnet.arc.io}"
# anvil dev #1 (public, well-known; holds only fork test USDC). Plays the Token Tails hot wallet.
ANVIL_DEV1_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

busy() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
wait_http() { # url name seconds [pidfile]
  for _ in $(seq 1 "${3:-120}"); do
    curl -s -o /dev/null "$1" && return 0
    if [ -n "${4:-}" ] && ! kill -0 "$(cat "$4")" 2>/dev/null; then echo "$2 exited" >&2; return 1; fi
    sleep 1
  done; echo "timeout: $2" >&2; return 1; }
st() { node -p "require('$STATE/state.json').$1"; }

up() {
  mkdir -p "$STATE"
  for p in "$FORK_PORT" "$BE_PORT" "$JOBS_PORT" "$FE_PORT" "$FAC_PORT"; do busy "$p" && { echo "port $p is busy (./stack.sh down, or set *_PORT)" >&2; exit 2; }; done

  echo "== anvil fork of Arc testnet on $RPC"
  nohup anvil --fork-url "$UPSTREAM" --port "$FORK_PORT" --host 127.0.0.1 --silent >"$STATE/anvil.log" 2>&1 </dev/null &
  echo $! >"$STATE/anvil.pid"
  for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done

  echo "== contracts (ShelterSplit, DonateRouter, CappedSpender) from unlocked dev accounts"
  node "$HERE/fork-setup.mjs" "$RPC" "$STATE" >/dev/null
  cat "$STATE/state.json"

  echo "== backend: compile to $STATE/backend-dist"
  cat >"$STATE/tsconfig.e2e.json" <<EOF
{ "extends": "$REPO/backend/tsconfig.build.json",
  "compilerOptions": { "outDir": "$STATE/backend-dist/src", "rootDir": "$REPO/backend/src",
    "typeRoots": ["$REPO/backend/node_modules/@types"], "incremental": false, "sourceMap": false, "declaration": false },
  "include": ["$REPO/backend/src/**/*"],
  "exclude": ["$REPO/backend/node_modules", "$REPO/backend/**/*spec.ts"] }
EOF
  (cd "$REPO/backend" && ./node_modules/.bin/tsc -p "$STATE/tsconfig.e2e.json")
  mongosh --quiet "$DB" --eval 'db.dropDatabase()' >/dev/null
  # One adoptable cat for the x402 cat card (throwaway database only).
  mongosh --quiet "$DB" --eval 'db.blessings.insertOne({ name: "Mochi (E2E)", status: "WAITING", createdAt: new Date() })' >/dev/null

  echo "== local x402 facilitator on :$FAC_PORT"
  nohup node "$HERE/facilitator-stub.mjs" "$FAC_PORT" "$RPC" >"$STATE/facilitator.log" 2>&1 </dev/null &
  echo $! >"$STATE/facilitator.pid"

  echo "== backend on :$BE_PORT (jobs :$JOBS_PORT), cwd $STATE (no .env)"
  (cd "$STATE" && env -i PATH="$PATH" HOME="$HOME" \
    NODE_PATH="$STATE/backend-dist:$REPO/backend/node_modules" NODE_ENV=development PORT="$BE_PORT" E2E_JOBS_PORT="$JOBS_PORT" \
    MONGODB_URI="$DB" FRONT_END_URLS="http://localhost:$FE_PORT" CRONS_ENABLED=false IMPACT_JOBS_ENABLED=false RESCUE_GOAL_SWEEPER=off \
    OPENAI_API_KEY=e2e-unused GOOGLE_AI_API_KEY=e2e-unused STRIPE_SECRET_KEY=sk_test_e2e_unused INVALIDATE_CACHE_SECRET=e2e-throwaway-only \
    SHELTER_CHAIN_ID=5042002 SHELTER_ARC_RPC_URL="$RPC" SHELTER_SPLIT_ADDRESS="$(st split)" \
    SHELTER_SPLIT_FROM_BLOCK="$(st fromBlock)" SHELTER_LOG_CHUNK=5000 \
    SHELTER_DONATE_ENABLED=true SHELTER_DONATE_PRIVATE_KEY="$ANVIL_DEV1_KEY" SHELTER_X402_ENABLED=true \
    SHELTER_ROUTER_ADDRESS="$(st router)" SHELTER_ROUTER_FROM_BLOCK="$(st fromBlock)" \
    SHELTER_RELAY_ENABLED=true SHELTER_MATCH_ENABLED=true SHELTER_TREASURY_ADDRESS="$(st dev.treasury)" \
    SHELTER_CLAIM_ALLOWED_WALLETS="$(st dev.shelter)" \
    SHELTER_X402_EXACT_ENABLED=true SHELTER_X402_EXACT_NETWORK=arc-testnet SHELTER_X402_EXACT_CHAIN_ID=5042002 \
    SHELTER_X402_EXACT_ASSET="$(st usdc)" SHELTER_X402_EXACT_PAYTO="$(st dev.shelter)" SHELTER_X402_EXACT_PRICE=0.01 \
    SHELTER_X402_EXACT_RPC="$RPC" SHELTER_X402_FACILITATOR_URL="http://127.0.0.1:$FAC_PORT" \
    nohup node -r "$HERE/backend-harness.cjs" "$STATE/backend-dist/src/main.js" >"$STATE/backend.log" 2>&1 </dev/null &
    echo $! >"$STATE/backend.pid")
  wait_http "http://127.0.0.1:$BE_PORT/shelter/donate/status" backend 90 "$STATE/backend.pid" || { tail -40 "$STATE/backend.log"; exit 1; }

  echo "== client next dev on :$FE_PORT (dist .next-e2e-donate)"
  (cd "$REPO/client" && NEXT_DIST_DIR=.next-e2e-donate NEXT_PUBLIC_BE_URL="http://localhost:$BE_PORT" \
    NEXT_PUBLIC_WALLET_DONATE=true NEXT_PUBLIC_WALLET_DONATE_CHAIN=5042002 \
    nohup ./node_modules/.bin/next dev -p "$FE_PORT" >"$STATE/client.log" 2>&1 </dev/null &
    echo $! >"$STATE/client.pid")
  wait_http "http://localhost:$FE_PORT/shelter-payouts" client 240 "$STATE/client.pid"
  echo "stack up. state: $STATE/state.json"
}

test_() {
  mkdir -p "$SHOTS"
  (cd "$REPO/client" && DONATE_STACK=1 FORK_RPC="$RPC" E2E_STATE="$STATE" E2E_SHOTS="$SHOTS" E2E_BASE_URL="http://localhost:$FE_PORT" \
    DONATE_API="http://localhost:$BE_PORT" DONATE_JOBS="http://127.0.0.1:$JOBS_PORT" \
    ./node_modules/.bin/playwright test e2e/donate-stack.spec.ts --project=mobile-390 --workers=1 "$@")
}

down() {
  for f in client backend facilitator anvil; do
    if [ -f "$STATE/$f.pid" ]; then
      pid=$(cat "$STATE/$f.pid")
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      rm -f "$STATE/$f.pid"
    fi
  done
  mongosh --quiet "$DB" --eval 'db.dropDatabase()' >/dev/null 2>&1 || true
  rm -rf "$REPO/client/.next-e2e-donate"
  echo "stack down"
}

case "${1:-}" in
  up) up ;;
  test) shift; test_ "$@" ;;
  down) down ;;
  all) shift; up; trap down EXIT; test_ "$@" ;;
  *) sed -n '2,16p' "$0"; exit 2 ;;
esac
