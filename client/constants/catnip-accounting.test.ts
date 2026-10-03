import {
  buildCatnipProfilePatch,
  CATNIP_CHAOS_LEVEL_CAPS,
  getCatnipBreakdown,
  MATCH3_LEVEL_CAPS,
  TOTAL_CATNIP_CAP,
} from "@/constants/catnip-accounting";
import { catnipChaosLevelsList, totalCatnip } from "@/components/Phaser/map";
import * as sharedCaps from "@/shared-contracts/caps";

describe("catnip accounting", () => {
  it("normalizes both modes with per-level caps", () => {
    const breakdown = getCatnipBreakdown({
      catnipChaos: [999, 99, -2, "x", 4.9] as unknown[],
      match3: [999, 12.7, -1, "oops", 3] as unknown[],
    });

    expect(breakdown.catnipChaos[0]).toBe(CATNIP_CHAOS_LEVEL_CAPS[0]);
    expect(breakdown.catnipChaos[1]).toBe(CATNIP_CHAOS_LEVEL_CAPS[1]);
    expect(breakdown.catnipChaos[2]).toBe(0);
    expect(breakdown.catnipChaos[3]).toBe(0);
    expect(breakdown.catnipChaos[4]).toBe(4);

    expect(breakdown.match3[0]).toBe(MATCH3_LEVEL_CAPS[0]);
    expect(breakdown.match3[1]).toBe(
      Math.min(MATCH3_LEVEL_CAPS[1], 12),
    );
    expect(breakdown.match3[2]).toBe(0);
    expect(breakdown.match3[3]).toBe(0);
    expect(breakdown.match3[4]).toBe(3);
  });

  it("keeps separate mode totals and one combined total", () => {
    const patch = buildCatnipProfilePatch({
      catnipChaos: [500, 10, 5, 999] as unknown[],
      match3: [12, 20, 7] as unknown[],
    });

    expect(patch.catnipChaosCount).toBe(
      patch.catnipChaos.reduce((acc, value) => acc + value, 0),
    );
    expect(patch.match3Count).toBe(
      patch.match3.reduce((acc, value) => acc + value, 0),
    );
    expect(patch.catnipCount).toBe(
      patch.catnipChaosCount + patch.match3Count,
    );
  });

  it("exposes a stable global cap", () => {
    const maxPossible =
      CATNIP_CHAOS_LEVEL_CAPS.reduce((acc, cap) => acc + cap, 0) +
      MATCH3_LEVEL_CAPS.reduce((acc, cap) => acc + cap, 0);
    expect(TOTAL_CATNIP_CAP).toBe(maxPossible);
  });

  it("caps endless at 500 (decision #57) and clamps 501 down", () => {
    expect(CATNIP_CHAOS_LEVEL_CAPS[0]).toBe(500);
    const patch = buildCatnipProfilePatch({ catnipChaos: [501] as unknown[] });
    expect(patch.catnipChaos[0]).toBe(500);
    expect(buildCatnipProfilePatch({ catnipChaos: [500] }).catnipChaos[0]).toBe(500);
  });

  it("matches the shared caps the backend enforces", () => {
    // Known mismatch, logged in docs/plans/alignment-log/1a.md: the backend accepts worlds 14-16
    // (levels 141-166) that the client has no maps for, so the client list is a strict prefix.
    expect(sharedCaps.CATNIP_CHAOS_LEVELS.slice(0, catnipChaosLevelsList.length)).toEqual(
      catnipChaosLevelsList,
    );
    expect(CATNIP_CHAOS_LEVEL_CAPS).toEqual(
      sharedCaps.CATNIP_CHAOS_LEVEL_CAPS.slice(0, catnipChaosLevelsList.length),
    );
    expect(MATCH3_LEVEL_CAPS).toEqual(sharedCaps.MATCH3_LEVEL_CATNIP_CAPS);
    expect(totalCatnip).toBe(
      CATNIP_CHAOS_LEVEL_CAPS.reduce((acc, cap) => acc + cap, 0),
    );
    expect(totalCatnip).toBe(500 + (catnipChaosLevelsList.length - 1) * 10);
  });
});
