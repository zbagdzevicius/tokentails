// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.6;

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

    function setBaseURI(string memory newBaseURI) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = newBaseURI;
    }

    function mintUniqueTokenTo(address to, uint256 tokenId) public onlyRole(MINTER_ROLE) {
        super._mint(to, tokenId);
    }

    // Override tokenURI to dynamically generate the full token URI
    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) {
        require(_exists(tokenId), "URI query for nonexistent token");
        string memory base = _baseURI();
        return string(abi.encodePacked(base, Strings.toString(tokenId)));
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControlEnumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
