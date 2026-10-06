// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The Foundry cheatcodes this project uses, declared locally so the project builds with no
///         external dependencies (no forge-std, no git submodules, no network).
interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
    function assume(bool condition) external pure;
    function label(address account, string calldata newLabel) external;
    function addr(uint256 privateKey) external pure returns (address);
    function setEnv(string calldata name, string calldata value) external;
    function toString(address value) external pure returns (string memory);
    function chainId(uint256 newChainId) external;
    function deal(address account, uint256 newBalance) external;
    function etch(address target, bytes calldata code) external;

    // scripting
    function envAddress(string calldata name) external view returns (address);
    function envOr(string calldata name, address defaultValue) external view returns (address);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
    function envOr(string calldata name, string calldata defaultValue) external view returns (string memory);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

Vm constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
