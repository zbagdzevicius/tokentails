import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

// Bet #3 (yourcat-v2.md section 6.6): the portrait pages showed invented reviews, press logos,
// sales numbers, a resetting countdown and made-up "was" prices. copy-lint cannot catch these (claims
// rule R1 counts only players and cats), so this test keeps them out of the source.
const ROOT = join(__dirname, "..");
const SCANNED_DIRS = ["pages", "features/portrait", "components/codex"];

const FORBIDDEN: Array<[label: string, pattern: RegExp]> = [
  ["Trustpilot", /Trustpilot/],
  ["167 reviews", /167 reviews/],
  ["As Seen In", /As Seen In/i],
  ["Forbes", /Forbes/],
  ["New York Times", /New York Times/],
  ["VOGUE", /\bVOGUE\b/],
  ["ELLE", /\bELLE\b/],
  ["#1 in Pet Portraits", /#1 in Pet Portraits/i],
  ["50K+", /50K\+/],
  ["4.9/5", /4\.9\/5/],
  ["useCountdown", /useCountdown/],
  ["originalPrice", /originalPrice/],
  ["Discount expired", /Discount expired/i],
  ["Expires in", /Expires in/i],
  ["money-back", /money-back/i],
  ["$20 value", /\$20 value/i],
  ["@catmom_sarah", /@catmom_sarah/],
  ["unsplash.com", /unsplash\.com/],
  // Four styles exist (PortraitStyle); no invented count such as "20+ styles".
  ["N+ styles", /\d+\+ styles/i],
  ["styles and counting", /styles and counting/i],
  // The retired $6 portrait price; `$60` and `$69` do not match.
  ["$6", /\$6(?!\d)/],
  // Ranking badges nothing measures (known issue KI-04); the option cards carry factual labels.
  ["Most Popular", /Most Popular/i],
  ["Recommended", /\bRecommended\b/],
  ["Perfect Gift", /Perfect Gift/i],
  // Unmeasured speed promises (KI-10).
  ["under 2 minutes", /under 2 minutes/i],
  ["in minutes", /\bin minutes\b/i],
  // highness-1 (and the identical highness.webp) shows a famous internet cat's likeness.
  ["highness-1", /highness-1\.webp/],
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.(tsx?|jsx?|mjs)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe("portrait pages carry no fabricated proof", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("scans the portrait pages, the portrait feature and the codex flow", () => {
    const scanned = files.map((file) => relative(ROOT, file));
    expect(scanned).toEqual(
      expect.arrayContaining([
        "pages/portrait.tsx",
        "pages/portraits.tsx",
        "features/portrait/components/PreviewPage.tsx",
        "components/codex/ImmortalizePetFlow.tsx",
      ]),
    );
  });

  it.each(FORBIDDEN)("finds no %s", (_label, pattern) => {
    const hits = files
      .filter((file) => pattern.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));
    expect(hits).toEqual([]);
  });

  it("the option cards highlight the digital option by id, not by badge text", () => {
    const preview = readFileSync(
      join(ROOT, "features/portrait/components/PreviewPage.tsx"),
      "utf8",
    );
    expect(preview).not.toMatch(/option\.badge ===/);
    expect(preview).toMatch(/option\.id === "digital" \? "ring-2 ring-primary"/);
  });

  it("deleted the fake review, testimonial, press and countdown modules", () => {
    const all = files.map((file) => relative(ROOT, file));
    for (const gone of [
      "features/portrait/components/TrustpilotReviews.tsx",
      "features/portrait/components/Testimonials.tsx",
      "features/portrait/components/AsSeenOn.tsx",
      "features/portrait/hooks/useCountdown.ts",
    ]) {
      expect(all).not.toContain(gone);
    }
  });
});

describe("portrait FAQ answers match the policy and the limits", () => {
  const PAGES = ["pages/portrait.tsx", "pages/portraits.tsx"];
  const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
  const constant = (source: string, name: string): string | undefined =>
    source.match(new RegExp(`const ${name} =\\s*"([^"]+)"`))?.[1];

  it("the refund answer names the right of withdrawal and promises no open-ended resolution", () => {
    const answer = constant(read("pages/portrait.tsx"), "PORTRAIT_FAQ_REFUNDS");
    expect(answer).toBeDefined();
    expect(answer).toMatch(/withdrawal/);
    expect(answer).toMatch(/if you agree at checkout/);
    expect(answer).toMatch(/within 30 days of delivery/);
    expect(answer).not.toMatch(/resolution/i);
    expect(answer).not.toMatch(/not satisfied/i);
  });

  it("the regenerate answer mentions the daily limit and promises no unlimited regenerating", () => {
    const answer = constant(read("pages/portrait.tsx"), "PORTRAIT_FAQ_REGENERATE");
    expect(answer).toBeDefined();
    expect(answer).toMatch(/daily limit/);
    expect(answer).not.toMatch(/rotate through/i);
    expect(answer).not.toMatch(/unlimited/i);
  });

  it.each(PAGES)("%s uses the shared answers wherever it has a refund or regenerate FAQ", (file) => {
    const source = read(file);
    if (/Do you offer refunds\?/.test(source)) {
      expect(source).toMatch(/a: PORTRAIT_FAQ_REFUNDS/);
    }
    if (/Can I regenerate/.test(source)) {
      expect(source).toMatch(/a: PORTRAIT_FAQ_REGENERATE/);
    }
  });
});
