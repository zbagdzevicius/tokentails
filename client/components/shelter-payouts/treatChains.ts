// copy-lint: web-only chain and coin names render only in the web build's network chips (GiveTreat !isApp)
import type { DonateStatus, TreatChainStatus } from "@/api/shelter-api";
import { SHELTER_CHAINS, chainDisplayName } from "./chains";
import { formatUnits } from "./logs";

/**
 * The give page's network chips for the server-paid treat, in this order: Arc (the default), then
 * Arbitrum, Base, Avalanche, Robinhood, Tempo and Monad. Mainnet ids, with the testnet twin used when the
 * backend's main chain is a testnet (the local e2e). Only chains the backend reports as live can be
 * picked; the rest are shown greyed out with a short reason.
 */
export const TREAT_CHAIN_FAMILIES: { key: string; mainnet: number; testnet: number; coin: string }[] = [
  { key: "arc", mainnet: 5042, testnet: 5042002, coin: "USDC" },
  { key: "arbitrum", mainnet: 42161, testnet: 421614, coin: "USDC" },
  { key: "base", mainnet: 8453, testnet: 84532, coin: "USDC" },
  { key: "avalanche", mainnet: 43114, testnet: 43113, coin: "USDC" },
  // Robinhood Chain pays USDG (no USDC exists there); Tempo pays bridged USDC.e (TIP-20).
  { key: "robinhood", mainnet: 4663, testnet: 46630, coin: "USDG" },
  { key: "tempo", mainnet: 4217, testnet: 42431, coin: "USDC.e" },
  { key: "monad", mainnet: 143, testnet: 10143, coin: "USDC" },
];

const TESTNET_IDS = new Set(TREAT_CHAIN_FAMILIES.map((f) => f.testnet));

export interface TreatChip {
  chainId: number;
  /** "Base", "Base Sepolia testnet". */
  name: string;
  /** What the treat is paid in there: USDC, USDC.e (Tempo), USDG (Robinhood); test coins on testnets. */
  coin: string;
  /** Pickable: the backend serves treats there right now. */
  enabled: boolean;
  /** Why a chip cannot be picked, short. Null when enabled. */
  reason: string | null;
  main: boolean;
  /** The backend's entry for this chain, when it reported one. */
  status: TreatChainStatus | null;
  /** The backend's full reason when the chip cannot be picked (for a tooltip), else null. */
  detail: string | null;
}

/**
 * The backend's per-chain list. An older backend sends no `chains`: its top-level fields describe the
 * main chain, so the list is that one chain.
 */
export function backendTreatChains(status: DonateStatus | null | undefined): TreatChainStatus[] {
  if (!status) return [];
  if (Array.isArray(status.chains) && status.chains.length) return status.chains;
  const amount = BigInt(status.amountWei || "0");
  const remaining = BigInt(status.remainingTodayWei || "0");
  const left = amount > BigInt(0) ? Number(remaining / amount) : 0;
  return [
    {
      chainId: status.chainId,
      main: true,
      testnet: !!SHELTER_CHAINS[status.chainId]?.testnet,
      enabled: !!status.enabled,
      railState: status.railState || (!status.enabled ? "paused" : left > 0 ? "live" : "exhausted"),
      coin: SHELTER_CHAINS[status.chainId]?.symbol || "USDC",
      amountWei: status.amountWei,
      remainingTodayWei: status.remainingTodayWei,
      treatsLeftToday: left,
      splitAddress: status.splitAddress,
      explorer: SHELTER_CHAINS[status.chainId]?.explorer || null,
    },
  ];
}

/** Treats left on a chain today, from its remaining budget (whole treats). */
export function treatsLeft(c: Pick<TreatChainStatus, "amountWei" | "remainingTodayWei">): bigint {
  const amount = BigInt(c.amountWei || "0");
  return amount > BigInt(0) ? BigInt(c.remainingTodayWei || "0") / amount : BigInt(0);
}

/**
 * A short chip label for the backend's reason: a chain that is not funded yet "Opens soon", an RPC that
 * does not answer "Network busy", anything else (a paused split, an operator switch) "Paused".
 */
export function shortReason(reason: string | undefined | null): string {
  const r = String(reason || "").toLowerCase();
  if (/rpc|not answering|timeout|network/.test(r)) return "Network busy";
  if (/hot wallet|no gas|low on gas|less than one treat|no key|key or split|not funded/.test(r)) return "Opens soon";
  return "Paused";
}

const reasonFor = (c: TreatChainStatus | null): string | null => {
  if (!c) return "Not open yet";
  if (c.railState === "not-deployed") return "Not open yet";
  if (!c.enabled || c.railState === "paused") return shortReason(c.reason);
  if (c.railState === "exhausted" || treatsLeft(c) <= BigInt(0)) return "Jar empty today";
  return null;
};

/**
 * Whether a treat can be sent right now on ANY network the backend serves: the payouts page hero, its
 * closing button and the Heist follow this, so a paused main chain does not hide a live one (the give
 * page then picks that chain, initialTreatChain).
 */
export function treatJarOpen(status: DonateStatus | null | undefined): boolean {
  return backendTreatChains(status).some(
    (c) => c.enabled && c.railState !== "paused" && c.railState !== "not-deployed" && treatsLeft(c) > BigInt(0)
  );
}

const nameOf = (chainId: number): string =>
  SHELTER_CHAINS[chainId] ? chainDisplayName(SHELTER_CHAINS[chainId]) : `Chain ${chainId}`;

/**
 * One chip per family (main chain's network: mainnet or testnet), then any other chain the backend
 * serves. `status` null (backend unreachable): every chip is shown, none can be picked.
 */
export function treatChips(status: DonateStatus | null | undefined): TreatChip[] {
  const served = backendTreatChains(status);
  const mainId = status?.chainId ?? 5042;
  const testnet = TESTNET_IDS.has(mainId) || !!SHELTER_CHAINS[mainId]?.testnet;
  const ids = TREAT_CHAIN_FAMILIES.map((f) => (testnet ? f.testnet : f.mainnet));
  for (const c of served) if (!ids.includes(c.chainId)) ids.push(c.chainId);
  return ids.map((chainId) => {
    const entry = served.find((c) => c.chainId === chainId) || null;
    const family = TREAT_CHAIN_FAMILIES.find((f) => f.mainnet === chainId || f.testnet === chainId);
    const reason = status === null ? "Offline" : reasonFor(entry);
    return {
      chainId,
      name: nameOf(chainId),
      // The backend names the coin it pays; before it answers, the family's mainnet coin (or the
      // testnet's own test coin).
      coin: entry?.coin || (testnet ? SHELTER_CHAINS[chainId]?.symbol : family?.coin) || "USDC",
      enabled: reason === null,
      reason,
      main: chainId === mainId,
      status: entry,
      detail: reason !== null && entry?.reason ? entry.reason : null,
    };
  });
}

/** `?chain=<id>`: a positive whole number, or null. */
export function parseChainParam(v: string | undefined | null): number | null {
  if (!v || !/^\d{1,15}$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The chip picked on load: the `?chain=` deep link when that chain can be picked, else the main chain
 * (Arc), else the first chain that can be picked, else the main chain (shown closed).
 */
export function initialTreatChain(chips: TreatChip[], wanted: number | null, mainId: number): number {
  if (wanted !== null && chips.some((c) => c.chainId === wanted && c.enabled)) return wanted;
  if (chips.some((c) => c.chainId === mainId && c.enabled)) return mainId;
  return chips.find((c) => c.enabled)?.chainId ?? mainId;
}

/** amountWei is 18 decimals on every chain (the backend scales token treats): "0.01". */
export const treatAmount = (amountWei: string | bigint): string =>
  formatUnits(typeof amountWei === "bigint" ? amountWei : BigInt(amountWei || "0"), 18);
