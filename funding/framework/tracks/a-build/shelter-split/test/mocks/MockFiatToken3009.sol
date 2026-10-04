// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

/// @notice A 6-decimal USDC stand-in that implements Circle FiatToken's EIP-3009 receive path:
///         EIP-712 domain {name: "USDC", version: "2", chainId, verifyingContract},
///         receiveWithAuthorization in both overloads (bytes, with ERC-1271 for contract signers, and
///         v/r/s), authorizationState and used-nonce tracking, and the `to == msg.sender` rule.
///         Test-only: anyone can mint.
contract MockFiatToken3009 {
    string public constant name = "USDC";
    string public constant version = "2";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this)));
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
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

    /// @notice The EIP-712 digest a donor signs.
    function receiveDigest(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        _checkAuth(from, to, value, validAfter, validBefore, nonce);
        bytes32 digest = receiveDigest(from, to, value, validAfter, validBefore, nonce);
        if (from.code.length != 0) {
            require(IERC1271(from).isValidSignature(digest, signature) == 0x1626ba7e, "FiatTokenV2: invalid signature");
        } else {
            require(signature.length == 65, "ECRecover: invalid signature length");
            bytes32 r = bytes32(signature[0:32]);
            bytes32 s = bytes32(signature[32:64]);
            uint8 v = uint8(signature[64]);
            require(_recover(digest, v, r, s) == from, "FiatTokenV2: invalid signature");
        }
        _use(from, to, value, nonce);
    }

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
    ) external {
        _checkAuth(from, to, value, validAfter, validBefore, nonce);
        require(_recover(receiveDigest(from, to, value, validAfter, validBefore, nonce), v, r, s) == from, "FiatTokenV2: invalid signature");
        _use(from, to, value, nonce);
    }

    function _checkAuth(address from, address to, uint256, uint256 validAfter, uint256 validBefore, bytes32 nonce) private view {
        require(to == msg.sender, "FiatTokenV2: caller must be the payee");
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!authorizationState[from][nonce], "FiatTokenV2: authorization is used or canceled");
    }

    function _use(address from, address to, uint256 value, bytes32 nonce) private {
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _move(from, to, value);
    }

    function _recover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) private pure returns (address signer) {
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "ECRecover: invalid signature 's' value");
        require(v == 27 || v == 28, "ECRecover: invalid signature 'v' value");
        signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "ECRecover: invalid signature");
    }

    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @notice A minimal ERC-1271 wallet (a stand-in for a smart or passkey wallet) whose owner key signs
///         on its behalf.
contract Mock1271Wallet is IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (signature.length != 65) return 0xffffffff;
        address signer = ecrecover(hash, uint8(signature[64]), bytes32(signature[0:32]), bytes32(signature[32:64]));
        return signer == owner && signer != address(0) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
