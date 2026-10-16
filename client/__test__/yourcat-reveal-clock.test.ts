/**
 * @jest-environment jsdom
 */
/**
 * The transformation clock (docs/plans/yourcat-polish.md §4.2, §14.1), on a fake rAF and a fake
 * canvas: the crack runs 4, 8, 16, 32, 48 (M1 ran backwards), then the cross-dissolve at 48, then
 * 24, 12 and crisp; the page cues hold, stepOut, title and done fire at 0, 1050, 1170 and 1450
 * (±1 frame); every crack draw is tinted with a gold `color` composite at .25.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { CLOCK, startCueClock } from "@/components/yourcat/motion";
import { TransformFrame } from "@/components/yourcat/TransformFrame";
import {
  buildLateGatherCues,
  buildRevealCues,
  canvasSide,
  drawRevealStep,
  GATHER_BLOCKS,
  LATE_GATHER_STEP_MS,
  REVEAL_BLOCKS,
  revealDraws,
  type RevealCue,
  type RevealDraw,
  type RevealSource,
  type RevealTarget,
} from "@/components/yourcat/pixelateReveal";
import { GOLD } from "@/design/tokens";

/** Images never decode in jsdom: the frame tests answer `loadRevealImage` themselves. */
const mockLoad = jest.fn();
jest.mock("@/components/yourcat/pixelateReveal", () => {
  const actual = jest.requireActual("@/components/yourcat/pixelateReveal");
  return { ...actual, loadRevealImage: (...args: unknown[]) => mockLoad(...args) };
});

const FRAME_MS = 1000 / 60;

/** A fake clock: `raf` callbacks run when `advance` passes a frame boundary. */
function fakeClock() {
  let time = 0;
  let id = 0;
  const pending = new Map<number, (t: number) => void>();
  return {
    now: () => time,
    raf: (cb: (t: number) => void) => {
      pending.set(++id, cb);
      return id;
    },
    caf: (handle: number) => void pending.delete(handle),
    /** Runs frames until `until` ms. */
    runTo(until: number) {
      while (time < until) {
        time = Math.min(until, time + FRAME_MS);
        const due = Array.from(pending.entries());
        pending.clear();
        due.forEach(([, cb]) => cb(time));
      }
    },
  };
}

interface Op {
  op: "drawImage" | "fillRect" | "clearRect";
  source?: unknown;
  args: number[];
  composite: string;
  alpha: number;
  fill: string;
  smoothing: boolean;
}

function fakeContext(ops: Op[], canvas: { width: number; height: number }) {
  const ctx = {
    canvas,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    imageSmoothingEnabled: true,
    stack: [] as Array<{ alpha: number; comp: string; smooth: boolean; fill: string }>,
    save() {
      ctx.stack.push({ alpha: ctx.globalAlpha, comp: ctx.globalCompositeOperation, smooth: ctx.imageSmoothingEnabled, fill: ctx.fillStyle });
    },
    restore() {
      const s = ctx.stack.pop();
      if (!s) return;
      ctx.globalAlpha = s.alpha;
      ctx.globalCompositeOperation = s.comp;
      ctx.imageSmoothingEnabled = s.smooth;
      ctx.fillStyle = s.fill;
    },
    record(op: Op["op"], args: unknown[]) {
      const [first, ...rest] = args;
      const isImage = op === "drawImage";
      ops.push({
        op,
        source: isImage ? first : undefined,
        args: (isImage ? rest : args) as number[],
        composite: ctx.globalCompositeOperation,
        alpha: ctx.globalAlpha,
        fill: ctx.fillStyle,
        smoothing: ctx.imageSmoothingEnabled,
      });
    },
    drawImage: (...args: unknown[]) => ctx.record("drawImage", args),
    fillRect: (...args: unknown[]) => ctx.record("fillRect", args),
    clearRect: (...args: unknown[]) => ctx.record("clearRect", args),
  };
  return ctx;
}

function fakeCanvas(side: number, ops: Op[], onContext?: (width: number) => void) {
  const canvas = {
    width: side,
    height: side,
    getContext: () => {
      onContext?.(canvas.width);
      return ctx;
    },
  } as unknown as HTMLCanvasElement;
  const ctx = fakeContext(ops, canvas);
  return canvas;
}

const photo = { width: 1200, height: 900, tag: "photo" } as unknown as RevealSource;
const avatar = { width: 96, height: 96, tag: "avatar" } as unknown as RevealSource;

describe("transformation clock", () => {
  const smallOps: Op[] = [];
  /** The scratch canvas's width each time it is drawn into (cells across). */
  const cells: number[] = [];
  beforeAll(() => {
    const create = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return create(tag);
      return fakeCanvas(1, smallOps, (width) => cells.push(width));
    }) as typeof document.createElement);
  });

  it("the draw list: crack 4 → 48 every 120 ms from 150, dissolve at 48 at 750, then 24, 12, crisp every 75 ms", () => {
    expect([...REVEAL_BLOCKS]).toEqual([4, 8, 16, 32, 48]);
    expect([...GATHER_BLOCKS]).toEqual([48, 24, 12, 0]);
    expect(revealDraws(CLOCK)).toEqual([
      { at: 0, draw: { kind: "photo" } },
      { at: 150, draw: { kind: "crack", block: 4 } },
      { at: 270, draw: { kind: "crack", block: 8 } },
      { at: 390, draw: { kind: "crack", block: 16 } },
      { at: 510, draw: { kind: "crack", block: 32 } },
      { at: 630, draw: { kind: "crack", block: 48 } },
      { at: 750, draw: { kind: "dissolve", block: 48 } },
      { at: 825, draw: { kind: "gather", block: 24 } },
      { at: 900, draw: { kind: "gather", block: 12 } },
      { at: 975, draw: { kind: "gather", block: 0 } },
    ]);
  });

  it("on one rAF loop, the draws run in order and the cues land at 0, 1050, 1170 and 1450 (±1 frame)", () => {
    const clock = fakeClock();
    const log: Array<{ t: number; draw?: RevealDraw; cue?: RevealCue }> = [];
    const cues = buildRevealCues(CLOCK, {
      draw: (draw) => log.push({ t: clock.now(), draw }),
      cue: (cue) => log.push({ t: clock.now(), cue }),
    });
    const stop = startCueClock(cues, clock);
    clock.runTo(1600);
    stop();

    const draws = log.filter((e) => e.draw).map((e) => e.draw!);
    expect(draws.map((d) => `${d.kind}${"block" in d ? d.block : ""}`)).toEqual([
      "photo",
      "crack4",
      "crack8",
      "crack16",
      "crack32",
      "crack48",
      "dissolve48",
      "gather24",
      "gather12",
      "gather0",
    ]);
    const at = (cue: RevealCue) => log.find((e) => e.cue === cue)!.t;
    expect(log.filter((e) => e.cue).map((e) => e.cue)).toEqual(["hold", "stepOut", "title", "done"]);
    for (const [cue, ms] of [
      ["hold", 0],
      ["stepOut", 1050],
      ["title", 1170],
      ["done", 1450],
    ] as const) {
      expect(at(cue)).toBeGreaterThanOrEqual(ms);
      expect(at(cue) - ms).toBeLessThanOrEqual(FRAME_MS + 0.001);
    }
    // Every draw fires within one frame of its slot.
    log
      .filter((e) => e.draw)
      .forEach((e, i) => {
        const slot = revealDraws(CLOCK)[i].at;
        expect(e.t - slot).toBeLessThanOrEqual(FRAME_MS + 0.001);
      });
  });

  it("the crack draws ever bigger blocks and tints each with a gold `color` composite at .25", () => {
    const ops: Op[] = [];
    const canvas = fakeCanvas(384, ops);
    const target: RevealTarget = { image: avatar, minBlock: 0 };
    cells.length = 0;
    for (const block of REVEAL_BLOCKS) drawRevealStep(canvas, { kind: "crack", block }, photo, target, GOLD[400]);
    // 384 / block cells across: 96, 48, 24, 12, 8.
    expect(cells).toEqual([96, 48, 24, 12, 8]);
    const tints = ops.filter((o) => o.op === "fillRect" && o.composite === "color");
    expect(tints).toHaveLength(5);
    tints.forEach((t) => {
      expect(t.fill).toBe(GOLD[400]);
      expect(t.alpha).toBe(0.25);
      expect(t.args).toEqual([0, 0, 384, 384]);
    });
    // Upscaled nearest-neighbour, and the composite is reset afterwards.
    ops.filter((o) => o.op === "drawImage").forEach((o) => expect(o.smoothing).toBe(false));
    expect(ops.filter((o) => o.op === "drawImage").every((o) => o.composite === "source-over")).toBe(true);
  });

  it("block sizes scale with the canvas: a 768 canvas cracks into the same number of cells", () => {
    const ops: Op[] = [];
    cells.length = 0;
    const canvas = fakeCanvas(768, ops);
    drawRevealStep(canvas, { kind: "crack", block: 48 }, photo, { image: avatar, minBlock: 0 }, GOLD[400]);
    expect(cells).toEqual([8]);
    expect(canvasSide(384, 3)).toBe(768);
    expect(canvasSide(192, 3)).toBe(576);
    expect(canvasSide(192, 1)).toBe(192);
  });

  it("the dissolve lays the target at 48 and alpha .5 over the photo at 48; the gather ends crisp and nearest-neighbour", () => {
    const ops: Op[] = [];
    const canvas = fakeCanvas(384, ops);
    cells.length = 0;
    const target: RevealTarget = { image: avatar, minBlock: 0 };
    drawRevealStep(canvas, { kind: "dissolve", block: 48 }, photo, target, GOLD[400]);
    const images = ops.filter((o) => o.op === "drawImage");
    expect(images).toHaveLength(2);
    expect(images[0].alpha).toBe(1);
    expect(images[1].alpha).toBe(0.5);
    // The second layer does not clear the first.
    expect(ops.filter((o) => o.op === "clearRect")).toHaveLength(1);
    expect(cells).toEqual([8, 8]);

    ops.length = 0;
    drawRevealStep(canvas, { kind: "gather", block: 0 }, photo, target, GOLD[400]);
    const crisp = ops.filter((o) => o.op === "drawImage");
    expect(crisp).toHaveLength(1);
    expect(crisp[0].source).toBe(avatar);
    expect(crisp[0].smoothing).toBe(false);
    expect(crisp[0].args.slice(4)).toEqual([0, 0, 384, 384]);
  });

  it("a pending target never gathers finer than 32 cells and keeps the gold tint", () => {
    const ops: Op[] = [];
    const canvas = fakeCanvas(384, ops);
    cells.length = 0;
    const pending: RevealTarget = { image: photo, minBlock: 12, tint: GOLD[400] };
    drawRevealStep(canvas, { kind: "gather", block: 0 }, photo, pending, GOLD[400]);
    expect(cells).toEqual([32]);
    expect(ops.some((o) => o.op === "fillRect" && o.composite === "color")).toBe(true);
  });

  it("the late avatar gathers 48, 24, 12, crisp at 70 ms steps, then lands", () => {
    const clock = fakeClock();
    const log: Array<{ t: number; what: string }> = [];
    const stop = startCueClock(
      buildLateGatherCues(
        (block) => log.push({ t: clock.now(), what: `b${block}` }),
        () => log.push({ t: clock.now(), what: "landed" }),
      ),
      clock,
    );
    clock.runTo(400);
    stop();
    expect(log.map((e) => e.what)).toEqual(["b48", "b24", "b12", "b0", "landed"]);
    log.forEach((e, i) => expect(e.t - i * LATE_GATHER_STEP_MS).toBeLessThanOrEqual(FRAME_MS + 0.001));
  });
});

/**
 * R1-09: the meter's third segment follows the frame, so the frame says when the pixel portrait is
 * actually on show: with the step-out when the portrait was there for the clock (told just before the
 * "stepOut" cue, so the page does not pulse twice), after the mini gather when it came late, and never
 * for a portrait the browser has not decoded yet.
 */
describe("TransformFrame: when the portrait lands", () => {
  const IMAGE = { width: 64, height: 64, naturalWidth: 64, naturalHeight: 64 };
  let getContext: jest.SpyInstance;

  beforeEach(() => {
    // The clock tests above swap `document.createElement` for canvases; React needs the real one.
    jest.restoreAllMocks();
    jest.useFakeTimers();
    mockLoad.mockReset();
    // No 2D canvas in jsdom: the draws are cosmetic and caught; only the cue order matters here.
    getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
  });
  afterEach(() => {
    getContext.mockRestore();
    jest.useRealTimers();
  });

  async function settle(ms: number) {
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  function frame(avatarUrl: string | null, log: string[]) {
    return createElement(TransformFrame, {
      photoUrl: "blob:photo",
      avatarUrl,
      spriteImg: "/cats/yellow/sprites/original.png",
      mode: "reveal",
      reducedMotion: false,
      label: "Mochi",
      pendingLabel: "Painting your pixel portrait…",
      photoBadgeLabel: "Your photo",
      onCue: (cue: RevealCue) => log.push(cue),
      onAvatarLanded: () => log.push("landed"),
    });
  }

  it("a portrait ready for the clock lands once, just before the step-out", async () => {
    mockLoad.mockResolvedValue(IMAGE);
    const log: string[] = [];
    render(frame("https://cdn.test/avatar.png", log));
    await settle(CLOCK.DONE + 100);
    expect(log).toEqual(["hold", "landed", "stepOut", "title", "done"]);
  });

  it("a portrait that arrives after the clock lands after the mini gather", async () => {
    mockLoad.mockResolvedValue(IMAGE);
    const log: string[] = [];
    const view = render(frame(null, log));
    await settle(CLOCK.DONE + 100);
    expect(log).toEqual(["hold", "stepOut", "title", "done"]);
    view.rerender(frame("https://cdn.test/avatar.png", log));
    await settle(GATHER_BLOCKS.length * LATE_GATHER_STEP_MS + 100);
    expect(log).toEqual(["hold", "stepOut", "title", "done", "landed"]);
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-target")).toBe("avatar");
  });

  it("a portrait that does not decode in time is not claimed until the browser shows it", async () => {
    mockLoad.mockImplementation(async (url: string) => (url.startsWith("blob:") ? IMAGE : null));
    const log: string[] = [];
    const view = render(frame(null, log));
    await settle(CLOCK.DONE + 100);
    view.rerender(frame("https://cdn.test/avatar.png", log));
    await settle(500);
    expect(log).not.toContain("landed");
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-target")).toBe("pending");
    act(() => {
      fireEvent.load(screen.getByTestId("yourcat-avatar-slow"));
    });
    expect(log.filter((entry) => entry === "landed")).toHaveLength(1);
    expect(screen.getByTestId("yourcat-transform").getAttribute("data-target")).toBe("avatar");
  });
});
