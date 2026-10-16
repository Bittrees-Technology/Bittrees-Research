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
  for(uint8 l=0;l<4;l++)for(uint8 r=0;r<3;r++)for(uint8 s=0;s<4;s++){
   string memory svg=Art.svg(Art.Visual(1,address(1),l,r,s,1000,0,1000));
   require(has(svg,Art.levelName(l)));require(has(svg,Art.rankName(r)));require(has(svg,Art.standingName(s)));require(has(svg,"Non-transferable"));require(has(svg,"<svg"));
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
 function testExportArtworkReview() public {
  Files files=Files(address(vm));files.createDir("out/artwork",true);address recipient=0xE5350D96FC3161BF5c385843ec5ee24E8B465B2f;
  for(uint8 l=0;l<4;l++)for(uint8 r=0;r<3;r++)for(uint8 s=0;s<4;s++)files.writeFile(string.concat("out/artwork/",Strings.toString(l),"-",Strings.toString(r),"-",Strings.toString(s),".svg"),Art.svg(Art.Visual(1,recipient,l,r,s,1792108800,0,1792108800)));
  files.writeFile("out/artwork/expired.svg",Art.svg(Art.Visual(1,recipient,3,2,0,1000,2000,2000)));
  files.writeFile("out/artwork/scheduled.svg",Art.svg(Art.Visual(1,recipient,3,2,0,2000,0,1000)));
  uint256 id=issue();files.writeFile("out/artwork/token-uri.txt",c.tokenURI(id));
 }
}
