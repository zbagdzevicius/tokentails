// A LOCAL x402 v1 facilitator for the donation E2E (stack.sh): /verify and /settle for the `exact`
// EVM scheme on the anvil fork only. The public facilitator settles only base-sepolia and never sees
// a local fork, so the throwaway backend points SHELTER_X402_FACILITATOR_URL here.
//
// /verify  simulates USDC.transferWithAuthorization(from, to, value, validAfter, validBefore, nonce,
//          signature) with eth_call: FiatToken checks the donor's EIP-3009 signature for real.
// /settle  sends that same call from an unlocked anvil dev account (#9 pays the gas, never holds the
//          money): the USDC goes from the payer straight to payTo, the shelter's own wallet.
//
// Usage: node facilitator-stub.mjs <port> <fork rpc>     (both local)
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";

const [port, rpc] = process.argv.slice(2);
if (!/^\d+$/.test(port || "") || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rpc || "")) {
  console.error("usage: node facilitator-stub.mjs <port> http://127.0.0.1:<fork port>");
  process.exit(2);
}
const SETTLER = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"; // anvil dev #9 (unlocked on the fork)
const SIG = "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)";

let id = 0;
async function call(method, params) {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const b = await res.json();
  if (b.error) throw new Error(b.error.message || "rpc error");
  return b.result;
}

function calldata(payload) {
  const a = payload?.payload?.authorization || {};
  const sig = payload?.payload?.signature;
  return execFileSync(
    "cast",
    ["calldata", SIG, a.from, a.to, String(a.value), String(a.validAfter), String(a.validBefore), a.nonce, sig],
    { encoding: "utf8", env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" } }
  ).trim();
}

function check(body) {
  const { paymentPayload: p, paymentRequirements: r } = body || {};
  const a = p?.payload?.authorization;
  if (!p || !r || !a) return "invalid_payload";
  if (p.scheme !== "exact" || r.scheme !== "exact" || p.network !== r.network) return "invalid_scheme";
  if (String(a.to).toLowerCase() !== String(r.payTo).toLowerCase()) return "invalid_exact_evm_payload_recipient_mismatch";
  if (BigInt(a.value) < BigInt(r.maxAmountRequired)) return "invalid_exact_evm_payload_authorization_value";
  return null;
}

createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  let raw = "";
  for await (const c of req) raw += c;
  let body = null;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return send(400, { isValid: false, invalidReason: "invalid_json" });
  }
  const payer = body?.paymentPayload?.payload?.authorization?.from;
  const network = body?.paymentPayload?.network;
  if (req.url === "/verify") {
    const bad = check(body);
    if (bad) return send(400, { isValid: false, invalidReason: bad, payer });
    try {
      await call("eth_call", [{ from: SETTLER, to: body.paymentRequirements.asset, data: calldata(body.paymentPayload) }, "latest"]);
      return send(200, { isValid: true, payer });
    } catch (e) {
      return send(400, { isValid: false, invalidReason: `simulation_failed: ${e.message}`, payer });
    }
  }
  if (req.url === "/settle") {
    const bad = check(body);
    if (bad) return send(400, { success: false, errorReason: bad, payer, transaction: "", network });
    try {
      const tx = await call("eth_sendTransaction", [{ from: SETTLER, to: body.paymentRequirements.asset, data: calldata(body.paymentPayload) }]);
      for (let i = 0; i < 60; i++) {
        const r = await call("eth_getTransactionReceipt", [tx]);
        if (r) {
          return r.status === "0x1"
            ? send(200, { success: true, payer, transaction: tx, network })
            : send(400, { success: false, errorReason: "reverted", payer, transaction: tx, network });
        }
        await new Promise((ok) => setTimeout(ok, 250));
      }
      return send(400, { success: false, errorReason: "timeout", payer, transaction: tx, network });
    } catch (e) {
      return send(400, { success: false, errorReason: `send_failed: ${e.message}`, payer, transaction: "", network });
    }
  }
  if (req.url === "/supported") return send(200, { kinds: [{ x402Version: 1, scheme: "exact", network: "arc-testnet" }] });
  send(404, { error: "not found" });
}).listen(Number(port), "127.0.0.1", () => console.log(`facilitator stub on :${port} -> ${rpc}`));
