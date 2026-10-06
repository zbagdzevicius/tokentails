// copy-lint: web-only test fixture for the web wallet-giving flow (never part of an app build)
/**
 * A local Arc testnet fork for the wallet-giving E2E (e2e/wallet-donate.spec.ts).
 *
 * - anvil forks https://rpc.testnet.arc.io on FORK_RPC (default http://127.0.0.1:8547), or reuses one
 *   already listening there. On Arc the native coin is USDC, and the fork's USDC contract reads the
 *   same balance, so anvil's dev accounts already hold test USDC.
 * - The DonateRouter is deployed with `forge create --unlocked --from <dev account #0>`: anvil signs
 *   for its own unlocked dev accounts, so no private key is passed anywhere. FORK_ROUTER skips the
 *   deploy and reuses a router already on the fork.
 * - The browser gets an injected `window.ethereum` that forwards every request to the fork, so
 *   eth_signTypedData_v4 and eth_sendTransaction are answered by anvil's unlocked accounts.
 *
 * Nothing here touches a real network: the fork is local, and its state is thrown away with it.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { encodeDonateWithAuthorizationCalldata } from "../../components/shelter-payouts/calldata";

export const ARC_TESTNET_RPC = "https://rpc.testnet.arc.io";
export const ARC_TESTNET_ID = 5042002;
export const FORK_RPC = process.env.FORK_RPC || "http://127.0.0.1:8547";
/** Arc testnet USDC (EIP-3009) and the ShelterSplit Token Tails deployed there (100% to Pink Paw). */
export const ARC_USDC = "0x3600000000000000000000000000000000000000";
export const ARC_TESTNET_SPLIT = "0x457c89e10a6e66633eda5bf82fd086febb5db147";
export const PINK_PAW_TEST_WALLET = "0xE299299b846Ba629f5A591dBF4F562bcC07A0f37";

/** anvil's public, well-known dev accounts (addresses only). */
export const DEV = {
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // #0
  relayer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // #1, plays the Token Tails relay
  // #3. On the public Arc testnet several dev accounts carry EIP-7702 delegations (0xef0100… code),
  // and FiatToken then checks their signatures as ERC-1271 contracts; #3 has none, and
  // clearDonorCode() makes sure of it on the fork.
  donor: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
};

/**
 * Arc moves USDC through a native-coin precompile at 0x1800…0000 (and checks a blocklist at
 * 0x1800…0001). A local anvil fork cannot execute them, so every USDC transfer reverts there. This
 * stand-in, installed with anvil_setCode on the fork only, credits the receiver from the stub's own
 * balance (a throwaway contract that self-destructs into `to`, so the router's missing receive() is
 * not called) and reports nobody as blocklisted. It cannot debit the sender: on the fork the donor
 * keeps its balance, while the shelter's balance rises exactly as on Arc. Source:
 *
 *   contract Pay { constructor(address payable to) payable { selfdestruct(to); } }
 *   contract ArcNativeStub {
 *     function transfer(address, address to, uint256 amount) external returns (bool) {
 *       new Pay{value: amount}(payable(to)); return true;
 *     }
 *     function isBlocklisted(address) external pure returns (bool) { return false; }
 *     receive() external payable {}
 *   }
 *
 * (solc 0.8.24, deployed bytecode.)
 */
const ARC_NATIVE_STUB_CODE =
  "0x60806040526004361061002c575f3560e01c80638e204c4314610037578063beabacc81461007357610033565b3661003357005b5f80fd5b348015610042575f80fd5b5061005d60048036038101906100589190610160565b6100af565b60405161006a91906101a5565b60405180910390f35b34801561007e575f80fd5b50610099600480360381019061009491906101f1565b6100b5565b6040516100a691906101a5565b60405180910390f35b5f919050565b5f81836040516100c4906100f6565b6100ce9190610261565b6040518091039082f09050801580156100e9573d5f803e3d5ffd5b5050600190509392505050565b60ba8061027b83390190565b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61012f82610106565b9050919050565b61013f81610125565b8114610149575f80fd5b50565b5f8135905061015a81610136565b92915050565b5f6020828403121561017557610174610102565b5b5f6101828482850161014c565b91505092915050565b5f8115159050919050565b61019f8161018b565b82525050565b5f6020820190506101b85f830184610196565b92915050565b5f819050919050565b6101d0816101be565b81146101da575f80fd5b50565b5f813590506101eb816101c7565b92915050565b5f805f6060848603121561020857610207610102565b5b5f6102158682870161014c565b93505060206102268682870161014c565b9250506040610237868287016101dd565b9150509250925092565b5f61024b82610106565b9050919050565b61025b81610241565b82525050565b5f6020820190506102745f830184610252565b9291505056fe60806040526040516100ba3803806100ba8339818101604052810190602391906093565b8073ffffffffffffffffffffffffffffffffffffffff16ff5b5f80fd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6067826040565b9050919050565b607581605f565b8114607e575f80fd5b50565b5f81519050608d81606e565b92915050565b5f6020828403121560a55760a4603c565b5b5f60b0848285016081565b9150509291505056fea264697066735822122068dcb71bf92822e69917de43dcfcf003deb2352aa27e4d1599a3c367b45c574a64736f6c63430008180033";

export async function stubArcPrecompiles() {
  for (const addr of ["0x1800000000000000000000000000000000000000", "0x1800000000000000000000000000000000000001"]) {
    await forkRpc("anvil_setCode", [addr, ARC_NATIVE_STUB_CODE]);
  }
  await forkRpc("anvil_setBalance", ["0x1800000000000000000000000000000000000000", "0x" + (BigInt(10) ** BigInt(30)).toString(16)]);
}

/** Drops any EIP-7702 delegation code from the donor on the fork, so it signs as a plain EOA. */
export async function clearDonorCode(address: string = DEV.donor) {
  await forkRpc("anvil_setCode", [address, "0x"]);
}

const REPO = resolve(__dirname, "..", "..", "..");
const SPLIT_DIR = join(REPO, "contracts", "shelter-split");

let rpcId = 0;
export async function forkRpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(FORK_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

async function forkChainId(): Promise<number | null> {
  try {
    return parseInt(await forkRpc<string>("eth_chainId"), 16);
  } catch {
    return null;
  }
}

/** Reuses a fork on FORK_RPC or starts anvil detached; resolves once it answers. */
export async function ensureFork(): Promise<void> {
  if ((await forkChainId()) === ARC_TESTNET_ID) return;
  const port = new URL(FORK_RPC).port || "8547";
  const child = spawn("anvil", ["--fork-url", ARC_TESTNET_RPC, "--port", port, "--silent"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    if ((await forkChainId()) === ARC_TESTNET_ID) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`anvil fork did not come up on ${FORK_RPC}`);
}

/** Deploys a DonateRouter in front of the Arc testnet ShelterSplit, signed by unlocked dev account #0. */
export function deployRouter(): string {
  if (process.env.FORK_ROUTER) return process.env.FORK_ROUTER;
  const out = join(tmpdir(), "tt-fork-e2e-forge");
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const stdout = execFileSync(
    "forge",
    [
      "create",
      "src/DonateRouter.sol:DonateRouter",
      "--rpc-url",
      FORK_RPC,
      "--unlocked",
      "--from",
      DEV.deployer,
      "--broadcast",
      // Build artifacts go to a temp dir, not the contract package's own out/ and cache/.
      "--out",
      join(out, "out"),
      "--cache-path",
      join(out, "cache"),
      "--constructor-args",
      ARC_TESTNET_SPLIT,
      ARC_USDC,
    ],
    { cwd: SPLIT_DIR, encoding: "utf8", env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" } }
  );
  const m = /Deployed to:\s*(0x[0-9a-fA-F]{40})/.exec(stdout);
  if (!m) throw new Error(`forge create printed no address:\n${stdout}`);
  return m[1];
}

export const nativeBalance = async (address: string) => BigInt(await forkRpc<string>("eth_getBalance", [address, "latest"]));
export const blockNumber = async () => parseInt(await forkRpc<string>("eth_blockNumber"), 16);

export async function waitMined(txHash: string): Promise<{ status: string; blockNumber: string }> {
  for (let i = 0; i < 60; i++) {
    const r = await forkRpc<{ status: string; blockNumber: string } | null>("eth_getTransactionReceipt", [txHash]);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`not mined: ${txHash}`);
}

/**
 * window.ethereum for the page: every call goes to the fork. eth_requestAccounts answers `account`
 * (an unlocked dev account); chain switches are no-ops because the fork is already Arc testnet.
 */
export async function injectForkWallet(page: Page, account: string) {
  await page.addInitScript(
    ({ rpc, account }) => {
      let id = 0;
      const forward = async (method: string, params: unknown[] = []) => {
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        });
        const body = await res.json();
        if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code });
        return body.result;
      };
      (window as unknown as { ethereum: unknown }).ethereum = {
        isForkWallet: true,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
          if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
          return forward(method, params || []);
        },
      };
    },
    { rpc: FORK_RPC, account }
  );
}

/** Sends the page's Arc testnet RPC reads (payouts, receipt) to the fork instead. */
export async function routeArcRpcToFork(page: Page) {
  await page.route(`${ARC_TESTNET_RPC}/**`, async (route) => {
    const res = await fetch(FORK_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: route.request().postData() || "",
    });
    await route.fulfill({
      status: res.status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: await res.text(),
    });
  });
}

/**
 * Stands in for POST /shelter/relay when the backend is not running: submits the donor's signed gift
 * to the fork from dev account #1 (the relay's role: it pays the gas, never holds the USDC).
 */
export async function mockRelayOnFork(page: Page, router: string, onRelay?: (txHash: string) => void) {
  await page.route("**/shelter/relay", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
      return;
    }
    const b = JSON.parse(route.request().postData() || "{}");
    const data = encodeDonateWithAuthorizationCalldata(
      {
        from: b.from,
        value: b.value,
        validAfter: b.validAfter,
        validBefore: b.validBefore,
        salt: b.salt,
        memo: b.memo,
        recipients: b.recipients,
      },
      b.signature
    );
    const txHash = await forkRpc<string>("eth_sendTransaction", [{ from: DEV.relayer, to: router, data }]);
    onRelay?.(txHash);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ txHash, status: "submitted" }),
    });
  });
}
