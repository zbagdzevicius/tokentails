// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "./utils/Vm.sol";
import {ShelterSplit, IShelterSplitEvents} from "../src/ShelterSplit.sol";
import {MockUSDC, NoReturnToken, FalseToken, FeeOnTransferToken, ReentrantToken, ISplitter} from "./mocks/Tokens.sol";

contract ShelterSplitTest is TestBase, IShelterSplitEvents {
    MockUSDC usdc;
    ShelterSplit split;

    address constant OWNER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant PAYER = address(0xB0B);
    address constant S1 = address(0x5101);
    address constant S2 = address(0x5102);
    address constant S3 = address(0x5103);

    bytes32 constant DISBURSED_SIG = keccak256("Disbursed(address,uint256,string)");
    bytes32 constant BATCH_SIG = keccak256("DisbursementBatch(uint256,address,uint256,uint256,uint256,uint256,string)");

    function setUp() public {
        usdc = new MockUSDC();
        split = new ShelterSplit(address(usdc), TREASURY, OWNER);
        usdc.mint(PAYER, 1e30);
        vm.prank(PAYER);
        usdc.approve(address(split), type(uint256).max);
    }

    function _three() internal {
        vm.startPrank(OWNER);
        split.addShelter(S1, 5000, "Vilnius Cat Rescue");
        split.addShelter(S2, 3000, "Kaunas Shelter");
        split.addShelter(S3, 1500, "Paris Strays");
        vm.stopPrank();
    }

    function _pay(uint256 amount) internal returns (uint256 id) {
        vm.prank(PAYER);
        id = split.disburse(amount, "order-42");
    }

    // ------------------------------------------------------------ splits

    function test_SplitsSumExactlyToAmount() public {
        _three();
        _pay(1_000_000); // 1 USDC
        assertEq(usdc.balanceOf(S1), 500_000, "S1");
        assertEq(usdc.balanceOf(S2), 300_000, "S2");
        assertEq(usdc.balanceOf(S3), 150_000, "S3");
        assertEq(usdc.balanceOf(TREASURY), 50_000, "treasury gets unallocated 5%");
        uint256 sum = usdc.balanceOf(S1) + usdc.balanceOf(S2) + usdc.balanceOf(S3) + usdc.balanceOf(TREASURY);
        assertEq(sum, 1_000_000, "sum");
        assertEq(usdc.balanceOf(address(split)), 0, "no custody");
        assertEq(split.batchCount(), 1, "batch count");
    }

    function test_RoundingDustGoesToTreasury() public {
        vm.startPrank(OWNER);
        split.addShelter(S1, 3333, "a");
        split.addShelter(S2, 3333, "b");
        split.addShelter(S3, 3334, "c");
        vm.stopPrank();
        _pay(7); // 7*3333/10000 = 2, 2, 7*3334/10000 = 2 -> dust 1
        assertEq(usdc.balanceOf(S1), 2, "S1");
        assertEq(usdc.balanceOf(S2), 2, "S2");
        assertEq(usdc.balanceOf(S3), 2, "S3");
        assertEq(usdc.balanceOf(TREASURY), 1, "dust");
        assertEq(usdc.balanceOf(address(split)), 0, "no custody");
    }

    function test_TinyAmountSkipsZeroShares() public {
        _three();
        vm.recordLogs();
        _pay(1); // every share rounds to 0
        assertEq(usdc.balanceOf(TREASURY), 1, "all dust to treasury");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, DISBURSED_SIG), 0, "no zero-value Disbursed events");
        assertEq(_count(logs, BATCH_SIG), 1, "one batch event");
    }

    function test_PreviewMatchesDisburse() public {
        _three();
        (address[] memory w, uint256[] memory a, uint256 t) = split.preview(123_456_789);
        _pay(123_456_789);
        for (uint256 i; i < w.length; ++i) assertEq(usdc.balanceOf(w[i]), a[i], "preview share");
        assertEq(usdc.balanceOf(TREASURY), t, "preview treasury");
    }

    // ------------------------------------------------------------ bps cap

    function test_BpsCapEnforcedOnAdd() public {
        vm.startPrank(OWNER);
        split.addShelter(S1, 6000, "a");
        split.addShelter(S2, 4000, "b");
        vm.expectRevert(abi.encodeWithSelector(ShelterSplit.BpsCapExceeded.selector, uint256(10_001)));
        split.addShelter(S3, 1, "c");
        vm.stopPrank();
        assertEq(split.totalBps(), 10_000, "full allocation allowed");
    }

    function test_BpsCapEnforcedOnUpdate() public {
        _three(); // 9500
        vm.prank(OWNER);
        vm.expectRevert(abi.encodeWithSelector(ShelterSplit.BpsCapExceeded.selector, uint256(10_100)));
        split.updateShelter(S3, 2100, "Paris Strays");
    }

    function test_FullAllocationLeavesNothingButDust() public {
        vm.startPrank(OWNER);
        split.addShelter(S1, 7000, "a");
        split.addShelter(S2, 3000, "b");
        vm.stopPrank();
        _pay(1_000_000);
        assertEq(usdc.balanceOf(TREASURY), 0, "no remainder");
    }

    function test_ZeroBpsAndZeroWalletRejected() public {
        vm.startPrank(OWNER);
        vm.expectRevert(ShelterSplit.ZeroBps.selector);
        split.addShelter(S1, 0, "a");
        vm.expectRevert(ShelterSplit.ZeroAddress.selector);
        split.addShelter(address(0), 10, "a");
        split.addShelter(S1, 10, "a");
        vm.expectRevert(abi.encodeWithSelector(ShelterSplit.ShelterExists.selector, S1));
        split.addShelter(S1, 10, "dup");
        vm.stopPrank();
    }

    function test_MaxSheltersCap() public {
        vm.startPrank(OWNER);
        for (uint256 i = 1; i <= 50; ++i) split.addShelter(address(uint160(0x10000 + i)), 1, "s");
        vm.expectRevert(ShelterSplit.TooManyShelters.selector);
        split.addShelter(address(0x99999), 1, "s");
        vm.stopPrank();
    }

    // ------------------------------------------------------------ registry changes

    function test_UpdateShelter() public {
        _three();
        vm.prank(OWNER);
        split.updateShelter(S1, 2000, "Renamed");
        assertEq(split.totalBps(), 6500, "total after update");
        assertEq(split.getShelter(S1).name, "Renamed", "name");
        _pay(1_000_000);
        assertEq(usdc.balanceOf(S1), 200_000, "new share");
        assertEq(usdc.balanceOf(TREASURY), 350_000, "treasury");
    }

    function test_RemoveShelterSwapsAndPops() public {
        _three();
        vm.prank(OWNER);
        split.removeShelter(S1);
        assertEq(split.shelterCount(), 2, "count");
        assertEq(split.totalBps(), 4500, "bps freed");
        assertEq(split.shelterAt(0).wallet, S3, "last moved into slot");
        vm.expectRevert(abi.encodeWithSelector(ShelterSplit.UnknownShelter.selector, S1));
        split.getShelter(S1);
        _pay(1_000_000);
        assertEq(usdc.balanceOf(S1), 0, "removed gets nothing");
        assertEq(usdc.balanceOf(S3), 150_000, "moved shelter still paid");
        // removed wallet can be re-added
        vm.prank(OWNER);
        split.addShelter(S1, 100, "back");
        assertEq(split.getShelter(S1).bps, 100, "re-added");
    }

    function test_RemoveUnknownReverts() public {
        vm.prank(OWNER);
        vm.expectRevert(abi.encodeWithSelector(ShelterSplit.UnknownShelter.selector, S1));
        split.removeShelter(S1);
    }

    function test_InactiveShelterShareGoesToTreasury() public {
        _three();
        vm.prank(OWNER);
        split.setShelterActive(S2, false);
        _pay(1_000_000);
        assertEq(usdc.balanceOf(S2), 0, "inactive unpaid");
        assertEq(usdc.balanceOf(TREASURY), 350_000, "treasury absorbs inactive share");
        assertEq(split.totalBps(), 9500, "inactive still reserves bps");
    }

    // ------------------------------------------------------------ zero cases

    function test_ZeroAmountReverts() public {
        _three();
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.ZeroAmount.selector);
        split.disburse(0, "x");
    }

    function test_ZeroSheltersSendsAllToTreasury() public {
        vm.recordLogs();
        _pay(5_000_000);
        assertEq(usdc.balanceOf(TREASURY), 5_000_000, "all to treasury");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, DISBURSED_SIG), 0, "no shelter events");
        assertEq(_count(logs, BATCH_SIG), 1, "batch event");
    }

    function test_MemoTooLongReverts() public {
        bytes memory memo = new bytes(257);
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.MemoTooLong.selector);
        split.disburse(1, string(memo));
    }

    // ------------------------------------------------------------ pause

    function test_PauseBlocksDisburse() public {
        _three();
        vm.prank(OWNER);
        split.pause();
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.IsPaused.selector);
        split.disburse(100, "x");
        vm.prank(OWNER);
        split.unpause();
        _pay(100);
        assertEq(usdc.balanceOf(S1), 50, "works after unpause");
    }

    function test_PauseStateErrors() public {
        vm.startPrank(OWNER);
        vm.expectRevert(ShelterSplit.NotPaused.selector);
        split.unpause();
        split.pause();
        vm.expectRevert(ShelterSplit.IsPaused.selector);
        split.pause();
        vm.stopPrank();
    }

    // ------------------------------------------------------------ access control

    function test_OnlyOwner() public {
        vm.startPrank(PAYER);
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.addShelter(S1, 1, "a");
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.updateShelter(S1, 1, "a");
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.removeShelter(S1);
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.setShelterActive(S1, false);
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.setTreasury(PAYER);
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.pause();
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.unpause();
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.transferOwnership(PAYER);
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.sweep(address(usdc), PAYER, 1);
        vm.stopPrank();
    }

    function test_TwoStepOwnershipTransfer() public {
        address next = address(0xC0FFEE);
        vm.prank(OWNER);
        split.transferOwnership(next);
        assertEq(split.owner(), OWNER, "unchanged until accepted");
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.NotPendingOwner.selector);
        split.acceptOwnership();
        vm.prank(next);
        split.acceptOwnership();
        assertEq(split.owner(), next, "new owner");
        assertEq(split.pendingOwner(), address(0), "pending cleared");
        vm.prank(OWNER);
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.pause();
    }

    function test_SetTreasury() public {
        address t2 = address(0x7EA6);
        vm.prank(OWNER);
        split.setTreasury(t2);
        _pay(10);
        assertEq(usdc.balanceOf(t2), 10, "new treasury paid");
    }

    function test_ConstructorValidation() public {
        vm.expectRevert(ShelterSplit.ZeroAddress.selector);
        new ShelterSplit(address(0), TREASURY, OWNER);
        vm.expectRevert(ShelterSplit.ZeroAddress.selector);
        new ShelterSplit(address(usdc), address(0), OWNER);
        vm.expectRevert(ShelterSplit.NotAContract.selector);
        new ShelterSplit(address(0xDEAD), TREASURY, OWNER);
    }

    function test_SweepRecoversStrayTokens() public {
        usdc.mint(address(split), 77);
        vm.prank(OWNER);
        split.sweep(address(usdc), OWNER, 77);
        assertEq(usdc.balanceOf(OWNER), 77, "swept");
        // a stray balance never leaks into a disbursement
        usdc.mint(address(split), 5);
        _three();
        _pay(100);
        assertEq(usdc.balanceOf(address(split)), 5, "stray balance untouched");
    }

    // ------------------------------------------------------------ token quirks

    function test_NoReturnValueToken() public {
        NoReturnToken t = new NoReturnToken();
        ShelterSplit s = new ShelterSplit(address(t), TREASURY, OWNER);
        vm.prank(OWNER);
        s.addShelter(S1, 5000, "a");
        t.mint(PAYER, 1000);
        vm.prank(PAYER);
        t.approve(address(s), 1000);
        vm.prank(PAYER);
        s.disburse(1000, "usdt-style");
        assertEq(t.balanceOf(S1), 500, "shelter");
        assertEq(t.balanceOf(TREASURY), 500, "treasury");
    }

    function test_FalseReturningTokenReverts() public {
        FalseToken t = new FalseToken();
        ShelterSplit s = new ShelterSplit(address(t), TREASURY, OWNER);
        vm.prank(OWNER);
        s.addShelter(S1, 5000, "a");
        t.mint(PAYER, 1000);
        vm.prank(PAYER);
        t.approve(address(s), 1000);
        t.setFail(true);
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        s.disburse(1000, "x");
    }

    function test_FeeOnTransferSplitsWhatArrived() public {
        FeeOnTransferToken t = new FeeOnTransferToken();
        ShelterSplit s = new ShelterSplit(address(t), TREASURY, OWNER);
        vm.prank(OWNER);
        s.addShelter(S1, 5000, "a");
        t.mint(PAYER, 10_000);
        vm.prank(PAYER);
        t.approve(address(s), 10_000);
        vm.prank(PAYER);
        s.disburse(10_000, "fee");
        assertEq(t.balanceOf(address(s)), 0, "never overpays, never custodies");
    }

    // ------------------------------------------------------------ reentrancy

    function test_ReentrancyViaTransferFromIsBlocked() public {
        _reentrancyCase(true, false);
    }

    function test_ReentrancyViaPayoutTransferIsBlocked() public {
        _reentrancyCase(false, true);
    }

    function _reentrancyCase(bool onFrom, bool onTransfer) internal {
        ReentrantToken t = new ReentrantToken();
        ShelterSplit s = new ShelterSplit(address(t), TREASURY, OWNER);
        vm.prank(OWNER);
        s.addShelter(S1, 5000, "a");
        t.mint(PAYER, 1000);
        vm.prank(PAYER);
        t.approve(address(s), 1000);
        t.arm(ISplitter(address(s)), onFrom, onTransfer);
        vm.prank(PAYER);
        s.disburse(1000, "outer");
        assertTrue(t.attempted(), "attack attempted");
        assertEq(keccak256(t.lastRevert()), keccak256(abi.encodeWithSelector(ShelterSplit.Reentrancy.selector)), "nested call hit guard");
        assertEq(s.batchCount(), 1, "only the outer batch happened");
        assertEq(t.balanceOf(S1), 500, "outer paid correctly");
    }

    // ------------------------------------------------------------ events

    function test_EmitsPerShelterAndBatchEvents() public {
        _three();
        vm.expectEmit(true, false, false, true, address(split));
        emit Disbursed(S1, 500_000, "order-42");
        vm.expectEmit(true, false, false, true, address(split));
        emit Disbursed(S2, 300_000, "order-42");
        vm.expectEmit(true, false, false, true, address(split));
        emit Disbursed(S3, 150_000, "order-42");
        vm.expectEmit(true, true, false, true, address(split));
        emit DisbursementBatch(1, PAYER, 1_000_000, 950_000, 50_000, 3, "order-42");
        _pay(1_000_000);
    }

    function test_RegistryEvents() public {
        vm.startPrank(OWNER);
        vm.expectEmit(true, false, false, true, address(split));
        emit ShelterAdded(S1, 100, "a");
        split.addShelter(S1, 100, "a");
        vm.expectEmit(true, false, false, true, address(split));
        emit ShelterUpdated(S1, 200, "b");
        split.updateShelter(S1, 200, "b");
        vm.expectEmit(true, false, false, false, address(split));
        emit ShelterRemoved(S1);
        split.removeShelter(S1);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_SplitConservesAmount(uint256 amount, uint16 b1, uint16 b2, uint16 b3) public {
        amount = bound(amount, 1, 1e30);
        uint256 x1 = bound(b1, 1, 9_999);
        uint256 x2 = bound(b2, 1, 10_000 - x1);
        uint256 room = 10_000 - x1 - x2;
        vm.startPrank(OWNER);
        split.addShelter(S1, uint16(x1), "a");
        split.addShelter(S2, uint16(x2), "b");
        if (room > 0) split.addShelter(S3, uint16(bound(b3, 1, room)), "c");
        vm.stopPrank();

        uint256 before = usdc.balanceOf(PAYER);
        _pay(amount);
        uint256 total = usdc.balanceOf(S1) + usdc.balanceOf(S2) + usdc.balanceOf(S3) + usdc.balanceOf(TREASURY);
        assertEq(total, amount, "conservation");
        assertEq(before - usdc.balanceOf(PAYER), amount, "pulled exactly amount");
        assertEq(usdc.balanceOf(address(split)), 0, "no custody");
        assertEq(usdc.balanceOf(S1), (amount * x1) / 10_000, "S1 exact share");
        // dust is strictly less than one unit per shelter, plus the unallocated share
        uint256 unallocated = (amount * (10_000 - split.totalBps())) / 10_000;
        assertLe(usdc.balanceOf(TREASURY), unallocated + 3, "dust bound");
    }

    function testFuzz_BpsCapNeverExceeded(uint16 a, uint16 b) public {
        vm.startPrank(OWNER);
        uint256 x = bound(a, 1, 10_000);
        split.addShelter(S1, uint16(x), "a");
        uint256 y = bound(b, 1, type(uint16).max);
        if (x + y > 10_000) {
            vm.expectRevert(abi.encodeWithSelector(ShelterSplit.BpsCapExceeded.selector, x + y));
            split.addShelter(S2, uint16(y), "b");
        } else {
            split.addShelter(S2, uint16(y), "b");
        }
        vm.stopPrank();
        assertLe(split.totalBps(), 10_000, "cap");
    }

    // ------------------------------------------------------------ helpers

    function _count(Vm.Log[] memory logs, bytes32 sig) internal view returns (uint256 n) {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(split) && logs[i].topics.length > 0 && logs[i].topics[0] == sig) ++n;
        }
    }
}
