// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITokenTails {
    function mint(address to, uint256 amount) external;
}

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TokenTailsICO is Ownable, ReentrancyGuard {
    ITokenTails public token;
    uint256 public rate;
    bool public isICOActive; // New variable to track the ICO state

    event TokenPurchase(address indexed purchaser, uint256 amount);

    constructor(
        uint256 _rate,
        address _tokenAddress // This should be the address of the TokenTails contract
    ) Ownable(msg.sender) {
        require(_rate > 0, "TokenTailsICO: rate is 0");
        require(_tokenAddress != address(0), "TokenTailsICO: token is the zero address");

        rate = _rate;
        token = ITokenTails(_tokenAddress);
        isICOActive = false; // ICO starts as not active
    }

    // Fallback function to buy tokens
    receive() external payable {
        buyTokens();
    }

    // Function to buy tokens, minting them directly to the purchaser
    function buyTokens() public payable nonReentrant {
        require(isICOActive, "TokenTailsICO: ICO is not active");
        require(msg.value != 0, "TokenTailsICO: ether value is 0");

        uint256 tokens = msg.value * rate;
        emit TokenPurchase(msg.sender, tokens);

        token.mint(msg.sender, tokens);
    }

    // Allows the contract owner to start the ICO
    function startICO() external onlyOwner {
        isICOActive = true;
    }

    // Allows the contract owner to stop the ICO
    function stopICO() external onlyOwner {
        isICOActive = false;
    }

    // Withdraw the ETH collected to the owner's address
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Update the ICO rate. Can only be called by the contract owner
    function updateRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "TokenTailsICO: rate is 0");
        rate = newRate;
    }
}