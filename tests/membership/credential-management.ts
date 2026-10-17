import {credentialCall,AUTHORITIES,CREDENTIALS,safeCredentialBatch,RESEARCHER_TYPE} from '../../src/lib/researchCredentialManagement';
export {AUTHORITIES,safeCredentialBatch};
export {RESEARCHER_TYPE} from '../../src/lib/researchCredentialManagement';
export {credentialReceiptMatches} from '../../src/lib/researchCredentialManagement';
let release: (()=>void)|undefined;
(window as any).__holdCredential=false;(window as any).__releaseCredential=()=>release?.();
export async function readManagedCredentials(){return {records:[{id:'9',member:'0x1111111111111111111111111111111111111111',parentId:'7',type:(window as any).__unknownCredential?'0x'+'ff'.repeat(32):RESEARCHER_TYPE,uri:'',expiresAt:'0',revoked:false,burned:false,valid:true,role:'Researcher'}],blockNumber:'100',checkedAt:Date.now()};}
export async function prepareCredential(_client:any,action:any,authority:any){
 if((window as any).__holdCredential)await new Promise<void>(r=>{release=r;});
 const call=credentialCall(action);return {to:CREDENTIALS,data:call.data,value:'0',operation:0,authority,summary:call.summary,checkedAt:Date.now(),blockNumber:'100'};
}
