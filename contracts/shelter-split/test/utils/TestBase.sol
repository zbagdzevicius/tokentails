// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Vm, VM} from "./Vm.sol";

/// @notice A minimal stand-in for forge-std's Test: revert-based assertions and a few helpers.
abstract contract TestBase {
    bool public IS_TEST = true;
    Vm internal constant vm = VM;

    function assertTrue(bool ok, string memory what) internal pure {
        if (!ok) revert(string.concat("assertTrue failed: ", what));
    }

    function assertEq(uint256 a, uint256 b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": ", _str(a), " != ", _str(b)));
    }

    function assertEq(address a, address b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": address mismatch"));
    }

    function assertEq(bool a, bool b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": bool mismatch"));
    }

    function assertEq(bytes32 a, bytes32 b, string memory what) internal pure {
        if (a != b) revert(string.concat(what, ": bytes32 mismatch"));
    }

    function assertEq(string memory a, string memory b, string memory what) internal pure {
        if (keccak256(bytes(a)) != keccak256(bytes(b))) revert(string.concat(what, ": \"", a, "\" != \"", b, "\""));
    }

    function assertLe(uint256 a, uint256 b, string memory what) internal pure {
        if (a > b) revert(string.concat(what, ": ", _str(a), " > ", _str(b)));
    }

    function bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        require(min <= max, "bound: min > max");
        if (x >= min && x <= max) return x;
        uint256 size = max - min + 1;
        if (size == 0) return x; // full range
        return min + (x % size);
    }

    function _str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b;
        while (v != 0) {
            b = abi.encodePacked(bytes1(uint8(48 + (v % 10))), b);
            v /= 10;
        }
        return string(b);
    }
}
