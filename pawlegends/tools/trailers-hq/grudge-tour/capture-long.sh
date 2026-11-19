#!/bin/zsh
G=${GT_DIR:?set GT_DIR to the Grudge Tour work dir}
L=${LOCK:-$GT_DIR/../capture.lock}
until grep -q square $G/takes/r3.status 2>/dev/null; do sleep 10; done
cd $(cd "$(dirname "$0")/../../.." && pwd)
node tools/clips/record.mjs $G/takes/r3-long.json --port 5491 --out-dir $G/takes/hq --lock $L --report $G/takes/report-r3-long.json > $G/takes/capture-r3-long.log 2>&1; echo "long exit $?" >> $G/takes/r3.status
