// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts@4.9.3/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@4.9.3/access/Ownable.sol";
import "@openzeppelin/contracts@4.9.3/utils/Strings.sol";
import "@openzeppelin/contracts@4.9.3/security/ReentrancyGuard.sol";

error NotOwner();
error NonexistentToken();
error NotMinter();
error LengthMismatch();
error SweepFailed();
error InsufficientTreasury();

contract TokenTailsCat is ERC721, Ownable, ReentrancyGuard {
    mapping(address => bool) public minter;
    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);
    event Checked(address indexed player, uint256 indexed tokenId);
    string private constant BASE = "https://api.tokentails.com/cat/nft/";

    constructor() ERC721("Token Tails Cat", "TTCAT") {
        minter[msg.sender] = true;
    }

    function mintUniqueTokenTo(address to, uint256 tokenId) external {
        if (!minter[msg.sender]) revert NotMinter();
        _mint(to, tokenId);
    }

    receive() external payable {}
    fallback() external payable {}

    function mintToMany(
        address[] calldata addresses,
        uint256[] calldata tokenIds
    ) external {
        if (!minter[msg.sender]) revert NotMinter();
        if (addresses.length != tokenIds.length) revert LengthMismatch();

        unchecked {
            for (uint256 i = 0; i < addresses.length; ++i) {
                if (_exists(tokenIds[i])) {
                    continue;
                }
                _mint(addresses[i], tokenIds[i]);
            }
        }
    }

    function addMinter(address account) external onlyOwner {
        minter[account] = true;
        emit MinterAdded(account);
    }

    function removeMinter(address account) external onlyOwner {
        if (!minter[account]) revert NotMinter();
        delete minter[account];
        emit MinterRemoved(account);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentToken();
        return string(abi.encodePacked(BASE, Strings.toString(tokenId)));
    }

    function checkIn(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();

        emit Checked(msg.sender, tokenId);
    }

    function sweep(
        address payable to,
        uint256 value
    ) external onlyOwner nonReentrant {
        (bool ok, ) = to.call{value: value}("");
        if (!ok) revert SweepFailed();
    }

    function distributeIfBelowFromTreasury(
        address payable[] calldata recipients,
        uint256 amount,
        uint256 threshold
    ) external onlyOwner nonReentrant {
        uint256 len = recipients.length;
        uint256 need;
        unchecked {
            for (uint256 i = 0; i < len; ++i) {
                if (recipients[i].balance < threshold) need += amount;
            }
        }
        if (address(this).balance < need) revert InsufficientTreasury();

        for (uint256 i = 0; i < len; ++i) {
            address payable to = recipients[i];
            if (to == address(0)) {
                continue;
            }
            if (to.balance < threshold) {
                (bool ok, ) = to.call{value: amount}("");
            }
        }
    }
}
