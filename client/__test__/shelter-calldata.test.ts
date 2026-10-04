import { keccak_256 } from "@noble/hashes/sha3";
import {
  DONATE_SELECTOR,
  encodeDonateCalldata,
  parseUnits,
  toQuantity,
} from "@/components/shelter-payouts/calldata";
import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import {
  Eip1193,
  WrongNetworkError,
  addChainParams,
  connectWallet,
  walletErrorMessage,
} from "@/components/shelter-payouts/wallet";

const Z = "0".repeat(64);
const word = (hex: string) => hex.padStart(64, "0");

describe("donate(string) calldata", () => {
  it("uses keccak256('donate(string)')[0:4] as the selector", () => {
    const hash = Buffer.from(keccak_256(new TextEncoder().encode("donate(string)"))).toString("hex");
    expect(DONATE_SELECTOR).toBe("0x" + hash.slice(0, 8));
  });

  // Golden vectors produced with ethers v6 Interface.encodeFunctionData.
  it("matches ethers for a short memo", () => {
    expect(encodeDonateCalldata("tt:wallet")).toBe(
      "0xb5aebc80" + word("20") + word("9") + "74743a77616c6c6574".padEnd(64, "0")
    );
  });

  it("matches ethers for an empty memo", () => {
    expect(encodeDonateCalldata("")).toBe("0xb5aebc80" + word("20") + Z);
  });

  it("pads a memo longer than one word to two words", () => {
    const data = encodeDonateCalldata("x".repeat(33));
    expect(data).toBe("0xb5aebc80" + word("20") + word("21") + "78".repeat(33).padEnd(128, "0"));
    expect((data.length - 10) % 64).toBe(0);
  });

  it("counts UTF-8 bytes, not characters", () => {
    const data = encodeDonateCalldata("ė");
    expect(data.slice(10 + 64, 10 + 128)).toBe(word("2"));
    expect(data.slice(10 + 128, 10 + 132)).toBe("c497");
  });

  it("rejects memos over 64 bytes", () => {
    expect(() => encodeDonateCalldata("y".repeat(65))).toThrow(/64 bytes/);
  });
});

describe("units", () => {
  it("parses human amounts at 18 decimals", () => {
    expect(parseUnits("1", 18)).toBe(BigInt("1000000000000000000"));
    expect(parseUnits("0.01", 18)).toBe(BigInt("10000000000000000"));
    expect(() => parseUnits("1.0000001", 6)).toThrow();
    expect(() => parseUnits("-1", 18)).toThrow();
  });

  it("formats JSON-RPC quantities", () => {
    expect(toQuantity(BigInt(0))).toBe("0x0");
    expect(toQuantity("255")).toBe("0xff");
  });
});

describe("connectWallet (mocked EIP-1193, nothing is signed)", () => {
  const arc = SHELTER_CHAINS[5042];
  const FROM = "0x" + "33".repeat(20);

  /** `chainIds` are the answers to successive eth_chainId calls (the last one repeats). */
  function provider(chainIds: string[], opts: { unknownChain?: boolean } = {}) {
    const calls: { method: string; params?: unknown[] }[] = [];
    let n = 0;
    const eth: Eip1193 = {
      request: jest.fn(async (args) => {
        calls.push(args);
        switch (args.method) {
          case "eth_requestAccounts":
            return [FROM];
          case "eth_chainId":
            return chainIds[Math.min(n++, chainIds.length - 1)];
          case "wallet_switchEthereumChain":
            if (opts.unknownChain) throw Object.assign(new Error("unknown"), { code: 4902 });
            return null;
          case "wallet_addEthereumChain":
            return null;
        }
        throw new Error("unexpected " + args.method);
      }),
    };
    return { eth, calls };
  }

  it("asks nothing more when the wallet is already on the chain", async () => {
    const { eth, calls } = provider(["0x13b2"]);
    await expect(connectWallet(eth, 5042, arc)).resolves.toBe(FROM);
    expect(calls.map((c) => c.method)).toEqual(["eth_requestAccounts", "eth_chainId"]);
  });

  it("adds Arc with USDC as an 18-decimal native coin when the wallet does not know it", async () => {
    const { eth, calls } = provider(["0x1", "0x13b2"], { unknownChain: true });
    await connectWallet(eth, 5042, arc);
    const add = calls.find((c) => c.method === "wallet_addEthereumChain");
    expect(add?.params?.[0]).toEqual(addChainParams(5042, arc));
    expect(addChainParams(5042, arc)).toMatchObject({
      chainId: "0x13b2",
      nativeCurrency: { symbol: "USDC", decimals: 18 },
      rpcUrls: ["https://rpc.mainnet.arc.io"],
      blockExplorerUrls: ["https://explorer.arc.io"],
    });
  });

  it("refuses when the wallet says it switched but stays on another network", async () => {
    const { eth } = provider(["0x1"]);
    const err = await connectWallet(eth, 5042, arc).catch((e) => e);
    expect(err).toBeInstanceOf(WrongNetworkError);
    expect(walletErrorMessage(err)).toMatch(/still on another network.*Nothing was sent/);
  });

  it("explains a user rejection kindly", () => {
    expect(walletErrorMessage({ code: 4001 })).toMatch(/nothing was sent/);
  });
});
