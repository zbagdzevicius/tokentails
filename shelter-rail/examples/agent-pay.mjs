// AI-agent example: buy one adoptable-cat card from the Token Tails API with an on-chain
// payment that goes to shelters. Two x402 schemes:
//   exact            (standard x402) one signed USDC transferWithAuthorization straight to the
//                    shelter's own wallet; the server's facilitator settles it and pays the gas.
//                    Used when the server offers it and EXACT_MAX_BASE is set.
//   onchain-receipt  the agent pays ShelterSplit.donate('x402:<nonce>') on Arc itself.
//
// Arc testnet by default. The key comes from the environment and is never written anywhere.
// Use a throwaway testnet key with a little test USDC; never commit it.
//
//   npm i ethers@6                      # in your own project; the rail itself has no dependencies
//   export AGENT_PRIVATE_KEY=0x...        # testnet key, from your shell or a secret manager
//   export CAT_CARD_URL=https://<api-host>/shelter/agent/cat-card
//   export MAX_PRICE_WEI=10000000000000000   # optional cap, default 0.01 USDC
//   export EXACT_MAX_BASE=10000              # optional: allow 'exact' up to 0.01 USDC (6 decimals)
//   node examples/agent-pay.mjs --yes
//
// Without --yes the script prints the offer and exits without paying.

import { payAndFetch, pickOffer, formatUnits, explorerTxUrl } from "../src/sdk.mjs";

const url = process.env.CAT_CARD_URL;
const key = process.env.AGENT_PRIVATE_KEY;
const rpcUrl = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io";
const cap = BigInt(process.env.MAX_PRICE_WEI || "10000000000000000");
const confirmed = process.argv.includes("--yes");

if (!url) {
  console.error("Set CAT_CARD_URL to the /shelter/agent/cat-card endpoint.");
  process.exit(1);
}

if (!confirmed) {
  const res = await fetch(url);
  if (res.status !== 402) {
    console.log(`Server answered ${res.status}:`, await res.text());
    process.exit(0);
  }
  const offer = pickOffer(await res.json());
  console.log(`Price: ${formatUnits(offer.amountWei, 18)} USDC on eip155:${offer.chainId} to ${offer.payTo}`);
  console.log("Run again with --yes to pay and fetch the card.");
  process.exit(0);
}

if (!key) {
  console.error("Set AGENT_PRIVATE_KEY (a testnet key) in the environment.");
  process.exit(1);
}

const { JsonRpcProvider, Wallet } = await import("ethers");
const wallet = new Wallet(key, new JsonRpcProvider(rpcUrl));

const exactCap = process.env.EXACT_MAX_BASE ? BigInt(process.env.EXACT_MAX_BASE) : undefined;

const { response, paid, receipt, error } = await payAndFetch(url, {
  maxAmountWei: cap,
  // exact: sign the EIP-3009 typed data the SDK builds; no transaction, no gas.
  maxAmountBase: exactCap,
  account: wallet.address,
  signTypedData: async ({ domain, types, message }) => {
    const { EIP712Domain, ...rest } = types;
    return wallet.signTypedData(domain, rest, message);
  },
  // The signer callback: send the prepared donate() call and resolve once it is mined.
  pay: async ({ chainId, to, valueWei, data }) => {
    const net = await wallet.provider.getNetwork();
    if (Number(net.chainId) !== chainId) throw new Error(`RPC is on chain ${net.chainId}, offer wants ${chainId}`);
    const tx = await wallet.sendTransaction({ to, value: valueWei, data });
    const mined = await tx.wait();
    if (mined.status !== 1) throw new Error("payment reverted");
    return tx.hash;
  },
});

if (paid?.scheme === "exact") {
  console.log(`Paid ${formatUnits(paid.amountBase, 6)} USDC to the shelter wallet ${paid.payTo} on chain ${paid.chainId}: ${paid.txHash}`);
} else if (paid) {
  console.log(`Paid ${formatUnits(paid.amountWei, 18)} USDC to shelters: ${explorerTxUrl(paid.chainId, paid.txHash)}`);
} else if (error) {
  console.log(`Not paid: ${error}`);
}
console.log(`HTTP ${response.status}`, receipt ? `(receipt: ${JSON.stringify(receipt)})` : "");
console.log(await response.json());
