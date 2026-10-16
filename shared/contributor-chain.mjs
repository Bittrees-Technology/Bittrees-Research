import {parseAbi,encodeAbiParameters,keccak256,toFunctionSelector} from 'viem';
export const ROOT_AUTHORITY='0x1B6c450FaDB7c77191f152473FC2f79dC515FA77';
export const termsType={type:'tuple',components:[{name:'subject',type:'bytes32'},{name:'memoHash',type:'bytes32'},{name:'policyHash',type:'bytes32'},{name:'level',type:'uint8'},{name:'rank',type:'uint8'},{name:'validFrom',type:'uint64'},{name:'validUntil',type:'uint64'},{name:'weightNumerator',type:'uint32'},{name:'weightDenominator',type:'uint32'}]};
export const credentialAbi=parseAbi([
 'struct Terms { bytes32 subject; bytes32 memoHash; bytes32 policyHash; uint8 level; uint8 rank; uint64 validFrom; uint64 validUntil; uint32 weightNumerator; uint32 weightDenominator; }',
 'function nextId() view returns(uint256)','function bootstrapContributor(address recipient,Terms t,uint256 deadline,bytes signature) returns(uint256)',
 'function rootAuthority() view returns(address)','function rolesSigner() view returns(address)','function authorityEpoch() view returns(uint256)','function actionNonces(address) view returns(uint256)','function nonces(address) view returns(uint256)','function currentCredential(bytes32) view returns(uint256)','function ownerOf(uint256) view returns(address)','function records(uint256) view returns(Terms terms,uint8 standing,uint32 version)',
 'function issue(address recipient,Terms t,uint256 deadline,bytes signature) returns(uint256)',
 'function amend(uint256 id,Terms t,uint256 deadline,bytes signature)',
 'function setStanding(uint256 id,uint8 standing,bytes32 reasonHash)',
 'function replace(uint256 oldId,address recipient,Terms t,uint256 deadline,bytes signature) returns(uint256)',
 'function issueAuthorized(address recipient,Terms t,uint256 consentDeadline,bytes consent,uint256 deadline,bytes permit) returns(uint256)',
 'function amendAuthorized(uint256 id,Terms t,uint256 consentDeadline,bytes consent,uint256 deadline,bytes permit)',
 'function standingAuthorized(uint256 id,uint8 standing,bytes32 reasonHash,uint256 deadline,bytes permit)',
 'function replaceAuthorized(uint256 oldId,address recipient,Terms t,uint256 consentDeadline,bytes consent,uint256 deadline,bytes permit) returns(uint256)',
 'event MemorandumAccepted(uint256 indexed tokenId,uint32 version,bytes32 memoHash,bytes32 policyHash)',
 'event StandingChanged(uint256 indexed tokenId,uint8 standing,bytes32 reasonHash)',
 'event AuthorizedAction(address indexed actor,bytes32 actionHash,uint256 nonce)'
]);
const termSig='(bytes32,bytes32,bytes32,uint8,uint8,uint64,uint64,uint32,uint32)';
export function operationHash(kind,args){
 const specs={issue:[`issue(address,${termSig},uint256,bytes)`,[{type:'address'},termsType,{type:'uint256'},{type:'bytes'}]],amend:[`amend(uint256,${termSig},uint256,bytes)`,[{type:'uint256'},termsType,{type:'uint256'},{type:'bytes'}]],standing:['setStanding(uint256,uint8,bytes32)',[{type:'uint256'},{type:'uint8'},{type:'bytes32'}]],replace:[`replace(uint256,address,${termSig},uint256,bytes)`,[{type:'uint256'},{type:'address'},termsType,{type:'uint256'},{type:'bytes'}]]};
 const spec=specs[kind];if(!spec)throw Error('Unsupported credential operation');
 return keccak256(encodeAbiParameters([{type:'bytes4'},...spec[1]],[toFunctionSelector(spec[0]),...args]));
}
export const actionTypes={ContributorAction:[{name:'actor',type:'address'},{name:'actionHash',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'epoch',type:'uint256'},{name:'deadline',type:'uint256'}]};
export const consentTypes={Consent:[{name:'recipient',type:'address'},...termsType.components,{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'}]};
export const credentialDomain=contract=>({name:'Bittrees Contributor Credential',version:'1',chainId:1,verifyingContract:contract});
