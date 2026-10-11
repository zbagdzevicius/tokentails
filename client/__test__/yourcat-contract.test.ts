/**
 * `client/models/yourcat.ts` is a hand-written copy of `backend/src/yourcat/yourcat.contracts.ts`
 * (bet #3, docs/plans/yourcat-v2.md §2.1). Read both as text and compare the error codes, the status
 * unions and the view fields, the way pack-prices.test.tsx reads the backend price table.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { YOURCAT_ERROR_CODES } from "@/models/yourcat";

const BACKEND = join(__dirname, "..", "..", "backend", "src", "yourcat", "yourcat.contracts.ts");
const CLIENT = join(__dirname, "..", "models", "yourcat.ts");
const hasBackend = existsSync(BACKEND);

const quoted = (text: string) => Array.from(text.matchAll(/['"]([A-Za-z_]+)['"]/g), (m) => m[1]);

function union(source: string, name: string): string[] {
  const match = new RegExp(`export type ${name} =([^;]+);`).exec(source);
  if (!match) throw new Error(`${name} not found`);
  return quoted(match[1]);
}

function errorCodes(source: string): string[] {
  const match = /export const YOURCAT_ERROR_CODES = \[([\s\S]*?)\] as const;/.exec(source);
  if (!match) throw new Error("YOURCAT_ERROR_CODES not found");
  return quoted(match[1]);
}

/** The field names of an interface, in order (nested object literals included). */
function fields(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`);
  if (start === -1) throw new Error(`${name} not found`);
  let depth = 0;
  let end = start;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = source.slice(source.indexOf("{", start) + 1, end).replace(/\/\/.*$/gm, "");
  return Array.from(body.matchAll(/(\w+)\??:/g), (m) => m[1]);
}

const describeBackend = hasBackend ? describe : describe.skip;

if (!hasBackend) {
  console.warn("yourcat-contract.test.ts: backend/src/yourcat/yourcat.contracts.ts is missing (stream A not merged); skipped.");
}

describeBackend("yourcat contract copy", () => {
  const backend = hasBackend ? readFileSync(BACKEND, "utf8") : "";
  const client = readFileSync(CLIENT, "utf8");

  it("has the same error codes in the same order", () => {
    expect(errorCodes(client)).toEqual(errorCodes(backend));
    expect([...YOURCAT_ERROR_CODES]).toEqual(errorCodes(backend));
  });

  it.each(["YourcatAvatarStatus", "YourcatPortraitStatus", "YourcatPortraitStyle"])("has the same %s union", (name) => {
    expect(union(client, name)).toEqual(union(backend, name));
  });

  it.each([
    "YourcatFamilyOption",
    "YourcatStatusView",
    "YourcatCatView",
    "YourcatView",
    "YourcatCheckoutView",
    "YourcatDeleteView",
  ])("has the same %s fields", (name) => {
    expect(fields(client, name)).toEqual(fields(backend, name));
  });
});
