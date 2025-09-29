// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts@4.9.3/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@4.9.3/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts@4.9.3/utils/Strings.sol";

struct PlayData {
    uint32 playCount;
    uint32 lastPlayDate;
}

/// @notice Custom errors (cheaper than revert strings)
error NotOwner();
error AlreadyIncremented();
error NonexistentToken();

contract TokenTailsCat is ERC721, AccessControl {
    string private _baseTokenURI;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    mapping(uint256 => PlayData) public playData;
    string private constant BASE = "https://api.tokentails.com/cat/nft/";

    constructor() ERC721("Token Tails Cat", "TTCAT") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, _msgSender());
    }

    function mintUniqueTokenTo(
        address to,
        uint256 tokenId
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        if (!_exists(tokenId)) revert NonexistentToken();
        return string(abi.encodePacked(BASE, Strings.toString(tokenId)));
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function incrementPlayCount(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();

        uint32 today = uint32(block.timestamp / 86400); // Calculate current day as an integer
        if (playData[tokenId].lastPlayDate == today)
            revert AlreadyIncremented();

        unchecked {
            playData[tokenId].playCount += 1;
        }
        playData[tokenId].lastPlayDate = today;
    }

    function getPlayData(
        uint256 tokenId
    ) external view returns (uint32 playCount, uint32 lastPlayDate) {
        PlayData memory d = playData[tokenId];
        return (d.playCount, d.lastPlayDate);
    }
}
