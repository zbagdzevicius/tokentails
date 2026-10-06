// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The ShelterSplit functions the router calls (see ShelterSplit.sol; that contract is not modified).
interface IShelterSplit {
    function token() external view returns (address);
    function treasury() external view returns (address);
    function paused() external view returns (bool);
    function preview(uint256 amount)
        external
        view
        returns (address[] memory wallets, uint256[] memory amounts, uint256 toTreasury);
    function disburse(uint256 amount, string calldata memo) external returns (uint256 batchId);
    function donate(string calldata memo) external payable returns (uint256 batchId);
}

/// @notice Circle FiatToken (USDC) EIP-3009 receive path, plus the ERC-20 calls the router needs.
///         The `bytes signature` overload is FiatToken v2.2 and accepts ERC-1271 smart-contract and
///         passkey wallets; the v/r/s overload exists in every FiatToken since v2.
interface IFiatToken3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title DonateRouter
/// @notice A public front door to an already deployed ShelterSplit. Anyone can give straight to the
///         registered shelters, a gift given here can never reach the ShelterSplit treasury, and the
///         donor signs exactly who gets paid: if the shelter list changes after signing, the gift reverts.
///
///         Three ways in:
///         - donateWithAuthorization / donateWithAuthorizationVRS: the donor signs one EIP-3009
///           ReceiveWithAuthorization message (EIP-712). Anyone may submit it and pay the gas, so the
///           donor needs no gas token and no approve step. The EIP-3009 nonce is
///           authNonce(salt, memo, recipients), where recipients = recipientsHash(value) is the hash of
///           every shelter wallet and the exact amount each gets. That binds the memo, this router and
///           the payout list to the signature: a relayer cannot change the memo, the amount or the
///           destination, the split owner cannot re-point a shelter between signing and submitting
///           (RecipientsChanged), and since receiveWithAuthorization requires `to == msg.sender`,
///           nobody else can redeem the signature for anything but this donation.
///         - donateNative(memo, expectedRecipients): splits msg.value through ShelterSplit.donate and
///           reverts RecipientsChanged unless recipientsHash(msg.value) matches (bytes32(0) skips the
///           check; donateNative(memo) is that unchecked form). On Arc the native coin is USDC with 18
///           decimals, so RouterDonation.amount is in native units on this path.
///         - flush(memo): anyone may push USDC that was sent to the router by plain transfer on to the
///           shelters, under the same guard. The memo on a flush is untrusted: whoever calls first sets it.
///
/// @dev    Custody statement.
///         - No owner, no admin functions, no setters, no sweep. Nothing about the router can change
///           after deployment.
///         - The router never holds funds across transactions: every path pulls and pays out in the
///           same call. Plain native sends revert (no receive or fallback). The only balance it can
///           ever hold is USDC sent to it by plain transfer, and flush() lets anyone forward that to
///           the shelters.
///         - Treasury guard: before paying, the router reverts with TreasuryShare if ShelterSplit's
///           preview() would send any part of the amount to the treasury (an unallocated share, an
///           inactive shelter, or rounding dust), and it reverts with SplitPaused while the split is
///           paused. After paying, it checks that the treasury balance did not move. So if the split
///           owner ever lowers a shelter's share, deactivates a shelter or leaves part of the 10,000 bps
///           unallocated, router gifts revert and stay with the donor instead of reaching Token Tails.
///         - Fail-safe edge: if the split's treasury is also a registered shelter wallet, every router
///           gift reverts, because the post-payout check cannot tell the two apart.
///         - Registry changes: the ShelterSplit owner can re-point a shelter entry (removeShelter then
///           addShelter), but a signed gift, or a native gift sent with expectedRecipients, then reverts
///           with RecipientsChanged instead of following the new wallet. Only gifts signed or sent after
///           the change (a public event on the split) can reach the new list. flush and the unchecked
///           donateNative(memo) pay whatever list is current.
contract DonateRouter {
    uint256 public constant MAX_MEMO_BYTES = 256;
    uint8 public constant PATH_AUTH = 0;
    uint8 public constant PATH_NATIVE = 1;
    uint8 public constant PATH_FLUSH = 2;

    IShelterSplit public immutable split;
    IFiatToken3009 public immutable usdc;

    /// @notice One per router gift. `donor` is the signer (auth path), msg.sender (native path) or
    ///         address(0) (flush). batchId is the ShelterSplit batch that paid the shelters. `nonce` is
    ///         the EIP-3009 nonce the donor signed (auth path), so a relay can find a gift that someone
    ///         else submitted first; bytes32(0) on the native and flush paths. A flush memo is untrusted.
    event RouterDonation(
        address indexed donor, uint256 amount, uint256 indexed batchId, uint8 path, string memo, bytes32 indexed nonce
    );

    error TreasuryShare(uint256 toTreasury);
    error SplitPaused();
    error ZeroAmount();
    error MemoTooLong();
    error WrongToken();
    error Reentrancy();
    error ApproveFailed();
    error RecipientsChanged(bytes32 expected, bytes32 actual);

    /// @notice The signed fields of a gasless gift. `from`, `value`, `validAfter` and `validBefore` are the
    ///         EIP-3009 authorization; `salt` and `recipients` (recipientsHash(value) when the donor signed)
    ///         go into its nonce through authNonce. One struct keeps the call within the legacy stack.
    struct Gift {
        address from;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 salt;
        bytes32 recipients;
    }

    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier memoOk(string calldata memo) {
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();
        _;
    }

    constructor(address split_, address usdc_) {
        if (split_.code.length == 0 || usdc_.code.length == 0) revert WrongToken();
        if (IShelterSplit(split_).token() != usdc_) revert WrongToken();
        split = IShelterSplit(split_);
        usdc = IFiatToken3009(usdc_);
    }

    // ---------------------------------------------------------------- views

    /// @notice The EIP-3009 nonce a donor signs for a gift with this `memo` to this payout list.
    ///         `salt` is any fresh random 32 bytes chosen by the donor's client; it makes each gift's nonce
    ///         unique. `recipients` is recipientsHash(value) at signing time.
    function authNonce(bytes32 salt, string calldata memo, bytes32 recipients) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), keccak256(bytes(memo)), salt, recipients));
    }

    /// @notice Who a gift of `amount` would pay right now: keccak256(abi.encode(wallets, amounts)) of
    ///         ShelterSplit.preview(amount). Any change to a shelter wallet, share or active flag changes it.
    function recipientsHash(uint256 amount) public view returns (bytes32) {
        (address[] memory wallets, uint256[] memory amounts,) = split.preview(amount);
        return keccak256(abi.encode(wallets, amounts));
    }

    /// @notice Pre-check for clients and relays: ok is true when a gift of `amount` would go through the
    ///         guard right now. toTreasury is what ShelterSplit would send to its treasury.
    function canDonate(uint256 amount) external view returns (bool ok, uint256 toTreasury) {
        (,, toTreasury) = split.preview(amount);
        ok = amount != 0 && toTreasury == 0 && !split.paused();
    }

    // ---------------------------------------------------------------- gifts

    /// @notice Gasless gift: redeems the donor's ReceiveWithAuthorization signature (bytes form, so EOAs
    ///         and ERC-1271 wallets both work) and pays the shelters in the same transaction.
    ///         gift.recipients must equal recipientsHash(gift.value) both when signed and now.
    function donateWithAuthorization(Gift calldata gift, string calldata memo, bytes calldata signature)
        external
        nonReentrant
        memoOk(memo)
        returns (uint256 batchId)
    {
        bytes32 nonce = _checkedNonce(gift, memo);
        usdc.receiveWithAuthorization(
            gift.from, address(this), gift.value, gift.validAfter, gift.validBefore, nonce, signature
        );
        batchId = _payAuth(gift, memo, nonce);
    }

    /// @notice The same gift through USDC's v/r/s overload, for a FiatToken without the bytes overload.
    function donateWithAuthorizationVRS(Gift calldata gift, string calldata memo, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
        memoOk(memo)
        returns (uint256 batchId)
    {
        bytes32 nonce = _checkedNonce(gift, memo);
        usdc.receiveWithAuthorization(
            gift.from, address(this), gift.value, gift.validAfter, gift.validBefore, nonce, v, r, s
        );
        batchId = _payAuth(gift, memo, nonce);
    }

    /// @notice Gift in the chain's native coin (on Arc: USDC, 18 decimals). Splits exactly msg.value and
    ///         reverts RecipientsChanged unless recipientsHash(msg.value) == expectedRecipients.
    ///         bytes32(0) skips that check.
    function donateNative(string calldata memo, bytes32 expectedRecipients)
        public
        payable
        nonReentrant
        memoOk(memo)
        returns (uint256 batchId)
    {
        batchId = _donateNative(memo, expectedRecipients);
    }

    /// @notice donateNative(memo, bytes32(0)): the unchecked form, which pays the current shelter list.
    function donateNative(string calldata memo) external payable nonReentrant memoOk(memo) returns (uint256 batchId) {
        batchId = _donateNative(memo, bytes32(0));
    }

    /// @notice Forwards any USDC sent to the router by plain transfer to the shelters. Anyone may call it.
    ///         The memo on flush is untrusted: whoever calls first sets it, and the event's donor is
    ///         address(0). Never attribute or display a PATH_FLUSH memo.
    function flush(string calldata memo) external nonReentrant memoOk(memo) returns (uint256 batchId) {
        uint256 amount = usdc.balanceOf(address(this));
        if (amount == 0) revert ZeroAmount();
        _guard(amount);
        batchId = _disburse(amount, memo);
        emit RouterDonation(address(0), amount, batchId, PATH_FLUSH, memo, bytes32(0));
    }

    // ---------------------------------------------------------------- internals

    /// @dev Guard, then the recipients check, then the nonce the donor must have signed.
    function _checkedNonce(Gift calldata gift, string calldata memo) private view returns (bytes32) {
        _guard(gift.value);
        _checkRecipients(gift.value, gift.recipients);
        return authNonce(gift.salt, memo, gift.recipients);
    }

    function _payAuth(Gift calldata gift, string calldata memo, bytes32 nonce) private returns (uint256 batchId) {
        batchId = _disburse(gift.value, memo);
        emit RouterDonation(gift.from, gift.value, batchId, PATH_AUTH, memo, nonce);
    }

    function _checkRecipients(uint256 amount, bytes32 expected) private view {
        bytes32 actual = recipientsHash(amount);
        if (actual != expected) revert RecipientsChanged(expected, actual);
    }

    function _donateNative(string calldata memo, bytes32 expectedRecipients) private returns (uint256 batchId) {
        if (msg.value == 0) revert ZeroAmount();
        _guard(msg.value);
        if (expectedRecipients != bytes32(0)) _checkRecipients(msg.value, expectedRecipients);
        address t = split.treasury();
        uint256 before = t.balance;
        batchId = split.donate{value: msg.value}(memo);
        if (t.balance != before) revert TreasuryShare(t.balance - before);
        emit RouterDonation(msg.sender, msg.value, batchId, PATH_NATIVE, memo, bytes32(0));
    }

    function _guard(uint256 amount) private view {
        if (amount == 0) revert ZeroAmount();
        if (split.paused()) revert SplitPaused();
        (,, uint256 t) = split.preview(amount);
        if (t != 0) revert TreasuryShare(t);
    }

    /// @dev Approves exactly `amount`, lets ShelterSplit pull and pay it, then checks the treasury balance
    ///      did not move. ShelterSplit pulls exactly the approved amount, so no allowance is left over.
    function _disburse(uint256 amount, string calldata memo) private returns (uint256 batchId) {
        address t = split.treasury();
        uint256 before = usdc.balanceOf(t);
        _approve(amount);
        batchId = split.disburse(amount, memo);
        uint256 afterBal = usdc.balanceOf(t);
        if (afterBal != before) revert TreasuryShare(afterBal > before ? afterBal - before : before - afterBal);
    }

    /// @dev Accepts `true` or no return data, like ShelterSplit's own token calls.
    function _approve(uint256 amount) private {
        (bool ok, bytes memory ret) =
            address(usdc).call(abi.encodeCall(IFiatToken3009.approve, (address(split), amount)));
        if (!ok || (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert ApproveFailed();
    }
}
