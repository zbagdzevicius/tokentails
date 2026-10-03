/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MeetYourCat, type MeetYourCatProps } from "@/components/onboarding/MeetYourCat";
import { RevealAnimation } from "@/components/tailsCard/RevealAnimation";
import { STARTER_API } from "@/api/starter-api";

/** Meet your cat rendered (plan G3): SKIP, the commit outcomes and reduced motion. */

jest.mock("@/analytics", () => ({ analytics: { track: jest.fn() }, buildEvent: (name: string, properties: unknown) => ({ name, properties }) }));
jest.mock("@/api/starter-api", () => ({
  STARTER_API: {
    commitStarter: jest.fn(),
    featured: jest.fn(),
    featuredNames: jest.fn(),
    follow: jest.fn(),
    unfollow: jest.fn(),
  },
}));

const api = STARTER_API as unknown as Record<string, jest.Mock>;
const FEATURED = [
  { _id: "b1", name: "kretis", status: "WAITING", catAvatar: "/a.png", shelter: { _id: "s", name: "Pink Paw" } },
  { _id: "b2", name: "saule", status: "WAITING" },
  { _id: "b3", name: "Amsis", status: "RECOVERING" },
];

function mockMatchMedia(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

async function flush(ms = 0) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderMeet(props: Partial<MeetYourCatProps> = {}) {
  const onDone = jest.fn();
  const onCommitted = jest.fn();
  const utils = render(<MeetYourCat open uid="uid-1" onDone={onDone} onCommitted={onCommitted} {...props} />);
  return { ...utils, onDone, onCommitted };
}

const step = () => screen.getByTestId("meet-your-cat").getAttribute("data-step");

let rectSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  // jsdom has no layout: give the altar stage a 1440x900 box so the pixel cat is placed.
  rectSpy = jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1440,
    bottom: 900,
    width: 1440,
    height: 900,
    toJSON: () => ({}),
  } as DOMRect);
  jest.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  mockMatchMedia(false);
  api.featured.mockResolvedValue(FEATURED);
  api.featuredNames.mockResolvedValue(["kretis", "saule", "Amsis"]);
  api.follow.mockResolvedValue({ ok: true, following: ["b1"] });
  api.commitStarter.mockResolvedValue({
    status: "committed",
    cat: { _id: "c1", name: "Nimbus", starterBreed: "MISTY" },
    onboarding: { state: "done" },
  });
  localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  rectSpy.mockRestore();
  jest.restoreAllMocks();
});

async function toAwaits() {
  await flush(1600); // the loading step waits for the altar art, 1.5 s at most
  expect(step()).toBe("awaits");
}

describe("Meet your cat", () => {
  it("opens on the altar loading state, then shows 'Your cat awaits…'", async () => {
    renderMeet();
    expect(step()).toBe("loading");
    expect(screen.queryByTestId("meet-awaits")).toBeNull();
    await toAwaits();
    expect(screen.getByRole("heading", { name: "Your cat awaits…" })).toBeTruthy();
  });

  it("puts SKIP first in the focus order", async () => {
    renderMeet();
    await toAwaits();
    const dialog = screen.getByTestId("meet-your-cat");
    const tabbable = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, [href], [tabindex]")).filter(
      (element) => element.tabIndex >= 0,
    );
    expect(tabbable[0].dataset.testid).toBe("meet-skip");
  });

  it("moves focus to the new step's heading in the same commit, not a frame later", async () => {
    renderMeet();
    await toAwaits();
    // No timers advance after the click: a frame-delayed focus would still be on the button.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "MEET YOUR CAT" }));
    });
    expect(step()).toBe("choose");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Choose your companion" }));
  });

  it("SKIP commits the default starter and ends the ceremony", async () => {
    const { onDone } = renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByTestId("meet-skip"));
    await flush();
    expect(api.commitStarter).toHaveBeenCalledWith({ breed: "SCOUT", skipped: true });
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ exit: "skipped", breed: "SCOUT", name: "Scout" }));
  });

  it("shows the inline validation message and commits the chosen name", async () => {
    const { onDone, onCommitted } = renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByTestId("starter-MISTY"));
    fireEvent.click(screen.getByText("CONTINUE"));
    expect(step()).toBe("name");
    const input = screen.getByTestId("meet-name-input") as HTMLInputElement;
    expect(input.value).toBe("Misty");
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(screen.getByTestId("meet-name-error").textContent).toBe("Use at least 2 characters.");
    fireEvent.change(input, { target: { value: "Kretis" } });
    expect(screen.getByTestId("meet-name-error").textContent).toBe("That name is taken. Try another one.");
    fireEvent.change(input, { target: { value: "Nimbus" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await flush();
    expect(step()).toBe("reveal");
    expect(screen.getByTestId("meet-announce").textContent).toBe("Meet Nimbus!");
    expect(api.commitStarter).toHaveBeenCalledWith({ breed: "MISTY", name: "Nimbus" });
    expect(onCommitted).toHaveBeenCalledWith(expect.objectContaining({ status: "committed", breed: "MISTY", name: "Nimbus" }));
    fireEvent.click(screen.getByText("CONTINUE"));
    expect(step()).toBe("featured");
    expect(screen.getByText("These cats are also in rescue packs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Follow Kretis" }));
    await flush();
    expect(api.follow).toHaveBeenCalledWith("b1");
    expect(screen.getByRole("button", { name: "Following Kretis" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("START PLAYING"));
    await flush();
    expect(onDone).toHaveBeenCalledWith({ exit: "finished", breed: "MISTY", name: "Nimbus", followed: ["b1"] });
  });

  it("409 STARTER_LOCKED is handled as done, with no error shown", async () => {
    api.commitStarter.mockResolvedValue({ status: "locked" });
    const { onCommitted, onDone } = renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.submit(screen.getByTestId("meet-name-input").closest("form") as HTMLFormElement);
    await flush();
    expect(onCommitted).toHaveBeenCalledWith(expect.objectContaining({ status: "locked" }));
    expect(screen.queryByRole("alert", { name: /error/i })).toBeNull();
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.click(screen.getByText("START PLAYING"));
    await flush();
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ exit: "finished", breed: "SCOUT", name: "Scout" }));
  });

  it("a name the server refuses returns to the nameplate", async () => {
    api.commitStarter.mockResolvedValue({ status: "invalid", code: "NAME_RESERVED" });
    renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.change(screen.getByTestId("meet-name-input"), { target: { value: "Biscuit" } });
    fireEvent.submit(screen.getByTestId("meet-name-input").closest("form") as HTMLFormElement);
    await flush();
    expect(step()).toBe("name");
    expect(screen.getByTestId("meet-name-error").textContent).toBe("That name is taken. Try another one.");
  });

  it("an offline commit still finishes the ceremony (the draft is the fallback)", async () => {
    api.commitStarter.mockResolvedValue({ status: "failed", httpStatus: null, offline: true });
    const { onCommitted } = renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByTestId("meet-skip"));
    await flush();
    expect(onCommitted).toHaveBeenCalledWith(expect.objectContaining({ status: "offline", breed: "SCOUT", skipped: true }));
    expect(JSON.parse(localStorage.getItem("tt.starterDraft") || "{}")).toMatchObject({ uid: "uid-1", breed: "SCOUT", skipped: true });
  });

  it("skips the real-cats step when none are featured", async () => {
    api.featured.mockResolvedValue([]);
    const { onDone } = renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.submit(screen.getByTestId("meet-name-input").closest("form") as HTMLFormElement);
    await flush();
    fireEvent.click(screen.getByText("CONTINUE"));
    await flush();
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ exit: "finished" }));
  });

  it("under reduced motion the altar cat is a still frame and the reveal does not spin", async () => {
    mockMatchMedia(true);
    renderMeet();
    await toAwaits();
    await flush(1300);
    expect((screen.getByTestId("altar-pixel-cat") as HTMLImageElement).getAttribute("src")).toMatch(/still\.png$/);
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.submit(screen.getByTestId("meet-name-input").closest("form") as HTMLFormElement);
    await flush();
    const reveal = screen.getByTestId("meet-reveal");
    expect(reveal.getAttribute("data-reduced-motion")).toBe("true");
    expect(reveal.innerHTML).not.toMatch(/animate-spin/);
  });

  it("holds the reveal until the save answers, so a late NAME_* refusal is never lost (review 4a #3)", async () => {
    api.featured.mockResolvedValue([]);
    let answer: (value: unknown) => void = () => undefined;
    api.commitStarter.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { onDone, onCommitted } = renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.change(screen.getByTestId("meet-name-input"), { target: { value: "Biscuit" } });
    fireEvent.submit(screen.getByTestId("meet-name-input").closest("form") as HTMLFormElement);
    await flush();
    expect(step()).toBe("reveal");
    // CONTINUE says it is saving and does nothing; SKIP is disabled.
    fireEvent.click(screen.getByText("SAVING…"));
    expect((screen.getByTestId("meet-skip") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("meet-skip"));
    await flush();
    expect(step()).toBe("reveal");
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => answer({ status: "invalid", code: "NAME_BLOCKED" }));
    await flush();
    expect(step()).toBe("name");
    expect(screen.getByTestId("meet-name-error").textContent).toBeTruthy();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a failure that kept nothing reports 'failed', keeps no draft and offers a retry (review 4a #6)", async () => {
    api.featured.mockResolvedValue([]);
    api.commitStarter.mockResolvedValueOnce({ status: "failed", httpStatus: 403, offline: false });
    const { onCommitted, onDone } = renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.submit(screen.getByTestId("meet-name-input").closest("form") as HTMLFormElement);
    await flush();
    expect(onCommitted).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", breed: "SCOUT" }));
    expect(localStorage.getItem("tt.starterDraft")).toBeNull();
    expect(screen.getByTestId("meet-save-failed").textContent).toMatch(/couldn.t save Scout/);
    fireEvent.click(screen.getByText("TRY AGAIN"));
    await flush();
    expect(api.commitStarter).toHaveBeenCalledTimes(2);
    expect(onCommitted).toHaveBeenLastCalledWith(expect.objectContaining({ status: "committed" }));
    fireEvent.click(screen.getByText("CONTINUE"));
    await flush();
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ exit: "finished" }));
  });

  it("a signed-out ceremony (no uid) keeps no draft, so the outcome is 'failed', not 'offline'", async () => {
    api.commitStarter.mockResolvedValue({ status: "failed", httpStatus: null, offline: true });
    const { onCommitted } = renderMeet({ uid: null });
    await toAwaits();
    fireEvent.click(screen.getByTestId("meet-skip"));
    await flush();
    expect(onCommitted).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", skipped: true }));
    expect(localStorage.getItem("tt.starterDraft")).toBeNull();
  });

  it("SKIP sits above the reveal layer and the reveal shows the name once", async () => {
    renderMeet();
    await toAwaits();
    fireEvent.click(screen.getByText("MEET YOUR CAT"));
    fireEvent.click(screen.getByText("CONTINUE"));
    fireEvent.submit(screen.getByTestId("meet-name-input").closest("form") as HTMLFormElement);
    await flush();
    expect(screen.getByTestId("meet-skip").parentElement?.className).toContain("z-[410]");
    expect(screen.getByTestId("meet-reveal").className).toContain("pointer-events-none");
    expect(screen.getByTestId("meet-reveal-card").textContent?.match(/Nimbus/g)).toHaveLength(1);
  });

  it("renders every pixel cat at a whole-number scale", async () => {
    renderMeet();
    await toAwaits();
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-scale]"));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      const scale = Number(image.getAttribute("data-scale"));
      expect(Number.isInteger(scale)).toBe(true);
      expect(image.style.width).toBe(`${48 * scale}px`);
    }
  });
});

describe("RevealAnimation reducedMotion", () => {
  it("spins the sparkles by default and not under reduced motion", () => {
    const { container, rerender } = render(<RevealAnimation showRevealOverlay>{<span>cat</span>}</RevealAnimation>);
    expect(container.querySelectorAll(".animate-spin-reveal, .animate-spin-reveal-reverse")).toHaveLength(2);
    expect(container.firstElementChild?.className).toContain("z-reveal");
    rerender(
      <RevealAnimation showRevealOverlay reducedMotion>
        <span>cat</span>
      </RevealAnimation>,
    );
    expect(container.querySelectorAll(".animate-spin-reveal, .animate-spin-reveal-reverse")).toHaveLength(0);
    expect(container.textContent).toBe("cat");
  });

  it("with children: night backdrop, no pack-opening art, pointer events only on the children", () => {
    const { container } = render(<RevealAnimation showRevealOverlay>{<button type="button">go</button>}</RevealAnimation>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("bg-tt-night-900");
    expect(root.className).toContain("pointer-events-none");
    expect(container.innerHTML).not.toMatch(/opening-reveal/);
    expect(screen.getByRole("button", { name: "go" }).parentElement?.className).toContain("pointer-events-auto");
  });

  it("without children it keeps the pack-opening art for card packs", () => {
    const { container } = render(<RevealAnimation showRevealOverlay />);
    expect(container.innerHTML).toMatch(/opening-reveal-bg/);
  });
});
