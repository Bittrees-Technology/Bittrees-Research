// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
/// @notice On-chain traits select immutable-commit artwork containing the exact original logo.
/// Image availability depends on the public asset host; terms and authority remain on-chain.
library ContributorArtwork {
 struct Visual {uint256 id;address owner;uint8 level;uint8 rank;uint8 standing;uint64 start;uint64 end;uint256 now_;uint32 weightNumerator;uint32 weightDenominator;}
 function weightName(uint32 n,uint32 d) internal pure returns(string memory){return d==1?Strings.toString(n):string.concat(Strings.toString(n),"/",Strings.toString(d));}
 function levelName(uint8 v) internal pure returns(string memory){return v==0?"Advisor":v==1?"Part Time":v==2?"Half Time":"Full Time";}
 function rankName(uint8 v) internal pure returns(string memory){return v==0?"Contributor":v==1?"Senior Contributor":"Lead Contributor";}
 function standingName(uint8 v) internal pure returns(string memory){return v==0?"Active":v==1?"Suspended":v==2?"Ended":"Revoked";}
 function displayName(uint8 standing,uint64 start,uint64 end,uint256 now_) internal pure returns(string memory){
  if(standing!=0)return standingName(standing);
  if(now_<start)return "Not yet effective";
  if(end!=0&&now_>=end)return "Expired";
  return "Active";
 }
 function displayCode(uint8 standing,uint64 start,uint64 end,uint256 now_) internal pure returns(uint8){
  if(standing!=0)return standing;
  if(now_<start)return 4;
  if(end!=0&&now_>=end)return 5;
  return 0;
 }
 function imageUri(Visual memory v,address credential,uint32 revision) internal pure returns(string memory){
  return string.concat("https://gov.bittrees.org/api/contributor-artwork?contract=",Strings.toHexString(credential),"&tokenId=",Strings.toString(v.id),"&revision=",Strings.toString(revision),"&status=",Strings.toString(displayCode(v.standing,v.start,v.end,v.now_)));
 }
}
