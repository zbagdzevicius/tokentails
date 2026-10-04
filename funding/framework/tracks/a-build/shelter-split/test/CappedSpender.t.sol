// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "./utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";
import {CappedSpender} from "../src/CappedSpender.sol";
import {MockUSDC} from "./mocks/Tokens.sol";
import {DeployCappedSpender} from "../script/DeployCappedSpender.s.sol";

/// @dev Cheatcodes this suite needs beyond the shared Vm.sol, declared locally so the shared file stays untouched.
interface VmTime {
    function warp(uint256 newTimestamp) external;
}

/// @notice CappedSpender: an AI agent may give Token Tails' own float only into ShelterSplit, inside
///         immutable per-gift and per-day caps, and only when every unit reaches a shelter.
contract CappedSpenderTest is TestBase {
    VmTime constant time = VmTime(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDC usdc;
    ShelterSplit split;

    address constant SPLIT_OWNER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant PINK_PAW = address(0x5101);
    address constant OTHER_SHELTER = address(0x5102);
    address constant AGENT = address(0xA6E7);
    address constant TT = address(0x7701); // Token Tails, owner of the float
    address constant STRANGER = address(0xBAD);

    // Native mode (Arc): 18-decimal USDC. 0.05 per gift, 0.10 per day.
    uint256 constant N_TX = 0.05 ether;
    uint256 constant N_DAY = 0.10 ether;
    // ERC-20 mode: 6-decimal USDC.
    uint256 constant E_TX = 50_000;
    uint256 constant E_DAY = 100_000;

    bytes32 constant AGENT_GIFT_SIG = keccak256("AgentGift(uint256,uint256,string,uint256)");

    function setUp() public {
        time.warp(1_790_000_000); // a fixed, realistic timestamp
        usdc = new MockUSDC();
        split = new ShelterSplit(address(usdc), TREASURY, SPLIT_OWNER);
        vm.prank(SPLIT_OWNER);
        split.addShelter(PINK_PAW, 10_000, "Pink Paw (Rozine pedute)");
    }

    function _native() internal returns (CappedSpender s) {
        s = new CappedSpender(address(split), AGENT, TT, N_TX, N_DAY, true);
        vm.deal(TT, 10 ether);
        vm.prank(TT);
        (bool ok,) = address(s).call{value: 1 ether}("");
        assertTrue(ok, "fund native float");
    }

    function _erc20() internal returns (CappedSpender s) {
        s = new CappedSpender(address(split), AGENT, TT, E_TX, E_DAY, false);
        usdc.mint(address(s), 1_000_000);
    }

    function _give(CappedSpender s, uint256 amount) internal returns (uint256) {
        vm.prank(AGENT);
        return s.give(amount, "tt:agent:match-gift");
    }

    // ------------------------------------------------------------ happy paths

    function test_Native_GiftPaysTheShelter() public {
        CappedSpender s = _native();
        vm.recordLogs();
        uint256 id = _give(s, 0.03 ether);
        assertEq(id, 1, "split batch id");
        assertEq(PINK_PAW.balance, 0.03 ether, "shelter paid");
        assertEq(TREASURY.balance, 0, "nothing to treasury");
        assertEq(address(split).balance, 0, "split keeps nothing");
        assertEq(address(s).balance, 1 ether - 0.03 ether, "float down by the gift");
        assertEq(s.spentToday(), 0.03 ether, "spent today");
        assertEq(s.remainingToday(), N_DAY - 0.03 ether, "remaining today");
        assertEq(s.giftCount(), 1, "gift count");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 n;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(s) && logs[i].topics[0] == AGENT_GIFT_SIG) {
                ++n;
                assertEq(uint256(logs[i].topics[1]), 1, "event batch id");
                (uint256 amount, string memory memo, uint256 spent) = abi.decode(logs[i].data, (uint256, string, uint256));
                assertEq(amount, 0.03 ether, "event amount");
                assertEq(memo, "tt:agent:match-gift", "event memo");
                assertEq(spent, 0.03 ether, "event spentToday");
            }
        }
        assertEq(n, 1, "one AgentGift");
    }

    function test_Erc20_GiftPaysTheShelter() public {
        CappedSpender s = _erc20();
        assertEq(s.token(), address(usdc), "token read from split");
        uint256 id = _give(s, 40_000);
        assertEq(id, 1, "split batch id");
        assertEq(usdc.balanceOf(PINK_PAW), 40_000, "shelter paid");
        assertEq(usdc.balanceOf(TREASURY), 0, "nothing to treasury");
        assertEq(usdc.balanceOf(address(s)), 960_000, "float down by the gift");
        assertEq(usdc.allowance(address(s), address(split)), 0, "no allowance left behind");
        assertEq(s.remainingToday(), E_DAY - 40_000, "remaining today");
    }

    // ------------------------------------------------------------ caps

    function test_OverTxCapReverts() public {
        CappedSpender s = _native();
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.OverTxCap.selector, N_TX + 1, N_TX));
        s.give(N_TX + 1, "tt:agent:too-big");
        assertEq(PINK_PAW.balance, 0, "nothing moved");
    }

    function test_ExactlyTxCapIsAllowed() public {
        CappedSpender s = _native();
        _give(s, N_TX);
        assertEq(PINK_PAW.balance, N_TX, "cap is inclusive");
    }

    function test_OverDailyCapReverts() public {
        CappedSpender s = _native();
        _give(s, N_TX);
        _give(s, N_TX); // exactly the daily cap
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.OverDailyCap.selector, N_DAY + 1, N_DAY));
        s.give(1, "tt:agent:one-more");
        assertEq(s.remainingToday(), 0, "nothing left today");
    }

    function test_DayRollsOver() public {
        CappedSpender s = _native();
        _give(s, N_TX);
        _give(s, N_TX);
        uint256 dayBefore = s.today();
        time.warp((dayBefore + 1) * 1 days); // first second of the next UTC day
        assertEq(s.spentToday(), 0, "new day starts at zero");
        assertEq(s.remainingToday(), N_DAY, "full budget again");
        _give(s, N_TX);
        assertEq(s.currentDay(), dayBefore + 1, "day advanced");
        assertEq(s.spentToday(), N_TX, "counted on the new day");
    }

    function test_LastSecondOfDayStillCountsAsSameDay() public {
        CappedSpender s = _native();
        uint256 d = s.today();
        time.warp((d + 1) * 1 days - 1);
        _give(s, N_TX);
        _give(s, N_TX);
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.OverDailyCap.selector, N_DAY + 1, N_DAY));
        s.give(1, "tt:agent:x");
    }

    function testFuzz_NeverMoreThanDailyCapPerDay(uint256 a, uint256 b, uint256 c) public {
        CappedSpender s = _native();
        uint256[3] memory amts = [bound(a, 1, N_TX), bound(b, 1, N_TX), bound(c, 1, N_TX)];
        uint256 given;
        for (uint256 i; i < 3; ++i) {
            vm.prank(AGENT);
            try s.give(amts[i], "tt:agent:fuzz") {
                given += amts[i];
            } catch {}
        }
        assertLe(given, N_DAY, "daily cap holds");
        assertEq(PINK_PAW.balance, given, "shelter got exactly what was given");
    }

    // ------------------------------------------------------------ who may call

    function test_NonAgentReverts() public {
        CappedSpender s = _native();
        vm.prank(STRANGER);
        vm.expectRevert(CappedSpender.NotAgent.selector);
        s.give(1, "tt:agent:x");
        vm.prank(TT); // not even the owner
        vm.expectRevert(CappedSpender.NotAgent.selector);
        s.give(1, "tt:agent:x");
    }

    // ------------------------------------------------------------ split guards

    function test_TreasuryShareGuard() public {
        CappedSpender s = _native();
        vm.prank(SPLIT_OWNER);
        split.updateShelter(PINK_PAW, 5_000, "Pink Paw (Rozine pedute)");
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.TreasuryShare.selector, 0.01 ether));
        s.give(0.02 ether, "tt:agent:x");
        assertEq(TREASURY.balance, 0, "treasury got nothing");
    }

    function test_TreasuryShareGuardCatchesRoundingDust() public {
        CappedSpender s = _erc20();
        vm.startPrank(SPLIT_OWNER);
        split.updateShelter(PINK_PAW, 5_000, "Pink Paw");
        split.addShelter(OTHER_SHELTER, 5_000, "Other");
        vm.stopPrank();
        _give(s, 2); // 1 + 1: no dust
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.TreasuryShare.selector, 1));
        s.give(3, "tt:agent:x"); // 1 + 1, one unit of dust would reach the treasury
    }

    function test_InactiveShelterTripsTheGuard() public {
        CappedSpender s = _native();
        vm.prank(SPLIT_OWNER);
        split.setShelterActive(PINK_PAW, false);
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.TreasuryShare.selector, 0.01 ether));
        s.give(0.01 ether, "tt:agent:x");
    }

    function test_PausedSplitReverts() public {
        CappedSpender s = _native();
        vm.prank(SPLIT_OWNER);
        split.pause();
        vm.prank(AGENT);
        vm.expectRevert(CappedSpender.SplitPaused.selector);
        s.give(0.01 ether, "tt:agent:x");
    }

    function test_FailedGiftDoesNotUseTheDailyBudget() public {
        CappedSpender s = _native();
        vm.prank(SPLIT_OWNER);
        split.pause();
        vm.prank(AGENT);
        vm.expectRevert(CappedSpender.SplitPaused.selector);
        s.give(N_TX, "tt:agent:x");
        assertEq(s.remainingToday(), N_DAY, "budget untouched");
    }

    // ------------------------------------------------------------ memo and float

    function test_MemoMustCarryTheAgentPrefix() public {
        CappedSpender s = _native();
        string[4] memory bad = ["", "tt:agent", "x402:abc", "TT:AGENT:abc"];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(AGENT);
            vm.expectRevert(CappedSpender.BadMemo.selector);
            s.give(1, bad[i]);
        }
        vm.prank(AGENT);
        s.give(1, "tt:agent:"); // the bare prefix is allowed
    }

    function test_MemoTooLongReverts() public {
        CappedSpender s = _native();
        bytes memory m = new bytes(257);
        for (uint256 i; i < m.length; ++i) m[i] = "a";
        m[0] = "t"; m[1] = "t"; m[2] = ":"; m[3] = "a"; m[4] = "g"; m[5] = "e"; m[6] = "n"; m[7] = "t"; m[8] = ":";
        vm.prank(AGENT);
        vm.expectRevert(CappedSpender.BadMemo.selector);
        s.give(1, string(m));
    }

    function test_ZeroAmountReverts() public {
        CappedSpender s = _native();
        vm.prank(AGENT);
        vm.expectRevert(CappedSpender.ZeroAmount.selector);
        s.give(0, "tt:agent:x");
    }

    function test_InsufficientFloatReverts() public {
        CappedSpender s = new CappedSpender(address(split), AGENT, TT, N_TX, N_DAY, true);
        vm.prank(AGENT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.InsufficientFloat.selector, 0, 1));
        s.give(1, "tt:agent:x");
    }

    function test_Erc20ModeRejectsNativeFunding() public {
        CappedSpender s = _erc20();
        vm.deal(TT, 1 ether);
        vm.prank(TT);
        (bool ok,) = address(s).call{value: 1}("");
        assertTrue(!ok, "native value refused in ERC-20 mode");
    }

    function test_NativeFundingOnlyFromOwner() public {
        CappedSpender s = _native();
        vm.deal(STRANGER, 1 ether);
        vm.prank(STRANGER);
        (bool ok, bytes memory ret) = address(s).call{value: 0.02 ether}("");
        assertTrue(!ok, "a stranger's coin is refused");
        assertEq(bytes4(ret), CappedSpender.NotOwner.selector, "NotOwner");
        vm.deal(AGENT, 1 ether);
        vm.prank(AGENT);
        (ok,) = address(s).call{value: 1}("");
        assertTrue(!ok, "the agent cannot fund either");
        assertEq(address(s).balance, 1 ether, "float unchanged");
        vm.prank(TT);
        (ok,) = address(s).call{value: 0.5 ether}("");
        assertTrue(ok, "owner tops up");
        assertEq(s.floatBalance(), 1.5 ether, "float grew");
    }

    // ------------------------------------------------------------ deploy script guards (pure, no env)

    function test_DeployGuards() public {
        DeployCappedSpender d = new DeployCappedSpender();
        // fine: Arc testnet, native, 0.05 / 0.10 USDC at 18 decimals under the 1 USDC default ceiling
        d.check(5042002, 5042002, true, N_TX, N_DAY, 1e18);
        d.check(8453, 8453, false, E_TX, E_DAY, 1e6); // ERC-20 mode off Arc is fine
        vm.expectRevert(DeployCappedSpender.ExpectedChainIdRequired.selector);
        d.check(5042002, 0, true, N_TX, N_DAY, 1e18);
        vm.expectRevert(abi.encodeWithSelector(DeployCappedSpender.WrongChain.selector, uint256(5042), uint256(5042002)));
        d.check(5042002, 5042, true, N_TX, N_DAY, 1e18);
        // native mode on Monad would hand out MON labelled as USDC
        vm.expectRevert(abi.encodeWithSelector(DeployCappedSpender.NativeModeIsArcOnly.selector, uint256(143)));
        d.check(143, 143, true, N_TX, N_DAY, 1e18);
        // an 18-decimal cap in 6-decimal ERC-20 mode is 5e10 USDC: refused
        vm.expectRevert(abi.encodeWithSelector(DeployCappedSpender.PerTxAboveCeiling.selector, N_TX, uint256(1e6)));
        d.check(8453, 8453, false, N_TX, N_TX, 1e6);
        vm.expectRevert(abi.encodeWithSelector(DeployCappedSpender.DailyAboveCeiling.selector, uint256(1e9), uint256(1e8)));
        d.check(8453, 8453, false, E_TX, 1e9, 1e6);
        assertTrue(d.isArc(5042) && d.isArc(5042002) && !d.isArc(31337), "Arc ids");
    }

    // ------------------------------------------------------------ owner

    function test_WithdrawOnlyToOwner() public {
        CappedSpender s = _native();
        vm.prank(TT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.WithdrawOnlyToOwner.selector, STRANGER));
        s.withdraw(STRANGER);
        vm.prank(STRANGER);
        vm.expectRevert(CappedSpender.NotOwner.selector);
        s.withdraw(STRANGER);
        vm.prank(AGENT);
        vm.expectRevert(CappedSpender.NotOwner.selector);
        s.withdraw(AGENT);
        uint256 before = TT.balance;
        vm.prank(TT);
        s.withdraw(TT);
        assertEq(TT.balance, before + 1 ether, "float back to the owner");
        assertEq(address(s).balance, 0, "empty");
    }

    function test_Erc20WithdrawOnlyToOwner() public {
        CappedSpender s = _erc20();
        vm.prank(TT);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.WithdrawOnlyToOwner.selector, STRANGER));
        s.withdraw(STRANGER);
        vm.prank(TT);
        s.withdraw(TT);
        assertEq(usdc.balanceOf(TT), 1_000_000, "float back to the owner");
    }

    function test_OwnershipIsTwoStepAndMovesWithdrawals() public {
        CappedSpender s = _native();
        address next = address(0x7702);
        vm.prank(TT);
        s.transferOwnership(next);
        assertEq(s.owner(), TT, "not yet");
        vm.prank(STRANGER);
        vm.expectRevert(CappedSpender.NotPendingOwner.selector);
        s.acceptOwnership();
        vm.prank(next);
        s.acceptOwnership();
        assertEq(s.owner(), next, "moved");
        vm.prank(TT);
        vm.expectRevert(CappedSpender.NotOwner.selector);
        s.withdraw(TT);
    }

    function test_CapsAndAgentAreFixedAtDeploy() public {
        CappedSpender s = _native();
        assertEq(s.perTxCap(), N_TX, "perTxCap");
        assertEq(s.dailyCap(), N_DAY, "dailyCap");
        assertEq(s.agent(), AGENT, "agent");
        assertEq(address(s.split()), address(split), "split");
        assertEq(s.native(), true, "native");
        // There is no setter: a call to any would-be setter selector reverts (no fallback).
        (bool ok,) = address(s).call(abi.encodeWithSignature("setCaps(uint256,uint256)", 1e30, 1e30));
        assertTrue(!ok, "no setCaps");
        (ok,) = address(s).call(abi.encodeWithSignature("setAgent(address)", STRANGER));
        assertTrue(!ok, "no setAgent");
    }

    function test_ConstructorRejectsBadInput() public {
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.BadCaps.selector, 2, 1));
        new CappedSpender(address(split), AGENT, TT, 2, 1, true);
        vm.expectRevert(abi.encodeWithSelector(CappedSpender.BadCaps.selector, 0, 1));
        new CappedSpender(address(split), AGENT, TT, 0, 1, true);
        vm.expectRevert(CappedSpender.ZeroAddress.selector);
        new CappedSpender(address(split), address(0), TT, 1, 1, true);
        vm.expectRevert(CappedSpender.NotAContract.selector);
        new CappedSpender(address(0x1234), AGENT, TT, 1, 1, true);
    }
}
