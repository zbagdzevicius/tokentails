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
unit = next(f for f in doc["write_files"] if f["path"].endswith("tt-relay.service"))["content"]
for needle in ["ExecStop=/usr/bin/docker stop -t 60 tt-relay", "Restart=always", "ExecStartPre=/bin/bash /var/lib/tt-relay/prepare.sh"]:
    assert needle in unit, f"unit is missing: {needle}"
run = next(f for f in doc["write_files"] if f["path"].endswith("run.sh"))["content"]
assert "--network host" in run and "--env-file /run/tt-relay/env" in run, "run.sh must use host networking and the tmpfs env file"
assert "gce-container-declaration" not in open(sys.argv[1]).read(), "no konlet"
print("unit and run.sh checks ok:", ", ".join(paths))
PY
