/**
 * @jest-environment jsdom
 *
 * The flip badge: a flippable TailsCard tells players it has another side, keeps the badge after
 * a flip (so they can flip back), and drops it inside a CardAction (which keeps its open badge).
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TailsCard } from "@/components/tailsCard/TailsCard";
import { CardAction } from "@/components/tailsCard/CardAction";

const side = (c: HTMLElement) => c.querySelector("[data-flipped]")?.getAttribute("data-flipped");

describe("TailsCard flip badge", () => {
  it("shows a labelled flip button that flips the card and stays after the flip", () => {
    const { container } = render(<TailsCard />);
    const button = screen.getByRole("button", { name: "Flip card" });
    expect(button.getAttribute("title")).toMatch(/other side/);
    expect(container.querySelector("[data-card-flip-ping]")).not.toBeNull();
    const before = side(container);
    fireEvent.click(button);
    expect(side(container)).not.toBe(before);
    // Still there to flip back; the ping stops after the first flip.
    expect(screen.getByRole("button", { name: "Flip card" })).toBeTruthy();
    expect(container.querySelector("[data-card-flip-ping]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
    expect(side(container)).toBe(before);
  });

  it("can be turned off", () => {
    render(<TailsCard flipHint={false} />);
    expect(screen.queryByRole("button", { name: "Flip card" })).toBeNull();
  });

  it("is never stacked on a CardAction's open badge", () => {
    const { container } = render(
      <CardAction href="/cats/1" ariaLabel="Meet" size="md">
        <TailsCard />
      </CardAction>,
    );
    expect(container.querySelector("[data-card-flip-badge]")).toBeNull();
    expect(container.querySelectorAll("[data-card-action-badge]")).toHaveLength(1);
  });
});
