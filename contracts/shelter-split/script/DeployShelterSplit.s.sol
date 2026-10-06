// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VM} from "../test/utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";
import {MockUSDC} from "../test/mocks/Tokens.sol";

/// @notice Deploys ShelterSplit. Every input comes from the environment; nothing is hard-coded.
///
///   SHELTERSPLIT_TOKEN      stablecoin address (USDC for the chain, see backend/src/payments/crypto/crypto-chains.ts). For a second
///                           instance paying out EURC, run it again with the chain's EURC address
///                           (the same file lists it).
///                           Every instance also accepts native value via donate()/receive().
///   SHELTERSPLIT_TREASURY   receives unallocated share and rounding dust
///   SHELTERSPLIT_OWNER      optional, defaults to the treasury (use a multisig)
///   EXPECTED_CHAIN_ID       optional guard: refuse to run on any other chain
///
/// TESTNET ONLY, for a testnet with no stablecoin (Robinhood Chain testnet 46630, chains.json
/// `mockToken`): SHELTERSPLIT_MOCK_TOKEN=1 deploys the test MockUSDC ("Mock USDC", mUSDC, 6 decimals,
/// anyone can mint) in the same broadcast, mints SHELTERSPLIT_MOCK_MINT raw units (default 1000000)
/// to SHELTERSPLIT_MOCK_MINT_TO (default the owner) and uses it as the token; SHELTERSPLIT_TOKEN is
/// ignored. The script reverts with MockTokenOnTestnetOnly on any chain id outside the testnet list
/// below, so a mock can never back a mainnet instance.
///
/// Simulate (no broadcast):   forge script script/DeployShelterSplit.s.sol --rpc-url "$RPC_URL"
/// A human broadcasts by adding --broadcast and a signer (--account <keystore> preferred).
/// The private deploy tooling prints the exact command with the right env names.
contract DeployShelterSplit {
    error WrongChain(uint256 expected, uint256 actual);
    error MockTokenOnTestnetOnly(uint256 chainId);

    /// Set when SHELTERSPLIT_MOCK_TOKEN=1 deployed a mock payout token.
    MockUSDC public mockToken;

    /// Testnets (chains.json testnet chain ids) plus the local anvil/forge chain. Nothing else may get a mock.
    function isTestnet(uint256 id) public pure returns (bool) {
        return id == 5042002 // Arc testnet
            || id == 42431 // Tempo Moderato
            || id == 421614 // Arbitrum Sepolia
            || id == 43113 // Avalanche Fuji
            || id == 84532 // Base Sepolia
            || id == 46630 // Robinhood Chain testnet
            || id == 10143 // Monad testnet
            || id == 31611 // Mezo testnet
            || id == 31337; // local anvil / forge test
    }

    function run() external returns (ShelterSplit split) {
        bool mock = VM.envOr("SHELTERSPLIT_MOCK_TOKEN", uint256(0)) == 1;
        address treasury = VM.envAddress("SHELTERSPLIT_TREASURY");
        address owner = VM.envOr("SHELTERSPLIT_OWNER", treasury);
        uint256 expected = VM.envOr("EXPECTED_CHAIN_ID", uint256(0));
        if (expected != 0 && expected != block.chainid) revert WrongChain(expected, block.chainid);
        if (mock && !isTestnet(block.chainid)) revert MockTokenOnTestnetOnly(block.chainid);
        address token = mock ? address(0) : VM.envAddress("SHELTERSPLIT_TOKEN");

        VM.startBroadcast();
        if (mock) {
            mockToken = new MockUSDC();
            mockToken.mint(VM.envOr("SHELTERSPLIT_MOCK_MINT_TO", owner), VM.envOr("SHELTERSPLIT_MOCK_MINT", uint256(1000000)));
            token = address(mockToken);
        }
        split = new ShelterSplit(token, treasury, owner);
        VM.stopBroadcast();
    }
}
