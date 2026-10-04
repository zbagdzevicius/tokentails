import { ChainType, CurrencyType } from "@/web3/contracts";
import { EntityType } from "./save";

export enum OrderStatus {
  COMPLETE = "COMPLETE",
  PENDING = "PENDING",
  FAILED = "FAILED",
}

export interface IOrder {
  status?: OrderStatus;
  ref?: string;
  hash: string;
  walletAddress: string;
  chainType: ChainType;
  currencyType: CurrencyType;
  price: number;
  entityType: EntityType;
  id?: string;
  user?: string;
  discount?: string;
}

export enum PackType {
  STARTER = "STARTER",
  INFLUENCER = "INFLUENCER",
  LEGENDARY = "LEGENDARY",
}

/**
 * Pack list prices in USD. Server: PACK_PRICES_CENTS in backend/src/payments/price-table.ts, which
 * decides what Stripe and the crypto checkout charge; these copies only display it
 * (docs/DEVELOPMENT.md lists every copy).
 */
export const packPrices: Readonly<Record<PackType, number>> = {
  [PackType.STARTER]: 5,
  [PackType.INFLUENCER]: 25,
  [PackType.LEGENDARY]: 350,
};

/**
 * Legendary pack sale: $100 through 27 Nov 2026 23:59:59 UTC. Server: LEGENDARY_PROMO_PRICE_CENTS and
 * LEGENDARY_PROMO_ENDS_AT in backend/src/payments/price-table.ts (exclusive end instant).
 */
export const LEGENDARY_PROMO = {
  priceUsd: 100,
  endsAt: "2026-11-28T00:00:00Z",
  label: "until 27 Nov",
} as const;

export const isLegendaryPromoActive = (now: Date = new Date()): boolean =>
  now.getTime() < new Date(LEGENDARY_PROMO.endsAt).getTime();

/** The price shown for a pack now: the Legendary sale price while it runs, else the list price. */
export const packPriceUsd = (packType: PackType, now: Date = new Date()): number =>
  packType === PackType.LEGENDARY && isLegendaryPromoActive(now)
    ? LEGENDARY_PROMO.priceUsd
    : packPrices[packType];

/**
 * Drop chances per pack, shown on the pack select and in the checkout's product info (one copy for
 * both). Display only: the roll happens on the server.
 */
export const PACK_ODDS: Readonly<Record<PackType, string>> = {
  [PackType.STARTER]: "90% Common, 9% Rare, 1% Epic",
  [PackType.INFLUENCER]: "75% Common, 21% Rare, 3.5% Epic, 0.5% Legendary",
  [PackType.LEGENDARY]: "20% Rare, 50% Epic, 30% Legendary",
};
