/**
 * @jest-environment jsdom
 */
/**
 * "Meet <name>": the Token Tails $5 named-cat checkout opened from Pawlegends. The age band is asked once per
 * device (Under 16 stops with the guardian line and no checkout); the checkout is `<Payment entityType=CAT>` with
 * `purchaseContext {context: 'pawlegends', ageBand, deviceId}`; a success adds the cat to the profile and tells the
 * host. No pack link, no pack copy, nothing random.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
const mockPaymentProps = jest.fn();
jest.mock("@/components/web3/Payment", () => ({
  Payment: (props: { onSuccess: (r: unknown) => void }) => {
    mockPaymentProps(props);
    return (
      <button
        type="button"
        onClick={() => props.onSuccess({ success: true, message: "ok", cat: { _id: "new1", name: "Pumpkin", type: "GRASS", tier: "COMMON" } })}
      >
        stub-pay
      </button>
    );
  },
}));
jest.mock("next/dynamic", () => (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
  const R = jest.requireActual("react") as typeof React;
  return function Dynamic(props: Record<string, unknown>) {
    const [C, setC] = R.useState<React.ComponentType<Record<string, unknown>> | null>(null);
    R.useEffect(() => {
      void loader().then((c) => setC(() => c));
    }, []);
    return C ? R.createElement(C, props) : null;
  };
});
jest.mock("@/components/tailsCard/TailsCardMini", () => ({
  TailsCardMini: ({ cat }: { cat: { name: string; tier: string } }) => <div data-testid="mini-card">{`${cat.name} ${cat.tier}`}</div>,
}));
jest.mock("@/components/ui/GameModal", () => ({
  GameModal: ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
    <div role="dialog" aria-label={String(title)}>
      {children}
    </div>
  ),
}));
jest.mock("@/components/ui/modal", () => ({
  LoadingState: () => null,
  StatusPill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ModalButton: (props: Record<string, unknown>) => {
    const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !["children", "busy", "icon", "variant", "size"].includes(k)));
    return (
      <button type="button" {...rest}>
        {props.children as React.ReactNode}
      </button>
    );
  },
}));
const mockSetProfileUpdate = jest.fn();
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: { cats: [{ _id: "old" }] }, setProfileUpdate: mockSetProfileUpdate }),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
jest.mock("@/hooks/useStorefront", () => ({ invalidateStorefront: jest.fn(async () => undefined) }));

import { PawlegendsCatSheet } from "@/components/pawlegends/PawlegendsCatSheet";
import { PAWLEGENDS_AGE_KEY, UNDER_16_MESSAGE } from "@/components/pawlegends/checkout";
import { EntityType } from "@/models/save";
import type { ICat } from "@/models/cats";

const CAT = { _id: "65a1b2c3d4e5f6a7b8c9d0e1", name: "Pumpkin", type: "GRASS", tier: "LEGENDARY", catImg: "x" } as unknown as ICat;
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

beforeEach(() => window.localStorage.clear());

describe("PawlegendsCatSheet", () => {
  it("shows the Common card and the squad perks; never mentions packs", async () => {
    render(<PawlegendsCatSheet cat={CAT} onClose={jest.fn()} />);
    await settle();
    expect(screen.getByRole("dialog", { name: "Meet Pumpkin" })).toBeTruthy();
    // The copy the checkout grants is the Common tier, whatever the catalog cat's tier.
    expect(screen.getByTestId("mini-card").textContent).toBe("Pumpkin COMMON");
    expect(screen.getByTestId("pawlegends-cat-perks").textContent).toMatch(/squad/);
    expect(document.body.textContent).not.toMatch(/pack|legendary|rare|epic|random|odds/i);
    expect(document.querySelector("a[href*='pack'], a[href*='/cats/']")).toBeNull();
  });

  it("asks the age band first; Under 16 stops with the guardian line and locks the answer", async () => {
    render(<PawlegendsCatSheet cat={CAT} onClose={jest.fn()} />);
    await settle();
    expect(screen.queryByText("stub-pay")).toBeNull();
    fireEvent.click(screen.getByLabelText("Under 16"));
    await settle();
    expect(screen.getByTestId("pawlegends-under16").textContent).toBe(UNDER_16_MESSAGE);
    expect(screen.queryByText("stub-pay")).toBeNull();
    expect((screen.getByLabelText("18 or older") as HTMLInputElement).disabled).toBe(true);
    expect(window.localStorage.getItem(PAWLEGENDS_AGE_KEY)).toBe("under16");
  });

  it("18+ opens the Token Tails cat checkout with the pawlegends context; a success adds the cat and tells the host", async () => {
    const onBought = jest.fn();
    const onClose = jest.fn();
    render(<PawlegendsCatSheet cat={CAT} onBought={onBought} onClose={onClose} />);
    await settle();
    fireEvent.click(screen.getByLabelText("18 or older"));
    await settle();
    const props = mockPaymentProps.mock.calls[mockPaymentProps.mock.calls.length - 1][0];
    expect(props).toMatchObject({
      price: 5,
      entityType: EntityType.CAT,
      id: CAT._id,
      purchaseContext: { context: "pawlegends", ageBand: "18+", deviceId: expect.stringMatching(/^d[0-9a-f]{32}$/) },
    });
    fireEvent.click(screen.getByText("stub-pay"));
    await settle();
    expect(onBought).toHaveBeenCalledWith(expect.objectContaining({ _id: "new1" }));
    expect(mockSetProfileUpdate).toHaveBeenCalledWith({ cats: [{ _id: "old" }, expect.objectContaining({ _id: "new1" })] });
    expect(screen.getByTestId("pawlegends-cat-bought")).toBeTruthy();
    fireEvent.click(screen.getByText("PLAY"));
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ _id: "new1" }));
  });

  it("a stored band skips the question", async () => {
    window.localStorage.setItem(PAWLEGENDS_AGE_KEY, "16-17");
    render(<PawlegendsCatSheet cat={CAT} onClose={jest.fn()} />);
    await settle();
    expect(screen.queryByTestId("pawlegends-age")).toBeNull();
    expect(mockPaymentProps.mock.calls[mockPaymentProps.mock.calls.length - 1][0].purchaseContext).toMatchObject({ ageBand: "16-17" });
  });
});
