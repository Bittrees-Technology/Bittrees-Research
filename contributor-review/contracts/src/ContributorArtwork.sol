// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
/// @notice Immutable, self-contained SVG. Standing, rank and level are derived from the credential.
library ContributorArtwork {
 struct Visual {uint256 id;address owner;uint8 level;uint8 rank;uint8 standing;uint64 start;uint64 end;uint256 now_;}
 function levelName(uint8 v) internal pure returns(string memory){return v==0?"Advisor":v==1?"Part Time":v==2?"Half Time":"Full Time";}
 function rankName(uint8 v) internal pure returns(string memory){return v==0?"Contributor":v==1?"Senior Contributor":"Lead Contributor";}
 function standingName(uint8 v) internal pure returns(string memory){return v==0?"Active":v==1?"Suspended":v==2?"Ended":"Revoked";}
 function displayName(uint8 standing,uint64 start,uint64 end,uint256 now_) internal pure returns(string memory){
  if(standing!=0)return standingName(standing);
  if(now_<start)return "Not yet effective";
  if(end!=0&&now_>=end)return "Expired";
  return "Active";
 }
 function svg(Visual memory v) internal pure returns(string memory){
  string memory status=displayName(v.standing,v.start,v.end,v.now_);
  string memory color=v.standing==3?"#a33336":v.standing==1?"#865a14":v.standing==2||(v.end!=0&&v.now_>=v.end)||v.now_<v.start?"#52616c":"#28683d";
  string memory rankColor=v.rank==2?"#bc8a24":v.rank==1?"#738591":"#4b9156";
  string memory tree='<g stroke="#ffffff" stroke-width="1.5"><circle cx="70" cy="161" r="22" fill="#4b9156"/><circle cx="114" cy="133" r="24" fill="#4b9156"/><circle cx="132" cy="86" r="21" fill="#4b9156"/><circle cx="179" cy="92" r="22" fill="#4b9156"/><circle cx="195" cy="49" r="20" fill="#4b9156"/><circle cx="253" cy="35" r="19" fill="#4b9156"/><circle cx="309" cy="37" r="18" fill="#4b9156"/><circle cx="282" cy="72" r="22" fill="#4b9156"/><circle cx="341" cy="76" r="28" fill="#4b9156"/><circle cx="384" cy="99" r="17" fill="#4b9156"/><circle cx="351" cy="129" r="24" fill="#f39b32"/><circle cx="390" cy="142" r="18" fill="#4b9156"/><circle cx="308" cy="105" r="14" fill="#4b9156"/><circle cx="263" cy="126" r="32" fill="#4b9156"/><circle cx="212" cy="118" r="17" fill="#f39b32"/><circle cx="166" cy="133" r="16" fill="#4b9156"/><circle cx="150" cy="168" r="20" fill="#4b9156"/><circle cx="110" cy="197" r="29" fill="#4b9156"/><circle cx="208" cy="174" r="33" fill="#4b9156"/><circle cx="173" cy="209" r="18" fill="#4b9156"/><circle cx="210" cy="225" r="18" fill="#4b9156"/><circle cx="101" cy="246" r="17" fill="#f39b32"/><circle cx="71" cy="265" r="13" fill="#4b9156"/><circle cx="100" cy="275" r="13" fill="#4b9156"/><circle cx="114" cy="309" r="26" fill="#4b9156"/><circle cx="139" cy="272" r="20" fill="#4b9156"/><circle cx="141" cy="236" r="16" fill="#4b9156"/><circle cx="183" cy="259" r="30" fill="#f39b32"/><circle cx="162" cy="302" r="18" fill="#4b9156"/><circle cx="199" cy="308" r="21" fill="#4b9156"/><circle cx="229" cy="260" r="15" fill="#f39b32"/><circle cx="270" cy="166" r="14" fill="#4b9156"/><circle cx="275" cy="209" r="16" fill="#4b9156"/><circle cx="303" cy="187" r="21" fill="#4b9156"/><circle cx="308" cy="147" r="20" fill="#4b9156"/><circle cx="338" cy="170" r="18" fill="#4b9156"/><circle cx="373" cy="182" r="14" fill="#4b9156"/><circle cx="404" cy="179" r="11" fill="#4b9156"/><circle cx="425" cy="202" r="12" fill="#4b9156"/><circle cx="396" cy="219" r="17" fill="#f39b32"/><circle cx="349" cy="216" r="28" fill="#4b9156"/><circle cx="445" cy="234" r="23" fill="#4b9156"/><circle cx="406" cy="245" r="13" fill="#4b9156"/><circle cx="380" cy="249" r="17" fill="#4b9156"/><circle cx="415" cy="280" r="18" fill="#4b9156"/><circle cx="373" cy="283" r="14" fill="#4b9156"/><circle cx="342" cy="269" r="20" fill="#4b9156"/><circle cx="299" cy="276" r="13" fill="#4b9156"/><circle cx="275" cy="248" r="15" fill="#4b9156"/><circle cx="277" cy="295" r="17" fill="#4b9156"/><circle cx="318" cy="317" r="28" fill="#4b9156"/><circle cx="357" cy="312" r="14" fill="#4b9156"/><circle cx="397" cy="313" r="13" fill="#4b9156"/></g><path fill="#4b9156" d="M226 491Q241 453 235 362L231 320 197 280 203 276 242 313 244 210 251 146 260 151 255 271 285 250 290 257 258 287 259 344 288 324 292 332 263 357Q265 435 273 489Q254 504 226 491Z"/>';
  string memory rings='';
  for(uint8 i=0;i<=v.rank;i++)rings=string.concat(rings,'<rect x="',Strings.toString(21+uint256(i)*7),'" y="',Strings.toString(21+uint256(i)*7),'" width="',Strings.toString(758-uint256(i)*14),'" height="',Strings.toString(958-uint256(i)*14),'" rx="18" fill="none" stroke="',rankColor,'" stroke-width="2"/>');
  string memory marks='';
  for(uint8 i=0;i<4;i++)marks=string.concat(marks,'<rect x="',Strings.toString(548+uint256(i)*24),'" y="698" width="16" height="16" rx="3" fill="',i<=v.level?'#28683d':'#dce6df','"/>');
  string memory output=string.concat('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><title>Bittrees Contributor #',Strings.toString(v.id),'</title><rect width="800" height="1000" rx="24" fill="#f7fbf8"/>',rings,
   '<text x="400" y="107" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="#204d32">Bittrees</text><text x="400" y="143" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#52655a">Contributor credential</text><g transform="translate(185 166) scale(.86)">',tree,'</g>');
  output=string.concat(output,
   '<g font-family="Arial,sans-serif"><text x="400" y="653" text-anchor="middle" font-size="32" fill="#204d32">',rankName(v.rank),'</text><path d="M100 678H700" stroke="#cddbd0"/><text x="100" y="717" font-size="25" fill="#204d32">',levelName(v.level),'</text>',marks);
  output=string.concat(output,
   '<rect x="100" y="751" width="600" height="69" rx="12" fill="',color,'"/><text x="400" y="795" text-anchor="middle" font-size="27" fill="white">',status,'</text>');
  return string.concat(output,'<text x="400" y="864" text-anchor="middle" font-size="21" fill="#204d32">Contributor #',Strings.toString(v.id),'</text><text x="400" y="898" text-anchor="middle" font-size="16" fill="#52655a">',Strings.toHexString(v.owner),'</text><text x="400" y="943" text-anchor="middle" font-size="17" fill="#52655a">Non-transferable</text></g></svg>');
 }
}
