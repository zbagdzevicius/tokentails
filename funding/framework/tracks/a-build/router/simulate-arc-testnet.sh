#!/usr/bin/env bash
# Runs a gasless DonateRouter gift on the REAL Arc testnet node, read-only.
#
# Nothing is deployed and nothing is sent: every call is an eth_call with state overrides (the router's
# code placed at an unused address, its reentrancy slot set as the constructor would, and a test donor
# given a balance). Arc's node executes its real FiatToken and native-coin precompiles, which a local
# anvil fork cannot. The donor key is derived from a public string and is never funded: test-only.
#
# Usage: funding/framework/tracks/a-build/router/simulate-arc-testnet.sh
# Expect: five lines; bytes and v/r/s gifts return the next ShelterSplit batch id, the tampered memo
# reverts with "FiatTokenV2: invalid signature", a stale payout list reverts with RecipientsChanged,
# canDonate prints true and 0.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

RPC="${RPC_ARC_TESTNET_PUBLIC:-https://rpc.testnet.arc.io}"
SPLIT=0x457c89e10a6e66633eda5bf82fd086febb5db147
USDC=0x3600000000000000000000000000000000000000
ROUTER=0x00000000000000000000000000000000d0a7e000 # any unused address
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$HERE/../shelter-split"

(cd "$PROJECT" && forge build --silent)
INIT=$(jq -r '.bytecode.object' "$PROJECT/out/DonateRouter.sol/DonateRouter.json")
ARGS=$(cast abi-encode "c(address,address)" "$SPLIT" "$USDC")
# eth_call without `to` runs the constructor on the live node and returns the runtime code.
CODE=$(cast call --rpc-url "$RPC" --create "${INIT}${ARGS:2}")

# PUBLIC TEST KEY: never fund it; anyone can derive it from this string. It only signs eth_calls here.
KEY=$(cast keccak "tokentails.donate-router.fork.donor")
DONOR=$(cast wallet address --private-key "$KEY")
MEMO="tt:sim:arc-testnet"
SALT=$(cast keccak "$MEMO")
VALUE=10000 # 0.01 USDC in the 6-decimal ERC-20 view
MAX=115792089237316195423570985008687907853269984665640564039457584007913129639935
OV=(--override-code "$ROUTER:$CODE" --override-state-diff "$ROUTER:0x0:0x1" --override-balance "$DONOR:1000000000000000000")

# The payout list the donor signs (every shelter wallet and its exact amount for VALUE).
RH=$(cast call "$ROUTER" "recipientsHash(uint256)(bytes32)" $VALUE --rpc-url "$RPC" "${OV[@]}")
NONCE=$(cast call "$ROUTER" "authNonce(bytes32,string,bytes32)(bytes32)" "$SALT" "$MEMO" "$RH" --rpc-url "$RPC" "${OV[@]}")
DS=$(cast call "$USDC" "DOMAIN_SEPARATOR()(bytes32)" --rpc-url "$RPC")
TH=$(cast keccak "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
SH=$(cast keccak "$(cast abi-encode "f(bytes32,address,address,uint256,uint256,uint256,bytes32)" "$TH" "$DONOR" "$ROUTER" $VALUE 0 $MAX "$NONCE")")
DIGEST=$(cast keccak "0x1901${DS:2}${SH:2}")
SIG=$(cast wallet sign --no-hash --private-key "$KEY" "$DIGEST")
V=$((16#${SIG:130:2})); R=0x${SIG:2:64}; S=0x${SIG:66:64}
RELAYER=0x000000000000000000000000000000000000dEaD

GIFT="($DONOR,$VALUE,0,$MAX,$SALT,$RH)"
AUTH_SIG="donateWithAuthorization((address,uint256,uint256,uint256,bytes32,bytes32),string,bytes)(uint256)"
VRS_SIG="donateWithAuthorizationVRS((address,uint256,uint256,uint256,bytes32,bytes32),string,uint8,bytes32,bytes32)(uint256)"
ERR="${TMPDIR:-/tmp}/router-sim.err"

printf 'bytes overload, batch id: '
cast call "$ROUTER" "$AUTH_SIG" "$GIFT" "$MEMO" "$SIG" --from $RELAYER --rpc-url "$RPC" "${OV[@]}"
printf 'v/r/s overload, batch id: '
cast call "$ROUTER" "$VRS_SIG" "$GIFT" "$MEMO" $V "$R" "$S" --from $RELAYER --rpc-url "$RPC" "${OV[@]}"
printf 'tampered memo: '
if cast call "$ROUTER" "$AUTH_SIG" "$GIFT" "tt:tampered" "$SIG" --from $RELAYER --rpc-url "$RPC" "${OV[@]}" >/dev/null 2>"$ERR"; then
  echo "UNEXPECTED: accepted"; exit 1
else
  grep -o 'FiatTokenV2: invalid signature' "$ERR" | head -1 || { cat "$ERR"; exit 1; }
fi
printf 'stale payout list: '
STALE="($DONOR,$VALUE,0,$MAX,$SALT,$(cast keccak stale))"
if cast call "$ROUTER" "$AUTH_SIG" "$STALE" "$MEMO" "$SIG" --from $RELAYER --rpc-url "$RPC" "${OV[@]}" >/dev/null 2>"$ERR"; then
  echo "UNEXPECTED: accepted"; exit 1
else
  # RecipientsChanged(bytes32,bytes32) selector; cast may print the raw revert data.
  if grep -q "$(cast sig 'RecipientsChanged(bytes32,bytes32)')\|RecipientsChanged" "$ERR"; then echo RecipientsChanged; else cat "$ERR"; exit 1; fi
fi
printf 'canDonate(1 USDC): '
cast call "$ROUTER" "canDonate(uint256)(bool,uint256)" 1000000 --rpc-url "$RPC" "${OV[@]}" | tr '\n' ' '; echo
