// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @notice Review candidate only. No production deployment or issuer is configured.
/// Terms and authority must be reviewed independently of the local UI simulation.
contract ContributorCredential is ERC721, AccessControl, EIP712, ReentrancyGuard {
    bytes32 public constant ISSUER_ROLE=keccak256("ISSUER_ROLE");
    bytes32 public constant STATUS_ROLE=keccak256("STATUS_ROLE");
    bytes32 public constant RECOVERY_ROLE=keccak256("RECOVERY_ROLE");
    bytes32 public constant CONSENT_TYPEHASH=keccak256("Consent(address recipient,bytes32 subject,bytes32 memoHash,bytes32 policyHash,uint8 level,uint8 rank,uint64 validFrom,uint64 validUntil,uint256 nonce,uint256 deadline)");
    enum Standing { Active, Suspended, Ended, Revoked }
    enum Level { Advisor, PartTime, HalfTime, FullTime }
    struct Terms { bytes32 subject; bytes32 memoHash; bytes32 policyHash; Level level; uint8 rank; uint64 validFrom; uint64 validUntil; }
    struct Record { Terms terms; Standing standing; uint32 version; }
    mapping(uint256=>Record) public records;
    mapping(bytes32=>uint256) public currentCredential;
    mapping(address=>uint256) public nonces;
    uint256 public nextId=1;
    event Locked(uint256 tokenId);
    event MetadataUpdate(uint256 tokenId);
    event MemorandumAccepted(uint256 indexed tokenId,uint32 version,bytes32 memoHash,bytes32 policyHash);
    event StandingChanged(uint256 indexed tokenId,Standing standing,bytes32 reasonHash);
    event CredentialReplaced(uint256 indexed oldTokenId,uint256 indexed newTokenId);
    error NonTransferable(); error InvalidTerms(); error InvalidConsent(); error InvalidState();

    constructor(address administrator) ERC721("Bittrees Contributor Credential","BCC") EIP712("Bittrees Contributor Credential","1") {
        if(administrator==address(0)) revert InvalidTerms();
        _grantRole(DEFAULT_ADMIN_ROLE,administrator);
    }
    function supportsInterface(bytes4 id) public view override(ERC721,AccessControl) returns(bool) {
        return id==0xb45a3c0e||id==0x49064906||super.supportsInterface(id);
    }
    function locked(uint256 tokenId) external view returns(bool){_requireOwned(tokenId);return true;}
    function approve(address,uint256) public pure override {revert NonTransferable();}
    function setApprovalForAll(address,bool) public pure override {revert NonTransferable();}
    function _update(address to,uint256 id,address auth) internal override returns(address){
        if(_ownerOf(id)!=address(0))revert NonTransferable();
        return super._update(to,id,auth);
    }
    function consentDigest(address recipient,Terms calldata t,uint256 nonce,uint256 deadline) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(CONSENT_TYPEHASH,recipient,t.subject,t.memoHash,t.policyHash,uint8(t.level),t.rank,t.validFrom,t.validUntil,nonce,deadline)));
    }
    function _consent(address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) internal {
        if(recipient==address(0)||t.subject==bytes32(0)||t.memoHash==bytes32(0)||t.policyHash==bytes32(0)||t.rank>2||(t.validUntil!=0&&(t.validUntil<=t.validFrom||t.validUntil<=block.timestamp)))revert InvalidTerms();
        if(block.timestamp>deadline||!SignatureChecker.isValidSignatureNow(recipient,consentDigest(recipient,t,nonces[recipient],deadline),signature))revert InvalidConsent();
        nonces[recipient]++;
    }
    function issue(address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) external onlyRole(ISSUER_ROLE) nonReentrant returns(uint256){
        return _issue(recipient,t,deadline,signature);
    }
    function _issue(address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) internal returns(uint256 id){
        if(currentCredential[t.subject]!=0)revert InvalidState();
        _consent(recipient,t,deadline,signature);
        id=nextId++;records[id]=Record(t,Standing.Active,1);currentCredential[t.subject]=id;
        _safeMint(recipient,id);emit Locked(id);emit MemorandumAccepted(id,1,t.memoHash,t.policyHash);
    }
    function amend(uint256 id,Terms calldata t,uint256 deadline,bytes calldata signature) external onlyRole(ISSUER_ROLE) nonReentrant {
        address recipient=_requireOwned(id);Record storage r=records[id];
        if(r.standing!=Standing.Active||currentCredential[r.terms.subject]!=id||r.terms.subject!=t.subject||r.terms.memoHash==t.memoHash||t.validFrom<block.timestamp)revert InvalidState();
        _consent(recipient,t,deadline,signature);r.terms=t;r.version++;
        emit MemorandumAccepted(id,r.version,t.memoHash,t.policyHash);emit MetadataUpdate(id);
    }
    function setStanding(uint256 id,Standing standing,bytes32 reasonHash) external onlyRole(STATUS_ROLE){
        _requireOwned(id);Record storage r=records[id];
        if(reasonHash==bytes32(0)||r.standing==standing||r.standing==Standing.Ended||r.standing==Standing.Revoked)revert InvalidState();
        r.standing=standing;emit StandingChanged(id,standing,reasonHash);emit MetadataUpdate(id);
    }
    function renounce(uint256 id) external {
        if(ownerOf(id)!=msg.sender)revert InvalidConsent();Record storage r=records[id];
        if(r.standing==Standing.Ended||r.standing==Standing.Revoked)revert InvalidState();
        r.standing=Standing.Ended;emit StandingChanged(id,Standing.Ended,keccak256("holder renunciation"));emit MetadataUpdate(id);
    }
    /// @notice Recovery is a privileged reissuance after off-chain identity review.
    /// New-wallet consent is mandatory. Never interprets possession of a new wallet as identity proof.
    function replace(uint256 oldId,address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) external onlyRole(RECOVERY_ROLE) nonReentrant returns(uint256 newId){
        _requireOwned(oldId);Record storage old=records[oldId];
        if(old.terms.subject!=t.subject||currentCredential[t.subject]!=oldId)revert InvalidState();
        old.standing=Standing.Revoked;delete currentCredential[t.subject];
        newId=_issue(recipient,t,deadline,signature);
        emit StandingChanged(oldId,Standing.Revoked,keccak256("credential replacement"));emit MetadataUpdate(oldId);emit CredentialReplaced(oldId,newId);
    }
    /// @notice Standing only: deliberately NOT a BTREE payment authorization.
    function isCurrentAndActive(uint256 id) public view returns(bool){
        Record storage r=records[id];return _ownerOf(id)!=address(0)&&currentCredential[r.terms.subject]==id&&r.standing==Standing.Active&&block.timestamp>=r.terms.validFrom&&(r.terms.validUntil==0||block.timestamp<r.terms.validUntil);
    }
    function tokenURI(uint256 id) public view override returns(string memory){
        _requireOwned(id);Record storage r=records[id];
        string memory json=string.concat('{"name":"Bittrees Contributor #',Strings.toString(id),'","description":"Non-transferable contribution credential. Ownership alone does not authorize allocations.","attributes":[{"trait_type":"Standing code","value":',Strings.toString(uint8(r.standing)),'},{"trait_type":"Level code","value":',Strings.toString(uint8(r.terms.level)),'},{"trait_type":"Memo version","value":',Strings.toString(r.version),'}]}');
        return string.concat("data:application/json;base64,",Base64.encode(bytes(json)));
    }
}
