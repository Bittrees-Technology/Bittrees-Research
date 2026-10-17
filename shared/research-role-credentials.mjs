import {keccak256,toBytes} from 'viem';
/** Definitions only. Permission mappings are separately approved in Roles. */
export const RESEARCH_ROLE_NAMES=['Researcher','Contributor','Assistant','Steward','Executive'];
export const BUILTIN_ROLE_CREDENTIALS=RESEARCH_ROLE_NAMES.map(label=>{
 const slug=label.toLowerCase(),identifier=`research.role.${slug}.v1`;
 return {label,identifier,credentialType:keccak256(toBytes(identifier)),metadataURI:`https://research.bittrees.org/credentials/${slug}.json`};
});
