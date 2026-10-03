/**
 * @jest-environment jsdom
 *
 * Claim (plan F7.2, G11): registry words, data-claim ids, inline as-of date, status and money tier
 * chips with words and icons, STALE past maxAgeDays, app-build label set, and the tap target
 * (ProofDrawer on the web, web /impact through @capacitor/browser in app builds).
 */
import { renderToString } from "react-dom/server";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockBrowserOpen = jest.fn<Promise<void>, [{ url: string }]>(async () => undefined);
jest.mock("@capacitor/browser", () => ({ Browser: { open: mockBrowserOpen } }));
// The drawer is loaded with next/dynamic; a stand-in keeps the test on Claim's behaviour.
jest.mock("next/dynamic", () => () => {
  const Drawer = (props: {
    open: boolean;
    fact: { id: string };
    text: string;
  }) =>
    props.open ? (
      <div role="dialog" data-testid="drawer" data-fact={props.fact.id}>
        {props.text}
      </div>
    ) : null;
  return Drawer;
});

import { Claim } from "@/components/claims/Claim";
import { MONEY_TIERS } from "@/components/claims/tiers";

const NOW = new Date("2026-10-01T12:00:00Z");

describe("Claim", () => {
  it("renders the registry words with a data-claim id and a status chip", () => {
    const { container } = render(<Claim id="F-011" now={NOW} isApp={false} />);
    const el = container.querySelector('[data-claim="F-011"]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("180K+ on X (Sep 2026)");
    const chip = el!.querySelector('[data-chip="verified"]');
    expect(chip?.textContent).toBe("VERIFIED");
    // Words plus an icon, never colour alone.
    expect(chip?.querySelector("svg[data-icon]")).not.toBeNull();
    // The display already carries its date, so no second date is added.
    expect(el!.querySelector(".claim-date")).toBeNull();
  });

  it("labels company-reported and SEI-era entries", () => {
    const { container } = render(
      <>
        <Claim id="F-001" text="540K+ registered players" now={NOW} isApp={false} />
        <Claim id="F-003" now={NOW} isApp={false} />
      </>
    );
    expect(
      container.querySelector(
        '[data-claim="F-001"] [data-chip="company-reported"]'
      )?.textContent
    ).toBe("COMPANY-REPORTED");
    expect(
      container.querySelector('[data-claim="F-003"] [data-chip="sei-era"]')
        ?.textContent
    ).toBe("SEI ERA · HISTORICAL");
  });

  it("does not repeat a status its words already say, but still names it", () => {
    const { container } = render(<Claim id="F-001" now={NOW} isApp={false} />);
    const el = container.querySelector('[data-claim="F-001"]')!;
    expect(el.textContent).toContain("company-reported)");
    expect(el.querySelector('[data-chip="company-reported"]')).toBeNull();
    expect(el.getAttribute("aria-label")).toContain("COMPANY-REPORTED");
  });

  it("adds the STALE chip only after mount when no `now` is given (no hydration mismatch)", () => {
    const html = renderToString(<Claim id="L-countries" values={{ n: 3 }} liveAsOf="2020-01-01T00:00:00Z" isApp={false} />);
    expect(html).not.toContain('data-chip="stale"');
    const { container } = render(
      <Claim id="L-countries" values={{ n: 3 }} liveAsOf="2020-01-01T00:00:00Z" isApp={false} />
    );
    expect(container.querySelector('[data-chip="stale"]')).not.toBeNull();
  });

  it("puts a suffix between the words and the date and chips", () => {
    const { container } = render(
      <Claim
        id="L-players"
        values={{ n: 12 }}
        liveAsOf="2026-10-01T05:00:00Z"
        now={NOW}
        isApp={false}
        interactive={false}
        suffix={<span data-testid="sfx">registered</span>}
      />
    );
    const el = container.querySelector('[data-claim="L-players"]')!;
    expect(el.textContent).toMatch(/12 players registered · as of 1 Oct 2026\s*LIVE/);
  });

  it("fills live placeholders and shows the inline as-of date", () => {
    const { container } = render(
      <Claim
        id="L-countries"
        values={{ n: 3 }}
        liveAsOf="2026-10-01T05:00:00Z"
        now={NOW}
        isApp={false}
      />
    );
    const el = container.querySelector('[data-claim="L-countries"]')!;
    expect(el.textContent).toContain("3 partner countries");
    expect(el.querySelector(".claim-date")?.textContent).toBe(
      "· as of 1 Oct 2026"
    );
    expect(el.querySelector('[data-chip="live"]')).not.toBeNull();
    expect(el.querySelector('[data-chip="stale"]')).toBeNull();
  });

  it("renders nothing for a live entry the snapshot does not measure", () => {
    const { container } = render(
      <Claim id="L-players" now={NOW} isApp={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for an id that is not public", () => {
    const { container } = render(
      <Claim id={"F-024" as never} now={NOW} isApp={false} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows STALE past maxAgeDays", () => {
    // F-011: checked 2026-09-27, maxAgeDays 90.
    const fresh = render(
      <Claim id="F-011" now={new Date("2026-12-20T00:00:00Z")} isApp={false} />
    );
    expect(fresh.container.querySelector('[data-chip="stale"]')).toBeNull();
    fresh.unmount();
    const late = render(
      <Claim id="F-011" now={new Date("2027-01-01T00:00:00Z")} isApp={false} />
    );
    expect(
      late.container.querySelector('[data-chip="stale"]')?.textContent
    ).toBe("STALE");
    late.unmount();
    // Live entries age from their snapshot date; a 3-day-old snapshot is past maxAgeDays 2.
    const live = render(
      <Claim
        id="L-countries"
        values={{ n: 1 }}
        liveAsOf="2026-09-28T00:00:00Z"
        now={NOW}
        isApp={false}
      />
    );
    expect(live.container.querySelector('[data-chip="stale"]')).not.toBeNull();
    live.unmount();
    // SEI-era history never goes stale.
    const sei = render(
      <Claim id="F-003" now={new Date("2035-01-01T00:00:00Z")} isApp={false} />
    );
    expect(sei.container.querySelector('[data-chip="stale"]')).toBeNull();
  });

  it.each([
    ["onchain-custodial", "ON-CHAIN · CUSTODIAL", "HELD BY TOKEN TAILS"],
    ["onchain-shelter-held", "ON-CHAIN · SHELTER-HELD", "HELD BY SHELTER"],
    ["shelter-signed", "SHELTER-SIGNED", "SHELTER-SIGNED"],
    ["shelter-confirmed", "SHELTER-CONFIRMED", "SHELTER-CONFIRMED"],
    ["pledged", "PLEDGED", "PLEDGED"],
    ["shelter-reported", "SHELTER-REPORTED", "SHELTER-REPORTED"],
    ["in-game", "IN-GAME", "IN-GAME"],
  ] as const)(
    "money tier %s reads %s on web and %s in the app",
    (tier, web, app) => {
      const amount = "1.00 USDC";
      const w = render(
        <Claim
          id="L-disbursed"
          values={{ amount }}
          tier={tier}
          now={NOW}
          isApp={false}
          liveAsOf="2026-10-01"
        />
      );
      expect(
        w.container.querySelector(`[data-chip="${tier}"]`)?.textContent
      ).toBe(web);
      w.unmount();
      const a = render(
        <Claim
          id="L-disbursed"
          values={{ amount: "$1.00 · FX 2026-10-01" }}
          tier={tier}
          now={NOW}
          isApp
          liveAsOf="2026-10-01"
        />
      );
      const chip = a.container.querySelector(`[data-chip="${tier}"]`);
      expect(chip?.textContent).toBe(app);
      expect(a.container.textContent).not.toMatch(/ON-CHAIN|USDC/);
      a.unmount();
    }
  );

  it("covers every money tier in the table above", () => {
    expect(MONEY_TIERS).toHaveLength(7);
  });

  it("uses appDisplay in app builds", () => {
    const { container } = render(<Claim id="C-004" now={NOW} isApp />);
    expect(container.textContent).toContain("a $0.01 treat");
    expect(container.textContent).not.toContain("USDC");
  });

  it("stat variant splits the figure from the words", () => {
    const { container } = render(
      <Claim id="F-001" variant="stat" now={NOW} isApp={false} />
    );
    expect(container.querySelector(".claim-figure")?.textContent).toBe("540K+");
    expect(container.querySelector(".claim-text")?.textContent).toBe(
      "registered players, all time (Apr 2026, company-reported)"
    );
  });

  it("opens the ProofDrawer on the web", () => {
    render(<Claim id="F-011" now={NOW} isApp={false} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-label")).toContain("VERIFIED");
    fireEvent.click(button);
    expect(screen.getByTestId("drawer").getAttribute("data-fact")).toBe(
      "F-011"
    );
    expect(mockBrowserOpen).not.toHaveBeenCalled();
  });

  it("opens web /impact through @capacitor/browser in app builds", async () => {
    render(<Claim id="F-011" now={NOW} isApp />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockBrowserOpen).toHaveBeenCalled());
    expect(mockBrowserOpen.mock.calls[0][0]).toEqual({
      url: "https://tokentails.com/impact#F-011",
    });
    expect(screen.queryByTestId("drawer")).toBeNull();
  });

  it("is a plain span when not interactive", () => {
    const { container } = render(
      <Claim id="F-011" now={NOW} isApp={false} interactive={false} />
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector('span[data-claim="F-011"]')).not.toBeNull();
  });

  it("puts a chip's date in brackets, not after a '·' (review 3f #7)", () => {
    const { container } = render(
      <Claim id="F-025" variant="chip" now={NOW} isApp={false} />
    );
    const el = container.querySelector('[data-claim="F-025"]')!;
    expect(el.querySelector(".claim-date")?.textContent).toBe("(Sep 2026)");
    expect(el.textContent).not.toContain("·");
  });
});
