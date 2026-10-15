import {canonical} from './signed-action.mjs';
export const PROFILE_SITES={gov:'https://gov.bittrees.org',research:'https://research.bittrees.org'};
export const profileRequestMessage=x=>'Bittrees private contributor profile request v1\n'+canonical(x);
export const profileResponseMessage=x=>'Bittrees private contributor profile response v1\n'+canonical(x);
export function validProfileRequest(r,project,now=Date.now()){
 return r&&Object.keys(r).sort().join(',')==='audience,identities,issuedAt,requestId,version'&&r.version===1&&r.audience===PROFILE_SITES[project]&&typeof r.requestId==='string'&&/^[a-f0-9-]{36}$/.test(r.requestId)&&Number.isSafeInteger(r.issuedAt)&&Math.abs(now-r.issuedAt)<15000&&Array.isArray(r.identities)&&r.identities.length>0&&r.identities.length<=20&&new Set(r.identities).size===r.identities.length&&r.identities.every(i=>typeof i==='string'&&i===i.toLowerCase()&&i.length<=254&&(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i)||/^0x[a-f0-9]{40}$/.test(i)));
}
