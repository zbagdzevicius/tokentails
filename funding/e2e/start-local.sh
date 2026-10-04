#!/usr/bin/env bash
# Starts a throwaway local stack for the testnet e2e run:
#   1. mongod on 127.0.0.1:27027 with a fresh mktemp data dir (never the production database);
#   2. the backend (backend/dist/main.js, rebuilt when missing or older than src/) on port 3105,
#      pointed at Arc TESTNET (5042002) and the ShelterSplit testnet deployment.
#
# Usage:
#   funding/e2e/start-local.sh [SHELTER_SPLIT_ADDRESS]   # default: newest Arc testnet USDC deployment
#                                                        #   in tracks/a-build/deployments.json
#   funding/e2e/start-local.sh stop                      # stop both, delete the temp data dir
#
# Optional: E2E_TREAT_CHAINS="421614:0x<split>,42431:0x<split>,..." also turns on token treats on those
# testnets (the give page's network chips: SHELTER_RELAY_CHAINS + SHELTER_CHAIN_<id>_TREAT_ENABLED),
# paid by the same donatehot wallet (it needs gas and ~2 of each split's token there). Testnet ids only:
# 421614 84532 43113 46630 42431 10143. Each RPC must answer with its chain id and each split must have code.
# Optional: E2E_X402_CHAINS="84532:0x<split>,42431:0x<split>,..." also offers the x402 agent cat card on
# those testnets (SHELTER_CHAIN_<id>_X402_ENABLED; the agent pays the split's token there). A chain in both
# lists must name the same split. No key is needed for x402.
#
# Every variable below is set in the backend process, so it wins over backend/.env (dotenv loads
# that file but never overrides a variable that is already set, even to an empty string).
# The donate hot-wallet key is read with `cast wallet private-key` into a shell variable, handed to
# the backend process only, and never echoed or written to a file.
set -euo pipefail
set +x

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/out"
STATE="$OUT/state.env"
SECRETS="$REPO/funding/.secrets"
MONGOD="${MONGOD:-/opt/homebrew/bin/mongod}"
MONGO_PORT=27027
BE_PORT=3105
ARC_TESTNET=5042002
ARC_RPC="${SHELTER_ARC_RPC_URL_E2E:-https://rpc.testnet.arc.io}"
MONGODB_URI_E2E="mongodb://127.0.0.1:${MONGO_PORT}/tt-e2e"
DONATEHOT_ADDR="0x8D03d8295892F7dE2B7cE57585Aa45Dd4B3C2ba0"
TREAT_CHAINS="${E2E_TREAT_CHAINS:-}"
X402_CHAINS="${E2E_X402_CHAINS:-}"
treat_rpc() { # chainId -> public RPC (the backend's DEFAULT_RPC); empty for anything else, mainnets included
  case "$1" in
    421614) echo https://sepolia-rollup.arbitrum.io/rpc ;;
    84532) echo https://sepolia.base.org ;;
    43113) echo https://api.avax-test.network/ext/bc/C/rpc ;;
    46630) echo https://rpc.testnet.chain.robinhood.com ;;
    42431) echo https://rpc.moderato.tempo.xyz ;;
    10143) echo https://testnet-rpc.monad.xyz ;;
    *) echo "" ;;
  esac
}
# Optional host:port of a local Firebase Auth emulator (see README). Empty: the real project verifies tokens.
FB_EMULATOR="${E2E_FIREBASE_AUTH_EMULATOR:-}"
mkdir -p "$OUT"

die() { echo "start-local: $*" >&2; exit 1; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

stop_stack() {
  [ -f "$STATE" ] || { echo "nothing to stop (no $STATE)"; return 0; }
  # shellcheck disable=SC1090
  . "$STATE"
  for pid in ${BACKEND_PID:-} ${MONGOD_PID:-}; do
    if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null || true; fi
  done
  for _ in $(seq 1 20); do
    alive=0
    for pid in ${BACKEND_PID:-} ${MONGOD_PID:-}; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ "$alive" = 0 ] && break
    sleep 0.5
  done
  case "${DBDIR:-}" in
    */tt-e2e-mongo.*) rm -rf "$DBDIR" && echo "removed $DBDIR" ;;
    "") ;;
    *) echo "not removing unexpected data dir ${DBDIR}" ;;
  esac
  rm -f "$STATE"
  echo "stopped"
}

if [ "${1:-}" = "stop" ]; then stop_stack; exit 0; fi

# ---------------------------------------------------------------- preflight
command -v node >/dev/null || die "node not found"
command -v cast >/dev/null || die "cast (Foundry) not found"
command -v curl >/dev/null || die "curl not found"
[ -x "$MONGOD" ] || die "mongod not found at $MONGOD"
[ -f "$STATE" ] && die "a stack seems to be running ($STATE exists); run: $0 stop"
port_busy "$MONGO_PORT" && die "port $MONGO_PORT is busy; refusing to start mongod"
port_busy "$BE_PORT" && die "port $BE_PORT is busy; refusing to start the backend"
if [ -n "$FB_EMULATOR" ]; then
  [[ "$FB_EMULATOR" =~ ^(127\.0\.0\.1|localhost):[0-9]+$ ]] || die "E2E_FIREBASE_AUTH_EMULATOR must be 127.0.0.1:<port> or localhost:<port>"
  curl -fsS -o /dev/null "http://$FB_EMULATOR/" 2>/dev/null || die "no Firebase Auth emulator answers on $FB_EMULATOR"
fi
[ -f "$REPO/backend/.env" ] || echo "warning: backend/.env not found: Firebase Admin will have no FB_PRIVATE_KEY and authenticated calls will 401" >&2

# The URI is fixed above, but check it with the same guard the node scripts use.
node --input-type=module -e "import('$HERE/lib.mjs').then(m => m.assertLocalMongoUri(process.argv[1]))" "$MONGODB_URI_E2E" \
  || die "MONGODB_URI is not a localhost URI"

SPLIT="${1:-}"
if [ -z "$SPLIT" ]; then
  SPLIT="$(node --input-type=module -e "import('$HERE/lib.mjs').then(m => { const d = m.arcTestnetSplit(); process.stdout.write(d ? d.address : ''); })")"
  [ -n "$SPLIT" ] || die "no Arc testnet deployment recorded; deploy and ingest first, or pass the address"
fi
[[ "$SPLIT" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "SHELTER_SPLIT_ADDRESS '$SPLIT' is not an address"

GOT_CHAIN="$(cast chain-id --rpc-url "$ARC_RPC" 2>/dev/null || true)"
[ "$GOT_CHAIN" = "$ARC_TESTNET" ] || die "RPC $ARC_RPC answered chain '${GOT_CHAIN:-nothing}', expected Arc testnet $ARC_TESTNET; refusing"
CODE="$(cast code "$SPLIT" --rpc-url "$ARC_RPC" 2>/dev/null || true)"
[ -n "$CODE" ] && [ "$CODE" != "0x" ] || die "no contract code at $SPLIT on Arc testnet"

PWFILE="$SECRETS/donatehot-password.txt"
[ -f "$PWFILE" ] || die "missing funding/.secrets/donatehot-password.txt"
HOT_ADDR="$(cast wallet address --account donatehot --password-file "$PWFILE" 2>/dev/null || true)"
[ "$(echo "$HOT_ADDR" | tr 'A-F' 'a-f')" = "$(echo "$DONATEHOT_ADDR" | tr 'A-F' 'a-f')" ] \
  || die "keystore 'donatehot' is '${HOT_ADDR:-unreadable}', expected $DONATEHOT_ADDR"
echo "donatehot balance on Arc testnet: $(cast balance "$DONATEHOT_ADDR" --rpc-url "$ARC_RPC" --ether 2>/dev/null || echo '?') USDC (native)"

# Token treats and x402 on more testnets (optional). Mainnet ids have no entry in treat_rpc and are refused.
TREAT_IDS=()
TREAT_SPLITS=()
TREAT_ON=()
X402_ON=()
add_chain() { # kind id split
  local kind="$1" id="$2" split="$3" rpc got code i
  rpc="$(treat_rpc "$id")"
  [ -n "$rpc" ] || die "E2E_${kind}_CHAINS: '$id' is not an allowed testnet (421614 84532 43113 46630 42431 10143); refusing"
  [[ "$split" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "E2E_${kind}_CHAINS: '$split' is not an address"
  for i in "${!TREAT_IDS[@]}"; do
    if [ "${TREAT_IDS[$i]}" = "$id" ]; then
      [ "$(echo "${TREAT_SPLITS[$i]}" | tr 'A-F' 'a-f')" = "$(echo "$split" | tr 'A-F' 'a-f')" ] \
        || die "chain $id is listed with two different splits; refusing"
      [ "$kind" = TREAT ] && TREAT_ON[$i]=true || X402_ON[$i]=true
      echo "$(echo "$kind" | tr A-Z a-z) on $id via $split"
      return 0
    fi
  done
  got="$(cast chain-id --rpc-url "$rpc" 2>/dev/null || true)"
  [ "$got" = "$id" ] || die "RPC $rpc answered chain '${got:-nothing}', expected $id; refusing"
  code="$(cast code "$split" --rpc-url "$rpc" 2>/dev/null || true)"
  [ -n "$code" ] && [ "$code" != "0x" ] || die "no contract code at $split on $id"
  TREAT_IDS+=("$id"); TREAT_SPLITS+=("$split")
  if [ "$kind" = TREAT ]; then TREAT_ON+=(true); X402_ON+=(""); else TREAT_ON+=(""); X402_ON+=(true); fi
  echo "$(echo "$kind" | tr A-Z a-z) on $id via $split"
}
for spec in "TREAT:$TREAT_CHAINS" "X402:$X402_CHAINS"; do
  kind="${spec%%:*}"; list="${spec#*:}"
  [ -n "$list" ] || continue
  IFS=',' read -r -a _pairs <<<"$list"
  for pair in "${_pairs[@]}"; do add_chain "$kind" "${pair%%:*}" "${pair#*:}"; done
done

# ---------------------------------------------------------------- build if needed
cd "$REPO/backend"
if [ ! -f dist/main.js ] || [ -n "$(find src -name '*.ts' -newer dist/main.js -print -quit)" ]; then
  echo "building backend (dist/ missing or stale) -> $OUT/backend-build.log"
  npm run build >"$OUT/backend-build.log" 2>&1 || die "backend build failed; see $OUT/backend-build.log"
fi

# ---------------------------------------------------------------- mongod
# From here on, an interrupt or a failed step tears down whatever already started.
trap 'echo "start-local: interrupted, stopping" >&2; stop_stack; exit 130' INT TERM HUP
DBDIR="$(mktemp -d "${TMPDIR:-/tmp}/tt-e2e-mongo.XXXXXX")"
"$MONGOD" --dbpath "$DBDIR" --port "$MONGO_PORT" --bind_ip 127.0.0.1 --logpath "$OUT/mongod.log" >/dev/null 2>&1 &
MONGOD_PID=$!
printf 'MONGOD_PID=%s\nDBDIR=%s\n' "$MONGOD_PID" "$DBDIR" >"$STATE"
for _ in $(seq 1 60); do port_busy "$MONGO_PORT" && break; kill -0 "$MONGOD_PID" 2>/dev/null || break; sleep 0.5; done
port_busy "$MONGO_PORT" || { stop_stack; die "mongod did not start; see $OUT/mongod.log"; }
echo "mongod pid $MONGOD_PID on 127.0.0.1:$MONGO_PORT, data $DBDIR"

# ---------------------------------------------------------------- backend
DONATE_KEY="$(cast wallet private-key --account donatehot --password-file "$PWFILE" 2>/dev/null)" \
  || { stop_stack; die "could not unlock keystore 'donatehot'"; }
# SHELTER_RELAY_CHAINS and SHELTER_TRY_CHAIN_ID are always set here (empty unless E2E_TREAT_CHAINS),
# so no chain list from backend/.env can reach the local backend.
TREAT_ENV=("SHELTER_RELAY_CHAINS=$(IFS=,; echo "${TREAT_IDS[*]:-}")" "SHELTER_TRY_CHAIN_ID=")
for i in "${!TREAT_IDS[@]}"; do
  id="${TREAT_IDS[$i]}"
  TREAT_ENV+=(
    "SHELTER_CHAIN_${id}_RPC_URL=$(treat_rpc "$id")"
    "SHELTER_CHAIN_${id}_SPLIT_ADDRESS=${TREAT_SPLITS[$i]}"
    "SHELTER_CHAIN_${id}_KEY_ENV=SHELTER_DONATEHOT_KEY"
    "SHELTER_CHAIN_${id}_TREAT_ENABLED=${TREAT_ON[$i]}"
    "SHELTER_CHAIN_${id}_X402_ENABLED=${X402_ON[$i]}"
    "SHELTER_CHAIN_${id}_RELAY_ENABLED="
    "SHELTER_CHAIN_${id}_MATCH_ENABLED="
  )
done
[ ${#TREAT_IDS[@]} -gt 0 ] && TREAT_ENV+=("SHELTER_DONATEHOT_KEY=$DONATE_KEY")
# Set even when empty, so no X402_PRICE from backend/.env can reach the local backend (default 0.01).
for id in "${TREAT_IDS[@]:-}"; do [ -n "$id" ] && TREAT_ENV+=("SHELTER_CHAIN_${id}_X402_PRICE="); done
# Exported (never on a command line, where ps would show the key), and unset once the backend started.
for kv in "${TREAT_ENV[@]}"; do export "${kv?}"; done

: >"$OUT/backend.log"
NODE_ENV=development \
PORT="$BE_PORT" \
MONGODB_URI="$MONGODB_URI_E2E" \
MONGO_TRANSACTIONS=false \
IS_PROD= \
TRUST_PROXY= \
FRONT_END_URLS="http://localhost:3100,http://localhost:3000" \
CRONS_ENABLED=false \
APP_CHECK_ENFORCE=false \
FIREBASE_AUTH_EMULATOR_HOST="$FB_EMULATOR" \
RESCUE_GOAL_SWEEPER=off \
IMPACT_JOBS_ENABLED="${E2E_IMPACT_JOBS:-true}" \
IMPACT_CDN_ENABLED=false \
IMPACT_PAWS_SENDERS= \
PAWS_SETTLEMENT_ENABLED=false \
SHELTER_SPLIT_FROM_BLOCK="${E2E_FROM_BLOCK:-}" \
SHELTER_DONATE_ENABLED=true \
SHELTER_CHAIN_ID="$ARC_TESTNET" \
SHELTER_ARC_RPC_URL="$ARC_RPC" \
SHELTER_SPLIT_ADDRESS="$SPLIT" \
SHELTER_DONATE_AMOUNT_WEI=10000000000000000 \
SHELTER_DONATE_DAILY_BUDGET_WEI=1000000000000000000 \
SHELTER_X402_ENABLED=true \
SHELTER_X402_PRICE_WEI=10000000000000000 \
SHELTER_DONATE_PRIVATE_KEY="$DONATE_KEY" \
  nohup node dist/main >>"$OUT/backend.log" 2>&1 &
BACKEND_PID=$!
for kv in "${TREAT_ENV[@]}"; do unset "${kv%%=*}"; done
unset DONATE_KEY TREAT_ENV
printf 'BACKEND_PID=%s\nSPLIT=%s\n' "$BACKEND_PID" "$SPLIT" >>"$STATE"

for _ in $(seq 1 120); do
  kill -0 "$BACKEND_PID" 2>/dev/null || { stop_stack; die "backend exited; see $OUT/backend.log"; }
  curl -fsS "http://127.0.0.1:$BE_PORT/shelter/donate/status" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$BE_PORT/shelter/donate/status" >/dev/null 2>&1 || { stop_stack; die "backend did not answer in 120 s; see $OUT/backend.log"; }

trap - INT TERM HUP
echo "backend pid $BACKEND_PID on http://localhost:$BE_PORT (log $OUT/backend.log)"
echo "ShelterSplit (Arc testnet): $SPLIT"
echo "next: node funding/e2e/seed.mjs && node funding/e2e/e2e.mjs"
