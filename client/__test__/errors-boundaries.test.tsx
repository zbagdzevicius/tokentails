/**
 * @jest-environment jsdom
 *
 * F9 boundaries: every fallback renders, reports, and resets.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";

const mockReport = jest.fn<boolean, unknown[]>(() => true);
jest.mock("@/analytics", () => ({
  reportAppError: (...args: unknown[]) => mockReport(...args),
}));

let mockIsApp = false;
jest.mock("@/models/app", () => ({
  get isApp() {
    return mockIsApp;
  },
}));

import { FALLBACK_COPY } from "@/components/errors/copy";
import {
  e2eCrashHooks,
  isCrashForced,
  resetCrashProbes,
} from "@/components/errors/crash-probe";
import { boundaryCode } from "@/components/errors/ErrorBoundary";
import { SCENE_STALL_EVENT } from "@/components/errors/events";
import { ModalBoundary } from "@/components/errors/ModalBoundary";
import { PageBoundary } from "@/components/errors/PageBoundary";
import { reloadApp } from "@/components/errors/reload";
import { RootBoundary, Z_SYSTEM } from "@/components/errors/RootBoundary";
import { SceneBoundary } from "@/components/errors/SceneBoundary";
import { SectionBoundary } from "@/components/errors/SectionBoundary";

/** Throws while `crash.on` is true; counts mounts. */
const crash = { on: true, mounts: 0 };
const Bomb = ({ label = "content" }: { label?: string }) => {
  useEffect(() => {
    crash.mounts += 1;
  }, []);
  if (crash.on) throw new Error("kaboom for jane@example.com");
  return <p>{label}</p>;
};

let consoleError: jest.SpyInstance;
beforeEach(() => {
  crash.on = true;
  crash.mounts = 0;
  mockIsApp = false;
  // React logs caught errors; keep the output readable.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("boundaryCode", () => {
  it("builds a telemetry-safe code", () => {
    expect(boundaryCode("scene", "MATCH_3")).toBe("scene_crash:match_3");
    expect(boundaryCode("page", "/cats/[id]")).toBe("page_crash:cats_id");
    expect(boundaryCode("modal", "")).toBe("modal_crash:unnamed");
  });
});

describe("RootBoundary", () => {
  it("shows the system-layer fallback and reports", () => {
    render(
      <RootBoundary>
        <Bomb />
      </RootBoundary>,
    );
    const fallback = screen.getByTestId("root-fallback");
    expect(fallback.style.zIndex).toBe(String(Z_SYSTEM));
    expect(fallback.style.background).toContain("#0b0820");
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      `${FALLBACK_COPY.title} ${FALLBACK_COPY.reassurance}`,
    );
    expect(mockReport).toHaveBeenCalledWith(
      "root_crash:app",
      expect.any(Error),
      expect.objectContaining({ source: "boundary", level: "root", boundary: "app" }),
    );
  });

  it("is modal and keeps Tab inside the card", () => {
    render(
      <RootBoundary>
        <Bomb />
      </RootBoundary>,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const buttons = Array.from(dialog.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(1);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("focuses RELOAD and TRY AGAIN recovers", () => {
    render(
      <RootBoundary>
        <Bomb label="app is back" />
      </RootBoundary>,
    );
    expect(document.activeElement).toBe(screen.getByTestId("root-fallback-reload"));
    crash.on = false;
    fireEvent.click(screen.getByTestId("root-fallback-retry"));
    expect(screen.getByText("app is back")).toBeInTheDocument();
    expect(screen.queryByTestId("root-fallback")).toBeNull();
  });
});

describe("reloadApp", () => {
  it("reloads the page on the web", () => {
    const location = { assign: jest.fn(), reload: jest.fn() };
    reloadApp(location, false);
    expect(location.reload).toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("goes to / on app builds so AppRouteRestore takes over", () => {
    const location = { assign: jest.fn(), reload: jest.fn() };
    reloadApp(location, true);
    expect(location.assign).toHaveBeenCalledWith("/");
    expect(location.reload).not.toHaveBeenCalled();
  });

  it("defaults to the build flag", () => {
    mockIsApp = true;
    // jsdom's window.location cannot be spied on; the flag default is read
    // at call time through the mocked module.
    const location = { assign: jest.fn(), reload: jest.fn() };
    reloadApp(location);
    expect(location.assign).toHaveBeenCalledWith("/");
  });
});

describe("PageBoundary", () => {
  it("shows the page fallback and TRY AGAIN re-renders", () => {
    render(
      <PageBoundary route="/game">
        <Bomb label="page ok" />
      </PageBoundary>,
    );
    expect(screen.getByTestId("page-fallback")).toBeInTheDocument();
    expect(mockReport).toHaveBeenCalledWith(
      "page_crash:game",
      expect.any(Error),
      expect.objectContaining({ level: "page" }),
    );
    crash.on = false;
    fireEvent.click(screen.getByTestId("page-fallback-retry"));
    expect(screen.getByText("page ok")).toBeInTheDocument();
  });

  it("a path change clears the crash", () => {
    const { rerender } = render(
      <PageBoundary route="/cats/[id]" path="/cats/a">
        <Bomb label="cat b" />
      </PageBoundary>,
    );
    expect(screen.getByTestId("page-fallback")).toBeInTheDocument();
    crash.on = false;
    rerender(
      <PageBoundary route="/cats/[id]" path="/cats/b">
        <Bomb label="cat b" />
      </PageBoundary>,
    );
    expect(screen.getByText("cat b")).toBeInTheDocument();
  });
});

describe("SceneBoundary", () => {
  it("TRY AGAIN remounts the scene", () => {
    const onBack = jest.fn();
    render(
      <SceneBoundary name="MATCH_3" onBackToMenu={onBack}>
        <Bomb label="scene running" />
      </SceneBoundary>,
    );
    const fallback = screen.getByTestId("scene-fallback");
    expect(fallback).toHaveTextContent(FALLBACK_COPY.scene);
    // Lobby UI above z 90 stays usable, so the scene fallback is not modal.
    expect(screen.getByRole("alertdialog")).not.toHaveAttribute("aria-modal");
    expect(mockReport).toHaveBeenCalledWith(
      "scene_crash:match_3",
      expect.any(Error),
      expect.objectContaining({ level: "scene", boundary: "MATCH_3" }),
    );
    crash.on = false;
    fireEvent.click(screen.getByTestId("scene-fallback-retry"));
    expect(screen.getByText("scene running")).toBeInTheDocument();
    expect(crash.mounts).toBe(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("BACK TO MENU leaves the mode", () => {
    const Harness = () => {
      const [mode, setMode] = useState<string | null>("SHELTER");
      return mode ? (
        <SceneBoundary name={mode} onBackToMenu={() => setMode(null)}>
          <Bomb />
        </SceneBoundary>
      ) : (
        <p>lobby</p>
      );
    };
    render(<Harness />);
    fireEvent.click(screen.getByTestId("scene-fallback-menu"));
    expect(screen.getByText("lobby")).toBeInTheDocument();
  });

  it("switching mode clears the crash", () => {
    const { rerender } = render(
      <SceneBoundary name="HOME" onBackToMenu={jest.fn()}>
        <Bomb label="home" />
      </SceneBoundary>,
    );
    expect(screen.getByTestId("scene-fallback")).toBeInTheDocument();
    crash.on = false;
    rerender(
      <SceneBoundary name="MATCH_3" onBackToMenu={jest.fn()}>
        <Bomb label="match" />
      </SceneBoundary>,
    );
    expect(screen.getByText("match")).toBeInTheDocument();
  });

  it("a stall from the crash guard shows the fallback without a second report", () => {
    crash.on = false;
    render(
      <SceneBoundary name="HOME" onBackToMenu={jest.fn()}>
        <Bomb label="home" />
      </SceneBoundary>,
    );
    expect(screen.getByText("home")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent(SCENE_STALL_EVENT));
    });
    expect(screen.getByTestId("scene-fallback")).toBeInTheDocument();
    expect(mockReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("scene-fallback-retry"));
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});

describe("ModalBoundary", () => {
  it("renders the fallback inside the modal with CLOSE", () => {
    const onClose = jest.fn();
    render(
      <div data-testid="modal-frame">
        <ModalBoundary name="profile" onClose={onClose}>
          <Bomb />
        </ModalBoundary>
      </div>,
    );
    const frame = screen.getByTestId("modal-frame");
    const fallback = screen.getByTestId("modal-fallback");
    expect(frame).toContainElement(fallback);
    expect(fallback).toHaveTextContent("Something went wrong. Your cats are safe.");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(mockReport).toHaveBeenCalledWith(
      "modal_crash:profile",
      expect.any(Error),
      expect.objectContaining({ level: "modal" }),
    );
    fireEvent.click(screen.getByTestId("modal-fallback-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("TRY AGAIN remounts the content; no CLOSE without onClose", () => {
    render(
      <ModalBoundary name="wheel">
        <Bomb label="wheel ok" />
      </ModalBoundary>,
    );
    expect(screen.queryByTestId("modal-fallback-close")).toBeNull();
    crash.on = false;
    fireEvent.click(screen.getByTestId("modal-fallback-retry"));
    expect(screen.getByText("wheel ok")).toBeInTheDocument();
  });
});

describe("SectionBoundary", () => {
  it("drops a broken section silently and keeps its siblings", () => {
    render(
      <div>
        <SectionBoundary name="proof">
          <Bomb />
        </SectionBoundary>
        <p>next section</p>
      </div>,
    );
    expect(screen.getByText("next section")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mockReport).toHaveBeenCalledWith(
      "section_crash:proof",
      expect.any(Error),
      expect.objectContaining({ level: "section" }),
    );
  });

  it("can render a custom fallback", () => {
    render(
      <SectionBoundary name="team" fallback={<p>team unavailable</p>}>
        <Bomb />
      </SectionBoundary>,
    );
    expect(screen.getByText("team unavailable")).toBeInTheDocument();
  });

  it("renders healthy children untouched", () => {
    crash.on = false;
    render(
      <SectionBoundary name="hero">
        <Bomb label="hero" />
      </SectionBoundary>,
    );
    expect(screen.getByText("hero")).toBeInTheDocument();
    expect(mockReport).not.toHaveBeenCalled();
  });
});

describe("forced-crash hooks", () => {
  const original = process.env.NEXT_PUBLIC_E2E;
  afterEach(() => {
    process.env.NEXT_PUBLIC_E2E = original;
    resetCrashProbes();
    window.history.replaceState(null, "", "/");
  });

  it("do nothing without NEXT_PUBLIC_E2E=1", () => {
    delete process.env.NEXT_PUBLIC_E2E;
    window.history.replaceState(null, "", "/game?__crash=scene");
    expect(e2eCrashHooks()).toBe(false);
    expect(isCrashForced("scene")).toBe(false);
    crash.on = false;
    render(
      <SceneBoundary name="HOME" onBackToMenu={jest.fn()}>
        <Bomb label="scene ok" />
      </SceneBoundary>,
    );
    expect(screen.getByText("scene ok")).toBeInTheDocument();
  });

  it("crash the target until its boundary recovers when NEXT_PUBLIC_E2E=1", () => {
    process.env.NEXT_PUBLIC_E2E = "1";
    window.history.replaceState(null, "", "/game?__crash=scene");
    expect(isCrashForced("scene")).toBe(true);
    expect(isCrashForced("modal")).toBe(false);
    crash.on = false;
    render(
      <SceneBoundary name="HOME" onBackToMenu={jest.fn()}>
        <Bomb label="scene ok" />
      </SceneBoundary>,
    );
    expect(screen.getByTestId("scene-fallback")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("scene-fallback-retry"));
    expect(screen.getByText("scene ok")).toBeInTheDocument();
    expect(isCrashForced("scene")).toBe(false);
  });
});


describe("fallback accessibility (axe)", () => {
  const runAxe = async (node: Element) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const axe = require("axe-core");
    const result = await axe.run(node, {
      // jsdom has no layout or canvas: contrast is checked in Playwright.
      rules: { "color-contrast": { enabled: false } },
    });
    return result.violations.map((v: { id: string }) => v.id);
  };

  it.each([
    ["root", () => <RootBoundary><Bomb /></RootBoundary>],
    ["page", () => <PageBoundary route="/game"><Bomb /></PageBoundary>],
    ["scene", () => <SceneBoundary name="HOME" onBackToMenu={jest.fn()}><Bomb /></SceneBoundary>],
    ["modal", () => <ModalBoundary name="profile" onClose={jest.fn()}><Bomb /></ModalBoundary>],
  ])("%s fallback has no violations", async (_name, ui) => {
    const { container } = render(<main>{ui()}</main>);
    expect(await runAxe(container)).toEqual([]);
  });
});
