// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity 0.8.6;

import "@openzeppelin/contracts@4.9.3/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts@4.9.3/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts@4.9.3/access/AccessControlEnumerable.sol";

contract TokenTails is ERC20, ERC20Burnable, AccessControlEnumerable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 private _maxSupply;

    constructor()
        ERC20("Token Tails", "TAILS")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(MINTER_ROLE, _msgSender());
        _maxSupply = 500000000 * 10 ** decimals(); // Setting max supply to 500,000,000 with decimals adjustment
    }

    function maxSupply() public view returns (uint256) {
        return _maxSupply;
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        uint256 amountWithDecimals = amount * 10 ** decimals(); // Adjust amount for decimals
        require(totalSupply() + amountWithDecimals <= _maxSupply, "ERC20: minting would exceed max supply");
        _mint(to, amountWithDecimals);
    }
}