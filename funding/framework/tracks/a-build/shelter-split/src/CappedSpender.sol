// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The subset of ShelterSplit that CappedSpender calls. ShelterSplit.token() returns an
///         IERC20Minimal, which is an address in the ABI.
interface ISplitForSpender {
    function token() external view returns (address);
    function paused() external view returns (bool);
    function preview(uint256 amount)
        external
        view
        returns (address[] memory wallets, uint256[] memory amounts, uint256 toTreasury);
    function donate(string calldata memo) external payable returns (uint256 batchId);
    function disburse(uint256 amount, string calldata memo) external returns (uint256 batchId);
}

/// @title CappedSpender
/// @notice Holds Token Tails' OWN treat and match float and lets one agent address give it to animal
///         shelters through ShelterSplit, inside limits the agent cannot change:
///         - every gift goes to ShelterSplit and nowhere else (no arbitrary target, no arbitrary call);
///         - at most `perTxCap` per gift and `dailyCap` per UTC calendar day (day = block.timestamp / 1 days).
///           The day resets at 00:00 UTC, so up to 2 x dailyCap can go out across midnight; it is not a
///           rolling 24-hour window;
///         - only while the split sends nothing to its treasury for that amount (preview's third
///           return is 0), so the float can only reach shelter wallets;
///         - never while the split is paused;
///         - every memo starts with "tt:agent:", so agent gifts are tagged on-chain.
///         The agent is an AI-driven hot key. Whatever it proposes, the contract refuses anything
///         outside these limits: the limits live here, not in the prompt.
/// @dev    This contract is not a donation address and must never be shown as one. Native coin is only
///         accepted from the owner (receive() reverts for anyone else). ERC-20 transfers cannot be
///         blocked by a contract: a token sent here by mistake joins the float, which only the owner
///         (Token Tails) can withdraw, so never publish this address as a place to give.
///         Tokens other than this mode's asset have no sweep and stay stuck here.
///         The owner can withdraw the float only to its own address and hand ownership on (two-step).
///         That is an access rule, not a destination limit: a new owner withdraws to itself.
///         A shelter wallet that is a contract and sends coin back to this contract during a payout
///         makes every give() revert (the exact-balance check fails); the split owner registers only
///         wallets it trusts, and must re-point such a wallet.
///         The owner CANNOT raise the caps, change the agent, change the split or change the mode:
///         all of those are immutable, so changing any of them needs a new deployment.
///         Units: in native mode (Arc, where the native coin is USDC with 18 decimals) amounts are
///         native wei; in ERC-20 mode they are token units (USDC: 6 decimals).
contract CappedSpender {
    uint256 public constant MAX_MEMO_BYTES = 256; // ShelterSplit.MAX_MEMO_BYTES
    bytes9 private constant MEMO_PREFIX = "tt:agent:";

    error NotAgent();
    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error NotAContract();
    error ZeroAmount();
    error BadCaps(uint256 perTxCap, uint256 dailyCap);
    error OverTxCap(uint256 amount, uint256 cap);
    error OverDailyCap(uint256 wouldSpend, uint256 cap);
    error TreasuryShare(uint256 toTreasury);
    error SplitPaused();
    error BadMemo();
    error InsufficientFloat(uint256 available, uint256 amount);
    error NativeOnly();
    error WithdrawOnlyToOwner(address to);
    error Reentrancy();
    error TransferFailed();

    event AgentGift(uint256 indexed batchId, uint256 amount, string memo, uint256 spentToday);
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    ISplitForSpender public immutable split;
    address public immutable agent;
    uint256 public immutable perTxCap;
    uint256 public immutable dailyCap;
    bool public immutable native;
    /// @notice ERC-20 mode: the split's payout token, read once at deploy. Zero in native mode.
    address public immutable token;

    address public owner;
    address public pendingOwner;

    /// @notice The UTC day (block.timestamp / 1 days) that `spentOnDay` belongs to.
    uint256 public currentDay;
    uint256 public spentOnDay;
    uint256 public giftCount;

    uint256 private _lock = 1;

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address split_, address agent_, address owner_, uint256 perTxCap_, uint256 dailyCap_, bool native_) {
        if (split_ == address(0) || agent_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (split_.code.length == 0) revert NotAContract();
        if (perTxCap_ == 0 || dailyCap_ == 0 || perTxCap_ > dailyCap_) revert BadCaps(perTxCap_, dailyCap_);
        split = ISplitForSpender(split_);
        agent = agent_;
        perTxCap = perTxCap_;
        dailyCap = dailyCap_;
        native = native_;
        address t = native_ ? address(0) : ISplitForSpender(split_).token();
        if (!native_ && t.code.length == 0) revert NotAContract();
        token = t;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    // ---------------------------------------------------------------- views

    function today() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /// @notice What the agent has given so far in the current UTC day.
    function spentToday() public view returns (uint256) {
        return currentDay == today() ? spentOnDay : 0;
    }

    /// @notice How much more the agent may give today (ignores the per-gift cap and the float).
    function remainingToday() external view returns (uint256) {
        return dailyCap - spentToday();
    }

    /// @notice The float left to give: native balance in native mode, token balance otherwise.
    function floatBalance() public view returns (uint256) {
        return native ? address(this).balance : _tokenBalance();
    }

    // ---------------------------------------------------------------- giving

    /// @notice Gives `amount` of Token Tails' float to the shelters registered on the split.
    ///         Every check runs before any money moves; any failure reverts the whole call.
    function give(uint256 amount, string calldata memo) external onlyAgent nonReentrant returns (uint256 batchId) {
        bytes calldata m = bytes(memo);
        if (m.length < MEMO_PREFIX.length || m.length > MAX_MEMO_BYTES || bytes9(m[:9]) != MEMO_PREFIX) {
            revert BadMemo();
        }
        if (amount == 0) revert ZeroAmount();
        if (amount > perTxCap) revert OverTxCap(amount, perTxCap);

        uint256 d = today();
        uint256 spent = currentDay == d ? spentOnDay : 0;
        uint256 next = spent + amount;
        if (next > dailyCap) revert OverDailyCap(next, dailyCap);

        if (split.paused()) revert SplitPaused();
        (,, uint256 toTreasury) = split.preview(amount);
        if (toTreasury != 0) revert TreasuryShare(toTreasury);

        uint256 available = floatBalance();
        if (available < amount) revert InsufficientFloat(available, amount);

        currentDay = d;
        spentOnDay = next;
        ++giftCount;

        if (native) {
            batchId = split.donate{value: amount}(memo);
        } else {
            _approve(amount);
            batchId = split.disburse(amount, memo);
            _approve(0);
        }
        // The split pays out within the call and never keeps a balance, so exactly `amount` left.
        if (floatBalance() != available - amount) revert TransferFailed();
        emit AgentGift(batchId, amount, memo, next);
    }

    // ---------------------------------------------------------------- float

    /// @notice Funding the native float (native mode only, owner only). In ERC-20 mode the owner sends
    ///         the token instead. Anyone else's coin is refused, so a confused donor's gift cannot land
    ///         in a float Token Tails controls.
    receive() external payable {
        if (!native) revert NativeOnly();
        if (msg.sender != owner) revert NotOwner();
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Returns the whole float to the owner. Only the owner can call it and `to` must be the
    ///         owner's own address. This is an access rule, not a safety property: ownership can be
    ///         handed on (two-step), and the new owner then withdraws to itself.
    function withdraw(address to) external onlyOwner nonReentrant {
        if (to != owner) revert WithdrawOnlyToOwner(to);
        uint256 amount = floatBalance();
        if (amount == 0) revert ZeroAmount();
        if (native) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            _call(token, abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        }
        emit Withdrawn(to, amount);
    }

    // ---------------------------------------------------------------- ownership

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ---------------------------------------------------------------- internals

    function _tokenBalance() private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    function _approve(uint256 amount) private {
        _call(token, abi.encodeWithSignature("approve(address,uint256)", address(split), amount));
    }

    /// @dev Accepts `true` or no return data (USDT-style tokens); rejects `false` and reverts.
    function _call(address target, bytes memory data) private {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok || (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert TransferFailed();
    }
}
