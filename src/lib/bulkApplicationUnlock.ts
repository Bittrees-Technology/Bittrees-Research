import {applicationContentKey,decryptApplication,type EncKeypair} from './appcrypto';

/** Share per-document keys only; never retain the wallet-derived private key. */
export async function unlockAndSaveApplications({posts,wallet,derive,save,isCurrent,progress}:{posts:{id:string;body:string}[];wallet:`0x${string}`;derive:()=>Promise<EncKeypair>;save:(uid:string,key:string)=>Promise<void>;isCurrent:()=>boolean;progress:(done:number,total:number)=>void}) {
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
    JSON.parse(plaintext);
    const contentKey=applicationContentKey(envelope,wallet,kp.secretKey);
    if(!isCurrent()){result.cancelled=true;break;}
    await save(post.id,contentKey);
    result.saved++;
   } catch {result.failed++;}
   finally {if(isCurrent())progress(result.saved+result.unavailable+result.failed,posts.length);}
  }
  return result;
 } finally {kp.secretKey.fill(0);}
}
