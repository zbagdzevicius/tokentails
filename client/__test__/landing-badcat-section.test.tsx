/**
 * @jest-environment jsdom
 *
 * The landing's Bad Cat Daily section: on in every web build with no env, never in the app build, a
 * poster captured from the built game, the game's own line, PLAY BAD CAT to /badcat?from=landing_badcat,
 * and no money or shelter claim. The app export drops its poster and the picker art.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { render } from "@testing-library/react";

let mockIsApp = false;
jest.mock("@/components/claims/build", () => ({ isAppBuild: () => mockIsApp }));
jest.mock("@/components/shared/PixelButton", () => ({
  PixelButton: ({ text, subtext }: { text: string; subtext?: string }) => (
    <span>
      {text} {subtext}
    </span>
  ),
}));

import { BADCAT_LINE, BADCAT_POSTER, BADCAT_PREVIEW, badcatEntryEnabled } from "@/components/badcat/entry";
import { BADCAT_SECTION_HREF, BadcatSection } from "@/components/landing/BadcatSection";

const pub = path.resolve(__dirname, "../public");

beforeEach(() => {
  mockIsApp = false;
});

describe("BadcatSection", () => {
  it("renders on the web with no env: poster, line and the CTA", () => {
    expect(Object.keys(process.env).filter((k) => /BADCAT/i.test(k))).toEqual([]);
    const { getByTestId, container } = render(<BadcatSection />);
    expect(getByTestId("badcat-section")).toBeTruthy();
    expect(container.textContent).toContain("Bad Cat Daily");
    expect(container.textContent).toContain(BADCAT_LINE);
    expect(BADCAT_SECTION_HREF).toBe("/badcat?from=landing_badcat&utm_source=tt_landing");
    expect(getByTestId("badcat-section-cta").getAttribute("href")).toBe(BADCAT_SECTION_HREF);
    expect(getByTestId("badcat-section-cta").textContent).toContain("BAD CAT");
    const poster = getByTestId("badcat-section-poster");
    expect(poster.getAttribute("src")).toBe(BADCAT_POSTER.src);
    expect(poster.getAttribute("width")).toBe("1280");
    expect(poster.getAttribute("height")).toBe("800");
  });

  it("makes no money, treat or shelter claim", () => {
    const { container } = render(<BadcatSection />);
    expect(container.textContent).not.toMatch(/\$|USDC|treat|Pink Paw|shelter|donat|on-?chain/i);
  });

  it("renders nothing in the app build", () => {
    mockIsApp = true;
    expect(badcatEntryEnabled()).toBe(false);
    const { container } = render(<BadcatSection />);
    expect(container.innerHTML).toBe("");
  });

  it("ships its art as WebP and the app export prunes it", () => {
    for (const src of [BADCAT_POSTER.src, BADCAT_PREVIEW.src]) {
      const buf = fs.readFileSync(path.join(pub, src));
      expect(buf.toString("latin1", 8, 12)).toBe("WEBP");
    }
    const prune = fs.readFileSync(path.resolve(__dirname, "../scripts/prune-app-export.mjs"), "utf8");
    expect(prune).toContain(`"${BADCAT_POSTER.src.slice(1)}"`);
    expect(prune).toContain(`"${BADCAT_PREVIEW.src.slice(1)}"`);
  });

  it("links to a path the web build serves (the /badcat rewrite and the built game)", () => {
    expect(fs.existsSync(path.join(pub, "badcat-game/index.html"))).toBe(true);
    const next = fs.readFileSync(path.resolve(__dirname, "../next.config.js"), "utf8");
    expect(next).toContain('{ source: "/badcat", destination: `${BADCAT}/index.html` }');
  });
});
