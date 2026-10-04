import { SHELTER_CHAINS } from "./chains";
// public/shelter-payouts/routers.json: the DonateRouter deployments (feature F1). It ships as [] and
// the founder fills it after each deploy. A router is the only contract the public "give from your
// wallet" button talks to: it has no owner, pays every gift on in the call that brings it in, and
// reverts if any part of a gift would reach the ShelterSplit treasury.

export const ROUTERS_URL = "/shelter-payouts/routers.json";

export type RouterNetwork = "testnet" | "mainnet";

export interface RouterEntry {
  chainId: number;
  /** DonateRouter address. */
  router: string;
  /** The USDC (EIP-3009) token the router pulls from. */
  usdc: string;
  network: RouterNetwork;
  /**
   * Not rendered anywhere. Leave it out of public/shelter-payouts/routers.json: that file ships in
   * app builds, where copy-lint R10 refuses chain names. Pages name a chain from chains.ts.
   */
  label?: string;
  /** The token's symbol when it is not the chain's default (e.g. "EURC" for a EURC split's router). */
  symbol?: string;
  /**
   * The token supports EIP-3009 (receiveWithAuthorization), checked by hand when the entry was added.
   * Needed on chains whose native coin is not USDC; on Arc the native USDC's ERC-20 view has it.
   */
  eip3009?: boolean;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Keeps only well-formed entries; a typo in one entry never breaks the page. */
export function parseRouters(raw: unknown): RouterEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RouterEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const e = r as Partial<RouterEntry>;
    if (typeof e.chainId !== "number" || !Number.isInteger(e.chainId) || e.chainId <= 0) continue;
    if (typeof e.router !== "string" || !ADDRESS.test(e.router)) continue;
    if (typeof e.usdc !== "string" || !ADDRESS.test(e.usdc)) continue;
    if (e.network !== "testnet" && e.network !== "mainnet") continue;
    // A one-signature gift needs EIP-3009: Tempo's TIP-20 tokens lack it, and USDG is unverified.
    // Only Arc (native USDC) is taken on trust; every other chain needs the entry's explicit flag.
    const usdcNative = SHELTER_CHAINS[e.chainId]?.nativeSymbol === "USDC";
    if (!usdcNative && e.eip3009 !== true) continue;
    out.push({
      chainId: e.chainId,
      router: e.router,
      usdc: e.usdc,
      network: e.network,
      ...(typeof e.label === "string" && e.label ? { label: e.label } : {}),
      ...(typeof e.symbol === "string" && /^[A-Za-z0-9.]{1,12}$/.test(e.symbol) ? { symbol: e.symbol } : {}),
      ...(e.eip3009 === true ? { eip3009: true } : {}),
    });
  }
  return out;
}

export async function fetchRouters(): Promise<RouterEntry[]> {
  try {
    const res = await fetch(ROUTERS_URL, { cache: "no-store" });
    if (!res.ok) return [];
    return parseRouters(await res.json());
  } catch {
    return [];
  }
}

export const routerFor = (routers: RouterEntry[], chainId: number | null | undefined) =>
  chainId ? routers.find((r) => r.chainId === chainId) || null : null;
