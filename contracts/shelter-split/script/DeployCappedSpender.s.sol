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

/// @notice Deploys CappedSpender, the contract-level spending limit for the treat agent. Every input
///         comes from the environment; nothing is hard-coded. Run by the founder only.
///
///   CAPPED_SPLIT        the ShelterSplit instance gifts go to (see client/public/shelter-payouts/*deployments.json)
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
///   CAPPED_MIN_PER_TX   optional floor for CAPPED_PER_TX in the same raw units; default 0.001 USDC in
///                       this mode's units (1e15 native, 10**(token.decimals() - 3) ERC-20). A cap
///                       written in 6-decimal units in native mode (CAPPED_PER_TX=50000, i.e.
///                       5e-14 USDC) fails here with PerTxBelowFloor.
///
/// Sponsor Match Desk runbook values (Arc, native mode, 18 decimals; agents/treat-agent/match-desk.sh):
///   CAPPED_NATIVE=1 CAPPED_PER_TX=50000000000000000 (0.05 USDC) CAPPED_DAILY=200000000000000000 (0.20 USDC)
///   EXPECTED_CHAIN_ID=5042002 on testnet first, then 5042. Never CAPPED_PER_TX=50000 in native mode.
///
/// The caps, the agent, the split and the mode are immutable. Changing any of them means a new deploy.
///
/// Simulate (no broadcast):  forge script script/DeployCappedSpender.s.sol --rpc-url "$RPC_URL"
/// The founder broadcasts by adding --broadcast --account <keystore>. Then fund the float with a
/// plain transfer (native mode) or a token transfer (ERC-20 mode). Public donations never go here.
contract DeployCappedSpender {
    /// @dev forge-std's console address. It has no code, so it is called low-level: a high-level call
    ///      to a function with no return value checks extcodesize first and would revert the script.
    address private constant CONSOLE = 0x000000000000000000636F6e736F6c652e6c6f67;

    /// @dev console.log(string,uint256) without forge-std.
    function _log(string memory k, uint256 v) private view {
        (bool ok,) = CONSOLE.staticcall(abi.encodeWithSignature("log(string,uint256)", k, v));
        ok;
    }

    error WrongChain(uint256 expected, uint256 actual);
    error FlagMustBeZeroOrOne(uint256 value);
    error ExpectedChainIdRequired();
    error NativeModeIsArcOnly(uint256 chainId);
    error PerTxAboveCeiling(uint256 perTx, uint256 ceiling);
    error DailyAboveCeiling(uint256 daily, uint256 ceiling);
    error PerTxBelowFloor(uint256 perTx, uint256 floor);

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

    /// @notice Refuses a per-gift cap below `floor` (raw units). Kept apart from `check` so its
    ///         signature stays stable. Catches 6-decimal numbers written for an 18-decimal native coin.
    function checkFloor(uint256 perTx, uint256 floor) public pure {
        if (perTx < floor) revert PerTxBelowFloor(perTx, floor);
    }

    /// @notice Every deploy input after the env has been read. `ceiling` and `floor` are raw units.
    struct Config {
        address split;
        address agent;
        address owner;
        uint256 perTx;
        uint256 daily;
        bool nativeMode;
        uint256 expected;
        uint256 ceiling;
        uint256 floor;
        uint256 decimals;
    }

    function run() external returns (CappedSpender spender) {
        Config memory c;
        c.split = VM.envAddress("CAPPED_SPLIT");
        c.agent = VM.envAddress("CAPPED_AGENT");
        c.owner = VM.envAddress("CAPPED_OWNER");
        c.perTx = VM.envUint("CAPPED_PER_TX");
        c.daily = VM.envUint("CAPPED_DAILY");
        uint256 nativeFlag = VM.envUint("CAPPED_NATIVE");
        if (nativeFlag > 1) revert FlagMustBeZeroOrOne(nativeFlag);
        c.nativeMode = nativeFlag == 1;
        c.expected = VM.envOr("EXPECTED_CHAIN_ID", uint256(0));
        c.decimals = c.nativeMode ? 18 : IDecimals(ISplitToken(c.split).token()).decimals();
        uint256 oneUsdc = 10 ** c.decimals;
        c.ceiling = VM.envOr("CAPPED_MAX_PER_TX", oneUsdc);
        c.floor = VM.envOr("CAPPED_MIN_PER_TX", oneUsdc / 1000);
        return deploy(c);
    }

    /// @notice The guards, the log and the broadcast, apart from the env so a test can run the whole
    ///         path (the forge test suite shares one process env across parallel tests).
    function deploy(Config memory c) public returns (CappedSpender spender) {
        check(block.chainid, c.expected, c.nativeMode, c.perTx, c.daily, c.ceiling);
        checkFloor(c.perTx, c.floor);
        uint256 oneUsdc = 10 ** c.decimals;

        // Caps in micro-USDC (6 decimals) so the log reads the same in both modes: 50000 = 0.05 USDC.
        _log("chain id", block.chainid);
        _log("unit decimals", c.decimals);
        _log("per-gift cap, micro-USDC (50000 = 0.05 USDC)", c.perTx * 1e6 / oneUsdc);
        _log("per-day cap,  micro-USDC (200000 = 0.20 USDC)", c.daily * 1e6 / oneUsdc);

        VM.startBroadcast();
        spender = new CappedSpender(c.split, c.agent, c.owner, c.perTx, c.daily, c.nativeMode);
        VM.stopBroadcast();
    }
}
