#!/usr/bin/env bash
# Sponsor Match Desk runbook (MATCH-DESK.md, "Runbook: testnet first"). Founder's terminal only.
#
#   ./match-desk.sh init      <testnet|mainnet> [--out <file>] [--force]
#   ./match-desk.sh deploy    <testnet|mainnet> --account <deployer> --owner <sponsorAddr> --agent <agentAddr> [--rpc-url <url>]
#   ./match-desk.sh check     <sponsor.json> [--rpc-url <url>]
#   ./match-desk.sh fund      <sponsor.json> --account <owner> --usdc <n> [--rpc-url <url>]
#   ./match-desk.sh gas       <sponsor.json> --account <funder> --usdc <n> [--rpc-url <url>]
#   ./match-desk.sh verify    <sponsor.json>
#   ./match-desk.sh round     <sponsor.json> [run.mjs flags]
#   ./match-desk.sh statement <sponsor.json> [statement.mjs flags] [--no-verify-onchain]
#
# This script never reads, stores or prints a private key. Every signing step runs forge/cast with
# --account <keystore>, so the password prompt goes to your own terminal. Subcommands that broadcast
# (deploy, fund, gas, round --send) refuse to run inside an AI session (CLAUDECODE set), and on Arc
# mainnet (5042) they need CONFIRM_MAINNET=yes. RPC: --rpc-url, else MATCH_DESK_RPC, else the chain's
# public RPC. Native USDC on Arc has 18 decimals: the caps are 50000000000000000 (0.05 USDC) per gift
# and 200000000000000000 (0.20 USDC) per UTC day.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

HERE="$(cd "$(dirname "$0")" && pwd)"
SPLIT_DIR="$HERE/../../contracts/shelter-split"
EXAMPLE="${MATCH_DESK_EXAMPLE:-$HERE/sponsor.example.json}"
PER_TX=50000000000000000      # 0.05 USDC, 18 decimals (native USDC on Arc)
DAILY=200000000000000000      # 0.20 USDC
ARC_SPLIT=0x457c89e10a6e66633eda5bf82fd086febb5db147          # ShelterSplit (USDC), same address on Arc and Arc testnet
ARC_ROUTER_MAINNET=0x937f13ce28294011567615330dbcb859a06a0bba # DonateRouter USDC, Arc (routers.json)
ARC_ROUTER_TESTNET=0xa1cf1db2042dea0f169b1acdab479d4f17852860 # DonateRouter USDC, Arc testnet (routers.json)

die() { echo "match-desk: $*" >&2; exit 2; }
fail() { echo "match-desk: $*" >&2; exit 1; }

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

refuse_ai() {
  if [ -n "${CLAUDECODE:-}" ]; then
    die "refused: '$1' broadcasts a transaction and CLAUDECODE is set (an AI session). Run it in your own terminal."
  fi
}

need_mainnet_ok() { # <chainId> <what>
  if [ "$1" = "5042" ] && [ "${CONFIRM_MAINNET:-}" != "yes" ]; then
    die "refused: '$2' on Arc mainnet (5042) needs CONFIRM_MAINNET=yes"
  fi
}

net_chain() {
  case "$1" in
    testnet) echo 5042002 ;;
    mainnet) echo 5042 ;;
    *) die "network must be testnet or mainnet, got '$1'" ;;
  esac
}

default_rpc() {
  case "$1" in
    5042) echo "https://rpc.mainnet.arc.io" ;;
    5042002) echo "https://rpc.testnet.arc.io" ;;
    31337) echo "http://127.0.0.1:8545" ;;
    *) die "no default RPC for chain $1; pass --rpc-url" ;;
  esac
}

explorer() {
  case "$1" in
    5042) echo "https://explorer.arc.io" ;;
    5042002) echo "https://explorer.testnet.arc.io" ;;
    *) echo "" ;;
  esac
}

# A local anvil (a fork rehearsal): its txs and addresses exist on no public explorer.
is_local_rpc() { [[ "$1" =~ ^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/|$) ]]; }

holds() { if "$@"; then echo 0; else echo 1; fi; }
is_addr() { [[ "$1" =~ ^0x[0-9a-fA-F]{40}$ ]]; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# jget <file> <dot.path>: prints the value ("" for null or missing).
jget() {
  node -e '
    const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    let v = j;
    for (const k of process.argv[2].split(".")) v = v == null ? undefined : v[k];
    process.stdout.write(v == null ? "" : String(v));
  ' "$1" "$2"
}

abspath() { # an existing file
  [ -f "$1" ] || die "no such file: $1"
  printf '%s/%s' "$(cd "$(dirname "$1")" && pwd)" "$(basename "$1")"
}

confirm() {
  local answer=""
  if [ -r /dev/tty ]; then
    read -r -p "$1 [y/N] " answer </dev/tty || true
  fi
  case "$answer" in y | Y | yes) return 0 ;; *) echo "aborted" >&2; exit 2 ;; esac
}

# Common flags: --rpc-url, --account, --owner, --agent, --usdc, --out, --force.
RPC_URL="${MATCH_DESK_RPC:-}"
ACCOUNT="" OWNER="" AGENT="" USDC="" OUT="" FORCE=""
parse_flags() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --rpc-url) RPC_URL="${2:-}"; shift 2 ;;
      --account) ACCOUNT="${2:-}"; shift 2 ;;
      --owner) OWNER="${2:-}"; shift 2 ;;
      --agent) AGENT="${2:-}"; shift 2 ;;
      --usdc) USDC="${2:-}"; shift 2 ;;
      --out) OUT="${2:-}"; shift 2 ;;
      --force) FORCE=1; shift ;;
      *) die "unknown flag: $1" ;;
    esac
  done
}

need_account() {
  [ -n "$ACCOUNT" ] || die "--account <keystore name> is required (cast wallet import <name> --interactive)"
  [ "$ACCOUNT" != "<keystore>" ] || die "--account must be a real keystore name"
}

valid_usdc() {
  [[ "$1" =~ ^[0-9]+(\.[0-9]{1,6})?$ ]] || die "--usdc must be a decimal with at most 6 decimals, got '$1'"
  [[ "$1" =~ [1-9] ]] || die "--usdc must be more than 0"
}

# Loads chain, spender and addresses from a sponsor file into globals.
load_sponsor() {
  SPONSOR_FILE="$(abspath "$1")"
  CHAIN="$(jget "$SPONSOR_FILE" chainId)"
  SPENDER="$(jget "$SPONSOR_FILE" spender.address)"
  DEPLOY_BLOCK="$(jget "$SPONSOR_FILE" spender.deployBlock)"
  S_OWNER="$(jget "$SPONSOR_FILE" spender.owner)"
  S_AGENT="$(jget "$SPONSOR_FILE" spender.agent)"
  S_SPLIT="$(jget "$SPONSOR_FILE" split)"
  case "$CHAIN" in 5042 | 5042002 | 31337) ;; *) die "$SPONSOR_FILE: chainId must be 5042, 5042002 or 31337" ;; esac
  [ -n "$RPC_URL" ] || RPC_URL="$(default_rpc "$CHAIN")"
}

need_spender() {
  is_addr "$SPENDER" || die "$SPONSOR_FILE: spender.address is null; deploy first and paste the address and block"
}

# ------------------------------------------------------------------ subcommands

cmd_init() {
  [ $# -ge 1 ] || usage
  local net="$1"; shift
  local chain; chain="$(net_chain "$net")"
  parse_flags "$@"
  local out="$OUT"
  if [ -z "$out" ]; then
    if [ "$net" = testnet ]; then out="$HERE/sponsor.arc-testnet.json"; else out="$HERE/sponsor.arc.json"; fi
  fi
  [ -f "$EXAMPLE" ] || die "missing $EXAMPLE"
  if [ -e "$out" ] && [ -z "$FORCE" ]; then die "$out exists; pass --force to overwrite"; fi
  local router="$ARC_ROUTER_MAINNET"
  [ "$net" = testnet ] && router="$ARC_ROUTER_TESTNET"
  node -e '
    const fs = require("fs");
    const [src, dst, chain, router] = process.argv.slice(1);
    const j = JSON.parse(fs.readFileSync(src, "utf8"));
    j.chainId = Number(chain);
    j.router = router;
    j.policy.eligible.chains = [Number(chain)];
    fs.writeFileSync(dst, JSON.stringify(j, null, 2) + "\n");
  ' "$EXAMPLE" "$out" "$chain" "$router"
  echo "wrote $out (chainId $chain). After the deploy, fill spender.address, deployBlock, owner and agent."
}

cmd_deploy() {
  [ $# -ge 1 ] || usage
  local net="$1"; shift
  local chain; chain="$(net_chain "$net")"
  parse_flags "$@"
  need_account
  is_addr "$OWNER" || die "--owner <sponsor address> is required (the vault owner: the sponsor, never the agent)"
  is_addr "$AGENT" || die "--agent <agent EOA> is required (a new tt-match-agent address)"
  [ "$(lower "$OWNER")" != "$(lower "$AGENT")" ] || die "--owner and --agent must differ"
  refuse_ai deploy
  need_mainnet_ok "$chain" deploy
  [ -n "$RPC_URL" ] || RPC_URL="$(default_rpc "$chain")"
  local actual; actual="$(cast chain-id --rpc-url "$RPC_URL")"
  [ "$actual" = "$chain" ] || die "RPC is on chain $actual, expected $chain"

  export EXPECTED_CHAIN_ID="$chain" CAPPED_NATIVE=1 CAPPED_SPLIT="$ARC_SPLIT" \
    CAPPED_OWNER="$OWNER" CAPPED_AGENT="$AGENT" CAPPED_PER_TX="$PER_TX" CAPPED_DAILY="$DAILY"
  echo "== simulation (nothing is sent)"
  (cd "$SPLIT_DIR" && forge script script/DeployCappedSpender.s.sol --rpc-url "$RPC_URL")
  confirm "Broadcast CappedSpender on chain $chain from keystore '$ACCOUNT'?"
  (cd "$SPLIT_DIR" && forge script script/DeployCappedSpender.s.sol --rpc-url "$RPC_URL" --account "$ACCOUNT" --broadcast)
  local run="$SPLIT_DIR/broadcast/DeployCappedSpender.s.sol/$chain/run-latest.json"
  [ -f "$run" ] || fail "no broadcast record at $run"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const tx = r.transactions.find((t) => t.contractName === "CappedSpender") || r.transactions[0];
    const rc = r.receipts.find((x) => x.transactionHash === tx.hash) || r.receipts[0];
    console.log("Paste into sponsor.json:");
    console.log(JSON.stringify({ spender: { address: tx.contractAddress.toLowerCase(), deployBlock: Number(rc.blockNumber),
      owner: process.argv[2].toLowerCase(), agent: process.argv[3].toLowerCase() } }, null, 2));
  ' "$run" "$OWNER" "$AGENT"
  echo "Then: ./match-desk.sh check <sponsor.json>"
}

cmd_check() {
  [ $# -ge 1 ] || usage
  local file="$1"; shift
  parse_flags "$@"
  load_sponsor "$file"
  need_spender
  local actual; actual="$(cast chain-id --rpc-url "$RPC_URL")"
  local bad=0
  report() { # <label> <value> <ok 0|1>
    if [ "$3" = 0 ]; then printf '  ok    %-16s %s\n' "$1" "$2"; else printf '  FAIL  %-16s %s\n' "$1" "$2"; bad=1; fi
  }
  echo "CappedSpender $SPENDER on chain $actual (read-only)"
  report chainId "$actual (file: $CHAIN)" "$(holds [ "$actual" = "$CHAIN" ])"
  local native per daily split agent owner float remaining
  native="$(cast call "$SPENDER" "native()(bool)" --rpc-url "$RPC_URL")"
  per="$(cast call "$SPENDER" "perTxCap()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')"
  daily="$(cast call "$SPENDER" "dailyCap()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')"
  split="$(cast call "$SPENDER" "split()(address)" --rpc-url "$RPC_URL")"
  agent="$(cast call "$SPENDER" "agent()(address)" --rpc-url "$RPC_URL")"
  owner="$(cast call "$SPENDER" "owner()(address)" --rpc-url "$RPC_URL")"
  float="$(cast call "$SPENDER" "floatBalance()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')"
  remaining="$(cast call "$SPENDER" "remainingToday()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')"
  report native "$native" "$(holds [ "$native" = true ])"
  report perTxCap "$per (want $PER_TX = 0.05 USDC)" "$(holds [ "$per" = "$PER_TX" ])"
  report dailyCap "$daily (want $DAILY = 0.20 USDC)" "$(holds [ "$daily" = "$DAILY" ])"
  report split "$split" "$(holds [ "$(lower "$split")" = "$(lower "$S_SPLIT")" ])"
  report agent "$agent" "$(holds [ "$(lower "$agent")" = "$(lower "$S_AGENT")" ])"
  report owner "$owner" "$(holds [ "$(lower "$owner")" = "$(lower "$S_OWNER")" ])"
  printf '  info  %-16s %s (%s USDC)\n' floatBalance "$float" "$(cast from-wei "$float")"
  printf '  info  %-16s %s (%s USDC)\n' remainingToday "$remaining" "$(cast from-wei "$remaining")"
  [ -n "$DEPLOY_BLOCK" ] || { echo "  FAIL  deployBlock      null in $SPONSOR_FILE"; bad=1; }
  local ex; ex="$(explorer "$CHAIN")"
  if is_local_rpc "$RPC_URL"; then
    echo "  local fork: $SPENDER exists only on this anvil, not on any explorer"
  elif [ -n "$ex" ]; then
    echo "  $ex/address/$SPENDER"
  fi
  [ "$bad" = 0 ] || fail "check failed: do not fund this spender"
  echo "check passed"
}

send_value() { # <what> <to> <usdc>
  need_account
  valid_usdc "$USDC"
  refuse_ai "$1"
  need_mainnet_ok "$CHAIN" "$1"
  local actual; actual="$(cast chain-id --rpc-url "$RPC_URL")"
  [ "$actual" = "$CHAIN" ] || die "RPC is on chain $actual, expected $CHAIN"
  echo "cast send $2 --value ${USDC}ether --rpc-url <rpc> --account $ACCOUNT   # native USDC, 18 decimals: 1ether = 1 USDC"
  confirm "Send $USDC USDC to $2 on chain $CHAIN from keystore '$ACCOUNT'?"
  cast send "$2" --value "${USDC}ether" --rpc-url "$RPC_URL" --account "$ACCOUNT"
}

cmd_fund() {
  [ $# -ge 1 ] || usage
  local file="$1"; shift
  parse_flags "$@"
  load_sponsor "$file"
  need_spender
  [ -n "$USDC" ] || die "--usdc <n> is required"
  echo "Funding the float. Only the owner ($S_OWNER) can fund it; the contract refuses anyone else (NotOwner)."
  send_value fund "$SPENDER" "$USDC"
}

cmd_gas() {
  [ $# -ge 1 ] || usage
  local file="$1"; shift
  parse_flags "$@"
  load_sponsor "$file"
  is_addr "$S_AGENT" || die "$SPONSOR_FILE: spender.agent is null"
  [ -n "$USDC" ] || USDC=0.05
  echo "Gas for the agent EOA $S_AGENT (Arc pays gas in USDC)."
  send_value gas "$S_AGENT" "$USDC"
}

cmd_verify() {
  [ $# -ge 1 ] || usage
  local file="$1"; shift
  parse_flags "$@"
  load_sponsor "$file"
  need_spender
  is_addr "$S_AGENT" && is_addr "$S_OWNER" || die "$SPONSOR_FILE: spender.agent and spender.owner must be set"
  cat <<EOF
# Sourcify verification (prints only; run it in contracts/shelter-split after 'check' passes).
# Same flow as the DonateRouters. Not yet tried on Arc for CappedSpender: run it on testnet first.
cd contracts/shelter-split
forge verify-contract $SPENDER src/CappedSpender.sol:CappedSpender \\
  --chain-id $CHAIN --verifier sourcify --compiler-version 0.8.24 --num-of-optimizations 200 --evm-version paris \\
  --constructor-args \$(cast abi-encode "constructor(address,address,address,uint256,uint256,bool)" \\
    $S_SPLIT $S_AGENT $S_OWNER $PER_TX $DAILY true)
EOF
}

cmd_round() {
  [ $# -ge 1 ] || usage
  local file; file="$(abspath "$1")"; shift
  local a has_once=""
  for a in "$@"; do
    case "$a" in
      --send) refuse_ai "round --send" ;;
      --once) has_once=1 ;;
    esac
  done
  cd "$HERE"
  if [ -n "$has_once" ]; then
    exec node run.mjs --sponsor "$file" "$@"
  fi
  exec node run.mjs --sponsor "$file" --once "$@"
}

cmd_statement() {
  [ $# -ge 1 ] || usage
  local file; file="$(abspath "$1")"; shift
  local chain; chain="$(jget "$file" chainId)"
  local a has_rpc="" has_verify="" no_verify=""
  local -a rest=()
  for a in "$@"; do
    case "$a" in
      --rpc | --rpc=*) has_rpc=1; rest+=("$a") ;;
      --verify-onchain) has_verify=1; rest+=("$a") ;;
      --no-verify-onchain) no_verify=1 ;;
      *) rest+=("$a") ;;
    esac
  done
  # Arc mainnet: the public totals are re-checked against the chain (read-only AgentGift reads) unless
  # the founder opts out with --no-verify-onchain; the page then says "not re-checked against the chain".
  if [ "$chain" = "5042" ] && [ -z "$no_verify" ]; then
    [ -n "$has_verify" ] || rest+=(--verify-onchain)
    [ -n "$has_rpc" ] || rest+=(--rpc "${RPC_URL:-$(default_rpc 5042)}")
  fi
  cd "$HERE"
  exec node statement.mjs --sponsor "$file" --out ../../client/public/match-desk ${rest[@]+"${rest[@]}"}
}

[ $# -ge 1 ] || usage
sub="$1"; shift
case "$sub" in
  init) cmd_init "$@" ;;
  deploy) cmd_deploy "$@" ;;
  check) cmd_check "$@" ;;
  fund) cmd_fund "$@" ;;
  gas) cmd_gas "$@" ;;
  verify) cmd_verify "$@" ;;
  round) cmd_round "$@" ;;
  statement) cmd_statement "$@" ;;
  -h | --help | help) usage ;;
  *) echo "match-desk: unknown subcommand '$sub'" >&2; usage ;;
esac
