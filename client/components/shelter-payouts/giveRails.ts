// copy-lint: web-only used only by WalletDonate and ShelterPayouts (web builds)
// Multi-chain wallet giving (decision "B"): which chains a giver may pick, and how each one gives.
// Pure functions, unit-tested in __test__/shelter-give-rails.test.ts.
//
// Three paths, per chain:
// - "router": a DonateRouter is listed in routers.json and its token has EIP-3009. One signature;
//   the Token Tails relay pays the fee where it serves the chain, else the giver's wallet sends it.
// - "split": no router, or a token without EIP-3009 (Tempo's TIP-20 pathUSD and USDC.e, Robinhood's
//   USDG and test mUSDC). The giver approves the ShelterSplit for the exact amount and calls
//   disburse(amount, memo); on Tempo disburseWithMemo(amount, bytes32 memo). Before the wallet opens,
//   the page reads split.preview(amount) and refuses any gift a part of which would reach the treasury.
// - native: where the native coin is the gift coin itself (Arc: USDC pays the gas), one transaction,
//   router.donateNative on the router path or ShelterSplit.donate(memo) on the split path.
import { ChainInfo, SHELTER_CHAINS, chainRole } from "./chains";
import type { RouterEntry } from "./routers";
import { ShelterDeployment, deploymentToken, isTestnetDeployment, resolveChain } from "./rpc";

export type GivePath = "router" | "split";
export type RailNetwork = "testnet" | "mainnet";

export interface GiveRail {
  chainId: number;
  chain: ChainInfo;
  network: RailNetwork;
  path: GivePath;
  /** The DonateRouter on the router path, null on the split path. */
  router: RouterEntry | null;
  /** The ShelterSplit the split path pays into, null on the router path (the router knows its split). */
  split: string | null;
  /** The coin the giver gives: USDC, pathUSD, USDC.e, USDG, mUSDC or a router's own symbol. */
  symbol: string;
  /** Tempo: the split path calls disburseWithMemo with a bytes32 memo. */
  memo32: boolean;
  /** The native coin is the gift coin (Arc), so a one-transaction native gift is offered. */
  native: boolean;
}

/** The six chains a giver can pick, in the order the picker shows them: the campaign chain (Arc) first. */
export const WALLET_FAMILIES: readonly { key: string; mainnet: number; testnet: number }[] = [
  { key: "arc", mainnet: 5042, testnet: 5042002 },
  { key: "tempo", mainnet: 4217, testnet: 42431 },
  { key: "arbitrum", mainnet: 42161, testnet: 421614 },
  { key: "avalanche", mainnet: 43114, testnet: 43113 },
  { key: "base", mainnet: 8453, testnet: 84532 },
  { key: "robinhood", mainnet: 4663, testnet: 46630 },
];

export const WALLET_CHAIN_IDS: Record<RailNetwork, number[]> = {
  mainnet: WALLET_FAMILIES.map((f) => f.mainnet),
  testnet: WALLET_FAMILIES.map((f) => f.testnet),
};

/** Tempo (mainnet and testnet): no native coin, TIP-20 stablecoins, disburseWithMemo. */
export const TEMPO_CHAIN_IDS = new Set([4217, 42431]);

const networkOf = (chainId: number): RailNetwork | null =>
  WALLET_CHAIN_IDS.mainnet.includes(chainId) ? "mainnet" : WALLET_CHAIN_IDS.testnet.includes(chainId) ? "testnet" : null;

/**
 * The split the split path pays into: the newest deployment on that chain and network whose payout
 * token is the chain's own coin (a second EURC split is never the default). Null when none is listed.
 */
export function splitDeploymentFor(chainId: number, deployments: ShelterDeployment[]): ShelterDeployment | null {
  const want = networkOf(chainId);
  const own = SHELTER_CHAINS[chainId]?.symbol;
  if (!want || !own) return null;
  const list = deployments.filter(
    (d) =>
      d.chainId === chainId &&
      (want === "testnet") === isTestnetDeployment(d) &&
      (!d.contract || d.contract === "ShelterSplit") &&
      /^0x[0-9a-fA-F]{40}$/.test(d.address) &&
      (d.symbol || deploymentToken(d) || own) === own
  );
  return list.length ? list[list.length - 1] : null;
}

/** One chain's rail: its router when listed for that network, else its split, else null. */
export function railFor(chainId: number, routers: RouterEntry[], deployments: ShelterDeployment[]): GiveRail | null {
  const network = networkOf(chainId);
  if (!network) return null;
  const d = splitDeploymentFor(chainId, deployments);
  const chain = (d && resolveChain(d)) || SHELTER_CHAINS[chainId] || null;
  if (!chain) return null;
  const native = chain.nativeSymbol === "USDC";
  const memo32 = TEMPO_CHAIN_IDS.has(chainId);
  // The router of the chain's own coin: a second router for EURC is never the default.
  const router =
    routers.find((r) => r.chainId === chainId && r.network === network && (!r.symbol || r.symbol === chain.symbol)) || null;
  // Tempo's tokens have no EIP-3009, so even a listed router never carries a one-signature gift there.
  if (router && !memo32) {
    return { chainId, chain, network, path: "router", router, split: null, symbol: router.symbol || chain.symbol, memo32: false, native };
  }
  if (!d) return null;
  return { chainId, chain, network, path: "split", router: null, split: d.address, symbol: chain.symbol, memo32, native };
}

/**
 * A router rail for a coin other than the chain's own (EURC on Arc or Fuji). The donor picks it by
 * hand; it is never a chain's default, the relay (configured with the chain's own router) never sends
 * it, and the match never counts it.
 */
export const isExtraCoinRail = (r: Pick<GiveRail, "path" | "symbol" | "chain">) => r.path === "router" && r.symbol !== r.chain.symbol;

/** The picker's key for a rail: the chain id, or "<chainId>-<symbol>" for an extra-coin router. */
export const railKey = (r: Pick<GiveRail, "chainId" | "path" | "symbol" | "chain">) =>
  isExtraCoinRail(r) ? `${r.chainId}-${r.symbol}` : String(r.chainId);

/**
 * The extra-coin routers of one chain (EURC beside USDC), one rail per coin. Router path only: the
 * token must be flagged EIP-3009 in routers.json (even on Arc, where only native USDC is trusted), and
 * never on Tempo. Never a native gift: the native coin is not that coin.
 */
export function extraCoinRails(chainId: number, routers: RouterEntry[], deployments: ShelterDeployment[]): GiveRail[] {
  const network = networkOf(chainId);
  if (!network || TEMPO_CHAIN_IDS.has(chainId)) return [];
  const d = splitDeploymentFor(chainId, deployments);
  const chain = (d && resolveChain(d)) || SHELTER_CHAINS[chainId] || null;
  if (!chain) return [];
  const seen = new Set<string>();
  const out: GiveRail[] = [];
  for (const r of routers) {
    if (r.chainId !== chainId || r.network !== network || !r.symbol || r.symbol === chain.symbol || r.eip3009 !== true) continue;
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push({ chainId, chain, network, path: "router", router: r, split: null, symbol: r.symbol, memo32: false, native: false });
  }
  return out;
}

/**
 * Every chain of `network` that has a wallet path, in picker order. `withCoins` adds each chain's
 * extra-coin routers (EURC) right after its default rail.
 */
export function walletRails(network: RailNetwork, routers: RouterEntry[], deployments: ShelterDeployment[], withCoins = false): GiveRail[] {
  return WALLET_CHAIN_IDS[network].flatMap((id) => {
    const r = railFor(id, routers, deployments);
    const extra = withCoins ? extraCoinRails(id, routers, deployments) : [];
    return r ? [r, ...extra] : extra;
  });
}

/** NEXT_PUBLIC_WALLET_DONATE_CHAINS: comma-separated mainnet chain ids, or null when unset. */
export function parseChainList(raw: string | undefined): number[] | null {
  if (!raw || !raw.trim()) return null;
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * The real-money chains the campaign slot offers (the caller checks the flag and the handover).
 * Unset NEXT_PUBLIC_WALLET_DONATE_CHAINS keeps today's rule: the campaign chain, and only with a
 * listed mainnet router. Set, it names every mainnet chain to offer; each still needs a router or a
 * listed mainnet split. The campaign chain comes first when it is listed.
 */
export function campaignRails(
  campaignChainId: number,
  routers: RouterEntry[],
  deployments: ShelterDeployment[],
  chainList: string | undefined
): GiveRail[] {
  const listed = parseChainList(chainList);
  if (listed === null) {
    const r = railFor(campaignChainId, routers, deployments);
    return r && r.network === "mainnet" && r.path === "router" ? [r] : [];
  }
  const ids = listed.filter((id) => networkOf(id) === "mainnet");
  const ordered = [...ids.filter((id) => id === campaignChainId), ...WALLET_CHAIN_IDS.mainnet.filter((id) => id !== campaignChainId && ids.includes(id))];
  return ordered.flatMap((id) => {
    const r = railFor(id, routers, deployments);
    return r && r.network === "mainnet" ? [r] : [];
  });
}

/** The coin that pays the network fee on a chain: Arc's USDC, ETH, AVAX, or Tempo's stablecoins. */
export function feeCoin(chain: Pick<ChainInfo, "nativeSymbol" | "balanceToken">): string {
  return chain.nativeSymbol || (chain.balanceToken ? "USD" : "ETH");
}

/** "Gives USDC": the coin a chain's option takes. */
export const railCoinLine = (rail: Pick<GiveRail, "symbol">) => `Gives ${rail.symbol}`;

/**
 * How the network fee is covered on that chain, in one plain line. `relayLive`: the Token Tails relay
 * serves this chain right now (the router path only).
 */
export function railFeeLine(rail: Pick<GiveRail, "chainId" | "chain" | "path" | "symbol">, relayLive = false): string {
  if (relayLive && rail.path === "router") return "No fee for you: Token Tails covers it";
  if (TEMPO_CHAIN_IDS.has(rail.chainId)) return "No gas coin: the fee comes out of a stablecoin";
  const coin = feeCoin(rail.chain);
  // Arc's EURC gift still pays its fee in USDC: "the same coin" only when the gift is USDC.
  return rail.chain.nativeSymbol === "USDC" && rail.symbol === "USDC" ? "Fee in USDC, the same coin" : `Fee in ${coin} from your wallet`;
}

/** How many wallet steps a gift takes on that rail, for the line under the button. */
export function railStepsLine(rail: Pick<GiveRail, "path" | "native" | "symbol">, primary: "sign" | "native" | "split"): string {
  if (primary === "native") return "One transaction from your wallet.";
  if (primary === "sign") return "Sign once in your wallet.";
  return `Two steps in your wallet: allow ${rail.symbol} for this gift, then give.`;
}

/**
 * The page line under the picker: what the chosen chain is used for, then what the giver spends.
 * Tempo says plainly that it has no native coin (its role line says fees are paid in a stablecoin).
 */
export function railSummary(rail: Pick<GiveRail, "chainId" | "chain" | "symbol" | "path">, relayLive = false): string {
  const role = chainRole(rail.chainId);
  const coin = feeCoin(rail.chain);
  const spend =
    relayLive && rail.path === "router"
      ? `Your wallet spends only the ${rail.symbol} you give.`
      : TEMPO_CHAIN_IDS.has(rail.chainId)
      ? `There is no native coin: your wallet spends the ${rail.symbol} you give plus a small fee in a stablecoin.`
      : rail.chain.nativeSymbol === "USDC" && rail.symbol === "USDC"
      ? `Your wallet spends the ${rail.symbol} you give plus a small fee in USDC.`
      : `Your wallet spends the ${rail.symbol} you give plus a small fee in ${coin}, so it needs a little ${coin} too.`;
  return role ? `${role} ${spend}` : spend;
}
