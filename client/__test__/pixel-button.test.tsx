/**
 * @jest-environment jsdom
 */
import React from "react";
import {
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

jest.mock("@/constants/utils", () => ({
  cdnFile: (p: string) => `/${p}`,
}));

import { PixelButton } from "@/components/shared/PixelButton";

const play = jest.fn(() => Promise.resolve());
beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: play,
  });
});

// jsdom has no PointerEvent, so pointerType is set on the event by hand.
// React derives onPointerEnter from the native pointerover event.
const pointerEnter = (el: Element, pointerType: string) => {
  const event = createEvent.pointerOver(el);
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(el, event);
};

// Every class token rendered anywhere inside the button.
const classTokens = (root: Element) =>
  [root, ...Array.from(root.querySelectorAll("*"))].flatMap((el) =>
    (el.getAttribute("class") || "").split(/\s+/).filter(Boolean)
  );

describe("PixelButton", () => {
  it("renders a type=button by default so it never submits a form", () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const onClick = jest.fn();
    render(
      <form onSubmit={onSubmit}>
        <PixelButton text="Forgot" onClick={onClick} />
      </form>
    );
    const button = screen.getByRole("button", { name: "Forgot" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("passes type=submit through", () => {
    render(<PixelButton text="Go" type="submit" />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  it("calls onClick without arguments", () => {
    const onClick = jest.fn();
    render(<PixelButton text="Next" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledWith();
  });

  it.each([
    ["sm", "scale-[0.675]"],
    ["md", "hover:scale-105"],
    ["lg", "md:scale-[2]"],
  ] as const)("size=%s applies %s", (size, expected) => {
    render(<PixelButton text="Size" size={size} />);
    const tokens = classTokens(screen.getByRole("button"));
    expect(tokens).toContain(expected);
  });

  it("defaults to md", () => {
    render(<PixelButton text="Default" />);
    const tokens = classTokens(screen.getByRole("button"));
    expect(tokens).toContain("hover:scale-105");
    expect(tokens).not.toContain("scale-[0.675]");
    expect(tokens).not.toContain("glow-box");
  });

  it.each([
    [{}],
    [{ size: "sm" as const, fullWidth: true, active: true }],
    [{ size: "lg" as const, disabled: true, busy: true }],
    [{ as: "span" as const, icon: "key" as const }],
  ])("never renders false/undefined/null class tokens (%o)", (props) => {
    const { container } = render(<PixelButton text="Tokens" {...props} />);
    const tokens = classTokens(container.firstElementChild!);
    for (const bad of ["false", "undefined", "null", "'", "true"]) {
      expect(tokens).not.toContain(bad);
    }
    expect(tokens.some((t) => t.includes("'"))).toBe(false);
  });

  it("fullWidth sets w-full on the root and the label row", () => {
    render(<PixelButton text="Wide" fullWidth />);
    const button = screen.getByRole("button");
    expect(button.className.split(" ")).toContain("w-full");
    expect(button.getAttribute("style")).toBeNull();
    expect(
      button.querySelectorAll(".w-full").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("busy shows a spinner, sets aria-busy and ignores clicks", () => {
    const onClick = jest.fn();
    render(<PixelButton text="Saving" busy onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector('svg[data-icon="loader"]')).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("busy type=submit does not submit its form again", () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PixelButton text="Save" type="submit" busy />
      </form>
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("idle type=submit still submits", () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PixelButton text="Save" type="submit" />
      </form>
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("the busy spinner stops under prefers-reduced-motion", () => {
    render(<PixelButton text="Saving" busy />);
    const spinner = screen
      .getByRole("button")
      .querySelector('svg[data-icon="loader"]') as SVGElement;
    const tokens = (spinner.getAttribute("class") || "").split(/\s+/);
    expect(tokens).toContain("animate-spin");
    expect(tokens).toContain("motion-reduce:animate-none");
  });

  it("disabled disables the button and ignores clicks", () => {
    const onClick = jest.fn();
    render(<PixelButton text="Off" disabled onClick={onClick} />);
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("cursor-not-allowed");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders an icon before the text, hidden from assistive tech", () => {
    render(<PixelButton text="Password" icon="key" />);
    const button = screen.getByRole("button", { name: "Password" });
    const icon = button.querySelector('svg[data-icon="key"]');
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("aria-hidden")).toBe("true");
  });

  it('as="span" renders no button, so it can sit inside a link', () => {
    const onClick = jest.fn();
    render(
      <a href="https://tokentails.com/game">
        <PixelButton as="span" text="Meet your cat" onClick={onClick} />
      </a>
    );
    expect(screen.queryByRole("button")).toBeNull();
    const link = screen.getByRole("link", { name: "Meet your cat" });
    expect(link.firstElementChild!.tagName).toBe("SPAN");
    expect(link.querySelector("div, p, button")).toBeNull();
    fireEvent.click(link.firstElementChild!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('as="span" cannot be made inert, because the link owns keyboard activation', () => {
    render(
      <a href="https://tokentails.com/game">
        {/* @ts-expect-error disabled is not accepted on as="span" */}
        <PixelButton as="span" text="Locked" disabled />
        {/* @ts-expect-error busy is not accepted on as="span" */}
        <PixelButton as="span" text="Saving" busy />
      </a>
    );
    const link = screen.getByRole("link");
    for (const span of Array.from(link.children)) {
      expect(span.hasAttribute("aria-disabled")).toBe(false);
      expect(span.hasAttribute("aria-busy")).toBe(false);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      span.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("plays the hover sound for a mouse pointer only, not on touch taps", () => {
    render(<PixelButton text="Hover" />);
    const button = screen.getByRole("button");
    play.mockClear();
    pointerEnter(button, "touch");
    pointerEnter(button, "pen");
    expect(play).not.toHaveBeenCalled();
    pointerEnter(button, "mouse");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("plays no hover sound while disabled", () => {
    render(<PixelButton text="Off" disabled />);
    play.mockClear();
    pointerEnter(screen.getByRole("button"), "mouse");
    expect(play).not.toHaveBeenCalled();
  });

  it("renders subtext, including 0", () => {
    render(<PixelButton text="Lives" subtext={0} />);
    expect(screen.getByRole("button").textContent).toBe("Lives0");
  });

  it("plays the click sound from one shared audio element", () => {
    play.mockClear();
    render(
      <>
        <PixelButton text="A" />
        <PixelButton text="B" />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(play).toHaveBeenCalledTimes(2);
    const [first, second] = play.mock.contexts as HTMLAudioElement[];
    expect(first).toBe(second);
  });

  it("rewinds the shared sound so quick successive clicks are each heard", () => {
    render(
      <>
        <PixelButton text="One" />
        <PixelButton text="Two" />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "One" }));
    const audio = play.mock.contexts[play.mock.contexts.length - 1] as HTMLAudioElement;
    audio.currentTime = 0.5;
    fireEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(audio.currentTime).toBe(0);
  });
});
