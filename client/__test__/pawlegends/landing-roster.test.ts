/**
 * The landing must not advertise heroes the game does not have (DOGS-V13 art gate: a dog can be cut before release).
 * Reads the game's own source as text: every landing hero whose `since` sim version is out must be in `HERO_IDS`, and
 * every game hero must be on the landing. With sim v13 merged, a cut Howler or Marshmallow fails here.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { landingMarkup } from "@/components/pawlegends/landing/markup";
import {
  countWord,
  GAME_SIM_VERSION,
  gridHeroes,
  LANDING_ROSTER,
  landingCats,
  landingDogs,
  liveRoster,
  newcomers,
} from "@/components/pawlegends/landing/roster";

const GAME = join(__dirname, "../../../pawlegends/src");
const read = (p: string) => readFileSync(join(GAME, p), "utf8");
const simVersion = Number(/SIM_VERSION\s*=\s*(\d+)/.exec(read("sim/version.ts"))?.[1]);
const heroIds = (/HERO_IDS[^=]*=\s*Object\.freeze\(\[([^\]]*)\]/.exec(read("data/heroes/index.ts"))?.[1] ?? "")
  .split(",")
  .map((s) => s.trim().replace(/['"]/g, ""))
  .filter(Boolean);

describe("Pawlegends landing roster", () => {
  it("reads the game's hero list and sim version", () => {
    expect(simVersion).toBeGreaterThanOrEqual(12);
    expect(heroIds.length).toBeGreaterThanOrEqual(12);
  });

  it("tracks the game's sim version, so released heroes move into the grid and the counts", () => {
    expect(GAME_SIM_VERSION).toBe(simVersion);
  });

  it("lists every hero the game ships", () => {
    const ids = LANDING_ROSTER.map((h) => h.id);
    for (const id of heroIds) expect(ids).toContain(id);
  });

  it("lists no released hero the game does not have (a cut dog fails here once its sim version ships)", () => {
    for (const h of LANDING_ROSTER.filter((x) => x.since <= simVersion)) expect(heroIds).toContain(h.id);
  });

  it("has unique ids and real art or none (never a stand-in)", () => {
    expect(new Set(LANDING_ROSTER.map((h) => h.id)).size).toBe(LANDING_ROSTER.length);
    for (const h of LANDING_ROSTER) {
      if (h.portrait) expect(h.portrait).toMatch(new RegExp(`/portrait-${h.id}\\.[0-9a-f]{8}\\.webp$`));
    }
  });

  it("takes every count in the copy from the roster", () => {
    const html = landingMarkup();
    expect(html).toContain(`${liveRoster().length} heroes live`);
    expect(html).toContain(`${countWord(landingCats().length)} cats, ${countWord(landingDogs().length).toLowerCase()} dogs.`);
    expect(html).toContain(`Cats · ${gridHeroes().filter((h) => h.side === "cat").length}<`);
    expect(html).toContain(`Dogs · ${gridHeroes().filter((h) => h.side === "dog").length} `);
    expect(html).toContain(`data-count="${landingCats().length}"`);
    expect(html).toContain(`data-count="${landingDogs().length}"`);
  });

  it("puts every hero in the grid (released, real art) or the new-dogs strip, never both", () => {
    const grid = gridHeroes().map((h) => h.id);
    const strip = newcomers().map((h) => h.id);
    expect([...grid, ...strip].sort()).toEqual(LANDING_ROSTER.map((h) => h.id).sort());
    for (const id of grid) expect(strip).not.toContain(id);
    const html = landingMarkup();
    for (const h of newcomers()) expect(html).toContain(`<b class="nd-nm">${h.name.normalize("NFD")}</b>`);
    if (newcomers().some((h) => h.since > simVersion)) expect(html).toContain("Coming next:");
  });

  it("keeps blurbs word for word with the game where the game has them", () => {
    const text = read("ui/heroText.ts") + ["meatball", "pixel", "duchess", "stilts"].map((h) => read(`ui/heroText/${h}.ts`)).join("\n");
    for (const h of LANDING_ROSTER.filter((x) => x.since <= simVersion)) expect(text).toContain(h.blurb);
  });

  it("matches the party invite URL the game builds, once party play is in this tree", () => {
    const file = join(GAME, "share/partyLink.ts");
    if (!existsSync(file)) return; // feat/pawlegends-mp not merged yet
    expect(readFileSync(file, "utf8")).toContain("https://tokentails.com/pawlegends?party=");
  });
});
