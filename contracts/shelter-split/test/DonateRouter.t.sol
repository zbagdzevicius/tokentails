// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm, VM} from "./utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";
import {DonateRouter} from "../src/DonateRouter.sol";
import {MockFiatToken3009, Mock1271Wallet} from "./mocks/MockFiatToken3009.sol";
import {MockUSDC} from "./mocks/Tokens.sol";

/// @notice Cheatcodes used here and not declared in utils/Vm.sol (kept local so that file stays untouched).
interface VmSign {
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract DonateRouterTest is TestBase {
    VmSign constant vmx = VmSign(address(VM));

    MockFiatToken3009 usdc;
    ShelterSplit split;
    DonateRouter router;

    address constant OWNER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant SHELTER = address(0x5101);
    address constant S2 = address(0x5102);
    address constant S3 = address(0x5103);
    address constant RELAYER = address(0xBEEF);

    // Anvil's well-known dev account #1. A public test key, never used for real funds.
    uint256 constant DONOR_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    address donor;

    uint256 constant ONE = 1_000_000; // 1 USDC, 6 decimals
    uint256 constant AFTER = 0;
    uint256 constant BEFORE = 2_000_000_000;
    bytes32 constant SALT = keccak256("salt-1");
    string constant MEMO = "tt:wallet:deadbeef";

    bytes32 constant BATCH_SIG = keccak256("DisbursementBatch(uint256,address,uint256,uint256,uint256,uint256,string)");
    bytes32 constant ROUTER_SIG = keccak256("RouterDonation(address,uint256,uint256,uint8,string,bytes32)");

    function setUp() public {
        vmx.warp(1_800_000_000);
        usdc = new MockFiatToken3009();
        split = new ShelterSplit(address(usdc), TREASURY, OWNER);
        vm.prank(OWNER);
        split.addShelter(SHELTER, 10_000, "Pink Paw");
        router = new DonateRouter(address(split), address(usdc));
        donor = vm.addr(DONOR_KEY);
        usdc.mint(donor, 100 * ONE);
    }

    // ------------------------------------------------------------ helpers

    function _sig(uint256 key, address from, address to, uint256 value, uint256 va, uint256 vb, bytes32 nonce)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vmx.sign(key, usdc.receiveDigest(from, to, value, va, vb, nonce));
        return abi.encodePacked(r, s, v);
    }

    function _gift(address from, uint256 value, uint256 va, uint256 vb, bytes32 rh)
        internal
        pure
        returns (DonateRouter.Gift memory)
    {
        return DonateRouter.Gift(from, value, va, vb, SALT, rh);
    }

    /// @dev The nonce a donor signs: bound to the payout list for `value` as it is right now.
    function _nonce(uint256 value, string memory memo) internal view returns (bytes32) {
        return router.authNonce(SALT, memo, router.recipientsHash(value));
    }

    function _signGift(uint256 value, string memory memo) internal view returns (bytes memory) {
        return _sig(DONOR_KEY, donor, address(router), value, AFTER, BEFORE, _nonce(value, memo));
    }

    /// @dev Submits with the recipients hash of the list as it is at submit time (what a relay passes on
    ///      when the list did not change). Tests for a changed list pass the signing-time hash instead.
    function _give(uint256 value, string memory memo, bytes memory sig) internal returns (uint256) {
        return _giveRh(value, memo, router.recipientsHash(value), sig);
    }

    function _giveRh(uint256 value, string memory memo, bytes32 rh, bytes memory sig) internal returns (uint256) {
        vm.prank(RELAYER);
        return router.donateWithAuthorization(_gift(donor, value, AFTER, BEFORE, rh), memo, sig);
    }

    // ------------------------------------------------------------ gasless path

    function test_AuthGiftPaysShelterInFull() public {
        bytes memory sig = _signGift(ONE, MEMO);
        vm.recordLogs();
        uint256 id = _give(ONE, MEMO, sig);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(usdc.balanceOf(SHELTER), ONE, "shelter gets 100%");
        assertEq(usdc.balanceOf(TREASURY), 0, "treasury gets nothing");
        assertEq(usdc.balanceOf(donor), 99 * ONE, "donor debited");
        assertEq(usdc.balanceOf(RELAYER), 0, "relayer never touches funds");
        assertEq(usdc.balanceOf(address(router)), 0, "router holds nothing");
        assertEq(usdc.balanceOf(address(split)), 0, "split holds nothing");
        assertEq(usdc.allowance(address(router), address(split)), 0, "no allowance left");
        assertEq(id, 1, "batch id");

        bool sawBatch;
        bool sawRouter;
        for (uint256 i; i < logs.length; ++i) {
            Vm.Log memory l = logs[i];
            if (l.emitter == address(split) && l.topics[0] == BATCH_SIG) {
                sawBatch = true;
                assertEq(address(uint160(uint256(l.topics[2]))), address(router), "payer is the router");
                (uint256 amount, uint256 toShelters, uint256 toTreasury,, string memory m) =
                    abi.decode(l.data, (uint256, uint256, uint256, uint256, string));
                assertEq(amount, ONE, "batch amount");
                assertEq(toShelters, ONE, "batch to shelters");
                assertEq(toTreasury, 0, "batch to treasury");
                assertEq(m, MEMO, "batch memo");
            }
            if (l.emitter == address(router) && l.topics[0] == ROUTER_SIG) {
                sawRouter = true;
                assertEq(address(uint160(uint256(l.topics[1]))), donor, "donor topic");
                assertEq(uint256(l.topics[2]), 1, "batch topic");
                assertEq(l.topics[3], _nonce(ONE, MEMO), "nonce topic");
                (uint256 amount, uint8 path, string memory m) = abi.decode(l.data, (uint256, uint8, string));
                assertEq(amount, ONE, "router amount");
                assertEq(uint256(path), uint256(router.PATH_AUTH()), "path");
                assertEq(m, MEMO, "router memo");
            }
        }
        assertTrue(sawBatch, "DisbursementBatch emitted");
        assertTrue(sawRouter, "RouterDonation emitted");
    }

    function test_AuthGiftVRS() public {
        (uint8 v, bytes32 r, bytes32 s) =
            vmx.sign(DONOR_KEY, usdc.receiveDigest(donor, address(router), ONE, AFTER, BEFORE, _nonce(ONE, MEMO)));
        bytes32 rh = router.recipientsHash(ONE);
        vm.prank(RELAYER);
        router.donateWithAuthorizationVRS(_gift(donor, ONE, AFTER, BEFORE, rh), MEMO, v, r, s);
        assertEq(usdc.balanceOf(SHELTER), ONE, "shelter paid via v/r/s");
    }

    function test_AuthGiftFromSmartWallet1271() public {
        Mock1271Wallet wallet = new Mock1271Wallet(donor);
        usdc.mint(address(wallet), ONE);
        bytes memory sig = _sig(DONOR_KEY, address(wallet), address(router), ONE, AFTER, BEFORE, _nonce(ONE, MEMO));
        router.donateWithAuthorization(
            _gift(address(wallet), ONE, AFTER, BEFORE, router.recipientsHash(ONE)), MEMO, sig
        );
        assertEq(usdc.balanceOf(SHELTER), ONE, "ERC-1271 wallet gift");
    }

    function test_AnyoneMaySubmitAndOutcomeIsFixed() public {
        bytes memory sig = _signGift(ONE, MEMO);
        // A different submitter (e.g. a front-runner) can only produce the exact same gift.
        bytes32 rh = router.recipientsHash(ONE);
        vm.prank(address(0xBAD));
        router.donateWithAuthorization(_gift(donor, ONE, AFTER, BEFORE, rh), MEMO, sig);
        assertEq(usdc.balanceOf(SHELTER), ONE, "same gift");
        // The relay's own copy then reverts, and the used nonce plus the event's nonce topic tell it why.
        assertTrue(usdc.authorizationState(donor, _nonce(ONE, MEMO)), "nonce used");
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
            _giveRh(ONE, MEMO, rhNow, sig);
        }
        assertEq(usdc.balanceOf(address(0xBAD)), 0, "submitter gains nothing");
    }

    function test_ReplayReverts() public {
        bytes memory sig = _signGift(ONE, MEMO);
        _give(ONE, MEMO, sig);
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
            _giveRh(ONE, MEMO, rhNow, sig);
        }
        assertEq(usdc.balanceOf(SHELTER), ONE, "paid once");
    }

    function test_MemoTamperingReverts() public {
        bytes memory sig = _signGift(ONE, "memo-A");
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
            _giveRh(ONE, "memo-B", rhNow, sig);
        }
    }

    function test_AmountTamperingReverts() public {
        bytes memory sig = _signGift(ONE, MEMO);
        {
            bytes32 rhNow = router.recipientsHash(2 * ONE);
            vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
            _giveRh(2 * ONE, MEMO, rhNow, sig);
        }
    }

    function test_SignatureForAnotherRouterReverts() public {
        DonateRouter other = new DonateRouter(address(split), address(usdc));
        // Signed for `other` (to = other, nonce bound to other), submitted to `router`.
        bytes memory sig = _sig(
            DONOR_KEY, donor, address(other), ONE, AFTER, BEFORE, other.authNonce(SALT, MEMO, other.recipientsHash(ONE))
        );
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
            _giveRh(ONE, MEMO, rhNow, sig);
        }
        // And `to` set to some other address with this router's nonce also fails.
        bytes memory sig2 = _sig(DONOR_KEY, donor, address(0xD00D), ONE, AFTER, BEFORE, _nonce(ONE, MEMO));
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
            _giveRh(ONE, MEMO, rhNow, sig2);
        }
    }

    function test_RouterSignatureCannotBeRedeemedDirectly() public {
        bytes memory sig = _signGift(ONE, MEMO);
        bytes32 nonce = _nonce(ONE, MEMO);
        vm.prank(address(0xBAD));
        vm.expectRevert(bytes("FiatTokenV2: caller must be the payee"));
        usdc.receiveWithAuthorization(donor, address(router), ONE, AFTER, BEFORE, nonce, sig);
    }

    function test_ExpiredReverts() public {
        uint256 vb = block.timestamp + 60;
        bytes memory sig = _sig(DONOR_KEY, donor, address(router), ONE, AFTER, vb, _nonce(ONE, MEMO));
        bytes32 rh = router.recipientsHash(ONE);
        vmx.warp(vb + 1);
        vm.expectRevert(bytes("FiatTokenV2: authorization is expired"));
        router.donateWithAuthorization(_gift(donor, ONE, AFTER, vb, rh), MEMO, sig);
    }

    function test_NotYetValidReverts() public {
        uint256 va = block.timestamp + 600;
        bytes memory sig = _sig(DONOR_KEY, donor, address(router), ONE, va, BEFORE, _nonce(ONE, MEMO));
        bytes32 rh = router.recipientsHash(ONE);
        vm.expectRevert(bytes("FiatTokenV2: authorization is not yet valid"));
        router.donateWithAuthorization(_gift(donor, ONE, va, BEFORE, rh), MEMO, sig);
    }

    function test_MemoTooLongReverts() public {
        bytes memory long = new bytes(257);
        for (uint256 i; i < long.length; ++i) {
            long[i] = "a";
        }
        vm.expectRevert(DonateRouter.MemoTooLong.selector);
        router.donateWithAuthorization(_gift(donor, ONE, AFTER, BEFORE, bytes32(0)), string(long), "");
    }

    function test_ZeroAmountReverts() public {
        vm.expectRevert(DonateRouter.ZeroAmount.selector);
        router.donateWithAuthorization(_gift(donor, 0, AFTER, BEFORE, bytes32(0)), MEMO, "");
    }

    // ------------------------------------------------------------ treasury guard

    function test_GuardRevertsWhenShelterShareBelowFull() public {
        vm.prank(OWNER);
        split.updateShelter(SHELTER, 9000, "Pink Paw");
        bytes memory sig = _signGift(ONE, MEMO);
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, uint256(100_000)));
            _giveRh(ONE, MEMO, rhNow, sig);
        }
        assertEq(usdc.balanceOf(donor), 100 * ONE, "gift stays with the donor");
        assertEq(usdc.balanceOf(TREASURY), 0, "treasury untouched");
    }

    function test_GuardRevertsWhenShelterInactive() public {
        vm.prank(OWNER);
        split.setShelterActive(SHELTER, false);
        bytes memory sig = _signGift(ONE, MEMO);
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, ONE));
            _giveRh(ONE, MEMO, rhNow, sig);
        }
    }

    function test_GuardRevertsOnUnallocatedThirds() public {
        // 3 x 3333 bps leaves 1 bp to the treasury.
        _threeShelters(3333, 3333, 3333);
        bytes memory sig = _signGift(ONE, MEMO);
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, uint256(100)));
            _giveRh(ONE, MEMO, rhNow, sig);
        }
    }

    function test_GuardRevertsOnRoundingDust() public {
        // 3333 + 3333 + 3334 = 10000 bps, but 7 units round down to 2 + 2 + 2: 1 unit of dust.
        _threeShelters(3333, 3333, 3334);
        bytes memory sig = _signGift(7, MEMO);
        {
            bytes32 rhNow = router.recipientsHash(7);
            vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, uint256(1)));
            _giveRh(7, MEMO, rhNow, sig);
        }
        // A dust-free amount goes through and splits across all three.
        bytes memory sig2 = _signGift(10_000, MEMO);
        _give(10_000, MEMO, sig2);
        assertEq(usdc.balanceOf(S2), 3333, "S2");
        assertEq(usdc.balanceOf(S3), 3334, "S3");
        assertEq(usdc.balanceOf(TREASURY), 0, "no dust");
    }

    function test_SplitPausedReverts() public {
        vm.prank(OWNER);
        split.pause();
        bytes memory sig = _signGift(ONE, MEMO);
        {
            bytes32 rhNow = router.recipientsHash(ONE);
            vm.expectRevert(DonateRouter.SplitPaused.selector);
            _giveRh(ONE, MEMO, rhNow, sig);
        }
        (bool ok,) = router.canDonate(ONE);
        assertTrue(!ok, "canDonate false while paused");
    }

    function test_CanDonate() public {
        (bool ok, uint256 t) = router.canDonate(ONE);
        assertTrue(ok, "ok at 10000 bps");
        assertEq(t, 0, "no treasury share");
        (ok,) = router.canDonate(0);
        assertTrue(!ok, "zero is not ok");
        vm.prank(OWNER);
        split.updateShelter(SHELTER, 9000, "Pink Paw");
        (ok, t) = router.canDonate(ONE);
        assertTrue(!ok, "not ok at 9000 bps");
        assertEq(t, 100_000, "toTreasury reported");
    }

    function testFuzz_FullShareAlwaysReachesShelter(uint256 value) public {
        value = bound(value, 1, 100 * ONE);
        bytes memory sig = _signGift(value, MEMO);
        _give(value, MEMO, sig);
        assertEq(usdc.balanceOf(SHELTER), value, "shelter gets it all");
        assertEq(usdc.balanceOf(TREASURY), 0, "treasury gets none");
        assertEq(usdc.balanceOf(address(router)), 0, "router keeps none");
    }

    // ------------------------------------------------------------ flush

    function test_FlushForwardsPlainTransfer() public {
        vm.prank(donor);
        usdc.transfer(address(router), 3 * ONE);
        vm.prank(RELAYER);
        router.flush("tt:flush");
        assertEq(usdc.balanceOf(SHELTER), 3 * ONE, "flushed to shelter");
        assertEq(usdc.balanceOf(address(router)), 0, "router empty");
    }

    function test_FlushZeroReverts() public {
        vm.expectRevert(DonateRouter.ZeroAmount.selector);
        router.flush("tt:flush");
    }

    function test_FlushGuarded() public {
        vm.prank(donor);
        usdc.transfer(address(router), ONE);
        vm.prank(OWNER);
        split.updateShelter(SHELTER, 5000, "Pink Paw");
        vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, ONE / 2));
        router.flush("tt:flush");
    }

    // ------------------------------------------------------------ native path (Arc: native = USDC, 18 decimals)

    function test_NativeGiftSplitsFully() public {
        address giver = address(0x6111);
        vm.deal(giver, 1 ether);
        vm.recordLogs();
        vm.prank(giver);
        uint256 id = router.donateNative{value: 0.01 ether}(MEMO);
        assertEq(SHELTER.balance, 0.01 ether, "shelter gets msg.value");
        assertEq(TREASURY.balance, 0, "treasury none");
        assertEq(address(router).balance, 0, "router keeps none");
        assertEq(address(split).balance, 0, "split keeps none");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool saw;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(router) && logs[i].topics[0] == ROUTER_SIG) {
                saw = true;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), giver, "donor = sender");
                assertEq(uint256(logs[i].topics[2]), id, "batch");
                assertEq(logs[i].topics[3], bytes32(0), "no nonce on the native path");
                (uint256 amount, uint8 path,) = abi.decode(logs[i].data, (uint256, uint8, string));
                assertEq(amount, 0.01 ether, "amount");
                assertEq(uint256(path), uint256(router.PATH_NATIVE()), "native path");
            }
        }
        assertTrue(saw, "RouterDonation emitted");
    }

    function test_NativeGiftRefusesTreasuryShare() public {
        vm.prank(OWNER);
        split.updateShelter(SHELTER, 9000, "Pink Paw");
        vm.deal(address(this), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, uint256(0.001 ether)));
        router.donateNative{value: 0.01 ether}(MEMO);
    }

    function test_NativeZeroReverts() public {
        vm.expectRevert(DonateRouter.ZeroAmount.selector);
        router.donateNative(MEMO);
    }

    function test_PlainNativeSendReverts() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(router).call{value: 1}("");
        assertTrue(!ok, "no receive()");
    }

    // ------------------------------------------------------------ recipients binding

    address constant THIEF = address(0x7417);

    /// @dev The split owner swaps Pink Paw's entry for another wallet at the same 100% share.
    function _repoint() internal {
        vm.startPrank(OWNER);
        split.removeShelter(SHELTER);
        split.addShelter(THIEF, 10_000, "Pink Paw");
        vm.stopPrank();
    }

    function test_RepointAfterSigningRevertsAuth() public {
        bytes32 signedRh = router.recipientsHash(ONE);
        bytes memory sig = _signGift(ONE, MEMO);
        _repoint();
        bytes32 nowRh = router.recipientsHash(ONE);
        assertTrue(nowRh != signedRh, "hash moved");
        vm.expectRevert(abi.encodeWithSelector(DonateRouter.RecipientsChanged.selector, signedRh, nowRh));
        _giveRh(ONE, MEMO, signedRh, sig);
        // Passing the new hash does not help: the signature was made over the old one.
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        _giveRh(ONE, MEMO, nowRh, sig);
        assertEq(usdc.balanceOf(THIEF), 0, "re-pointed wallet got nothing");
        assertEq(usdc.balanceOf(donor), 100 * ONE, "gift stays with the donor");
    }

    function test_RepointAfterSigningRevertsVRS() public {
        bytes32 signedRh = router.recipientsHash(ONE);
        (uint8 v, bytes32 r, bytes32 s) =
            vmx.sign(DONOR_KEY, usdc.receiveDigest(donor, address(router), ONE, AFTER, BEFORE, _nonce(ONE, MEMO)));
        _repoint();
        vm.expectRevert(
            abi.encodeWithSelector(DonateRouter.RecipientsChanged.selector, signedRh, router.recipientsHash(ONE))
        );
        router.donateWithAuthorizationVRS(_gift(donor, ONE, AFTER, BEFORE, signedRh), MEMO, v, r, s);
        assertEq(usdc.balanceOf(THIEF), 0, "re-pointed wallet got nothing");
    }

    function test_ShareChangeAfterSigningReverts() public {
        // Two shelters at 50/50, then the owner moves the split to 90/10 (no treasury share either way).
        vm.startPrank(OWNER);
        split.updateShelter(SHELTER, 5000, "Pink Paw");
        split.addShelter(S2, 5000, "two");
        vm.stopPrank();
        bytes32 signedRh = router.recipientsHash(ONE);
        bytes memory sig = _signGift(ONE, MEMO);
        vm.startPrank(OWNER);
        split.updateShelter(S2, 1000, "two");
        split.updateShelter(SHELTER, 9000, "Pink Paw");
        vm.stopPrank();
        vm.expectRevert(
            abi.encodeWithSelector(DonateRouter.RecipientsChanged.selector, signedRh, router.recipientsHash(ONE))
        );
        _giveRh(ONE, MEMO, signedRh, sig);
    }

    function test_SignedHashMustMatchAmount() public {
        // The hash covers amounts too: a hash taken for another amount is refused before the signature check.
        bytes memory sig = _signGift(ONE, MEMO);
        bytes32 otherRh = router.recipientsHash(2 * ONE);
        vm.expectRevert(
            abi.encodeWithSelector(DonateRouter.RecipientsChanged.selector, otherRh, router.recipientsHash(ONE))
        );
        _giveRh(ONE, MEMO, otherRh, sig);
    }

    function test_NativeCheckedGift() public {
        address giver = address(0x6111);
        vm.deal(giver, 1 ether);
        bytes32 rh = router.recipientsHash(0.01 ether);
        vm.prank(giver);
        router.donateNative{value: 0.01 ether}(MEMO, rh);
        assertEq(SHELTER.balance, 0.01 ether, "shelter paid");
    }

    function test_RepointAfterSendingRevertsNative() public {
        address giver = address(0x6111);
        vm.deal(giver, 1 ether);
        bytes32 rh = router.recipientsHash(0.01 ether);
        _repoint();
        vm.expectRevert(
            abi.encodeWithSelector(DonateRouter.RecipientsChanged.selector, rh, router.recipientsHash(0.01 ether))
        );
        vm.prank(giver);
        router.donateNative{value: 0.01 ether}(MEMO, rh);
        assertEq(THIEF.balance, 0, "re-pointed wallet got nothing");
        assertEq(giver.balance, 1 ether, "value stays with the giver");
    }

    function test_NativeZeroHashSkipsCheck() public {
        _repoint();
        vm.deal(address(this), 1 ether);
        router.donateNative{value: 0.01 ether}(MEMO, bytes32(0));
        router.donateNative{value: 0.01 ether}(MEMO);
        assertEq(THIEF.balance, 0.02 ether, "unchecked forms pay the current list");
    }

    function test_FlushEventHasNoNonce() public {
        vm.prank(donor);
        usdc.transfer(address(router), ONE);
        vm.recordLogs();
        router.flush("anything");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool saw;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(router) && logs[i].topics[0] == ROUTER_SIG) {
                saw = true;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), address(0), "no donor on flush");
                assertEq(logs[i].topics[3], bytes32(0), "no nonce on flush");
            }
        }
        assertTrue(saw, "RouterDonation emitted");
    }

    // ------------------------------------------------------------ second treasury check, reentrancy

    function test_PostPayoutCheckCatchesLyingSplitAuth() public {
        MockLyingSplit liar = new MockLyingSplit(address(usdc), TREASURY, SHELTER);
        DonateRouter r2 = new DonateRouter(address(liar), address(usdc));
        bytes32 rh = r2.recipientsHash(ONE);
        bytes memory sig = _sig(DONOR_KEY, donor, address(r2), ONE, AFTER, BEFORE, r2.authNonce(SALT, MEMO, rh));
        (bool ok, uint256 t) = r2.canDonate(ONE);
        assertTrue(ok && t == 0, "preview claims a clean split");
        vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, ONE));
        r2.donateWithAuthorization(_gift(donor, ONE, AFTER, BEFORE, rh), MEMO, sig);
        assertEq(usdc.balanceOf(TREASURY), 0, "treasury untouched");
        assertEq(usdc.balanceOf(donor), 100 * ONE, "gift stays with the donor");
    }

    function test_PostPayoutCheckCatchesLyingSplitNative() public {
        MockLyingSplit liar = new MockLyingSplit(address(usdc), TREASURY, SHELTER);
        DonateRouter r2 = new DonateRouter(address(liar), address(usdc));
        vm.deal(address(this), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(DonateRouter.TreasuryShare.selector, uint256(0.01 ether)));
        r2.donateNative{value: 0.01 ether}(MEMO);
        assertEq(TREASURY.balance, 0, "treasury untouched");
    }

    function test_ReentryFromShelterWalletIsBlocked() public {
        ReentrantShelter bad = new ReentrantShelter(router);
        vm.startPrank(OWNER);
        split.removeShelter(SHELTER);
        split.addShelter(address(bad), 10_000, "reenter");
        vm.stopPrank();
        vm.deal(address(this), 1 ether);
        router.donateNative{value: 0.01 ether}(MEMO);
        assertTrue(bad.tried(), "shelter tried to re-enter");
        assertEq(bytes4(bad.err()), DonateRouter.Reentrancy.selector, "router lock refused the re-entry");
        assertEq(address(bad).balance, 0.01 ether, "outer gift paid once");
    }

    // ------------------------------------------------------------ construction

    function test_WrongTokenReverts() public {
        MockUSDC other = new MockUSDC();
        vm.expectRevert(DonateRouter.WrongToken.selector);
        new DonateRouter(address(split), address(other));
    }

    function test_ImmutableWiring() public {
        assertEq(address(router.split()), address(split), "split");
        assertEq(address(router.usdc()), address(usdc), "usdc");
        bytes32 rh = keccak256(bytes("recipients"));
        assertEq(
            router.authNonce(SALT, MEMO, rh),
            keccak256(abi.encode(address(router), keccak256(bytes(MEMO)), SALT, rh)),
            "nonce formula"
        );
        address[] memory w = new address[](1);
        uint256[] memory a = new uint256[](1);
        w[0] = SHELTER;
        a[0] = ONE;
        assertEq(router.recipientsHash(ONE), keccak256(abi.encode(w, a)), "recipients formula");
    }

    // ------------------------------------------------------------ internals

    function _threeShelters(uint16 a, uint16 b, uint16 c) internal {
        vm.startPrank(OWNER);
        split.updateShelter(SHELTER, a, "Pink Paw");
        split.addShelter(S2, b, "two");
        split.addShelter(S3, c, "three");
        vm.stopPrank();
    }
}

/// @notice A split whose preview() reports a clean 100% shelter payout while disburse() and donate()
///         actually pay the treasury. Only the router's post-payout balance check can catch it.
contract MockLyingSplit {
    address public immutable token;
    address public immutable treasury;
    address public immutable shelter;
    bool public constant paused = false;
    uint256 public batchCount;

    constructor(address token_, address treasury_, address shelter_) {
        token = token_;
        treasury = treasury_;
        shelter = shelter_;
    }

    function preview(uint256 amount)
        external
        view
        returns (address[] memory wallets, uint256[] memory amounts, uint256 toTreasury)
    {
        wallets = new address[](1);
        amounts = new uint256[](1);
        wallets[0] = shelter;
        amounts[0] = amount;
        toTreasury = 0;
    }

    function disburse(uint256 amount, string calldata) external returns (uint256) {
        MockFiatToken3009(token).transferFrom(msg.sender, treasury, amount);
        return ++batchCount;
    }

    function donate(string calldata) external payable returns (uint256) {
        (bool ok,) = treasury.call{value: msg.value}("");
        require(ok, "send");
        return ++batchCount;
    }
}

/// @notice A shelter wallet that tries to give its payout straight back through the router.
contract ReentrantShelter {
    DonateRouter public immutable router;
    bool public tried;
    bytes public err;

    constructor(DonateRouter router_) {
        router = router_;
    }

    receive() external payable {
        if (tried) return;
        tried = true;
        try router.donateNative{value: msg.value}("reenter") {}
        catch (bytes memory e) {
            err = e;
        }
    }
}
