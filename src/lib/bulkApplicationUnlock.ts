import {applicationContentKey,decryptApplication,type EncKeypair} from './appcrypto';

/** Share per-document keys only; never retain the wallet-derived private key. */
export async function unlockAndSaveApplications({posts,wallet,derive,save,isCurrent,progress,onUnlocked,onFailure}:{posts:{id:string;body:string}[];wallet:`0x${string}`;derive:()=>Promise<EncKeypair>;save:(uid:string,key:string)=>Promise<void>;isCurrent:()=>boolean;progress:(done:number,total:number)=>void;onUnlocked?:(uid:string,application:any,key:string)=>void;onFailure?:(uid:string,message:string)=>void}) {
 const result={saved:0,unavailable:0,failed:0,cancelled:false};
 if(!posts.length||!isCurrent())return {...result,cancelled:!isCurrent()};
 const kp=await derive();
 try {
  for(const post of posts){
   if(!isCurrent()){result.cancelled=true;break;}
   try {
    const envelope=JSON.parse(post.body);
    if(!Array.isArray(envelope?.recipients))throw Error('Invalid application envelope');
    if(!envelope.recipients.some((r:any)=>typeof r.addr==='string'&&r.addr.toLowerCase()===wallet.toLowerCase())){result.unavailable++;continue;}
    const plaintext=decryptApplication(envelope,wallet,kp.secretKey);
    if(!plaintext)throw Error('Unable to decrypt application');
    const application=JSON.parse(plaintext);
    const contentKey=applicationContentKey(envelope,wallet,kp.secretKey);
    if(!isCurrent()){result.cancelled=true;break;}
    onUnlocked?.(post.id,application,contentKey);
    await save(post.id,contentKey);
    result.saved++;
   } catch(e) {result.failed++;if(isCurrent())onFailure?.(post.id,e instanceof Error?e.message.slice(0,300):'Application could not be saved.');}
   finally {if(isCurrent())progress(result.saved+result.unavailable+result.failed,posts.length);}
  }
  return result;
 } finally {kp.secretKey.fill(0);}
}
