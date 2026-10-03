/**
 * Typography call sites (plan G12 "Call-site migration", F4; decisions #80, #81, #82, #85, #92).
 *
 * - Every font family named in client code or the Catnip Heist UI is one the app declares (the
 *   self-hosted brand faces, the Heist's own Cat Paw, the system mono stack of the `code` role, or
 *   the platform faces the Google and Apple sign-in buttons must use by their brand rules).
 * - No Phaser scene or game object creates Text outside the `ttText` factory, and every scene's
 *   `preload` starts with `preloadTTFonts(this)`, so no Text is drawn before the faces load.
 * - The unlicensed pixel fonts are gone from `public/` and nothing loads them.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { FONT_FAMILIES } from "@/design/tokens";

const CLIENT = path.resolve(__dirname, "..");
const REPO = path.resolve(CLIENT, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const CODE_DIRS = ["components", "pages", "layouts", "lib", "hooks", "context"].map((d) => path.join(CLIENT, d)).filter(existsSync);
const SKIP = [path.join(CLIENT, "components", "typography"), path.join(CLIENT, "components", "Phaser", "typography")];
const clientFiles = CODE_DIRS.flatMap((d) => walk(d)).filter((f) => !SKIP.some((s) => f.startsWith(s)));
const heistUi = path.join(REPO, "catnip-heist", "src", "ui");
const heistFiles = existsSync(heistUi) ? walk(heistUi).filter((f) => !f.includes("__tests__")) : [];

/** Families any surface may name. */
const DECLARED = new Set(
  [
    FONT_FAMILIES.display,
    FONT_FAMILIES.hud,
    FONT_FAMILIES.body,
    `${FONT_FAMILIES.display} Fallback`,
    `${FONT_FAMILIES.hud} Fallback`,
    `${FONT_FAMILIES.body} Fallback`,
    `${FONT_FAMILIES.display} Fallback Android`,
    `${FONT_FAMILIES.body} Fallback Android`,
    "Roboto", // Google sign-in button (self-hosted, G9)
    "paws", // the paw-print icon font declared in globals.scss
    "Cat Paw", // the Heist brand face, shipped in catnip-heist/public/assets/fonts
    // Generic families and the system stacks (`code` role, sign-in button platform faces).
    "sans-serif",
    "serif",
    "monospace",
    "system-ui",
    "ui-rounded",
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Consolas",
    "inherit",
    "-apple-system",
    "BlinkMacSystemFont",
    "SF Pro Text",
    "Helvetica Neue",
    "Arial",
  ].map((f) => f.toLowerCase()),
);
/** Platform faces allowed only in the sign-in buttons, whose brand rules require them. */
const BRAND_BUTTON_ONLY = new Set(["-apple-system", "blinkmacsystemfont", "sf pro text", "helvetica neue", "arial"]);

/** Family lists in `fontFamily: "..."`, `family: '...'`, `font-family: ...` and `ctx.font = "..."`. */
function familiesIn(source: string): string[] {
  const lists: string[] = [];
  const patterns = [
    /fontFamily\s*:\s*(["'`])([^"'`]+)\1/g,
    /\bfamily\s*:\s*(["'`])([^"'`]+)\1/g,
    /font-family\s*:\s*([^;}{`]+)[;}]/g,
  ];
  for (const re of patterns) {
    Array.from(source.matchAll(re)).forEach((m) => lists.push(m[2] ?? m[1]));
  }
  for (const m of Array.from(source.matchAll(/\.font\s*=\s*(["'`])([^"'`]+)\1/g))) {
    // "bold 2em proxima-nova" -> the family part after the size.
    const fam = m[2].replace(/^.*?\d+(\.\d+)?(px|em|rem|pt)\s+/, "");
    lists.push(fam);
  }
  return lists
    .flatMap((list) => list.split(","))
    // `!important` is a CSS priority flag, not part of the family name.
    .map((f) => f.replace(/\s*!important\s*$/i, "").trim().replace(/^["']|["']$/g, "").trim())
    .filter((f) => f.length > 0 && !f.includes("${") && !/^var\(/.test(f) && !/^[A-Z_]+$/.test(f));
}

describe("typography call sites", () => {
  it("names only declared families in client code and the Heist UI", () => {
    const bad: string[] = [];
    for (const file of [...clientFiles, ...heistFiles]) {
      const rel = path.relative(REPO, file);
      for (const family of familiesIn(readFileSync(file, "utf8"))) {
        const key = family.toLowerCase();
        if (!DECLARED.has(key)) bad.push(`${rel}: "${family}"`);
        else if (BRAND_BUTTON_ONLY.has(key) && !rel.includes("auth/BrandSignInButton")) bad.push(`${rel}: "${family}" (sign-in buttons only)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no longer names the undeclared families of the G12 audit", () => {
    const pattern = /Pixelify|proxima-nova|Space Grotesk|Plus Jakarta|Arial Black|pixel-font/;
    const hits = clientFiles.filter((f) => pattern.test(readFileSync(f, "utf8"))).map((f) => path.relative(REPO, f));
    expect(hits).toEqual([]);
  });

  // The spec's acceptance grep, run in-process (the shell `rg` is not reliable here). The one
  // approved exception is the sign-in buttons' brand-mandated platform stack (Arial), see 3e.md.
  it('acceptance: no "Pixelify|proxima-nova|Arial|monospace" in components and pages outside typography', () => {
    const scope = [path.join(CLIENT, "components"), path.join(CLIENT, "pages")];
    const APPROVED = ["components/shared/auth/BrandSignInButton.tsx"];
    const hits = clientFiles
      .filter((f) => scope.some((s) => f.startsWith(s)))
      .filter((f) => !APPROVED.includes(path.relative(CLIENT, f)))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => (/Pixelify|proxima-nova|Arial|monospace/.test(line) ? `${path.relative(CLIENT, f)}:${i + 1}` : ""))
          .filter(Boolean),
      );
    expect(hits).toEqual([]);
  });

  const SCENES = [
    "components/Match3/scenes/Match3Scene.ts",
    "components/CatnipChaos/scenes/CatnipChaos.ts",
    "components/PixelRescue/scenes/PixelRescueScene.ts",
    "components/shelter/scenes/ShelterScene.ts",
    "components/base/scenes/BaseScene.ts",
  ];

  it("covers every Phaser scene in the client", () => {
    const scenes = clientFiles
      .filter((f) => /class \w+ extends (Phaser\.)?Scene\b/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(CLIENT, f))
      .sort();
    expect(scenes).toEqual([...SCENES].sort());
  });

  it.each(SCENES)("%s calls preloadTTFonts(this) first in preload", (rel) => {
    const source = readFileSync(path.join(CLIENT, rel), "utf8");
    const body = /\n {2}preload\(\)\s*\{([\s\S]*?)\n {2}\}/.exec(source)?.[1] ?? "";
    const firstStatement = body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("//"));
    expect(firstStatement).toBe("preloadTTFonts(this);");
  });

  it("creates game text only through the ttText factory", () => {
    const gameDirs = ["Match3", "CatnipChaos", "PixelRescue", "shelter", "base", "catbassadors", "Phaser"].map((d) =>
      path.join(CLIENT, "components", d),
    );
    const offenders = clientFiles
      .filter((f) => gameDirs.some((d) => f.startsWith(d)))
      .filter((f) => /\badd\s*\.\s*text\s*\(|new\s+Phaser\.GameObjects\.Text\s*\(|\bmake\s*\.\s*text\s*\(/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(CLIENT, f));
    expect(offenders).toEqual([]);
  });

  it("ships no unlicensed pixel font and loads none from the CDN (decision #81)", () => {
    expect(existsSync(path.join(CLIENT, "public", "pixel-rescue", "fonts"))).toBe(false);
    const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "client/public"], {
      cwd: REPO,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /pixel-text\d*\.ttf$/.test(f) && existsSync(path.join(REPO, f)));
    expect(tracked).toEqual([]);
    const loads = clientFiles.filter((f) => /load\.font\s*\(/.test(readFileSync(f, "utf8"))).map((f) => path.relative(CLIENT, f));
    expect(loads).toEqual([]);
  });

  it("the share card and the Wheel draw with ttCanvasFont roles, the tx hash in `code`", () => {
    const card = readFileSync(path.join(CLIENT, "components", "shelter-payouts", "shareCard.ts"), "utf8");
    expect(card).toMatch(/await loadGameFonts\(\)/);
    expect(card).toMatch(/ttCanvasFont\("code", \d+\)[\s\S]*txHash/);
    expect(card).not.toMatch(/\.font\s*=\s*["'`]/);
    // Night palette from the tokens (plan G6, review 3e #6): no hex literals, no emoji drawn in a
    // text role.
    expect(card).toMatch(/NIGHT\[900\]/);
    expect(card).not.toMatch(/["'`]#[0-9a-f]{3,8}["'`]/i);
    expect(card).not.toMatch(/[\uD800-\uDBFF][\uDC00-\uDFFF]/);
    const wheel = readFileSync(path.join(CLIENT, "components", "shared", "Wheel.tsx"), "utf8");
    expect(wheel).not.toMatch(/\.font\s*=\s*["'`]/);
    expect(wheel).toMatch(/loadGameFonts\(\)\.then/);
  });
});
