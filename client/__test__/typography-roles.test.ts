import { readFileSync } from "fs";
import path from "path";
import { FONT_FAMILIES, TYPE_ROLES as ROLE_TOKENS } from "@/design/tokens";
import {
  FALLBACK_FAMILIES,
  FONT_STACKS,
  TYPE_ROLES,
  TYPE_ROLE_NAMES,
  applyRoleCase,
  isTypeRole,
  roleFaces,
  roleSize,
  ttCanvasFont,
} from "@/components/typography";

const CLIENT = path.resolve(__dirname, "..");

interface DeclaredFace {
  family: string;
  weight: string;
  style: string;
  local: boolean;
}

/** Parses the @font-face blocks of the generated SCSS. */
function declaredFaces(): DeclaredFace[] {
  const scss = readFileSync(path.join(CLIENT, "styles/fonts.generated.scss"), "utf8");
  return scss
    .split("@font-face")
    .slice(1)
    .map((block) => ({
      family: /font-family: "([^"]+)"/.exec(block)![1],
      weight: /font-weight: ([^;]+);/.exec(block)![1],
      style: /font-style: ([^;]+);/.exec(block)![1],
      local: !block.includes("url("),
    }));
}

const covers = (declared: string, weight: number) => {
  const [min, max = min] = declared.split(/\s+/).map(Number);
  return weight >= min && weight <= max;
};

describe("type roles (plan F4)", () => {
  it("match the plan's role table", () => {
    expect(TYPE_ROLES.title).toMatchObject({ family: "Passion One", weight: 900 });
    expect(TYPE_ROLES.hud).toMatchObject({ family: "Bebas Neue" });
    expect(TYPE_ROLES.label).toMatchObject({ family: "Bebas Neue", minPx: 12 });
    expect(TYPE_ROLES.caption).toMatchObject({ family: "Nunito", weight: 700, minPx: 12 });
    expect(TYPE_ROLES.hint).toMatchObject({ family: "Nunito", weight: 800, minPx: 14, case: "sentence" });
    expect(TYPE_ROLES.burst).toMatchObject({ family: "Passion One", weight: 900 });
    expect(TYPE_ROLES.burst.stroke).toEqual({ color: "#4a1d08", widthEm: expect.any(Number) });
    expect(TYPE_ROLES.code.family).toBe(FONT_FAMILIES.mono);
  });

  it("are built from design/tokens.ts, not a second table", () => {
    expect(TYPE_ROLE_NAMES).toEqual(Object.keys(ROLE_TOKENS));
    for (const role of TYPE_ROLE_NAMES) {
      const token = ROLE_TOKENS[role];
      expect(TYPE_ROLES[role].weight).toBe(token.weight);
      expect(TYPE_ROLES[role].minPx).toBe(token.minPx);
      expect(TYPE_ROLES[role].case).toBe(token.case);
      expect(TYPE_ROLES[role].defaultPx).toBeGreaterThanOrEqual(token.minPx);
    }
  });

  it("every role family and weight is declared by a self-hosted @font-face", () => {
    const faces = declaredFaces().filter((f) => !f.local);
    for (const { family, weight } of roleFaces()) {
      const match = faces.filter((f) => f.family === family && f.style === "normal" && covers(f.weight, weight));
      expect({ family, weight, declared: match.length > 0 }).toEqual({ family, weight, declared: true });
    }
  });

  it("every family the landing uses is declared (Passion One 400 and 700 too)", () => {
    const faces = declaredFaces().filter((f) => !f.local);
    for (const [family, weight] of [
      ["Passion One", 400],
      ["Passion One", 700],
      ["Nunito", 400],
      ["Nunito", 1000],
      ["Bebas Neue", 400],
      ["Roboto", 500],
    ] as const) {
      expect(faces.some((f) => f.family === family && covers(f.weight, weight))).toBe(true);
    }
  });

  it("every brand stack names its metric-matched fallback, which is declared locally", () => {
    const local = declaredFaces().filter((f) => f.local);
    for (const [family, fallbacks] of Object.entries(FALLBACK_FAMILIES)) {
      expect(fallbacks[0]).toBe(`${family} Fallback`);
      for (const fallback of fallbacks) {
        expect(local.some((f) => f.family === fallback)).toBe(true);
        expect([`${family} Fallback`, `${family} Fallback Android`]).toContain(fallback);
      }
    }
    expect(TYPE_ROLES.title.stack).toBe(
      '"Passion One", "Passion One Fallback", "Passion One Fallback Android", sans-serif',
    );
    expect(TYPE_ROLES.hint.stack).toBe('"Nunito", "Nunito Fallback", "Nunito Fallback Android", sans-serif');
    expect(FONT_STACKS.hud).toBe('"Bebas Neue", "Bebas Neue Fallback", sans-serif');
    expect(FONT_STACKS.mono).toBe(FONT_FAMILIES.mono);
  });

  it("roleFaces lists each distinct brand face once, without the mono role", () => {
    expect(roleFaces().map((f) => `${f.weight} ${f.family}`)).toEqual([
      "900 Passion One",
      "400 Bebas Neue",
      "700 Nunito",
      "800 Nunito",
    ]);
  });

  it("roleSize never goes below the role minimum", () => {
    expect(roleSize("hint", 9)).toBe(14);
    expect(roleSize("label", 11.6)).toBe(12);
    expect(roleSize("title")).toBe(TYPE_ROLES.title.defaultPx);
    expect(roleSize("caption", Number.NaN)).toBe(TYPE_ROLES.caption.defaultPx);
  });

  it("applies the role case", () => {
    expect(applyRoleCase("tap two tiles", "label")).toBe("TAP TWO TILES");
    expect(applyRoleCase("TAP TWO TILES. GO!", "hint")).toBe("Tap two tiles. Go!");
    expect(applyRoleCase("swap Žemaitė with a neighbour", "hint")).toBe("Swap Žemaitė with a neighbour");
    expect(applyRoleCase("Keep As Is", "caption")).toBe("Keep As Is");
    expect(applyRoleCase("šuo", "hud")).toBe("ŠUO");
  });

  it("isTypeRole guards role names", () => {
    expect(isTypeRole("hint")).toBe(true);
    expect(isTypeRole("pixel")).toBe(false);
    expect(isTypeRole(undefined)).toBe(false);
  });
});

describe("ttCanvasFont", () => {
  it("builds a canvas font string from the role", () => {
    expect(ttCanvasFont("title", 40)).toBe(
      '900 40px "Passion One", "Passion One Fallback", "Passion One Fallback Android", sans-serif',
    );
    expect(ttCanvasFont("caption")).toBe(
      `700 ${TYPE_ROLES.caption.defaultPx}px "Nunito", "Nunito Fallback", "Nunito Fallback Android", sans-serif`,
    );
    expect(ttCanvasFont("code", 11)).toBe(`400 12px ${FONT_FAMILIES.mono}`);
  });

  it("clamps to the minimum and supports italic and a weight override", () => {
    expect(ttCanvasFont("hint", 10, { italic: true, weight: 900 })).toBe(
      'italic 900 14px "Nunito", "Nunito Fallback", "Nunito Fallback Android", sans-serif',
    );
  });
});
