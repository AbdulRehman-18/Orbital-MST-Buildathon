// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title NammaSevaMultisig
/// @notice Minimal M-of-N multisig. MST has no Safe deployment (ADR 0006), so this contract is the
///         proposer/executor of the {TimelockController} that holds ADMIN on mainnet.
///         Intended owners (plan §16.2): dept head, IT officer, independent auditor, civic-society
///         representative, platform — 3-of-5.
/// @dev Owner-set changes go through the multisig itself (`onlySelf`). Transactions are
///      submitted, confirmed by owners, then executed once `threshold` confirmations exist.
contract NammaSevaMultisig {
    uint256 public constant MAX_OWNERS = 10;

    struct Transaction {
        address to;
        uint96 value;
        bool executed;
        uint8 confirmations;
        bytes data;
    }

    address[] private _owners;
    mapping(address => bool) public isOwner;
    uint8 public threshold;

    Transaction[] private _transactions;
    mapping(uint256 txId => mapping(address owner => bool)) public confirmedBy;

    event Deposit(address indexed from, uint256 amount);
    event Submitted(uint256 indexed txId, address indexed owner, address indexed to, uint256 value, bytes data);
    event Confirmed(uint256 indexed txId, address indexed owner);
    event Revoked(uint256 indexed txId, address indexed owner);
    event Executed(uint256 indexed txId);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event ThresholdChanged(uint8 threshold);

    error NotOwner();
    error NotSelf();
    error InvalidOwner(address owner);
    error InvalidThreshold(uint256 threshold, uint256 owners);
    error TxNotFound(uint256 txId);
    error TxAlreadyExecuted(uint256 txId);
    error AlreadyConfirmed(uint256 txId);
    error NotConfirmed(uint256 txId);
    error NotEnoughConfirmations(uint256 txId, uint256 have, uint256 need);
    error ExecutionFailed(uint256 txId, bytes reason);
    error ValueTooLarge();

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    constructor(address[] memory owners_, uint8 threshold_) {
        if (owners_.length == 0 || owners_.length > MAX_OWNERS) revert InvalidThreshold(threshold_, owners_.length);
        for (uint256 i = 0; i < owners_.length; ++i) {
            _addOwner(owners_[i]);
        }
        _setThreshold(threshold_);
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    // ─── Transactions ────────────────────────────────────────────────────────

    /// @notice Propose a call; the proposer's confirmation is recorded automatically.
    function submit(address to, uint256 value, bytes calldata data) external onlyOwner returns (uint256 txId) {
        if (value > type(uint96).max) revert ValueTooLarge();
        txId = _transactions.length;
        _transactions.push(Transaction({to: to, value: uint96(value), executed: false, confirmations: 0, data: data}));
        emit Submitted(txId, msg.sender, to, value, data);
        _confirm(txId);
    }

    function confirm(uint256 txId) external onlyOwner {
        _confirm(txId);
    }

    function revoke(uint256 txId) external onlyOwner {
        Transaction storage t = _pending(txId);
        if (!confirmedBy[txId][msg.sender]) revert NotConfirmed(txId);
        confirmedBy[txId][msg.sender] = false;
        t.confirmations -= 1;
        emit Revoked(txId, msg.sender);
    }

    /// @notice Execute a transaction that has reached the threshold. Any owner may trigger it.
    function execute(uint256 txId) external onlyOwner {
        Transaction storage t = _pending(txId);
        if (t.confirmations < threshold) revert NotEnoughConfirmations(txId, t.confirmations, threshold);
        t.executed = true;
        emit Executed(txId); // reverted together with the call if it fails
        (bool ok, bytes memory ret) = t.to.call{value: t.value}(t.data);
        if (!ok) revert ExecutionFailed(txId, ret);
    }

    // ─── Owner management (via the multisig itself) ──────────────────────────

    function addOwner(address owner) external onlySelf {
        if (_owners.length >= MAX_OWNERS) revert InvalidThreshold(threshold, _owners.length + 1);
        _addOwner(owner);
    }

    /// @dev Pending confirmations by a removed owner stay counted — revoke first if that matters.
    function removeOwner(address owner) external onlySelf {
        if (!isOwner[owner]) revert InvalidOwner(owner);
        if (_owners.length - 1 < threshold) revert InvalidThreshold(threshold, _owners.length - 1);
        isOwner[owner] = false;
        for (uint256 i = 0; i < _owners.length; ++i) {
            if (_owners[i] == owner) {
                _owners[i] = _owners[_owners.length - 1];
                _owners.pop();
                break;
            }
        }
        emit OwnerRemoved(owner);
    }

    function changeThreshold(uint8 threshold_) external onlySelf {
        _setThreshold(threshold_);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getOwners() external view returns (address[] memory) {
        return _owners;
    }

    function transactionCount() external view returns (uint256) {
        return _transactions.length;
    }

    function getTransaction(uint256 txId) external view returns (Transaction memory) {
        if (txId >= _transactions.length) revert TxNotFound(txId);
        return _transactions[txId];
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _confirm(uint256 txId) private {
        Transaction storage t = _pending(txId);
        if (confirmedBy[txId][msg.sender]) revert AlreadyConfirmed(txId);
        confirmedBy[txId][msg.sender] = true;
        t.confirmations += 1;
        emit Confirmed(txId, msg.sender);
    }

    function _pending(uint256 txId) private view returns (Transaction storage t) {
        if (txId >= _transactions.length) revert TxNotFound(txId);
        t = _transactions[txId];
        if (t.executed) revert TxAlreadyExecuted(txId);
    }

    function _addOwner(address owner) private {
        if (owner == address(0) || owner == address(this) || isOwner[owner]) revert InvalidOwner(owner);
        isOwner[owner] = true;
        _owners.push(owner);
        emit OwnerAdded(owner);
    }

    function _setThreshold(uint8 threshold_) private {
        if (threshold_ == 0 || threshold_ > _owners.length) revert InvalidThreshold(threshold_, _owners.length);
        threshold = threshold_;
        emit ThresholdChanged(threshold_);
    }
}
