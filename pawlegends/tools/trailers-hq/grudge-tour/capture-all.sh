#!/bin/zsh
cd $(cd "$(dirname "$0")/../../.." && pwd)
for a in horizontal vertical square; do
  node tools/clips/record.mjs ${GT_DIR:?set GT_DIR to the Grudge Tour work dir}/takes/specs-$a.json --port 5491 --out-dir ${GT_DIR:?set GT_DIR to the Grudge Tour work dir}/takes/hq --lock ${LOCK:-$GT_DIR/../capture.lock} --report ${GT_DIR:?set GT_DIR to the Grudge Tour work dir}/takes/report-$a.json > ${GT_DIR:?set GT_DIR to the Grudge Tour work dir}/takes/capture-$a.log 2>&1
done
echo done > ${GT_DIR:?set GT_DIR to the Grudge Tour work dir}/takes/capture.done
