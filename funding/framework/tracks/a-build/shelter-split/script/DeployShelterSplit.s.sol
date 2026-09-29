// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VM} from "../test/utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";

/// @notice Deploys ShelterSplit. Every input comes from the environment; nothing is hard-coded.
///
///   SHELTERSPLIT_TOKEN      stablecoin address (USDC for the chain, see ../chains.json). For a second
///                           instance paying out EURC, run it again with the EURC address from the
///                           network's splitTokens (`fund a:wave --token EURC` writes that script).
///                           Every instance also accepts native value via donate()/receive().
///   SHELTERSPLIT_TREASURY   receives unallocated share and rounding dust
///   SHELTERSPLIT_OWNER      optional, defaults to the treasury (use a multisig)
///   EXPECTED_CHAIN_ID       optional guard: refuse to run on any other chain
///
/// Simulate (no broadcast):   forge script script/DeployShelterSplit.s.sol --rpc-url "$RPC_URL"
/// A human broadcasts by adding --broadcast and a signer (--account <keystore> preferred).
/// `fund a:deploy <chain> <network>` prints the exact command with the right env names.
contract DeployShelterSplit {
    error WrongChain(uint256 expected, uint256 actual);

    function run() external returns (ShelterSplit split) {
        address token = VM.envAddress("SHELTERSPLIT_TOKEN");
        address treasury = VM.envAddress("SHELTERSPLIT_TREASURY");
        address owner = VM.envOr("SHELTERSPLIT_OWNER", treasury);
        uint256 expected = VM.envOr("EXPECTED_CHAIN_ID", uint256(0));
        if (expected != 0 && expected != block.chainid) revert WrongChain(expected, block.chainid);

        VM.startBroadcast();
        split = new ShelterSplit(token, treasury, owner);
        VM.stopBroadcast();
    }
}
