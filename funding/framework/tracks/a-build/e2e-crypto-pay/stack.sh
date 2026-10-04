#!/usr/bin/env bash
# Local end-to-end stack for the crypto checkout (USDC / EURC orders, on-chain verification, grants,
# shelter cats in both custody modes). Local only: a plain anvil chain (31337, no fork, no network),
# test tokens (MockUSDC playing USDC and EURC), a throwaway backend on a throwaway Mongo database.
# No real key, no .env file is read (the backend runs from a scratch directory), no mainnet anything.
#
#   ./stack.sh all      # up, flows before the handover, restart with SHELTER_HANDED_OVER=true, flows after, down
#   ./stack.sh up       # chain + contracts + seed + backend (:3025) before the handover
#   ./stack.sh down     # stops everything it started and drops the throwaway database
#
# Ports and paths (override with env): CHAIN_PORT=8573 BE_PORT=3025 E2E_STATE=${TMPDIR}/tt-crypto-e2e
# Keys: only anvil's public, well-known dev key #1 (the hot wallet that pays the shelter share from a
# test-token float); every other account signs through anvil's unlocked accounts.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
CHAIN_PORT="${CHAIN_PORT:-8573}"
BE_PORT="${BE_PORT:-3025}"
STATE="${E2E_STATE:-${TMPDIR:-/tmp}/tt-crypto-e2e}"
STATE="${STATE%/}"
RPC="http://127.0.0.1:$CHAIN_PORT"
DB="mongodb://127.0.0.1:27017/tt_e2e_crypto_pay"
HARNESS="$HERE/../e2e-donate/backend-harness.cjs"
# anvil dev #1 (public, well-known; holds only local test tokens). Plays the Token Tails hot wallet.
ANVIL_DEV1_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

busy() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
wait_http() { # url name seconds pidfile
  for _ in $(seq 1 "${3:-120}"); do
    curl -s -o /dev/null "$1" && return 0
    if [ -n "${4:-}" ] && ! kill -0 "$(cat "$4")" 2>/dev/null; then echo "$2 exited" >&2; return 1; fi
    sleep 1
  done; echo "timeout: $2" >&2; return 1; }
st() { node -p "require('$STATE/state.json').$1"; }

stop() { # name: SIGTERM, then SIGKILL after 5 s (Nest shutdown hooks can keep the process alive)
  local f="$STATE/$1.pid"
  [ -f "$f" ] || return 0
  local pid; pid=$(cat "$f")
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$f"
}

backend() { # handedOver
  stop backend
  # `cd` on its own line: with `cd && node &`, $! would be a subshell and node would outlive `stop`.
  (cd "$STATE" || exit 1
    env -i PATH="$PATH" HOME="$HOME" \
    NODE_PATH="$STATE/backend-dist:$REPO/backend/node_modules" NODE_ENV=development PORT="$BE_PORT" \
    MONGODB_URI="$DB" FRONT_END_URLS="http://localhost:3001" CRONS_ENABLED=false IMPACT_JOBS_ENABLED=false RESCUE_GOAL_SWEEPER=off \
    OPENAI_API_KEY=e2e-unused GOOGLE_AI_API_KEY=e2e-unused STRIPE_SECRET_KEY=sk_test_e2e_unused INVALIDATE_CACHE_SECRET=e2e-throwaway-only \
    SHELTER_CHAIN_ID=31337 SHELTER_ARC_RPC_URL="$RPC" SHELTER_SPLIT_ADDRESS="$(st split)" SHELTER_DONATE_PRIVATE_KEY="$ANVIL_DEV1_KEY" \
    SHELTER_HANDED_OVER="$1" \
    CRYPTO_PAY_ENABLED=true CRYPTO_PAY_NETWORK=testnet CRYPTO_PAY_RPC_31337="$RPC" \
    CRYPTO_PAY_LOCAL_USDC="$(st usdc)" CRYPTO_PAY_LOCAL_EURC="$(st eurc)" CRYPTO_PAY_TREASURY_31337="$(st dev.treasury)" \
    CRYPTO_PAY_CAT_SHELTER_BPS=5000 CRYPTO_PAY_SHELTER_SHARE_ENABLED=true CRYPTO_PAY_ORDER_TTL_MIN=5 \
    nohup node -r "$HARNESS" "$STATE/backend-dist/src/main.js" >"$STATE/backend-$1.log" 2>&1 </dev/null &
    echo $! >"$STATE/backend.pid")
  wait_http "http://127.0.0.1:$BE_PORT/payments/crypto/config" backend 90 "$STATE/backend.pid" || { tail -40 "$STATE/backend-$1.log"; exit 1; }
}

up() {
  mkdir -p "$STATE"
  for p in "$CHAIN_PORT" "$BE_PORT"; do busy "$p" && { echo "port $p is busy (./stack.sh down, or set *_PORT)" >&2; exit 2; }; done

  echo "== anvil (local chain 31337) on $RPC"
  nohup anvil --port "$CHAIN_PORT" --host 127.0.0.1 --silent >"$STATE/anvil.log" 2>&1 </dev/null &
  echo $! >"$STATE/anvil.pid"
  for _ in $(seq 1 60); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done

  echo "== test tokens, ShelterSplit, seed data"
  mongosh --quiet "$DB" --eval 'db.dropDatabase()' >/dev/null
  node "$HERE/setup.mjs" "$RPC" "$STATE" "$DB" >/dev/null
  cat "$STATE/state.json"

  echo "== backend: compile to $STATE/backend-dist"
  cat >"$STATE/tsconfig.e2e.json" <<JSON
{ "extends": "$REPO/backend/tsconfig.build.json",
  "compilerOptions": { "outDir": "$STATE/backend-dist/src", "rootDir": "$REPO/backend/src",
    "typeRoots": ["$REPO/backend/node_modules/@types"], "incremental": false, "sourceMap": false, "declaration": false },
  "include": ["$REPO/backend/src/**/*"],
  "exclude": ["$REPO/backend/node_modules", "$REPO/backend/**/*spec.ts"] }
JSON
  (cd "$REPO/backend" && ./node_modules/.bin/tsc -p "$STATE/tsconfig.e2e.json")
  echo "== backend on :$BE_PORT, before the handover"
  backend false
}

flows() {
  echo "== flows before the handover"
  E2E_STATE="$STATE" CRYPTO_API="http://127.0.0.1:$BE_PORT" CRYPTO_DB="$DB" node "$HERE/e2e.mjs" pre
  echo "== backend restarted with SHELTER_HANDED_OVER=true"
  backend true
  echo "== flows after the handover"
  E2E_STATE="$STATE" CRYPTO_API="http://127.0.0.1:$BE_PORT" CRYPTO_DB="$DB" node "$HERE/e2e.mjs" post
}

down() {
  stop backend
  stop anvil
  mongosh --quiet "$DB" --eval 'db.dropDatabase()' >/dev/null 2>&1 || true
  echo "stack down"
}

case "${1:-}" in
  up) up ;;
  test) flows ;;
  down) down ;;
  all) up; trap down EXIT; flows ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
