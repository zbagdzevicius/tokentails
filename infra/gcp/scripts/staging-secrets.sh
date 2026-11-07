#!/usr/bin/env bash
# Throwaway secret values for the STAGING stack (tokentails-staging only; RUNBOOK.md "Staging").
# Every value is generated here (openssl rand / genrsa) or is a test-only constant. Nothing is read from .env files,
# DigitalOcean or production, and nothing is printed. Adds version 1 to each container that has no version yet,
# so it is safe to re-run. The containers are created by terraform/envs/staging (pass 1).
#
#   infra/gcp/scripts/staging-secrets.sh
set -euo pipefail

PROJECT_ID=tokentails-staging # hard-coded on purpose: this script never targets another project
MONGO_IP=${MONGO_IP:-10.10.0.50}
DOMAIN=${DOMAIN:-staging.tokentails.test}
case "$DOMAIN" in *.test) ;; *) echo "DOMAIN must stay under .test" >&2; exit 1 ;; esac
case "$MONGO_IP" in 10.10.*) ;; *) echo "MONGO_IP must be the in-VPC staging mongo (10.10.x.x), never Atlas" >&2; exit 1 ;; esac

g() { gcloud --project "$PROJECT_ID" --quiet "$@"; }

add() { # add NAME: value on stdin, only if the secret has no version yet
    local name=$1 n
    n=$(g secrets versions list "$name" --format='value(name)' --limit=1 2>/dev/null | wc -l | tr -d ' ')
    if [ "$n" != "0" ]; then echo "  $name: has a version, kept"; cat >/dev/null; return; fi
    g secrets versions add "$name" --data-file=- >/dev/null
    echo "  $name: version added (throwaway)"
}

echo "throwaway secrets for $PROJECT_ID"
printf '%s' "mongodb://${MONGO_IP}:27017/tokentails" | add MONGODB_URI
printf '%s' "https://${DOMAIN},https://www.${DOMAIN}" | add FRONT_END_URLS
printf '%s' "staging-placeholder-$(openssl rand -hex 8)" | add OPENAI_API_KEY
openssl rand -hex 32 | tr -d '\n' | add INVALIDATE_CACHE_SECRET
openssl rand -hex 32 | tr -d '\n' | add PAWLEGENDS_PARTY_TICKET_SECRET
# A fresh RSA key lets Firebase Admin parse its config at boot; it is not the real service account key, so Firebase
# token checks fail on staging (expected: sign-in is not part of the staging test).
openssl genrsa 2048 2>/dev/null | add FB_PRIVATE_KEY
echo "done"
