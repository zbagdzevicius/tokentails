/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { GameModal } from "@/components/ui/GameModal";
import {
  ActionRow,
  ConfirmAction,
  DangerZone,
  EmptyState,
  KeyValueList,
  KeyValueRow,
  LoadingState,
  ModalButton,
  ModalSection,
  ModalTabPanel,
  ModalTabs,
  StatGrid,
  StatTile,
  StatusPill,
} from "@/components/ui/modal";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn() }));

const TABS = [
  { id: "impact", label: "Impact", icon: "heart" as const, testId: "tab-impact" },
  { id: "rewards", label: "Rewards", badge: 2 },
  { id: "tiers", label: "Tiers" },
];

function Tabs() {
  const [tab, setTab] = useState("impact");
  return (
    <>
      <ModalTabs label="Sections" idBase="t" tabs={TABS} value={tab} onChange={setTab} />
      <ModalTabPanel idBase="t" id={tab}>
        Panel {tab}
      </ModalTabPanel>
    </>
  );
}

describe("modal primitives", () => {
  it("ModalTabs: one tab stop, arrows/Home/End move, panel is labelled by its tab", () => {
    render(<Tabs />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByTestId("tab-impact").getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Rewards/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Rewards/ }));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel tiers");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel impact");
  });

  it("ConfirmAction: asks first, focuses the safe choice, returns focus on cancel", async () => {
    const onConfirm = jest.fn();
    render(
      <DangerZone>
        <ConfirmAction
          label="Delete account"
          message="This deletes your cats for good."
          confirmLabel="Delete forever"
          cancelLabel="Keep my account"
          onConfirm={onConfirm}
          testId="del"
          confirmTestId="del-yes"
          cancelTestId="del-no"
        />
      </DangerZone>
    );
    expect(screen.getByRole("region", { name: "Danger zone" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("del"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("This deletes your cats for good.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId("del-no"));

    fireEvent.click(screen.getByTestId("del-no"));
    expect(document.activeElement).toBe(screen.getByTestId("del"));

    fireEvent.click(screen.getByTestId("del"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("del-yes"));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ModalButton: busy ignores clicks, variants are data attributes", () => {
    const onClick = jest.fn();
    const { rerender } = render(
      <ModalButton variant="primary" onClick={onClick}>
        Play
      </ModalButton>
    );
    const button = screen.getByRole("button", { name: "Play" });
    expect(button.getAttribute("data-variant")).toBe("primary");
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <ModalButton variant="primary" busy onClick={onClick}>
        Play
      </ModalButton>
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play" }).getAttribute("aria-busy")).toBe("true");
  });

  it("StatTile: progress is a labelled progressbar clamped to max", () => {
    render(<StatTile label="Catnip" value="3,000" progress={{ value: 3000, max: 2578 }} />);
    const bar = screen.getByRole("progressbar", { name: "Catnip" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2578");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("EmptyState error is an alert; LoadingState is a busy status", () => {
    render(
      <>
        <EmptyState tone="error" title="Could not load" />
        <LoadingState label="Loading goals" />
      </>
    );
    expect(screen.getByRole("alert").textContent).toContain("Could not load");
    expect(screen.getByRole("status", { name: "" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading goals")).toBeTruthy();
  });

  it("GameModal renders the header icon tile and the night sky; the kit has no axe violations", async () => {
    render(
      <GameModal open onOpenChange={() => {}} title="About me" icon="paw" description="Your cat and stats.">
        <ModalSection title="Stats" icon="chart" helper="What you earned." aside={<StatusPill tone="mint">Synced</StatusPill>}>
          <StatGrid>
            <StatTile label="Tails" value="120" icon="coins" helper="Rescue points" />
          </StatGrid>
          <KeyValueList>
            <KeyValueRow label="X" value="@cat" action={<ModalButton size="sm">Edit</ModalButton>} />
            <KeyValueRow label="Discord" emptyValue="Not connected" />
          </KeyValueList>
          <ActionRow>
            <ModalButton variant="primary">Open my impact</ModalButton>
            <ModalButton variant="ghost">Not now</ModalButton>
          </ActionRow>
        </ModalSection>
        <Tabs />
      </GameModal>
    );
    await act(async () => {});
    expect(screen.getByTestId("game-modal-icon").querySelector('[data-icon="paw"]')).toBeTruthy();
    expect(document.querySelector('[data-pixel-frame="night"]')?.getAttribute("data-ambient")).toBe("true");
    expect(screen.getByRole("region", { name: "Stats" })).toBeTruthy();
    expect(screen.getByText("Not connected")).toBeTruthy();
    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
