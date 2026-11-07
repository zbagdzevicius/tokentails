#!/usr/bin/env bash
# Party relay deploy (deploy-gcp.yml, RUNBOOK.md "Relay deploys"). Runs as sa-deploy, which may only change the relay
# MIG's all-instances metadata and SSH (IAP, OS Login) into tt-relay VMs.
# 1. ask the VM which image the running container was started from (deploy.sh current)
# 2. skip unless relay code changed since that image (RELAY_MODE=if-changed) or RELAY_MODE=yes
# 3. over IAP SSH: /var/lib/tt-relay/deploy.sh IMAGE = pre-pull, drain (if the relay offers it, 30 min cap),
#    systemctl restart on IMAGE (docker stop -t 60: SIGTERM -> room handoff; the new container restores the rooms),
#    wait for ready; if not ready it starts the previous image again and fails
# 4. only then commit IMAGE to the MIG's all-instances metadata, so an autoheal or a new VM starts the verified image
# 5. check the relay route through Cloudflare and the LB and print a latency sample
# A pending instance template (cloud-init or machine type changed) is not rolled out here: scripts/replace-relay.sh.
# Needs PROJECT_ID, REGION, IMAGE, RELAY_MIG, RELAY_IMAGE_KEY, API_HOST, RELAY_MODE.
set -euo pipefail
: "${PROJECT_ID:?}" "${REGION:?}" "${IMAGE:?}" "${RELAY_MIG:=tt-relay}" "${RELAY_IMAGE_KEY:=tt-relay-image}" "${RELAY_MODE:=if-changed}"
case "$PROJECT_ID" in tokentails-*) ;; *) echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; esac
[ "$PROJECT_ID" != "motored-497708" ] || exit 1
[[ "$IMAGE" =~ ^${REGION}-docker\.pkg\.dev/${PROJECT_ID}/[a-z0-9-]+/backend:[A-Za-z0-9._-]+$ ]] || { echo "refused image '$IMAGE'" >&2; exit 1; }
G=(--project "$PROJECT_ID" --region "$REGION" --quiet)

# What the relay process is built from: a change anywhere here redeploys it.
RELAY_PATHS=(
    backend/src/pawlegends/party backend/src/vendor/pawlegends-net backend/src/vendor/pawlegends-sim
    backend/src/relay.module.ts backend/src/main.ts backend/src/shared backend/src/cat/cat.repository.ts
    backend/src/cat/cat.schema.ts backend/package.json backend/package-lock.json backend/Dockerfile
)

MIG_JSON=$(gcloud compute instance-groups managed describe "$RELAY_MIG" "${G[@]}" --format=json)
COMMITTED=$(echo "$MIG_JSON" | jq -r --arg k "$RELAY_IMAGE_KEY" '.allInstancesConfig.properties.metadata[$k] // ""')
if [ "$(echo "$MIG_JSON" | jq -r '.status.versionTarget.isReached // true')" != "true" ]; then
    echo "::warning::the relay VM runs an older instance template; roll it out in a quiet hour with infra/gcp/scripts/replace-relay.sh"
fi
INST_JSON=$(gcloud compute instance-groups managed list-instances "$RELAY_MIG" "${G[@]}" --format=json)
[ "$(echo "$INST_JSON" | jq length)" = "1" ] || { echo "::error::expected exactly one relay VM"; echo "$INST_JSON" | jq -r '.[].instance'; exit 1; }
URL=$(echo "$INST_JSON" | jq -r '.[0].instance')
INSTANCE=${URL##*/}
ZONE=$(echo "$URL" | sed -nE 's#.*/zones/([^/]+)/instances/.*#\1#p')
on_vm() { gcloud compute ssh "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" --tunnel-through-iap --quiet --command "$1"; }

commit() { # the image a new or recreated VM starts: only ever one that was ready on the running VM
    if [ "$COMMITTED" = "$IMAGE" ]; then return 0; fi
    echo "::group::commit $RELAY_IMAGE_KEY=$IMAGE on $RELAY_MIG"
    gcloud compute instance-groups managed all-instances-config update "$RELAY_MIG" "${G[@]}" --metadata="${RELAY_IMAGE_KEY}=${IMAGE}"
    echo "::endgroup::"
}

CURRENT=$(on_vm 'sudo bash /var/lib/tt-relay/deploy.sh current' | tr -d '\r' | tail -n 1)
echo "running relay image: ${CURRENT:-unknown} (committed for new VMs: ${COMMITTED:-none})"
if [ "$CURRENT" = "$IMAGE" ]; then echo "relay already runs $IMAGE"; commit; exit 0; fi
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

echo "::group::deploy.sh $IMAGE on $INSTANCE ($ZONE) over IAP"
if ! on_vm "sudo bash /var/lib/tt-relay/deploy.sh '$IMAGE'"; then
    echo "::endgroup::"
    echo "::error::relay deploy failed; the MIG metadata still names ${COMMITTED:-the previous image}. Fix forward and redeploy."
    exit 1
fi
echo "::endgroup::"
commit

if [ -n "${API_HOST:-}" ]; then
    echo "::group::relay through https://${API_HOST}/pawlegends/ws"
    curl -fsS -m 15 "https://${API_HOST}/pawlegends/ws/healthz"; echo
    node infra/gcp/tools/ws-latency.mjs "https://${API_HOST}" --n 5 --pings 10 || echo "::warning::latency sample failed"
    echo "::endgroup::"
fi
echo "relay now runs $IMAGE"
