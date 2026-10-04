#!/usr/bin/env bash
# Local-only demo of the treat agent for the video. Needs Foundry and Node >= 18.
#
#   ./fork-demo.sh [transcript-file]
#
# 1. Starts anvil on 127.0.0.1:${PORT:-8548}, forking Arc testnet (public RPC, read-only).
# 2. Deploys CappedSpender with anvil's well-known dev accounts (no real keys): split = the live
#    testnet ShelterSplit, agent = dev #1, owner = dev #0, caps 0.05 / 0.10 test USDC (native, 18 dec).
# 3. Funds the float with 1 test USDC from dev #0, and dev #2 gives a 0.02 "fan gift" to ShelterSplit.
# 4. run.mjs --fork --once (agent matches the fan 1:1), then --demo-overcap (the contract refuses),
#    then a dry run (prints the founder's command).
# Everything happens on the local fork: nothing reaches Arc testnet or mainnet.
# Decisions use Claude when ANTHROPIC_API_KEY is set; otherwise the offline stub (TREAT_AGENT_FAKE_LLM=1).
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

HERE="$(cd "$(dirname "$0")" && pwd)"
SPLIT_DIR="$HERE/../shelter-split"
PORT="${PORT:-8548}"
R="http://127.0.0.1:$PORT"
UPSTREAM="${FORK_URL:-https://rpc.testnet.arc.io}"
SPLIT="${SPLIT:-0x457c89e10a6e66633eda5bf82fd086febb5db147}"   # Arc testnet ShelterSplit (deployments.json)
PINK_PAW="0xE299299b846Ba629f5A591dBF4F562bcC07A0f37"
# anvil's public, well-known dev accounts (mnemonic "test test ... junk"); unlocked on anvil, worthless elsewhere
DEV0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEV1=0x70997970C51812dc3A010C7d01b50e0d17dC79C8
DEV2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
OUT="${1:-/dev/stdout}"
LOG_DIR="${TREAT_AGENT_LOG_DIR:-$HERE/runs}"
export TREAT_AGENT_LOG_DIR="$LOG_DIR"
mkdir -p "$LOG_DIR"
[ -n "${ANTHROPIC_API_KEY:-}" ] || export TREAT_AGENT_FAKE_LLM=1

if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is busy; set PORT=" >&2; exit 2
fi
anvil --fork-url "$UPSTREAM" --port "$PORT" --host 127.0.0.1 >"$LOG_DIR/anvil.log" 2>&1 &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do cast chain-id --rpc-url "$R" >/dev/null 2>&1 && break; sleep 1; done

SP=$(cd "$SPLIT_DIR" && forge create src/CappedSpender.sol:CappedSpender --rpc-url "$R" --unlocked --from "$DEV0" --broadcast \
  --constructor-args "$SPLIT" "$DEV1" "$DEV0" 50000000000000000 100000000000000000 true 2>/dev/null | awk '/Deployed to:/ {print $3}')
cast send "$SP" --value 1ether --rpc-url "$R" --unlocked --from "$DEV0" >/dev/null
FAN_TX=$(cast send "$SPLIT" "donate(string)" "fan gift: for the kittens" --value 0.02ether --rpc-url "$R" --unlocked --from "$DEV2" --json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).transactionHash))')

cd "$HERE"
{
  echo "# Treat agent demo, $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Local anvil fork of Arc testnet (chain $(cast chain-id --rpc-url "$R")) on 127.0.0.1:$PORT. Test USDC, no real money."
  echo "# CappedSpender $SP: split $SPLIT (the live testnet ShelterSplit, Pink Paw at 10000 bps),"
  echo "#   agent = anvil dev #1, owner = anvil dev #0, caps 0.05 test USDC per gift and 0.10 per UTC day, float 1 test USDC."
  echo "# A fan (anvil dev #2) gave 0.02 test USDC straight to ShelterSplit: $FAN_TX"
  if [ -n "${TREAT_AGENT_FAKE_LLM:-}" ]; then
    echo "# Decisions: offline stub (TREAT_AGENT_FAKE_LLM=1), same tool-call shape as Claude. Set ANTHROPIC_API_KEY for Claude."
  else
    echo "# Decisions: Claude via the Messages API."
  fi
  echo
  echo "\$ cast balance <Pink Paw> --ether   # before"
  cast balance "$PINK_PAW" --rpc-url "$R" --ether
  echo
  echo "\$ node run.mjs --rpc $R --spender $SP --fork --once"
  node run.mjs --rpc "$R" --spender "$SP" --fork --once || true
  echo
  echo "\$ cast balance <Pink Paw> --ether   # after the agent's gift"
  cast balance "$PINK_PAW" --rpc-url "$R" --ether
  echo
  echo "\$ node run.mjs --rpc $R --spender $SP --fork --demo-overcap"
  node run.mjs --rpc "$R" --spender "$SP" --fork --demo-overcap || true
  echo
  echo "\$ cast balance <Pink Paw> --ether   # unchanged: the contract refused the over-cap gift"
  cast balance "$PINK_PAW" --rpc-url "$R" --ether
  echo
  echo "\$ node run.mjs --rpc $R --spender $SP --once --keystore tt-agent   # no --fork: dry run, prints the command only"
  node run.mjs --rpc "$R" --spender "$SP" --once --keystore tt-agent || true
  echo
  echo "\$ tail -n 3 $LOG_DIR/decisions.jsonl   # decision log (decision + result only)"
  tail -n 3 "$LOG_DIR/decisions.jsonl" | node -e 'require("readline").createInterface({input:process.stdin}).on("line",l=>{const j=JSON.parse(l);console.log(JSON.stringify({decision:j.decision,status:j.result&&j.result.status,txHash:j.result&&j.result.txHash,revert:j.result&&j.result.revert}))})'
} >"$OUT" 2>&1
