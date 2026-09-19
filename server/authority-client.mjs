import {createPrivateKey,sign,randomUUID} from 'node:crypto';
export async function authorityDecision(actor,action){
 const endpoint='https://roles.bittrees.org/api/authority/source-decision';
 const request={source:'research.bittrees.org',scope:'research',audience:endpoint,actor:actor.toLowerCase(),action,resource:'community-registry',issuedAt:Date.now(),requestId:randomUUID()};
 const key=createPrivateKey(process.env.ROLES_FEED_PRIVATE_KEY);
 if(key.asymmetricKeyType!=='ed25519')throw Error('Source key unavailable');
 const signature=sign(null,Buffer.from(JSON.stringify(request)),key).toString('base64');
 const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request,signature}),redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Authority unavailable');const decision=await r.json();
 if(decision.audience!==request.source||decision.requestId!==request.requestId||typeof decision.allowed!=='boolean')throw Error('Invalid authority response');
 return decision;
}
