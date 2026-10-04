// Prepares two local chains and the database for the multi-chain checkout + goal meter E2E (called by
// stack.sh; local only, nothing leaves the machine).
//
// Chain A, a plain anvil chain (31337): the shelter chain. Two MockUSDC instances play USDC and EURC
// (6 decimals, test tokens anyone can mint); ShelterSplit(USDC, treasury = dev #5, owner = dev #0) pays
// 100% to Pink Paw's wallet, which Token Tails holds until the handover (dev #4). The goal meter counts
// the USDC that comes in to that wallet (and, after the handover, to the shelter's own wallet dev #7).
//
// Chain B, a second plain anvil chain started with the Arc testnet chain id (5042002), NOT a fork: the
// MockUSDC runtime code is installed at the Arc testnet USDC and EURC addresses the checkout's chain
// list names, so the checkout's own chain entry (id, token addresses, confirmations) is what runs.
// Arc's native-coin USDC and its system Transfer log cannot be reproduced on anvil; the goal meter and
// the shelter split therefore live on chain A, where every USDC move is an ERC-20 Transfer.
//
// Every contract call is sent from unlocked anvil dev accounts: no private key is passed anywhere.
// Seeds the throwaway Mongo database with Pink Paw (the showcase shelter id) and eight rescue cats (flows use 0-4, ui.cjs 5-6).
// Writes <state>/state.json.
//
// Usage: node setup.mjs <rpc A> <rpc B> <state-dir> <mongo-uri>
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPLIT_DIR = resolve(HERE, "..", "shelter-split");
const [rpcA, rpcB, stateDir, mongo] = process.argv.slice(2);
const LOCAL_RPC = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/;
if (!LOCAL_RPC.test(rpcA || "") || !LOCAL_RPC.test(rpcB || "") || !/^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(mongo || "")) {
  console.error("usage: node setup.mjs http://127.0.0.1:<A> http://127.0.0.1:<B> <state-dir> mongodb://127.0.0.1/<db>  (local only)");
  process.exit(2);
}
mkdirSync(stateDir, { recursive: true });

export const DEV = {
  owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // #0 deployer, split owner
  hot: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // #1 Token Tails hot wallet (shelter share float)
  buyerA: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // #2
  buyerB: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // #3
  held: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // #4 Pink Paw wallet held by Token Tails (until handover)
  treasury: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // #5 Token Tails treasury (purchases), both chains
  donor: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", // #6 a public donor (gifts after the handover)
  own: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", // #7 the shelter's own wallet (after the handover)
  buyerC: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", // #8
};
/** The checkout's Arc testnet token addresses (backend/src/payments/crypto/crypto-chains.ts). */
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const env = { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" };
const OUT = join(stateDir, "forge");
function create(rpc, contract, args = []) {
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
const cast = (rpc, ...args) => execFileSync("cast", [...args, "--rpc-url", rpc], { encoding: "utf8", env }).trim();
const send = (rpc, from, to, sig, args = []) => cast(rpc, "send", to, sig, ...args, "--unlocked", "--from", from);

const chainA = Number(cast(rpcA, "chain-id"));
const chainB = Number(cast(rpcB, "chain-id"));
if (chainA !== 31337) throw new Error(`chain A: expected a local anvil chain (31337), got ${chainA}`);
if (chainB !== 5042002) throw new Error(`chain B: expected a local anvil chain started with --chain-id 5042002, got ${chainB}`);
// Chain B must be an empty local chain, not a fork of the real Arc testnet.
if (cast(rpcB, "code", ARC_TESTNET_USDC) !== "0x") throw new Error("chain B already has code at the Arc USDC address: is it a fork?");

// ---- chain A: tokens, split
const fromBlockA = Number(cast(rpcA, "block-number"));
const usdcA = create(rpcA, "test/mocks/Tokens.sol:MockUSDC");
const eurcA = create(rpcA, "test/mocks/Tokens.sol:MockUSDC");
const split = create(rpcA, "src/ShelterSplit.sol:ShelterSplit", [usdcA, DEV.treasury, DEV.owner]);
send(rpcA, DEV.owner, split, "addShelter(address,uint16,string)", [DEV.held, "10000", "Pink Paw (E2E held wallet)"]);
for (const who of [DEV.buyerA, DEV.buyerB, DEV.buyerC, DEV.hot, DEV.donor]) {
  send(rpcA, DEV.owner, usdcA, "mint(address,uint256)", [who, "1000000000"]);
  send(rpcA, DEV.owner, eurcA, "mint(address,uint256)", [who, "1000000000"]);
}

// ---- chain B: MockUSDC runtime code at the Arc testnet token addresses
const template = create(rpcB, "test/mocks/Tokens.sol:MockUSDC");
const runtime = cast(rpcB, "code", template);
for (const a of [ARC_TESTNET_USDC, ARC_TESTNET_EURC]) cast(rpcB, "rpc", "anvil_setCode", a, runtime);
for (const who of [DEV.buyerA, DEV.buyerB, DEV.buyerC]) {
  send(rpcB, DEV.owner, ARC_TESTNET_USDC, "mint(address,uint256)", [who, "1000000000"]);
  send(rpcB, DEV.owner, ARC_TESTNET_EURC, "mint(address,uint256)", [who, "1000000000"]);
}
const fromBlockB = Number(cast(rpcB, "block-number"));

// ---- throwaway database: Pink Paw and eight rescue cats (one per purchase, so no buyer owns one twice)
const PINK_PAW = "67b48fafd6c26c6cd40bfec6";
const seed = `
const shelter = ObjectId("${PINK_PAW}");
db.shelters.insertOne({ _id: shelter, name: "Rožinė pėdutė", slug: "rozine-pedute", description: "E2E", address: "E2E",
  foundedAt: new Date("2020-01-01"), image: ObjectId(), handoverStatus: "held-by-token-tails" });
const cats = [];
// Public sprite art from the game's asset CDN, so the screens show real cats (read-only image URLs).
const ART = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/";
const LOOKS = [["MIST/bow-tie-blue", "LOAF"], ["BOB/base", "DIGGING"], ["PINKIE/hat-santa-green", "JUMPING"], ["ROY/base", "SLEEP"]];
const names = ["Mochi", "Pupa", "Žuvėdra", "Riešutas", "Debesėlis", "Sagutė", "Pelytė", "Kmynas"];
for (let i = 0; i < names.length; i++) {
  const name = names[i]; const [look, pose] = LOOKS[i % LOOKS.length];
  const cat = ObjectId(); const blessing = ObjectId();
  db.blessings.insertOne({ _id: blessing, name, description: "E2E rescue", status: "WAITING", kind: "rescue", shelter, cat, createdAt: new Date() });
  db.cats.insertOne({ _id: cat, name, type: "FIRE", tier: "COMMON", spriteImg: ART + look + ".png", catImg: ART + look + "/" + pose + ".gif", status: { EAT: 0 },
    blessing, shelter, createdAt: new Date() });
  cats.push(cat.toString());
}
print(JSON.stringify(cats));
`;
const cats = JSON.parse(execFileSync("mongosh", ["--quiet", mongo, "--eval", seed], { encoding: "utf8" }).trim().split("\n").pop());

const state = {
  a: { rpc: rpcA, chainId: chainA, usdc: usdcA, eurc: eurcA, split, fromBlock: fromBlockA },
  b: { rpc: rpcB, chainId: chainB, usdc: ARC_TESTNET_USDC, eurc: ARC_TESTNET_EURC, fromBlock: fromBlockB },
  cats,
  pinkPaw: PINK_PAW,
  dev: DEV,
};
writeFileSync(join(stateDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(JSON.stringify(state, null, 2));
