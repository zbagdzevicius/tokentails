#!/usr/bin/env bash
# RUNBOOK.md step 6.3: hand the DigitalOcean relay's live matches to the Google Cloud relay, run by the founder in
# their own terminal right after api.tokentails.com points at the load balancer.
#
# Rooms are adopted only by restore() when the relay process starts, and a client that reconnects to a running relay
# that does not know its room gets a new member id and resume token (overwriting the one it had). So the Google relay
# must be stopped while DigitalOcean shuts down and started only afterwards:
#   1. pause autohealing (a stopped relay fails health checks; the MIG must not recreate the VM meanwhile)
#   2. stop tt-relay on the VM (SIGTERM: rooms opened since the DNS flip hand off to Mongo)
#   3. you archive the DigitalOcean app (every instance gets SIGTERM: its rooms hand off; crons and the hot-wallet
#      signers stop there for good); this waits until DO_APP_URL stops answering, or for Enter
#   4. wait 20 s (a room DigitalOcean could not hand off becomes restorable once its lease is 15 s stale)
#   5. start tt-relay: restore() claims every handed-off room; players resume with their DigitalOcean tokens
#   6. restore autohealing
# Steps 2 to 5 must fit the relay's 120 s restore window: have the DigitalOcean archive dialog open before you run this.
#
#   PROJECT_ID=gleaming-medium-480114-g5 REGION=europe-west3 DO_APP_URL=https://<app>.ondigitalocean.app infra/gcp/scripts/cutover-relay.sh
set -euo pipefail
: "${PROJECT_ID:?}" "${REGION:?}" "${RELAY_MIG:=tt-relay}" "${AUTOHEAL_DELAY_S:=120}"
case "$PROJECT_ID" in motored* | "") echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; gleaming-medium-480114-g5 | tokentails-staging) ;; *) echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; esac
G=(--project "$PROJECT_ID" --region "$REGION" --quiet)

URL=$(gcloud compute instance-groups managed list-instances "$RELAY_MIG" "${G[@]}" --format='value(instance)' | head -n 1)
INSTANCE=${URL##*/}
ZONE=$(echo "$URL" | sed -nE 's#.*/zones/([^/]+)/instances/.*#\1#p')
on_vm() { gcloud compute ssh "$INSTANCE" --project "$PROJECT_ID" --zone "$ZONE" --tunnel-through-iap --quiet --command "$1"; }
HC=$(gcloud compute instance-groups managed describe "$RELAY_MIG" "${G[@]}" --format='value(autoHealingPolicies[0].healthCheck)')
[ -n "$HC" ] || { echo "no autohealing health check found on $RELAY_MIG" >&2; exit 1; }
restore_autoheal() {
    gcloud compute instance-groups managed update "$RELAY_MIG" "${G[@]}" --health-check="$HC" --initial-delay="$AUTOHEAL_DELAY_S" >/dev/null &&
        echo "autohealing restored"
}
trap 'restore_autoheal || echo "RESTORE AUTOHEALING BY HAND: gcloud compute instance-groups managed update $RELAY_MIG --region $REGION --health-check=$HC --initial-delay=$AUTOHEAL_DELAY_S" >&2' EXIT

echo "1. pausing autohealing on $RELAY_MIG"
gcloud compute instance-groups managed update "$RELAY_MIG" "${G[@]}" --clear-autohealing >/dev/null
echo "2. stopping tt-relay on $INSTANCE (rooms hand off)"
on_vm 'sudo systemctl stop tt-relay'
echo "3. ARCHIVE the DigitalOcean app now (App Platform > Settings > Archive app)."
if [ -n "${DO_APP_URL:-}" ]; then
    down=0
    for _ in $(seq 1 120); do
        if curl -fsS -m 5 -o /dev/null "$DO_APP_URL/"; then down=0; else down=$((down + 1)); fi
        [ $down -ge 3 ] && break
        sleep 2
    done
    [ $down -ge 3 ] || echo "   $DO_APP_URL still answers after 4 min: starting the relay anyway" >&2
    echo "   DigitalOcean stopped answering"
else
    read -r -p "   press Enter once the app shows as archived (all instances stopped) " _
fi
echo "4. waiting 20 s for leases DigitalOcean could not hand off to go stale"
sleep 20
echo "5. starting tt-relay (restore)"
on_vm 'sudo systemctl start tt-relay; for i in $(seq 1 60); do curl -sf localhost:8080/readyz >/dev/null && break; sleep 2; done; curl -s localhost:8080/readyz; echo; sudo docker logs tt-relay 2>&1 | grep -iE "restor" | tail -n 5'
