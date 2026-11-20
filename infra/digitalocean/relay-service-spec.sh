#!/usr/bin/env bash
# Relay shards on DigitalOcean (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §15, Phase B). PREPARED, NOT APPLIED: the founder
# runs it. It never prints the spec (it holds env values), only a summary, and changes the app only with APPLY=1.
#
# Release order: deploy the Phase A backend first (it runs safely on today's 2 x `all` spec: two instances of one
# deployment both serve, no more 50 % `server_moving`), then the PROTO 9 game (OTA), then these steps.
#
#   STEP=split   infra/digitalocean/relay-service-spec.sh          (read-only: fetch, patch, validate, summary)
#   STEP=split   APPLY=1 infra/digitalocean/relay-service-spec.sh  (the same, then `doctl apps update`)
#
# STEP=split     The relay leaves the API service:
#                - service `tokentails-backend` becomes the stateless API: BACKEND_ROLE=api, ORIGIN_INGRESS=digitalocean,
#                  NODE_ENV=production (a split role exits at boot when IS_PROD is set without it, backend-role.ts),
#                  instance_count 2 (no rooms in it any more, so two instances are safe), health check /healthz;
#                - new service `pawlegends-relay-a`: a copy of the backend service (same source, build and env) with
#                  BACKEND_ROLE=relay, RELAY_SHARD=a, RELAY_POOL=app (it inherits today's handoffs), NODE_ENV=production,
#                  ORIGIN_INGRESS=digitalocean, RELAY_DRAIN_MAX_MS=540000, instance_count 1, /healthz, drain 10 s,
#                  grace 600 s; it serves `/pawlegends/ws` (the front door, also `/pawlegends/ws/a`) with the path kept.
# STEP=shard-b   A second shard for scale and failover: `pawlegends-relay-b` (RELAY_SHARD=b, its own pool), route
#                `/pawlegends/ws/b`. Only after the PROTO 9 game has been out for 7 days (an older game cannot follow a
#                redirect: a friend on it could not join a party made on shard b).
# STEP=rollback  Remove the relay services and their routes; `tokentails-backend` back to BACKEND_ROLE=all (unset),
#                ORIGIN_INGRESS removed, instance_count 2 (safe with Phase A: both serve). Live rooms on the removed
#                relays are pushed at their drain deadline and claimed by the `all` instances (pool `app`); shard b's
#                rooms only by a reconnecting player (pull), within the 300 s restore window.
#
# Unverified on DigitalOcean (check before APPLY=1, see LIVE-MATCH-DEPLOYS.md §15.6):
# - longest prefix wins between `/pawlegends/ws/b` and `/pawlegends/ws` (the script lists the longer route first);
# - `preserve_path_prefix: true` keeps `/pawlegends/ws/...` for the relay (the relay refuses any other path);
# - encrypted (EV[...]) env values copied from one component to another in the same app decrypt there; if the update is
#   refused for them, set MONGODB_URI and PAWLEGENDS_PARTY_TICKET_SECRET on the relay components in the console;
# - the pod hostname rule of RELAY_DEPLOY_ID (`<service>-<rollout hash>-<suffix>`): after the first deploy, `/healthz`
#   on both API instances answers `state` only for a relay; on the relay check `relay_lease` and no endless
#   `relay_drain_start` in the logs.
set -euo pipefail
APP=${APP:-2d200c50-57b8-4709-b5e6-f8fcc71dcdce}
SERVICE=${SERVICE:-tokentails-backend}
STEP=${STEP:-split}
RELAY_SIZE=${RELAY_SIZE:-apps-s-1vcpu-1gb}
command -v doctl >/dev/null && command -v jq >/dev/null || { echo "needs doctl and jq" >&2; exit 1; }
case "$STEP" in split|shard-b|rollback) ;; *) echo "STEP must be split, shard-b or rollback" >&2; exit 1 ;; esac

umask 077
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
doctl apps spec get "$APP" --format json > "$DIR/spec.json"
jq -e --arg s "$SERVICE" '[.services[]? | select(.name == $s)] | length == 1' "$DIR/spec.json" >/dev/null ||
    { echo "service $SERVICE not found in app $APP" >&2; exit 1; }

# env helpers: set (replace) keys on one component's envs
JQ_LIB='
def setenv($k; $v): .envs = (((.envs // []) | map(select(.key != $k))) + [{key: $k, value: $v, scope: "RUN_TIME", type: "GENERAL"}]);
def delenv($k): .envs = ((.envs // []) | map(select(.key != $k)));
def relay($name; $shard; $pool; $size; $route):
  del(.routes, .instance_count, .autoscaling, .health_check, .termination)
  | .name = $name
  | .instance_count = 1
  | .instance_size_slug = $size
  | .health_check = {http_path: "/healthz", initial_delay_seconds: 10, period_seconds: 10, timeout_seconds: 5,
                     failure_threshold: 6, success_threshold: 1}
  | .termination = {drain_seconds: 10, grace_period_seconds: 600}
  | setenv("BACKEND_ROLE"; "relay") | setenv("RELAY_SHARD"; $shard)
  | (if $pool == "" then delenv("RELAY_POOL") else setenv("RELAY_POOL"; $pool) end)
  | setenv("NODE_ENV"; "production") | setenv("ORIGIN_INGRESS"; "digitalocean")
  | setenv("RELAY_DRAIN_MAX_MS"; "540000")
  | delenv("RELAY_CONTROL_PORT") | delenv("RELAY_DEPLOY_ID");
# a route on the ingress (new style) or on the component (legacy `routes`), longest prefix first
def addroute($prefix; $comp):
  if (.ingress.rules // null) != null then
    .ingress.rules = ([{match: {path: {prefix: $prefix}}, component: {name: $comp, preserve_path_prefix: true}}]
      + (.ingress.rules | map(select(.match.path.prefix != $prefix))))
    | .ingress.rules |= sort_by(-(.match.path.prefix // "" | length))
  else
    .services |= map(if .name == $comp then .routes = [{path: $prefix, preserve_path_prefix: true}] else . end)
  end;
def droproutes($comp):
  if (.ingress.rules // null) != null then .ingress.rules |= map(select(.component.name != $comp)) else . end;
'

case "$STEP" in
split)
    jq -e '[.services[]? | select(.name == "pawlegends-relay-a")] | length == 0' "$DIR/spec.json" >/dev/null ||
        { echo "pawlegends-relay-a already exists: nothing to split" >&2; exit 1; }
    jq --arg s "$SERVICE" --arg size "$RELAY_SIZE" "$JQ_LIB"'
      (.services[] | select(.name == $s)) as $base
      | .services += [$base | relay("pawlegends-relay-a"; "a"; "app"; $size; "/pawlegends/ws")]
      | .services |= map(if .name == $s then
            setenv("BACKEND_ROLE"; "api") | setenv("ORIGIN_INGRESS"; "digitalocean") | setenv("NODE_ENV"; "production")
            | delenv("RELAY_DRAIN_MAX_MS")
            | .instance_count = 2
            | .health_check = {http_path: "/healthz", initial_delay_seconds: 10, period_seconds: 10, timeout_seconds: 5,
                               failure_threshold: 6, success_threshold: 1}
          else . end)
      | addroute("/pawlegends/ws"; "pawlegends-relay-a")' "$DIR/spec.json" > "$DIR/next.json"
    ;;
shard-b)
    jq -e '[.services[]? | select(.name == "pawlegends-relay-a")] | length == 1' "$DIR/spec.json" >/dev/null ||
        { echo "run STEP=split first (pawlegends-relay-a not found)" >&2; exit 1; }
    jq -e '[.services[]? | select(.name == "pawlegends-relay-b")] | length == 0' "$DIR/spec.json" >/dev/null ||
        { echo "pawlegends-relay-b already exists" >&2; exit 1; }
    jq --arg size "$RELAY_SIZE" "$JQ_LIB"'
      (.services[] | select(.name == "pawlegends-relay-a")) as $a
      | .services += [$a | relay("pawlegends-relay-b"; "b"; ""; $size; "/pawlegends/ws/b")]
      | addroute("/pawlegends/ws/b"; "pawlegends-relay-b")' "$DIR/spec.json" > "$DIR/next.json"
    ;;
rollback)
    jq --arg s "$SERVICE" "$JQ_LIB"'
      droproutes("pawlegends-relay-a") | droproutes("pawlegends-relay-b")
      | .services |= map(select(.name != "pawlegends-relay-a" and .name != "pawlegends-relay-b"))
      | .services |= map(if .name == $s then
            delenv("BACKEND_ROLE") | delenv("ORIGIN_INGRESS") | setenv("RELAY_DRAIN_MAX_MS"; "540000")
            | .instance_count = 2
          else . end)' "$DIR/spec.json" > "$DIR/next.json"
    ;;
esac

# summary: component names, roles, shards, instance counts and routes; never env values
summary() {
    jq -r '
      .services[] | select(.name | test("^(tokentails-backend|pawlegends-relay-)")) |
      "  \(.name): instances=\(.instance_count // 1) role=\([.envs[]? | select(.key == "BACKEND_ROLE") | .value][0] // "all") shard=\([.envs[]? | select(.key == "RELAY_SHARD") | .value][0] // "-") pool=\([.envs[]? | select(.key == "RELAY_POOL") | .value][0] // "-") health=\(.health_check.http_path // "tcp") routes=\([.routes[]?.path] | join(","))"' "$1"
    jq -r '(.ingress.rules // [])[] | "  ingress \(.match.path.prefix) -> \(.component.name) keep_prefix=\(.component.preserve_path_prefix // false)"' "$1"
}
echo "app $APP, STEP=$STEP"
echo "before:"; summary "$DIR/spec.json"
echo "after:";  summary "$DIR/next.json"
# nothing outside the services and the ingress changed
STRIP='del(.services, .ingress)'
diff <(jq -S "$STRIP" "$DIR/spec.json") <(jq -S "$STRIP" "$DIR/next.json") >/dev/null ||
    { echo "refused: the patch changed more than the services and the ingress" >&2; exit 1; }
doctl apps spec validate "$DIR/next.json" --schema-only >/dev/null && echo "  spec validates"

if [ "${APPLY:-0}" = "1" ]; then
    doctl apps update "$APP" --spec "$DIR/next.json" --format ID,UpdatedAt
    echo "applied. Check: curl -s https://api.tokentails.com/pawlegends/relays (shards, leader);"
    echo "logs of pawlegends-relay-*: relay_lease once, relay_redirect counts, no repeating relay_drain_start"
else
    echo "not applied (APPLY=1 applies)"
fi
