import {privateCodec} from './contributors/storage.mjs';
import {contributorWalletAuth} from './contributors/wallet-auth.mjs';
import {redisCommand} from './signed-registry.mjs';
import {requestEligibility} from './research-requests/authority.mjs';

const origin='https://research.bittrees.org';
const fail=(message,status)=>Object.assign(Error(message),{status});

/** Every registry request authorizes before its snapshot is loaded. Mutations
 * retain the inner signature/authority/replay checks and return no private state.
 * Browser wallet claims never establish identity. */
export function withResearchRegistryPrivacy(handler,{env=process.env,command=redisCommand,eligibility=requestEligibility,readSession,now=()=>Date.now()}={}){
 return async(req,res)=>{
  const header=(key,value)=>{
   const name=key.toLowerCase();
   if(name==='cache-control')value='private, no-store';
   if(name==='access-control-allow-origin')return;
   res.setHeader(key,value);
  };
  header('Cache-Control','private, no-store');
  header('CDN-Cache-Control','no-store');
  header('Vercel-CDN-Cache-Control','no-store');
  header('Vary','Cookie, X-Research-Wallet');
  header('X-Robots-Tag','noindex, nofollow');
  header('Referrer-Policy','no-referrer');
  try{
    if(!['GET','POST'].includes(req.method))throw fail('Method not allowed.',405);
    if(req.headers.origin&&req.headers.origin!==origin)throw fail('Use the Research member workspace.',403);
    const session=readSession?await readSession(req):await contributorWalletAuth({command,codec:privateCodec(env.CONTRIBUTOR_STORAGE_SECRET),project:'research',origin,env}).read(req);
    if(!session?.walletVerifiedAt||!/^0x[a-f0-9]{40}$/i.test(session.wallet||'')||!Number.isFinite(session.expiresAt)||session.expiresAt<=now())throw fail('Verify your Research wallet to open member data.',401);
    const wallet=session.wallet.toLowerCase();
    if(req.headers['x-research-wallet']?.toLowerCase()!==wallet)throw fail('Research wallet changed. Verify the current wallet again.',403);
    if(req.method==='POST'){
     let envelope;
     try{
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
      if(Buffer.byteLength(raw)>32000)throw fail('Request too large.',413);
      envelope=JSON.parse(raw);
     }catch(error){throw error.status?error:fail('Invalid registry action.',400);}
     if(typeof envelope?.address!=='string'||envelope.address.toLowerCase()!==wallet)throw fail('The signed registry action must use your verified Research wallet.',403);
    }
    const proof=await eligibility(wallet,{env});
    if(proof?.member!==true)throw fail('An active Research membership is required.',403);
    if(proof.wallet?.toLowerCase()!==wallet||!Number.isFinite(proof.validUntil)||proof.validUntil<=now())throw fail('Current membership verification is unavailable.',503);
    const validUntil=Math.min(session.expiresAt,proof.validUntil);
   let status=200;
   return await handler(req,{
    setHeader:header,
    status(code){status=code;return this;},
    json(body){
     if(req.method==='POST'&&status<400){
      // Clients refresh their private state separately. Never echo a registry
      // snapshot from a mutation, including after a successful commit.
      const acknowledgement={ok:body?.ok===true};
      if(Number.isSafeInteger(body?.revision)&&body.revision>=0)acknowledgement.revision=body.revision;
      return res.status(status).json(acknowledgement);
     }
     if(status<400&&validUntil<=now())throw fail('Membership verification expired. Refresh and retry.',403);
     return res.status(status).json(body);
    },
   });
  }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Research member access is unavailable. Retry after verification recovers.'});}
 };
}
