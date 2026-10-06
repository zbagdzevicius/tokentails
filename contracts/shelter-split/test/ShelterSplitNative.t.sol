// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "./utils/Vm.sol";
import {ShelterSplit, IShelterSplitEvents} from "../src/ShelterSplit.sol";
import {
    MockUSDC,
    MockArcUSDC,
    RejectingReceiver,
    ReentrantReceiver,
    ISplitter
} from "./mocks/Tokens.sol";

/// @notice Native receive-and-split path: donate(memo) and receive(). Amounts are native units
///         (18 decimals; on Arc the native coin is USDC).
contract ShelterSplitNativeTest is TestBase, IShelterSplitEvents {
    MockUSDC usdc;
    ShelterSplit split;

    address constant OWNER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant PAYER = address(0xB0B);
    address constant S1 = address(0x5101);
    address constant S2 = address(0x5102);
    address constant S3 = address(0x5103);

    bytes32 constant DISBURSED_SIG = keccak256("Disbursed(address,uint256,string)");
    bytes32 constant NATIVE_DISBURSED_SIG = keccak256("NativeDisbursed(address,uint256,string)");
    bytes32 constant NATIVE_BATCH_SIG =
        keccak256("NativeDisbursementBatch(uint256,address,uint256,uint256,uint256,uint256,string)");

    function setUp() public {
        usdc = new MockUSDC();
        split = new ShelterSplit(address(usdc), TREASURY, OWNER);
        vm.deal(PAYER, 1e40);
    }

    function _three() internal {
        vm.startPrank(OWNER);
        split.addShelter(S1, 5000, "Vilnius Cat Rescue");
        split.addShelter(S2, 3000, "Kaunas Shelter");
        split.addShelter(S3, 1500, "Paris Strays");
        vm.stopPrank();
    }

    function _donate(uint256 value) internal returns (uint256 id) {
        vm.prank(PAYER);
        id = split.donate{value: value}("order-42");
    }

    function _count(Vm.Log[] memory logs, bytes32 sig) internal view returns (uint256 n) {
        for (uint256 i; i < logs.length; ++i) if (logs[i].topics[0] == sig && logs[i].emitter == address(split)) ++n;
    }

    // ------------------------------------------------------------ splits

    function test_Native_DonateSplitsExactly() public {
        _three();
        uint256 v = 1 ether + 7; // 1 USDC on Arc, plus 7 wei of sub-micro dust
        vm.recordLogs();
        uint256 id = _donate(v);
        assertEq(id, 1, "batch id");
        assertEq(S1.balance, 0.5 ether + 3, "S1 50%");
        assertEq(S2.balance, 0.3 ether + 2, "S2 30%");
        assertEq(S3.balance, 0.15 ether + 1, "S3 15%");
        assertEq(TREASURY.balance, v - S1.balance - S2.balance - S3.balance, "treasury rest + dust");
        assertEq(address(split).balance, 0, "no custody");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, NATIVE_DISBURSED_SIG), 3, "one NativeDisbursed per shelter");
        assertEq(_count(logs, NATIVE_BATCH_SIG), 1, "one native batch");
        assertEq(_count(logs, DISBURSED_SIG), 0, "no 6-decimal Disbursed event for native value");
    }

    function test_Native_EmitsBatchTotals() public {
        _three();
        vm.expectEmit(true, true, false, true, address(split));
        emit NativeDisbursementBatch(1, PAYER, 1000, 950, 50, 3, "order-42");
        _donate(1000);
    }

    function test_Native_PlainSendSplitsViaReceive() public {
        _three();
        vm.prank(PAYER);
        (bool ok,) = address(split).call{value: 1 ether}("");
        assertTrue(ok, "plain send accepted");
        assertEq(S1.balance, 0.5 ether, "S1");
        assertEq(TREASURY.balance, 0.05 ether, "treasury");
        assertEq(address(split).balance, 0, "no custody");
    }

    /// transfer()/send() forward 2300 gas: not enough to split, so the value bounces.
    function test_Native_TwoThousandThreeHundredGasStipendBounces() public {
        _three();
        vm.prank(PAYER);
        (bool ok,) = address(split).call{value: 1 ether, gas: 2300}("");
        assertTrue(!ok, "stipend send must fail, not strand value");
        assertEq(address(split).balance, 0, "nothing stranded");
    }

    function test_Native_ZeroValueReverts() public {
        _three();
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.ZeroAmount.selector);
        split.donate{value: 0}("x");
        vm.prank(PAYER);
        (bool ok, bytes memory r) = address(split).call("");
        assertTrue(!ok, "empty call reverts");
        assertEq(keccak256(r), keccak256(abi.encodeWithSelector(ShelterSplit.ZeroAmount.selector)), "ZeroAmount");
    }

    function test_Native_NoSheltersSendsAllToTreasury() public {
        _donate(12345);
        assertEq(TREASURY.balance, 12345, "treasury gets everything");
    }

    function test_Native_InactiveShelterShareGoesToTreasury() public {
        _three();
        vm.prank(OWNER);
        split.setShelterActive(S2, false);
        _donate(10_000);
        assertEq(S2.balance, 0, "inactive paid nothing");
        assertEq(TREASURY.balance, 3500, "treasury gets 5% + inactive 30%");
    }

    function test_Native_MemoTooLongReverts() public {
        bytes memory m = new bytes(257);
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.MemoTooLong.selector);
        split.donate{value: 1}(string(m));
    }

    function test_Native_PauseBlocksDonateAndReceive() public {
        _three();
        vm.prank(OWNER);
        split.pause();
        uint256 before = PAYER.balance;
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.IsPaused.selector);
        split.donate{value: 1 ether}("x");
        vm.prank(PAYER);
        (bool ok,) = address(split).call{value: 1 ether}("");
        assertTrue(!ok, "receive blocked while paused");
        assertEq(PAYER.balance, before, "value stays with the sender");
        assertEq(address(split).balance, 0, "nothing held");
        vm.prank(OWNER);
        split.unpause();
        _donate(1 ether);
        assertEq(S1.balance, 0.5 ether, "resumes after unpause");
    }

    function test_Native_BatchIdsShareOneCounterWithErc20() public {
        _three();
        usdc.mint(PAYER, 1e6);
        vm.startPrank(PAYER);
        usdc.approve(address(split), 1e6);
        assertEq(split.disburse(1e6, "erc20"), 1, "erc20 batch 1");
        assertEq(split.donate{value: 1e6}("native"), 2, "native batch 2");
        vm.stopPrank();
        assertEq(split.batchCount(), 2, "one counter");
        assertEq(usdc.balanceOf(S1), 500_000, "erc20 unaffected by native");
        assertEq(S1.balance, 500_000, "native unaffected by erc20");
    }

    function test_Native_PreviewMatchesDonate() public {
        _three();
        (address[] memory w, uint256[] memory a, uint256 t) = split.preview(987_654_321_987);
        _donate(987_654_321_987);
        for (uint256 i; i < w.length; ++i) assertEq(w[i].balance, a[i], "preview share");
        assertEq(TREASURY.balance, t, "preview treasury");
    }

    // ------------------------------------------------------------ failures (Arc: native sends can revert)

    function test_Native_ShelterRejectingValueRevertsWholeBatch() public {
        _three();
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(OWNER);
        split.updateShelter(S3, 1000, "Paris Strays");
        vm.prank(OWNER);
        split.addShelter(address(bad), 500, "Rejects native");
        uint256 before = PAYER.balance;
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        split.donate{value: 1 ether}("x");
        assertEq(S1.balance, 0, "no partial payout");
        assertEq(PAYER.balance, before, "payer refunded by the revert");
        vm.prank(OWNER);
        split.setShelterActive(address(bad), false);
        _donate(1 ether);
        assertEq(S1.balance, 0.5 ether, "paid after deactivation");
    }

    function test_Native_TreasuryRejectingValueReverts() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(OWNER);
        split.setTreasury(address(bad));
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        split.donate{value: 1 ether}("x");
    }

    // ------------------------------------------------------------ stray value and sweepNative

    function test_Native_StrayBalanceIsNeverSplitAndCanBeSwept() public {
        _three();
        vm.deal(address(split), 777); // e.g. forced in by SELFDESTRUCT
        _donate(10_000);
        assertEq(S1.balance, 5000, "only msg.value is split");
        assertEq(address(split).balance, 777, "stray value untouched");
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.NotOwner.selector);
        split.sweepNative(PAYER, 777);
        vm.prank(OWNER);
        vm.expectRevert(ShelterSplit.ZeroAddress.selector);
        split.sweepNative(address(0), 777);
        vm.expectEmit(true, false, false, true, address(split));
        emit NativeSwept(OWNER, 777);
        vm.prank(OWNER);
        split.sweepNative(OWNER, 777);
        assertEq(address(split).balance, 0, "swept");
        assertEq(OWNER.balance, 777, "owner got it");
    }

    // ------------------------------------------------------------ reentrancy

    function _reenter(ReentrantReceiver.Attack a) internal returns (ReentrantReceiver r) {
        r = new ReentrantReceiver();
        vm.startPrank(OWNER);
        split.addShelter(S1, 5000, "Vilnius Cat Rescue");
        split.addShelter(address(r), 3000, "Reentrant wallet");
        vm.stopPrank();
        r.arm(ISplitter(address(split)), a);
        _donate(1 ether);
        assertTrue(r.attempted(), "attack ran");
        assertEq(keccak256(r.lastRevert()), keccak256(abi.encodeWithSelector(ShelterSplit.Reentrancy.selector)), "nested call hit guard");
        assertEq(address(r).balance, 0.3 ether, "attacker got only its share");
        assertEq(S1.balance, 0.5 ether, "S1 paid");
        assertEq(TREASURY.balance, 0.2 ether, "treasury paid");
        assertEq(address(split).balance, 0, "no custody");
        assertEq(split.batchCount(), 1, "one batch only");
    }

    function test_Native_ReentrancyViaDonateIsBlocked() public {
        _reenter(ReentrantReceiver.Attack.Donate);
    }

    function test_Native_ReentrancyViaPlainSendIsBlocked() public {
        _reenter(ReentrantReceiver.Attack.PlainSend);
    }

    function test_Native_ReentrancyIntoErc20DisburseIsBlocked() public {
        _reenter(ReentrantReceiver.Attack.Disburse);
    }

    function test_Native_ReentrancyIntoDisburseWithMemoIsBlocked() public {
        _reenter(ReentrantReceiver.Attack.DisburseWithMemo);
    }

    /// Even the owner cannot sweep mid-batch: sweepNative is guarded too.
    function test_Native_ReentrancyIntoSweepNativeIsBlocked() public {
        ReentrantReceiver r = new ReentrantReceiver();
        ShelterSplit s = new ShelterSplit(address(usdc), TREASURY, address(r));
        vm.prank(address(r));
        s.addShelter(address(r), 10_000, "owner wallet");
        r.arm(ISplitter(address(s)), ReentrantReceiver.Attack.SweepNative);
        vm.prank(PAYER);
        s.donate{value: 1 ether}("x");
        assertEq(keccak256(r.lastRevert()), keccak256(abi.encodeWithSelector(ShelterSplit.Reentrancy.selector)), "guarded");
        assertEq(address(r).balance, 1 ether, "paid once");
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_Native_ConservesValue(uint256 value, uint16 b1, uint16 b2, uint16 b3) public {
        value = bound(value, 1, 1e36);
        b1 = uint16(bound(b1, 1, 9_998));
        b2 = uint16(bound(b2, 1, 9_999 - b1));
        b3 = uint16(bound(b3, 1, 10_000 - b1 - b2));
        vm.startPrank(OWNER);
        split.addShelter(S1, b1, "a");
        split.addShelter(S2, b2, "b");
        split.addShelter(S3, b3, "c");
        vm.stopPrank();
        _donate(value);
        uint256 sum = S1.balance + S2.balance + S3.balance + TREASURY.balance;
        assertEq(sum, value, "conserved");
        assertEq(address(split).balance, 0, "no residue");
        assertLe(S1.balance, (value * b1) / 10_000, "never overpays S1");
    }
}

/// @notice The ERC-20 and native paths on Arc, where both are views of ONE balance. The mock ERC-20 at
///         0x3600... reads and moves native balances, 6-decimal view over 18-decimal wei.
contract ArcDualBalanceTest is TestBase {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address constant OWNER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant PAYER = address(0xB0B);
    address constant S1 = address(0x5101);
    address constant S2 = address(0x5102);

    MockArcUSDC arc;
    ShelterSplit split;

    function setUp() public {
        vm.etch(ARC_USDC, address(new MockArcUSDC()).code);
        arc = MockArcUSDC(ARC_USDC);
        split = new ShelterSplit(ARC_USDC, TREASURY, OWNER);
        vm.deal(PAYER, 1e40);
        vm.prank(PAYER);
        arc.approve(address(split), type(uint256).max);
        vm.startPrank(OWNER);
        split.addShelter(S1, 6000, "Vilnius Cat Rescue");
        split.addShelter(S2, 2500, "Kaunas Shelter");
        vm.stopPrank();
    }

    /// 1 USDC through each path lands as exactly 2 USDC of native value: nothing counted twice.
    function test_Arc_BothPathsMoveOneBalanceWithoutDoubleCounting() public {
        vm.prank(PAYER);
        split.disburse(1_000_000, "erc20"); // 1 USDC, 6 decimals
        vm.prank(PAYER);
        split.donate{value: 1e18}("native"); // 1 USDC, 18 decimals
        assertEq(S1.balance, 1.2e18, "S1 60% of 2 USDC in wei");
        assertEq(arc.balanceOf(S1), 1_200_000, "same balance through the 6-decimal view");
        assertEq(S2.balance, 0.5e18, "S2");
        assertEq(TREASURY.balance, 0.3e18, "treasury");
        assertEq(address(split).balance, 0, "no custody");
        assertEq(arc.balanceOf(address(split)), 0, "no custody (erc20 view)");
    }

    /// Docs: "A zero balanceOf doesn't mean the native balance is zero." A sub-micro native donation is
    /// paid in full even though the 6-decimal view shows 0.
    function test_Arc_SubMicroNativeShareInvisibleToErc20View() public {
        vm.prank(PAYER);
        split.donate{value: 1e11}("tiny"); // 0.0000001 USDC
        assertEq(S1.balance, 6e10, "native share paid");
        assertEq(arc.balanceOf(S1), 0, "ERC-20 view truncates it to 0");
    }

    /// Fractional native dust already in the contract never leaks into disburse()'s received amount,
    /// and disburse() never pays it out.
    function testFuzz_Arc_Erc20DeltaIgnoresNativeDust(uint256 amount, uint256 dust, uint256 native) public {
        amount = bound(amount, 1, 1e18);
        dust = bound(dust, 0, 1e12 - 1);
        native = bound(native, 1, 1e30);
        vm.deal(address(split), dust);
        uint256 before = S1.balance + S2.balance + TREASURY.balance;
        vm.prank(PAYER);
        split.disburse(amount, "erc20");
        vm.prank(PAYER);
        split.donate{value: native}("native");
        uint256 paid = S1.balance + S2.balance + TREASURY.balance - before;
        assertEq(paid, amount * 1e12 + native, "exactly what was sent, in wei");
        assertEq(address(split).balance, dust, "dust untouched");
    }
}
