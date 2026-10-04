// Tokens without version() (USDG on Robinhood Chain signs with EIP-712 version "1"), and the native
// path's USDC-only guard. Mocks only: nothing touches a network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { donateWithInjected, readTokenDomain } from "../src/sdk.mjs";

const TOKEN = "0x5fc5000000000000000000000000000000000d16";
// cast keccak(abi.encode(keccak(EIP712Domain(...)), keccak("Global Dollar"), keccak("1"), 4663, TOKEN))
const SEP_V1 = "0x1470cbe55f01576be694f5dcc71c3be49751c59e2ba0c5fbc98db12ca8907a8c";
const abiString = (s) =>
  "0x" + (32).toString(16).padStart(64, "0") + s.length.toString(16).padStart(64, "0") + Buffer.from(s).toString("hex").padEnd(64, "0");

function token({ separator = SEP_V1 } = {}) {
  return {
    async request({ method, params }) {
      if (method !== "eth_call") throw new Error("unexpected " + method);
      const data = params[0].data;
      if (data === "0x06fdde03") return abiString("Global Dollar");
      if (data === "0x54fd4d50") throw Object.assign(new Error("execution reverted"), { code: 3 });
      if (data === "0x3644e515") return separator;
      throw new Error("unexpected call " + data);
    },
  };
}

test("SDK: a token without version() gets the version that matches DOMAIN_SEPARATOR()", async () => {
  assert.deepEqual(await readTokenDomain(token(), TOKEN, 4663), { name: "Global Dollar", version: "1" });
  assert.deepEqual(await readTokenDomain(token({ separator: "0x" + "77".repeat(32) }), TOKEN, 4663), { name: "Global Dollar", version: null });
});

test("widget: same separator and the same recovered version", async () => {
  const sandbox = { TextEncoder, TextDecoder, BigInt };
  sandbox.window = sandbox;
  vm.runInNewContext(readFileSync(new URL("../src/widget.js", import.meta.url), "utf8"), sandbox);
  const rail = sandbox.ShelterRail;
  assert.equal(rail.domainSeparator("Global Dollar", "1", 4663, TOKEN), SEP_V1);
  const t = token();
  const call = (to, data) => t.request({ method: "eth_call", params: [{ to, data }, "latest"] });
  assert.equal(await rail.readVersion(call, TOKEN, "Global Dollar", 4663), "1");
});

test("SDK: native gifts are USDC-only, never ETH or AVAX sent as if it were USDC", async () => {
  const calls = [];
  const wallet = { request: async (a) => (calls.push(a), null) };
  for (const chainId of [8453, 84532, 43113, 4663]) {
    await assert.rejects(
      donateWithInjected(wallet, { chainId, split: "0x" + "11".repeat(20), amountWei: 10n ** 18n }),
      /USDC-only/
    );
  }
  assert.equal(calls.length, 0, "the wallet is never opened");
});
