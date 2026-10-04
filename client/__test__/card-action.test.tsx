/**
 * @jest-environment jsdom
 *
 * CardAction, the "this card opens" wrapper: link vs button, the accessible name, the badge sizes
 * and the ping that only the first card of a grid keeps.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardAction } from "@/components/tailsCard/CardAction";

const badge = (root: HTMLElement) => root.querySelector("[data-card-action-badge]") as HTMLElement;

describe("CardAction", () => {
  it("renders a plain link with the accessible name (the approved landing card)", () => {
    const { container } = render(
      <CardAction href="/game" ariaLabel="Play the Token Tails game">
        <span>card</span>
      </CardAction>,
    );
    const link = screen.getByRole("link", { name: "Play the Token Tails game" });
    expect(link.getAttribute("href")).toBe("/game");
    // Default is the approved 48 px badge with its ping.
    expect(badge(container).getAttribute("data-card-action-badge")).toBe("lg");
    expect(badge(container).className).toContain("h-12 w-12");
    expect(badge(container).className).toContain("-right-3 -top-3");
    expect(badge(container).getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("[data-card-action-ping]")?.className).toContain("motion-safe:animate-ping");
  });

  it("renders a button that runs the card's own click", () => {
    const onClick = jest.fn();
    render(
      <CardAction onClick={onClick} ariaLabel="Open Judas" size="sm">
        <span>card</span>
      </CardAction>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    const button = screen.getByRole("button", { name: "Open Judas" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("scales the badge and its corner offset with size", () => {
    const sizes = {
      lg: ["h-12 w-12", "-right-3 -top-3"],
      md: ["h-9 w-9", "-right-2.5 -top-2.5"],
      sm: ["h-7 w-7", "-right-2 -top-2"],
    } as const;
    for (const [size, classes] of Object.entries(sizes)) {
      const { container, unmount } = render(
        <CardAction href="/cats/1" ariaLabel="Meet" size={size as keyof typeof sizes}>
          <span>card</span>
        </CardAction>,
      );
      for (const c of classes) expect(badge(container).className).toContain(c);
      unmount();
    }
  });

  it("fills a grid cell when asked, inline-block otherwise", () => {
    render(
      <>
        <CardAction href="/game" ariaLabel="Landing">
          <span>card</span>
        </CardAction>
        <CardAction onClick={() => {}} ariaLabel="Grid" size="sm" fill>
          <span>card</span>
        </CardAction>
      </>,
    );
    expect(screen.getByRole("link", { name: "Landing" }).className).toMatch(/(^|\s)inline-block(\s|$)/);
    const grid = screen.getByRole("button", { name: "Grid" }).className;
    expect(grid).toMatch(/(^|\s)block w-full(\s|$)/);
    expect(grid).not.toMatch(/inline-block/);
  });

  it("drops the ping when asked (every card in a grid but the first)", () => {
    const { container } = render(
      <CardAction onClick={() => {}} ariaLabel="Open" size="sm" ping={false}>
        <span>card</span>
      </CardAction>,
    );
    expect(container.querySelector("[data-card-action-ping]")).toBeNull();
    expect(badge(container)).not.toBeNull();
  });
});
