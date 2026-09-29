// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The subset of ERC-20 ShelterSplit relies on. Return values are handled defensively,
///         so tokens that return nothing (USDT-style) also work.
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Tempo TIP-20 memo transfer, verbatim from tempo-std src/interfaces/ITIP20.sol and the TIP-20
///         spec (checked 2026-09-29): `function transferWithMemo(address to, uint256 amount, bytes32 memo)
///         external;` It returns nothing, unlike transfer().
interface ITIP20Memo {
    function transferWithMemo(address to, uint256 amount, bytes32 memo) external;
}

/// @notice Events are declared in an interface so tests can emit the same signatures.
interface IShelterSplitEvents {
    event ShelterAdded(address indexed wallet, uint16 bps, string name);
    event ShelterUpdated(address indexed wallet, uint16 bps, string name);
    event ShelterActiveSet(address indexed wallet, bool active);
    event ShelterRemoved(address indexed wallet);
    /// @notice One per shelter paid in a disbursement.
    event Disbursed(address indexed shelter, uint256 amount, string memo);
    /// @notice One per disbursement: totals for the whole batch.
    event DisbursementBatch(
        uint256 indexed batchId,
        address indexed payer,
        uint256 amount,
        uint256 toShelters,
        uint256 toTreasury,
        uint256 sheltersPaid,
        string memo
    );
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event Swept(address indexed token, address indexed to, uint256 amount);
    /// @notice Native-coin payouts (donate / receive). Amounts are in the chain's native units, which on
    ///         Arc are 18-decimal USDC, not the 6-decimal units of Disbursed. Kept as separate events so
    ///         an indexer can never add the two scales together.
    event NativeDisbursed(address indexed shelter, uint256 amount, string memo);
    event NativeDisbursementBatch(
        uint256 indexed batchId,
        address indexed payer,
        uint256 amount,
        uint256 toShelters,
        uint256 toTreasury,
        uint256 sheltersPaid,
        string memo
    );
    event NativeSwept(address indexed to, uint256 amount);
}

/// @title ShelterSplit
/// @notice Splits a stablecoin (USDC) payment across registered animal-shelter wallets by basis
///         points. Whatever is not allocated to an active shelter, including rounding dust, goes to
///         the treasury. Every payout emits an event, so each disbursement is publicly verifiable.
/// @dev    The contract never holds funds between calls: disburse() pulls and pays out in one tx.
///         Three payout paths share the registry and the bps math:
///         - disburse(amount, memo): ERC-20 pull + push, amounts in token units (USDC/EURC: 6 decimals).
///         - disburseWithMemo(amount, memo32): the same, but every payout is a TIP-20 transferWithMemo
///           (Tempo only; on other tokens it reverts).
///         - donate(memo) / receive(): splits msg.value in the chain's native units. On Arc the native
///           coin IS USDC (18 decimals; the ERC-20 at 0x3600... is a 6-decimal view of the same balance).
///           Only msg.value is split, never address(this).balance or balanceOf, so the two views are never
///           mixed or counted twice.
contract ShelterSplit is IShelterSplitEvents {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_SHELTERS = 50;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_MEMO_BYTES = 256;
    uint8 private constant PAY_ERC20 = 0;
    uint8 private constant PAY_MEMO = 1;
    uint8 private constant PAY_NATIVE = 2;

    struct Shelter {
        address wallet;
        uint16 bps;
        bool active;
        string name;
    }

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error NotAContract();
    error ZeroAmount();
    error ZeroBps();
    error BpsCapExceeded(uint256 totalBps);
    error TooManyShelters();
    error ShelterExists(address wallet);
    error UnknownShelter(address wallet);
    error NameTooLong();
    error MemoTooLong();
    error IsPaused();
    error NotPaused();
    error Reentrancy();
    error TransferFailed();

    IERC20Minimal public immutable token;
    address public owner;
    address public pendingOwner;
    address public treasury;
    bool public paused;

    /// @notice Sum of bps over all registered shelters, active or not (reactivation can never exceed the cap).
    uint256 public totalBps;
    uint256 public batchCount;

    Shelter[] private _shelters;
    mapping(address => uint256) private _indexPlusOne;
    uint256 private _lock = 1;

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

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    constructor(address token_, address treasury_, address owner_) {
        if (token_ == address(0) || treasury_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (token_.code.length == 0) revert NotAContract();
        token = IERC20Minimal(token_);
        treasury = treasury_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
        emit TreasuryChanged(address(0), treasury_);
    }

    // ---------------------------------------------------------------- registry

    function addShelter(address wallet, uint16 bps, string calldata name) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();
        if (bps == 0) revert ZeroBps();
        if (bytes(name).length > MAX_NAME_BYTES) revert NameTooLong();
        if (_indexPlusOne[wallet] != 0) revert ShelterExists(wallet);
        if (_shelters.length >= MAX_SHELTERS) revert TooManyShelters();
        uint256 next = totalBps + bps;
        if (next > BPS_DENOMINATOR) revert BpsCapExceeded(next);
        totalBps = next;
        _shelters.push(Shelter({wallet: wallet, bps: bps, active: true, name: name}));
        _indexPlusOne[wallet] = _shelters.length;
        emit ShelterAdded(wallet, bps, name);
    }

    function updateShelter(address wallet, uint16 bps, string calldata name) external onlyOwner {
        if (bps == 0) revert ZeroBps();
        if (bytes(name).length > MAX_NAME_BYTES) revert NameTooLong();
        Shelter storage s = _get(wallet);
        uint256 next = totalBps - s.bps + bps;
        if (next > BPS_DENOMINATOR) revert BpsCapExceeded(next);
        totalBps = next;
        s.bps = bps;
        s.name = name;
        emit ShelterUpdated(wallet, bps, name);
    }

    /// @notice An inactive shelter keeps its slot and bps, but its share goes to the treasury.
    function setShelterActive(address wallet, bool active) external onlyOwner {
        _get(wallet).active = active;
        emit ShelterActiveSet(wallet, active);
    }

    function removeShelter(address wallet) external onlyOwner {
        uint256 idx = _indexPlusOne[wallet];
        if (idx == 0) revert UnknownShelter(wallet);
        totalBps -= _shelters[idx - 1].bps;
        uint256 last = _shelters.length;
        if (idx != last) {
            Shelter storage moved = _shelters[last - 1];
            _shelters[idx - 1] = moved;
            _indexPlusOne[moved.wallet] = idx;
        }
        _shelters.pop();
        delete _indexPlusOne[wallet];
        emit ShelterRemoved(wallet);
    }

    function shelterCount() external view returns (uint256) {
        return _shelters.length;
    }

    function shelterAt(uint256 index) external view returns (Shelter memory) {
        return _shelters[index];
    }

    function getShelter(address wallet) external view returns (Shelter memory) {
        uint256 idx = _indexPlusOne[wallet];
        if (idx == 0) revert UnknownShelter(wallet);
        return _shelters[idx - 1];
    }

    function shelters() external view returns (Shelter[] memory) {
        return _shelters;
    }

    // ---------------------------------------------------------------- payouts

    /// @notice What disburse(amount) would pay right now.
    function preview(uint256 amount)
        public
        view
        returns (address[] memory wallets, uint256[] memory amounts, uint256 toTreasury)
    {
        uint256 n = _shelters.length;
        wallets = new address[](n);
        amounts = new uint256[](n);
        uint256 paid;
        for (uint256 i; i < n; ++i) {
            Shelter storage s = _shelters[i];
            wallets[i] = s.wallet;
            if (!s.active) continue;
            uint256 share = (amount * s.bps) / BPS_DENOMINATOR;
            amounts[i] = share;
            paid += share;
        }
        toTreasury = amount - paid;
    }

    /// @notice Pulls `amount` of the token from the caller (approve first) and pays every active
    ///         shelter its share. The remainder, including rounding dust, goes to the treasury.
    /// @dev    Splits what actually arrived, so a fee-on-transfer token cannot make it overpay.
    function disburse(uint256 amount, string calldata memo)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 batchId)
    {
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();
        batchId = _disburse(amount, memo, bytes32(0), false);
    }

    /// @notice Tempo TIP-20 only. Same as disburse(), but every payout (shelters and treasury) is sent with
    ///         transferWithMemo, so the 32-byte memo (e.g. an order id) lands in the token's own
    ///         TransferWithMemo event. ShelterSplit's events carry the memo as a 0x-prefixed hex string.
    /// @dev    Reverts on a token without transferWithMemo. The contract's balance must be back where it
    ///         started after the payouts, so a token whose fallback silently accepts the call cannot
    ///         leave funds stuck here.
    function disburseWithMemo(uint256 amount, bytes32 memo)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 batchId)
    {
        batchId = _disburse(amount, _hex(memo), memo, true);
    }

    /// @notice Splits msg.value (the native coin; USDC with 18 decimals on Arc) across active shelters by
    ///         bps; the remainder and all rounding dust go to the treasury. Emits NativeDisbursed events.
    function donate(string calldata memo) external payable nonReentrant whenNotPaused returns (uint256 batchId) {
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();
        batchId = _disburseNative(memo);
    }

    /// @notice A plain native transfer to the contract is split like donate(""). While paused it reverts,
    ///         so the value stays with the sender. Needs more than the 2300-gas stipend of transfer().
    receive() external payable nonReentrant whenNotPaused {
        _disburseNative("");
    }

    // ---------------------------------------------------------------- payout internals

    function _disburse(uint256 amount, string memory memo, bytes32 memo32, bool withMemo)
        private
        returns (uint256 batchId)
    {
        if (amount == 0) revert ZeroAmount();

        uint256 before = token.balanceOf(address(this));
        _safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        batchId = _split(received, memo, memo32, withMemo ? PAY_MEMO : PAY_ERC20);
        if (withMemo && token.balanceOf(address(this)) != before) revert TransferFailed();
    }

    /// @dev Only msg.value is split: it is exact in native units, and it ignores any stray balance (for
    ///      example value forced in by SELFDESTRUCT), which sweepNative() recovers instead.
    function _disburseNative(string memory memo) private returns (uint256 batchId) {
        if (msg.value == 0) revert ZeroAmount();
        batchId = _split(msg.value, memo, bytes32(0), PAY_NATIVE);
    }

    /// @dev One loop for every path: active shelters get floor(received * bps / 10000), the treasury
    ///      gets the rest. Zero shares are skipped. Native payouts emit the Native* events.
    function _split(uint256 received, string memory memo, bytes32 memo32, uint8 mode)
        private
        returns (uint256 batchId)
    {
        batchId = ++batchCount;
        uint256 paid;
        uint256 count;
        uint256 n = _shelters.length;
        for (uint256 i; i < n; ++i) {
            Shelter storage s = _shelters[i];
            if (!s.active) continue;
            uint256 share = (received * s.bps) / BPS_DENOMINATOR;
            if (share == 0) continue;
            paid += share;
            ++count;
            _pay(s.wallet, share, memo32, mode);
            if (mode == PAY_NATIVE) emit NativeDisbursed(s.wallet, share, memo);
            else emit Disbursed(s.wallet, share, memo);
        }
        uint256 rest = received - paid;
        if (rest != 0) _pay(treasury, rest, memo32, mode);
        if (mode == PAY_NATIVE) emit NativeDisbursementBatch(batchId, msg.sender, received, paid, rest, count, memo);
        else emit DisbursementBatch(batchId, msg.sender, received, paid, rest, count, memo);
    }

    function _pay(address to, uint256 amount, bytes32 memo32, uint8 mode) private {
        if (mode == PAY_NATIVE) _sendNative(to, amount);
        else if (mode == PAY_MEMO) _call(address(token), abi.encodeCall(ITIP20Memo.transferWithMemo, (to, amount, memo32)));
        else _safeTransfer(to, amount);
    }

    // ---------------------------------------------------------------- admin

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }

    function pause() external onlyOwner {
        if (paused) revert IsPaused();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert NotPaused();
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Two-step ownership transfer: the new owner must call acceptOwnership().
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

    /// @notice Recovers tokens sent to the contract by mistake. disburse() never leaves a balance.
    function sweep(address erc20, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _call(erc20, abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        emit Swept(erc20, to, amount);
    }

    /// @notice Recovers native value that reached the contract without a split (e.g. via SELFDESTRUCT).
    ///         donate() and receive() never leave a balance.
    function sweepNative(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _sendNative(to, amount);
        emit NativeSwept(to, amount);
    }

    // ---------------------------------------------------------------- internals

    function _get(address wallet) private view returns (Shelter storage) {
        uint256 idx = _indexPlusOne[wallet];
        if (idx == 0) revert UnknownShelter(wallet);
        return _shelters[idx - 1];
    }

    function _safeTransfer(address to, uint256 amount) private {
        _call(address(token), abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        _call(address(token), abi.encodeCall(IERC20Minimal.transferFrom, (from, to, amount)));
    }

    /// @dev Arc: a native send can revert even with enough balance (blocklist, precompile, zero address,
    ///      destructed account, or a contract that rejects it). Any failure reverts the whole batch.
    function _sendNative(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _hex(bytes32 v) private pure returns (string memory) {
        bytes16 digits = "0123456789abcdef";
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i; i < 32; ++i) {
            uint8 b = uint8(v[i]);
            out[2 + 2 * i] = digits[b >> 4];
            out[3 + 2 * i] = digits[b & 0x0f];
        }
        return string(out);
    }

    /// @dev Accepts `true` or no return data; rejects `false`, reverts and calls to non-contracts.
    function _call(address target, bytes memory data) private {
        if (target.code.length == 0) revert NotAContract();
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok || (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert TransferFailed();
    }
}
