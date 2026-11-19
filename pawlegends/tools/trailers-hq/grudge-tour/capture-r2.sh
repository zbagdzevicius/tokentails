#!/bin/zsh
G=${GT_DIR:?set GT_DIR to the Grudge Tour work dir}
cd $(cd "$(dirname "$0")/../../.." && pwd)
for a in horizontal vertical square; do
  node tools/clips/record.mjs $G/takes/r2-$a.json --port 5491 --out-dir $G/takes/hq --lock ${LOCK:-$GT_DIR/../capture.lock} --report $G/takes/report-r2-$a.json > $G/takes/capture-r2-$a.log 2>&1
  echo "$a exit $?" >> $G/takes/r2.status
done

