// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OpenCaseVerifier
/// @notice Records solution hashes on Polygon Amoy for immutable proof of solver work
/// @dev Deployed via Hardhat. Called by Supabase Edge Function (server-side only).
contract OpenCaseVerifier {
    address public owner;

    struct Verification {
        bytes32 solutionHash;
        uint256 timestamp;
        address verifier;
        bool exists;
    }

    mapping(uint256 => Verification) public verifications; // solutionId => Verification
    uint256 public verificationCount;

    event SolutionVerified(
        uint256 indexed solutionId,
        bytes32 indexed solutionHash,
        address indexed verifier,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Record a solution hash on-chain
    /// @param solutionId The database ID of the solution
    /// @param solutionHash SHA-256 hash of the solution content
    function verifySolution(uint256 solutionId, bytes32 solutionHash) external onlyOwner {
        require(!verifications[solutionId].exists, "Already verified");
        require(solutionHash != bytes32(0), "Empty hash");

        verifications[solutionId] = Verification({
            solutionHash: solutionHash,
            timestamp: block.timestamp,
            verifier: msg.sender,
            exists: true
        });

        verificationCount++;

        emit SolutionVerified(solutionId, solutionHash, msg.sender, block.timestamp);
    }

    /// @notice Check if a solution has been verified
    /// @param solutionId The database ID of the solution
    /// @return exists Whether the solution is verified
    /// @return solutionHash The recorded hash
    /// @return timestamp When it was verified
    function getVerification(uint256 solutionId) external view returns (bool exists, bytes32 solutionHash, uint256 timestamp) {
        Verification storage v = verifications[solutionId];
        return (v.exists, v.solutionHash, v.timestamp);
    }

    /// @notice Get total number of verified solutions
    function getVerificationCount() external view returns (uint256) {
        return verificationCount;
    }
}
