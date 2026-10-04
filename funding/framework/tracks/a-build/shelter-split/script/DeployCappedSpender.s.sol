// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VM} from "../test/utils/Vm.sol";
import {CappedSpender} from "../src/CappedSpender.sol";

interface ISplitToken {
    function token() external view returns (address);
}

interface IDecimals {
    function decimals() external view returns (uint8);
}

/// @dev console.log, declared locally (no forge-std).
interface IConsole {
    function log(string calldata, uint256) external view;
}

/// @notice Deploys CappedSpender, the contract-level spending limit for the treat agent. Every input
///         comes from the environment; nothing is hard-coded. Run by the founder only.
///
///   CAPPED_SPLIT        the ShelterSplit instance gifts go to (see ../deployments.json)
///   CAPPED_AGENT        the agent's hot address; it can only call give(), within the caps
///   CAPPED_OWNER        Token Tails' address; it can only withdraw the float back to itself
///   CAPPED_PER_TX       per-gift cap in raw units (native mode on Arc: 18 decimals, so 0.05 USDC is
///                       50000000000000000; ERC-20 mode: token units, 0.05 USDC is 50000)
///   CAPPED_DAILY        per-UTC-calendar-day cap (resets 00:00 UTC, not a rolling 24 h), same units
///   CAPPED_NATIVE       1 = native coin via split.donate (Arc only: 5042 / 5042002), 0 = ERC-20 via
///                       split.disburse
///   EXPECTED_CHAIN_ID   REQUIRED: refuse to run on any other chain
///   CAPPED_MAX_PER_TX   optional sanity ceiling for CAPPED_PER_TX in the same raw units; default
///                       1 USDC in this mode's units (1e18 native, 10**token.decimals() ERC-20). A cap
///                       written in the wrong units (18-decimal number in ERC-20 mode) fails here.
///
/// The caps, the agent, the split and the mode are immutable. Changing any of them means a new deploy.
///
/// Simulate (no broadcast):  forge script script/DeployCappedSpender.s.sol --rpc-url "$RPC_URL"
/// The founder broadcasts by adding --broadcast --account <keystore>. Then fund the float with a
/// plain transfer (native mode) or a token transfer (ERC-20 mode). Public donations never go here.
contract DeployCappedSpender {
    IConsole private constant CONSOLE = IConsole(0x000000000000000000636F6e736F6c652e6c6f67);

    error WrongChain(uint256 expected, uint256 actual);
    error FlagMustBeZeroOrOne(uint256 value);
    error ExpectedChainIdRequired();
    error NativeModeIsArcOnly(uint256 chainId);
    error PerTxAboveCeiling(uint256 perTx, uint256 ceiling);
    error DailyAboveCeiling(uint256 daily, uint256 ceiling);

    /// @notice Arc mainnet and testnet: the native coin is USDC with 18 decimals.
    function isArc(uint256 id) public pure returns (bool) {
        return id == 5042 || id == 5042002;
    }

    /// @notice Every deploy guard, pure so it can be tested without touching the process env.
    ///         `ceiling` is the per-gift sanity ceiling in raw units; the daily cap may be at most 100x it.
    function check(uint256 chainId, uint256 expected, bool nativeMode, uint256 perTx, uint256 daily, uint256 ceiling)
        public
        pure
    {
        if (expected == 0) revert ExpectedChainIdRequired();
        if (expected != chainId) revert WrongChain(expected, chainId);
        if (nativeMode && !isArc(chainId)) revert NativeModeIsArcOnly(chainId);
        if (perTx > ceiling) revert PerTxAboveCeiling(perTx, ceiling);
        if (daily > ceiling * 100) revert DailyAboveCeiling(daily, ceiling * 100);
    }

    function run() external returns (CappedSpender spender) {
        address split = VM.envAddress("CAPPED_SPLIT");
        address agent = VM.envAddress("CAPPED_AGENT");
        address owner = VM.envAddress("CAPPED_OWNER");
        uint256 perTx = VM.envUint("CAPPED_PER_TX");
        uint256 daily = VM.envUint("CAPPED_DAILY");
        uint256 nativeFlag = VM.envUint("CAPPED_NATIVE");
        if (nativeFlag > 1) revert FlagMustBeZeroOrOne(nativeFlag);
        uint256 expected = VM.envOr("EXPECTED_CHAIN_ID", uint256(0));
        uint256 decimals = nativeFlag == 1 ? 18 : IDecimals(ISplitToken(split).token()).decimals();
        uint256 oneUsdc = 10 ** decimals;
        uint256 ceiling = VM.envOr("CAPPED_MAX_PER_TX", oneUsdc);
        check(block.chainid, expected, nativeFlag == 1, perTx, daily, ceiling);

        // Caps in micro-USDC (6 decimals) so the log reads the same in both modes: 50000 = 0.05 USDC.
        CONSOLE.log("chain id", block.chainid);
        CONSOLE.log("unit decimals", decimals);
        CONSOLE.log("per-gift cap, micro-USDC (50000 = 0.05 USDC)", perTx * 1e6 / oneUsdc);
        CONSOLE.log("per-day cap,  micro-USDC (100000 = 0.10 USDC)", daily * 1e6 / oneUsdc);

        VM.startBroadcast();
        spender = new CappedSpender(split, agent, owner, perTx, daily, nativeFlag == 1);
        VM.stopBroadcast();
    }
}
