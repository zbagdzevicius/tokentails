/**
 * The landing's Moon Rave count is a copy of cat-rave's $1 = 1 cat rule (client/components/landing/
 * raveLive.ts; the duplicate is listed in docs/DEVELOPMENT.md). This pins the copy to cat-rave's own
 * config and to its bundled snapshot of the live index, so the two cannot drift apart.
 */
import fs from "fs";
import path from "path";
import { RAVE_MAINNET_CHAIN_IDS, raveTotalFromIndex, toUsdMicro } from "@/components/landing/raveLive";
import type { PayoutIndex } from "@/components/shelter-payouts/payoutIndex";

const RAVE = path.resolve(__dirname, "../../cat-rave/src");
const config = fs.readFileSync(path.join(RAVE, "config.ts"), "utf8");

describe("landing rave count = cat-rave's rule", () => {
  it("uses cat-rave's chains, dollar coins and EURC rate", () => {
    const chains = config.slice(config.indexOf("export const CHAINS"));
    // Array.from, not spread: ts-jest targets ES5 here, where spreading an iterator yields nothing.
    const ids = Array.from(chains.slice(0, chains.indexOf("});")).matchAll(/^\s*(\d+):\s*\{/gm), (m) => Number(m[1]));
    expect(RAVE_MAINNET_CHAIN_IDS.slice().sort((a, b) => a - b)).toEqual(ids.sort((a, b) => a - b));

    const symbols = /export const USD_SYMBOLS = Object\.freeze\(\[([^\]]*)\]\)/.exec(config)?.[1];
    const list = Array.from((symbols ?? "").matchAll(/'([^']+)'/g), (m) => m[1]);
    expect(list.length).toBeGreaterThan(0);
    const one = "1000000000000000000";
    for (const s of list) expect(toUsdMicro(s, one)).toBe(1_000_000);

    const eurc = Number(/export const EURC_USD = ([\d.]+);/.exec(config)?.[1]);
    expect(toUsdMicro("EURC", one)).toBe(Math.floor(1_000_000 * eurc));
  });

  it("counts cat-rave's bundled snapshot to the rave's own total", () => {
    const snap = JSON.parse(fs.readFileSync(path.join(RAVE, "data/snapshot.json"), "utf8")) as {
      totals: { symbol: string; amount18: string }[];
      contracts: PayoutIndex["contracts"];
      events: PayoutIndex["events"];
    };
    const index: PayoutIndex = { network: "mainnet", contracts: snap.contracts, events: snap.events };
    const total = raveTotalFromIndex(index);
    expect(total).not.toBeNull();
    // The rave's per-coin totals in the same snapshot, converted with the same rule.
    const expected = snap.totals.reduce((n, t) => n + (toUsdMicro(t.symbol, t.amount18) ?? 0), 0);
    expect(total!.usdMicro).toBe(expected);
    expect(total!.cats).toBe(Math.floor(expected / 1_000_000));
  });
});
