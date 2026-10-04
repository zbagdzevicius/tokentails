import { isCupidSeason } from "@/components/game/seasons";
import { FIRST_MODE, PURRSUIT_FIRST_MODE, firstModeFor } from "@/components/onboarding/handoff";
import { gameCards } from "@/components/shared/GameSelectModal";

describe("Cupid Cat season (January to March)", () => {
  it("is open from 1 January to 31 March, local time", () => {
    expect(isCupidSeason(new Date(2027, 0, 1, 0, 0))).toBe(true);
    expect(isCupidSeason(new Date(2027, 1, 14, 12, 0))).toBe(true);
    expect(isCupidSeason(new Date(2027, 2, 31, 23, 59))).toBe(true);
    expect(isCupidSeason(new Date(2027, 3, 1, 0, 0))).toBe(false);
    expect(isCupidSeason(new Date(2026, 9, 4, 12, 0))).toBe(false);
    expect(isCupidSeason(new Date(2026, 11, 31, 23, 59))).toBe(false);
  });

  it("shows Cupid Cat in the picker only in season, tagged SEASONAL", () => {
    const feb = gameCards(true, new Date(2027, 1, 14));
    expect(feb.map((card) => card.title)).toEqual(["CUPID CAT", "PURRSUIT", "PAW MATCH", "CATNIP HEIST"]);
    expect(feb[0].tag).toBe("SEASONAL");
    expect(gameCards(true, new Date(2026, 9, 4)).map((card) => card.title)).toEqual([
      "PURRSUIT",
      "PAW MATCH",
      "CATNIP HEIST",
    ]);
  });

  it("hands new players to Cupid Cat in season and Purrsuit 1-1 otherwise", () => {
    expect(firstModeFor(new Date(2027, 1, 14))).toBe(FIRST_MODE);
    expect(firstModeFor(new Date(2026, 9, 4))).toBe(PURRSUIT_FIRST_MODE);
  });
});
