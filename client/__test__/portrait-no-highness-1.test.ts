import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// CR1-05: highness-1.webp shows a famous internet cat's likeness, and highness.webp is a byte-identical
// copy. portrait-no-fabricated-proof.test.ts bans the "highness-1.webp" string; this test also keeps the
// identical highness.webp from being rendered, including through the style picker's old
// `portrait/${style.id}.webp` template, which built "portrait/highness.webp" without spelling it out.
const ROOT = join(__dirname, "..");
const PUBLIC_PORTRAIT = join(ROOT, "public", "portrait");
const PICKER = "features/portrait/components/StylePickerDrawer.tsx";
const RENDERING_FILES = [
  PICKER,
  "pages/portrait.tsx",
  "pages/portraits.tsx",
  "features/portrait/components/PreviewPage.tsx",
  "components/yourcat/copy.ts",
];

const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

describe("no page renders the rejected highness-1 image or its copy highness.webp", () => {
  it("highness.webp is still byte-identical to highness-1.webp (so it stays banned too)", () => {
    expect(sha(join(PUBLIC_PORTRAIT, "highness.webp"))).toBe(sha(join(PUBLIC_PORTRAIT, "highness-1.webp")));
  });

  it("the replacement highness-2.webp exists and differs from the rejected image", () => {
    const replacement = join(PUBLIC_PORTRAIT, "highness-2.webp");
    expect(existsSync(replacement)).toBe(true);
    expect(sha(replacement)).not.toBe(sha(join(PUBLIC_PORTRAIT, "highness-1.webp")));
  });

  it.each(RENDERING_FILES)("%s has no highness.webp or highness-1.webp path", (file) => {
    // A path reference: after a slash or a quote (comments that name the file in prose are fine).
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(source).not.toMatch(/[/"'`]highness(-1)?\.webp/);
  });

  it("the style picker builds no image path from the style id", () => {
    const source = readFileSync(join(ROOT, PICKER), "utf8");
    expect(source).not.toMatch(/\$\{style\.id\}\.webp/);
    expect(source).toMatch(/cdnFile\(STYLE_PREVIEW_IMAGES\[style\.id\]\)/);
  });

  it("the style picker maps Highness to highness-2.webp and every style to an existing file", () => {
    // Import after reading the source so a broken map fails the checks above first.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STYLE_PREVIEW_IMAGES, PortraitStyle } = require("@/features/portrait/components/StylePickerDrawer");
    expect(STYLE_PREVIEW_IMAGES[PortraitStyle.HIGHNESS]).toBe("portrait/highness-2.webp");
    for (const style of Object.values(PortraitStyle) as string[]) {
      const path: string = STYLE_PREVIEW_IMAGES[style];
      expect(path).toMatch(/^portrait\/[a-z0-9-]+\.webp$/);
      expect(path).not.toMatch(/highness(-1)?\.webp$/);
      expect(existsSync(join(ROOT, "public", path))).toBe(true);
    }
  });
});
