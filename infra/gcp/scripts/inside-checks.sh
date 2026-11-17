#!/usr/bin/env bash
# Shadow checks from inside, before Cloudflare carries any GCP host (infra/gcp/RUNBOOK.md "Production status").
# Read-only: describes, IAP SSH reads, two guest sockets and one guest party (create, join, leave). No deploy, no
# restart, no secret value is read or printed (Secret Manager is compared by NAME only).
#
#   export CLOUDSDK_CONFIG="$HOME/.config/gcloud-tokentails" CLOUDSDK_CORE_PROJECT=gleaming-medium-480114-g5 \
#          CLOUDSDK_COMPUTE_REGION=europe-west3
#   infra/gcp/scripts/inside-checks.sh            # from the repo root
#
# Needs: gcloud logged in as the founder in that config (OS Login external user for IAP SSH), doctl (key names of the
# DigitalOcean app), node, jq.
set -uo pipefail
P=gleaming-medium-480114-g5 R=europe-west3 ACCT="${ACCT:-zbagdzevicius@gmail.com}"
[ "${CLOUDSDK_CONFIG:-}" = "$HOME/.config/gcloud-tokentails" ] || { echo "export CLOUDSDK_CONFIG=\$HOME/.config/gcloud-tokentails first (RUNBOOK Guardrails)" >&2; exit 2; }
case "${CLOUDSDK_CORE_PROJECT:-}" in "$P") ;; *) echo "CLOUDSDK_CORE_PROJECT must be $P" >&2; exit 2 ;; esac
G=(--project="$P" --account="$ACCT")
DO_APP="${DO_APP:-2d200c50-57b8-4709-b5e6-f8fcc71dcdce}"
LB_IP="${LB_IP:-34.107.92.132}"
FAIL=0
ok()  { printf '  ok    %s\n' "$*"; }
bad() { printf '  FAIL  %s\n' "$*"; FAIL=1; }

echo "== tt-api (Cloud Run)"
gcloud run services describe tt-api "${G[@]}" --region="$R" --format=json > /tmp/.tt-api.$$ 2>/dev/null || { bad "cannot describe tt-api (auth?)"; exit 1; }
jq -r '"  latest created: \(.status.latestCreatedRevisionName)  ready: \(.status.latestReadyRevisionName)\n  image: \(.spec.template.spec.containers[0].image)\n  traffic: \([.status.traffic[] | "\(.revisionName // "LATEST")=\(.percent // 0)%\(if .tag then " tag " + .tag else "" end)"] | join(", "))"' /tmp/.tt-api.$$
rm -f /tmp/.tt-api.$$

echo "== relay VM"
INST_URL=$(gcloud compute instance-groups managed list-instances tt-relay "${G[@]}" --region="$R" --format='value(instance)' | head -n 1)
INST=${INST_URL##*/}; ZONE=$(echo "$INST_URL" | sed -nE 's#.*/zones/([^/]+)/instances/.*#\1#p')
[ -n "$INST" ] || { bad "no relay instance in tt-relay"; exit 1; }
echo "  instance $INST ($ZONE), MIG image: $(gcloud compute instance-groups managed describe tt-relay "${G[@]}" --region="$R" --format=json | jq -r '.allInstancesConfig.properties.metadata["tt-relay-image"] // "none"')"
ssh_vm() { gcloud compute ssh "$INST" "${G[@]}" --zone="$ZONE" --tunnel-through-iap --quiet --command "$1" 2>/dev/null; }
OUT=$(ssh_vm 'a=$(cat /var/lib/tt-relay/active); p=$([ "$a" = b ] && echo 9102 || echo 9101); echo "active=$a"; echo "image=$(sudo bash /var/lib/tt-relay/deploy.sh current | tail -n 1)"; echo "healthz=$(curl -s -m 5 localhost:$p/healthz)"; echo "readyz=$(curl -s -m 5 -w " %{http_code}" localhost:$p/readyz)"; echo "lb_readyz=$(curl -sk -m 10 -o /dev/null -w "%{http_code}" --resolve gcp-api.tokentails.com:443:'"$LB_IP"' https://gcp-api.tokentails.com/readyz)"')
echo "$OUT" | sed 's/^/  /'
echo "$OUT" | grep -q '^readyz=.*"mongo":true.* 200$' && ok "relay /readyz 200, mongo true" || bad "relay /readyz"

echo "== guest hello/welcome and party create/join over an SSH tunnel through IAP (localhost:18080 -> VM :8080)"
gcloud compute ssh "$INST" "${G[@]}" --zone="$ZONE" --tunnel-through-iap --quiet -- -N -L 18080:localhost:8080 2>/dev/null &
TUN=$!
trap 'kill $TUN 2>/dev/null' EXIT
for _ in $(seq 1 30); do curl -s -m 2 localhost:18080/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -s -m 5 localhost:18080/healthz | sed 's/^/  healthz via tunnel: /'; echo
node infra/gcp/tools/ws-latency.mjs http://127.0.0.1:18080 --n 3 --pings 5 && ok "hello/welcome 3/3" || bad "ws-latency via tunnel"
node infra/gcp/tools/party-probe.mjs http://127.0.0.1:18080 && ok "party create/join" || bad "party create/join via tunnel"
kill $TUN 2>/dev/null

echo "== tt-api /readyz, /pawlegends/status and sim parity"
# tt-api has no URL of its own (LB only) and Cloud Armor admits Cloudflare only, so from here it is reached through
# Cloudflare once step 5's gcp-api record exists; before that, lb_readyz above shows 403 (Armor) unless the NAT /32 is
# in test_source_cidrs.
if dig +short gcp-api.tokentails.com | grep -q .; then
  sim() { curl -s -m 15 "https://$1/pawlegends/sim" | jq -c '{simVersion, simVersions, bundleSha256, proto}'; }
  g=$(sim gcp-api.tokentails.com); d=$(sim api.tokentails.com)
  [ -n "$g" ] && [ "$g" = "$d" ] && ok "sim parity $(echo "$g" | jq -c '{simVersion,bundleSha256}')" || { bad "sim differs"; echo "    gcp $g"; echo "    do  $d"; }
  [ "$(curl -s -m 15 -o /dev/null -w '%{http_code}' https://gcp-api.tokentails.com/pawlegends/status)" = 200 ] && ok "/pawlegends/status 200" || bad "/pawlegends/status"
else
  echo "  gcp-api.tokentails.com has no DNS record yet: sim parity and /pawlegends/status run in scripts/step5-checks.sh"
fi

echo "== Secret Manager vs DigitalOcean env (names only, never values)"
DOK=$(doctl apps spec get "$DO_APP" --format json | jq -r '[(.envs//[])[].key] + [(.services//[])[] | (.envs//[])[].key] | unique | .[]')
SMK=$(gcloud secrets list "${G[@]}" --format='value(name)' | sed 's#.*/##' | sort -u)
MISSING=$(comm -23 <(echo "$DOK" | sort -u) <(echo "$SMK"))
[ -z "$MISSING" ] && ok "every DigitalOcean key ($(echo "$DOK" | wc -l | tr -d ' ')) has a secret container" || { bad "missing in Secret Manager:"; echo "$MISSING" | sed 's/^/    /'; }
NOVER=""
for k in $DOK; do
  n=$(gcloud secrets versions list "$k" "${G[@]}" --filter='state=ENABLED' --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -ge 1 ] || NOVER="$NOVER $k"
done
[ -z "$NOVER" ] && ok "each has an enabled version" || bad "no enabled version:$NOVER"

echo
[ "$FAIL" = 0 ] && echo "INSIDE CHECKS PASSED" || echo "INSIDE CHECKS FAILED (see FAIL lines)"
exit "$FAIL"
