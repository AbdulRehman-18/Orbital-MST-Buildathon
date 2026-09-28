// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Pulls OpenZeppelin contracts that are deployed as-is into the build, so deploy scripts,
// tests and Blockscout verification get artifacts compiled with our Shanghai settings.
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @notice {ERC2771Forwarder} named for Namma Seva (EIP-712 domain "NammaSevaForwarder").
contract TrustedForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("NammaSevaForwarder") {}
}

/// @notice 48 h (mainnet) admin timelock; proposer/executor is {NammaSevaMultisig}.
contract NammaSevaTimelock is TimelockController {
    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors, address admin)
        TimelockController(minDelay, proposers, executors, admin)
    {}
}
