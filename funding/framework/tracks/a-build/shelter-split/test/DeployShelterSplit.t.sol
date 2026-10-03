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

        // Testnet-only mock token path (Robinhood Chain testnet has no stablecoin): deploys MockUSDC in
        // the same run, mints to the given address, ignores SHELTERSPLIT_TOKEN.
        vm.setEnv("EXPECTED_CHAIN_ID", "0");
        vm.setEnv("SHELTERSPLIT_MOCK_TOKEN", "1");
        vm.setEnv("SHELTERSPLIT_MOCK_MINT", "2500000");
        vm.setEnv("SHELTERSPLIT_MOCK_MINT_TO", vm.toString(owner));
        DeployShelterSplit dm = new DeployShelterSplit();
        ShelterSplit m = dm.run();
        address mt = address(dm.mockToken());
        assertTrue(mt != address(0) && mt != address(usdc), "mock token deployed");
        assertEq(address(m.token()), mt, "split pays the mock");
        assertEq(MockUSDC(mt).balanceOf(owner), 2500000, "minted to SHELTERSPLIT_MOCK_MINT_TO");
        assertEq(MockUSDC(mt).symbol(), "mUSDC", "symbol says mock");

        // ...and never on a mainnet chain id (Robinhood Chain mainnet 4663, Arc 5042, Base 8453)
        uint256[3] memory mains = [uint256(4663), 5042, 8453];
        for (uint256 i = 0; i < mains.length; i++) {
            vm.chainId(mains[i]);
            DeployShelterSplit dx = new DeployShelterSplit();
            vm.expectRevert(abi.encodeWithSelector(DeployShelterSplit.MockTokenOnTestnetOnly.selector, mains[i]));
            dx.run();
        }
        vm.chainId(31337);
        vm.setEnv("SHELTERSPLIT_MOCK_TOKEN", "0");
    }
}
