#!/usr/bin/env bash
# Cloud Run deploy with a pre-traffic smoke test (deploy-gcp.yml, RUNBOOK.md "Deploys").
#   deploy-run.sh SERVICE IMAGE HOST PATH
# 1. new revision, no traffic, tag `canary`  2. requests through Cloudflare and the LB with `x-tt-canary: 1` must pass
# 3. 100 % of traffic to that revision  4. the same check without the header. If 2 fails, traffic never moved.
# Needs PROJECT_ID and REGION; refuses any project that is not tokentails-*.
set -euo pipefail
SERVICE=$1 IMAGE=$2 HOST=$3 SMOKE_PATH=${4:-/}
: "${PROJECT_ID:?}" "${REGION:?}"
case "$PROJECT_ID" in motored-497708 | "") echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; tokentails-*) ;; *) echo "refused project '$PROJECT_ID'" >&2; exit 1 ;; esac
G=(--project "$PROJECT_ID" --region "$REGION" --quiet)

echo "::group::deploy $SERVICE $IMAGE (no traffic, tag canary)"
gcloud run deploy "$SERVICE" "${G[@]}" --image "$IMAGE" --no-traffic --tag canary
REV=$(gcloud run services describe "$SERVICE" "${G[@]}" --format='value(status.latestCreatedRevisionName)')
READY=$(gcloud run revisions describe "$REV" "${G[@]}" --format='value(status.conditions[0].status)')
echo "revision $REV ready=$READY"
[ "$READY" = "True" ] || { echo "::error::revision $REV is not ready"; exit 1; }
echo "::endgroup::"

smoke() { # smoke HEADER_ARGS... : 20 tries, 6 s apart
    local i code body
    for i in $(seq 1 20); do
        body=$(curl -sS -m 15 -o - -w '\n%{http_code}' "$@" "https://${HOST}${SMOKE_PATH}" 2>/dev/null || true)
        code=${body##*$'\n'}
        body=${body%$'\n'*}
        if [ "$code" = "200" ]; then
            if [ "$SERVICE" = "tt-api" ]; then
                # the API answers /healthz with its revision: prove the canary (or, after the move, live) one answered
                rev=$(curl -sS -m 15 "$@" "https://${HOST}/healthz" | sed -nE 's/.*"revision":"([^"]+)".*/\1/p')
                [ "$rev" = "$REV" ] && return 0
                echo "  try $i: /healthz revision '$rev', waiting for $REV"
            else
                return 0
            fi
        else
            echo "  try $i: HTTP $code"
        fi
        sleep 6
    done
    return 1
}

echo "::group::smoke canary https://${HOST}${SMOKE_PATH} (x-tt-canary: 1)"
if ! smoke -H 'x-tt-canary: 1'; then
    echo "::error::canary smoke failed: traffic stays on the current revision. Fix forward and redeploy."
    exit 1
fi
echo "::endgroup::"

echo "::group::move 100 % of traffic to $REV"
gcloud run services update-traffic "$SERVICE" "${G[@]}" --to-revisions "${REV}=100"
echo "::endgroup::"

echo "::group::smoke live https://${HOST}${SMOKE_PATH}"
smoke || { echo "::error::live smoke failed after the traffic move (house rule: fix forward)"; exit 1; }
echo "::endgroup::"
echo "$SERVICE now serves $REV ($IMAGE)"
