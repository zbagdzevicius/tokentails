/**
 * The landing must not advertise heroes the game does not have (DOGS-V13 art gate: a dog can be cut before release).
 * Reads the game's own source as text: every landing hero whose `since` sim version is out must be in `HERO_IDS`, and
 * every game hero must be on the landing. The five dogs ship in sim v14, Rocket, Frankie and Domino in v15; a cut dog
 * fails here.
 *
 * GAME_SIM_VERSION is the sim of the committed game build (`public/pawlegends-game/build-releases.json`, stamped by
 * `npm run build:client`), never the source: the landing shows the dogs only once a build that has them is committed.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import shippedGame from "@/public/pawlegends-game/build-releases.json";
import { landingMarkup } from "@/components/pawlegends/landing/markup";
import {
  countWord,
  GAME_SIM_VERSION,
  gridHeroes,
  justReleased,
  LANDING_ROSTER,
  landingCats,
  landingDogs,
  liveRoster,
  newcomers,
} from "@/components/pawlegends/landing/roster";

const GAME = join(__dirname, "../../../pawlegends/src");
const BUILD = join(__dirname, "../../public/pawlegends-game/build");
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

  it("takes its sim version from the committed game build, never newer than the game source", () => {
    expect(GAME_SIM_VERSION).toBe(shippedGame.sim.simVersion);
    expect(GAME_SIM_VERSION).toBeLessThanOrEqual(simVersion);
    expect(GAME_SIM_VERSION).toBeGreaterThanOrEqual(13);
  });

  it("stamps the build with the sim hash its own bundle carries (the stamp is not hand-waved)", () => {
    const newest = shippedGame.releases[0];
    expect(newest.length).toBeGreaterThan(0);
    const carries = newest.some((f) => existsSync(join(BUILD, f)) && readFileSync(join(BUILD, f), "utf8").includes(shippedGame.sim.simHash));
    expect(carries).toBe(true);
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
    const own = ["meatball", "pixel", "duchess", "stilts", "nugget", "marshmallow", "bravo", "chili", "howler", "rocket", "frankie", "domino"];
    const text = read("ui/heroText.ts") + own.map((h) => read(`ui/heroText/${h}.ts`)).join("\n");
    for (const h of LANDING_ROSTER.filter((x) => x.since <= simVersion)) expect(text).toContain(h.blurb);
  });

  it("shows the five dogs only once a v14 game build is committed: New tags then, Coming next before", () => {
    const html = landingMarkup();
    const dogs = ["nugget", "marshmallow", "bravo", "chili", "howler"];
    if (GAME_SIM_VERSION >= 14) {
      const fresh = justReleased();
      if (GAME_SIM_VERSION === 14) expect(fresh.map((h) => h.id)).toEqual(dogs);
      if (GAME_SIM_VERSION === 14) expect(html).toContain("New: five dogs join the pack");
      // sim v15's three dogs stay in the Coming next strip until a v15 build is committed
      if (GAME_SIM_VERSION >= 15) expect(html).not.toContain("Coming next:");
      expect(html.match(/<span class="new" aria-hidden="true">New<\/span>/g) ?? []).toHaveLength(fresh.length);
      if (GAME_SIM_VERSION === 14) expect(liveRoster()).toHaveLength(17);
      if (GAME_SIM_VERSION === 14) expect(gridHeroes()).toHaveLength(17);
    } else {
      expect(newcomers().map((h) => h.id)).toEqual(dogs);
      expect(html).toContain("Coming next: five new dogs");
      expect(html).not.toContain('<span class="new"');
      expect(liveRoster()).toHaveLength(12);
      for (const id of dogs) expect(html).not.toContain(`data-id="${id}"`);
    }
  });

  it("shows Rocket, Frankie and Domino only once a v15 game build is committed: 10 v 10 then, Coming next before", () => {
    const html = landingMarkup();
    const dogs = ["rocket", "frankie", "domino"];
    if (GAME_SIM_VERSION >= 15) {
      if (GAME_SIM_VERSION === 15) expect(justReleased().map((h) => h.id)).toEqual(dogs);
      if (GAME_SIM_VERSION === 15) expect(html).toContain("New: three dogs join the pack");
      expect(html).toContain("Ten cats, ten dogs.");
      expect(liveRoster()).toHaveLength(20);
      expect(gridHeroes()).toHaveLength(20);
    } else {
      expect(newcomers().map((h) => h.id)).toEqual(dogs);
      expect(html).toContain("Coming next: three new dogs");
      expect(html).toContain("They join the dogs' side: ten cats, ten dogs.");
      for (const id of dogs) expect(html).not.toContain(`data-id="${id}"`);
    }
  });

  it("keeps cats on the left half of the grid and dogs on the right once the sides are close in size", () => {
    const html = landingMarkup();
    const cats = gridHeroes().filter((h) => h.side === "cat").length;
    const dogs = gridHeroes().filter((h) => h.side === "dog").length;
    const split = Math.min(cats, dogs) * 2 >= Math.max(cats, dogs);
    expect(html.includes('class="grid split"')).toBe(split);
    if (!split) return;
    const cols = Array.from(html.matchAll(/<li class="(cat|dog)" style="--c4:(\d+);--r4:\d+;--c6:(\d+);--r6:\d+">/g));
    expect(cols).toHaveLength(cats + dogs);
    for (const [, side, c4, c6] of cols) {
      expect(side === "cat" ? Number(c4) <= 2 : Number(c4) >= 3).toBe(true);
      expect(side === "cat" ? Number(c6) <= 3 : Number(c6) >= 4).toBe(true);
    }
  });

  it("matches the party invite URL the game builds, once party play is in this tree", () => {
    const file = join(GAME, "share/partyLink.ts");
    if (!existsSync(file)) return; // feat/pawlegends-mp not merged yet
    expect(readFileSync(file, "utf8")).toContain("https://tokentails.com/pawlegends?party=");
  });
});
