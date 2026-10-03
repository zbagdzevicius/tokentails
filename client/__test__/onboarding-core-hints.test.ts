/**
 * @jest-environment jsdom
 */
import { createGameRunTracker } from "@/analytics/game-run";
import {
  __resetInputKindForTests,
  deathTip,
  firstSpikePrompt,
  lastInputKind,
  purrsuitGate,
  purrsuitLevelName,
  startLine,
  subscribeInputKind,
  teachLine,
} from "@/components/Phaser/onboarding/hints";

/** Plan G10 copy: glyphs follow the last input device; sentence case (decision #86). */

describe("first-run copy", () => {
  it("names Purrsuit levels like the map", () => {
    expect(purrsuitLevelName("11")).toBe("1-1");
    expect(purrsuitLevelName("136")).toBe("13-6");
    expect(purrsuitLevelName("01")).toBe("Infinite");
    expect(purrsuitLevelName(null)).toBe("");
  });

  it("switches the control words with the input device", () => {
    expect(purrsuitGate("11", "keyboard").controls).toMatch(/Space/);
    expect(purrsuitGate("11", "touch").controls).toMatch(/^Tap anywhere/);
    expect(purrsuitGate("11", "mouse").start).toBe("Click to start");
    expect(startLine("keyboard")).toBe("Press Space to start");
    expect(firstSpikePrompt("touch")).toEqual({ title: "JUMP!", line: "Tap to jump the spikes" });
    expect(teachLine("geometry", "keyboard")).toMatch(/Hold Space/);
    expect(teachLine("flight", "touch")).toMatch(/Hold the screen/);
    expect(purrsuitGate("01", "touch").title).toBe("Infinite run");
  });

  it("chooses a tip by mode and cause", () => {
    expect(deathTip("CATNIP_CHAOS", "spike", "keyboard")).toMatch(/^Space a moment earlier/);
    expect(deathTip("PIXEL_RESCUE", "timeout", "touch")).toMatch(/hearts/);
    expect(deathTip("MATCH_3", undefined, "touch")).toMatch(/special tiles/);
    expect(deathTip("HOME", undefined, "touch")).toMatch(/Your cat is fine/);
  });

  it("follows the last input device", () => {
    __resetInputKindForTests(null);
    const seen: string[] = [];
    const unsubscribe = subscribeInputKind((kind) => seen.push(kind));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(lastInputKind()).toBe("keyboard");
    const pointer = new Event("pointerdown") as Event & { pointerType: string };
    Object.defineProperty(pointer, "pointerType", { value: "touch" });
    window.dispatchEvent(pointer);
    expect(lastInputKind()).toBe("touch");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(lastInputKind()).toBe("touch");
    unsubscribe();
    expect(seen).toEqual(["keyboard", "touch"]);
  });
});

describe("run tracker (F6: RUN_BEGIN is the only start signal)", () => {
  it("flags the start after PLAY AGAIN as a restart, once", () => {
    const track = jest.fn();
    const tracker = createGameRunTracker(track, () => "web");
    tracker.select();
    tracker.start({ mode: "CATNIP_CHAOS", level: "11" });
    tracker.restart();
    tracker.start({ mode: "CATNIP_CHAOS", level: "11" });
    tracker.start({ mode: "CATNIP_CHAOS", level: "11" });
    tracker.restart();
    tracker.select();
    tracker.start({ mode: "CATNIP_CHAOS", level: "12" });
    const flags = track.mock.calls.map(([event]) => event.properties.is_restart);
    expect(flags).toEqual([false, true, false, false]);
  });

  it("sends the first-run events from the catalog", () => {
    const track = jest.fn();
    const tracker = createGameRunTracker(track, () => "web");
    tracker.lifeLost({ mode: "CATNIP_CHAOS", level: "11" }, null);
    tracker.lifeLost({ mode: "CATNIP_CHAOS", level: "12" }, 2);
    tracker.firstClear({ mode: "CATNIP_CHAOS", level: "11" });
    tracker.hintShown({ mode: "CATNIP_CHAOS", level: "11" }, "first-spike");
    tracker.abandon({ mode: "CATNIP_CHAOS", level: "11" }, "gate");
    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { name: "life_lost", properties: { mode: "CATNIP_CHAOS", level: "11" } },
      { name: "life_lost", properties: { mode: "CATNIP_CHAOS", level: "12", lives_left: 2 } },
      { name: "ftue_first_clear", properties: { mode: "CATNIP_CHAOS", level: "11" } },
      { name: "ftue_hint_shown", properties: { mode: "CATNIP_CHAOS", level: "11", hint: "first-spike" } },
      { name: "ftue_abandon", properties: { mode: "CATNIP_CHAOS", level: "11", step: "gate" } },
    ]);
  });
});
