/**
 * After `/yourcat` the lobby hero is the uploaded cat (bet #3, docs/plans/yourcat-v2.md §4.1, §9 B).
 *
 * The backend removes `starterBreed` from the restyled starter, because `GameSelect` draws a starter
 * that has a `starterBreed` with the Meet-your-cat art instead of its `catImg`. `GameSelect` needs the
 * game, Phaser events and the lobby providers, so it does not render in jsdom; this test pins the
 * line that computes the hero image (GameSelect.tsx, read-only here) and checks the rule it encodes.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(__dirname, "..", "components", "game", "GameSelect.tsx"), "utf8");

describe("lobby hero after /yourcat", () => {
  it("GameSelect draws a starter's ceremony art only when it has a starterBreed, else its catImg", () => {
    expect(SOURCE).toMatch(
      /const starter = profileCat\?\.isStarter && profileCat\.starterBreed \? starterLook\(profileCat\.starterBreed\) : null;/,
    );
    expect(SOURCE).toMatch(/const image = heroCat\?\.image \|\| starter\?\.idle \|\| profileCat\?\.catImg \|\| "";/);
  });

  it("a starter without starterBreed shows its family GIF", () => {
    // The same rule as the pinned lines, evaluated for the profile /yourcat leaves behind.
    const gif = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/YELLOW/base/GROOMING.gif";
    const profileCat: { isStarter: boolean; catImg: string; starterBreed?: string } = { isStarter: true, catImg: gif };
    const heroCat: { image?: string } | null = null;
    const starterLook = (breed: string) => ({ idle: `/onboarding/${breed}-idle.gif` });
    const starter = profileCat.isStarter && profileCat.starterBreed ? starterLook(profileCat.starterBreed) : null;
    const image = (heroCat as { image?: string } | null)?.image || starter?.idle || profileCat.catImg || "";
    expect(image).toBe(gif);
    // With a starterBreed still set, the ceremony art would win: that is why the backend removes it.
    const withBreed = { ...profileCat, starterBreed: "GINGER" };
    const old = withBreed.isStarter && withBreed.starterBreed ? starterLook(withBreed.starterBreed) : null;
    expect(old?.idle || withBreed.catImg).not.toBe(gif);
  });

  it("the page's profile update sends no starterBreed", () => {
    const page = readFileSync(join(__dirname, "..", "components", "yourcat", "YourCatPage.tsx"), "utf8");
    expect(page).toMatch(/starterBreed: undefined/);
    expect(page).toMatch(/onboarding: \{ state: "done" \}/);
  });
});
