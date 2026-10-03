import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// Plan F1 bundle guard (task 7b): scripts/check-bundle-hooks.mjs fails when a test, capture or
// forced-crash hook ships. It is an ES module, so it is driven as a CLI on temp directories.
const CLIENT = path.resolve(__dirname, "..");
const SCRIPT = path.join(CLIENT, "scripts/check-bundle-hooks.mjs");

function bundle(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-hooks-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

function run(...dirs: string[]) {
  const res = spawnSync(process.execPath, [SCRIPT, "--json", ...dirs], { encoding: "utf8" });
  return { status: res.status, stderr: res.stderr, report: res.stdout ? JSON.parse(res.stdout) : null };
}

describe("check-bundle-hooks (plan F1 bundle guard)", () => {
  it("passes a bundle without hook markers", () => {
    const dir = bundle({ "chunks/app.js": 'console.log("Something went wrong. Your cats are safe.")', "css/a.css": ".a{color:red}" });
    const { status, report } = run(dir);
    expect(status).toBe(0);
    expect(report.scanned).toBe(2);
    expect(report.findings).toEqual([]);
  });

  it.each([
    ["__TT_TEST__", "window.__TT_TEST__={}"],
    ["__TT_E2E*", 'if(!0===e.__TT_E2E__)e.__TT_E2E_GAME__={}'],
    ["__TT_E2E*", 'const k="__TT_E2E_AUTH__"'],
    ["__TT_CAPTURE__", 'const f="__TT_CAPTURE__"'],
    ["forced crash", 'throw Error("Forced listener crash (E2E)")'],
  ])("fails on %s", (marker, code) => {
    const dir = bundle({ "chunks/pages/game.js": code, "chunks/clean.js": "1" });
    const { status, report } = run(dir);
    expect(status).toBe(1);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].file).toMatch(/game\.js$/);
    expect(report.findings[0].markers).toContain(marker);
  });

  it("skips source maps, which quote comments and are not the shipped code", () => {
    const dir = bundle({ "chunks/a.js": "1", "chunks/a.js.map": '{"sourcesContent":["// __TT_E2E__ hook"]}' });
    expect(run(dir).status).toBe(0);
  });

  it("fails when the directory is missing, so a guard that scanned nothing never passes", () => {
    const { status, stderr } = run(path.join(os.tmpdir(), "bundle-hooks-missing-dir"));
    expect(status).toBe(1);
    expect(stderr).toMatch(/not a directory/);
  });
});

describe("hook gates the minifier can see (so production drops them)", () => {
  const read = (file: string) => fs.readFileSync(path.join(CLIENT, file), "utf8");

  it("checks NEXT_PUBLIC_E2E inline before every forced crash", () => {
    expect(read("components/Phaser/events.ts")).toMatch(/process\.env\.NEXT_PUBLIC_E2E === "1" && isCrashForced\("listener"\)/);
    expect(read("components/errors/crash-probe.tsx")).toMatch(/process\.env\.NEXT_PUBLIC_E2E === "1" && isCrashForced\(target\)/);
  });

  it("gates the GameContext E2E modal hook on the build", () => {
    const source = read("context/GameContext.tsx");
    const hook = source.slice(source.indexOf("__TT_E2E_GAME__") - 600, source.indexOf("__TT_E2E_GAME__"));
    expect(hook).toMatch(/process\.env\.NODE_ENV === "production" && process\.env\.NEXT_PUBLIC_E2E !== "1"\) return;/);
  });
});
