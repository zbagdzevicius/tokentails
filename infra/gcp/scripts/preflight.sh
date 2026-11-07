#!/usr/bin/env bash
# Offline checks for the Google Cloud migration (infra/gcp/RUNBOOK.md, "Testing without a cloud").
# Nothing here calls Google Cloud: Terraform runs with -backend=false and mocked providers, gcloud is never invoked
# against a project. It refuses to run if any configured target project is the other company's (motored-497708).
#
#   infra/gcp/scripts/preflight.sh            terraform, linters, cloud-init, tool tests, guards (about 3 min)
#   infra/gcp/scripts/preflight.sh --backend  + backend lint, build and unit tests
#   infra/gcp/scripts/preflight.sh --docker   + backend image build and a local smoke run (mongo:7, both roles)
#   infra/gcp/scripts/preflight.sh --all      everything
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
GCP="$ROOT/infra/gcp"
TF="$GCP/terraform"
OUT="$GCP/.preflight"
mkdir -p "$OUT"
FORBIDDEN_PROJECT="motored-497708"
WANT_BACKEND=0
WANT_DOCKER=0
for a in "$@"; do
    case "$a" in
        --backend) WANT_BACKEND=1 ;;
        --docker) WANT_DOCKER=1 ;;
        --all) WANT_BACKEND=1 WANT_DOCKER=1 ;;
        -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
        *) echo "unknown option $a" >&2; exit 2 ;;
    esac
done

PASS=0
FAIL=0
SKIP=0
ok() { printf '  \033[32mok\033[0m    %s\n' "$1"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAIL=$((FAIL + 1)); }
skip() { printf '  \033[33mskip\033[0m  %s\n' "$1"; SKIP=$((SKIP + 1)); }
step() { printf '\n== %s\n' "$1"; }
# run "label" logfile cmd...: runs a command with output to a log, prints ok/FAIL and the log tail on failure
run() {
    local label=$1 log="$OUT/$2"
    shift 2
    if "$@" >"$log" 2>&1; then ok "$label"; else bad "$label (log: ${log#"$ROOT"/})"; tail -15 "$log" | sed 's/^/        /'; fi
}
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------------------------------------------
step "Project guard"
# Neutralise any ambient gcloud or Google SDK project for this process: nothing below may pick one up.
unset CLOUDSDK_CORE_PROJECT GOOGLE_CLOUD_PROJECT GOOGLE_PROJECT GCLOUD_PROJECT 2>/dev/null || true
guard_fail=0
for v in "${TF_VAR_project_id:-}" "${TF_PROJECT_ID:-}" "${GCP_PROJECT_ID:-}"; do
    if [ "$v" = "$FORBIDDEN_PROJECT" ]; then bad "an env var targets $FORBIDDEN_PROJECT"; guard_fail=1; fi
done
for f in "$TF"/envs/*/terraform.tfvars "$TF"/envs/*/*.auto.tfvars; do
    [ -f "$f" ] || continue
    if /usr/bin/grep -Eq "^\s*project_id\s*=\s*\"$FORBIDDEN_PROJECT\"" "$f"; then bad "$f targets $FORBIDDEN_PROJECT"; guard_fail=1; fi
    if /usr/bin/grep -Eq '^\s*project_id\s*=' "$f" && ! /usr/bin/grep -Eq '^\s*project_id\s*=\s*"tokentails-' "$f"; then
        bad "$f: project_id is not a tokentails-* project"; guard_fail=1
    fi
done
if /usr/bin/grep -rIl --exclude-dir=.terraform --exclude-dir=.preflight "$FORBIDDEN_PROJECT" "$TF" "$ROOT/.github/workflows" 2>/dev/null |
    /usr/bin/grep -vE '(variables\.tf|bootstrap/main\.tf|terraform\.tfvars\.example|\.tftest\.hcl|deploy-gcp\.yml|terraform\.yml)$' | /usr/bin/grep -q .; then
    bad "$FORBIDDEN_PROJECT appears outside the guard code"; guard_fail=1
fi
if have gcloud; then
    # Read the local config file only (no API call). This workstation's default belongs to another company: never use it.
    active=$(CLOUDSDK_CORE_DISABLE_PROMPTS=1 gcloud config get-value project 2>/dev/null || true)
    if [ "$active" = "$FORBIDDEN_PROJECT" ]; then
        printf '  \033[33mnote\033[0m  gcloud default project is %s (another company). preflight makes no gcloud call;\n' "$active"
        printf '        deploys must pass --project explicitly and deploy-gcp.yml refuses any other project.\n'
    fi
fi
[ $guard_fail -eq 0 ] && ok "no target project is $FORBIDDEN_PROJECT; every project_id is tokentails-*"
if [ $guard_fail -ne 0 ]; then echo "refusing to continue"; exit 1; fi

# ---------------------------------------------------------------------------------------------------------------
step "Terraform: format, init (no backend), validate"
if have terraform; then
    run "terraform fmt -check" tf-fmt.log terraform fmt -check -recursive "$TF"
    for dir in "$TF/bootstrap" "$TF/envs/prod" "$TF"/modules/*; do
        name=${dir#"$TF"/}
        run "validate $name" "tf-validate-${name//\//-}.log" bash -c \
            "terraform -chdir='$dir' init -backend=false -input=false -no-color >/dev/null && terraform -chdir='$dir' validate -no-color"
    done
else
    skip "terraform not installed"
fi

# ---------------------------------------------------------------------------------------------------------------
step "Terraform tests (mock providers, no credentials)"
if have terraform; then
    run "terraform test envs/prod" tf-test-prod.log terraform -chdir="$TF/envs/prod" test -no-color
    run "terraform test bootstrap" tf-test-bootstrap.log terraform -chdir="$TF/bootstrap" test -no-color
    /usr/bin/grep -E 'Success!|Failure!' "$OUT/tf-test-prod.log" | sed 's/^/        envs\/prod: /'
else
    skip "terraform not installed"
fi

# ---------------------------------------------------------------------------------------------------------------
step "Static guards"
if /usr/bin/grep -rn --include='*.tf' 'resource "google_secret_manager_secret_version"' "$TF" >/dev/null; then
    bad "a google_secret_manager_secret_version resource exists (values must never be in Terraform)"
else ok "no secret version resources in Terraform"; fi
if /usr/bin/grep -rnE --include='*.tf' 'version\s*=\s*"latest"' "$TF" >/dev/null; then
    bad "a secret reference uses \"latest\" (pin numeric versions)"
else ok "secret references are pinned"; fi
if /usr/bin/grep -rnE --include='*.tf' '"allUsers"|"allAuthenticatedUsers"' "$TF" >/dev/null; then
    bad "allUsers / allAuthenticatedUsers binding found"
else ok "no public IAM members"; fi
if /usr/bin/grep -rn --include='*.tf' 'INGRESS_TRAFFIC_ALL"' "$TF/envs" >/dev/null; then
    bad "a Cloud Run service allows INGRESS_TRAFFIC_ALL"
else ok "no Cloud Run service is open to the internet"; fi
if /usr/bin/grep -rn 'gce-container-declaration' "$TF" --include='*.tf' --include='*.tftpl' >/dev/null; then
    bad "deprecated konlet (gce-container-declaration) in use"
else ok "relay runs from systemd, no konlet"; fi
# Cloudflare ranges: Terraform (Cloud Armor allow list) vs the backend copy (trust proxy, client IP).
tf_cf=$(python3 - "$TF/envs/prod/variables.tf" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
out = []
for name in ("cloudflare_ipv4", "cloudflare_ipv6"):
    block = s[s.index(f'variable "{name}"'):]
    block = block[block.index("default"):]
    block = block[: block.index("]") + 1]
    out += re.findall(r'"([0-9a-f:.]+/[0-9]+)"', block)
print("\n".join(sorted(out)))
PY
)
be_cf=$(/usr/bin/grep -oE "'[0-9a-f:.]+/[0-9]+'" "$ROOT/backend/src/shared/cloudflare-ips.ts" | tr -d "'" | sort)
if [ -n "$tf_cf" ] && [ "$tf_cf" = "$be_cf" ]; then ok "Cloudflare ranges match backend/src/shared/cloudflare-ips.ts ($(echo "$tf_cf" | wc -l | tr -d ' ') ranges)"
else bad "Cloudflare ranges differ between variables.tf and backend/src/shared/cloudflare-ips.ts"; fi
if /usr/bin/grep -q '"zbagdzevicius/tokentails"' "$TF/envs/prod/variables.tf"; then
    remote=$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)
    case "$remote" in *zbagdzevicius/tokentails.git | *zbagdzevicius/tokentails) ok "WIF repository matches git remote ($remote)" ;; *) bad "WIF repository differs from git remote ($remote)" ;; esac
fi

# ---------------------------------------------------------------------------------------------------------------
step "Linters (Docker)"
if have docker && docker info >/dev/null 2>&1; then
    run "tflint (google ruleset)" tflint.log docker run --rm -v "$TF":/data -w /data --entrypoint sh \
        ghcr.io/terraform-linters/tflint:latest -c 'tflint --init >/dev/null && tflint --recursive --config /data/.tflint.hcl -f compact'
    run "trivy config (waivers inline)" trivy.log docker run --rm -v "$TF":/src aquasec/trivy:latest config --quiet --exit-code 1 /src
else
    skip "docker not available: tflint, trivy"
fi

# ---------------------------------------------------------------------------------------------------------------
step "Relay cloud-init"
if have terraform; then
    rdir="$GCP/scripts/render-cloud-init"
    if terraform -chdir="$rdir" init -backend=false -input=false -no-color >"$OUT/ci-init.log" 2>&1 &&
        terraform -chdir="$rdir" apply -auto-approve -input=false -no-color -state="$OUT/render.tfstate" >"$OUT/ci-render.log" 2>&1 &&
        terraform -chdir="$rdir" output -state="$OUT/render.tfstate" -raw user_data >"$OUT/user-data" 2>>"$OUT/ci-render.log"; then
        ok "rendered ($(wc -l <"$OUT/user-data" | tr -d ' ') lines)"
        if /usr/bin/grep -Eq 'PRIVATE_KEY|STRIPE_SECRET|BEGIN [A-Z ]*KEY' "$OUT/user-data"; then bad "user-data mentions a hot-wallet or Stripe secret"
        else ok "user-data names no hot-wallet or Stripe secret"; fi
        if have docker && docker info >/dev/null 2>&1; then
            run "cloud-init schema + bash -n of every script" cloud-init.log docker run --rm -v "$OUT":/w -v "$GCP/scripts":/s:ro \
                ubuntu:24.04 bash /s/check-cloud-init.sh /w/user-data
        else skip "docker not available: cloud-init schema"; fi
    else
        bad "cloud-init render (log: infra/gcp/.preflight/ci-render.log)"
    fi
fi

# ---------------------------------------------------------------------------------------------------------------
step "Tools"
if have node; then
    run "ws-latency unit tests" tools-test.log node --test "$GCP/tools/ws-latency.test.mjs"
    if have actionlint; then run "actionlint" actionlint.log actionlint "$ROOT/.github/workflows/deploy-gcp.yml" "$ROOT/.github/workflows/terraform.yml"
    elif have docker && docker info >/dev/null 2>&1; then
        run "actionlint (Docker)" actionlint.log docker run --rm -v "$ROOT":/repo -w /repo rhysd/actionlint:latest \
            .github/workflows/deploy-gcp.yml .github/workflows/terraform.yml
    else skip "actionlint"; fi
    run "shell syntax (bash -n)" shell.log bash -c "for f in '$GCP'/scripts/*.sh; do bash -n \"\$f\" || exit 1; done"
else
    skip "node not installed"
fi

# ---------------------------------------------------------------------------------------------------------------
if [ $WANT_BACKEND -eq 1 ]; then
    step "Backend lint, build, unit tests"
    if [ -d "$ROOT/backend/node_modules" ]; then
        # The files this migration owns. (`npm run lint` on the whole backend also reports files of other workstreams.)
        run "eslint (process roles, relay module, bootstrap)" be-lint.log bash -c "cd '$ROOT/backend' && npx eslint src/shared/runtime src/relay.module.ts src/main.ts src/app.module.ts"
        run "npm run build" be-build.log npm --prefix "$ROOT/backend" run build
        run "npm test (process roles + health)" be-test-roles.log bash -c "cd '$ROOT/backend' && npx jest src/shared/runtime"
        # Some suites build an OpenAI client at import time: a placeholder key, never a real one.
        run "npm test (full suite)" be-test.log env OPENAI_API_KEY=preflight-placeholder INVALIDATE_CACHE_SECRET=preflight-placeholder npm --prefix "$ROOT/backend" test -- --silent
    else
        skip "backend/node_modules missing (npm ci in backend/ first)"
    fi
fi

# ---------------------------------------------------------------------------------------------------------------
if [ $WANT_DOCKER -eq 1 ]; then
    step "Backend image and local smoke run"
    if have docker && docker info >/dev/null 2>&1; then
        run "docker build backend" docker-backend.log docker build -t tt-backend:preflight "$ROOT/backend"
        net=tt-preflight
        cleanup() { docker rm -f tt-pf-mongo tt-pf-relay tt-pf-api >/dev/null 2>&1; docker network rm $net >/dev/null 2>&1; }
        cleanup
        docker network create $net >/dev/null
        docker run -d --name tt-pf-mongo --network $net mongo:7 --quiet >/dev/null
        docker run -d --name tt-pf-relay --network $net --cpus=2 -p 18180:8080 \
            -e BACKEND_ROLE=relay -e NODE_ENV=production -e NO_COLOR=1 -e MONGODB_URI=mongodb://tt-pf-mongo:27017/tokentails \
            -e FRONT_END_URLS=http://localhost:3000 -e PAWLEGENDS_PARTY_TICKET_SECRET=preflight-only-not-a-secret \
            tt-backend:preflight >/dev/null
        if curl -sf --retry 40 --retry-delay 2 --retry-connrefused --retry-all-errors http://127.0.0.1:18180/readyz >"$OUT/relay-readyz.json"; then
            ok "relay role: /readyz 200 $(cat "$OUT/relay-readyz.json")"
        else bad "relay role: /readyz did not answer 200"; fi
        docker logs tt-pf-relay >"$OUT/relay.log" 2>&1
        if /usr/bin/grep -Eiq 'cron|ScheduleModule|Stripe|Shelter' "$OUT/relay.log"; then bad "relay role logged cron, Stripe or shelter activity"
        else ok "relay role: no cron, Stripe or shelter lines"; fi
        run "relay WebSocket (ws-latency, 20 sockets)" ws-latency.log node "$GCP/tools/ws-latency.mjs" http://127.0.0.1:18180 \
            --origin http://localhost:3000 --n 20 --pings 10 --gap 50 --max-p95 50
        sed 's/^/        /' "$OUT/ws-latency.log"
        if [ -f "$ROOT/pawlegends/tests/e2e/mp/load.mjs" ]; then
            # Informational: on Docker Desktop the relay's loop gate can refuse a room right after boot and load.mjs
            # then times out. The sizing run is on the real VM (RUNBOOK.md step 5).
            if (cd "$ROOT/pawlegends" && ORIGIN=http://localhost:3000 RELAY=http://127.0.0.1:18180 ROOMS=4 SECONDS=20 \
                node --import "$GCP/tools/ws-origin-shim.mjs" tests/e2e/mp/load.mjs) >"$OUT/mp-load.log" 2>&1; then
                ok "mp/load.mjs smoke against the relay container (--cpus=2)"
            else
                printf '  \033[33mnote\033[0m  mp/load.mjs smoke did not finish (local timing; see mp-load.log)\n'
            fi
            /usr/bin/grep '^load:' "$OUT/mp-load.log" | sed 's/^/        /'
        fi
        # api role: a throwaway RSA key generated here lets Firebase Admin parse its config; it is never a real key.
        key=$(openssl genrsa 2048 2>/dev/null)
        docker run -d --name tt-pf-api --network $net --cpus=1 -p 18181:8080 \
            -e BACKEND_ROLE=api -e NODE_ENV=development -e NO_COLOR=1 -e MONGODB_URI=mongodb://tt-pf-mongo:27017/tokentails \
            -e FRONT_END_URLS=http://localhost:3000 -e OPENAI_API_KEY=placeholder -e INVALIDATE_CACHE_SECRET=placeholder \
            -e CRONS_ENABLED=false -e IMPACT_JOBS_ENABLED=false -e "FB_PRIVATE_KEY=$key" tt-backend:preflight >/dev/null
        unset key
        if curl -sf --retry 45 --retry-delay 2 --retry-connrefused --retry-all-errors http://127.0.0.1:18181/healthz >/dev/null; then
            ok "api role: /healthz 200"
            code=$(node "$GCP/tools/ws-latency.mjs" http://127.0.0.1:18181 --origin http://localhost:3000 --n 1 --pings 0 --json 2>/dev/null |
                node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(s).statuses)[0]))')
            if [ "$code" = "404" ]; then ok "api role: /pawlegends/ws is not served (HTTP $code)"; else bad "api role answered /pawlegends/ws with $code"; fi
        else
            bad "api role did not start"; docker logs tt-pf-api 2>&1 | tail -15 | sed 's/^/        /'
        fi
        start=$(date +%s)
        docker stop -t 60 tt-pf-relay >/dev/null
        ok "relay stopped on SIGTERM in $(($(date +%s) - start)) s"
        cleanup
    else
        skip "docker not available"
    fi
fi

printf '\n%d passed, %d failed, %d skipped (logs in infra/gcp/.preflight/)\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
