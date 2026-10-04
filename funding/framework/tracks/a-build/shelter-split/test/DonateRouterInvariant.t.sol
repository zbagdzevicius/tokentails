// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {VM} from "./utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";
import {DonateRouter} from "../src/DonateRouter.sol";
import {MockFiatToken3009} from "./mocks/MockFiatToken3009.sol";

interface VmInv {
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
}

/// @notice Drives the router and, in between, the split owner's every lever (shares, active flags,
///         re-pointing, treasury, pause). Ghost totals record what each successful router path paid.
contract RouterHandler {
    VmInv constant vmx = VmInv(address(VM));

    MockFiatToken3009 public immutable usdc;
    ShelterSplit public immutable split;
    DonateRouter public immutable router;
    address public immutable owner;

    // Anvil's well-known dev account #1. A public test key, never used for real funds.
    uint256 constant DONOR_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    address public immutable donor;

    address[4] public wallets = [address(0x5101), address(0x5102), address(0x5103), address(0x5104)];
    address[2] public treasuries = [address(0x7EA5), address(0x7EA6)];

    uint256 public usdcPaid; // auth + flush, to shelter wallets
    uint256 public nativePaid;
    uint256 public strays; // USDC sent to the router by plain transfer, not yet flushed
    uint256 public calls;
    uint256 public successes;
    uint256 private saltCounter;

    constructor(MockFiatToken3009 usdc_, ShelterSplit split_, DonateRouter router_, address owner_) {
        usdc = usdc_;
        split = split_;
        router = router_;
        owner = owner_;
        donor = VM.addr(DONOR_KEY);
    }

    // ------------------------------------------------------------ donor paths

    function authGift(uint256 amount, uint8 memoSeed, bool useStaleList) external {
        calls++;
        amount = 1 + (amount % 1_000_000_000); // up to 1,000 USDC
        usdc.mint(donor, amount);
        string memory memo = memoSeed % 2 == 0 ? "tt:wallet:0badf00d" : "tt:wallet:cafe1234";
        bytes32 rh = router.recipientsHash(amount);
        if (useStaleList) rh = keccak256(abi.encode(rh)); // a list the donor never saw
        DonateRouter.Gift memory gift =
            DonateRouter.Gift(donor, amount, 0, type(uint64).max, keccak256(abi.encode(++saltCounter)), rh);
        bytes memory sig = _sign(gift, memo);
        uint256 before = _shelterUsdc();
        try router.donateWithAuthorization(gift, memo, sig) {
            successes++;
            usdcPaid += amount;
            require(_shelterUsdc() - before == amount, "auth gift did not reach the shelters in full");
        } catch {}
    }

    function _sign(DonateRouter.Gift memory gift, string memory memo) internal view returns (bytes memory) {
        bytes32 nonce = router.authNonce(gift.salt, memo, gift.recipients);
        bytes32 digest =
            usdc.receiveDigest(gift.from, address(router), gift.value, gift.validAfter, gift.validBefore, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vmx.sign(DONOR_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function nativeGift(uint256 amount, bool checked) external {
        calls++;
        amount = 1 + (amount % 1e21);
        vmx.deal(address(this), amount);
        bytes32 expected = checked ? router.recipientsHash(amount) : bytes32(0);
        uint256 before = _shelterNative();
        try router.donateNative{value: amount}("tt:wallet:00000001", expected) {
            successes++;
            nativePaid += amount;
            require(_shelterNative() - before == amount, "native gift did not reach the shelters in full");
        } catch {}
        vmx.deal(address(this), 0);
    }

    function strayTransfer(uint256 amount) external {
        calls++;
        amount = 1 + (amount % 1_000_000_000);
        usdc.mint(address(router), amount);
        strays += amount;
    }

    function flush() external {
        calls++;
        uint256 amount = usdc.balanceOf(address(router));
        try router.flush("anyone") {
            successes++;
            usdcPaid += amount;
            strays -= amount;
        } catch {}
    }

    // ------------------------------------------------------------ split owner levers

    function ownerSetShare(uint8 idx, uint16 bps) external {
        address w = wallets[idx % 4];
        bps = uint16(1 + (bps % 10_000));
        vmx.prank(owner);
        try split.updateShelter(w, bps, "s") {} catch {
            vmx.prank(owner);
            try split.addShelter(w, bps, "s") {} catch {}
        }
    }

    function ownerToggle(uint8 idx, bool active) external {
        vmx.prank(owner);
        try split.setShelterActive(wallets[idx % 4], active) {} catch {}
    }

    function ownerRemove(uint8 idx) external {
        vmx.prank(owner);
        try split.removeShelter(wallets[idx % 4]) {} catch {}
    }

    function ownerTreasury(uint8 idx) external {
        vmx.prank(owner);
        try split.setTreasury(treasuries[idx % 2]) {} catch {}
    }

    function ownerPause(bool p) external {
        vmx.prank(owner);
        if (p) {
            try split.pause() {} catch {}
        } else {
            try split.unpause() {} catch {}
        }
    }

    // ------------------------------------------------------------ views

    function _shelterUsdc() internal view returns (uint256 sum) {
        for (uint256 i; i < 4; ++i) sum += usdc.balanceOf(wallets[i]);
    }

    function _shelterNative() internal view returns (uint256 sum) {
        for (uint256 i; i < 4; ++i) sum += wallets[i].balance;
    }

    function shelterUsdc() external view returns (uint256) {
        return _shelterUsdc();
    }

    function shelterNative() external view returns (uint256) {
        return _shelterNative();
    }

    receive() external payable {}
}

/// @notice Stateful invariants of the DonateRouter custody statement: whatever the split owner does
///         and in whatever order donors, strangers and keepers call it, no router gift ever reaches a
///         treasury, the router keeps nothing but unflushed plain transfers, no allowance is left, and
///         every successful gift reaches the shelter wallets in full.
contract DonateRouterInvariantTest is TestBase {
    MockFiatToken3009 usdc;
    ShelterSplit split;
    DonateRouter router;
    RouterHandler handler;

    address constant OWNER = address(0xA11CE);

    function setUp() public {
        usdc = new MockFiatToken3009();
        split = new ShelterSplit(address(usdc), address(0x7EA5), OWNER);
        vm.prank(OWNER);
        split.addShelter(address(0x5101), 10_000, "Pink Paw");
        router = new DonateRouter(address(split), address(usdc));
        handler = new RouterHandler(usdc, split, router, OWNER);
    }

    /// @dev Forge reads this to pick the contracts it fuzzes (forge-std's StdInvariant, written out).
    function targetContracts() public view returns (address[] memory t) {
        t = new address[](1);
        t[0] = address(handler);
    }

    function invariant_TreasuriesNeverReceive() public view {
        for (uint256 i; i < 2; ++i) {
            address t = handler.treasuries(i);
            assertEq(usdc.balanceOf(t), 0, "treasury USDC");
            assertEq(t.balance, 0, "treasury native");
        }
    }

    function invariant_RouterKeepsOnlyUnflushedStrays() public view {
        assertEq(usdc.balanceOf(address(router)), handler.strays(), "router USDC is only plain transfers");
        assertEq(address(router).balance, 0, "router native");
        assertEq(usdc.allowance(address(router), address(split)), 0, "no allowance left");
    }

    function invariant_SplitKeepsNothing() public view {
        assertEq(usdc.balanceOf(address(split)), 0, "split USDC");
        assertEq(address(split).balance, 0, "split native");
    }

    /// @dev Not vacuous: every handler path can succeed (a run may still pause or empty the split).
    function test_HandlerPathsSucceedOnACleanSplit() public {
        handler.authGift(5_000_000, 0, false);
        handler.nativeGift(1e18, true);
        handler.nativeGift(1e17, false);
        handler.strayTransfer(250_000);
        handler.flush();
        assertEq(handler.successes(), 4, "auth, two native gifts and a flush");
        handler.authGift(1_000_000, 1, true); // signed over a list the router does not pay: refused
        assertEq(handler.successes(), 4, "stale list refused");
        invariant_TreasuriesNeverReceive();
        invariant_RouterKeepsOnlyUnflushedStrays();
        invariant_SplitKeepsNothing();
        invariant_ShelterTotalsMatchGifts();
    }

    function invariant_ShelterTotalsMatchGifts() public view {
        assertEq(handler.shelterUsdc(), handler.usdcPaid(), "shelters USDC == router gifts");
        assertEq(handler.shelterNative(), handler.nativePaid(), "shelters native == router gifts");
    }
}
