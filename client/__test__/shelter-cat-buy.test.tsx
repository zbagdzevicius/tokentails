/**
 * @jest-environment jsdom
 */
import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

const mockApp = { isApp: false };
jest.mock("@/models/app", () => ({
  get isApp() {
    return mockApp.isApp;
  },
  isProd: false,
}));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn() }));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
const mockProfile: { cats: unknown[] } = { cats: [] };
const mockSetProfileUpdate = jest.fn();
jest.mock("@/context/ProfileContext", () => ({
  useProfile: () => ({ profile: mockProfile, setProfileUpdate: mockSetProfileUpdate }),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock("@/hooks/useStorefront", () => ({ invalidateStorefront: jest.fn() }));
// The checkout itself is covered by modals-a-payment-gate and crypto-checkout-ui.
jest.mock("next/dynamic", () => () => (props: { id: string; entityType: string; price: number; onSuccess: (m: unknown) => void }) => (
  <button
    data-testid="payment"
    data-id={props.id}
    data-entity={props.entityType}
    data-price={props.price}
    onClick={() => props.onSuccess({ success: true, message: "ok", cat: { _id: "new", name: "Mochi", catImg: "/m.png" } })}
  />
));
jest.mock("@/components/ui/GameModal", () => ({
  GameModal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));

jest.mock("@/components/tailsCard/TailsCard", () => ({ TailsCard: () => <div data-testid="tails-card" /> }));
jest.mock("@/components/shared/Countdown", () => ({ Countdown: () => null }));

import { ShelterCatBuy, ShelterCatOffer, isCatForSale, ownsCopy } from "@/components/shelter/ShelterCatBuy";
import { TailsCardModal } from "@/components/tailsCard/TailsCardModal";
import { BlessingStatus, ICat, Prices } from "@/models/cats";

const CAT_ID = "67b48fafd6c26c6cd40bfec6";
const cat = (over: Partial<ICat> = {}): ICat =>
  ({
    _id: CAT_ID,
    name: "Mochi",
    owner: "",
    catImg: "/mochi.png",
    blessing: { _id: "b1", status: BlessingStatus.WAITING },
    ...over,
  }) as unknown as ICat;

beforeEach(() => {
  mockApp.isApp = false;
  mockProfile.cats = [];
  mockSetProfileUpdate.mockClear();
});

describe("which shelter cats are for sale", () => {
  it("mirrors the server rule", () => {
    expect(isCatForSale(cat())).toBe(true);
    expect(isCatForSale(cat({ owner: "u1" }))).toBe(false);
    expect(isCatForSale(cat({ blessing: undefined as unknown as ICat["blessing"] }))).toBe(false);
    expect(isCatForSale(cat({ blessing: { _id: "b", status: BlessingStatus.ADOPTED } as ICat["blessing"] }))).toBe(false);
    expect(isCatForSale(cat({ blessing: { _id: "b", status: BlessingStatus.HEAVEN } as ICat["blessing"] }))).toBe(false);
    expect(isCatForSale(cat({ _id: "not-an-id" }))).toBe(false);
    // Starters are never sold (the server refuses them too).
    expect(isCatForSale(cat({ isStarter: true }))).toBe(false);
    expect(isCatForSale(cat({ isGuestStarter: true }))).toBe(false);
  });

  it("knows a copy the player already holds", () => {
    expect(ownsCopy([], cat())).toBe(false);
    expect(ownsCopy([{ _id: "x", blessing: "b1" } as unknown as ICat], cat())).toBe(true);
    expect(ownsCopy([{ _id: "x", blessing: { _id: "b1" } } as unknown as ICat], cat())).toBe(true);
    expect(ownsCopy([{ _id: "x", sourceCat: CAT_ID } as unknown as ICat], cat())).toBe(true);
    expect(ownsCopy([{ _id: "x", blessing: { _id: "b2" } } as unknown as ICat], cat())).toBe(false);
  });

  it("prices the basic tier at the server floor", () => {
    expect(Prices.shelterCat).toBe(5);
  });
});

describe("ShelterCatBuy", () => {
  it("offers the basic tier at $5 and says where rarer tiers come from", () => {
    render(<ShelterCatBuy cat={cat()} />);
    const offer = screen.getByTestId("shelter-cat-offer");
    expect(offer).toHaveTextContent("Basic tier · $5");
    expect(offer).toHaveTextContent("Rare, Epic and Legendary cards come only from card packs.");
    expect(offer).toHaveTextContent(/by card or crypto/);
  });

  it("opens a $5 CAT checkout and adds the bought cat", () => {
    render(<ShelterCatBuy cat={cat()} />);
    fireEvent.click(screen.getByRole("button", { name: /buy for \$5/i }));
    const payment = screen.getByTestId("payment");
    expect(payment).toHaveAttribute("data-entity", "CAT");
    expect(payment).toHaveAttribute("data-id", CAT_ID);
    expect(payment).toHaveAttribute("data-price", "5");
    fireEvent.click(payment);
    expect(screen.getByTestId("shelter-cat-bought")).toHaveTextContent("Mochi is yours");
    expect(mockSetProfileUpdate).toHaveBeenCalledWith({ cats: [expect.objectContaining({ _id: "new" })] });
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(screen.getByTestId("shelter-cat-offer")).toHaveTextContent("already in your collection");
  });

  it("does not sell a cat the player already has", () => {
    mockProfile.cats = [{ _id: "x", blessing: "b1" }];
    render(<ShelterCatBuy cat={cat()} />);
    expect(screen.getByTestId("shelter-cat-offer")).toHaveTextContent("already in your collection");
    expect(screen.queryByRole("button", { name: /buy/i })).toBeNull();
  });

  it("shows nothing in app builds or for cats not on sale", () => {
    mockApp.isApp = true;
    const { container, rerender } = render(<ShelterCatBuy cat={cat()} />);
    expect(container).toBeEmptyDOMElement();
    mockApp.isApp = false;
    rerender(<ShelterCatBuy cat={cat({ owner: "u1" })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the Shelter's card modal", () => {
  it("shows the offer beside the NPC's card and hands the buy back to the Shelter", () => {
    const onBuy = jest.fn();
    render(
      <TailsCardModal {...cat()}>
        <ShelterCatOffer cat={cat()} onBuy={onBuy} />
      </TailsCardModal>
    );
    expect(screen.getByTestId("tails-card")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /buy for \$5/i }));
    expect(onBuy).toHaveBeenCalled();
  });
});
