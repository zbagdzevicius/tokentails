import {
  CUPID_RUN_SECONDS,
  RunClock,
  SHIELD_BREAK_GRACE_MS,
  ShieldState,
  cupidLevelStates,
  nextLabel,
  outcomeFor,
  starterShieldFor,
  tutorialDecision,
  tutorialKey,
} from "@/components/PixelRescue/ftue";

describe("Cupid tutorial-once policy", () => {
  it("plays the first time only", () => {
    expect(tutorialDecision({ seen: false })).toBe("play");
    expect(tutorialDecision({ seen: true })).toBe("skip");
  });

  it("never replays on a retry, even if the seen flag could not be stored", () => {
    expect(tutorialDecision({ seen: false, isRestart: true })).toBe("skip");
    expect(tutorialDecision({ seen: false, playedThisSession: true })).toBe("skip");
  });

  it("replays when the player asks for it", () => {
    expect(tutorialDecision({ seen: true, replayRequested: true })).toBe("play");
    expect(tutorialDecision({ seen: true, isRestart: true, replayRequested: true })).toBe("play");
  });

  it("keys the flag per level and version", () => {
    expect(tutorialKey("1")).toBe("tutorial.v1.1");
    expect(tutorialKey("2")).not.toBe(tutorialKey("1"));
  });
});

describe("Cupid starter shield", () => {
  it("guards uncleared levels 1 and 2 only", () => {
    expect(starterShieldFor("1", [])).toBe(true);
    expect(starterShieldFor("2", [true])).toBe(true);
    expect(starterShieldFor("3", [true, true])).toBe(false);
    expect(starterShieldFor("1", [true])).toBe(false);
    expect(starterShieldFor("2", [true, true])).toBe(false);
    expect(starterShieldFor("nope", [])).toBe(false);
  });

  it("absorbs exactly the first hit, then a grace window, then hits land", () => {
    const shield = new ShieldState();
    expect(shield.arm("starter")).toBe(true);
    expect(shield.arm("pickup")).toBe(false);
    expect(shield.hit(1000)).toBe("absorbed");
    expect(shield.isActive).toBe(false);
    expect(shield.hit(1000 + SHIELD_BREAK_GRACE_MS - 1)).toBe("ignored");
    expect(shield.hit(1000 + SHIELD_BREAK_GRACE_MS)).toBe("hit");
  });

  it("lets a hit land without a shield", () => {
    expect(new ShieldState().hit(0)).toBe("hit");
  });

  it("can be re-armed by a pickup after it broke", () => {
    const shield = new ShieldState(10);
    shield.arm("starter");
    shield.hit(0);
    expect(shield.arm("pickup")).toBe(true);
    expect(shield.source).toBe("pickup");
    shield.reset();
    expect(shield.isActive).toBe(false);
    expect(shield.hit(1)).toBe("hit");
  });
});

describe("Cupid run clock", () => {
  it("does not count before RUN_BEGIN", () => {
    const clock = new RunClock();
    expect(clock.tick()).toBe("idle");
    expect(clock.time).toBe(CUPID_RUN_SECONDS);
  });

  it("holds while the tutorial or any reason pauses it", () => {
    const clock = new RunClock(5);
    clock.begin();
    clock.pause("tutorial");
    clock.pause("hint");
    expect(clock.tick()).toBe("idle");
    clock.resume("tutorial");
    expect(clock.tick()).toBe("idle");
    clock.resume("hint");
    expect(clock.tick()).toBe("tick");
    expect(clock.time).toBe(4);
    expect(clock.elapsed).toBe(1);
  });

  it("ignores a second begin (no double countdown)", () => {
    const clock = new RunClock(3);
    expect(clock.begin()).toBe(true);
    expect(clock.begin()).toBe(false);
    clock.tick();
    expect(clock.time).toBe(2);
  });

  it("expires once at zero and adds bonus time", () => {
    const clock = new RunClock(2);
    clock.begin();
    clock.addTime(1);
    expect(clock.tick()).toBe("tick");
    expect(clock.tick()).toBe("tick");
    expect(clock.tick()).toBe("expired");
    expect(clock.tick()).toBe("idle");
    expect(clock.addTime(5)).toBe(0);
  });

  it("stops for good on end", () => {
    const clock = new RunClock(9);
    clock.begin();
    clock.end();
    expect(clock.tick()).toBe("idle");
    expect(clock.begin()).toBe(false);
  });
});

describe("Cupid outcomes", () => {
  it("maps stops to won, died and timeout", () => {
    expect(outcomeFor("portal")).toBe("won");
    expect(outcomeFor("health")).toBe("died");
    expect(outcomeFor("spike")).toBe("died");
    expect(outcomeFor("timer")).toBe("timeout");
  });
});

describe("Cupid level select", () => {
  it("reads the server cleared array when present", () => {
    const states = cupidLevelStates({ seasonEvent: [5, 5], seasonEventCleared: [1, 0] });
    expect(states.slice(0, 3).map((s) => s.cleared)).toEqual([true, false, false]);
  });

  it("falls back to best > 0 (the grandfathering rule) without the server field", () => {
    const states = cupidLevelStates({ seasonEvent: [3, 0, 2] });
    expect(states.slice(0, 4).map((s) => s.cleared)).toEqual([true, false, true, false]);
  });

  it("adds local clears as a cache", () => {
    const states = cupidLevelStates({ seasonEventCleared: [] }, ["2"]);
    expect(states.slice(0, 3).map((s) => s.cleared)).toEqual([false, true, false]);
  });

  it("unlocks a level only after the previous one is cleared; a death with hearts does not", () => {
    // Server field present: level 1 has a best (a death with hearts) but is not cleared.
    const states = cupidLevelStates({ seasonEvent: [7], seasonEventCleared: [0] });
    expect(states.slice(0, 3).map((s) => s.unlocked)).toEqual([true, false, false]);
    const after = cupidLevelStates({ seasonEvent: [7], seasonEventCleared: [1] });
    expect(after.slice(0, 3).map((s) => s.unlocked)).toEqual([true, true, false]);
    expect(after.slice(0, 3).map((s) => s.next)).toEqual([false, true, false]);
  });

  it("marks level 1 for a new player", () => {
    const states = cupidLevelStates(null);
    expect(states[0].next).toBe(true);
    expect(states.filter((s) => s.next)).toHaveLength(1);
    expect(nextLabel([])).toBe("START HERE");
    expect(nextLabel([true])).toBe("NEXT");
  });

  it("hides the marker while the next level is date-locked", () => {
    const states = cupidLevelStates({ seasonEventCleared: [1] }, [], (i) => i === 0);
    expect(states[1].unlocked).toBe(true);
    expect(states[1].dateUnlocked).toBe(false);
    expect(states.some((s) => s.next)).toBe(false);
  });
});
