// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ContributorCredentialTest} from "./ContributorCredential.t.sol";
import {ContributorCredential as C} from "../src/ContributorCredential.sol";
import {ContributorArtwork as Art} from "../src/ContributorArtwork.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
interface Files {function createDir(string calldata,bool) external;function writeFile(string calldata,string calldata) external;}
contract ContributorArtworkTest is ContributorCredentialTest {
 function has(string memory whole,string memory part) internal pure returns(bool){bytes memory a=bytes(whole);bytes memory b=bytes(part);if(b.length>a.length)return false;for(uint256 i=0;i<=a.length-b.length;i++){bool same=true;for(uint256 j=0;j<b.length;j++)if(a[i+j]!=b[j]){same=false;break;}if(same)return true;}return false;}
 function testArtworkAllLevelsRanksAndStandings() public pure {
  for(uint8 l=0;l<4;l++)for(uint8 r=0;r<3;r++)for(uint8 s=0;s<6;s++){
   Art.Visual memory v=Art.Visual(1,address(1),l,r,s<4?s:0,s==4?2000:1000,s==5?1000:0,1000,1,1);
   require(has(Art.imageUri(v),string.concat("/",Strings.toString(l),"-",Strings.toString(r),"-",Strings.toString(s),".svg")));
   require(has(Art.imageUri(v),"1fb88b5ba11bfc000f8feb87c3320483b2726d87"));
  }
 }
 function testExpiredAndFutureTermsNeverAppearActive() public pure {
  require(keccak256(bytes(Art.displayName(0,1000,2000,2000)))==keccak256("Expired"));
  require(keccak256(bytes(Art.displayName(0,1000,0,999)))==keccak256("Not yet effective"));
  require(keccak256(bytes(Art.displayName(3,1000,2000,3000)))==keccak256("Revoked"));
  require(keccak256(bytes(Art.displayName(0,1000,0,type(uint64).max)))==keccak256("Active"));
 }
 function testMetadataChangesAfterAuthorizedAmendmentAndStanding() public {
  uint256 id=issue();bytes32 first=keccak256(bytes(c.tokenURI(id)));C.Terms memory t=terms();t.level=C.Level.FullTime;t.rank=2;t.memoHash=keccak256("art-revision");c.amend(id,t,DEADLINE,sig(holder,KEY,t));bytes32 second=keccak256(bytes(c.tokenURI(id)));require(first!=second);c.setStanding(id,C.Standing.Suspended,keccak256("pause"));require(second!=keccak256(bytes(c.tokenURI(id))));require(c.locked(id));
 }
 function testUnissuedTokenHasNoMetadata() public {vm.expectRevert();c.tokenURI(1);}
 function testRuntimeFitsMainnetLimit() public view {require(address(c).code.length<=24576);}
 function testIndividualWeightRequiresExactFreshConsent() public {C.Terms memory t=terms();bytes memory signature=sig(holder,KEY,t);t.weightDenominator=3;vm.expectRevert();c.issue(holder,t,DEADLINE,signature);uint256 id=c.issue(holder,t,DEADLINE,sig(holder,KEY,t));bytes32 before_=keccak256(bytes(c.tokenURI(id)));t.memoHash=keccak256("weight-change");t.weightNumerator=2;signature=sig(holder,KEY,t);t.weightNumerator=3;vm.expectRevert();c.amend(id,t,DEADLINE,signature);c.amend(id,t,DEADLINE,sig(holder,KEY,t));require(before_!=keccak256(bytes(c.tokenURI(id))));}
 function testZeroDenominatorRejected() public {C.Terms memory t=terms();t.weightDenominator=0;bytes memory signature=sig(holder,KEY,t);vm.expectRevert();c.issue(holder,t,DEADLINE,signature);}
 function testExportArtworkReview() public {
  Files files=Files(address(vm));files.createDir("out/artwork",true);
  uint256 id=issue();files.writeFile("out/artwork/token-uri.txt",c.tokenURI(id));
  files.writeFile("out/artwork/consent-vector.json",string.concat('{"contract":"',Strings.toHexString(address(c)),'","recipient":"',Strings.toHexString(holder),'","chainId":',Strings.toString(block.chainid),',"digest":"',Strings.toHexString(uint256(c.consentDigest(holder,terms(),0,DEADLINE)),32),'"}'));
 }
}
