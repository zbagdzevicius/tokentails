#!/usr/bin/env bash
# RUNBOOK.md step 6.3: hand the DigitalOcean relay's live matches to the Google Cloud relay, run by the founder in
# their own terminal right after api.tokentails.com points at the load balancer.
#
# Since live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md) a running relay also pulls the room of a player
# who reaches it, across pools, so this is belt and braces: a relay's first restore pass after it starts claims every
# handed-off room of any pool at once, so the Google relay is stopped while DigitalOcean shuts down and started after:
#   1. pause autohealing (a stopped relay fails health checks; the MIG must not recreate the VM meanwhile)
#   2. stop the serving relay slot on the VM (SIGTERM: rooms opened since the DNS flip hand off to Mongo)
#   3. you archive the DigitalOcean app (every instance gets SIGTERM: its rooms hand off; crons and the hot-wallet
#      signers stop there for good); this waits until DO_APP_URL stops answering, or for Enter
#   4. wait 20 s (a room DigitalOcean could not hand off becomes restorable once its lease is 8 s stale)
#   5. start the slot again: its first restore pass claims every handed-off room; players resume with their
#      DigitalOcean tokens
#   6. restore autohealing
# Steps 2 to 5 must fit the relay's 300 s restore window: have the DigitalOcean archive dialog open before you run this.
# DigitalOcean drains for RELAY_DRAIN_MAX_MS on SIGTERM (540 s with infra/digitalocean/live-match-spec.sh): its
# players reconnect to Google (DNS) and pull their rooms over as soon as the relay is started again in step 5.
#
#   PROJECT_ID=gleaming-medium-480114-g5 REGION=europe-west3 DO_APP_URL=https://<app>.ondigitalocean.app infra/gcp/scripts/cutover-relay.sh
set -euo pipefail
: "${PROJECT_ID:?}" "${REGION:?}" "${RELAY_MIG:=tt-relay}" "${AUTOHEAL_DELAY_S:=120}"
case "$PROJECT_ID" in motored* | "") echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; gleaming-medium-480114-g5 | tokentails-staging) ;; *) echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; esac
G=(--project "$PROJECT_ID" --region "$REGION" --quiet)

# JSON, not value(instance): gcloud 570 prints only the zone for value(instance), which left INSTANCE and ZONE wrong
URL=$(gcloud compute instance-groups managed list-instances "$RELAY_MIG" "${G[@]}" --format=json | jq -r '.[0].instance // empty')
[ -n "$URL" ] || { echo "no relay VM in $RELAY_MIG" >&2; exit 1; }
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
# the serving unit: tt-relay@a|b (blue/green template) or tt-relay (the single-unit template before it)
UNIT=$(on_vm 'a=$(cat /var/lib/tt-relay/active 2>/dev/null); if [ -n "$a" ]; then echo "tt-relay@$a"; else echo tt-relay; fi' | tr -d '\r' | tail -n 1)
case "$UNIT" in
    tt-relay@a) PORT=9101 CONTAINER=tt-relay-a ;;
    tt-relay@b) PORT=9102 CONTAINER=tt-relay-b ;;
    *) PORT=8080 CONTAINER=tt-relay ;;
esac
echo "2. stopping $UNIT on $INSTANCE (rooms hand off)"
on_vm "sudo systemctl stop $UNIT"
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
echo "5. starting $UNIT (restore)"
on_vm "sudo systemctl start $UNIT; for i in \$(seq 1 60); do curl -sf localhost:$PORT/readyz >/dev/null && break; sleep 2; done; curl -s localhost:$PORT/readyz; echo; sudo docker logs $CONTAINER 2>&1 | grep -iE 'restor' | tail -n 5"
