// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Test helper: a contractor wallet that refuses native payments.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }

    /// @dev Forward an arbitrary call (e.g. submitProof) so this contract can act as the contractor.
    function call(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }
}
