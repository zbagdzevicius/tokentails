/**
 * The treat CTA never says treats are off while the backend reports an open network: when the main
 * chain cannot take a treat, normalizeDonateRail falls back to the first open chain in `chains`, and
 * sendTreat names it.
 */
import { normalizeDonateRail, treatRailOpen } from "@/api/impact-api";

const chain = (chainId: number, over: Record<string, unknown> = {}) => ({
  chainId,
  main: false,
  enabled: true,
  railState: "live",
  treatsLeftToday: 100,
  ...over,
});

describe("normalizeDonateRail with several networks", () => {
  it("keeps the main chain when it is open", () => {
    const rail = normalizeDonateRail({
      enabled: true,
      railState: "live",
      treatsLeftToday: 5,
      chains: [chain(5042002, { main: true }), chain(84532)],
    });
    expect(rail).toMatchObject({ enabled: true, state: "live", treatsLeftToday: 5 });
    expect(rail?.chainId).toBeUndefined();
  });

  it("opens on another network when the main chain cannot take a treat", () => {
    const rail = normalizeDonateRail({
      enabled: false,
      railState: "paused",
      treatsLeftToday: 0,
      chains: [
        chain(5042002, { main: true, enabled: false, railState: "paused" }),
        chain(84532, { enabled: false, railState: "paused" }),
        chain(10143),
      ],
    });
    expect(rail).toMatchObject({ enabled: true, state: "live", chainId: 10143 });
    expect(treatRailOpen(rail)).toBe(true);
  });

  it("stays paused when no network is open, and reads an older backend without chains", () => {
    expect(
      treatRailOpen(normalizeDonateRail({ enabled: false, railState: "paused", chains: [chain(84532, { enabled: false })] }))
    ).toBe(false);
    expect(normalizeDonateRail({ enabled: false, railState: "not-deployed" })).toMatchObject({ state: "not-deployed" });
  });
});
