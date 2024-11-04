// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts@4.9.3/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts@4.9.3/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts@4.9.3/utils/Strings.sol";

contract TokenTailsCat is ERC721, AccessControlEnumerable {
    string private _baseTokenURI;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC721("Token Tails Cat", "TTCAT") {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MINTER_ROLE, _msgSender());
        _baseTokenURI = "https://api.tokentails.com/cat/nft/";
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string memory newBaseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = newBaseURI;
    }

    function mintUniqueTokenTo(address to, uint256 tokenId) public onlyRole(MINTER_ROLE) {
        _mint(to, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "URI query for nonexistent token");
        return string(abi.encodePacked(_baseURI(), Strings.toString(tokenId)));
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControlEnumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    struct PlayData {
        uint32 playCount;
        uint32 lastPlayDate;
    }

    mapping(uint256 => PlayData) private _playData;

    function _getCurrentDay() internal view returns (uint32) {
        return uint32(block.timestamp / 86400); // Calculate current day as an integer
    }

    function incrementPlayCount(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Caller is not the owner of the NFT");
        
        uint32 today = _getCurrentDay();
        require(_playData[tokenId].lastPlayDate != today, "Play count already incremented today");

        _playData[tokenId].playCount += 1;
        _playData[tokenId].lastPlayDate = today;
    }

    function getPlayData(uint256 tokenId) public view returns (uint32 playCount, uint32 lastPlayDate) {
        return (_playData[tokenId].playCount, _playData[tokenId].lastPlayDate);
    }

    function resetCount(uint256 tokenId) public onlyRole(MINTER_ROLE) {
        _playData[tokenId] = PlayData(0, 0);
    }
}
