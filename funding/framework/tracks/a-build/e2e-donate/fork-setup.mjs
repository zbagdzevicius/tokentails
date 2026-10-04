// Prepares the local Arc testnet fork for the donation E2E (called by stack.sh; local only).
//
// - Installs the Arc native-coin precompile stand-in from client/e2e/fixtures/wallet-fork.ts (a local
//   fork cannot run Arc's precompiles, so every USDC transfer would revert without it).
// - Clears EIP-7702 delegation code from the anvil dev accounts it uses (several carry one on the public
//   Arc testnet, which makes USDC check their signatures as ERC-1271 contracts).
// - Deploys, signed by unlocked anvil dev accounts (no private key passed anywhere):
//     ShelterSplit(USDC, treasury = dev #5, owner = dev #0) paying 100% to the test shelter wallet dev #4,
//     DonateRouter(split, USDC), CappedSpender(split, agent = dev #6, owner = dev #0, 0.05 / 0.10, native)
//   and funds the CappedSpender float with 1 test USDC.
// - Writes the addresses and the first block to <state>/state.json.
//
// Usage: node fork-setup.mjs <rpc> <state-dir>
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..", "..");
const SPLIT_DIR = resolve(HERE, "..", "shelter-split");
const [rpc, stateDir] = process.argv.slice(2);
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rpc || "")) {
  console.error("usage: node fork-setup.mjs http://127.0.0.1:<port> <state-dir>  (local RPC only)");
  process.exit(2);
}
mkdirSync(stateDir, { recursive: true });

export const DEV = {
  owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // #0 split owner, deployer
  hot: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // #1 Token Tails hot wallet (backend: treats, relay gas, match)
  donor: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // #3 donor in the browser
  shelter: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // #4 the shelter's own wallet
  treasury: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // #5 split treasury (must never be paid)
  agent: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", // #6 treat agent
  payer: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", // #7 x402 agent payer
  widgetDonor: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", // #8 donor through the shelter-rail widget
  settler: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", // #9 local x402 facilitator (pays gas only)
};
const ARC_USDC = "0x3600000000000000000000000000000000000000";

let id = 0;
async function call(method, params = []) {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const b = await res.json();
  if (b.error) throw new Error(`${method}: ${b.error.message}`);
  return b.result;
}

const env = { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" };
const OUT = join(stateDir, "forge");
function create(contract, args) {
  const out = execFileSync(
    "forge",
    ["create", contract, "--rpc-url", rpc, "--unlocked", "--from", DEV.owner, "--broadcast",
      "--out", join(OUT, "out"), "--cache-path", join(OUT, "cache"), "--constructor-args", ...args],
    { cwd: SPLIT_DIR, encoding: "utf8", env }
  );
  const m = /Deployed to:\s*(0x[0-9a-fA-F]{40})/.exec(out);
  if (!m) throw new Error(`forge create ${contract} printed no address:\n${out}`);
  return m[1].toLowerCase();
}
function send(from, to, sig, args = [], value) {
  execFileSync(
    "cast",
    ["send", to, ...(sig ? [sig, ...args] : []), "--rpc-url", rpc, "--unlocked", "--from", from, ...(value ? ["--value", value] : [])],
    { encoding: "utf8", env }
  );
}

const chainId = parseInt(await call("eth_chainId"), 16);
if (chainId !== 5042002) throw new Error(`expected an Arc testnet fork (5042002), got ${chainId}`);

const fixture = readFileSync(join(REPO, "client", "e2e", "fixtures", "wallet-fork.ts"), "utf8");
const stub = /ARC_NATIVE_STUB_CODE =\s*"(0x[0-9a-f]+)"/.exec(fixture)?.[1];
if (!stub) throw new Error("ARC_NATIVE_STUB_CODE not found in client/e2e/fixtures/wallet-fork.ts");
for (const a of ["0x1800000000000000000000000000000000000000", "0x1800000000000000000000000000000000000001"]) {
  await call("anvil_setCode", [a, stub]);
}
await call("anvil_setBalance", ["0x1800000000000000000000000000000000000000", "0x" + (10n ** 30n).toString(16)]);
for (const a of Object.values(DEV)) await call("anvil_setCode", [a, "0x"]);

const fromBlock = parseInt(await call("eth_blockNumber"), 16);
const split = create("src/ShelterSplit.sol:ShelterSplit", [ARC_USDC, DEV.treasury, DEV.owner]);
send(DEV.owner, split, "addShelter(address,uint16,string)", [DEV.shelter, "10000", "Pink Paw (E2E test wallet)"]);
const router = create("src/DonateRouter.sol:DonateRouter", [split, ARC_USDC]);
const spender = create("src/CappedSpender.sol:CappedSpender", [
  split, DEV.agent, DEV.owner, "50000000000000000", "100000000000000000", "true",
]);
send(DEV.owner, spender, "", [], "1ether");

const state = { rpc, chainId, usdc: ARC_USDC, split, router, spender, fromBlock, dev: DEV };
writeFileSync(join(stateDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(JSON.stringify(state, null, 2));
