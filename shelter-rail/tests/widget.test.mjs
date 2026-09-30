// Loads the widget in a sandbox with no DOM, so it only defines its helpers and never mounts,
// fetches or talks to a wallet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { encodeDonate, TOPICS } from "../src/sdk.mjs";

const src = readFileSync(new URL("../src/widget.js", import.meta.url), "utf8");
const sandbox = { TextEncoder, BigInt };
sandbox.window = sandbox;
vm.runInNewContext(src, sandbox);
const rail = sandbox.ShelterRail;

test("widget exposes its helpers without a DOM", () => {
  assert.equal(typeof rail.mount, "function");
});

test("widget encodeDonate matches the SDK", () => {
  for (const memo of ["", "widget", "tt:page:ab12", "x402:ž".repeat(9)]) assert.equal(rail.encodeDonate(memo), encodeDonate(memo));
});

test("widget sums NativeDisbursed amounts only", () => {
  const amt = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0") + "0".repeat(128);
  const logs = [
    { topics: [TOPICS.NativeDisbursed], data: amt(10n ** 18n) },
    { topics: [TOPICS.NativeDisbursed], data: amt(5n * 10n ** 17n) },
    { topics: [TOPICS.Disbursed], data: amt(999n) },
  ];
  assert.equal(rail.sumNative(logs), 15n * 10n ** 17n);
  assert.equal(rail.formatUnits(rail.sumNative(logs), 18), "1.5");
});

test("the copy served by the client app is identical to src/widget.js", () => {
  const served = readFileSync(new URL("../../client/public/rail/widget.js", import.meta.url), "utf8");
  assert.equal(served, src, "run: cp shelter-rail/src/widget.js client/public/rail/widget.js");
});
