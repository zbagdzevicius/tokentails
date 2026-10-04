// Prepares the local chain and database for the crypto checkout E2E (called by stack.sh; local only).
//
// - A plain anvil chain (31337, no fork, nothing leaves the machine).
// - Deploys, from unlocked anvil dev accounts (no private key passed anywhere): two test MockUSDC
//   instances playing USDC and EURC (6 decimals, anyone can mint; test tokens only), and
//   ShelterSplit(USDC, treasury = dev #5, owner = dev #0) paying 100% to the test shelter wallet dev #4.
// - Mints test USDC/EURC to the buyers and to the hot wallet float (dev #1).
// - Seeds the throwaway Mongo database: Pink Paw (the showcase shelter id) and three rescue cats.
// - Writes addresses to <state>/state.json.
//
// Usage: node setup.mjs <rpc> <state-dir> <mongo-uri>
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPLIT_DIR = resolve(HERE, "..", "shelter-split");
const [rpc, stateDir, mongo] = process.argv.slice(2);
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rpc || "") || !/^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(mongo || "")) {
  console.error("usage: node setup.mjs http://127.0.0.1:<port> <state-dir> mongodb://127.0.0.1/<db>  (local only)");
  process.exit(2);
}
mkdirSync(stateDir, { recursive: true });

export const DEV = {
  owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // #0 deployer, split owner
  hot: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // #1 Token Tails hot wallet (shelter share float)
  buyer: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // #3 buyer wallet
  shelter: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // #4 the shelter's wallet
  treasury: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // #5 Token Tails treasury (purchases)
  buyer2: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", // #6 second buyer wallet
};

const env = { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" };
const OUT = join(stateDir, "forge");
function create(contract, args = []) {
  const out = execFileSync(
    "forge",
    ["create", contract, "--rpc-url", rpc, "--unlocked", "--from", DEV.owner, "--broadcast",
      "--out", join(OUT, "out"), "--cache-path", join(OUT, "cache"), ...(args.length ? ["--constructor-args", ...args] : [])],
    { cwd: SPLIT_DIR, encoding: "utf8", env }
  );
  const m = /Deployed to:\s*(0x[0-9a-fA-F]{40})/.exec(out);
  if (!m) throw new Error(`forge create ${contract} printed no address:\n${out}`);
  return m[1];
}
const send = (from, to, sig, args = []) =>
  execFileSync("cast", ["send", to, sig, ...args, "--rpc-url", rpc, "--unlocked", "--from", from], { encoding: "utf8", env });

const chainId = Number(execFileSync("cast", ["chain-id", "--rpc-url", rpc], { encoding: "utf8" }).trim());
if (chainId !== 31337) throw new Error(`expected a local anvil chain (31337), got ${chainId}`);
const fromBlock = Number(execFileSync("cast", ["block-number", "--rpc-url", rpc], { encoding: "utf8" }).trim());

const usdc = create("test/mocks/Tokens.sol:MockUSDC");
const eurc = create("test/mocks/Tokens.sol:MockUSDC");
const split = create("src/ShelterSplit.sol:ShelterSplit", [usdc, DEV.treasury, DEV.owner]);
send(DEV.owner, split, "addShelter(address,uint16,string)", [DEV.shelter, "10000", "Pink Paw (E2E test wallet)"]);
for (const who of [DEV.buyer, DEV.buyer2, DEV.hot]) {
  send(DEV.owner, usdc, "mint(address,uint256)", [who, "1000000000"]);
  send(DEV.owner, eurc, "mint(address,uint256)", [who, "1000000000"]);
}

// Throwaway database only: Pink Paw and three rescue cats (one per flow, so no buyer owns one twice).
const PINK_PAW = "67b48fafd6c26c6cd40bfec6";
const seed = `
const shelter = ObjectId("${PINK_PAW}");
db.shelters.insertOne({ _id: shelter, name: "Rožinė pėdutė", slug: "rozine-pedute", description: "E2E", address: "E2E",
  foundedAt: new Date("2020-01-01"), image: ObjectId(), handoverStatus: "held-by-token-tails" });
const cats = [];
for (const name of ["Mochi", "Pupa", "Žuvėdra"]) {
  const cat = ObjectId(); const blessing = ObjectId();
  db.blessings.insertOne({ _id: blessing, name, description: "E2E rescue", status: "WAITING", kind: "rescue", shelter, cat, createdAt: new Date() });
  db.cats.insertOne({ _id: cat, name, type: "FIRE", tier: "COMMON", spriteImg: "e2e.png", catImg: "e2e.png", status: { EAT: 0 },
    blessing, shelter, createdAt: new Date() });
  cats.push(cat.toString());
}
print(JSON.stringify(cats));
`;
const cats = JSON.parse(execFileSync("mongosh", ["--quiet", mongo, "--eval", seed], { encoding: "utf8" }).trim().split("\n").pop());

const state = { rpc, chainId, usdc, eurc, split, fromBlock, cats, pinkPaw: PINK_PAW, dev: DEV };
writeFileSync(join(stateDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(JSON.stringify(state, null, 2));
