// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "./utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";
import {CappedSpender} from "../src/CappedSpender.sol";
import {MockUSDC} from "./mocks/Tokens.sol";
import {DeployCappedSpender} from "../script/DeployCappedSpender.s.sol";

/// @dev Cheatcodes beyond the shared Vm.sol, declared locally so the shared file stays untouched.
interface VmTimeMd {
    function warp(uint256 newTimestamp) external;
}

/// @notice Sponsor Match Desk (agents/treat-agent/MATCH-DESK.md): the runbook's native caps on Arc
///         (0.05 USDC per gift, 0.20 per UTC day, 18 decimals), the receipt memo format, both over-cap
///         refusals the demo shows, and the deploy script's floor guard. CappedSpender is unchanged.
contract CappedSpenderMatchDeskTest is TestBase {
    VmTimeMd constant time = VmTimeMd(address(uint160(uint256(keccak256("hevm cheat code")))));

    address constant SPLIT_OWNER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant PINK_PAW = address(0x5101);
    address constant AGENT = address(0xA6E7);
    address constant SPONSOR = address(0x5905); // the vault owner (related-party sponsor)

    // Runbook values: native USDC on Arc has 18 decimals.
    uint256 constant PER_TX = 50000000000000000; // 0.05 USDC
    uint256 constant DAILY = 200000000000000000; // 0.20 USDC

    bytes32 constant AGENT_GIFT_SIG = keccak256("AgentGift(uint256,uint256,string,uint256)");

    ShelterSplit split;
    CappedSpender spender;

    function setUp() public {
        time.warp(1_792_022_400 + 3600); // 2026-10-15 01:00 UTC
        MockUSDC usdc = new MockUSDC();
        split = new ShelterSplit(address(usdc), TREASURY, SPLIT_OWNER);
        vm.prank(SPLIT_OWNER);
        split.addShelter(PINK_PAW, 10_000, "Pink Paw (Rozine pedute)");
        spender = new CappedSpender(address(split), AGENT, SPONSOR, PER_TX, DAILY, true);
        vm.deal(SPONSOR, 2 ether);
        vm.prank(SPONSOR);
        (bool ok,) = address(spender).call{value: 1 ether}("");
        assertTrue(ok, "sponsor funds 1 USDC");
    }

    function test_ReceiptMemoAcceptedAndEmitted() public {
        string memory memo = "tt:agent:m:motored:1a2b3c4d";
        assertLe(bytes(memo).length, 44, "memo at most 44 bytes");
        vm.recordLogs();
        vm.prank(AGENT);
        uint256 batchId = spender.give(20000000000000000, memo); // a 0.02 match
        assertEq(PINK_PAW.balance, 20000000000000000, "Pink Paw paid");
        assertEq(TREASURY.balance, 0, "nothing to treasury");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 n;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(spender) && logs[i].topics[0] == AGENT_GIFT_SIG) {
                ++n;
                assertEq(uint256(logs[i].topics[1]), batchId, "event batch id");
                (uint256 amount, string memory m, uint256 spent) = abi.decode(logs[i].data, (uint256, string, uint256));
                assertEq(amount, 20000000000000000, "event amount");
                assertEq(m, memo, "event memo");
                assertEq(spent, 20000000000000000, "event spentToday");
            }
        }
        assertEq(n, 1, "one AgentGift");
    }

    function test_DemoOvercapTx_FreshDay() public {
        // A fresh day: OverTxCap is checked before the daily cap.
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.OverTxCap.selector, 2 * PER_TX, PER_TX));
        spender.give(2 * PER_TX, "tt:agent:m:motored:demo-overcap");
        // 0.25 on a fresh day is also OverTxCap, not OverDailyCap (correction 2 in MATCH-DESK.md).
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.OverTxCap.selector, uint256(0.25 ether), PER_TX));
        spender.give(0.25 ether, "tt:agent:m:motored:demo-overcap");
        assertEq(PINK_PAW.balance, 0, "nothing moved");
    }

    function test_DemoOvercapDay_AfterFourMatches() public {
        for (uint256 i; i < 4; ++i) {
            vm.prank(AGENT);
            spender.give(PER_TX, "tt:agent:m:motored:1a2b3c4d");
        }
        assertEq(spender.remainingToday(), 0, "day spent");
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.OverDailyCap.selector, uint256(0.25e18), uint256(0.2e18)));
        spender.give(PER_TX, "tt:agent:m:motored:demo-overcap");
        assertEq(PINK_PAW.balance, 4 * PER_TX, "only the four matches moved");
        // 00:00 UTC resets the day: up to 2x the daily cap can go out across midnight.
        time.warp((spender.today() + 1) * 1 days);
        vm.prank(AGENT);
        spender.give(PER_TX, "tt:agent:m:motored:5e6f7a8b");
        assertEq(spender.spentToday(), PER_TX, "new UTC day");
    }

    function test_CheckFloor() public {
        DeployCappedSpender d = new DeployCappedSpender();
        uint256 floor = 1e18 / 1000; // the run() default in native mode: 0.001 USDC
        vm.expectRevert(abi.encodeWithSelector(DeployCappedSpender.PerTxBelowFloor.selector, uint256(50000), floor));
        d.checkFloor(50000, floor);
        d.checkFloor(5e16, floor);
        d.checkFloor(floor, floor); // the floor itself is allowed
    }

    function test_RunbookValuesPassCheck() public {
        DeployCappedSpender d = new DeployCappedSpender();
        d.check(5042, 5042, true, 5e16, 2e17, 1e18);
        d.check(5042002, 5042002, true, 5e16, 2e17, 1e18);
    }

    /// @dev The whole deploy path (guards, console log, broadcast) with the runbook values on Arc testnet.
    ///      The console address has no code: a high-level console call reverted the script with empty
    ///      data before it was made low-level, so this test fails if that ever comes back.
    function test_DeployPathLogsAndDeploys() public {
        DeployCappedSpender d = new DeployCappedSpender();
        DeployCappedSpender.Config memory c = DeployCappedSpender.Config({
            split: address(split), agent: AGENT, owner: SPONSOR, perTx: PER_TX, daily: DAILY, nativeMode: true,
            expected: 5042002, ceiling: 1e18, floor: 1e15, decimals: 18
        });
        vm.chainId(5042002);
        CappedSpender s = d.deploy(c);
        assertEq(s.agent(), AGENT, "agent");
        assertEq(s.owner(), SPONSOR, "owner");
        assertEq(s.perTxCap(), PER_TX, "per-gift cap");
        assertEq(s.dailyCap(), DAILY, "daily cap");
        assertTrue(s.native(), "native mode");

        // The guards still run first on this path.
        c.perTx = 50000; // 6-decimal units in native mode
        vm.expectRevert(abi.encodeWithSelector(DeployCappedSpender.PerTxBelowFloor.selector, uint256(50000), uint256(1e15)));
        d.deploy(c);
        c.perTx = PER_TX;
        vm.chainId(31337);
        vm.expectRevert(abi.encodeWithSelector(DeployCappedSpender.WrongChain.selector, uint256(5042002), uint256(31337)));
        d.deploy(c);
    }
}
