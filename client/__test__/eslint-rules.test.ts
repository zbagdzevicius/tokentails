import { execFileSync } from "child_process";
import path from "path";

// Runs the real client ESLint config (eslint.config.mjs) over fixtures in a
// child process: flat config is ESM and loads through dynamic import, which
// jest's CommonJS runtime cannot host.
const CLIENT_ROOT = path.resolve(__dirname, "..");
const ESLINT_BIN = path.join(CLIENT_ROOT, "node_modules/eslint/bin/eslint.js");

interface LintMessage {
  line: number;
  ruleId: string | null;
  message: string;
}

const lint = (code: string, fileName = "components/__eslint_fixture__.tsx") => {
  let out: string;
  try {
    out = execFileSync(
      process.execPath,
      [ESLINT_BIN, "--stdin", "--stdin-filename", fileName, "--format", "json"],
      { cwd: CLIENT_ROOT, input: code, encoding: "utf8" }
    );
  } catch (error) {
    // ESLint exits 1 when it reports errors; the JSON is still on stdout.
    out = (error as { stdout: string }).stdout;
  }
  const [result] = JSON.parse(out) as { messages: LintMessage[] }[];
  return result.messages;
};

const boxiconLines = (code: string, fileName?: string) =>
  lint(code, fileName)
    .filter(
      (m) =>
        m.ruleId === "no-restricted-syntax" && m.message.includes("boxicons")
    )
    .map((m) => m.line);

jest.setTimeout(60_000);

describe("eslint: boxicons classes are banned (plan F3.6)", () => {
  // Built from parts so this test file does not trip the rule it tests
  // (it is also listed in the rule's ignores).
  const bx = "b" + "x";

  it("flags bx classes in string literals, className and template parts", () => {
    const code = [
      `export const A = () => <i className="${bx} ${bx}-x-circle text-h5" />;`,
      `export const B = (x: string) => <i className={\`${bx} text-gray-500 \${x}\`} />;`,
      `export const C = "${bx}l-apple";`,
      `export const D = () => <i className={\`text-p1 ${bx}s-key\`} />;`,
      `export const E = { icon: "${bx}-x-circle" };`,
      `export const F = () => <i className={"${bx}"} />;`,
    ].join("\n");
    expect(boxiconLines(code)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("leaves look-alike words and PixelIcon alone", () => {
    const code = [
      `import { PixelIcon } from "@/components/shared/PixelIcon";`,
      `export const A = "sandbox-x inbox box ${bx}x ${bx}9";`,
      `export const B = () => <PixelIcon name="close" className="text-h5" />;`,
      "export const C = `flex-box ${1}`;",
    ].join("\n");
    expect(boxiconLines(code)).toEqual([]);
  });

  it("applies to pages, context and layouts too", () => {
    const code = `export const A = () => <i className="${bx} ${bx}s-copy" />;\n`;
    for (const file of [
      "pages/__fixture__.tsx",
      "context/__fixture__.tsx",
      "layouts/__fixture__.tsx",
    ]) {
      expect(boxiconLines(code, file)).toEqual([1]);
    }
  });

  it("keeps react-hooks/rules-of-hooks off (known issue, not flipped here)", () => {
    const code = [
      "import { useState } from 'react';",
      "export function notAComponent(flag: boolean) {",
      "  if (flag) { useState(0); }",
      "}",
    ].join("\n");
    expect(
      lint(code).filter((m) => m.ruleId === "react-hooks/rules-of-hooks")
    ).toEqual([]);
  });
});
