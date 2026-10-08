/**
 * The /heist entry script (HEIST_FRAME_ENTRY_SCRIPT) points the server-rendered iframe at the
 * deep link before hydration. It must agree with heistFrameSrc, or the host's effect would set src
 * again and load the game twice.
 */
import { HEIST_FRAME_ENTRY_SCRIPT, HEIST_FRAME_PATH, HEIST_FRAME_TESTID, heistFrameSrc } from "@/components/heist/session";

const SERVER_SRC = heistFrameSrc("", false);

function runEntry(search: string, hash = "", found = true) {
  let src = SERVER_SRC;
  let sets = 0;
  const frame = {
    getAttribute: (name: string) => (name === "src" ? src : null),
    setAttribute: (name: string, value: string) => {
      if (name !== "src") return;
      src = value;
      sets++;
    },
  };
  const selectors: string[] = [];
  const document = {
    querySelector: (selector: string) => {
      selectors.push(selector);
      return found ? frame : null;
    },
  };
  const location = { search, hash };
  // The page runs it as a module (strict mode).
  new Function("document", "location", `"use strict";${HEIST_FRAME_ENTRY_SCRIPT}`)(document, location);
  expect(selectors).toEqual([`iframe[data-testid="${HEIST_FRAME_TESTID}"]`]);
  return { src, sets };
}

describe("heist frame entry script", () => {
  const cases: [string, string][] = [
    ["", ""],
    ["?payouts", ""],
    ["?payouts=1", ""],
    ["?payouts=0", ""],
    ["?payouts=false", ""],
    ["?from=landing&payouts=1", ""],
    ["", "#payouts"],
    ["", "#PAYOUTS"],
    ["", "#other"],
    ["?chain=84532", ""],
    ["?payouts&chain=4217", ""],
    ["?chain=0x14a34", ""],
    ["?chain=-1", ""],
    ["?chain=1234567890123456", ""],
    ["?qa=1&replay=solution", ""],
    ["?chain=5042&payouts", "#payouts"],
  ];

  it.each(cases)("matches heistFrameSrc for %p %p", (search, hash) => {
    expect(runEntry(search, hash).src).toBe(heistFrameSrc(search, false, hash));
  });

  it("leaves the frame alone when the server src is already right (no second load)", () => {
    expect(runEntry("?from=landing").sets).toBe(0);
  });

  it("points a payouts link at the payouts frame once", () => {
    const out = runEntry("?payouts");
    expect(out).toEqual({ src: `${HEIST_FRAME_PATH}?embed=1&payouts=1`, sets: 1 });
  });

  it("does nothing when the page has no Heist frame", () => {
    expect(runEntry("?payouts", "", false)).toEqual({ src: SERVER_SRC, sets: 0 });
  });
});
