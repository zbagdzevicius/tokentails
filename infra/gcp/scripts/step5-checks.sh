#!/usr/bin/env bash
# Step 5 checks through Cloudflare (infra/gcp/RUNBOOK.md "Step 5"), once the founder has added the proxied A records
# gcp-api, gcp and gcp-cats -> lb_ip and the certificate is ACTIVE. Read-only: guest sockets and GETs, nothing changes.
# Prints only our own results (status codes, roles, latency percentiles); stores no visitor data or IPs.
#
#   infra/gcp/scripts/step5-checks.sh                 # health, sim parity, relay latency vs DigitalOcean, Cloud Armor 403
#   infra/gcp/scripts/step5-checks.sh --soak          # the same, then the 65-minute socket soak (about 67 min)
#   LB_IP=34.107.92.132 infra/gcp/scripts/step5-checks.sh
#
# LB_IP defaults to `terraform output -raw lb_ip` (envs/prod), else the address recorded in the runbook.
# Exit 0 only if every check passed. Run it from the repo root.
set -uo pipefail

API_HOST="${API_HOST:-gcp-api.tokentails.com}"
WEB_HOST="${WEB_HOST:-gcp.tokentails.com}"
CMS_HOST="${CMS_HOST:-gcp-cats.tokentails.com}"
DO_HOST="${DO_HOST:-api.tokentails.com}"   # DigitalOcean until step 6
SOAK=0
[ "${1:-}" = "--soak" ] && SOAK=1
if [ -z "${LB_IP:-}" ]; then
  LB_IP=$(terraform -chdir=infra/gcp/terraform/envs/prod output -raw lb_ip 2>/dev/null || true)
  LB_IP=${LB_IP:-34.107.92.132}
fi
WS=infra/gcp/tools/ws-latency.mjs
[ -f "$WS" ] || { echo "run from the repo root ($WS not found)" >&2; exit 2; }

FAIL=0
ok()   { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; FAIL=1; }
get()  { curl -sS -m 15 "$@" 2>/dev/null; }
code() { curl -sS -m 15 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null; }

echo "== DNS: shadow hosts are proxied by Cloudflare (they must not resolve to the LB address $LB_IP)"
for h in "$API_HOST" "$WEB_HOST" "$CMS_HOST"; do
  a=$(dig +short "$h" A | head -n 1)
  if [ -z "$a" ]; then bad "$h does not resolve (add the proxied A record)"
  elif [ "$a" = "$LB_IP" ]; then bad "$h resolves to the LB address: turn the orange cloud on (proxied)"
  else ok "$h -> Cloudflare ($a)"; fi
done

echo "== Health through Cloudflare"
h=$(get "https://$API_HOST/healthz"); echo "$h" | grep -q '"role":"api"' && ok "/healthz $h" || bad "/healthz: '${h:0:200}'"
c=$(code "https://$API_HOST/readyz"); r=$(get "https://$API_HOST/readyz")
[ "$c" = 200 ] && echo "$r" | grep -q '"mongo":true' && ok "/readyz 200 mongo true" || bad "/readyz $c '${r:0:200}'"
h=$(get "https://$API_HOST/pawlegends/ws/healthz"); echo "$h" | grep -q '"role":"relay"' && ok "relay route $h" || bad "/pawlegends/ws/healthz: '${h:0:200}' (the route must reach the VM)"
c=$(code "https://$API_HOST/pawlegends/status"); [ "$c" = 200 ] && ok "/pawlegends/status 200" || bad "/pawlegends/status $c"
c=$(code "https://$WEB_HOST/"); [ "$c" = 200 ] && ok "$WEB_HOST / 200" || bad "$WEB_HOST / $c"
c=$(code "https://$CMS_HOST/"); [ "$c" = 200 ] && ok "$CMS_HOST / 200" || bad "$CMS_HOST / $c"

echo "== Sim parity: GCP vs DigitalOcean (/pawlegends/sim)"
sim() { get "https://$1/pawlegends/sim" | jq -c '{simVersion, simVersions, bundleSha256, proto}' 2>/dev/null; }
g=$(sim "$API_HOST"); d=$(sim "$DO_HOST")
if [ -n "$g" ] && [ "$g" = "$d" ]; then ok "identical: $(echo "$g" | jq -c '{simVersion, bundleSha256, n: (.simVersions|length)}')"
else bad "differ (a deploy on one side is behind; redeploy GCP from the commit DigitalOcean runs)"; echo "    gcp: $g"; echo "    do:  $d"; fi

echo "== Relay latency through Cloudflare (20 sockets, 30 pings): GCP, then DigitalOcean to compare"
node "$WS" "https://$API_HOST" --n 20 --pings 30 || bad "ws-latency against $API_HOST"
node "$WS" "https://$DO_HOST" --n 20 --pings 30 || echo "  (DigitalOcean comparison failed; not a GCP failure)"

echo "== Cloud Armor: straight at the LB address, only Cloudflare may connect (expect 403)"
c=$(curl -sk -m 15 -o /dev/null -w '%{http_code}' --resolve "$API_HOST:443:$LB_IP" "https://$API_HOST/healthz" 2>/dev/null)
[ "$c" = 403 ] && ok "HTTP straight at $LB_IP: 403" || bad "HTTP straight at $LB_IP: $c (expected 403)"
node "$WS" "https://$API_HOST" --connect "$LB_IP" --header cf-connecting-ip:203.0.113.7 --expect-status 403 --insecure --n 2 --pings 1 \
  && ok "forged cf-connecting-ip WebSocket straight at the LB: 403" || bad "forged WebSocket straight at the LB was not refused with 403"

if [ "$SOAK" = 1 ]; then
  echo "== 65-minute soak: 2 lobby sockets through Cloudflare, a ping every 5 s (about 67 min), zero errors expected"
  echo "   started $(date -u +%H:%MZ); do not deploy the relay meanwhile"
  node "$WS" "https://$API_HOST" --n 2 --pings 800 --gap 5000 && ok "soak: sockets stayed open past 60 minutes" || bad "soak: a socket closed or errored"
fi

echo
[ "$FAIL" = 0 ] && echo "STEP 5 CHECKS PASSED" || echo "STEP 5 CHECKS FAILED (see FAIL lines)"
exit "$FAIL"
