#!/usr/bin/env bash
# Multi-chain crypto checkout + Pink Paw goal meter, end to end, on two LOCAL anvil chains:
#   chain A (31337): the shelter chain: ShelterSplit, test USDC/EURC, the goal meter's wallets
#   chain B (5042002, an empty anvil chain with the Arc testnet id, not a fork): test USDC/EURC at the
#                    addresses the checkout lists for Arc testnet
# plus a throwaway backend (real services, scratch build, no .env) on a throwaway Mongo database.
# Test tokens only, anvil's public dev accounts only, nothing leaves the machine, no mainnet anything.
#
#   ./stack.sh all          # up, pre flows, [ui pre], handover, post flows, [ui post], down
#   ./stack.sh up | down
#   E2E_UI=1 ./stack.sh all # also screenshots the client (needs the dev client on :3001; see ui.cjs)
#
# What runs (flows.mjs): packs in USDC and EURC on both chains, each granted exactly once (replays,
# concurrent confirms, cross-chain replays); a $5 shelter cat before the handover (treasury route,
# share paid by the keeper through ShelterSplit to the held wallet) and after it (paid straight into
# ShelterSplit to the shelter's own wallet); receipts, order rows, impact ledger rows; the goal meter
# (GET /shelter/goal/C-001) after every money move, with the handover sweep counted once.
#
# Ports and paths (override with env): A_PORT=8583 B_PORT=8584 BE_PORT=3035 JOBS_PORT=3036
#   E2E_STATE=${TMPDIR}/tt-pay-goal-e2e   E2E_SHOTS=<dir for ui.cjs screenshots>
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../../.." && pwd)"
A_PORT="${A_PORT:-8583}"
B_PORT="${B_PORT:-8584}"
BE_PORT="${BE_PORT:-3035}"
JOBS_PORT="${JOBS_PORT:-3036}"
STATE="${E2E_STATE:-${TMPDIR:-/tmp}/tt-pay-goal-e2e}"
STATE="${STATE%/}"
RPC_A="http://127.0.0.1:$A_PORT"
RPC_B="http://127.0.0.1:$B_PORT"
DB="mongodb://127.0.0.1:27017/tt_e2e_pay_goal"
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

# The goal campaign as the facts registry would describe it in each phase (JSON for the harness).
campaign() { # pre|post
  node -e '
    const s = require(process.argv[1]); const phase = process.argv[2];
    const held = { wallet: s.dev.held.toLowerCase(), fromBlock: s.a.fromBlock, toBlock: null, holder: "token-tails" };
    const wallets = phase === "post"
      ? [{ ...held, toBlock: s.handoverBlock }, { wallet: s.dev.own.toLowerCase(), fromBlock: s.handoverBlock + 1, toBlock: null, holder: "shelter" }]
      : [held];
    console.log(JSON.stringify({ chainId: s.a.chainId, handover: phase === "post" ? "handed-over" : "held-by-token-tails", wallets,
      inflowLog: { address: s.a.usdc.toLowerCase(), decimals: 6 }, token: { address: s.a.usdc.toLowerCase(), decimals: 6 } }));
  ' "$STATE/state.json" "$1"
}

backend() { # pre|post
  local handed=false; [ "$1" = post ] && handed=true
  stop backend
  local goal; goal="$(campaign "$1")"
  # `cd` on its own line: with `cd && node &`, $! would be a subshell and node would outlive `stop`.
  (cd "$STATE" || exit 1
    env -i PATH="$PATH" HOME="$HOME" \
    NODE_PATH="$STATE/backend-dist:$REPO/backend/node_modules" NODE_ENV=development PORT="$BE_PORT" E2E_JOBS_PORT="$JOBS_PORT" \
    MONGODB_URI="$DB" FRONT_END_URLS="http://localhost:3001" CRONS_ENABLED=false IMPACT_JOBS_ENABLED=false RESCUE_GOAL_SWEEPER=off \
    OPENAI_API_KEY=e2e-unused GOOGLE_AI_API_KEY=e2e-unused STRIPE_SECRET_KEY=sk_test_e2e_unused INVALIDATE_CACHE_SECRET=e2e-throwaway-only \
    SHELTER_CHAIN_ID=31337 SHELTER_ARC_RPC_URL="$RPC_A" SHELTER_SPLIT_ADDRESS="$(st a.split)" SHELTER_SPLIT_FROM_BLOCK="$(st a.fromBlock)" \
    SHELTER_DONATE_PRIVATE_KEY="$ANVIL_DEV1_KEY" SHELTER_HANDED_OVER="$handed" SHELTER_HELD_WALLETS="$(st dev.held)" \
    SHELTER_GOAL_RPC_URL="$RPC_A" E2E_GOAL_CAMPAIGN="$goal" \
    CRYPTO_PAY_ENABLED=true CRYPTO_PAY_NETWORK=testnet \
    CRYPTO_PAY_RPC_31337="$RPC_A" CRYPTO_PAY_RPC_5042002="$RPC_B" \
    CRYPTO_PAY_LOCAL_USDC="$(st a.usdc)" CRYPTO_PAY_LOCAL_EURC="$(st a.eurc)" \
    CRYPTO_PAY_TREASURY_31337="$(st dev.treasury)" CRYPTO_PAY_TREASURY_5042002="$(st dev.treasury)" \
    CRYPTO_PAY_CAT_SHELTER_BPS=5000 CRYPTO_PAY_SHELTER_SHARE_ENABLED=true CRYPTO_PAY_ORDER_TTL_MIN=30 \
    nohup node -r "$HARNESS" "$STATE/backend-dist/src/main.js" >"$STATE/backend-$1.log" 2>&1 </dev/null &
    echo $! >"$STATE/backend.pid")
  wait_http "http://127.0.0.1:$BE_PORT/payments/crypto/config" backend 90 "$STATE/backend.pid" || { tail -40 "$STATE/backend-$1.log"; exit 1; }
}

up() {
  mkdir -p "$STATE"
  for p in "$A_PORT" "$B_PORT" "$BE_PORT" "$JOBS_PORT"; do busy "$p" && { echo "port $p is busy (./stack.sh down, or set *_PORT)" >&2; exit 2; }; done

  echo "== anvil chain A (31337) on $RPC_A, chain B (5042002, local, no fork) on $RPC_B"
  nohup anvil --port "$A_PORT" --host 127.0.0.1 --silent >"$STATE/anvil-a.log" 2>&1 </dev/null &
  echo $! >"$STATE/anvil-a.pid"
  nohup anvil --port "$B_PORT" --host 127.0.0.1 --chain-id 5042002 --silent >"$STATE/anvil-b.log" 2>&1 </dev/null &
  echo $! >"$STATE/anvil-b.pid"
  for rpc in "$RPC_A" "$RPC_B"; do
    for _ in $(seq 1 60); do cast chain-id --rpc-url "$rpc" >/dev/null 2>&1 && break; sleep 0.5; done
  done

  echo "== tokens, ShelterSplit, seed data"
  mongosh --quiet "$DB" --eval 'db.dropDatabase()' >/dev/null
  node "$HERE/setup.mjs" "$RPC_A" "$RPC_B" "$STATE" "$DB" >/dev/null
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
  echo "== backend on :$BE_PORT (jobs :$JOBS_PORT), before the handover"
  backend pre
}

run() { # phase
  E2E_STATE="$STATE" PAY_API="http://127.0.0.1:$BE_PORT" PAY_JOBS="http://127.0.0.1:$JOBS_PORT" PAY_DB="$DB" node "$HERE/flows.mjs" "$1"
}
ui() { # phase
  [ "${E2E_UI:-}" = 1 ] || return 0
  E2E_STATE="$STATE" PAY_API="http://127.0.0.1:$BE_PORT" PAY_JOBS="http://127.0.0.1:$JOBS_PORT" PAY_DB="$DB" node "$HERE/ui.cjs" "$1"
}

flows() {
  local rc=0
  echo "== flows before the handover"; run pre || rc=1
  ui pre || rc=1
  echo "== handover: rotate the split to the shelter's own wallet, sweep the held wallet"; run handover || rc=1
  echo "== backend restarted with SHELTER_HANDED_OVER=true and the two-wallet campaign"; backend post
  echo "== flows after the handover"; run post || rc=1
  ui post || rc=1
  return $rc
}

down() {
  stop backend
  stop anvil-a
  stop anvil-b
  mongosh --quiet "$DB" --eval 'db.dropDatabase()' >/dev/null 2>&1 || true
  echo "stack down"
}

case "${1:-}" in
  up) up ;;
  test) flows ;;
  down) down ;;
  all) up; trap down EXIT; flows ;;
  *) sed -n '2,19p' "$0"; exit 2 ;;
esac
