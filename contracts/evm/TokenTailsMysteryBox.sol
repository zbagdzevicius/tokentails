// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.19;

import "@openzeppelin/contracts@4.9.3/token/ERC721/ERC721.sol";

contract TokenTailsMysteryBox is ERC721 {
    uint256 private _nextTokenId;
    string private _mysteryBoxUrl;

    constructor(
        string memory mysteryBoxUrl
    ) ERC721("Token Tails Mystery Box", "TokenTailsMysteryBox") {
        _mysteryBoxUrl = mysteryBoxUrl;
    }

    function safeMint(address to) public {
        uint256 tokenId = uint256(uint160(to));
        _safeMint(to, tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721) returns (string memory) {
        return _mysteryBoxUrl;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
