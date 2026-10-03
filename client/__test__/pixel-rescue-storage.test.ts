/** @jest-environment jsdom */
import { createFtueStore, type StorageLike } from "@/components/Phaser/onboarding/ftue-store";
import { createCupidFtue } from "@/components/PixelRescue/ftueStorage";
import { cupidGate, cupidHintCopy } from "@/components/PixelRescue/hints";

const memoryStorage = (): StorageLike & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
};

describe("Cupid first-session flags (ftue-store)", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers the tutorial per level, across store instances on the same storage", () => {
    const storage = memoryStorage();
    const ftue = createCupidFtue(createFtueStore({ storage: () => storage }));
    expect(ftue.tutorialSeen("1")).toBe(false);
    ftue.markTutorialSeen("1");
    expect(ftue.tutorialSeen("1")).toBe(true);
    expect(ftue.tutorialSeen("2")).toBe(false);
    // A reload reads the same blob.
    const reloaded = createCupidFtue(createFtueStore({ storage: () => storage }));
    expect(reloaded.tutorialSeen("1")).toBe(true);
  });

  it("keeps working from memory when storage throws (a retry never replays the tutorial)", () => {
    const blocked: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const ftue = createCupidFtue(createFtueStore({ storage: () => blocked }));
    expect(() => ftue.markTutorialSeen("1")).not.toThrow();
    expect(ftue.tutorialSeen("1")).toBe(true);
    ftue.markHintSeen("enemy");
    expect(ftue.hintSeen("enemy")).toBe(true);
  });

  it("treats the pre-G10 TutorialManager key as seen", () => {
    window.localStorage.setItem("pixelrescue_tutorial_completed_level_3", "true");
    const ftue = createCupidFtue(createFtueStore({ storage: () => memoryStorage() }));
    expect(ftue.tutorialSeen("3")).toBe(true);
    expect(ftue.tutorialSeen("4")).toBe(false);
  });

  it("caches local clears per level as strings", () => {
    const ftue = createCupidFtue(createFtueStore({ storage: () => memoryStorage() }));
    ftue.recordLocalClear("1");
    ftue.recordLocalClear("1");
    expect(ftue.localClears()).toEqual(["1"]);
  });

  it("marks hints once per player, not per level", () => {
    const ftue = createCupidFtue(createFtueStore({ storage: () => memoryStorage() }));
    ftue.markHintSeen("portal");
    expect(ftue.hintSeen("portal")).toBe(true);
    expect(ftue.hintSeen("crate")).toBe(false);
  });
});

describe("Cupid copy", () => {
  it("names the day and switches controls with the input device", () => {
    const keyboard = cupidGate("2", "keyboard");
    expect(keyboard.title).toBe("Cupid Cat · Day 2");
    expect(keyboard.controls).toMatch(/Space/);
    const touch = cupidGate(null, "touch");
    expect(touch.title).toBe("Cupid Cat · Day 1");
    expect(touch.controls).not.toMatch(/Space/);
  });

  it("has a sentence-case line for every first-seen hint", () => {
    for (const id of ["enemy", "crate", "portal", "shield"] as const) {
      for (const input of ["keyboard", "touch"] as const) {
        const line = cupidHintCopy(id, input);
        expect(line.length).toBeGreaterThan(10);
        // `hint` role (decision #86): sentence case, not shouted.
        expect(line).not.toBe(line.toUpperCase());
      }
    }
    expect(cupidHintCopy("enemy", "keyboard")).toMatch(/\(Q\)/);
    expect(cupidHintCopy("shield", "touch")).toMatch(/first hit/);
  });
});
