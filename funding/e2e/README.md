# Testnet end-to-end harness

This harness runs the whole shelter-gift flow on testnets before anything goes to mainnet. It
covers the deploy, the server-paid treat, the x402 agent card, and the payouts and receipt pages.
Everything runs against a throwaway local MongoDB and Arc testnet (5042002). Every script refuses
mainnet chain IDs and non-localhost databases.

| File | What it does |
|---|---|
| `start-local.sh` | Starts mongod (port 27027, temp dir) and the backend (port 3105) on Arc testnet. `stop` tears both down. |
| `seed.mjs` | Inserts one adoptable cat (blessing `WAITING` + image + shelter) and the e2e user with one saved game. |
| `e2e.mjs` | Runs steps a–f: deployments, status + local-DB proof, Firebase sign-in + gift + receipt, the 429 repeat, x402 402 → pay → 200 → replay. |
| `payouts-check.mjs` | Loads `/shelter-payouts` and the receipt page in Playwright, using a temporary testnet `deployments.json`. |
| `lib.mjs` | Shared guards: testnet chain IDs, localhost URI, secret scrubbing, keystore unlock, e2e user. |
| `out/` | Logs, `state.env`, `e2e-result.json` (public tx hashes only), screenshots. Gitignored. |

## Wallets

Only addresses appear here. Keys live in Foundry keystores. Their password files are in
`funding/.secrets/<name>-password.txt`, and no script prints them or writes them anywhere.

| Name | Address | Needs on testnet |
|---|---|---|
| deployer (`tokentails`) | `0xd6F37D1241dA20BbE40D1210940Bc43A1Ec56263` | Gas on every chain in the wave, plus 1 USDC (ERC-20) on Arc for the proof payout |
| pinkpaw | `0xE299299b846Ba629f5A591dBF4F562bcC07A0f37` | Nothing (receives) |
| treasury | `0x7b136b872bEad1dAE557d1286f125B7A8A197C9A` | Nothing (receives) |
| donatehot | `0x8D03d8295892F7dE2B7cE57585Aa45Dd4B3C2ba0` | Arc testnet USDC: 0.01 a gift, plus gas |
| agent | `0x3333c1661B93f56DeC472eF89ACa03F56E70F9B7` | Arc testnet USDC: 0.01 a card, plus gas |

## Run order

Run every command from the repo root unless the step says otherwise.

### 1. Faucet

Fund the deployer, donatehot and agent on Arc testnet at <https://faucet.circle.com> (pick Arc
Testnet; USDC is the gas token there). Fund the deployer on the other testnets in the wave:
Arbitrum Sepolia, Avalanche Fuji and Tempo Moderato (pathUSD). Monad testnet has no USDC address
in `chains.json` yet, so the wave skips it.

To top up donatehot or agent from the deployer, run the command below. `DEPLOYER_PW` is the
deployer keystore's password file in `funding/.secrets/`. Its exact name (`deployer-password.txt`
or `tokentails-password.txt`) is not recorded here, so check it.

```sh
export DEPLOYER_PW=funding/.secrets/deployer-password.txt
cast send 0x8D03d8295892F7dE2B7cE57585Aa45Dd4B3C2ba0 --value 0.5ether --rpc-url https://rpc.testnet.arc.io \
  --account tokentails --password-file "$DEPLOYER_PW"
```

### 2. Deploy wave (testnet)

```sh
export RPC_ARC_TESTNET=https://rpc.testnet.arc.io
export RPC_TEMPO_TESTNET=https://rpc.moderato.tempo.xyz
export RPC_ARBITRUM_SEPOLIA=https://sepolia-rollup.arbitrum.io/rpc
export RPC_AVALANCHE_FUJI=https://api.avax-test.network/ext/bc/C/rpc
cd funding/framework
node bin/fund.mjs a:wave --network testnet --chains arc,tempo,arbitrum,avalanche,monad   # rewrites wave/deploy-testnet.sh
export FUND_KEYSTORE=tokentails FUND_KEYSTORE_PASSWORD_FILE="$PWD/../../$DEPLOYER_PW"
export SHELTERSPLIT_TREASURY=0x7b136b872bEad1dAE557d1286f125B7A8A197C9A
# Registers Pink Paw at 100% and makes one real ERC-20 payout (the Disbursed row on the payouts page):
export PROOF_SHELTER=0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 PROOF_SHELTER_NAME="Pink Paw (testnet)" PROOF_AMOUNT=1000000
DRY_RUN=1 tracks/a-build/wave/deploy-testnet.sh
tracks/a-build/wave/deploy-testnet.sh
```

The e2e needs Pink Paw registered as an active shelter on the Arc split with **10000 bps**. The
contract emits no `NativeDisbursed` event for the treasury remainder, so the x402 check only
passes when Pink Paw takes 100% of the split. If you deployed without `PROOF_SHELTER`, register
Pink Paw now:

```sh
cast send <ARC_SPLIT> "addShelter(address,uint16,string)" 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37 10000 "Pink Paw (testnet)" \
  --rpc-url https://rpc.testnet.arc.io --account tokentails --password-file "$DEPLOYER_PW"
```

### 3. Ingest

The deploy script runs this step itself. To run it by hand:

```sh
(cd funding/framework && node bin/fund.mjs a:ingest --network testnet)
```

This records each deploy in `tracks/a-build/deployments.json` with `network: "testnet"`. A
testnet ingest never publishes to the client's `deployments.json`; only mainnet does.

### 4. Start the local stack

```sh
funding/e2e/start-local.sh            # or: funding/e2e/start-local.sh 0x<arc testnet split>
```

The script refuses to start if port 27027 or 3105 is busy. It also refuses if the RPC does not
answer with chain ID 5042002, if the split address has no code, or if the `donatehot` keystore
does not match its address. It rebuilds `backend/dist` when that folder is missing or older than
`src/`. Logs go to `out/backend.log` and `out/mongod.log`.

### 5. Seed

```sh
node funding/e2e/seed.mjs
```

### 6. E2E

```sh
node funding/e2e/e2e.mjs                 # --skip-x402, --keep-donations, --delete-firebase-user[-only]
```

Step (a) fails before anything is spent if Pink Paw has less than 10000 bps (unless
`--skip-x402`). Step (b) proves the backend on 3105 uses the throwaway database: an unpaid
cat-card request stores an x402 nonce, and the script must find that nonce in the local mongod.
A backend on another database is refused before any user is written.

The script prints a PASS/FAIL table and exits with code 1 on any failure. It clears the e2e user's
earlier gift rows in the local database, so you can rerun it on the same day. Pass
`--keep-donations` to keep them.

### 7. Payouts and receipt pages

```sh
node funding/e2e/payouts-check.mjs       # --reuse-server if a dev server already runs on 3100
```

The script backs up `client/public/shelter-payouts/deployments.json` to
`out/deployments.json.bak` and writes the testnet list. It then starts
`npx next dev -p 3100` with `NEXT_PUBLIC_BE_URL=http://localhost:3105` and checks the payout rows.
It confirms that the payouts feed lists the e2e gift on Arc Testnet, and that both e2e receipts show as
confirmed from a listed contract. Screenshots go to `out/payouts.png` and
`out/receipt-{donate,x402}.png`. When it finishes, it restores the original file, including after
Ctrl-C, SIGTERM and SIGHUP. Every write goes through a temp file and `rename`, and
`out/deployments.json.written` records the hash of the testnet list. At the next start, a backup
left by a crashed run (even `kill -9`) is restored only if the client file still holds that
testnet list. If the file changed since, for example through a mainnet ingest, the script stops
and leaves both files for you to compare.

## Cleanup

```sh
funding/e2e/start-local.sh stop          # kills the backend and mongod, deletes the temp data dir
node funding/e2e/e2e.mjs --delete-firebase-user-only   # optional: drop the Firebase test user (no other step runs)
git status client/public/shelter-payouts # must be clean; if not: cp funding/e2e/out/deployments.json.bak client/public/shelter-payouts/deployments.json
rm -rf funding/e2e/out
```

## Safety notes

- **No mainnet.** `lib.mjs` reads the allowed chain IDs from the `testnet` entries in
  `chains.json` and rejects any mainnet ID. `start-local.sh` checks the RPC's chain ID. `e2e.mjs`
  checks the RPC, `/shelter/donate/status`, and the x402 `network`. It only pays the `payTo`
  address when that address matches the recorded testnet split, and never more than 0.1 USDC.
- **No production database.** The only URI is `mongodb://127.0.0.1:27027/tt-e2e`. Every script
  refuses `mongodb+srv`, any non-localhost host, and the database name `tokentails`. Before reading
  or writing, `seed.mjs` and `e2e.mjs` also ask the server for its `dbPath` and refuse unless it
  is a `tt-e2e-mongo.*` temp dir, so a localhost port that tunnels to a real database is refused
  too. mongod runs on a `mktemp` directory that `stop` deletes. If `start-local.sh` is interrupted
  or fails half way, it stops whatever it already started.
- **backend/.env still loads.** dotenv does not override variables that are already set. To keep
  the local backend from acting on production settings, `start-local.sh` sets these explicitly:
  `NODE_ENV=development`, `MONGODB_URI`, every `SHELTER_*` variable, `IMPACT_CDN_ENABLED=false`
  (no upload to the Spaces bucket), `PAWS_SETTLEMENT_ENABLED=false`, `CRONS_ENABLED=false`,
  `RESCUE_GOAL_SWEEPER=off`, `MONGO_TRANSACTIONS=false`, empty `IS_PROD` and `TRUST_PROXY`. Other
  third-party keys in `.env`, such as Stripe, SendGrid, AI and Spaces, stay loaded but no e2e step
  reaches them. Set `E2E_IMPACT_JOBS=false` to turn off the reconcile and indexer crons. They
  default to on, and run only against the local database and the testnet RPC.
- **Keys.** `cast wallet private-key` reads the donatehot key into a shell variable. That
  variable reaches only the backend process's environment, and the script unsets it straight away.
  Any process run by the same OS user can still read it, for example with `ps eww`. The agent key
  stays in `e2e.mjs` memory. All output goes through `scrub()`, which removes registered secrets,
  JWTs, PEM keys and `accesstoken` values.
- **Firebase is the real project.** `e2e.mjs` builds the Admin credential from `FB_PRIVATE_KEY`.
  It parses `backend/.env` with `dotenv.parse` inside its own process, so no other value from that
  file reaches `process.env`. It then creates or updates the Firebase Auth user `e2e-tester`
  (`e2e-tester@example.com`, email verified) in that project. That is a write to production
  Firebase Auth. No production MongoDB record is created. Remove the user with
  `--delete-firebase-user` (after a run) or `--delete-firebase-user-only` (nothing else runs). If the web API key is referrer-restricted, set
  `E2E_FIREBASE_REFERER=http://localhost:3000`.
- **Firebase without the real project (optional).** Start the Auth emulator with the backend's
  project ID, `npx firebase-tools emulators:start --only auth --project news-ccd33` (it needs
  Java), and export `E2E_FIREBASE_AUTH_EMULATOR=127.0.0.1:9099` before both `start-local.sh` and
  `e2e.mjs`. The backend then verifies emulator tokens, and `e2e.mjs` creates the test user in the
  emulator without reading `backend/.env`. Nothing is written to production Firebase Auth. Set the
  variable for both processes or for neither; with only one, sign-in returns 401.
- **Known issues, not fixed here.** `explorerTxUrl` in
  `backend/src/shelter/onchain/shelter-onchain.config.ts` always returns a mainnet
  `explorer.arc.io` link, so `explorerUrl` in testnet responses points at the wrong explorer.
  `campaign.json` targets Arc mainnet (5042), so the campaign meter and wallet-donate block stay
  empty on a testnet run. The client's `chains.ts` has no Monad testnet (10143) entry, so a
  Monad deployment needs an `rpc` and `explorer` override in `deployments.json`.
