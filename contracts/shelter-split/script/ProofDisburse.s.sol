// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VM} from "../test/utils/Vm.sol";
import {ShelterSplit} from "../src/ShelterSplit.sol";

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice The on-chain proof most programs ask for: one real payout to one real shelter.
///         Registers the shelter if it is not registered yet, approves the amount and calls disburse.
///         Every input comes from the environment; nothing is hard-coded.
///
///   PROOF_SPLIT          deployed ShelterSplit address (the wave script fills it in)
///   PROOF_SHELTER        the shelter's own wallet (a real shelter that agreed to take part)
///   PROOF_SHELTER_NAME   shown in the ShelterAdded event, e.g. "Example Rescue, Vilnius"
///   PROOF_BPS            the shelter's share in basis points (default 10000 = 100%)
///   PROOF_AMOUNT         raw token units to pay out (USDC has 6 decimals: 1000000 = 1 USDC)
///   PROOF_MEMO           optional, default "Token Tails first payout"
///   EXPECTED_CHAIN_ID    optional guard
///
/// The signer must be the contract owner (the wave deploys with the deployer as owner) and hold
/// PROOF_AMOUNT of the token. The deploy tooling reads the broadcast and records the payout tx.
contract ProofDisburse {
    error WrongChain(uint256 expected, uint256 actual);

    function run() external {
        ShelterSplit split = ShelterSplit(payable(VM.envAddress("PROOF_SPLIT")));
        address shelter = VM.envAddress("PROOF_SHELTER");
        string memory name = VM.envOr("PROOF_SHELTER_NAME", string("shelter"));
        uint16 bps = uint16(VM.envOr("PROOF_BPS", uint256(10000)));
        uint256 amount = VM.envUint("PROOF_AMOUNT");
        string memory memo = VM.envOr("PROOF_MEMO", string("Token Tails first payout"));
        uint256 expected = VM.envOr("EXPECTED_CHAIN_ID", uint256(0));
        if (expected != 0 && expected != block.chainid) revert WrongChain(expected, block.chainid);

        bool registered;
        try split.getShelter(shelter) returns (ShelterSplit.Shelter memory) { registered = true; } catch {}

        VM.startBroadcast();
        if (!registered) split.addShelter(shelter, bps, name);
        IERC20Approve(address(split.token())).approve(address(split), amount);
        split.disburse(amount, memo);
        VM.stopBroadcast();
    }
}
