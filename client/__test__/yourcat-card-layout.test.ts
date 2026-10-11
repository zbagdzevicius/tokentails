/**
 * Share card layout (bet #3, docs/plans/yourcat-v2.md §5.2): every rect inside the safe area, long
 * names shrink but never below the minimum, and no panel rects without a shelter cat.
 */
import { cardLayout, cardNameText, insideRect, NAME_MIN, NAME_START, type CardFormat, type CardLayout, type Rect } from "@/components/yourcat/cardLayout";
import { cardFileName } from "@/components/yourcat/shareCard";

/** A fake measure: every character is 0.8 x the font size wide. */
const measure = (text: string, size: number) => Array.from(text).length * size * 0.8;

function rects(layout: CardLayout): Array<[string, Rect]> {
  const out: Array<[string, Rect]> = [
    ["wordmark", layout.wordmark],
    ["avatar", layout.avatar],
    ["frame", layout.frame],
    ["sprite", layout.sprite],
    ["name", layout.name],
    ["subline", layout.subline],
    ["link", layout.link],
  ];
  if (layout.panel) out.push(["panel", layout.panel]);
  if (layout.panelImage) out.push(["panelImage", layout.panelImage]);
  if (layout.panelText) {
    out.push(["meets", layout.panelText.meets], ["shelter", layout.panelText.shelter], ["from", layout.panelText.from]);
  }
  return out;
}

const FORMATS: CardFormat[] = ["story", "post"];

describe("card layout", () => {
  it.each(FORMATS)("%s: every rect sits inside the safe area, with and without the panel", (format) => {
    for (const hasShelterCat of [true, false]) {
      const layout = cardLayout({ format, name: "Mochi", familyLabel: "Ginger", hasShelterCat, shelterName: "Raudvis" }, measure);
      for (const [label, rect] of rects(layout)) {
        expect({ label, inside: insideRect(rect, layout.safe) }).toEqual({ label, inside: true });
      }
      expect(insideRect(layout.safe, { x: 0, y: 0, w: layout.width, h: layout.height })).toBe(true);
    }
  });

  it("has the two sizes", () => {
    expect(cardLayout({ format: "story", name: "A", familyLabel: "Black", hasShelterCat: false }, measure)).toMatchObject({ width: 1080, height: 1920 });
    expect(cardLayout({ format: "post", name: "A", familyLabel: "Black", hasShelterCat: false }, measure)).toMatchObject({ width: 1080, height: 1350 });
  });

  it.each(FORMATS)("%s: a long name shrinks in 4 px steps and never goes under the minimum", (format) => {
    const short = cardLayout({ format, name: "Mo", familyLabel: "Ginger", hasShelterCat: false }, measure);
    expect(short.name.size).toBe(NAME_START[format]);
    const medium = cardLayout({ format, name: "Bartholomew Jr", familyLabel: "Ginger", hasShelterCat: false }, measure);
    expect(medium.name.size).toBeLessThan(NAME_START[format]);
    expect((NAME_START[format] - medium.name.size) % 4).toBe(0);
    expect(measure(medium.name.text, medium.name.size)).toBeLessThanOrEqual(920);
    // Wide glyphs (1 x the size each): 20 of them do not fit even at the minimum.
    const wide = (text: string, size: number) => Array.from(text).length * size;
    const long = cardLayout({ format, name: "WWWWWWWWWWWWWWWWWWWW", familyLabel: "Ginger", hasShelterCat: false }, wide);
    expect(long.name.size).toBe(NAME_MIN[format]);
    expect(long.name.text.endsWith("…")).toBe(true);
    expect(wide(long.name.text, long.name.size)).toBeLessThanOrEqual(920);
  });

  it("without a shelter cat there are no panel rects, and the story subline moves down", () => {
    const plain = cardLayout({ format: "story", name: "Mochi", familyLabel: "Ginger", hasShelterCat: false }, measure);
    expect(plain.panel).toBeNull();
    expect(plain.panelImage).toBeNull();
    expect(plain.panelText).toBeNull();
    expect(plain.subline.baseline).toBe(1290);
    const withPanel = cardLayout({ format: "story", name: "Mochi", familyLabel: "Ginger", hasShelterCat: true, shelterName: "Zare" }, measure);
    expect(withPanel.panel).toEqual({ x: 80, y: 1310, w: 920, h: 260 });
    expect(withPanel.subline.baseline).toBe(1250);
    expect(withPanel.panelText?.shelter.text).toBe("Zare");
    // A shelter flag without a name draws no panel.
    expect(cardLayout({ format: "post", name: "M", familyLabel: "G", hasShelterCat: true }, measure).panel).toBeNull();
  });

  it("an unnamed cat reads '{Family} cat', never 'My cat'", () => {
    expect(cardNameText({ name: "", familyLabel: "Ginger" })).toBe("Ginger cat");
    expect(cardLayout({ format: "post", name: "  ", familyLabel: "Oreo", hasShelterCat: false }, measure).name.text).toBe("Oreo cat");
  });

  it("names the file tokentails-{slug}-{format}.png", () => {
    expect(cardFileName("Mochi Bun", "story")).toBe("tokentails-mochi-bun-story.png");
    expect(cardFileName("Žemė", "post")).toBe("tokentails-zeme-post.png");
    expect(cardFileName("!!!", "post")).toBe("tokentails-cat-post.png");
  });
});
