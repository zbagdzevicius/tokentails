/** @jest-environment jsdom */
import { render } from "@testing-library/react";
import { DonationPileUp, isComingOnline, publicFact } from "@/components/claims";

describe("DonationPileUp", () => {
  it("piles up to the registry total and keeps empty rows rendered in a collapsed group", () => {
    const { container } = render(
      <DonationPileUp
        isApp={false}
        comingOnlineCount={1}
        comingOnline={<span data-claim-row="L-countries">Not measured yet</span>}
      />
    );
    expect(container.textContent).toContain("How we got to $40K+");
    expect(container.textContent).toContain("not itemised");
    expect(container.querySelector('[data-pileup-step="F-026"]')).not.toBeNull();
    const group = container.querySelector("details[data-coming-online]") as HTMLDetailsElement;
    expect(group.open).toBe(false);
    expect(group.querySelector('[data-claim-row="L-countries"]')).not.toBeNull();
  });

  it("flags only empty live rows as coming online", () => {
    expect(isComingOnline(publicFact("L-countries")!, null)).toBe(true);
    expect(isComingOnline(publicFact("L-countries")!, "1 partner countries")).toBe(false);
    expect(isComingOnline(publicFact("F-026")!, null)).toBe(false);
  });
});
