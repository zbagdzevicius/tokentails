// AI-agent example: buy one adoptable-cat card from the Token Tails API with an on-chain
// payment that goes to shelters. Two x402 schemes:
//   exact            (standard x402) one signed USDC transferWithAuthorization straight to the
//                    shelter's own wallet; the server's facilitator settles it and pays the gas.
//                    Used when the server offers it and EXACT_MAX_BASE is set.
//   onchain-receipt  the agent pays ShelterSplit itself with memo 'x402:<nonce>'. The server lists
//                    one offer per chain it takes (all with one nonce): on Arc a native
//                    donate(memo) (USDC is the gas coin, 18 decimals); elsewhere approve + disburse
//                    of the chain's USD coin (6 decimals), disburseWithMemo on Tempo.
//
// Testnets only in this example. The key comes from the environment and is never written anywhere.
// Use a throwaway testnet key with a little test USDC and gas; never commit it.
//
//   export AGENT_PRIVATE_KEY=0x...          # testnet key, from your shell or a secret manager
//   export CAT_CARD_URL=https://<api-host>/shelter/agent/cat-card
//   export AGENT_CHAIN_ID=84532              # optional: pay on this chain (default: the server's first offer)
//   export AGENT_RPC_URL=https://...         # optional: default is the chain's public RPC from CHAINS
//   export MAX_PRICE_WEI=10000000000000000   # optional cap for native offers, default 0.01 USDC (18 decimals)
//   export MAX_PRICE_BASE=10000              # optional cap for token offers, default 0.01 (6 decimals)
//   export EXACT_MAX_BASE=10000              # optional: allow 'exact' up to 0.01 USDC (6 decimals)
//   node examples/agent-pay.mjs              # prints every offer, pays nothing
//   node examples/agent-pay.mjs --yes        # pays once and prints the card
//
// ethers v6 is needed to sign. The rail has no dependencies: `npm i ethers@6` in your project, or,
// inside the Token Tails monorepo, the backend's copy (backend/node_modules/ethers) is used.

import { createRequire } from "node:module";
import { payAndFetch, listOnchainReceiptOffers, formatUnits, explorerTxUrl, CHAINS } from "../src/sdk.mjs";

const url = process.env.CAT_CARD_URL;
const key = process.env.AGENT_PRIVATE_KEY;
const chainId = process.env.AGENT_CHAIN_ID ? Number(process.env.AGENT_CHAIN_ID) : undefined;
const capWei = BigInt(process.env.MAX_PRICE_WEI || "10000000000000000");
const capBase = BigInt(process.env.MAX_PRICE_BASE || "10000");
const exactCap = process.env.EXACT_MAX_BASE ? BigInt(process.env.EXACT_MAX_BASE) : undefined;
const confirmed = process.argv.includes("--yes");

if (!url) {
  console.error("Set CAT_CARD_URL to the /shelter/agent/cat-card endpoint.");
  process.exit(1);
}

const describe = (o) => `${formatUnits(o.amount, o.decimals, 6)} ${o.coin} on eip155:${o.chainId} (${CHAINS[o.chainId]?.name || "unknown chain"}) via ${o.method} to ${o.payTo}`;

if (!confirmed) {
  const res = await fetch(url);
  if (res.status !== 402) {
    console.log(`Server answered ${res.status}:`, await res.text());
    process.exit(0);
  }
  const body = await res.json();
  const offers = listOnchainReceiptOffers(body);
  for (const o of offers) console.log(`onchain-receipt: ${describe(o)}`);
  for (const a of body.accepts || []) if (a?.scheme === "exact") console.log(`exact: ${a.maxAmountRequired} base units of ${a.asset} on ${a.network} to ${a.payTo}`);
  if (!offers.length) console.log("No onchain-receipt offer.");
  console.log("Run again with --yes (and AGENT_CHAIN_ID to pick a chain) to pay and fetch the card.");
  process.exit(0);
}

if (!key) {
  console.error("Set AGENT_PRIVATE_KEY (a testnet key) in the environment.");
  process.exit(1);
}

async function loadEthers() {
  try {
    return await import("ethers");
  } catch {
    // Monorepo fallback: resolve ethers from backend/node_modules.
    const require = createRequire(new URL("../../backend/package.json", import.meta.url));
    return require("ethers");
  }
}
const { JsonRpcProvider, Wallet, Contract } = await loadEthers();

const wallets = new Map();
function walletOn(id) {
  if (!wallets.has(id)) {
    const chain = CHAINS[id];
    // This example never pays on a mainnet.
    if (!chain?.testnet) throw new Error(`chain ${id} is not a known testnet; this example pays on testnets only`);
    const rpcUrl = process.env.AGENT_RPC_URL || chain.rpc;
    wallets.set(id, new Wallet(key, new JsonRpcProvider(rpcUrl)));
  }
  return wallets.get(id);
}

const { response, paid, receipt, error } = await payAndFetch(url, {
  chainId,
  maxAmountWei: capWei,
  maxAmountBase: exactCap ?? capBase,
  prefer: exactCap === undefined ? "onchain-receipt" : "exact",
  // exact: sign the EIP-3009 typed data the SDK builds; no transaction, no gas.
  ...(exactCap !== undefined
    ? {
        account: new Wallet(key).address,
        signTypedData: async ({ domain, types, message }) => {
          const { EIP712Domain, ...rest } = types;
          return new Wallet(key).signTypedData(domain, rest, message);
        },
      }
    : {}),
  // onchain-receipt: run the prepared calls in order (approve only when the allowance is short),
  // waiting for each to be mined, and return the payment's hash.
  pay: async ({ chainId: id, calls, token, amount, coin }) => {
    const wallet = walletOn(id);
    const net = await wallet.provider.getNetwork();
    if (Number(net.chainId) !== id) throw new Error(`RPC is on chain ${net.chainId}, offer wants ${id}`);
    let hash = null;
    for (const call of calls) {
      if (call.step === "approve") {
        const erc20 = new Contract(token, ["function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"], wallet.provider);
        const balance = await erc20.balanceOf(wallet.address);
        if (balance < amount) throw new Error(`the agent holds ${balance} base units of ${coin} on ${id}, less than ${amount}`);
        if ((await erc20.allowance(wallet.address, calls[calls.length - 1].to)) >= amount) continue;
      }
      // Sign locally and broadcast the raw bytes, then poll the receipt: ethers cannot parse every
      // chain's transaction response (Tempo's RPC returns `value: null`), but every chain takes raw
      // signed bytes and returns a standard receipt.
      const request = await wallet.populateTransaction({ to: call.to, data: call.data, value: call.value || 0 });
      const txHash = await wallet.provider.send("eth_sendRawTransaction", [await wallet.signTransaction(request)]);
      const mined = await wallet.provider.waitForTransaction(txHash, 1, 120_000);
      if (!mined || mined.status !== 1) throw new Error(`${call.step} ${mined ? "reverted" : "not mined in 120 s"}: ${txHash}`);
      console.log(`${call.step}: ${explorerTxUrl(id, txHash) || txHash}`);
      hash = txHash;
    }
    return hash;
  },
});

if (paid?.scheme === "exact") {
  console.log(`Paid ${formatUnits(paid.amountBase, 6)} USDC to the shelter wallet ${paid.payTo} on chain ${paid.chainId}: ${paid.txHash}`);
} else if (paid) {
  const amount = paid.amountWei !== undefined ? formatUnits(paid.amountWei, 18, 6) : formatUnits(paid.amountBase, 6, 6);
  console.log(`Paid ${amount} ${paid.coin} to shelters on chain ${paid.chainId}: ${explorerTxUrl(paid.chainId, paid.txHash) || paid.txHash}`);
} else if (error) {
  console.log(`Not paid: ${error}`);
}
console.log(`HTTP ${response.status}`, receipt ? `(receipt: ${JSON.stringify(receipt)})` : "");
console.log(await response.json());
