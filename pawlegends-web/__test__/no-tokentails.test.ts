/**
 * Paw Legends stands on its own (docs/plans/moba/NO-TOKENTAILS.md, docs/plans/moba/PAWLEGENDS-WEB.md): no code line of
 * this app names Token Tails, except the operator line the law needs on the terms and privacy pages. Comments may
 * explain where code came from; strings may not. Hosts (`tokentails-nfts` CDN, `info@tokentails.com`, the operator's
 * privacy policy) are addresses, not the brand name, and are allowed.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..");
const DIRS = ["pages", "components", "context", "analytics", "api", "lib", "constants", "models", "hooks", "design", "styles"];
const OPERATOR_PAGES = new Set(["pages/terms.tsx", "pages/privacy.tsx"]);
const BRAND = /token\s+tails/i;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.(tsx?|jsx?|s?css)$/.test(name)) out.push(full);
  }
  return out;
}

/** A line that is only comment text (`//`, `*`, `/*`, `{/*`). */
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);

describe("no Token Tails in Paw Legends", () => {
  it("no code line outside the operator line on terms and privacy names Token Tails", () => {
    const hits: string[] = [];
    for (const dir of DIRS) {
      for (const file of files(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (!BRAND.test(line) || isComment(line)) return;
            if (OPERATOR_PAGES.has(rel) && /Token Tails MB, Vilnius, Lithuania/.test(line)) return;
            hits.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });

  it("the terms and privacy pages name the operator", () => {
    for (const page of OPERATOR_PAGES) expect(readFileSync(join(ROOT, page), "utf8")).toMatch(/Token Tails MB, Vilnius, Lithuania/);
  });
});
