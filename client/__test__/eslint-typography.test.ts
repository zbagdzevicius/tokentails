import { execFileSync } from "child_process";
import path from "path";

// Runs the real client ESLint config over fixtures in a child process (flat config is ESM, which
// jest's CommonJS runtime cannot host). Plan F4 enforcement:
// - `no-restricted-imports` (error): no Phaser in components/typography/** or design/**;
// - `tt/no-raw-font` (error since task 7b): no raw fontFamily, font:, setFontFamily(), setFont()
//   or ctx.font = outside the typography modules.
const CLIENT_ROOT = path.resolve(__dirname, "..");
const ESLINT_BIN = path.join(CLIENT_ROOT, "node_modules/eslint/bin/eslint.js");

interface LintMessage {
  line: number;
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
}

const lint = (code: string, fileName: string) => {
  let out: string;
  try {
    out = execFileSync(process.execPath, [ESLINT_BIN, "--stdin", "--stdin-filename", fileName, "--format", "json"], {
      cwd: CLIENT_ROOT,
      input: code,
      encoding: "utf8",
    });
  } catch (error) {
    out = (error as { stdout: string }).stdout;
  }
  const [result] = JSON.parse(out) as { messages: LintMessage[] }[];
  return result.messages;
};

const of = (messages: LintMessage[], ruleId: string) => messages.filter((m) => m.ruleId === ruleId);

jest.setTimeout(90_000);

describe("eslint: no Phaser in the SSR-safe typography and design modules", () => {
  const phaserImports = [
    `import Phaser from "phaser";`,
    `import { Scene } from "phaser";`,
    `import { ttText } from "@/components/Phaser/typography";`,
    `import { makeGameConfig } from "../Phaser/look/makeGameConfig";`,
    `export const x = 1;`,
  ].join("\n");

  it.each(["components/typography/__fixture__.ts", "design/__fixture__.ts"])("errors in %s", (file) => {
    const hits = of(lint(phaserImports, file), "no-restricted-imports");
    expect(hits.map((m) => m.line)).toEqual([1, 2, 3, 4]);
    expect(hits.every((m) => m.severity === 2)).toBe(true);
    expect(hits[0].message).toMatch(/plan F4/);
  });

  it("allows Phaser in the Phaser half and in scenes", () => {
    for (const file of ["components/Phaser/typography/__fixture__.ts", "components/Match3/scenes/__fixture__.ts"]) {
      expect(of(lint(`import Phaser from "phaser";\nexport default Phaser;`, file), "no-restricted-imports")).toEqual([]);
    }
  });

  it("allows data imports in the typography modules", () => {
    const code = `import { TYPE_ROLES } from "@/design/tokens";\nimport { FONT_FILES } from "./fonts.generated";\nexport { TYPE_ROLES, FONT_FILES };`;
    expect(of(lint(code, "components/typography/__fixture__.ts"), "no-restricted-imports")).toEqual([]);
  });
});

describe("eslint: raw font styling outside the typography modules", () => {
  const rawFonts = [
    `export const a = { fontFamily: "Arial Black" };`,
    `export const b = { "fontFamily": "monospace" };`,
    `export const c = { font: "bold 12px sans-serif" };`,
    `export function d(t: { setFontFamily(f: string): void }) { t.setFontFamily("Pixelify Sans"); }`,
    `export function e(t: { setFont(f: string): void }) { t.setFont("pixel-font"); }`,
    `export function f(ctx: CanvasRenderingContext2D) { ctx.font = "16px monospace"; }`,
    `export const g = () => <span style={{ fontFamily: "proxima-nova" }}>x</span>;`,
  ].join("\n");

  it("errors on each pattern in a scene or component", () => {
    const hits = of(lint(rawFonts, "components/Match3/__fixture__.tsx"), "tt/no-raw-font");
    expect(hits.map((m) => m.line)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hits.every((m) => m.severity === 2)).toBe(true);
    expect(hits[0].message).toMatch(/type role/);
  });

  it.each([
    "components/typography/__fixture__.tsx",
    "components/Phaser/typography/__fixture__.tsx",
    "design/__fixture__.tsx",
  ])("is allowed in %s", (file) => {
    expect(of(lint(rawFonts, file), "tt/no-raw-font")).toEqual([]);
  });

  it("does not flag reading a font or unrelated keys", () => {
    const code = [
      `export const a = (ctx: CanvasRenderingContext2D) => ctx.font;`,
      `export const b = { fontSize: 12, fontWeight: 700, family: "x" };`,
      `export const c = () => <p className="font-primary">x</p>;`,
    ].join("\n");
    expect(of(lint(code, "components/__fixture__.tsx"), "tt/no-raw-font")).toEqual([]);
  });

  it("errors on kebab-case keys, CSS strings, Tailwind arbitrary families and font-mono", () => {
    const code = [
      `export const a = { "font-family": "Nunito" };`,
      `export const b = "font-family: proxima-nova";`,
      "export const c = (x: string) => `h1 { font-family:${x} }`;",
      `export const d = () => <p className="font-['Pixelify_Sans'] text-xs">x</p>;`,
      `export const e = () => <code className="font-mono">x</code>;`,
      "export const f = (on: boolean) => `px-2 ${on ? 'a' : 'b'} md:font-mono`;",
      `export const g = () => <p className="text-xs font-[Arial]">x</p>;`,
    ].join("\n");
    const hits = of(lint(code, "components/__fixture__.tsx"), "tt/no-raw-font");
    expect(hits.map((m) => m.line)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hits.every((m) => m.severity === 2)).toBe(true);
    expect(hits[4].message).toMatch(/tx hashes only/);
  });

  it("does not flag brand font classes, arbitrary weights or lookalike words", () => {
    const code = [
      `export const a = () => <p className="font-primary font-bold font-[800] text-xs">x</p>;`,
      `export const b = "font-monospace-like is not a class here";`,
      `export const c = { fontSize: "12px", "font-size": "12px", "font-weight": 700 };`,
      `export const d = "the font family is Nunito";`,
    ].join("\n");
    expect(of(lint(code, "components/__fixture__.tsx"), "tt/no-raw-font")).toEqual([]);
  });

  it("allows the new patterns in the typography modules", () => {
    const code = `export const a = { "font-family": "x" };\nexport const b = "font-mono font-family: y";`;
    expect(of(lint(code, "components/typography/__fixture__.ts"), "tt/no-raw-font")).toEqual([]);
  });

  it("exempts the embeddable Rail widget, which renders in a shadow root on other sites", () => {
    const code = `var CSS = ":host{font-family:system-ui,sans-serif}";`;
    expect(of(lint(code, "public/rail/__fixture__.js"), "tt/no-raw-font")).toEqual([]);
  });

  it("keeps the boxicons rule an error alongside it", () => {
    const bx = "b" + "x";
    const code = `export const A = () => <i className="${bx} ${bx}-x" style={{ fontFamily: "a" }} />;`;
    const messages = lint(code, "components/__fixture__.tsx");
    expect(of(messages, "no-restricted-syntax").map((m) => m.severity)).toEqual([2]);
    expect(of(messages, "tt/no-raw-font").map((m) => m.severity)).toEqual([2]);
  });
});
