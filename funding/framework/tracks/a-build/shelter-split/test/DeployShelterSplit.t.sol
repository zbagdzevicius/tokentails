// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";
import {DeployShelterSplit} from "../script/DeployShelterSplit.s.sol";
import {MockUSDC} from "./mocks/Tokens.sol";

/// @notice Runs the deploy script in-process (no RPC, no broadcast) to prove it reads env correctly.
contract DeployShelterSplitTest is TestBase {
    function test_ScriptDeploysWithEnvAndGuardsChain() public {
        MockUSDC usdc = new MockUSDC();
        address treasury = address(0x7EA5);
        address owner = address(0x0A11CE);
        vm.setEnv("SHELTERSPLIT_TOKEN", vm.toString(address(usdc)));
        vm.setEnv("SHELTERSPLIT_TREASURY", vm.toString(treasury));
        vm.setEnv("SHELTERSPLIT_OWNER", vm.toString(owner));
        vm.setEnv("EXPECTED_CHAIN_ID", "31337");
        ShelterSplit s = new DeployShelterSplit().run();
        assertEq(address(s.token()), address(usdc), "token");
        assertEq(s.treasury(), treasury, "treasury");
        assertEq(s.owner(), owner, "owner");

        // a second instance for EURC (chains.json splitTokens.EURC, `fund a:wave --token EURC`) is the same
        // script with another SHELTERSPLIT_TOKEN; it is independent of the USDC instance
        MockUSDC eurc = new MockUSDC();
        vm.setEnv("SHELTERSPLIT_TOKEN", vm.toString(address(eurc)));
        ShelterSplit e = new DeployShelterSplit().run();
        assertEq(address(e.token()), address(eurc), "EURC instance token");
        assertTrue(address(e) != address(s), "separate instance");
        assertEq(address(s.token()), address(usdc), "USDC instance unchanged");

        // same process env, so the wrong-chain guard is checked in the same test (no parallel races)
        vm.setEnv("EXPECTED_CHAIN_ID", "5042");
        DeployShelterSplit d = new DeployShelterSplit();
        vm.expectRevert(abi.encodeWithSelector(DeployShelterSplit.WrongChain.selector, uint256(5042), uint256(31337)));
        d.run();
    }
}
