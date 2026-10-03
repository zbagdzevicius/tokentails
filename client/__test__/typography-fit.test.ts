// The structural modules only: the package index also exports TTFontsFile, which imports Phaser
// (covered with a mocked Phaser in typography-gate.test.ts).
import {
  FILTER_LINEAR,
  TT_FONTS_HEALED,
  healTexts,
  installFontHealing,
  isGameFontEvent,
  refreshTTResolution,
  trackedTextCount,
} from "@/components/Phaser/typography/healing";
import { fitSpecOf, refitText, ttFit, type TTFitTarget } from "@/components/Phaser/typography/ttFit";
import { ttResolution, ttStyle } from "@/components/Phaser/typography/ttStyle";
import { ttText } from "@/components/Phaser/typography/ttText";
import { TYPE_ROLES } from "@/components/typography";

/**
 * A Text stand-in whose width is characters x size x 0.5 (plus letter spacing), like a monospace
 * approximation of the real canvas measure.
 */
class FakeText implements TTFitTarget {
  text: string;
  size = 16;
  letterSpacing = 0;
  lineSpacing = 0;
  style: { stroke?: string; strokeThickness?: number; update: jest.Mock; resolution?: number };
  active = true;
  scene: unknown = {};
  texture = { setFilter: jest.fn() };
  origin: number[] = [];
  private destroyHandlers: Array<() => void> = [];
  glyphWidth = 0.5;

  constructor(text: string, style: Record<string, unknown> = {}) {
    this.text = text;
    this.style = { ...(style as object), update: jest.fn(() => this.updateText()) };
    const size = typeof style.fontSize === "string" ? parseFloat(style.fontSize) : undefined;
    if (size) this.size = size;
    if (typeof style.letterSpacing === "number") this.letterSpacing = style.letterSpacing;
  }
  get width() {
    return Array.from(this.text).length * (this.size * this.glyphWidth + this.letterSpacing);
  }
  get height() {
    return this.size * 1.2;
  }
  setText(value: string) {
    this.text = value;
    this.updateText();
    return this;
  }
  setFontSize(size: number | string) {
    this.size = typeof size === "number" ? size : parseFloat(size);
    this.updateText();
    return this;
  }
  setLetterSpacing(value: number) {
    this.letterSpacing = value;
    return this;
  }
  setLineSpacing(value: number) {
    this.lineSpacing = value;
    return this;
  }
  setStroke(color: string, thickness: number) {
    this.style.stroke = color;
    this.style.strokeThickness = thickness;
    return this;
  }
  setResolution(value: number) {
    this.style.resolution = value;
    this.updateText();
    return this;
  }
  setActive(value: boolean) {
    this.active = value;
    return this;
  }
  setOrigin(x: number, y = x) {
    this.origin = [x, y];
    return this;
  }
  setScrollFactor() {
    return this;
  }
  setDepth() {
    return this;
  }
  updateText = jest.fn(() => this);
  once(event: string, fn: () => void) {
    if (event === "destroy") this.destroyHandlers.push(fn);
  }
  destroy() {
    this.active = false;
    this.scene = undefined;
    this.destroyHandlers.forEach((fn) => fn());
  }
}

describe("ttFit", () => {
  it("leaves a text that fits alone", () => {
    const text = new FakeText("");
    const result = ttFit(text, { role: "hud", maxWidth: 200, size: 20, segments: ["SCORE 120"] });
    expect(result).toEqual({ text: "SCORE 120", size: 20, dropped: [], truncated: false, fits: true });
  });

  it("drops low-priority segments before shrinking", () => {
    // Streak line: score (keep), W3 (2), BEST 12 (1). At 20px each char is 10.4 px.
    const text = new FakeText("");
    const result = ttFit(text, {
      role: "hud",
      size: 20,
      maxWidth: 120,
      segments: [{ text: "SCORE 1" }, { text: "W3", priority: 2 }, { text: "BEST 12", priority: 1 }],
    });
    expect(result.dropped).toEqual(["BEST 12"]);
    expect(result.text).toBe("SCORE 1  W3");
    expect(result.size).toBe(20);
    expect(text.width).toBeLessThanOrEqual(120);
  });

  it("drops the next segment, then shrinks, never below the role minimum", () => {
    const text = new FakeText("");
    const result = ttFit(text, {
      role: "label",
      size: 24,
      maxWidth: 60,
      segments: [{ text: "SCORE 1" }, { text: "W3", priority: 2 }, { text: "BEST 12", priority: 1 }],
    });
    expect(result.dropped).toEqual(["BEST 12", "W3"]);
    expect(result.text).toBe("SCORE 1");
    expect(result.size).toBeLessThan(24);
    expect(result.size).toBeGreaterThanOrEqual(TYPE_ROLES.label.minPx);
    expect(result.fits).toBe(true);
    expect(text.width).toBeLessThanOrEqual(60.5); // ttFit allows half a px of subpixel slack
  });

  it("truncates with an ellipsis at the minimum size as a last resort", () => {
    const text = new FakeText("");
    const result = ttFit(text, { role: "caption", size: 14, maxWidth: 40, segments: ["Rozinė pėdutė shelter"] });
    expect(result.size).toBe(TYPE_ROLES.caption.minPx);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.fits).toBe(true);
    expect(text.width).toBeLessThanOrEqual(40);
  });

  it("reports fits: false instead of truncating when ellipsis is off", () => {
    const text = new FakeText("A very long hint that cannot fit");
    const result = ttFit(text, { role: "hint", maxWidth: 30, ellipsis: false });
    expect(result).toMatchObject({ fits: false, truncated: false, size: TYPE_ROLES.hint.minPx });
  });

  it("applies the role case, respects maxHeight and scales letter spacing with size", () => {
    const text = new FakeText("");
    const result = ttFit(text, { role: "label", size: 30, maxWidth: 1000, maxHeight: 20, segments: ["paw match"] });
    expect(result.text).toBe("PAW MATCH");
    expect(text.height).toBeLessThanOrEqual(20.5);
    expect(text.letterSpacing).toBeCloseTo(TYPE_ROLES.label.letterSpacingEm * result.size, 2);
  });

  it("remembers the original segments so a refit can restore dropped ones", () => {
    const text = new FakeText("");
    const spec = { role: "hud" as const, size: 20, maxWidth: 100, segments: [{ text: "SCORE 1" }, { text: "BEST 12", priority: 1 }] };
    expect(ttFit(text, spec).dropped).toEqual(["BEST 12"]);
    text.glyphWidth = 0.25; // the real face arrives, narrower than the fallback
    const refit = ttFit(text, fitSpecOf(text)!);
    expect(refit.dropped).toEqual([]);
    expect(refit.text).toBe("SCORE 1  BEST 12");
  });

  it("refits a text the scene changed since from what it shows now, never the old copy", () => {
    const text = new FakeText("SCORE 0");
    ttFit(text, { role: "hud", size: 20, maxWidth: 120 });
    expect(fitSpecOf(text)?.segments).toBeUndefined();
    text.setText("SCORE 500");
    expect(refitText(text)?.text).toBe("SCORE 500");
    expect(text.text).toBe("SCORE 500");
  });

  it("refits changed explicit-segment text whole instead of restoring stale segments", () => {
    const text = new FakeText("");
    ttFit(text, { role: "hud", size: 20, maxWidth: 100, segments: [{ text: "SCORE 1" }, { text: "BEST 12", priority: 1 }] });
    text.setText("SCORE 9");
    expect(refitText(text)?.text).toBe("SCORE 9");
  });

  it("restores a truncation from the original text when nothing changed", () => {
    const text = new FakeText("A LONG SHELTER NAME");
    ttFit(text, { role: "hud", size: 12, maxWidth: 60 });
    expect(text.text.endsWith("…")).toBe(true);
    text.glyphWidth = 0.2; // the real face arrives, much narrower
    expect(refitText(text)).toMatchObject({ text: "A LONG SHELTER NAME", truncated: false });
    expect(refitText(new FakeText("never fitted"))).toBeUndefined();
  });

  it("rescales the burst outline with the size", () => {
    const text = new FakeText("", { stroke: "#4a1d08", strokeThickness: 6 });
    const result = ttFit(text, { role: "burst", size: 40, maxWidth: 120, segments: ["COMBO X4"] });
    expect(result.size).toBeLessThan(40);
    expect(text.style.strokeThickness).toBe(Math.max(2, Math.round(TYPE_ROLES.burst.stroke!.widthEm * result.size)));
  });
});

describe("ttStyle", () => {
  it("maps a role onto a Phaser text style", () => {
    const style = ttStyle("title", { size: 36, resolution: 2 });
    expect(style).toMatchObject({
      fontFamily: TYPE_ROLES.title.stack,
      fontSize: "36px",
      fontStyle: "900",
      color: "#ffcc55",
      resolution: 2,
    });
    expect(style.stroke).toBeUndefined();
  });

  it("gives burst its bark outline and clamps sizes", () => {
    const style = ttStyle("burst", { size: 10 });
    expect(style.fontSize).toBe(`${TYPE_ROLES.burst.minPx}px`);
    expect(style.stroke).toBe("#4a1d08");
    expect(style.strokeThickness).toBeGreaterThanOrEqual(2);
    expect(ttStyle("burst", { stroke: false }).stroke).toBeUndefined();
  });

  it("supports wrap, italic and custom colours", () => {
    const style = ttStyle("hint", { wordWrapWidth: 240, italic: true, color: "#fff" });
    expect(style.wordWrap).toEqual({ width: 240, useAdvancedWrap: true });
    expect(style.fontStyle).toBe("italic 800");
    expect(style.color).toBe("#fff");
  });
});

describe("ttResolution", () => {
  const scene = (zoom: number, ratio?: number) => ({
    cameras: { main: { zoom } },
    registry: { get: (key: string) => (key === "canvasPixelRatio" ? ratio : undefined) },
  });

  it("follows the canvas pixel ratio and camera zoom, capped at 3", () => {
    expect(ttResolution(scene(1))).toBe(1);
    expect(ttResolution(scene(1, 2))).toBe(2);
    expect(ttResolution(scene(4, 2))).toBe(3);
    expect(ttResolution(scene(2.5))).toBe(2.5);
    expect(ttResolution({})).toBe(1);
  });
});

describe("ttText and font healing", () => {
  const makeScene = (game: object, ratio = 2) => {
    const created: FakeText[] = [];
    return {
      created,
      game,
      sys: { game },
      cameras: { main: { zoom: 1 } },
      registry: { get: (key: string) => (key === "canvasPixelRatio" ? ratio : undefined) },
      add: {
        text: (x: number, y: number, text: string | string[], style: Record<string, unknown>) => {
          const object = new FakeText(Array.isArray(text) ? text.join("\n") : text, style);
          created.push(object);
          return object;
        },
      },
    };
  };
  const makeGame = () => ({ events: { emit: jest.fn(), once: jest.fn() } });

  it("creates text with the role style, case, resolution and a LINEAR filter that survives updates", () => {
    const game = makeGame();
    const scene = makeScene(game);
    const text = ttText(scene as never, 10, 20, "paw match", "label", { origin: 0.5 }) as unknown as FakeText;
    expect(text.text).toBe("PAW MATCH");
    expect(text.style).toMatchObject({ resolution: 2, fontFamily: TYPE_ROLES.label.stack });
    expect(text.origin).toEqual([0.5, 0.5]);
    expect(text.texture.setFilter).toHaveBeenLastCalledWith(FILTER_LINEAR);

    text.texture.setFilter.mockClear();
    text.setText("NEW");
    expect(text.texture.setFilter).toHaveBeenCalledWith(FILTER_LINEAR);
  });

  it("fits on creation when asked", () => {
    const game = makeGame();
    const scene = makeScene(game);
    const text = ttText(scene as never, 0, 0, "", "hud", {
      size: 20,
      fit: { maxWidth: 100, segments: [{ text: "SCORE 1" }, { text: "BEST 12", priority: 1 }] },
    });
    expect(text.ttFitResult).toMatchObject({ text: "SCORE 1", dropped: ["BEST 12"] });
  });

  it("re-measures and refits registered texts on loadingdone, then emits TT_FONTS_HEALED", () => {
    const game = makeGame();
    const scene = makeScene(game);
    const listeners: Array<() => void> = [];
    const fontEvents = {
      addEventListener: jest.fn((_: string, fn: () => void) => listeners.push(fn)),
      removeEventListener: jest.fn(),
    };
    const scheduled: Array<() => void> = [];
    const uninstall = installFontHealing(game, { fontEvents, schedule: (fn) => scheduled.push(fn) });
    expect(installFontHealing(game, { fontEvents })).toBe(uninstall);

    const plain = ttText(scene as never, 0, 0, "Hello", "caption") as unknown as FakeText;
    const fitted = ttText(scene as never, 0, 0, "", "hud", {
      size: 20,
      fit: { maxWidth: 100, segments: [{ text: "SCORE 1" }, { text: "BEST 12", priority: 1 }] },
    }) as unknown as FakeText;
    expect(fitted.text).toBe("SCORE 1");
    expect(trackedTextCount(game)).toBe(2);

    fitted.glyphWidth = 0.25;
    listeners.forEach((fn) => fn());
    listeners.forEach((fn) => fn()); // a burst coalesces into one pass
    expect(scheduled).toHaveLength(1);
    scheduled[0]();

    expect(plain.style.update).toHaveBeenCalledWith(true);
    expect(fitted.text).toBe("SCORE 1  BEST 12");
    expect(game.events.emit).toHaveBeenCalledWith(TT_FONTS_HEALED, 2);

    plain.destroy();
    expect(trackedTextCount(game)).toBe(1);

    uninstall();
    expect(fontEvents.removeEventListener).toHaveBeenCalled();
    expect(game.events.once).toHaveBeenCalledWith("destroy", expect.any(Function));
  });

  it("ignores loadingdone for fonts the game does not use (icon fonts)", () => {
    const game = makeGame();
    const scene = makeScene(game);
    const listeners: Array<(event?: unknown) => void> = [];
    const fontEvents = {
      addEventListener: jest.fn((_: string, fn: (event?: unknown) => void) => listeners.push(fn)),
      removeEventListener: jest.fn(),
    };
    const scheduled: Array<() => void> = [];
    installFontHealing(game, { fontEvents, schedule: (fn) => scheduled.push(fn) });
    ttText(scene as never, 0, 0, "Hello", "caption");

    listeners.forEach((fn) => fn({ fontfaces: [{ family: "paws" }, { family: '"Cat Paw"' }] }));
    listeners.forEach((fn) => fn({ fontfaces: [] }));
    expect(scheduled).toHaveLength(0);
    expect(game.events.emit).not.toHaveBeenCalledWith(TT_FONTS_HEALED, expect.anything());

    listeners.forEach((fn) => fn({ fontfaces: [{ family: "paws" }, { family: '"Nunito"' }] }));
    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    expect(game.events.emit).toHaveBeenCalledWith(TT_FONTS_HEALED, 1);
  });

  it("treats brand, fallback and list-less loadingdone events as game fonts", () => {
    expect(isGameFontEvent({ fontfaces: [{ family: "Passion One" }] })).toBe(true);
    expect(isGameFontEvent({ fontfaces: [{ family: "'Bebas Neue Fallback'" }] })).toBe(true);
    expect(isGameFontEvent({ fontfaces: [{ family: "Nunito Fallback Android" }] })).toBe(true);
    expect(isGameFontEvent({ fontfaces: [{ family: "Pixelify Sans" }] })).toBe(false);
    expect(isGameFontEvent(undefined)).toBe(true);
    expect(isGameFontEvent({})).toBe(true);
  });

  it("drops destroyed texts (no scene) during a pass", () => {
    const game = makeGame();
    const scene = makeScene(game);
    const text = ttText(scene as never, 0, 0, "Bye", "caption") as unknown as FakeText;
    text.scene = undefined;
    expect(healTexts(game)).toBe(0);
    expect(trackedTextCount(game)).toBe(0);
  });

  it("keeps hidden (inactive) texts registered and heals them once they are active again", () => {
    const game = makeGame();
    const scene = makeScene(game);
    const text = ttText(scene as never, 0, 0, "Pooled", "caption") as unknown as FakeText;
    text.setActive(false);
    expect(healTexts(game)).toBe(0);
    expect(trackedTextCount(game)).toBe(1);
    text.setActive(true);
    expect(healTexts(game)).toBe(1);
    expect(text.style.update).toHaveBeenCalledWith(true);
  });

  it("does not revert a fitted HUD text the scene updated with setText", () => {
    const game = makeGame();
    const scene = makeScene(game);
    const text = ttText(scene as never, 0, 0, "SCORE 0", "hud", { fit: { maxWidth: 120 } }) as unknown as FakeText;
    text.setText("SCORE 500");
    healTexts(game);
    expect(text.text).toBe("SCORE 500");
  });

  it("picks up the scene's current zoom on heal unless the resolution was explicit", () => {
    const game = makeGame();
    const scene = makeScene(game, 1);
    const auto = ttText(scene as never, 0, 0, "Auto", "caption") as unknown as FakeText;
    const fixed = ttText(scene as never, 0, 0, "Fixed", "caption", { resolution: 1 }) as unknown as FakeText;
    expect(auto.style.resolution).toBe(1);
    auto.scene = fixed.scene = scene; // Phaser sets text.scene to the owning scene
    scene.cameras.main.zoom = 2; // the scene set its zoom after creating the text
    healTexts(game);
    expect(auto.style.resolution).toBe(2);
    expect(fixed.style.resolution).toBe(1);
    expect(refreshTTResolution(auto)).toBe(false); // already current
  });
});
