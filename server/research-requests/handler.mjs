import {createPublicClient,http} from 'viem';import {mainnet} from 'viem/chains';
import {contributorAuth} from '../contributors/auth.mjs';import {privateCodec} from '../contributors/storage.mjs';import {redisCommand} from '../signed-registry.mjs';
import {requestStore} from './store.mjs';import {requestEligibility} from './authority.mjs';import {transition} from './core.mjs';
export function createResearchRequestHandler({env=process.env,command=redisCommand,eligibility=requestEligibility,verifyWallet}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
   const origin='https://research.bittrees.org',codec=privateCodec(env.CONTRIBUTOR_STORAGE_SECRET);
   const auth=contributorAuth({command,codec,project:'research-requests',origin,env,cookieName:'__Host-bittrees-research-work',loginTitle:'Bittrees Research member sign-in',loginPurpose:'Open the member research request board. This signature does not authorize a transaction or accept any work.',verifyWallet:verifyWallet||((args)=>createPublicClient({chain:mainnet,transport:http(env.ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',{timeout:8000,retryCount:0})}).verifyMessage(args))});
   const session=await auth.read(req);
   if(req.method==='GET')return res.status(200).json({session:session?.wallet&&session.walletVerifiedAt?{wallet:session.wallet,csrf:session.csrf}:null});
   if(req.headers.origin!==origin)return res.status(403).json({error:'Use the Research request board.'});
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Use JSON'});
   const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});if(Buffer.byteLength(raw)>24000)return res.status(413).json({error:'Request too large'});const input=JSON.parse(raw);
   if(input.action==='wallet_login_start')return res.status(200).json(await auth.walletLoginStart(req,res,input.address));
   if(input.action==='wallet_login_finish')return res.status(200).json(await auth.walletLoginFinish(req,res,input.challenge,input.signature));
   if(!session?.wallet||!session.walletVerifiedAt)return res.status(401).json({error:'Verify your wallet to open the request board.'});
   if(req.headers['x-research-csrf']!==session.csrf||input.wallet?.toLowerCase()!==session.wallet)return res.status(403).json({error:'Wallet session changed. Verify your current wallet again.'});
   if(input.action==='sign_out')return res.status(200).json(await auth.signOut(req,res));
   const actor=await eligibility(session.wallet,{env});if(!actor.member)return res.status(403).json({error:'An active Research membership is required. Mint or renew your membership to continue.'});
   const store=requestStore(command,codec),fresh=()=>{if(actor.validUntil<=Date.now()||['accept','submit'].includes(input.action)&&actor.researcherUntil<=Date.now())throw Object.assign(Error('Membership or credential verification expired. Refresh and retry.'),{status:403});};
   fresh();const state=input.action==='list'?await store.read():await store.mutate(s=>{fresh();return transition(s,actor,input);});
   if(input.action==='list')fresh();
   // Writes were authorized when committed; a response never reports an unsaved write as success.
   return res.status(200).json({requests:state.requests,capabilities:{member:actor.member,researcher:actor.researcher,researcherUnavailable:actor.researcherUnavailable},wallet:session.wallet});
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Research requests are unavailable. Refresh before retrying; no success has been confirmed.'});}
 };
}
