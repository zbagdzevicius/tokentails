// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VM} from "../utils/Vm.sol";

/// @notice Standard 6-decimal stablecoin mock (USDC-shaped): returns bool.
contract MockUSDC {
    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal virtual {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @notice USDT-style token: transfer/transferFrom return nothing.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external { allowance[msg.sender][spender] = amount; }

    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(allowance[from][msg.sender] >= amount && balanceOf[from] >= amount, "denied");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice A token that reports failure by returning false instead of reverting.
contract FalseToken is MockUSDC {
    bool public failTransfers;

    function setFail(bool f) external { failTransfers = f; }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (failTransfers) return false;
        return super.transfer(to, amount);
    }
}

/// @notice Takes a 1% fee on every transfer (fee is burned).
contract FeeOnTransferToken is MockUSDC {
    function _move(address from, address to, uint256 amount) internal override {
        require(balanceOf[from] >= amount, "balance");
        uint256 fee = amount / 100;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        emit Transfer(from, to, amount - fee);
    }
}

interface ISplitter {
    function disburse(uint256 amount, string calldata memo) external returns (uint256);
    function disburseWithMemo(uint256 amount, bytes32 memo) external returns (uint256);
    function donate(string calldata memo) external payable returns (uint256);
    function sweepNative(address to, uint256 amount) external;
}

/// @notice Malicious token: re-enters ShelterSplit.disburse from inside transferFrom/transfer and
///         records how the nested call ended.
contract ReentrantToken is MockUSDC {
    ISplitter public target;
    bool public attackOnTransferFrom;
    bool public attackOnTransfer;
    bool public attempted;
    bytes public lastRevert;

    function arm(ISplitter t, bool onTransferFrom, bool onTransfer) external {
        target = t;
        attackOnTransferFrom = onTransferFrom;
        attackOnTransfer = onTransfer;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(from, to, amount);
        if (attackOnTransferFrom && address(target) != address(0)) _attack();
        return ok;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (attackOnTransfer && address(target) != address(0)) _attack();
        return ok;
    }

    function _attack() internal {
        attempted = true;
        try target.disburse(1, "reenter") {
            lastRevert = "";
        } catch (bytes memory reason) {
            lastRevert = reason;
        }
    }
}

/// @notice A token whose fallback accepts any call and returns nothing, so transferWithMemo on it
///         "succeeds" without moving anything. disburseWithMemo must refuse it.
contract SilentFallbackToken is MockUSDC {
    fallback() external {}
}

/// @notice TIP-20-shaped token that re-enters ShelterSplit from inside transferWithMemo.
contract ReentrantMemoToken is MockUSDC {
    ISplitter public target;
    bool public viaMemo; // re-enter disburseWithMemo (true) or disburse (false)
    bytes public lastRevert;
    bool public attempted;

    function arm(ISplitter t, bool memoPath) external {
        target = t;
        viaMemo = memoPath;
    }

    function transferWithMemo(address to, uint256 amount, bytes32) external {
        _move(msg.sender, to, amount);
        if (address(target) == address(0)) return;
        attempted = true;
        if (viaMemo) {
            try target.disburseWithMemo(1, bytes32("reenter")) { lastRevert = ""; } catch (bytes memory r) { lastRevert = r; }
        } else {
            try target.disburse(1, "reenter") { lastRevert = ""; } catch (bytes memory r) { lastRevert = r; }
        }
    }
}

/// @notice Arc's USDC as documented on 2026-09-29 (docs.arc.io/arc/references/evm-compatibility): "two
///         interfaces that share one balance: a native interface (18 decimals) and an ERC-20 interface
///         (6 decimals)". This mock is the 6-decimal ERC-20 view: it reads and moves the NATIVE balance
///         (via the deal cheatcode), and "The ERC-20 view truncates sub-USDC fractional amounts".
contract MockArcUSDC {
    uint256 internal constant SCALE = 1e12;
    mapping(address => mapping(address => uint256)) public allowance;

    function decimals() external pure returns (uint8) { return 6; }

    function balanceOf(address a) public view returns (uint256) { return a.balance / SCALE; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return true;
    }

    /// Moves amount * 1e12 wei of the shared native balance. No code runs at the recipient.
    function _move(address from, address to, uint256 amount) internal {
        require(to != address(0), "Zero address not allowed");
        uint256 wei_ = amount * SCALE;
        require(from.balance >= wei_, "balance");
        VM.deal(from, from.balance - wei_);
        VM.deal(to, to.balance + wei_);
    }
}

/// @notice A shelter wallet contract that refuses native value.
contract RejectingReceiver {
    receive() external payable { revert("no native"); }
}

/// @notice A shelter wallet contract that re-enters ShelterSplit when it is paid in native coin, records
///         how the nested call ended, and then accepts the payment.
contract ReentrantReceiver {
    enum Attack { None, Donate, PlainSend, Disburse, DisburseWithMemo, SweepNative }

    ISplitter public target;
    Attack public attack;
    bool public attempted;
    bytes public lastRevert;

    function arm(ISplitter t, Attack a) external {
        target = t;
        attack = a;
    }

    receive() external payable {
        if (attack == Attack.None || attempted) return;
        attempted = true;
        bool ok;
        bytes memory r;
        if (attack == Attack.Donate) {
            (ok, r) = address(target).call{value: msg.value}(abi.encodeCall(ISplitter.donate, ("reenter")));
        } else if (attack == Attack.PlainSend) {
            (ok, r) = address(target).call{value: msg.value}("");
        } else if (attack == Attack.Disburse) {
            (ok, r) = address(target).call(abi.encodeCall(ISplitter.disburse, (1, "reenter")));
        } else if (attack == Attack.DisburseWithMemo) {
            (ok, r) = address(target).call(abi.encodeCall(ISplitter.disburseWithMemo, (1, bytes32("reenter"))));
        } else {
            (ok, r) = address(target).call(abi.encodeCall(ISplitter.sweepNative, (address(this), 1)));
        }
        lastRevert = ok ? bytes("") : r;
    }
}
