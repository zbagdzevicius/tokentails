/**
 * @jest-environment jsdom
 */
/**
 * `/yourcat` motion primitives (docs/plans/yourcat-polish.md §4, §11): the cue clock keeps the §4.2
 * beat times from one rAF loop, the S2 scan gate is capped at 400 ms, the reveal haptic is off under
 * reduced motion, the S1 flight cleans up after itself, and `primeHomeSounds` unlocks the cached
 * sounds muted without ever throwing. The stage world's fireflies and the frame's glow ring animate
 * transform and opacity only, and stay calm under reduced motion.
 */
import { CLOCK, EASE, flyTo, hapticReveal, scanRemainingMs, startCueClock } from "@/components/yourcat/motion";
import { YourcatMotionStyles } from "@/components/yourcat/brand";
import { PET_CAT_CSS } from "@/components/yourcat/PetCat";

/** The page's `yc-*` stylesheet text (the `<style>` element's child). */
function motionCss(): string {
  const style = YourcatMotionStyles() as unknown as { props: { children: string } };
  return style.props.children;
}

/** The body of `@keyframes name { ... }` (balanced braces). */
function keyframes(css: string, name: string): string {
  const start = css.indexOf(`@keyframes ${name} `);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
}

/** A fake rAF: `step(ms)` advances the clock by one frame of `ms` and runs the queued callbacks. */
function fakeFrames() {
  let time = 1000;
  let nextId = 1;
  const queue = new Map<number, (t: number) => void>();
  return {
    now: () => time,
    raf: (cb: (t: number) => void) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    caf: (id: number) => {
      queue.delete(id);
    },
    step(ms = 16) {
      time += ms;
      const due = Array.from(queue.entries());
      queue.clear();
      due.forEach(([, cb]) => cb(time));
    },
    pending: () => queue.size,
  };
}

describe("CLOCK and EASE", () => {
  it("keeps the §4.2 beat times", () => {
    expect(CLOCK).toEqual({
      HOLD: 0,
      CRACK_START: 150,
      CRACK_STEP: 120,
      GATHER_START: 750,
      GATHER_STEP: 75,
      STEP_OUT: 1050,
      TITLE: 1170,
      DONE: 1450,
      PURR_AFTER_STEP_OUT: 600,
      MEETING_AFTER_DONE: 400,
      MEETING_WALK: 700,
      MEETING_WALK_RM: 120,
      RM_HOLD: 600,
      RM_FADE: 400,
    });
    // Five crack blocks of 120 ms end where the gather starts.
    expect(CLOCK.CRACK_START + 5 * CLOCK.CRACK_STEP).toBe(CLOCK.GATHER_START);
    expect(EASE).toMatchObject({
      out: "cubic-bezier(.2,.8,.2,1)",
      spring: "cubic-bezier(.34,1.56,.64,1)",
      std: "cubic-bezier(.4,0,.2,1)",
    });
  });
});

describe("startCueClock", () => {
  it("fires each cue once, within one frame of its time, from one rAF loop", () => {
    const frames = fakeFrames();
    const fired: Array<[string, number]> = [];
    const start = frames.now();
    const cue = (name: string, at: number) => ({ at, run: () => fired.push([name, frames.now() - start]) });
    startCueClock([cue("done", CLOCK.DONE), cue("hold", CLOCK.HOLD), cue("stepOut", CLOCK.STEP_OUT), cue("title", CLOCK.TITLE)], frames);

    // The 0 ms cue fires synchronously.
    expect(fired).toEqual([["hold", 0]]);
    for (let i = 0; i < 120; i += 1) {
      expect(frames.pending()).toBeLessThanOrEqual(1);
      frames.step(16);
    }
    expect(fired.map(([name]) => name)).toEqual(["hold", "stepOut", "title", "done"]);
    const at = Object.fromEntries(fired);
    expect(at.stepOut - CLOCK.STEP_OUT).toBeGreaterThanOrEqual(0);
    expect(at.stepOut - CLOCK.STEP_OUT).toBeLessThan(16);
    expect(at.title - CLOCK.TITLE).toBeLessThan(16);
    expect(at.done - CLOCK.DONE).toBeLessThan(16);
    // The loop stops after the last cue.
    expect(frames.pending()).toBe(0);
  });

  it("fires late cues in order after a long frame instead of skipping them", () => {
    const frames = fakeFrames();
    const order: string[] = [];
    startCueClock(
      [
        { at: 150, run: () => order.push("a") },
        { at: 270, run: () => order.push("b") },
        { at: 390, run: () => order.push("c") },
      ],
      frames,
    );
    frames.step(500);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("stops on cancel and survives a throwing cue", () => {
    const frames = fakeFrames();
    const ran: string[] = [];
    const cancel = startCueClock(
      [
        {
          at: 10,
          run: () => {
            throw new Error("boom");
          },
        },
        { at: 20, run: () => ran.push("after-throw") },
        { at: 400, run: () => ran.push("cancelled") },
      ],
      frames,
    );
    frames.step(30);
    expect(ran).toEqual(["after-throw"]);
    cancel();
    cancel();
    expect(frames.pending()).toBe(0);
    frames.step(1000);
    expect(ran).toEqual(["after-throw"]);
  });
});

describe("scanRemainingMs", () => {
  it("waits for the current pass to end", () => {
    expect(scanRemainingMs(0, 1800, 1700)).toBe(100);
    expect(scanRemainingMs(0, 1200, 2300)).toBe(100);
  });

  it("is capped at 400 ms (or the given cap)", () => {
    expect(scanRemainingMs(0, 1800, 100)).toBe(400);
    expect(scanRemainingMs(0, 1800, 2000)).toBe(400);
    expect(scanRemainingMs(0, 1800, 100, 250)).toBe(250);
  });

  it("is 0 on a pass boundary and for bad input", () => {
    expect(scanRemainingMs(0, 1800, 3600)).toBe(0);
    expect(scanRemainingMs(0, 0, 500)).toBe(0);
    expect(scanRemainingMs(0, 1800, Number.NaN)).toBe(0);
    // A clock before the start counts as the start of a pass.
    expect(scanRemainingMs(1000, 1800, 500)).toBe(400);
  });
});

describe("hapticReveal", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "vibrate");
  afterEach(() => {
    if (original) Object.defineProperty(navigator, "vibrate", original);
    else delete (navigator as unknown as { vibrate?: unknown }).vibrate;
  });

  it("buzzes 12, 40, 18 ms", () => {
    const vibrate = jest.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    hapticReveal(false);
    expect(vibrate).toHaveBeenCalledWith([12, 40, 18]);
  });

  it("never buzzes under reduced motion", () => {
    const vibrate = jest.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    hapticReveal(true);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("is a no-op where vibrate is missing or throws", () => {
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    expect(() => hapticReveal(false)).not.toThrow();
    Object.defineProperty(navigator, "vibrate", {
      value: () => {
        throw new Error("blocked");
      },
      configurable: true,
    });
    expect(() => hapticReveal(false)).not.toThrow();
  });
});

describe("flyTo", () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

  function target() {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => rect(100, 200, 192, 192);
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => {
    document.body.innerHTML = "";
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it("resolves and removes its copy where WAAPI is missing", async () => {
    await flyTo("blob:photo", rect(0, 700, 300, 48), target(), 420, false);
    expect(document.querySelector("[data-yc-flight]")).toBeNull();
  });

  it("flies from the CTA into the frame over 420 ms, out easing", async () => {
    const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (frames: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ frames, options });
      const animation = { onfinish: null as null | (() => void), oncancel: null };
      setTimeout(() => animation.onfinish?.(), 0);
      return animation;
    };
    const flight = flyTo("blob:photo", rect(0, 700, 300, 48), target(), 420, false);
    const img = document.querySelector<HTMLImageElement>("[data-yc-flight]");
    expect(img?.style.position).toBe("fixed");
    expect(img?.getAttribute("aria-hidden")).toBe("true");
    await flight;
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({ duration: 420, easing: EASE.out });
    expect(String(calls[0].frames[1].transform)).toContain("translate(100px, -500px)");
    expect(document.querySelector("[data-yc-flight]")).toBeNull();
  });

  it("cross-fades in place for 150 ms under reduced motion", async () => {
    const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function (frames: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ frames, options });
      const animation = { onfinish: null as null | (() => void), oncancel: null };
      setTimeout(() => animation.onfinish?.(), 0);
      return animation;
    };
    const flight = flyTo("blob:photo", rect(0, 700, 300, 48), target(), 420, true);
    const img = document.querySelector<HTMLImageElement>("[data-yc-flight]");
    expect(img?.style.left).toBe("100px");
    await flight;
    expect(calls[0].options.duration).toBe(150);
    expect(calls[0].frames.every((frame) => frame.transform === undefined)).toBe(true);
  });
});

describe("primeHomeSounds", () => {
  type FakeAudio = { src: string; muted: boolean; paused: boolean; currentTime: number; volume: number; play: jest.Mock; pause: jest.Mock };
  let created: FakeAudio[];
  let playImpl: (el: FakeAudio) => unknown;
  const originalAudio = (globalThis as { Audio?: unknown }).Audio;

  function load(allowed = true) {
    jest.resetModules();
    jest.doMock("@/components/audio/uiSounds", () => ({ systemAudioAllowed: () => allowed }));
    // A fresh module per test resets the cached audio elements.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@/components/home/homeSfx") as typeof import("@/components/home/homeSfx");
  }

  beforeEach(() => {
    created = [];
    playImpl = (el) => {
      el.paused = false;
      return Promise.resolve();
    };
    (globalThis as { Audio?: unknown }).Audio = function (this: FakeAudio, src: string) {
      const el: FakeAudio = {
        src,
        muted: false,
        paused: true,
        currentTime: 0,
        volume: 1,
        play: jest.fn(() => playImpl(el)),
        pause: jest.fn(() => {
          el.paused = true;
        }),
      };
      created.push(el);
      return el;
    } as unknown;
  });

  afterEach(() => {
    (globalThis as { Audio?: unknown }).Audio = originalAudio;
    jest.dontMock("@/components/audio/uiSounds");
  });

  it("plays each sound muted, then pauses, rewinds and unmutes it", async () => {
    const { primeHomeSounds } = load();
    primeHomeSounds(["meow", "purr"]);
    expect(created).toHaveLength(2);
    created.forEach((el) => {
      expect(el.play).toHaveBeenCalledTimes(1);
      expect(el.muted).toBe(true);
    });
    await Promise.resolve();
    await Promise.resolve();
    created.forEach((el) => {
      expect(el.pause).toHaveBeenCalled();
      expect(el.muted).toBe(false);
      expect(el.currentTime).toBe(0);
    });
  });

  it("reuses the cached element for the later real play", async () => {
    const { primeHomeSounds, playHomeSound } = load();
    primeHomeSounds(["meow"]);
    await Promise.resolve();
    playHomeSound("meow");
    expect(created).toHaveLength(1);
    expect(created[0].play).toHaveBeenCalledTimes(2);
    expect(created[0].muted).toBe(false);
  });

  it("never throws: play throws, play rejects, play returns nothing", async () => {
    const { primeHomeSounds } = load();
    playImpl = () => {
      throw new Error("NotAllowedError");
    };
    expect(() => primeHomeSounds(["meow"])).not.toThrow();
    playImpl = () => Promise.reject(new Error("NotAllowedError"));
    expect(() => primeHomeSounds(["purr"])).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    // Neither failure leaves a sound muted for the real play later.
    expect(created.map((el) => el.muted)).toEqual([false, false]);
    playImpl = () => undefined;
    expect(() => primeHomeSounds(["eat"])).not.toThrow();
    expect(created[2].muted).toBe(false);
  });

  it("never throws when Audio is missing or the constructor throws", () => {
    (globalThis as { Audio?: unknown }).Audio = undefined;
    expect(() => load().primeHomeSounds(["meow"])).not.toThrow();
    (globalThis as { Audio?: unknown }).Audio = function () {
      throw new Error("no media");
    } as unknown;
    expect(() => load().primeHomeSounds(["meow", "purr"])).not.toThrow();
  });

  it("downloads nothing while the system mute silences sounds", () => {
    load(false).primeHomeSounds(["meow", "purr"]);
    expect(created).toHaveLength(0);
  });
});

describe("stage world motion (R1-03, R1-06, R1-11)", () => {
  it("animates the fireflies, the glow ring and the one-off sheen with transform and opacity only", () => {
    const css = motionCss();
    for (const name of ["yc-firefly", "yc-ring", "yc-sheen-once"]) {
      const body = keyframes(css, name);
      expect({ name, found: body.length > 0 }).toEqual({ name, found: true });
      const props = Array.from(body.matchAll(/([a-z-]+)\s*:/g)).map((match) => match[1]);
      for (const prop of props) expect({ name, prop, ok: prop === "transform" || prop === "opacity" }).toEqual({ name, prop, ok: true });
    }
  });

  it("drifts slowly: fireflies loop over seconds, the ring breathes over 2 s", () => {
    const css = motionCss();
    expect(css).toMatch(/\.yc-firefly \{[^}]*animation: yc-firefly var\(--yc-dur, 14s\) ease-in-out var\(--yc-delay, 0s\) infinite both;/);
    expect(css).toMatch(/\.yc-ring \{ animation: yc-ring 2s ease-in-out infinite alternate both; \}/);
  });

  it("under reduced motion: fireflies stay as still dots, the ring and every sheen are gone", () => {
    const [, reduced = ""] = motionCss().split("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toContain(".yc-firefly { animation: none; opacity: .6; }");
    expect(reduced).toContain(".yc-ring { animation: none; display: none; }");
    expect(reduced).toMatch(/\.yc-sheen, \.yc-sheen-once, \.yc-scan, \.yc-mote \{ display: none; animation: none; \}/);
  });
});

describe("the pet cat's own motion (R2-02, R2-05, R2-06)", () => {
  it("animates the swaying heart, the release bounce and the jump with transform and opacity only", () => {
    for (const name of ["yc-pc-heart", "yc-pc-bounce", "yc-pc-jump"]) {
      const body = keyframes(PET_CAT_CSS, name);
      expect({ name, found: body.length > 0 }).toEqual({ name, found: true });
      const props = Array.from(body.matchAll(/([a-z-]+)\s*:/g)).map((match) => match[1]);
      for (const prop of props) {
        const ok = prop === "transform" || prop === "opacity" || prop === "animation-timing-function";
        expect({ name, prop, ok }).toEqual({ name, prop, ok: true });
      }
    }
  });

  it("the heart sways ±--yc-sway as it rises --yc-rise and fades; the jump peaks at --yc-apex", () => {
    const heart = keyframes(PET_CAT_CSS, "yc-pc-heart");
    expect(heart).toContain("translate(var(--yc-sway, 4px)");
    expect(heart).toContain("translate(calc(var(--yc-sway, 4px) * -1)");
    expect(heart).toMatch(/100% \{ opacity: 0; transform: translate\(0, calc\(var\(--yc-rise, 24px\) \* -1\)\); \}/);
    expect(keyframes(PET_CAT_CSS, "yc-pc-jump")).toContain("var(--yc-apex, -64px)");
  });

  it("under reduced motion the heart only fades (the page's calm keyframes) and the bounce is gone", () => {
    const [, reduced = ""] = PET_CAT_CSS.split("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toContain(".yc-pc-heart { animation: yc-heart-calm 600ms linear");
    expect(reduced).toContain(".yc-pc-bounce { animation: none; }");
    expect(motionCss()).toContain("@keyframes yc-heart-calm ");
  });
});
