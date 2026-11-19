#!/bin/zsh
G=${GT_DIR:?set GT_DIR to the Grudge Tour work dir}
while [ ! -f $G/takes/capture.done ]; do sleep 20; done
cd $(cd "$(dirname "$0")/../../.." && pwd)
node tools/clips/record.mjs $G/takes/specs-fix.json --port 5491 --out-dir $G/takes/hq --lock ${LOCK:-$GT_DIR/../capture.lock} --report $G/takes/report-fix.json > $G/takes/capture-fix.log 2>&1
echo done > $G/takes/fix.done
