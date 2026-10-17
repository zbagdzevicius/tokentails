#!/usr/bin/env bash
# Local-only demo of the treat agent for the video. Needs Foundry and Node >= 18.
#
#   ./fork-demo.sh [transcript-file]                  the treat-agent demo (default, steps 1-4 below)
#   ./fork-demo.sh --match-desk [transcript-file]     the Match Desk demo with two sponsors' vaults and
#                                                     one agent (MATCH-DESK.md, B4; see match_desk_demo
#                                                     below); exits non-zero if any expectation fails,
#                                                     so it is also an e2e test
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
SPLIT_DIR="$HERE/../../contracts/shelter-split"
PORT="${PORT:-8548}"
R="http://127.0.0.1:$PORT"
UPSTREAM="${FORK_URL:-https://rpc.testnet.arc.io}"
# FORK_CHAIN_ID: the fork's chain id. For a rehearsal on Arc mainnet state, keep an Arc testnet id:
#   FORK_URL=https://rpc.mainnet.arc.io FORK_CHAIN_ID=5042002 SPLIT=<mainnet split> ./fork-demo.sh --match-desk
# (run.mjs refuses --fork with chainId 5042, and native-mode deploys need an Arc chain id).
FORK_CHAIN_ID="${FORK_CHAIN_ID:-}"
case "$UPSTREAM" in
  https://rpc.testnet.arc.io*) FORK_LABEL="Arc testnet" ;;
  https://rpc.mainnet.arc.io*) FORK_LABEL="Arc mainnet state" ;;
  *) FORK_LABEL="the FORK_URL chain" ;; # never print the URL: a provider URL can carry a key
esac
SPLIT="${SPLIT:-0x457c89e10a6e66633eda5bf82fd086febb5db147}"   # Arc testnet ShelterSplit (deployments.json)
PINK_PAW="0xE299299b846Ba629f5A591dBF4F562bcC07A0f37"
# anvil's public, well-known dev accounts (mnemonic "test test ... junk"); unlocked on anvil, worthless elsewhere
DEV0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEV1=0x70997970C51812dc3A010C7d01b50e0d17dC79C8
DEV2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
DEV3=0x90F79bf6EB2c4f870365E785982E1f101E93b906
DEV4=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
DEV5=0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
# Motored.lt's real vault owner (keystore "motored", the "motored-sponsor" wallet). On the fork it is only
# impersonated through anvil (anvil_impersonateAccount + anvil_setBalance): no key is used or needed.
MOTORED_OWNER="${MOTORED_OWNER:-0xFe7D5aA030d14213Bf1684d4c28FE7f32A4Dbc8d}"
MODE=treat
if [ "${1:-}" = "--match-desk" ]; then MODE=match-desk; shift; fi
OUT="${1:-/dev/stdout}"
if [ "$MODE" = match-desk ]; then
  LOG_DIR="${TREAT_AGENT_LOG_DIR:-$HERE/runs/match-desk-demo}"
else
  LOG_DIR="${TREAT_AGENT_LOG_DIR:-$HERE/runs}"
fi
export TREAT_AGENT_LOG_DIR="$LOG_DIR"
mkdir -p "$LOG_DIR"
[ -n "${ANTHROPIC_API_KEY:-}" ] || export TREAT_AGENT_FAKE_LLM=1

# ---------------------------------------------------------------------------------------------
# --match-desk: the multi-sponsor Match Desk on the same local fork (MATCH-DESK.md, B4). MATCH_DESK_API=off,
# so no Token Tails endpoint is called. Two companies each own a vault: Motored.lt's real owner address
# ($MOTORED_OWNER, impersonated on the fork only), dev #4 stands in for Token Tails. Both vaults have the same agent (dev #1) and the runbook caps
# (0.05 / 0.20 test USDC, native 18 decimals). Motored.lt is matched first (priority 20) but has a small
# budget (0.03), so the second match falls to Token Tails' vault. Every step is checked; any failed
# expectation makes the script exit 1.
match_desk_demo() {
  local DEV6=0x976EA74026E726554dB657fA54763abd0C3a0aa9
  local MD_DIR="$LOG_DIR/state" DESK="$LOG_DIR/desk.fork.json" STMT="$LOG_DIR/statement"
  local CHAIN SP_A SP_B BLOCK_A BLOCK_B DESK_DIR RCPT RC=0 FAILS=0 PP_BEFORE PP_AFTER FILL=0
  rm -rf "$MD_DIR" "$STMT" "$LOG_DIR/decisions.jsonl"
  export MATCH_DESK_DIR="$MD_DIR" MATCH_DESK_API=off MATCH_DESK_CALL_GAP_MS=0
  unset TREAT_AGENT_FAKE_WRONG

  cd "$HERE"
  CHAIN=$(cast chain-id --rpc-url "$R")
  # Deploy through the founder's own script (script/DeployCappedSpender.s.sol, the same path as
  # `match-desk.sh deploy`), so a broken deploy script fails this demo too. Unlocked anvil dev #0 only.
  # Same agent (dev #1) for both vaults; each vault's owner is its company.
  deploy_vault() { # <owner> <label>: prints "address block"
    local log="$LOG_DIR/deploy-$2.log" run_json
    if ! (cd "$SPLIT_DIR" && EXPECTED_CHAIN_ID="$CHAIN" CAPPED_NATIVE=1 CAPPED_SPLIT="$SPLIT" CAPPED_AGENT="$DEV1" CAPPED_OWNER="$1" \
          CAPPED_PER_TX=50000000000000000 CAPPED_DAILY=200000000000000000 \
          forge script script/DeployCappedSpender.s.sol --rpc-url "$R" --broadcast --unlocked --sender "$DEV0" >"$log" 2>&1); then
      echo "match-desk demo: DeployCappedSpender.s.sol failed on the fork ($2); see $log" >&2
      tail -n 20 "$log" >&2
      return 1
    fi
    run_json="$SPLIT_DIR/broadcast/DeployCappedSpender.s.sol/$CHAIN/run-latest.json"
    node -e '
      const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const tx = r.transactions.find((t) => t.contractName === "CappedSpender") || r.transactions[0];
      const rc = r.receipts.find((x) => x.transactionHash === tx.hash) || r.receipts[0];
      console.log(tx.contractAddress.toLowerCase() + " " + Number(BigInt(rc.blockNumber)));' "$run_json"
  }
  local va vb
  # Impersonate Motored.lt's owner on the local fork and give it fork-only gas and float.
  cast rpc anvil_impersonateAccount "$MOTORED_OWNER" --rpc-url "$R" >/dev/null
  cast rpc anvil_setBalance "$MOTORED_OWNER" 0x8ac7230489e80000 --rpc-url "$R" >/dev/null
  va=$(deploy_vault "$MOTORED_OWNER" motored) || return 1
  vb=$(deploy_vault "$DEV4" tokentails) || return 1
  SP_A=${va% *}; BLOCK_A=${va#* }
  SP_B=${vb% *}; BLOCK_B=${vb#* }
  # Each company funds its own vault (receive() accepts only the owner).
  cast send "$SP_A" --value 1ether --rpc-url "$R" --unlocked --from "$MOTORED_OWNER" >/dev/null
  cast send "$SP_B" --value 1ether --rpc-url "$R" --unlocked --from "$DEV4" >/dev/null

  # desk.fork.json: the example's shape with fork values (validFrom = now - 1 h). excludedSenders are
  # the example's Token Tails wallets (only skipped, never paid), so a fork of mainnet state shows the
  # exclusion working instead of matching a real Token Tails gift. Both owners and vaults are excluded
  # by code too.
  SP_A="$SP_A" SP_B="$SP_B" BLOCK_A="$BLOCK_A" BLOCK_B="$BLOCK_B" CHAIN="$CHAIN" SPLIT="$SPLIT" OWNER_A="$MOTORED_OWNER" OWNER_B="$DEV4" AGENT="$DEV1" \
    PINK_PAW="$PINK_PAW" EXAMPLE="$HERE/desk.example.json" node -e '
    const e = process.env, day = (ms) => new Date(ms).toISOString().slice(0, 10), now = Date.now();
    const example = JSON.parse(require("fs").readFileSync(e.EXAMPLE, "utf8"));
    const validFrom = new Date(now - 3600e3).toISOString().replace(/\.\d+Z$/, "Z");
    const terms = (budget, perGift) => ({
      ratioBps: 10000, perGiftMaxUsdc: perGift, budgetUsdc: budget, validFrom,
      pace: { from: day(now), to: day(now + 30 * 864e5), floatLowUsdc: "0.10" },
      refund: { after: day(now + 30 * 864e5), to: "owner" },
    });
    const j = {
      schema: "tt.match-desk.desk/v2",
      chainId: Number(e.CHAIN),
      split: e.SPLIT.toLowerCase(),
      router: null,
      shelter: { name: "Pink Paw (Rožinė pėdutė)", wallet: e.PINK_PAW, custody: "held-by-token-tails" },
      agent: e.AGENT.toLowerCase(),
      policy: {
        perDonorDailyMaxUsdc: "0.05", minGiftUsdc: "0.01", maxGiftAgeHours: 48,
        eligible: { chains: [Number(e.CHAIN)], kinds: ["public", "router-native", "router-authorization"],
                    senders: "any", matchTreats: false, treatsDailyMaxUsdc: "0" },
        excludedSenders: example.policy.excludedSenders,
        farming: { maxGiftsPerDonorDay: 5 },
        plannedTtlMinutes: 30,
      },
      sponsors: [
        { id: "motored", name: "Motored.lt", relatedParty: true, relation: "founder'"'"'s company",
          spender: { address: e.SP_A, deployBlock: Number(e.BLOCK_A), owner: e.OWNER_A.toLowerCase() }, priority: 20, ...terms("0.03", "0.03") },
        { id: "tokentails", name: "Token Tails", relatedParty: true, relation: "operator (Token Tails'"'"' own money)",
          spender: { address: e.SP_B, deployBlock: Number(e.BLOCK_B), owner: e.OWNER_B.toLowerCase() }, priority: 10, ...terms("1.00", "0.05") },
      ],
    };
    require("fs").writeFileSync(process.argv[1], JSON.stringify(j, null, 2) + "\n");
  ' "$DESK"
  DESK_DIR=$(SP_A="$SP_A" SP_B="$SP_B" node --input-type=module -e '
    import { deskStateDir } from "./lib/receipt.mjs";
    console.log(deskStateDir(process.argv[1], Number(process.argv[2]), [process.env.SP_A, process.env.SP_B]));' "$MD_DIR" "$CHAIN")
  RCPT="$DESK_DIR/receipts"

  PP_BEFORE=$(cast balance "$PINK_PAW" --rpc-url "$R")
  fan() { # <from> <usdc> <memo>
    cast send "$SPLIT" "donate(string)" "$3" --value "$2ether" --rpc-url "$R" --unlocked --from "$1" --json \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).transactionHash))'
  }
  expect() { # <what> <command...>
    local what="$1"; shift
    if "$@"; then echo "# ok: $what"; else echo "# FAILED: $what"; FAILS=$((FAILS + 1)); fi
  }
  md() { # run.mjs --sponsor <desk> with the fork RPC; sets RC
    echo "\$ node run.mjs --sponsor desk.fork.json --rpc $R $*"
    set +e; node run.mjs --sponsor "$DESK" --rpc "$R" "$@"; RC=$?; set -e
    echo "# exit $RC"
  }
  count() { # <status> [sponsor]: receipts with that status (from that sponsor's vault)
    node -e '
      const fs = require("fs"), [dir, st, sp] = process.argv.slice(1);
      let n = 0;
      try {
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith(".json")) continue;
          const e = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
          if (e.status === st && (!sp || e.receipt.sponsor === sp)) n++;
        }
      } catch {}
      console.log(n);' "$RCPT" "$1" "${2:-}"
  }
  lastlog() { # <js expression over j = the last decisions.jsonl line>: true/false
    node -e '
      let ok = false;
      try {
        const ls = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
        const j = JSON.parse(ls[ls.length - 1]);
        ok = Boolean(eval(process.argv[2]));
      } catch {}
      process.exit(ok ? 0 : 1);' "$LOG_DIR/decisions.jsonl" "$1"
  }
  is() { [ "$1" = "$2" ]; }

  cd "$HERE"
  {
    echo "# Match Desk demo (two sponsors, one agent), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "# Local anvil fork of $FORK_LABEL (chain id $CHAIN) on 127.0.0.1:$PORT. Fork balances only, no real money; nothing reaches a public network."
    echo "# Vault A (Motored.lt, related-party sponsor (founder's company)): $SP_A (block $BLOCK_A), owner = $MOTORED_OWNER (Motored.lt's wallet, impersonated on the fork)."
    echo "# Vault B (Token Tails, operator's own money):                     $SP_B (block $BLOCK_B), owner = anvil dev #4."
    echo "# Both: agent = anvil dev #1 (the same agent), split $SPLIT (Pink Paw at 10000 bps), caps 0.05 test USDC per gift"
    echo "#   and 0.20 per UTC day, float 1 test USDC each, funded by each owner. The testnet split pays a wallet Token Tails holds."
    echo "# Desk policy: 1:1, at most 0.05 per donor per UTC day across both sponsors. Motored.lt is matched first (priority 20)"
    echo "#   with a 0.03 budget; Token Tails (priority 10) has 1.00. Code picks the paying vault; one match is paid by one vault."
    echo "# Backend endpoints off (MATCH_DESK_API=off)."
    if [ -n "${TREAT_AGENT_FAKE_LLM:-}" ]; then
      echo "# Decisions: offline stub (TREAT_AGENT_FAKE_LLM=1), same tool-call shape as Claude. Set ANTHROPIC_API_KEY for Claude."
    else
      echo "# Decisions: Claude via the Messages API (the checker-rejection step always uses the stub)."
    fi
    echo
    echo "\$ ./match-desk.sh check desk.fork.json   # read-only, every vault: native, caps, split, agent, owner; one agent on all"
    expect "check passes on the fork (both vaults, one agent)" ./match-desk.sh check "$DESK" --rpc-url "$R"
    echo
    echo "# Fans give straight to ShelterSplit: dev #2 gives 0.02, then dev #6 gives 0.03."
    echo "  $(fan "$DEV2" 0.02 'fan gift: for the kittens')"
    echo "  $(fan "$DEV6" 0.03 'fan gift: food for Pink Paw')"
    echo
    echo "## 1. A match from Motored.lt's vault: the agent proposes, the code picks the vault and recomputes, the contract pays"
    md --fork --once
    expect "round exits 0" is "$RC" 0
    expect "one receipt from the motored vault (sent)" is "$(count sent motored)" 1
    expect "the log names the motored vault" lastlog "j.matchDesk.sponsor === 'motored' && j.matchDesk.vault === '$SP_A'"
    echo
    echo "## 2. The witness reads AgentGift back from every vault"
    md --witness-only
    expect "witness exits 0" is "$RC" 0
    expect "the receipt is reconciled" is "$(count reconciled motored)" 1
    echo
    echo "## 3. A wrong amount is rejected, not corrected (TREAT_AGENT_FAKE_WRONG=1 adds 0.000001)"
    echo "\$ TREAT_AGENT_FAKE_LLM=1 TREAT_AGENT_FAKE_WRONG=1 node run.mjs --sponsor desk.fork.json --rpc $R --fork --once"
    set +e; TREAT_AGENT_FAKE_LLM=1 TREAT_AGENT_FAKE_WRONG=1 node run.mjs --sponsor "$DESK" --rpc "$R" --fork --once; RC=$?; set -e
    echo "# exit $RC"
    expect "rejected round exits 0 (a hold)" is "$RC" 0
    expect "the log records checker.ok = false" lastlog 'j.matchDesk && j.matchDesk.checker && j.matchDesk.checker.ok === false'
    expect "no new receipt" is "$(( $(count sent) + $(count reconciled) + $(count planned) ))" 1
    echo
    echo "## 4. The next gift: Motored.lt's budget is used up, so code picks Token Tails' vault"
    md --fork --once
    expect "round exits 0" is "$RC" 0
    expect "the log names the tokentails vault" lastlog "j.matchDesk.sponsor === 'tokentails' && j.matchDesk.vault === '$SP_B'"
    md --witness-only
    expect "one receipt reconciled per vault" is "$(count reconciled motored)$(count reconciled tokentails)" 11
    echo
    echo "## 5. Idempotent rerun: both gifts are matched (one by each vault); nothing is matched twice"
    md --fork --once
    expect "rerun exits 0" is "$RC" 0
    expect "the rerun holds (no eligible gift)" lastlog 'j.decision.action === "hold"'
    expect "still two receipts" is "$(( $(count sent) + $(count reconciled) + $(count planned) ))" 2
    echo
    echo "## 6. Farming: dev #5 gives six 0.01 gifts"
    for i in 1 2 3 4 5 6; do echo "  $(fan "$DEV5" 0.01 "fan gift $i")"; done
    md --fork --once
    expect "round exits 0" is "$RC" 0
    expect "the gifts are flagged (flagged.json)" test -s "$DESK_DIR/flagged.json"
    expect "no receipt for the flagged gifts" is "$(count reconciled)$(count sent)" 20
    echo
    echo "## 7. Spend Token Tails' day to the cap (demo gives straight from the agent, memo tt:agent:demo-fill; not matches, no receipt)"
    local left give
    left=$(cast call "$SP_B" 'remainingToday()(uint256)' --rpc-url "$R" | awk '{print $1}')
    while [ "$left" != 0 ]; do
      give=$(node -e 'const a = BigInt(process.argv[1]), c = 50000000000000000n; console.log((a < c ? a : c).toString())' "$left")
      cast send "$SP_B" "give(uint256,string)" "$give" "tt:agent:demo-fill" --rpc-url "$R" --unlocked --from "$DEV1" >/dev/null
      FILL=$(node -e 'console.log((BigInt(process.argv[1]) + BigInt(process.argv[2])).toString())' "$FILL" "$give")
      left=$(cast call "$SP_B" 'remainingToday()(uint256)' --rpc-url "$R" | awk '{print $1}')
    done
    echo "  demo fill: $(cast from-wei "$FILL") test USDC; Token Tails remainingToday: $left"
    echo
    echo "## 8. Over the daily cap on Token Tails' vault: the contract refuses (OverDailyCap(0.25, 0.2))"
    md --fork --once --demo-overcap --vault tokentails --overcap-kind day
    expect "demo exits 0 (refused as expected)" is "$RC" 0
    expect "log: refused-as-expected on the tokentails vault" lastlog "j.result && j.result.status === 'refused-as-expected' && j.matchDesk.vault === '$SP_B'"
    echo
    echo "## 9. Over the per-gift cap on Motored.lt's vault: the contract refuses (OverTxCap(0.1, 0.05))"
    md --fork --once --demo-overcap --vault motored --overcap-kind tx
    expect "demo exits 0 (refused as expected)" is "$RC" 0
    expect "log: refused-as-expected on the motored vault" lastlog "j.result && j.result.status === 'refused-as-expected' && j.matchDesk.vault === '$SP_A'"
    echo
    echo "## 10. The statement, one section per company (written to the demo folder, never to client/public)"
    echo "\$ node statement.mjs --sponsor desk.fork.json --receipts <state>/receipts --out <demo>/statement --rpc $R --verify-onchain"
    set +e; node statement.mjs --sponsor "$DESK" --receipts "$RCPT" --out "$STMT" --rpc "$R" --verify-onchain; RC=$?; set -e
    expect "statement exits 0" is "$RC" 0
    expect "statement: 0.05 paid to the shelter wallet, 0.03 from Motored.lt and 0.02 from Token Tails, funding and float read from the chain" node -e '
      const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const by = Object.fromEntries(s.sponsors.map((x) => [x.id, x]));
      console.log("  desk totals:", JSON.stringify(s.totals));
      for (const x of s.sponsors) console.log(`  ${x.id} (${x.label}): matched ${x.totals.reconciledUsdc} in ${x.totals.receipts} receipt(s); funded ${x.onchain && x.onchain.fundedUsdc}, float left ${x.onchain && x.onchain.floatLeftUsdc}`);
      for (const r of s.receipts) console.log(`  receipt ${r.memo} ${r.receipt.amountMicro / 1e6} USDC from ${r.receipt.spender}: tx ${r.witness && r.witness.tx} (local fork tx, not on any explorer)`);
      const ok = s.totals.paidToShelterUsdc === "0.05" && s.totals.receipts === 2
        && by.motored.totals.reconciledUsdc === "0.03" && by.tokentails.totals.reconciledUsdc === "0.02"
        && by.motored.label === "related-party sponsor (founder'"'"'s company)" && by.tokentails.label === "operator'"'"'s own money"
        && by.motored.onchain.fundedUsdc === "1" && by.tokentails.onchain.fundedUsdc === "1"
        && by.motored.onchain.floatLeftUsdc === "0.97" && s.totals.fundedUsdc === "2" && s.verifiedOnchain === true;
      process.exit(ok ? 0 : 1);
    ' "$STMT/statement.json"
    expect "index.html written with both sponsors" grep -q "Token Tails" "$STMT/index.html"
    echo
    PP_AFTER=$(cast balance "$PINK_PAW" --rpc-url "$R")
    echo "\$ cast balance <Pink Paw> --ether   # before, after"
    echo "  $(cast from-wei "$PP_BEFORE")  ->  $(cast from-wei "$PP_AFTER")"
    echo "# fans 0.11 + matches 0.05 (0.03 Motored.lt + 0.02 Token Tails) + demo fill $(cast from-wei "$FILL"); the over-cap attempts moved nothing"
    expect "Pink Paw received fans + matches + fill" is "$(node -e 'console.log((BigInt(process.argv[2]) - BigInt(process.argv[1])).toString())' "$PP_BEFORE" "$PP_AFTER")" \
      "$(node -e 'console.log((110000000000000000n + 50000000000000000n + BigInt(process.argv[1])).toString())' "$FILL")"
    echo
    echo "# expectations failed: $FAILS"
  } >"$OUT" 2>&1
  if [ "$FAILS" -ne 0 ]; then
    echo "match-desk demo: $FAILS expectation(s) failed; see $OUT" >&2
    return 1
  fi
  echo "match-desk demo: all expectations met" >&2
  return 0
}

if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is busy; set PORT=" >&2; exit 2
fi
if [ "$FORK_CHAIN_ID" = 5042 ]; then echo "FORK_CHAIN_ID=5042 is refused: use 5042002 for a rehearsal on mainnet state" >&2; exit 2; fi
anvil --fork-url "$UPSTREAM" --port "$PORT" --host 127.0.0.1 ${FORK_CHAIN_ID:+--chain-id "$FORK_CHAIN_ID"} >"$LOG_DIR/anvil.log" 2>&1 &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do cast chain-id --rpc-url "$R" >/dev/null 2>&1 && break; sleep 1; done

if [ "$MODE" = match-desk ]; then
  match_desk_demo
  exit $?
fi

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
