## HOW TO VERIFY AFTER DEPLOYMENT?
1. deploy through remix
2. export remix compiled data standard-input
3. jq -r '.compilerInput' TokenTailsMysteryBox_compData.json > standard-input.json
4. validate on block explorer