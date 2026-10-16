// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ContributorArtwork as Art} from "./ContributorArtwork.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @notice Non-transferable contributor credentials with root-controlled authority.
/// Artwork revisions require a new deployment; this contract is not upgradeable.
contract ContributorCredential is ERC721, AccessControl, EIP712, ReentrancyGuard {
    address public immutable rootAuthority;
    address public rolesSigner;
    uint256 public authorityEpoch;
    mapping(address=>uint256) public actionNonces;
    bytes32 public constant ACTION_TYPEHASH=keccak256("ContributorAction(address actor,bytes32 actionHash,uint256 nonce,uint256 epoch,uint256 deadline)");
    event RolesSignerChanged(address indexed signer,uint256 epoch);
    event AuthorizedAction(address indexed actor,bytes32 actionHash,uint256 nonce);
    bytes32 public constant ISSUER_ROLE=keccak256("ISSUER_ROLE");
    bytes32 public constant STATUS_ROLE=keccak256("STATUS_ROLE");
    bytes32 public constant RECOVERY_ROLE=keccak256("RECOVERY_ROLE");
    bytes32 public constant CONSENT_TYPEHASH=keccak256("Consent(address recipient,bytes32 subject,bytes32 memoHash,bytes32 policyHash,uint8 level,uint8 rank,uint64 validFrom,uint64 validUntil,uint32 weightNumerator,uint32 weightDenominator,uint256 nonce,uint256 deadline)");
    enum Standing { Active, Suspended, Ended, Revoked }
    enum Level { Advisor, PartTime, HalfTime, FullTime }
    struct Terms { bytes32 subject; bytes32 memoHash; bytes32 policyHash; Level level; uint8 rank; uint64 validFrom; uint64 validUntil; uint32 weightNumerator; uint32 weightDenominator; }
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

    constructor(address administrator,address initialRolesSigner) ERC721("Bittrees Contributor Credential","BCC") EIP712("Bittrees Contributor Credential","1") {
        if(administrator==address(0)) revert InvalidTerms();
        rootAuthority=administrator;
        rolesSigner=initialRolesSigner;
        emit RolesSignerChanged(initialRolesSigner,0);
        _grantRole(DEFAULT_ADMIN_ROLE,administrator);
    }
    /// @notice Root is pinned to the deployment-approved wallet, not mutable ENS resolution.
    /// Roles verifies BGOV eligibility and majority-approved membership before issuing scoped permits.
    modifier onlyOperator(bytes32 role) {
        if(msg.sender!=rootAuthority) _checkRole(role);
        _;
    }
    function grantRole(bytes32 role,address account) public override {
        if(role==DEFAULT_ADMIN_ROLE||account==address(0)) revert InvalidTerms();
        super.grantRole(role,account);
    }
    function revokeRole(bytes32 role,address account) public override {
        if(role==DEFAULT_ADMIN_ROLE) revert InvalidState();
        super.revokeRole(role,account);
    }
    function renounceRole(bytes32 role,address callerConfirmation) public override {
        if(role==DEFAULT_ADMIN_ROLE) revert InvalidState();
        super.renounceRole(role,callerConfirmation);
    }
    /// @notice Root can pause permits with zero, rotate the signer, or invalidate every outstanding permit.
    function setRolesSigner(address signer) external {
        if(msg.sender!=rootAuthority) revert InvalidConsent();
        rolesSigner=signer;authorityEpoch++;emit RolesSignerChanged(signer,authorityEpoch);
    }
    function actionDigest(address actor,bytes32 actionHash,uint256 nonce,uint256 epoch,uint256 deadline) public view returns(bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ACTION_TYPEHASH,actor,actionHash,nonce,epoch,deadline)));
    }
    function _authorize(bytes32 actionHash,uint256 deadline,bytes calldata permit) internal {
        uint256 nonce=actionNonces[msg.sender];
        if(rolesSigner==address(0)||deadline<block.timestamp||deadline>block.timestamp+120||!SignatureChecker.isValidSignatureNow(rolesSigner,actionDigest(msg.sender,actionHash,nonce,authorityEpoch,deadline),permit)) revert InvalidConsent();
        actionNonces[msg.sender]=nonce+1;emit AuthorizedAction(msg.sender,actionHash,nonce);
    }
    /// @notice Credential #1 only. Partner membership is separately approved in Roles, never granted by this NFT.
    function bootstrapContributor(address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) external nonReentrant returns(uint256 id) {
        if(msg.sender!=rootAuthority||nextId!=1||t.level!=Level.FullTime||t.validFrom>block.timestamp) revert InvalidState();
        return _issue(recipient,t,deadline,signature);
    }
    function issueAuthorized(address recipient,Terms calldata t,uint256 consentDeadline,bytes calldata consent,uint256 deadline,bytes calldata permit) external nonReentrant returns(uint256) {
        _authorize(keccak256(abi.encode(this.issue.selector,recipient,t,consentDeadline,consent)),deadline,permit);
        return _issue(recipient,t,consentDeadline,consent);
    }
    function amendAuthorized(uint256 id,Terms calldata t,uint256 consentDeadline,bytes calldata consent,uint256 deadline,bytes calldata permit) external nonReentrant {
        _authorize(keccak256(abi.encode(this.amend.selector,id,t,consentDeadline,consent)),deadline,permit);
        _amend(id,t,consentDeadline,consent);
    }
    function standingAuthorized(uint256 id,Standing standing,bytes32 reasonHash,uint256 deadline,bytes calldata permit) external nonReentrant {
        _authorize(keccak256(abi.encode(this.setStanding.selector,id,standing,reasonHash)),deadline,permit);
        _setStanding(id,standing,reasonHash);
    }
    function replaceAuthorized(uint256 oldId,address recipient,Terms calldata t,uint256 consentDeadline,bytes calldata consent,uint256 deadline,bytes calldata permit) external nonReentrant returns(uint256) {
        _authorize(keccak256(abi.encode(this.replace.selector,oldId,recipient,t,consentDeadline,consent)),deadline,permit);
        return _replace(oldId,recipient,t,consentDeadline,consent);
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
        return _hashTypedDataV4(keccak256(abi.encode(CONSENT_TYPEHASH,recipient,t,nonce,deadline)));
    }
    function _consent(address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) internal {
        if(recipient==address(0)||t.subject==bytes32(0)||t.memoHash==bytes32(0)||t.policyHash==bytes32(0)||t.rank>2||t.weightDenominator==0||(t.validUntil!=0&&(t.validUntil<=t.validFrom||t.validUntil<=block.timestamp)))revert InvalidTerms();
        if(block.timestamp>deadline||!SignatureChecker.isValidSignatureNow(recipient,consentDigest(recipient,t,nonces[recipient],deadline),signature))revert InvalidConsent();
        nonces[recipient]++;
    }
    function issue(address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) external onlyOperator(ISSUER_ROLE) nonReentrant returns(uint256){
        return _issue(recipient,t,deadline,signature);
    }
    function _issue(address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) internal returns(uint256 id){
        if((nextId==1&&msg.sender!=rootAuthority)||currentCredential[t.subject]!=0)revert InvalidState();
        _consent(recipient,t,deadline,signature);
        id=nextId++;records[id]=Record(t,Standing.Active,1);currentCredential[t.subject]=id;
        _safeMint(recipient,id);emit Locked(id);emit MemorandumAccepted(id,1,t.memoHash,t.policyHash);
    }
    function amend(uint256 id,Terms calldata t,uint256 deadline,bytes calldata signature) external onlyOperator(ISSUER_ROLE) nonReentrant { _amend(id,t,deadline,signature); }
    function _amend(uint256 id,Terms calldata t,uint256 deadline,bytes calldata signature) internal {
        address recipient=_requireOwned(id);Record storage r=records[id];
        if(r.standing!=Standing.Active||currentCredential[r.terms.subject]!=id||r.terms.subject!=t.subject||r.terms.memoHash==t.memoHash)revert InvalidState();
        _consent(recipient,t,deadline,signature);r.terms=t;r.version++;
        emit MemorandumAccepted(id,r.version,t.memoHash,t.policyHash);emit MetadataUpdate(id);
    }
    function setStanding(uint256 id,Standing standing,bytes32 reasonHash) external onlyOperator(STATUS_ROLE){ _setStanding(id,standing,reasonHash); }
    function _setStanding(uint256 id,Standing standing,bytes32 reasonHash) internal {
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
    function replace(uint256 oldId,address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) external onlyOperator(RECOVERY_ROLE) nonReentrant returns(uint256){ return _replace(oldId,recipient,t,deadline,signature); }
    function _replace(uint256 oldId,address recipient,Terms calldata t,uint256 deadline,bytes calldata signature) internal returns(uint256 newId){
        _requireOwned(oldId);Record storage old=records[oldId];
        if(old.terms.subject!=t.subject||currentCredential[t.subject]!=oldId)revert InvalidState();
        old.standing=Standing.Revoked;delete currentCredential[t.subject];
        newId=_issue(recipient,t,deadline,signature);
        emit StandingChanged(oldId,Standing.Revoked,keccak256("credential replacement"));emit MetadataUpdate(oldId);emit CredentialReplaced(oldId,newId);
    }
    /// @notice Current credential eligibility; no token transfer or payout calculation.
    function isCurrentAndActive(uint256 id) public view returns(bool){
        Record storage r=records[id];return _ownerOf(id)!=address(0)&&currentCredential[r.terms.subject]==id&&r.standing==Standing.Active&&block.timestamp>=r.terms.validFrom&&(r.terms.validUntil==0||block.timestamp<r.terms.validUntil);
    }
    /// @notice Eligibility for monthly BTREE contributor distributions, not a payment instruction.
    function isMonthlyBtreeBeneficiary(uint256 id) public view returns(bool){return isCurrentAndActive(id);}
    function tokenURI(uint256 id) public view override returns(string memory){
        _requireOwned(id);Record storage r=records[id];
        string memory image=Art.imageUri(Art.Visual(id,ownerOf(id),uint8(r.terms.level),r.terms.rank,uint8(r.standing),r.terms.validFrom,r.terms.validUntil,block.timestamp,r.terms.weightNumerator,r.terms.weightDenominator),address(this),r.version);
        string memory json=string.concat('{"name":"Bittrees Contributor #',Strings.toString(id),'","description":"A valid current Active in-term credential establishes monthly BTREE beneficiary eligibility. Amounts require confirmed contributions and an approved funded policy. No automatic payments, Partner authority, or token-reissue claims.","image":"',image,'","attributes":[',
          '{"trait_type":"Standing","value":"',Art.standingName(uint8(r.standing)),'"},',
          '{"trait_type":"Display status","value":"',Art.displayName(uint8(r.standing),r.terms.validFrom,r.terms.validUntil,block.timestamp),'"},',
          '{"trait_type":"Level","value":"',Art.levelName(uint8(r.terms.level)),'"},',
          '{"trait_type":"Rank","value":"',Art.rankName(r.terms.rank),'"},');
        json=string.concat(json,
          '{"trait_type":"Allocation weight","value":"',Art.weightName(r.terms.weightNumerator,r.terms.weightDenominator),'"},',
          '{"trait_type":"Weight numerator","value":',Strings.toString(r.terms.weightNumerator),'},',
          '{"trait_type":"Weight denominator","value":',Strings.toString(r.terms.weightDenominator),'},');
        json=string.concat(json,
          '{"trait_type":"Monthly BTREE beneficiary","value":"',isMonthlyBtreeBeneficiary(id)?'Eligible':'Not eligible','"},',
          '{"trait_type":"Beneficiary policy","value":"btree-monthly-beneficiary-v1"},',
          '{"trait_type":"Owner wallet","value":"',Strings.toHexString(ownerOf(id)),'"},');
        json=string.concat(json,
          '{"trait_type":"Credential revision","value":',Strings.toString(r.version),'},',
          '{"trait_type":"Standing code","value":',Strings.toString(uint8(r.standing)),'},',
          '{"trait_type":"Level code","value":',Strings.toString(uint8(r.terms.level)),'}]}');
        return string.concat("data:application/json;base64,",Base64.encode(bytes(json)));
    }
}
