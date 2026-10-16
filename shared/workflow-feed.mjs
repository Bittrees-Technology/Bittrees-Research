import {createHash,createPublicKey,sign,verify} from 'node:crypto';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const message=(kind,value)=>'Bittrees workflow catalogue '+kind+' v1\n'+canonical(value);
const valid=(kind,value,signature,pem)=>{try{const key=createPublicKey(pem);return key.asymmetricKeyType==='ed25519'&&typeof signature==='string'&&signature.length<=128&&verify(null,Buffer.from(message(kind,value)),key,Buffer.from(signature,'base64'));}catch{return false;}};
export const requestHash=request=>createHash('sha256').update(message('request',request)).digest('hex');
export function makeFeedRequest(project,subjects,key,requestId,now=Date.now()){
 const request={version:1,issuer:'https://workflow.bittrees.org',project,audience:`https://${project}.bittrees.org/api/workflow-catalogue`,subjects,issuedAt:now,requestId};
 return {request,signature:sign(null,Buffer.from(message('request',request)),key).toString('base64')};
}
export function verifyFeedRequest(envelope,project,pem,now=Date.now()){
 const r=envelope?.request;
 if(!r||Object.keys(r).sort().join(',')!=='audience,issuedAt,issuer,project,requestId,subjects,version'||r.version!==1||r.issuer!=='https://workflow.bittrees.org'||r.project!==project||r.audience!==`https://${project}.bittrees.org/api/workflow-catalogue`||!Number.isSafeInteger(r.issuedAt)||Math.abs(now-r.issuedAt)>30000||typeof r.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(r.requestId)||!Array.isArray(r.subjects)||r.subjects.length<1||r.subjects.length>100||r.subjects.some(s=>typeof s!=='string'||s.length>254||!(/^0x[a-f0-9]{40}$/.test(s)||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))||!valid('request',r,envelope.signature,pem))throw Error('Workflow source request rejected');
 return r;
}
export function makeFeedResponse(request,records,key,now=Date.now()){
 const response={version:1,project:request.project,requestHash:requestHash(request),checkedAt:now,records};
 return {response,signature:sign(null,Buffer.from(message('response',response)),key).toString('base64')};
}
export function verifyFeedResponse(envelope,request,pem,now=Date.now()){
 const r=envelope?.response;
 if(!r||r.version!==1||r.project!==request.project||r.requestHash!==requestHash(request)||!Number.isSafeInteger(r.checkedAt)||Math.abs(now-r.checkedAt)>30000||!Array.isArray(r.records)||r.records.length>1000||!valid('response',r,envelope.signature,pem))throw Error('Workflow source response rejected');
 return r.records;
}
