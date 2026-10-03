import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// check-palette.mjs is an ES module; drive it as a CLI on a temp client root.
const SCRIPT = path.resolve(__dirname, "../scripts/check-palette.mjs");
const TOKENS = `export const NIGHT = {\n  950: "#07051a",\n  900: "#0b0820",\n  800: "#120d1f",\n  700: "#1e1633",\n  600: "#2a1f45",\n  500: "#3a2d5c",\n} as const;\n`;

function fixture(files: Record<string, string>, allowlist?: object) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-palette-"));
  const all: Record<string, string> = { "design/tokens.ts": TOKENS, ...files };
  for (const [name, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  const allow = path.join(root, "allow.json");
  fs.writeFileSync(allow, JSON.stringify(allowlist || { entries: [] }));
  return { root, allow };
}

function run(root: string, allow: string, extra: string[] = []) {
  const res = spawnSync(process.execPath, [SCRIPT, "--root", root, "--allowlist", allow, "--json", ...extra], {
    encoding: "utf8",
  });
  return { status: res.status, report: JSON.parse(res.stdout) };
}

describe("check-palette (plan G6 guard)", () => {
  it("flags a full-screen overlay on the cream sheet, on white, or with an arbitrary z", () => {
    const { root, allow } = fixture({
      "components/A.tsx": `export const A = () => <div className="fixed inset-0 bg-yellow-300 z-modal" />;`,
      "components/B.tsx": `export const B = () => <div className="fixed inset-0 bg-tt-cream/50 z-modal" />;`,
      "components/C.tsx": `export const C = () => <div className="fixed inset-0 bg-white" />;`,
      "components/D.tsx": "export const D = () => <div className={`fixed inset-0 ${x}\n  z-[9999] flex`} />;",
    });
    const { status, report } = run(root, allow);
    expect(status).toBe(1);
    const got = report.findings.map((f: { file: string; rule: string; line: number }) => `${f.file}:${f.line}:${f.rule}`).sort();
    expect(got).toEqual([
      "components/A.tsx:1:overlay-cream",
      "components/B.tsx:1:overlay-cream",
      "components/C.tsx:1:overlay-white",
      "components/D.tsx:1:overlay-z",
    ]);
  });

  it("passes night overlays on layers, and non-overlay cream or white surfaces", () => {
    const { root, allow } = fixture({
      "components/Ok.tsx": [
        `export const S = () => <div className="fixed inset-0 bg-tt-night-950/70 z-modal" />;`,
        `export const P = () => <div className="rounded-xl bg-tt-cream border-white bg-white z-[120]" />;`,
        `export const Q = () => <div className="absolute inset-0 bg-white" />;`,
      ].join("\n"),
    });
    const { status, report } = run(root, allow);
    expect(report.findings).toEqual([]);
    expect(status).toBe(0);
  });

  it("reads overlays whose classes are split across strings, helpers, consts or other spellings", () => {
    const { root, allow } = fixture({
      "components/Clsx.tsx": `export const A = () => <div className={clsx("fixed", "inset-0 bg-white")} />;`,
      "components/Cond.tsx": `export const B = () => <div className={open ? "fixed inset-0" : "hidden"} data-x="1" />;\nconst k = "bg-yellow-300";`,
      "components/Const.tsx": [
        `const fixedFullscreenClass = "fixed inset-0";`,
        "export const C = () => <div className={`${fixedFullscreenClass} flex z-[3]`} />;",
      ].join("\n"),
      "components/Spelled.tsx": [
        `export const D = () => <div className="flex w-full h-full fixed top-0 left-0 z-[101]" />;`,
        `export const E = () => <div className="fixed top-0 left-0 w-screen h-screen bg-white" />;`,
        `export const F = () => <div className="fixed inset-x-0 inset-y-0 bg-tt-cream" />;`,
        `export const G = () => <div className={cn("fixed top-0 left-0 right-0", "bottom-0", "bg-white")} />;`,
      ].join("\n"),
    });
    const got = run(root, allow).report.findings.map((f: { file: string; line: number; rule: string }) => `${f.file}:${f.line}:${f.rule}`).sort();
    expect(got).toEqual([
      "components/Clsx.tsx:1:overlay-white",
      "components/Const.tsx:2:overlay-z",
      "components/Spelled.tsx:1:overlay-z",
      "components/Spelled.tsx:2:overlay-white",
      "components/Spelled.tsx:3:overlay-cream",
      "components/Spelled.tsx:4:overlay-white",
    ]);
  });

  it("does not join strings from different elements or treat partial covers as overlays", () => {
    const { root, allow } = fixture({
      "components/Ok.tsx": [
        `export const A = () => <><div className="fixed" /><div className="inset-0 bg-white" /></>;`,
        `export const B = () => <div className="fixed top-0 left-0 w-full bg-white" />;`,
        `export const C = () => <div className="fixed bottom-0 inset-x-0 bg-white" />;`,
        `export const D = () => <div className={clsx("absolute", "inset-0 bg-white")} />;`,
      ].join("\n"),
    });
    expect(run(root, allow).report.findings).toEqual([]);
  });

  it("flags night hex literals outside the token files, in any case, and not in tokens", () => {
    const { root, allow } = fixture({
      "components/Hex.tsx": `const bg = "#0B0820";\nconst ok = "#123456";\nconst panel = "#1e1633";`,
      "styles/x.scss": `.a { background: #120d1f; }`,
      "styles/tokens.css": `:root { --tt-night-900: 11 8 32; /* #0b0820 */ }`,
    });
    const { report } = run(root, allow);
    const got = report.findings.map((f: { file: string; line: number; rule: string }) => `${f.file}:${f.line}:${f.rule}`).sort();
    expect(got).toEqual(["components/Hex.tsx:1:night-hex", "components/Hex.tsx:3:night-hex", "styles/x.scss:1:night-hex"]);
  });

  it("reads the night ramp from design/tokens.ts, so a new night value is guarded without editing the script", () => {
    const { root, allow } = fixture({
      "design/tokens.ts": TOKENS.replace('500: "#3a2d5c",', '500: "#3a2d5c",\n  400: "#4b3d70",'),
      "components/New.tsx": `const c = "#4b3d70";`,
    });
    expect(run(root, allow).report.findings.map((f: { rule: string }) => f.rule)).toEqual(["night-hex"]);
  });

  it("allowlist entries suppress per file and rule, and unused entries are reported stale", () => {
    const { root, allow } = fixture(
      {
        "components/Modal.tsx": `export const M = () => <div className="fixed inset-0 z-[100]" />;`,
        "components/Other.tsx": `export const O = () => <div className="fixed inset-0 z-[100]" />;`,
      },
      {
        entries: [
          { file: "components/Modal.tsx", rule: "overlay-z", reason: "W4", until: "W4" },
          { file: "components/Gone.tsx", rule: "overlay-z", reason: "W4", until: "W4" },
        ],
      },
    );
    const { report } = run(root, allow);
    expect(report.allowed.map((a: { file: string }) => a.file)).toEqual(["components/Modal.tsx"]);
    expect(report.findings.map((f: { file: string }) => f.file)).toEqual(["components/Other.tsx"]);
    expect(report.stale.map((s: { file: string }) => s.file)).toEqual(["components/Gone.tsx"]);
  });

  it("an allowlist entry covers only `max` findings (default 1); one more fails and is reported", () => {
    const two = `export const M = () => <><div className="fixed inset-0 z-[100]" />\n<div className="fixed inset-0 z-[101]" /></>;`;
    const { root, allow } = fixture(
      { "components/Two.tsx": two, "components/One.tsx": two, "components/Spare.tsx": `<div className="fixed inset-0 z-[9]" />` },
      {
        entries: [
          { file: "components/Two.tsx", rule: "overlay-z", max: 2, reason: "W4", until: "W4" },
          { file: "components/One.tsx", rule: "overlay-z", reason: "W4", until: "W4" },
          { file: "components/Spare.tsx", rule: "overlay-z", max: 3, reason: "W4", until: "W4" },
        ],
      },
    );
    const { status, report } = run(root, allow);
    expect(status).toBe(1);
    expect(report.findings.map((f: { file: string; line: number }) => `${f.file}:${f.line}`)).toEqual(["components/One.tsx:2"]);
    expect(report.exceeded).toEqual([{ file: "components/One.tsx", rule: "overlay-z", max: 1, found: 2 }]);
    expect(report.slack).toEqual([{ file: "components/Spare.tsx", rule: "overlay-z", max: 3, found: 1 }]);
    expect(report.allowed).toHaveLength(4); // Two.tsx 2, One.tsx 1, Spare.tsx 1
  });

  it("--warn reports findings but exits 0 (warn mode until task 7b)", () => {
    const { root, allow } = fixture({ "components/C.tsx": `<div className="fixed inset-0 bg-white" />` });
    expect(run(root, allow).status).toBe(1);
    expect(run(root, allow, ["--warn"]).status).toBe(0);
  });

  it("never scans the Heist build or public/", () => {
    const { root, allow } = fixture({
      "public/heist-game/index.html": `<style>body{background:#0b0820}</style>`,
      "components/heist-game/x.html": `<style>body{background:#0b0820}</style>`,
    });
    expect(run(root, allow).report.findings).toEqual([]);
  });

  it("the committed allowlist is well formed and names real files (warn mode on the real tree)", () => {
    const client = path.resolve(__dirname, "..");
    const list = JSON.parse(fs.readFileSync(path.join(client, "scripts/check-palette.allowlist.json"), "utf8"));
    const rules = ["overlay-cream", "overlay-white", "overlay-z", "night-hex"];
    expect(list.entries.length).toBeGreaterThan(0);
    for (const e of list.entries) {
      expect(fs.existsSync(path.join(client, e.file))).toBe(true);
      expect(rules).toContain(e.rule);
      expect(typeof e.reason).toBe("string");
      expect(typeof e.until).toBe("string");
      expect(Number.isInteger(e.max) && e.max > 0).toBe(true);
    }
    // Warn mode never fails, whatever other work in progress adds.
    const res = spawnSync(process.execPath, [SCRIPT, "--warn", "--json"], { encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(Array.isArray(JSON.parse(res.stdout).findings)).toBe(true);
  });
});
