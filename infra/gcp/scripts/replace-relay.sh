#!/usr/bin/env bash
# Planned replacement of the relay VM (RUNBOOK.md "Operations"), run by the founder in a quiet hour after a Terraform
# apply changed the relay instance template (cloud-init, relay_machine_type, disk). The MIG update policy is
# OPPORTUNISTIC, so nothing replaces the VM by itself; relay deploys keep working on the old template meanwhile.
#
# A replacement stops the VM (SIGTERM: rooms hand off), boots a new one and restores the rooms only if it is up within
# the relay's 120 s restore window, which a cold boot plus an uncached image pull may miss. So this waits until no
# room is live (up to WAIT_MAX_S, default 3600), then replaces. FORCE=1 replaces at once (live matches may be lost).
#
#   PROJECT_ID=tokentails-prod REGION=europe-west3 infra/gcp/scripts/replace-relay.sh
# Optional: RELAY_MIG (tt-relay), API_HOST (api.tokentails.com: checked through Cloudflare afterwards).
set -euo pipefail
: "${PROJECT_ID:?}" "${REGION:?}" "${RELAY_MIG:=tt-relay}" "${WAIT_MAX_S:=3600}" "${FORCE:=0}"
case "$PROJECT_ID" in motored-497708 | "") echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; tokentails-*) ;; *) echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; esac
G=(--project "$PROJECT_ID" --region "$REGION" --quiet)

if [ "$(gcloud compute instance-groups managed describe "$RELAY_MIG" "${G[@]}" --format='value(status.versionTarget.isReached)')" = "True" ] &&
    [ "$FORCE" != "1" ]; then
    echo "the relay VM already runs the current template: nothing to replace (FORCE=1 replaces anyway)"; exit 0
fi
URL=$(gcloud compute instance-groups managed list-instances "$RELAY_MIG" "${G[@]}" --format='value(instance)' | head -n 1)
INSTANCE=${URL##*/}
ZONE=$(echo "$URL" | sed -nE 's#.*/zones/([^/]+)/instances/.*#\1#p')
rooms_live() {
    gcloud compute ssh "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" --tunnel-through-iap --quiet \
        --command 'curl -s localhost:8080/healthz' 2>/dev/null | sed -nE 's/.*"rooms_live" *: *([0-9]+).*/\1/p'
}

if [ "$FORCE" != "1" ]; then
    end=$(($(date +%s) + WAIT_MAX_S))
    while :; do
        n=$(rooms_live || true)
        [ "${n:-?}" = "0" ] && break
        if [ "$(date +%s)" -ge "$end" ]; then echo "still ${n:-?} live room(s) after ${WAIT_MAX_S} s: try a quieter hour (or FORCE=1)" >&2; exit 1; fi
        echo "waiting: ${n:-?} live room(s) on $INSTANCE"; sleep 30
    done
fi

echo "replacing $INSTANCE ($ZONE) with the current template"
gcloud compute instance-groups managed update-instances "$RELAY_MIG" "${G[@]}" --all-instances \
    --minimal-action=replace --most-disruptive-allowed-action=replace
gcloud compute instance-groups managed wait-until "$RELAY_MIG" "${G[@]}" --stable --timeout=900
if [ -n "${API_HOST:-}" ]; then
    for _ in $(seq 1 60); do curl -fsS -m 10 "https://${API_HOST}/pawlegends/ws/healthz" && { echo; echo "relay replaced and reachable"; exit 0; }; sleep 5; done
    echo "relay not reachable through https://${API_HOST} after 5 min" >&2; exit 1
fi
echo "relay replaced"
