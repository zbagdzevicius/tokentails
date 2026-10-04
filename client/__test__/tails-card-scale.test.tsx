/**
 * @jest-environment jsdom
 */
// Cards scale with their own width (founder report, My Pets: the "TOKEN TAILS" and the tier
// "COMMON: 1 / 200" footer was sized for a full card and spilled over the 144 px cards).
// CardWrapper is a size container and everything inside is sized in cqw.
import React from "react";
import fs from "fs";
import path from "path";
import { render } from "@testing-library/react";
import { CardWrapper } from "@/components/tailsCard/CardWrapper";

jest.mock("@/constants/utils", () => ({
  cdnFile: (p: string) => `/${p}`,
}));

import { TailsCard } from "@/components/tailsCard/TailsCard";
import { TailsCardMini } from "@/components/tailsCard/TailsCardMini";
import { CARD_REFERENCE_WIDTH, cardPx } from "@/components/tailsCard/cardScale";
import { fakeCat } from "@/components/tailsCard/data";
import { CatAbilityType, Tier } from "@/models/cats";

const CARD_DIR = path.join(__dirname, "..", "components", "tailsCard");

function footerSpans(root: HTMLElement) {
  return Array.from(root.querySelectorAll("[data-card-footer] span")) as HTMLElement[];
}

describe("card scaling", () => {
  it("converts reference px to cqw", () => {
    expect(CARD_REFERENCE_WIDTH).toBe(400);
    expect(cardPx(12)).toBe("3cqw");
    expect(cardPx(28)).toBe("7cqw");
    expect(cardPx(1)).toBe("0.25cqw");
  });

  it("makes every card wrapper a size container", () => {
    const { container } = render(<TailsCard />);
    const cards = container.querySelectorAll("[data-tails-card]");
    expect(cards.length).toBe(2); // front and back
    cards.forEach((card) => {
      expect(card.className).toContain("[container-type:inline-size]");
    });
  });

  it("sizes the footer in cqw, not px or vw, on the full and the mini card", () => {
    const cat = { ...fakeCat, tier: Tier.COMMON, packed: false };
    for (const ui of [<TailsCard key="full" cat={cat} />, <TailsCardMini key="mini" cat={cat} />]) {
      const { container, unmount } = render(ui);
      const spans = footerSpans(container);
      expect(spans.length).toBeGreaterThanOrEqual(2);
      expect(spans.map((s) => s.textContent)).toEqual(
        expect.arrayContaining(["TOKEN TAILS", "COMMON"]),
      );
      for (const span of spans) {
        expect(span.className).toMatch(/text-\[length:[\d.]+cqw\]/);
        // The container-query threshold is a px width of the card, not a type size.
        expect(span.className.replace(/\[@container\([^)]*\)\]:\S+/g, "")).not.toMatch(/vw|px/);
      }
      unmount();
    }
  });

  it("shows no made-up mint number: the tier alone unless a real number is given", () => {
    const { container, rerender } = render(
      <CardWrapper tier={Tier.RARE} catType={CatAbilityType.FIRE}>x</CardWrapper>,
    );
    const tier = () => container.querySelector("[data-card-tier]") as HTMLElement;
    expect(tier().textContent).toBe("RARE");
    expect(container.textContent).not.toMatch(/\d+ \/ \d+/);
    rerender(
      <CardWrapper tier={Tier.RARE} catType={CatAbilityType.FIRE} cardNumber={7} totalCards={50}>
        x
      </CardWrapper>,
    );
    expect(tier().textContent).toBe("RARE: 7 / 50");
  });

  it("hides the tier label on cards under 200 px wide (a container query, not a breakpoint)", () => {
    const { container } = render(<TailsCardMini cat={{ ...fakeCat, packed: false }} />);
    const tier = container.querySelector("[data-card-tier]") as HTMLElement;
    expect(tier.className).toContain("[@container(max-width:260px)]:hidden");
    // TOKEN TAILS stays, centred when it is alone.
    const footer = container.querySelector("[data-card-footer]") as HTMLElement;
    expect(footer.className).toContain("[@container(max-width:260px)]:justify-center");
    expect(footer.textContent).toContain("TOKEN TAILS");
  });

  it("lets the mini card fill its grid cell instead of a fixed 144 px", () => {
    const { container } = render(<TailsCardMini cat={{ ...fakeCat, packed: false }} />);
    const card = container.querySelector("[data-tails-card]") as HTMLElement;
    expect(card.style.width).toBe("100%");
    // The old global CSS hack that hid the footer by class name is gone.
    expect(container.querySelector("style")).toBeNull();
  });

  it("keeps fixed px, rem and viewport type out of card content", () => {
    const files = [
      "CardWrapper.tsx",
      "CardFront.tsx",
      "CardBack.tsx",
      "TailsCardMini.tsx",
      "cardEffects/DivineGlowEffect.tsx",
      "cardEffects/LegendaryElectricBorder.tsx",
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(CARD_DIR, file), "utf8");
      // `rem:` sizes and viewport-clamped type do not follow the card's width.
      expect({ file, hits: src.match(/rem:[a-z]|text-\[clamp|text-(xs|sm|base|lg|xl|\dxl)\b|rounded-\[\d+px\]/g) }).toEqual({ file, hits: null });
      // Fixed px in inline styles and arbitrary classes: `"4px"`, `2px solid`, `blur(16px)`,
      // `[drop-shadow:0_15px...]`. Allowed: the card's own width cap (`max-w-[400px]`), container
      // query thresholds (`max-width:260px`) and `max(1px, ...)` floors.
      const code = src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      const pxHits: string[] = [];
      for (const m of Array.from(code.matchAll(/-?\d+(\.\d+)?px\b/g))) {
        const before = code.slice(Math.max(0, m.index! - 12), m.index!);
        if (/(max-w-\[|max-width:|max\()$/.test(before)) continue;
        pxHits.push(before.slice(-6) + m[0]);
      }
      expect({ file, pxHits }).toEqual({ file, pxHits: [] });
    }
  });

  it("shows Pet Story only when the cat has a story", () => {
    const withStory = render(<TailsCard cat={fakeCat} />);
    expect(withStory.getAllByText("Pet Story").length).toBeGreaterThan(0);
    expect(withStory.container.textContent).toContain("Elenytė is a young Bengal mix");
    withStory.unmount();

    // No story, or markup that strips to nothing: no empty heading.
    for (const story of ["", "<p> </p>"]) {
      const cat = { ...fakeCat, resqueStory: story, blessing: { ...fakeCat.blessing, description: "" } };
      const { queryByText, unmount } = render(<TailsCard cat={cat as typeof fakeCat} />);
      expect(queryByText("Pet Story")).toBeNull();
      unmount();
    }
  });
});
