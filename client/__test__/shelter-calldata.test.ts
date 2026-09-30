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
  addChainParams,
  donateTx,
  walletDonate,
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

describe("walletDonate (mocked EIP-1193, nothing is signed)", () => {
  const arc = SHELTER_CHAINS[5042];
  const SPLIT = "0x" + "22".repeat(20);
  const FROM = "0x" + "33".repeat(20);
  const HASH = "0x" + "ab".repeat(32);

  function provider(chainId: string, opts: { unknownChain?: boolean } = {}) {
    const calls: { method: string; params?: unknown[] }[] = [];
    const eth: Eip1193 = {
      request: jest.fn(async (args) => {
        calls.push(args);
        switch (args.method) {
          case "eth_requestAccounts":
            return [FROM];
          case "eth_chainId":
            return chainId;
          case "wallet_switchEthereumChain":
            if (opts.unknownChain) throw Object.assign(new Error("unknown"), { code: 4902 });
            return null;
          case "wallet_addEthereumChain":
            return null;
          case "eth_sendTransaction":
            return HASH;
        }
        throw new Error("unexpected " + args.method);
      }),
    };
    return { eth, calls };
  }

  it("sends donate calldata with the amount as native value", async () => {
    const { eth, calls } = provider("0x13b2");
    const hash = await walletDonate(eth, { chainId: 5042, chain: arc, splitAddress: SPLIT, amount: "1" });
    expect(hash).toBe(HASH);
    expect(calls.map((c) => c.method)).toEqual(["eth_requestAccounts", "eth_chainId", "eth_sendTransaction"]);
    expect(calls[2].params?.[0]).toEqual(donateTx(FROM, SPLIT, "1", arc));
    expect(donateTx(FROM, SPLIT, "1", arc)).toEqual({
      from: FROM,
      to: SPLIT,
      value: "0xde0b6b3a7640000",
      data: encodeDonateCalldata("tt:wallet"),
    });
  });

  it("adds Arc with USDC as an 18-decimal native coin when the wallet does not know it", async () => {
    const { eth, calls } = provider("0x1", { unknownChain: true });
    await walletDonate(eth, { chainId: 5042, chain: arc, splitAddress: SPLIT, amount: "5" });
    const add = calls.find((c) => c.method === "wallet_addEthereumChain");
    expect(add?.params?.[0]).toEqual(addChainParams(5042, arc));
    expect(addChainParams(5042, arc)).toMatchObject({
      chainId: "0x13b2",
      nativeCurrency: { symbol: "USDC", decimals: 18 },
      rpcUrls: ["https://rpc.mainnet.arc.io"],
      blockExplorerUrls: ["https://explorer.arc.io"],
    });
  });

  it("explains a user rejection kindly", () => {
    expect(walletErrorMessage({ code: 4001 })).toMatch(/nothing was sent/);
  });
});
