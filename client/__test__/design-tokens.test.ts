import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../tailwind.config";
import { GOLD, INK, LAYERS, NIGHT, THEME_COLOR, TT_COLORS } from "@/design/tokens";

const root = join(__dirname, "..");
const script = join(root, "scripts", "build-tokens.mjs");

function hexToTriplet(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

describe("design tokens (F3.1)", () => {
  it("keeps the plan's anchor values", () => {
    expect(NIGHT[900]).toBe("#0b0820");
    expect(THEME_COLOR).toBe("#0b0820");
    expect(NIGHT[950]).toBe("#07051a");
    expect(GOLD[400]).toBe("#ffcc55");
    expect(GOLD.ink).toBe("#4a1d08");
    expect(INK.cream).toBe("#fcecbb");
    expect(TT_COLORS["night-900"]).toBe("#0b0820");
    expect(TT_COLORS["gold-ink"]).toBe("#4a1d08");
    expect(TT_COLORS.cream).toBe("#fcecbb");
    expect(TT_COLORS["dusk-horizon"]).toBe("#ee8a5c");
    expect(TT_COLORS["parchment-from"]).toBeDefined();
  });

  it("has the F3.2 z scale exactly", () => {
    expect(LAYERS).toEqual({
      hud: 40,
      gate: 80,
      modal: 100,
      "modal-nested": 110,
      auth: 200,
      intro: 300,
      reveal: 400,
      celebration: 450,
      toast: 500,
      system: 600,
    });
  });

  it("tokens.css is generated and current (build-tokens --check)", () => {
    const result = spawnSync(process.execPath, [script, "--check"], { cwd: root, encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("tokens.css declares every colour as an RGB triplet and every layer", () => {
    const css = readFileSync(join(root, "styles", "tokens.css"), "utf8");
    for (const [name, hex] of Object.entries(TT_COLORS)) {
      expect(css).toContain(`--tt-${name}: ${hexToTriplet(hex)};`);
    }
    for (const [name, z] of Object.entries(LAYERS)) {
      expect(css).toContain(`--tt-z-${name}: ${z};`);
    }
    expect(css).toContain("--tt-night-900: 11 8 32;");
  });

  it("globals.scss loads tokens.css", () => {
    const scss = readFileSync(join(root, "styles", "globals.scss"), "utf8");
    expect(scss).toMatch(/@use "\.\/tokens";/);
  });

  describe("tailwind.config.ts", () => {
    const theme = resolveConfig(tailwindConfig).theme as unknown as {
      zIndex: Record<string, string>;
      colors: Record<string, unknown>;
      animation: Record<string, string>;
    };

    it("does not fill the modal enter transforms forwards (fixed children keep the viewport)", () => {
      for (const name of ["tt-modal-in", "tt-sheet-in"]) {
        expect(theme.animation[name]).toMatch(/\bbackwards$/);
        expect(theme.animation[name]).not.toMatch(/\b(both|forwards)\b/);
      }
    });

    it("exposes the layers as z-* utilities", () => {
      for (const [name, z] of Object.entries(LAYERS)) {
        expect(theme.zIndex[name]).toBe(String(z));
      }
      // The defaults still exist.
      expect(theme.zIndex["50"]).toBe("50");
    });

    it("maps colors.tt.* onto the CSS variables with an alpha slot", () => {
      const tt = theme.colors.tt as Record<string, string>;
      expect(tt["night-900"]).toBe("rgb(var(--tt-night-900) / <alpha-value>)");
      expect(Object.keys(tt).sort()).toEqual(Object.keys(TT_COLORS).sort());
    });

    it("keeps the portrait names; the yellow.300 override is gone (G6, task 7b)", () => {
      expect(theme.colors.gold).toBe("hsl(var(--gold))");
      expect(theme.colors["gold-muted"]).toBe("hsl(var(--gold-muted))");
      expect(theme.colors["gold-light"]).toBe("hsl(var(--gold-light))");
      expect(theme.colors.cream).toBe("hsl(var(--cream))");
      // Tailwind's own yellow ramp again, not the old cream value (use tt-cream for cream).
      expect((theme.colors.yellow as Record<string, string>)["300"]).not.toBe("#FCECBB");
      expect((theme.colors.yellow as Record<string, string>)["500"]).toBeDefined();
    });

    it("no app source uses yellow-300 any more (the override's removal condition, plan F3.1)", () => {
      const out = spawnSync(
        "grep",
        ["-rlE", "yellow-300|colors\\.yellow\\.300", "components", "pages", "layouts", "features", "context", "hooks", "constants", "styles", "lib", "design", "app"],
        { cwd: root, encoding: "utf8" }
      );
      const files = out.stdout
        .split("\n")
        .filter(Boolean)
        // tokens.ts only mentions the old name in a comment about the cream ramp.
        .filter((f) => f !== "design/tokens.ts");
      expect(files).toEqual([]);
    });
  });
});
