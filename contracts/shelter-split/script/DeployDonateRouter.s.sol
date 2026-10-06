// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VM} from "../test/utils/Vm.sol";
import {DonateRouter} from "../src/DonateRouter.sol";

/// @notice Deploys DonateRouter in front of an existing ShelterSplit. The router has no owner and no
///         settings, so the two addresses below are all it ever needs.
///
///   SPLIT              the deployed ShelterSplit (see client/public/shelter-payouts/*deployments.json)
///   USDC               that split's token(); the constructor reverts WrongToken on a mismatch
///   EXPECTED_CHAIN_ID  optional guard: refuse to run on any other chain
///
/// Simulate (no broadcast):  SPLIT=0x... USDC=0x... forge script script/DeployDonateRouter.s.sol --rpc-url "$RPC_URL"
/// A human broadcasts by adding --broadcast and a signer (--account <keystore>). The AI only ever
/// broadcasts it to a local anvil fork (--unlocked dev account), never to a real network. The private deploy tooling prints the exact command.
contract DeployDonateRouter {
    error WrongChain(uint256 expected, uint256 actual);

    address private constant CONSOLE = 0x000000000000000000636F6e736F6c652e6c6f67;

    function run() external returns (DonateRouter router) {
        address split = VM.envAddress("SPLIT");
        address usdc = VM.envAddress("USDC");
        uint256 expected = VM.envOr("EXPECTED_CHAIN_ID", uint256(0));
        if (expected != 0 && expected != block.chainid) revert WrongChain(expected, block.chainid);

        VM.startBroadcast();
        router = new DonateRouter(split, usdc);
        VM.stopBroadcast();

        // forge-std's console.log(string,address), called low-level (no forge-std dependency; the console
        // address has no code, so a high-level call would revert on the extcodesize check).
        (bool ok,) = CONSOLE.staticcall(abi.encodeWithSignature("log(string,address)", "DonateRouter", address(router)));
        ok;
    }
}
