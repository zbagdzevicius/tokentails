#!/usr/bin/env bash
# Live-match deploys on DigitalOcean (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §7). PREPARED, NOT APPLIED: the founder runs
# it. Best applied BEFORE (or together with) the first push of the relay drain code: the old code is no worse with one
# instance (it hands off on SIGTERM at once and ignores the longer grace), while the new code on two instances makes one
# of them drain for good (§4.4) and bounces about half of all reconnects once.
#
# It changes four things on the backend service `tokentails-backend` of app 2d200c50-57b8-4709-b5e6-f8fcc71dcdce and
# nothing else (other env, routes and components are copied unchanged; the spec is never printed, it holds env values):
#   instance_count 2 -> 1      one relay process owns every room, party code and Quick Play queue (two in-memory
#                              relays behind a balancer without room affinity split them: §1 gap 2, §4.4)
#   health_check  /healthz     liveness only; a draining container stays healthy (never /readyz: §4.3)
#   termination   drain 10 s, grace 600 s
#                              the old container drains for RELAY_DRAIN_MAX_MS (540 s by default) after SIGTERM,
#                              then hands the rest off; the new container claims them within a second
#   env RELAY_DRAIN_MAX_MS=540000  that SIGTERM drain (600 s grace minus 60 s for the handoff and exit); without it the
#                              relay drains 90 s, which fits DigitalOcean's default 120 s grace
#
#   infra/digitalocean/live-match-spec.sh            fetch, patch, validate; prints a summary only (read-only)
#   APPLY=1 infra/digitalocean/live-match-spec.sh    the same, then `doctl apps update` (a redeploy of the backend)
#
# Afterwards watch CPU for a day: one 1 vCPU instance now serves the HTTP API too. If it is short, raise
# instance_size_slug (apps-s-1vcpu-2gb, apps-s-2vcpu-4gb); never add a second instance while the relay runs on DO.
# Rollback: the same script with INSTANCES=2 (rooms then split across instances again, as before).
set -euo pipefail
APP=${APP:-2d200c50-57b8-4709-b5e6-f8fcc71dcdce}
SERVICE=${SERVICE:-tokentails-backend}
INSTANCES=${INSTANCES:-1}
DRAIN_S=${DRAIN_S:-10}
GRACE_S=${GRACE_S:-600}
command -v doctl >/dev/null && command -v jq >/dev/null || { echo "needs doctl and jq" >&2; exit 1; }

umask 077
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
doctl apps spec get "$APP" --format json > "$DIR/spec.json"
jq -e --arg s "$SERVICE" '[.services[]? | select(.name == $s)] | length == 1' "$DIR/spec.json" >/dev/null ||
    { echo "service $SERVICE not found in app $APP" >&2; exit 1; }
jq --arg s "$SERVICE" --argjson n "$INSTANCES" --argjson d "$DRAIN_S" --argjson g "$GRACE_S" '
  .services |= map(if .name == $s then
    .instance_count = $n
    | .health_check = {
        http_path: "/healthz",
        initial_delay_seconds: 10,
        period_seconds: 10,
        timeout_seconds: 5,
        failure_threshold: 6,
        success_threshold: 1
      }
    | .termination = { drain_seconds: $d, grace_period_seconds: $g }
    | .envs = ((.envs // []) | map(select(.key != "RELAY_DRAIN_MAX_MS")))
        + [{ key: "RELAY_DRAIN_MAX_MS", value: (($g - 60) * 1000 | tostring), scope: "RUN_TIME", type: "GENERAL" }]
  else . end)' "$DIR/spec.json" > "$DIR/next.json"

echo "app $APP, service $SERVICE:"
jq -r --arg s "$SERVICE" '.services[] | select(.name == $s) |
  "  before: instance_count=\(.instance_count) health_check=\(.health_check.http_path // "none (TCP)") termination=\(.termination // "default (drain 15 s, grace 120 s)" | tostring)"' "$DIR/spec.json"
jq -r --arg s "$SERVICE" '.services[] | select(.name == $s) |
  "  after:  instance_count=\(.instance_count) health_check=\(.health_check.http_path) termination=\(.termination | tostring) RELAY_DRAIN_MAX_MS=\([.envs[] | select(.key == "RELAY_DRAIN_MAX_MS") | .value][0])"' "$DIR/next.json"
# only those four things differ
STRIP='.services |= map(if .name == $s then del(.instance_count, .health_check, .termination) | .envs = ((.envs // []) | map(select(.key != "RELAY_DRAIN_MAX_MS"))) else . end)'
diff <(jq -S --arg s "$SERVICE" "$STRIP" "$DIR/spec.json") <(jq -S --arg s "$SERVICE" "$STRIP" "$DIR/next.json") >/dev/null ||
    { echo "refused: the patch changed more than instance_count, health_check, termination and RELAY_DRAIN_MAX_MS" >&2; exit 1; }
doctl apps spec validate "$DIR/next.json" --schema-only >/dev/null && echo "  spec validates"

if [ "${APPLY:-0}" = "1" ]; then
    doctl apps update "$APP" --spec "$DIR/next.json" --format ID,UpdatedAt
    echo "applied: the backend redeploys; on the next push to main, check the logs for relay_drain_start, relay_handoff and relay_restore"
else
    echo "not applied (APPLY=1 applies)"
fi
