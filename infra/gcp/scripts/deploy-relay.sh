#!/usr/bin/env bash
# Party relay deploy (deploy-gcp.yml, RUNBOOK.md "Relay deploys"). Runs as sa-deploy, which may only change the relay
# MIG's image metadata and SSH (IAP, OS Login) into tt-relay VMs.
# 1. skip unless relay code changed since the running image (RELAY_MODE=if-changed) or RELAY_MODE=yes
# 2. set the image on the MIG (all-instances config, so an autoheal comes up on it) and refresh the VM's metadata
# 3. over IAP SSH: /var/lib/tt-relay/deploy.sh = pre-pull, drain (if the relay offers it, 30 min cap),
#    systemctl restart (docker stop -t 60: SIGTERM -> room handoff; new container restores the rooms), wait for ready
# 4. check the relay route through Cloudflare and the LB and print a latency sample
# Needs PROJECT_ID, REGION, IMAGE, RELAY_MIG, RELAY_IMAGE_KEY, API_HOST, RELAY_MODE.
set -euo pipefail
: "${PROJECT_ID:?}" "${REGION:?}" "${IMAGE:?}" "${RELAY_MIG:=tt-relay}" "${RELAY_IMAGE_KEY:=tt-relay-image}" "${RELAY_MODE:=if-changed}"
case "$PROJECT_ID" in tokentails-*) ;; *) echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; esac
[ "$PROJECT_ID" != "motored-497708" ] || exit 1
G=(--project "$PROJECT_ID" --region "$REGION" --quiet)

# What the relay process is built from: a change anywhere here redeploys it.
RELAY_PATHS=(
    backend/src/pawlegends/party backend/src/vendor/pawlegends-net backend/src/vendor/pawlegends-sim
    backend/src/relay.module.ts backend/src/main.ts backend/src/shared backend/src/cat/cat.repository.ts
    backend/src/cat/cat.schema.ts backend/package.json backend/package-lock.json backend/Dockerfile
)

CURRENT=$(gcloud compute instance-groups managed describe "$RELAY_MIG" "${G[@]}" --format=json |
    jq -r --arg k "$RELAY_IMAGE_KEY" '.allInstancesConfig.properties.metadata[$k] // ""')
echo "running relay image: ${CURRENT:-unknown}"
if [ "$CURRENT" = "$IMAGE" ]; then echo "relay already runs $IMAGE"; exit 0; fi
if [ "$RELAY_MODE" = "if-changed" ] && [ -n "$CURRENT" ]; then
    OLD_SHA=${CURRENT##*:}
    if git cat-file -e "${OLD_SHA}^{commit}" 2>/dev/null; then
        CHANGED=$(git diff --name-only "$OLD_SHA" "${GITHUB_SHA:-HEAD}" -- "${RELAY_PATHS[@]}")
        if [ -z "$CHANGED" ]; then echo "no relay change since ${OLD_SHA:0:12}: relay not redeployed"; exit 0; fi
        echo "relay files changed since ${OLD_SHA:0:12}:"; echo "$CHANGED" | sed 's/^/  /'
    else
        echo "running image tag $OLD_SHA is not a known commit: deploying"
    fi
fi

echo "::group::set $RELAY_IMAGE_KEY on $RELAY_MIG and refresh the VM metadata"
gcloud compute instance-groups managed all-instances-config update "$RELAY_MIG" "${G[@]}" --metadata="${RELAY_IMAGE_KEY}=${IMAGE}"
gcloud compute instance-groups managed update-instances "$RELAY_MIG" "${G[@]}" --all-instances \
    --minimal-action=refresh --most-disruptive-allowed-action=refresh
INST_JSON=$(gcloud compute instance-groups managed list-instances "$RELAY_MIG" "${G[@]}" --format=json)
[ "$(echo "$INST_JSON" | jq length)" = "1" ] || { echo "::error::expected exactly one relay VM"; echo "$INST_JSON" | jq -r '.[].instance'; exit 1; }
URL=$(echo "$INST_JSON" | jq -r '.[0].instance')
INSTANCE=${URL##*/}
ZONE=$(echo "$URL" | sed -nE 's#.*/zones/([^/]+)/instances/.*#\1#p')
for i in $(seq 1 30); do
    SEEN=$(gcloud compute instances describe "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" --format=json |
        jq -r --arg k "$RELAY_IMAGE_KEY" '.metadata.items[]? | select(.key == $k) | .value')
    [ "$SEEN" = "$IMAGE" ] && break
    echo "  waiting for the VM metadata ($i)"; sleep 4
done
[ "$SEEN" = "$IMAGE" ] || { echo "::error::VM metadata never showed $IMAGE"; exit 1; }
echo "::endgroup::"

echo "::group::deploy.sh on $INSTANCE ($ZONE) over IAP"
gcloud compute ssh "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" --tunnel-through-iap --quiet \
    --command 'sudo bash /var/lib/tt-relay/deploy.sh'
echo "::endgroup::"

if [ -n "${API_HOST:-}" ]; then
    echo "::group::relay through https://${API_HOST}/pawlegends/ws"
    curl -fsS -m 15 "https://${API_HOST}/pawlegends/ws/healthz"; echo
    node infra/gcp/tools/ws-latency.mjs "https://${API_HOST}" --n 5 --pings 10 || echo "::warning::latency sample failed"
    echo "::endgroup::"
fi
echo "relay now runs $IMAGE"
