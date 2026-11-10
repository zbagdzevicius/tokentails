#!/usr/bin/env bash
# LATENCY-PLAN E4 (infra/gcp/RUNBOOK.md "Latency"): after the cutover, compare the party relay through Cloudflare with
# the same host reached straight at the load balancer, from the same machine, in alternating rounds.
# Read-only: it opens a few guest sockets (no party, no queue) and changes nothing anywhere.
#
#   infra/gcp/scripts/relay-ab.sh https://gcp-api.tokentails.com https://gcp-api.tokentails.com \
#     --connect-b "$(terraform -chdir=infra/gcp/terraform/envs/prod output -raw lb_ip)"
#   ROUNDS=6 N=4 PINGS=30 infra/gcp/scripts/relay-ab.sh <A url> <B url> [--connect-b <lb ip>]
#
# `--connect-b` pins B's TCP to an IP while keeping its Host and SNI, so the load balancer certificate and the relay
# route match (a separate DNS-only host would be in neither). Cloud Armor admits Cloudflare ranges only: allow your
# own /32 for the test with `test_source_cidrs` in envs/prod (your own apply) and clear it afterwards. Output: per round
# and overall p50 / p95 of the ping RTT and the hello -> welcome time, and the B - A gap. Decision rule (plan E4): a p50
# gap above 10 ms in Cloudflare's disfavour -> evaluate Argo Smart Routing before any bypass.
set -euo pipefail

A="${1:?usage: relay-ab.sh <A url via Cloudflare> <B url direct> [--connect-b IP]}"
B="${2:?usage: relay-ab.sh <A url via Cloudflare> <B url direct> [--connect-b IP]}"
shift 2
CONNECT_B=""
while [ $# -gt 0 ]; do
  case "$1" in
    --connect-b) CONNECT_B="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
ROUNDS="${ROUNDS:-4}"
N="${N:-4}"
PINGS="${PINGS:-30}"
# the relay allows 50 sockets per IP; both arms together stay far below it
if [ "$N" -gt 10 ]; then echo "N must be at most 10" >&2; exit 2; fi

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOL="$HERE/../tools/ws-latency.mjs"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/relay-ab.XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

for r in $(seq 1 "$ROUNDS"); do
  node "$TOOL" "$A" --n "$N" --pings "$PINGS" --json > "$OUT/a-$r.json" || echo "round $r: A failed (exit $?)" >&2
  if [ -n "$CONNECT_B" ]; then
    node "$TOOL" "$B" --n "$N" --pings "$PINGS" --connect "$CONNECT_B" --json > "$OUT/b-$r.json" || echo "round $r: B failed (exit $?)" >&2
  else
    node "$TOOL" "$B" --n "$N" --pings "$PINGS" --json > "$OUT/b-$r.json" || echo "round $r: B failed (exit $?)" >&2
  fi
  sleep 5
done

node - "$OUT" "$ROUNDS" "$A" "$B" <<'EOF'
const fs = require('fs');
const [dir, rounds, A, B] = process.argv.slice(2);
const read = (arm) =>
  Array.from({ length: Number(rounds) }, (_, i) => {
    try { return JSON.parse(fs.readFileSync(`${dir}/${arm}-${i + 1}.json`, 'utf8')); } catch { return null; }
  }).filter(Boolean);
const a = read('a'), b = read('b');
const med = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
const row = (name, arm, key) => ({ arm: name, rounds: arm.length, p50: med(arm.map((x) => x[key]?.p50)), p95: med(arm.map((x) => x[key]?.p95)) });
for (const key of ['ping_rtt_ms', 'hello_rtt_ms', 'handshake_ms']) {
  const ra = row(`A ${A}`, a, key), rb = row(`B ${B}`, b, key);
  console.log(`${key}`);
  console.log(`  ${ra.arm}: rounds ${ra.rounds}, median p50 ${ra.p50} ms, median p95 ${ra.p95} ms`);
  console.log(`  ${rb.arm}: rounds ${rb.rounds}, median p50 ${rb.p50} ms, median p95 ${rb.p95} ms`);
  if (ra.p50 !== null && rb.p50 !== null) console.log(`  A - B: p50 ${(ra.p50 - rb.p50).toFixed(1)} ms, p95 ${(ra.p95 - rb.p95).toFixed(1)} ms`);
}
const gap = (med(a.map((x) => x.ping_rtt_ms?.p50)) ?? 0) - (med(b.map((x) => x.ping_rtt_ms?.p50)) ?? 0);
console.log(gap > 10 ? `Cloudflare adds ${gap.toFixed(1)} ms p50: evaluate Argo Smart Routing (plan E4).` : `Gap ${gap.toFixed(1)} ms p50: keep Cloudflare as is.`);
EOF
