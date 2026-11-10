#!/usr/bin/env bash
# Runs inside an ubuntu container (preflight.sh): validates the rendered relay user-data with cloud-init's schema,
# then syntax-checks every shell script it writes. Usage: check-cloud-init.sh /w/user-data
set -euo pipefail
UD=${1:-/w/user-data}
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq cloud-init python3-yaml >/dev/null 2>&1
cloud-init schema --config-file "$UD"
python3 - "$UD" <<'PY'
import subprocess, sys, tempfile, yaml
doc = yaml.safe_load(open(sys.argv[1]))
paths = [f["path"] for f in doc["write_files"]]
for f in doc["write_files"]:
    if f["path"].endswith(".sh"):
        with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as t:
            t.write(f["content"])
        subprocess.run(["bash", "-n", t.name], check=True)
        print(f"bash -n ok: {f['path']}")
unit = next(f for f in doc["write_files"] if f["path"].endswith("tt-relay@.service"))["content"]
for needle in ["ExecStop=/usr/bin/docker stop -t 90 tt-relay-%i", "Restart=always", "ExecStartPre=/bin/bash /var/lib/tt-relay/prepare.sh %i"]:
    assert needle in unit, f"unit is missing: {needle}"
# blue/green deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §8.2): the new slot is ready before the old one drains
deploy = next(f for f in doc["write_files"] if f["path"].endswith("deploy.sh"))["content"]
assert deploy.index("/readyz") < deploy.index("/pawlegends/relay/drain"), "deploy.sh drains the old slot only after the new one is ready"
assert "RELAY_CONTROL_PORT" in next(f for f in doc["write_files"] if f["path"].endswith("prepare.sh"))["content"]
assert doc["runcmd"] == ["/bin/bash /var/lib/tt-relay/boot.sh"], "a boot starts the active slot only"
run = next(f for f in doc["write_files"] if f["path"].endswith("run.sh"))["content"]
assert "--network host" in run and '--env-file "/run/tt-relay/env-$SLOT"' in run, "run.sh must use host networking and the tmpfs env file"
assert "gce-container-declaration" not in open(sys.argv[1]).read(), "no konlet"
prep = next(f for f in doc["write_files"] if f["path"].endswith("prepare.sh"))["content"]
assert "project/attributes/tt-relay-env" in prep and "project/attributes/tt-relay-secrets" in prep, "prepare.sh reads env and secret pins from project metadata"
assert "/var/lib/tt-relay/image-$SLOT" in prep, "prepare.sh prefers the image deploy.sh wrote for the slot"
print("unit and run.sh checks ok:", ", ".join(paths))
PY
