#!/usr/bin/env bash
# Planned replacement of the relay VM (RUNBOOK.md "Operations"), run by the founder in a quiet hour after a Terraform
# apply changed the relay instance template (cloud-init, relay_machine_type, disk). The MIG update policy is
# OPPORTUNISTIC, so nothing replaces the VM by itself; relay deploys keep working on the old template meanwhile.
#
# A replacement stops the VM and boots a new one, which restores handed-off rooms within the relay's 300 s restore
# window (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §5). So first the serving relay slot is drained through its loopback
# control port (POST /pawlegends/relay/drain): no new match starts, live matches play to their end; whatever still runs
# at WAIT_MAX_S (default 1800, the relay's cap) is handed off and resumed by the new VM. A VM from before blue/green has
# no control port: then this only waits for 0 live rooms, as before. FORCE=1 replaces at once (rooms hand off on
# SIGTERM and resume on the new VM if it is up within 300 s).
#
#   PROJECT_ID=gleaming-medium-480114-g5 REGION=europe-west3 infra/gcp/scripts/replace-relay.sh
# Optional: RELAY_MIG (tt-relay), API_HOST (api.tokentails.com: checked through Cloudflare afterwards).
set -euo pipefail
: "${PROJECT_ID:?}" "${REGION:?}" "${RELAY_MIG:=tt-relay}" "${WAIT_MAX_S:=1800}" "${FORCE:=0}"
case "$PROJECT_ID" in motored* | "") echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; gleaming-medium-480114-g5 | tokentails-staging) ;; *) echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; esac
G=(--project "$PROJECT_ID" --region "$REGION" --quiet)

if [ "$(gcloud compute instance-groups managed describe "$RELAY_MIG" "${G[@]}" --format='value(status.versionTarget.isReached)')" = "True" ] &&
    [ "$FORCE" != "1" ]; then
    echo "the relay VM already runs the current template: nothing to replace (FORCE=1 replaces anyway)"; exit 0
fi
URL=$(gcloud compute instance-groups managed list-instances "$RELAY_MIG" "${G[@]}" --format='value(instance)' | head -n 1)
INSTANCE=${URL##*/}
ZONE=$(echo "$URL" | sed -nE 's#.*/zones/([^/]+)/instances/.*#\1#p')
on_vm() { gcloud compute ssh "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" --tunnel-through-iap --quiet --command "$1" 2>/dev/null; }
# the serving slot's control port (blue/green layout), or the public port of a VM from before it
CTL=$(on_vm 'case "$(cat /var/lib/tt-relay/active 2>/dev/null)" in a) echo 9101 ;; b) echo 9102 ;; *) echo 8080 ;; esac' | tr -d '\r' | tail -n 1)
rooms_live() { on_vm "curl -s localhost:${CTL:-8080}/healthz" | sed -nE 's/.*"rooms_live" *: *([0-9]+).*/\1/p'; }

if [ "$FORCE" != "1" ]; then
    if [ "${CTL:-8080}" != "8080" ]; then
        echo "draining the relay on $INSTANCE (up to ${WAIT_MAX_S} s): no new matches, live ones play on"
        on_vm "curl -s -X POST -H 'content-type: application/json' -d '{\"maxMs\":$((WAIT_MAX_S * 1000))}' localhost:${CTL}/pawlegends/relay/drain" || true
        echo
    fi
    end=$(($(date +%s) + WAIT_MAX_S + 60))
    while :; do
        n=$(rooms_live || true)
        [ "${n:-?}" = "0" ] && break
        if [ "$(date +%s)" -ge "$end" ]; then
            if [ "${CTL:-8080}" != "8080" ]; then echo "drain deadline passed: the rest was handed off and resumes on the new VM"; break; fi
            echo "still ${n:-?} live room(s) after ${WAIT_MAX_S} s: try a quieter hour (or FORCE=1)" >&2; exit 1
        fi
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
