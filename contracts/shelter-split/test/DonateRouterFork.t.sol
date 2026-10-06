// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {VM} from "./utils/Vm.sol";
import {DonateRouter, IShelterSplit} from "../src/DonateRouter.sol";

interface VmFork {
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function allowCheatcodes(address account) external;
}

interface IFiatTokenView {
    function balanceOf(address) external view returns (uint256);
    function name() external view returns (string memory);
    function version() external view returns (string memory);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address, bytes32) external view returns (bool);
}

/// @notice Stand-in for Arc's native-coin precompile at 0x1800...0000, which a local fork cannot execute
///         (Arc's FiatToken moves balances through it; anvil/forge see only a 1-byte marker and hit
///         StackUnderflow). It moves native balances with vm.deal, which is what the precompile does on
///         Arc: the ERC-20 at 0x3600 is a 6-decimal view of the 18-decimal native balance.
contract NativeCoinStub {
    address constant CHEATS = address(uint160(uint256(keccak256("hevm cheat code"))));

    function transfer(address from, address to, uint256 amount) external returns (bool) {
        require(from.balance >= amount, "native balance");
        IDeal(CHEATS).deal(from, from.balance - amount);
        IDeal(CHEATS).deal(to, to.balance + amount);
        return true;
    }
}

/// @notice Stand-in for Arc's blocklist precompile at 0x1800...0001 (also not executable on a fork):
///         nobody is blocklisted.
contract BlocklistStub {
    function isBlocklisted(address) external pure returns (bool) {
        return false;
    }
}

interface IDeal {
    function deal(address, uint256) external;
}

/// @notice Against the live Arc testnet ShelterSplit, on a local fork. Skipped unless FORK_ARC=1:
///         FORK_ARC=1 forge test --match-contract DonateRouterFork -vv
///         Nothing is broadcast: the fork is in-memory. Signers are anvil's public dev keys.
contract DonateRouterForkTest is TestBase {
    VmFork constant vmf = VmFork(address(VM));

    string constant RPC = "https://rpc.testnet.arc.io";
    address constant SPLIT = 0x457c89e10a6e66633Eda5Bf82fD086FEbB5DB147;
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant PINK_PAW = 0xE299299b846Ba629f5A591dBF4F562bcC07A0f37;

    // A test-only key derived from a public string, never funded. Not an anvil dev key: on Arc testnet
    // every anvil dev account carries an EIP-7702 delegation, so FiatToken checks it via ERC-1271.
    uint256 constant DEV_KEY = uint256(keccak256("tokentails.donate-router.fork.donor"));
    address constant NATIVE_COIN = 0x1800000000000000000000000000000000000000;
    address constant BLOCKLIST = 0x1800000000000000000000000000000000000001;

    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bool enabled;
    DonateRouter router;
    address donor;

    function setUp() public {
        enabled = vm.envOr("FORK_ARC", uint256(0)) == 1;
        if (!enabled) return;
        vmf.createSelectFork(RPC);
        router = new DonateRouter(SPLIT, USDC);
        donor = vm.addr(DEV_KEY);
        vm.deal(donor, 10 ether); // Arc: native balance is the USDC balance (18 decimals)
    }

    /// @dev Only the EIP-3009 tests need the stubs: the native path never touches the precompiles.
    function _stubNativeCoin() internal {
        vm.etch(NATIVE_COIN, address(new NativeCoinStub()).code);
        vmf.allowCheatcodes(NATIVE_COIN);
        vm.etch(BLOCKLIST, address(new BlocklistStub()).code);
    }

    function test_Fork_NativeGiftReachesPinkPaw() public {
        if (!enabled) return;
        uint256 before = PINK_PAW.balance;
        vm.prank(donor);
        router.donateNative{value: 0.01 ether}("tt:fork:native");
        assertEq(PINK_PAW.balance - before, 0.01 ether, "Pink Paw +0.01 native USDC");
        assertEq(address(router).balance, 0, "router keeps none");
    }

    function test_Fork_NativeCheckedGiftReachesPinkPaw() public {
        if (!enabled) return;
        uint256 before = PINK_PAW.balance;
        bytes32 rh = router.recipientsHash(0.01 ether);
        vm.prank(donor);
        router.donateNative{value: 0.01 ether}("tt:fork:native", rh);
        assertEq(PINK_PAW.balance - before, 0.01 ether, "Pink Paw +0.01 native USDC, list checked");
    }

    function test_Fork_CanDonate() public {
        if (!enabled) return;
        (bool ok, uint256 t) = router.canDonate(1_000_000);
        assertTrue(ok, "live split passes the guard");
        assertEq(t, 0, "no treasury share at 10000 bps");
    }

    function test_Fork_AuthGiftBytes() public {
        if (!enabled) return;
        _stubNativeCoin();
        (uint256 value, bytes32 salt, bytes32 rh, bytes32 digest) = _prep("tt:fork:auth");
        (uint8 v, bytes32 r, bytes32 s) = vmf.sign(DEV_KEY, digest);
        uint256 before = IFiatTokenView(USDC).balanceOf(PINK_PAW);
        router.donateWithAuthorization(
            DonateRouter.Gift(donor, value, 0, type(uint256).max, salt, rh), "tt:fork:auth", abi.encodePacked(r, s, v)
        );
        assertEq(IFiatTokenView(USDC).balanceOf(PINK_PAW) - before, value, "Pink Paw +value via bytes overload");
    }

    function test_Fork_AuthGiftVRS() public {
        if (!enabled) return;
        _stubNativeCoin();
        (uint256 value, bytes32 salt, bytes32 rh, bytes32 digest) = _prep("tt:fork:vrs");
        (uint8 v, bytes32 r, bytes32 s) = vmf.sign(DEV_KEY, digest);
        uint256 before = IFiatTokenView(USDC).balanceOf(PINK_PAW);
        router.donateWithAuthorizationVRS(
            DonateRouter.Gift(donor, value, 0, type(uint256).max, salt, rh), "tt:fork:vrs", v, r, s
        );
        assertEq(IFiatTokenView(USDC).balanceOf(PINK_PAW) - before, value, "Pink Paw +value via v/r/s overload");
    }

    function _prep(string memory memo) internal view returns (uint256 value, bytes32 salt, bytes32 rh, bytes32 digest) {
        value = 10_000; // 0.01 USDC in the 6-decimal ERC-20 view
        salt = keccak256(bytes(memo));
        rh = router.recipientsHash(value);
        bytes32 nonce = router.authNonce(salt, memo, rh);
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, donor, address(router), value, 0, type(uint256).max, nonce));
        digest = keccak256(abi.encodePacked("\x19\x01", IFiatTokenView(USDC).DOMAIN_SEPARATOR(), structHash));
    }
}
