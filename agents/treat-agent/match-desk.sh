#!/usr/bin/env bash
# Match Desk runbook (MATCH-DESK.md, "Runbook: testnet first"). Founder's terminal only.
#
#   ./match-desk.sh init      <testnet|mainnet> [--out <file>] [--force]
#   ./match-desk.sh deploy    <desk.json> --sponsor <id> --account <deployer> [--owner <addr>] [--agent <addr>] [--rpc-url <url>] [--force]
#   ./match-desk.sh check     <desk.json> [--sponsor <id>] [--rpc-url <url>]
#   ./match-desk.sh fund      <desk.json> --sponsor <id> --account <owner keystore> --usdc <n> [--rpc-url <url>]
#   ./match-desk.sh gas       <desk.json> --account <funder> --usdc <n> [--rpc-url <url>]
#   ./match-desk.sh verify    <desk.json> [--sponsor <id>]
#   ./match-desk.sh round     <desk.json> [run.mjs flags, e.g. --send --keystore tt-match-agent, --demo-overcap --vault <id>]
#   ./match-desk.sh statement <desk.json> [statement.mjs flags] [--no-verify-onchain]
#
# A desk.json (tt.match-desk.desk/v2) lists several sponsors, one CappedSpender vault each, all with the
# same agent. --sponsor <id> picks one vault; check and verify without it cover every vault. An old
# one-sponsor sponsor.json (v1) still works (--sponsor is then optional), and so does the old
# `deploy <testnet|mainnet> --account … --owner … --agent …` form (it only prints the address).
#
# This script never reads, stores or prints a private key. Every signing step runs forge/cast with
# --account <keystore>, so the password prompt goes to your own terminal. Subcommands that broadcast
# (deploy, fund, gas, round --send) refuse to run inside an AI session (CLAUDECODE set), and on Arc
# mainnet (5042) they need CONFIRM_MAINNET=yes. RPC: --rpc-url, else MATCH_DESK_RPC, else the chain's
# public RPC. Native USDC on Arc has 18 decimals: the caps are 50000000000000000 (0.05 USDC) per gift
# and 200000000000000000 (0.20 USDC) per UTC day, for every vault.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

HERE="$(cd "$(dirname "$0")" && pwd)"
SPLIT_DIR="$HERE/../../contracts/shelter-split"
EXAMPLE="${MATCH_DESK_EXAMPLE:-$HERE/desk.example.json}"
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
ACCOUNT="" OWNER="" AGENT="" USDC="" OUT="" FORCE="" SPONSOR_ID=""
parse_flags() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --rpc-url) RPC_URL="${2:-}"; shift 2 ;;
      --sponsor) SPONSOR_ID="${2:-}"; shift 2 ;;
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

# dq <file> <query> [sponsorId]: reads a desk.json (v2) or a sponsor.json (v1) the same way.
#   schema | chainId | split | agent | ids | count | vault <id> ("address deployBlock owner", "-" for null)
dq() {
  node -e '
    const [file, q, id] = process.argv.slice(1);
    const j = JSON.parse(require("fs").readFileSync(file, "utf8"));
    const v1 = j.schema === "tt.match-desk.sponsor/v1";
    if (!v1 && j.schema !== "tt.match-desk.desk/v2") { console.error("unknown schema " + j.schema); process.exit(3); }
    const sponsors = v1
      ? [{ id: j.sponsor.id, spender: j.spender || {} }]
      : (j.sponsors || []).map((s) => ({ id: s.id, spender: s.spender || {}, priority: s.priority || 0 }))
          .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
    const agent = v1 ? (j.spender || {}).agent : j.agent;
    const dash = (v) => (v === null || v === undefined || v === "" ? "-" : String(v));
    let out;
    switch (q) {
      case "schema": out = j.schema; break;
      case "chainId": out = String(j.chainId); break;
      case "split": out = dash(j.split); break;
      case "agent": out = dash(agent); break;
      case "ids": out = sponsors.map((s) => s.id).join(" "); break;
      case "count": out = String(sponsors.length); break;
      case "vault": {
        const s = sponsors.find((x) => x.id === id);
        if (!s) { console.error("no sponsor " + id); process.exit(4); }
        out = [dash(s.spender.address), dash(s.spender.deployBlock), dash(s.spender.owner)].join(" ");
        break;
      }
      default: console.error("bad query " + q); process.exit(5);
    }
    process.stdout.write(out);
  ' "$1" "$2" "${3:-}"
}

undash() { [ "$1" = "-" ] && echo "" || echo "$1"; }

# Loads the desk (chain, split, agent, sponsor ids) into globals.
load_desk() {
  SPONSOR_FILE="$(abspath "$1")"
  dq "$SPONSOR_FILE" schema >/dev/null 2>&1 || die "$SPONSOR_FILE: not a desk.json (tt.match-desk.desk/v2) or sponsor.json (tt.match-desk.sponsor/v1)"
  SCHEMA="$(dq "$SPONSOR_FILE" schema)"
  CHAIN="$(dq "$SPONSOR_FILE" chainId)"
  S_SPLIT="$(undash "$(dq "$SPONSOR_FILE" split)")"
  S_AGENT="$(undash "$(dq "$SPONSOR_FILE" agent)")"
  IDS="$(dq "$SPONSOR_FILE" ids)"
  case "$CHAIN" in 5042 | 5042002 | 31337) ;; *) die "$SPONSOR_FILE: chainId must be 5042, 5042002 or 31337" ;; esac
  [ -n "$RPC_URL" ] || RPC_URL="$(default_rpc "$CHAIN")"
}

# Picks one vault (--sponsor <id>, optional when the file has one sponsor) into SPENDER, DEPLOY_BLOCK, S_OWNER.
pick_vault() { # <id or "">
  local id="$1"
  if [ -z "$id" ]; then
    [ "$(dq "$SPONSOR_FILE" count)" = 1 ] || die "--sponsor <id> is required for a desk with several sponsors ($IDS)"
    id="$IDS"
  fi
  case " $IDS " in *" $id "*) ;; *) die "no sponsor '$id' in $SPONSOR_FILE (sponsors: $IDS)" ;; esac
  VAULT_ID="$id"
  local info; info="$(dq "$SPONSOR_FILE" vault "$id")"
  SPENDER="$(undash "$(echo "$info" | awk '{print $1}')")"
  DEPLOY_BLOCK="$(undash "$(echo "$info" | awk '{print $2}')")"
  S_OWNER="$(undash "$(echo "$info" | awk '{print $3}')")"
}

need_spender() {
  is_addr "$SPENDER" || die "$SPONSOR_FILE: spender.address is null for '$VAULT_ID'; deploy first and paste the address and block"
}

# ------------------------------------------------------------------ subcommands

cmd_init() {
  [ $# -ge 1 ] || usage
  local net="$1"; shift
  local chain; chain="$(net_chain "$net")"
  parse_flags "$@"
  local out="$OUT"
  if [ -z "$out" ]; then
    if [ "$net" = testnet ]; then out="$HERE/desk.arc-testnet.json"; else out="$HERE/desk.arc.json"; fi
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
  echo "wrote $out (chainId $chain). Deploy one vault per sponsor: ./match-desk.sh deploy $out --sponsor <id> --account <deployer> --owner <that company's address> --agent <agent>"
}

# Deploy one CappedSpender. New form: deploy <desk.json> --sponsor <id> (writes the vault into the file).
# Old form: deploy <testnet|mainnet> --owner ... --agent ... (prints the JSON to paste).
cmd_deploy() {
  [ $# -ge 1 ] || usage
  local target="$1"; shift
  parse_flags "$@"
  local chain file=""
  VAULT_ID=""
  case "$target" in
    testnet | mainnet) chain="$(net_chain "$target")" ;;
    *)
      load_desk "$target"
      file="$SPONSOR_FILE"; chain="$CHAIN"
      [ -n "$SPONSOR_ID" ] || [ "$(dq "$file" count)" = 1 ] || die "--sponsor <id> is required: which company's vault? ($IDS)"
      pick_vault "$SPONSOR_ID"
      if is_addr "$SPENDER" && [ -z "$FORCE" ]; then die "'$VAULT_ID' already has vault $SPENDER in $file; pass --force to deploy a new one"; fi
      [ -n "$OWNER" ] || OWNER="$S_OWNER"
      if [ -n "$S_AGENT" ] && [ -n "$AGENT" ] && [ "$(lower "$S_AGENT")" != "$(lower "$AGENT")" ]; then
        die "--agent $AGENT differs from the desk's agent $S_AGENT: every vault on a desk uses the same agent"
      fi
      [ -n "$AGENT" ] || AGENT="$S_AGENT"
      ;;
  esac
  need_account
  is_addr "$OWNER" || die "--owner <address> is required (the vault owner: that company's own wallet, never the agent)"
  is_addr "$AGENT" || die "--agent <agent EOA> is required (the tt-match-agent address, the same for every vault)"
  [ "$(lower "$OWNER")" != "$(lower "$AGENT")" ] || die "--owner and --agent must differ"
  refuse_ai deploy
  need_mainnet_ok "$chain" deploy
  [ -n "$RPC_URL" ] || RPC_URL="$(default_rpc "$chain")"
  local actual; actual="$(cast chain-id --rpc-url "$RPC_URL")"
  [ "$actual" = "$chain" ] || die "RPC is on chain $actual, expected $chain"

  export EXPECTED_CHAIN_ID="$chain" CAPPED_NATIVE=1 CAPPED_SPLIT="$ARC_SPLIT" \
    CAPPED_OWNER="$OWNER" CAPPED_AGENT="$AGENT" CAPPED_PER_TX="$PER_TX" CAPPED_DAILY="$DAILY"
  echo "== simulation (nothing is sent)${VAULT_ID:+ for sponsor '$VAULT_ID'}"
  (cd "$SPLIT_DIR" && forge script script/DeployCappedSpender.s.sol --rpc-url "$RPC_URL")
  confirm "Broadcast CappedSpender${VAULT_ID:+ for '$VAULT_ID'} (owner $OWNER, agent $AGENT) on chain $chain from keystore '$ACCOUNT'?"
  (cd "$SPLIT_DIR" && forge script script/DeployCappedSpender.s.sol --rpc-url "$RPC_URL" --account "$ACCOUNT" --broadcast)
  local run="$SPLIT_DIR/broadcast/DeployCappedSpender.s.sol/$chain/run-latest.json"
  [ -f "$run" ] || fail "no broadcast record at $run"
  node -e '
    const fs = require("fs");
    const [run, owner, agent, file, id] = process.argv.slice(1);
    const r = JSON.parse(fs.readFileSync(run, "utf8"));
    const tx = r.transactions.find((t) => t.contractName === "CappedSpender") || r.transactions[0];
    const rc = r.receipts.find((x) => x.transactionHash === tx.hash) || r.receipts[0];
    const vault = { address: tx.contractAddress.toLowerCase(), deployBlock: Number(rc.blockNumber), owner: owner.toLowerCase() };
    if (!file) {
      console.log("Paste into sponsor.json:");
      console.log(JSON.stringify({ spender: { ...vault, agent: agent.toLowerCase() } }, null, 2));
      process.exit(0);
    }
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    if (j.schema === "tt.match-desk.sponsor/v1") j.spender = { ...vault, agent: agent.toLowerCase() };
    else {
      j.agent = agent.toLowerCase();
      j.sponsors.find((s) => s.id === id).spender = vault;
    }
    fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
    console.log(`wrote ${id}: vault ${vault.address} (block ${vault.deployBlock}, owner ${vault.owner}) and agent ${agent.toLowerCase()} into ${file}`);
  ' "$run" "$OWNER" "$AGENT" "$file" "${VAULT_ID:-}"
  echo "Then: ./match-desk.sh check <desk.json>${VAULT_ID:+ --sponsor $VAULT_ID}"
}

# Read-only check of one vault (globals from pick_vault). Sets BAD=1 on a failure and ONCHAIN_AGENT.
check_vault() {
  local actual="$1"
  report() { # <label> <value> <ok 0|1>
    if [ "$3" = 0 ]; then printf '  ok    %-16s %s\n' "$1" "$2"; else printf '  FAIL  %-16s %s\n' "$1" "$2"; BAD=1; fi
  }
  echo "CappedSpender $SPENDER ($VAULT_ID) on chain $actual (read-only)"
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
  if [ -n "$S_AGENT" ]; then
    report agent "$agent" "$(holds [ "$(lower "$agent")" = "$(lower "$S_AGENT")" ])"
  else
    report agent "$agent (the desk file has no agent yet)" 1
  fi
  report owner "$owner" "$(holds [ "$(lower "$owner")" = "$(lower "$S_OWNER")" ])"
  printf '  info  %-16s %s (%s USDC)\n' floatBalance "$float" "$(cast from-wei "$float")"
  printf '  info  %-16s %s (%s USDC)\n' remainingToday "$remaining" "$(cast from-wei "$remaining")"
  [ -n "$DEPLOY_BLOCK" ] || { echo "  FAIL  deployBlock      null in $SPONSOR_FILE"; BAD=1; }
  local ex; ex="$(explorer "$CHAIN")"
  if is_local_rpc "$RPC_URL"; then
    echo "  local fork: $SPENDER exists only on this anvil, not on any explorer"
  elif [ -n "$ex" ]; then
    echo "  $ex/address/$SPENDER"
  fi
  ONCHAIN_AGENT="$(lower "$agent")"
}

cmd_check() {
  [ $# -ge 1 ] || usage
  local file="$1"; shift
  parse_flags "$@"
  load_desk "$file"
  local ids="$IDS"
  [ -z "$SPONSOR_ID" ] || ids="$SPONSOR_ID"
  local id
  for id in $ids; do
    pick_vault "$id"
    need_spender
  done
  local actual; actual="$(cast chain-id --rpc-url "$RPC_URL")"
  BAD=0
  [ "$actual" = "$CHAIN" ] || { echo "  FAIL  chainId          $actual (file: $CHAIN)"; BAD=1; }
  local agents="" vaults=""
  for id in $ids; do
    pick_vault "$id"
    check_vault "$actual"
    agents="$agents $ONCHAIN_AGENT"
    vaults="$vaults $(lower "$SPENDER")"
  done
  local n_agents n_vaults n_ids
  n_agents="$(echo "$agents" | tr ' ' '\n' | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"
  n_vaults="$(echo "$vaults" | tr ' ' '\n' | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"
  n_ids="$(echo "$ids" | wc -w | tr -d ' ')"
  if [ "$n_ids" -gt 1 ]; then
    echo "desk: $n_ids vaults"
    if [ "$n_agents" = 1 ]; then echo "  ok    one agent        $(echo "$agents" | awk '{print $1}') on every vault"; else echo "  FAIL  agents differ   $agents"; BAD=1; fi
    if [ "$n_vaults" = "$n_ids" ]; then echo "  ok    distinct vaults  $n_vaults"; else echo "  FAIL  a vault is listed twice"; BAD=1; fi
  fi
  [ "$BAD" = 0 ] || fail "check failed: do not fund these vaults"
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
  load_desk "$file"
  pick_vault "$SPONSOR_ID"
  need_spender
  [ -n "$USDC" ] || die "--usdc <n> is required"
  echo "Funding the '$VAULT_ID' vault. Only its owner ($S_OWNER) can fund it; the contract refuses anyone else (NotOwner)."
  echo "Use that company's own keystore as --account (never the agent, treat or hot wallet)."
  send_value fund "$SPENDER" "$USDC"
}

cmd_gas() {
  [ $# -ge 1 ] || usage
  local file="$1"; shift
  parse_flags "$@"
  load_desk "$file"
  is_addr "$S_AGENT" || die "$SPONSOR_FILE: the agent is null (deploy a vault first)"
  [ -n "$USDC" ] || USDC=0.05
  echo "Gas for the agent EOA $S_AGENT (Arc pays gas in USDC). One agent spends from every vault."
  send_value gas "$S_AGENT" "$USDC"
}

cmd_verify() {
  [ $# -ge 1 ] || usage
  local file="$1"; shift
  parse_flags "$@"
  load_desk "$file"
  local ids="$IDS" id
  [ -z "$SPONSOR_ID" ] || ids="$SPONSOR_ID"
  for id in $ids; do
    pick_vault "$id"
    need_spender
    is_addr "$S_OWNER" || die "$SPONSOR_FILE: '$id' has no spender.owner"
  done
  is_addr "$S_AGENT" || die "$SPONSOR_FILE: the agent must be set"
  echo "# Sourcify verification (prints only; run it in contracts/shelter-split after 'check' passes)."
  echo "# Same flow as the DonateRouters. Not yet tried on Arc for CappedSpender: run it on testnet first."
  echo "cd contracts/shelter-split"
  for id in $ids; do
    pick_vault "$id"
    echo "# $VAULT_ID"
    echo "forge verify-contract $SPENDER src/CappedSpender.sol:CappedSpender \\"
    echo "  --chain-id $CHAIN --verifier sourcify --compiler-version 0.8.24 --num-of-optimizations 200 --evm-version paris \\"
    echo "  --constructor-args \$(cast abi-encode \"constructor(address,address,address,uint256,uint256,bool)\" \\"
    echo "    $S_SPLIT $S_AGENT $S_OWNER $PER_TX $DAILY true)"
  done
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
  local chain; chain="$(dq "$file" chainId)"
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
