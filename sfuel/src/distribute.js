const { JsonRpcProvider, Wallet } = require("ethers");

const {
	DISTRIBUTION_VALUE,
	PRIVATE_KEY,
	RPC_URL
} = require("./config");

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);

async function Distribute({ address }) {
	return await wallet.sendTransaction({
		to: address,
		value: DISTRIBUTION_VALUE
	});
}

module.exports = Distribute;
