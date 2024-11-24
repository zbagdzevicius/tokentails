const { JsonRpcProvider, Wallet } = require("ethers");

const { DISTRIBUTION_VALUE, PRIVATE_KEY, RPC_URL } = require("./config");

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

let nonce;

async function initializeNonce() {
  nonce = await provider.getTransactionCount(wallet.address);
}

async function Distribute({ address }) {
  await wallet.sendTransaction({
    to: address,
    value: DISTRIBUTION_VALUE,
    nonce: nonce++,
  });
}

module.exports = { Distribute, initializeNonce };
