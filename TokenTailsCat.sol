// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2; // Enable ABI coder v2

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

contract ERC721Basic is IERC165 {
    mapping(uint256 => address) private _tokenOwner;
    mapping(address => uint256) private _ownedTokensCount;
    mapping(uint256 => string) private _tokenURIs;
    mapping(address => uint256[]) private _ownedTokens; 

    // ERC721 Metadata URI
    bytes4 private constant _ERC721_METADATA_URI = 0x5b5e139f;

    // ERC165
    bytes4 private constant _INTERFACE_ID_ERC165 = 0x01ffc9a7;
    
    constructor() {
        _registerInterface(_INTERFACE_ID_ERC165);
        _registerInterface(_ERC721_METADATA_URI);
    }

    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), "ERC721: balance query for the zero address");
        return _ownedTokensCount[owner];
    }

    // New function to return all URIs owned by an address
    function getOwnedURIs(address owner) public view returns (string[] memory) {
        uint256[] storage ownedTokenIds = _ownedTokens[owner];
        string[] memory uris = new string[](ownedTokenIds.length);

        for (uint256 i = 0; i < ownedTokenIds.length; i++) {
            uris[i] = _tokenURIs[ownedTokenIds[i]];
        }

        return uris;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _tokenOwner[tokenId];
        require(owner != address(0), "ERC721: owner query for nonexistent token");
        return owner;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        address owner = _tokenOwner[tokenId];
        return owner != address(0);
    }

    function _mint(address to, uint256 tokenId, string memory uri) internal {
        require(to != address(0), "ERC721: mint to the zero address");
        require(!_exists(tokenId), "ERC721: token already minted");
        _tokenOwner[tokenId] = to;
        _ownedTokensCount[to] += 1;
        _ownedTokens[to].push(tokenId); // Track the token by owner
        _setTokenURI(tokenId, uri);
        emit Transfer(address(0), to, tokenId);
    }

    function _setTokenURI(uint256 tokenId, string memory uri) internal {
        require(_exists(tokenId), "ERC721Metadata: URI set of nonexistent token");
        _tokenURIs[tokenId] = uri;
    }

    function tokenURI(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        return _tokenURIs[tokenId];
    }

    // ERC165
    mapping(bytes4 => bool) private _supportedInterfaces;

    function _registerInterface(bytes4 interfaceId) internal {
        require(interfaceId != 0xffffffff, "ERC165: invalid interface id");
        _supportedInterfaces[interfaceId] = true;
    }

    function supportsInterface(bytes4 interfaceId) external view override returns (bool) {
        return _supportedInterfaces[interfaceId];
    }

    // Simplified transfer function
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function safeMint(address to, uint256 tokenId, string memory uri) public {
        _mint(to, tokenId, uri);
    }
}

contract MyNFT is ERC721Basic {
    constructor() ERC721Basic() {}

    // Additional functionalities can be added here
}