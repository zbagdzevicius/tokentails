/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GameModal } from "@/components/ui/GameModal";

jest.mock("@/analytics", () => ({ reportAppError: jest.fn() }));

/** The shelter flow: a cat card modal whose BUY button closes it and opens a non-modal checkout. */
function Flow({ onCheckoutClose }: { onCheckoutClose: jest.Mock }) {
  const [card, setCard] = useState(false);
  const [checkout, setCheckout] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setCard(true)}>
        Open cat
      </button>
      <GameModal title="Cat" open={card} onOpenChange={(next) => !next && setCard(false)}>
        <button
          type="button"
          onClick={() => {
            setCard(false);
            setCheckout(true);
          }}
        >
          BUY FOR $5
        </button>
      </GameModal>
      {checkout && (
        <GameModal
          title="Buy cat"
          open
          modal={false}
          layer="modal-nested"
          onOpenChange={(next) => {
            if (!next) {
              onCheckoutClose();
              setCheckout(false);
            }
          }}
        >
          <p>Checkout body</p>
        </GameModal>
      )}
    </>
  );
}

it("BUY in a modal opens the non-modal checkout and it stays open", async () => {
  const onCheckoutClose = jest.fn();
  render(<Flow onCheckoutClose={onCheckoutClose} />);
  const opener = screen.getByRole("button", { name: "Open cat" });
  opener.focus();
  fireEvent.click(opener);
  const buy = await screen.findByRole("button", { name: "BUY FOR $5" });
  act(() => buy.focus());
  fireEvent.click(buy);
  await waitFor(() => expect(screen.getByText("Checkout body")).toBeTruthy());
  // Let the closing modal return focus to its opener and any deferred handlers run.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(onCheckoutClose).not.toHaveBeenCalled();
  expect(screen.queryByText("Checkout body")).toBeTruthy();
});
