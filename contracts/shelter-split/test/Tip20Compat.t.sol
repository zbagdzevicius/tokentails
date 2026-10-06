// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm, VM} from "./utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";
import {MockUSDC, SilentFallbackToken, ReentrantMemoToken, ISplitter} from "./mocks/Tokens.sol";

/// @notice Cheatcodes this file needs beyond test/utils/Vm.sol (same cheatcode address).
interface VmTip20 {
    function etch(address target, bytes calldata code) external;
}

/// @notice Mock of a Tempo TIP-20 stablecoin (e.g. USDC.e), modelling the behaviour ShelterSplit
///         depends on, as documented on 2026-09-27:
///         - transfer / transferFrom return bool (tempo-std src/interfaces/ITIP20.sol);
///         - decimals() is always 6 (TIP-20 spec);
///         - a paused token reverts ContractPaused (TIP-20 spec);
///         - the TIP-403 transfer policy checks BOTH sender and recipient and reverts PolicyForbids
///           (TIP-403 spec);
///         - the recipient may not be the zero address or a 0x20c0... TIP-20 address (InvalidRecipient);
///         - since T6, a RECEIVE policy set by the recipient does NOT revert: the call returns true and
///           the funds go to ReceivePolicyGuard at 0xB10C00...00 with a claim receipt
///           (TIP-403 receive policies; tempo crates/precompiles/src/tip20/mod.rs);
///         - memos are optional (transferWithMemo is a separate function; plain transfer still works).
///         The real token is a precompile, but the node sets code at its address ("must ensure the
///         account is not empty, by setting some code"), so code.length > 0. The tests etch this mock
///         at the real USDC.e address to cover that path.
/// Sources: https://tempo.xyz/developers/docs/protocol/tip20/spec
///          https://tempo.xyz/developers/docs/protocol/tip403/spec
///          https://tempo.xyz/developers/docs/protocol/tip403/receive-policies
///          https://github.com/tempoxyz/tempo-std/blob/master/src/interfaces/ITIP20.sol
contract MockTIP20 {
    address public constant RECEIVE_POLICY_GUARD = 0xB10C000000000000000000000000000000000000;
    uint96 internal constant TIP20_PREFIX = 0x20c000000000000000000000; // 12-byte address prefix

    error ContractPaused();
    error PolicyForbids();
    error InvalidRecipient();
    error InsufficientAllowance();
    error InsufficientBalance(uint256 currentBalance, uint256 expectedBalance, address token);

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public paused;
    /// TIP-403 transfer policy modelled as a blacklist (applies to sender and recipient).
    mapping(address => bool) public blacklisted;
    /// T6 receive policy: receiver => sender => blocked.
    mapping(address => mapping(address => bool)) public receiveBlocked;

    function decimals() external pure returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setPaused(bool p) external { paused = p; }
    function setBlacklisted(address a, bool b) external { blacklisted[a] = b; }
    /// Called by the receiver itself, as on Tempo.
    function setReceiveBlocked(address sender, bool b) external { receiveBlocked[msg.sender][sender] = b; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < amount) revert InsufficientAllowance();
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function transferWithMemo(address to, uint256 amount, bytes32 memo) external {
        _transfer(msg.sender, to, amount);
        emit TransferWithMemo(msg.sender, to, amount, memo);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (paused) revert ContractPaused();
        if (to == address(0) || uint96(uint160(to) >> 64) == TIP20_PREFIX) revert InvalidRecipient();
        if (blacklisted[from] || blacklisted[to]) revert PolicyForbids();
        uint256 bal = balanceOf[from];
        if (bal < amount) revert InsufficientBalance(bal, amount, address(this));
        balanceOf[from] = bal - amount;
        address dest = receiveBlocked[to][from] ? RECEIVE_POLICY_GUARD : to;
        balanceOf[dest] += amount;
        emit Transfer(from, dest, amount);
    }
}

contract Tip20CompatTest is TestBase {
    /// USDC.e (Bridged USDC, Stargate) on Tempo mainnet, from
    /// https://tempo.xyz/developers/docs/guide/bridge-layerzero
    address constant USDCE = 0x20C000000000000000000000b9537d11c60E8b50;
    address constant GUARD = 0xB10C000000000000000000000000000000000000;

    address constant OWNER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant PAYER = address(0xB0B);
    address constant S1 = address(0x5101);
    address constant S2 = address(0x5102);

    bytes32 constant DISBURSED_SIG = keccak256("Disbursed(address,uint256,string)");

    MockTIP20 tip;
    ShelterSplit split;

    function setUp() public {
        VmTip20(address(VM)).etch(USDCE, address(new MockTIP20()).code);
        tip = MockTIP20(USDCE);
        split = new ShelterSplit(USDCE, TREASURY, OWNER);
        tip.mint(PAYER, 1e24);
        vm.prank(PAYER);
        tip.approve(address(split), type(uint256).max);
        vm.startPrank(OWNER);
        split.addShelter(S1, 6000, "Vilnius Cat Rescue");
        split.addShelter(S2, 2500, "Kaunas Shelter");
        vm.stopPrank();
    }

    function _pay(uint256 amount) internal {
        vm.prank(PAYER);
        split.disburse(amount, "order-1");
    }

    /// Deploys against a token at a 0x20c0... address with code (as the Tempo node sets it) and
    /// splits exactly with 6-decimal amounts.
    function test_Tip20_SplitsExactlyAtPrecompileAddress() public {
        assertEq(tip.decimals(), uint256(6), "TIP-20 decimals");
        _pay(10_000_001); // 10.000001 USDC.e
        assertEq(tip.balanceOf(S1), 6_000_000, "S1 60%");
        assertEq(tip.balanceOf(S2), 2_500_000, "S2 25%");
        assertEq(tip.balanceOf(TREASURY), 1_500_001, "treasury rest + dust");
        assertEq(tip.balanceOf(address(split)), 0, "contract keeps nothing");
    }

    function testFuzz_Tip20_ConservesAmount(uint256 amount) public {
        amount = bound(amount, 1, 1e24);
        _pay(amount);
        assertEq(tip.balanceOf(S1) + tip.balanceOf(S2) + tip.balanceOf(TREASURY), amount, "conserved");
        assertEq(tip.balanceOf(address(split)), 0, "no residue");
    }

    /// No memo is required: plain transfer/transferFrom work and the memo lives in ShelterSplit's event.
    function test_Tip20_NoMemoRequired() public {
        vm.recordLogs();
        _pay(1_000_000);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 n;
        for (uint256 i; i < logs.length; ++i) if (logs[i].topics[0] == DISBURSED_SIG) ++n;
        assertEq(n, uint256(2), "one Disbursed per shelter");
    }

    /// TIP-403 transfer policy forbids a shelter wallet: the whole batch reverts (atomic, no partial payout).
    function test_Tip20_TransferPolicyForbidsShelter_RevertsWholeBatch() public {
        tip.setBlacklisted(S2, true);
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        split.disburse(1_000_000, "order-2");
        assertEq(tip.balanceOf(S1), 0, "no partial payout");
        assertEq(tip.balanceOf(PAYER), 1e24, "payer untouched");
        // Recovery: the owner deactivates the blocked shelter and payouts resume.
        vm.prank(OWNER);
        split.setShelterActive(S2, false);
        _pay(1_000_000);
        assertEq(tip.balanceOf(S1), 600_000, "S1 paid after deactivation");
    }

    function test_Tip20_TransferPolicyForbidsPayer_Reverts() public {
        tip.setBlacklisted(PAYER, true);
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        split.disburse(1_000_000, "order-3");
    }

    function test_Tip20_PausedToken_Reverts() public {
        tip.setPaused(true);
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        split.disburse(1_000_000, "order-4");
    }

    /// A shelter registered at a 0x20c0... address (a token, not a wallet) makes every disburse revert
    /// until the owner removes it: registry hygiene the operator must follow on Tempo.
    function test_Tip20_ShelterAtTip20Address_Reverts() public {
        vm.prank(OWNER);
        split.updateShelter(S2, 1, "Kaunas Shelter");
        vm.prank(OWNER);
        split.addShelter(0x20C0000000000000000000000000000000000000, 100, "pathUSD by mistake");
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        split.disburse(1_000_000, "order-5");
    }

    /// KNOWN LIMITATION (Tempo T6 receive policies). A shelter whose wallet has a receive policy that
    /// blocks ShelterSplit as sender does NOT make the call revert: the token returns true and moves the
    /// share to ReceivePolicyGuard. ShelterSplit still emits Disbursed for that shelter, so the event
    /// overstates what the shelter wallet received. This test pins the current behaviour; a
    /// per-recipient balance check in disburse() would turn it into a revert (see
    /// applications/colosseum-worlds-fair/notes/chain-decision.md).
    function test_Tip20_ReceivePolicyBlock_IsSilent_KnownLimitation() public {
        vm.prank(S2);
        tip.setReceiveBlocked(address(split), true);
        vm.recordLogs();
        _pay(1_000_000);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 n;
        for (uint256 i; i < logs.length; ++i) if (logs[i].topics[0] == DISBURSED_SIG) ++n;
        assertEq(n, uint256(2), "Disbursed still emitted for the blocked shelter");
        assertEq(tip.balanceOf(S2), 0, "blocked shelter wallet received nothing");
        assertEq(tip.balanceOf(GUARD), 250_000, "share parked in ReceivePolicyGuard");
        assertEq(tip.balanceOf(S1), 600_000, "other shelter paid normally");
    }

    // ------------------------------------------------------------ disburseWithMemo (TIP-20 transferWithMemo)

    bytes32 constant TWM_SIG = keccak256("TransferWithMemo(address,address,uint256,bytes32)");
    bytes32 constant MEMO = bytes32("order-7");
    /// bytes32("order-7") as the 0x-hex string ShelterSplit puts in its own events.
    string constant MEMO_HEX = "0x6f726465722d3700000000000000000000000000000000000000000000000000";

    function _payMemo(uint256 amount, bytes32 memo) internal returns (uint256 id) {
        vm.prank(PAYER);
        id = split.disburseWithMemo(amount, memo);
    }

    /// Every payout, including the treasury's, is a transferWithMemo carrying the same 32-byte memo.
    function test_Tip20Memo_EveryPayoutCarriesTheMemo() public {
        vm.recordLogs();
        uint256 id = _payMemo(10_000_001, MEMO);
        assertEq(id, 1, "batch id");
        assertEq(tip.balanceOf(S1), 6_000_000, "S1 60%");
        assertEq(tip.balanceOf(S2), 2_500_000, "S2 25%");
        assertEq(tip.balanceOf(TREASURY), 1_500_001, "treasury rest + dust");
        assertEq(tip.balanceOf(address(split)), 0, "contract keeps nothing");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 withMemo;
        uint256 disbursed;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == USDCE && logs[i].topics[0] == TWM_SIG) {
                assertEq(logs[i].topics[1], bytes32(uint256(uint160(address(split)))), "from split");
                assertEq(logs[i].topics[3], MEMO, "memo topic");
                ++withMemo;
            }
            if (logs[i].emitter == address(split) && logs[i].topics[0] == DISBURSED_SIG) {
                (, string memory m) = abi.decode(logs[i].data, (uint256, string));
                assertEq(m, MEMO_HEX, "Disbursed memo is the hex of the bytes32");
                ++disbursed;
            }
        }
        assertEq(withMemo, uint256(3), "two shelters + treasury");
        assertEq(disbursed, uint256(2), "one Disbursed per shelter");
    }

    function test_Tip20Memo_ZeroAmountReverts() public {
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.ZeroAmount.selector);
        split.disburseWithMemo(0, MEMO);
    }

    function test_Tip20Memo_PausedSplitReverts() public {
        vm.prank(OWNER);
        split.pause();
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.IsPaused.selector);
        split.disburseWithMemo(1_000_000, MEMO);
    }

    /// TIP-403 policy on a shelter: the whole memo batch reverts, as with disburse().
    function test_Tip20Memo_PolicyForbidsShelter_RevertsWholeBatch() public {
        tip.setBlacklisted(S1, true);
        vm.prank(PAYER);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        split.disburseWithMemo(1_000_000, MEMO);
        assertEq(tip.balanceOf(PAYER), 1e24, "payer untouched");
    }

    /// A plain ERC-20 has no transferWithMemo: the memo path reverts and nothing moves.
    function test_Tip20Memo_PlainErc20Reverts() public {
        MockUSDC u = new MockUSDC();
        ShelterSplit s = new ShelterSplit(address(u), TREASURY, OWNER);
        vm.prank(OWNER);
        s.addShelter(S1, 5000, "a");
        u.mint(PAYER, 1e6);
        vm.startPrank(PAYER);
        u.approve(address(s), 1e6);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        s.disburseWithMemo(1e6, MEMO);
        vm.stopPrank();
        assertEq(u.balanceOf(PAYER), 1e6, "payer untouched");
    }

    /// A token whose fallback swallows transferWithMemo would leave funds in the contract; the
    /// balance post-check reverts instead.
    function test_Tip20Memo_SilentFallbackTokenReverts() public {
        SilentFallbackToken u = new SilentFallbackToken();
        ShelterSplit s = new ShelterSplit(address(u), TREASURY, OWNER);
        vm.prank(OWNER);
        s.addShelter(S1, 5000, "a");
        u.mint(PAYER, 1e6);
        vm.startPrank(PAYER);
        u.approve(address(s), 1e6);
        vm.expectRevert(ShelterSplit.TransferFailed.selector);
        s.disburseWithMemo(1e6, MEMO);
        vm.stopPrank();
        assertEq(u.balanceOf(address(s)), 0, "nothing stuck");
    }

    function _memoReentrancy(bool memoPath) internal {
        ReentrantMemoToken t = new ReentrantMemoToken();
        ShelterSplit s = new ShelterSplit(address(t), TREASURY, OWNER);
        vm.prank(OWNER);
        s.addShelter(S1, 5000, "a");
        t.mint(PAYER, 1e6);
        vm.prank(PAYER);
        t.approve(address(s), type(uint256).max);
        t.arm(ISplitter(address(s)), memoPath);
        vm.prank(PAYER);
        s.disburseWithMemo(1e6, MEMO);
        assertTrue(t.attempted(), "attack ran");
        assertEq(keccak256(t.lastRevert()), keccak256(abi.encodeWithSelector(ShelterSplit.Reentrancy.selector)), "nested call hit guard");
        assertEq(s.batchCount(), 1, "one batch only");
        assertEq(t.balanceOf(S1) + t.balanceOf(TREASURY), 1e6, "conserved");
    }

    function test_Tip20Memo_ReentrancyIntoDisburseWithMemoIsBlocked() public {
        _memoReentrancy(true);
    }

    function test_Tip20Memo_ReentrancyIntoDisburseIsBlocked() public {
        _memoReentrancy(false);
    }

    function testFuzz_Tip20Memo_ConservesAmount(uint256 amount, bytes32 memo) public {
        amount = bound(amount, 1, 1e24);
        _payMemo(amount, memo);
        assertEq(tip.balanceOf(S1) + tip.balanceOf(S2) + tip.balanceOf(TREASURY), amount, "conserved");
        assertEq(tip.balanceOf(address(split)), 0, "no residue");
        assertEq(tip.balanceOf(S1), (amount * 6000) / 10_000, "S1 exact share");
    }
}
