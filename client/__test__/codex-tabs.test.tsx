/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/api/user-api", () => ({ USER_API: { airdropProgression: jest.fn(async () => null), saveCodex: jest.fn() } }));
jest.mock("@/context/ProfileContext", () => ({ useProfile: () => ({ profile: { _id: "u1", codex: [] }, setProfileUpdate: jest.fn() }) }));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
jest.mock("@/components/codex/ImmortalizePetFlow", () => ({ ImmortalizePetFlow: () => <p>pet art</p> }));
jest.mock("@/components/codex/impact/ImpactTab", () => ({ ImpactTab: () => <div data-testid="impact-tab">impact</div> }));
jest.mock("@/components/codex/TailsExplainer", () => ({ TailsExplainer: () => null }));
jest.mock("@/hooks/useAccountAction", () => ({
  useAccountAction: () => ({ runWithAccount: jest.fn() }),
  useLatest: (v: unknown) => ({ current: v }),
}));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn() }));
const firstCodexEntry = jest.fn();
jest.mock("@/context/auth/saveNudge", () => ({ firstCodexEntry: () => firstCodexEntry() }));

const fetchTokenStatus = jest.fn();
jest.mock("@/api/token-status-api", () => {
  const actual = jest.requireActual("@/api/token-status-api");
  return { ...actual, fetchTokenStatus: (o: unknown) => fetchTokenStatus(o) };
});

import { Codex } from "@/components/codex/Codex";
import { PROGRESS_TAB_EVENT, requestProgressTab, takeProgressTab } from "@/components/impact/progressTab";

const renderCodex = (props: React.ComponentProps<typeof Codex> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Codex {...props} />
    </QueryClientProvider>
  );
};

const pressed = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.closest("[aria-label='Progress sections']"))
    .map((b) => b.textContent);

beforeEach(() => {
  takeProgressTab();
  firstCodexEntry.mockClear();
  fetchTokenStatus.mockReset();
  fetchTokenStatus.mockResolvedValue({ mode: "POINTS", tgeAt: null });
});

describe("Codex PROGRESS tabs", () => {
  it("opens on IMPACT by default and calls the first-codex-entry nudge", async () => {
    renderCodex();
    expect(screen.getByTestId("impact-tab")).toBeTruthy();
    expect(pressed()).toEqual(["IMPACT", "REWARDS", "MISSIONS", "TIERS", "PET ART", "BADGES"]);
    expect(firstCodexEntry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchTokenStatus).toHaveBeenCalled());
  });

  it("honours the tab argument and a pending lobby request", () => {
    const { unmount } = renderCodex({ tab: "badges" });
    expect(screen.queryByTestId("impact-tab")).toBeNull();
    expect(screen.getByText("MY BADGE VAULT")).toBeTruthy();
    unmount();
    requestProgressTab("tiers");
    requestProgressTab("impact");
    renderCodex();
    expect(screen.getByTestId("impact-tab")).toBeTruthy();
  });

  it("follows the tt:progress-tab event while open", () => {
    renderCodex({ tab: "badges" });
    act(() => {
      window.dispatchEvent(new CustomEvent(PROGRESS_TAB_EVENT, { detail: { tab: "impact" } }));
    });
    expect(screen.getByTestId("impact-tab")).toBeTruthy();
    fireEvent.click(screen.getByText("BADGES"));
    expect(screen.queryByTestId("impact-tab")).toBeNull();
  });

  it("shows VAULT only in TOKEN mode; a failed read (POINTS) hides it", async () => {
    fetchTokenStatus.mockResolvedValue({ mode: "POINTS", tgeAt: null });
    const { unmount } = renderCodex();
    await waitFor(() => expect(fetchTokenStatus).toHaveBeenCalled());
    expect(screen.queryByText("VAULT")).toBeNull();
    unmount();
    fetchTokenStatus.mockResolvedValue({ mode: "TOKEN", tgeAt: null });
    renderCodex();
    expect(await screen.findByText("VAULT")).toBeTruthy();
    fireEvent.click(screen.getByText("VAULT"));
    expect(screen.getByTestId("vault-tab")).toBeTruthy();
  });

  it("marks the open tab with aria-pressed", () => {
    renderCodex({ tab: "badges" });
    const tab = (label: string) => screen.getByRole("button", { name: label });
    expect(tab("BADGES").getAttribute("aria-pressed")).toBe("true");
    expect(tab("IMPACT").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tab("MISSIONS"));
    expect(tab("MISSIONS").getAttribute("aria-pressed")).toBe("true");
    expect(tab("BADGES").getAttribute("aria-pressed")).toBe("false");
  });

  it("a link to VAULT waits for token-status instead of flashing IMPACT", async () => {
    let answer: (v: unknown) => void = () => undefined;
    fetchTokenStatus.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderCodex({ tab: "vault" });
    expect(screen.getByTestId("vault-loading")).toBeTruthy();
    expect(screen.queryByTestId("impact-tab")).toBeNull();
    await act(async () => answer({ mode: "TOKEN", tgeAt: null }));
    expect(await screen.findByTestId("vault-tab")).toBeTruthy();
    expect(screen.queryByTestId("vault-loading")).toBeNull();
  });

  it("a link to VAULT in POINTS mode lands on IMPACT once token-status answers", async () => {
    renderCodex({ tab: "vault" });
    expect(await screen.findByTestId("impact-tab")).toBeTruthy();
    expect(screen.queryByTestId("vault-loading")).toBeNull();
  });

  it("has no TGE countdown and no airdrop words", () => {
    const { container } = renderCodex();
    expect(container.textContent).not.toMatch(/TGE|AIRDROP|allocation|\$TAILS|NEXT MONTH COUNTDOWN/i);
  });
});

describe("Codex in an app build", () => {
  it("never requests token-status and drops PET ART", () => {
    jest.isolateModules(() => {
      const prev = process.env.NEXT_PUBLIC_IS_APP;
      process.env.NEXT_PUBLIC_IS_APP = "1";
      try {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const R = require("react");
        const TL = require("@testing-library/react/pure");
        const RQ = require("@tanstack/react-query");
        const { Codex: AppCodex } = require("@/components/codex/Codex");
        /* eslint-enable @typescript-eslint/no-require-imports */
        const client = new RQ.QueryClient();
        const view = TL.render(
          R.createElement(RQ.QueryClientProvider, { client }, R.createElement(AppCodex))
        );
        expect(view.queryByText("PET ART")).toBeNull();
        expect(view.getByText("IMPACT")).toBeTruthy();
        expect(fetchTokenStatus).not.toHaveBeenCalled();
        TL.cleanup();
      } finally {
        process.env.NEXT_PUBLIC_IS_APP = prev;
      }
    });
  });
});
