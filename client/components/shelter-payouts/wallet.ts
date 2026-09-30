import { ChainInfo } from "./chains";
import { encodeDonateCalldata, parseUnits, toQuantity } from "./calldata";

// Raw EIP-1193 flow for a wallet donation: connect, switch to (or add) the chain, then send
// ShelterSplit.donate(memo) with the amount as the native value. No web3 dependency.

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export const WALLET_DONATE_ENABLED = process.env.NEXT_PUBLIC_WALLET_DONATE === "true";

export const WALLET_MEMO = "tt:wallet";

export function getInjectedProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth && typeof eth.request === "function" ? eth : null;
}

export function addChainParams(chainId: number, chain: ChainInfo) {
  return {
    chainId: toQuantity(BigInt(chainId)),
    chainName: chain.name,
    nativeCurrency: {
      name: chain.nativeSymbol || "native",
      symbol: chain.nativeSymbol || "native",
      decimals: chain.nativeDecimals ?? 18,
    },
    rpcUrls: [chain.rpc],
    blockExplorerUrls: [chain.explorer],
  };
}

export function donateTx(from: string, splitAddress: string, amount: string, chain: ChainInfo) {
  return {
    from,
    to: splitAddress,
    value: toQuantity(parseUnits(amount, chain.nativeDecimals ?? 18)),
    data: encodeDonateCalldata(WALLET_MEMO),
  };
}

const code = (err: unknown) => (err as { code?: number })?.code;

export async function walletDonate(
  eth: Eip1193,
  opts: { chainId: number; chain: ChainInfo; splitAddress: string; amount: string }
): Promise<string> {
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error("No wallet account was shared.");

  const want = toQuantity(BigInt(opts.chainId));
  const current = String(await eth.request({ method: "eth_chainId" })).toLowerCase();
  if (current !== want) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
    } catch (err) {
      // 4902: the wallet does not know this chain yet. Adding it also switches to it.
      if (code(err) !== 4902) throw err;
      await eth.request({ method: "wallet_addEthereumChain", params: [addChainParams(opts.chainId, opts.chain)] });
    }
  }

  const hash = await eth.request({
    method: "eth_sendTransaction",
    params: [donateTx(from, opts.splitAddress, opts.amount, opts.chain)],
  });
  if (typeof hash !== "string") throw new Error("The wallet did not return a transaction hash.");
  return hash;
}

export function walletErrorMessage(err: unknown): string {
  if (code(err) === 4001) return "No worries, nothing was sent.";
  const m = (err as { message?: string })?.message;
  return m ? `Wallet said: ${m}` : "The wallet could not send the donation.";
}
