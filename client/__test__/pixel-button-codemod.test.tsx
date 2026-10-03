import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// The codemod is an ES module run with node; drive it as a CLI on a temp file.
const SCRIPT = path.resolve(__dirname, "../scripts/codemods/pixel-button.mjs");

const run = (source: string, dry = false) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-button-codemod-"));
  const file = path.join(dir, "Fixture.tsx");
  fs.writeFileSync(file, source);
  const stdout = execFileSync(
    process.execPath,
    [SCRIPT, ...(dry ? ["--dry"] : []), file],
    { encoding: "utf8" }
  );
  const output = fs.readFileSync(file, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { stdout, output };
};

describe("pixel-button codemod", () => {
  it("rewrites bare flags to size literals and renames props", () => {
    const { output } = run(
      [
        `<PixelButton isSmall text="A" />;`,
        `<PixelButton text="B" isBig isDisabled={busy} />;`,
        `<PixelButton isWidthFull text="C" />;`,
        `<Tag isSmall>new</Tag>;`,
        `<Countdown targetDate={d} isBig />;`,
        `<Snowfall isSmall />;`,
      ].join("\n")
    );
    expect(output).toBe(
      [
        `<PixelButton size="sm" text="A" />;`,
        `<PixelButton text="B" size="lg" disabled={busy} />;`,
        `<PixelButton fullWidth text="C" />;`,
        `<Tag size="sm">new</Tag>;`,
        `<Countdown targetDate={d} size="lg" />;`,
        `<Snowfall size="sm" />;`,
      ].join("\n")
    );
  });

  it("turns expressions into a ternary with the default size and drops false", () => {
    const { output } = run(
      [
        `<PixelButton isSmall={!canRedeem} text="A" />;`,
        `<PixelButton\n  isSmall={false}\n  text="B"\n/>;`,
        `<PixelButton isBig={true} text="C" />;`,
      ].join("\n")
    );
    expect(output).toBe(
      [
        `<PixelButton size={!canRedeem ? "sm" : "md"} text="A" />;`,
        `<PixelButton\n  text="B"\n/>;`,
        `<PixelButton size="lg" text="C" />;`,
      ].join("\n")
    );
  });

  it("leaves unsafe cases alone and lists them as MANUAL", () => {
    const source = [
      `<PixelButton isMedium={wide} text="A" />;`,
      `<PixelButton isSmall isBig text="B" />;`,
      `<PixelButton isSmall size="lg" text="C" />;`,
    ].join("\n");
    const { output, stdout } = run(source);
    expect(output).toBe(source);
    expect(stdout).toContain("MANUAL (3)");
  });

  it("ignores other components and non-JSX text", () => {
    const source = [
      `const isSmall = true;`,
      `<Other isSmall text="A" />;`,
      `<PixelButton text={isSmall ? "x" : "y"} />;`,
    ].join("\n");
    expect(run(source).output).toBe(source);
  });

  it("--dry prints counts and writes nothing", () => {
    const source = `<PixelButton isSmall text="A" />;\n<Tag isSmall>x</Tag>;\n`;
    const { output, stdout } = run(source, true);
    expect(output).toBe(source);
    expect(stdout).toContain("[dry run] 1 file(s)");
    expect(stdout).toContain("PixelButton.isSmall -> size: 1");
    expect(stdout).toContain("Tag.isSmall -> size: 1");
    expect(stdout).toContain("total: 2");
  });
});
