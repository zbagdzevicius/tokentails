/**
 * @jest-environment jsdom
 */
/**
 * `/yourcat` phone polish (round phone-r1): the phone meeting layout (the portrait steps back so the
 * shelter frame, the cat and the portrait never overlap), the caption's night plate (WCAG AA on the
 * lit altar), the failure actions that fit their panel, the stage that clips sideways below xl, and
 * three small motions with their reduced-motion versions: the Story/Post FLIP, the marching outline
 * while a file is dragged over, and the friend's cat fading out on choose.
 */
import { render, screen } from "@testing-library/react";

jest.mock("@/components/home/homeSfx", () => ({ playHomeSound: jest.fn() }));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn(), systemAudioAllowed: () => true }));

import { Frame, FrameSilhouette } from "@/components/yourcat/Frame";
import { fadeOutGhost, GHOST_FADE_MS, GHOST_FADE_RM_MS } from "@/components/yourcat/motion";
import { CAPTION_PLATE, PetCat } from "@/components/yourcat/PetCat";
import { formatFlipFrames, formatFlipFrom, FORMAT_FLIP_MS, FORMAT_FLIP_RM_MS, FORMAT_FLIP_STEPS, layoutBox } from "@/components/yourcat/RevealStep";
import { MEETING_FRAME, MEETING_FRAME_MD, MEETING_GROUP, MEETING_GROUP_MD, Stage } from "@/components/yourcat/Stage";
import { FIT_PANEL } from "@/components/yourcat/WorkingStep";
import { readFileSync } from "fs";
import { join } from "path";

class FakeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
});

const labels = { pet: "Pet Mochi", tap: "Tap Mochi", purrs: "Mochi purrs." };

/** WCAG relative luminance of an sRGB colour. */
function luminance([r, g, b]: number[]): number {
  const lin = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const blend = (top: number[], alpha: number, under: number[]) => top.map((value, index) => value * alpha + under[index] * (1 - alpha));

describe("the phone meeting layout", () => {
  it("steps the portrait back and moves the group while the meeting is on", () => {
    const { rerender } = render(<Stage frame={<span>f</span>} companion={<span>c</span>} cat={<span>cat</span>} shifted reducedMotion={false} />);
    const group = () => screen.getByTestId("yourcat-stage-group");
    const frameSlot = () => screen.getByTestId("yourcat-slot-frame");
    expect(frameSlot().className).not.toContain("scale-75");
    expect(screen.getByTestId("yourcat-stage").getAttribute("data-meeting")).toBeNull();

    rerender(<Stage frame={<span>f</span>} companion={<span>c</span>} cat={<span>cat</span>} shifted meeting reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-stage").getAttribute("data-meeting")).toBe("true");
    expect(group().className).toContain(MEETING_GROUP);
    expect(frameSlot().className).toContain(MEETING_FRAME);
    // Transforms only (no layout property), anchored on the portrait's bottom right corner; the phone values are max-md.
    for (const token of `${MEETING_GROUP} ${MEETING_FRAME}`.split(" ")) expect(token.startsWith("max-md:")).toBe(true);
    expect(MEETING_FRAME).toContain("max-md:scale-75");
    expect(MEETING_FRAME).toContain("max-md:origin-bottom-right");
    // The companion and the cat slots keep their places in the group (the walk is measured from them).
    expect(screen.getByTestId("yourcat-slot-companion").className).toContain("-mr-10");
    expect(screen.getByTestId("yourcat-slot-cat").className).toContain("-ml-[30px]");
    // The step back rides the shift's spring.
    expect(frameSlot().className).toContain("transition-transform");
  });

  it("fits the three actors side by side at 360 and 390 with no overlap", () => {
    // Stage widths at 360 and 390 (as measured), the 212 px portrait (192 + 2 x 10 bevel) at 0.75,
    // the 58 px shelter frame, the sitting cat with its tail (~87 px) and the measured gaps.
    const scale = Number(/scale-(\d+)/.exec(MEETING_FRAME)?.[1]) / 100;
    const frameShift = Number(/translate-x-\[(\d+)px\]/.exec(MEETING_FRAME)?.[1]);
    const groupShift = -Number(/-translate-x-\[(\d+)px\]/.exec(MEETING_GROUP)?.[1]);
    for (const stageWidth of [332, 358]) {
      const groupLeft = (stageWidth - 212) / 2 + groupShift;
      const portraitRight = groupLeft + 212 + frameShift;
      const portraitLeft = portraitRight - 212 * scale;
      const shelterRight = groupLeft + 40; // the companion slot's -mr-10
      const shelterLeft = shelterRight - 58;
      const catLeft = shelterRight + 8; // MEETING_GAP.phone to the nose
      const catRight = catLeft + 87;
      expect(shelterLeft).toBeGreaterThanOrEqual(0);
      expect(portraitRight).toBeLessThanOrEqual(stageWidth);
      expect(catRight).toBeLessThan(portraitLeft);
    }
  });

  it("uses the same no-overlap rule from md up: the portrait steps back to 0.8 and the row fits 768 and column 1 at 1280", () => {
    render(<Stage frame={<span>f</span>} companion={<span>c</span>} cat={<span>cat</span>} shifted meeting reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-stage-group").className).toContain(MEETING_GROUP_MD);
    expect(screen.getByTestId("yourcat-slot-frame").className).toContain(MEETING_FRAME_MD);
    for (const token of `${MEETING_GROUP_MD} ${MEETING_FRAME_MD}`.split(" ")) expect(token.startsWith("md:")).toBe(true);
    const scale = Number(/scale-\[(\.\d+)\]/.exec(MEETING_FRAME_MD)?.[1]);
    const frameShift = Number(/translate-x-\[(\d+)px\]/.exec(MEETING_FRAME_MD)?.[1]);
    const groupShift = -Number(/-translate-x-\[(\d+)px\]/.exec(MEETING_GROUP_MD)?.[1]);
    // The 404 px portrait, the 138 px shelter frame overlapping the frame's layout box by 20 (-mr-5),
    // the 6x cat: 16 px to the nose, then 28 columns (168 px) to its tail.
    for (const columnWidth of [672, 716]) {
      const frameLeft = (columnWidth - 404) / 2 + groupShift;
      const portraitRight = frameLeft + 404 + frameShift;
      const portraitLeft = portraitRight - 404 * scale;
      const shelterRight = frameLeft + 20;
      const catRight = shelterRight + 16 + 168;
      expect(shelterRight - 138).toBeGreaterThanOrEqual(0);
      expect(portraitRight).toBeLessThanOrEqual(columnWidth);
      expect(portraitLeft - catRight).toBeGreaterThanOrEqual(8);
    }
  });

  it("is instant under reduced motion", () => {
    render(<Stage frame={<span>f</span>} meeting shifted reducedMotion />);
    expect(screen.getByTestId("yourcat-slot-frame").className).not.toContain("transition-transform");
  });

  it("clips sideways below xl, so a 6x cat's sheet box never scrolls the page at 768", () => {
    render(<Stage frame={<span>f</span>} reducedMotion={false} />);
    expect(screen.getByTestId("yourcat-stage").className).toContain("max-xl:overflow-x-clip");
  });

  it("RevealStep turns the meeting layout on with the shelter frame, and the cat's caption to start", () => {
    const source = readFileSync(join(__dirname, "../components/yourcat/RevealStep.tsx"), "utf8");
    expect(source).toContain('useStageConfig({ shifted: phase !== "pre", meeting: meeting !== "none" })');
    expect(source).toContain('captionStart={meeting !== "none"}');
  });

  it("measures the walk from layout boxes in the stage group, which no running transform moves", () => {
    // group > slot (offset 120) > cat wrapper (offset 6, 144 wide): 126 to 270 in the group's space,
    // whatever transform the group, the slot or the cat is in the middle of.
    const group = document.createElement("div");
    const slot = document.createElement("div");
    const cat = document.createElement("div");
    group.appendChild(slot);
    slot.appendChild(cat);
    const set = (node: HTMLElement, left: number, parent: HTMLElement | null, width = 0) => {
      Object.defineProperty(node, "offsetLeft", { configurable: true, value: left });
      Object.defineProperty(node, "offsetParent", { configurable: true, value: parent });
      Object.defineProperty(node, "offsetWidth", { configurable: true, value: width });
    };
    set(slot, 120, group, 144);
    set(cat, 6, slot, 144);
    slot.style.transform = "translateX(-40px)";
    cat.style.transform = "scale(0.75)";
    expect(layoutBox(cat, group)).toEqual({ left: 126, right: 270, width: 144 });
    // Not inside that group, or no layout: null, and the caller falls back to the painted rects.
    expect(layoutBox(cat, document.createElement("div"))).toBeNull();
    set(cat, 6, slot, 0);
    expect(layoutBox(cat, group)).toBeNull();
    const source = readFileSync(join(__dirname, "../components/yourcat/RevealStep.tsx"), "utf8");
    expect(source).toContain('group?.addEventListener("transitionend", sync)');
  });
});

describe("the cat's caption", () => {
  it("sits on a night plate that keeps lilac at WCAG AA over the brightest stage pixel", () => {
    render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const text = screen.getByTestId("yourcat-petcat-caption").querySelector("span") as HTMLElement;
    for (const token of CAPTION_PLATE.split(" ")) expect(text.className).toContain(token);
    expect(CAPTION_PLATE).toContain("bg-tt-night-950/85");
    const lilac = [240, 197, 253];
    const night950 = [7, 5, 26];
    for (const under of [
      [255, 255, 255],
      [252, 190, 118],
      [0, 0, 0],
    ]) {
      expect(contrast(lilac, blend(night950, 0.85, under))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("starts under the cat's body on phones when asked, centred otherwise", () => {
    const { rerender } = render(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} reducedMotion={false} />);
    const caption = () => screen.getByTestId("yourcat-petcat-caption");
    expect(caption().className).toContain("-translate-x-1/2");
    expect(caption().className).not.toContain("max-md:translate-x-0");
    rerender(<PetCat spriteImg="/s.png" name="Mochi" labels={labels} captionStart reducedMotion={false} />);
    expect(caption().className).toContain("max-md:left-[calc(12px*var(--s))]");
    expect(caption().className).toContain("max-md:translate-x-0");
  });
});

describe("the failure actions", () => {
  it("hold the primary at 1x on phones, pressed too, with a smaller label, so it fits the panel", () => {
    expect(FIT_PANEL).toContain("max-sm:[&_.glow-box]:!scale-100");
    expect(FIT_PANEL).toContain("max-sm:[&_.glow-box:hover]:!scale-100");
    expect(FIT_PANEL).toContain("max-sm:[&_.glow-box_.text-p3]:!text-p4");
    expect(readFileSync(join(__dirname, "../components/yourcat/WorkingStep.tsx"), "utf8")).toMatch(/\$\{FIT_PANEL\}/);
  });
});

describe("the Story/Post FLIP", () => {
  it("starts the new box where and as large as the old one", () => {
    expect(FORMAT_FLIP_MS).toBe(300);
    expect(FORMAT_FLIP_RM_MS).toBe(120);
    const story = { left: 72, top: 536, width: 246, height: 438 };
    const post = { left: 10, top: 536, width: 370, height: 462 };
    expect(formatFlipFrom(story, post)).toBe("translate(62px, 0px) scale(0.665, 0.948)");
    expect(formatFlipFrom(post, post)).toBeNull();
    expect(formatFlipFrom({ left: 0, top: 0, width: 0, height: 0 }, post)).toBeNull();
  });

  it("never squashes the art: the art layer's scale undoes the box's at every keyframe, centred", () => {
    const story = { left: 72, top: 536, width: 246, height: 438 };
    const post = { left: 10, top: 536, width: 370, height: 462 };
    for (const [from, to] of [[story, post], [post, story]] as const) {
      const frames = formatFlipFrames(from, to);
      if (!frames) throw new Error("no frames");
      expect(frames.box).toHaveLength(FORMAT_FLIP_STEPS + 1);
      expect(frames.art).toHaveLength(FORMAT_FLIP_STEPS + 1);
      expect(frames.box[FORMAT_FLIP_STEPS].transform).toBe("translate(0px, 0px) scale(1, 1)");
      expect(frames.art[FORMAT_FLIP_STEPS].transform).toBe("translate(0px, 0px) scale(1, 1)");
      frames.box.forEach((frame, index) => {
        const [bx, by] = /scale\(([\d.]+), ([\d.]+)\)/.exec(String(frame.transform))!.slice(1).map(Number);
        const art = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+), ([\d.]+)\)/.exec(String(frames.art[index].transform))!.slice(1).map(Number);
        expect(frame.offset).toBeCloseTo(frames.art[index].offset as number, 6);
        // Drawn size = box scale x art scale = 1 on both axes (no squash).
        expect(bx * art[2]).toBeCloseTo(1, 3);
        expect(by * art[3]).toBeCloseTo(1, 3);
        // Centred: the art's visual left inside the box is half the size difference.
        expect(art[0] * bx).toBeCloseTo(((bx - 1) * to.width) / 2, 1);
      });
    }
    expect(formatFlipFrames(post, post)).toBeNull();
  });
});

describe("the marching outline", () => {
  it("marches a dashed outline around the glass while a file is dragged over; static under reduced motion", () => {
    const { rerender } = render(<Frame inner={{ w: 192, h: 192, mdW: 384, mdH: 384 }} dragOver reducedMotion={false} />);
    const marching = screen.getByTestId("yourcat-frame-marching");
    const rects = marching.querySelectorAll("rect");
    expect(rects).toHaveLength(2);
    expect(rects[0].getAttribute("class")).toContain("yc-dash");
    expect(rects[0].getAttribute("width")).toBe("190");
    expect(rects[1].getAttribute("width")).toBe("382");
    // A dash period of 8 divides the 16 px yc-dash step, so the loop has no jump.
    expect(rects[0].getAttribute("stroke-dasharray")).toBe("6 2");
    rerender(<Frame inner={{ w: 192, h: 192 }} dragOver reducedMotion />);
    expect(screen.queryByTestId("yourcat-frame-marching")).toBeNull();
    expect(screen.getByTestId("yourcat-frame-inner").innerHTML).toContain("border-dashed");
    rerender(<Frame inner={{ w: 192, h: 192 }} reducedMotion={false} />);
    expect(screen.queryByTestId("yourcat-frame-marching")).toBeNull();
  });

  it("marches the silhouette too, when the page passes the drag through", () => {
    render(<FrameSilhouette label="Your cat here" marching />);
    expect(screen.getByTestId("yourcat-frame-silhouette").querySelector("path")?.getAttribute("class")).toContain("yc-dash");
    const page = readFileSync(join(__dirname, "../components/yourcat/YourCatPage.tsx"), "utf8");
    expect(page).toContain("dragOver={!!stageConfig.dragOver}");
    const transform = readFileSync(join(__dirname, "../components/yourcat/TransformFrame.tsx"), "utf8");
    expect(transform).toContain("marching={!!props.dragOver && !reducedMotion}");
  });
});

describe("the friend's cat fading out on choose", () => {
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  function setup() {
    const host = document.createElement("div");
    const cat = document.createElement("div");
    cat.setAttribute("data-testid", "yourcat-petcat");
    cat.innerHTML = '<button type="button" aria-label="Pet Mochi"></button><p aria-live="polite" id="x">Tap Mochi</p>';
    host.appendChild(cat);
    document.body.appendChild(host);
    host.getBoundingClientRect = () => ({ left: 10, top: 100, width: 300, height: 300 }) as DOMRect;
    cat.getBoundingClientRect = () => ({ left: 200, top: 250, width: 144, height: 144 }) as DOMRect;
    return { host, cat };
  }

  it("fades an inert copy out in place over 200 ms, then removes it", () => {
    const animation: { onfinish: (() => void) | null; oncancel: (() => void) | null } = { onfinish: null, oncancel: null };
    const animate = jest.fn(() => animation);
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    const { host, cat } = setup();
    const ghost = fadeOutGhost(cat, host, false) as HTMLElement;
    expect(ghost.parentElement).toBe(host);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    expect(ghost.style.left).toBe("190px");
    expect(ghost.style.top).toBe("150px");
    expect(ghost.style.pointerEvents).toBe("none");
    expect(ghost.querySelector("button")?.getAttribute("tabindex")).toBe("-1");
    expect(ghost.querySelector("[aria-live]")).toBeNull();
    expect(ghost.querySelector("[id]")).toBeNull();
    expect(ghost.getAttribute("data-testid")).toBeNull();
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], expect.objectContaining({ duration: GHOST_FADE_MS }));
    animation.onfinish?.();
    expect(host.contains(ghost)).toBe(false);
    host.remove();
  });

  it("keeps a shorter linear fade under reduced motion, and never throws without WAAPI or a node", () => {
    const animate = jest.fn(() => ({ onfinish: null, oncancel: null }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    const { host, cat } = setup();
    fadeOutGhost(cat, host, true);
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], expect.objectContaining({ duration: GHOST_FADE_RM_MS, easing: "linear" }));
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    expect(fadeOutGhost(cat, host, false)).toBeNull();
    expect(host.querySelectorAll("[data-yc-ghost]")).toHaveLength(1);
    expect(fadeOutGhost(null, host, false)).toBeNull();
    host.remove();
  });

  it("UploadStep fades the friend's cat out before the upload starts", () => {
    const source = readFileSync(join(__dirname, "../components/yourcat/UploadStep.tsx"), "utf8");
    const take = source.slice(source.indexOf("const take ="), source.indexOf("onFile(file, source);"));
    expect(take).toContain("if (friend) {");
    expect(take).toContain("fadeOutGhost(");
  });
});
