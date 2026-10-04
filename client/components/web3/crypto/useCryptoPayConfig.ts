// copy-lint: web-only the crypto checkout renders only in WebPayment, which app builds replace with AppCheckoutNotice
"use client";
/*
 * The public crypto checkout config (`GET /payments/crypto/config`), read once per page and shared by
 * the payment method picker. It decides two things before the buyer clicks anything:
 * - whether "Pay with crypto" is offered at all (hidden while the server sells on no network);
 * - the price the server charges, which can differ from a client copy (the Legendary pack: the client
 *   card shows $400, every checkout charges $350; see docs/CLIENT.md known issues).
 */
import { useEffect, useState } from "react";
import { CryptoPayConfig, CryptoPaySku } from "@/models/crypto-pay";
import { CRYPTO_PAY_API } from "./api";

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; promise: Promise<CryptoPayConfig | null> } | null = null;

/** One request per page load (5 min cache); a failure is cached as null only until the next call. */
export function loadCryptoPayConfig(): Promise<CryptoPayConfig | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = CRYPTO_PAY_API.config().catch(() => {
    cached = null;
    return null;
  });
  cached = { at: Date.now(), promise };
  return promise;
}

/** Tests only. */
export function resetCryptoPayConfigCache() {
  cached = null;
}

/** `undefined` while loading, `null` when it could not be read. */
export function useCryptoPayConfig(skip = false): CryptoPayConfig | null | undefined {
  const [config, setConfig] = useState<CryptoPayConfig | null | undefined>(undefined);
  useEffect(() => {
    if (skip) return;
    let live = true;
    void loadCryptoPayConfig().then((c) => {
      if (live) setConfig(c);
    });
    return () => {
      live = false;
    };
  }, [skip]);
  return config;
}

/** True when the server takes crypto for at least one network. */
export const cryptoPayOpen = (config: CryptoPayConfig | null | undefined): boolean =>
  !!config && config.enabled && config.chains.length > 0;

/** The server's list price for an item in USD, or null when the config does not name it. */
export function serverPriceUsd(sku: CryptoPaySku | null, config: Pick<CryptoPayConfig, "prices"> | null | undefined): number | null {
  if (!sku || !config?.prices) return null;
  const p = config.prices;
  const v = sku.kind === "PACK" ? p.packs?.[sku.packType] : sku.kind === "CAT" ? p.shelterCat : p.lootBox;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}
