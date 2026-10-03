import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// night-tokens.mjs is an ES module; drive it as a CLI on temp files (explicit paths skip the
// ownership filter).
const SCRIPT = path.resolve(__dirname, "../scripts/codemods/night-tokens.mjs");

function run(source: string, name = "Fixture.tsx", dry = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "night-tokens-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, source);
  const res = spawnSync(process.execPath, [SCRIPT, "--json", ...(dry ? ["--dry"] : []), file], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr);
  return { text: fs.readFileSync(file, "utf8"), report: JSON.parse(res.stdout) };
}

describe("night-tokens codemod (plan G6)", () => {
  it("step 2: renames every yellow-300 utility to tt-cream, keeping variants, ! and opacity", () => {
    const src = [
      `<div className="bg-yellow-300 border-4 border-yellow-300/80 hover:text-yellow-300 md:!bg-yellow-300/50" />`,
      "<div className={`from-yellow-300 via-yellow-300/70 to-yellow-300/0 ${a ? 'ring-yellow-300' : ''}`} />",
      `.a { @apply bg-yellow-300 px-4; color: theme("colors.yellow.300"); }`,
    ].join("\n");
    const { text, report } = run(src);
    expect(text).toBe(
      [
        `<div className="bg-tt-cream border-4 border-tt-cream/80 hover:text-tt-cream md:!bg-tt-cream/50" />`,
        "<div className={`from-tt-cream via-tt-cream/70 to-tt-cream/0 ${a ? 'ring-tt-cream' : ''}`} />",
        `.a { @apply bg-tt-cream px-4; color: theme("colors.tt.cream"); }`,
      ].join("\n"),
    );
    expect(report.totals.yellow300).toBe(10);
  });

  it("leaves look-alikes alone (yellow-3000, my-yellow-300 class names, other shades)", () => {
    const src = `<div className="bg-yellow-3000 my-yellow-300x bg-yellow-200 text-yellow-900x" />`;
    expect(run(src).text).toBe(src);
  });

  it("step 3: text-yellow-900 becomes gold ink on light surfaces and cream ink on night surfaces", () => {
    const src = [
      `<p className="bg-yellow-300 text-yellow-900" />`,
      `<p className="bg-white/90 hover:text-yellow-900/80" />`,
      `<p className="bg-tt-night-700 text-yellow-900" />`,
      `<p className="bg-black text-yellow-900" />`,
    ].join("\n");
    const { text, report } = run(src);
    expect(text.split("\n")).toEqual([
      `<p className="bg-tt-cream text-tt-gold-ink" />`,
      `<p className="bg-white/90 hover:text-tt-gold-ink/80" />`,
      `<p className="bg-tt-night-700 text-tt-cream" />`,
      `<p className="bg-black text-tt-cream" />`,
    ]);
    expect(report.totals.yellow900).toEqual({ light: 2, night: 2, inherited: 0 });
  });

  it("step 3: no surface in the class string -> gold ink, listed for review with its line", () => {
    const { text, report } = run(`const a = 1;\n<div className="font-primary text-yellow-900" />`);
    expect(text).toContain(`"font-primary text-tt-gold-ink"`);
    expect(report.totals.yellow900.inherited).toBe(1);
    expect(report.review).toEqual([expect.objectContaining({ line: 2 })]);
  });

  it("--dry writes nothing but reports the same counts", () => {
    const src = `<p className="bg-yellow-300 text-yellow-900" />`;
    const { text, report } = run(src, "Fixture.tsx", true);
    expect(text).toBe(src);
    expect(report.totals.yellow300).toBe(1);
    expect(report.changed).toHaveLength(1);
  });

  it("is idempotent", () => {
    const once = run(`<p className="bg-yellow-300 text-yellow-900" />`).text;
    expect(run(once).text).toBe(once);
  });

  it("the default run skips files other tasks own and keeps out-of-scope ink (dry)", () => {
    const res = spawnSync(process.execPath, [SCRIPT, "--dry", "--json"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    const report = JSON.parse(res.stdout);
    const changed: string[] = report.changed.map((c: { file: string }) => c.file);
    // Already migrated by task 3d: nothing left to rewrite in its own files.
    expect(changed).toEqual([]);
    report.skippedOwnedElsewhere.forEach((s: { file: string }) =>
      expect(s.file).toMatch(/^(components\/(Match3|CatnipChaos|PixelRescue|landing|globe|shelter-payouts|shelter|base|Phaser|claims)\/|components\/shared\/(SignIn|Toast|Wheel)\.tsx|pages\/|context\/|api\/|features\/portrait\/components\/AboutUsModal\.tsx|components\/blog\/feed\/ArticlePageLayout\.tsx|components\/game\/Game\.tsx)/),
    );
    report.left.forEach((l: { yellow300: number; outOfScope: boolean }) => {
      expect(l.yellow300).toBe(0);
      expect(l.outOfScope).toBe(true);
    });
  });
});
