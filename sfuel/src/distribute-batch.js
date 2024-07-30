const { JsonRpcProvider, Wallet } = require("ethers");

const {
  DISTRIBUTION_VALUE,
  PRIVATE_KEY,
  RPC_URL,
  BATCH_SIZE,
} = require("./config");

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

async function DistributeBatch(addresses) {
  const batchedAddresses = [];
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    batchedAddresses.push(addresses.slice(i, i + BATCH_SIZE));
  }

  let nonce = await provider.getTransactionCount(wallet.address);

  for (const batch of batchedAddresses) {
    const transactions = batch.map((address) => {
      return wallet.sendTransaction({
        to: address,
        value: DISTRIBUTION_VALUE,
        nonce: nonce++,
      });
    });

    await Promise.all(transactions);
    // Optionally add a delay between batches to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
  }
  return true;
}

module.exports = DistributeBatch;
