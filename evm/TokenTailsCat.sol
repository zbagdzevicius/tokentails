// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts@4.9.3/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@4.9.3/access/Ownable.sol";
import "@openzeppelin/contracts@4.9.3/utils/Strings.sol";

error NotOwner();
error AlreadyIncremented();
error NonexistentToken();
error NotMinter();

contract TokenTailsCat is ERC721, Ownable {
    mapping(address => bool) public minter;
    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);
    event Played(address indexed player, uint256 indexed tokenId, uint32 day);

    mapping(uint256 => uint64) public playData;
    string private constant BASE = "https://api.tokentails.com/cat/nft/";

    constructor() ERC721("Token Tails Cat", "TTCAT") {
        minter[msg.sender] = true;
    }

    function mintUniqueTokenTo(address to, uint256 tokenId) external {
        if (!minter[msg.sender]) revert NotMinter();
        _mint(to, tokenId);
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

    function incrementPlayCount(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();

        uint32 today = uint32(block.timestamp / 86400);
        uint64 packed = playData[tokenId];

        uint32 last = uint32(packed >> 32);
        if (last == today) revert AlreadyIncremented();

        uint32 count = uint32(packed);
        unchecked {
            count += 1;
        }

        playData[tokenId] = (uint64(today) << 32) | uint64(count);
    }

    function getPlayData(
        uint256 tokenId
    ) external view returns (uint32 playCount, uint32 lastPlayDate) {
        uint64 p = playData[tokenId];
        return (uint32(p), uint32(p >> 32));
    }

    function checkIn(uint256 tokenId) external {
        uint32 today = uint32(block.timestamp / 86400);
        emit Played(msg.sender, tokenId, today);
    }
}
