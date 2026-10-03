import { execFileSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Task 5e tone guard (plan G5 "Vocabulary", F11): runs tools/copy-lint over the files task 5e
 * rewrote and expects no tone (R9), claim (R2, R3, R4, R6, R8) findings. App-build wording (R10)
 * is checked too, except for the chain-name table the give page (task 3a's GiveTreat) still reads.
 */

const REPO = path.resolve(__dirname, "..", "..");
const CLI = path.join(REPO, "tools", "copy-lint", "bin", "copy-lint.mjs");

const FILES = [
  "client/components/game/GameSelect.tsx",
  "client/components/catbassadors/GameStatsSection.tsx",
  "client/components/shared/ProfileModal.tsx",
  "client/components/shared/EndGameModal.tsx",
  "client/components/shared/PixelRescueEndGameModal.tsx",
  "client/components/shared/WheelModal.tsx",
  "client/components/shared/Wheel.tsx",
  "client/components/shared/QuestsModal.tsx",
  "client/components/shared/CatsModal.tsx",
  "client/components/game/GameOptionsModal.tsx",
  "client/components/tailsCard/TailsCardModal.tsx",
  "client/components/Leaderboard.tsx",
  "client/components/LeaderboardCatnip.tsx",
  "client/components/LeaderboardRescuer.tsx",
  "client/pages/stats.tsx",
  "client/pages/giveaway.tsx",
  "client/pages/box.tsx",
  "client/layouts/Footer.tsx",
];
const DIRS = [
  "client/components/mystery",
  "client/components/stats",
  "client/components/impact",
  "client/components/shelter-payouts",
];
// Not task 5e's files (shelter-payouts/** except these two).
const NOT_MINE = /shelter-payouts\/(Celebration|GiveTreat)\.tsx$/;
// Chain display names: data GiveTreat and /impact read under their own app gates.
const R10_DATA = /shelter-payouts\/chains\.ts$/;

function owned(): string[] {
  const out = [...FILES];
  for (const dir of DIRS) {
    const abs = path.join(REPO, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      const rel = `${dir}/${name}`;
      if (statSync(path.join(REPO, rel)).isFile() && /\.tsx?$/.test(name) && !NOT_MINE.test(rel)) out.push(rel);
    }
  }
  return out;
}

interface Finding {
  file: string;
  line: number;
  rule: string;
  message: string;
}

function lint(files: string[]): { files: number; findings: Finding[] } {
  const out = execFileSync(process.execPath, [CLI, ...files, "--format", "json", "--warn"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("{")));
}

describe("task 5e copy: tone and claims lint", () => {
  const files = owned();
  const result = lint(files);

  it("scans every file", () => {
    expect(result.files).toBe(files.length);
  });

  it("has no tone findings (no $TAILS, airdrop, TGE, listing, MNT, allocation)", () => {
    expect(result.findings.filter((f) => f.rule === "R9")).toEqual([]);
  });

  it("has no claim findings", () => {
    const claims = result.findings.filter((f) => f.rule !== "R9" && f.rule !== "R10");
    expect(claims.map((f) => `${f.file}:${f.line} ${f.rule} ${f.message}`)).toEqual([]);
  });

  it("has no app-build wording outside the chain-name data table", () => {
    const app = result.findings.filter((f) => f.rule === "R10" && !R10_DATA.test(f.file));
    expect(app.map((f) => `${f.file}:${f.line} ${f.message}`)).toEqual([]);
  });
});
