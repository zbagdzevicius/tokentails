/**
 * @jest-environment jsdom
 */
import React, { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { GameModal, __resetGameModalEscapeForTests, type GameModalProps } from "@/components/ui/GameModal";
import {
  __resetGameRegistryForTests,
  isGameSuspended,
} from "@/lib/game/gameRegistry";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));

type HarnessProps = Partial<Omit<GameModalProps, "open" | "onOpenChange">> & {
  onOpenChange?: jest.Mock;
  initiallyOpen?: boolean;
  withInitialFocus?: boolean;
};

function Harness({
  onOpenChange,
  initiallyOpen = false,
  withInitialFocus,
  children,
  ...props
}: HarnessProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open profile
      </button>
      <GameModal
        title="Profile"
        {...props}
        initialFocus={withInitialFocus ? inputRef : props.initialFocus}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
      >
        {children ?? (
          <>
            <p>Your cat is waiting.</p>
            <label>
              Cat name
              <input ref={inputRef} />
            </label>
            <button type="button">Save</button>
          </>
        )}
      </GameModal>
    </>
  );
}

/** Radix arms its outside-pointer listener and restores focus on a zero timeout. */
const tick = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

async function openModal() {
  const opener = screen.getByRole("button", { name: "Open profile" });
  opener.focus();
  fireEvent.click(opener);
  await tick();
  return opener;
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
}

function clickScrim() {
  const scrim = screen.getByTestId("game-modal-scrim");
  // Radix listens for pointerdown outside the content.
  fireEvent.pointerDown(scrim);
  fireEvent.click(scrim);
}

beforeAll(() => {
  // jsdom lacks these; Radix and the modal only need them to exist.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!("PointerEvent" in window)) {
    // Minimal polyfill for fireEvent.pointerDown.
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

beforeEach(() => {
  __resetGameRegistryForTests();
  __resetGameModalEscapeForTests();
});

describe("GameModal", () => {
  it("labels the dialog by its title and describes it by the description", () => {
    render(<Harness initiallyOpen description="Name your cat and pick a shelter." />);
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe("Profile");
    expect(screen.getByRole("dialog", { name: "Profile" })).toBe(dialog);
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Name your cat and pick a shelter."
    );
  });

  it("omits aria-describedby when there is no description", () => {
    render(<Harness initiallyOpen />);
    expect(screen.getByRole("dialog").hasAttribute("aria-describedby")).toBe(false);
  });

  it("closes on Esc and returns focus to the opener", async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const opener = await openModal();
    expect(screen.getByRole("dialog")).toBeTruthy();
    // The dialog itself takes focus, so phones do not pop the keyboard.
    expect(document.activeElement).toBe(screen.getByRole("dialog"));

    pressEscape();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes on a scrim click", async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await openModal();
    clickScrim();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not close on a click inside the panel", async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await openModal();
    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.pointerDown(save);
    fireEvent.click(save);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes from the X, which is a named 44 px button, and returns focus", async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const opener = await openModal();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toMatch(/min-h-\[44px\]/);
    expect(close.className).toMatch(/min-w-\[44px\]/);
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("dismissible={false} hides the X and ignores Esc and scrim", async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} dismissible={false} />);
    await openModal();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    pressEscape();
    clickScrim();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("canClose={false} keeps the X visible but aria-disabled, and blocks every close path", async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} canClose={false} />);
    await openModal();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(close);
    pressEscape();
    clickScrim();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("focuses initialFocus on open", async () => {
    render(<Harness withInitialFocus />);
    await openModal();
    expect(document.activeElement).toBe(screen.getByLabelText("Cat name"));
  });

  it("allowOutside keeps the modal open for third-party portals", async () => {
    const onOpenChange = jest.fn();
    const host = document.createElement("div");
    host.id = "stellar-wallets-kit";
    document.body.appendChild(host);
    render(
      <Harness
        onOpenChange={onOpenChange}
        modal={false}
        allowOutside={(target) => !!target.closest("#stellar-wallets-kit")}
      />
    );
    await openModal();
    fireEvent.pointerDown(host);
    fireEvent.focusIn(host);
    expect(onOpenChange).not.toHaveBeenCalled();
    // A plain outside click still closes it.
    clickScrim();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    host.remove();
  });

  it("suspends the games while open unless suspendGame is false", () => {
    const { rerender } = render(<Harness initiallyOpen />);
    expect(isGameSuspended()).toBe(true);
    rerender(<Harness initiallyOpen suspendGame={false} />);
    expect(isGameSuspended()).toBe(false);
  });

  it("releases the suspension on close", async () => {
    render(<Harness />);
    expect(isGameSuspended()).toBe(false);
    await openModal();
    expect(isGameSuspended()).toBe(true);
    pressEscape();
    expect(isGameSuspended()).toBe(false);
  });

  it("keeps a crash inside the modal in the ModalBoundary fallback", () => {
    const Boom = () => {
      throw new Error("boom");
    };
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Harness initiallyOpen>
        <Boom />
      </Harness>
    );
    spy.mockRestore();
    expect(screen.getByRole("dialog", { name: "Profile" })).toBeTruthy();
    expect(screen.getByTestId("modal-fallback")).toBeTruthy();
  });

  it("renders the art surface with a visually hidden title and an outside X", () => {
    render(<Harness initiallyOpen surface="art" title="Wheel" />);
    const dialog = screen.getByRole("dialog", { name: "Wheel" });
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
    expect(title.className).toMatch(/\bsr-only\b/);
    expect(screen.getByRole("button", { name: "Close" }).getAttribute("data-placement")).toBe(
      "outside"
    );
  });

  it("uses the night scrim, the z layer and drops the blur under lowfx", () => {
    render(<Harness initiallyOpen layer="auth" />);
    const scrim = screen.getByTestId("game-modal-scrim");
    expect(scrim.className).toMatch(/bg-tt-night-950\/70/);
    expect(scrim.className).toMatch(/backdrop-blur-\[4px\]/);
    expect(scrim.className).toMatch(/lowfx:backdrop-filter-none/);
    expect(scrim.className).toMatch(/reduced-transparency:backdrop-filter-none/);
    expect(scrim.className).toMatch(/\bz-auth\b/);
  });

  it("puts the X first in the tab order, before the body content", () => {
    render(<Harness initiallyOpen />);
    const dialog = screen.getByRole("dialog", { name: "Profile" });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, input, a[href], [tabindex]:not([tabindex='-1'])")
    );
    expect(focusable[0]).toBe(screen.getByRole("button", { name: "Close" }));
    expect(focusable.indexOf(screen.getByRole("button", { name: "Save" }))).toBeGreaterThan(0);
  });

  it("keeps filters off the content box, so fixed children use the viewport", () => {
    render(<Harness initiallyOpen />);
    const dialog = screen.getByRole("dialog", { name: "Profile" });
    const frame = dialog.querySelector<HTMLElement>("[data-pixel-frame]")!;
    const layers = frame.querySelector<HTMLElement>("[data-pixel-frame-layers]")!;
    expect(layers.className).toMatch(/drop-shadow/);
    expect(layers.getAttribute("aria-hidden")).toBe("true");
    // Neither the frame nor any ancestor up to the dialog carries a filter or transform class.
    for (let el: HTMLElement | null = frame; el && el !== dialog.parentElement; el = el.parentElement) {
      expect(el.className).not.toMatch(/filter|drop-shadow|\btransform\b/);
    }
    const save = screen.getByRole("button", { name: "Save" });
    expect(layers.contains(save)).toBe(false);
  });

  describe("nested modals (ABOUT ME > Settings)", () => {
    function Nested({
      outerChange,
      innerChange,
      innerInitiallyOpen = true,
    }: {
      outerChange: jest.Mock;
      innerChange: jest.Mock;
      innerInitiallyOpen?: boolean;
    }) {
      const [outerOpen, setOuterOpen] = useState(true);
      const [innerOpen, setInnerOpen] = useState(innerInitiallyOpen);
      return (
        <GameModal
          title="ABOUT ME"
          open={outerOpen}
          onOpenChange={(next) => {
            outerChange(next);
            setOuterOpen(next);
          }}
        >
          <button type="button" onClick={() => setInnerOpen(true)}>
            Settings
          </button>
          <GameModal
            title="SETTINGS"
            layer="modal-nested"
            open={innerOpen}
            onOpenChange={(next) => {
              innerChange(next);
              setInnerOpen(next);
            }}
          >
            <p>Sound and graphics.</p>
          </GameModal>
        </GameModal>
      );
    }

    it("Esc closes only the topmost modal", async () => {
      const outerChange = jest.fn();
      const innerChange = jest.fn();
      render(<Nested outerChange={outerChange} innerChange={innerChange} innerInitiallyOpen={false} />);
      await tick();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      await tick();
      expect(screen.getByRole("dialog", { name: "SETTINGS" })).toBeTruthy();

      pressEscape();
      await tick();
      expect(innerChange).toHaveBeenLastCalledWith(false);
      expect(outerChange).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog", { name: "SETTINGS" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "ABOUT ME" })).toBeTruthy();

      // A second press closes the one underneath (it ignores Escape only for a moment after
      // Settings closed, see the next test).
      const clock = jest.spyOn(performance, "now").mockImplementation(() => Date.now() + 10_000);
      try {
        pressEscape();
        expect(outerChange).toHaveBeenLastCalledWith(false);
      } finally {
        clock.mockRestore();
      }
    });

    it("a held or double-fired Esc closes Settings, not ABOUT ME as well", async () => {
      // Phones (~1 in 5): Radix hands the key listener to the layer underneath a frame after the
      // top one closes, so a second keydown right behind the first (a repeat, or a keyboard that
      // fires Escape twice) used to close ABOUT ME too.
      let now = 1_000;
      const clock = jest.spyOn(performance, "now").mockImplementation(() => now);
      try {
        const outerChange = jest.fn();
        const innerChange = jest.fn();
        render(<Nested outerChange={outerChange} innerChange={innerChange} innerInitiallyOpen={false} />);
        await tick();
        fireEvent.click(screen.getByRole("button", { name: "Settings" }));
        await tick();

        pressEscape();
        await tick();
        expect(innerChange).toHaveBeenLastCalledWith(false);
        expect(screen.queryByRole("dialog", { name: "SETTINGS" })).toBeNull();

        // The same press, a moment later: a repeat, then a second keydown 40 ms on.
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape", repeat: true });
        now += 40;
        pressEscape();
        await tick();
        expect(outerChange).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog", { name: "ABOUT ME" })).toBeTruthy();

        // A real second press closes it.
        now += 400;
        pressEscape();
        expect(outerChange).toHaveBeenLastCalledWith(false);
      } finally {
        clock.mockRestore();
      }
    });

    it("Esc goes to the nested layer even before Radix has re-ranked its layers", async () => {
      // Both open in one commit (a deep link into Settings): Radix may still treat ABOUT ME as the
      // highest layer for a frame; the GameModal stack knows Settings is on top.
      const outerChange = jest.fn();
      const innerChange = jest.fn();
      render(<Nested outerChange={outerChange} innerChange={innerChange} />);
      await tick();
      pressEscape();
      await tick();
      expect(outerChange).not.toHaveBeenCalled();
      expect(innerChange).toHaveBeenLastCalledWith(false);
      expect(screen.getByRole("dialog", { name: "ABOUT ME" })).toBeTruthy();
    });
  });

  it("has no axe violations", async () => {
    render(<Harness initiallyOpen description="Name your cat." />);
    await act(async () => {});
    const results = await axe.run(document.body, {
      // jsdom cannot compute colours or layout; contrast runs in the Playwright check.
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
