/**
 * @jest-environment jsdom
 */
import {
  createRunGate,
  gateVariant,
  isBeginKey,
  isControlTarget,
  isExitKey,
  isRunSurfaceTap,
} from "@/components/Phaser/onboarding/run-gate";
import { guardsLineText } from "@/components/game/RunGate";
import { newBestLine } from "@/components/game/DeathCard";

/** Plan G10: the start gate's state machine and input rules. */

describe("run gate", () => {
  it("shows the full card on a first visit and a pill after", () => {
    expect(gateVariant({ seenBefore: false })).toBe("full");
    expect(gateVariant({ seenBefore: true })).toBe("pill");
  });

  it("begins on the first input once ready and consumes it until released", () => {
    const gate = createRunGate();
    expect(gate.input("key")).toBe("consumed"); // still loading
    expect(gate.ready()).toBe(true);
    expect(gate.ready()).toBe(false);
    expect(gate.input("key")).toBe("begin");
    expect(gate.begins).toBe(1);
    expect(gate.awaitingRelease).toBe(true);
    expect(gate.input("key")).toBe("consumed");
    gate.release();
    expect(gate.input("pointer")).toBe("pass");
    expect(gate.begins).toBe(1);
  });

  it("pauses, ends and restarts with the restart flag", () => {
    const gate = createRunGate();
    gate.ready();
    gate.input("pointer");
    gate.release();
    gate.pause();
    expect(gate.phase).toBe("paused");
    expect(gate.input("key")).toBe("consumed");
    gate.resume();
    expect(gate.end()).toBe(true);
    expect(gate.end()).toBe(false);
    expect(gate.isRestart).toBe(false);
    gate.restart();
    expect(gate.phase).toBe("loading");
    expect(gate.isRestart).toBe(true);
    gate.ready();
    expect(gate.input("key")).toBe("begin");
    expect(gate.begins).toBe(2);
  });

  it("knows the begin and exit keys; Enter and Tab never begin", () => {
    expect(isBeginKey({ code: "Space", key: " " })).toBe(true);
    expect(isBeginKey({ code: "ArrowUp" })).toBe(true);
    expect(isBeginKey({ code: "KeyW", key: "w" })).toBe(true);
    expect(isBeginKey({ code: "Enter", key: "Enter" })).toBe(false);
    expect(isBeginKey({ code: "Tab", key: "Tab" })).toBe(false);
    expect(isExitKey({ key: "Escape" })).toBe(true);
    expect(isExitKey({ key: "Backspace" })).toBe(false);
  });

  it("treats controls, fields and dialogs as not-gameplay targets", () => {
    document.body.innerHTML = `
      <div id="layer"><canvas id="c"></canvas><span id="text">hi</span></div>
      <button id="b"><span id="inner">x</span></button>
      <a id="a" href="#">l</a><input id="i" />
      <div role="alertdialog"><p id="d">card</p></div>
      <div data-run-ignore><p id="ignored">x</p></div>`;
    const el = (id: string) => document.getElementById(id);
    expect(isControlTarget(el("c"))).toBe(false);
    expect(isControlTarget(el("text"))).toBe(false);
    expect(isControlTarget(el("inner"))).toBe(true);
    expect(isControlTarget(el("a"))).toBe(true);
    expect(isControlTarget(el("i"))).toBe(true);
    expect(isControlTarget(el("d"))).toBe(true);
    expect(isControlTarget(el("ignored"))).toBe(true);
    expect(isControlTarget(null)).toBe(false);
  });
});

describe("tap-to-jump targets (MobileControls, 5a review #5)", () => {
  it("jumps only on the run's own surface, never on controls, overlays or the canvas", () => {
    document.body.innerHTML = `
      <div id="game-container"><canvas id="c"></canvas><div id="pad"></div></div>
      <div data-run-surface><span id="hud">x3</span><button id="close">X</button></div>
      <div id="toast">Saved</div>
      <div id="backdrop" class="radix-overlay"></div>`;
    const el = (id: string) => document.getElementById(id);
    expect(isRunSurfaceTap(el("pad"))).toBe(true);
    expect(isRunSurfaceTap(el("hud"))).toBe(true);
    expect(isRunSurfaceTap(el("c"))).toBe(false);
    expect(isRunSurfaceTap(el("close"))).toBe(false);
    expect(isRunSurfaceTap(el("toast"))).toBe(false);
    expect(isRunSurfaceTap(el("backdrop"))).toBe(false);
    expect(isRunSurfaceTap(null)).toBe(false);
  });
});

describe("gate and death card copy (5a review #3, #9)", () => {
  it("builds the Paw Guard line from the allowance", () => {
    expect(guardsLineText(3, false)).toBe("Paw Guard ×3: 3 slips without losing the run.");
    expect(guardsLineText(6, false)).toBe("Paw Guard ×6: 6 slips without losing the run.");
    expect(guardsLineText(1, false)).toBe("Paw Guard ×1: 1 slip without losing the run.");
    expect(guardsLineText(0, false)).toMatch(/No Paw Guard on cleared levels/);
    expect(guardsLineText(0, true)).toMatch(/No Paw Guard on Infinite/);
    expect(guardsLineText(null, false)).toMatch(/Unlimited/);
  });

  it("says saved only after the save answered", () => {
    expect(newBestLine(undefined)).toBe("New best");
    expect(newBestLine("saving")).toBe("New best");
    expect(newBestLine("saved")).toBe("New best, saved");
    expect(newBestLine("failed")).toBe("New best, not saved");
  });
});
