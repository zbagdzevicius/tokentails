const { JsonRpcProvider, Wallet } = require("ethers");

const {
	PRIVATE_KEY,
	RPC_URL
} = require("./config");

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

async function Balance(walletAddress = wallet.address) {
	const balance = await provider.getBalance(walletAddress);
	return balance.toString();
}

module.exports = Balance;
