#!/bin/zsh
G=${GT_DIR:?set GT_DIR to the Grudge Tour work dir}
L=${LOCK:-$GT_DIR/../capture.lock}
cd $(cd "$(dirname "$0")/../../.." && pwd)
VREM=t11-ridge-pudding-v,t20-nugget-v,salvo-ziggy-native-v,salvo-duchess-native-v,salvo-chili-native-v,salvo-dusty-native-v,salvo-barkula-native-v,salvo-frankie-native-v,salvo-meatball-native-v,salvo-clem-native-v
node tools/clips/record.mjs $G/takes/r2-vertical.json --only $VREM --port 5491 --out-dir $G/takes/hq --lock $L --report $G/takes/report-r3-vertical.json > $G/takes/capture-r3-vertical.log 2>&1; echo "vertical exit $?" >> $G/takes/r3.status
node tools/clips/record.mjs $G/takes/r2-mochi.json --only t10-hw-mochi-h,t10-hw-mochi-s --port 5491 --out-dir $G/takes/hq --lock $L --report $G/takes/report-r3-mochi.json > $G/takes/capture-r3-mochi.log 2>&1; echo "mochi exit $?" >> $G/takes/r3.status
node tools/clips/record.mjs $G/takes/r2-square.json --port 5491 --out-dir $G/takes/hq --lock $L --report $G/takes/report-r3-square.json > $G/takes/capture-r3-square.log 2>&1; echo "square exit $?" >> $G/takes/r3.status
